"""
同花顺二维码登录会话管理器
用于管理多个并发的二维码登录会话
支持Redis存储登录结果，实现多实例部署和服务重启后状态保留
"""
import base64
import json
import os
import signal
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, Optional, Any

from loguru import logger

from app.services.external.ths.auth.methods.qr import TongHuaShunQrLogin
from app.services.core.cache_service import cache_service
from app.services.core.user_cache_keys import user_cache_keys


class QrLoginSession:
    """单个二维码登录会话 - 支持多用户隔离"""
    
    def __init__(self, session_id: str, output_dir: Path, user_id: Optional[str] = None):
        self.session_id = session_id
        self.user_id = user_id or "anonymous"  # 用户标识，用于资源隔离
        self.qr_path = output_dir / f"ths_qr_{session_id}.png"
        self.qr_image_base64: Optional[str] = None
        self.status = "pending"  # pending, qr_ready, success, failed, timeout, cancelled
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.thread: Optional[threading.Thread] = None
        self.login_client: Optional[TongHuaShunQrLogin] = None
        self.browser_process_id: Optional[int] = None  # 记录关联的浏览器进程ID
        
    def is_expired(self, timeout_seconds: int = 180) -> bool:
        """检查会话是否过期（默认3分钟）"""
        return time.time() - self.created_at > timeout_seconds
    
    def cleanup(self, wait_for_thread: bool = True):
        """
        清理会话资源 - 增强版本，包含强制进程终止
        
        Args:
            wait_for_thread: 是否等待线程结束。从线程内调用时应设为False。
        """
        try:
            # 1. 强制终止Playwright相关进程
            self._force_terminate_playwright_processes()
            
            # 2. 清理浏览器客户端引用
            if self.login_client:
                try:
                    if hasattr(self.login_client, 'close'):
                        self.login_client.close()
                except Exception as e:
                    logger.debug(f"清理login_client失败: {e}")
                finally:
                    self.login_client = None
            
            # 3. 等待线程结束（仅外部调用时）
            if wait_for_thread and self.thread and self.thread.is_alive():
                self.thread.join(timeout=3)
                if self.thread.is_alive():
                    logger.warning(f"登录线程未在3秒内结束，已强制终止相关进程: {self.session_id}")
            
            # 4. 删除二维码文件
            if self.qr_path.exists():
                self.qr_path.unlink()
                
        except Exception as e:
            logger.warning(f"清理会话资源失败 {self.session_id}: {e}")

    def _force_terminate_playwright_processes(self):
        """安全终止与此会话相关的Playwright进程 - 多用户安全"""
        try:
            # 1. 如果有记录的浏览器进程ID，优先处理
            if self.browser_process_id:
                try:
                    os.kill(self.browser_process_id, signal.SIGTERM)
                    time.sleep(0.1)
                    try:
                        os.kill(self.browser_process_id, 0)
                        os.kill(self.browser_process_id, signal.SIGKILL)
                        logger.debug(f"终止会话{self.session_id}的浏览器进程: {self.browser_process_id}")
                    except ProcessLookupError:
                        pass
                except (ProcessLookupError, PermissionError):
                    pass
                return  # 有具体进程ID就不需要全局搜索
            
            # 2. 如果没有具体进程ID，进行更保守的清理
            # 只清理明确属于当前会话的进程（通过session_id标识）
            try:
                # 查找包含session_id的进程（更精确的匹配）
                result = subprocess.run([
                    'pgrep', '-f', f'ths_qr_{self.session_id}'
                ], capture_output=True, text=True, timeout=1)
                
                if result.returncode == 0 and result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        try:
                            pid_int = int(pid.strip())
                            os.kill(pid_int, signal.SIGTERM)
                            time.sleep(0.05)
                            try:
                                os.kill(pid_int, 0)
                                os.kill(pid_int, signal.SIGKILL)
                                logger.debug(f"终止会话相关进程: {pid_int}")
                            except ProcessLookupError:
                                pass
                        except (ValueError, ProcessLookupError, PermissionError):
                            continue
                            
            except subprocess.SubprocessError:
                # 如果进程查找失败，不进行任何清理，保证安全
                pass
                        
        except Exception as e:
            # 所有异常都静默处理，避免影响其他用户
            logger.debug(f"会话{self.session_id}进程清理失败: {e}")


class QrSessionManager:
    """二维码登录会话管理器"""
    
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sessions: Dict[str, QrLoginSession] = {}
        self.lock = threading.Lock()
        # 启动时清理所有旧文件（上次运行遗留）
        self.cleanup_orphan_output_files(max_age_seconds=0)

    def cleanup_orphan_output_files(self, max_age_seconds: int = 600):
        now = time.time()
        with self.lock:
            active_session_ids = set(self.sessions.keys())

        for p in self.output_dir.glob("ths_qr_*.png"):
            session_id = p.stem.replace("ths_qr_", "", 1)
            if session_id in active_session_ids:
                continue
            try:
                if now - p.stat().st_mtime > max_age_seconds:
                    p.unlink()
            except Exception as e:
                logger.warning(f"清理二维码文件失败: {e}")
        
    def create_session(self, user_id: Optional[str] = None) -> str:
        """创建新的登录会话，返回 session_id - 支持多用户隔离"""
        # 1. 先清理当前用户的旧会话，避免资源积累
        self._force_cleanup_user_sessions(user_id)
        
        session_id = str(uuid.uuid4())
        session = QrLoginSession(session_id, self.output_dir, user_id)
        
        with self.lock:
            self.sessions[session_id] = session
        
        logger.info(f"创建会话: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[QrLoginSession]:
        """获取会话"""
        with self.lock:
            return self.sessions.get(session_id)
    
    def remove_session(self, session_id: str):
        """移除并清理会话"""
        with self.lock:
            session = self.sessions.pop(session_id, None)
            if session:
                session.cleanup()
    
    def cleanup_expired_sessions(self):
        """清理过期的会话"""
        with self.lock:
            expired = [
                sid for sid, session in self.sessions.items()
                if session.is_expired() or session.status in ["success", "failed", "timeout", "cancelled"]
            ]
            
            for sid in expired:
                session = self.sessions.pop(sid)
                session.cleanup()

    def _force_cleanup_user_sessions(self, user_id: Optional[str] = None):
        """按用户强制清理旧会话，避免用户间资源冲突"""
        target_user = user_id or "anonymous"
        
        with self.lock:
            # 1. 只清理当前用户的会话
            current_time = time.time()
            user_sessions = {
                sid: session for sid, session in self.sessions.items()
                if session.user_id == target_user
            }
            
            # 2. 清理该用户超过30秒的会话或已完成的会话
            old_sessions = [
                sid for sid, session in user_sessions.items()
                if current_time - session.created_at > 30 or 
                   session.status in ["success", "failed", "timeout", "cancelled"]
            ]
            
            # 3. 如果该用户会话太多，保留最新的2个
            if len(user_sessions) > 2:  # 每个用户最多2个并发会话
                sorted_sessions = sorted(
                    user_sessions.items(), 
                    key=lambda x: x[1].created_at
                )
                # 保留最新的2个，清理其余的
                old_sessions.extend([sid for sid, _ in sorted_sessions[:-2]])
            
            # 4. 执行清理（只清理当前用户的会话）
            for sid in set(old_sessions):
                if sid in self.sessions:
                    session = self.sessions.pop(sid)
                    session.cleanup()
                    
        # 5. 不进行全局进程清理，避免影响其他用户

    def get_user_session_count(self, user_id: Optional[str] = None) -> int:
        """获取指定用户的活跃会话数量"""
        target_user = user_id or "anonymous"
        with self.lock:
            return sum(
                1 for session in self.sessions.values()
                if session.user_id == target_user and 
                   session.status not in ["success", "failed", "timeout", "cancelled"]
            )
    
    def get_user_sessions(self, user_id: Optional[str] = None) -> Dict[str, QrLoginSession]:
        """获取指定用户的所有会话"""
        target_user = user_id or "anonymous"
        with self.lock:
            return {
                sid: session for sid, session in self.sessions.items()
                if session.user_id == target_user
            }
    
    def _save_session_to_redis(self, session: QrLoginSession):
        """将会话状态和结果保存到Redis"""
        try:
            redis_key = user_cache_keys.qr_session(session.session_id)
            data = {
                "session_id": session.session_id,
                "user_id": session.user_id,
                "status": session.status,
                "result": session.result,
                "error": session.error,
                "created_at": session.created_at,
                "qr_image_base64": session.qr_image_base64,
            }
            cache_service.set_json(redis_key, data, ttl_seconds=user_cache_keys.QR_SESSION_TTL)
        except Exception as e:
            logger.error(f"保存会话到Redis失败 {session.session_id}: {e}")

    def get_session_from_redis(self, session_id: str) -> Optional[Dict[str, Any]]:
        """从Redis获取会话状态和结果"""
        try:
            redis_key = user_cache_keys.qr_session(session_id)
            data = cache_service.get_json(redis_key)
            return data
        except Exception as e:
            logger.error(f"从Redis获取会话失败 {session_id}: {e}")
            return None

    def delete_session_from_redis(self, session_id: str):
        """从Redis删除会话"""
        try:
            redis_key = user_cache_keys.qr_session(session_id)
            cache_service.delete(redis_key)
        except Exception as e:
            logger.error(f"从Redis删除会话失败 {session_id}: {e}")

    def _remove_session_from_memory(self, session_id: str):
        """从内存中删除会话（不触发cleanup）"""
        with self.lock:
            if session_id in self.sessions:
                del self.sessions[session_id]

    def start_qr_login_async(
        self, 
        session_id: str,
        headless: bool = True,
        on_qr_ready_callback = None
    ) -> bool:
        """
        异步启动二维码登录流程
        
        Returns:
            True if started successfully, False otherwise
        """
        session = self.get_session(session_id)
        if not session:
            return False
        
        def _login_thread():
            try:
                # 定义二维码就绪回调
                def on_qr_ready(qr_bytes: bytes, qr_path: str):
                    # 将二维码转为 base64
                    session.qr_image_base64 = base64.b64encode(qr_bytes).decode('ascii')
                    session.status = "qr_ready"
                    # 二维码就绪时存入Redis，API可直接从Redis获取状态
                    self._save_session_to_redis(session)
                    logger.info(f"二维码已生成: {session_id}")
                    
                    # 如果有外部回调，也调用
                    if on_qr_ready_callback:
                        on_qr_ready_callback(qr_bytes, qr_path)
                
                # 创建登录客户端（每次创建新实例，Playwright不支持跨线程）
                login_client = TongHuaShunQrLogin(
                    qr_output_path=str(session.qr_path),
                    result_output_path=None,  # 不保存到文件，直接使用内存中的result
                    headless=headless,
                    on_qr_ready=on_qr_ready,
                    wait_login_timeout_seconds=180,
                )
                
                session.login_client = login_client
                
                # 启动登录（阻塞调用）
                result = login_client.start()
                
                # 登录成功 - 将结果存入Redis
                session.result = result
                session.status = "success"
                self._save_session_to_redis(session)
                logger.info(f"登录成功: {session_id}")
                
            except Exception as e:
                session.error = str(e)
                session.status = "failed"
                self._save_session_to_redis(session)
                logger.error(f"会话 {session_id} 登录失败: {e}")
            finally:
                # 登录结束后立即清理资源并从内存中删除会话
                # wait_for_thread=False 因为是从线程内调用
                session.cleanup(wait_for_thread=False)
                self._remove_session_from_memory(session_id)
        
        # 启动后台线程
        thread = threading.Thread(target=_login_thread, daemon=True)
        thread.start()
        session.thread = thread
        
        return True


# 全局单例
qr_session_manager: Optional[QrSessionManager] = None

def get_qr_session_manager(output_dir: Path) -> QrSessionManager:
    """获取全局二维码会话管理器"""
    global qr_session_manager
    if qr_session_manager is None:
        qr_session_manager = QrSessionManager(output_dir)
    return qr_session_manager
