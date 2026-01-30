"""
实体适配器模块 - SQLModel优化版本
处理不同实体类型的特殊业务逻辑，提供统一的实体操作接口
支持高性能的代码转换和筛选功能，优化Service层缓存调用
"""

from .entity_adapter import EntityAdapterFactory

__all__ = [
    'EntityAdapterFactory',
]
