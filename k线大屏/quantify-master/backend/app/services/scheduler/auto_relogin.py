"""
自动补登录定时任务
基于系统用户进行补登录检查，用户需要是激活状态且有绑定的可用同花顺账号
"""

from loguru import logger
from sqlmodel import Session, select

from app.models.base.database import engine
from app.services.external.ths.auth.auto_relogin_service import auto_relogin_service
from app.services.external.ths.auth.login_service import ths_login_service


def check_user_login_state():
    """检查所有用户登录态并触发补登录（每24小时执行）
    
    使用 AutoReloginService.should_trigger_relogin 统一检查逻辑。
    并行遍历所有有 Cookie 的账号，检查 Cookie 有效性，失效则触发补登录。
    """
    from app.utils.concurrent_utils import process_concurrently
    from app.services.external.ths.auth.auto_relogin_service import AutoReloginService
    from app.services.core.system_config_service import system_config_service
    
    # 1. 检查是否启用自动补登录
    if not system_config_service.is_auto_relogin_enabled():
        logger.info("自动补登录功能未启用")
        return
    
    # 2. 获取所有有 Cookie 的账号
    account_list = ths_login_service.list_accounts_with_cookies()
    if not account_list:
        logger.info("没有已登录的同花顺账号")
        return
    
    logger.info(f"开始并行检查 {len(account_list)} 个同花顺账号的登录态")
    
    # 统计结果
    results = {"checked": 0, "relogin": 0, "valid": 0, "skipped": 0}
    
    def check_single_account(ths_account: str) -> str:
        """检查单个账号（在线程池中并行执行）"""
        import asyncio
        
        try:
            # 检查 Cookie 有效性
            is_valid = check_ths_cookie_valid(ths_account)
            
            if is_valid:
                logger.debug(f"账号 {ths_account} 登录态正常")
                return "valid"
            
            # Cookie 失效，删除失效的 session
            ths_login_service.logout(ths_account)
            logger.info(f"账号 {ths_account} 会话已过期，已删除 session")
            
            # 使用统一检查方法判断是否触发补登录
            should_trigger, user, ths_account_obj, skip_reason = AutoReloginService.should_trigger_relogin(
                ths_account, check_dedup=True
            )
            
            if not should_trigger:
                logger.debug(f"账号 {ths_account} 跳过补登录: {skip_reason}")
                return "skipped"
            
            # 触发补登录
            logger.warning(f"账号 {ths_account} 登录态失效，触发补登录")
            
            async def _trigger():
                return await auto_relogin_service.trigger_auto_relogin(
                    user=user,
                    ths_account_obj=ths_account_obj
                )
            
            loop = asyncio.new_event_loop()
            try:
                result = loop.run_until_complete(_trigger())
            finally:
                loop.close()
            
            if result.get("success"):
                return "relogin"
            else:
                logger.error(f"触发补登录失败: {result.get('message')}")
                return "skipped"
                
        except Exception as e:
            logger.error(f"检查账号 {ths_account} 失败: {e}")
            return "error"
    
    # 使用统一的并发工具
    check_results = process_concurrently(
        account_list,
        check_single_account,
        max_workers=min(5, len(account_list))
    )
    
    # 统计结果
    for result in check_results:
        if result == "valid":
            results["valid"] += 1
        elif result == "relogin":
            results["relogin"] += 1
            results["checked"] += 1
        elif result == "skipped":
            results["skipped"] += 1
            results["checked"] += 1
    
    logger.info(
        f"登录态检查完成 - 检查: {results['checked']}, "
        f"触发补登录: {results['relogin']}, 正常: {results['valid']}, 跳过: {results['skipped']}"
    )


def check_ths_cookie_valid(ths_account: str) -> bool:
    """检查同花顺Cookie是否有效。

    直接委托给统一的 Session 校验方法 validate_session，避免重复读取和解析 Session。
    """
    try:
        return ths_login_service.validate_session(ths_account)
    except Exception as e:
        logger.error(f"检查Cookie有效性失败: {e}")
        return False


async def send_relogin_success_notification(user_id: int, ths_account: str, nickname: str = None):
    """发送补登录成功通知
    
    Args:
        user_id: 系统用户ID
        ths_account: 同花顺账号
        nickname: 账号昵称（可选）
    """
    from app.services.user.user_service import user_service
    
    try:
        pushplus_token = auto_relogin_service.get_system_config("pushplus_token")
        if pushplus_token:
            # 获取用户的好友令牌（必须有好友令牌才推送）
            user = user_service.find_user_by_id(user_id)
            friend_token = user.pushplus_friend_token if user else None
            
            if friend_token:
                display_name = nickname or ths_account
                await auto_relogin_service._send_pushplus_notification(
                    token=pushplus_token,
                    title=f"【同花顺】{display_name} 登录成功",
                    content="自动补登录成功，系统将继续为您推送计算结果",
                    friend_token=friend_token
                )
    except Exception as e:
        logger.error(f"发送成功通知失败: {e}")
