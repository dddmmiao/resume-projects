"""
EXPMA 趋势条件工具模块

提供趋势条件1（ab序列单调性）和条件2（差值单调性）的核心计算函数，
供量价趋势策略（auction_volume）等策略复用。
"""

from typing import Dict, Any, List, Optional


# =========================
# 常量定义
# =========================

# EXPMA周期标签映射：a1~a5 统一系列
LABEL_TO_PERIOD = {
    "a1": 5,    # 短期快线
    "a2": 10,   # 短期慢线
    "a3": 20,   # 中短期线
    "a4": 60,   # 中期线（季线）
    "a5": 250,  # 长期线（年线）
}


def _parse_labels_to_periods(labels: List[str], default: List[int]) -> List[int]:
    """解析标签列表为周期数组（与旧 StrategyRegistry 行为保持一致）。"""
    if not labels:
        return default

    mapping = {"a1": 5, "a2": 10, "a3": 20, "a4": 60, "a5": 250}
    valid_values = [5, 10, 20, 60, 250]

    parsed = [mapping.get(label, 0) for label in labels if label in mapping]
    parsed = [x for x in parsed if x in valid_values]

    return sorted(list(set(parsed))) if parsed else default


def _calculate_needed_periods(
    m_enabled: bool,
    ab_up_series: Optional[List[str]],
    ab_down_series: Optional[List[str]],
    k_enabled: bool,
    diff_first: Optional[str],
    diff_second: Optional[str],
) -> List[int]:
    """计算所有条件需要的周期。"""
    extract_periods: List[int] = []

    # 条件1需要的周期（从ab_up_series和ab_down_series映射）
    if m_enabled:
        all_ab_series = list(set((ab_up_series or []) + (ab_down_series or [])))
        if all_ab_series:
            periods = _parse_labels_to_periods(all_ab_series, [])
            extract_periods.extend(periods)

    # 条件2需要的周期（从diff_first和diff_second映射）
    if k_enabled:
        if diff_first:
            period = LABEL_TO_PERIOD.get(diff_first)
            if period:
                extract_periods.append(period)
        if diff_second:
            period = LABEL_TO_PERIOD.get(diff_second)
            if period:
                extract_periods.append(period)

    return sorted(list(set(extract_periods)))


def _prepare_entity_indicators(
    entity_indicators: List[Dict[str, Any]],
    needed_len: int,
) -> List[Dict[str, Any]]:
    """预处理指标数据：排序和截断（从旧 StrategyRegistry 迁移）。"""
    if not entity_indicators or len(entity_indicators) < needed_len:
        return []

    # 仅在必要时排序一次，并尽早截断
    if len(entity_indicators) >= 2:
        first_date = entity_indicators[0].get("trade_date", "")
        second_date = entity_indicators[1].get("trade_date", "")
        if first_date < second_date:
            entity_indicators.sort(key=lambda x: x.get("trade_date", ""), reverse=True)

    if len(entity_indicators) > needed_len:
        entity_indicators = entity_indicators[:needed_len]

    return entity_indicators


def _extract_expma_and_prices(
    entity_indicators: List[Dict[str, Any]],
    extract_periods: List[int],
    needed_len: int,
    price_type: str = "close",
) -> tuple[Dict[int, List[float]], List[float]]:
    """提取EXPMA和价格数据（从旧 StrategyRegistry 迁移）。"""
    expma_data: Dict[int, List[float]] = {}

    # 提取EXPMA数据
    for period in extract_periods:
        expma_key = f"expma_{period}"
        values: List[float] = []
        for d in entity_indicators:
            v = d.get(expma_key)
            if v is None:
                values = []
                break
            values.append(v)
        if not values:
            return {}, []
        expma_data[period] = values

    # 提取价格数据（支持不同价格类型）
    prices: List[float] = []
    for d in entity_indicators:
        price = d.get(price_type)
        if price is None:
            return {}, []
        prices.append(price)

    return expma_data, prices


def _is_monotonic(arr: List[float], direction: str) -> bool:
    """判断数组是否单调（非严格）。direction: 'up' | 'down'。"""
    if not arr or len(arr) < 2:
        return False
    if direction == "up":
        # 上升趋势：检查是否递增
        for i in range(len(arr) - 1):
            if arr[i] < arr[i + 1]:
                return False
        return True
    if direction == "down":
        # 下降趋势：检查是否递减
        for i in range(len(arr) - 1):
            if arr[i] > arr[i + 1]:
                return False
        return True
    return False


def _is_trend_monotonic_sequence(values: List[float], direction: str) -> bool:
    """检查单条序列的趋势单调性（允许小幅波动）"""
    if not values or len(values) < 2:
        return False

    start_val = values[0]
    end_val = values[-1]

    if direction == "up":
        # 上升趋势：整体应该是递增的
        if end_val >= start_val:
            return False
    elif direction == "down":
        # 下降趋势：整体应该是递减的
        if end_val <= start_val:
            return False
    else:
        return False

    # 允许小幅波动，但整体趋势要正确
    return True


def _check_ab_series_direction(
    expma_data: Dict[int, List[float]],
    ab_series_labels: List[str],
    ab_direction: str,
    m_days: int,
    monotonic_type: str = "trend",
) -> bool:
    """检查 ab 序列在最近 m_days 的方向（从旧 StrategyRegistry 迁移）。"""

    if monotonic_type == "trend":
        # 趋势单调：只检查 b > a 或 b < a 的基本条件
        return _check_trend_monotonic(expma_data, ab_series_labels, ab_direction, m_days)
    else:
        # 严格单调：检查序列的单调性
        return _check_strict_monotonic(expma_data, ab_series_labels, ab_direction, m_days)


def _check_trend_monotonic(
    expma_data: Dict[int, List[float]],
    ab_series_labels: List[str],
    ab_direction: str,
    m_days: int,
) -> bool:
    """检查趋势单调性：检查每个序列的整体趋势，允许小幅波动。"""
    for label in ab_series_labels:
        period = LABEL_TO_PERIOD.get(label)
        if not period or period not in expma_data:
            return False
        values = expma_data[period][:m_days]
        if len(values) < m_days:
            return False

        if not _is_trend_monotonic_sequence(values, ab_direction):
            return False
    return True


def _check_strict_monotonic(
    expma_data: Dict[int, List[float]],
    ab_series_labels: List[str],
    ab_direction: str,
    m_days: int,
) -> bool:
    """检查严格单调性：检查每个序列本身的单调性。"""
    for label in ab_series_labels:
        period = LABEL_TO_PERIOD.get(label)
        if not period or period not in expma_data:
            return False
        values = expma_data[period][:m_days]
        if len(values) < m_days:
            return False
        if not _is_monotonic(values, "down" if ab_direction == "down" else "up"):
            return False
    return True


def _is_trend_monotonic_diff(diff_series: List[float], direction: str) -> bool:
    """检查差值序列的趋势单调性。"""
    if not diff_series or len(diff_series) < 2:
        return False

    start_val = diff_series[0]
    end_val = diff_series[-1]

    if direction == "up":
        # 上升趋势：整体应该是递增的
        if end_val >= start_val:
            return False
    elif direction == "down":
        # 下降趋势：整体应该是递减的
        if end_val <= start_val:
            return False
    else:
        return False

    return True


def _check_diff_monotonicity_flexible(
    expma_data: Dict[int, List[float]],
    diff_first: str,
    diff_second: str,
    diff_direction: str,
    diff_positive_required: bool,
    window_k: int,
    diff_monotonic_type: str = "trend",
) -> bool:
    """检查差值单调性（灵活配置公式）。
    
    Args:
        diff_first: 公式第一项 (a1/a2/a3/a4/a5)
        diff_second: 公式第二项 (a1/a2/a3/a4/a5)
        diff_direction: 变化方向 ('up'=增加, 'down'=减小)
        diff_positive_required: 减小时是否要求差值>0
    """
    # 解析第一项和第二项的周期
    first_period = LABEL_TO_PERIOD.get(diff_first)
    second_period = LABEL_TO_PERIOD.get(diff_second)
    
    if not first_period or not second_period:
        return False
    
    if first_period not in expma_data or second_period not in expma_data:
        return False
    
    first_vals = expma_data[first_period][:window_k]
    second_vals = expma_data[second_period][:window_k]
    
    if len(first_vals) < window_k or len(second_vals) < window_k:
        return False
    
    # 计算差值序列：第一项 - 第二项
    diff_series = []
    for i in range(window_k):
        diff_val = float(first_vals[i]) - float(second_vals[i])
        diff_series.append(diff_val)
    
    # 检查单调性
    if diff_monotonic_type == "trend":
        if not _is_trend_monotonic_diff(diff_series, diff_direction):
            return False
    else:
        if not _is_monotonic(diff_series, "down" if diff_direction == "down" else "up"):
            return False
    
    # 如果要求减小时>0，检查所有差值是否>0
    if diff_direction == "down" and diff_positive_required:
        if not all(v > 0 for v in diff_series):
            return False
    
    return True



