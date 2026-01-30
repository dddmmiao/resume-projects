"""
数据映射器 - DTO到数据库字典的转换工具
"""

from dataclasses import asdict
from typing import List, Dict, Any, Union

from .dto import (
    ConceptDTO, IndustryDTO, StockDTO, TradeCalDTO, StockKlineDTO, StockAuctionDTO,
    ThsDailyDTO, ThsMemberDTO, ThsHotDTO, CbBasicDTO, CbDailyDTO, CbCallDTO, DailyBasicDTO
)


# ========== 通用映射工具 ==========
def auto_convert_dto_to_dict(dto) -> Dict[str, Any]:
    """保留简单自动转换（字段完全一致时使用）。"""
    return asdict(dto)


def simple_dto_to_dicts(dtos: List[Any]) -> List[Dict[str, Any]]:
    """简单DTO列表转字典列表（字段完全匹配时使用）"""
    return [auto_convert_dto_to_dict(dto) for dto in dtos]


def calculate_volatility(dto) -> Union[int, None, Any]:
    """
    计算波动率的通用函数
    
    Args:
        dto: 包含 high, low, close, open 字段的 DTO 对象
        
    Returns:
        float: 波动率值，根据收盘价与开盘价决定正负
        None: 计算失败时返回 None
    """
    # 计算波动率: (high - low) / close * 100，根据收盘价与开盘价决定正负
    if dto.high is not None and dto.low is not None and dto.close is not None and dto.close != 0:
        try:
            volatility_abs = (dto.high - dto.low) / dto.close * 100
            # 根据收盘价与开盘价决定波动率正负：收盘价>=开盘价为正，否则为负
            if dto.open is not None:
                return volatility_abs if dto.close >= dto.open else -volatility_abs
            else:
                return volatility_abs  # 无开盘价信息时默认为正
        except (ZeroDivisionError, TypeError):
            return None
    else:
        return None


def calculate_intraperiod_pct_chg(dto) -> Union[float, None]:
    """
    计算周期内涨跌幅: (close - open) / open * 100
    
    Args:
        dto: 包含 open, close 字段的 DTO 对象
        
    Returns:
        float: 周期内涨跌幅
        None: 计算失败时返回 None
    """
    if dto.open is not None and dto.open != 0 and dto.close is not None:
        try:
            return (dto.close - dto.open) / dto.open * 100
        except (ZeroDivisionError, TypeError):
            return None
    return None


def clean_kline_ohlc(dto) -> Dict[str, Any]:
    """
    清洗K线数据中的 open/high/low/close 异常值
    
    规则：
    1. 如果某个值为0，尝试用其他非0值替代
    2. 如果所有OHLC都为0，使用 pre_close 替代
    3. 优先级：close > open > high/low > pre_close
    
    Args:
        dto: K线 DTO 对象
        
    Returns:
        Dict[str, Any]: 清洗后的 OHLC 字典
    """
    open_val = dto.open if dto.open and dto.open != 0 else None
    high_val = dto.high if dto.high and dto.high != 0 else None
    low_val = dto.low if dto.low and dto.low != 0 else None
    close_val = dto.close if dto.close and dto.close != 0 else None
    pre_close_val = dto.pre_close if hasattr(dto, 'pre_close') and dto.pre_close else None
    
    # 收集所有非0值
    valid_values = [v for v in [open_val, high_val, low_val, close_val] if v is not None]
    
    # 如果所有OHLC都为0，使用 pre_close
    if not valid_values:
        fallback = pre_close_val if pre_close_val else 0
        return {
            'open': fallback,
            'high': fallback,
            'low': fallback,
            'close': fallback
        }
    
    # 使用优先级策略填充缺失值
    # 优先使用 close，其次 open，再次 pre_close，最后保持原值
    best_value = close_val or open_val or pre_close_val
    
    return {
        'open': open_val if open_val is not None else (best_value if best_value is not None else dto.open),
        'high': high_val if high_val is not None else (max(valid_values) if valid_values else (best_value if best_value is not None else dto.high)),
        'low': low_val if low_val is not None else (min(valid_values) if valid_values else (best_value if best_value is not None else dto.low)),
        'close': close_val if close_val is not None else (best_value if best_value is not None else dto.close)
    }


def kline_dtos_to_dicts(dtos: List[Any]) -> List[Dict[str, Any]]:
    """
    K线 DTO 转换为数据库字典的通用函数，并计算波动率和周期内涨跌幅
    
    Args:
        dtos: K线 DTO 列表（StockKlineDTO, ThsDailyDTO, CbDailyDTO 等）
        
    Returns:
        List[Dict[str, Any]]: 包含波动率和周期内涨跌幅的字典列表
    """
    result = []
    for dto in dtos:
        data = auto_convert_dto_to_dict(dto)
        
        # 清洗 OHLC 数据
        cleaned_ohlc = clean_kline_ohlc(dto)
        data.update(cleaned_ohlc)
        
        # 计算衍生字段（使用清洗后的数据）
        data['volatility'] = calculate_volatility(dto)
        data['intraperiod_pct_chg'] = calculate_intraperiod_pct_chg(dto)
        result.append(data)
    return result


def concepts_to_upsert_dicts(dtos: List[ConceptDTO]) -> List[Dict[str, Any]]:
    """概念DTO转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def industries_to_upsert_dicts(dtos: List[IndustryDTO]) -> List[Dict[str, Any]]:
    """行业DTO转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def trade_cal_to_upsert_dicts(dtos: List[TradeCalDTO]) -> List[Dict[str, Any]]:
    """交易日历 DTO 转换为数据库字典"""
    from datetime import datetime
    
    result = []
    for dto in dtos:
        # 解析日期 - Tushare返回的字段是cal_date
        trade_date_str = str(dto.cal_date)
        if not trade_date_str or trade_date_str == 'nan':
            continue  # 跳过无效日期记录
        
        try:
            trade_date = datetime.strptime(trade_date_str, '%Y%m%d').date()
        except ValueError:
            continue  # 跳过无效日期格式
        
        # 判断是否为周末
        is_weekend = trade_date.weekday() >= 5
        
        # 判断是否开市 - Tushare返回的是数字：1表示开市，0表示休市
        is_open = dto.is_open == 1
        
        # 判断是否为节假日（非周末且不开市）
        is_holiday = not is_weekend and not is_open
        
        # 获取星期几
        week_days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        week_day = week_days[trade_date.weekday()]
        
        # 获取年月季度
        year = str(trade_date.year)
        month = f"{trade_date.month:02d}"
        quarter = str((trade_date.month - 1) // 3 + 1)
        
        result.append({
            "exchange": dto.exchange,
            "trade_date": trade_date,
            "is_open": is_open,
            "is_weekend": is_weekend,
            "is_holiday": is_holiday,
            "holiday_name": None,  # Tushare API 不提供节假日名称
            "week_day": week_day,
            "year": year,
            "month": month,
            "quarter": quarter,
        })
    
    return result


def stock_kline_to_upsert_dicts(dtos: List[StockKlineDTO]) -> List[Dict[str, Any]]:
    """股票K线 DTO 转换为数据库字典，并计算波动率"""
    return kline_dtos_to_dicts(dtos)


def stock_basic_to_upsert_dicts(dtos: List[StockDTO]) -> List[Dict[str, Any]]:
    """股票基本信息DTO转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def ths_daily_to_dicts(dtos: List[ThsDailyDTO]) -> List[Dict[str, Any]]:
    """同花顺日线 DTO 转换为数据库字典，并计算波动率"""
    return kline_dtos_to_dicts(dtos)


def ths_member_to_dicts(dtos: List[ThsMemberDTO]) -> List[Dict[str, Any]]:
    """同花顺成员 DTO 转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def ths_hot_to_dicts(dtos: List[ThsHotDTO], code_field: str = "ts_code") -> List[Dict[str, Any]]:
    """
    同花顺热榜 DTO 转换为数据库字典
    
    Args:
        dtos: ThsHotDTO 列表
        code_field: 代码字段名 ("ts_code", "concept_code", "industry_code")
    """
    return [
        {
            code_field: dto.ts_code,
            "hot_rank": dto.rank,  # rank -> hot_rank
            "hot_score": dto.hot,  # hot -> hot_score
            "trade_date": dto.trade_date,
            "ts_name": dto.ts_name,
            "hot_concept": dto.concept,  # concept -> hot_concept
            "hot_rank_reason": dto.rank_reason,  # rank_reason -> hot_rank_reason
        }
        for dto in dtos
    ]


def ths_hot_to_concept_dicts(dtos: List[ThsHotDTO]) -> List[Dict[str, Any]]:
    """同花顺热榜 DTO 转换为概念数据库字典"""
    return ths_hot_to_dicts(dtos, "concept_code")


def ths_hot_to_industry_dicts(dtos: List[ThsHotDTO]) -> List[Dict[str, Any]]:
    """同花顺热榜 DTO 转换为行业数据库字典"""
    return ths_hot_to_dicts(dtos, "industry_code")


def cb_basic_to_dicts(dtos: List[CbBasicDTO]) -> List[Dict[str, Any]]:
    """可转债基本信息 DTO 转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def cb_daily_dto_to_dicts(dtos: List[CbDailyDTO]) -> List[Dict[str, Any]]:
    """可转债日线 DTO 转换为数据库字典，并计算波动率"""
    return kline_dtos_to_dicts(dtos)


def cb_call_to_dicts(dtos: List[CbCallDTO]) -> List[Dict[str, Any]]:
    """可转债赎回 DTO 转换为数据库字典"""
    return simple_dto_to_dicts(dtos)


def stock_auction_to_update_dicts(dtos: List[StockAuctionDTO]) -> List[Dict[str, Any]]:
    """
    开盘竞价 DTO 转换为数据库更新字典
    用于更新K线表中的开盘竞价字段
    
    Args:
        dtos: 开盘竞价DTO列表
        
    Returns:
        包含开盘竞价字段的字典列表，用于更新K线数据
    """
    result = []
    for dto in dtos:
        # 计算涨跌幅: (price - pre_close) / pre_close * 100
        # 特殊规则：price 为 0 表示当日停牌，此时涨跌幅视为 0 而不是 -100%
        auction_pct_chg = None
        if dto.price == 0:
            auction_pct_chg = 0
        elif dto.pre_close and dto.pre_close > 0:
            auction_pct_chg = (dto.price - dto.pre_close) / dto.pre_close * 100
        
        result.append({
            "ts_code": dto.ts_code,
            "trade_date": dto.trade_date,
            "auction_vol": dto.vol,  # 成交量(股)
            "auction_price": dto.price,  # 成交均价(元)
            "auction_amount": dto.amount,  # 成交金额(元)
            "auction_turnover_rate": dto.turnover_rate,  # 换手率(%)
            "auction_volume_ratio": dto.volume_ratio,  # 量比
            "auction_pct_chg": auction_pct_chg,  # 涨跌幅(%)
            "pre_close": dto.pre_close,  # 前收盘价，用于初始化基础字段
            "float_share": dto.float_share,  # 流通股本(万股)，用于计算流通市值
        })
    return result


def daily_basic_to_dicts(dtos: List[DailyBasicDTO]) -> List[Dict[str, Any]]:
    """每日指标 DTO 转换为数据库字典"""
    return simple_dto_to_dicts(dtos)
