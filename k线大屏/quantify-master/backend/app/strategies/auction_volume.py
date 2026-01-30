"""
量价趋势策略

使用条件注册系统，策略引用条件模块执行筛选。
"""
from typing import Dict, Any, List, Optional

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.constants.table_types import TableTypes
from app.strategies.conditions import get_all_conditions, execute_condition


STRATEGY_NAME = "auction_volume"

# 策略引用的条件类型列表
STRATEGY_CONDITIONS = ["volume", "price", "trend_m", "trend_cross", "trend_converge"]


def get_metadata() -> Dict[str, Any]:
    """返回量价趋势策略的元数据定义。
    
    策略引用条件系统中的已注册条件，条件的标的类型支持信息
    从条件注册表中动态获取。
    """
    all_conditions = get_all_conditions()
    conditions_meta = []
    all_supported_types = set()
    
    for cond_key in STRATEGY_CONDITIONS:
        cond = all_conditions.get(cond_key)
        if cond:
            conditions_meta.append({
                "key": cond["key"],
                "label": cond["label"],
                "description": cond["description"],
                "supported_entity_types": cond["supported_entity_types"],
                "parameters": cond["parameters"],
            })
            all_supported_types.update(cond["supported_entity_types"])
    
    return {
        "label": "量价趋势策略",
        "description": "量&价&趋势三维筛选",
        "supported_entity_types": list(all_supported_types) or [EntityTypes.STOCK],
        "conditions": conditions_meta,
    }


def execute(context: Dict[str, Any], helpers: Any) -> Optional[List[str]]:
    """执行量价趋势策略。
    
    使用条件注册系统执行各个条件模块，条件之间是AND关系。
    条件会根据当前标的类型自动跳过不支持的模块。
    """
    logger.info("量价趋势策略开始执行")
    
    entity_type = context.get("entity_type", EntityTypes.STOCK)
    
    # 获取候选代码
    candidates = helpers.get_candidate_codes(context)
    if not candidates:
        entity_name = TableTypes.get_chinese_name(
            TableTypes.entity_type_to_table_type(entity_type) or entity_type
        )
        logger.info(f"候选{entity_name}为空，返回空列表")
        return []
    
    logger.info(f"初始候选数量: {len(candidates)}")
    
    # 依次执行各个条件（AND关系）
    current_candidates = candidates
    executed_conditions = []
    
    for condition_type in STRATEGY_CONDITIONS:
        if not current_candidates:
            break
            
        # 执行条件（条件系统会自动处理标的类型兼容性）
        result = execute_condition(
            condition_type,
            current_candidates,
            context,
            context,  # params直接从context获取
            helpers,
        )
        
        if result is not None:
            # 条件执行成功，更新候选列表
            current_candidates = result
            executed_conditions.append(condition_type)
            logger.info(f"条件 {condition_type} 筛选后: {len(current_candidates)}")
        # result为None表示条件不支持当前标的类型或参数不完整，跳过
    
    entity_name = TableTypes.get_chinese_name(
        TableTypes.entity_type_to_table_type(entity_type) or entity_type
    )
    logger.info(
        f"量价趋势策略执行完成 | 执行条件: {executed_conditions} | "
        f"筛选出 {len(current_candidates)} 只{entity_name}"
    )
    
    return current_candidates

