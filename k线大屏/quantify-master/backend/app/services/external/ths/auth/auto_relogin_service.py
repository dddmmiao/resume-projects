"""
自动补登录服务
负责管理用户的自动补登录流程
"""

import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from loguru import logger

from app.services.core.cache_service import cache_service
from app.services.core.user_cache_keys import user_cache_keys
from .login_service import ths_login_service
# 去重配置
_RELOGIN_DEDUP_SECONDS = 1800  # 30分钟内同一账号不重复发送消息
_RELOGIN_DEDUP_KEY_PREFIX = "relogin:dedup:"  # Redis key 前缀


class AutoReloginService:
    """自动补登录服务"""
    
    @staticmethod
    def _try_acquire_dedup(ths_account: str) -> bool:
        """尝试获取去重锁（原子操作）
        
        使用Redis的SETNX原子操作，解决并发环境下的竞态条件问题。
        
        Returns:
            True: 获取成功，可以触发补登录
            False: 获取失败，最近30分钟内已触发过
        """
        from app.services.core.cache_service import cache_service
        key = f"{_RELOGIN_DEDUP_KEY_PREFIX}{ths_account}"
        # 使用原子操作 set_nx，同时检查并设置去重标记
        return cache_service.set_nx(key, "1", ttl_seconds=_RELOGIN_DEDUP_SECONDS)
    
    @staticmethod
    def should_trigger_relogin(ths_account: str, check_dedup: bool = True) -> tuple[bool, Optional[Any], Optional[Any], str]:
        """检查是否应该触发补登录
        
        统一的检查逻辑，供装饰器和定时任务共用。
        
        Args:
            ths_account: 同花顺账号
            check_dedup: 是否检查去重（30分钟内不重复触发）
            
        Returns:
            (should_trigger, user, ths_account_obj, skip_reason)
            - should_trigger: 是否应该触发
            - user: User 对象（如果应该触发）
            - ths_account_obj: ThsAccount 对象（如果应该触发）
            - skip_reason: 跳过原因（如果不应该触发）
        """
        from app.dao.ths_account_dao import ths_account_dao
        from app.dao.user_dao import user_dao
        from app.services.core.system_config_service import system_config_service
        
        # 1. 系统级开关检查
        if not system_config_service.is_auto_relogin_enabled():
            return False, None, None, "系统未启用自动补登录"
        
        # 2. 获取账号对象
        ths_account_obj = ths_account_dao.find_by_ths_account(ths_account)
        if not ths_account_obj or not ths_account_obj.user_id:
            return False, None, None, "未找到账号对应的用户"
        
        # 3. 账号级开关检查
        if not ths_account_obj.auto_relogin_enabled:
            return False, None, None, "账号未开启自动补登录"
        
        # 4. 登录方式检查
        enabled_methods = system_config_service.get_enabled_login_methods()
        if not ths_account_obj.last_login_method or ths_account_obj.last_login_method not in enabled_methods:
            return False, None, None, f"登录方式 {ths_account_obj.last_login_method} 未开启"
        
        # 5. 最近登录账号检查
        user_id = ths_account_obj.user_id
        if not ths_account_dao.is_most_recent_account(ths_account, user_id):
            return False, None, None, "不是最近登录的账号"
        
        # 6. 获取用户对象
        user = user_dao.find_by_id(user_id)
        if not user:
            return False, None, None, "未找到用户"
        
        # 7. 去重检查（使用Redis原子操作，解决并发竞态条件）
        # 将去重检查放在最后，避免其他检查失败时设置了去重标记
        if check_dedup and not AutoReloginService._try_acquire_dedup(ths_account):
            return False, None, None, "最近已触发，去重跳过"
        
        return True, user, ths_account_obj, ""
    
    @staticmethod
    def get_system_config(key: str, default: str = "") -> str:
        """获取补登录系统配置（代理到 SystemConfigService）
        
        Args:
            key: 配置键名
            default: 默认值
            
        Returns:
            配置值
        """
        from app.services.core.system_config_service import system_config_service
        return system_config_service.get(key, default)
    
    @staticmethod
    def set_system_config(key: str, value: str):
        """设置补登录系统配置（代理到 SystemConfigService）
        
        Args:
            key: 配置键名
            value: 配置值
        """
        from app.services.core.system_config_service import system_config_service
        system_config_service.set(key, value)
        logger.info(f"设置系统配置: {key} = {value}")
    
    @staticmethod
    def _build_relogin_key(user_id: int, ths_account: str) -> str:
        """构建补登录状态的 Redis key"""
        return user_cache_keys.ths_relogin_state(user_id, ths_account)
    
    @staticmethod
    def get_relogin_state(user_id: int, ths_account: str) -> Optional[Dict[str, Any]]:
        """获取用户的补登录状态
        
        Args:
            user_id: 系统用户ID
            ths_account: 同花顺账号
            
        Returns:
            补登录状态字典，不存在则返回None
        """
        if not cache_service.redis_client:
            return None
        
        key = AutoReloginService._build_relogin_key(user_id, ths_account)
        state_json = cache_service.redis_client.get(key)
        if state_json:
            return json.loads(state_json)
        return None
    
    @staticmethod
    def set_relogin_state(user_id: int, ths_account: str, state: Dict[str, Any], ttl_seconds: int = 3600):
        """设置用户的补登录状态
        
        Args:
            user_id: 系统用户ID
            ths_account: 同花顺账号
            state: 补登录状态字典
            ttl_seconds: 过期时间（秒）
        """
        if cache_service.redis_client:
            key = AutoReloginService._build_relogin_key(user_id, ths_account)
            cache_service.redis_client.setex(
                key,
                ttl_seconds,
                json.dumps(state, ensure_ascii=False)
            )
    
    @staticmethod
    def delete_relogin_state(user_id: int, ths_account: str):
        """删除用户的补登录状态
        
        Args:
            user_id: 系统用户ID
            ths_account: 同花顺账号
        """
        if cache_service.redis_client:
            key = AutoReloginService._build_relogin_key(user_id, ths_account)
            cache_service.redis_client.delete(key)
    
    @staticmethod
    async def handle_login_success(ths_account: str, nickname: str = None):
        """处理登录成功（检查是否是补登录，发送成功通知）
        
        在QR/SMS登录成功时调用，检查是否有进行中的补登录状态，
        如果有则更新状态并发送成功通知。
        
        Args:
            ths_account: 同花顺账号
            nickname: 昵称（用于通知显示）
        """
        from app.dao.ths_account_dao import ths_account_dao
        from app.services.user.user_service import user_service
        
        # 获取账号对应的用户
        ths_account_obj = ths_account_dao.find_by_ths_account(ths_account)
        if not ths_account_obj or not ths_account_obj.user_id:
            return
        
        user_id = ths_account_obj.user_id
        
        # 检查是否有进行中的补登录状态
        state = AutoReloginService.get_relogin_state(user_id, ths_account)
        if not state or state.get("status") not in ["pending", "waiting_user"]:
            return
        
        # 更新状态为成功
        state["status"] = "success"
        AutoReloginService.set_relogin_state(user_id, ths_account, state)
        
        # 发送成功通知（仅当用户配置了好友令牌时）
        pushplus_token = AutoReloginService.get_system_config("pushplus_token")
        if pushplus_token:
            # 获取用户的好友令牌
            user = user_service.find_user_by_id(user_id)
            friend_token = user.pushplus_friend_token if user else None
            
            # 必须有好友令牌才推送给用户
            if friend_token:
                display_name = nickname or ths_account_obj.nickname or ths_account
                await AutoReloginService._send_pushplus_notification(
                    token=pushplus_token,
                    title=f"【同花顺】{display_name} 补登录成功",
                    content="同花顺账号登录成功，系统将继续为您推送计算结果",
                    friend_token=friend_token
                )
                logger.info(f"补登录成功通知已发送: {ths_account}")
    
    @staticmethod
    async def trigger_auto_relogin(user, ths_account_obj) -> Dict[str, Any]:
        """触发自动补登录（使用上次登录方式）
        
        Args:
            user: User对象（系统用户）
            ths_account_obj: ThsAccount对象（要补登录的同花顺账号）
            
        Returns:
            触发结果
        """
        # 根据上次登录方式选择补登录路径
        method = ths_account_obj.last_login_method
        return await AutoReloginService.trigger_relogin_with_method(user, ths_account_obj, method)
    
    @staticmethod
    async def trigger_relogin_with_method(user, ths_account_obj, method: str) -> Dict[str, Any]:
        """触发补登录（指定登录方式）- 内部使用，已有ThsAccount对象
        
        Args:
            user: User对象（系统用户）
            ths_account_obj: ThsAccount对象（要补登录的同花顺账号）
            method: 登录方式 sms/qr/password
            
        Returns:
            触发结果
        """
        ths_account = ths_account_obj.ths_account
        
        # 检查是否已有进行中的补登录
        existing_state = AutoReloginService.get_relogin_state(user.id, ths_account)
        if existing_state and existing_state.get("status") in ["pending", "waiting_user"]:
            logger.info(f"用户 {user.username} 的同花顺账号 {ths_account} 已有进行中的补登录任务")
            return {"success": False, "message": "已有进行中的补登录任务"}
        
        if method == "qr":
            return await AutoReloginService.send_qr_relogin_notification(user, ths_account_obj)
        elif method == "sms":
            return await AutoReloginService.send_sms_relogin_notification(user, ths_account_obj)
        elif method == "password":
            return await AutoReloginService.password_auto_relogin(user, ths_account_obj)
        else:
            logger.warning(f"同花顺账号 {ths_account} 的登录方式 {method} 不支持自动补登录")
            return {"success": False, "message": f"登录方式 {method} 不支持自动补登录"}
    
    @staticmethod
    async def trigger_manual_relogin(user, ths_account: str, method: str) -> Dict[str, Any]:
        """手动触发补登录（API调用入口）
        
        Args:
            user: User对象（系统用户）
            ths_account: 同花顺账号字符串
            method: 登录方式 sms/qr
            
        Returns:
            触发结果
        """
        from app.dao.ths_account_dao import ths_account_dao
        
        # 验证方式
        if method not in ("sms", "qr"):
            return {"success": False, "message": "仅支持 sms 或 qr 方式"}
        
        # 通过 DAO 获取同花顺账号
        ths_account_obj = ths_account_dao.find_by_ths_account_and_user(ths_account, user.id)
        if not ths_account_obj:
            return {"success": False, "message": "未找到同花顺账号"}
        
        # 检查 PushPlus Token
        pushplus_token = AutoReloginService.get_system_config("pushplus_token")
        if not pushplus_token:
            return {"success": False, "message": "未配置PushPlus Token"}
        
        # 调用内部方法
        return await AutoReloginService.trigger_relogin_with_method(user, ths_account_obj, method)
    
    @staticmethod
    async def send_qr_relogin_notification(user, ths_account_obj) -> Dict[str, Any]:
        """发送二维码补登录推送通知
        
        只创建状态并发送推送通知，用户在页面主动获取二维码
        
        Args:
            user: User对象
            ths_account_obj: ThsAccount对象
            
        Returns:
            补登录结果
        """
        user_id = user.id
        ths_account = ths_account_obj.ths_account
        timeout_minutes = int(AutoReloginService.get_system_config("relogin_timeout_minutes", "10"))
        
        try:
            # 创建补登录状态（不预先创建二维码会话）
            state = {
                "status": "waiting_user",
                "method": "qr",
                "user_id": user_id,
                "username": user.username,
                "ths_account": ths_account,
                "nickname": ths_account_obj.nickname or ths_account,
                "retry_count": 0,
                "started_at": datetime.now().isoformat(),
                "timeout_at": (datetime.now() + timedelta(minutes=timeout_minutes)).isoformat()
            }
            AutoReloginService.set_relogin_state(user_id, ths_account, state, ttl_seconds=timeout_minutes * 60)
            
            # 只发送推送通知，用户在页面主动获取二维码（仅当用户配置了好友令牌时）
            pushplus_token = AutoReloginService.get_system_config("pushplus_token")
            friend_token = getattr(user, 'pushplus_friend_token', None)
            if pushplus_token and friend_token:
                web_url = AutoReloginService._get_web_url()
                relogin_url = f"{web_url}/relogin?username={user.username}&account={ths_account}"
                
                nickname = ths_account_obj.nickname or ths_account
                await AutoReloginService._send_pushplus_notification(
                    token=pushplus_token,
                    title=f"【同花顺】{nickname} 登录态失效",
                    content=f"检测到您的同花顺账号登录态已失效<br>"
                           f"请在 {timeout_minutes} 分钟内点击链接扫码登录<br><br>"
                           f"<a href=\"{relogin_url}\">👉 点击此处扫码登录</a>",
                    friend_token=friend_token
                )
            
            logger.info(f"用户 {user.username} 的微信扫码补登录推送已发送: {ths_account}")
            return {"success": True, "message": "推送已发送，等待用户操作"}
            
        except Exception as e:
            logger.error(f"微信扫码补登录失败: {e}")
            state = {
                "status": "failed",
                "method": "qr",
                "error_message": str(e)
            }
            AutoReloginService.set_relogin_state(user_id, ths_account, state)
            return {"success": False, "message": str(e)}
    
    @staticmethod
    async def send_sms_relogin_notification(user, ths_account_obj) -> Dict[str, Any]:
        """发送短信补登录推送通知
        
        只创建状态并发送推送通知，用户在页面主动发送验证码
        
        Args:
            user: User对象
            ths_account_obj: ThsAccount对象
            
        Returns:
            补登录结果
        """
        user_id = user.id
        ths_account = ths_account_obj.ths_account
        timeout_minutes = int(AutoReloginService.get_system_config("relogin_timeout_minutes", "10"))
        
        # 使用 ThsAccount 绑定的手机号
        mobile = ths_account_obj.mobile
        if not mobile:
            return {"success": False, "message": "账号未绑定手机号"}
        
        try:
            # 创建补登录状态（不预先发送短信）
            state = {
                "status": "waiting_user", 
                "method": "sms",
                "user_id": user_id,
                "username": user.username,
                "ths_account": ths_account,
                "nickname": ths_account_obj.nickname or ths_account,
                "mobile": mobile,
                "retry_count": 0,
                "started_at": datetime.now().isoformat(),
                "timeout_at": (datetime.now() + timedelta(minutes=timeout_minutes)).isoformat()
            }
            AutoReloginService.set_relogin_state(user_id, ths_account, state, ttl_seconds=timeout_minutes * 60)
            
            # 只发送推送通知，用户在页面主动发送验证码（仅当用户配置了好友令牌时）
            pushplus_token = AutoReloginService.get_system_config("pushplus_token")
            friend_token = getattr(user, 'pushplus_friend_token', None)
            if pushplus_token and friend_token:
                web_url = AutoReloginService._get_web_url()
                relogin_url = f"{web_url}/relogin?username={user.username}&account={ths_account}"
                
                nickname = ths_account_obj.nickname or ths_account
                await AutoReloginService._send_pushplus_notification(
                    token=pushplus_token,
                    title=f"【同花顺】{nickname} 登录态失效",
                    content=f"检测到您的同花顺账号登录态已失效<br>"
                           f"请在 {timeout_minutes} 分钟内点击链接完成验证<br><br>"
                           f"<a href=\"{relogin_url}\">👉 点击此处完成验证</a>",
                    friend_token=friend_token
                )
            
            logger.info(f"用户 {user.username} 的短信验证码补登录推送已发送: {ths_account}")
            return {"success": True, "message": "推送已发送，等待用户操作"}
            
        except Exception as e:
            logger.error(f"短信验证码补登录失败: {e}")
            state = {
                "status": "failed",
                "method": "sms",
                "error_message": str(e)
            }
            AutoReloginService.set_relogin_state(user_id, ths_account, state)
            return {"success": False, "message": str(e)}
    
    @staticmethod
    async def password_auto_relogin(user, ths_account_obj) -> Dict[str, Any]:
        """账号密码自动补登录（全自动，无需用户干预）
        
        Args:
            user: User对象
            ths_account_obj: ThsAccount对象
            
        Returns:
            补登录结果
        """
        user_id = user.id
        ths_account = ths_account_obj.ths_account
        
        # 从 ThsAccount 获取加密存储的密码并解密
        from app.utils.auth import decrypt_password
        
        encrypted_password = getattr(ths_account_obj, 'encrypted_password', None)
        if not encrypted_password:
            logger.warning(f"同花顺账号 {ths_account} 未配置密码，无法自动补登录")
            return {"success": False, "message": "未配置密码"}
        
        password = decrypt_password(encrypted_password)
        if not password:
            logger.error(f"同花顺账号 {ths_account} 密码解密失败")
            return {"success": False, "message": "密码解密失败"}
        
        try:
            # 创建补登录状态
            state = {
                "status": "pending",
                "method": "password",
                "user_id": user_id,
                "started_at": datetime.now().isoformat()
            }
            AutoReloginService.set_relogin_state(user_id, ths_account, state)
            
            # 直接调用密码登录（同步操作）
            result = ths_login_service.login_with_password(
                user_id=user_id,
                username=ths_account,
                password=password
            )
            
            if result.get("success"):
                state["status"] = "success"
                AutoReloginService.set_relogin_state(user_id, ths_account, state)
                
                # 发送成功通知（仅当用户配置了好友令牌时）
                pushplus_token = AutoReloginService.get_system_config("pushplus_token")
                friend_token = getattr(user, 'pushplus_friend_token', None)
                if pushplus_token and friend_token:
                    nickname = ths_account_obj.nickname or ths_account
                    await AutoReloginService._send_pushplus_notification(
                        token=pushplus_token,
                        title=f"【同花顺】{nickname} 自动补登录成功",
                        content="系统已自动完成登录，无需您操作",
                        friend_token=friend_token
                    )
                
                logger.info(f"用户 {user.username} 的密码补登录成功: {ths_account}")
                return {"success": True, "message": "自动补登录成功"}
            else:
                raise Exception(result.get("message", "登录失败"))
            
        except Exception as e:
            logger.error(f"密码补登录失败: {e}")
            state["status"] = "failed"
            state["error_message"] = str(e)
            AutoReloginService.set_relogin_state(user_id, ths_account, state)
            return {"success": False, "message": str(e)}
    
    @staticmethod
    def _get_web_url() -> str:
        """动态获取Web前端地址
        
        优先级：
        1. 环境变量 WEB_URL
        2. 自动获取服务器IP + 前端端口
        """
        import os
        import socket
        
        # 优先使用环境变量
        web_url = os.getenv('WEB_URL')
        if web_url:
            return web_url.rstrip('/')
        
        # 自动获取服务器IP
        try:
            # 获取本机IP（连接外部服务时使用的IP）
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
        except Exception:
            ip = "localhost"
        
        # 前端端口，默认3000
        frontend_port = os.getenv('FRONTEND_PORT', '3000')
        
        return f"http://{ip}:{frontend_port}"
    
    @staticmethod
    async def _send_pushplus_notification(token: str, title: str, content: str, friend_token: str = None):
        """发送PushPlus HTML通知
        
        Args:
            token: 管理员的PushPlus Token
            title: 消息标题
            content: 消息内容（HTML格式）
            friend_token: 好友令牌，如果与token相同则使用一对一模式，否则使用好友消息模式
        """
        import httpx
        
        # 必须有好友令牌才发送
        if not friend_token:
            logger.debug(f"未配置好友令牌，跳过推送: {title}")
            return
        
        # 添加时间戳避免 PushPlus 重复内容拦截
        timestamp = datetime.now().strftime("%H:%M:%S")
        content_with_ts = f"{content}<br><small style=\"color:#999\">时间: {timestamp}</small>"
        
        try:
            # 判断消息模式：friend_token == token 时使用一对一模式，否则使用好友消息模式
            is_self_message = (friend_token == token)
            
            payload = {
                "token": token,
                "title": title,
                "content": content_with_ts,
                "template": "html",
            }
            
            # 好友消息模式需要指定 to 参数
            if not is_self_message:
                payload["to"] = friend_token
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://www.pushplus.plus/send",
                    json=payload,
                    timeout=10
                )
                response.raise_for_status()
                result = response.json()
                if result.get("code") == 200:
                    mode = "一对一" if is_self_message else "好友"
                    logger.info(f"PushPlus通知已发送({mode}模式): {title}")
                else:
                    logger.warning(f"PushPlus返回错误: {result}")
        except Exception as e:
            logger.error(f"发送PushPlus通知失败: {e}")


# 全局实例
auto_relogin_service = AutoReloginService()
