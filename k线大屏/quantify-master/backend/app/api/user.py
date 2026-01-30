"""
用户管理API - 统一的用户相关接口
包括注册、登录、登出、资料管理等
"""

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Request, Depends
from loguru import logger
from pydantic import BaseModel, Field

from app.core.response_models import create_success_response, create_error_response, ApiResponse
from app.models.entities import User
from app.services.user.user_service import (
    user_service,
    USERNAME_EXISTS,
    INVALID_CREDENTIALS,
    USER_DISABLED,
    INVALID_INVITATION_CODE,
)
from app.utils.api_utils import get_current_user
from app.utils.auth import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.services.core.system_config_service import system_config_service

router = APIRouter(prefix="/api/user", tags=["用户管理"])


# ========== 请求/响应模型 ==========

class RegisterRequest(BaseModel):
    """注册请求"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, max_length=100, description="密码")
    nickname: str = Field(None, max_length=50, description="昵称")
    invitation_code: str = Field(..., min_length=1, max_length=32, description="邀请码")


class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class UserProfileResponse(BaseModel):
    """用户资料响应"""
    username: str
    nickname: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    is_super_admin: bool = False
    created_at: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    """更新个人信息请求"""
    nickname: str = Field(None, max_length=50, description="昵称")


class UpdatePushplusTokenRequest(BaseModel):
    """更新PushPlus好友令牌请求"""
    friend_token: Optional[str] = Field(None, max_length=64, description="PushPlus好友令牌")
    use_system_token: Optional[bool] = Field(False, description="管理员使用系统Token")


class TokenResponse(BaseModel):
    """登录成功响应"""
    access_token: str
    token_type: str = "bearer"


# ========== 认证相关接口 ==========

@router.post("/register")
async def register(request: RegisterRequest) -> ApiResponse:
    """
    用户注册
    """
    try:
        user = user_service.register(
            username=request.username,
            password=request.password,
            nickname=request.nickname,
            invitation_code=request.invitation_code
        )
        
        if user:
            logger.info(f"新用户注册成功: {request.username}")
            return create_success_response(message="注册成功")
        else:
            return create_error_response(message="注册失败")
    except ValueError as e:
        if str(e) == USERNAME_EXISTS:
            return create_error_response(message="用户名已存在", status_code=409)
        if str(e) == INVALID_INVITATION_CODE:
            return create_error_response(message="邀请码无效", status_code=400)
        logger.error(f"用户注册失败: {e}")
        return create_error_response(message=f"注册失败: {str(e)}")
    except Exception as e:
        logger.error(f"用户注册失败: {e}")
        return create_error_response(message=f"注册失败: {str(e)}")


@router.post("/login")
async def login(request: LoginRequest) -> ApiResponse[TokenResponse]:
    """
    用户登录
    """
    try:
        user = user_service.authenticate(request.username, request.password)
        
        if not user:
            return create_error_response(message="用户名或密码错误", status_code=401)
        
        # 生成访问令牌
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        
        token_data = TokenResponse(access_token=access_token)
        
        logger.info(f"用户登录成功: {request.username}")
        return create_success_response(data=token_data, message="登录成功")
        
    except ValueError as e:
        if str(e) == INVALID_CREDENTIALS:
            return create_error_response(message="用户名或密码错误", status_code=401)
        if str(e) == USER_DISABLED:
            return create_error_response(message="账号已被禁用", status_code=403)
        logger.error(f"用户登录失败: {e}")
        return create_error_response(message=f"登录失败: {str(e)}")
    except Exception as e:
        logger.error(f"用户登录失败: {e}")
        return create_error_response(message=f"登录失败: {str(e)}")


@router.post("/logout")
async def logout(request: Request) -> ApiResponse:
    """
    用户登出
    
    JWT是无状态的，登出由前端删除token实现
    这个接口主要用于记录日志
    """
    try:
        current_user = get_current_user(request)
        logger.info(f"用户登出: {current_user.username} (ID: {current_user.id})")
        return create_success_response(message="登出成功")
    except Exception as e:
        logger.error(f"用户登出失败: {e}")
        return create_error_response(message=f"登出失败: {str(e)}")


# ========== 用户资料管理接口 ==========

@router.get("/profile")
async def get_user_profile(request: Request) -> ApiResponse[UserProfileResponse]:
    """
    获取当前用户资料
    """
    current_user = get_current_user(request)
    
    try:
        profile_data = UserProfileResponse(
            username=current_user.username,
            nickname=current_user.nickname,
            is_active=current_user.is_active,
            is_admin=current_user.is_admin,
            is_super_admin=current_user.is_super_admin,
            created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        )
        
        return create_success_response(data=profile_data, message="获取用户资料成功")
        
    except Exception as e:
        logger.error(f"获取用户资料失败: {e}")
        return create_error_response(message=f"获取用户资料失败: {str(e)}")


@router.put("/profile")
async def update_profile(
    request: Request,
    profile_data: UpdateProfileRequest
) -> ApiResponse[UserProfileResponse]:
    """
    更新当前用户个人信息
    """
    current_user = get_current_user(request)
    try:
        updated_user = user_service.update_profile(
            user_id=current_user.id,
            nickname=profile_data.nickname
        )
        
        if not updated_user:
            return create_error_response(message="用户不存在", status_code=404)
        
        # 构建响应数据
        user_profile = UserProfileResponse(
            username=updated_user.username,
            nickname=updated_user.nickname,
            is_active=updated_user.is_active,
            is_admin=updated_user.is_admin,
            is_super_admin=updated_user.is_super_admin,
            created_at=updated_user.created_at.isoformat() if updated_user.created_at else None
        )
        
        return create_success_response(
            data=user_profile,
            message="个人信息更新成功"
        )
    except Exception as e:
        logger.error(f"更新个人信息失败: {e}")
        return create_error_response(message=f"更新失败: {str(e)}")


@router.get("/config")
async def get_user_config(current_user: User = Depends(get_current_user)):
    """
    获取用户相关的系统配置
    只暴露用户需要的配置项，避免泄露敏感管理员配置
    """
    try:
        from app.services.core.system_config_service import system_config_service
        
        # 获取指标数据源配置 - 用户需要知道是前端计算还是数据库计算
        indicator_source = system_config_service.get_indicator_source()
        
        # 获取登录方式配置 - 用户需要知道哪些登录方式可用
        login_methods_config = system_config_service.get_login_methods()
        
        # 只返回用户需要的配置项
        config_data = {
            "indicator_source": indicator_source,
            "login_methods": login_methods_config
        }
        
        return create_success_response(
            data=config_data,
            message="用户配置获取成功"
        )
    except Exception as e:
        logger.error(f"获取用户配置失败: {e}")
        return create_error_response(message=f"获取配置失败: {str(e)}")


# ========== PushPlus 推送配置接口 ==========

@router.get("/pushplus")
async def get_pushplus_config(request: Request) -> ApiResponse:
    """
    获取当前用户的PushPlus配置
    
    返回：
    - has_token: 用户是否已配置好友令牌（自动同步）
    - masked_token: 脱敏后的令牌（仅显示前8后4位）
    - qrcode_url: 用户专属二维码URL（扫码自动绑定）
    - qrcode_enabled: 是否启用二维码功能（需要配置 secretKey）
    """
    from app.services.core.system_config_service import system_config_service
    from app.services.external.pushplus_service import pushplus_service
    
    current_user = get_current_user(request)
    
    try:
        # 检查是否配置了 secretKey（启用自动获取二维码功能）
        secret_key = system_config_service.get_pushplus_secret_key()
        pushplus_token = system_config_service.get_pushplus_token()
        qrcode_enabled = bool(secret_key and pushplus_token)
        
        # 检查是否请求重新绑定
        rebind = request.query_params.get("rebind", "").lower() == "true"
        
        # 获取用户的好友令牌
        friend_token = current_user.pushplus_friend_token
        
        # 脱敏显示令牌
        masked_token = None
        if friend_token:
            if len(friend_token) > 12:
                masked_token = f"{friend_token[:8]}...{friend_token[-4:]}"
            else:
                masked_token = friend_token
        
        # 获取统一二维码
        # 未绑定时显示二维码，或者请求重新绑定时也显示
        qrcode_url = None
        if qrcode_enabled and (not friend_token or rebind):
            qrcode_url = await pushplus_service.get_qrcode()
        
        # 超级管理员可以使用系统Token作为自己的好友令牌(普通管理员不可,因为只读)
        can_use_system_token = current_user.is_super_admin and bool(pushplus_token)
        
        return create_success_response(
            data={
                "has_token": friend_token is not None and len(friend_token) > 0,
                "masked_token": masked_token,
                "qrcode_url": qrcode_url,
                "qrcode_enabled": qrcode_enabled,
                "can_use_system_token": can_use_system_token,
            },
            message="获取PushPlus配置成功"
        )
    except Exception as e:
        logger.error(f"获取PushPlus配置失败: {e}")
        return create_error_response(message=f"获取配置失败: {str(e)}")


@router.put("/pushplus")
async def update_pushplus_config(
    request: Request,
    data: UpdatePushplusTokenRequest
) -> ApiResponse:
    """
    更新当前用户的PushPlus好友令牌
    
    用户需要先在PushPlus扫码添加管理员为好友，获取好友令牌后在此配置
    """
    current_user = get_current_user(request)
    
    try:
        # 超级管理员使用系统Token
        token_to_use = data.friend_token
        if data.use_system_token:
            if not current_user.is_super_admin:
                return create_error_response(message="仅超级管理员可使用系统Token", status_code=403)
            token_to_use = system_config_service.get_pushplus_token()
            if not token_to_use:
                return create_error_response(message="系统Token未配置")
        
        updated_user = user_service.update_pushplus_token(
            user_id=current_user.id,
            friend_token=token_to_use
        )
        
        if not updated_user:
            return create_error_response(message="用户不存在", status_code=404)
        
        return create_success_response(
            data={"has_token": token_to_use is not None and len(token_to_use or "") > 0},
            message="已使用系统Token" if data.use_system_token else "PushPlus配置更新成功"
        )
    except Exception as e:
        logger.error(f"更新PushPlus配置失败: {e}")
        return create_error_response(message=f"更新配置失败: {str(e)}")
