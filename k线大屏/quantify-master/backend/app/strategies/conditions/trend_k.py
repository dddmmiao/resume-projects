"""
趋势条件K模块

最近K个交易日内，差值单调性约束
"""
from typing import Dict, Any, List, Optional
from loguru import logger
from . import register_condition

CONDITION_KEY = "trend_k"


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行趋势条件K筛选"""
    # 解析参数
    window_k = helpers.parse_int_param(params.get("window_k"), None, min_val=1, max_val=180)
    diff_first = params.get("diff_first") or "a4"
    diff_second = params.get("diff_second") or "a1"
    diff_direction = params.get("diff_direction")
    diff_positive_required = params.get("diff_positive_required") or False
    diff_monotonic_type = params.get("diff_monotonic_type") or "trend"
    
    # 检查是否启用
    if window_k is None or not diff_first or not diff_second or not diff_direction:
        logger.debug("趋势条件K参数不完整，跳过")
        return None
    
    # 获取指标数据
    entity_type = context.get("entity_type", "stock")
    indicators_data = helpers.batch_get_indicators(
        candidates,
        window_k,
        entity_type,
        context.get("period", "daily"),
        context.get("trade_date"),
    )
    if not indicators_data:
        logger.warning("趋势条件K：无法获取指标数据")
        return []
    
    # 导入expma_bury模块的辅助函数
    from .. import expma_bury
    
    # 计算需要的EXPMA周期
    extract_periods = expma_bury._calculate_needed_periods(
        False, [], [], True, diff_first, diff_second
    )
    
    # 筛选
    selected = []
    for ts_code in candidates:
        entity_indicators = indicators_data.get(ts_code, [])
        if not entity_indicators:
            continue
        
        # 预处理指标数据
        indicators = expma_bury._prepare_entity_indicators(entity_indicators, window_k)
        if not indicators:
            continue
        
        # 提取EXPMA数据
        expma_data, _ = expma_bury._extract_expma_and_prices(
            indicators, extract_periods, window_k, "close"
        )
        if not expma_data:
            continue
        
        # 检查差值单调性
        if not expma_bury._check_diff_monotonicity_flexible(
            expma_data, diff_first, diff_second, diff_direction,
            diff_positive_required, window_k, diff_monotonic_type
        ):
            continue
        
        selected.append(ts_code)
    
    logger.info(f"趋势条件K筛选完成：{len(candidates)} -> {len(selected)}")
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="趋势条件K",
    description="最近K个交易日内，差值单调性约束",
    supported_entity_types=["stock", "bond", "concept", "industry"],  # 所有标的都支持
    parameters={
        "window_k": {"type": "int", "default": None, "description": "窗口K天数"},
        "diff_first": {"type": "str", "default": "a4", "description": "差值公式第一项"},
        "diff_second": {"type": "str", "default": "a1", "description": "差值公式第二项"},
        "diff_direction": {"type": "str", "default": None, "description": "方向(up/down)"},
        "diff_positive_required": {"type": "bool", "default": False, "description": "要求差值为正"},
        "diff_monotonic_type": {"type": "str", "default": "trend", "description": "单调性类型(trend/strict)"},
    },
    execute_fn=execute,
)
