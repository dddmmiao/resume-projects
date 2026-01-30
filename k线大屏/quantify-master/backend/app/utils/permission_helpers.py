"""
权限控制辅助函数
用于后台管理API的权限检查
使用 FastAPI 依赖注入模式
"""

from typing import Annotated
from fastapi import HTTPException, Depends
from app.utils.api_utils import get_current_user_dependency
from app.models.entities.user import User


def require_admin_read(current_user: Annotated[User, Depends(get_current_user_dependency)]) -> User:
    """
    管理员读权限依赖 - 允许管理员和超级管理员访问
    
    用法:
        @router.get("/admin/users")
        async def list_users(user: Annotated[User, Depends(require_admin_read)]):
            ...
    """
    if not (current_user.is_admin or current_user.is_super_admin):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


def require_admin_write(current_user: Annotated[User, Depends(get_current_user_dependency)]) -> User:
    """
    管理员写权限依赖 - 仅允许超级管理员,管理员为只读
    
    用法:
        @router.post("/admin/users")
        async def create_user(user: Annotated[User, Depends(require_admin_write)]):
            ...
    """
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="管理员仅有只读权限,需要超级管理员权限执行操作")
    
    return current_user


# 类型别名,使代码更简洁
AdminUser = Annotated[User, Depends(require_admin_read)]
AdminWriteUser = Annotated[User, Depends(require_admin_write)]
