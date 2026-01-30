"""
K线周期处理器
负责处理不同周期的K线数据计算和存储
"""

from typing import List, Dict, Any, Callable, Optional, Tuple

from loguru import logger


class KlinePeriodProcessor:
    """K线周期处理器"""
    
    def __init__(self, entity_type: str):
        self.entity_type = entity_type
        self._processors = {
            "daily": self._process_daily,
            "weekly": self._process_weekly,
            "monthly": self._process_monthly,
        }
    
    def process_periods(
        self,
        daily_data: List[Dict[str, Any]],
        periods: List[str],
        bulk_store_func: Callable,
        batch_size: int = 500,
        progress_callback: Callable = None,
        period_ranges: Optional[Dict[str, Tuple[str, str]]] = None
    ) -> Dict[str, int]:
        """
        并行处理多个周期的数据
        
        Args:
            daily_data: 日线数据
            periods: 要处理的周期列表
            bulk_store_func: 批量存储函数（接受 data, batch_size 参数）
            batch_size: 批量大小
            progress_callback: 进度回调函数
            period_ranges: 各周期的日期范围，用于数据截取 {period: (start_date, end_date)}
            
        Returns:
            处理结果统计
        """
        if not periods:
            return {"inserted_count": 0, "updated_count": 0}
        
        # 定义单个周期的处理函数
        def process_single_period(period: str) -> Dict[str, int]:
            processor = self._processors.get(period)
            if not processor:
                logger.warning(f"未知周期类型: {period}")
                return {"inserted_count": 0, "updated_count": 0}
            
            # 获取该周期的日期范围
            date_range = period_ranges.get(period) if period_ranges else None
            
            # 处理周期
            result = processor(daily_data, bulk_store_func, batch_size, date_range)
            
            logger.debug(f"{period}周期处理完成 | 插入: {result.get('inserted_count', 0)} | 更新: {result.get('updated_count', 0)}")
            return result
        
        # 错误处理函数
        def error_handler(period: str, e: Exception) -> Dict[str, int]:
            logger.error(f"处理{period}周期数据失败: {e}")
            return {"inserted_count": 0, "updated_count": 0}
        
        # 进度回调适配器
        def adapted_progress_callback(result: Dict[str, int], completed: int, total: int):
            if progress_callback:
                # 需要反向查找是哪个 period（从 completed 推断）
                period = periods[completed - 1] if completed <= len(periods) else "unknown"
                progress_callback(period, completed, total)
        
        # 使用项目标准并发工具
        from app.utils.concurrent_utils import process_concurrently
        
        results = process_concurrently(
            items=periods,
            process_func=process_single_period,
            max_workers=min(len(periods), 3),
            error_handler=error_handler,
            progress_callback=adapted_progress_callback if progress_callback else None
        )
        
        # 聚合结果
        total_inserted = sum(r.get("inserted_count", 0) for r in results)
        total_updated = sum(r.get("updated_count", 0) for r in results)
        
        return {
            "inserted_count": total_inserted,
            "updated_count": total_updated
        }
    
    def _process_daily(
        self,
        daily_data: List[Dict[str, Any]],
        bulk_store_func: Callable,
        batch_size: int,
        date_range: Optional[Tuple[str, str]] = None
    ) -> Dict[str, int]:
        """处理日线数据"""
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        # 根据日期范围截取数据
        if date_range:
            start_date, end_date = date_range
            filtered_data = [
                item for item in daily_data 
                if start_date <= item.get('trade_date', '') <= end_date
            ]
            if len(filtered_data) < len(daily_data):
                logger.debug(f"日线数据截取 | {len(daily_data)} -> {len(filtered_data)} | 范围: {start_date}..{end_date}")
            daily_data = filtered_data
        
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        enriched = [dict(item, period="daily") for item in daily_data]
        result = bulk_store_func(enriched, batch_size)
        return result
    
    def _process_weekly(
        self,
        daily_data: List[Dict[str, Any]],
        bulk_store_func: Callable,
        batch_size: int,
        date_range: Optional[Tuple[str, str]] = None
    ) -> Dict[str, int]:
        """处理周线数据"""
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        # 根据日期范围截取日线数据（用于周线计算）
        if date_range:
            start_date, end_date = date_range
            filtered_data = [
                item for item in daily_data 
                if start_date <= item.get('trade_date', '') <= end_date
            ]
            if len(filtered_data) < len(daily_data):
                logger.debug(f"周线源数据截取 | {len(daily_data)} -> {len(filtered_data)} | 范围: {start_date}..{end_date}")
            daily_data = filtered_data
        
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        from app.services.core.period_calculator import PeriodCalculator
        weekly_data = PeriodCalculator.calculate_weekly_from_daily(daily_data)
        
        if not weekly_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        enriched = [dict(item, period="weekly") for item in weekly_data]
        result = bulk_store_func(enriched, batch_size)
        return result
    
    def _process_monthly(
        self,
        daily_data: List[Dict[str, Any]],
        bulk_store_func: Callable,
        batch_size: int,
        date_range: Optional[Tuple[str, str]] = None
    ) -> Dict[str, int]:
        """处理月线数据"""
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        # 根据日期范围截取日线数据（用于月线计算）
        if date_range:
            start_date, end_date = date_range
            filtered_data = [
                item for item in daily_data 
                if start_date <= item.get('trade_date', '') <= end_date
            ]
            if len(filtered_data) < len(daily_data):
                logger.debug(f"月线源数据截取 | {len(daily_data)} -> {len(filtered_data)} | 范围: {start_date}..{end_date}")
            daily_data = filtered_data
        
        if not daily_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        from app.services.core.period_calculator import PeriodCalculator
        monthly_data = PeriodCalculator.calculate_monthly_from_daily(daily_data)
        
        if not monthly_data:
            return {"inserted_count": 0, "updated_count": 0}
        
        enriched = [dict(item, period="monthly") for item in monthly_data]
        result = bulk_store_func(enriched, batch_size)
        return result
