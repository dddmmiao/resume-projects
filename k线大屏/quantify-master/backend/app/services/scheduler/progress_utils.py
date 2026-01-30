"""
进度工具模块
提供统一的进度更新逻辑和中文映射
"""

from typing import Dict


def get_task_type_chinese_mapping(sync_type: str = "default") -> Dict[str, str]:
    """获取任务类型的中文映射"""
    mappings = {
        "default": {
            "stock_sync": "股票同步",
            "concept_sync": "概念同步",
            "industry_sync": "行业同步",
            "hot_sync": "热度同步",
            "trade_calendar_sync": "交易日历同步",
            "cleanup": "数据清理",
            "kline_sync": "K线同步"
        },
        "kline": {
            "daily": "日线",
            "weekly": "周线",
            "monthly": "月线",
            "quarterly": "季线",
            "yearly": "年线"
        },
        "kline_sync": {
            "stock": "股票",
            "bond": "可转债",
            "concept": "概念",
            "industry": "行业"
        }
    }

    return mappings.get(sync_type, mappings["default"])


def update_progress_with_consistent_logic(
        task_id: str,
        processed: int,
        total: int,
        task_name: str,
        current_item_name: str = "",
        progress_base: int = 10,
        progress_range: int = 80,
) -> int:
    """统一的进度更新逻辑"""
    if not task_id:
        return 0

    from app.services.core.redis_task_manager import redis_task_manager

    percentage = progress_base + int((processed / max(total, 1)) * progress_range)
    progress_message = (
        f"已同步{task_name} {processed}/{total}: {current_item_name}"
        if current_item_name
        else f"已同步{task_name} {processed}/{total}"
    )
    redis_task_manager.update_task_progress(task_id, percentage, progress_message)
    return percentage
