"""
管理端API路由
包括数据源管理、数据同步等管理功能
"""

from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException, Body, Request
from loguru import logger
from pydantic import BaseModel, Field

from app.core.response_models import create_success_response, create_error_response, ApiResponse
from app.services.management.scheduler_service import scheduler_service
from app.utils.api_utils import get_current_user
from app.utils.permission_helpers import AdminUser, AdminWriteUser

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ========== 管理API模型定义 ==========

class SyncResponse(BaseModel):
    """同步响应模型"""
    success: bool
    message: str
    count: int
    details: Optional[Dict[str, Any]] = None


class TaskStatusResponse(BaseModel):
    """任务状态响应模型"""
    task_id: str
    status: str  # pending, running, completed, failed
    progress: float  # 0.0 - 1.0
    message: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class DatabaseStatusResponse(BaseModel):
    """数据库状态响应模型"""
    status: str
    tables: Dict[str, int]  # 表名 -> 记录数
    last_updated: Optional[str] = None
    health_score: float  # 0.0 - 1.0


class TriggerTaskRequest(BaseModel):
    """触发任务请求模型"""
    options: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    """任务响应数据"""
    task_id: str
    task_execution_id: Optional[str] = None
    execution_mode: str = "async"


class ConfigResponse(BaseModel):
    """配置响应数据"""
    months: Optional[int] = None
    source: Optional[str] = None


class UserStatusResponse(BaseModel):
    """用户状态更新响应"""
    username: str
    is_active: bool


@router.get("/scheduler/tasks")
async def get_scheduler_tasks(user: AdminUser):
    """获取所有定时任务 - 需要管理员权限"""
    try:
        from app.services.management.scheduler_service import scheduler_service

        # 使用scheduler_service获取任务列表
        tasks = scheduler_service.get_all_tasks()

        return {"success": True, "data": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取定时任务列表失败: {str(e)}")


@router.get("/scheduler/tasks/{task_id}")
async def get_scheduler_task(task_id: str, user: AdminUser):
    """获取单个定时任务详情 - 需要管理员权限"""
    try:
        from app.services.management.scheduler_service import scheduler_service

        # 使用scheduler_service获取任务详情
        task = scheduler_service.get_task(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        return {"success": True, "data": task}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}")


@router.post("/scheduler/tasks/{task_id}/trigger")
async def trigger_scheduler_task(task_id: str, user: AdminWriteUser, request: Optional[TriggerTaskRequest] = Body(default=None)):
    """手动触发定时任务（异步执行）- 仅超级管理员"""
    try:
        from app.services.management.scheduler_service import scheduler_service

        # 验证任务ID（由scheduler集中校验）
        if not scheduler_service.validate_task_id(task_id):
            return create_error_response(
                message=f"无效的任务ID: {task_id}", error_code="INVALID_TASK_ID"
            )

        # 处理请求体为空的情况
        if request is None:
            request = TriggerTaskRequest()

        # 解析可选参数并传递给 scheduler
        # 格式：{"options": {"force_sync": true}}
        options = request.options if request.options else {}

        # 使用scheduler_service来触发任务，支持进度监控
        result = scheduler_service.trigger_task(task_id, options)

        if result["success"]:
            # 使用TaskResponse模型构建响应数据
            task_data = TaskResponse(
                task_id=task_id,
                task_execution_id=result.get("task_execution_id"),
                execution_mode="async"
            )
            
            return create_success_response(
                data=task_data,
                message=f"任务已创建: {task_id}"
            )
        else:
            return create_error_response(
                message=result["message"], error_code="TASK_TRIGGER_FAILED"
            )

    except Exception as e:
        logger.error(f"触发任务失败: {str(e)}")
        return create_error_response(
            message=f"触发任务失败: {str(e)}", error_code="INTERNAL_ERROR"
        )


@router.put("/scheduler/tasks/{task_id}/cron")
async def update_task_cron(task_id: str, request: dict, user: AdminWriteUser):
    """修改定时任务的执行周期 - 仅超级管理员"""
    try:
        cron_expression = request.get("cron_expression")
        if not cron_expression:
            raise HTTPException(status_code=400, detail="cron_expression参数不能为空")

        result = scheduler_service.update_task_cron(task_id, cron_expression)
        if result["success"]:
            return {
                "success": True,
                "message": result["message"],
                "data": result.get("task"),
            }
        else:
            raise HTTPException(status_code=500, detail=result["message"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"修改任务执行周期失败: {str(e)}")


@router.put("/scheduler/tasks/{task_id}/status")
async def update_task_status(task_id: str, request: dict, user: AdminWriteUser):
    """修改定时任务的启用状态（running/paused/stopped）- 仅超级管理员"""
    try:
        status = request.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="status 参数不能为空")

        result = scheduler_service.update_task_status(task_id, status)
        if result.get("success"):
            return {
                "success": True,
                "message": result.get("message", ""),
                "data": result.get("task"),
            }
        else:
            # 使用 400/500 之间的通用错误，这里简单返回 400
            raise HTTPException(status_code=400, detail=result.get("message") or "更新任务状态失败")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新任务状态失败: {str(e)}")


@router.get("/system/status")
async def get_system_status(user: AdminUser):
    """获取系统状态信息 - 需要管理员权限"""
    try:
        from app.services.core.performance_monitor import system_monitor
        status = system_monitor.get_system_status()
        return {"success": True, "data": status}
    except Exception as e:
        logger.error(f"获取系统状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取系统状态失败: {str(e)}")


@router.get("/system/info")
async def get_system_info(user: AdminUser):
    """获取系统基本信息 - 需要管理员权限"""
    try:
        from app.services.core.performance_monitor import system_monitor
        info = system_monitor.get_system_info()
        return {"success": True, "data": info}
    except Exception as e:
        logger.error(f"获取系统信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取系统信息失败: {str(e)}")


@router.get("/tasks/running", response_model=ApiResponse[Dict[str, Any]])
async def get_admin_running_tasks(user: AdminUser):
    """获取后台管理页面中正在运行的任务状态 - 需要管理员权限"""
    try:
        from ..services.core.redis_task_manager import redis_task_manager

        running_tasks = redis_task_manager.get_running_tasks()
        admin_tasks_status = {}

        # 管理任务的具体任务代码列表
        admin_task_codes = [
            # 定时任务
            'concept_sync',
            'industry_sync',
            'stock_sync',
            'cleanup_expired_data',
            'hot_sync',
            'trade_calendar_sync',
            'sync_stock_auction_data',
            # 定时K线同步任务
            'sync_all_stock_kline_data',
            'sync_all_bond_kline_data',
            'sync_all_concept_kline_data',
            'sync_all_industry_kline_data',
            # 手动同步K线数据任务（统一单任务）
            'manual_stock_sync',
            'manual_bond_sync',
            'manual_concept_sync',
            'manual_industry_sync',
        ]

        for task_id in running_tasks:
            task_info = redis_task_manager.get_task_progress(task_id)
            if task_info:
                task_code = task_info.get("code", "")

                # 检查是否是管理任务（使用任务代码匹配）
                is_admin_task = task_code in admin_task_codes

                if is_admin_task:
                    admin_tasks_status[task_id] = {
                        "task_id": task_id,
                        "code": task_code,
                        "name": task_info.get("name", ""),
                        "status": task_info.get("status", "unknown"),
                        "progress": task_info.get("progress", 0),
                        "message": task_info.get("message", ""),
                        "start_time": task_info.get("started_at"),
                        "result": task_info.get("result"),
                        "error": task_info.get("error"),
                        "operation_details": task_info.get("operation_details"),
                    }

        return {
            "success": True,
            "data": admin_tasks_status,
            "message": f"获取到 {len(admin_tasks_status)} 个正在运行的管理任务"
        }
    except Exception as e:
        logger.error(f"获取管理任务状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取管理任务状态失败: {str(e)}")


# ========== 响应模型 ==========

class UserStatusResponse(BaseModel):
    """用户状态更新响应"""
    username: str
    is_active: bool


class TaskResponse(BaseModel):
    """任务响应数据"""
    task_id: str
    task_execution_id: Optional[str] = None
    execution_mode: str = "async"


class ConfigResponse(BaseModel):
    """配置响应数据"""
    months: Optional[int] = None
    source: Optional[str] = None


# ========== 用户管理 API ==========

class ThsAccountInfo(BaseModel):
    """同花顺账号信息"""
    ths_account: str
    nickname: Optional[str] = None
    is_active: bool = True
    auto_relogin_enabled: bool = True
    has_cookie: bool = False
    mobile: Optional[str] = None
    last_login_method: Optional[str] = None
    last_login_at: Optional[str] = None
    message_forward_enabled: bool = False
    message_forward_type: Optional[str] = None


class AdminUserResponse(BaseModel):
    """管理员用户列表响应模型"""
    username: str
    nickname: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    created_at: str
    ths_accounts: List[ThsAccountInfo] = []
    last_login_at: Optional[str] = None
    pushplus_friend_token: Optional[str] = None  # 消息推送令牌


class AdminUserListResponse(BaseModel):
    """分页用户列表响应"""
    users: List[AdminUserResponse]
    total: int
    page: int
    page_size: int


@router.get("/users")
async def list_all_users(
    user: AdminUser,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None
) -> ApiResponse:
    """获取所有注册用户列表（分页）- 需要管理员权限
    
    Args:
        page: 页码，从1开始
        page_size: 每页数量，默认20
        keyword: 搜索关键词（用户名/昵称/邮箱）
    """
    from app.services.user.admin_user_service import admin_user_service
    
    try:
        result = admin_user_service.list_users_with_ths_accounts(
            page=page,
            page_size=page_size,
            keyword=keyword
        )
        
        return create_success_response(
            data=result,
            message=f"获取用户列表成功，共{result['total']}个用户"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取用户列表失败: {str(e)}")


@router.put("/users/{username}/status")
async def update_user_status(
    username: str,
    body: dict,
    user: AdminWriteUser
) -> ApiResponse:
    """更新用户状态（启用/禁用）- 仅超级管理员"""
    from app.services.user.admin_user_service import admin_user_service
    
    try:
        is_active = body.get("is_active")
        if is_active is None:
            raise HTTPException(status_code=400, detail="is_active参数不能为空")
        
        # 不能禁用自己
        if username == user.username:
            raise HTTPException(status_code=400, detail="不能修改自己的状态")
        
        updated_user = admin_user_service.update_user_status_by_username(username, is_active)
        if not updated_user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 使用UserStatusResponse模型构建响应数据
        status_data = UserStatusResponse(
            username=updated_user.username,
            is_active=updated_user.is_active
        )
        
        return create_success_response(
            data=status_data,
            message=f"用户状态已{'启用' if is_active else '禁用'}"
        )
    except HTTPException:
        raise


@router.put("/users/{username}/pushplus-token")
async def update_user_pushplus_token(
    username: str,
    body: dict,
    user: AdminWriteUser
) -> ApiResponse:
    """更新用户的消息推送令牌 - 仅超级管理员"""
    from app.services.user.admin_user_service import admin_user_service
    
    try:
        pushplus_friend_token = body.get("pushplus_friend_token")
        
        success = admin_user_service.update_user_pushplus_token(username, pushplus_friend_token)
        if not success:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        return create_success_response(
            data={"username": username, "pushplus_friend_token": pushplus_friend_token},
            message="推送令牌已更新" if pushplus_friend_token else "推送令牌已清除"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新推送令牌失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新推送令牌失败: {str(e)}")


@router.delete("/users/{username}/ths-cookie/{ths_account}")
async def delete_user_ths_cookie(
    username: str,
    ths_account: str,
    user: AdminWriteUser
) -> ApiResponse:
    """删除用户的同花顺Cookie - 仅超级管理员"""
    from app.services.user.admin_user_service import admin_user_service
    from app.services.user.user_service import user_service
    
    # 通过username获取用户
    target_user = user_service.find_user_by_username(username)
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    try:
        admin_user_service.delete_ths_cookie(target_user.id, ths_account)
        
        return create_success_response(
            data=None,
            message=f"已删除 {ths_account} 的Cookie"
        )
    except Exception as e:
        logger.error(f"删除Cookie失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除Cookie失败: {str(e)}")


# ========== 同花顺 Cookie 管理 API ==========

class THSCookieUpdateRequest(BaseModel):
    """同花顺 Cookie 更新请求
    
    提交整行 cookie_str（例如："v=xxx; sid=yyy; ..."），适合普通用户
    
    ths_account 可选，如果不提供则从 Cookie 验证接口自动获取用户 uid
    """
    ths_account: Optional[str] = None  # 同花顺账号标识（可选，不填则自动获取）
    cookie_str: str = Field(..., description="Cookie字符串，从浏览器开发者工具中复制")


@router.post("/ths/cookies/update")
async def update_ths_cookies(
    request: Request,
    body: THSCookieUpdateRequest,
) -> ApiResponse:
    """通过 Cookie 字符串登录同花顺
    
    使用方式：
    1. 在浏览器中登录同花顺网站 (10jqka.com.cn)
    2. 打开开发者工具 (F12) -> Network(网络) 标签
    3. 刷新页面，点击任意一个指向 10jqka.com.cn 的请求
    4. 在 Request Headers 中找到整行 "Cookie: ..."，复制"冒号后面"的全部内容
    5. 将这整行 Cookie 字符串粘贴到管理页面中，由后台解析并保存
    """
    from app.utils.api_utils import get_current_user
    current_user = get_current_user(request)
    
    try:
        raw_str = body.cookie_str.strip()
        if not raw_str:
            raise HTTPException(status_code=400, detail="Cookie 字符串不能为空")

        # 兼容 "Cookie: xxx" 形式
        lower = raw_str.lower()
        if lower.startswith("cookie:"):
            raw_str = raw_str.split(":", 1)[1].strip()

        cookies_dict: Dict[str, str] = {}
        parts = [p.strip() for p in raw_str.split(";") if p.strip()]
        for part in parts:
            if "=" not in part:
                continue
            name, value = part.split("=", 1)
            name = name.strip()
            value = value.strip()
            if not name or not value:
                continue
            cookies_dict[name] = value

        if not cookies_dict:
            raise HTTPException(status_code=400, detail="未能从提供的Cookie字符串中解析出任何有效Cookie")
        
        # 调用 Service 层存储
        from app.services.external.ths.auth.login_service import ths_login_service
        from app.services.external.ths.core.constants import (
            ThsValidationError,
            ThsNetworkError,
            ThsErrorMessages,
            ThsHttpStatus,
        )
        try:
            result = ths_login_service.login_with_cookies(
                user_id=current_user.id,
                ths_account=body.ths_account,
                cookies=cookies_dict
            )
            
            return create_success_response(
                data=result,
                message="同花顺 Cookie 更新成功"
            )
        except ThsValidationError as e:
            logger.warning(f"同花顺 Cookie 校验失败: {e}")
            raise HTTPException(
                status_code=ThsHttpStatus.VALIDATION_ERROR,
                detail=ThsErrorMessages.COOKIE_INVALID
            )
        except ThsNetworkError as e:
            logger.error(f"同花顺 Cookie 校验网络错误: {e}")
            raise HTTPException(
                status_code=ThsHttpStatus.NETWORK_ERROR,
                detail=ThsErrorMessages.NETWORK_ERROR
            )
        
    except HTTPException:
        # 已在上面转换为合适的 HTTP 错误
        raise
    except Exception as e:
        # 其它未预料的服务器内部错误
        logger.error(f"更新同花顺 Cookie 失败: {str(e)}")
        raise HTTPException(status_code=500, detail="服务器内部错误，请稍后重试")


class DeleteCodeDataRequest(BaseModel):
    """批量删除代码数据请求模型（异步任务，支持进度管理）"""
    ts_codes: List[str]  # 代码列表
    data_type: str  # stock, convertible_bond, concept, industry
    delete_scope: str = "kline"  # "all" | "kline"
    periods: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.post("/delete-code-data")
async def delete_code_data(request: DeleteCodeDataRequest, user: AdminWriteUser) -> ApiResponse:
    """
    批量删除代码数据（异步任务，支持进度管理）- 仅超级管理员
    
    返回 task_id，可通过 /tasks/{task_id}/progress 查询进度
    """
    try:
        from app.services.core.redis_task_manager import redis_task_manager
        from app.services.management.data_management_service import data_management_service
        
        ts_codes = [code.strip() for code in request.ts_codes if code.strip()]
        if not ts_codes:
            raise HTTPException(status_code=400, detail="代码列表不能为空")
        
        # 验证参数
        valid_types = ['stock', 'convertible_bond', 'concept', 'industry']
        if request.data_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"不支持的数据类型: {request.data_type}")
        
        delete_scope = request.delete_scope or "kline"
        valid_scopes = ['all', 'kline']
        if delete_scope not in valid_scopes:
            raise HTTPException(status_code=400, detail=f"不支持的删除范围: {delete_scope}")
        
        periods = request.periods
        if periods:
            valid_periods = ['daily', 'weekly', 'monthly']
            invalid_periods = [p for p in periods if p not in valid_periods]
            if invalid_periods:
                raise HTTPException(status_code=400, detail=f"不支持的周期: {invalid_periods}")
        
        start_date = (request.start_date or "").strip() or None
        end_date = (request.end_date or "").strip() or None
        
        # 生成任务名称
        type_names = {'stock': '股票', 'convertible_bond': '可转债', 'concept': '概念', 'industry': '行业'}
        scope_names = {'all': '全部数据', 'kline': 'K线数据'}
        task_name = f"批量删除{type_names.get(request.data_type, '')} {scope_names.get(delete_scope, '')}"
        
        def worker(task_id: str):
            """删除任务工作函数"""
            total = len(ts_codes)
            success_count = 0
            fail_count = 0
            total_deleted = 0
            
            for i, code in enumerate(ts_codes):
                try:
                    # 检查任务是否被取消
                    if redis_task_manager.is_task_cancelled(task_id):
                        redis_task_manager.update_task_progress(
                            task_id, 0, "任务已取消"
                        )
                        return
                    
                    # 执行删除
                    result = data_management_service.delete_code_data(
                        ts_code=code,
                        data_type=request.data_type,
                        delete_scope=delete_scope,
                        periods=periods,
                        start_date=start_date,
                        end_date=end_date,
                    )
                    
                    success_count += 1
                    total_deleted += result.get('total_deleted', 0)
                    
                except Exception as e:
                    fail_count += 1
                    logger.error(f"删除 {code} 失败: {e}")
                
                # 更新进度
                progress = int((i + 1) / total * 100)
                redis_task_manager.update_task_progress(
                    task_id,
                    progress,
                    f"正在删除 {i + 1}/{total}：{code}"
                )
            
            # 返回结果
            return {
                "success_count": success_count,
                "fail_count": fail_count,
                "total_deleted": total_deleted,
                "total_codes": total
            }
        
        # 创建异步任务
        task_id = redis_task_manager.create_task(
            name=task_name,
            task_func=worker,
            code=f"batch_delete_{request.data_type}"
        )
        
        # 使用TaskResponse模型构建响应数据
        task_data = TaskResponse(
            task_id=task_id,
            execution_mode="async"
        )
        
        return create_success_response(
            data=task_data,
            message=f"批量删除任务已创建，共 {len(ts_codes)} 个代码"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建批量删除任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建批量删除任务失败: {str(e)}")


# ========== 系统配置API ==========





# ========== 自动补登录配置API ==========

def _check_rate_limit(request: Request, account: str, limit: int = 30, window: int = 60) -> bool:
    """检查速率限制
    
    Args:
        request: FastAPI 请求对象
        account: 账号标识
        limit: 时间窗口内最大请求数
        window: 时间窗口（秒）
        
    Returns:
        True 如果超过限制，False 如果未超过
    """
    from app.services.core.cache_service import cache_service
    
    # 获取客户端 IP
    client_ip = request.client.host if request.client else "unknown"
    
    # 基于 IP + 账号 的速率限制
    rate_key = f"relogin:rate_limit:{client_ip}:{account}"
    
    try:
        if cache_service.redis_client:
            current = cache_service.redis_client.incr(rate_key)
            if current == 1:
                cache_service.redis_client.expire(rate_key, window)
            return current > limit
    except Exception as e:
        logger.warning(f"速率限制检查失败: {e}")
    
    return False


@router.get("/relogin/state")
async def get_relogin_state(
    request: Request,
    username: str,
    account: str
) -> ApiResponse:
    """获取用户补登录状态（无需认证，用于补登录页面）
    
    使用username作为用户标识符，实现完全的ID安全隔离
    如果状态已过期，自动创建新状态允许用户继续操作
    速率限制：每分钟最多30次请求
    """
    from datetime import datetime, timedelta
    
    # 速率限制检查
    if _check_rate_limit(request, account, limit=30, window=60):
        return create_error_response(message="请求过于频繁，请稍后再试")
    
    try:
        from app.services.external.ths.auth.auto_relogin_service import auto_relogin_service
        from app.services.user.user_service import user_service
        from app.dao.ths_account_dao import ths_account_dao
        
        # 通过username获取用户
        user = user_service.find_user_by_username(username)
        if not user:
            return create_error_response(message="用户不存在")
        user_id = user.id
        
        # 验证账号是否属于该用户
        ths_account_obj = ths_account_dao.find_by_ths_account_and_user(account, user_id)
        if not ths_account_obj:
            return create_error_response(message="账号不存在或不属于该用户")
        
        state = auto_relogin_service.get_relogin_state(user_id, account)
        
        # 如果状态不存在或已过期，自动创建新状态
        if not state:
            logger.info(f"补登录状态已过期，自动创建新状态: user_id={user_id}, account={account}")
            # 获取上次登录方式，默认使用短信
            method = ths_account_obj.last_login_method or "sms"
            mobile = ths_account_obj.mobile
            
            state = {
                "status": "waiting_user",
                "method": method,
                "mobile": mobile,
                "started_at": datetime.now().isoformat(),
                "timeout_at": (datetime.now() + timedelta(minutes=30)).isoformat(),  # 30分钟超时
                "auto_created": True  # 标记为自动创建
            }
            # 保存新状态（30分钟TTL）
            auto_relogin_service.set_relogin_state(user_id, account, state, ttl_seconds=1800)
        
        logger.info(f"查询补登录状态: user_id={user_id}, account={account}, found=True")
        return create_success_response(data=state)
    except Exception as e:
        logger.error(f"获取补登录状态失败: {str(e)}")
        return create_error_response(message=f"获取状态失败: {str(e)}")

class TriggerReloginRequest(BaseModel):
    """触发补登录请求"""
    ths_account: str = Field(description="同花顺账号")
    method: str = Field(default="sms", description="补登录方式: sms, qr")


@router.post("/relogin/trigger")
async def trigger_relogin(request: Request, body: TriggerReloginRequest) -> ApiResponse:
    """手动触发补登录
    
    只创建补登录状态并发送PushPlus通知，用户在补登录页面完成所有验证操作
    """
    from app.services.external.ths.auth.auto_relogin_service import auto_relogin_service
    
    # 获取当前登录用户
    user = get_current_user(request)
    if not user:
        return create_error_response(message="未登录")
    
    # 调用 Service 层触发补登录（所有业务逻辑在 Service 层）
    result = await auto_relogin_service.trigger_manual_relogin(user, body.ths_account, body.method)
    
    if result.get("success"):
        return create_success_response(
            data={"relogin_url": result.get("relogin_url")},
            message="已发送补登录通知，请查看微信推送"
        )
    else:
        return create_error_response(message=result.get("message", "触发补登录失败"))


class UpdateThsAccountConfigRequest(BaseModel):
    """更新同花顺账号配置请求"""
    auto_relogin_enabled: Optional[bool] = None
    message_forward_enabled: Optional[bool] = None
    message_forward_token: Optional[str] = None
    message_forward_type: Optional[str] = None
    nickname: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/ths_accounts/{ths_account}")
async def update_ths_account_config(
    ths_account: str,
    request: UpdateThsAccountConfigRequest,
    user: AdminWriteUser
) -> ApiResponse:
    """更新同花顺账号配置（包括补登录开关）- 仅超级管理员"""
    from app.services.user.admin_user_service import admin_user_service
    
    try:
        success = admin_user_service.update_ths_account_config(
            ths_account=ths_account,
            user_id=user.id,
            auto_relogin_enabled=request.auto_relogin_enabled,
            message_forward_enabled=request.message_forward_enabled,
            message_forward_token=request.message_forward_token,
            message_forward_type=request.message_forward_type,
            nickname=request.nickname,
            is_active=request.is_active
        )
        
        if not success:
            raise HTTPException(404, "同花顺账号不存在")
        
        return create_success_response(
            message="同花顺账号配置更新成功"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新同花顺账号配置失败: {str(e)}")
        return create_error_response(message=f"更新配置失败: {str(e)}")




# ==================== 邀请码管理 ====================

from app.services.user.invitation_code_service import invitation_code_service


class CreateInvitationCodeRequest(BaseModel):
    """创建邀请码请求"""
    code: Optional[str] = None  # 自定义邀请码，不填则自动生成
    max_uses: int = 1  # 最大使用次数，0表示无限制
    expires_days: Optional[int] = None  # 有效期天数，不填则永不过期
    remark: Optional[str] = None  # 备注


class UpdateInvitationCodeRequest(BaseModel):
    """更新邀请码请求"""
    is_active: bool


@router.get("/invitation-codes")
async def list_invitation_codes(
    user: AdminUser,
    page: int = 1,
    page_size: int = 20,
    include_expired: bool = True
) -> ApiResponse:
    """获取邀请码列表 - 需要管理员权限"""
    try:
        result = invitation_code_service.list_codes(
            page=page,
            page_size=page_size,
            include_expired=include_expired
        )
        return create_success_response(data=result)
    except Exception as e:
        logger.error(f"获取邀请码列表失败: {e}")
        return create_error_response(message="获取邀请码列表失败")


@router.post("/invitation-codes")
async def create_invitation_code(
    body: CreateInvitationCodeRequest,
    user: AdminWriteUser
) -> ApiResponse:
    """创建邀请码 - 仅超级管理员"""
    try:
        result = invitation_code_service.create_code(
            created_by=user.id,
            code=body.code,
            max_uses=body.max_uses,
            expires_days=body.expires_days,
            remark=body.remark
        )
        return create_success_response(
            data=result,
            message=f"邀请码创建成功: {result['code']}"
        )
    except Exception as e:
        logger.error(f"创建邀请码失败: {e}")
        if "UNIQUE constraint" in str(e) or "Duplicate" in str(e):
            return create_error_response(message="邀请码已存在")
        return create_error_response(message="创建邀请码失败")


@router.put("/invitation-codes/{code}")
async def update_invitation_code(
    code: str,
    request_data: dict,
    user: AdminWriteUser
) -> ApiResponse:
    """更新邀请码状态 - 仅超级管理员"""
    try:
        invitation_code = invitation_code_service.update_status_by_code(code, request_data.get("is_active"))
        if not invitation_code:
            raise HTTPException(404, "邀请码不存在")
        
        return create_success_response(
            message=f"邀请码已{'启用' if request_data.get('is_active') else '禁用'}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新邀请码失败: {e}")
        return create_error_response(message="更新邀请码失败")


@router.delete("/invitation-codes/{code}")
async def delete_invitation_code(
    code: str,
    user: AdminWriteUser
) -> ApiResponse:
    """删除邀请码 - 仅超级管理员"""
    try:
        success = invitation_code_service.delete_by_code(code)
        if not success:
            raise HTTPException(404, "邀请码不存在")
        
        return create_success_response(message="邀请码已删除")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除邀请码失败: {e}")
        return create_error_response(message="删除邀请码失败")


@router.delete("/users/{username}")
async def delete_user(
    username: str,
    user: AdminWriteUser
) -> ApiResponse:
    """删除用户 - 仅超级管理员"""
    from app.services.user.admin_user_service import admin_user_service
    
    # 不能删除自己
    if username == user.username:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    
    try:
        # 检查用户是否存在
        from app.services.user.user_service import user_service
        target_user = user_service.find_user_by_username(username)
        if not target_user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 不能删除其他管理员
        if target_user.is_admin:
            raise HTTPException(status_code=400, detail="不能删除管理员账号")
        
        # 执行删除
        success = admin_user_service.delete_user(target_user.id)
        if not success:
            return create_error_response(message="删除用户失败")
        
        logger.info(f"管理员 {user.username} 删除了用户 {username}")
        return create_success_response(message=f"用户 {username} 已删除")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除用户失败: {e}")
        return create_error_response(message="删除用户失败")


@router.delete("/users/{username}/ths-accounts/{ths_account}")
async def delete_user_ths_account(
    username: str,
    ths_account: str,
    user: AdminWriteUser
) -> ApiResponse:
    """删除用户的同花顺账号 - 仅超级管理员"""
    from app.services.user.user_service import user_service
    from app.services.user.ths_account_service import ths_account_service
    
    try:
        # 查找目标用户
        target_user = user_service.find_user_by_username(username)
        if not target_user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 删除同花顺账号
        success = ths_account_service.delete_account_by_ths_account(ths_account, target_user.id)
        if not success:
            return create_error_response(message="账号不存在或删除失败", status_code=404)
        
        logger.info(f"管理员 {user.username} 删除了用户 {username} 的同花顺账号 {ths_account}")
        return create_success_response(message=f"同花顺账号 {ths_account} 已删除")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除同花顺账号失败: {e}")
        return create_error_response(message="删除同花顺账号失败")


# ========== 统一系统配置API ==========

class StrategyPushItem(BaseModel):
    """单个策略推送配置项"""
    enabled: bool = True  # 是否启用该配置
    strategy_name: str
    ths_group_name: str
    entity_type: str = "stock"
    period: str = "daily"
    sort_by: Optional[str] = None  # 推送排序字段，如 auction_vol, vol, max_concept_heat 等
    sort_order: str = "asc"  # 排序方向：asc（升序）或 desc（降序）
    params_json: Dict[str, Any] = {}


class StrategyPushConfig(BaseModel):
    """策略推送配置（支持多策略多配置）"""
    enabled: bool = False
    max_total_configs: int = 10
    base_date: str = ""  # 基准日期，空字符串表示使用最新交易日
    use_dynamic_hot_filter: bool = False  # 使用动态热门筛选（推送所有有热度数据的概念/行业）
    configs: List[StrategyPushItem] = []


class AdminSystemConfigResponse(BaseModel):
    """统一系统配置响应"""
    indicator_source: str
    default_sync_months: int
    kline_display_years: int  # K线最多显示年份数量
    relogin_config: Dict[str, str]
    login_methods: Dict[str, bool]
    captcha_mode: str  # combined(组合), auto(自动), manual(手动)
    tushare_rate_policies: Optional[Dict[str, Dict[str, int]]] = None  # Tushare API 频次配置
    strategy_push_config: Optional[StrategyPushConfig] = None  # 策略推送配置


class UpdateAdminSystemConfigRequest(BaseModel):
    """更新系统配置请求"""
    indicator_source: Optional[str] = None
    default_sync_months: Optional[int] = None
    kline_display_years: Optional[int] = None  # K线最多显示年份数量
    relogin_config: Optional[Dict[str, str]] = None
    login_methods: Optional[Dict[str, bool]] = None
    captcha_mode: Optional[str] = None  # combined(组合), auto(自动), manual(手动)
    tushare_rate_policies: Optional[Dict[str, Dict[str, int]]] = None  # Tushare API 频次配置
    strategy_push_config: Optional[StrategyPushConfig] = None  # 策略推送配置


@router.get("/system/config")
async def get_admin_system_config(user: AdminUser) -> ApiResponse[AdminSystemConfigResponse]:
    """
    获取所有admin系统配置（统一接口）- 需要管理员权限
    """
    
    try:
        from app.services.core.system_config_service import system_config_service
        from app.services.management.sync_strategy_config import SyncStrategyConfig
        from app.dao.query_config import QueryConfig
        
        # 1. 获取指标数据源配置
        source = system_config_service.get_indicator_source()
        
        # 2. 获取默认同步月数配置
        default_sync_months = SyncStrategyConfig.get_default_months()
        
        # 3. 获取K线显示年份数量配置
        kline_display_years = QueryConfig.get_query_years_count()
        
        # 4. 获取补登录系统配置
        relogin_config = {
            "auto_relogin_enabled": system_config_service.get("auto_relogin_enabled", "true"),
            "pushplus_token": system_config_service.get("pushplus_token", ""),
            "pushplus_secret_key": system_config_service.get("pushplus_secret_key", ""),
            "relogin_timeout_minutes": system_config_service.get("relogin_timeout_minutes", "10"),
        }
        
        # 5. 获取登录方式配置
        login_methods_config = system_config_service.get_login_methods()
        
        # 6. 获取滑块验证模式配置
        captcha_mode = system_config_service.get_captcha_mode()
        
        # 7. 获取 Tushare 频次配置
        tushare_rate_policies = system_config_service.get_tushare_rate_policies()
        
        # 8. 获取策略推送配置
        strategy_push_config_data = system_config_service.get_json("strategy_push_config")
        strategy_push_config = StrategyPushConfig(**strategy_push_config_data) if strategy_push_config_data else None
        
        config = AdminSystemConfigResponse(
            indicator_source=source,
            default_sync_months=default_sync_months,
            kline_display_years=kline_display_years,
            relogin_config=relogin_config,
            login_methods=login_methods_config,
            captcha_mode=captcha_mode,
            tushare_rate_policies=tushare_rate_policies,
            strategy_push_config=strategy_push_config
        )
        
        return create_success_response(data=config, message="获取配置成功")
        
    except Exception as e:
        logger.error(f"获取系统配置失败: {e}")
        return create_error_response(message=f"获取系统配置失败: {str(e)}")


@router.post("/system/config")
async def update_admin_system_config(
    body: UpdateAdminSystemConfigRequest,
    user: AdminWriteUser
) -> ApiResponse[AdminSystemConfigResponse]:
    """
    更新admin系统配置（统一接口）- 仅超级管理员
    支持部分更新，只更新传入的配置项
    """
    
    try:
        from app.services.core.system_config_service import system_config_service
        
        # 1. 更新指标数据源配置
        if body.indicator_source is not None:
            source = str(body.indicator_source).strip().lower()
            if source not in system_config_service.VALID_INDICATOR_SOURCES:
                return create_error_response(f"indicator_source 必须是 {system_config_service.VALID_INDICATOR_SOURCES} 之一")
            system_config_service.set("indicator_source", source)
            logger.info(f"指标数据源配置已更新: {source}")
        
        # 2. 更新默认同步月数配置  
        if body.default_sync_months is not None:
            months = int(body.default_sync_months)
            if months < 1 or months > 120:
                return create_error_response("default_sync_months 必须在 1-120 范围内")
            system_config_service.set("default_sync_months", str(months))
            logger.info(f"默认同步月数配置已更新: {months}")
        
        # 3. 更新最大K线显示年份配置
        if body.kline_display_years is not None:
            years = int(body.kline_display_years)
            if years < 1 or years > 10:
                return create_error_response("kline_display_years 必须在 1-10 范围内")
            system_config_service.set("kline_display_years", str(years))
            logger.info(f"K线显示年份配置已更新: {years}")
        
        # 4. 更新补登录系统配置
        if body.relogin_config is not None:
            for key, value in body.relogin_config.items():
                if key in system_config_service.RELOGIN_CONFIG_KEYS:
                    system_config_service.set(key, str(value))
            logger.info("补登录系统配置已更新")
        
        # 5. 更新登录方式配置
        if body.login_methods is not None:
            system_config_service.set_json("login_methods", body.login_methods)
            logger.info(f"登录方式配置已更新: {body.login_methods}")
        
        # 6. 更新滑块验证模式配置
        if body.captcha_mode is not None:
            mode = str(body.captcha_mode).strip().lower()
            if mode not in system_config_service.VALID_CAPTCHA_MODES:
                return create_error_response(f"captcha_mode 必须是 {system_config_service.VALID_CAPTCHA_MODES} 之一")
            system_config_service.set("captcha_mode", mode)
            logger.info(f"滑块验证模式配置已更新: {mode}")
        
        # 7. 更新 Tushare 频次配置
        if body.tushare_rate_policies is not None:
            system_config_service.set_tushare_rate_policies(body.tushare_rate_policies)
            # 通知 tushare_service 重新加载配置
            try:
                from app.services.external.tushare_service import tushare_service
                tushare_service.reload_rate_policies()
            except Exception as reload_err:
                logger.warning(f"重新加载 Tushare 频次配置失败: {reload_err}")
            logger.info(f"Tushare 频次配置已更新: {list(body.tushare_rate_policies.keys())}")
        
        # 8. 更新策略推送配置
        if body.strategy_push_config is not None:
            config_dict = body.strategy_push_config.model_dump()
            system_config_service.set_json("strategy_push_config", config_dict)
            logger.info(f"策略推送配置已更新: enabled={config_dict.get('enabled')}, strategy={config_dict.get('strategy_name')}")
        
        # 返回更新后的完整配置
        return await get_admin_system_config(user)
        
    except Exception as e:
        logger.error(f"更新系统配置失败: {e}")
        return create_error_response(message=f"更新系统配置失败: {str(e)}")


@router.get("/strategy-push/history")
async def get_strategy_push_history(
    user: AdminUser,
    page: int = 1,
    page_size: int = 20
):
    """获取策略推送历史记录 - 需要管理员权限"""
    try:
        from app.services.management.strategy_history_service import strategy_history_service
        
        # get_history_list 返回 (items, total) 元组
        items, total = strategy_history_service.get_history_list(
            user_id="system_push",
            page=page,
            page_size=page_size
        )
        
        return create_success_response(data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        })
    except Exception as e:
        logger.error(f"获取策略推送历史失败: {e}")
        return create_error_response(message=f"获取策略推送历史失败: {str(e)}")


@router.delete("/strategy-history/{history_id}")
async def delete_strategy_history(history_id: int, user: AdminWriteUser):
    """删除策略推送历史记录 - 仅超级管理员"""
    try:
        from app.services.management.strategy_history_service import strategy_history_service
        
        success = strategy_history_service.delete_history(history_id, user_id="system_push")
        if success:
            return create_success_response(message="删除成功")
        else:
            return create_error_response(message="记录不存在或删除失败")
    except Exception as e:
        logger.error(f"删除策略历史失败: {e}")
        return create_error_response(message=f"删除策略历史失败: {str(e)}")
