"""
同花顺相关服务模块
按功能重组：认证(auth)、自选股(favorites)、核心组件(core)
"""

# 认证相关
from .auth import ths_login_service, auto_relogin_service
# 核心组件
from .core import THSHttpApiClient, MARKET_CODE, MARKET_NAME
# 自选股相关
from .favorites import ths_favorite_service, THSFavorite, THSFavoriteGroup

__all__ = [
    # 认证服务
    "ths_login_service", 
    "auto_relogin_service",
    # 自选股服务
    "ths_favorite_service",
    "THSFavorite",
    "THSFavoriteGroup", 
    # 核心组件
    "THSHttpApiClient",
    "MARKET_CODE",
    "MARKET_NAME"
]
