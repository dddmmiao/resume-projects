"""
K线数据返回模型（Pydantic）
定义API返回的K线数据结构，只包含前端需要的字段
"""
from typing import Optional

from pydantic import BaseModel, Field


class BaseKlineItem(BaseModel):
    """基础K线数据项（所有K线类型共有字段）"""
    
    trade_date: str = Field(..., description="交易日期 (YYYYMMDD)")
    open: Optional[float] = Field(None, description="开盘价")
    high: Optional[float] = Field(None, description="最高价")
    low: Optional[float] = Field(None, description="最低价")
    close: Optional[float] = Field(None, description="收盘价")
    pre_close: Optional[float] = Field(None, description="前收盘价")
    change: Optional[float] = Field(None, description="涨跌额")
    pct_chg: Optional[float] = Field(None, description="涨跌幅(%)")
    intraperiod_pct_chg: Optional[float] = Field(None, description="周期内涨跌幅(%): (close-open)/open*100")
    vol: Optional[float] = Field(None, description="成交量(手)")
    amount: Optional[float] = Field(None, description="成交额(千元)")
    volatility: Optional[float] = Field(None, description="波动率(%)")

    expma_5: Optional[float] = Field(None, description="EXPMA5")
    expma_10: Optional[float] = Field(None, description="EXPMA10")
    expma_20: Optional[float] = Field(None, description="EXPMA20")
    expma_60: Optional[float] = Field(None, description="EXPMA60")
    expma_250: Optional[float] = Field(None, description="EXPMA250(年线)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "trade_date": "20240101",
                "open": 10.5,
                "high": 10.8,
                "low": 10.3,
                "close": 10.6,
                "pre_close": 10.4,
                "change": 0.2,
                "pct_chg": 1.92,
                "intraperiod_pct_chg": 1.90,
                "vol": 1000000,
                "amount": 10500000,
                "volatility": 4.76
            }
        }


class StockKlineItem(BaseKlineItem):
    """股票K线数据项（包含开盘竞价数据）"""
    
    # 市值数据
    circ_mv: Optional[float] = Field(None, description="流通市值(万元)")
    
    # 开盘竞价数据（仅股票有）
    auction_vol: Optional[int] = Field(None, description="集合竞价成交量(股)")
    auction_price: Optional[float] = Field(None, description="集合竞价成交均价(元)")
    auction_amount: Optional[float] = Field(None, description="集合竞价成交金额(元)")
    auction_turnover_rate: Optional[float] = Field(None, description="集合竞价换手率(%)")
    auction_volume_ratio: Optional[float] = Field(None, description="集合竞价量比")
    auction_pct_chg: Optional[float] = Field(None, description="集合竞价涨跌幅(%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                **BaseKlineItem.Config.json_schema_extra["example"],
                "auction_vol": 500000,
                "auction_price": 10.55,
                "auction_amount": 5275000,
                "auction_turnover_rate": 0.5,
                "auction_volume_ratio": 1.2,
                "auction_pct_chg": 1.44
            }
        }


class IndexKlineItem(BaseKlineItem):
    """指数K线数据项（行业、概念等，包含市值相关字段）"""
    
    turnover_rate: Optional[float] = Field(None, description="换手率(%)")
    total_mv: Optional[float] = Field(None, description="总市值(千万元)")
    float_mv: Optional[float] = Field(None, description="流通市值(千万元)")
    
    class Config:
        json_schema_extra = {
            "example": {
                **BaseKlineItem.Config.json_schema_extra["example"],
                "turnover_rate": 2.5,
                "total_mv": 1000000,
                "float_mv": 800000
            }
        }


class ConvertibleBondKlineItem(BaseKlineItem):
    """可转债K线数据项（包含可转债特有字段）"""
    
    # 可转债特有字段
    bond_over_rate: Optional[float] = Field(None, description="纯债溢价率(%)")
    cb_value: Optional[float] = Field(None, description="转股价值")
    cb_over_rate: Optional[float] = Field(None, description="转股溢价率(%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                **BaseKlineItem.Config.json_schema_extra["example"],
                "bond_over_rate": 5.2,
                "cb_value": 120.5,
                "cb_over_rate": 15.8
            }
        }

