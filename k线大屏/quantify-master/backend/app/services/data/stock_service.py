"""
股票数据服务 - 重构版本
提供统一的股票数据访问和业务逻辑处理
"""

import hashlib
from typing import List, Optional, Dict, Any

from loguru import logger

from app.core.exceptions import CancellationException
from .convertible_bond_service import convertible_bond_service
from ..core.cache_service import service_cached
from ..external.tushare_service import tushare_service
from ...core.exceptions import (
    DatabaseException,
    ValidationException,
)
from ...dao.stock_dao import stock_dao


class StockService:
    """
    股票数据服务类 - 重构版本

    提供以下功能：
    1. 股票基本信息管理
    2. 股票列表查询和筛选
    3. 市场概览统计
    4. 数据同步和更新
    """

    def __init__(self):
        self.data_service = tushare_service
        # 预导入常用服务，避免重复导入
        from .industry_service import industry_service
        from .concept_service import concept_service
        from ..core.cache_service import cache_service
        self.industry_service = industry_service
        self.concept_service = concept_service
        self.cache_service = cache_service
        logger.info("股票服务初始化完成")

    def sync_stock_basic_info(self, task_id: str = None) -> Dict[str, Any]:
        """
        同步股票基本信息（返回变更集）

        Args:
            task_id: 任务ID，用于取消检查

        Returns:
            包含变更集和统计信息的字典

        Raises:
            DatabaseException: 数据库操作失败
        """
        try:
            logger.info("开始同步股票基本信息")

            # 获取统一数据服务的股票列表（始终全量拉取）
            stocks_dtos = self.data_service.get_stock_list(task_id=task_id)

            if not stocks_dtos:
                logger.warning("未获取到股票数据")
                # 使用空的 upsert 结果来生成变更集
                empty_result = {"inserted_count": 0, "updated_count": 0}
                return {
                    "total_count": empty_result["inserted_count"] + empty_result["updated_count"],
                    "created_count": empty_result["inserted_count"]
                }

            # 严格映射：DTO -> 行字典（不过滤无上市日期的数据, 一般为即将上市的标的）
            from ..external.tushare import mappers as strict_mappers
            rows = strict_mappers.stock_basic_to_upsert_dicts(stocks_dtos)

            # 🚀 优化：使用DAO标准化返回，简化业务逻辑
            from ...dao.stock_dao import stock_dao
            result = stock_dao.bulk_upsert_stock_data(rows)

            logger.success(
                f"股票基本信息同步完成 - 创建: {result['inserted_count']}条, "
                f"更新: {result['updated_count']}条, 总计: {result['total_count']}条"
            )

            # 直接使用DAO标准返回，添加业务层需要的字段
            return {
                "total_count": result["total_count"],
                "created_count": result["inserted_count"]
            }

        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步股票基本信息失败: {str(e)}")
            raise DatabaseException(f"同步股票基本信息失败: {str(e)}")

    
    @service_cached("stocks:all_ts_codes", key_fn=lambda self: "v1")
    def get_all_ts_codes_cached(self) -> List[str]:
        """获取全部在市股票 ts_code（服务层读穿透缓存）。"""
        try:
            from ...dao.stock_dao import stock_dao
            rows = stock_dao.get_all_ts_codes()
            # 🚀 性能优化：优化列表推导式，减少重复字典访问
            result = []
            for r in rows:
                ts_code = r.get("ts_code")
                if ts_code:
                    result.append(ts_code)
            return result
        except Exception:
            return []

    def get_hot_stock_codes(self) -> List[str]:
        """获取所有有热度数据的股票代码列表（按hot_rank排序）"""
        try:
            from ...dao.stock_dao import stock_dao
            return stock_dao.get_hot_stock_codes()
        except Exception as e:
            logger.warning(f"获取热门股票代码失败: {e}")
            return []

    @staticmethod
    def get_stock_concepts(
            ts_code: str
    ) -> List[Any]:
        """
        获取股票的概念

        Args:
            ts_code: 股票代码

        Returns:
            概念列表
        """
        try:
            from .concept_service import concept_service
            # 返回概念名称列表（通过服务封装 DAO + 缓存）
            return concept_service.get_stock_concepts_by_ts_code(ts_code.strip())
        except Exception as e:
            logger.warning(f"获取股票概念失败，返回空列表。ts_code={ts_code}, error={e}")
            return []

    @service_cached("stocks:detail", key_fn=lambda self, ts_code: ts_code.strip() if ts_code else "")
    def get_stock_by_ts_code(self, ts_code: str) -> Optional[Dict[str, Any]]:
        """
        根据股票代码获取股票信息

        Args:
            ts_code: 股票代码

        Returns:
            股票信息字典或None
        """
        try:
            if not ts_code:
                return None
            return stock_dao.get_stock_by_ts_code(ts_code.strip())
        except Exception as e:
            logger.error(f"获取股票信息失败: {str(e)}")
            return None

    def get_stock_industries(self, ts_code: str) -> List[str]:
        """
        获取股票所属行业名称列表

        Args:
            ts_code: 股票代码

        Returns:
            行业名称列表（字符串）
        """
        try:
            from .industry_service import industry_service
            # 使用与概念相同的机制，直接返回名称数组（通过服务封装 DAO + 缓存）
            names = industry_service.get_stock_industries_by_ts_code(ts_code.strip())
            # 去重并稳定排序
            return sorted(set(names)) if isinstance(names, list) else []
        except Exception as e:
            logger.warning(f"获取股票行业失败，返回空列表。ts_code={ts_code}, error={e}")
            return []

    def filter_stocks(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            limit: int = 100,
            offset: int = 0,
            sort_by: Optional[str] = None,
            sort_period: str = "daily",
            sort_order: str = "asc",
            ts_codes: Optional[List[str]] = None,
            trade_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        筛选股票

        Args:
            industry: 行业筛选列表（行业代码）
            concepts: 概念筛选列表（概念代码）
            search: 搜索关键词
            limit: 限制数量
            offset: 偏移量
            sort_by: 排序字段
            sort_period: 排序周期（daily/weekly/monthly）
            sort_order: 排序方向
            ts_codes: 直接指定代码列表筛选
            trade_date: 交易日期（YYYYMMDD格式）

        Returns:
            包含股票列表和总数的字典

        Raises:
            ValidationException: 参数验证失败
            DatabaseException: 数据库查询失败
        """
        try:
            # 参数验证
            if limit <= 0 or limit > 1000:
                raise ValidationException("limit参数必须在1-1000之间")
            if offset < 0:
                raise ValidationException("offset参数不能为负数")

            logger.debug(
                f"筛选股票 - industry: {industry}, concepts: {concepts}, sort_by: {sort_by}, sort_order: {sort_order}"
            )

            # 设置默认排序字段
            if not sort_by:
                sort_by = "hot_score"
                sort_order = "desc"

            base_filters = self._build_base_filters(industry, concepts, ts_codes)

            # 处理空过滤条件的情况
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result:
                return empty_result

            # 🚀 优化：智能查询，直接使用DAO标准返回格式
            joined = stock_dao.get_stocks_smart(
                filters=base_filters,
                search=search,
                # 支持按名称、代码、交易所代码搜索
                search_fields=["name", "ts_code"],
                sort_by=sort_by or "hot_score",
                sort_period=sort_period,
                sort_order=sort_order,
                limit=limit,
                offset=offset,
                trade_date=trade_date,  # 传递交易日期
            )
            # 直接使用DAO标准格式，无需手动转换
            final_stocks = joined.get("data", [])
            total_count = joined.get("total", 0)

            # 补充每条记录的关联信息：行业、概念与可转债（用于前端展示）
            for stock in final_stocks:
                ts_code = stock.get("ts_code")
                stock["industries"] = self.get_stock_industries(ts_code) if ts_code else []
                stock["concepts"] = self.get_stock_concepts(ts_code) if ts_code else []
                stock["convertible_bonds"] = convertible_bond_service.get_convertible_bonds_by_stock(ts_code)

            return {"stocks": final_stocks, "total": total_count}

        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"筛选股票失败: {str(e)}")
            raise DatabaseException(f"筛选股票失败: {str(e)}")

    def get_filtered_ts_codes(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            ts_codes_filter: Optional[List[str]] = None,
            sort_by: Optional[str] = None,
            sort_order: str = "desc",
            sort_period: str = "daily",
            trade_date: Optional[str] = None,
            limit: Optional[int] = None,
    ) -> List[str]:
        """获取符合筛选条件的 ts_code 列表（轻量级方法）。
        
        用于批量推送等场景，只返回代码列表，不返回详细数据。
        支持排序和数量限制。
        
        Args:
            industry: 行业筛选列表
            concepts: 概念筛选列表
            search: 搜索关键词
            ts_codes_filter: 直接指定代码列表筛选
            sort_by: 排序字段
            sort_order: 排序方向
            sort_period: 排序周期
            trade_date: 交易日期
            limit: 返回数量限制
            
        Returns:
            ts_code 列表
        """
        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes_filter)
            
            # 处理空过滤条件
            if base_filters is None and (industry or concepts or ts_codes_filter):
                return []
            
            return stock_dao.get_filtered_ts_codes(
                filters=base_filters,
                search=search,
                search_fields=["name", "ts_code"],
                sort_by=sort_by,
                sort_order=sort_order,
                sort_period=sort_period,
                trade_date=trade_date,
                limit=limit,
            )
        except Exception as e:
            logger.error(f"获取筛选代码列表失败: {str(e)}")
            return []

    @service_cached(
        "stocks:stats",
        key_fn=lambda self, industry=None, concepts=None, search=None, ts_codes=None, trade_date=None, sort_period="daily": 
            hashlib.md5(f"{trade_date or ''}:{sort_period}:{','.join(sorted(industry or []))}:{','.join(sorted(concepts or []))}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,  # 5分钟缓存
    )
    def get_stock_stats(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            trade_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下的股票明细数据，summary由前端计算。"""
        from ...dao.stock_dao import stock_dao

        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes)
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result is not None:
                # 存在行业/概念/策略过滤但无匹配结果，直接返回全 0 统计
                return {"items": []}

            stats = stock_dao.get_stock_stats_aggregated(
                filters=base_filters,
                search=search,
                search_fields=["name", "ts_code"],
                trade_date=trade_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取股票统计信息失败: {str(e)}")
            raise DatabaseException(f"获取股票统计信息失败: {str(e)}")

    @service_cached(
        "stocks:compare_stats",
        key_fn=lambda self, industry=None, concepts=None, search=None, ts_codes=None, base_date=None, compare_date=None, sort_period="daily": 
            hashlib.md5(f"{base_date or ''}:{compare_date or ''}:{sort_period}:{','.join(sorted(industry or []))}:{','.join(sorted(concepts or []))}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,  # 5分钟缓存
    )
    def get_stock_compare_stats(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            base_date: Optional[str] = None,
            compare_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取两个日期之间的股票涨跌对比统计。
        
        计算公式：(B日收盘 - A日收盘) / A日收盘 * 100
        """
        from ...dao.stock_dao import stock_dao

        # 默认空结构（summary由前端计算）
        empty_stats: Dict[str, Any] = {
            "base_date": base_date or "",
            "compare_date": compare_date or "",
            "items": [],
        }

        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes)
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result is not None:
                return empty_stats

            stats = stock_dao.get_stock_compare_stats(
                filters=base_filters,
                search=search,
                search_fields=["name", "ts_code"],
                base_date=base_date,
                compare_date=compare_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取股票对比统计信息失败: {str(e)}")
            raise DatabaseException(f"获取股票对比统计信息失败: {str(e)}")

    def _build_base_filters(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            ts_codes: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        使用新的筛选器架构构建股票筛选条件
        """
        strategy_codes = ts_codes if ts_codes else None
        if strategy_codes:
            logger.info(f"代码筛选: {len(strategy_codes)}只股票")
        
        from ...dao.filters.filter_processor import FilterProcessor
        
        return FilterProcessor.build_entity_filters(
            table_type="stock",
            concepts=concepts,
            industries=industry,
            strategy_codes=strategy_codes
        )

    def _handle_empty_filters(self, base_filters: Optional[Dict[str, Any]],
                              industry: Optional[List[str]],
                              concepts: Optional[List[str]],
                              ts_codes: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """
        处理空过滤条件的情况
        
        Returns:
            None: 继续正常查询
            Dict: 返回空结果 {"stocks": [], "total": 0}
        """
        if base_filters is None and (industry or concepts or ts_codes):
            logger.info("基础过滤返回None，返回空结果")
            return {"stocks": [], "total": 0}
        return None

    def search_stocks(
            self,
            keyword: str,
            limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        搜索股票

        Args:
            keyword: 搜索关键词
            limit: 返回数量限制

        Returns:
            股票列表

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
            logger.debug(f"搜索股票 - keyword: {keyword}, limit: {limit}")

            # 使用DAO搜索股票，只在股票名称中搜索
            stocks = stock_dao.get_stocks(
                search=keyword,
                search_fields=["name", "ts_code"],  # 只在股票名称中搜索
                limit=limit,
                offset=0
            )

            # 返回结果
            return stocks

        except ValidationException:
            raise
        except Exception as e:
            logger.error(f"搜索股票失败: {str(e)}")
            raise DatabaseException(f"搜索股票失败: {str(e)}")

    def cleanup_expired_data(self) -> int:
        """
        清理过期的股票数据
        
        Returns:
            清理的记录数
        """
        try:
            from app.models import Stock, StockConcept, StockIndustry
            from ...dao.query_utils import delete_records_with_filter, get_kline_table_years

            codes = self.get_all_ts_codes_cached()
            from app.services.scheduler.cleanup import compute_expired_codes
            from app.constants.table_types import TableTypes
            expired_codes = compute_expired_codes(codes, TableTypes.STOCK)
            if not expired_codes:
                return 0

            years = get_kline_table_years()
            from app.services.scheduler.cleanup import cleanup_kline_for_codes
            cleanup_kline_for_codes(years, TableTypes.STOCK, expired_codes)
            delete_records_with_filter(StockConcept, StockConcept.ts_code.in_(expired_codes))
            delete_records_with_filter(StockIndustry, StockIndustry.ts_code.in_(expired_codes))
            delete_records_with_filter(Stock, Stock.ts_code.in_(expired_codes))

            # 🗑️ 缓存失效：清理过期数据后失效相关缓存
            logger.info(f"清理过期股票数据后，失效相关缓存: {len(expired_codes)}个代码")
            self._invalidate_caches_for_expired_codes(expired_codes)

            return len(expired_codes)

        except Exception as e:
            logger.error(f"清理过期股票数据失败: {e}")
            raise DatabaseException(f"清理过期股票数据失败: {str(e)}")

    def _invalidate_caches_for_expired_codes(self, expired_codes: List[str]) -> None:
        """
        为过期代码失效相关缓存
        
        Args:
            expired_codes: 过期的股票代码列表
        """
        try:
            # 1. 清理股票相关缓存
            self.cache_service.invalidate_stock_cache()
            self.cache_service.invalidate_all_stock_codes()
            
            # 2. 清理K线相关缓存
            from app.constants.table_types import TableTypes
            for period in ["daily", "weekly", "monthly"]:
                # K线数据缓存
                self.cache_service.invalidate_stock_klines_for_codes(period, expired_codes)
            # 最新日期缓存
            self.cache_service.invalidate_kline_latest_dates(TableTypes.STOCK)
                
            # 3. 清理概念和行业相关缓存（关联关系发生变化）
            self.cache_service.invalidate_concept_cache()
            self.cache_service.invalidate_all_concept_codes()
            self.cache_service.invalidate_industry_cache()
            self.cache_service.invalidate_all_industry_codes()
            
            logger.info(f"已失效与 {len(expired_codes)} 个过期股票代码相关的缓存")
        except Exception as e:
            logger.warning(f"失效缓存时出错: {e}")
            # 缓存失效失败不应阻止数据清理进程

    def get_ts_codes_by_circ_mv_range(
        self,
        min_cap: Optional[float] = None,
        max_cap: Optional[float] = None,
        trade_date: Optional[str] = None,
        period: str = 'daily'
    ) -> List[str]:
        """
        获取指定流通市值范围内的股票代码
        
        Args:
            min_cap: 最小流通市值（亿），None表示不限
            max_cap: 最大流通市值（亿），None表示不限
            trade_date: 基准日期（YYYYMMDD），必须提供
            period: K线周期，默认daily
            
        Returns:
            符合流通市值范围的股票代码列表
        """
        if not trade_date:
            logger.warning("市值筛选必须提供trade_date参数")
            return []
        return stock_dao.get_ts_codes_by_circ_mv_range(min_cap=min_cap, max_cap=max_cap, trade_date=trade_date, period=period)

    def get_st_stock_codes(self) -> List[str]:
        """
        获取所有ST股票代码（名称包含ST的股票）
        
        Returns:
            ST股票代码列表
        """
        return stock_dao.get_st_stock_codes()


# 创建全局服务实例（去重）
stock_service = StockService()
