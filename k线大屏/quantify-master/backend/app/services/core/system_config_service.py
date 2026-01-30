"""系统配置服务

统一管理系统级配置，避免硬编码 Redis key 和默认值分散在各处。
"""

from typing import Any, Dict, Optional
from loguru import logger

from app.services.core.cache_service import cache_service


class SystemConfigService:
    """系统配置服务 - 统一管理所有系统级配置"""
    
    # Redis key 前缀
    PREFIX = "system:config:"
    
    # 有效值常量
    VALID_INDICATOR_SOURCES = ("frontend", "db")
    VALID_CAPTCHA_MODES = ("combined", "auto", "manual")
    VALID_LOGIN_METHODS = ("qr", "sms", "password", "cookie")
    RELOGIN_CONFIG_KEYS = ("auto_relogin_enabled", "pushplus_token", "pushplus_secret_key", "relogin_timeout_minutes")
    
    # 配置项定义：(key, 默认值, 描述)
    CONFIG_DEFINITIONS = {
        # 登录相关
        "login_methods": {
            "default": {"qr": True, "sms": True, "password": True, "cookie": False},
            "description": "启用的登录方式"
        },
        "captcha_mode": {
            "default": "combined",
            "description": "滑块验证模式: combined/auto/manual"
        },
        
        # 补登录相关
        "auto_relogin_enabled": {
            "default": "true",
            "description": "是否启用自动补登录"
        },
        "pushplus_token": {
            "default": "",
            "description": "PushPlus 推送 token"
        },
        "pushplus_secret_key": {
            "default": "",
            "description": "PushPlus secretKey（用于获取 AccessKey 调用开放接口）"
        },
        "pushplus_access_key": {
            "default": "",
            "description": "PushPlus AccessKey（缓存，自动刷新）"
        },
        "pushplus_access_key_expires": {
            "default": "0",
            "description": "PushPlus AccessKey 过期时间戳"
        },
        "relogin_timeout_minutes": {
            "default": "10",
            "description": "补登录超时时间（分钟）"
        },
        
        # 数据相关
        "indicator_source": {
            "default": "frontend",
            "description": "指标数据源: frontend/db"
        },
        "default_sync_months": {
            "default": "6",
            "description": "默认同步月数"
        },
        
        # Tushare API 频次配置
        "tushare_rate_policies": {
            "default": {
                "default": {"per_minute": 2000, "per_second": 30, "concurrency": 15},
                "daily": {"per_minute": 500, "per_second": 8, "concurrency": 8},
                "daily_basic": {"per_minute": 500, "per_second": 8, "concurrency": 8},
                "cb_daily": {"per_minute": 480, "per_second": 10, "concurrency": 5},
                "ths_daily": {"per_minute": 90, "per_second": 2, "concurrency": 2},
                "weekly": {"per_minute": 400, "per_second": 8, "concurrency": 2},
                "monthly": {"per_minute": 400, "per_second": 8, "concurrency": 2},
                "stk_auction": {"per_minute": 500, "per_second": 8, "concurrency": 8},
            },
            "description": "Tushare API 频次限制配置"
        },
        
        # 策略推送配置（支持多策略多配置）
        "strategy_push_config": {
            "default": {
                "enabled": False,
                "max_total_configs": 500,
                "configs": []
            },
            "description": "策略推送配置：定时执行多个策略配置并推送结果到同花顺分组"
        },
    }
    
    @classmethod
    def _build_key(cls, key: str) -> str:
        """构建完整的 Redis key"""
        return f"{cls.PREFIX}{key}"
    
    @classmethod
    def get(cls, key: str, default: Any = None) -> Any:
        """获取配置值（字符串）
        
        Args:
            key: 配置项名称（不含前缀）
            default: 默认值，如果未指定则使用配置定义中的默认值
            
        Returns:
            配置值
        """
        # 获取默认值
        if default is None:
            config_def = cls.CONFIG_DEFINITIONS.get(key, {})
            default = config_def.get("default", "")
        
        try:
            if cache_service.redis_client:
                value = cache_service.redis_client.get(cls._build_key(key))
                if value is not None:
                    return str(value)
        except Exception as e:
            logger.warning(f"获取系统配置 {key} 失败: {e}")
        
        return default
    
    @classmethod
    def get_json(cls, key: str, default: Any = None) -> Any:
        """获取 JSON 格式的配置值
        
        Args:
            key: 配置项名称（不含前缀）
            default: 默认值
            
        Returns:
            配置值（已解析的 JSON 对象）
        """
        # 获取默认值
        if default is None:
            config_def = cls.CONFIG_DEFINITIONS.get(key, {})
            default = config_def.get("default")
        
        try:
            value = cache_service.get_json(cls._build_key(key))
            if value is not None:
                return value
        except Exception as e:
            logger.warning(f"获取系统配置 {key} 失败: {e}")
        
        return default
    
    @classmethod
    def set(cls, key: str, value: Any) -> bool:
        """设置配置值（字符串）
        
        Args:
            key: 配置项名称
            value: 配置值
            
        Returns:
            是否成功
        """
        try:
            if cache_service.redis_client:
                cache_service.redis_client.set(cls._build_key(key), str(value))
                return True
        except Exception as e:
            logger.error(f"设置系统配置 {key} 失败: {e}")
        return False
    
    @classmethod
    def set_json(cls, key: str, value: Any) -> bool:
        """设置 JSON 格式的配置值
        
        Args:
            key: 配置项名称
            value: 配置值（会被序列化为 JSON）
            
        Returns:
            是否成功
        """
        try:
            cache_service.set_json(cls._build_key(key), value, ttl_seconds=0)
            return True
        except Exception as e:
            logger.error(f"设置系统配置 {key} 失败: {e}")
        return False
    
    # ========== 便捷方法 ==========
    
    @classmethod
    def get_login_methods(cls) -> Dict[str, bool]:
        """获取登录方式配置"""
        return cls.get_json("login_methods")
    
    @classmethod
    def get_enabled_login_methods(cls) -> list:
        """获取已启用的登录方式列表"""
        config = cls.get_login_methods()
        return [m for m, enabled in config.items() if enabled]
    
    @classmethod
    def get_captcha_mode(cls) -> str:
        """获取滑块验证模式"""
        mode = cls.get("captcha_mode")
        if mode not in ("combined", "auto", "manual"):
            return "combined"
        return mode
    
    @classmethod
    def get_indicator_source(cls) -> str:
        """获取指标数据源"""
        source = cls.get("indicator_source")
        if source not in ("frontend", "db"):
            return "frontend"
        return source
    
    @classmethod
    def is_auto_relogin_enabled(cls) -> bool:
        """是否启用自动补登录"""
        return cls.get("auto_relogin_enabled", "true").lower() == "true"
    
    @classmethod
    def get_pushplus_token(cls) -> str:
        """获取 PushPlus token"""
        return cls.get("pushplus_token", "")
    
    @classmethod
    def get_pushplus_secret_key(cls) -> str:
        """获取 PushPlus secretKey"""
        return cls.get("pushplus_secret_key", "")
    
    @classmethod
    def get_pushplus_access_key(cls) -> tuple:
        """获取 PushPlus AccessKey 和过期时间"""
        access_key = cls.get("pushplus_access_key", "")
        expires = int(cls.get("pushplus_access_key_expires", "0"))
        return access_key, expires
    
    @classmethod
    def set_pushplus_access_key(cls, access_key: str, expires_in: int) -> bool:
        """设置 PushPlus AccessKey"""
        import time
        expires_at = int(time.time()) + expires_in - 300  # 提前5分钟过期
        cls.set("pushplus_access_key", access_key)
        cls.set("pushplus_access_key_expires", str(expires_at))
        return True
    
    @classmethod
    def get_relogin_timeout_minutes(cls) -> int:
        """获取补登录超时时间（分钟）"""
        try:
            return int(cls.get("relogin_timeout_minutes", "10"))
        except ValueError:
            return 10
    
    @classmethod
    def get_tushare_rate_policies(cls) -> Dict[str, Dict[str, int]]:
        """获取 Tushare API 频次配置"""
        return cls.get_json("tushare_rate_policies")
    
    @classmethod
    def set_tushare_rate_policies(cls, policies: Dict[str, Dict[str, int]]) -> bool:
        """设置 Tushare API 频次配置"""
        return cls.set_json("tushare_rate_policies", policies)
    
    @classmethod
    def get_tushare_rate_policy(cls, api_name: str) -> Dict[str, int]:
        """获取指定 API 的频次配置"""
        policies = cls.get_tushare_rate_policies()
        return policies.get(api_name) or policies.get("default", {})


# 全局实例
system_config_service = SystemConfigService()
