"""
同花顺自选股服务统一导入接口
提供便捷的统一导入入口，导出所有THS相关的核心类和服务
"""

from .core import THSHttpApiClient
# 导入重新组织后的模块
from .favorites import ths_favorite_service, THSFavorite, THSFavoriteGroup, THSUserFavorite

# 导出所有公共接口
__all__ = [
    'ths_favorite_service',
    'THSFavorite',
    'THSFavoriteGroup',
    'THSUserFavorite',
    'THSHttpApiClient'
]
