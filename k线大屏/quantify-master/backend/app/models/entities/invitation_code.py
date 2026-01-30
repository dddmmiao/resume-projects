"""
邀请码模型
用于控制用户注册，只有持有有效邀请码才能注册
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class InvitationCode(SQLModel, table=True):
    """邀请码表
    
    管理员生成邀请码，用户注册时需要提供有效邀请码
    """
    __tablename__ = "invitation_codes"
    
    id: int = Field(primary_key=True, description="邀请码ID")
    
    # 邀请码信息
    code: str = Field(
        index=True,
        unique=True,
        max_length=32,
        description="邀请码（唯一）"
    )
    
    # 使用限制
    max_uses: int = Field(
        default=1,
        description="最大使用次数，0表示无限制"
    )
    used_count: int = Field(
        default=0,
        description="已使用次数"
    )
    
    # 有效期
    expires_at: Optional[datetime] = Field(
        default=None,
        description="过期时间，null表示永不过期"
    )
    
    # 关联信息
    created_by: Optional[int] = Field(
        default=None,
        description="创建者用户ID"
    )
    remark: Optional[str] = Field(
        default=None,
        max_length=200,
        description="备注说明"
    )
    
    # 状态
    is_active: bool = Field(
        default=True,
        description="是否启用"
    )
    
    # 时间戳
    created_at: datetime = Field(
        default_factory=datetime.now,
        description="创建时间"
    )
    updated_at: datetime = Field(
        default_factory=datetime.now,
        description="更新时间"
    )
    
    def is_valid(self) -> bool:
        """检查邀请码是否有效"""
        if not self.is_active:
            return False
        if self.expires_at and datetime.now() > self.expires_at:
            return False
        if self.max_uses > 0 and self.used_count >= self.max_uses:
            return False
        return True
