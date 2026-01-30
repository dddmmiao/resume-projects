"""
同花顺登录API
提供登录、登出、状态查询等接口
"""
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.response_models import create_success_response, create_error_response, ApiResponse
from app.services.external.ths.auth.login_service import ths_login_service
from app.services.external.ths.auth.qr_session_manager import get_qr_session_manager
from app.services.external.ths.auth.sms_session_manager import sms_session_manager
from app.services.external.ths.core.constants import (
    ThsValidationError,
    ThsNetworkError,
    ThsErrorMessages,
    ThsHttpStatus,
)
from app.utils.api_utils import get_current_user
from app.services.core.cache_service import cache_service
import time as time_module

router = APIRouter(prefix="/api/ths", tags=["ths_login"])


# ==================== 通用限流辅助函数 ====================

def check_rate_limit(rate_key: str, ttl_seconds: int = 60, action_name: str = "操作") -> None:
    """
    检查请求频率限制
    
    Args:
        rate_key: 限流缓存键
        ttl_seconds: 限流时间窗口（秒）
        action_name: 操作名称，用于错误提示
        
    Raises:
        HTTPException: 如果超过频率限制
    """
    last_time = cache_service.get_json(rate_key)
    if last_time:
        remaining_seconds = ttl_seconds - (int(time_module.time()) - int(last_time))
        if remaining_seconds > 0:
            raise HTTPException(
                status_code=ThsHttpStatus.RATE_LIMITED,
                detail=f"{action_name}过于频繁，请{remaining_seconds}秒后再试",
                headers={"X-Retry-After": str(remaining_seconds)}
            )


def set_rate_limit(rate_key: str, ttl_seconds: int = 60) -> None:
    """记录本次请求时间"""
    cache_service.set_json(rate_key, int(time_module.time()), ttl_seconds=ttl_seconds)


# ==================== 当前用户 THS 登录态管理 ====================

class LoginStatusRequest(BaseModel):
    """登录状态查询请求"""
    ths_account: str = Field(..., description="同花顺账号标识")


class LogoutRequest(BaseModel):
    """登出请求"""
    ths_account: str = Field(..., description="同花顺账号标识")


class LoginStatusResponse(BaseModel):
    """登录状态响应数据"""
    is_logged_in: bool
    ths_account: str
    user_info: Optional[Dict[str, Any]] = None


class LoginMethodsResponse(BaseModel):
    """登录方式配置响应数据"""
    enabled_methods: List[str]
    config: Dict[str, bool]


class SmsResponse(BaseModel):
    """短信响应数据"""
    mobile: str
    captcha_required: bool = False
    captcha_images: Optional[Dict[str, Any]] = None  # 包含background, slider(str), init_y(int)


class LoginResponse(BaseModel):
    """登录响应数据"""
    ths_account: str  # 同花顺账号标识（uid字符串）
    nickname: str     # 显示昵称
    user_info: Optional[Dict[str, Any]] = None


class QrGenerateResponse(BaseModel):
    """二维码生成响应数据"""
    session_id: str
    qr_image: str
    status: str


class QrStatusResponse(BaseModel):
    """二维码状态响应数据"""
    status: str
    ths_account: Optional[str] = None  # 同花顺账号标识（uid字符串）
    nickname: Optional[str] = None     # 显示昵称
    user_info: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


@router.post("/login-status")
async def check_login_status(req: Request, request: LoginStatusRequest) -> ApiResponse[LoginStatusResponse]:
    """
    检查当前用户的 THS 账号登录状态
    
    返回用户是否已登录及用户信息
    """
    try:
        current_user = get_current_user(req)
        is_logged_in = ths_login_service.check_login_status(ths_account=request.ths_account)
        user_info = ths_login_service.get_user_info(ths_account=request.ths_account) if is_logged_in else None
        
        # 使用LoginStatusResponse模型构建响应数据
        status_data = LoginStatusResponse(
            is_logged_in=is_logged_in,
            ths_account=request.ths_account,
            user_info=user_info
        )
        
        return create_success_response(data=status_data)
    except Exception as e:
        logger.error(f"检查登录状态失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


@router.post("/logout")
async def logout(req: Request, request: LogoutRequest):
    """
    登出当前用户的 THS 账号
    
    清除用户的Cookie和登录信息
    """
    try:
        current_user = get_current_user(req)
        ths_login_service.logout(ths_account=request.ths_account)
        return create_success_response(message=f"THS 账号 {request.ths_account} 已登出")
    except Exception as e:
        logger.error(f"登出失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


@router.get("/user-info/{ths_account}")
async def get_user_info(req: Request, ths_account: str):
    """
    获取当前用户的 THS 账号信息
    """
    try:
        current_user = get_current_user(req)
        user_info = ths_login_service.get_user_info(ths_account=ths_account)
        if not user_info:
            raise HTTPException(status_code=404, detail="THS 账号信息不存在")
        
        return create_success_response(data=user_info)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户信息失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )

# ==================== 短信验证码分离式登录接口 ====================

class SmsSendRequest(BaseModel):
    """发送短信验证码请求"""
    mobile: str = Field(..., description="手机号", min_length=11, max_length=11)


class SmsCaptchaSubmitRequest(BaseModel):
    """提交滑块验证码请求"""
    mobile: str = Field(..., description="手机号", min_length=11, max_length=11)
    x: int = Field(..., description="滑块x坐标", ge=0, le=400)
    track_width: int = Field(default=340, description="滑轨宽度", ge=200, le=500)


@router.post("/sms/send")
async def send_sms_code(
    req: Request,
    request: SmsSendRequest
) -> ApiResponse[SmsResponse]:
    """
    发送短信验证码（分离式登录第1步）
    
    返回：
    - mobile: 手机号（脱敏显示）
    - captcha_required: 是否需要人工验证滑块
    - captcha_images: 验证码图片(base64)，仅当需要验证时返回
    """
    try:
        # 🚀 限流：同一手机号60秒内只能发送一次
        rate_key = f"sms_send_limit:{request.mobile}"
        check_rate_limit(rate_key, ttl_seconds=60, action_name="发送验证码")
        
        # 清理过期会话
        sms_session_manager.cleanup_expired_sessions()
        
        # 创建会话并发送验证码
        login_client = await run_in_threadpool(
            sms_session_manager.create_session,
            mobile=request.mobile
        )
        
        masked_mobile = f"{request.mobile[:3]}****{request.mobile[-4:]}"
        
        # 检查是否需要人工验证
        if login_client.captcha_required:
            if not login_client.captcha_images:
                logger.error("验证码图片获取失败")
                raise HTTPException(status_code=500, detail="验证码图片获取失败")
            return create_success_response(
                data={
                    "mobile": masked_mobile,
                    "captcha_required": True,
                    "captcha_images": login_client.captcha_images,
                },
                message="需要滑块验证"
            )
        
        # 发送成功后记录限流
        set_rate_limit(rate_key, ttl_seconds=60)
        
        return create_success_response(
            data={"mobile": masked_mobile, "captcha_required": False},
            message="验证码已发送"
        )
    except HTTPException:
        # HTTPException直接透传（包括限流错误）
        raise
    except ValueError as e:
        # 频率限制
        raise HTTPException(
            status_code=ThsHttpStatus.RATE_LIMITED,
            detail=ThsErrorMessages.SMS_RATE_LIMITED
        )
    except RuntimeError as e:
        # 同花顺接口返回的错误
        logger.warning(f"发送验证码失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.VALIDATION_ERROR,
            detail=ThsErrorMessages.SMS_SEND_FAILED
        )
    except Exception as e:
        logger.exception(f"发送短信验证码失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


@router.post("/sms/captcha")
async def submit_sms_captcha(
    req: Request,
    request: SmsCaptchaSubmitRequest
) -> ApiResponse[Dict[str, Any]]:
    """
    提交滑块验证码（人工验证后发送短信）
    
    参数：
    - mobile: 手机号
    - x: 滑块x坐标
    """
    try:
        await run_in_threadpool(
            sms_session_manager.submit_captcha,
            mobile=request.mobile,
            x=request.x,
            track_width=request.track_width
        )
        
        masked_mobile = f"{request.mobile[:3]}****{request.mobile[-4:]}"
        
        # 发送成功后记录限流
        rate_key = f"sms_send_limit:{request.mobile}"
        set_rate_limit(rate_key, ttl_seconds=60)
        
        return create_success_response(
            data={"mobile": masked_mobile},
            message="验证码已发送"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning(f"验证码验证失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"提交验证码失败: {e}")
        raise HTTPException(status_code=500, detail="验证失败")


class SmsCaptchaRefreshRequest(BaseModel):
    """刷新滑块验证码请求"""
    mobile: str = Field(..., description="手机号", min_length=11, max_length=11)


@router.post("/sms/captcha/refresh")
async def refresh_sms_captcha(
    req: Request,
    request: SmsCaptchaRefreshRequest
) -> ApiResponse[Dict[str, Any]]:
    """
    刷新滑块验证码（重新获取验证码图片，不受60秒限流限制）
    
    参数：
    - mobile: 手机号
    """
    try:
        session = sms_session_manager.get_session(request.mobile)
        if not session:
            return create_error_response(message="会话已过期，请重新发送验证码")
        
        # 重新获取验证码数据
        captcha_data = await run_in_threadpool(
            session.login_client._get_captcha_data
        )
        
        if not captcha_data or not session.login_client.captcha_images:
            raise HTTPException(status_code=500, detail="刷新验证码失败")
        
        masked_mobile = f"{request.mobile[:3]}****{request.mobile[-4:]}"
        
        return create_success_response(
            data={
                "mobile": masked_mobile,
                "captcha_images": session.login_client.captcha_images
            },
            message="验证码已刷新"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"刷新验证码失败: {e}")
        raise HTTPException(status_code=500, detail="刷新验证码失败")


class SmsLoginRequest(BaseModel):
    """短信验证码登录请求"""
    mobile: str = Field(..., description="手机号", min_length=11, max_length=11)
    sms_code: str = Field(..., description="短信验证码", min_length=4, max_length=6)


@router.post("/sms/login")
async def login_with_sms_code(req: Request, request: SmsLoginRequest) -> ApiResponse[LoginResponse]:
    """
    短信验证码登录（分离式登录第2步）
    
    返回：
    - username: 用户名
    - user_info: 用户信息
    """
    try:
        # 🚀 限流：同一手机号10秒内只能尝试登录一次（防止暴力破解验证码）
        rate_key = f"sms_login_limit:{request.mobile}"
        check_rate_limit(rate_key, ttl_seconds=10, action_name="登录")
        set_rate_limit(rate_key, ttl_seconds=10)
        
        # 获取会话
        session = sms_session_manager.get_session(request.mobile)
        if not session:
            return create_error_response(message="验证码已过期或未发送，请重新获取")
        
        # 使用会话中的login_client进行登录
        login_client = session.login_client
        
        # 校验验证码并登录
        checked = await run_in_threadpool(
            login_client._check_sms_with_auto_captcha,
            request.sms_code
        )
        
        if not checked:
            return create_error_response(message="验证码错误或已过期")
        
        # 获取cookies并验证登录态
        from requests.utils import dict_from_cookiejar
        cookies_dict = dict_from_cookiejar(login_client.session.cookies)
        if 'v' in cookies_dict:
            del cookies_dict['v']
        
        ok, user_info = await run_in_threadpool(
            login_client._validate_login,
            cookies_dict
        )
        
        if not ok:
            return create_error_response(message="验证码校验成功，但登录态验证失败")
        
        # 构建结果并存储（短信登录需要传递手机号）
        result = {'cookies': cookies_dict, 'user_info': user_info}
        ths_account = ths_login_service.store_login_result(
            result,
            login_method="sms",
            mobile=request.mobile
        )
        
        # 清理会话
        sms_session_manager.remove_session(request.mobile)
        
        # 直接从user_info提取昵称，不做fallback
        nickname = user_info.get("nickname")
        if not nickname:
            raise ValueError("登录成功但未获取到昵称信息")
        
        # 检查是否是补登录，发送成功通知
        from app.services.external.ths.auth.auto_relogin_service import AutoReloginService
        await AutoReloginService.handle_login_success(ths_account, nickname)
        
        # 使用LoginResponse模型构建响应数据
        login_data = LoginResponse(
            ths_account=ths_account,
            nickname=nickname,
            user_info=user_info
        )
        
        return create_success_response(
            data=login_data,
            message=f"登录成功！用户：{nickname}"
        )
    except HTTPException:
        raise
    except ThsValidationError as e:
        logger.warning(f"短信登录校验失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.VALIDATION_ERROR,
            detail=ThsErrorMessages.SMS_CODE_INVALID
        )
    except ThsNetworkError as e:
        logger.error(f"短信登录网络错误: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.NETWORK_ERROR,
            detail=ThsErrorMessages.NETWORK_ERROR
        )
    except Exception as e:
        logger.error(f"短信验证码登录失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


# ==================== 账号密码登录接口 ====================

class PasswordLoginRequest(BaseModel):
    """账号密码登录请求"""
    username: str = Field(..., description="手机号或用户名")
    password: str = Field(..., description="密码")


@router.post("/login/password")
async def login_with_password(
    req: Request,
    request: PasswordLoginRequest
) -> ApiResponse[LoginResponse]:
    """
    账号密码登录（同步操作）
    
    Args:
        username: 手机号或用户名
        password: 密码
    
    Returns:
        登录结果，包含用户名和用户信息
    """
    try:
        current_user = get_current_user(req)
        
        # 🚀 限流：同一用户10秒内只能尝试密码登录一次（防止暴力破解）
        rate_key = f"password_login_limit:{current_user.id}:{request.username}"
        check_rate_limit(rate_key, ttl_seconds=10, action_name="密码登录")
        set_rate_limit(rate_key, ttl_seconds=10)
        
        result = await run_in_threadpool(
            ths_login_service.login_with_password,
            user_id=current_user.id,
            username=request.username,
            password=request.password
        )
        
        # 提取ths_account和nickname
        ths_account = result.get("username")  # login_with_password返回的username实际是ths_account
        user_info = result.get("user_info", {})
        nickname = user_info.get("nickname")
        
        if not ths_account or not nickname:
            raise ValueError("登录成功但未获取到账号信息")
        
        # 使用LoginResponse模型构建响应
        login_data = LoginResponse(
            ths_account=ths_account,
            nickname=nickname,
            user_info=user_info
        )
        
        return create_success_response(
            data=login_data,
            message=f"登录成功！用户：{nickname}"
        )
    except HTTPException:
        raise
    except ThsValidationError as e:
        logger.warning(f"账号密码登录校验失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.VALIDATION_ERROR,
            detail=ThsErrorMessages.PASSWORD_INVALID
        )
    except ThsNetworkError as e:
        logger.error(f"账号密码登录网络错误: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.NETWORK_ERROR,
            detail=ThsErrorMessages.NETWORK_ERROR
        )
    except Exception as e:
        logger.error(f"账号密码登录失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


# ==================== 二维码分离式登录接口 ====================

class QrGenerateRequest(BaseModel):
    """生成二维码请求（无需系统认证）"""
    headless: bool = Field(True, description="是否无头模式")
    ths_account: Optional[str] = Field(None, description="同花顺账号（用于限流标识）")


@router.post("/qr/generate")
async def generate_qr_code(
    req: Request,
    request: QrGenerateRequest
) -> ApiResponse[QrGenerateResponse]:
    """
    生成二维码（分离式登录第1步）
    
    注意：首次生成需要启动浏览器，响应时间约5-10秒
    - 浏览器启动：2-3秒
    - 页面加载：2-3秒
    - 二维码截图：1-2秒
    
    返回：
    - session_id: 会话ID，用于后续轮询
    - qr_image: 二维码图片的base64编码（高清2x分辨率）
    
    参数：
    - headless: 是否无头模式
    - ths_account: 同花顺账号（用于限流标识，可选）
    """
    import time
    start_time = time.time()
    try:
        # 使用ths_account或IP作为限流标识（无需系统认证）
        rate_identifier = request.ths_account or req.client.host if req.client else "unknown"
        rate_key = f"qr_generate_limit:{rate_identifier}"
        user_id = None
        
        # 🚀 限流：60秒内不重复生成
        check_rate_limit(rate_key, ttl_seconds=60, action_name="生成二维码")
        set_rate_limit(rate_key, ttl_seconds=60)
        
        # 获取会话管理器
        output_dir = Path(ths_login_service.output_dir)
        session_manager = get_qr_session_manager(output_dir)
        
        # 创建新会话
        session_id = session_manager.create_session(user_id)
        
        # 异步启动二维码生成和登录流程
        success = await run_in_threadpool(
            session_manager.start_qr_login_async,
            session_id=session_id,
            headless=request.headless,
        )
        
        if not success:
            raise HTTPException(
                status_code=ThsHttpStatus.SERVER_ERROR,
                detail=ThsErrorMessages.QR_GENERATE_FAILED
            )
        
        # 等待二维码生成（最多等待25秒，与前端30秒超时保持合理差距）
        import time
        max_wait = 25
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            redis_session = session_manager.get_session_from_redis(session_id)
            if not redis_session:
                # 等待Redis中出现会话数据（刚创建时还没存入Redis）
                time.sleep(0.5)
                continue
            
            status = redis_session.get("status")
            qr_image_base64 = redis_session.get("qr_image_base64")
            
            if status == "qr_ready" and qr_image_base64:
                # 二维码已生成
                elapsed = time_module.time() - start_time
                logger.info(f"二维码生成成功，耗时: {elapsed:.2f}秒")
                qr_data = QrGenerateResponse(
                    session_id=session_id,
                    qr_image=f"data:image/png;base64,{qr_image_base64}",
                    status="qr_ready"
                )
                
                return create_success_response(
                    data=qr_data,
                    message="二维码已生成，请扫码登录"
                )
            
            if status == "failed":
                raise HTTPException(
                    status_code=ThsHttpStatus.SERVER_ERROR,
                    detail=ThsErrorMessages.QR_GENERATE_FAILED
                )
            
            # 短暂等待
            await run_in_threadpool(time.sleep, 0.5)
        
        # 超时
        raise HTTPException(
            status_code=ThsHttpStatus.TIMEOUT,
            detail=ThsErrorMessages.TIMEOUT_ERROR
        )
        
    except HTTPException:
        raise
    except ThsNetworkError as e:
        logger.error(f"生成二维码网络错误: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.NETWORK_ERROR,
            detail=ThsErrorMessages.NETWORK_ERROR
        )
    except Exception as e:
        logger.error(f"生成二维码失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


@router.get("/qr/status/{session_id}")
async def get_qr_status(
    req: Request,
    session_id: str
) -> ApiResponse[QrStatusResponse]:
    """
    查询二维码登录状态（分离式登录第2步）
    
    前端需要轮询此接口，直到登录成功或失败
    
    返回状态：
    - pending: 等待扫码
    - qr_ready: 二维码已生成，等待扫码
    - success: 登录成功
    - failed: 登录失败
    - timeout: 超时
    """
    try:
        # 获取会话管理器
        output_dir = Path(ths_login_service.output_dir)
        session_manager = get_qr_session_manager(output_dir)
        
        # 直接从Redis获取会话状态
        redis_session = session_manager.get_session_from_redis(session_id)
        if not redis_session:
            raise HTTPException(
                status_code=ThsHttpStatus.NOT_FOUND,
                detail=ThsErrorMessages.QR_EXPIRED
            )
        
        # 处理Redis中的会话状态
        status = redis_session.get("status")
        
        if status == "success":
            result = redis_session.get("result")
            if result:
                ths_account = ths_login_service.store_login_result(
                    result,
                    login_method="qr"
                )
                user_info = result.get("user_info", {})
                nickname = user_info.get("nickname")
                if not nickname:
                    raise ValueError("登录成功但未获取到昵称信息")
                
                session_manager.delete_session_from_redis(session_id)
                
                # 检查是否是补登录，发送成功通知
                from app.services.external.ths.auth.auto_relogin_service import AutoReloginService
                await AutoReloginService.handle_login_success(ths_account, nickname)
                
                status_data = QrStatusResponse(
                    status="success",
                    ths_account=ths_account,
                    nickname=nickname,
                    user_info=user_info
                )
                return create_success_response(
                    data=status_data,
                    message=f"登录成功！用户：{nickname}"
                )
        
        elif status == "failed":
            error_msg = redis_session.get("error") or "登录失败"
            session_manager.delete_session_from_redis(session_id)
            return create_error_response(message=error_msg)
        
        elif status in ["pending", "qr_ready"]:
            status_data = QrStatusResponse(
                status=status,
                message="等待扫码中..."
            )
            return create_success_response(
                data=status_data,
                message="等待扫码中"
            )
        
        else:
            status_data = QrStatusResponse(status=status)
            return create_success_response(
                data=status_data,
                message=f"当前状态：{status}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"查询二维码登录状态失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )


@router.delete("/qr/cancel/{session_id}")
async def cancel_qr_login(
    req: Request,
    session_id: str
):
    """
    取消二维码登录会话
    """
    try:
        output_dir = Path(ths_login_service.output_dir)
        session_manager = get_qr_session_manager(output_dir)
        
        # 从Redis删除会话
        session_manager.delete_session_from_redis(session_id)
        
        return create_success_response(message="已取消登录")
    except Exception as e:
        logger.error(f"取消二维码登录失败: {e}")
        raise HTTPException(
            status_code=ThsHttpStatus.SERVER_ERROR,
            detail=ThsErrorMessages.SERVER_ERROR
        )
