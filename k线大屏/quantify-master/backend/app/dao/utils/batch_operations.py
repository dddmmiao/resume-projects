"""
批量操作工具模块 - SQLModel优化版本
提供高效的批量插入、更新和删除功能，支持MySQL的UPSERT操作
自动推断唯一键约束，智能处理数据冲突，确保数据一致性
"""

import math
import os
import time
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, date
from functools import lru_cache, wraps
from typing import List, Dict, Any, Type, Set, Optional, Tuple, Callable

from loguru import logger
from sqlalchemy import func, UniqueConstraint, Index
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.exc import OperationalError
from sqlalchemy.sql import literal_column
from sqlmodel import Session

# 项目内部导入
from app.models import db_session_context


@dataclass
class BatchOpsConfig:
    """批量写库可调参数配置（单进程内常量，可按需扩展为可热更）。"""
    base_batch: int = 200  # 默认批量大小（降低以减少锁竞争，可被调用者 batch_size 覆盖）


# 🚀 优化：简化配置加载逻辑
def _load_batch_ops_config() -> BatchOpsConfig:
    """加载批量操作配置 - 优先级：SyncStrategyConfig > 环境变量 > 默认值"""
    default_config = BatchOpsConfig()
    
    # 1. 尝试从 SyncStrategyConfig 读取
    try:
        from ...services.management.sync_strategy_config import SyncStrategyConfig  # type: ignore
        config_base_batch = getattr(SyncStrategyConfig, "BATCH_OPS_BASE_BATCH", None)
        if config_base_batch is not None:
            default_config.base_batch = int(config_base_batch)
    except (ImportError, AttributeError, ValueError) as e:
        logger.debug(f"无法从SyncStrategyConfig加载配置: {e}")
    
    # 2. 环境变量覆盖
    try:
        env_base_batch = os.getenv("BATCH_OPS_BASE_BATCH")
        if env_base_batch is not None:
            default_config.base_batch = int(env_base_batch)
    except ValueError as e:
        logger.warning(f"环境变量BATCH_OPS_BASE_BATCH值无效: {e}")
    
    return default_config


_BATCH_OPS_CONFIG = _load_batch_ops_config()


class BatchOperations:
    """批量操作工具类 - SQLModel优化版本"""
    
    # 🚀 配置统一：使用DAOConfig中的配置，避免重复定义
    from ..dao_config import DAOConfig
    MAX_BATCH_SIZE = 2000  # 最大批次大小，防止死锁
    DEFAULT_BATCH_SIZE = DAOConfig.DEFAULT_BATCH_SIZE  # 使用统一配置
    
    # 🚀 常量定义：不可更新的字段集合
    NON_UPDATEABLE_FIELDS = frozenset({
        "id", "created_at", "updated_at"
    })  # 系统字段，不应在UPSERT时更新
    
    # 🚀 常量定义：缓存配置
    CACHE_SIZE_SMALL = 256  # 小型缓存大小
    CACHE_SIZE_LARGE = 512  # 大型缓存大小
    DEFAULT_UPSERT_BATCH_SIZE = 200  # 默认UPSERT批次大小（降低以减少锁竞争）
    
    # 🚀 死锁重试配置
    MAX_DEADLOCK_RETRIES = 3  # 最大重试次数
    DEADLOCK_RETRY_DELAY_BASE = 0.1  # 基础延迟（秒）
    DEADLOCK_RETRY_DELAY_MAX = 2.0  # 最大延迟（秒）
    
    @staticmethod
    def _safe_sort_batch_rows(batch_rows: List[Dict[str, Any]], unique_keys: List[str]) -> List[Dict[str, Any]]:
        """安全地对批次数据进行排序，降低死锁概率
        
        Args:
            batch_rows: 批次数据
            unique_keys: 唯一键列表
            
        Returns:
            排序后的批次数据
        """
        try:
            def _key_fn(r: Dict[str, Any]):
                return tuple(str(r.get(k)) for k in unique_keys)
            return sorted(batch_rows, key=_key_fn)
        except Exception as e:
            logger.warning(f"批次数据排序失败，使用原始顺序: {e}")
            return batch_rows
    
    @staticmethod
    def _execute_upsert_and_calculate_stats(db: Session, insert_stmt, update_cols: Dict, batch_size: int) -> Tuple[int, int]:
        """执行UPSERT操作并计算统计信息（带死锁自动重试）
        
        当发生死锁(Error 1213)或锁等待超时(Error 1205)时，自动重试
        使用指数退避策略，并添加随机抖动避免多个事务同时重试
        
        Args:
            db: 数据库会话
            insert_stmt: 插入语句
            update_cols: 更新列字典
            batch_size: 批次大小
            
        Returns:
            (插入数量, 更新数量)的元组
        """
        last_exception = None
        
        for attempt in range(BatchOperations.MAX_DEADLOCK_RETRIES):
            try:
                res = db.execute(insert_stmt.on_duplicate_key_update(**update_cols))
                affected = int(getattr(res, "rowcount", 0) or 0)
                approx_updated = max(0, affected - batch_size)
                approx_inserted = max(0, batch_size - approx_updated)
                return approx_inserted, approx_updated
                
            except OperationalError as e:
                error_code = getattr(e.orig, 'args', [None])[0]
                
                # 检查是否是死锁(1213)或锁等待超时(1205)
                if error_code in (1213, 1205):
                    last_exception = e
                    
                    if attempt < BatchOperations.MAX_DEADLOCK_RETRIES - 1:
                        # 计算退避延迟：指数增长 + 随机抖动
                        delay = min(
                            BatchOperations.DEADLOCK_RETRY_DELAY_BASE * (2 ** attempt),
                            BatchOperations.DEADLOCK_RETRY_DELAY_MAX
                        )
                        jitter = random.uniform(0, delay * 0.3)  # 30%随机抖动
                        total_delay = delay + jitter
                        
                        logger.warning(
                            f"死锁检测到(错误{error_code})，第{attempt + 1}/{BatchOperations.MAX_DEADLOCK_RETRIES}次重试，"
                            f"等待{total_delay:.2f}秒后重试"
                        )
                        time.sleep(total_delay)
                        continue
                    else:
                        logger.error(f"死锁重试{BatchOperations.MAX_DEADLOCK_RETRIES}次后仍失败: {e}")
                        raise
                else:
                    # 非死锁错误，直接抛出
                    logger.error(f"生成式 upsert 执行失败: {e}")
                    raise
                    
            except Exception as e:
                logger.error(f"生成式 upsert 执行失败: {e}")
                raise
        
        # 理论上不会到这里，但为了安全
        if last_exception:
            raise last_exception
    
    @staticmethod
    def _get_present_columns(batch_rows: List[Dict[str, Any]]) -> Set[str]:
        """获取批次数据中实际存在的列名
        
        Args:
            batch_rows: 批次数据
            
        Returns:
            存在的列名集合
        """
        present_cols = set()
        try:
            for r in batch_rows:
                present_cols.update(r.keys())
        except Exception as e:
            logger.warning(f"获取列名失败: {e}")
        return present_cols
    
    @staticmethod
    def _build_update_expression(table, table_name: str, column_name: str) -> str:
        """构建条件更新表达式
        
        Args:
            table: 表对象
            table_name: 表名
            column_name: 列名
            
        Returns:
            更新表达式字符串
        """
        try:
            col = table.columns[column_name]
            col_name = col.name if not hasattr(col, 'key') else col.key
            # 使用 IFNULL 避免 NULL 值覆盖原值
            return f"IFNULL(VALUES(`{col_name}`), `{table_name}`.`{col_name}`)"
        except Exception as e:
            logger.error(f"构造更新表达式失败 for column {column_name}: {e}")
            return None
    
    @staticmethod
    def _parse_date_string(date_str: str) -> date:
        """解析日期字符串为date对象
        
        Args:
            date_str: YYYYMMDD格式的日期字符串
            
        Returns:
            date对象
        """
        return datetime.strptime(date_str, "%Y%m%d").date()
    

    @staticmethod
    def bulk_upsert_mysql_generated(
            table_model: Type,
            data: List[Dict[str, Any]],
            batch_size: int = DEFAULT_UPSERT_BATCH_SIZE,
            enable_updated_at: bool = True,
    ) -> Dict[str, int]:
        """使用 MySQL 生成式 upsert（INSERT ... ON DUPLICATE KEY UPDATE）进行批量写入。

        - 自动推断唯一键；
        - 针对每批数据构造一次 insert + on duplicate 语句；
        - 简化版：不做变更感知、不做变更项跟踪。
        - 🚀 优化：统一使用SQLModel上下文管理器，简化API

        Args:
            table_model: 表模型类
            data: 数据列表
            batch_size: 批处理大小
            enable_updated_at: 是否自动更新 updated_at 字段

        Returns: {"inserted": int, "updated": int, "total": int}
        """
        if not data:
            return {"inserted": 0, "updated": 0, "total": 0}

        # 🚀 SQLModel优化：统一使用上下文管理器，简化API设计
        with db_session_context() as db:
            return BatchOperations._execute_bulk_upsert(
                db, table_model, data, batch_size, enable_updated_at
            )
    
    @staticmethod
    def _execute_bulk_upsert(
            db: Session, table_model: Type, data: List[Dict[str, Any]], 
            batch_size: int, enable_updated_at: bool
    ) -> Dict[str, int]:
        """执行批量upsert的核心逻辑 - 内部方法
        
        Args:
            db: 数据库会话对象
            table_model: 表模型类
            data: 数据列表
            batch_size: 批处理大小
            enable_updated_at: 是否自动更新updated_at字段
            
        Returns:
            包含插入、更新统计的字典
        """
        try:
            # 🚀 优化：直接使用缓存方法，避免不必要的类型转换
            unique_keys_tuple = BatchOperations._infer_unique_keys_from_model_cached(table_model)
            if not unique_keys_tuple:
                raise ValueError(f"模型 {table_model.__name__} 缺少业务唯一键约束")
            unique_keys = list(unique_keys_tuple)

            table = table_model.__table__
            unique_set = set(unique_keys)

            total_inserted = 0
            total_updated = 0
            total_count = 0

            # 🚀 优化：使用类常量，降低死锁概率
            eff_batch = max(1, min(int(batch_size or BatchOperations.DEFAULT_BATCH_SIZE), BatchOperations.MAX_BATCH_SIZE))

            # 🚀 优化：获取表的有效列名集合，用于过滤数据中不存在的列
            valid_columns = {col.name for col in table.columns}

            for i in range(0, len(data), eff_batch):
                batch_rows = data[i: i + eff_batch]
                if not batch_rows:
                    continue
                total_count += len(batch_rows)

                # 🚀 优化：过滤掉表中不存在的列，避免 "Unconsumed column names" 错误
                batch_rows = [
                    {k: v for k, v in row.items() if k in valid_columns}
                    for row in batch_rows
                ]

                # 🚀 优化：使用安全排序方法，确保锁获取顺序一致，降低死锁概率
                batch_rows = BatchOperations._safe_sort_batch_rows(batch_rows, unique_keys)

                # 生成 insert 语句
                insert_stmt = mysql_insert(table).values(batch_rows)

                
                update_cols = {}
                upd_names = BatchOperations._get_update_column_names_cached(table_model, tuple(sorted(unique_set)))
                # 获取表名，用于在 UPDATE 子句中限定列，避免歧义
                table_name = table.name
                
                # 方案3：条件更新 SQL
                # 前提：业务层已经统一字段结构，所有记录都包含相同的字段集合
                # - 新记录：基础字段有值，竞价字段有值
                # - 旧记录：基础字段为 NULL，竞价字段有值
                # 
                # 更新策略：所有字段都使用条件更新
                # IFNULL(VALUES(col), table.col) 表示：
                # - 如果新值不为 NULL，使用新值
                # - 如果新值为 NULL，保持原值（不更新）
                # 这样可以避免 NULL 值覆盖数据库中的原值
                
                # 🚀 优化：使用辅助方法获取存在的列
                present_cols = BatchOperations._get_present_columns(batch_rows)
                effective_upd_names = [c for c in upd_names if c in present_cols]
                
                # 🚀 优化：使用辅助方法构建更新表达式
                for c in effective_upd_names:
                    expr = BatchOperations._build_update_expression(table, table_name, c)
                    if expr:
                        update_cols[c] = literal_column(expr)
                if enable_updated_at and ("updated_at" in BatchOperations._get_model_columns_cached(table_model)):
                    update_cols["updated_at"] = func.now()

                if not update_cols:
                    # 🚀 优化：使用辅助方法执行INSERT IGNORE
                    inserted = BatchOperations._execute_insert_ignore(db, insert_stmt, len(batch_rows))
                    total_inserted += inserted
                    continue

                # 🚀 优化：使用辅助方法执行UPSERT并计算统计
                batch_inserted, batch_updated = BatchOperations._execute_upsert_and_calculate_stats(
                    db, insert_stmt, update_cols, len(batch_rows)
                )
                total_inserted += batch_inserted
                total_updated += batch_updated

            # SQLModel会话会自动提交/回滚，不需要手动管理
            return {
                "inserted": int(total_inserted),
                "updated": int(total_updated),
                "total": int(total_count)
            }
        except Exception as e:
            logger.error(f"批量upsert失败: {e}")
            raise

    @staticmethod
    def _sanitize_value(value: Any) -> Any:
        """将不可写入的值（如 NaN）转换为 None
        
        Args:
            value: 待清理的值
            
        Returns:
            清理后的值
        """
        try:
            if isinstance(value, float) and math.isnan(value):
                return None
        except (TypeError, ValueError):
            # isnan可能抛出TypeError（非数字类型）或ValueError
            pass
        return value


    @staticmethod
    @lru_cache(maxsize=256)  # 直接使用数值，避免循环引用
    def _infer_unique_keys_from_model_cached(model_cls: Type) -> Optional[Tuple[str, ...]]:
        """从模型推断唯一键约束 - 缓存版本
        
        推断规则（按优先级）：
        1) 表级 UniqueConstraint（复合唯一）
        2) 表级 Index 的唯一约束（unique=True）
        3) 列级 unique=True（单列唯一）
        
        Args:
            model_cls: SQLModel模型类
            
        Returns:
            唯一键字段名元组，若无则返回None
        """
        try:
            table = model_cls.__table__
            logger.debug(f"模型 {model_cls.__name__} 的表信息: 索引数量={len(getattr(table, 'indexes', []))}, 约束数量={len(getattr(table, 'constraints', []))}")
        except AttributeError as e:
            # 模型类没有__table__属性
            logger.debug(f"模型 {model_cls.__name__} 没有__table__属性: {e}")
            return None

        # 1) 表级唯一约束（取第一组）
        try:
            for cons in getattr(table, "constraints", set()) or set():
                try:
                    if isinstance(cons, UniqueConstraint):
                        cols = [c.name for c in cons.columns] if cons.columns else []
                        if cols:
                            return tuple(cols)
                except Exception:
                    continue
        except Exception:
            pass

        # 2) 表级 Index 的唯一约束（unique=True）
        try:
            indexes = getattr(table, "indexes", set()) or set()
            logger.debug(f"模型 {model_cls.__name__} 的索引检测: 共 {len(indexes)} 个索引")
            for idx in indexes:
                try:
                    is_unique = getattr(idx, "unique", False)
                    cols = [c.name for c in idx.columns] if hasattr(idx, 'columns') else []
                    logger.debug(f"索引 {getattr(idx, 'name', 'unnamed')}: unique={is_unique}, columns={cols}")
                    if isinstance(idx, Index) and is_unique and cols:
                        logger.info(f"找到唯一索引: {cols}")
                        return tuple(cols)
                except Exception as idx_error:
                    logger.debug(f"索引检测异常: {idx_error}")
                    continue
        except Exception as table_error:
            logger.debug(f"表索引检测异常: {table_error}")
            pass

        # 3) 列级 unique=True（单列唯一）
        try:
            for col in table.columns:
                try:
                    if getattr(col, "unique", False):
                        return (col.name,)
                except Exception:
                    continue
        except Exception:
            pass

        return None

    @staticmethod
    def _get_kline_table_model(table_type: str, year: int):
        """获取K线分表模型
        
        Args:
            table_type: 表类型
            year: 年份
            
        Returns:
            表模型类
        """
        # 延迟导入避免循环依赖
        from app.models.base.table_factory import TableFactory
        return TableFactory.get_table_model(table_type, year)

    @staticmethod
    def _prepare_kline_data(item: Dict[str, Any]) -> Dict[str, Any]:
        """准备K线数据：对 item 中的值进行 sanitize 处理"""
        return {
            k: BatchOperations._sanitize_value(v) 
            for k, v in item.items()
        }

    @staticmethod
    def _group_items_by_year(processed_items: List[Tuple[Any, Dict[str, Any]]]) -> Dict[int, List[Dict[str, Any]]]:
        """按年份对处理后的数据项进行分组
        
        Args:
            processed_items: (日期, 数据项)的元组列表
            
        Returns:
            按年份分组的数据字典
        """
        if not processed_items:
            return {}
            
        # 对处理后的有效数据按日期排序
        processed_items.sort(key=lambda x: x[0])
        
        # 按年份分组
        grouped_by_year = defaultdict(list)
        for trade_date, prepared_item in processed_items:
            grouped_by_year[trade_date.year].append(prepared_item)
            
        return dict(grouped_by_year)


    @staticmethod
    @lru_cache(maxsize=256)  # 直接使用数值，避免循环引用
    def _get_model_columns_cached(table_model: Type) -> Set[str]:
        """获取模型的所有列名 - 缓存版本
        
        Args:
            table_model: SQLModel模型类
            
        Returns:
            模型所有列名的集合
        """
        try:
            return {c.name for c in table_model.__table__.columns}
        except AttributeError:
            # 模型类没有__table__属性或columns属性
            return set()

    @staticmethod
    @lru_cache(maxsize=256)  # 直接使用数值，避免循环引用
    def _get_pk_names_cached(table_model: Type) -> Tuple[str, ...]:
        """获取模型的主键列名 - 缓存版本
        
        Args:
            table_model: SQLModel模型类
            
        Returns:
            主键列名的元组
        """
        try:
            table = table_model.__table__
            return tuple([col.name for col in table.primary_key.columns])
        except AttributeError:
            # 模型类没有__table__属性或primary_key属性
            return tuple()

    @staticmethod
    @lru_cache(maxsize=512)  # 直接使用数值，避免循环引用 (LARGE缓存用512)
    def _get_update_column_names_cached(table_model: Type, unique_keys_key: Tuple[str, ...]) -> Tuple[str, ...]:
        """获取可更新的列名集合 - 缓存版本
        
        排除不可更新的列：唯一键、主键、系统字段(id、created_at、updated_at)
        
        Args:
            table_model: SQLModel模型类
            unique_keys_key: 唯一键列名元组
            
        Returns:
            可更新列名的元组
        """
        try:
            table = table_model.__table__
            table_cols = tuple(table.columns.keys())
        except AttributeError:
            # 模型类没有__table__或columns属性
            table_cols = tuple()
        pk_names = BatchOperations._get_pk_names_cached(table_model)
        unique_set = set(unique_keys_key or tuple())
        do_not_update = unique_set | set(pk_names) | BatchOperations.NON_UPDATEABLE_FIELDS
        return tuple([c for c in table_cols if c not in do_not_update])


    @staticmethod
    def upsert_kline_partitioned(
            data: List[Dict[str, Any]],
            table_type: str,
            date_field: str = "trade_date",
            batch_size: int = 500,
    ) -> Dict[str, int]:
        """
        K 线分表批量 upsert（仅限 K 线：必须包含 ts_code/period/trade_date）。
        
        注意：传入的数据应该已经通过上层的 SmartDateRangeCalculator 和 KlinePeriodProcessor 
        进行了日期范围计算和过滤，所以直接使用 bulk_upsert_mysql_generated 即可。
        MySQL 的唯一键约束会自动处理重复数据。
        
        Args:
            data: K线数据列表（已过滤，只包含需要同步的数据）
            table_type: 表类型（字符串，如 TableTypes.STOCK）
            date_field: 日期字段名，默认为 "trade_date"
            batch_size: 批处理大小
        """
        if not data:
            return {"inserted_count": 0, "updated_count": 0}

        # 验证表类型 - 延迟导入避免循环依赖
        from app.constants.table_types import TableTypes
        if not TableTypes.is_valid_table_type(str(table_type)):
            raise ValueError(f"仅支持K线分表写入，非法的表类型: {table_type}")

        # 数据预处理：先处理数据并过滤无效项，然后按年份分组
        # 要求：trade_date 字段必须是字符串格式（YYYYMMDD），如 "20240101"
        
        # 先处理数据，过滤无效项
        processed_items = []
        for item in data:
            # 检查必要字段：ts_code、period、date_field
            ts_code = item.get("ts_code")
            period = item.get("period")
            date_str = item.get(date_field)
            
            if not ts_code or not period or not date_str:
                logger.debug(f"跳过无效数据项：缺少必要字段 (ts_code={ts_code}, period={period}, {date_field}={date_str})")
                continue
            
            # 🚀 优化：统一日期格式处理
            # trade_date 必须是 YYYYMMDD 格式的字符串（8位数字）
            try:
                trade_date = BatchOperations._parse_date_string(str(date_str))
                
                # 确保 item 中包含必要的字段（使用 item 中的值）
                item["ts_code"] = ts_code
                item["period"] = period
                item["trade_date"] = trade_date
                
                # 对 item 中的值进行 sanitize 处理
                prepared_item = BatchOperations._prepare_kline_data(item)
                processed_items.append((trade_date, prepared_item))
            except (ValueError, TypeError) as e:
                logger.debug(f"无效日期格式: {date_str}, 错误: {e}")
                continue
        
        if not processed_items:
            logger.debug("无可写入数据（输入集合为空或所有数据无效）")
            return {"inserted_count": 0, "updated_count": 0}
        
        # 🚀 优化：使用辅助方法按年份分组
        grouped_by_year = BatchOperations._group_items_by_year(processed_items)

        total_inserted = 0
        total_updated = 0
        processed_count = 0

        # 提前获取配置，避免在循环中重复获取
        base_batch = int(batch_size or _BATCH_OPS_CONFIG.base_batch)

        for year, mappings in sorted(grouped_by_year.items()):
            if not mappings:
                continue
            
            # 获取该年份的表模型
            model = BatchOperations._get_kline_table_model(table_type, year)
            if not model:
                logger.warning(f"未找到 {year} 年的表模型")
                continue

            try:
                # 统一使用生成式 upsert
                # 注意：传入的数据已经通过上层的 SmartDateRangeCalculator 和 KlinePeriodProcessor 
                # 进行了日期范围计算和过滤，MySQL 的唯一键约束会自动处理重复数据
                stats = batch_operations.bulk_upsert_mysql_generated(
                    table_model=model,
                    data=mappings,
                    batch_size=base_batch,
                    enable_updated_at=True,
                ) or {"inserted": 0, "updated": 0}
                year_inserted = int(stats.get("inserted", 0))
                year_updated = int(stats.get("updated", 0))
                total_inserted += year_inserted
                total_updated += year_updated
                logger.debug(f"K线写入 | 类型: {table_type} | 年份: {year} | 插入: {year_inserted} | 更新: {year_updated}")

                processed_count += len(mappings)

            except Exception as e:
                if "unknown column" in str(e).lower() and "new.id" in str(e).lower():
                    logger.error("变更感知 upsert 构造包含不可更新主键，已自动排除 'id' 列，请重试")
                elif "unique" in str(e).lower() or "duplicate" in str(e).lower():
                    logger.debug("部分数据已存在（唯一键约束），已跳过重复")
                else:
                    logger.error(f"批量写入 {year} 年数据失败: {e}")
                    # bulk_upsert_mysql_generated 已内部管理事务，异常时会自动 rollback
                    return {"inserted_count": total_inserted, "updated_count": total_updated}

        # bulk_upsert_mysql_generated 已内部管理事务并 commit
        if total_inserted > 0 or total_updated > 0:
            logger.debug(f"K线批量写入完成 | 类型: {table_type} | 插入: {total_inserted} | 更新: {total_updated}")

        return {"inserted_count": total_inserted, "updated_count": total_updated}

# 创建全局实例
batch_operations = BatchOperations()
