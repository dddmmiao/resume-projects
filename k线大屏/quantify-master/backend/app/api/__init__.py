"""
API路由模块
"""

from .admin import router as admin_router
from .concepts import router as concepts_router
from .convertible_bonds import router as convertible_bonds_router
from .industries import router as industries_router
from .stocks import router as stocks_router
from .strategies import router as strategies_router
from .trade_calendar import router as trade_calendar_router

__all__ = [
    "stocks_router",
    "admin_router",
    "convertible_bonds_router",
    "concepts_router",
    "industries_router",
    "trade_calendar_router",
    "strategies_router",
]
