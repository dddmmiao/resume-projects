"""
DAO工具模块 - SQLModel优化版本
提供高性能的数据库操作工具类，支持批量操作、事务管理和连接优化
已完成SQLModel迁移，提供零连接泄漏的安全操作接口
"""

# 导入批量操作工具
from .batch_operations import batch_operations

# 导出所有工具
__all__ = [
    'batch_operations',
]
