"""
通用查询工具 - 升级SQLModel
提供通用的数据库查询方法和专用工具函数
"""
from functools import lru_cache
from typing import List, Dict, Any, Optional, Type

from loguru import logger
from sqlmodel import select, or_, desc, asc, and_, func, case

from .dao_config import DAOConfig
from ..constants.table_types import TableTypes
from ..models import db_session_context


class QueryUtils:
    """通用查询工具类"""
    
    # 🚀 优化：将字段配置提取为类常量，便于维护
    COMMON_KLINE_FIELDS = frozenset(['pct_chg', 'amount', 'vol', 'volatility', 'intraperiod_pct_chg'])
    CONCEPT_INDUSTRY_FIELDS = frozenset(['total_mv', 'turnover_rate'])
    AUCTION_FIELDS = frozenset([
        'auction_vol', 'auction_amount', 'auction_turnover_rate', 
        'auction_volume_ratio', 'auction_pct_chg'
    ])
    SPECIAL_CALCULATED_FIELDS = frozenset(['call_countdown', 'max_concept_heat', 'max_industry_heat'])

    @staticmethod
    def get_all_records(
            model_class: Type,
            filters: Optional[Dict[str, Any]] = None,
            search: Optional[str] = None,
            search_fields: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_order: str = "asc",
            limit: Optional[int] = None,
            offset: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        获取所有记录（支持搜索、筛选、排序、分页）
        
        Args:
            model_class: 模型类
            filters: 过滤条件字典
            search: 搜索关键词
            search_fields: 搜索字段列表
            sort_by: 排序字段
            sort_order: 排序方向 (asc/desc)
            limit: 限制数量
            offset: 偏移量
            
        Returns:
            记录列表
        """
        # 🚀 SQLModel优化：使用上下文管理器和现代查询语法
        with db_session_context() as db:
            # 构建SQLModel查询
            stmt = select(model_class)

            # 应用搜索条件
            if search and search_fields:
                search_conditions = []
                for field_name in search_fields:
                    if hasattr(model_class, field_name):
                        field = getattr(model_class, field_name)
                        search_conditions.append(field.like(f"%{search}%"))

                if search_conditions:
                    stmt = stmt.where(or_(*search_conditions))

            # 应用过滤条件
            if filters:
                for field_name, value in filters.items():
                    if hasattr(model_class, field_name):
                        field = getattr(model_class, field_name)
                        if isinstance(value, list):
                            stmt = stmt.where(field.in_(value))
                        else:
                            stmt = stmt.where(field == value)

            # 应用排序
            if sort_by and hasattr(model_class, sort_by):
                field = getattr(model_class, sort_by)
                nulls_last_expr = case(
                    (field.is_(None), 1),
                    else_=0
                ).asc()
                if sort_order.lower() == "desc":
                    stmt = stmt.order_by(nulls_last_expr, desc(field))
                else:
                    stmt = stmt.order_by(nulls_last_expr, asc(field))

            # 应用分页
            if offset:
                stmt = stmt.offset(offset)
            if limit is not None and limit > 0:
                stmt = stmt.limit(limit)

            try:
                # 执行查询
                records = db.exec(stmt).all()
                # 转换为字典格式
                return QueryUtils._records_to_dicts(records, model_class)
            except Exception as e:
                logger.warning(f"查询 {model_class.__name__} 数据失败: {e}")
                return []

    # ==================== 私有辅助方法 ====================

    @staticmethod
    def _record_to_dict(record: Any, model_class: Type) -> Dict[str, Any]:
        """将单条记录转换为字典 - 优化版本"""
        if hasattr(record, '__dict__'):
            # SQLModel对象转换
            record_dict = {}
            for column in model_class.__table__.columns:
                field_name = column.name
                value = getattr(record, field_name, None)
                record_dict[field_name] = QueryUtils._format_field_value(value, column.type)
        else:
            # 如果已经是字典，直接使用
            record_dict = record if isinstance(record, dict) else {}

        # 添加计算字段：is_hot（基于hot_score是否有值）
        hot_score = record_dict.get('hot_score')
        record_dict['is_hot'] = bool(hot_score and hot_score > 0)

        return record_dict
    
    @staticmethod
    def _format_field_value(value: Any, column_type) -> Any:
        """格式化字段值"""
        if value is None:
            return None
            
        try:
            from sqlalchemy import Date, DateTime
            if isinstance(column_type, Date):
                return value.strftime("%Y-%m-%d") if hasattr(value, 'strftime') else value
            elif isinstance(column_type, DateTime):
                return value.strftime("%Y-%m-%d %H:%M:%S") if hasattr(value, 'strftime') else value
            else:
                return value
        except Exception:
            return value

    @staticmethod
    def _records_to_dicts(records: List[Any], model_class: Type) -> List[Dict[str, Any]]:
        """将记录列表转换为字典列表"""
        result = []
        for record in records:
            result.append(QueryUtils._record_to_dict(record, model_class))
        return result



    @staticmethod
    def _is_kline_table_field(field_name: str) -> bool:
        """
        判断字段是否为 K 线表字段 - 优化版本
        使用frozenset提高查询性能，便于维护字段配置
        """
        return (field_name in QueryUtils.COMMON_KLINE_FIELDS or 
                field_name in QueryUtils.CONCEPT_INDUSTRY_FIELDS or 
                field_name in QueryUtils.AUCTION_FIELDS)
    
    @staticmethod
    def _is_special_calculated_field(field_name: str) -> bool:
        """
        判断字段是否为特殊计算字段（需要特殊处理的字段） - 优化版本
        """
        return field_name in QueryUtils.SPECIAL_CALCULATED_FIELDS

    @staticmethod
    def _determine_kline_period(sort_by: str, sort_period: str) -> str:
        """确定 K 线字段的查询周期 - 优化版本"""
        # 概念/行业字段和竞价数据字段，始终使用 daily 周期
        if (sort_by in QueryUtils.CONCEPT_INDUSTRY_FIELDS or 
            sort_by in QueryUtils.AUCTION_FIELDS):
            return 'daily'
        
        # 其他字段使用 sort_period 参数
        return sort_period


    @staticmethod
    def get_records_smart(
        *,  # 强制要求所有参数都是关键字参数
        table_type: str,  # 只需要表类型，其他参数可以根据表类型自动确定
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
        统一的智能查询方法：消除分支冗余
        
        核心思路：
        1. 如果是K线字段，先从k线表获取排序后的codes作为筛选条件
        2. 统一调用基础表查询，根据是否有codes决定排序方式
        3. 始终返回基础表数据（前端列表不需要K线字段值）
        
        Args:
            table_type: 表类型
            filters: 过滤条件
            search: 搜索关键字
            search_fields: 搜索字段列表
            sort_by: 排序字段
            sort_period: 排序周期（daily/weekly/monthly）
            sort_order: 排序方向（asc/desc）
            limit: 限制数量
            offset: 偏移量
            trade_date: 交易日期（YYYYMMDD格式，前端传入）
                
        Returns:
            {"data": List[Dict], "total": int}
        """
        
        # 默认排序字段
        if not sort_by:
            sort_by = "hot_score"
            
        # Step 1: 使用排序策略获取排序后的codes
        ordered_codes = QueryUtils._get_sorted_codes_by_strategy(
            table_type, sort_by, sort_order, sort_period, trade_date
        )
        
        # 对于需要排序但没有排序数据的情况进行处理
        if QueryUtils._requires_external_sorting(sort_by) and ordered_codes is None:
            logger.warning(f"未获取到 {sort_by} 字段的排序数据")
            from .dao_config import DAOConfig
            return DAOConfig.format_query_result([])
        
        # Step 2: 统一的基础表查询（包含K线排序的codes筛选）
        return QueryUtils._query_base_table_unified(
            table_type=table_type,
            filters=filters,
            search=search,
            search_fields=search_fields,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
            ordered_codes=ordered_codes,  # K线排序结果（如果有）
        )

    @staticmethod
    def _build_base_query(db, model_class, search, search_fields, filters, ordered_codes, entity_code_field):
        """构建基础查询（包含搜索和过滤条件） - SQLModel优化版"""
        # 🚀 使用SQLModel的select语法
        stmt = select(model_class)
        
        # 应用搜索条件
        if search and search_fields:
            search_conditions = []
            for field_name in search_fields:
                if hasattr(model_class, field_name):
                    field = getattr(model_class, field_name)
                    search_conditions.append(field.like(f"%{search}%"))
            
            if search_conditions:
                stmt = stmt.where(or_(*search_conditions))
        
        # 应用过滤条件
        enhanced_filters = filters.copy() if filters else {}
        if ordered_codes:
            # 如果已存在实体代码过滤（例如策略筛选出的 selected_codes），
            # 则需要与排序结果 ordered_codes 取交集，避免覆盖掉原有策略过滤。
            existing_codes = enhanced_filters.get(entity_code_field)
            if existing_codes is not None:
                # 将现有代码过滤统一转换为集合
                if isinstance(existing_codes, list):
                    existing_set = set(existing_codes)
                else:
                    existing_set = {existing_codes}

                # 按 ordered_codes 顺序保留交集，保证排序稳定性
                intersected = [code for code in ordered_codes if code in existing_set]
                enhanced_filters[entity_code_field] = intersected
            else:
                # 仅有排序结果时，直接使用 ordered_codes 作为代码过滤集合
                enhanced_filters[entity_code_field] = ordered_codes
        
        if enhanced_filters:
            for field_name, value in enhanced_filters.items():
                if hasattr(model_class, field_name):
                    field = getattr(model_class, field_name)
                    if isinstance(value, list):
                        stmt = stmt.where(field.in_(value))
                    else:
                        stmt = stmt.where(field == value)
        
        return stmt
    
    @staticmethod
    def _build_deduplicated_query(db, model_class, base_stmt, name_field):
        """构建去重查询 - SQLModel优化版"""
        # 🚀 使用SQLModel构建子查询
        name_field_attr = getattr(model_class, name_field)
        
        # 子查询：获取每个name的最大创建时间和最大ID
        subquery = select(
            name_field_attr.label('name'),
            func.max(model_class.created_at).label('max_created_at'),
            func.max(model_class.id).label('max_id')
        ).group_by(name_field_attr)
        
        # 如果base_stmt有条件，需要应用到子查询上
        if hasattr(base_stmt, 'whereclause') and base_stmt.whereclause is not None:
            subquery = subquery.where(base_stmt.whereclause)
        
        subquery = subquery.subquery()
        
        # 主查询：JOIN子查询，确保唯一性
        stmt = select(model_class).join(
            subquery,
            and_(
                name_field_attr == subquery.c.name,
                model_class.created_at == subquery.c.max_created_at,
                model_class.id == subquery.c.max_id
            )
        )
        
        return stmt
    
    @staticmethod
    def _execute_query_with_pagination(db, stmt, model_class, entity_code_field, ordered_codes, 
                                     sort_by, sort_order, limit, offset):
        """执行查询并应用排序、分页 - SQLModel优化版"""
        
        # 🚀 优化：分别获取总数和数据，避免重复查询
        # 获取总数（使用count查询）
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.exec(count_stmt).one()
        
        # 🔧 修复：如果有K线排序，需要先获取全部数据再排序后分页
        if ordered_codes:
            # 获取全部数据（不分页）
            records = db.exec(stmt).all()
            
            # 转换为字典格式
            data = QueryUtils._records_to_dicts(records, model_class)
            
            # 按K线排序顺序重新排列
            data = QueryUtils._preserve_kline_order(data, entity_code_field, ordered_codes)
            
            # 手动分页
            start_idx = offset or 0
            end_idx = start_idx + (limit or len(data))
            data = data[start_idx:end_idx]
            
        else:
            # 没有K线排序，使用基础表字段排序
            if hasattr(model_class, sort_by):
                field = getattr(model_class, sort_by)
                nulls_last_expr = case(
                    (field.is_(None), 1),
                    else_=0
                ).asc()
                if sort_order.lower() == "desc":
                    stmt = stmt.order_by(nulls_last_expr, desc(field))
                else:
                    stmt = stmt.order_by(nulls_last_expr, asc(field))
            
            # 应用分页
            if offset:
                stmt = stmt.offset(offset)
            if limit is not None and limit > 0:
                stmt = stmt.limit(limit)
            
            # 获取数据
            records = db.exec(stmt).all()
            
            # 转换为字典格式
            data = QueryUtils._records_to_dicts(records, model_class)
        
        return {"data": data, "total": int(total)}
    
    @staticmethod
    def _query_base_table_unified(
        table_type: str,
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        sort_by: str = "hot_score",
        sort_order: str = "desc",
        limit: Optional[int] = 100,
        offset: Optional[int] = 0,
        ordered_codes: Optional[List[str]] = None,  # K线排序结果
    ) -> Dict[str, Any]:
        """
        统一的基础表查询方法
        
        Args:
            table_type: 表类型
            ordered_codes: K线排序的codes列表，如果提供则按此顺序排序
            其他参数: 标准查询参数
        """
        # 根据表类型获取模型类和实体代码字段
        try:
            model_class, entity_code_field = TableTypes.get_model_info(table_type)
        except ValueError as e:
            logger.error(str(e))
            return DAOConfig.format_query_result([])
        
        # 🚀 SQLModel优化：使用上下文管理器
        with db_session_context() as db:
            try:
                # 获取名称字段
                name_field = TableTypes.get_name_field(table_type)
                
                # 构建基础查询
                base_stmt = QueryUtils._build_base_query(
                    db, model_class, search, search_fields, filters, ordered_codes, entity_code_field
                )
                
                # 根据是否有名称字段决定是否去重
                if name_field:
                    final_stmt = QueryUtils._build_deduplicated_query(db, model_class, base_stmt, name_field)
                else:
                    logger.warning(f"表类型 {table_type} 没有配置名称字段，跳过去重")
                    final_stmt = base_stmt
                
                # 应用排序、分页并获取结果
                return QueryUtils._execute_query_with_pagination(
                    db, final_stmt, model_class, entity_code_field, ordered_codes, 
                    sort_by, sort_order, limit, offset
                )
                
            except Exception as e:
                logger.warning(f"基础表查询失败: {e}")
                return DAOConfig.format_query_result([])
    
    
    
    @staticmethod
    def _preserve_kline_order(data: List[Dict], entity_code_field: str, ordered_codes: List[str]) -> List[Dict]:
        """保持K线排序的顺序"""
        if not data or not ordered_codes:
            return data
        
        # 创建顺序映射
        order_map = {code: index for index, code in enumerate(ordered_codes)}
        
        # 按照K线排序的顺序重新排列
        data.sort(key=lambda item: order_map.get(item.get(entity_code_field), float('inf')))
        
        return data

    @staticmethod
    def _get_sorted_codes_by_strategy(
        table_type: str, sort_by: str, sort_order: str, 
        sort_period: str, trade_date: Optional[str]
    ) -> Optional[List[str]]:
        """使用排序策略获取排序后的codes"""
        from .strategies.sorting_strategy import SortingStrategyFactory
        
        strategy = SortingStrategyFactory.create(sort_by)
        return strategy.get_sorted_codes(
            table_type=table_type,
            sort_by=sort_by,
            sort_order=sort_order,
            sort_period=sort_period,
            trade_date=trade_date
        )
    
    @staticmethod
    def _requires_external_sorting(sort_by: str) -> bool:
        """判断字段是否需要外部排序（非数据库原生排序）"""
        return (QueryUtils._is_kline_table_field(sort_by) or 
                QueryUtils._is_special_calculated_field(sort_by))


# 创建全局实例
query_utils = QueryUtils()


def delete_records_with_filter(model_class, filter_condition) -> int:
    """删除指定模型的记录（带过滤条件） - SQLModel升级
    
    Args:
        model_class: 模型类
        filter_condition: 过滤条件
        
    Returns:
        删除的记录数
    """
    # 🚀 SQLModel优化：使用上下文管理器
    with db_session_context() as db:
        try:
            # SQLModel方式删除记录
            stmt = select(model_class).where(filter_condition)
            records_to_delete = db.exec(stmt).all()
            deleted_count = len(records_to_delete)
            
            for record in records_to_delete:
                db.delete(record)
                
            return deleted_count
        except Exception as e:
            logger.error(f"删除 {model_class.__name__} 记录失败: {e}")
            # 删除操作失败，返回0表示没有删除任何记录
            return 0


def delete_kline_from_table(table_model, codes: List[str]) -> int:
    """删除指定代码的K线数据（单表操作）- SQLModel升级
    
    Args:
        table_model: 单个K线表模型
        codes: 代码列表
        
    Returns:
        删除的记录数
    
    Note:
        这是 DAO 层纯数据访问方法，只操作单个表。
        跨年份删除请使用 Service 层的 cleanup_kline_for_codes 方法。
    """
    # 🚀 SQLModel优化：使用上下文管理器
    with db_session_context() as db:
        try:
            # SQLModel方式删除记录
            stmt = select(table_model).where(table_model.ts_code.in_(codes))
            records_to_delete = db.exec(stmt).all()
            deleted_count = len(records_to_delete)
            
            for record in records_to_delete:
                db.delete(record)
                
            return deleted_count
        except Exception as e:
            logger.error(f"删除K线数据失败 (codes: {len(codes)}条): {e}")
            # 删除操作失败，返回0表示没有删除任何记录
            return 0


def delete_kline_by_date_range_from_table(
    model_class: Type,
    ts_code: str,
    start_date: str,
    end_date: str,
    periods: Optional[List[str]] = None
) -> int:
    """删除指定代码在指定日期范围内的K线数据（单表操作）- 通用版本
    
    Args:
        model_class: 单个K线表模型类（支持所有类型：stock/bond/concept/industry）
        ts_code: 代码
        start_date: 开始日期 (YYYYMMDD)
        end_date: 结束日期 (YYYYMMDD)
        periods: 可选，周期列表（如 ["daily", "weekly"]），为空则删除所有周期
        
    Returns:
        删除的记录数
    
    Note:
        这是 DAO 层纯数据访问方法，只操作单个表。
        跨年份删除请使用 Service 层的 delete_code_kline_by_date_range 方法。
    """
    # 🚀 SQLModel优化：使用上下文管理器
    with db_session_context() as db:
        try:
            # 构建删除条件：ts_code + 日期范围
            conditions = [
                model_class.ts_code == ts_code,
                model_class.trade_date >= start_date,
                model_class.trade_date <= end_date
            ]
            
            # 如果指定了周期，增加周期过滤条件
            if periods:
                conditions.append(model_class.period.in_(periods))
            
            stmt = select(model_class).where(*conditions)
            records_to_delete = db.exec(stmt).all()
            deleted_count = len(records_to_delete)
            
            for record in records_to_delete:
                db.delete(record)
                
            return deleted_count
        except Exception as e:
            logger.error(f"删除K线数据失败 (code: {ts_code}, {start_date}-{end_date}, periods: {periods}): {e}")
            # 删除操作失败，返回0表示没有删除任何记录
            return 0


@lru_cache(maxsize=1)  # 🚀 缓存结果，避免重复查询数据库表结构
def get_kline_table_years() -> List[int]:
    """获取所有K线分表的年份列表 - 优化版本
    
    Returns:
        年份列表，按降序排列
    """
    import re
    from sqlalchemy import inspect
    from ..models import engine

    # 🚀 优化：编译正则表达式，提高匹配性能
    KLINE_TABLE_PATTERN = re.compile(r".*_klines_(\d{4})$")

    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    years_set = set()
    
    # 🚀 优化：使用编译后的正则表达式
    for table_name in table_names:
        match = KLINE_TABLE_PATTERN.match(table_name)
        if match:
            years_set.add(int(match.group(1)))

    return sorted(years_set, reverse=True)
