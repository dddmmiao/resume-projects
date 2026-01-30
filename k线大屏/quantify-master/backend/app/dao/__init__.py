"""
数据访问层 (DAO) 模块 - SQLModel优化版本
提供所有业务领域的数据访问接口，支持高性能查询和批量操作
所有DAO已完成SQLModel迁移，消除连接泄漏风险，提升系统稳定性
"""

# 适配器和策略
from .adapters.entity_adapter import EntityAdapterFactory
from .base_dao import base_dao
# 基础数据DAO
from .concept_dao import concept_dao
# K线数据DAO
from .concept_kline_dao import concept_kline_dao
from .convertible_bond_call_dao import convertible_bond_call_dao
from .convertible_bond_dao import convertible_bond_dao
from .convertible_bond_kline_dao import convertible_bond_kline_dao
# DAO配置
from .dao_config import DAOConfig
from .filters.filter_processor import FilterProcessor
from .industry_dao import industry_dao
from .industry_kline_dao import industry_kline_dao
from .kline_query_utils import kline_query_utils
from .query_config import QueryConfig
# 查询工具
from .query_utils import query_utils
from .stock_dao import stock_dao
from .stock_kline_dao import stock_kline_dao
from .strategies.sorting_strategy import SortingStrategyFactory
from .trade_calendar_dao import trade_calendar_dao
# 批量操作工具
from .utils.batch_operations import batch_operations
# 策略历史DAO
from .strategy_history_dao import strategy_history_dao

# 导出所有DAO实例和工具
__all__ = [
    # 基础数据DAO
    'concept_dao',
    'industry_dao',
    'stock_dao', 
    'convertible_bond_dao',
    'convertible_bond_call_dao',
    'daily_basic_dao',
    'trade_calendar_dao',
    'base_dao',
    
    # K线数据DAO
    'concept_kline_dao',
    'industry_kline_dao',
    'stock_kline_dao',
    'convertible_bond_kline_dao',
    
    # 查询工具
    'query_utils',
    'kline_query_utils',
    
    # 批量操作工具
    'batch_operations',
    
    # 适配器和策略
    'EntityAdapterFactory',
    'SortingStrategyFactory', 
    'FilterProcessor',
    
    # DAO配置
    'DAOConfig',
    'QueryConfig',
    
    # 策略历史DAO
    'strategy_history_dao',
]
