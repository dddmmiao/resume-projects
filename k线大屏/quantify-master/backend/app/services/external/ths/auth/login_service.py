"""
同花顺登录服务
提供三种登录方式：二维码、短信验证码、用户名密码
登录成功后自动存储 Cookie 和用户信息到 Redis
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Literal, List, Tuple, Iterator

from loguru import logger

from app.services.core.cache_service import cache_service
from app.services.core.user_cache_keys import user_cache_keys
from .methods.password import TongHuaShunLogin
from ..core.constants import ThsValidationError, ThsNetworkError

LoginMethod = Literal["qr", "sms", "password", "cookie"]


class ThsLoginService:
    """同花顺登录服务"""
    
    # Cookie 过期时间（7天）
    COOKIE_TTL = 7 * 24 * 60 * 60
    # 扫描所有同花顺 Session 使用的通配符模式
    THS_SESSION_SCAN_PATTERN = user_cache_keys.THS_SESSION_SCAN_PATTERN
    
    def __init__(self):
        # 运行时输出目录（二维码图片/临时结果等），不应纳入版本控制
        self.output_dir = Path(__file__).resolve().parent / "output"
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def _build_session_key(ths_account: str) -> str:
        """构建 session 缓存 key（以ths_account为主标识）"""
        return user_cache_keys.ths_session(ths_account)

    def _scan_ths_keys(self, match_pattern: str) -> Iterator[str]:
        """扫描同花顺相关的Redis缓存键
        
        Args:
            match_pattern: SCAN 命令使用的匹配模式
            
        Yields:
            str: 匹配的缓存键
        """
        seen = set()
        try:
            if not cache_service.redis_client:
                logger.warning("Redis 连接不可用，无法扫描 keys")
                return

            # 使用 SCAN 命令迭代 keys，避免 KEYS * 阻塞
            for key in cache_service.redis_client.scan_iter(match=match_pattern, count=100):
                if not key:
                    continue

                # 去重
                if key in seen:
                    continue
                seen.add(key)

                yield key

        except Exception as e:
            logger.error(f"扫描 Redis keys 失败 (pattern={match_pattern}): {e}")

    def list_accounts_with_cookies(self) -> List[str]:
        """枚举当前所有已在 Redis 中保存了 THS Cookie 的账号列表。

        Returns:
            List[str]: [ths_account, ...]
        """
        result: List[str] = []
        
        for key in self._scan_ths_keys(self.THS_SESSION_SCAN_PATTERN):
            # 使用统一的解析方法
            ths_account = user_cache_keys.parse_ths_session_key(key)
            if not ths_account:
                continue
            
            # 会话数据由本服务通过 cache_service.set_json 写入，约定为 dict 结构
            session = cache_service.get_json(key)
            if not session:
                continue

            cookies = session.get("cookies")
            if cookies:
                result.append(ths_account)
        
        return result
    
    def validate_cookies_with_simple_info(self, cookies: Dict[str, str]) -> Dict[str, Any]:
        """使用同花顺 simple_info 接口校验 Cookie 是否有效。

        成功时返回完整的响应数据（包含 status_code / data 等字段）；
        业务失败（例如 Cookie 失效）会抛出 ThsValidationError；
        网络相关异常会抛出 ThsNetworkError。
        """
        import requests

        validate_url = "https://t.10jqka.com.cn/user_center/open/api/user/v1/simple_info"
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

        headers = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": user_agent,
        }

        try:
            resp = requests.get(
                validate_url,
                headers=headers,
                cookies=cookies,
                timeout=10,
            )
        except requests.RequestException as e:
            logger.error(f"调用同花顺 simple_info 接口失败: {e}")
            raise ThsNetworkError(str(e))

        try:
            data = resp.json()
        except Exception as e:
            logger.error(f"解析 simple_info 响应失败: {e}")
            raise ThsNetworkError("Cookie 验证响应解析失败")

        if data.get("status_code") != 0:
            error_msg = data.get("status_msg", "Cookie 无效或已过期")
            raise ThsValidationError(error_msg)

        return data
    
    def check_login_status(self, ths_account: str) -> bool:
        """检查同花顺账号是否已登录
        
        Args:
            ths_account: 同花顺账号标识
            
        Returns:
            bool: 是否有有效session
        """
        session_key = self._build_session_key(ths_account)
        return cache_service.exists(session_key)
    
    def has_valid_session(self, ths_account: str) -> bool:
        """检查是否有有效session（check_login_status的别名）"""
        return self.check_login_status(ths_account)
    
    def validate_session(self, ths_account: str) -> bool:
        """校验当前 Session 是否仍然有效。

        从 Redis 读取 session 信息，提取 cookies 后复用 simple_info 校验逻辑。
        校验失败时会视为未登录，并清理失效的 Session；网络异常则记录日志并返回 False。
        """
        session_key = self._build_session_key(ths_account)
        session = cache_service.get_json(session_key)
        cookies = session.get("cookies", {}) if session else None

        if not cookies:
            logger.debug(f"THS 账号 {ths_account} 没有 Cookie，视为未登录")
            return False

        try:
            # 成功即代表当前 Cookie 仍然有效
            self.validate_cookies_with_simple_info(cookies)
            return True
        except ThsValidationError as e:
            # 业务校验失败：Cookie 已失效，清理 Session
            logger.debug(f"THS 账号 {ths_account} Cookie 校验失败: {e}")
            cache_service.delete(session_key)
            return False
        except ThsNetworkError as e:
            # 网络异常：记录告警，返回 False，等待下次定时任务或用户重新登录
            logger.warning(f"THS 账号 {ths_account} 校验网络异常: {e}")
            return False
    
    def store_login_result(
        self, 
        result: Dict[str, Any], 
        login_method: str = "qr", 
        mobile: Optional[str] = None,
        password: Optional[str] = None
    ) -> str:
        """
        存储登录结果到 Redis 和数据库
        
        Args:
            result: 登录结果（包含cookies、user_info、headers）
            login_method: 登录方式
            mobile: 手机号（短信登录时传入）
            password: 明文密码（密码登录时传入，会加密存储）
        
        Returns:
            str: 同花顺账号标识（uid字符串），用于Redis key和数据库ths_account字段
        """
        cookies = result.get("cookies", {})
        user_info = result.get("user_info", {})
        headers = result.get("headers", {})
        
        if not cookies:
            raise ValueError("登录结果中没有 cookies")
        
        # 使用专用映射器处理同花顺字段映射
        from .user_info_mapper import ThsUserInfoMapper
        
        try:
            mapped_info = ThsUserInfoMapper.map_user_info(user_info)
            ths_account = mapped_info.ths_account  # uid字符串，作为稳定标识
            ths_uid = mapped_info.ths_uid          # uid数值，用于User-Agent等
            nickname = mapped_info.nickname        # 昵称，用于展示
        except ValueError as e:
            raise ValueError(f"同花顺用户信息映射失败: {e}")
        
        # 合并为一个session key存储所有登录相关数据
        session_data = {
            "cookies": cookies,
            "user_info": user_info,  # 保留原始THS user_info，包含nickname等
            "headers": headers,
            "ths_uid": ths_uid,      # THS用户ID数值
            "login_method": login_method,
            "login_at": datetime.now().isoformat()
        }
        
        # 使用 ths:session:{ths_account} 格式存储（以ths_account为主标识）
        session_key = self._build_session_key(ths_account)
        cache_service.set_json(
            session_key,
            session_data,
            ttl_seconds=self.COOKIE_TTL
        )
        logger.debug(f"Session 已存储: {session_key}")
        
        if ths_uid:
            logger.info(f"同花顺登录成功，账号：{ths_account}，昵称：{nickname}，ths_uid：{ths_uid}")
        else:
            logger.warning(f"同花顺登录成功，账号：{ths_account}，昵称：{nickname}，但未获取到 ths_uid")
        
        try:
            self._upsert_user_record(ths_account, user_info, login_method, mobile, password)
        except Exception as e:
            logger.error(f"创建/更新ThsAccount记录失败: {e}")
        
        return ths_account
    
    def _upsert_user_record(
        self, 
        ths_account: str, 
        user_info: Dict[str, Any], 
        login_method: str, 
        mobile: Optional[str] = None,
        password: Optional[str] = None
    ):
        """
        在数据库中创建或更新ThsAccount记录
        
        注意：此方法只更新已存在的ThsAccount，不创建新账号
        新账号需要通过前端ThsAccountTags组件创建并绑定到User
        
        Args:
            ths_account: 同花顺账号
            user_info: 用户信息
            login_method: 登录方式 (qr/sms/password)
            mobile: 手机号（短信登录时传入）
            password: 明文密码（密码登录时传入，会加密存储）
        """
        from app.dao.ths_account_dao import ths_account_dao
        
        # 提取昵称
        nickname = user_info.get("nickname")
        
        # 处理加密密码
        encrypted_password = None
        if password and login_method == "password":
            from app.utils.auth import encrypt_password
            encrypted_password = encrypt_password(password)
        
        # 使用DAO层更新登录信息
        updated_count = ths_account_dao.update_login_info(
            ths_account=ths_account,
            nickname=nickname,
            mobile=mobile,
            login_method=login_method,
            encrypted_password=encrypted_password
        )
        
        if updated_count > 0:
            logger.info(f"更新ThsAccount记录: {ths_account} (共{updated_count}条)")
        else:
            # 不自动创建ThsAccount，只记录日志
            # ThsAccount必须通过前端ThsAccountTags手动创建并绑定到User
            logger.warning(f"同花顺账号 {ths_account} 登录成功，但未找到对应的ThsAccount记录，请在前端绑定")
    
    def login_with_password(
        self,
        user_id: int,
        username: str,
        password: str
    ) -> Dict[str, Any]:
        """
        用户名密码登录
        
        Args:
            user_id: 系统用户ID
            username: 用户名
            password: 密码
        
        Returns:
            {"success": True, "username": "ths_account标识", "user_info": {...}}
        """
        try:
            login_client = TongHuaShunLogin(user=username, password=password)
            result = login_client.start()
            ths_account = self.store_login_result(
                result, 
                user_id=user_id, 
                login_method="password",
                password=password  # 传递密码用于加密存储
            )
            
            return {
                "success": True,
                "username": ths_account,  # 返回ths_account标识
                "user_info": result.get("user_info", {})
            }
        except Exception as e:
            logger.error(f"用户名密码登录失败: {e}")
            raise
    
    def login_with_cookies(
        self,
        user_id: int,
        ths_account: Optional[str],
        cookies: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        通过 Cookie 字符串登录（手动配置 Cookie）
        
        会使用提供的 Cookie 调用同花顺用户信息接口验证有效性并获取用户信息，
        然后像正常登录一样存储到 Redis 和数据库。
        
        Args:
            user_id: 系统用户ID
            ths_account: 同花顺账号标识
            cookies: Cookie 字典
        
        Returns:
            {"success": True, "ths_account": "账号标识", "user_info": {...}}
        """
        try:
            # 1. 使用统一的 simple_info 校验方法验证 Cookie 并获取用户信息
            data = self.validate_cookies_with_simple_info(cookies)

            # 获取用户信息（验证成功时应该返回包含 uid 的用户信息）
            user_info = data.get("data", {})

            # 构建登录结果（与其他登录方式一致，交给 store_login_result 统一处理）
            result = {
                "cookies": cookies,
                "user_info": user_info,
                "headers": {},
            }

            # 存储到 Redis 和数据库（由 store_login_result 统一提取用户标识）
            ths_account = self.store_login_result(
                result,
                user_id=user_id,
                login_method="cookie",
            )

            return {
                "success": True,
                "ths_account": ths_account,
                "user_info": user_info,
            }
        except ThsValidationError:
            # 业务错误直接抛出，由上层决定返回内容
            raise
        except ThsNetworkError:
            # simple_info 请求相关的网络异常
            raise
        except Exception as e:
            logger.error(f"Cookie 登录失败: {e}")
            raise
    
    def get_session(self, ths_account: str) -> Optional[Dict[str, Any]]:
        """获取完整的session数据"""
        session_key = self._build_session_key(ths_account)
        return cache_service.get_json(session_key)
    
    def get_cookies(self, ths_account: str) -> Dict[str, Any]:
        """获取cookies"""
        session = self.get_session(ths_account)
        return session.get("cookies", {}) if session else {}
    
    def get_user_info(self, ths_account: str) -> Optional[Dict[str, Any]]:
        """获取用户信息"""
        session = self.get_session(ths_account)
        return session.get("user_info") if session else None
    

    def list_relogin_states(self) -> List[Tuple[int, str, Dict[str, Any]]]:
        """枚举当前所有正在进行的补登录任务状态。

        Returns:
            List[Tuple[int, str, Dict]]: [(user_id, ths_account, state_dict), ...]
        """
        result: List[Tuple[int, str, Dict[str, Any]]] = []
        pattern = user_cache_keys.THS_RELOGIN_SCAN_PATTERN

        for key in self._scan_ths_keys(pattern):
            # 使用统一的解析方法
            parsed = user_cache_keys.parse_ths_relogin_key(key)
            if not parsed:
                continue
            
            user_id, ths_account = parsed
            state_bytes = cache_service.redis_client.get(key)
            if not state_bytes:
                continue

            # Redis get 默认返回 bytes，这里直接按 bytes 解码
            state_json = state_bytes.decode("utf-8")

            try:
                state = json.loads(state_json)
                result.append((user_id, ths_account, state))
            except json.JSONDecodeError:
                continue

        return result
    
    def logout(self, ths_account: str) -> bool:
        """
        清除指定同花顺账号的登录会话和Cookies
        
        Args:
            ths_account: 同花顺账号标识
            
        Returns:
            是否清除成功
        """
        try:
            # 构建会话键
            session_key = self._build_session_key(ths_account)
            
            # 删除会话数据
            cache_service.delete(session_key)
            
            logger.info(f"清除同花顺账号 {ths_account} 登录会话")
            return True
            
        except Exception as e:
            logger.error(f"清除登录会话失败: {e}")
            return False
    
# 全局单例
ths_login_service = ThsLoginService()
