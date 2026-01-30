"""
股票相关数据模型 - 升级支持SQLModel
"""

from datetime import datetime, date
from typing import Optional

from sqlalchemy import Index, TEXT
from sqlmodel import SQLModel, Field


class Stock(SQLModel, table=True):
    """股票基本信息表 - SQLModel升级版"""

    __tablename__ = "stocks"

    id: Optional[int] = Field(default=None, primary_key=True, description="自增主键")
    ts_code: str = Field(index=True, unique=True, max_length=20, description="股票代码")
    symbol: str = Field(index=True, max_length=10, description="股票代码（不含后缀）")
    name: str = Field(index=True, max_length=50, description="股票名称")
    area: Optional[str] = Field(default=None, max_length=20, description="地域")
    industry: Optional[str] = Field(default=None, index=True, max_length=50, description="所属行业")
    market: Optional[str] = Field(default=None, index=True, max_length=10, description="市场类型")
    list_status: Optional[str] = Field(default=None, index=True, max_length=1, description="上市状态")
    list_date: Optional[date] = Field(default=None, description="上市日期")
    delist_date: Optional[str] = Field(default=None, max_length=10, description="退市日期")
    is_hs: Optional[str] = Field(default=None, max_length=1, description="是否沪深港通标的")

    # 热度相关
    hot_rank: Optional[int] = Field(default=None, description="热度排名")
    hot_score: Optional[float] = Field(default=None, description="热度分数")
    hot_date: Optional[str] = Field(default=None, max_length=10, description="热度数据日期")
    hot_concept: Optional[str] = Field(default=None, max_length=200, description="热度概念")
    hot_rank_reason: Optional[str] = Field(default=None, description="上榜原因", sa_type=TEXT, sa_column_kwargs={"comment": "上榜原因"})

    # 时间戳
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    # 表级约束
    __table_args__ = (
        # 复合索引
        Index("idx_stocks_industry_status", "industry", "list_status"),
        Index("idx_stocks_market_status", "market", "list_status"),
    )

    class Config:
        """SQLModel配置"""
        # 允许ORM模式
        from_attributes = True
        # 允许额外字段
        extra = "ignore"
