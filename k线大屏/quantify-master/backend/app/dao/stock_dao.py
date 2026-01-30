"""
股票数据访问层 (DAO) - SQLModel优化版本
负责股票基础数据的数据库操作，提供高性能的查询和批量操作
"""
from typing import List, Dict, Any, Optional
from datetime import date

from loguru import logger
from sqlmodel import select, case

from app.constants.table_types import TableTypes
from app.models import db_session_context, TableFactory
from .dao_config import DAOConfig
from .query_utils import query_utils
from .utils.batch_operations import batch_operations
from ..models import Stock


class StockDAO:
    """股票数据访问对象"""

    @staticmethod
    def _apply_filter_conditions(
        subq,
        filters: Optional[Dict[str, Any]],
        search: Optional[str],
        search_fields: Optional[List[str]],
        model,
    ):
        """应用筛选和搜索条件到子查询。
        
        Args:
            subq: 基础子查询
            filters: 筛选条件字典
            search: 搜索关键词
            search_fields: 搜索字段列表
            model: 数据模型类
            
        Returns:
            应用条件后的子查询
        """
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

    @staticmethod
    def bulk_upsert_stock_data(
            data: List[Dict[str, Any]],
            batch_size: Optional[int] = None
    ) -> Dict[str, int]:
        """
        批量插入或更新股票基础数据（单表 upsert）。
        """
        # 使用 MySQL 生成式 upsert 提升批量写入效率
        # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
        stats = batch_operations.bulk_upsert_mysql_generated(
            table_model=Stock,
            data=data,
            batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
        )
        return DAOConfig.format_upsert_result(stats)

    @staticmethod
    def get_stock_by_ts_code(ts_code: str) -> Optional[Dict[str, Any]]:
        """
        根据股票代码获取股票信息
        
        Args:
            ts_code: 股票代码
            
        Returns:
            股票信息字典或None
        """
        records = query_utils.get_all_records(
            model_class=Stock,
            filters={"ts_code": ts_code},
            limit=1
        )
        return records[0] if records else None

    @staticmethod
    def get_stocks(
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            limit: Optional[int] = None,
            offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        获取股票列表（支持搜索、分页）
        
        Args:
            search: 搜索关键词
            search_fields: 搜索字段列表，默认为 ["ts_code", "name", "area", "industry"]
            limit: 限制数量
            offset: 偏移量
            
        Returns:
            股票数据列表
        """
        if search_fields is None:
            search_fields = ["ts_code", "name", "area", "industry"]
            
        return query_utils.get_all_records(
            model_class=Stock,
            search=search,
            search_fields=search_fields,
            limit=limit,
            offset=offset
        )


    @staticmethod
    def get_stocks_smart(
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
        查询股票列表：根据排序字段类型选择查询方式
        - 基础表字段：从基础表查询
        - K线字段：从基础表查询，然后从K线表获取最新数据并排序

        Args:
            filters: 过滤条件
            search: 搜索关键词
            search_fields: 搜索字段列表
            sort_by: 排序字段（简化后的字段名，如 "pct_chg"）
            sort_period: 排序周期（daily/weekly/monthly），用于 K 线字段查询
            sort_order: 排序方向（asc/desc）
            limit: 分页限制
            offset: 分页偏移

        Returns:
            {"data": List[Dict], "total": int}
        """
        try:
            return query_utils.get_records_smart(
                table_type=TableTypes.STOCK,
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
            logger.error(f"get_stocks_smart 查询失败: {e}")
            return DAOConfig.format_query_result([])

    @staticmethod
    def get_filtered_ts_codes(
            filters: Optional[Dict[str, Any]] = None,
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_order: str = "desc",
            sort_period: str = "daily",
            trade_date: Optional[str] = None,
            limit: Optional[int] = None,
    ) -> List[str]:
        """获取符合筛选条件的 ts_code 列表（轻量级查询）。
        
        支持排序和数量限制，适用于批量操作场景。
        
        Args:
            filters: 过滤条件
            search: 搜索关键词
            search_fields: 搜索字段列表
            sort_by: 排序字段
            sort_order: 排序方向
            sort_period: 排序周期
            trade_date: 交易日期
            limit: 返回数量限制
            
        Returns:
            ts_code 列表
        """
        try:
            from .query_utils import query_utils
            
            result = query_utils.get_records_smart(
                table_type=TableTypes.STOCK,
                filters=filters,
                search=search,
                search_fields=search_fields,
                sort_by=sort_by or "ts_code",
                sort_order=sort_order,
                sort_period=sort_period,
                limit=limit,
                offset=0,
                trade_date=trade_date,
            )
            
            return [item.get("ts_code") for item in result.get("data", []) if item.get("ts_code")]
            
        except Exception as e:
            logger.error(f"get_filtered_ts_codes 查询失败: {e}")
            return []

    @staticmethod
    def get_stock_stats_aggregated(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        trade_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下股票的明细数据。
        
        返回items列表，summary由前端从items计算。
        """
        # 默认空结果结构
        empty_payload: Dict[str, Any] = {
            "items": [],
        }

        if not trade_date:
            logger.warning("get_stock_stats_aggregated 未提供 trade_date，返回空统计结果")
            return empty_payload
            
        try:
            from datetime import datetime
            target_date = datetime.strptime(trade_date, "%Y%m%d").date()
            year = target_date.year
        except Exception as e:
            logger.warning(f"解析 trade_date 失败({trade_date}): {e}")
            return empty_payload
        
        # 获取K线表模型
        kline_model = TableFactory.get_table_model(TableTypes.STOCK, year)
        if kline_model is None:
            logger.warning(f"未找到年份 {year} 的K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                stock_model, entity_code_field = TableTypes.get_model_info(TableTypes.STOCK)
                m = kline_model
                
                from sqlalchemy import exists
                
                # 构建基础表的筛选条件子查询
                base_exists_subq = select(stock_model.ts_code).where(
                    stock_model.ts_code == m.ts_code
                ).correlate(m)
                
                # 应用筛选和搜索条件
                base_exists_subq = StockDAO._apply_filter_conditions(
                    base_exists_subq, filters, search, search_fields, stock_model
                )
                
                # � 优化：只查询明细数据，summary由前端从items计算
                # 查询所有股票明细数据
                items_query = select(
                    m.ts_code,
                    stock_model.name,
                    m.close,
                    m.open,
                    m.pct_chg,
                    m.amount,
                    m.circ_mv,  # 流通市值，用于气泡图大小
                ).select_from(m).join(
                    stock_model, m.ts_code == stock_model.ts_code
                ).where(
                    exists(base_exists_subq),
                    m.period == sort_period,
                    m.trade_date == target_date
                )
                
                items_result = db.exec(items_query).all()
                items = []
                for row in items_result:
                    open_val = float(row.open) if row.open else 0.0
                    intraday_pct = 0.0
                    if row.open and row.open != 0:
                        intraday_pct = round((row.close - row.open) / row.open * 100, 2)
                    items.append({
                        "code": row.ts_code,
                        "name": row.name,
                        "open": open_val,  # 开盘价
                        "close": float(row.close) if row.close else 0.0,
                        "pct_chg": float(row.pct_chg) if row.pct_chg else 0.0,
                        "intraday_pct": intraday_pct,
                        "amount": float(row.amount) if row.amount else 0.0,
                        "circ_mv": float(row.circ_mv) if row.circ_mv else 0.0,  # 流通市值
                    })
                
                return {
                    "items": items,
                }
                
        except Exception as e:
            logger.error(f"get_stock_stats_aggregated 统计失败: {e}")
            return empty_payload

    @staticmethod
    def get_stock_compare_stats(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        base_date: Optional[str] = None,
        compare_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """计算两个日期之间的股票涨跌对比统计。
        
        计算公式：(B日收盘 - A日收盘) / A日收盘 * 100
        
        Args:
            filters: 筛选条件
            search: 搜索关键词
            search_fields: 搜索字段
            base_date: 基准日期 A (YYYYMMDD)
            compare_date: 对比日期 B (YYYYMMDD)
            sort_period: 周期类型 (daily/weekly/monthly)
        """
        # 默认空结构（summary由前端计算）
        empty_payload: Dict[str, Any] = {
            "base_date": base_date or "",
            "compare_date": compare_date or "",
            "items": [],
        }
        
        if not base_date or not compare_date:
            logger.warning("get_stock_compare_stats 缺少 base_date 或 compare_date")
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
        
        # 获取K线表模型
        base_kline_model = TableFactory.get_table_model(TableTypes.STOCK, base_year)
        compare_kline_model = TableFactory.get_table_model(TableTypes.STOCK, compare_year)
        
        if base_kline_model is None or compare_kline_model is None:
            logger.warning(f"未找到年份 {base_year} 或 {compare_year} 的K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                from sqlalchemy import func
                
                stock_model, _ = TableTypes.get_model_info(TableTypes.STOCK)
                
                # 先构建筛选后的股票子查询（避免 auto-correlation）
                filtered_stocks = select(stock_model.ts_code, stock_model.name)
                filtered_stocks = StockDAO._apply_filter_conditions(
                    filtered_stocks, filters, search, search_fields, stock_model
                )
                filtered_stocks_subq = filtered_stocks.subquery()
                
                # 🚀 并行查询优化：使用线程池并行执行多个查询
                from concurrent.futures import ThreadPoolExecutor
                from app.models import db_session_context as create_db_session
                
                # 🚀 分离查询优化：并行查询涨跌幅 + 累计成交额
                if base_year == compare_year:
                    k = base_kline_model
                    
                    # 构建 ts_code IN (...) 子查询
                    ts_codes_subq = select(filtered_stocks_subq.c.ts_code)
                    
                    def query_prices():
                        """查询价格数据（只查询A日和B日两天）"""
                        with create_db_session() as db2:
                            price_query = select(
                                k.ts_code,
                                filtered_stocks_subq.c.name,
                                func.max(case((k.trade_date == base_dt, k.open))).label("open_a"),
                                func.max(case((k.trade_date == compare_dt, k.close))).label("close_b"),
                                func.max(case((k.trade_date == compare_dt, k.circ_mv))).label("circ_mv_b"),
                            ).select_from(k).join(
                                filtered_stocks_subq, k.ts_code == filtered_stocks_subq.c.ts_code
                            ).where(
                                k.ts_code.in_(ts_codes_subq),
                                k.period == sort_period,
                                k.trade_date.in_([base_dt, compare_dt])
                            ).group_by(k.ts_code, filtered_stocks_subq.c.name)
                            return db2.exec(price_query).all()
                    
                    def query_amounts():
                        """查询累计成交额（使用通用优化器：月线+周线优化）"""
                        from .utils.kline_aggregator import KlineAggregator
                        return KlineAggregator.query_cumulative(
                            create_db_session, k, ts_codes_subq, base_dt, compare_dt
                        )
                    
                    def query_extremes():
                        """查询区间极端值（使用优化器：月线+周线优化）"""
                        from .utils.kline_extreme_aggregator import KlineExtremeAggregator
                        return KlineExtremeAggregator.query_extremes(
                            create_db_session, k, ts_codes_subq, base_dt, compare_dt
                        )
                    
                    # 并行执行三个查询
                    with ThreadPoolExecutor(max_workers=3) as executor:
                        price_future = executor.submit(query_prices)
                        amount_future = executor.submit(query_amounts)
                        extreme_future = executor.submit(query_extremes)
                        price_results = price_future.result()
                        amount_map = amount_future.result()  # {ts_code: amount}
                        extreme_map = extreme_future.result()  # {ts_code: {"high": x, "low": y}}
                    
                    # 在Python层合并结果并计算涨跌幅
                    items = []
                    for r in price_results:
                        if r.open_a and r.open_a > 0 and r.close_b is not None:
                            open_a = float(r.open_a)
                            close_b = float(r.close_b)
                            pct = (close_b - open_a) / open_a * 100
                            
                            # 计算区间极端涨跌幅
                            extreme = extreme_map.get(r.ts_code, {})
                            high_price = float(extreme.get("high", 0.0))
                            low_price = float(extreme.get("low", 0.0))
                            max_pct = ((high_price - open_a) / open_a * 100) if high_price > 0 else None
                            min_pct = ((low_price - open_a) / open_a * 100) if low_price > 0 else None
                            
                            items.append({
                                "code": r.ts_code,
                                "name": r.name or "",
                                "open": open_a,  # A日开盘价
                                "close": float(r.close_b),
                                "pct_chg": round(pct, 2),
                                "max_pct": round(max_pct, 2) if max_pct is not None else None,
                                "min_pct": round(min_pct, 2) if min_pct is not None else None,
                                "high_price": high_price if high_price > 0 else None,
                                "low_price": low_price if low_price > 0 else None,
                                "amount": amount_map.get(r.ts_code, 0.0),
                                "circ_mv": float(r.circ_mv_b) if r.circ_mv_b else 0.0,
                            })
                    
                    return {
                        "base_date": base_date,
                        "compare_date": compare_date,
                        "items": items,
                    }
                
                # 🚀 跨年查询：并行查询优化
                k_a = base_kline_model
                k_b = compare_kline_model
                
                # 构建 ts_code IN (...) 子查询
                ts_codes_subq = select(filtered_stocks_subq.c.ts_code)
                
                def query_price_a():
                    """A日开盘"""
                    with create_db_session() as db2:
                        price_a_query = select(
                            k_a.ts_code.label("ts_code"),
                            k_a.open.label("open_a"),
                        ).select_from(k_a).join(
                            filtered_stocks_subq, k_a.ts_code == filtered_stocks_subq.c.ts_code
                        ).where(
                            k_a.ts_code.in_(ts_codes_subq),
                            k_a.period == sort_period,
                            k_a.trade_date == base_dt
                        )
                        return db2.exec(price_a_query).all()
                
                def query_price_b():
                    """B日收盘+流通市值"""
                    with create_db_session() as db2:
                        price_b_query = select(
                            k_b.ts_code.label("ts_code"),
                            filtered_stocks_subq.c.name,
                            k_b.close.label("close_b"),
                            k_b.circ_mv.label("circ_mv_b"),
                        ).select_from(k_b).join(
                            filtered_stocks_subq, k_b.ts_code == filtered_stocks_subq.c.ts_code
                        ).where(
                            k_b.ts_code.in_(ts_codes_subq),
                            k_b.period == sort_period,
                            k_b.trade_date == compare_dt
                        )
                        return db2.exec(price_b_query).all()
                
                def query_amounts_optimized():
                    """查询累计成交额（使用通用优化器：月线+周线优化 - 跨年）"""
                    from datetime import date
                    from .utils.kline_aggregator import KlineAggregator
                    
                    total_amounts = {}
                    
                    # A年部分：base_dt 到 A年12月31日
                    a_year_end = date(base_year, 12, 31)
                    amounts_a = KlineAggregator.query_cumulative(
                        create_db_session, k_a, ts_codes_subq, base_dt, a_year_end
                    )
                    for code, amt in amounts_a.items():
                        total_amounts[code] = amt
                    
                    # B年部分：B年1月1日 到 compare_dt
                    b_year_start = date(compare_year, 1, 1)
                    amounts_b = KlineAggregator.query_cumulative(
                        create_db_session, k_b, ts_codes_subq, b_year_start, compare_dt
                    )
                    for code, amt in amounts_b.items():
                        total_amounts[code] = total_amounts.get(code, 0.0) + amt
                    
                    return total_amounts
                
                def query_extremes_optimized():
                    """查询区间极端值（跨年优化）"""
                    from .utils.kline_extreme_aggregator import KlineExtremeAggregator
                    
                    total_extremes = {}
                    
                    # A年部分
                    a_year_end = date(base_year, 12, 31)
                    extremes_a = KlineExtremeAggregator.query_extremes(
                        create_db_session, k_a, ts_codes_subq, base_dt, a_year_end
                    )
                    for code, ext in extremes_a.items():
                        total_extremes[code] = ext.copy()
                    
                    # B年部分
                    b_year_start = date(compare_year, 1, 1)
                    extremes_b = KlineExtremeAggregator.query_extremes(
                        create_db_session, k_b, ts_codes_subq, b_year_start, compare_dt
                    )
                    for code, ext in extremes_b.items():
                        if code in total_extremes:
                            total_extremes[code]["high"] = max(total_extremes[code]["high"], ext["high"])
                            total_extremes[code]["low"] = min(total_extremes[code]["low"], ext["low"])
                        else:
                            total_extremes[code] = ext.copy()
                    
                    return total_extremes
                
                # 并行执行4个查询（价格A、价格B、成交额、极端值）
                with ThreadPoolExecutor(max_workers=4) as executor:
                    price_a_future = executor.submit(query_price_a)
                    price_b_future = executor.submit(query_price_b)
                    amounts_future = executor.submit(query_amounts_optimized)
                    extremes_future = executor.submit(query_extremes_optimized)
                    
                    price_a_results = price_a_future.result()
                    price_b_results = price_b_future.result()
                    amount_map = amounts_future.result()
                    extreme_map = extremes_future.result()
                
                price_a_map = {r.ts_code: float(r.open_a) if r.open_a else None for r in price_a_results}
                
                # 在Python层合并结果并计算涨跌幅
                items = []
                for r in price_b_results:
                    open_a = price_a_map.get(r.ts_code)
                    close_b = float(r.close_b) if r.close_b is not None else None
                    if open_a and open_a > 0 and close_b is not None:
                        pct = (close_b - open_a) / open_a * 100
                        
                        # 计算区间极端涨跌幅
                        extreme = extreme_map.get(r.ts_code, {})
                        high_price = float(extreme.get("high", 0.0))
                        low_price = float(extreme.get("low", 0.0))
                        max_pct = ((high_price - open_a) / open_a * 100) if high_price > 0 else None
                        min_pct = ((low_price - open_a) / open_a * 100) if low_price > 0 else None
                        
                        items.append({
                            "code": r.ts_code,
                            "name": r.name or "",
                            "open": open_a,  # A日开盘价
                            "close": close_b,
                            "pct_chg": round(pct, 2),
                            "max_pct": round(max_pct, 2) if max_pct is not None else None,
                            "min_pct": round(min_pct, 2) if min_pct is not None else None,
                            "high_price": high_price if high_price > 0 else None,
                            "low_price": low_price if low_price > 0 else None,
                            "amount": amount_map.get(r.ts_code, 0.0),
                            "circ_mv": float(r.circ_mv_b) if r.circ_mv_b else 0.0,
                        })
                
                return {
                    "base_date": base_date,
                    "compare_date": compare_date,
                    "items": items,
                }
                
        except Exception as e:
            logger.error(f"get_stock_compare_stats 统计失败: {e}")
            return empty_payload

    @staticmethod
    def get_all_ts_codes() -> List[Dict[str, Any]]:
        """返回全部股票代码，统一字段名为 ts_code。"""
        try:
            # 🚀 SQLModel优化：使用上下文管理器，自动管理连接
            with db_session_context() as db:
                stmt = select(Stock.ts_code)
                result = db.exec(stmt).all()
                return [{"ts_code": code} for code in result if code]
        except Exception as e:
            logger.warning(f"查询股票全部 ts_code 失败: {e}")
            return []

    @staticmethod
    def get_hot_stock_codes() -> List[str]:
        """
        获取所有有热度数据的股票代码列表（按hot_rank排序）
        
        Returns:
            热门股票代码列表
        """
        try:
            with db_session_context() as db:
                stmt = select(Stock.ts_code).where(
                    Stock.hot_rank.isnot(None)
                ).order_by(Stock.hot_rank.asc())
                result = db.exec(stmt).all()
                return list(result)
        except Exception as e:
            logger.warning(f"获取热门股票代码失败: {e}")
            return []

    @staticmethod
    def sync_hot_data(
            hot_data_list: List[Dict[str, Any]],
            trade_date: str,
    ) -> Dict[str, Any]:
        """
        同步股票热度数据到基础表（stocks表）
        
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
                ts_code = hot_item.get("ts_code")
                if not ts_code:
                    continue

                # 准备热度数据
                hot_metrics = {
                    'ts_code': ts_code,
                    'hot_rank': hot_item.get("hot_rank"),
                    'hot_score': hot_item.get("hot_score"),
                    'hot_date': trade_date,
                    'hot_concept': hot_item.get("hot_concept"),
                    'hot_rank_reason': hot_item.get("hot_rank_reason"),
                }
                update_data.append(hot_metrics)

            # 批量更新基础表的热度字段（仅更新已存在的记录，不插入新记录）
            stats = StockDAO._bulk_update_hot_data(update_data)
            
            # 直接返回stats，因为_bulk_update_hot_data已经返回标准格式
            return stats

        except Exception as e:
            logger.error(f"同步股票热度数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(hot_data_list) if hot_data_list else 0
            })
    
    @staticmethod
    def _bulk_update_hot_data(update_data: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        批量更新股票热度数据（只更新，不插入）
        🚀 性能优化：使用批量执行的参数化查询，避免逐条更新
        """
        if not update_data:
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,  
                "total": 0
            })
        
        try:
            from sqlmodel import text
            
            with db_session_context() as db:
                # 🚀 优化：使用executemany进行批量更新
                sql = text("""
                    UPDATE stocks 
                    SET hot_rank = :hot_rank,
                        hot_score = :hot_score,
                        hot_date = :hot_date,
                        hot_concept = :hot_concept,
                        hot_rank_reason = :hot_rank_reason,
                        updated_at = NOW()
                    WHERE ts_code = :ts_code
                """)
                
                # 过滤掉无效的ts_code
                valid_data = [data for data in update_data if data.get('ts_code')]
                
                if not valid_data:
                    return DAOConfig.format_upsert_result({
                        "inserted": 0, "updated": 0, "total": 0
                    })
                
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
            logger.error(f"批量更新股票热度数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(update_data)
            })

    @staticmethod
    def get_st_stock_codes() -> List[str]:
        """
        获取所有ST股票代码（名称包含ST的股票）
        
        Returns:
            ST股票代码列表
        """
        try:
            with db_session_context() as db:
                stmt = select(Stock.ts_code).where(
                    Stock.ts_code.isnot(None),
                    Stock.name.contains('ST')
                )
                result = db.exec(stmt).all()
                return [r for r in result if r]
        except Exception as e:
            logger.warning(f"获取ST股票代码失败: {e}")
            return []

    @staticmethod
    def get_ts_codes_by_circ_mv_range(
        min_cap: Optional[float] = None,
        max_cap: Optional[float] = None,
        trade_date: Optional[str] = None,
        period: str = 'daily',
    ) -> List[str]:
        """
        根据流通市值范围筛选股票代码（从K线表查询流通市值数据）
        
        Args:
            min_cap: 最小流通市值（亿），None表示不限
            max_cap: 最大流通市值（亿），None表示不限
            trade_date: 基准日期（YYYYMMDD），必须提供
            period: K线周期，默认daily
            
        Returns:
            符合流通市值范围的股票代码列表
        """
        from sqlmodel import text
        from ..models import TableFactory, db_session_context
        
        # 根据trade_date确定年份
        year = int(trade_date[:4])
        table_model = TableFactory.get_table_model(TableTypes.STOCK, year)
        if not table_model:
            logger.warning(f"无法获取 {year} 年的K线表模型")
            return []
        
        table_name = table_model.__tablename__
        
        try:
            with db_session_context() as db:
                # circ_mv单位是万元，转换为亿需除以10000
                conditions = [
                    "period = :period",
                    "circ_mv IS NOT NULL",
                    "trade_date = :trade_date",
                ]
                params = {'trade_date': trade_date, 'period': period}
                
                if min_cap is not None:
                    conditions.append("circ_mv >= :min_cap")
                    params['min_cap'] = min_cap * 10000
                
                if max_cap is not None:
                    conditions.append("circ_mv <= :max_cap")
                    params['max_cap'] = max_cap * 10000
                
                sql = f"SELECT DISTINCT ts_code FROM {table_name} WHERE {' AND '.join(conditions)}"
                result = db.execute(text(sql), params)
                return [row[0] for row in result if row[0]]
        except Exception as e:
            logger.warning(f"按流通市值范围筛选股票失败: {e}")
            return []


# 创建全局实例
stock_dao = StockDAO()
