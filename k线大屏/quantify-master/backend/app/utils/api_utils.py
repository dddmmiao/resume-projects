"""
API工具函数
提供便捷的辅助函数供路由使用
"""

from typing import Optional
from fastapi import Request, HTTPException

from app.models.entities import User


def get_current_user(request: Request) -> User:
    """
    从request中获取当前认证用户
    
    这是一个便捷函数，替代原来的Depends(get_current_user)
    现在认证由全局中间件处理，用户信息存储在request.state中
    
    Usage:
        @router.get("/protected")
        async def protected_route(request: Request):
            user = get_current_user(request)
            return {"username": user.username}
    
    Args:
        request: FastAPI请求对象
        
    Returns:
        User对象
        
    Raises:
        HTTPException: 用户未认证时抛出401错误
    """
    if not hasattr(request.state, "current_user") or request.state.current_user is None:
        raise HTTPException(status_code=401, detail="未认证")
    
    return request.state.current_user


def get_current_user_dependency(request: Request) -> User:
    """
    FastAPI 依赖注入版本的 get_current_user
    
    用于配合 Depends() 使用
    
    Usage:
        from typing import Annotated
        from fastapi import Depends
        
        @router.get("/protected")
        async def protected_route(user: Annotated[User, Depends(get_current_user_dependency)]):
            return {"username": user.username}
    
    Args:
        request: FastAPI请求对象
        
    Returns:
        User对象
        
    Raises:
        HTTPException: 用户未认证时抛出401错误
    """
    return get_current_user(request)


def create_success_response(data=None, message: str = "操作成功"):
    """创建标准化成功响应"""
    response = {
        "success": True,
        "message": message
    }
    if data is not None:
        response["data"] = data
    return response


def create_error_response(message: str, status_code: int = 400, error_code: Optional[str] = None):
    """创建标准化错误响应"""
    response = {
        "success": False,
        "message": message
    }
    if error_code:
        response["error_code"] = error_code
    
    return HTTPException(status_code=status_code, detail=response)
