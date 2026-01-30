"""
趋势条件M模块

最近M个交易日内，ab序列单调性约束（独立涨跌选择）
"""
from typing import Dict, Any, List, Optional
from loguru import logger
from . import register_condition

CONDITION_KEY = "trend_m"


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行趋势条件M筛选"""
    # 解析参数
    m_days = helpers.parse_int_param(params.get("m_days"), None, min_val=1, max_val=180)
    ab_up_series = params.get("ab_up_series") or []
    ab_down_series = params.get("ab_down_series") or []
    monotonic_type = params.get("monotonic_type") or "trend"
    
    # 涨序列匹配模式 (any=任一序列满足, all=全部序列满足)
    up_match_mode = params.get("ab_up_series_match_mode", "any")
    if up_match_mode not in {"any", "all"}:
        up_match_mode = "all"
    
    # 跌序列匹配模式
    down_match_mode = params.get("ab_down_series_match_mode", "any")
    if down_match_mode not in {"any", "all"}:
        down_match_mode = "all"
    
    # 检查是否启用
    if m_days is None or (len(ab_up_series) == 0 and len(ab_down_series) == 0):
        logger.debug("趋势条件M参数不完整，跳过")
        return None
    
    # 获取指标数据
    entity_type = context.get("entity_type", "stock")
    indicators_data = helpers.batch_get_indicators(
        candidates,
        m_days,
        entity_type,
        context.get("period", "daily"),
        context.get("trade_date"),
    )
    if not indicators_data:
        logger.warning("趋势条件M：无法获取指标数据")
        return []
    
    # 导入expma_bury模块的辅助函数
    from .. import expma_bury
    
    # 计算需要的EXPMA周期
    extract_periods = expma_bury._calculate_needed_periods(
        True, ab_up_series, ab_down_series, False, None, None
    )
    
    # 筛选
    selected = []
    for ts_code in candidates:
        entity_indicators = indicators_data.get(ts_code, [])
        if not entity_indicators:
            continue
        
        # 预处理指标数据
        indicators = expma_bury._prepare_entity_indicators(entity_indicators, m_days)
        if not indicators:
            continue
        
        # 提取EXPMA数据
        expma_data, _ = expma_bury._extract_expma_and_prices(
            indicators, extract_periods, m_days, "close"
        )
        if not expma_data:
            continue
        
        # 检查涨序列
        up_passed = True
        if ab_up_series:
            up_passed_count = 0
            for series in ab_up_series:
                if expma_bury._check_ab_series_direction(
                    expma_data, [series], "up", m_days, monotonic_type
                ):
                    up_passed_count += 1
            
            if up_match_mode == "all":
                up_passed = up_passed_count == len(ab_up_series)
            else:
                up_passed = up_passed_count > 0
        
        # 检查跌序列
        down_passed = True
        if ab_down_series:
            down_passed_count = 0
            for series in ab_down_series:
                if expma_bury._check_ab_series_direction(
                    expma_data, [series], "down", m_days, monotonic_type
                ):
                    down_passed_count += 1
            
            if down_match_mode == "all":
                down_passed = down_passed_count == len(ab_down_series)
            else:
                down_passed = down_passed_count > 0
        
        # 涨跌序列都要满足各自的匹配模式
        if up_passed and down_passed:
            selected.append(ts_code)
    
    up_mode_text = "且" if up_match_mode == "all" else "或"
    down_mode_text = "且" if down_match_mode == "all" else "或"
    logger.info(f"趋势条件M筛选完成（涨[{up_mode_text}] 跌[{down_mode_text}]）：{len(candidates)} -> {len(selected)}")
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="趋势条件M",
    description="最近M个交易日内，ab序列单调性约束",
    supported_entity_types=["stock", "bond", "concept", "industry"],  # 所有标的都支持
    parameters={
        "m_days": {"type": "int", "default": None, "description": "窗口M天数"},
        "ab_up_series": {"type": "list", "default": [], "description": "要求上涨的ab序列"},
        "ab_up_series_match_mode": {"type": "str", "default": "any", "description": "涨序列匹配模式(any/all)"},
        "ab_down_series": {"type": "list", "default": [], "description": "要求下跌的ab序列"},
        "ab_down_series_match_mode": {"type": "str", "default": "any", "description": "跌序列匹配模式(any/all)"},
        "monotonic_type": {"type": "str", "default": "trend", "description": "单调性类型(trend/strict)"},
    },
    execute_fn=execute,
)
