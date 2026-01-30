"""
趋势条件3：EXPMA价格偏离筛选
筛选价格与EXPMA偏离度低于设定阈值的标的
K线周期使用全局设置，支持多EXPMA周期、多价格类型的OR组合筛选
"""
from typing import Any, Dict, List, Optional, Tuple
from loguru import logger

from . import register_condition

CONDITION_KEY = "trend_cross"

# 有效的价格类型
VALID_PRICE_TYPES = {"open", "high", "close", "low"}
# 有效的EXPMA周期
VALID_EXPMA_PERIODS = {60, 250}
# 有效的K线周期
VALID_KLINE_PERIODS = {"daily", "weekly", "monthly"}


def _check_deviation_condition(
    klines: List[Dict[str, Any]],
    price_types: List[str],
    expma_periods: List[int],
    threshold: float,
) -> Optional[Tuple[float, int]]:
    """
    检查单个标的在单个K线周期下是否满足偏离度条件
    
    Args:
        klines: K线数据（按时间降序排列，最新在前）
        price_types: 价格类型列表 (open/high/close/low)
        expma_periods: EXPMA周期列表 (60/250)
        threshold: 偏离度阈值（百分比）
        
    Returns:
        满足条件时返回 (最小偏离度, 距今周期数)，否则返回None
    """
    if not klines:
        return None
    
    best_result = None  # (deviation, period_index)
    
    # 遍历K线数据（窗口内）
    for i, kline in enumerate(klines):
        # 遍历所有EXPMA周期
        for expma_period in expma_periods:
            expma_field = f"expma_{expma_period}"
            expma_value = kline.get(expma_field)
            
            if expma_value is None:
                continue
            
            try:
                expma_value = float(expma_value)
            except (ValueError, TypeError):
                continue
            
            if expma_value <= 0:
                continue
            
            # 遍历所有价格类型
            for price_type in price_types:
                price_value = kline.get(price_type)
                
                if price_value is None:
                    continue
                
                try:
                    price_value = float(price_value)
                except (ValueError, TypeError):
                    continue
                
                # 计算偏离度
                deviation = abs(price_value - expma_value) / expma_value * 100
                
                # 检查是否满足阈值
                if deviation <= threshold:
                    # 记录最优结果（偏离度最小的）
                    if best_result is None or deviation < best_result[0]:
                        best_result = (deviation, i)
    
    return best_result


def _check_single_deviation(
    kline: Dict[str, Any],
    price_type: str,
    expma_period: int,
    threshold: float,
) -> Optional[float]:
    """检查单个价格类型和EXPMA周期的偏离度"""
    expma_field = f"expma_{expma_period}"
    expma_value = kline.get(expma_field)
    price_value = kline.get(price_type)
    
    if expma_value is None or price_value is None:
        return None
    
    try:
        expma_value = float(expma_value)
        price_value = float(price_value)
    except (ValueError, TypeError):
        return None
    
    if expma_value <= 0:
        return None
    
    deviation = abs(price_value - expma_value) / expma_value * 100
    return deviation if deviation <= threshold else None


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行EXPMA偏离度筛选"""
    # 解析EXPMA周期（支持多选）
    expma_periods_param = params.get("cross_expma_periods", [250])
    if isinstance(expma_periods_param, (int, str)):
        expma_periods_param = [expma_periods_param]
    expma_periods = [p for p in expma_periods_param if p in VALID_EXPMA_PERIODS or int(p) in VALID_EXPMA_PERIODS]
    if not expma_periods:
        expma_periods = [250]
    expma_periods = [int(p) for p in expma_periods]
    
    # EXPMA匹配模式
    expma_match_mode = params.get("cross_expma_match_mode", "any")
    if expma_match_mode not in {"any", "all"}:
        expma_match_mode = "any"
    
    # 解析价格类型（支持多选）
    price_types_param = params.get("cross_price_types", ["close"])
    if isinstance(price_types_param, str):
        price_types_param = [price_types_param]
    price_types = [p for p in price_types_param if p in VALID_PRICE_TYPES]
    if not price_types:
        price_types = ["close"]
    
    # 价格匹配模式
    price_match_mode = params.get("cross_price_match_mode", "any")
    if price_match_mode not in {"any", "all"}:
        price_match_mode = "any"
    
    # 使用全局K线周期（从context获取）
    kline_period = context.get("period", "daily")
    if kline_period not in VALID_KLINE_PERIODS:
        kline_period = "daily"
    
    # 解析窗口天数
    days_window = helpers.parse_int_param(params.get("cross_days_window"), 5, min_val=1, max_val=365)
    
    # 解析偏离度阈值
    threshold = params.get("cross_threshold", 2)
    try:
        threshold = int(threshold)
        if threshold < 1 or threshold > 50:
            threshold = 2
    except (ValueError, TypeError):
        threshold = 2
    
    # 解析偏离度窗口匹配模式 (any=任一天满足, all=所有天满足)
    threshold_match_mode = params.get("cross_threshold_match_mode", "any")
    if threshold_match_mode not in {"any", "all"}:
        threshold_match_mode = "any"
    
    entity_type = context.get("entity_type", "stock")
    
    # 批量获取K线数据（使用全局周期）
    kline_data = helpers.batch_get_kline_data(
        candidates,
        days_window,
        entity_type,
        kline_period,
        context.get("trade_date"),
    )
    if not kline_data:
        logger.warning(f"EXPMA偏离条件：{kline_period} 无法获取K线数据")
        return []
    
    # 筛选（带权重）
    results_with_weight = []
    for ts_code in candidates:
        klines = kline_data.get(ts_code, [])
        if not klines:
            continue
        
        # 按时间降序排列
        klines_sorted = sorted(klines, key=lambda x: x.get("trade_date", ""), reverse=True)
        
        # 检查窗口内K线的偏离度
        if not klines_sorted:
            continue
        
        # 根据窗口匹配模式选择检查范围
        if threshold_match_mode == "all":
            # 所有天都要满足
            klines_to_check = klines_sorted
        else:
            # 任一天满足即可，但优先检查最新的
            klines_to_check = klines_sorted
        
        all_deviations = []
        day_passed_count = 0
        
        for kline in klines_to_check:
            # 收集每个EXPMA周期的结果
            expma_results = {}  # {expma_period: [passed_price_types]}
            day_deviations = []
            
            for expma_period in expma_periods:
                passed_prices = []
                for price_type in price_types:
                    deviation = _check_single_deviation(kline, price_type, expma_period, threshold)
                    if deviation is not None:
                        passed_prices.append(price_type)
                        day_deviations.append(deviation)
                expma_results[expma_period] = passed_prices
            
            # 根据匹配模式判断EXPMA是否通过
            passed_expma_count = 0
            for expma_period, passed_prices in expma_results.items():
                if price_match_mode == "all":
                    if len(passed_prices) == len(price_types):
                        passed_expma_count += 1
                else:
                    if passed_prices:
                        passed_expma_count += 1
            
            # 根据EXPMA匹配模式判断该天是否通过
            day_passed = False
            if expma_match_mode == "all":
                day_passed = passed_expma_count == len(expma_periods)
            else:
                day_passed = passed_expma_count > 0
            
            if day_passed:
                day_passed_count += 1
                all_deviations.extend(day_deviations)
                
                # any模式下，找到一天满足就可以跳出
                if threshold_match_mode == "any":
                    break
        
        # 根据窗口匹配模式判断标的是否通过
        passed = False
        if threshold_match_mode == "all":
            # 所有天都要满足
            passed = day_passed_count == len(klines_to_check)
        else:
            # 任一天满足
            passed = day_passed_count > 0
        
        if passed and all_deviations:
            best_deviation = min(all_deviations)
            results_with_weight.append((ts_code, best_deviation))
    
    # 按偏离度排序（偏离度越小排越前）
    results_with_weight.sort(key=lambda x: x[1])
    selected = [r[0] for r in results_with_weight]
    
    expma_mode_text = "且" if expma_match_mode == "all" else "或"
    price_mode_text = "且" if price_match_mode == "all" else "或"
    threshold_mode_text = "且" if threshold_match_mode == "all" else "或"
    logger.info(
        f"EXPMA偏离条件筛选完成（{kline_period} EXPMA[{expma_mode_text}]:{expma_periods} "
        f"价格[{price_mode_text}]:{price_types} 阈值[{threshold_mode_text}]:{threshold}%）：{len(candidates)} -> {len(selected)}"
    )
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="EXPMA偏离",
    description="筛选价格与EXPMA偏离度低于阈值的标的（使用全局K线周期）",
    supported_entity_types=["stock", "bond", "concept", "industry"],
    parameters={
        "cross_expma_periods": {"type": "list", "default": [250], "description": "EXPMA周期列表(60/250)"},
        "cross_expma_match_mode": {"type": "str", "default": "any", "description": "EXPMA匹配模式(any/all)"},
        "cross_price_types": {"type": "list", "default": ["close"], "description": "价格类型列表(open/high/close/low)"},
        "cross_price_match_mode": {"type": "str", "default": "any", "description": "价格匹配模式(any/all)"},
        "cross_days_window": {"type": "int", "default": 5, "description": "窗口周期数"},
        "cross_threshold": {"type": "int", "default": 2, "description": "偏离度阈值%"},
        "cross_threshold_match_mode": {"type": "str", "default": "any", "description": "阈值窗口匹配模式(any/all)"},
    },
    execute_fn=execute,
)
