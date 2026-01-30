"""
同花顺短信验证码会话管理器
用于管理短信验证码发送会话，避免频繁重复发送
"""
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional

from loguru import logger

from app.services.external.ths.auth.methods.sms import TongHuaShunSmsLogin


@dataclass
class SmsSession:
    """短信验证码会话"""
    mobile: str
    login_client: TongHuaShunSmsLogin
    sent_at: float
    captcha_pending: bool = False  # 是否等待人工验证
    
    def is_expired(self, timeout_seconds: int = 300) -> bool:
        """检查会话是否过期（默认5分钟）"""
        return time.time() - self.sent_at > timeout_seconds


class SmsSessionManager:
    """短信验证码会话管理器"""
    
    def __init__(self):
        self.sessions: Dict[str, SmsSession] = {}
        self.lock = threading.Lock()
        
    def create_session(self, mobile: str) -> TongHuaShunSmsLogin:
        """
        创建新的短信会话并发送验证码
        
        Returns:
            TongHuaShunSmsLogin实例
        """
        with self.lock:
            # 检查是否已有会话
            existing = self.sessions.get(mobile)
            if existing and not existing.is_expired(timeout_seconds=60):
                # 60秒内不允许重复发送
                raise ValueError("验证码发送过于频繁，请稍后再试")
            
            # 创建新的登录客户端
            login_client = TongHuaShunSmsLogin(mobile=mobile)
            
            # 初始化设备cookie和发送短信
            login_client._risk_init_device_cookie()
            sent = login_client._send_sms_with_auto_captcha()
            
            # 保存会话（无论是否需要验证码）
            session = SmsSession(
                mobile=mobile,
                login_client=login_client,
                sent_at=time.time(),
                captcha_pending=login_client.captcha_required
            )
            self.sessions[mobile] = session
            
            if not sent:
                if login_client.captcha_required:
                    logger.info(f"需要人工验证滑块: {mobile}")
                    return login_client  # 返回客户端，让调用方获取验证码数据
                raise RuntimeError(login_client.last_sms_send_error or "验证码发送失败")
            
            logger.info(f"短信验证码已发送至: {mobile}")
            return login_client
    
    def get_session(self, mobile: str) -> Optional[SmsSession]:
        """获取会话"""
        with self.lock:
            session = self.sessions.get(mobile)
            if session and session.is_expired():
                # 会话已过期，删除
                del self.sessions[mobile]
                return None
            return session
    
    def remove_session(self, mobile: str):
        """移除会话"""
        with self.lock:
            self.sessions.pop(mobile, None)
            logger.info(f"移除短信验证码会话: {mobile}")
    
    def submit_captcha(self, mobile: str, x: int, track_width: int = 340) -> bool:
        """提交人工验证的滑块坐标"""
        with self.lock:
            session = self.sessions.get(mobile)
            if not session:
                raise ValueError("SESSION_EXPIRED")  # 使用错误码
            if not session.captcha_pending:
                raise ValueError("当前会话无需验证码")
            
            sent = session.login_client._send_sms_with_manual_captcha(x, track_width)
            if sent:
                session.captcha_pending = False
                session.sent_at = time.time()  # 更新发送时间
                logger.info(f"人工验证成功，短信已发送至: {mobile}")
                return True
            else:
                raise RuntimeError(session.login_client.last_sms_send_error or "验证码验证失败")
    
    def cleanup_expired_sessions(self):
        """清理过期的会话"""
        with self.lock:
            expired = [
                mobile for mobile, session in self.sessions.items()
                if session.is_expired()
            ]
            
            for mobile in expired:
                del self.sessions[mobile]
                logger.info(f"清理过期短信会话: {mobile}")


# 全局单例
sms_session_manager = SmsSessionManager()
