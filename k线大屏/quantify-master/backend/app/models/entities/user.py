"""
用户模型
系统用户表，包含用户基本信息和登录配置
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """用户表
    
    存储系统用户的基本信息和登录配置
    扩展用途：可用于权限管理、用户偏好设置等
    """
    __tablename__ = "users"
    
    id: int = Field(primary_key=True, description="用户ID")
    
    # 用户基本信息
    username: str = Field(
        index=True, 
        unique=True, 
        max_length=50,
        description="系统用户名（用于登录系统）"
    )
    password_hash: Optional[str] = Field(
        default=None,
        max_length=255,
        description="密码哈希（用于系统登录）"
    )
    nickname: Optional[str] = Field(
        default=None,
        max_length=50,
        description="用户昵称"
    )
    
    # 用户状态
    is_active: bool = Field(
        default=True,
        description="账号是否激活"
    )
    is_admin: bool = Field(
        default=False,
        description="是否管理员(只读)"
    )
    is_super_admin: bool = Field(
        default=False,
        description="是否超级管理员(可编辑)"
    )
    last_login_at: Optional[datetime] = Field(
        default=None,
        description="最后登录时间"
    )
    
    # 用户偏好设置（JSON格式，扩展字段）
    preferences: Optional[str] = Field(
        default=None,
        description="用户偏好设置（JSON字符串）"
    )
    
    # PushPlus 好友令牌（用于接收推送通知）
    pushplus_friend_token: Optional[str] = Field(
        default=None,
        max_length=64,
        description="PushPlus好友令牌，用于接收个人推送通知"
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
