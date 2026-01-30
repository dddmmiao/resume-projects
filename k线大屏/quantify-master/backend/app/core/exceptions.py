"""
统一异常类型定义
"""


class TaskExecutionException(Exception):
    """任务执行异常 - 包装其他异常"""

    def __init__(self, message: str, original_exception: Exception = None):
        super().__init__(message)
        self.original_exception = original_exception


class CancellationException(Exception):
    """任务取消异常 - 统一异常类型"""
    pass


class TaskCancelledException(Exception):
    """任务取消异常 - TushareClient 层使用"""
    pass


class DatabaseException(Exception):
    """数据库操作异常"""
    pass


class ValidationException(Exception):
    """数据验证异常"""
    pass


__all__ = [
    "TaskExecutionException",
    "CancellationException",
    "TaskCancelledException",
    "DatabaseException",
    "ValidationException"
]
