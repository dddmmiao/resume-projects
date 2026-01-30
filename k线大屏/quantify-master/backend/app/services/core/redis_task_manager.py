"""
基于Redis的任务进度管理器
完全替代原有的内存存储机制，支持多实例部署和实时推送
"""
import asyncio
import json
import time
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional, Callable

from loguru import logger

from app.core.exceptions import CancellationException
from app.core.logging_context import set_trace_id, generate_trace_id
from app.services.core.task_message_formatter import task_message_formatter


class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"  # 等待执行
    RUNNING = "running"  # 正在执行
    COMPLETED = "completed"  # 执行完成
    FAILED = "failed"  # 执行失败
    CANCELLED = "cancelled"  # 已取消
    CANCELLING = "cancelling"  # 正在取消
    TIMEOUT = "timeout"  # 执行超时
    STUCK = "stuck"  # 疑似卡住


@dataclass
class TaskProgress:
    """任务进度信息"""
    task_id: str
    name: str
    code: Optional[str] = None  # 任务唯一标识码
    status: TaskStatus = TaskStatus.PENDING
    progress: int = 0  # 0-100
    message: str = ""
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    # 细粒度进度信息
    current_operation: Optional[str] = None
    processed_items: int = 0
    total_items: int = 0
    operation_details: Optional[Dict[str, Any]] = None


class RedisTaskManager:
    """基于Redis的任务管理器 - 复用cache_service的Redis连接"""

    def __init__(self):
        # 延迟导入避免循环依赖
        from app.services.core.cache_service import cache_service
        
        self.redis_client = cache_service.redis_client
        self.max_concurrent_tasks = 5

        # Redis键前缀
        self.TASK_PREFIX = "task_progress"

        # 验证Redis连接
        if self.redis_client:
            logger.info("Redis任务管理器初始化成功（复用cache_service连接）")
        else:
            logger.warning("Redis连接不可用，任务管理器功能受限")

    def create_task(self, name: str, task_func: Callable, code: Optional[str] = None, *args, **kwargs) -> str:
        """创建异步任务"""
        task_id = str(uuid.uuid4())

        # 如果有任务代码，清理该代码的所有旧缓存
        if code:
            self._cleanup_old_tasks_by_code(code)

        # 创建任务进度对象
        progress = TaskProgress(
            task_id=task_id,
            name=name,
            code=code,
            status=TaskStatus.PENDING,
            progress=0,
            message="任务已创建，等待执行",
            created_at=datetime.now()
        )

        # 存储到Redis
        self._save_task_progress(progress)

        # 在后台线程中运行异步任务，避免依赖当前线程事件循环
        def _runner():
            try:
                asyncio.run(self._execute_task(task_id, task_func, *args, **kwargs))
            except Exception as e:
                logger.error(f"后台任务运行失败: {e}")

        from app.utils.concurrent_utils import run_async
        run_async(_runner, name=f"task_{task_id[:8]}")

        logger.info(f"创建任务: {name} (ID: {task_id})")
        return task_id

    async def _execute_task(self, task_id: str, task_func: Callable, *args, **kwargs):
        """执行任务"""
        try:
            exec_start_time = time.time()
            
            # 设置 trace_id 用于日志追踪（使用任务ID的前8位作为trace_id）
            trace_id = task_id[:8] if task_id else generate_trace_id("task")
            set_trace_id(trace_id)
            
            # 任务开始前检查是否已被取消
            if self.is_task_cancelled(task_id):
                self.update_task_progress(task_id, 0, "任务已被取消", TaskStatus.CANCELLED)
                logger.info(f"任务在开始前已被取消: {task_id}")
                return

            # 更新任务状态为运行中
            self.update_task_progress(task_id, 10, "任务开始执行", TaskStatus.RUNNING)

            # 执行任务函数
            maybe_coro = task_func(task_id, *args, **kwargs)
            if asyncio.iscoroutine(maybe_coro):
                result = await maybe_coro
            else:
                result = maybe_coro

            # 任务完成后检查是否被取消
            if self.is_task_cancelled(task_id):
                self.update_task_progress(task_id, 0, "任务已被取消", TaskStatus.CANCELLED)
                logger.info(f"任务在完成后发现已被取消: {task_id}")
                return

            duration_ms = int((time.time() - exec_start_time) * 1000)
            dur_text = task_message_formatter._format_duration(duration_ms)

            current_task = self.get_task_progress(task_id)
            current_progress = int(current_task.get("progress", 0) or 0) if current_task else 0

            if current_progress == 100:
                current_message = (current_task or {}).get("message")
                if current_message and dur_text and ("耗时" not in current_message):
                    self.update_task_progress(
                        task_id,
                        100,
                        f"{current_message}{dur_text}",
                        TaskStatus.COMPLETED,
                        result=result,
                    )
                else:
                    self.update_task_progress(task_id, 100, None, TaskStatus.COMPLETED, result=result)
            else:
                msg = "任务执行完成"
                if dur_text and ("耗时" not in msg):
                    msg = f"{msg}{dur_text}"
                self.update_task_progress(task_id, 100, msg, TaskStatus.COMPLETED, result=result)

            logger.info(f"任务执行完成: {task_id}")

        except CancellationException as e:
            # 任务被取消
            try:
                duration_ms = int((time.time() - exec_start_time) * 1000)
                dur_text = task_message_formatter._format_duration(duration_ms)
            except Exception:
                dur_text = ""
            msg = f"任务已取消: {str(e)}"
            if dur_text and ("耗时" not in msg):
                msg = f"{msg}{dur_text}"
            self.update_task_progress(task_id, 0, msg, TaskStatus.CANCELLED)
            logger.info(f"任务被取消: {task_id}")

        except Exception as e:
            # 任务执行失败
            try:
                duration_ms = int((time.time() - exec_start_time) * 1000)
                dur_text = task_message_formatter._format_duration(duration_ms)
            except Exception:
                dur_text = ""
            msg = f"任务执行失败: {str(e)}"
            if dur_text and ("耗时" not in msg):
                msg = f"{msg}{dur_text}"
            self.update_task_progress(task_id, 0, msg, TaskStatus.FAILED, error=str(e))
            logger.error(f"任务执行失败: {task_id}, 错误: {e}")

        finally:
            # 确保任务状态正确设置和清理
            try:
                # 检查并处理 cancelling 状态
                task_data = self.redis_client.hgetall(f"{self.TASK_PREFIX}:{task_id}")
                if task_data and task_data.get("status") == "cancelling":
                    self.update_task_progress(task_id, 0, "任务已取消", TaskStatus.CANCELLED)
                    logger.info(f"任务 {task_id} 状态从 cancelling 更新为 cancelled")

                # 任务完成后保留进度缓存供查询
                task_code = task_data.get("code", "") if task_data else ""
                if task_code:
                    logger.info(f"任务 {task_id} ({task_code}) 已完成，保留进度缓存供查询")

            except Exception as cleanup_error:
                logger.error(f"清理任务 {task_id} 时发生错误: {cleanup_error}")

    def get_task_progress(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务进度"""
        progress_data = self.redis_client.hgetall(f"{self.TASK_PREFIX}:{task_id}")
        if not progress_data:
            return None

        # 转换数据类型
        result = {
            "task_id": progress_data.get("task_id"),
            "name": progress_data.get("name"),
            "code": progress_data.get("code"),
            "status": progress_data.get("status"),
            "progress": int(progress_data.get("progress", 0)),
            "message": progress_data.get("message"),
            "created_at": progress_data.get("created_at"),
            "started_at": progress_data.get("started_at"),
            "completed_at": progress_data.get("completed_at"),
            "error": progress_data.get("error"),
            "current_operation": progress_data.get("current_operation"),
            "processed_items": int(progress_data.get("processed_items", 0)),
            "total_items": int(progress_data.get("total_items", 0)),
        }

        # 解析result和operation_details
        if progress_data.get("result"):
            try:
                result["result"] = json.loads(progress_data["result"])
            except json.JSONDecodeError:
                result["result"] = None

        if progress_data.get("operation_details"):
            try:
                result["operation_details"] = json.loads(progress_data["operation_details"])
            except json.JSONDecodeError:
                result["operation_details"] = None

        # 计算运行时长和预计剩余时间
        if result.get("started_at"):
            try:
                started_at = datetime.fromisoformat(result["started_at"])
                elapsed_seconds = (datetime.now() - started_at).total_seconds()
                result["elapsed_time"] = int(elapsed_seconds)
                
                progress = result.get("progress", 0)
                if progress > 0 and progress < 100:
                    remaining_seconds = elapsed_seconds / progress * (100 - progress)
                    result["remaining_time"] = int(remaining_seconds)
            except Exception:
                pass

        return result

    def update_task_progress(
            self,
            task_id: str,
            progress: int,
            message: Optional[str],
            status: Optional[TaskStatus] = None,
            current_operation: Optional[str] = None,
            processed_items: Optional[int] = None,
            total_items: Optional[int] = None,
            operation_details: Optional[Dict[str, Any]] = None,
            result: Optional[Dict[str, Any]] = None,
            error: Optional[str] = None
    ):
        """更新任务进度"""
        try:
            # 获取当前任务数据
            current_data = self.redis_client.hgetall(f"{self.TASK_PREFIX}:{task_id}")
            if not current_data:
                logger.warning(f"任务不存在: {task_id}")
                return

            # 任务进入 cancelling/cancelled 后，冻结普通进度消息，避免被 worker 的常规进度覆盖。
            # 只允许显式 status 更新（例如从 cancelling -> cancelled），或写入终态。
            current_status = (current_data.get("status") or "").strip()
            if current_status in {"cancelling", "cancelled"}:
                if status is None:
                    return
                if current_status == "cancelled" and status != TaskStatus.CANCELLED:
                    return
                if current_status == "cancelling" and status in {TaskStatus.PENDING, TaskStatus.RUNNING}:
                    return

            # 更新字段
            update_data = {
                "progress": progress,
                "updated_at": datetime.now().isoformat()
            }
            
            # 只在 message 不为 None 时更新消息（允许保留 worker 设置的消息）
            if message is not None:
                update_data["message"] = message

            if status:
                update_data["status"] = status.value
                if status == TaskStatus.RUNNING and not current_data.get("started_at"):
                    update_data["started_at"] = datetime.now().isoformat()
                elif status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                    update_data["completed_at"] = datetime.now().isoformat()

            if current_operation:
                update_data["current_operation"] = current_operation

            if processed_items is not None:
                update_data["processed_items"] = processed_items

            if total_items is not None:
                update_data["total_items"] = total_items

            if operation_details:
                update_data["operation_details"] = json.dumps(operation_details)

            if result is not None:
                try:
                    update_data["result"] = json.dumps(result)
                except Exception:
                    update_data["result"] = json.dumps({"value": str(result)})

            if error is not None:
                update_data["error"] = str(error)

            # 更新Redis
            # 过滤 None 值，避免 Redis hset 报错
            safe_update = {k: v for k, v in update_data.items() if v is not None}
            self.redis_client.hset(f"{self.TASK_PREFIX}:{task_id}", mapping=safe_update)

        except Exception as e:
            logger.error(f"更新任务进度失败: {task_id}, 错误: {e}")
            # 即使Redis更新失败，也不抛出异常，避免影响任务执行

        # 实时推送进度更新
        self._publish_progress_update(task_id)

        logger.debug(f"更新任务进度: {task_id} - {progress}% - {message}")

    def _publish_progress_update(self, task_id: str):
        """发布进度更新到Redis频道"""
        try:
            # 获取完整任务数据
            full_data = self.get_task_progress(task_id)
            if full_data:
                # 发布到Redis频道
                self.redis_client.publish(f"task_progress_updates", json.dumps({
                    "task_id": task_id,
                    "data": full_data,
                    "timestamp": datetime.now().isoformat()
                }))
        except Exception as e:
            logger.error(f"发布进度更新失败: {e}")

    def _save_task_progress(self, progress: TaskProgress):
        """保存任务进度到Redis"""
        data = asdict(progress)
        # 转换datetime对象为字符串
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
            elif isinstance(value, TaskStatus):
                data[key] = value.value
            elif isinstance(value, dict):
                data[key] = json.dumps(value)
        # 过滤 None 值，避免 Redis hset 报错（要求 bytes/str/int/float）
        data = {k: v for k, v in data.items() if v is not None}

        # 任务进度缓存，任务完成后会自动删除，但保留24小时TTL作为安全措施
        cache_key = f"{self.TASK_PREFIX}:{progress.task_id}"
        self.redis_client.hset(cache_key, mapping=data)
        self.redis_client.expire(cache_key, 24 * 3600)  # 24小时TTL作为安全措施

    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        # 检查任务是否存在
        task_info = self.get_task_progress(task_id)
        if not task_info:
            return False

        current_progress = int(task_info.get("progress", 0) or 0)
        current_status = task_info.get("status", "")
        
        # 如果进度已到100%或任务已在终态，直接设为cancelled（worker已结束，无法响应cancelling）
        if current_progress >= 100 or current_status in ["completed", "failed", "error"]:
            self.update_task_progress(task_id, current_progress, "任务已取消", TaskStatus.CANCELLED)
            logger.info(f"任务已完成/终态，直接取消: {task_id}")
        else:
            # 更新任务状态为取消中（cancelling 视为运行中，直到任务真正退出后由执行器置为 cancelled）
            self.update_task_progress(task_id, current_progress, "任务取消中", TaskStatus.CANCELLING)
            logger.info(f"任务取消请求已发送: {task_id}")
        return True

    def is_task_cancelled(self, task_id: str) -> bool:
        """检查任务是否被取消"""
        task_info = self.get_task_progress(task_id)
        if not task_info:
            return False
        status = task_info.get("status", "")
        return status in ["cancelling", "cancelled"]

    def _cleanup_old_tasks_by_code(self, task_code: str):
        """清理指定任务代码的所有旧缓存"""
        try:
            # 清理任务进度缓存
            task_pattern = f"{self.TASK_PREFIX}:*"
            deleted_count = 0

            for key in self.redis_client.scan_iter(match=task_pattern):
                task_data = self.redis_client.hgetall(key)
                if task_data.get("code") == task_code:
                    # 删除任务进度缓存
                    self.redis_client.delete(key)
                    deleted_count += 1
                    logger.debug(f"清理旧任务缓存: {key} (code: {task_code})")

            if deleted_count > 0:
                logger.info(f"已清理 {deleted_count} 个 {task_code} 的旧任务缓存")

        except Exception as e:
            logger.error(f"清理任务代码 {task_code} 的旧缓存失败: {e}")

    def get_running_tasks(self) -> list:
        """获取正在运行的任务列表"""
        running_task_ids = []
        try:
            # 扫描所有任务进度缓存
            pattern = f"{self.TASK_PREFIX}:*"
            for key in self.redis_client.scan_iter(match=pattern):
                task_data = self.redis_client.hgetall(key)
                if task_data:
                    status = task_data.get("status", "")
                    if status in ["pending", "running", "cancelling"]:
                        task_id = key.replace(f"{self.TASK_PREFIX}:", "")
                        running_task_ids.append(task_id)
        except Exception as e:
            logger.error(f"获取运行中任务列表失败: {e}")
        return running_task_ids

    def get_all_tasks(self) -> Dict[str, Dict[str, Any]]:
        """获取所有任务信息（包括已完成的任务）"""
        all_tasks = {}
        pattern = f"{self.TASK_PREFIX}:*"

        for key in self.redis_client.scan_iter(match=pattern):
            task_id = key.replace(f"{self.TASK_PREFIX}:", "")
            task_data = self.redis_client.hgetall(key)
            if task_data:
                all_tasks[task_id] = task_data

        return all_tasks

    def _is_task_stale(self, task_data: Dict[str, Any], stale_threshold_hours: float) -> bool:
        """检查任务是否为僵尸任务
        
        Returns:
            True: 僵尸任务（进度100%或超时）
            False: 正常运行中的任务
        """
        progress = int(task_data.get("progress", 0))
        status = task_data.get("status", "")
        
        # 进度已100%，认为任务已完成
        if progress >= 100:
            return True
        
        # 非运行状态，不是僵尸
        if status not in ["pending", "running", "cancelling"]:
            return True
        
        # 检查是否超时
        started_at_str = task_data.get("started_at", "")
        if started_at_str:
            try:
                started_at = datetime.fromisoformat(started_at_str)
                elapsed_hours = (datetime.now() - started_at).total_seconds() / 3600
                if elapsed_hours > stale_threshold_hours:
                    return True
            except Exception:
                pass
        
        return False

    def is_task_type_running(self, task_code: str, stale_threshold_hours: float = 2.0) -> bool:
        """检查特定任务类型是否正在运行 - 带僵尸任务检测"""
        try:
            pattern = f"{self.TASK_PREFIX}:*"
            for key in self.redis_client.scan_iter(match=pattern):
                task_data = self.redis_client.hgetall(key)
                if task_data and task_data.get("code") == task_code:
                    if self._is_task_stale(task_data, stale_threshold_hours):
                        # 僵尸任务，自动清理
                        progress = int(task_data.get("progress", 0))
                        if progress < 100 and task_data.get("status") in ["pending", "running", "cancelling"]:
                            task_id = key.replace(f"{self.TASK_PREFIX}:", "")
                            logger.warning(f"检测到僵尸任务: {task_id} (code={task_code}), 自动清理")
                            self.update_task_progress(task_id, progress, "任务异常中断（进程重启）", TaskStatus.FAILED)
                        continue
                    return True
            return False
        except Exception as e:
            logger.error(f"检查任务类型运行状态失败: {e}")
            return False

    def get_running_task_by_code(self, task_code: str, stale_threshold_hours: float = 2.0) -> Optional[Dict[str, Any]]:
        """根据任务代码获取正在运行的任务信息 - 带僵尸任务检测"""
        try:
            pattern = f"{self.TASK_PREFIX}:*"
            for key in self.redis_client.scan_iter(match=pattern):
                task_data = self.redis_client.hgetall(key)
                if task_data and task_data.get("code") == task_code:
                    if self._is_task_stale(task_data, stale_threshold_hours):
                        continue
                    task_id = key.replace(f"{self.TASK_PREFIX}:", "")
                    return self.get_task_progress(task_id)
            return None
        except Exception as e:
            logger.error(f"获取运行中任务信息失败: {e}")
            return None


# 全局实例
redis_task_manager = RedisTaskManager()
