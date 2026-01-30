"""
量条件模块

检查成交量是否满足条件（当天量是窗口N内平均值的X倍及以上）
支持选择数据源：竞价量(auction_vol) 或 当日成交量(vol)
"""
from typing import Dict, Any, List, Optional
from loguru import logger
from . import register_condition

CONDITION_KEY = "volume"

# 量数据源映射
VOLUME_SOURCE_MAP = {
    "auction": "auction_vol",  # 竞价量（仅股票）
    "daily": "vol",            # 当日成交量（所有标的）
}


def _check_volume_conditions(
    klines: List[Dict[str, Any]],
    window_n: int,
    volume_multiple: float,
    volume_field: str,
    exclude_first_burst_days: Optional[int],
    exclude_low_avg_percent: Optional[float],
) -> bool:
    """检查量条件（基础+排除条件）"""
    if len(klines) < window_n + 1:
        return False
    
    # 提取量数据
    needed_len = window_n + 1 + (exclude_first_burst_days or 0)
    volumes: List[float] = []
    for i, kline in enumerate(klines):
        if i >= needed_len:
            break
        vol = kline.get(volume_field)
        if vol is None:
            return False
        try:
            volumes.append(float(vol))
        except (TypeError, ValueError):
            return False
    
    if len(volumes) < window_n + 1:
        return False
    
    latest_volume = volumes[0]
    
    # 基础量条件：最新量 > 前N条平均值 * 倍数
    avg_volume = sum(volumes[1: window_n + 1]) / window_n
    if avg_volume <= 0:
        return False
        
    if latest_volume <= avg_volume * volume_multiple:
        return False
    
    # 排除条件1：排除第一天爆量
    if exclude_first_burst_days and exclude_first_burst_days > 0:
        has_previous_burst = False
        for i in range(1, min(exclude_first_burst_days + 1, len(volumes))):
            if i + window_n > len(volumes):
                break
            prev_avg = sum(volumes[i + 1: i + window_n + 1]) / window_n
            if prev_avg > 0 and volumes[i] > prev_avg * volume_multiple:
                has_previous_burst = True
                break
        
        if not has_previous_burst:
            return False
    
    # 排除条件2：排除量小于平均量的百分之x
    if exclude_low_avg_percent is not None:
        if latest_volume < avg_volume * (exclude_low_avg_percent / 100.0):
            return False
    
    return True


def execute(
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行量条件筛选"""
    # 解析参数
    window_n = helpers.parse_int_param(params.get("window_n"), None, min_val=1, max_val=100)
    volume_multiple = params.get("volume_multiple")
    if volume_multiple is not None:
        volume_multiple = float(volume_multiple)
    
    # 检查必需参数
    if window_n is None or volume_multiple is None:
        logger.debug("量条件参数不完整，跳过")
        return None
    
    # 量数据源选择（支持多选）
    volume_sources_param = params.get("volume_sources", ["auction"])
    if isinstance(volume_sources_param, str):
        volume_sources_param = [volume_sources_param]
    volume_sources = [s for s in volume_sources_param if s in VOLUME_SOURCE_MAP]
    if not volume_sources:
        volume_sources = ["auction"]
    
    # 匹配模式 (any=任一满足, all=全部满足)
    match_mode = params.get("volume_source_match_mode", "any")
    if match_mode not in {"any", "all"}:
        match_mode = "any"
    
    # 竞价量仅股票支持
    entity_type = context.get("entity_type", "stock")
    if entity_type != "stock" and "auction" in volume_sources:
        volume_sources = [s for s in volume_sources if s != "auction"]
        if not volume_sources:
            logger.debug(f"量条件：竞价量仅支持股票，当前标的类型 {entity_type}")
            return None
    
    # 排除条件参数
    exclude_first_burst_days = helpers.parse_int_param(params.get("exclude_first_burst"), None, min_val=1, max_val=30)
    exclude_low_avg_percent = params.get("exclude_low_avg_percent")
    if exclude_low_avg_percent is not None:
        try:
            exclude_low_avg_percent = float(exclude_low_avg_percent)
        except:
            exclude_low_avg_percent = None
    
    # 计算需要的K线数据长度
    kline_limit = window_n + 1 + (exclude_first_burst_days or 0)
    
    # 批量获取K线数据
    kline_data = helpers.batch_get_kline_data(
        candidates,
        kline_limit,
        entity_type,
        context.get("period", "daily"),
        context.get("trade_date"),
    )
    if not kline_data:
        logger.warning("量条件：无法获取K线数据")
        return []
    
    # 筛选
    selected = []
    for ts_code in candidates:
        klines = kline_data.get(ts_code, [])
        if not klines:
            continue
        
        # 按交易日期降序排列
        klines_sorted = sorted(klines, key=lambda x: x.get("trade_date", ""), reverse=True)
        
        # 检查每个数据源
        passed_sources = []
        for source in volume_sources:
            volume_field = VOLUME_SOURCE_MAP.get(source, "vol")
            if _check_volume_conditions(
                klines_sorted, window_n, volume_multiple, volume_field,
                exclude_first_burst_days, exclude_low_avg_percent
            ):
                passed_sources.append(source)
        
        # 根据匹配模式判断是否通过
        if match_mode == "all":
            if len(passed_sources) == len(volume_sources):
                selected.append(ts_code)
        else:
            if passed_sources:
                selected.append(ts_code)
    
    mode_text = "且" if match_mode == "all" else "或"
    logger.info(f"量条件筛选完成（{volume_sources} {mode_text}）：{len(candidates)} -> {len(selected)}")
    return selected


# 注册条件
register_condition(
    key=CONDITION_KEY,
    label="量条件",
    description="当天量是窗口N内平均量的X倍及以上（支持竞价量/当日成交量）",
    supported_entity_types=["stock", "bond", "concept", "industry"],  # 所有标的（当日成交量）
    parameters={
        "volume_sources": {"type": "list", "default": ["auction"], "description": "量数据源列表(auction/daily)"},
        "volume_source_match_mode": {"type": "str", "default": "any", "description": "数据源匹配模式(any/all)"},
        "window_n": {"type": "int", "default": 5, "description": "窗口N（1-100）"},
        "volume_multiple": {"type": "float", "default": 2.0, "description": "倍数X"},
        "exclude_first_burst": {"type": "int", "default": None, "description": "排除x天内首次爆量"},
        "exclude_low_avg_percent": {"type": "float", "default": None, "description": "排除低于平均的%"},
    },
    execute_fn=execute,
)
