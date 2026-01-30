"""
日志上下文管理模块
提供 trace_id 追踪机制，用于关联同一任务/请求的所有日志
"""
import uuid
import contextvars
from typing import Optional

# 线程安全的上下文变量
_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar('trace_id', default=None)


def get_trace_id() -> Optional[str]:
    """获取当前上下文的 trace_id"""
    return _trace_id.get()


def set_trace_id(trace_id: str) -> None:
    """设置当前上下文的 trace_id"""
    _trace_id.set(trace_id)


def generate_trace_id(prefix: str = "") -> str:
    """生成新的 trace_id（8位短ID）"""
    short_id = uuid.uuid4().hex[:8]
    return f"{prefix}_{short_id}" if prefix else short_id
