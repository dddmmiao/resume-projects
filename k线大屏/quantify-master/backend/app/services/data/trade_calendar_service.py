"""
交易日历服务
提供交易日历数据的同步、查询和管理功能
"""

from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional

from loguru import logger

from ..external.tushare_service import tushare_service
from ...core.exceptions import DatabaseException
from ...dao.trade_calendar_dao import trade_calendar_dao


class TradeCalendarService:
    """交易日历服务类"""

    def __init__(self):
        self.data_service = tushare_service
        self.exchanges = ["SSE", "SZSE"]  # 支持的交易所

    def sync_trade_calendar(
            self,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> Dict[str, Any]:
        """
        同步交易日历数据
        
        Args:
            start_date: 开始日期 YYYYMMDD，默认同步未来一年
            end_date: 结束日期 YYYYMMDD，默认同步未来一年
            task_id: 任务ID，用于取消检查
            
        Returns:
            包含变更集和统计信息的字典
        """
        try:
            # 设置默认日期范围 - 包含历史数据以便查询上一个交易日
            if not end_date:
                end_date = (datetime.now() + timedelta(days=365)).strftime("%Y%m%d")
            if not start_date:
                # 使用统一策略配置的默认查询范围起点，确保与 SmartDateRangeCalculator 保持一致
                from ..management.sync_strategy_config import SyncStrategyConfig
                default_start, _ = SyncStrategyConfig.get_default_query_date_range()
                start_date = default_start

            logger.info(f"开始同步交易日历: {start_date} 到 {end_date}")

            # 收集所有交易所的数据
            all_items = []
            for exchange in self.exchanges:
                logger.info(f"正在获取交易所 {exchange} 的交易日历数据")
                items = self.data_service.get_trade_cal(
                    exchange=exchange,
                    start_date=start_date,
                    end_date=end_date,
                    task_id=task_id
                )

                if items:
                    all_items.extend(items)
                else:
                    logger.warning(f"交易所 {exchange} 未获取到交易日历数据")

            if not all_items:
                logger.warning("未获取到任何交易日历数据")
                # 使用空的 upsert 结果来生成变更集
                empty_result = {"inserted_count": 0, "updated_count": 0}
                return {
                    "total_count": empty_result["inserted_count"] + empty_result["updated_count"],
                    "created_count": empty_result["inserted_count"]
                }

            # 严格映射：DTO -> 行字典
            from ..external.tushare import mappers as strict_mappers
            rows = strict_mappers.trade_cal_to_upsert_dicts(all_items)

            # 使用DAO进行批量同步（仅接受行字典）
            from ...dao.trade_calendar_dao import trade_calendar_dao
            result = trade_calendar_dao.bulk_upsert_trade_calendar_data(rows)

            logger.success(
                f"交易日历同步完成 - 创建: {result['inserted_count']}条, "
                f"更新: {result['updated_count']}条, 总计: {result['inserted_count'] + result['updated_count']}条"
            )

            return {
                "total_count": result["inserted_count"] + result["updated_count"],
                "created_count": result["inserted_count"]
            }

        except Exception as e:
            from app.core.exceptions import CancellationException
            if isinstance(e, CancellationException):
                logger.info("交易日历同步任务已被取消")
                return {"success": True, "cancelled": True, "message": "交易日历同步任务已被取消"}
            logger.error(f"同步交易日历失败: {str(e)}")
            raise DatabaseException(f"同步交易日历失败: {str(e)}")

    def get_previous_trading_day(self, exchange: str = "SSE") -> Optional[str]:
        """
        获取上一个交易日
        
        Args:
            exchange: 交易所代码
            
        Returns:
            上一个交易日字符串(YYYYMMDD格式)，如果没有找到则返回None
        """
        try:
            # 使用DAO查询上一个交易日；若无，则返回None，避免误用今天
            prev_trading_day_str = trade_calendar_dao.get_previous_trading_day(exchange)
            return prev_trading_day_str

        except Exception as e:
            logger.error(f"查询上一个交易日失败: {e}")
            return None

    
    def get_latest_trading_day(self, exchange: str = "SSE") -> Optional[str]:
        """
        获取最新交易日（如果今天是交易日则返回今天，否则返回上一个交易日）
        
        Args:
            exchange: 交易所代码
            
        Returns:
            最新交易日字符串(YYYYMMDD格式)，如果没有找到则返回None
        """
        try:
            # 使用DAO查询最新交易日
            latest_trading_day_str = trade_calendar_dao.get_latest_trading_day(exchange)
            return latest_trading_day_str

        except Exception as e:
            logger.error(f"查询最新交易日失败: {e}")
            return None

    def is_today_latest_trading_day(self, exchange: str = "SSE") -> bool:
        from datetime import datetime as _dt
        today_str = _dt.now().strftime("%Y%m%d")
        latest_trading_day = self.get_latest_trading_day(exchange)
        if not latest_trading_day:
            return True
        return today_str == latest_trading_day

    def is_trading_day(self, date_str: str, exchange: str = "SSE") -> bool:
        """
        判断指定日期是否为交易日
        
        Args:
            date_str: 日期字符串(YYYYMMDD格式)
            exchange: 交易所代码
            
        Returns:
            是否为交易日
        """
        return trade_calendar_dao.is_trading_day(date_str, exchange)

    def get_next_trading_day(self, from_date: str = None, exchange: str = "SSE") -> Optional[str]:
        """
        获取下一个交易日（从指定日期起，不包括当天）
        
        Args:
            from_date: 起始日期(YYYYMMDD格式)，默认为今天
            exchange: 交易所代码
            
        Returns:
            下一个交易日 (YYYYMMDD格式) 或None
        """
        return trade_calendar_dao.get_next_trading_day(from_date, exchange)

    def get_trading_days_in_range(
            self,
            start_date: date,
            end_date: date,
            exchange: str = "SSE",
            include_holidays: bool = False
    ) -> List[Dict[str, Any]]:
        """
        获取指定日期范围内的交易日列表
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            exchange: 交易所代码
            include_holidays: 是否包含节假日信息
            
        Returns:
            交易日对象列表，每个对象包含 trade_date, is_open, exchange
        """
        try:
            # 使用DAO查询交易日范围
            start_date_str = start_date.strftime("%Y%m%d")
            end_date_str = end_date.strftime("%Y%m%d")

            calendar_records = trade_calendar_dao.get_trading_days_in_range(
                start_date_str, end_date_str, exchange, include_holidays=include_holidays
            )

            # 根据include_holidays参数过滤结果
            if include_holidays:
                return calendar_records  # 返回所有日期（包括非交易日）
            else:
                # 只返回交易日
                return [record for record in calendar_records if record.get("is_open", False)]

        except Exception as e:
            logger.error(f"查询交易日范围失败: {e}")
            return []


# 创建全局实例
trade_calendar_service = TradeCalendarService()
