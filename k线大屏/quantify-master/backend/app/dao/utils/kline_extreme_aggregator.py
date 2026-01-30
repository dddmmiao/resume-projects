"""
K线区间极端值查询优化工具类 (KlineExtremeAggregator)

利用周线和月线数据的high/low字段减少日线查询量，提升大跨度日期区间的极端值查询性能。

优化策略：
1. 识别区间内的完整月份，用月线数据的high/low
2. 残余部分识别完整周，用周线数据的high/low
3. 最后残余用日线的high/low
4. 合并取整体的max(high)和min(low)

用法示例：
    from .utils.kline_extreme_aggregator import KlineExtremeAggregator
    
    extremes = KlineExtremeAggregator.query_extremes(
        db_session_factory, kline_model, ts_codes_subq, start_date, end_date
    )
    # 返回: {ts_code: {"high": 最高价, "low": 最低价}}
"""
from datetime import date
from typing import Dict, Optional, Tuple
from loguru import logger
from sqlmodel import select
from sqlalchemy import func

from .kline_aggregator import KlineAggregator


class KlineExtremeAggregator:
    """K线区间极端值查询优化器
    
    复用KlineAggregator的日期分析逻辑，查询区间内的最高价和最低价。
    """
    
    @classmethod
    def query_extremes(
        cls,
        db_session_factory,
        kline_model,
        ts_codes_subq,
        start_date: date,
        end_date: date,
        use_weekly: bool = True,
        use_monthly: bool = True,
    ) -> Dict[str, Dict[str, float]]:
        """查询K线区间极端值（优化版本）
        
        Args:
            db_session_factory: 数据库会话工厂函数
            kline_model: K线表模型
            ts_codes_subq: ts_code IN (...) 子查询
            start_date: 开始日期
            end_date: 结束日期
            use_weekly: 是否使用周线优化
            use_monthly: 是否使用月线优化
            
        Returns:
            {ts_code: {"high": 最高价, "low": 最低价}} 字典
        """
        # 初始化结果：{ts_code: {"high": float, "low": float}}
        extremes: Dict[str, Dict[str, float]] = {}
        
        def merge_extremes(new_data: Dict[str, Tuple[float, float]]):
            """合并极端值数据"""
            for ts_code, (high, low) in new_data.items():
                if ts_code not in extremes:
                    extremes[ts_code] = {"high": high, "low": low}
                else:
                    if high > extremes[ts_code]["high"]:
                        extremes[ts_code]["high"] = high
                    if low < extremes[ts_code]["low"]:
                        extremes[ts_code]["low"] = low
        
        if use_monthly:
            # 月线优化
            head_range, complete_months, tail_range = KlineAggregator.analyze_date_range_for_months(start_date, end_date)
            
            with db_session_factory() as db:
                # 1. 头部残余
                if head_range[0] and head_range[1]:
                    if use_weekly:
                        head_vals = cls._query_with_weekly_optimization(
                            db, kline_model, ts_codes_subq, head_range[0], head_range[1]
                        )
                    else:
                        head_vals = cls._query_daily(
                            db, kline_model, ts_codes_subq, head_range[0], head_range[1]
                        )
                    merge_extremes(head_vals)
                
                # 2. 完整月份用月线
                if complete_months:
                    month_dates = KlineAggregator.get_month_end_dates(complete_months)
                    monthly_vals = cls._query_period(
                        db, kline_model, ts_codes_subq, month_dates, 'monthly'
                    )
                    merge_extremes(monthly_vals)
                
                # 3. 尾部残余
                if tail_range[0] and tail_range[1]:
                    if use_weekly:
                        tail_vals = cls._query_with_weekly_optimization(
                            db, kline_model, ts_codes_subq, tail_range[0], tail_range[1]
                        )
                    else:
                        tail_vals = cls._query_daily(
                            db, kline_model, ts_codes_subq, tail_range[0], tail_range[1]
                        )
                    merge_extremes(tail_vals)
        
        elif use_weekly:
            # 仅周线优化
            with db_session_factory() as db:
                weekly_vals = cls._query_with_weekly_optimization(
                    db, kline_model, ts_codes_subq, start_date, end_date
                )
                merge_extremes(weekly_vals)
        else:
            # 无优化，直接日线查询
            with db_session_factory() as db:
                daily_vals = cls._query_daily(
                    db, kline_model, ts_codes_subq, start_date, end_date
                )
                merge_extremes(daily_vals)
        
        return extremes
    
    @classmethod
    def _query_with_weekly_optimization(
        cls,
        db,
        kline_model,
        ts_codes_subq,
        start_date: date,
        end_date: date,
    ) -> Dict[str, Tuple[float, float]]:
        """使用周线优化查询极端值"""
        results: Dict[str, Tuple[float, float]] = {}
        
        head_range, complete_fridays, tail_range = KlineAggregator.analyze_date_range_for_weeks(start_date, end_date)
        
        def merge_results(new_data: Dict[str, Tuple[float, float]]):
            for ts_code, (high, low) in new_data.items():
                if ts_code not in results:
                    results[ts_code] = (high, low)
                else:
                    cur_high, cur_low = results[ts_code]
                    results[ts_code] = (max(cur_high, high), min(cur_low, low))
        
        # 头部残余用日线
        if head_range[0] and head_range[1]:
            head_vals = cls._query_daily(db, kline_model, ts_codes_subq, head_range[0], head_range[1])
            merge_results(head_vals)
        
        # 完整周用周线
        if complete_fridays:
            weekly_vals = cls._query_period(db, kline_model, ts_codes_subq, complete_fridays, 'weekly')
            merge_results(weekly_vals)
        
        # 尾部残余用日线
        if tail_range[0] and tail_range[1]:
            tail_vals = cls._query_daily(db, kline_model, ts_codes_subq, tail_range[0], tail_range[1])
            merge_results(tail_vals)
        
        return results
    
    @staticmethod
    def _query_daily(db, kline_model, ts_codes_subq, start_date: date, end_date: date) -> Dict[str, Tuple[float, float]]:
        """查询日线极端值"""
        query = select(
            kline_model.ts_code,
            func.max(kline_model.high).label("max_high"),
            func.min(kline_model.low).label("min_low"),
        ).where(
            kline_model.ts_code.in_(ts_codes_subq),
            kline_model.period == 'daily',
            kline_model.trade_date >= start_date,
            kline_model.trade_date <= end_date
        ).group_by(kline_model.ts_code)
        
        return {
            r.ts_code: (float(r.max_high) if r.max_high else 0.0, float(r.min_low) if r.min_low else 0.0)
            for r in db.exec(query).all()
        }
    
    @staticmethod
    def _query_period(db, kline_model, ts_codes_subq, trade_dates, period: str) -> Dict[str, Tuple[float, float]]:
        """查询指定周期（周线/月线）极端值"""
        if not trade_dates:
            return {}
        
        query = select(
            kline_model.ts_code,
            func.max(kline_model.high).label("max_high"),
            func.min(kline_model.low).label("min_low"),
        ).where(
            kline_model.ts_code.in_(ts_codes_subq),
            kline_model.period == period,
            kline_model.trade_date.in_(trade_dates)
        ).group_by(kline_model.ts_code)
        
        return {
            r.ts_code: (float(r.max_high) if r.max_high else 0.0, float(r.min_low) if r.min_low else 0.0)
            for r in db.exec(query).all()
        }
