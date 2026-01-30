"""
可转债数据模型 - 升级支持SQLModel
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import Index, UniqueConstraint, DECIMAL, TEXT
from sqlmodel import SQLModel, Field


class ConvertibleBond(SQLModel, table=True):
    """可转债基本信息模型 - SQLModel升级版"""

    __tablename__ = "convertible_bonds"

    id: Optional[int] = Field(default=None, primary_key=True, description="自增主键")
    ts_code: str = Field(index=True, unique=True, max_length=20, description="转债代码")
    bond_short_name: Optional[str] = Field(default=None, max_length=50, description="转债简称")
    stk_code: Optional[str] = Field(default=None, max_length=20, description="正股代码")
    stk_short_name: Optional[str] = Field(default=None, max_length=50, description="正股简称")
    list_date: Optional[date] = Field(default=None, description="上市日期")
    delist_date: Optional[date] = Field(default=None, description="退市日期")
    issue_date: Optional[date] = Field(default=None, description="发行日期")
    maturity_date: Optional[date] = Field(default=None, description="到期日期")
    issue_size: Optional[Decimal] = Field(default=None, description="发行规模(亿元)", sa_type=DECIMAL(15, 2), sa_column_kwargs={"comment": "发行规模(亿元)"})
    conv_start_date: Optional[date] = Field(default=None, description="转股起始日")
    conv_end_date: Optional[date] = Field(default=None, description="转股截止日")
    first_conv_price: Optional[Decimal] = Field(default=None, description="初始转股价格", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "初始转股价格"})
    conv_price: Optional[Decimal] = Field(default=None, description="最新转股价格", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "最新转股价格"})
    remain_size: Optional[Decimal] = Field(default=None, description="剩余规模(亿元)", sa_type=DECIMAL(15, 4), sa_column_kwargs={"comment": "剩余规模(亿元)"})
    list_status: Optional[str] = Field(default="L", max_length=10, description="上市状态")

    # 热度相关
    hot_rank: Optional[int] = Field(default=None, description="热度排名")
    hot_score: Optional[float] = Field(default=None, description="热度分数")
    hot_date: Optional[str] = Field(default=None, max_length=10, description="热度数据日期")
    hot_concept: Optional[str] = Field(default=None, max_length=200, description="热度概念")
    hot_rank_reason: Optional[str] = Field(default=None, description="上榜原因", sa_type=TEXT, sa_column_kwargs={"comment": "上榜原因"})

    # 时间戳
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    class Config:
        """SQLModel配置"""
        # 允许ORM模式
        from_attributes = True
        # 允许额外字段
        extra = "ignore"


class ConvertibleBondCall(SQLModel, table=True):
    """可转债赎回信息模型 - SQLModel升级版"""

    __tablename__ = "convertible_bond_calls"

    id: Optional[int] = Field(default=None, primary_key=True, description="自增主键")
    ts_code: str = Field(index=True, max_length=20, description="转债代码")
    call_type: Optional[str] = Field(default=None, max_length=20, description="赎回类型")
    is_call: Optional[str] = Field(default=None, max_length=50, description="是否赎回")
    ann_date: Optional[date] = Field(default=None, description="公告日期")
    call_date: Optional[date] = Field(default=None, description="赎回日期")
    call_price: Optional[Decimal] = Field(default=None, description="赎回价格", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "赎回价格"})
    call_price_tax: Optional[Decimal] = Field(default=None, description="赎回价格(含税)", sa_type=DECIMAL(10, 4), sa_column_kwargs={"comment": "赎回价格(含税)"})
    call_vol: Optional[Decimal] = Field(default=None, description="赎回数量(万张)", sa_type=DECIMAL(15, 2), sa_column_kwargs={"comment": "赎回数量(万张)"})
    call_amount: Optional[Decimal] = Field(default=None, description="赎回金额(万元)", sa_type=DECIMAL(20, 2), sa_column_kwargs={"comment": "赎回金额(万元)"})
    payment_date: Optional[date] = Field(default=None, description="兑付日期")
    call_reg_date: Optional[date] = Field(default=None, description="赎回登记日")

    # 时间戳
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    # 表级约束
    __table_args__ = (
        # 唯一键约束（用于批量操作）
        UniqueConstraint('ts_code', 'call_type', 'ann_date', name='uk_cb_call_unique'),
        # 索引
        Index("idx_cb_call_ts_code", "ts_code"),
        Index("idx_cb_call_call_date", "call_date"),
    )

    class Config:
        """SQLModel配置"""
        # 允许ORM模式
        from_attributes = True
        # 允许额外字段
        extra = "ignore"
