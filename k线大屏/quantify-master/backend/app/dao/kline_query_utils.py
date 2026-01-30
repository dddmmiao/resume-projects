"""
K线数据查询工具 - SQLModel优化版本
专门处理K线数据的查询逻辑
"""
import time
from datetime import date
from typing import List, Dict, Any, Optional, Union

from loguru import logger
from sqlmodel import select, func, and_, text

from .query_config import QueryConfig
from ..constants.table_types import TableTypes
from ..models import TableFactory, db_session_context
from ..models.schemas.kline_schemas import (
    BaseKlineItem,
    StockKlineItem,
    IndexKlineItem,
    ConvertibleBondKlineItem
)


class KlineQueryUtils:
    """K线数据查询工具类"""
    
    # 🚀 性能优化：表类型到模型类的映射
    _MODEL_TYPE_MAPPING = {
        TableTypes.STOCK: StockKlineItem,
        TableTypes.CONVERTIBLE_BOND: ConvertibleBondKlineItem,
        TableTypes.CONCEPT: IndexKlineItem,
        TableTypes.INDUSTRY: IndexKlineItem,
    }
    
    @staticmethod
    def _get_latest_dates_from_kline_tables(
            codes: List[str],
            periods: List[str],
            table_type: str,
            trade_date: Optional[str] = None
    ) -> Dict[str, Dict[str, date]]:
        """
        直接从K线表查询最新日期 - SQLModel优化版本
        
        Args:
            codes: 代码列表
            periods: 周期列表
            table_type: 表类型 (stock, convertible_bond, concept, industry)
            
        Returns:
            {code: {period: date}} 字典，date 是 date 对象
        """
        if not codes or not periods:
            return {}
        
        # 🚀 SQLModel优化：使用上下文管理器
        with db_session_context() as db:
            try:
                result: Dict[str, Dict[str, date]] = {}
                
                # 确定查询的年份范围
                years_to_query = QueryConfig.get_default_years()
                
                # 如果提供了交易日期，使用该年份
                if trade_date:
                    year = int(trade_date[:4])
                    years_to_query = [year]
                
                # 🚀 优化：使用SQLModel构建查询
                for period in periods:
                    period_dates = {}
                    
                    # 获取有效的表模型
                    valid_tables = []
                    for year in years_to_query:
                        table_model = TableFactory.get_table_model(table_type, year)
                        if table_model:
                            valid_tables.append(table_model)
                    
                    if valid_tables:
                        # � SQLModel优化：使用正确的SQLModel查询语法
                        for table_model in valid_tables:
                            try:
                                # SQLModel正确语法：直接使用模型类进行查询
                                stmt = (
                                    select(
                                        table_model.ts_code,
                                        func.max(table_model.trade_date).label('latest_date')
                                    )
                                    .where(
                                        and_(
                                            table_model.ts_code.in_(codes),
                                            table_model.period == period
                                        )
                                    )
                                    .group_by(table_model.ts_code)
                                )
                                
                                # 执行SQLModel查询
                                query_result = db.exec(stmt)
                                for row in query_result:
                                    code = row.ts_code
                                    latest_date = row.latest_date
                                    if code not in period_dates or latest_date > period_dates[code]:
                                        period_dates[code] = latest_date
                            except Exception as table_error:
                                logger.debug(f"查询表失败 {table_model.__tablename__}: {table_error}")
                                continue
                    
                    # 保存这个周期的结果
                    for code in codes:
                        if code not in result:
                            result[code] = {}
                        result[code][period] = period_dates.get(code)
                
                return result
                
            except Exception as e:
                logger.error(f"查询最新K线日期失败: {e}")
                return {}

    
    @staticmethod
    def _convert_to_kline_item(
            item_dict: Dict[str, Any],
            table_type: str
    ) -> Union[StockKlineItem, IndexKlineItem, ConvertibleBondKlineItem, BaseKlineItem]:
        """
        将字典转换为对应的K线数据项（Pydantic模型会自动过滤未定义的字段）
        
        Args:
            item_dict: K线数据字典（包含所有字段，包括指标字段）
            table_type: 表类型 (使用 TableTypes 常量)
            
        Returns:
            对应的Pydantic模型实例（自动过滤指标字段）
        """
        # 🚀 性能优化：使用字典映射替代if-elif链
        # Pydantic模型会自动忽略未定义的字段（如指标字段）
        # 注意：open, high, low, close 字段现在允许为 None（Optional[float]）
        try:
            model_class = KlineQueryUtils._MODEL_TYPE_MAPPING.get(table_type, BaseKlineItem)
            return model_class(**item_dict)
        except Exception as e:
            logger.error(f"转换K线数据项失败: {e}, item_dict keys: {list(item_dict.keys())}, table_type: {table_type}")
            return None
    
    @staticmethod
    def convert_kline_data_to_models(
            data: List[Dict[str, Any]],
            table_type: str
    ) -> List[Union[StockKlineItem, IndexKlineItem, ConvertibleBondKlineItem, BaseKlineItem]]:
        """
        将K线数据字典列表转换为Pydantic模型列表（通用方法）
        
        Args:
            data: K线数据字典列表（包含所有字段，包括指标字段），明确类型为 List[Dict[str, Any]]
            table_type: 表类型 (使用 TableTypes 常量)
            
        Returns:
            Pydantic模型列表（自动过滤指标字段）
        """
        result = []
        for item_dict in data:
            # item_dict 明确是 Dict[str, Any] 类型
            # 注意：open, high, low, close 字段现在允许为 None（Optional[float]）
            kline_item = KlineQueryUtils._convert_to_kline_item(item_dict, table_type)
            if kline_item is not None:
                result.append(kline_item)
            # 如果转换失败返回None，自动跳过，不需要额外的try-catch
        
        return result
    
    @staticmethod
    def get_kline_data(
            ts_code: str,
            period: str,
            table_type: str,
            limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        获取K线数据（支持分表查询） - SQLModel重构版
        
        Args:
            ts_code: 证券代码
            period: 周期类型
            table_type: 表类型 (stock, convertible_bond, concept, industry)
            limit: 限制数量
            
        Returns:
            K线数据列表（按时间正序排列，确保指标计算的连续性）
        """
        query_start_time = time.time()
        
        # 🚀 SQLModel优化：使用上下文管理器，自动处理连接管理
        with db_session_context() as db:
            try:
                # 确定查询的年份范围（使用查询配置，与同步配置分离）
                years_to_query = QueryConfig.get_query_years()
                all_data: List[Dict[str, Any]] = []

                # 🚀 优化：构建更安全的UNION ALL查询
                # 这里按年份降序排列：优先获取最近年份的数据
                valid_tables = []
                
                # 收集所有有效的表（按年份从大到小）
                for year in sorted(years_to_query, reverse=True):
                    table_model = TableFactory.get_table_model(table_type, year)
                    if table_model:
                        valid_tables.append(table_model)
                
                if valid_tables:
                    # � 修复：简化查询逻辑，避免UNION ALL的SQLAlchemy语法问题
                    
                    # 🔧 最终解决方案：使用原生SQL查询
                    # SQLModel动态表在复杂继承场景下存在技术限制
                    for table_model in valid_tables:
                        # 如果调用方显式传入了 limit，视作全局限制
                        # 当已获取的数据量达到 limit 时，停止查询更早年份的表
                        if limit and int(limit) > 0 and len(all_data) >= int(limit):
                            break

                        try:
                            # 使用表名构建原生SQL查询
                            table_name = table_model.__tablename__
                            
                            sql = f"""
                                SELECT * FROM {table_name} 
                                WHERE ts_code = :ts_code 
                                AND period = :period 
                                ORDER BY trade_date DESC
                            """
                            
                            # 全局 limit：对单表使用“剩余条数”限制，避免超出目标上限
                            if limit and int(limit) > 0:
                                remaining = int(limit) - len(all_data)
                                if remaining <= 0:
                                    break
                                sql += f" LIMIT {remaining}"
                            
                            # 执行原生SQL查询，使用参数绑定防止SQL注入
                            result = db.execute(text(sql), {"ts_code": ts_code, "period": period})
                            
                            # 处理结果
                            for row in result:
                                # 将数据库行转换为字典
                                record_dict = dict(row._mapping) if hasattr(row, '_mapping') else dict(row)
                                all_data.append(KlineQueryUtils._process_kline_row(record_dict))
                        except Exception as table_error:
                            logger.debug(f"查询表失败 {table_name}: {table_error}")
                            continue
                else:
                    logger.warning(f"未找到 {table_type} 类型的表模型")
                
                # 按时间排序（正序：最旧的在前面，最新的在后面）
                all_data.sort(key=lambda x: x.get("trade_date", ""))

                # 防御性裁剪：若调用方传入 limit，则对最终结果再做一次全局切片
                if limit and int(limit) > 0 and len(all_data) > int(limit):
                    all_data = all_data[-int(limit):]
                
                # 记录查询耗时
                query_time = time.time() - query_start_time
                logger.debug(f"K线查询完成: {ts_code} | 数据量: {len(all_data)} | 耗时: {query_time:.3f}秒")
                
                return all_data
                
            except Exception as e:
                query_time = time.time() - query_start_time
                logger.error(f"获取K线数据失败: {e} | 耗时: {query_time:.3f}秒")
                return []

    @staticmethod
    def get_kline_data_for_codes(
            ts_codes: List[str],
            period: str,
            table_type: str,
            limit: int,
            end_date: Optional[str] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        query_start_time = time.time()

        # 参数与基本校验
        if not ts_codes:
            return {}
        try:
            per_code_limit = int(limit)
        except (TypeError, ValueError):
            logger.warning(f"get_kline_data_for_codes 收到非法 limit: {limit}")
            return {}
        if per_code_limit <= 0:
            return {}

        # 去重并清洗代码
        codes = list({code for code in ts_codes if code})
        if not codes:
            return {}

        # 规范化结束日期格式为 YYYY-MM-DD，便于与数据库 date 字段比较
        # 前端负责将周线/月线的日期转换为对应周期的结束日期
        end_date_db: Optional[str] = None
        if end_date:
            ed = str(end_date).replace("-", "")
            if len(ed) >= 8:
                end_date_db = f"{ed[:4]}-{ed[4:6]}-{ed[6:8]}"
            else:
                end_date_db = end_date

        with db_session_context() as db:
            try:
                # 根据end_date确定查询年份范围，避免查询无意义的未来年份表
                years_to_query = QueryConfig.get_query_years(end_date)

                # 结果按照代码聚合
                per_code_data: Dict[str, List[Dict[str, Any]]] = {code: [] for code in codes}
                remaining_codes = set(codes)

                # 按年份从近到远依次查询
                for year in sorted(years_to_query, reverse=True):
                    if not remaining_codes:
                        break

                    table_model = TableFactory.get_table_model(table_type, year)
                    if not table_model:
                        continue

                    table_name = table_model.__tablename__

                    # 为 IN 子句构建占位符，避免不同数据库对数组绑定的差异
                    code_params: Dict[str, Any] = {f"code_{i}": code for i, code in enumerate(remaining_codes)}
                    placeholders = ", ".join(f":{name}" for name in code_params.keys())

                    # MySQL 5.7 兼容写法：不使用窗口函数，直接查询后在Python中分组限制
                    sql = f"""
                        SELECT *
                        FROM {table_name}
                        WHERE ts_code IN ({placeholders})
                          AND period = :period
                    """

                    if end_date_db:
                        sql += "\n                          AND trade_date <= :end_date"

                    sql += """
                        ORDER BY ts_code, trade_date DESC
                    """

                    params: Dict[str, Any] = {
                        **code_params,
                        "period": period,
                    }

                    if end_date_db:
                        params["end_date"] = end_date_db

                    try:
                        result = db.execute(text(sql), params)
                        row_count = 0
                        for row in result:
                            row_count += 1
                            record_dict = dict(row._mapping) if hasattr(row, "_mapping") else dict(row)
                            code = record_dict.get("ts_code")
                            if not code or code not in remaining_codes:
                                continue

                            # 在Python中限制每个代码的记录数
                            data_list = per_code_data.setdefault(code, [])
                            if len(data_list) < per_code_limit:
                                processed = KlineQueryUtils._process_kline_row(record_dict)
                                data_list.append(processed)

                        logger.debug(f"表 {table_name} 查询返回 {row_count} 行")
                        
                        # 过滤掉已经达到 per_code_limit 的代码，后续年份不再查询
                        remaining_codes = {
                            code for code in remaining_codes
                            if len(per_code_data.get(code, [])) < per_code_limit
                        }
                    except Exception as table_error:
                        logger.warning(f"表查询失败 {table_name}: {table_error}")
                        continue

                # 统一按时间正序排序，并仅返回有数据的代码
                final_result: Dict[str, List[Dict[str, Any]]] = {}
                for code, items in per_code_data.items():
                    if not items:
                        continue
                    if len(items) > 1:
                        items.sort(key=lambda x: x.get("trade_date", ""))
                    # 防御性裁剪：每只代码最多 per_code_limit 条
                    if len(items) > per_code_limit:
                        items = items[-per_code_limit:]
                    final_result[code] = items

                query_time = time.time() - query_start_time
                logger.debug(
                    f"批量K线查询完成: table_type={table_type}, codes={len(codes)}, 有数据代码={len(final_result)} | 耗时: {query_time:.3f}秒"
                )
                return final_result
            except Exception as e:
                query_time = time.time() - query_start_time
                logger.error(f"批量获取K线数据失败: {e} | 耗时: {query_time:.3f}秒")
                return {}

    @staticmethod
    def _process_kline_row(row_dict: Dict[str, Any]) -> Dict[str, Any]:
        """处理K线数据行，进行必要的字段转换
        
        Args:
            row_dict: 原始K线数据字典
            
        Returns:
            处理后的K线数据字典
        """
        # 处理日期字段
        if "trade_date" in row_dict and row_dict["trade_date"]:
            if hasattr(row_dict["trade_date"], 'strftime'):
                row_dict["trade_date"] = row_dict["trade_date"].strftime("%Y%m%d")
        
        # 处理数值字段（包括Decimal类型）
        for key, value in row_dict.items():
            if value is not None and hasattr(value, '__float__') and key != "trade_date":
                try:
                    row_dict[key] = float(value)
                except (ValueError, TypeError):
                    pass
        
        return row_dict
    
    @staticmethod
    def _sqlmodel_to_dict(record) -> Dict[str, Any]:
        """将SQLModel对象转换为字典
        
        Args:
            record: SQLModel对象或字典
            
        Returns:
            转换后的字典
        """
        if hasattr(record, '__dict__'):
            # 获取SQLModel对象的所有字段值
            result = {}
            for column in record.__table__.columns:
                field_name = column.name
                field_value = getattr(record, field_name, None)
                result[field_name] = field_value
            return result
        else:
            # 如果已经是字典，直接返回
            return record if isinstance(record, dict) else {}
    
    
    @staticmethod
    def get_latest_kline_dates_by_code_and_period(
            codes: List[str],
            periods: List[str],
            table_type: str
    ) -> Dict[str, Dict[str, str]]:
        """一次性获取所有代码和所有周期的最新K线日期（直接从K线表获取）
        
        Args:
            codes: 代码列表
            periods: 周期类型列表 ('daily', 'weekly', 'monthly')
            table_type: 表类型 (stock, convertible_bond, concept, industry)
            
        Returns:
            {code: {period: 'YYYY-MM-DD'}} 代码和周期到最新日期的映射字典
        """
        if not codes or not periods:
            return {}
        
        total_start = time.time()
        result: Dict[str, Dict[str, str]] = {}
        
        try:
            # 直接从K线表获取最新日期
            kline_start = time.time()
            kline_dates = KlineQueryUtils._get_latest_dates_from_kline_tables(
                codes, periods, table_type
            )
            kline_time = time.time() - kline_start
            
            # 🚀 优化：批量转换日期格式，提高性能
            for code, period_dates in kline_dates.items():
                if code not in result:
                    result[code] = {}
                for period, date_value in period_dates.items():
                    if date_value:
                        # 处理不同的日期类型
                        if hasattr(date_value, 'strftime'):
                            result[code][period] = date_value.strftime('%Y-%m-%d')
                        else:
                            result[code][period] = str(date_value)
            
            hit_count = sum(
                1 for code in codes 
                if code in kline_dates and any(kline_dates[code].get(p) for p in periods)
            )
            
            total_time = time.time() - total_start
            logger.debug(
                f"📊 get_latest_kline_dates_by_code_and_period 从K线表直接获取，总耗时: {total_time:.3f}秒 | "
                f"查询耗时: {kline_time:.3f}秒 | "
                f"代码数: {len(codes)}, 周期数: {len(periods)}, 命中数: {hit_count}"
            )
            
            return result
        except Exception as e:
            logger.error(f"获取最新K线日期失败: {e}")
            return {}


# 创建全局实例
kline_query_utils = KlineQueryUtils()
