"""
概念板块相关数据模型 - 升级支持SQLModel
"""

from datetime import datetime, date
from typing import Optional

from sqlalchemy import Index, TEXT
from sqlmodel import SQLModel, Field


class Concept(SQLModel, table=True):
    """概念板块模型 - SQLModel升级版"""

    __tablename__ = "concepts"

    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    concept_code: str = Field(unique=True, max_length=50, description="概念代码")
    concept_name: str = Field(max_length=100, description="概念名称")
    list_date: Optional[date] = Field(default=None, description="上市日期")

    # 热度相关
    hot_rank: Optional[int] = Field(default=None, description="热度排名")
    hot_score: Optional[float] = Field(default=None, description="热度分数")
    hot_date: Optional[str] = Field(default=None, max_length=10, description="热度数据日期")
    hot_concept: Optional[str] = Field(default=None, max_length=200, description="热度概念")
    hot_rank_reason: Optional[str] = Field(default=None, description="上榜原因", sa_type=TEXT, sa_column_kwargs={"comment": "上榜原因"})

    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    class Config:
        """SQLModel配置"""
        from_attributes = True
        extra = "ignore"

    def __repr__(self):
        return f"<Concept(code={self.concept_code}, name={self.concept_name})>"


class StockConcept(SQLModel, table=True):
    """股票-概念关系模型 - SQLModel升级版"""

    __tablename__ = "stock_concepts"

    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    ts_code: str = Field(max_length=20, description="股票代码")
    concept_code: str = Field(max_length=20, description="概念代码")
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    # 索引
    __table_args__ = (
        Index("idx_stock_concept_ts_code", "ts_code"),
        Index("idx_stock_concept_concept_code", "concept_code"),
        Index("uk_stock_concept", "ts_code", "concept_code", unique=True),
    )

    class Config:
        from_attributes = True
        extra = "ignore"

    def __repr__(self):
        return f"<StockConcept(ts_code={self.ts_code}, concept_code={self.concept_code})>"


class Industry(SQLModel, table=True):
    """行业板块表 - SQLModel升级版"""

    __tablename__ = "industries"

    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    industry_code: str = Field(unique=True, index=True, max_length=20, description="行业代码")
    industry_name: str = Field(max_length=100, description="行业名称")
    list_date: Optional[date] = Field(default=None, description="上市日期")

    # 热度相关
    hot_rank: Optional[int] = Field(default=None, description="热度排名")
    hot_score: Optional[float] = Field(default=None, description="热度分数")
    hot_date: Optional[str] = Field(default=None, max_length=10, description="热度数据日期")
    hot_concept: Optional[str] = Field(default=None, max_length=200, description="热度概念")
    hot_rank_reason: Optional[str] = Field(default=None, description="上榜原因", sa_type=TEXT, sa_column_kwargs={"comment": "上榜原因"})

    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    # 索引
    __table_args__ = (
        Index("idx_industry_code", "industry_code"),
        Index("idx_industry_name", "industry_name"),
    )

    class Config:
        from_attributes = True
        extra = "ignore"

    def __repr__(self):
        return f"<Industry(industry_code={self.industry_code}, industry_name={self.industry_name})>"


class StockIndustry(SQLModel, table=True):
    """股票-行业关系模型 - SQLModel升级版"""

    __tablename__ = "stock_industries"

    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    ts_code: str = Field(max_length=20, description="股票代码")
    industry_code: str = Field(max_length=20, description="行业代码")
    created_at: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(default_factory=datetime.now, description="更新时间")

    # 索引
    __table_args__ = (
        Index("idx_stock_industry_ts_code", "ts_code"),
        Index("idx_stock_industry_industry_code", "industry_code"),
        Index("uk_stock_industry", "ts_code", "industry_code", unique=True),
    )

    class Config:
        from_attributes = True
        extra = "ignore"

    def __repr__(self):
        return (
            f"<StockIndustry(ts_code={self.ts_code}, industry_code={self.industry_code})>"
        )
