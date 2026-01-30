"""
K线累计指标查询优化工具类 (KlineAggregator)

利用周线和月线数据减少日线查询量，提升大跨度日期区间的累计指标汇总性能。

优化策略：
1. 识别区间内的完整月份，用月线数据（每月最后一天）
2. 残余部分识别完整周，用周线数据（每周五）
3. 最后残余用日线汇总

支持的累计指标：
- amount: 成交额
- vol: 成交量
- 其他可求和的指标

用法示例：
    from .utils.kline_aggregator import KlineAggregator
    
    amounts = KlineAggregator.query_cumulative(
        db_session_factory, kline_model, ts_codes_subq, start_date, end_date,
        field='amount'
    )
"""
from datetime import date, timedelta
from calendar import monthrange
from typing import List, Tuple, Dict, Optional, Any
from loguru import logger
from sqlmodel import select
from sqlalchemy import func


class KlineAggregator:
    """K线累计指标查询优化器
    
    通用工具类，支持查询任意可求和的K线指标的累计值。
    """
    
    @staticmethod
    def analyze_date_range_for_months(start_date: date, end_date: date) -> Tuple[
        Tuple[Optional[date], Optional[date]],  # 头部残余(start, end)
        List[Tuple[int, int]],                   # 完整月份[(year, month), ...]
        Tuple[Optional[date], Optional[date]]   # 尾部残余(start, end)
    ]:
        """分析日期区间，识别完整月份
        
        Returns:
            (head_range, complete_months, tail_range)
        """
        complete_months = []
        head_start, head_end = None, None
        tail_start, tail_end = None, None
        
        if start_date > end_date:
            return (None, None), [], (None, None)
        
        # 检查起始日期是否是月初
        if start_date.day == 1:
            current_month_start = start_date
        else:
            # 有头部残余：从start_date到当月最后一天
            last_day = monthrange(start_date.year, start_date.month)[1]
            head_start = start_date
            head_end = date(start_date.year, start_date.month, last_day)
            if head_end > end_date:
                head_end = end_date
                return (head_start, head_end), [], (None, None)
            # 下个月开始
            if start_date.month == 12:
                current_month_start = date(start_date.year + 1, 1, 1)
            else:
                current_month_start = date(start_date.year, start_date.month + 1, 1)
        
        # 遍历完整月份
        while current_month_start <= end_date:
            last_day = monthrange(current_month_start.year, current_month_start.month)[1]
            month_end = date(current_month_start.year, current_month_start.month, last_day)
            
            if month_end <= end_date:
                complete_months.append((current_month_start.year, current_month_start.month))
                if current_month_start.month == 12:
                    current_month_start = date(current_month_start.year + 1, 1, 1)
                else:
                    current_month_start = date(current_month_start.year, current_month_start.month + 1, 1)
            else:
                tail_start = current_month_start
                tail_end = end_date
                break
        
        return (head_start, head_end), complete_months, (tail_start, tail_end)
    
    @staticmethod
    def analyze_date_range_for_weeks(start_date: date, end_date: date) -> Tuple[
        Tuple[Optional[date], Optional[date]],  # 头部残余(start, end)
        List[date],                              # 完整周的周五日期列表
        Tuple[Optional[date], Optional[date]]   # 尾部残余(start, end)
    ]:
        """分析日期区间，识别完整周（周一到周五）
        
        周线trade_date是每周五。完整周定义：区间包含周一到周五。
        
        Returns:
            (head_range, complete_week_fridays, tail_range)
        """
        complete_fridays = []
        head_start, head_end = None, None
        tail_start, tail_end = None, None
        
        if start_date > end_date:
            return (None, None), [], (None, None)
        
        # 找到区间内第一个周一
        start_weekday = start_date.weekday()  # 0=周一, 4=周五
        if start_weekday == 0:
            first_monday = start_date
        else:
            # 需要跳到下一个周一
            days_to_monday = 7 - start_weekday
            first_monday = start_date + timedelta(days=days_to_monday)
            # 头部残余：start_date 到 first_monday前一天
            if first_monday > end_date:
                return (start_date, end_date), [], (None, None)
            head_start = start_date
            head_end = first_monday - timedelta(days=1)
        
        # 遍历完整周
        current_monday = first_monday
        while current_monday <= end_date:
            # 该周的周五
            friday = current_monday + timedelta(days=4)
            if friday <= end_date:
                complete_fridays.append(friday)
                current_monday = current_monday + timedelta(days=7)
            else:
                # 尾部残余
                tail_start = current_monday
                tail_end = end_date
                break
        
        return (head_start, head_end), complete_fridays, (tail_start, tail_end)
    
    @staticmethod
    def get_month_end_dates(months: List[Tuple[int, int]]) -> List[date]:
        """获取月份列表对应的月末日期（用于匹配月线trade_date）"""
        return [date(y, m, monthrange(y, m)[1]) for y, m in months]
    
    @classmethod
    def query_cumulative(
        cls,
        db_session_factory,
        kline_model,
        ts_codes_subq,
        start_date: date,
        end_date: date,
        field: str = 'amount',
        use_weekly: bool = True,
        use_monthly: bool = True,
    ) -> Dict[str, float]:
        """查询K线累计指标（优化版本）
        
        Args:
            db_session_factory: 数据库会话工厂函数
            kline_model: K线表模型
            ts_codes_subq: ts_code IN (...) 子查询
            start_date: 开始日期
            end_date: 结束日期
            field: 要累计的字段名（默认'amount'，也可以是'vol'等）
            use_weekly: 是否使用周线优化
            use_monthly: 是否使用月线优化
            
        Returns:
            {ts_code: 累计值} 字典
        """
        totals: Dict[str, float] = {}
        
        if use_monthly:
            # 月线优化
            head_range, complete_months, tail_range = cls.analyze_date_range_for_months(start_date, end_date)
            
            with db_session_factory() as db:
                # 1. 头部残余
                if head_range[0] and head_range[1]:
                    if use_weekly:
                        head_vals = cls._query_with_weekly_optimization(
                            db, kline_model, ts_codes_subq, head_range[0], head_range[1], field
                        )
                    else:
                        head_vals = cls._query_daily(
                            db, kline_model, ts_codes_subq, head_range[0], head_range[1], field
                        )
                    for code, val in head_vals.items():
                        totals[code] = totals.get(code, 0.0) + val
                
                # 2. 完整月份用月线
                if complete_months:
                    month_dates = cls.get_month_end_dates(complete_months)
                    monthly_vals = cls._query_period(
                        db, kline_model, ts_codes_subq, month_dates, 'monthly', field
                    )
                    for code, val in monthly_vals.items():
                        totals[code] = totals.get(code, 0.0) + val
                
                # 3. 尾部残余
                if tail_range[0] and tail_range[1]:
                    if use_weekly:
                        tail_vals = cls._query_with_weekly_optimization(
                            db, kline_model, ts_codes_subq, tail_range[0], tail_range[1], field
                        )
                    else:
                        tail_vals = cls._query_daily(
                            db, kline_model, ts_codes_subq, tail_range[0], tail_range[1], field
                        )
                    for code, val in tail_vals.items():
                        totals[code] = totals.get(code, 0.0) + val
        
        elif use_weekly:
            # 仅周线优化
            with db_session_factory() as db:
                totals = cls._query_with_weekly_optimization(
                    db, kline_model, ts_codes_subq, start_date, end_date, field
                )
        else:
            # 无优化，直接日线查询
            with db_session_factory() as db:
                totals = cls._query_daily(
                    db, kline_model, ts_codes_subq, start_date, end_date, field
                )
        
        return totals
    
    @classmethod
    def _query_with_weekly_optimization(
        cls,
        db,
        kline_model,
        ts_codes_subq,
        start_date: date,
        end_date: date,
        field: str = 'amount',
    ) -> Dict[str, float]:
        """使用周线优化查询累计指标"""
        totals: Dict[str, float] = {}
        
        head_range, complete_fridays, tail_range = cls.analyze_date_range_for_weeks(start_date, end_date)
        
        # 头部残余用日线
        if head_range[0] and head_range[1]:
            head_vals = cls._query_daily(db, kline_model, ts_codes_subq, head_range[0], head_range[1], field)
            for code, val in head_vals.items():
                totals[code] = totals.get(code, 0.0) + val
        
        # 完整周用周线
        if complete_fridays:
            weekly_vals = cls._query_period(db, kline_model, ts_codes_subq, complete_fridays, 'weekly', field)
            for code, val in weekly_vals.items():
                totals[code] = totals.get(code, 0.0) + val
        
        # 尾部残余用日线
        if tail_range[0] and tail_range[1]:
            tail_vals = cls._query_daily(db, kline_model, ts_codes_subq, tail_range[0], tail_range[1], field)
            for code, val in tail_vals.items():
                totals[code] = totals.get(code, 0.0) + val
        
        return totals
    
    @staticmethod
    def _query_daily(db, kline_model, ts_codes_subq, start_date: date, end_date: date, field: str = 'amount') -> Dict[str, float]:
        """查询日线累计指标"""
        field_attr = getattr(kline_model, field)
        query = select(
            kline_model.ts_code,
            func.sum(field_attr).label("field_sum"),
        ).where(
            kline_model.ts_code.in_(ts_codes_subq),
            kline_model.period == 'daily',
            kline_model.trade_date >= start_date,
            kline_model.trade_date <= end_date
        ).group_by(kline_model.ts_code)
        
        return {r.ts_code: float(r.field_sum) if r.field_sum else 0.0 for r in db.exec(query).all()}
    
    @staticmethod
    def _query_period(db, kline_model, ts_codes_subq, trade_dates: List[date], period: str, field: str = 'amount') -> Dict[str, float]:
        """查询指定周期（周线/月线）累计指标"""
        if not trade_dates:
            return {}
        
        field_attr = getattr(kline_model, field)
        query = select(
            kline_model.ts_code,
            func.sum(field_attr).label("field_sum"),
        ).where(
            kline_model.ts_code.in_(ts_codes_subq),
            kline_model.period == period,
            kline_model.trade_date.in_(trade_dates)
        ).group_by(kline_model.ts_code)
        
        return {r.ts_code: float(r.field_sum) if r.field_sum else 0.0 for r in db.exec(query).all()}


# 便捷函数
def query_optimized_cumulative(
    db_session_factory,
    kline_model,
    ts_codes_subq,
    start_date: date,
    end_date: date,
    field: str = 'amount',
) -> Dict[str, float]:
    """查询优化的K线累计指标（便捷函数）"""
    return KlineAggregator.query_cumulative(
        db_session_factory,
        kline_model,
        ts_codes_subq,
        start_date,
        end_date,
        field=field,
        use_weekly=True,
        use_monthly=True,
    )


