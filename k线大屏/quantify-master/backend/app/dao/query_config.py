"""
DAO层查询配置模块
提供数据查询的基础配置，避免对上层Service的依赖
"""

from datetime import datetime, timedelta
from typing import List


class QueryConfig:
    """DAO层查询配置类"""
    
    # 默认同步范围配置（兜底值，单位：天）
    # 与 SyncStrategyConfig._FALLBACK_DEFAULT_MONTHS 保持一致：12个月 ≈ 360天
    DEFAULT_SYNC_DAYS = 12 * 30
    
    # 默认查询范围配置（单位：年）
    # 用于K线数据查询，覆盖用户可能请求的最大范围（如 limit=750 ≈ 3年交易日）
    DEFAULT_QUERY_YEARS = 3
    
    @classmethod
    def get_sync_days(cls) -> int:
        """获取默认同步天数（用于数据同步）。

        优先从 Redis 读取配置（system:config:default_sync_months），
        未配置或发生异常时，回退到本地 DEFAULT_SYNC_DAYS。
        """
        try:
            from app.services.core.system_config_service import system_config_service
            months_str = system_config_service.get("default_sync_months")
            if months_str:
                months = int(months_str)
                if months > 0:
                    return months * 30
        except Exception:
            # DAO 层不依赖上层 Service，读取失败时静默回退到本地默认配置
            pass
        return cls.DEFAULT_SYNC_DAYS
    
    @classmethod
    def get_default_days(cls) -> int:
        """向后兼容：同 get_sync_days"""
        return cls.get_sync_days()
    
    @classmethod
    def get_default_months(cls) -> int:
        """获取默认同步月数（以「月」为单位）。

        对外暴露给 API / Service 层使用，基于 get_default_days()
        的结果换算得到月数，确保所有层使用的是同一套配置。
        """
        days = cls.get_default_days()
        # 按 30 天折算为月数，至少为 1 个月
        months = max(1, days // 30)
        return months
    
    @classmethod
    def get_sync_years(cls) -> List[int]:
        """
        获取同步年份列表（用于数据同步任务）
        
        基于当前时间和同步配置计算需要同步的年份范围
        
        Returns:
            年份列表，用于数据同步
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=cls.get_sync_days())
        
        start_year = start_date.year
        end_year = end_date.year
        
        return list(range(start_year, end_year + 1))
    
    @classmethod
    def get_default_years(cls) -> List[int]:
        """向后兼容：同 get_sync_years"""
        return cls.get_sync_years()
    
    @classmethod
    def get_query_years_count(cls) -> int:
        """获取查询年份数量（用于K线数据查询）。
        
        优先从 Redis 读取配置（system:config:kline_display_years），
        未配置或发生异常时，回退到本地 DEFAULT_QUERY_YEARS。
        """
        try:
            from app.services.core.system_config_service import system_config_service
            years_str = system_config_service.get("kline_display_years")
            if years_str:
                years = int(years_str)
                if years > 0:
                    return years
        except Exception:
            pass
        return cls.DEFAULT_QUERY_YEARS
    
    @classmethod
    def get_query_years(cls, end_date: str = None) -> List[int]:
        """
        获取查询年份列表（用于K线数据查询）
        
        Args:
            end_date: 结束日期（YYYYMMDD或YYYY-MM-DD），可选。
                      如果提供，则以该日期的年份为基准；否则使用当前年份。
        
        配置N年 = 从基准年份往前N年的数据
        例如：配置3年，end_date=20251031 → 需要2022-2025年的数据
              需要查询的年份表：[2022, 2023, 2024, 2025]
        
        Returns:
            年份列表，用于K线数据查询
        """
        years_count = cls.get_query_years_count()
        
        if end_date:
            # 根据end_date确定基准年份
            base_year = int(str(end_date).replace("-", "")[:4])
        else:
            # 使用当前年份作为基准
            base_year = datetime.now().year
        
        # 配置N年需要查询N+1个年份的表（跨年边界）
        return list(range(base_year - years_count, base_year + 1))
    
    @classmethod
    def get_effective_limit(cls, requested_limit: int = None, trading_days_per_year: int = 250) -> int:
        """
        根据系统配置的最大显示年份，计算有效的limit值
        
        配置N年 = 最近N年的数据 = N × 250交易日
        例如：配置3年 → 最大750条
        
        Args:
            requested_limit: 请求的limit值，None表示使用最大值
            trading_days_per_year: 每年交易日数，默认250
            
        Returns:
            有效的limit值（不超过配置上限）
        """
        max_years = cls.get_query_years_count()
        max_limit = max_years * trading_days_per_year
        
        if requested_limit is None:
            return max_limit
        return min(int(requested_limit), max_limit)