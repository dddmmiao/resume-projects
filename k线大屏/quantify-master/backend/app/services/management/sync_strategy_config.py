"""
统一同步策略配置类
消除各服务中的代码重复，提供一致的策略配置
"""

from datetime import datetime, timedelta
from typing import Tuple


class SyncStrategyConfig:
    """同步策略配置类"""

    # 默认配置
    DEFAULT_CONCURRENT_WORKERS = 8  # 默认并发数

    # 按任务类型配置不同的并发数（匹配对应的API接口限制）
    # 股票K线同步：使用 daily 接口，并发上限 8
    STOCK_KLINE_CONCURRENT_WORKERS = 8
    # 可转债K线同步：使用 cb_daily 接口，并发上限 5
    BOND_KLINE_CONCURRENT_WORKERS = 5
    # 概念K线同步：使用 ths_daily 接口（实际限制100次/分），并发上限 2
    CONCEPT_KLINE_CONCURRENT_WORKERS = 2
    # 行业K线同步：使用 ths_daily 接口（实际限制100次/分），并发上限 2
    INDUSTRY_KLINE_CONCURRENT_WORKERS = 2

    # 批量写库调优（可被环境或运行时覆盖，BatchOperations 会优先读取这些值）
    BATCH_OPS_LARGE_THRESHOLD = 5000  # 年度数据量超过该阈值启用月分片
    BATCH_OPS_BASE_BATCH = 500  # 基础批量大小
    BATCH_OPS_ENABLE_MONTH_CHUNKING = True  # 是否启用月分片

    @classmethod
    def get_default_days(cls) -> int:
        """获取默认同步天数。

        为避免配置分散，默认天数的实际计算委托给 DAO 层的
        :class:`QueryConfig`，确保同步和查询使用完全一致的
        Redis 配置和兜底逻辑。
        """
        # 延迟导入以避免模块初始化阶段的循环依赖
        from ...dao.query_config import QueryConfig

        return QueryConfig.get_default_days()

    @classmethod
    def get_default_months(cls) -> int:
        """获取默认同步月数（单位：月）。

        通过 DAO 层的 QueryConfig 统一计算逻辑，避免 API
        或其他 Service 直接依赖 DAO 细节。
        """
        from ...dao.query_config import QueryConfig

        return QueryConfig.get_default_months()

    @staticmethod
    def get_default_date_range(days: int = None) -> Tuple[str, str]:
        """
        获取默认日期范围
        
        Args:
            days: 天数，如果为None则从配置读取
            
        Returns:
            (start_date, end_date) 元组，格式为YYYYMMDD
        """
        if days is None:
            days = SyncStrategyConfig.get_default_days()

        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y%m%d")

        return start_date, end_date

    @staticmethod
    def get_default_query_date_range(days: int = None) -> Tuple[str, str]:
        """获取基于最新交易日的默认查询区间（service 层封装）。

        Args:
            days: 往前回溯的天数，如果为None则从配置读取

        Returns:
            (start_date, end_date)，格式 YYYYMMDD，其中 end_date 为交易日历中的最新交易日。
        """
        if days is None:
            days = SyncStrategyConfig.get_default_days()

        from app.services.data.trade_calendar_service import trade_calendar_service

        latest_trading_day = trade_calendar_service.get_latest_trading_day("SSE")
        if not latest_trading_day:
            latest_trading_day = datetime.now().strftime("%Y%m%d")

        end_date_dt = datetime.strptime(latest_trading_day, "%Y%m%d")
        start_date_dt = end_date_dt - timedelta(days=days)

        return start_date_dt.strftime("%Y%m%d"), end_date_dt.strftime("%Y%m%d")

    @staticmethod
    def get_default_years() -> list:
        """
        获取默认年份列表
        
        Returns:
            年份列表，基于默认日期范围计算
        """
        # 🚀 架构优化：委托给DAO层的QueryConfig，保持配置一致性
        from ...dao.query_config import QueryConfig
        return QueryConfig.get_default_years()
