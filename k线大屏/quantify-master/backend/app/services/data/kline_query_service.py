"""
K线查询服务 - Service层封装
提供K线相关的查询功能，支持缓存优化
"""
import hashlib
from typing import List, Dict

from loguru import logger

from app.dao.kline_query_utils import KlineQueryUtils
from app.services.core.cache_service import service_cached


class KlineQueryService:
    """K线查询服务"""
    
    @service_cached(
        prefix="klines:latest_dates",
        key_fn=lambda self, codes, periods, table_type: f"{table_type}:{hashlib.md5('|'.join(sorted(set(codes))).encode()).hexdigest()[:12]}:{'_'.join(sorted(set(periods)))}",
        ttl_seconds=86400  # 24小时缓存
    )
    def get_latest_kline_dates_by_code_and_period(
            self,
            codes: List[str],
            periods: List[str],
            table_type: str
    ) -> Dict[str, Dict[str, str]]:
        """
        一次性获取所有代码和所有周期的最新K线日期（Service层封装，支持缓存）
        
        Args:
            codes: 代码列表
            periods: 周期类型列表 ('daily', 'weekly', 'monthly')
            table_type: 表类型 (stock, convertible_bond, concept, industry)
            
        Returns:
            {code: {period: 'YYYY-MM-DD'}} 代码和周期到最新日期的映射字典
            
        Examples:
            >>> service = KlineQueryService()
            >>> dates = service.get_latest_kline_dates_by_code_and_period(
            ...     codes=['000001.SZ', '000002.SZ'],
            ...     periods=['daily', 'weekly'],
            ...     table_type='stock'
            ... )
            >>> # 返回: {'000001.SZ': {'daily': '2023-12-01', 'weekly': '2023-11-30'}, ...}
        """
        logger.debug(f"K线日期查询 | 代码数: {len(codes)} | 周期数: {len(periods)} | 表类型: {table_type}")
        
        # 委托给DAO层执行实际查询
        result = KlineQueryUtils.get_latest_kline_dates_by_code_and_period(
            codes=codes,
            periods=periods,
            table_type=table_type
        )
        
        logger.debug(f"K线日期查询完成 | 返回代码数: {len(result)}")
        return result


# 创建全局单例
kline_query_service = KlineQueryService()
