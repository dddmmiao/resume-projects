"""
数据模型模块
"""

# 基础模块 - SQLModel升级
from .base import (
    engine, get_db, init_db, db_session_context, TableFactory, table_factory, TableStrategy
)

# 实体模型
from .entities import (
    Stock,
    ConvertibleBond, ConvertibleBondCall, Concept, StockConcept, Industry, StockIndustry, TradeCalendar
)

# K线模型
from .klines import (
    StockKlineDataBase, ConvertibleBondKlineDataBase,
    ConceptKlineDataBase, IndustryKlineDataBase
)

# 管理模块
from .management import (
    DynamicTableManager, StartupTableInitializer, StrategyExecutionHistory, StrategyPreset
)
from .management.startup_table_initializer import initialize_tables_on_startup

__all__ = [
    # 基础模型
    "engine",
    "get_db",
    "init_db",
    "db_session_context",
    "TableFactory",
    "table_factory",
    "TableStrategy",

    # 实体模型
    "Stock",
    "ConvertibleBond",
    "ConvertibleBondCall",
    "Concept",
    "StockConcept",
    "Industry",
    "StockIndustry",
    "TradeCalendar",

    # K线模型
    "StockKlineDataBase",
    "ConvertibleBondKlineDataBase",
    "ConceptKlineDataBase",
    "IndustryKlineDataBase",

    # 管理模块
    "DynamicTableManager",
    "StartupTableInitializer",
    "StrategyExecutionHistory",
    "StrategyPreset",
    "initialize_tables_on_startup",
]
