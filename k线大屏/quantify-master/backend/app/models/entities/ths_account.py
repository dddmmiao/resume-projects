"""
同花顺账号模型
支持一个用户绑定多个同花顺账号
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ThsAccount(SQLModel, table=True):
    """同花顺账号表
    
    支持一个用户绑定多个同花顺账号，实现账号切换和管理
    """
    __tablename__ = "ths_accounts"
    
    id: int = Field(primary_key=True, description="账号ID")
    
    # 关联用户
    user_id: int = Field(
        foreign_key="users.id",
        index=True,
        description="所属用户ID"
    )
    
    # 同花顺账号信息
    ths_account: str = Field(
        index=True,
        max_length=50,
        description="同花顺用户名"
    )
    mobile: Optional[str] = Field(
        default=None,
        max_length=20,
        description="同花顺账户绑定的手机号"
    )
    nickname: Optional[str] = Field(
        default=None,
        max_length=50,
        description="账号昵称（用户自定义）"
    )
    encrypted_password: Optional[str] = Field(
        default=None,
        max_length=256,
        description="加密存储的密码（用于自动补登录）"
    )
    
    # 登录状态
    last_login_method: Optional[str] = Field(
        default=None,
        max_length=20,
        description="上次登录方式: sms | qr | password"
    )
    last_login_at: Optional[datetime] = Field(
        default=None,
        description="上次登录时间"
    )
    
    # 自动补登录配置
    auto_relogin_enabled: bool = Field(
        default=True,
        description="是否启用自动补登录（当登录态失效时自动触发补登录）"
    )
    
    # 消息转发配置（每个账号可以有独立配置）
    message_forward_enabled: bool = Field(
        default=False,
        description="是否启用消息转发（自动获取验证码）"
    )
    message_forward_token: Optional[str] = Field(
        default=None,
        max_length=100,
        description="消息转发验证token"
    )
    message_forward_type: Optional[str] = Field(
        default=None,
        max_length=50,
        description="消息转发类型: sms_forwarder | ios_shortcut | bark"
    )
    
    # 状态
    is_active: bool = Field(
        default=True,
        description="账号是否启用"
    )
    
    # 备注
    remark: Optional[str] = Field(
        default=None,
        max_length=500,
        description="备注信息"
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
