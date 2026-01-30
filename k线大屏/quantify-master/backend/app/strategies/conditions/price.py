"""
价条件筛选模块

包含两个独立的条件：
1. 振幅筛选：基于窗口期内平均振幅筛选标的，排除低波动标的
   振幅 = (最高价 - 最低价) / 收盘价 * 100%
2. 涨停筛选：统计窗口期内涨停次数，筛选符合条件的标的
   主板涨停阈值 9.8%，创业板/科创板 19.8%
"""
from typing import Dict, Any, List, Optional
from loguru import logger
from . import register_condition

CONDITION_KEY = "price"


def _is_gem_or_star(ts_code: str) -> bool:
    """判断是否为创业板或科创板（涨跌幅限制20%）
    
    Args:
        ts_code: 股票代码，格式如 300001.SZ 或 688001.SH
        
    Returns:
        True 如果是创业板(300xxx)或科创板(688xxx)
    """
    if not ts_code:
        return False
    code_prefix = ts_code.split('.')[0][:3]
    return code_prefix in ('300', '301', '688', '689')


def _count_limit_up_days(
    klines: List[Dict[str, Any]],
    window: int,
    is_gem_or_star: bool,
) -> int:
    """统计窗口期内涨停次数
    
    Args:
        klines: K线数据（按日期倒序）
        window: 窗口天数
        is_gem_or_star: 是否为创业板/科创板
        
    Returns:
        涨停次数
    """
    threshold = 19.8 if is_gem_or_star else 9.8
    count = 0
    actual_days = min(window, len(klines))
    
    for i in range(actual_days):
        kline = klines[i]
        pct_chg = kline.get("pct_chg")
        if pct_chg is None:
            continue
        try:
            pct_chg_f = float(pct_chg)
            if pct_chg_f >= threshold:
                count += 1
        except (TypeError, ValueError):
            continue
    
    return count


def _check_avg_amplitude(
    klines: List[Dict[str, Any]],
    min_avg_amplitude: float,
    amplitude_days_window: int,
) -> bool:
    """检查窗口期内平均振幅是否大于阈值
    
    振幅 = (最高价 - 最低价) / 收盘价 * 100
    
    Args:
        klines: K线数据（按日期倒序）
        min_avg_amplitude: 最小平均振幅阈值(%)
        amplitude_days_window: 计算窗口天数
    
    Returns:
        True 如果平均振幅 > 阈值
    """
    if len(klines) < 1:
        return False
    
    actual_days = min(amplitude_days_window, len(klines))
    amplitudes = []
    
    for i in range(actual_days):
        kline = klines[i]
        high = kline.get("high")
        low = kline.get("low")
        close = kline.get("close")
        
        if high is None or low is None or close is None:
            continue
        
        try:
            high_f = float(high)
            low_f = float(low)
            close_f = float(close)
            if close_f <= 0:
                continue
            amplitude = (high_f - low_f) / close_f * 100
            amplitudes.append(amplitude)
        except (TypeError, ValueError):
            continue
    
    if not amplitudes:
        return False
    
    avg_amplitude = sum(amplitudes) / len(amplitudes)
    return avg_amplitude > min_avg_amplitude


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行价条件筛选（振幅筛选和涨停筛选独立控制）
    
    - 条件1 振幅筛选：排除窗口期内平均振幅低于阈值的标的（enable_price控制）
    - 条件2 涨停筛选：筛选窗口期内涨停次数达到阈值的标的（enable_limit_up_filter控制）
    
    两个条件独立，启用哪个就执行哪个，都不启用则直接返回候选列表。
    """
    # === 条件1: 振幅筛选参数 ===
    enable_amplitude_filter = params.get("enable_price", False)
    min_avg_amplitude = float(params.get("min_avg_amplitude", 2.0))
    amplitude_days_window = helpers.parse_int_param(
        params.get("amplitude_days_window"), 20, min_val=1, max_val=100
    )
    
    # === 条件2: 涨停筛选参数 ===
    enable_limit_up_filter = params.get("enable_limit_up_filter", False)
    limit_up_days_window = helpers.parse_int_param(
        params.get("limit_up_days_window"), 250, min_val=1, max_val=500
    )
    min_limit_up_count = helpers.parse_int_param(
        params.get("min_limit_up_count"), 1, min_val=1, max_val=100
    )
    
    # 如果两个都不启用，直接返回（不做任何筛选）
    if not enable_amplitude_filter and not enable_limit_up_filter:
        logger.debug("价条件：振幅筛选和涨停筛选均未启用，跳过")
        return None  # 返回None表示跳过此条件
    
    entity_type = context.get("entity_type", "stock")
    
    # 计算需要获取的最大K线天数
    max_window = 0
    if enable_amplitude_filter:
        max_window = max(max_window, amplitude_days_window)
    if enable_limit_up_filter:
        max_window = max(max_window, limit_up_days_window)
    
    # 批量获取K线数据
    kline_data = helpers.batch_get_kline_data(
        candidates,
        max_window,
        entity_type,
        context.get("period", "daily"),
        context.get("trade_date"),
    )
    if not kline_data:
        logger.warning("价条件筛选：无法获取K线数据")
        return []
    
    # 筛选
    selected = []
    for ts_code in candidates:
        klines = kline_data.get(ts_code, [])
        if not klines:
            continue
        
        klines_sorted = sorted(klines, key=lambda x: x.get("trade_date", ""), reverse=True)
        
        # 条件1: 检查平均振幅（如果启用）
        if enable_amplitude_filter:
            if not _check_avg_amplitude(klines_sorted, min_avg_amplitude, amplitude_days_window):
                continue
        
        # 条件2: 检查涨停次数（如果启用）
        if enable_limit_up_filter:
            is_gem_star = _is_gem_or_star(ts_code)
            limit_up_count = _count_limit_up_days(klines_sorted, limit_up_days_window, is_gem_star)
            if limit_up_count < min_limit_up_count:
                continue
        
        selected.append(ts_code)
    
    # 日志
    log_parts = []
    if enable_amplitude_filter:
        log_parts.append(f"振幅窗口{amplitude_days_window}天，阈值{min_avg_amplitude}%")
    if enable_limit_up_filter:
        log_parts.append(f"涨停窗口{limit_up_days_window}天，次数>={min_limit_up_count}")
    logger.info(f"价条件筛选完成（{', '.join(log_parts)}）：{len(candidates)} -> {len(selected)}")
    
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="价条件",
    description="振幅筛选和涨停筛选（独立控制）",
    supported_entity_types=["stock", "bond", "concept", "industry"],
    parameters={
        "enable_price": {"type": "bool", "default": False, "description": "是否启用振幅筛选"},
        "min_avg_amplitude": {"type": "float", "default": 2.0, "description": "最小平均振幅阈值(%)"},
        "amplitude_days_window": {"type": "int", "default": 20, "description": "平均振幅计算窗口(天)"},
        "enable_limit_up_filter": {"type": "bool", "default": False, "description": "是否启用涨停筛选"},
        "limit_up_days_window": {"type": "int", "default": 250, "description": "涨停统计窗口(天)，默认一年"},
        "min_limit_up_count": {"type": "int", "default": 1, "description": "最小涨停次数"},
    },
    execute_fn=execute,
)
