"""
趋势收敛条件
筛选EXPMA线对符合收敛趋势的标的

线对定义：
- a: 5和20，20为基准线，5为对比线
- b: 20和60，60为基准线，20为对比线
- c: 60和250，250为基准线，60为对比线

两类趋势：
- 趋势1（多头收敛）：基准线上涨，(对比线-基准线)递减，可选>0
- 趋势2（空头收敛）：基准线下跌，(基准线-对比线)递减，可选>0
"""
from typing import Any, Dict, List, Optional, Tuple
from loguru import logger

from . import register_condition

CONDITION_KEY = "trend_converge"

# 线对定义：(基准线周期, 对比线周期)
LINE_PAIRS = {
    "a": (20, 5),    # 20为基准，5为对比
    "b": (60, 20),   # 60为基准，20为对比
    "c": (250, 60),  # 250为基准，60为对比
}


def _check_monotonic(values: List[float], direction: str, monotonic_type: str) -> bool:
    """
    检查序列单调性
    
    Args:
        values: 数值序列（按时间正序，旧->新）
        direction: 方向 (up=递增, down=递减)
        monotonic_type: 类型 (strict=严格单调, trend=趋势单调)
    """
    if len(values) < 2:
        return True
    
    if monotonic_type == "strict":
        # 严格单调
        for i in range(1, len(values)):
            if direction == "up" and values[i] <= values[i - 1]:
                return False
            if direction == "down" and values[i] >= values[i - 1]:
                return False
        return True
    else:
        # 趋势单调：首尾比较
        if direction == "up":
            return values[-1] > values[0]
        else:
            return values[-1] < values[0]


def _check_converge_condition(
    klines: List[Dict[str, Any]],
    base_period: int,
    compare_period: int,
    trend_type: str,
    monotonic_type: str,
    diff_positive: bool,
    window: int,
) -> Optional[Tuple[float, int]]:
    """
    检查单个标的的收敛条件
    
    Args:
        klines: K线数据（按时间降序排列，最新在前）
        base_period: 基准线EXPMA周期
        compare_period: 对比线EXPMA周期
        trend_type: 趋势类型 (type1=多头收敛, type2=空头收敛, either=任一)
        monotonic_type: 单调性类型 (strict/trend)
        diff_positive: 是否要求不交叉（差值保持同号）
        window: 检查窗口
        
    Returns:
        满足条件时返回 (0, 0)，否则返回None
    """
    if len(klines) < window:
        return None
    
    base_field = f"expma_{base_period}"
    compare_field = f"expma_{compare_period}"
    
    # 取窗口内数据并反转为时间正序（旧->新）
    window_klines = klines[:window][::-1]
    
    # 提取数据
    base_values = []
    compare_values = []
    diffs = []
    
    for kline in window_klines:
        base_val = kline.get(base_field)
        compare_val = kline.get(compare_field)
        
        if base_val is None or compare_val is None:
            return None
        
        try:
            base_val = float(base_val)
            compare_val = float(compare_val)
        except (ValueError, TypeError):
            return None
        
        if base_val <= 0:
            return None
        
        base_values.append(base_val)
        compare_values.append(compare_val)
        diffs.append(compare_val - base_val)
    
    # 获取最新值
    latest_base = base_values[-1]
    latest_compare = compare_values[-1]
    latest_diff = diffs[-1]
    
    # 检查差值是否全部同号（不跨越0）
    def check_no_zero_cross():
        if len(diffs) < 2:
            return True
        first_sign = diffs[0] > 0
        return all((d > 0) == first_sign for d in diffs)
    
    # 检查趋势1：多头收敛（基准线上涨 + 差值递减 + 可选不跨0）
    def check_type1():
        # 基准线上涨
        if not _check_monotonic(base_values, "up", monotonic_type):
            return False
        # 差值(对比-基准)递减
        if not _check_monotonic(diffs, "down", monotonic_type):
            return False
        # 可选：差值不跨越0（窗口内保持同号）
        if diff_positive and not check_no_zero_cross():
            return False
        return True
    
    # 检查趋势2：空头收敛（基准线下跌 + 差值递增(即基准-对比递减) + 可选不跨0）
    def check_type2():
        # 基准线下跌
        if not _check_monotonic(base_values, "down", monotonic_type):
            return False
        # 差值(对比-基准)递增，等价于(基准-对比)递减
        if not _check_monotonic(diffs, "up", monotonic_type):
            return False
        # 可选：差值不跨越0（窗口内保持同号）
        if diff_positive and not check_no_zero_cross():
            return False
        return True
    
    # 根据趋势类型判断
    if trend_type == "type1":
        if not check_type1():
            return None
    elif trend_type == "type2":
        if not check_type2():
            return None
    else:  # either
        if not (check_type1() or check_type2()):
            return None
    
    return (0, 0)


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行趋势收敛条件筛选"""
    # 解析线对（支持多选）
    line_pairs_param = params.get("converge_line_pairs", ["a", "b"])
    if isinstance(line_pairs_param, str):
        line_pairs_param = [line_pairs_param]
    line_pairs = [p for p in line_pairs_param if p in LINE_PAIRS]
    if not line_pairs:
        line_pairs = ["a", "b"]
    
    # 解析线对匹配模式 (any=任一满足, all=全部满足)
    line_pair_match_mode = params.get("converge_line_pair_match_mode", "any")
    if line_pair_match_mode not in {"any", "all"}:
        line_pair_match_mode = "any"
    
    # 解析趋势类型（支持多选数组）
    trend_types_param = params.get("converge_trend_types", ["type1"])
    if isinstance(trend_types_param, str):
        trend_types_param = [trend_types_param]
    trend_types = [t for t in trend_types_param if t in {"type1", "type2"}]
    if not trend_types:
        trend_types = ["type1"]
    
    # 解析趋势匹配模式 (any=任一满足, all=全部满足)
    trend_match_mode = params.get("converge_trend_match_mode", "any")
    if trend_match_mode not in {"any", "all"}:
        trend_match_mode = "any"
    
    # 解析单调性类型
    monotonic_type = params.get("converge_monotonic_type", "trend")
    if monotonic_type not in {"strict", "trend"}:
        monotonic_type = "trend"
    
    # 解析差值正负要求
    diff_positive = params.get("converge_diff_positive", False)
    
    # 解析窗口
    window = helpers.parse_int_param(params.get("converge_window"), 5, min_val=2, max_val=60)
    
    entity_type = context.get("entity_type", "stock")
    kline_period = context.get("period", "daily")
    
    # 批量获取K线数据
    kline_data = helpers.batch_get_kline_data(
        candidates,
        window,
        entity_type,
        kline_period,
        context.get("trade_date"),
    )
    if not kline_data:
        logger.warning(f"趋势收敛条件：{kline_period} 无法获取K线数据")
        return []
    
    # 筛选（带权重）
    results_with_weight = []
    for ts_code in candidates:
        klines = kline_data.get(ts_code, [])
        if not klines:
            continue
        
        # 按时间降序排列
        klines_sorted = sorted(klines, key=lambda x: x.get("trade_date", ""), reverse=True)
        
        # 检查线对和趋势组合
        # 根据匹配模式决定逻辑
        def check_single_combination(pair_key: str, trend_type: str) -> Optional[float]:
            """检查单个线对+趋势类型组合"""
            base_period, compare_period = LINE_PAIRS[pair_key]
            result = _check_converge_condition(
                klines_sorted,
                base_period,
                compare_period,
                trend_type,
                monotonic_type,
                diff_positive,
                window,
            )
            return result[0] if result else None
        
        # 收集所有满足条件的组合
        passed_pairs = []  # [(pair_key, best_deviation)]
        for pair_key in line_pairs:
            pair_passed_trends = []
            for trend_type in trend_types:
                deviation = check_single_combination(pair_key, trend_type)
                if deviation is not None:
                    pair_passed_trends.append((trend_type, deviation))
            
            # 根据趋势匹配模式判断该线对是否通过
            if trend_match_mode == "all":
                # 全部趋势类型都要满足
                if len(pair_passed_trends) == len(trend_types):
                    best_dev = min(d for _, d in pair_passed_trends)
                    passed_pairs.append((pair_key, best_dev))
            else:
                # 任一趋势类型满足即可
                if pair_passed_trends:
                    best_dev = min(d for _, d in pair_passed_trends)
                    passed_pairs.append((pair_key, best_dev))
        
        # 根据线对匹配模式判断该标的是否通过
        if line_pair_match_mode == "all":
            # 全部线对都要满足
            if len(passed_pairs) == len(line_pairs):
                best_deviation = min(d for _, d in passed_pairs)
                results_with_weight.append((ts_code, best_deviation, "all"))
        else:
            # 任一线对满足即可
            if passed_pairs:
                best_deviation = min(d for _, d in passed_pairs)
                best_pair = min(passed_pairs, key=lambda x: x[1])[0]
                results_with_weight.append((ts_code, best_deviation, best_pair))
    
    # 按偏离度排序
    results_with_weight.sort(key=lambda x: x[1])
    selected = [r[0] for r in results_with_weight]
    
    # 构建日志文本
    trend_names = {"type1": "多头", "type2": "空头"}
    trend_text = "+".join(trend_names.get(t, t) for t in trend_types)
    line_mode_text = "且" if line_pair_match_mode == "all" else "或"
    trend_mode_text = "且" if trend_match_mode == "all" else "或"
    logger.info(
        f"趋势收敛条件筛选完成（{kline_period} 线对[{line_mode_text}]:{line_pairs} "
        f"趋势[{trend_mode_text}]:{trend_text}）：{len(candidates)} -> {len(selected)}"
    )
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="趋势收敛",
    description="筛选EXPMA线对符合收敛趋势的标的",
    supported_entity_types=["stock", "bond", "concept", "industry"],
    parameters={
        "converge_line_pairs": {"type": "list", "default": ["a", "b"], "description": "线对列表(a/b/c)"},
        "converge_line_pair_match_mode": {"type": "str", "default": "any", "description": "线对匹配模式(any/all)"},
        "converge_trend_types": {"type": "list", "default": ["type1"], "description": "趋势类型列表(type1/type2)"},
        "converge_trend_match_mode": {"type": "str", "default": "any", "description": "趋势匹配模式(any/all)"},
        "converge_monotonic_type": {"type": "str", "default": "trend", "description": "单调性类型(strict/trend)"},
        "converge_diff_positive": {"type": "bool", "default": False, "description": "差值正负要求"},
        "converge_window": {"type": "int", "default": 5, "description": "窗口周期数"},
    },
    execute_fn=execute,
)
