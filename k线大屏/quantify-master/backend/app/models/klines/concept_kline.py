"""
概念K线数据基类 - 升级SQLModel
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import DECIMAL
from sqlmodel import SQLModel, Field


class ConceptKlineDataBase(SQLModel):
    """概念指数K线数据基础模型 - SQLModel字段定义模板
    
    🔧 修复：移除table=True，这是字段定义模板，不创建实际表
    """
    # 不设置__tablename__，这只是字段定义模板

    # 基础数据字段 - 使用sa_column_kwargs直接指定数据库注释
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID", sa_column_kwargs={"comment": "主键ID"})
    ts_code: str = Field(max_length=20, index=True, description="概念指数代码", sa_column_kwargs={"comment": "概念指数代码"})
    trade_date: date = Field(index=True, description="交易日期", sa_column_kwargs={"comment": "交易日期"})
    period: str = Field(default="daily", max_length=10, description="周期类型：daily/weekly/monthly", sa_column_kwargs={"comment": "周期类型：daily/weekly/monthly"})
    
    # OHLC数据
    open: Optional[Decimal] = Field(default=None, description="开盘价", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "开盘价"})
    high: Optional[Decimal] = Field(default=None, description="最高价", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "最高价"})
    low: Optional[Decimal] = Field(default=None, description="最低价", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "最低价"})
    close: Optional[Decimal] = Field(default=None, description="收盘价", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "收盘价"})
    pre_close: Optional[Decimal] = Field(default=None, description="昨收价", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "昨收价"})
    change: Optional[Decimal] = Field(default=None, description="涨跌额", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "涨跌额"})
    pct_chg: Optional[Decimal] = Field(default=None, description="涨跌幅", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "涨跌幅"})
    intraperiod_pct_chg: Optional[Decimal] = Field(default=None, description="周期内涨跌幅(%): (close-open)/open*100", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "周期内涨跌幅(%): (close-open)/open*100"})
    vol: Optional[Decimal] = Field(default=None, description="成交量", sa_type=DECIMAL(15, 2), sa_column_kwargs={"comment": "成交量"})
    amount: Optional[Decimal] = Field(default=None, description="成交额(千元)", sa_type=DECIMAL(15, 2), sa_column_kwargs={"comment": "成交额(千元)"})
    turnover_rate: Optional[Decimal] = Field(default=None, description="换手率(%)", sa_type=DECIMAL(8, 4), sa_column_kwargs={"comment": "换手率(%)"})
    total_mv: Optional[Decimal] = Field(default=None, description="总市值(千万元)", sa_type=DECIMAL(10, 2), sa_column_kwargs={"comment": "总市值(千万元)"})
    float_mv: Optional[Decimal] = Field(default=None, description="流通市值(千万元)", sa_type=DECIMAL(10, 2), sa_column_kwargs={"comment": "流通市值(千万元)"})

    # 指标列（集成到K线表）
    # EXPMA
    expma_5: Optional[Decimal] = Field(default=None, description="EXPMA5", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "EXPMA5"})
    expma_10: Optional[Decimal] = Field(default=None, description="EXPMA10", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "EXPMA10"})
    expma_20: Optional[Decimal] = Field(default=None, description="EXPMA20", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "EXPMA20"})
    expma_60: Optional[Decimal] = Field(default=None, description="EXPMA60", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "EXPMA60"})
    expma_250: Optional[Decimal] = Field(default=None, description="EXPMA250", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "EXPMA250"})

    # MA
    ma_5: Optional[Decimal] = Field(default=None, description="MA5", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "MA5"})
    ma_10: Optional[Decimal] = Field(default=None, description="MA10", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "MA10"})
    ma_20: Optional[Decimal] = Field(default=None, description="MA20", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "MA20"})
    ma_60: Optional[Decimal] = Field(default=None, description="MA60", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "MA60"})
    ma_250: Optional[Decimal] = Field(default=None, description="MA250", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "MA250"})

    # 波动率指标
    volatility: Optional[Decimal] = Field(default=None, description="波动率(%)", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "波动率(%)"})

    # MACD
    macd_dif: Optional[Decimal] = Field(default=None, description="MACD DIF", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "MACD DIF"})
    macd_dea: Optional[Decimal] = Field(default=None, description="MACD DEA", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "MACD DEA"})
    macd_histogram: Optional[Decimal] = Field(default=None, description="MACD柱状图", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "MACD柱状图"})

    # RSI
    rsi_6: Optional[Decimal] = Field(default=None, description="RSI6", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "RSI6"})
    rsi_12: Optional[Decimal] = Field(default=None, description="RSI12", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "RSI12"})
    rsi_24: Optional[Decimal] = Field(default=None, description="RSI24", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "RSI24"})

    # KDJ
    kdj_k: Optional[Decimal] = Field(default=None, description="KDJ K值", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "KDJ K值"})
    kdj_d: Optional[Decimal] = Field(default=None, description="KDJ D值", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "KDJ D值"})
    kdj_j: Optional[Decimal] = Field(default=None, description="KDJ J值", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "KDJ J值"})

    # BOLL
    boll_upper: Optional[Decimal] = Field(default=None, description="布林线上轨", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "布林线上轨"})
    boll_middle: Optional[Decimal] = Field(default=None, description="布林线中轨", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "布林线中轨"})
    boll_lower: Optional[Decimal] = Field(default=None, description="布林线下轨", sa_type=DECIMAL(10, 3), sa_column_kwargs={"comment": "布林线下轨"})

    # 其他常用指标
    cci_14: Optional[Decimal] = Field(default=None, description="CCI14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "CCI14"})
    wr_14: Optional[Decimal] = Field(default=None, description="WR14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "WR14"})

    # DMI相关（14周期）
    pdi_14: Optional[Decimal] = Field(default=None, description="+DI14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "+DI14"})
    mdi_14: Optional[Decimal] = Field(default=None, description="-DI14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "-DI14"})
    adx_14: Optional[Decimal] = Field(default=None, description="ADX14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "ADX14"})
    adxr_14: Optional[Decimal] = Field(default=None, description="ADXR14", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "ADXR14"})

    # SAR抛物线
    sar: Optional[Decimal] = Field(default=None, description="SAR", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "SAR"})

    # 能量指标
    obv: Optional[Decimal] = Field(default=None, description="OBV", sa_type=DECIMAL(20, 4), sa_column_kwargs={"comment": "OBV"})

    # TD（Tom DeMark）
    td_setup: Optional[int] = Field(default=None, description="TD连续计数", sa_column_kwargs={"comment": "TD连续计数"})
    td_count: Optional[int] = Field(default=None, description="TD计数（含反转）", sa_column_kwargs={"comment": "TD计数（含反转）"})

    # 数据来源
    data_source: str = Field(default="tushare", max_length=20, description="数据来源", sa_column_kwargs={"comment": "数据来源"})

    # 时间戳
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间", sa_column_kwargs={"comment": "创建时间"})
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间", sa_column_kwargs={"comment": "更新时间"})

