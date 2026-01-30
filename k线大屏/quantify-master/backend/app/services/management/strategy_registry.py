"""
策略注册与分发（优化版本）

用途：根据策略名返回一组股票 ts_code 列表，以便在分页前作为基础过滤使用。
说明：
- 未识别/未实现的策略返回 None，表示不限制。
- 返回空列表 [] 表示明确无匹配结果。
- 支持策略参数验证、缓存和错误处理。
"""

import hashlib
import json
from typing import Optional, List, Dict, Any, Callable

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.core.exceptions import CancellationException


class StrategyValidationError(Exception):
    """策略验证错误"""
    pass


class StrategyExecutionError(Exception):
    """策略执行错误"""
    pass


def validate_strategy_params(params: Dict[str, Any], required: List[str] = None, optional: Dict[str, Any] = None) -> \
Dict[str, Any]:
    """
    验证和标准化策略参数
    
    Args:
        params: 原始参数
        required: 必需参数列表
        optional: 可选参数及其默认值
        
    Returns:
        验证后的参数字典
        
    Raises:
        StrategyValidationError: 参数验证失败
    """
    validated = {}

    # 检查必需参数
    if required:
        for param in required:
            if param not in params or params[param] is None:
                raise StrategyValidationError(f"缺少必需参数: {param}")
            validated[param] = params[param]

    # 处理可选参数
    if optional:
        for param, default_value in optional.items():
            validated[param] = params.get(param, default_value)

    return validated


class StrategyRegistry:

    def __init__(self):
        # 名称到处理函数的注册表
        self._strategies: Dict[str, Callable[[Dict[str, Any]], Optional[List[str]]]] = {}

        # 策略元数据
        self._strategy_metadata: Dict[str, Dict[str, Any]] = {}

        # 预注册策略
        self._register_auction_volume()

    def register(
            self,
            name: str,
            handler: Callable[[Dict[str, Any]], Optional[List[str]]],
            metadata: Dict[str, Any] = None
    ) -> None:
        """
        注册策略
        
        Args:
            name: 策略名称
            handler: 策略处理函数
            metadata: 策略元数据（参数说明等）
        """
        name = (name or "").strip().lower()
        if not name:
            logger.warning("策略名称不能为空")
            return

        if name in self._strategies:
            logger.warning(f"策略 {name} 已存在，将被覆盖")

        self._strategies[name] = handler
        self._strategy_metadata[name] = metadata or {}
        logger.info(f"策略 {name} 注册成功")

    def get_strategy_info(self, name: str) -> Optional[Dict[str, Any]]:
        """获取策略信息"""
        return self._strategy_metadata.get(name.strip().lower())

    def list_strategies(self) -> List[str]:
        """列出所有已注册的策略"""
        return list(self._strategies.keys())

    @staticmethod
    def _parse_int_param(value: Any, default: Optional[int], min_val: int = None, max_val: int = None) -> Optional[int]:
        """解析整数参数"""
        try:
            parsed = int(value) if value is not None else default
            if min_val is not None and parsed < min_val:
                parsed = min_val
            if max_val is not None and parsed > max_val:
                parsed = max_val
            return parsed
        except (ValueError, TypeError):
            return default

    def _register_auction_volume(self):
        """注册量价趋势策略"""
        from app.strategies import auction_volume

        self.register(
            auction_volume.STRATEGY_NAME,
            self._strategy_auction_volume,
            auction_volume.get_metadata(),
        )

    @staticmethod
    def _get_candidate_codes(context: Dict[str, Any]) -> List[str]:
        """根据实体类型获取候选代码列表，支持概念/行业/市值筛选
        
        流程：1. 获取候选代码（传入或从服务层获取）
              2. 统一应用数据筛选（如启用）
        """
        raw_entity_type = context.get("entity_type", EntityTypes.STOCK)
        entity_type = EntityTypes.TABLE_TYPE_TO_ENTITY.get(raw_entity_type, raw_entity_type)
        
        from app.constants.table_types import TableTypes
        entity_name = TableTypes.get_chinese_name(TableTypes.entity_type_to_table_type(entity_type) or entity_type)

        # 1. 获取候选代码
        candidates = context.get("candidates")
        if candidates is not None:
            logger.info(f"使用传入的候选{entity_name}: {len(candidates)}只")
        else:
            try:
                candidates = StrategyRegistry._fetch_all_codes(entity_type)
                logger.info(f"初始候选{entity_name}数量: {len(candidates)}")
            except Exception as e:
                logger.error(f"获取候选代码失败: {e}")
                return []

        # 2. 统一应用数据筛选（仅股票和可转债支持，且需要开关启用）
        if entity_type in [EntityTypes.STOCK, EntityTypes.BOND] and context.get("enable_data_filter"):
            before_count = len(candidates)
            candidates = StrategyRegistry._apply_data_filters(candidates, context, entity_type)
            logger.info(f"数据筛选后候选{entity_name}数量: {len(candidates)} (筛选前: {before_count})")

        return candidates

    @staticmethod
    def _fetch_all_codes(entity_type: str) -> List[str]:
        """根据实体类型从服务层获取所有代码"""
        if entity_type == EntityTypes.STOCK:
            from ..data.stock_service import stock_service
            codes = stock_service.get_all_ts_codes_cached()
        elif entity_type == EntityTypes.BOND:
            from ..data.convertible_bond_service import convertible_bond_service
            codes = convertible_bond_service.get_all_ts_codes_cached()
        elif entity_type == EntityTypes.CONCEPT:
            from ..data.concept_service import concept_service
            codes = concept_service.get_all_ts_codes_cached()
        elif entity_type == EntityTypes.INDUSTRY:
            from ..data.industry_service import industry_service
            codes = industry_service.get_all_ts_codes_cached()
        else:
            logger.error(f"不支持的实体类型: {entity_type}")
            return []
        return [c for c in codes if c]

    @staticmethod
    def _apply_data_filters(candidates: List[str], context: Dict[str, Any], entity_type: str) -> List[str]:
        """应用数据筛选条件（概念、行业、市值、板块）"""
        filter_concepts = context.get("filter_concepts", [])
        filter_industries = context.get("filter_industries", [])
        filter_market_cap_min = context.get("filter_market_cap_min")
        filter_market_cap_max = context.get("filter_market_cap_max")
        trade_date = context.get("trade_date")  # 市值筛选基准日期
        period = context.get("period", "daily")  # K线周期
        
        # 板块筛选参数（统一使用filter_*字段名 + board_filter_mode）
        board_filter_mode = context.get("board_filter_mode", "exclude")
        filter_st = context.get("filter_st", False)
        filter_chinext = context.get("filter_chinext", False)
        filter_star = context.get("filter_star", False)
        filter_bse = context.get("filter_bse", False)
        has_board_filter = filter_st or filter_chinext or filter_star or filter_bse

        # 无筛选条件，直接返回
        if not filter_concepts and not filter_industries and filter_market_cap_min is None and filter_market_cap_max is None and not has_board_filter:
            return candidates

        filtered_codes = set(candidates)

        # 概念和行业筛选 - OR关系（属于选中的概念或行业即可）
        concept_codes_set = set()
        industry_codes_set = set()
        
        if filter_concepts:
            try:
                from ..data.concept_service import concept_service
                concept_codes = concept_service.get_ts_codes_by_concept_codes(filter_concepts)
                if concept_codes:
                    concept_codes_set = set(concept_codes)
                    logger.info(f"概念匹配: {len(concept_codes_set)} 只 (概念数: {len(filter_concepts)})")
            except Exception as e:
                logger.error(f"概念筛选失败: {e}")

        if filter_industries:
            try:
                from ..data.industry_service import industry_service
                industry_codes = industry_service.get_ts_codes_by_industry_codes(filter_industries)
                if industry_codes:
                    industry_codes_set = set(industry_codes)
                    logger.info(f"行业匹配: {len(industry_codes_set)} 只 (行业数: {len(filter_industries)})")
            except Exception as e:
                logger.error(f"行业筛选失败: {e}")
        
        # 概念和行业用OR关系（并集）
        if filter_concepts or filter_industries:
            concept_or_industry = concept_codes_set | industry_codes_set
            if concept_or_industry:
                if entity_type == EntityTypes.BOND:
                    # 可转债：通过正股代码获取对应的可转债代码
                    from ..data.convertible_bond_service import convertible_bond_service
                    matched_bonds = convertible_bond_service.get_bond_codes_by_stock_codes(list(concept_or_industry))
                    filtered_codes &= set(matched_bonds)
                    logger.info(f"概念/行业筛选后（OR，正股匹配）: {len(filtered_codes)} 只")
                else:
                    # 股票：直接匹配
                    filtered_codes &= concept_or_industry
                    logger.info(f"概念/行业筛选后（OR）: {len(filtered_codes)} 只")
            else:
                logger.warning(f"概念/行业筛选无匹配结果")
                return []

        # 流通市值筛选（单位：亿）- 通过Service层调用
        if filter_market_cap_min is not None or filter_market_cap_max is not None:
            try:
                if entity_type == EntityTypes.STOCK:
                    from ..data.stock_service import stock_service
                    market_cap_codes = stock_service.get_ts_codes_by_circ_mv_range(
                        min_cap=filter_market_cap_min,
                        max_cap=filter_market_cap_max,
                        trade_date=trade_date,
                        period=period
                    )
                elif entity_type == EntityTypes.BOND:
                    from ..data.convertible_bond_service import convertible_bond_service
                    market_cap_codes = convertible_bond_service.get_ts_codes_by_underlying_circ_mv_range(
                        min_cap=filter_market_cap_min,
                        max_cap=filter_market_cap_max,
                        trade_date=trade_date,
                        period=period
                    )
                else:
                    market_cap_codes = None
                
                if market_cap_codes:
                    filtered_codes &= set(market_cap_codes)
                    logger.info(f"流通市值筛选后: {len(filtered_codes)} 只 (流通市值: {filter_market_cap_min}-{filter_market_cap_max}亿)")
                elif market_cap_codes is not None:
                    logger.warning(f"流通市值范围 {filter_market_cap_min}-{filter_market_cap_max}亿 无匹配股票(日期:{trade_date})")
                    return []
            except Exception as e:
                logger.error(f"流通市值筛选失败: {e}")

        # 板块筛选（统一使用filter_* + board_filter_mode）
        if has_board_filter:
            before_count = len(filtered_codes)
            
            # 辅助函数：判断股票板块
            def is_chinext(code: str) -> bool:
                return code.startswith('300') or code.startswith('301')
            
            def is_star(code: str) -> bool:
                return code.startswith('688')
            
            def is_bse(code: str) -> bool:
                """北交所股票代码：43xxxx, 83xxxx, 87xxxx, 88xxxx (历史代码) 和 920xxx (新统一代码)"""
                return (code.startswith('43') or code.startswith('83') or 
                        code.startswith('87') or code.startswith('88') or 
                        code.startswith('920'))
            
            # 获取ST股票列表（如果需要）
            st_codes = set()
            if filter_st and entity_type == EntityTypes.STOCK:
                try:
                    from ..data.stock_service import stock_service
                    st_codes = set(stock_service.get_st_stock_codes() or [])
                except Exception as e:
                    logger.warning(f"获取ST股票列表失败: {e}")
            
            if board_filter_mode == "include":
                # 只保留模式：只保留勾选的板块
                codes_to_keep = set()
                for code in filtered_codes:
                    should_keep = False
                    if filter_chinext and is_chinext(code):
                        should_keep = True
                    if filter_star and is_star(code):
                        should_keep = True
                    if filter_bse and is_bse(code):
                        should_keep = True
                    if filter_st and code in st_codes:
                        should_keep = True
                    if should_keep:
                        codes_to_keep.add(code)
                filtered_codes = codes_to_keep
                logger.info(f"只保留筛选后: {len(filtered_codes)} 只 (筛选前: {before_count}, ST={filter_st}, 创业板={filter_chinext}, 科创板={filter_star}, 北交所={filter_bse})")
            else:
                # 排除模式：排除勾选的板块
                codes_to_remove = set()
                for code in filtered_codes:
                    if filter_chinext and is_chinext(code):
                        codes_to_remove.add(code)
                    if filter_star and is_star(code):
                        codes_to_remove.add(code)
                    if filter_bse and is_bse(code):
                        codes_to_remove.add(code)
                filtered_codes -= codes_to_remove
                
                if filter_st:
                    filtered_codes -= st_codes
                
                logger.info(f"排除筛选后: {len(filtered_codes)} 只 (排除前: {before_count}, ST={filter_st}, 创业板={filter_chinext}, 科创板={filter_star}, 北交所={filter_bse})")

        return list(filtered_codes)

    @staticmethod
    def _apply_underlying_strategy_filter(
        underlying_strategy: Dict[str, Any], context: Dict[str, Any], bond_candidates: List[str]
    ) -> Optional[List[str]]:
        """
        应用正股策略筛选：对已筛选的可转债对应的正股执行策略，返回符合条件的可转债
        
        Args:
            underlying_strategy: 正股策略配置对象，包含preset_key, preset_name, strategy_name, params
            context: 当前策略执行上下文（用于获取trade_date等参数）
            bond_candidates: 已经过数据筛选的可转债候选列表
            
        Returns:
            符合正股策略的可转债代码列表，失败返回None
        """
        try:
            from ..data.convertible_bond_service import convertible_bond_service
            
            # 1. 从前端传递的对象中直接获取参数（无需查询数据库）
            preset_params = underlying_strategy.get("params", {})
            preset_name = underlying_strategy.get("preset_name", "未命名预设")
            strategy_name = underlying_strategy.get("strategy_name")
            period = context.get("period", "daily")
            
            if not strategy_name:
                logger.warning(f"预设缺少strategy_name: {underlying_strategy}")
                return None
            
            # 2. 获取可转债到正股的映射（通过Service层缓存）
            bond_to_stock = convertible_bond_service.get_stock_codes_by_bond_codes(bond_candidates)
            stock_codes_to_filter = list(set(bond_to_stock.values()))
            
            if not stock_codes_to_filter:
                logger.info("候选可转债没有对应的正股")
                return []
            
            logger.info(f"候选可转债 {len(bond_candidates)} 只，对应正股 {len(stock_codes_to_filter)} 只")
            
            # 3. 构建股票策略执行上下文（限定在候选正股范围内）
            stock_context = {
                "entity_type": EntityTypes.STOCK,
                "period": period,
                "trade_date": context.get("trade_date"),
                "candidates": stock_codes_to_filter,  # 限定候选范围
                **preset_params
            }
            
            logger.info(f"执行正股策略预设: {preset_name} (strategy={strategy_name})")
            
            # 4. 执行股票策略获取符合条件的股票代码
            strategy_func = strategy_registry._strategies.get(strategy_name.strip().lower())
            if not strategy_func:
                logger.error(f"策略函数不存在: {strategy_name}")
                return None
            
            qualified_stocks = strategy_func(stock_context)
            if not qualified_stocks:
                logger.info("正股策略筛选结果为空")
                return []
            
            logger.info(f"正股策略筛选出 {len(qualified_stocks)} 只股票")
            
            # 5. 过滤候选可转债：只保留正股符合条件的（使用已构建的映射）
            qualified_stocks_set = set(qualified_stocks)
            result = [bond_code for bond_code in bond_candidates 
                      if bond_to_stock.get(bond_code) in qualified_stocks_set]
            
            logger.info(f"正股策略筛选后可转债数量: {len(result)}")
            return result
            
        except Exception as e:
            logger.error(f"正股策略筛选失败: {e}")
            return None

    @staticmethod
    def _batch_get_indicators(candidates: List[str], limit: int, entity_type: str = EntityTypes.STOCK,
                              period: str = "daily", trade_date: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        """根据实体类型批量获取指标数据（使用缓存）"""
        try:
            from app.constants.table_types import TableTypes
            from app.dao.kline_query_utils import KlineQueryUtils

            table_type = TableTypes.entity_type_to_table_type(entity_type)
            if not table_type:
                logger.error(f"不支持的实体类型: {entity_type}")
                return {}

            # 使用 DAO 级别的多代码窗口查询，一次性为所有候选代码获取最近 limit 条K线（含指标列），可选按 trade_date 截断
            all_indicators = KlineQueryUtils.get_kline_data_for_codes(
                ts_codes=candidates,
                period=period,
                table_type=table_type,
                limit=limit,
                end_date=trade_date,
            )

            from app.constants.table_types import TableTypes
            entity_name = TableTypes.get_chinese_name(TableTypes.entity_type_to_table_type(entity_type) or entity_type)
            logger.info(f"批量获取{entity_name}指标数据完成，共 {len(all_indicators)} 只")
            return all_indicators

        except Exception as e:
            logger.error(f"批量获取指标数据失败: {e}")
            return {}

    
    def _strategy_auction_volume(self, context: Dict[str, Any]) -> Optional[List[str]]:
        from app.strategies import auction_volume

        helpers = StrategyHelpers(self)
        return auction_volume.execute(context, helpers)
    
    @staticmethod
    def _batch_get_kline_data(
        candidates: List[str],
        limit: int,
        entity_type: str = EntityTypes.STOCK,
        period: str = "daily",
        trade_date: Optional[str] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """批量获取K线数据（使用Service层缓存，包含指标字段）"""
        try:
            from app.constants.table_types import TableTypes
            
            # 根据实体类型调用对应的batch方法（已封装缓存和并发）
            if entity_type == EntityTypes.STOCK:
                from app.services.data.stock_kline_service import stock_kline_service
                all_kline_data = stock_kline_service.batch_get_stock_indicators_cached(candidates, period, limit, trade_date)
            elif entity_type == EntityTypes.BOND:
                from app.services.data.convertible_bond_kline_service import convertible_bond_kline_service
                all_kline_data = convertible_bond_kline_service.batch_get_bond_indicators_cached(candidates, period, limit, trade_date)
            elif entity_type == EntityTypes.CONCEPT:
                from app.services.data.concept_kline_service import concept_kline_service
                all_kline_data = concept_kline_service.batch_get_concept_indicators_cached(candidates, period, limit, trade_date)
            elif entity_type == EntityTypes.INDUSTRY:
                from app.services.data.industry_kline_service import industry_kline_service
                all_kline_data = industry_kline_service.batch_get_industry_indicators_cached(candidates, period, limit, trade_date)
            else:
                logger.error(f"不支持的实体类型: {entity_type}")
                return {}
            
            table_type = TableTypes.entity_type_to_table_type(entity_type)
            entity_name = TableTypes.get_chinese_name(table_type)
            logger.info(f"批量获取{entity_name}K线数据完成，共 {len(all_kline_data)} 只（使用缓存）")
            return all_kline_data
        
        except Exception as e:
            logger.error(f"批量获取K线数据失败: {e}")
            return {}

    def execute_strategy_async(self, task_id: str, strategy_name: str, context: Dict[str, Any], user_id: str = "anonymous") -> None:
        """
        异步执行策略计算
        
        Args:
            task_id: 任务ID，用于进度跟踪
            strategy_name: 策略名称
            context: 策略上下文参数
            user_id: 用户ID，用于保存历史记录（不参与context_hash计算）
        """
        from ..core.redis_task_manager import redis_task_manager

        logger.info(f"开始异步执行策略: {strategy_name} (任务ID: {task_id})")

        # 1. 更新任务状态为运行中
        redis_task_manager.update_task_progress(
            task_id, 10, f"开始执行策略: {strategy_name}",
            current_operation="获取候选代码"
        )

        # 2. 获取候选代码
        entity_type = context.get("entity_type", EntityTypes.STOCK)
        candidates = self._get_candidate_codes(context)
        total_count = len(candidates)

        if not candidates:
            from app.constants.table_types import TableTypes
            entity_name = TableTypes.get_chinese_name(TableTypes.entity_type_to_table_type(entity_type) or entity_type)
            
            # 更新历史记录状态为success（即使结果为空）
            try:
                from .strategy_history_service import strategy_history_service
                strategy_history_service.update_history_status(
                    task_id=task_id,
                    status="success",
                    selected_codes=[]
                )
                logger.info(f"已更新策略执行历史状态: {strategy_name} -> success, 0 条结果（候选为空）")
            except Exception as e:
                logger.warning(f"更新策略执行历史状态失败: {e}")
            
            from ..core.redis_task_manager import TaskStatus
            redis_task_manager.update_task_progress(
                task_id, 100, f"候选{entity_name}为空",
                status=TaskStatus.COMPLETED,
                result={"selected_codes": []}
            )
            return

        logger.info(f"获取到 {total_count} 个候选代码，开始并行分批处理")

        # 3. 并行分批处理候选代码
        from app.utils.concurrent_utils import process_concurrently, ConcurrentConfig
        import threading
        
        batch_size = 100  # 使用较小批次获得更平滑的进度更新
        all_selected = []
        total_batches = (total_count + batch_size - 1) // batch_size
        
        # 构建批次列表
        batches = [(i, candidates[i*batch_size:min((i+1)*batch_size, total_count)]) for i in range(total_batches)]
        progress_lock = threading.Lock()
        completed_batches = [0]
        
        def process_batch(batch_item):
            batch_idx, batch_candidates = batch_item
            if redis_task_manager.is_task_cancelled(task_id):
                raise CancellationException("任务已被用户取消")
            return self._execute_strategy_batch(strategy_name, batch_candidates, context, task_id)
        
        def on_progress(result, completed, total):
            with progress_lock:
                completed_batches[0] = completed
                # 进度范围10%-90%，按完成批次比例计算
                progress = 10 + int((completed / max(1, total)) * 80)
                redis_task_manager.update_task_progress(task_id, progress, f"已完成 {completed}/{total} 批")
        
        def on_error(batch_item, e):
            logger.error(f"批次 {batch_item[0] + 1} 执行失败: {e}")
            return []
        
        max_workers = ConcurrentConfig.get_optimal_workers()
        logger.info(f"使用 {max_workers} 个线程并行处理 {total_batches} 个批次")
        
        batch_results = process_concurrently(batches, process_batch, max_workers=max_workers, error_handler=on_error, progress_callback=on_progress)
        
        for result in batch_results:
            if result:
                all_selected.extend(result)

        # 4. 正股策略筛选（仅可转债时有效，放在策略条件筛选之后）
        underlying_strategy = context.get("underlying_strategy")
        if entity_type == EntityTypes.BOND and underlying_strategy and context.get("enable_underlying_filter"):
            before_count = len(all_selected)
            filtered = StrategyRegistry._apply_underlying_strategy_filter(
                underlying_strategy, context, all_selected
            )
            if filtered is not None:
                all_selected = filtered
                logger.info(f"正股策略筛选: {before_count} -> {len(all_selected)}")

        # 5. 任务完成 - 所有批次处理完成后执行
        from app.constants.table_types import TableTypes
        entity_name = TableTypes.get_chinese_name(TableTypes.entity_type_to_table_type(entity_type) or entity_type)

        # 更新历史记录状态（由API层创建的running记录），并获取context_hash
        context_hash = None
        try:
            from .strategy_history_service import strategy_history_service
            context_hash = strategy_history_service.update_history_status(
                task_id=task_id,
                status="success",
                selected_codes=all_selected
            )
            logger.info(f"已更新策略执行历史状态: {strategy_name} -> success, {len(all_selected)} 条结果")
        except Exception as e:
            logger.warning(f"更新策略执行历史状态失败: {e}")

        # 构建任务结果
        task_result = {
            "selected_codes": all_selected,
            "selected_count": len(all_selected),
            "context_hash": context_hash,
        }

        from ..core.redis_task_manager import TaskStatus
        redis_task_manager.update_task_progress(
            task_id, 100,
            f"策略 {strategy_name} 执行完成，从 {total_count} 个候选{entity_name}中筛选出 {len(all_selected)} 个",
            status=TaskStatus.COMPLETED,
            result=task_result
        )

        logger.info(f"策略 {strategy_name} 异步执行完成，筛选出 {len(all_selected)} 个结果")

    def _save_execution_history(
        self,
        user_id: str,
        strategy_name: str,
        context: Dict[str, Any],
        context_hash: str,
        selected_codes: List[str],
        total_candidates: int
    ) -> None:
        """保存策略执行历史"""
        try:
            from .strategy_history_service import strategy_history_service
            
            # 获取策略信息
            strategy_info = self.get_strategy_info(strategy_name) or {}
            strategy_label = strategy_info.get("label", strategy_name)
            
            # 从context提取信息
            entity_type = context.get("entity_type", "stock")
            period = context.get("period", "daily")
            base_date = context.get("trade_date")  # 基准日期
            
            # 调用Service层创建历史记录
            strategy_history_service.create_history(
                user_id=user_id,
                strategy_name=strategy_name,
                strategy_label=strategy_label,
                entity_type=entity_type,
                period=period,
                base_date=base_date,
                context=context,
                context_hash=context_hash,
                selected_codes=selected_codes,
                status="success"
            )
            
            logger.info(f"已保存策略执行历史: {strategy_name} -> {len(selected_codes)} 条结果")
            
        except Exception as e:
            logger.warning(f"保存策略执行历史失败: {e}")

    def _execute_strategy_batch(self, strategy_name: str, candidates: List[str], context: Dict[str, Any],
                                task_id: str = None) -> List[str]:
        """
        执行策略筛选的单个批次
        
        Args:
            strategy_name: 策略名称
            candidates: 候选代码列表
            context: 策略上下文参数
            task_id: 任务ID，用于取消检查
            
        Returns:
            筛选出的代码列表
        """
        try:
            # 检查取消状态
            if task_id:
                from ..core.redis_task_manager import redis_task_manager
                if redis_task_manager.is_task_cancelled(task_id):
                    raise CancellationException("任务已被用户取消")

            # 获取策略处理函数
            handler = self._strategies.get(strategy_name.strip().lower())
            if not handler:
                logger.warning(f"未找到策略: {strategy_name}")
                return []

            # 添加策略名称和实体类型到上下文
            batch_context = context.copy()
            batch_context["strategy_name"] = strategy_name
            batch_context["candidates"] = candidates

            # 执行策略
            result = handler(batch_context)

            if result is None:
                # 策略返回None表示不限制，返回所有候选
                return candidates
            elif isinstance(result, list):
                return result
            else:
                logger.warning(f"策略 {strategy_name} 返回了无效结果类型: {type(result)}")
                return []

        except CancellationException:
            # 重新抛出取消异常，让上层处理
            raise
        except Exception as e:
            logger.error(f"执行策略批次失败: {strategy_name}, 错误: {e}")
            return []

class StrategyHelpers:
    """向策略模块暴露的工具方法集合。

    外部策略文件通过该类访问 StrategyRegistry 中的通用能力，
    避免直接依赖内部实现细节。
    """

    def __init__(self, registry: "StrategyRegistry") -> None:
        self._registry = registry

    # 参数验证
    def validate_strategy_params(self, params: Dict[str, Any], required: List[str] = None,
                                 optional: Dict[str, Any] = None) -> Dict[str, Any]:
        return validate_strategy_params(params, required=required, optional=optional)

    # 通用解析和数据获取方法
    def parse_int_param(self, value: Any, default: Optional[int],
                        min_val: int = None, max_val: int = None) -> Optional[int]:
        return self._registry._parse_int_param(value, default, min_val=min_val, max_val=max_val)

    def get_candidate_codes(self, context: Dict[str, Any]) -> List[str]:
        return self._registry._get_candidate_codes(context)

    def batch_get_indicators(self, candidates: List[str], limit: int,
                             entity_type: str, period: str,
                             trade_date: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        return self._registry._batch_get_indicators(candidates, limit, entity_type, period, trade_date)

    def batch_get_kline_data(self, candidates: List[str], limit: int,
                             entity_type: str, period: str,
                             trade_date: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        return self._registry._batch_get_kline_data(candidates, limit, entity_type, period, trade_date)

# 全局实例
strategy_registry = StrategyRegistry()
