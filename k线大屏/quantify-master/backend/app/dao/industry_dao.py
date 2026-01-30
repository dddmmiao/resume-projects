"""行业数据访问层 (DAO) - SQLModel优化版本
负责行业板块及相关关联数据的数据库操作，提供高性能的查询和批量操作
"""

from typing import List, Dict, Any, Optional

from loguru import logger
from sqlmodel import select, func, case

from app.constants.table_types import TableTypes
from app.models import db_session_context, TableFactory
from .dao_config import DAOConfig
from .query_utils import query_utils, QueryUtils
from .utils.batch_operations import batch_operations
from ..models import Industry, StockIndustry


class IndustryDAO:
    """行业数据访问层"""

    @staticmethod
    def _apply_filter_conditions(
        subq,
        filters: Optional[Dict[str, Any]],
        search: Optional[str],
        search_fields: Optional[List[str]],
        model,
    ):
        """应用筛选和搜索条件到子查询。"""
        from sqlalchemy import or_
        
        if filters:
            for field_name, value in filters.items():
                if hasattr(model, field_name):
                    field = getattr(model, field_name)
                    if isinstance(value, list):
                        subq = subq.where(field.in_(value))
                    else:
                        subq = subq.where(field == value)
        
        if search and search_fields:
            search_conditions = []
            for field_name in search_fields:
                if hasattr(model, field_name):
                    field = getattr(model, field_name)
                    search_conditions.append(field.like(f"%{search}%"))
            if search_conditions:
                subq = subq.where(or_(*search_conditions))
        
        return subq

    # ==================== 行业板块基础操作 ====================

    @staticmethod
    def bulk_upsert_industry_data(
            data: List[Dict[str, Any]],
            batch_size: Optional[int] = None,
    ) -> Dict[str, int]:
        """
        批量插入或更新行业板块数据
        
        Args:
            data: 要处理的数据列表
            batch_size: 批次大小

        Returns:
            {"inserted_count": int, "updated_count": int}
        """
        # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
        stats = batch_operations.bulk_upsert_mysql_generated(
            table_model=Industry,
            data=data,
            batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
        )
        return DAOConfig.format_upsert_result(stats)

    # ==================== 股票行业关联 ====================

    @staticmethod
    def bulk_upsert_stock_industry_data(
            data: List[Dict[str, Any]],
            batch_size: Optional[int] = None
    ) -> Dict[str, int]:
        """
        批量插入或更新股票行业关联数据
        
        Args:
            data: 要处理的数据列表
            batch_size: 批处理大小
            
        Returns:
            {"inserted_count": int, "updated_count": int, "total_count": int}
        """
        # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
        stats = batch_operations.bulk_upsert_mysql_generated(
            table_model=StockIndustry,
            data=data,
            batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
        )
        return DAOConfig.format_upsert_result(stats)

    @staticmethod
    def load_stock_industries(
            ts_code: str
    ) -> List[str]:
        """
        从数据库加载股票的行业关联（返回行业名称数组）
        
        Args:
            ts_code: 股票代码
            
        Returns:
            行业名称列表
        """
        try:
            # 🚀 SQLModel优化：使用JOIN查询获取行业名称而不是代码
            with db_session_context() as db:
                stmt = select(Industry.industry_name).join(
                    StockIndustry, Industry.industry_code == StockIndustry.industry_code
                ).where(
                    StockIndustry.ts_code == ts_code
                )
                result = db.exec(stmt).all()
                return list(result)
        except Exception as e:
            logger.warning(f"加载股票行业关联失败 ({ts_code}): {e}")
            return []

    @staticmethod
    def get_ts_codes_by_industry_codes(industry_codes: List[str]) -> List[str]:
        """
        根据行业代码集合获取关联的股票 ts_code 列表
        """
        if not industry_codes:
            return []
        try:
            # 🚀 SQLModel优化：使用上下文管理器和select查询
            with db_session_context() as db:
                stmt = select(StockIndustry.ts_code).where(
                    StockIndustry.industry_code.in_(industry_codes)
                ).distinct()
                result = db.exec(stmt).all()
                return list(result)
        except Exception as e:
            logger.warning(f"查询行业关联股票失败: {e}")
            return []

    @staticmethod
    def get_industry_codes_by_stock_codes(stock_codes: List[str]) -> List[str]:
        """
        根据股票代码集合获取关联的行业代码列表
        """
        if not stock_codes:
            return []
        try:
            # 🚀 SQLModel优化：使用上下文管理器和select查询
            with db_session_context() as db:
                stmt = select(StockIndustry.industry_code).where(
                    StockIndustry.ts_code.in_(stock_codes)
                ).distinct()
                result = db.exec(stmt).all()
                return [code for code in result if code]
        except Exception as e:
            logger.warning(f"查询股票关联行业失败: {e}")
            return []

    # ==================== 统计方法 ====================

    @staticmethod
    def get_industries(
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            limit: Optional[int] = None,
            offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        获取行业列表（支持搜索、分页）
        
        Args:
            search: 搜索关键词
            search_fields: 搜索字段列表，默认["industry_name"]
            limit: 限制数量
            offset: 偏移量
            
        Returns:
            行业数据列表
        """
        # 默认只搜索名称
        if search_fields is None:
            search_fields = ["industry_name"]
        
        return query_utils.get_all_records(
            model_class=Industry,
            search=search,
            search_fields=search_fields,
            limit=limit,
            offset=offset
        )


    @staticmethod
    def get_all_ts_codes() -> List[Dict[str, Any]]:
        """返回全部行业代码，统一字段名为 ts_code。"""
        try:
            # 🚀 SQLModel优化：使用上下文管理器，自动管理连接
            with db_session_context() as db:
                stmt = select(Industry.industry_code)
                result = db.exec(stmt).all()
                return [{"ts_code": code} for code in result if code]
        except Exception as e:
            logger.warning(f"查询行业全部 ts_code 失败: {e}")
            return []

    @staticmethod
    def get_hot_industry_codes() -> List[str]:
        """
        获取所有有热度数据的行业代码列表（按hot_rank排序）
        
        Returns:
            热门行业代码列表
        """
        try:
            with db_session_context() as db:
                stmt = select(Industry.industry_code).where(
                    Industry.hot_rank.isnot(None)
                ).order_by(Industry.hot_rank.asc())
                result = db.exec(stmt).all()
                return list(result)
        except Exception as e:
            logger.warning(f"获取热门行业代码失败: {e}")
            return []

    @staticmethod
    def get_industries_smart(
            filters: Optional[Dict[str, Any]] = None,
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_period: str = "daily",
            sort_order: str = "desc",
            limit: Optional[int] = 100,
            offset: Optional[int] = 0,
            trade_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        查询行业列表：根据排序字段类型选择查询方式
        - 基础表字段：从基础表查询
        - K线字段：从基础表查询，然后从K线表获取最新数据并排序

        Args:
            filters: 过滤条件
            search: 搜索关键词
            search_fields: 搜索字段列表
            sort_by: 排序字段（简化后的字段名，如 "pct_chg", "total_mv"）
            sort_period: 排序周期（daily/weekly/monthly），用于 K 线字段查询
            sort_order: 排序方向（asc/desc）
            limit: 分页限制
            offset: 分页偏移

        Returns:
            {"data": List[Dict], "total": int}
        """
        try:
            from app.constants.table_types import TableTypes
            return query_utils.get_records_smart(
                table_type=TableTypes.INDUSTRY,
                filters=filters,
                search=search,
                search_fields=search_fields,
                sort_by=sort_by,
                sort_period=sort_period,
                sort_order=sort_order,
                limit=limit,
                offset=offset,
                trade_date=trade_date,
            )
        except Exception as e:
            logger.error(f"get_industries_smart 查询失败: {e}")
            return DAOConfig.format_query_result([])

    @staticmethod
    def get_filtered_industry_codes(
            filters: Optional[Dict[str, Any]] = None,
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_order: str = "desc",
            sort_period: str = "daily",
            trade_date: Optional[str] = None,
            limit: Optional[int] = None,
    ) -> List[str]:
        """获取符合筛选条件的行业代码列表（支持排序和数量限制）。"""
        try:
            from app.constants.table_types import TableTypes
            result = query_utils.get_records_smart(
                table_type=TableTypes.INDUSTRY,
                filters=filters,
                search=search,
                search_fields=search_fields,
                sort_by=sort_by or "industry_code",
                sort_order=sort_order,
                sort_period=sort_period,
                limit=limit,
                offset=0,
                trade_date=trade_date,
            )
            return [item.get("industry_code") for item in result.get("data", []) if item.get("industry_code")]
        except Exception as e:
            logger.error(f"get_filtered_industry_codes 查询失败: {e}")
            return []

    @staticmethod
    def get_industry_stats_aggregated(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        trade_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下行业的明细数据。
        
        返回items列表，summary由前端从items计算。
        """
        # 默认空结果结构
        empty_payload: Dict[str, Any] = {
            "items": [],
        }

        if not trade_date:
            logger.warning("get_industry_stats_aggregated 未提供 trade_date，返回空统计结果")
            return empty_payload
            
        try:
            from datetime import datetime
            target_date = datetime.strptime(trade_date, "%Y%m%d").date()
            year = target_date.year
        except Exception as e:
            logger.warning(f"解析 trade_date 失败({trade_date}): {e}")
            return empty_payload
        
        # 获取K线表模型
        kline_model = TableFactory.get_table_model(TableTypes.INDUSTRY, year)
        if kline_model is None:
            logger.warning(f"未找到年份 {year} 的行业K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                industry_model, _ = TableTypes.get_model_info(TableTypes.INDUSTRY)
                m = kline_model
                
                from sqlalchemy import exists
                
                # 构建基础表的筛选条件子查询
                base_exists_subq = select(industry_model.industry_code).where(
                    industry_model.industry_code == m.ts_code
                ).correlate(m)
                
                # 应用筛选和搜索条件
                base_exists_subq = IndustryDAO._apply_filter_conditions(
                    base_exists_subq, filters, search, search_fields, industry_model
                )
                
                # 查询所有行业明细数据
                items_query = select(
                    m.ts_code,
                    industry_model.industry_name,
                    m.close,
                    m.open,
                    m.pct_chg,
                    m.amount,
                    m.float_mv,  # 流通市值，用于气泡图大小
                ).select_from(m).join(
                    industry_model, m.ts_code == industry_model.industry_code
                ).where(
                    exists(base_exists_subq),
                    m.period == "daily",
                    m.trade_date == target_date
                )
                
                items_result = db.exec(items_query).all()
                items = []
                for row in items_result:
                    open_val = float(row.open) if row.open else 0.0
                    intraday_pct = 0.0
                    if row.open and row.open != 0:
                        intraday_pct = round((row.close - row.open) / row.open * 100, 2)
                    # float_mv 单位是千万元，转换为万元以统一单位
                    float_mv_wan = float(row.float_mv) * 1000 if row.float_mv else 0.0
                    items.append({
                        "code": row.ts_code,
                        "name": row.industry_name or "",
                        "open": open_val,  # 开盘价
                        "close": float(row.close) if row.close else 0.0,
                        "pct_chg": float(row.pct_chg) if row.pct_chg else 0.0,
                        "intraday_pct": intraday_pct,
                        "amount": float(row.amount) if row.amount else 0.0,
                        "circ_mv": float_mv_wan,  # 流通市值(万元)
                    })
                
                return {
                    "items": items,
                }

        except Exception as e:
            logger.error(f"get_industry_stats_aggregated 统计失败: {e}")
            return empty_payload

    @staticmethod
    def get_industry_compare_stats(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        base_date: Optional[str] = None,
        compare_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """计算两个日期之间的行业涨跌对比统计。"""
        empty_payload: Dict[str, Any] = {
            "base_date": base_date or "",
            "compare_date": compare_date or "",
            "items": [],
        }
        
        if not base_date or not compare_date:
            logger.warning("get_industry_compare_stats 缺少 base_date 或 compare_date")
            return empty_payload
        
        try:
            from datetime import datetime
            base_dt = datetime.strptime(base_date, "%Y%m%d").date()
            compare_dt = datetime.strptime(compare_date, "%Y%m%d").date()
            base_year = base_dt.year
            compare_year = compare_dt.year
        except Exception as e:
            logger.warning(f"解析日期失败: {e}")
            return empty_payload
        
        base_kline_model = TableFactory.get_table_model(TableTypes.INDUSTRY, base_year)
        compare_kline_model = TableFactory.get_table_model(TableTypes.INDUSTRY, compare_year)
        
        if base_kline_model is None or compare_kline_model is None:
            logger.warning(f"未找到年份 {base_year} 或 {compare_year} 的行业K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                industry_model, _ = TableTypes.get_model_info(TableTypes.INDUSTRY)
                
                # 构建筛选后的行业子查询
                filtered_industries = select(industry_model.industry_code, industry_model.industry_name)
                filtered_industries = IndustryDAO._apply_filter_conditions(
                    filtered_industries, filters, search, search_fields, industry_model
                )
                filtered_industries_subq = filtered_industries.subquery()
                
                # 同年优化：使用 IN 子查询利用唯一索引 (ts_code, period, trade_date)
                if base_year == compare_year:
                    k = base_kline_model
                    
                    # 构建 ts_code IN (...) 子查询
                    ts_codes_subq = select(filtered_industries_subq.c.industry_code)
                    
                    # 🚀 查询1：只查询 A日 和 B日 两天数据（快速）
                    price_query = select(
                        k.ts_code,
                        filtered_industries_subq.c.industry_name,
                        func.max(case((k.trade_date == base_dt, k.open))).label("open_a"),
                        func.max(case((k.trade_date == compare_dt, k.close))).label("close_b"),
                        func.max(case((k.trade_date == compare_dt, k.float_mv))).label("float_mv_b"),
                    ).select_from(k).join(
                        filtered_industries_subq, k.ts_code == filtered_industries_subq.c.industry_code
                    ).where(
                        k.ts_code.in_(ts_codes_subq),
                        k.period == sort_period,
                        k.trade_date.in_([base_dt, compare_dt])
                    ).group_by(k.ts_code, filtered_industries_subq.c.industry_name)
                    
                    price_results = db.exec(price_query).all()
                    
                    # 🚀 查询2：区间累计成交额（使用KlineAggregator优化）
                    from .utils.kline_aggregator import KlineAggregator
                    from .utils.kline_extreme_aggregator import KlineExtremeAggregator
                    amount_map = KlineAggregator.query_cumulative(
                        db_session_context, k, ts_codes_subq, base_dt, compare_dt
                    )
                    
                    # 🚀 查询3：区间极端值
                    extreme_map = KlineExtremeAggregator.query_extremes(
                        db_session_context, k, ts_codes_subq, base_dt, compare_dt
                    )
                    
                    items = []
                    for r in price_results:
                        if r.open_a and r.open_a > 0 and r.close_b is not None:
                            open_a = float(r.open_a)
                            close_b = float(r.close_b)
                            pct = (close_b - open_a) / open_a * 100
                            float_mv_wan = float(r.float_mv_b) * 1000 if r.float_mv_b else 0.0
                            
                            extreme = extreme_map.get(r.ts_code, {})
                            high_price = float(extreme.get("high", 0.0))
                            low_price = float(extreme.get("low", 0.0))
                            max_pct = ((high_price - open_a) / open_a * 100) if high_price > 0 else None
                            min_pct = ((low_price - open_a) / open_a * 100) if low_price > 0 else None
                            
                            items.append({
                                "code": r.ts_code,
                                "name": r.industry_name or "",
                                "open": open_a,
                                "close": close_b,
                                "pct_chg": round(pct, 2),
                                "max_pct": round(max_pct, 2) if max_pct is not None else None,
                                "min_pct": round(min_pct, 2) if min_pct is not None else None,
                                "high_price": high_price if high_price > 0 else None,
                                "low_price": low_price if low_price > 0 else None,
                                "amount": amount_map.get(r.ts_code, 0.0),
                                "circ_mv": float_mv_wan,
                            })
                    
                    return {
                        "base_date": base_date,
                        "compare_date": compare_date,
                        "items": items,
                    }
                
                # 🚀 跨年查询：分离查询优化
                k_a = base_kline_model
                k_b = compare_kline_model
                
                # 构建 ts_code IN (...) 子查询
                ts_codes_subq = select(filtered_industries_subq.c.industry_code)
                
                # 🚀 查询1：只查询 A日 和 B日 的价格数据（快速）
                price_a_query = select(
                    k_a.ts_code.label("ts_code"),
                    k_a.open.label("open_a"),
                ).select_from(k_a).join(
                    filtered_industries_subq, k_a.ts_code == filtered_industries_subq.c.industry_code
                ).where(
                    k_a.ts_code.in_(ts_codes_subq),
                    k_a.period == sort_period,
                    k_a.trade_date == base_dt
                )
                price_a_results = db.exec(price_a_query).all()
                price_a_map = {r.ts_code: float(r.open_a) if r.open_a else None for r in price_a_results}
                
                price_b_query = select(
                    k_b.ts_code.label("ts_code"),
                    filtered_industries_subq.c.industry_name,
                    k_b.close.label("close_b"),
                    k_b.float_mv.label("float_mv_b"),
                ).select_from(k_b).join(
                    filtered_industries_subq, k_b.ts_code == filtered_industries_subq.c.industry_code
                ).where(
                    k_b.ts_code.in_(ts_codes_subq),
                    k_b.period == sort_period,
                    k_b.trade_date == compare_dt
                )
                price_b_results = db.exec(price_b_query).all()
                
                # 🚀 查询2：区间累计成交额（使用KlineAggregator优化 - 跨年）
                from datetime import date
                from .utils.kline_aggregator import KlineAggregator
                from .utils.kline_extreme_aggregator import KlineExtremeAggregator
                
                a_year_end = date(base_year, 12, 31)
                b_year_start = date(compare_year, 1, 1)
                
                amounts_a = KlineAggregator.query_cumulative(
                    db_session_context, k_a, ts_codes_subq, base_dt, a_year_end
                )
                amounts_b = KlineAggregator.query_cumulative(
                    db_session_context, k_b, ts_codes_subq, b_year_start, compare_dt
                )
                
                # 合并A年和B年成交额
                amount_map = {}
                for code, amt in amounts_a.items():
                    amount_map[code] = amt
                for code, amt in amounts_b.items():
                    amount_map[code] = amount_map.get(code, 0.0) + amt
                
                # 🚀 查询3：区间极端值（跨年）
                extremes_a = KlineExtremeAggregator.query_extremes(
                    db_session_context, k_a, ts_codes_subq, base_dt, a_year_end
                )
                extremes_b = KlineExtremeAggregator.query_extremes(
                    db_session_context, k_b, ts_codes_subq, b_year_start, compare_dt
                )
                
                extreme_map = {}
                for code, ext in extremes_a.items():
                    extreme_map[code] = ext.copy()
                for code, ext in extremes_b.items():
                    if code in extreme_map:
                        extreme_map[code]["high"] = max(extreme_map[code].get("high", 0), ext.get("high", 0))
                        extreme_map[code]["low"] = min(extreme_map[code].get("low", float('inf')), ext.get("low", float('inf')))
                    else:
                        extreme_map[code] = ext.copy()
                
                # 在Python层合并结果并计算涨跌幅
                items = []
                for r in price_b_results:
                    open_a = price_a_map.get(r.ts_code)
                    close_b = float(r.close_b) if r.close_b is not None else None
                    if open_a and open_a > 0 and close_b is not None:
                        pct = (close_b - open_a) / open_a * 100
                        float_mv_wan = float(r.float_mv_b) * 1000 if r.float_mv_b else 0.0
                        
                        extreme = extreme_map.get(r.ts_code, {})
                        high_price = float(extreme.get("high", 0.0))
                        low_price = float(extreme.get("low", 0.0))
                        max_pct = ((high_price - open_a) / open_a * 100) if high_price > 0 else None
                        min_pct = ((low_price - open_a) / open_a * 100) if low_price > 0 else None
                        
                        items.append({
                            "code": r.ts_code,
                            "name": r.industry_name or "",
                            "open": open_a,
                            "close": close_b,
                            "pct_chg": round(pct, 2),
                            "max_pct": round(max_pct, 2) if max_pct is not None else None,
                            "min_pct": round(min_pct, 2) if min_pct is not None else None,
                            "high_price": high_price if high_price > 0 else None,
                            "low_price": low_price if low_price > 0 else None,
                            "amount": amount_map.get(r.ts_code, 0.0),
                            "circ_mv": float_mv_wan,
                        })
                
                return {
                    "base_date": base_date,
                    "compare_date": compare_date,
                    "items": items,
                }
                
        except Exception as e:
            logger.error(f"get_industry_compare_stats 统计失败: {e}")
            return empty_payload

    # ==================== 热度数据同步 ====================

    @staticmethod
    def sync_hot_data(
            hot_data_list: List[Dict[str, Any]],
            trade_date: str,
    ) -> Dict[str, Any]:
        """
        同步行业热度数据到基础表（industries表）
        
        Args:
            hot_data_list: 热度数据列表
            trade_date: 交易日期

        Returns:
            统计信息和变更集
        """

        if not hot_data_list:
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": 0
            })

        try:
            # 准备批量更新数据
            update_data = []

            for hot_item in hot_data_list:
                industry_code = hot_item.get("industry_code")
                if not industry_code:
                    continue

                # 准备热度数据
                hot_metrics = {
                    'industry_code': industry_code,
                    'hot_rank': hot_item.get("hot_rank"),
                    'hot_score': hot_item.get("hot_score"),
                    'hot_date': trade_date,
                    'hot_concept': hot_item.get("hot_concept"),
                    'hot_rank_reason': hot_item.get("hot_rank_reason"),
                }
                update_data.append(hot_metrics)

            # 批量更新基础表的热度字段（仅更新已存在的记录，不插入新记录）
            stats = IndustryDAO._bulk_update_hot_data(update_data)
            
            # 直接返回stats，因为_bulk_update_hot_data已经返回标准格式
            return stats

        except Exception as e:
            logger.error(f"同步行业热度数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(hot_data_list) if hot_data_list else 0
            })
    
    @staticmethod
    def _bulk_update_hot_data(update_data: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        批量更新行业热度数据（只更新，不插入）
        """
        if not update_data:
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": 0
            })
        
        try:
            # 🚀 重大性能优化：使用批量参数化查询，避免循环
            from sqlmodel import text
            
            with db_session_context() as db:
                # 过滤掉无效的industry_code
                valid_data = [data for data in update_data if data.get('industry_code')]
                
                if not valid_data:
                    return DAOConfig.format_upsert_result({
                        "inserted": 0, "updated": 0, "total": 0
                    })
                
                # 🚀 优化：使用参数化SQL和executemany进行批量更新
                sql = text("""
                    UPDATE industries 
                    SET hot_rank = :hot_rank,
                        hot_score = :hot_score,
                        hot_date = :hot_date,
                        hot_concept = :hot_concept,
                        hot_rank_reason = :hot_rank_reason,
                        updated_at = NOW()
                    WHERE industry_code = :industry_code
                """)
                
                # 使用executemany批量执行
                result = db.connection().execute(sql, valid_data)
                updated_count = result.rowcount
                
                db.commit()
                return DAOConfig.format_upsert_result({
                    "inserted": 0,
                    "updated": updated_count,
                    "total": len(valid_data)
                })
                
        except Exception as e:
            logger.error(f"批量更新行业热度数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(update_data)
            })


# 创建全局实例
industry_dao = IndustryDAO()
