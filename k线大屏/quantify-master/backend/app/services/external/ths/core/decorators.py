"""
同花顺服务装饰器

提供登录态校验、异常处理等通用装饰器
"""
import inspect
from functools import wraps
from typing import Callable
from loguru import logger

from app.services.external.ths.core.constants import (
    ThsSessionExpiredException,
    ThsAuthError,
)


def ths_auth_required(func: Callable) -> Callable:
    """
    同花顺登录态校验装饰器
    
    用于需要同花顺登录态的方法，自动检查session是否有效
    如果session无效或执行过程中发现登录态失效，抛出ThsSessionExpiredException
    
    使用方式：
        @ths_auth_required
        def some_method(self, ths_account: str, ...):
            ...
    
    注意：
        - 被装饰的方法必须有ths_account参数（可以是可选参数）
        - 可以是实例方法（第一个参数是self）或普通函数
        - 如果ths_account为None，跳过校验直接执行
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        # 提取ths_account - 优先从kwargs获取
        ths_account = kwargs.get('ths_account')
        
        # 如果kwargs中没有，使用inspect按参数名从args中提取
        if ths_account is None:
            try:
                sig = inspect.signature(func)
                params = list(sig.parameters.keys())
                if 'ths_account' in params:
                    idx = params.index('ths_account')
                    if idx < len(args):
                        ths_account = args[idx]
            except (ValueError, TypeError):
                pass
        
        # ths_account 是必需参数，不允许为 None
        if not ths_account:
            raise ValueError("@ths_auth_required: ths_account 是必需参数，不能为 None")
        
        # 延迟导入避免循环依赖
        from app.services.external.ths.auth.login_service import ths_login_service
        
        # 1. 检查session是否存在
        if not ths_login_service.has_valid_session(ths_account):
            logger.warning(f"@ths_auth_required: 同花顺账号 {ths_account} 无有效session，触发补登录")
            _trigger_relogin_for_account(ths_account, delete_session=False)  # session已不存在，无需删除
            raise ThsSessionExpiredException(ths_account)
        
        # 2. 执行原函数
        try:
            return func(*args, **kwargs)
        except ThsAuthError as e:
            # 3. 执行过程中发现登录态失效（API返回401），需删除session
            logger.warning(f"@ths_auth_required: 执行过程中发现登录态失效 - {e.message}")
            _trigger_relogin_for_account(ths_account, delete_session=True)  # session存在但失效，需删除
            raise ThsSessionExpiredException(ths_account, message=e.message)
    
    return wrapper


def _trigger_relogin_for_account(ths_account: str, delete_session: bool = True) -> None:
    """触发同花顺账号补登录流程（内部方法）
    
    使用 AutoReloginService.should_trigger_relogin 统一检查逻辑
    
    Args:
        ths_account: 同花顺账号
        delete_session: 是否删除session（API返回401时需删除，session本就不存在时无需删除）
    """
    import asyncio
    
    try:
        from app.services.external.ths.auth.auto_relogin_service import AutoReloginService
        from app.services.external.ths.auth.login_service import ths_login_service
        
        # 删除失效的 session（仅在需要时）
        if delete_session:
            ths_login_service.logout(ths_account)
            logger.info(f"账号 {ths_account} 会话已过期，已删除 session")
        
        # 使用统一的检查方法
        should_trigger, user, ths_account_obj, skip_reason = AutoReloginService.should_trigger_relogin(
            ths_account, check_dedup=True
        )
        
        if not should_trigger:
            logger.debug(f"账号 {ths_account} 跳过补登录: {skip_reason}")
            return
        
        # 触发补登录（异步调用），根据账户的上次登录方式选择对应方法
        async def _async_trigger():
            # 获取账户的上次登录方式，默认使用二维码
            login_method = getattr(ths_account_obj, 'last_login_method', None) or 'qr'
            if login_method == 'sms':
                return await AutoReloginService.send_sms_relogin_notification(user, ths_account_obj)
            else:
                return await AutoReloginService.send_qr_relogin_notification(user, ths_account_obj)
        
        # 尝试在现有事件循环中运行，或创建新循环
        try:
            loop = asyncio.get_running_loop()
            asyncio.ensure_future(_async_trigger())
        except RuntimeError:
            asyncio.run(_async_trigger())
        
        logger.info(f"已触发账号 {ths_account} (user_id={user.id}) 的补登录流程")
    except Exception as e:
        logger.error(f"触发补登录失败: {e}")


def ths_session_check(ths_account: str) -> bool:
    """
    检查同花顺登录态是否有效
    
    Args:
        ths_account: 同花顺账号
        
    Returns:
        bool: 登录态是否有效
    """
    from app.services.external.ths.auth.login_service import ths_login_service
    return ths_login_service.has_valid_session(ths_account)


def require_ths_session(ths_account: str) -> None:
    """
    要求同花顺登录态有效，否则抛出异常
    
    Args:
        ths_account: 同花顺账号
        
    Raises:
        ThsSessionExpiredException: 登录态无效时抛出
    """
    if not ths_session_check(ths_account):
        raise ThsSessionExpiredException(ths_account)
