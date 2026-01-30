"""
策略执行历史API路由
"""

from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import DatabaseException
from ..core.response_models import create_success_response, ApiResponse
from ..utils.api_utils import get_current_user

router = APIRouter(prefix="/api/strategy-history", tags=["strategy-history"])


class HistoryListResponse(BaseModel):
    """历史列表响应"""
    items: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int


class HistoryDetailResponse(BaseModel):
    """历史详情响应"""
    strategy_name: str
    strategy_label: Optional[str]
    entity_type: str
    period: str
    base_date: Optional[str]
    context: Dict[str, Any]
    context_hash: str  # 策略参数哈希，用于应用/删除历史结果
    result_codes: List[str]
    result_count: int
    status: str
    created_at: str


@router.get("", response_model=ApiResponse[HistoryListResponse])
async def get_history_list(
    request: Request,
    entity_type: Optional[str] = None,
    period: Optional[str] = None,
    strategy_name: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    """
    获取当前用户的策略执行历史列表
    
    Args:
        entity_type: 标的类型筛选
        period: 周期筛选
        strategy_name: 策略名称筛选
        page: 页码
        page_size: 每页数量
    """
    try:
        from ..services.management.strategy_history_service import strategy_history_service
        
        # 获取当前用户
        current_user = get_current_user(request)
        if not current_user:
            raise HTTPException(status_code=401, detail="用户未登录")
        
        user_id = str(current_user.id)
        
        # 调用Service层获取历史列表
        items, total = strategy_history_service.get_history_list(
            user_id=user_id,
            entity_type=entity_type,
            period=period,
            strategy_name=strategy_name,
            page=page,
            page_size=page_size
        )
        
        return create_success_response(
            data=HistoryListResponse(
                items=items,
                total=total,
                page=page,
                page_size=page_size
            ),
            message=f"获取策略执行历史成功，共 {total} 条"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取策略执行历史失败: {e}")
        raise DatabaseException(f"获取策略执行历史失败: {e}")


@router.get("/{history_id}", response_model=ApiResponse[HistoryDetailResponse])
async def get_history_detail(request: Request, history_id: int):
    """获取策略执行历史详情"""
    try:
        from ..services.management.strategy_history_service import strategy_history_service
        
        # 获取当前用户
        current_user = get_current_user(request)
        if not current_user:
            raise HTTPException(status_code=401, detail="用户未登录")
        
        user_id = str(current_user.id)
        
        # 调用Service层获取详情
        detail = strategy_history_service.get_history_detail(history_id, user_id)
        
        if not detail:
            raise HTTPException(status_code=404, detail="历史记录不存在或无权访问")
        
        return create_success_response(
            data=HistoryDetailResponse(**detail),
            message="获取策略执行历史详情成功"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取策略执行历史详情失败: {e}")
        raise DatabaseException(f"获取策略执行历史详情失败: {e}")


@router.delete("/{history_id}", response_model=ApiResponse[Dict[str, Any]])
async def delete_history(request: Request, history_id: int):
    """根据ID删除策略执行历史记录"""
    try:
        from ..services.management.strategy_history_service import strategy_history_service
        
        # 获取当前用户
        current_user = get_current_user(request)
        if not current_user:
            raise HTTPException(status_code=401, detail="用户未登录")
        
        user_id = str(current_user.id)
        
        # 调用Service层删除记录（需验证用户ID）
        success = strategy_history_service.delete_history(history_id, user_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="历史记录不存在或无权删除")
        
        return create_success_response(
            data={"deleted": True},
            message="删除策略执行历史成功"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除策略执行历史失败: {e}")
        raise DatabaseException(f"删除策略执行历史失败: {e}")
