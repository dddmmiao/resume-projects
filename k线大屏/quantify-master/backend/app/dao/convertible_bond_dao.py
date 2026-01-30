"""
可转债数据访问层 (DAO) - SQLModel优化版本
负责可转债相关数据的数据库操作，提供高性能的查询和批量操作
"""
from typing import List, Dict, Any, Optional

from loguru import logger
from sqlmodel import select, func, case

from app.constants.table_types import TableTypes
from app.models import db_session_context, TableFactory
from .dao_config import DAOConfig
from .query_utils import query_utils, QueryUtils
from .utils.batch_operations import batch_operations
from ..models import (
    ConvertibleBond,
)


class ConvertibleBondDAO:
    """可转债数据访问对象"""

    @staticmethod
    def _apply_filter_conditions(
        subq,
        filters: Optional[Dict[str, Any]],
        search: Optional[str],
        search_fields: Optional[List[str]],
        model,
    ):
        """应用筛选和搜索条件到子查询。
        
        与StockDAO._apply_filter_conditions保持一致的结构。
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

    # ==================== 可转债基础信息 ====================

    @staticmethod
    def bulk_upsert_convertible_bond_data(
            data: List[Dict[str, Any]],
            batch_size: Optional[int] = None
    ) -> Dict[str, int]:
        """
        批量插入或更新可转债基础数据（单表 upsert）。
        """
        # 使用 MySQL 生成式 upsert 提升批量写入效率
        # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
        stats = batch_operations.bulk_upsert_mysql_generated(
            table_model=ConvertibleBond,
            data=data,
            batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
        )
        return DAOConfig.format_upsert_result(stats)

    @staticmethod
    def get_convertible_bonds(
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            limit: Optional[int] = None,
            offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        获取可转债列表（支持搜索、分页）
        
        Args:
            search: 搜索关键词
            search_fields: 搜索字段列表，默认["bond_short_name"]
            limit: 限制数量
            offset: 偏移量
            
        Returns:
            可转债数据列表
        """
        # 默认只搜索可转债名称
        if search_fields is None:
            search_fields = ["bond_short_name"]
        
        return query_utils.get_all_records(
            model_class=ConvertibleBond,
            search=search,
            search_fields=search_fields,
            limit=limit,
            offset=offset
        )


    @staticmethod
    def get_convertible_bonds_smart(
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
        查询可转债列表：根据排序字段类型选择查询方式
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
            from app.constants.table_types import TableTypes
            return query_utils.get_records_smart(
                table_type=TableTypes.CONVERTIBLE_BOND,
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
            logger.error(f"get_convertible_bonds_smart 查询失败: {e}")
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
        """获取符合筛选条件的可转债代码列表（支持排序和数量限制）。"""
        try:
            result = query_utils.get_records_smart(
                table_type=TableTypes.CONVERTIBLE_BOND,
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
    def get_bond_codes_by_stock_codes(stock_codes: List[str]) -> List[str]:
        """
        根据股票代码获取对应的可转债代码
        
        Args:
            stock_codes: 股票代码列表
            
        Returns:
            可转债代码列表
        """
        if not stock_codes:
            return []
        
        try:
            # 🚀 SQLModel优化：使用上下文管理器和select查询
            with db_session_context() as db:
                stmt = select(ConvertibleBond.ts_code).where(
                    ConvertibleBond.stk_code.in_(stock_codes)
                ).distinct()
                result = db.exec(stmt).all()
                return [code for code in result if code]
        except Exception as e:
            logger.warning(f"查询股票对应可转债失败: {e}")
            return []

    @staticmethod
    def get_convertible_bonds_by_codes(ts_codes: List[str]) -> List[Dict[str, Any]]:
        """
        根据可转债代码列表获取可转债信息
        
        Args:
            ts_codes: 可转债代码列表
            
        Returns:
            可转债信息列表
        """
        if not ts_codes:
            return []

        return query_utils.get_all_records(
            model_class=ConvertibleBond,
            filters={"ts_code": ts_codes},
            limit=None
        )

    @staticmethod
    def get_all_ts_codes() -> List[Dict[str, Any]]:
        """返回全部可转债代码，统一字段名为 ts_code。"""
        try:
            # 🚀 SQLModel优化：使用上下文管理器，自动管理连接
            with db_session_context() as db:
                stmt = select(ConvertibleBond.ts_code)
                result = db.exec(stmt).all()
                return [{"ts_code": code} for code in result if code]
        except Exception as e:
            logger.warning(f"查询可转债全部 ts_code 失败: {e}")
            return []

    @staticmethod
    def get_all_active_bonds() -> List[Dict[str, Any]]:
        """
        获取所有活跃可转债的基本信息（ts_code和stk_code）
        用于构建可转债-股票双向映射缓存
        
        Returns:
            [{"ts_code": "123456.SH", "stk_code": "000001.SZ"}, ...]
        """
        try:
            with db_session_context() as db:
                stmt = select(ConvertibleBond.ts_code, ConvertibleBond.stk_code).where(
                    ConvertibleBond.stk_code.isnot(None)
                )
                result = db.exec(stmt).all()
                return [{"ts_code": row[0], "stk_code": row[1]} for row in result if row[0] and row[1]]
        except Exception as e:
            logger.warning(f"获取活跃可转债映射失败: {e}")
            return []

    @staticmethod
    def get_hot_bond_codes() -> List[str]:
        """
        获取所有有热度数据的可转债代码列表（按hot_rank排序）
        
        Returns:
            热门可转债代码列表
        """
        try:
            with db_session_context() as db:
                stmt = select(ConvertibleBond.ts_code).where(
                    ConvertibleBond.hot_rank.isnot(None)
                ).order_by(ConvertibleBond.hot_rank.asc())
                result = db.exec(stmt).all()
                return list(result)
        except Exception as e:
            logger.warning(f"获取热门可转债代码失败: {e}")
            return []

    # ==================== 统计方法 ====================

    @staticmethod
    def get_convertible_bonds_by_stock(stock_code: str) -> List[Dict[str, Any]]:
        """
        根据股票代码获取关联的可转债
        
        Args:
            stock_code: 股票代码
            
        Returns:
            可转债字典列表（避免Session生命周期问题）
        """
        try:
            # 🔧 修复Session问题：在Session内转换为字典，避免Session外访问ORM对象
            with db_session_context() as db:
                stmt = select(ConvertibleBond).where(
                    ConvertibleBond.stk_code == stock_code
                )
                bonds = db.exec(stmt).all()
                
                # 🚀 SQLModel优化：使用列表推导式 + model_dump()，简洁高效
                return [bond.model_dump(mode='json') for bond in bonds]
        except Exception as e:
            logger.error(f"批量查询可转债失败: {e}")
            return []

    # ==================== 聚合统计 ====================

    @staticmethod
    def get_convertible_bond_stats_aggregated(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        trade_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下可转债的明细数据。
        
        返回items列表，summary由前端从items计算。
        """
        # 默认空结果结构
        empty_payload: Dict[str, Any] = {
            "items": [],
        }

        if not trade_date:
            logger.warning("get_convertible_bond_stats_aggregated 未提供 trade_date，返回空统计结果")
            return empty_payload
            
        try:
            from datetime import datetime
            target_date = datetime.strptime(trade_date, "%Y%m%d").date()
            year = target_date.year
        except Exception as e:
            logger.warning(f"解析 trade_date 失败({trade_date}): {e}")
            return empty_payload
        
        # 获取K线表模型
        kline_model = TableFactory.get_table_model(TableTypes.CONVERTIBLE_BOND, year)
        if kline_model is None:
            logger.warning(f"未找到年份 {year} 的可转债K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                cb_model, _ = TableTypes.get_model_info(TableTypes.CONVERTIBLE_BOND)
                m = kline_model
                
                from sqlalchemy import exists
                
                # 构建基础表的筛选条件子查询
                base_exists_subq = select(cb_model.ts_code).where(
                    cb_model.ts_code == m.ts_code
                ).correlate(m)
                
                # 应用筛选和搜索条件
                base_exists_subq = ConvertibleBondDAO._apply_filter_conditions(
                    base_exists_subq, filters, search, search_fields, cb_model
                )
                
                # 查询所有可转债明细数据
                items_query = select(
                    m.ts_code,
                    cb_model.bond_short_name,
                    m.close,
                    m.open,
                    m.pct_chg,
                    m.amount,
                    m.circ_mv,
                ).select_from(m).join(
                    cb_model, m.ts_code == cb_model.ts_code
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
                    items.append({
                        "code": row.ts_code,
                        "name": row.bond_short_name or "",
                        "open": open_val,  # 开盘价
                        "close": float(row.close) if row.close else 0.0,
                        "pct_chg": float(row.pct_chg) if row.pct_chg else 0.0,
                        "intraday_pct": intraday_pct,
                        "amount": float(row.amount) if row.amount else 0.0,
                        "circ_mv": float(row.circ_mv) if row.circ_mv else 0.0,
                    })
                
                return {
                    "items": items,
                }

        except Exception as e:
            logger.error(f"get_convertible_bond_stats_aggregated 统计失败: {e}")
            return empty_payload

    @staticmethod
    def get_convertible_bond_compare_stats(
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        base_date: Optional[str] = None,
        compare_date: Optional[str] = None,
        sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """计算两个日期之间的可转债涨跌对比统计。
        
        计算公式：(B日收盘 - A日开盘) / A日开盘 * 100
        """
        empty_payload: Dict[str, Any] = {
            "base_date": base_date or "",
            "compare_date": compare_date or "",
            "items": [],
        }
        
        if not base_date or not compare_date:
            logger.warning("get_convertible_bond_compare_stats 缺少 base_date 或 compare_date")
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
        
        base_kline_model = TableFactory.get_table_model(TableTypes.CONVERTIBLE_BOND, base_year)
        compare_kline_model = TableFactory.get_table_model(TableTypes.CONVERTIBLE_BOND, compare_year)
        
        if base_kline_model is None or compare_kline_model is None:
            logger.warning(f"未找到年份 {base_year} 或 {compare_year} 的可转债K线表模型")
            return empty_payload
        
        try:
            with db_session_context() as db:
                cb_model, _ = TableTypes.get_model_info(TableTypes.CONVERTIBLE_BOND)
                
                # 构建筛选后的可转债子查询
                filtered_bonds = select(cb_model.ts_code, cb_model.bond_short_name)
                filtered_bonds = ConvertibleBondDAO._apply_filter_conditions(
                    filtered_bonds, filters, search, search_fields, cb_model
                )
                filtered_bonds_subq = filtered_bonds.subquery()
                
                # 调试：统计筛选后的可转债数量
                bond_count = db.exec(select(func.count()).select_from(filtered_bonds_subq)).one()
                logger.debug(f"可转债对比统计 | 筛选后可转债数: {bond_count}")
                
                # 同年优化：使用 IN 子查询利用唯一索引 (ts_code, period, trade_date)
                if base_year == compare_year:
                    k = base_kline_model
                    
                    # 构建 ts_code IN (...) 子查询
                    ts_codes_subq = select(filtered_bonds_subq.c.ts_code)
                    
                    # 🚀 查询1：只查询 A日 和 B日 两天数据（快速）
                    price_query = select(
                        k.ts_code,
                        filtered_bonds_subq.c.bond_short_name,
                        func.max(case((k.trade_date == base_dt, k.open))).label("open_a"),
                        func.max(case((k.trade_date == compare_dt, k.close))).label("close_b"),
                        func.max(case((k.trade_date == compare_dt, k.circ_mv))).label("circ_mv_b"),
                    ).select_from(k).join(
                        filtered_bonds_subq, k.ts_code == filtered_bonds_subq.c.ts_code
                    ).where(
                        k.ts_code.in_(ts_codes_subq),
                        k.period == sort_period,
                        k.trade_date.in_([base_dt, compare_dt])
                    ).group_by(k.ts_code, filtered_bonds_subq.c.bond_short_name)
                    
                    price_results = db.exec(price_query).all()
                    logger.debug(f"可转债对比统计 | 日期: {base_date}->{compare_date} | 价格查询结果数: {len(price_results)}")
                    
                    # 🚀 查询2：区间累计成交额（使用KlineAggregator优化）
                    from .utils.kline_aggregator import KlineAggregator
                    from .utils.kline_extreme_aggregator import KlineExtremeAggregator
                    amount_map = KlineAggregator.query_cumulative(
                        db_session_context, k, ts_codes_subq, base_dt, compare_dt
                    )
                    
                    # 🚀 查询3：区间极端值（最高价、最低价）
                    extreme_map = KlineExtremeAggregator.query_extremes(
                        db_session_context, k, ts_codes_subq, base_dt, compare_dt
                    )
                    
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
                                "name": r.bond_short_name or "",
                                "open": open_a,
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
                
                # 🚀 跨年查询：分离查询优化
                k_a = base_kline_model
                k_b = compare_kline_model
                
                # 构建 ts_code IN (...) 子查询
                ts_codes_subq = select(filtered_bonds_subq.c.ts_code)
                
                # 🚀 查询1：只查询 A日 和 B日 的价格数据（快速）
                price_a_query = select(
                    k_a.ts_code.label("ts_code"),
                    k_a.open.label("open_a"),
                ).select_from(k_a).join(
                    filtered_bonds_subq, k_a.ts_code == filtered_bonds_subq.c.ts_code
                ).where(
                    k_a.ts_code.in_(ts_codes_subq),
                    k_a.period == sort_period,
                    k_a.trade_date == base_dt
                )
                price_a_results = db.exec(price_a_query).all()
                price_a_map = {r.ts_code: float(r.open_a) if r.open_a else None for r in price_a_results}
                
                price_b_query = select(
                    k_b.ts_code.label("ts_code"),
                    filtered_bonds_subq.c.bond_short_name,
                    k_b.close.label("close_b"),
                    k_b.circ_mv.label("circ_mv_b"),
                ).select_from(k_b).join(
                    filtered_bonds_subq, k_b.ts_code == filtered_bonds_subq.c.ts_code
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
                
                # 合并极端值：high取最大，low取最小
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
                        
                        # 计算区间极端涨跌幅
                        extreme = extreme_map.get(r.ts_code, {})
                        high_price = float(extreme.get("high", 0.0))
                        low_price = float(extreme.get("low", 0.0))
                        max_pct = ((high_price - open_a) / open_a * 100) if high_price > 0 else None
                        min_pct = ((low_price - open_a) / open_a * 100) if low_price > 0 else None
                        
                        items.append({
                            "code": r.ts_code,
                            "name": r.bond_short_name or "",
                            "open": open_a,
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
            logger.error(f"get_convertible_bond_compare_stats 统计失败: {e}")
            return empty_payload

    @staticmethod
    def sync_hot_data(
            hot_data_list: List[Dict[str, Any]],
            trade_date: str,
    ) -> Dict[str, Any]:
        """
        同步可转债热度数据到基础表（convertible_bonds表）
        
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

            # 批量更新基础表的热度字段（仅更新已存在的记录）
            stats = batch_operations.bulk_upsert_mysql_generated(
                table_model=ConvertibleBond,
                data=update_data,
                batch_size=DAOConfig.DEFAULT_BATCH_SIZE,
            )
            
            # 直接返回标准格式
            return DAOConfig.format_upsert_result(stats)

        except Exception as e:
            logger.error(f"同步可转债热度数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(hot_data_list) if hot_data_list else 0
            })

    @staticmethod
    def get_ts_codes_by_underlying_circ_mv_range(
        min_cap: Optional[float] = None,
        max_cap: Optional[float] = None,
        trade_date: Optional[str] = None,
        period: str = 'daily',
    ) -> List[str]:
        """
        根据正股流通市值范围筛选可转债代码（从K线表查询正股流通市值）
        
        Args:
            min_cap: 最小流通市值（亿），None表示不限
            max_cap: 最大流通市值（亿），None表示不限
            trade_date: 基准日期（YYYYMMDD），必须提供
            period: K线周期，默认daily
            
        Returns:
            符合正股流通市值范围的可转债代码列表
        """
        from sqlmodel import text
        from ..models import TableFactory, db_session_context
        from ..constants.table_types import TableTypes
        
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
                stock_codes = [row[0] for row in result if row[0]]
                
                if not stock_codes:
                    return []
                
                # 根据正股代码查询对应的可转债代码
                stmt = select(ConvertibleBond.ts_code).where(
                    ConvertibleBond.stk_code.in_(stock_codes),
                    ConvertibleBond.ts_code.isnot(None)
                )
                bond_result = db.exec(stmt).all()
                return [r for r in bond_result if r]
        except Exception as e:
            logger.warning(f"按正股流通市值范围筛选可转债失败: {e}")
            return []


# 创建全局实例
convertible_bond_dao = ConvertibleBondDAO()
