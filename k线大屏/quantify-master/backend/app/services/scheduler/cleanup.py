"""
调度器清理相关工具
"""

from datetime import date
from typing import List


def compute_expired_codes(code_rows, table_type) -> List[str]:
    """
    计算过期的代码列表
    
    Args:
        code_rows: 代码列表
        table_type: 表类型
        
    Returns:
        过期代码列表
    """
    from app.services.data.kline_query_service import kline_query_service
    from app.services.data.trade_calendar_service import trade_calendar_service
    from app.constants.table_types import TableTypes
    from datetime import timedelta

    # 验证表类型
    if not TableTypes.is_valid_table_type(table_type):
        raise ValueError(f"无效的表类型: {table_type}")

    # 计算cutoff日期：30个交易日之前
    today = date.today()
    start = today - timedelta(days=30)
    trading_days = trade_calendar_service.get_trading_days_in_range(
        start_date=start,
        end_date=today,
        exchange="SSE",
        include_holidays=False,
    )
    # 获取cutoff日期（7个交易日之前）
    cutoff_date_dict = trading_days[-7] if len(trading_days) >= 7 else (
        trading_days[0] if trading_days else None)
    
    if not cutoff_date_dict:
        # 没有交易日数据，使用30天前作为cutoff
        cutoff_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
    else:
        # 从字典中提取trade_date字段（格式：YYYY-MM-DD）
        cutoff_date = cutoff_date_dict.get('trade_date', (today - timedelta(days=30)).strftime('%Y-%m-%d'))
    
    # 使用新方法获取所有代码的最新日期
    try:
        date_ranges = kline_query_service.get_latest_kline_dates_by_code_and_period(
            codes=list(code_rows),
            periods=['daily'],
            table_type=table_type
        )
        # 提取 daily 周期的最新日期（date对象）
        last_date_by_code = {
            code: ranges.get('daily')
            for code, ranges in date_ranges.items()
        }
    except Exception:
        last_date_by_code = {}

    expired_codes = []
    for code in code_rows:
        last = last_date_by_code.get(code)
        # last可能是date对象或字符串(YYYY-MM-DD)，cutoff_date是字符串(YYYY-MM-DD)
        # 统一转换为字符串格式进行比较
        if last is None or last < cutoff_date:
            expired_codes.append(code)
    return expired_codes


def cleanup_kline_for_codes(
    years,
    table_type,
    codes,
    start_date: str = None,
    end_date: str = None,
    periods: list = None
):
    """清理指定代码的K线数据（跨年份批量删除）
    
    Args:
        years: 年份列表
        table_type: 表类型
        codes: 代码列表
        start_date: 可选，开始日期 (YYYYMMDD)
        end_date: 可选，结束日期 (YYYYMMDD)
        periods: 可选，周期列表（如 ["daily", "weekly"]）
        
    Returns:
        删除的总记录数
        
    Note:
        这是 Service 层业务编排方法，遍历多年份表执行删除。
        - 不指定日期范围：删除所有数据
        - 指定日期范围：只删除范围内的数据
        - 指定周期：只删除指定周期的数据
    """
    from app.dao.query_utils import delete_kline_by_date_range_from_table
    from app.models.base.table_factory import TableFactory

    total_deleted = 0
    for yr in years:
        tbl = TableFactory.get_table_model(table_type, yr)
        try:
            for code in codes:
                if start_date and end_date:
                    # 有日期范围，使用带过滤的删除方法
                    count = delete_kline_by_date_range_from_table(
                        model_class=tbl,
                        ts_code=code,
                        start_date=start_date,
                        end_date=end_date,
                        periods=periods
                    )
                else:
                    # 无日期范围，删除该代码的所有数据
                    from app.dao.query_utils import delete_records_with_filter
                    conditions = [tbl.ts_code == code]
                    if periods:
                        conditions.append(tbl.period.in_(periods))
                    count = delete_records_with_filter(tbl, *conditions)
                total_deleted += count
        except Exception:
            continue
    
    return total_deleted
