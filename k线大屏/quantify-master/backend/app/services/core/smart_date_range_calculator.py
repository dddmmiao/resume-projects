"""
智能日期范围计算器
根据现有K线数据智能计算需要获取的日线数据范围
"""

from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional

from loguru import logger


class SmartDateRangeCalculator:
    """智能日期范围计算器"""
    
    @staticmethod
    def _calculate_period_start_date(latest_dt: datetime, period: str) -> datetime:
        """
        根据周期类型和最新日期计算起始日期
        
        Args:
            latest_dt: 最新日期（datetime对象）
            period: 周期类型 (daily/weekly/monthly)
            
        Returns:
            起始日期
        """
        if period == "daily":
            # 日线增量：从最新一根K线所在日期开始fetch，确保可覆盖由竞价初始化的新K线
            return latest_dt
        elif period == "weekly":
            return latest_dt - timedelta(days=latest_dt.weekday())
        elif period == "monthly":
            return latest_dt.replace(day=1)
        return latest_dt
    
    @staticmethod
    def calculate_period_ranges_for_codes(
            ts_codes: List[str],
            periods: List[str],
            entity_type: str,
            force_sync: bool = False
    ) -> Dict[str, Dict[str, Optional[Tuple[str, str]]]]:
        """
        计算每个代码在各个周期的日期范围，以及用于fetch的最大区间
        
        该方法返回每个周期的具体范围，用于数据处理时的精确截取，
        同时返回overall最大区间，用于fetch数据前获取完整数据范围。
        
        Args:
            ts_codes: 代码列表
            periods: 周期类型列表（如 ['daily', 'weekly', 'monthly']）
            entity_type: 实体类型 (stock/bond/concept/industry)
            force_sync: 是否强制同步
            
        Returns:
            {
                code: {
                    'daily': (start_date, end_date),     # 日线需要的范围
                    'weekly': (start_date, end_date),    # 周线需要的范围
                    'monthly': (start_date, end_date),   # 月线需要的范围
                    'overall': (earliest_start, latest_end)  # 用于fetch的最大区间
                }
            }
            如果某周期没有数据，使用默认范围
        """
        if not ts_codes:
            return {}
        
        # 🚀 架构优化：使用统一的同步策略配置（service层），避免直接依赖DAO细节
        from ..management.sync_strategy_config import SyncStrategyConfig

        # SyncStrategyConfig.get_default_query_date_range 已将 end_date 对齐到最新交易日
        default_range = SyncStrategyConfig.get_default_query_date_range()
        latest_trading_day_str = default_range[1]
        
        try:
            # 将 entity_type 转换为 table_type
            from ...constants.table_types import TableTypes
            
            table_type = TableTypes.entity_type_to_table_type(entity_type)
            if not table_type:
                logger.error(f"无法映射 entity_type {entity_type} 到 table_type，使用默认范围")
                # 出错时，所有代码和周期使用默认范围
                return {
                    code: {**{period: default_range for period in periods}, 'overall': default_range}
                    for code in ts_codes
                }
            
            from app.services.data.kline_query_service import kline_query_service
            
            # 一次性SQL查询获取所有代码和所有周期的最新日期
            code_period_dates = kline_query_service.get_latest_kline_dates_by_code_and_period(
                codes=ts_codes, periods=periods, table_type=table_type
            )
            
            # 调试日志：检查查询结果
            codes_with_data = len([c for c in ts_codes if code_period_dates.get(c)])
            codes_without_data = len(ts_codes) - codes_with_data
            logger.debug(
                f"查询最新日期结果 - 总代码数: {len(ts_codes)}, "
                f"有数据: {codes_with_data}, 无数据: {codes_without_data}"
            )
            
            # 预先解析默认范围，避免重复计算
            default_start_dt = datetime.strptime(default_range[0], "%Y%m%d")
            
            result = {}
            
            for code in ts_codes:
                code_latest_dates = code_period_dates.get(code, {})
                
                # 如果所有周期都没有数据：
                # 无论增量还是全量，新标的都使用默认范围，确保新上市的标的能够同步数据
                if not code_latest_dates:
                    logger.debug(
                        f"{code} 所有周期都没有数据（新标的），使用默认范围: {default_range[0]}..{default_range[1]}"
                    )
                    result[code] = {**{period: default_range for period in periods}, 'overall': default_range}
                    continue
                
                period_ranges = {}
                latest_daily_for_code: Optional[str] = None
                overall_start_dt = None
                
                # 解析最新交易日（提前计算，避免重复）
                latest_trading_day_dt = datetime.strptime(latest_trading_day_str, "%Y%m%d")
                
                for period in periods:
                    latest_date_str = code_latest_dates.get(period)
                    
                    if not latest_date_str:
                        # 该周期没有数据，使用默认范围（全量/增量行为一致）
                        logger.debug(
                            f"{code} {period}周期没有数据，使用默认范围: {default_range[0]}..{default_range[1]}"
                        )
                        period_ranges[period] = default_range
                        overall_start_dt = min(overall_start_dt or default_start_dt, default_start_dt)
                        continue
                    
                    # 解析最新日期
                    code_latest_dt = datetime.strptime(latest_date_str, "%Y-%m-%d")
                    if period == "daily":
                        # 记录真实的最新日线日期（YYYYMMDD），供调用方区分新旧记录
                        latest_daily_for_code = code_latest_dt.strftime("%Y%m%d")

                    # 全量同步：始终使用默认范围作为fetch区间，但仍返回 _latest_daily 元数据
                    if force_sync:
                        period_ranges[period] = default_range
                        overall_start_dt = min(overall_start_dt or default_start_dt, default_start_dt)
                        continue

                    # 增量同步：根据最新日期计算起始日期
                    start_dt = SmartDateRangeCalculator._calculate_period_start_date(code_latest_dt, period)
                    
                    # 检查：如果start > 最新交易日，说明该周期数据已是最新，不需要同步
                    if start_dt > latest_trading_day_dt:
                        logger.debug(
                            f"{code} {period}周期数据已是最新（最新日期: {latest_date_str}, "
                            f"计算起始: {start_dt.strftime('%Y%m%d')}, 最新交易日: {latest_trading_day_str}），跳过同步"
                        )
                        period_ranges[period] = None
                        continue
                    
                    # 设置该周期的范围（增量）
                    period_range = (start_dt.strftime("%Y%m%d"), latest_trading_day_str)
                    period_ranges[period] = period_range
                    logger.debug(
                        f"{code} {period}周期范围: {period_range[0]}..{period_range[1]} "
                        f"（数据库最新日期: {latest_date_str}, 计算起始: {start_dt.strftime('%Y%m%d')}）"
                    )
                    
                    # 更新overall最大区间的起始日期
                    overall_start_dt = min(overall_start_dt or start_dt, start_dt)
                
                # 设置overall范围（结束日期都是最新交易日）
                # 如果overall_start_dt为None，说明所有周期都不需要同步
                if overall_start_dt:
                    overall_range = (
                        overall_start_dt.strftime("%Y%m%d"),
                        latest_trading_day_str
                    )
                    period_ranges['overall'] = overall_range
                    logger.debug(
                        f"{code} overall范围: {overall_range[0]}..{overall_range[1]}"
                    )
                else:
                    period_ranges['overall'] = None
                    logger.debug(f"{code} 所有周期都已是最新，无需同步")

                # 附带返回真实的最新日线日期，供需要的调用方使用
                if latest_daily_for_code:
                    period_ranges['_latest_daily'] = latest_daily_for_code
                
                result[code] = period_ranges
            
            logger.info(
                f"批量计算各周期日期范围 - "
                f"总代码数: {len(ts_codes)}, "
                f"周期数: {len(periods)}"
            )
            
            return result
            
        except Exception as e:
            logger.warning(f"批量计算各周期日期范围失败，使用默认范围: {e}")
            # 出错时，所有代码和周期使用默认范围
            return {
                code: {**{period: default_range for period in periods}, 'overall': default_range}
                for code in ts_codes
            }
    
