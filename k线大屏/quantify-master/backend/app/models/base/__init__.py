"""
数据库基础模块
包含数据库连接、表工厂等基础功能 - 升级SQLModel
"""

from .database import (
    engine, get_db, init_db, db_session_context
)
from .table_factory import (
    TableFactory, table_factory
)
from .table_strategy import TableStrategy

__all__ = [
    "engine",
    "get_db",
    "init_db",
    "db_session_context",
    "TableFactory",
    "table_factory",
    "TableStrategy"
]
