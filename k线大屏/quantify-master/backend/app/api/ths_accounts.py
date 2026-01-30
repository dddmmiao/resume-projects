"""
同花顺账号管理API
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Request
from loguru import logger
from pydantic import BaseModel, Field

from app.core.response_models import create_success_response, create_error_response, ApiResponse
from app.services.external.ths.auth.login_service import ths_login_service
from app.services.user.ths_account_service import ths_account_service
from app.utils.api_utils import get_current_user

router = APIRouter(prefix="/api/user/ths-accounts", tags=["同花顺账号管理"])


# ========== 请求/响应模型 ==========

class ThsAccountCreate(BaseModel):
    """创建账号请求"""
    ths_account: str = Field(..., min_length=1, max_length=50, description="同花顺账号")
    mobile: Optional[str] = Field(None, description="同花顺账户绑定的手机号")
    nickname: Optional[str] = Field(None, max_length=50, description="账号昵称")
    login_method: Optional[str] = Field(None, max_length=20, description="登录方式: qr/sms")


class ThsAccountUpdate(BaseModel):
    """更新账号请求"""
    mobile: Optional[str] = Field(None, description="同花顺账户绑定的手机号")
    nickname: Optional[str] = Field(None, max_length=50, description="账号昵称")
    is_active: Optional[bool] = Field(None, description="是否启用")
    remark: Optional[str] = Field(None, max_length=500, description="备注")


class ThsAccountResponse(BaseModel):
    """前台用户接口使用的账号响应"""
    ths_account: str  # 同花顺账号标识符
    nickname: Optional[str]
    is_active: bool = True  # 账号是否启用
    is_online: bool = False  # 是否在线（有有效session）
    last_login_at: Optional[datetime]  # 最近一次登录/Cookie刷新时间


class ThsAccountCreateResponse(BaseModel):
    """创建账号响应数据"""
    ths_account: str
    nickname: Optional[str]
    is_active: bool = True


# ========== API端点 ==========

@router.get("")
async def get_accounts(
    request: Request
) -> ApiResponse[List[ThsAccountResponse]]:
    """
    获取用户的所有同花顺账号列表
    返回所有账号列表
    """
    current_user = get_current_user(request)
    try:
        accounts = ths_account_service.get_user_accounts(current_user.id)

        # 构建所有账号列表
        all_accounts = []
        current_account = None
        
        for account in accounts:
            # 只返回启用的账号
            if not account.is_active:
                continue
                
            # 通过 ThsLoginService 实时检查是否有有效的登录会话
            is_online = ths_login_service.has_valid_session(account.ths_account)
            session = ths_login_service.get_session(account.ths_account) if is_online else None
            login_at = session.get("login_at") if session else None
            
            account_response = ThsAccountResponse(
                ths_account=account.ths_account,
                nickname=account.nickname,
                is_active=account.is_active,
                is_online=is_online,
                last_login_at=login_at,
            )
            
            all_accounts.append(account_response)
            
            # 记录当前在线账号（在线且启用）
            if is_online and account.is_active and current_account is None:
                current_account = account_response
        
        return create_success_response(
            data=all_accounts, 
            message="获取账号列表成功"
        )
        
    except Exception as e:
        logger.error(f"获取账号列表失败: {e}")
        return create_error_response(message=f"获取账号列表失败: {str(e)}")


@router.post("")
async def create_account(
    request: Request,
    body: ThsAccountCreate
) -> ApiResponse[ThsAccountCreateResponse]:
    current_user = get_current_user(request)
    """
    创建新的同花顺账号
    """
    try:
        # 单账号在线模式：不限制账号数量，用户可以绑定多个账号但只能同时在线一个
        account = ths_account_service.create_account(
            user_id=current_user.id,
            ths_account=body.ths_account,
            nickname=body.nickname,
            mobile=body.mobile,
            login_method=body.login_method,
        )
        
        if not account:
            return create_error_response(message="账号创建或更新失败")
        
        # 使用ThsAccountCreateResponse模型构建响应数据
        account_data = ThsAccountCreateResponse(
            ths_account=account.ths_account,
            nickname=account.nickname,
            is_active=account.is_active
        )
        
        return create_success_response(
            data=account_data,
            message="账号创建成功"
        )
        
    except Exception as e:
        logger.error(f"创建账号失败: {e}")
        return create_error_response(message=f"创建账号失败: {str(e)}")


@router.put("/{ths_account}")
async def update_account(
    request: Request,
    ths_account: str,
    body: ThsAccountUpdate
) -> ApiResponse[ThsAccountResponse]:
    current_user = get_current_user(request)
    """
    更新账号信息
    """
    try:
        account = ths_account_service.update_account_by_ths_account(
            ths_account=ths_account,
            user_id=current_user.id,
            nickname=body.nickname,
            is_active=body.is_active,
            remark=body.remark
        )
        
        if not account:
            return create_error_response(message="账号不存在或更新失败", status_code=404)
        
        # 使用ThsAccountCreateResponse模型构建响应数据
        account_data = ThsAccountCreateResponse(
            ths_account=account.ths_account,
            nickname=account.nickname,
            is_active=account.is_active
        )
        
        return create_success_response(
            data=account_data,
            message="账号更新成功"
        )
        
    except Exception as e:
        logger.error(f"更新账号失败: {e}")
        return create_error_response(message=f"更新账号失败: {str(e)}")


@router.post("/{ths_account}/logout")
async def logout_account(
    request: Request,
    ths_account: str
) -> ApiResponse:
    """
    退出指定账号（清除登录会话和Cookies）
    用于单账号在线模式的账号切换
    """
    current_user = get_current_user(request)
    
    try:
        # 根据ts_account获取账号，验证权限
        account = ths_account_service.get_account_by_ths_account_and_user(ths_account, current_user.id)
        if not account:
            return create_error_response(message="账号不存在或无权限操作", status_code=404)
        
        # 清除登录会话
        ths_login_service.logout(current_user.id, ths_account)
        
        logger.info(f"用户 {current_user.username} 退出同花顺账号 {ths_account}")
        
        return create_success_response(message=f"账号 {ths_account} 退出成功")
        
    except Exception as e:
        logger.error(f"退出账号失败: {e}")
        return create_error_response(message=f"退出账号失败: {str(e)}")


@router.patch("/{ths_account}/disable")
async def disable_account(
    request: Request,
    ths_account: str
) -> ApiResponse:
    current_user = get_current_user(request)
    """
    禁用账号（用户看到的是删除，实际是禁用以避免数据丢失）
    """
    try:
        success = ths_account_service.disable_account_by_ths_account(ths_account, current_user.id)
        
        if not success:
            return create_error_response(message="账号不存在或禁用失败", status_code=404)
        
        return create_success_response(message="账号删除成功")  # 用户看到的还是"删除"
        
    except Exception as e:
        logger.error(f"禁用账号失败: {e}")
        return create_error_response(message=f"删除账号失败: {str(e)}")  # 用户看到的还是"删除"




