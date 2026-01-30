"""
策略执行历史模型
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Index, TEXT
from sqlmodel import SQLModel, Field


class StrategyExecutionHistory(SQLModel, table=True):
    """策略执行历史表"""

    __tablename__ = "strategy_execution_history"

    id: Optional[int] = Field(default=None, primary_key=True, description="自增主键")
    user_id: str = Field(index=True, max_length=64, description="用户ID")
    strategy_name: str = Field(max_length=64, description="策略名称")
    strategy_label: Optional[str] = Field(default=None, max_length=128, description="策略显示名称")
    entity_type: str = Field(index=True, max_length=32, description="标的类型: stock/bond/concept/industry")
    period: str = Field(default="daily", max_length=16, description="周期: daily/weekly/monthly")
    base_date: Optional[str] = Field(default=None, max_length=16, description="基准日（策略基于的日期）")
    context_json: str = Field(sa_type=TEXT, description="执行参数（完整JSON）")
    context_hash: str = Field(index=True, max_length=32, description="参数哈希")
    result_codes: Optional[str] = Field(default=None, sa_type=TEXT, description="筛选结果codes（JSON数组）")
    result_count: int = Field(default=0, description="结果数量")
    status: str = Field(default="success", max_length=16, description="状态: running/success/failed/cancelled")
    task_id: Optional[str] = Field(default=None, index=True, max_length=64, description="关联的任务ID（用于查询Redis进度）")
    created_at: datetime = Field(default_factory=datetime.now, description="执行时间")

    # 复合索引
    __table_args__ = (
        Index("idx_history_user_entity_period", "user_id", "entity_type", "period"),
        Index("idx_history_created_at", "created_at"),
    )

    class Config:
        from_attributes = True
