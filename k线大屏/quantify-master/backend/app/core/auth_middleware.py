"""
全局JWT认证中间件
通过中间件实现全局认证，减少在每个API接口添加Depends(get_current_user)的侵入性代码
"""

from typing import Callable, Optional, List
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from loguru import logger
from jose import JWTError, jwt

from config.config import settings
from app.services.user.user_service import user_service
from app.models.entities import User


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """JWT全局认证中间件"""
    
    # 白名单：不需要认证的路径
    PUBLIC_PATHS = [
        "/",
        "/api/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/static",
        "/favicon.ico",
        # 认证相关接口
        "/api/user/register",
        "/api/user/login",
        # 补登录相关接口（未登录系统支持）
        "/api/admin/relogin/state",
        # THS补登录操作接口
        "/api/ths/qr/generate",
        "/api/ths/sms/send",
        "/api/ths/sms/captcha",
        "/api/ths/sms/captcha/refresh",
        "/api/ths/sms/login",
    ]
    
    # 白名单：路径前缀匹配（补登录二维码状态轮询）
    PUBLIC_PATH_PREFIXES_EXTRA = [
        "/api/ths/qr/status/",
    ]
    
    # 白名单：路径前缀（以这些前缀开头的路径不需要认证）
    PUBLIC_PATH_PREFIXES = [
        "/static/",
        "/docs",
        "/redoc",
    ]
    
    def __init__(self, app, excluded_paths: Optional[List[str]] = None):
        """
        初始化JWT认证中间件
        
        Args:
            app: FastAPI应用实例
            excluded_paths: 额外的白名单路径（可选）
        """
        super().__init__(app)
        
        # 合并白名单
        if excluded_paths:
            self.PUBLIC_PATHS.extend(excluded_paths)
    
    def _is_public_path(self, path: str) -> bool:
        """
        判断是否是公开路径（不需要认证）
        
        Args:
            path: 请求路径
            
        Returns:
            True if public, False otherwise
        """
        # 精确匹配
        if path in self.PUBLIC_PATHS:
            return True
        
        # 前缀匹配
        for prefix in self.PUBLIC_PATH_PREFIXES:
            if path.startswith(prefix):
                return True
        
        # 额外前缀匹配（补登录相关）
        for prefix in self.PUBLIC_PATH_PREFIXES_EXTRA:
            if path.startswith(prefix):
                return True
        
        return False
    
    def _extract_token(self, request: Request) -> Optional[str]:
        """
        从请求中提取JWT token
        
        Args:
            request: FastAPI请求对象
            
        Returns:
            JWT token string or None
        """
        # 从Authorization header提取
        authorization = request.headers.get("Authorization")
        if authorization:
            parts = authorization.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                return parts[1]
        
        return None
    
    def _validate_token(self, token: str) -> Optional[User]:
        """
        验证JWT token并返回用户信息
        
        Args:
            token: JWT token string
            
        Returns:
            User object or None
        """
        try:
            # 解码JWT
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            
            # 提取用户名
            username: str = payload.get("sub")
            if username is None:
                return None
            
            # 通过service层查询用户
            user = user_service.find_user_by_username(username)
            
            if user and user.is_active:
                return user
            return None
                
        except JWTError as e:
            logger.warning(f"JWT验证失败: {e}")
            return None
        except Exception as e:
            logger.error(f"Token验证异常: {e}")
            return None
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        中间件核心处理逻辑
        
        Args:
            request: FastAPI请求对象
            call_next: 下一个中间件/路由处理器
            
        Returns:
            Response对象
        """
        path = request.url.path
        
        # 公开路径，直接放行
        if self._is_public_path(path):
            return await call_next(request)
        
        # 提取token
        token = self._extract_token(request)
        
        if not token:
            # 未提供token
            logger.warning(f"未授权访问: {request.method} {path} - 缺少token")
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "message": "未提供认证令牌",
                    "error_code": "UNAUTHORIZED"
                }
            )
        
        # 验证token
        user = self._validate_token(token)
        
        if not user:
            # token无效或用户不存在
            logger.warning(f"未授权访问: {request.method} {path} - token无效")
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "message": "认证令牌无效或已过期",
                    "error_code": "INVALID_TOKEN"
                }
            )
        
        # 认证成功，将用户信息添加到request.state
        request.state.current_user = user
        
        # 继续处理请求
        return await call_next(request)


def get_current_user_from_request(request: Request) -> Optional[User]:
    """
    从request.state中获取当前用户
    
    这是一个便捷函数，用于在路由中获取已认证的用户信息
    
    Args:
        request: FastAPI请求对象
        
    Returns:
        User object or None
    """
    return getattr(request.state, "current_user", None)
