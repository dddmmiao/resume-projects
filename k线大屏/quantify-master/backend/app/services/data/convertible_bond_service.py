"""
可转债业务服务 - 重构版本
提供统一的可转债数据访问和业务逻辑处理
"""

import hashlib
from datetime import date
from typing import List, Dict, Optional, Any

from loguru import logger

from app.core.exceptions import CancellationException
from ..external.tushare_service import tushare_service
from ...core.exceptions import DatabaseException, ValidationException


class ConvertibleBondService:
    """
    可转债业务服务类 - 重构版本

    提供以下功能：
    1. 可转债基本信息管理
    2. 可转债列表查询和筛选
    3. 可转债详情查看
    4. 数据同步和更新
    """

    def __init__(self):
        self.tushare = tushare_service
        if self.tushare is None:
            logger.warning("Tushare服务未初始化，可转债服务功能受限")
        # 预导入常用服务，避免重复导入
        from .industry_service import industry_service
        from .concept_service import concept_service
        from ..core.cache_service import cache_service
        self.industry_service = industry_service
        self.concept_service = concept_service
        self.cache_service = cache_service
        logger.info("可转债服务初始化完成")

    def _build_base_filters(
            self,
            industry: Optional[List[str]],
            concepts: Optional[List[str]],
            ts_codes: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        使用新的筛选器架构构建可转债筛选条件
        """
        # 使用新的筛选器处理器
        from ...dao.filters.filter_processor import FilterProcessor
        
        return FilterProcessor.build_entity_filters(
            table_type="convertible_bond",
            concepts=concepts,
            industries=industry,
            strategy_codes=ts_codes
        )

    def _handle_empty_filters(self, base_filters: Optional[Dict[str, Any]],
                              industry: Optional[List[str]],
                              concepts: Optional[List[str]],
                              ts_codes: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """
        处理空过滤条件的情况
        
        Returns:
            None: 继续正常查询
            Dict: 返回空结果 {"bonds": [], "total": 0}
        """
        if base_filters is None and (industry or concepts or ts_codes):
            logger.info("基础过滤返回None，返回空结果")
            return {"bonds": [], "total": 0}
        return None

    def sync_convertible_bonds_info(self, task_id: str = None) -> Dict[str, Any]:
        """
        同步可转债基本信息到数据库
        只同步还未到转股截止日的可转债

        Args:
            task_id: 任务ID，用于取消检查

        Returns:
            同步的记录数

        Raises:
            DatabaseException: 数据库操作失败
            ValidationException: 数据验证失败
        """
        if self.tushare is None:
            logger.error("Tushare服务未初始化，无法同步可转债数据")
            raise ValidationException("Tushare服务未初始化")

        try:
            logger.info("开始同步可转债基本信息")

            # 获取统一数据服务的可转债列表（始终全量拉取）
            bonds_dtos = self.tushare.get_convertible_bond_basic(task_id=task_id)

            if not bonds_dtos:
                logger.warning("未获取到可转债数据")
                return {
                    "total_count": 0,
                    "created_count": 0
                }

            logger.info(f"获取到 {len(bonds_dtos)} 个可转债数据")

            today = date.today()

            # 🚀 性能优化：优化过滤逻辑，减少重复属性访问和日期解析
            from app.utils import date_utils
            filtered_bonds_dtos = []
            
            for bond_dto in bonds_dtos:
                # 一次性提取所有属性，减少重复访问
                ts_code = bond_dto.ts_code
                list_date_str = bond_dto.list_date
                conv_end_date_str = bond_dto.conv_end_date
                delist_date_str = bond_dto.delist_date
                list_status = bond_dto.list_status
                bond_short_name = bond_dto.bond_short_name
                
                if not ts_code or not ts_code.strip():
                    logger.warning(f"可转债数据缺少ts_code字段: {bond_dto}")
                    continue

                # 一次性解析所有日期，避免重复导入和解析
                conv_end_date = date_utils.parse_date_to_date(conv_end_date_str) if conv_end_date_str else None
                delist_date = date_utils.parse_date_to_date(delist_date_str) if delist_date_str else None

                # 快速过滤：检查退市条件（允许无上市日期的数据同步）
                skip_reason = None
                
                # 1. 优先检查退市日期（最可靠的指标）
                if delist_date and delist_date <= today:
                    skip_reason = f"已退市(退市日: {delist_date})"
                # 2. 检查上市状态
                elif list_status == 'D':
                    skip_reason = "上市状态为退市(D)"
                # 3. 检查转股截止日期
                elif conv_end_date and conv_end_date < today:
                    skip_reason = f"已过转股截止日(截止日: {conv_end_date})"

                if skip_reason:
                    logger.info(f"跳过可转债 {ts_code} ({bond_short_name}): {skip_reason}")
                    continue

                filtered_bonds_dtos.append(bond_dto)

            # 严格映射：Service 层完成 DTO→Dict，DAO 仅接收行字典
            from app.services.external.tushare.mappers import cb_basic_to_dicts
            rows = cb_basic_to_dicts(filtered_bonds_dtos)
            from ...dao.convertible_bond_dao import convertible_bond_dao
            result = convertible_bond_dao.bulk_upsert_convertible_bond_data(rows)

            logger.success(
                f"可转债基本信息同步完成 - 创建: {result['inserted_count']}条, "
                f"更新: {result['updated_count']}条, 总计: {result['inserted_count'] + result['updated_count']}条"
            )

            return {
                "total_count": result["inserted_count"] + result["updated_count"],
                "created_count": result["inserted_count"]
            }

        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步可转债基本信息失败: {str(e)}")
            raise DatabaseException(f"同步可转债基本信息失败: {str(e)}")

    def get_convertible_bonds_by_codes(self, ts_codes: List[str]) -> List[Dict[str, Any]]:
        """
        根据可转债代码列表获取可转债信息
        
        Args:
            ts_codes: 可转债代码列表
            
        Returns:
            可转债信息列表
        """
        try:
            from ...dao.convertible_bond_dao import convertible_bond_dao
            return convertible_bond_dao.get_convertible_bonds_by_codes(ts_codes)
        except Exception as e:
            logger.error(f"获取可转债信息失败: {str(e)}")
            return []

    from ..core.cache_service import service_cached

    @service_cached("bonds:all_ts_codes", key_fn=lambda self: "v1")
    def get_all_ts_codes_cached(self) -> List[str]:
        """获取全部可转债 ts_code（服务层读穿透缓存）。"""
        try:
            from ...dao.convertible_bond_dao import convertible_bond_dao
            bonds = convertible_bond_dao.get_all_ts_codes()
            # 🚀 性能优化：减少重复字典访问
            result = []
            for bond in bonds:
                ts_code = bond.get("ts_code")
                if ts_code:
                    result.append(ts_code)
            return result
        except Exception as e:
            return []

    def get_hot_bond_codes(self) -> List[str]:
        """获取所有有热度数据的可转债代码列表（按hot_rank排序）"""
        try:
            from ...dao.convertible_bond_dao import convertible_bond_dao
            return convertible_bond_dao.get_hot_bond_codes()
        except Exception as e:
            logger.warning(f"获取热门可转债代码失败: {e}")
            return []

    def get_convertible_bonds_by_stock(self, stock_code: str) -> List[Dict[str, Any]]:
        """
        根据股票代码获取关联的可转债

        Args:
            stock_code: 股票代码

        Returns:
            可转债基本信息列表（包含赎回信息）

        Raises:
            ValidationException: 参数验证失败
            DatabaseException: 数据库查询失败
        """
        try:
            # 参数验证
            if not stock_code:
                raise ValidationException("股票代码不能为空")

            logger.debug(f"获取股票关联可转债 - stock_code: {stock_code}")

            # 使用DAO获取关联的可转债（已修复：现在返回字典列表）
            from ...dao.convertible_bond_dao import convertible_bond_dao
            from .convertible_bond_call_service import convertible_bond_call_service
            
            bond_dicts = convertible_bond_dao.get_convertible_bonds_by_stock(stock_code)

            # 🔧 修复：DAO层现在返回字典，直接使用并添加赎回信息
            bonds = []
            for bond_dict in bond_dicts:
                # 复制字典，只保留必要字段
                result_dict = {
                    'ts_code': bond_dict['ts_code'],
                    'bond_short_name': bond_dict['bond_short_name'],
                }
                
                # 添加赎回信息
                call_records = convertible_bond_call_service.get_convertible_bond_call_info(bond_dict['ts_code'])
                result_dict['call_records'] = call_records or []
                
                bonds.append(result_dict)

            logger.debug(f"股票关联可转债查询完成 - {stock_code}: {len(bonds)} 个")
            return bonds

        except ValidationException:
            raise
        except Exception as e:
            logger.error(f"获取股票关联可转债失败: {str(e)}")
            raise DatabaseException(f"获取股票关联可转债失败: {str(e)}")

    def filter_convertible_bonds(
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
        筛选可转债

        Args:
            industry: 正股行业筛选列表
            concepts: 正股概念筛选列表
            search: 搜索关键词
            limit: 限制数量
            offset: 偏移量
            sort_by: 排序字段
            sort_period: 排序周期（daily/weekly/monthly）
            sort_order: 排序方向
            ts_codes: 直接指定代码列表筛选
            trade_date: 交易日期（YYYYMMDD格式）

        Returns:
            包含可转债列表和总数的字典

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
                f"筛选可转债 - industry: {industry}, concepts: {concepts}, sort_by: {sort_by}, sort_order: {sort_order}, ts_codes: {len(ts_codes) if ts_codes else 0}"
            )

            # 设置默认排序字段
            if not sort_by:
                sort_by = "hot_score"
                sort_order = "desc"

            # 预先构建基础过滤（与股票保持一致的结构）
            base_filters: Optional[Dict[str, Any]] = self._build_base_filters(
                industry=industry,
                concepts=concepts,
                ts_codes=ts_codes,
            )

            # 处理空过滤条件的情况
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result:
                return empty_result

            # 新查询方法：根据排序字段类型选择基础表或K线表查询
            from ...dao.convertible_bond_dao import convertible_bond_dao
            joined = convertible_bond_dao.get_convertible_bonds_smart(
                filters=base_filters,
                search=search,
                search_fields=["ts_code", "bond_short_name"],
                sort_by=sort_by or "hot_score",
                sort_period=sort_period,
                sort_order=sort_order,
                limit=limit,
                offset=offset,
                trade_date=trade_date,  # 新增：传递交易日期
            )
            final_bonds = list(joined.get("data", []))
            total_count = int(joined.get("total", 0))

            # 处理可转债数据，添加赎回信息、正股信息等
            result_bonds = []
            for bond in final_bonds:
                bond_dict = bond.copy()

                # 添加详细赎回信息
                from .convertible_bond_call_service import convertible_bond_call_service
                call_records = convertible_bond_call_service.get_convertible_bond_call_info(bond["ts_code"])
                bond_dict["call_records"] = call_records or []

                # 添加正股信息、概念和行业
                if bond.get("stk_code"):
                    from .stock_service import stock_service
                    # 直接依赖 service 的容错，异常时返回空数组
                    bond_dict["concepts"] = stock_service.get_stock_concepts(bond["stk_code"]) or []
                    bond_dict["industries"] = stock_service.get_stock_industries(bond["stk_code"]) or []

                result_bonds.append(bond_dict)

            return {
                "bonds": result_bonds,
                "total": total_count
            }

        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"筛选可转债失败: {str(e)}")
            raise DatabaseException(f"筛选可转债失败: {str(e)}")

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
        """获取符合筛选条件的可转债代码列表（支持排序和数量限制）。"""
        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes_filter)
            if base_filters is None and (industry or concepts or ts_codes_filter):
                return []
            
            from ...dao.convertible_bond_dao import convertible_bond_dao
            return convertible_bond_dao.get_filtered_ts_codes(
                filters=base_filters,
                search=search,
                search_fields=["ts_code", "bond_short_name"],
                sort_by=sort_by,
                sort_order=sort_order,
                sort_period=sort_period,
                trade_date=trade_date,
                limit=limit,
            )
        except Exception as e:
            logger.error(f"获取可转债筛选代码列表失败: {str(e)}")
            return []

    @service_cached(
        "convertible_bonds:stats",
        key_fn=lambda self, industry=None, concepts=None, search=None, ts_codes=None, trade_date=None, sort_period="daily": 
            hashlib.md5(f"{trade_date or ''}:{sort_period}:{','.join(sorted(industry or []))}:{','.join(sorted(concepts or []))}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,
    )
    def get_convertible_bond_stats(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            trade_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取当前筛选条件下的可转债明细数据，summary由前端计算。"""
        from ...dao.convertible_bond_dao import convertible_bond_dao

        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes)
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result is not None:
                return {"items": []}

            stats = convertible_bond_dao.get_convertible_bond_stats_aggregated(
                filters=base_filters,
                search=search,
                search_fields=["ts_code", "bond_short_name"],
                trade_date=trade_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取可转债统计信息失败: {str(e)}")
            raise DatabaseException(f"获取可转债统计信息失败: {str(e)}")

    @service_cached(
        "convertible_bonds:compare_stats",
        key_fn=lambda self, industry=None, concepts=None, search=None, ts_codes=None, base_date=None, compare_date=None, sort_period="daily": 
            hashlib.md5(f"{base_date or ''}:{compare_date or ''}:{sort_period}:{','.join(sorted(industry or []))}:{','.join(sorted(concepts or []))}:{search or ''}:{','.join(sorted(ts_codes or []))}".encode()).hexdigest()[:16],
        ttl_seconds=300,
    )
    def get_convertible_bond_compare_stats(
            self,
            industry: Optional[List[str]] = None,
            concepts: Optional[List[str]] = None,
            search: Optional[str] = None,
            ts_codes: Optional[List[str]] = None,
            base_date: Optional[str] = None,
            compare_date: Optional[str] = None,
            sort_period: str = "daily",
    ) -> Dict[str, Any]:
        """获取两个日期之间的可转债涨跌对比统计。"""
        from ...dao.convertible_bond_dao import convertible_bond_dao

        empty_stats = {
            "base_date": base_date or "",
            "compare_date": compare_date or "",
            "items": [],
        }

        try:
            base_filters = self._build_base_filters(industry, concepts, ts_codes)
            empty_result = self._handle_empty_filters(base_filters, industry, concepts, ts_codes)
            if empty_result is not None:
                return empty_stats

            stats = convertible_bond_dao.get_convertible_bond_compare_stats(
                filters=base_filters,
                search=search,
                search_fields=["ts_code", "bond_short_name"],
                base_date=base_date,
                compare_date=compare_date,
                sort_period=sort_period,
            )
            return stats
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"获取可转债对比统计信息失败: {str(e)}")
            raise DatabaseException(f"获取可转债对比统计信息失败: {str(e)}")

    def search_convertible_bonds(
            self,
            keyword: str,
            limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        搜索可转债

        Args:
            keyword: 搜索关键词
            limit: 返回数量限制

        Returns:
            可转债列表

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
            logger.debug(f"搜索可转债 - keyword: {keyword}, limit: {limit}")

            # 使用DAO搜索可转债，只在名称中搜索
            from ...dao.convertible_bond_dao import convertible_bond_dao
            bonds = convertible_bond_dao.get_convertible_bonds(
                search=keyword,
                search_fields=["bond_short_name", "ts_code"],
                limit=limit,
                offset=0
            )

            # 返回结果
            return bonds

        except ValidationException:
            raise
        except Exception as e:
            logger.error(f"搜索可转债失败: {str(e)}")
            raise DatabaseException(f"搜索可转债失败: {str(e)}")

    def cleanup_expired_data(self) -> int:
        """
        清理过期的可转债数据
        
        Returns:
            清理的记录数
        """
        try:
            from app.models import ConvertibleBond, ConvertibleBondCall
            from ...dao.query_utils import delete_records_with_filter, get_kline_table_years

            codes = self.get_all_ts_codes_cached()
            from app.services.scheduler.cleanup import compute_expired_codes
            from app.constants.table_types import TableTypes
            expired_codes = compute_expired_codes(codes, TableTypes.CONVERTIBLE_BOND)
            if not expired_codes:
                return 0

            years = get_kline_table_years()
            from app.services.scheduler.cleanup import cleanup_kline_for_codes
            cleanup_kline_for_codes(years, TableTypes.CONVERTIBLE_BOND, expired_codes)
            # 同步清理关联赎回信息
            delete_records_with_filter(ConvertibleBondCall, ConvertibleBondCall.ts_code.in_(expired_codes))
            delete_records_with_filter(ConvertibleBond, ConvertibleBond.ts_code.in_(expired_codes))

            # 🗑️ 缓存失效：清理过期数据后失效相关缓存
            logger.info(f"清理过期可转债数据后，失效相关缓存: {len(expired_codes)}个代码")
            self._invalidate_caches_for_expired_codes(expired_codes)

            return len(expired_codes)

        except Exception as e:
            logger.error(f"清理过期可转债数据失败: {e}")
            raise DatabaseException(f"清理过期可转债数据失败: {str(e)}")

    def _invalidate_caches_for_expired_codes(self, expired_codes: List[str]) -> None:
        """
        为过期代码失效相关缓存
        
        Args:
            expired_codes: 过期的可转债代码列表
        """
        try:
            # 1. 清理可转债相关缓存
            self.cache_service.invalidate_bond_cache()
            self.cache_service.invalidate_all_bond_codes()
            
            # 2. 清理K线相关缓存
            from app.constants.table_types import TableTypes
            for period in ["daily", "weekly", "monthly"]:
                # K线数据缓存
                self.cache_service.invalidate_bond_klines_for_codes(period, expired_codes)
            # 最新日期缓存
            self.cache_service.invalidate_kline_latest_dates(TableTypes.CONVERTIBLE_BOND)
                
            # 3. 清理股票相关缓存（关联关系发生变化）
            self.cache_service.invalidate_stock_cache()
            self.cache_service.invalidate_all_stock_codes()
            
            logger.info(f"已失效与 {len(expired_codes)} 个过期可转债代码相关的缓存")
        except Exception as e:
            logger.warning(f"失效缓存时出错: {e}")
            # 缓存失效失败不应阻止数据清理进程

    @service_cached("bonds:mappings", key_fn=lambda self: "all")
    def _get_all_bond_stock_mappings(self) -> Dict[str, Any]:
        """
        一次性加载所有可转债-股票双向映射（单一缓存键，懒加载）
        
        Returns:
            {
                "bond_to_stock": {bond_code: stock_code},
                "stock_to_bonds": {stock_code: [bond_codes]}
            }
        """
        try:
            from ...dao.convertible_bond_dao import convertible_bond_dao
            # 获取所有活跃可转债的基本信息
            bonds = convertible_bond_dao.get_all_active_bonds()
            
            bond_to_stock: Dict[str, str] = {}
            stock_to_bonds: Dict[str, List[str]] = {}
            
            for b in bonds:
                ts_code = b.get('ts_code')
                stk_code = b.get('stk_code')
                if ts_code and stk_code:
                    bond_to_stock[ts_code] = stk_code
                    if stk_code not in stock_to_bonds:
                        stock_to_bonds[stk_code] = []
                    stock_to_bonds[stk_code].append(ts_code)
            
            logger.info(f"加载可转债-股票双向映射: {len(bond_to_stock)} 个可转债, {len(stock_to_bonds)} 只股票")
            return {"bond_to_stock": bond_to_stock, "stock_to_bonds": stock_to_bonds}
        except Exception as e:
            logger.error(f"加载可转债-股票映射失败: {e}")
            return {"bond_to_stock": {}, "stock_to_bonds": {}}

    def get_bond_codes_by_stock_codes(self, stock_codes: List[str]) -> List[str]:
        """
        根据股票代码获取对应的可转债代码（使用统一双向映射缓存）
        
        Args:
            stock_codes: 股票代码列表
            
        Returns:
            可转债代码列表
        """
        if not stock_codes:
            return []
        mappings = self._get_all_bond_stock_mappings()
        stock_to_bonds = mappings.get("stock_to_bonds", {})
        result = []
        for stock_code in stock_codes:
            result.extend(stock_to_bonds.get(stock_code, []))
        return result

    def get_stock_codes_by_bond_codes(self, ts_codes: List[str]) -> Dict[str, str]:
        """
        根据可转债代码获取对应的正股代码（使用统一双向映射缓存）
        
        Args:
            ts_codes: 可转债代码列表
            
        Returns:
            映射字典 {bond_code: stock_code}
        """
        if not ts_codes:
            return {}
        mappings = self._get_all_bond_stock_mappings()
        bond_to_stock = mappings.get("bond_to_stock", {})
        return {code: bond_to_stock[code] for code in ts_codes if code in bond_to_stock}

    def get_ts_codes_by_underlying_circ_mv_range(
        self,
        min_cap: Optional[float] = None,
        max_cap: Optional[float] = None,
        trade_date: Optional[str] = None,
        period: str = 'daily'
    ) -> List[str]:
        """
        根据正股流通市值范围筛选可转债代码
        
        Args:
            min_cap: 最小流通市值（亿），None表示不限
            max_cap: 最大流通市值（亿），None表示不限
            trade_date: 基准日期（YYYYMMDD），必须提供
            period: K线周期，默认daily
            
        Returns:
            符合正股流通市值范围的可转债代码列表
        """
        if not trade_date:
            logger.warning("正股市值筛选必须提供trade_date参数")
            return []
        try:
            from ...dao.convertible_bond_dao import convertible_bond_dao
            return convertible_bond_dao.get_ts_codes_by_underlying_circ_mv_range(min_cap=min_cap, max_cap=max_cap, trade_date=trade_date, period=period)
        except Exception as e:
            logger.error(f"按正股流通市值范围筛选可转债失败: {e}")
            return []


# 创建全局服务实例
convertible_bond_service = ConvertibleBondService()
