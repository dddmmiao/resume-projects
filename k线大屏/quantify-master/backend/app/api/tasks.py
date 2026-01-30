"""
任务管理相关API路由
"""

from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import (
    DatabaseException,
)
from ..core.response_models import (
    create_success_response,
    ApiResponse,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskProgress(BaseModel):
    """任务进度模型"""
    task_id: str
    name: str
    status: str
    progress: int
    message: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ========== 内部通用方法，供多个路由复用，避免重复代码 ==========
def _build_task_progress_response(task_id: str) -> Dict[str, Any]:
    """通用：根据 task_id 构建任务进度响应（ApiResponse.data 部分）。"""
    from ..services.core.redis_task_manager import redis_task_manager

    task_info = redis_task_manager.get_task_progress(task_id)
    if not task_info:
        # 任务不存在时，返回已取消状态（幂等性）
        return {
            "task_id": task_id,
            "status": "cancelled",
            "progress": 0,
            "message": "任务不存在（已取消）",
            "started_at": None,
            "result": None,
            "error": None,
        }

    return {
        "task_id": task_id,
        "code": task_info.get("code"),  # 添加code字段，用于前端识别任务类型
        "status": task_info.get("status", "unknown"),
        "progress": task_info.get("progress", 0),
        "message": task_info.get("message", ""),
        "started_at": task_info.get("started_at"),
        "result": task_info.get("result"),
        "error": task_info.get("error"),
        "operation_details": task_info.get("operation_details"),
    }


def _cancel_task_by_id(task_id: str) -> Dict[str, str]:
    """通用：根据 task_id 取消任务，返回统一数据结构。"""
    from ..services.core.redis_task_manager import redis_task_manager

    # 先获取任务信息，判断任务类型
    task_info = redis_task_manager.get_task_progress(task_id) or {}
    task_code = task_info.get("code", "")
    
    success = redis_task_manager.cancel_task(task_id)
    if not success:
        # 任务不存在时，直接返回成功（认为已经"删除"了）
        logger.info(f"任务 {task_id} 不存在，直接返回成功")
        return {"task_id": task_id, "status": "cancelled"}

    # 如果是策略任务，更新策略执行历史状态
    if task_code.startswith("strategy_"):
        try:
            from ..services.management.strategy_history_service import strategy_history_service
            strategy_history_service.update_history_status(task_id=task_id, status="cancelled")
            logger.info(f"已更新策略历史状态为cancelled: {task_id}")
        except Exception as e:
            logger.warning(f"更新策略历史状态失败: {e}")

    # 任务存在：此时仅代表已发出取消请求，真实状态通常为 cancelling
    task_info = redis_task_manager.get_task_progress(task_id) or {}
    return {"task_id": task_id, "status": task_info.get("status", "cancelling")}


@router.get("/status", response_model=ApiResponse[Dict[str, Any]])
async def get_all_running_tasks():
    """获取所有正在运行的任务状态（用于页面刷新后恢复）"""
    try:
        from ..services.core.redis_task_manager import redis_task_manager

        running_tasks = redis_task_manager.get_running_tasks()
        tasks_status = {}

        for task_id in running_tasks:
            task_info = redis_task_manager.get_task_progress(task_id)
            if task_info:
                tasks_status[task_id] = {
                    "task_id": task_id,
                    "name": task_info.get("name", ""),
                    "status": task_info.get("status", "unknown"),
                    "progress": task_info.get("progress", 0),
                    "message": task_info.get("message", ""),
                    "start_time": task_info.get("started_at"),
                    "result": task_info.get("result"),
                    "error": task_info.get("error"),
                }

        return create_success_response(
            data=tasks_status,
            message=f"获取到 {len(tasks_status)} 个正在运行的任务"
        )
    except Exception as e:
        logger.error(f"获取运行中任务状态失败: {str(e)}")
        raise DatabaseException(f"获取运行中任务状态失败: {str(e)}")


@router.get("/{task_id}", response_model=ApiResponse[Dict[str, Any]])
async def get_task_progress(task_id: str):
    """获取任务进度（策略与后台同步等任务通用）"""
    try:
        task_progress = _build_task_progress_response(task_id)
        return create_success_response(
            data=task_progress,
            message="获取任务进度成功"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务进度失败: {str(e)}")
        raise DatabaseException(f"获取任务进度失败: {str(e)}")


@router.delete("/{task_id}", response_model=ApiResponse[Dict[str, str]])
async def cancel_task(task_id: str):
    """取消任务（策略与后台同步等任务通用）"""
    try:
        data = _cancel_task_by_id(task_id)
        logger.info(f"任务取消请求已发送: {task_id}")
        return create_success_response(
            data=data,
            message="任务取消请求已发送"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"取消任务失败: {str(e)}")
        raise DatabaseException(f"取消任务失败: {str(e)}")
