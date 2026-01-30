"""
交易日历数据模型 - 升级支持SQLModel
"""
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Index
from sqlmodel import SQLModel, Field


class TradeCalendar(SQLModel, table=True):
    __tablename__ = "trade_calendar"

    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    exchange: str = Field(max_length=10, description="交易所代码：SSE上交所 SZSE深交所")
    trade_date: date = Field(description="交易日期")
    is_open: bool = Field(description="是否开市：1开市 0休市")
    is_weekend: bool = Field(description="是否周末")
    is_holiday: bool = Field(description="是否节假日")
    holiday_name: Optional[str] = Field(default=None, max_length=100, description="节假日名称")
    week_day: Optional[str] = Field(default=None, max_length=10, description="星期几")
    year: Optional[str] = Field(default=None, max_length=4, description="年份")
    month: Optional[str] = Field(default=None, max_length=2, description="月份")
    quarter: Optional[str] = Field(default=None, max_length=1, description="季度")
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    __table_args__ = (
        Index("idx_trade_calendar_exchange_date", "exchange", "trade_date"),
        Index("idx_trade_calendar_date", "trade_date"),
        Index("idx_trade_calendar_year_month", "year", "month"),
        Index("idx_trade_calendar_is_open", "is_open"),
        Index("idx_trade_calendar_quarter", "quarter"),
        Index("uk_trade_calendar_exchange_date", "exchange", "trade_date", unique=True),
        {"comment": "交易日历表"},
    )

    class Config:
        from_attributes = True
        extra = "ignore"

    def __repr__(self):
        return f"<TradeCalendar(exchange='{self.exchange}', trade_date='{self.trade_date}', is_open={self.is_open})>"
