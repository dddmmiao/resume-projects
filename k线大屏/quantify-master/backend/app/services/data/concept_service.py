"""
概念服务模块

提供概念和行业相关的业务逻辑服务
"""

import hashlib
from typing import Dict, List, Any, Optional

from loguru import logger

from app.core.exceptions import CancellationException
from ..core.cache_service import service_cached, cache_service
from ..external.tushare_service import tushare_service
from ...core.exceptions import ValidationException, DatabaseException
from ...dao.concept_dao import concept_dao


class ConceptService:
    """概念服务类"""

    def __init__(self):
        self.data_service = tushare_service
        self.cache_service = cache_service
        logger.info("概念服务初始化完成")

    def filter_concepts(
            self,
            search: Optional[str] = None,
            limit: Optional[int] = 100,
            offset: int = 0,
            sort_by: Optional[str] = None,
            sort_period: str = "daily",
            sort_order: str = "asc",
            hot_sort: bool = False,
            ts_codes: Optional[List[str]] = None,
            trade_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        筛选概念

        Args:
            search: 搜索关键词
            limit: 限制数量
            offset: 偏移量
            sort_by: 排序字段
            sort_period: 排序周期（daily/weekly/monthly）
            sort_order: 排序方向
            hot_sort: 是否按热度排序
            ts_codes: 直接指定代码列表筛选
            trade_date: 交易日期（YYYYMMDD格式）

        Returns:
            包含概念列表和总数的字典
        """
        try:
            # 参数验证
            if limit is not None and (limit <= 0 or limit > 1000):
                raise ValidationException("limit参数必须在1-1000之间")
            if offset < 0:
                raise ValidationException("offset参数不能为负数")

            # 热度排序时设置默认排序字段
            if hot_sort and not sort_by:
                sort_by = "hot_score"
                sort_order = "desc"

            # 设置默认排序字段
            if not sort_by:
                sort_by = "hot_score"
                sort_order = "desc"

            # 使用新的筛选器架构构建概念筛选条件
            filters = self._build_base_filters(ts_codes)

            # 新查询方法：根据排序字段类型选择基础表或K线表查询
            from ...dao.concept_dao import concept_dao
            joined = concept_dao.get_concepts_smart(
                filters=filters,
                search=search,
                search_fields=["concept_name", "concept_code"],
                sort_by=sort_by or "hot_score",
                sort_period=sort_period,
                sort_order=sort_order,
                limit=limit,
                offset=offset,
                trade_date=trade_date,
            )
            return {"concepts": joined.get("data", []), "total": int(joined.get("total", 0))}
        except Exception as e:
            logger.error(f"筛选概念失败: {str(e)}")
            raise DatabaseException(f"筛选概念失败: {str(e)}")

    def get_filtered_concept_codes(
            self,
            search: Optional[str] = None,
            ts_codes_filter: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_order: str = "desc",
            sort_period: str = "daily",
            trade_date: Optional[str] = None,
            limit: Optional[int] = None,
    ) -> List[str]:
        """获取符合筛选条件的概念代码列表（支持排序和数量限制）。"""
        try:
            filters = self._build_base_filters(ts_codes_filter)
            if filters is None and ts_codes_filter:
                return []
            
            from ...dao.concept_dao import concept_dao
            return concept_dao.get_filtered_concept_codes(
                filters=filters,
                search=search,
                search_fields=["concept_name", "concept_code"],
                sort_by=sort_by,
                sort_order=sort_order,
                sort_period=sort_period,
                trade_date=trade_date,
                limit=limit,
            )
        except Exception as e:
            logger.error(f"获取概念筛选代码列表失败: {str(e)}")
            return []

    @service_cached(
        "concepts:stats",
        key_fn=lambda self, search=None, ts_codes=None, trade_date=None, sort_period="daily": 
            hashlib.md5(f"{trade_date or ''}:{sort_period}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,
    )
    def get_concept_stats(
            self,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            trade_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下的概念明细数据，summary由前端计算。"""
        from ...dao.concept_dao import concept_dao

        try:
            filters = self._build_base_filters(ts_codes)
            stats = concept_dao.get_concept_stats_aggregated(
                filters=filters,
                search=search,
                search_fields=["concept_name", "concept_code"],
                trade_date=trade_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取概念统计信息失败: {str(e)}")
            raise DatabaseException(f"获取概念统计信息失败: {str(e)}")

    @service_cached(
        "concepts:compare_stats",
        key_fn=lambda self, search=None, ts_codes=None, base_date=None, compare_date=None, sort_period="daily": 
            hashlib.md5(f"{base_date or ''}:{compare_date or ''}:{sort_period}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,
    )
    def get_concept_compare_stats(
            self,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            base_date: Optional[str] = None,
            compare_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取两个日期之间的概念涨跌对比统计。"""
        from ...dao.concept_dao import concept_dao

        try:
            filters = self._build_base_filters(ts_codes)
            stats = concept_dao.get_concept_compare_stats(
                filters=filters,
                search=search,
                search_fields=["concept_name", "concept_code"],
                base_date=base_date,
                compare_date=compare_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取概念对比统计信息失败: {str(e)}")
            raise DatabaseException(f"获取概念对比统计信息失败: {str(e)}")

    def sync_single_concept_stocks(
            self, concept_code: str, task_id: str = None
    ) -> int:
        """
        同步单个概念的股票关联（从API获取成员数据）。

        Args:
            concept_code: 概念代码
            task_id: 任务ID（用于取消检查）

        Returns:
            处理记录数
        """
        try:
            if not concept_code:
                return 0

            # 从Tushare API获取概念成员
            members = self.data_service.get_ths_member(concept_code, task_id=task_id)
            if not members:
                return 0

            # 提取股票代码
            stock_codes = [m.code for m in members if m.code]
            if not stock_codes:
                return 0

            # 去重与过滤空值
            unique_codes = [c for c in sorted(set([c for c in stock_codes if c]))]
            if not unique_codes:
                return 0

            # 构建数据列表
            data_list = [{"ts_code": ts_code, "concept_code": concept_code} for ts_code in unique_codes]

            # 🚀 优化：批量插入或更新，直接使用DAO标准返回
            from ...dao.concept_dao import concept_dao
            stats = concept_dao.bulk_upsert_stock_concept_data(data_list)
            # DAO层已返回标准格式，直接使用total_count
            return stats.get("total_count", 0)

        except Exception as e:
            logger.error(f"同步概念 {concept_code} 股票关联失败: {e}")
            return 0

    def sync_enhanced_concepts(self, task_id: str = None) -> Dict[str, Any]:
        """
        同步概念数据

        Args:
            task_id: 任务ID
        Returns:
            同步结果列表
        """
        try:
            # 获取概念数据（DTO 列表）
            concept_dtos = self.data_service.get_concept_list(task_id=task_id)

            # 严格映射：DTO -> 行字典（不过滤无上市日期的数据, 一般为即将上市的标的）
            from ..external.tushare import mappers as strict_mappers
            if not concept_dtos:
                return {"rows": [], "total": 0}
            rows = strict_mappers.concepts_to_upsert_dicts(concept_dtos)

            # 🚀 优化：DAO 批量写入，直接使用标准返回
            from ...dao.concept_dao import concept_dao
            dao_result = concept_dao.bulk_upsert_concept_data(rows)
            # DAO层已返回标准格式，直接使用
            total = dao_result.get("total_count", 0)

            # 返回真实写库后的数据与总处理数
            return {
                "rows": rows,
                "total": total
            }

        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步概念数据失败: {str(e)}")
            raise DatabaseException(f"同步概念数据失败: {str(e)}")

    @service_cached("concepts:all_ts_codes", key_fn=lambda self: "v1")
    def get_all_ts_codes_cached(self) -> List[str]:
        """获取全部概念 ts_code（服务层读穿透缓存）。"""
        try:
            concepts = concept_dao.get_all_ts_codes()
            # 🚀 性能优化：减少重复的dict.get()调用
            return [concept["ts_code"] for concept in concepts if concept["ts_code"]]
        except Exception:
            return []

    def get_concept_codes_by_stock_codes(self, stock_codes: List[str]) -> List[str]:
        """
        根据股票代码集合获取关联概念代码列表（无缓存，直接查询DAO）
        
        Args:
            stock_codes: 股票代码列表
            
        Returns:
            概念代码列表
        """
        if not stock_codes:
            return []
        try:
            return concept_dao.get_concept_codes_by_stock_codes(stock_codes)
        except Exception as e:
            logger.error(f"获取股票关联概念代码失败: {e}")
            return []

    def sync_concept_stock_relations(
            self,
            enhanced_concepts: List[Dict[str, Any]],
            *,
            task_id: Optional[str] = None,
            optimal_workers: int = 4,
            batch_size: int = 10,
    ) -> int:
        """
        同步概念与股票的关系（保持 scheduler 原有机制：分批、并发、取消检查、DAO落库）。

        Args:
            enhanced_concepts: 概念基础数据列表（需包含 concept_code/concept_name）
            task_id: 任务ID（用于取消检查）
            optimal_workers: 并发度
            batch_size: 分批大小

        Returns:
            新增/处理的关联数量之和
        """
        try:
            if not enhanced_concepts:
                return 0

            # 分批概念
            concept_batches = [
                enhanced_concepts[i: i + batch_size] for i in range(0, len(enhanced_concepts), batch_size)
            ]

            def sync_concept_batch(concept_batch: List[Dict[str, Any]]) -> int:
                # 使用新的单个概念同步方法，简化代码逻辑
                try:
                    total_count = 0
                    for concept_data in concept_batch:
                        ccode = concept_data.get("concept_code")
                        if not ccode:
                            continue

                        # 调用单个概念同步方法
                        count = self.sync_single_concept_stocks(ccode, task_id)
                        total_count += count

                    return total_count
                except CancellationException:
                    raise
                except Exception as e:
                    logger.error(f"概念关系批次同步失败: {e}")
                    return 0

            # 并发执行批次
            from app.utils.concurrent_utils import process_concurrently

            results = process_concurrently(
                concept_batches,
                sync_concept_batch,
                max_workers=optimal_workers,
                error_handler=lambda batch, e: 0
            )

            total_relation_count = sum(int(result or 0) for result in results)

            return total_relation_count
        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步概念与股票关系失败: {e}")
            raise DatabaseException(f"同步概念与股票关系失败: {str(e)}")

    def cleanup_expired_data(self) -> int:
        """
        清理过期的概念数据
        
        Returns:
            清理的记录数
        """
        try:
            from app.models import Concept, StockConcept
            from ...dao.query_utils import delete_records_with_filter, get_kline_table_years

            codes = self.get_all_ts_codes_cached()
            from app.services.scheduler.cleanup import compute_expired_codes
            from app.constants.table_types import TableTypes
            expired_codes = compute_expired_codes(codes, TableTypes.CONCEPT)
            if not expired_codes:
                return 0

            years = get_kline_table_years()
            from app.services.scheduler.cleanup import cleanup_kline_for_codes
            cleanup_kline_for_codes(years, TableTypes.CONCEPT, expired_codes)
            delete_records_with_filter(StockConcept, StockConcept.concept_code.in_(expired_codes))
            delete_records_with_filter(Concept, Concept.concept_code.in_(expired_codes))

            # 🗑️ 缓存失效：清理过期数据后失效相关缓存
            logger.info(f"清理过期概念数据后，失效相关缓存: {len(expired_codes)}个代码")
            self._invalidate_caches_for_expired_codes(expired_codes)

            return len(expired_codes)

        except Exception as e:
            logger.error(f"清理过期概念数据失败: {e}")
            raise DatabaseException(f"清理过期概念数据失败: {str(e)}")

    def _invalidate_caches_for_expired_codes(self, expired_codes: List[str]) -> None:
        """
        为过期代码失效相关缓存
        
        Args:
            expired_codes: 过期的概念代码列表
        """
        try:
            # 1. 清理概念相关缓存
            self.cache_service.invalidate_concept_cache()
            self.cache_service.invalidate_all_concept_codes()
            
            # 2. 清理K线相关缓存
            from app.constants.table_types import TableTypes
            for period in ["daily", "weekly", "monthly"]:
                # K线数据缓存
                self.cache_service.invalidate_concept_klines_for_codes(period, expired_codes)
            # 最新日期缓存
            self.cache_service.invalidate_kline_latest_dates(TableTypes.CONCEPT)
                
            # 3. 清理股票相关缓存（关联关系发生变化）
            self.cache_service.invalidate_stock_cache()
            self.cache_service.invalidate_all_stock_codes()
            
            logger.info(f"已失效与 {len(expired_codes)} 个过期概念代码相关的缓存")
        except Exception as e:
            logger.warning(f"失效缓存时出错: {e}")
            # 缓存失效失败不应阻止数据清理进程

    def search_concepts(
            self,
            keyword: str,
            limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        搜索概念

        Args:
            keyword: 搜索关键词
            limit: 返回数量限制

        Returns:
            概念列表

        Raises:
            ValidationException: 参数验证失败
            DatabaseException: 数据库查询失败
        """
        try:
            # 参数验证
            if not keyword or not keyword.strip():
                raise ValidationException("搜索关键词不能为空")
            if limit <= 0 or limit > 1000:
                raise ValidationException("返回数量限制必须在1-1000之间")

            keyword = keyword.strip()
            logger.debug(f"搜索概念 - keyword: {keyword}, limit: {limit}")

            # 使用DAO搜索概念，只在名称中搜索
            concepts = concept_dao.get_concepts(
                search=keyword,
                search_fields=["concept_name", "concept_code"],
                limit=limit,
                offset=0
            )

            # 返回结果
            return concepts

        except ValidationException:
            raise
        except Exception as e:
            logger.error(f"搜索概念失败: {str(e)}")
            raise DatabaseException(f"搜索概念失败: {str(e)}")

    # ====== 提供给其他服务的读方法（对外屏蔽 DAO，内部使用 DAO + 缓存） ======
    @service_cached("concepts:members_of_stock", key_fn=lambda self, ts_code: ts_code.strip() if ts_code else "")
    def get_stock_concepts_by_ts_code(self, ts_code: str) -> List[str]:
        """返回某股票所属概念名称列表（服务层读穿透缓存）。"""
        if not ts_code:
            return []
        return concept_dao.load_stock_concepts(ts_code.strip()) or []

    def get_ts_codes_by_concept_codes(self, concept_codes: List[str]) -> List[str]:
        """根据概念代码集合获取关联股票 ts_code 列表（无缓存，直接查询DAO）"""
        if not concept_codes:
            return []
        try:
            return concept_dao.get_ts_codes_by_concept_codes(concept_codes)
        except Exception as e:
            logger.warning(f"概念反查股票失败，返回空列表。concept_codes={concept_codes}, error={e}")
            return []

    def get_hot_concept_codes(self) -> List[str]:
        """获取所有有热度数据的概念代码列表（按hot_rank排序）"""
        try:
            return concept_dao.get_hot_concept_codes()
        except Exception as e:
            logger.warning(f"获取热门概念代码失败: {e}")
            return []

    def _build_base_filters(self, ts_codes: Optional[List[str]]) -> Optional[Dict[str, Any]]:
        """
        构建概念筛选条件
        """
        if not ts_codes:
            return None
        
        logger.info(f"代码列表筛选(概念): {len(ts_codes)}个概念")
        return {"concept_code": ts_codes}


# 创建全局服务实例
concept_service = ConceptService()
