"""
条件注册系统

条件（Condition）是独立的筛选逻辑单元，每个条件有：
- key: 唯一标识符（格式：{condition_type} 或 {condition_type}_{entity_type}）
- condition_type: 条件类型（如 volume, price, trend_m）
- label: 显示名称
- description: 描述
- supported_entity_types: 支持的标的类型列表
- parameters: 参数定义
- execute: 执行函数

支持条件变体：
- 同一condition_type可以有多个标的类型的实现
- 例如：volume（通用）, volume_stock（股票专用）, volume_bond（可转债专用）
- 执行时优先匹配 {condition_type}_{entity_type}，无匹配则回退到 {condition_type}

策略（Strategy）引用条件类型（condition_type），执行时自动分发到对应实现。
"""
from typing import Dict, Any, List, Optional, Callable
from loguru import logger

# 条件注册表
_condition_registry: Dict[str, Dict[str, Any]] = {}


def register_condition(
    key: str,
    label: str,
    description: str,
    supported_entity_types: List[str],
    parameters: Dict[str, Any],
    execute_fn: Callable,
    condition_type: Optional[str] = None,
):
    """注册一个条件模块
    
    Args:
        key: 条件唯一标识符（如 volume, volume_stock）
        label: 显示名称
        description: 描述
        supported_entity_types: 支持的标的类型列表
        parameters: 参数定义
        execute_fn: 执行函数，签名为 (candidates, context, params, helpers) -> List[str]
        condition_type: 条件类型（可选，默认为key本身）
    """
    if key in _condition_registry:
        logger.warning(f"条件 {key} 已存在，将被覆盖")
    
    _condition_registry[key] = {
        "key": key,
        "condition_type": condition_type or key,  # 默认为key本身
        "label": label,
        "description": description,
        "supported_entity_types": supported_entity_types,
        "parameters": parameters,
        "execute": execute_fn,
    }
    logger.debug(f"注册条件: {key} ({label}), type={condition_type or key}")


def get_condition(key: str) -> Optional[Dict[str, Any]]:
    """获取条件定义"""
    return _condition_registry.get(key)


def get_all_conditions() -> Dict[str, Dict[str, Any]]:
    """获取所有已注册的条件"""
    return _condition_registry.copy()


def list_conditions() -> List[str]:
    """列出所有已注册的条件key"""
    return list(_condition_registry.keys())


def is_condition_supported(key: str, entity_type: str) -> bool:
    """检查条件是否支持指定的标的类型"""
    condition = get_condition(key)
    if not condition:
        return False
    return entity_type in condition.get("supported_entity_types", [])


def get_conditions_by_type(condition_type: str) -> List[Dict[str, Any]]:
    """获取指定类型的所有条件变体"""
    return [
        cond for cond in _condition_registry.values()
        if cond.get("condition_type") == condition_type
    ]


def get_condition_types() -> List[str]:
    """获取所有唯一的条件类型"""
    return list(set(
        cond.get("condition_type", cond["key"])
        for cond in _condition_registry.values()
    ))


def resolve_condition_for_entity(condition_type: str, entity_type: str) -> Optional[Dict[str, Any]]:
    """根据条件类型和标的类型解析具体的条件实现
    
    优先级：
    1. {condition_type}_{entity_type} - 标的专用实现
    2. {condition_type} - 通用实现（如果支持该标的类型）
    
    Args:
        condition_type: 条件类型（如 volume, price）
        entity_type: 标的类型（如 stock, bond）
        
    Returns:
        匹配的条件定义，如果无匹配则返回None
    """
    # 优先查找标的专用实现
    specific_key = f"{condition_type}_{entity_type}"
    specific_cond = get_condition(specific_key)
    if specific_cond and entity_type in specific_cond.get("supported_entity_types", []):
        return specific_cond
    
    # 回退到通用实现
    generic_cond = get_condition(condition_type)
    if generic_cond and entity_type in generic_cond.get("supported_entity_types", []):
        return generic_cond
    
    return None


def execute_condition(
    key: str,
    candidates: List[str],
    context: Dict[str, Any],
    params: Dict[str, Any],
    helpers: Any,
) -> Optional[List[str]]:
    """执行指定条件的筛选逻辑
    
    Args:
        key: 条件key或条件类型
        candidates: 候选代码列表
        context: 执行上下文
        params: 条件参数
        helpers: 辅助函数对象
        
    Returns:
        筛选后的代码列表，如果条件不支持当前标的类型或未启用则返回None
    """
    # 检查条件是否启用（enable_{condition_key}参数）
    enable_key = f"enable_{key}"
    if enable_key in params:
        if not params.get(enable_key, False):
            logger.debug(f"条件 {key} 未启用，跳过")
            return None
    
    entity_type = context.get("entity_type", "stock")
    
    # 尝试解析条件变体
    condition = resolve_condition_for_entity(key, entity_type)
    if not condition:
        # 直接查找精确key
        condition = get_condition(key)
        if not condition:
            logger.warning(f"条件 {key} 不存在")
            return None
        if not is_condition_supported(key, entity_type):
            logger.info(f"条件 {key} 不支持 {entity_type}，跳过")
            return None
    
    execute_fn = condition.get("execute")
    if not execute_fn:
        logger.warning(f"条件 {condition['key']} 没有执行函数")
        return None
    
    logger.debug(f"执行条件: {condition['key']} (type={condition.get('condition_type')})")
    return execute_fn(candidates, context, params, helpers)


# 自动加载所有条件模块
def _auto_load_conditions():
    """自动加载conditions目录下的所有条件模块"""
    from . import volume, price, trend_m, trend_cross, trend_converge
    

# 模块加载时自动注册条件
_auto_load_conditions()
