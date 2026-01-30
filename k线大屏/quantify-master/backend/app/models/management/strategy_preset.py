"""
策略预设参数模型
用于保存用户自定义的策略参数配置
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Index, TEXT
from sqlmodel import SQLModel, Field

from app.utils.key_generator import generate_preset_key


class StrategyPreset(SQLModel, table=True):
    """策略预设参数表"""

    __tablename__ = "strategy_presets"

    id: Optional[int] = Field(default=None, primary_key=True, description="自增主键")
    preset_key: str = Field(index=True, max_length=16, description="预设唯一标识（对外）")
    user_id: str = Field(index=True, max_length=64, description="用户ID")
    name: str = Field(max_length=128, description="预设名称")
    strategy_name: str = Field(max_length=64, description="策略名称")
    entity_type: str = Field(index=True, max_length=32, description="标的类型: stock/bond/concept/industry")
    period: str = Field(default="daily", max_length=16, description="周期: daily/weekly/monthly")
    params_json: str = Field(sa_type=TEXT, description="策略参数（完整JSON）")
    is_default: bool = Field(default=False, description="是否为默认预设")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.now, description="更新时间")

    # 复合索引
    __table_args__ = (
        Index("idx_preset_user_strategy", "user_id", "strategy_name"),
        Index("idx_preset_user_entity_period", "user_id", "entity_type", "period"),
    )

    class Config:
        from_attributes = True
