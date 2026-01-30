"""
策略相关API路由
"""

import json
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Header, Request
from loguru import logger
from pydantic import BaseModel

from app.constants.entity_types import EntityTypes
from ..core.exceptions import (
    DatabaseException,
)
from ..core.response_models import (
    create_success_response,
    ApiResponse,
)
from ..utils.api_utils import get_current_user

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyExecuteRequest(BaseModel):
    """策略执行请求模型"""
    strategy: str
    context: Dict[str, Any] = {}
    entity_type: str = EntityTypes.STOCK
    period: str = "daily"


class PresetSaveRequest(BaseModel):
    """保存策略预设请求"""
    name: str
    strategy_name: str
    entity_type: str = "stock"
    period: str = "daily"
    params: Dict[str, Any] = {}
    is_default: bool = False


class PresetRenameRequest(BaseModel):
    """重命名策略预设请求"""
    name: str


class PresetUpdateRequest(BaseModel):
    """更新策略预设参数请求"""
    params: Dict[str, Any]


class StrategyExecuteResponse(BaseModel):
    """策略执行响应模型"""
    task_id: Optional[str] = None
    status: str = "pending"
    message: str


@router.get("", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_strategies():
    """获取所有可用的策略列表"""
    try:
        from ..services.management.strategy_registry import strategy_registry

        strategies: List[Dict[str, Any]] = []
        for strategy_name in strategy_registry.list_strategies():
            strategy_info = strategy_registry.get_strategy_info(strategy_name) or {}
            supported_entity_types = strategy_info.get("supported_entity_types")
            if not supported_entity_types:
                supported_entity_types = [EntityTypes.STOCK]

            strategies.append({
                "name": strategy_name,
                "label": strategy_info.get("label", strategy_name),
                "description": strategy_info.get("description", ""),
                "parameters": strategy_info.get("parameters", {}),
                "supported_entity_types": supported_entity_types,
                "conditions": strategy_info.get("conditions", []),  # 条件列表及其元数据
            })

        return create_success_response(
            data=strategies,
            message=f"获取策略列表成功，共{len(strategies)}个策略"
        )
    except Exception as e:
        logger.error(f"获取策略列表失败: {str(e)}")
        raise DatabaseException(f"获取策略列表失败: {str(e)}")


@router.post("/execute-async", response_model=ApiResponse[StrategyExecuteResponse])
async def execute_strategy_async(request: StrategyExecuteRequest, req: Request):
    """异步执行策略计算"""
    try:
        from ..services.management.strategy_registry import strategy_registry
        from ..services.core.redis_task_manager import redis_task_manager
        from ..utils.api_utils import get_current_user

        # 获取当前用户ID（用于保存历史记录）
        current_user = get_current_user(req)
        user_id = str(current_user.id) if current_user else "anonymous"

        # 验证策略是否存在
        if request.strategy not in strategy_registry.list_strategies():
            raise HTTPException(
                status_code=400,
                detail=f"策略 '{request.strategy}' 不存在"
            )

        # 构建策略上下文 - 包含前端发送的context以及entity_type和period
        context = request.context.copy()
        context["entity_type"] = request.entity_type
        context["period"] = request.period

        # 检查相同策略是否已经在运行（按用户隔离，不同用户可同时运行）
        strategy_task_code = f"strategy_{request.strategy}_{request.entity_type}_{user_id}"
        if redis_task_manager.is_task_type_running(strategy_task_code):
            raise HTTPException(
                status_code=409,
                detail=f"策略正在运行中，请勿重复触发"
            )

        # 创建异步任务（user_id用于保存历史，不参与context_hash计算）
        task_id = redis_task_manager.create_task(
            name=f"策略计算: {request.strategy}",
            task_func=strategy_registry.execute_strategy_async,
            code=strategy_task_code,
            strategy_name=request.strategy,
            context=context,
            user_id=user_id
        )

        logger.info(f"创建策略计算任务: {request.strategy} (任务ID: {task_id})")

        # 立即创建running状态的历史记录
        try:
            from ..services.management.strategy_history_service import strategy_history_service
            
            # 获取策略信息
            strategy_info = strategy_registry.get_strategy_info(request.strategy) or {}
            strategy_label = strategy_info.get("label", request.strategy)
            
            # 生成随机context_hash
            from app.utils.key_generator import generate_context_hash
            context_hash = generate_context_hash()
            
            strategy_history_service.create_history(
                user_id=user_id,
                strategy_name=request.strategy,
                strategy_label=strategy_label,
                entity_type=request.entity_type,
                period=request.period,
                base_date=context.get("trade_date"),
                context=context,
                context_hash=context_hash,
                status="running",
                task_id=task_id
            )
            logger.info(f"已创建running状态历史记录: {request.strategy} (任务ID: {task_id})")
        except Exception as e:
            logger.warning(f"创建running历史记录失败: {e}")

        return create_success_response(
            data=StrategyExecuteResponse(
                task_id=task_id,
                message=f"策略 '{request.strategy}' 计算任务已创建"
            ),
            message="策略计算任务创建成功"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建策略计算任务失败: {str(e)}")
        raise DatabaseException(f"创建策略计算任务失败: {str(e)}")


class StrategyDeleteRequest(BaseModel):
    """策略删除请求模型"""
    context_hash: str


@router.delete("/delete-result", response_model=ApiResponse[Dict[str, Any]])
async def delete_strategy_result(request: StrategyDeleteRequest, req: Request):
    """删除策略执行结果（从数据库删除）"""
    try:
        from ..services.management.strategy_history_service import strategy_history_service

        # 获取当前用户
        user = get_current_user(req)
        user_id = user.id

        # 根据context_hash删除数据库记录（需验证用户权限）
        deleted = strategy_history_service.delete_history_by_hash(request.context_hash, user_id)

        return create_success_response(
            data={"deleted": deleted},
            message=f"策略结果已删除" if deleted else "未找到对应记录"
        )

    except Exception as e:
        logger.error(f"删除策略结果失败: {str(e)}")
        raise DatabaseException(f"删除策略结果失败: {str(e)}")


# ==================== 策略预设 ====================

@router.post("/presets", response_model=ApiResponse[Dict[str, Any]])
async def save_preset(preset_request: PresetSaveRequest, request: Request):
    """保存策略预设"""
    try:
        from ..services.management.strategy_preset_service import strategy_preset_service
        
        user = get_current_user(request)
        user_id = user.id
        
        preset = strategy_preset_service.save_preset(
            user_id=user_id,
            name=preset_request.name,
            strategy_name=preset_request.strategy_name,
            entity_type=preset_request.entity_type,
            period=preset_request.period,
            params=preset_request.params,
            is_default=preset_request.is_default,
        )
        
        return create_success_response(
            data={"key": preset.preset_key, "name": preset.name},
            message="预设保存成功"
        )
    except ValueError as e:
        # 名称重复等业务异常
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"保存策略预设失败: {str(e)}")
        raise DatabaseException(f"保存策略预设失败: {str(e)}")


@router.get("/presets", response_model=ApiResponse[List[Dict[str, Any]]])
async def list_presets(
    request: Request,
    strategy_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    period: Optional[str] = None,
):
    """获取用户的策略预设列表"""
    try:
        from ..services.management.strategy_preset_service import strategy_preset_service
        
        user = get_current_user(request)
        user_id = user.id
        
        presets = strategy_preset_service.list_presets(
            user_id=user_id,
            strategy_name=strategy_name,
            entity_type=entity_type,
            period=period,
        )
        
        return create_success_response(data=presets)
    except Exception as e:
        logger.error(f"获取策略预设列表失败: {str(e)}")
        raise DatabaseException(f"获取策略预设列表失败: {str(e)}")


@router.delete("/presets/{preset_key}", response_model=ApiResponse[Dict[str, Any]])
async def delete_preset(preset_key: str, request: Request):
    """删除策略预设"""
    try:
        from ..services.management.strategy_preset_service import strategy_preset_service
        
        user = get_current_user(request)
        user_id = user.id
        
        deleted = strategy_preset_service.delete_preset(preset_key, user_id)
        
        return create_success_response(
            data={"deleted": deleted},
            message="预设已删除" if deleted else "未找到预设"
        )
    except Exception as e:
        logger.error(f"删除策略预设失败: {str(e)}")
        raise DatabaseException(f"删除策略预设失败: {str(e)}")


@router.patch("/presets/{preset_key}", response_model=ApiResponse[Dict[str, Any]])
async def rename_preset(preset_key: str, rename_request: PresetRenameRequest, request: Request):
    """重命名策略预设"""
    try:
        from ..services.management.strategy_preset_service import strategy_preset_service
        
        user = get_current_user(request)
        user_id = user.id
        
        new_name = rename_request.name.strip()
        if not new_name or len(new_name) < 2 or len(new_name) > 50:
            raise ValidationException("预设名称长度需在2-50个字符之间")
        
        updated = strategy_preset_service.rename_preset(preset_key, new_name, user_id)
        
        return create_success_response(
            data={"updated": updated},
            message="预设已重命名" if updated else "未找到预设"
        )
    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"重命名策略预设失败: {str(e)}")
        raise DatabaseException(f"重命名策略预设失败: {str(e)}")


@router.put("/presets/{preset_key}", response_model=ApiResponse[Dict[str, Any]])
async def update_preset(preset_key: str, update_request: PresetUpdateRequest, request: Request):
    """更新策略预设参数"""
    try:
        from ..services.management.strategy_preset_service import strategy_preset_service
        
        user = get_current_user(request)
        user_id = user.id
        
        updated = strategy_preset_service.update_preset(preset_key, update_request.params, user_id)
        
        return create_success_response(
            data={"updated": updated},
            message="预设已更新" if updated else "未找到预设"
        )
    except Exception as e:
        logger.error(f"更新策略预设失败: {str(e)}")
        raise DatabaseException(f"更新策略预设失败: {str(e)}")
