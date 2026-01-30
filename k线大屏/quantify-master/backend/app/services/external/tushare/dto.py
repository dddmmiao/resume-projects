from dataclasses import dataclass
from typing import Optional


@dataclass
class ConceptDTO:
    concept_code: str
    concept_name: str
    list_date: Optional[str] = None
    hot_rank: Optional[int] = None
    hot_score: Optional[float] = None
    hot_date: Optional[str] = None


@dataclass
class IndustryDTO:
    industry_code: str
    industry_name: str
    list_date: Optional[str] = None
    hot_rank: Optional[int] = None
    hot_score: Optional[float] = None
    hot_date: Optional[str] = None


@dataclass
class ThsDailyDTO:
    ts_code: str
    trade_date: str
    open: float
    high: float
    low: float
    close: float
    pre_close: float
    change: float
    pct_chg: float
    vol: float
    amount: float
    turnover_rate: Optional[float] = None
    total_mv: Optional[float] = None
    float_mv: Optional[float] = None
    period: str = "daily"
    data_source: str = "tushare"


@dataclass
class ThsMemberDTO:
    ts_code: str
    code: str
    name: str


@dataclass
class ThsHotDTO:
    trade_date: str
    ts_code: str
    ts_name: str
    rank: int
    hot: float
    rank_time: str
    concept: Optional[str] = None
    rank_reason: Optional[str] = None


@dataclass
class StockDTO:
    ts_code: str
    symbol: str
    name: str
    area: Optional[str] = None
    industry: Optional[str] = None
    market: Optional[str] = None
    list_status: Optional[str] = "L"
    list_date: Optional[str] = None
    delist_date: Optional[str] = None
    is_hs: Optional[str] = None
    hot_rank: Optional[int] = None
    hot_score: Optional[float] = None
    hot_date: Optional[str] = None


@dataclass
class CbDailyDTO:
    ts_code: str
    trade_date: str
    pre_close: float
    open: float
    high: float
    low: float
    close: float
    change: float
    pct_chg: float
    vol: int
    amount: float
    bond_over_rate: Optional[float]
    cb_value: Optional[float]
    cb_over_rate: Optional[float]


@dataclass
class StockKlineDTO:
    ts_code: str
    trade_date: str
    open: float
    high: float
    low: float
    close: float
    pre_close: Optional[float] = None
    change: Optional[float] = None
    pct_chg: Optional[float] = None
    vol: Optional[float] = None
    amount: Optional[float] = None
    data_source: str = "tushare"


@dataclass
class StockAuctionDTO:
    ts_code: str
    trade_date: str
    vol: int
    price: float
    amount: float
    pre_close: float
    turnover_rate: Optional[float] = None
    volume_ratio: Optional[float] = None
    float_share: Optional[float] = None


@dataclass
class TradeCalDTO:
    exchange: Optional[str]
    cal_date: str
    is_open: int


@dataclass
class ThsIndexDTO:
    ts_code: str
    name: str
    count: int
    exchange: str
    list_date: str
    type: str


@dataclass
class CbBasicDTO:
    ts_code: str
    bond_short_name: Optional[str]
    stk_code: Optional[str]
    stk_short_name: Optional[str]
    list_date: Optional[str]
    delist_date: Optional[str]
    issue_date: Optional[str]
    maturity_date: Optional[str]
    issue_size: Optional[float]
    remain_size: Optional[float]  # 剩余规模(亿元)
    conv_start_date: Optional[str]
    conv_end_date: Optional[str]
    first_conv_price: Optional[float]
    conv_price: Optional[float]
    list_status: Optional[str]


@dataclass
class CbCallDTO:
    ts_code: str
    call_type: Optional[str]
    is_call: Optional[str]
    ann_date: Optional[str]
    call_date: Optional[str]
    call_price: Optional[float]
    call_price_tax: Optional[float]
    call_vol: Optional[float]
    call_amount: Optional[float]
    payment_date: Optional[str]
    call_reg_date: Optional[str]


@dataclass
class DailyBasicDTO:
    """每日指标DTO"""
    ts_code: str
    trade_date: str
    close: Optional[float] = None
    turnover_rate: Optional[float] = None      # 换手率（%）
    turnover_rate_f: Optional[float] = None    # 换手率（自由流通股）
    volume_ratio: Optional[float] = None       # 量比
    pe: Optional[float] = None                 # 市盈率（总市值/净利润，亏损为空）
    pe_ttm: Optional[float] = None             # 市盈率TTM
    pb: Optional[float] = None                 # 市净率（总市值/净资产）
    ps: Optional[float] = None                 # 市销率
    ps_ttm: Optional[float] = None             # 市销率TTM
    dv_ratio: Optional[float] = None           # 股息率（%）
    dv_ttm: Optional[float] = None             # 股息率TTM（%）
    total_share: Optional[float] = None        # 总股本（万股）
    float_share: Optional[float] = None        # 流通股本（万股）
    free_share: Optional[float] = None         # 自由流通股本（万股）
    total_mv: Optional[float] = None           # 总市值（万元）
    circ_mv: Optional[float] = None            # 流通市值（万元）
