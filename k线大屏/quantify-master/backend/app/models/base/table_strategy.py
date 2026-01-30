"""
智能分表策略管理器
根据数据类型和频率自动选择最优的分表策略
"""

from enum import Enum


class TableStrategy(Enum):
    """分表策略枚举"""

    YEARLY = "yearly"  # 按年分表 - 适合日线数据
    MONTHLY = "monthly"  # 按月分表 - 适合分钟级数据
    SINGLE = "single"  # 单表 - 适合小数据量


class DataFrequency(Enum):
    """数据频率枚举"""

    DAILY = "daily"  # 日线
    WEEKLY = "weekly"  # 周线
    MONTHLY = "monthly"  # 月线
    MINUTE_1 = "1min"  # 1分钟
    MINUTE_5 = "5min"  # 5分钟
    MINUTE_15 = "15min"  # 15分钟
    MINUTE_30 = "30min"  # 30分钟
    MINUTE_60 = "60min"  # 60分钟


class TableStrategyManager:
    """智能分表策略管理器"""

    # 策略配置：根据数据频率和证券类型选择最优分表策略
    STRATEGY_CONFIG = {
        # 日线数据：按年分表（每年约250个交易日，数据量适中）
        DataFrequency.DAILY: TableStrategy.YEARLY,
        DataFrequency.WEEKLY: TableStrategy.YEARLY,
        DataFrequency.MONTHLY: TableStrategy.SINGLE,
        # 分钟级数据：按月分表（数据量大，需要更细粒度）
        DataFrequency.MINUTE_1: TableStrategy.MONTHLY,
        DataFrequency.MINUTE_5: TableStrategy.MONTHLY,
        DataFrequency.MINUTE_15: TableStrategy.MONTHLY,
        DataFrequency.MINUTE_30: TableStrategy.MONTHLY,
        DataFrequency.MINUTE_60: TableStrategy.MONTHLY,
    }
