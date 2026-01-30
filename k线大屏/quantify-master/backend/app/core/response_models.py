"""
统一响应格式模型
"""

from typing import Any, Dict, List, Optional, Generic, TypeVar

from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse

T = TypeVar("T")


class PaginationInfo(BaseModel):
    """分页信息模型（精简版）"""

    page: int = Field(..., description="当前页码", ge=1)
    page_size: int = Field(..., description="每页数量", ge=1, le=1000)
    total: int = Field(..., description="总记录数", ge=0)


class ApiResponse(BaseModel, Generic[T]):
    """统一API响应格式（精简版）"""

    success: bool = Field(True, description="请求是否成功")
    message: str = Field("操作成功", description="响应消息")
    data: Optional[T] = Field(None, description="响应数据")
    pagination: Optional[PaginationInfo] = Field(None, description="分页信息")
    
    model_config = {"exclude_none": True}


class ErrorResponse(BaseModel):
    """错误响应格式（精简版）"""

    success: bool = Field(False, description="请求是否成功")
    message: str = Field(..., description="错误消息")
    error_code: Optional[str] = Field(None, description="错误代码")
    error_details: Optional[Dict[str, Any]] = Field(None, description="错误详情")


class ListResponse(BaseModel, Generic[T]):
    """列表响应格式"""

    items: List[T] = Field(default_factory=list, description="数据列表")
    total: int = Field(0, description="总记录数")


def create_success_response(
        data: Any = None,
        message: str = "操作成功",
        pagination: Optional[PaginationInfo] = None,
) -> Dict[str, Any]:
    """创建成功响应（精简版）"""
    response = {
        "success": True,
        "message": message,
        "data": data,
    }

    if pagination:
        response["pagination"] = pagination.dict()

    return response


def create_error_response(
        message: str,
        error_code: Optional[str] = None,
        error_details: Optional[Dict[str, Any]] = None,
        status_code: Optional[int] = None,
) -> Any:
    """创建错误响应（精简版）"""
    response = {
        "success": False,
        "message": message,
    }

    if error_code:
        response["error_code"] = error_code

    if error_details:
        response["error_details"] = error_details

    if status_code is not None:
        return JSONResponse(status_code=status_code, content=response)

    return response


def create_list_response(
        items: List[Any],
        total: int,
        page: int = 1,
        page_size: int = 20,
        message: str = "查询成功",
) -> ApiResponse[List[Any]]:
    """创建标准列表响应（带分页）
    
    Args:
        items: 数据列表
        total: 总记录数
        page: 当前页码
        page_size: 每页数量
        message: 响应消息

    Returns:
        带分页信息的API响应
    """
    # 创建精简的分页信息
    pagination = PaginationInfo(
        page=page,
        page_size=page_size,
        total=total,
    )

    return ApiResponse[List[Any]](
        success=True,
        message=message,
        data=items,
        pagination=pagination
    )
