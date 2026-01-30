"""
交易日历数据访问层 (DAO) - SQLModel优化版本
负责交易日历数据的数据库操作，提供高性能的查询和批量操作
"""
from typing import List, Dict, Any, Optional

from loguru import logger
from sqlmodel import select, and_, desc

from app.models import db_session_context
from .dao_config import DAOConfig
from .utils.batch_operations import batch_operations
from ..models import TradeCalendar


class TradeCalendarDAO:
    """交易日历数据访问对象"""

    @staticmethod
    def bulk_upsert_trade_calendar_data(
            data: List[Dict[str, Any]],
            batch_size: Optional[int] = None
    ) -> Dict[str, int]:
        """
        批量插入或更新交易日历数据（单表 upsert）。
        """
        from ..utils.date_utils import date_utils
        # 归一化字段：cal_date -> trade_date（YYYYMMDD -> date）
        normalized: List[Dict[str, Any]] = []
        for item in data or []:
            row = dict(item)
            if 'trade_date' not in row and 'cal_date' in row:
                row['trade_date'] = row.pop('cal_date')
            # 解析日期
            if isinstance(row.get('trade_date'), str):
                dt = date_utils.parse_date(row['trade_date'])
                row['trade_date'] = dt.date() if dt else None
            normalized.append(row)
        # 执行 upsert（唯一键：exchange + trade_date）
        # 使用 MySQL 生成式 upsert 提升批量写入效率
        # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
        stats = batch_operations.bulk_upsert_mysql_generated(
            table_model=TradeCalendar,
            data=normalized,
            batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
        )
        return DAOConfig.format_upsert_result(stats)

    @staticmethod
    def get_trading_days_in_range(
            start_date: str,
            end_date: str,
            exchange: Optional[str] = None,
            include_holidays: bool = False
    ) -> List[Dict[str, Any]]:
        """
        获取指定日期范围内的交易日
        
        Args:
            start_date: 开始日期 (YYYYMMDD格式)
            end_date: 结束日期 (YYYYMMDD格式)
            exchange: 交易所代码
            
        Returns:
            交易日列表
        """
        from datetime import datetime

        try:
            # 🚀 SQLModel优化：使用上下文管理器和select查询
            with db_session_context() as db:
                # 将字符串日期转换为date对象
                start_date_obj = datetime.strptime(start_date, "%Y%m%d").date()
                end_date_obj = datetime.strptime(end_date, "%Y%m%d").date()

                stmt = select(TradeCalendar).where(
                    and_(
                        TradeCalendar.trade_date >= start_date_obj,
                        TradeCalendar.trade_date <= end_date_obj,
                    )
                )

                if not include_holidays:
                    stmt = stmt.where(TradeCalendar.is_open == True)

                if exchange:
                    stmt = stmt.where(TradeCalendar.exchange == exchange)

                result = db.exec(stmt.order_by(TradeCalendar.trade_date)).all()

                # 🔧 修复：返回字典格式数据，匹配Service层期望
                trade_records = []
                for cal in result:
                    if cal and cal.trade_date:
                        trade_records.append({
                            "trade_date": cal.trade_date.strftime("%Y-%m-%d"),  # 使用标准日期格式
                            "is_open": cal.is_open,
                            "exchange": cal.exchange
                        })

                logger.info(
                    f"获取交易日: {start_date}-{end_date}, "
                    f"交易所: {exchange or '全部'}, 数量: {len(trade_records)}"
                )
                return trade_records

        except Exception as e:
            logger.error(
                f"获取交易日失败: {start_date}-{end_date}, "
                f"交易所: {exchange}, 错误: {e}"
            )
            return []

    @staticmethod
    def get_previous_trading_day(
        trade_date: str = None,
        exchange: str = "SSE"
    ) -> Optional[str]:
        """
        获取上一个交易日
        Args:
            trade_date: 目标日期 (YYYYMMDD格式)，默认为None
            exchange: 交易所代码，默认为SSE
        Returns:
            上一个交易日 (YYYYMMDD格式) 或None
        """
        from datetime import date as _date, datetime
        
        try:
            # 🚀 SQLModel优化：使用上下文管理器和select查询
            with db_session_context() as db:
                if trade_date:
                    target_date_str = trade_date
                    target_date = datetime.strptime(target_date_str, "%Y%m%d").date()
                else:
                    # 使用今天日期
                    target_date = _date.today()
                    target_date_str = target_date.strftime("%Y%m%d")

                logger.debug(f"查找目标日期 {target_date_str} 的上一个交易日")

                # 查询目标日期之前的最近交易日
                stmt = select(TradeCalendar).where(
                    and_(
                        TradeCalendar.is_open == True,
                        TradeCalendar.trade_date < target_date  # 小于目标日期
                    )
                ).order_by(desc(TradeCalendar.trade_date))
                
                result = db.exec(stmt).first()

                if result:
                    prev_trade_date = result.trade_date.strftime("%Y%m%d")
                    logger.debug(f"找到上一个交易日: {prev_trade_date}")
                    return prev_trade_date
                else:
                    logger.warning(f"未找到 {target_date_str} 之前的交易日")
                    return None
                    
        except Exception as e:
            logger.error(f"获取上一交易日失败: {e}")
            return None

    @staticmethod
    def get_latest_trading_day(
        exchange: str = "SSE"
    ) -> Optional[str]:
        """
        获取最新交易日（如果今天是交易日则返回今天，否则返回上一个交易日）
        
        Args:
            exchange: 交易所代码，默认为SSE
            
        Returns:
            最新交易日 (YYYYMMDD格式) 或None
        """
        from datetime import date as _date
        
        try:
            # 🚀 优化：使用上下文管理器和select查询
            with db_session_context() as db:
                _today = _date.today()
                today_str = _today.strftime("%Y%m%d")
                
                # 先检查今天是否是交易日
                stmt = select(TradeCalendar).where(
                    and_(
                        TradeCalendar.exchange == exchange,
                        TradeCalendar.trade_date == _today,
                        TradeCalendar.is_open == True
                    )
                )
                today_record = db.exec(stmt).first()
                
                if today_record:
                    logger.debug(f"今天({today_str})是交易日，返回: {today_str}")
                    return today_str
                
                # 🚀 优化：如果今天不是交易日，复用已有方法逻辑
                logger.debug(f"今天({today_str})不是交易日，查找上一个交易日")
                
                # 查找上一个交易日（不包括今天）
                stmt = select(TradeCalendar).where(
                    and_(
                        TradeCalendar.exchange == exchange,
                        TradeCalendar.trade_date < _today,
                        TradeCalendar.is_open == True
                    )
                ).order_by(desc(TradeCalendar.trade_date))
                
                prev_record = db.exec(stmt).first()
                
                if prev_record:
                    result = prev_record.trade_date.strftime("%Y%m%d")
                    logger.debug(f"找到上一个交易日: {result}")
                    return result
                else:
                    logger.warning(f"未找到最新交易日记录: exchange={exchange}")
                    return None
                    
        except Exception as e:
            logger.error(f"查询最新交易日失败: {e}")
            return None

    @staticmethod
    def get_next_trading_day(
        from_date: str = None,
        exchange: str = "SSE"
    ) -> Optional[str]:
        """
        获取下一个交易日（从指定日期起，不包括当天）
        
        Args:
            from_date: 起始日期(YYYYMMDD格式)，默认为今天
            exchange: 交易所代码，默认为SSE
            
        Returns:
            下一个交易日 (YYYYMMDD格式) 或None
        """
        from datetime import datetime, date as _date
        
        try:
            with db_session_context() as db:
                if from_date:
                    base_date = datetime.strptime(from_date, "%Y%m%d").date()
                else:
                    base_date = _date.today()
                
                # 查找下一个交易日（不包括当天）
                stmt = select(TradeCalendar).where(
                    and_(
                        TradeCalendar.exchange == exchange,
                        TradeCalendar.trade_date > base_date,
                        TradeCalendar.is_open == True
                    )
                ).order_by(TradeCalendar.trade_date).limit(1)
                
                record = db.exec(stmt).first()
                
                if record:
                    result = record.trade_date.strftime("%Y%m%d")
                    logger.debug(f"找到下一个交易日: {result} (from {from_date or 'today'})")
                    return result
                else:
                    logger.warning(f"未找到下一个交易日: from_date={from_date}, exchange={exchange}")
                    return None
                    
        except Exception as e:
            logger.error(f"获取下一交易日失败: {e}")
            return None

    @staticmethod
    def is_trading_day(date_str: str, exchange: str = "SSE") -> bool:
        """
        判断指定日期是否为交易日
        
        Args:
            date_str: 日期字符串(YYYYMMDD格式)
            exchange: 交易所代码
            
        Returns:
            是否为交易日
        """
        from datetime import datetime
        # 延迟导入避免循环导入
        from sqlmodel import select, and_
        from app.models import db_session_context
        from app.models import TradeCalendar as TC
        
        try:
            with db_session_context() as db:
                target_date = datetime.strptime(date_str, "%Y%m%d").date()
                
                stmt = select(TC).where(
                    and_(
                        TC.exchange == exchange,
                        TC.trade_date == target_date,
                        TC.is_open == True
                    )
                )
                result = db.exec(stmt).first()
                is_trading = result is not None
                logger.debug(f"检查交易日 {date_str}: is_trading={is_trading}")
                return is_trading
                
        except Exception as e:
            logger.error(f"检查交易日失败 {date_str}: {e}")
            raise


# 创建全局实例
trade_calendar_dao = TradeCalendarDAO()
