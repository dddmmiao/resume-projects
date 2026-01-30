"""PushPlus 开放接口服务

提供 PushPlus 开放 API 的调用功能，包括：
- AccessKey 管理（获取、缓存、自动刷新）
- 获取统一二维码（带 Redis 缓存）
"""

import time
import httpx
from typing import Optional
from loguru import logger

from app.services.core.system_config_service import SystemConfigService
from app.services.core.cache_service import CacheService
from app.services.core.user_cache_keys import UserCacheKeys

# 缓存服务实例
_cache_service: Optional[CacheService] = None

def get_cache_service() -> CacheService:
    """获取缓存服务单例"""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service


class PushPlusService:
    """PushPlus 开放接口服务"""
    
    BASE_URL = "https://www.pushplus.plus"
    
    @classmethod
    async def get_access_key(cls, force_refresh: bool = False) -> Optional[str]:
        """获取有效的 AccessKey
        
        Args:
            force_refresh: 是否强制刷新
            
        Returns:
            AccessKey 或 None
        """
        token = SystemConfigService.get_pushplus_token()
        secret_key = SystemConfigService.get_pushplus_secret_key()
        
        if not token or not secret_key:
            logger.debug("未配置 PushPlus token 或 secretKey")
            return None
        
        # 检查缓存的 AccessKey
        if not force_refresh:
            access_key, expires_at = SystemConfigService.get_pushplus_access_key()
            if access_key and expires_at > int(time.time()):
                return access_key
        
        # 刷新 AccessKey
        try:
            logger.debug(f"正在获取 PushPlus AccessKey, token长度: {len(token)}, secretKey长度: {len(secret_key)}")
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{cls.BASE_URL}/api/common/openApi/getAccessKey",
                    json={"token": token, "secretKey": secret_key},
                    timeout=10
                )
                response.raise_for_status()
                result = response.json()
                logger.debug(f"PushPlus getAccessKey 响应: code={result.get('code')}, msg={result.get('msg')}")
                
                if result.get("code") == 200 and result.get("data"):
                    access_key = result["data"].get("accessKey")
                    expires_in = result["data"].get("expiresIn", 7200)
                    
                    if access_key:
                        SystemConfigService.set_pushplus_access_key(access_key, expires_in)
                        logger.info(f"PushPlus AccessKey 已刷新，有效期 {expires_in} 秒")
                        return access_key
                
                logger.warning(f"获取 PushPlus AccessKey 失败: {result.get('msg')}")
                return None
                
        except Exception as e:
            logger.error(f"获取 PushPlus AccessKey 异常: {e}")
            return None
    
    # 二维码缓存：使用 UserCacheKeys 统一管理
    QRCODE_CACHE_KEY = UserCacheKeys.PUSHPLUS_QRCODE_KEY
    QRCODE_CACHE_TTL = UserCacheKeys.PUSHPLUS_QRCODE_TTL
    
    @classmethod
    async def get_qrcode(cls, expires_seconds: int = 2592000, force_refresh: bool = False) -> Optional[str]:
        """获取统一二维码 URL（带 Redis 缓存）
        
        Args:
            expires_seconds: 二维码有效期（秒），默认 30 天
            force_refresh: 是否强制刷新缓存
            
        Returns:
            二维码图片 URL 或 None
        """
        cache = get_cache_service()
        
        # 先检查缓存
        if not force_refresh:
            cached_url = cache.get_json(cls.QRCODE_CACHE_KEY)
            if cached_url:
                logger.debug("从缓存获取 PushPlus 二维码")
                return cached_url
        
        access_key = await cls.get_access_key()
        if not access_key:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{cls.BASE_URL}/api/open/friend/getQrCode",
                    params={"second": expires_seconds},
                    headers={"access-key": access_key},
                    timeout=10
                )
                response.raise_for_status()
                result = response.json()
                
                if result.get("code") == 200 and result.get("data"):
                    qrcode_url = result["data"].get("qrCodeImgUrl")
                    if qrcode_url:
                        # 缓存二维码 URL
                        cache.set_json(cls.QRCODE_CACHE_KEY, qrcode_url, cls.QRCODE_CACHE_TTL)
                        logger.debug("获取 PushPlus 二维码成功并已缓存")
                        return qrcode_url
                
                logger.warning(f"获取 PushPlus 二维码失败: {result.get('msg')}")
                return None
                
        except Exception as e:
            logger.error(f"获取 PushPlus 二维码异常: {e}")
            return None
    


# 全局实例
pushplus_service = PushPlusService()
