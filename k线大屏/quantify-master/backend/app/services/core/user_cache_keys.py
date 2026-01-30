"""
用户相关缓存键统一管理
集中管理所有用户、同花顺账号、邀请码相关的缓存键，避免在业务层硬编码
"""

import re
from typing import List, Tuple, Optional
from loguru import logger


class UserCacheKeys:
    """用户相关缓存键管理类"""
    
    # 用户缓存键解析正则表达式：user:{user_id}:ths:{key_type}:{ths_account}
    _USER_CACHE_KEY_PATTERN = re.compile(r'^user:(\d+):ths:([^:]+):(.+)$')
    
    # ========== 用户基础信息缓存键 ==========
    
    @staticmethod
    def user_profile(user_id: int) -> str:
        """用户档案信息缓存键"""
        return f"user:{user_id}:profile"
    
    @staticmethod
    def user_by_username(username: str) -> str:
        """根据用户名查询用户缓存键"""
        return f"user:by_username:{username}"
    
    # ========== 同花顺账号相关缓存键 ==========
    
    @staticmethod
    def ths_account_ids(user_id: int) -> str:
        """用户同花顺账号ID列表缓存键"""
        return f"user:{user_id}:ths:account_ids"
    
    # ========== 同花顺登录会话相关缓存键 ==========
    
    @staticmethod
    def ths_session(ths_account: str) -> str:
        """同花顺登录会话缓存键（以ths_account为主标识）"""
        return f"ths:session:{ths_account}"
    
    @staticmethod
    def ths_relogin_state(user_id: int, ths_account: str) -> str:
        """同花顺补登录状态缓存键"""
        return f"user:{user_id}:ths:relogin:{ths_account}"
    
    # ========== 二维码登录会话缓存键 ==========
    
    # QR会话键前缀（用于统一管理）
    QR_SESSION_PREFIX = "ths:qr_session:"
    QR_SESSION_TTL = 300  # 5分钟过期
    
    @staticmethod
    def qr_session(session_id: str) -> str:
        """二维码登录会话缓存键"""
        return f"ths:qr_session:{session_id}"
    
    # ========== 系统配置缓存键 ==========
    
    SYSTEM_CONFIG_PREFIX = "system:config:"
    
    @staticmethod
    def system_config(key: str) -> str:
        """系统配置缓存键（永久存储）"""
        return f"system:config:{key}"
    
    # ========== PushPlus 推送服务缓存键 ==========
    
    PUSHPLUS_QRCODE_KEY = "pushplus:qrcode"
    PUSHPLUS_QRCODE_TTL = 25 * 24 * 3600  # 25天（比二维码30天有效期短）
    
    @staticmethod
    def pushplus_qrcode() -> str:
        """PushPlus 二维码缓存键"""
        return "pushplus:qrcode"
    
    # ========== 批量缓存键清理方法 ==========
    
    @staticmethod
    def user_all_cache_patterns(user_id: int) -> List[str]:
        """获取用户所有相关缓存的模式列表，用于批量清理"""
        return [
            f"user:{user_id}:*",  # 用户所有缓存
        ]
    
    @staticmethod
    def user_profile_cache_patterns(user_id: int, username: str = None) -> List[str]:
        """获取用户档案相关缓存的模式列表"""
        patterns = [
            UserCacheKeys.user_profile(user_id),
        ]
        if username:
            patterns.append(UserCacheKeys.user_by_username(username))
        return patterns
    
    # ========== 扫描模式常量 ==========
    
    # 用于扫描所有同花顺会话的模式（新格式：以ths_account为主标识）
    THS_SESSION_SCAN_PATTERN = "ths:session:*"
    
    # 用于扫描所有同花顺补登录状态的模式
    THS_RELOGIN_SCAN_PATTERN = "user:*:ths:relogin:*"
    
    # 用于扫描所有用户相关缓存的模式
    USER_ALL_SCAN_PATTERN = "user:*"
    
    # ========== 缓存键解析方法 ==========
    
    @classmethod
    def parse_ths_cache_key(cls, key: str) -> Optional[Tuple[int, str, str]]:
        """解析同花顺相关的缓存键
        
        Args:
            key: 缓存键，格式：user:{user_id}:ths:{key_type}:{ths_account}
            
        Returns:
            Optional[Tuple[int, str, str]]: (user_id, key_type, ths_account) 或 None
        """
        try:
            match = cls._USER_CACHE_KEY_PATTERN.match(key)
            if not match:
                logger.debug(f"Key格式不匹配: {key}")
                return None

            # 提取匹配的组
            user_id_str, key_type, ths_account = match.groups()
            
            # 转换user_id为整数
            try:
                user_id = int(user_id_str)
            except ValueError:
                logger.warning(f"无效的用户ID: {user_id_str} in key: {key}")
                return None

            # 验证ths_account不为空
            if not ths_account:
                logger.warning(f"空的同花顺账号 in key: {key}")
                return None

            return user_id, key_type, ths_account
            
        except Exception as e:
            logger.error(f"解析缓存键失败: {key}, error: {e}")
            return None
    
    @classmethod  
    def parse_ths_session_key(cls, key: str) -> Optional[str]:
        """解析同花顺会话缓存键（新格式：ths:session:{ths_account}）
        
        Args:
            key: 会话缓存键
            
        Returns:
            Optional[str]: ths_account 或 None
        """
        prefix = "ths:session:"
        if key.startswith(prefix):
            ths_account = key[len(prefix):]
            return ths_account if ths_account else None
        return None
    
    @classmethod
    def parse_ths_relogin_key(cls, key: str) -> Optional[Tuple[int, str]]:
        """解析同花顺补登录状态缓存键
        
        Args:
            key: 补登录状态缓存键
            
        Returns:
            Optional[Tuple[int, str]]: (user_id, ths_account) 或 None
        """
        parsed = cls.parse_ths_cache_key(key)
        if parsed and parsed[1] == "relogin":
            return parsed[0], parsed[2]  # user_id, ths_account
        return None


# 全局实例
user_cache_keys = UserCacheKeys()
