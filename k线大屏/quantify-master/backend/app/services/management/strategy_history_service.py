"""
策略执行历史 Service 层
"""

import json
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from loguru import logger

from app.dao.strategy_history_dao import strategy_history_dao
from app.models.management.strategy_history import StrategyExecutionHistory


class StrategyHistoryService:
    """策略执行历史服务"""

    def update_history_status(
        self,
        task_id: str,
        status: str,
        selected_codes: List[str] = None
    ) -> Optional[str]:
        """
        更新策略执行历史记录状态
        
        Args:
            task_id: 任务ID
            status: 新状态
            selected_codes: 筛选结果代码列表
            
        Returns:
            更新成功返回context_hash，失败返回None
        """
        return strategy_history_dao.update_by_task_id(
            task_id=task_id,
            status=status,
            result_codes=json.dumps(selected_codes or [], ensure_ascii=False),
            result_count=len(selected_codes or [])
        )

    def create_history(
        self,
        user_id: str,
        strategy_name: str,
        strategy_label: str,
        entity_type: str,
        period: str,
        base_date: Optional[str],
        context: Dict[str, Any],
        context_hash: str,
        selected_codes: List[str] = None,
        status: str = "success",
        task_id: Optional[str] = None
    ) -> StrategyExecutionHistory:
        """
        创建策略执行历史记录
        
        Args:
            user_id: 用户ID
            strategy_name: 策略名称
            strategy_label: 策略显示名称
            entity_type: 标的类型
            period: 周期
            base_date: 基准日期
            context: 执行参数
            context_hash: 参数哈希
            selected_codes: 筛选结果代码列表
            status: 执行状态 (running/success/failed/cancelled)
            task_id: 任务ID（running状态时必填）
            
        Returns:
            创建的历史记录
        """
        history = StrategyExecutionHistory(
            user_id=user_id,
            strategy_name=strategy_name,
            strategy_label=strategy_label,
            entity_type=entity_type,
            period=period,
            base_date=base_date,
            context_json=json.dumps(context, ensure_ascii=False),
            context_hash=context_hash,
            result_codes=json.dumps(selected_codes or [], ensure_ascii=False),
            result_count=len(selected_codes or []),
            status=status,
            task_id=task_id,
            created_at=datetime.now()
        )
        
        return strategy_history_dao.create(history)

    def get_history_list(
        self,
        user_id: str,
        entity_type: Optional[str] = None,
        period: Optional[str] = None,
        strategy_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        获取用户的策略执行历史列表
        
        Args:
            user_id: 用户ID
            entity_type: 标的类型筛选
            period: 周期筛选
            strategy_name: 策略名称筛选
            page: 页码
            page_size: 每页数量
            
        Returns:
            (历史记录列表, 总数)
        """
        records, total = strategy_history_dao.list_by_user(
            user_id=user_id,
            entity_type=entity_type,
            period=period,
            strategy_name=strategy_name,
            page=page,
            page_size=page_size
        )
        
        # 转换为字典格式，包含完整详情字段
        items = []
        for record in records:
            # 解析context和result_codes
            context = {}
            result_codes = []
            try:
                if record.context_json:
                    context = json.loads(record.context_json)
                if record.result_codes:
                    result_codes = json.loads(record.result_codes)
            except Exception:
                pass
            
            items.append({
                "id": record.id,
                "strategy_name": record.strategy_name,
                "strategy_label": record.strategy_label,
                "entity_type": record.entity_type,
                "period": record.period,
                "base_date": record.base_date,
                "context": context,
                "context_hash": record.context_hash,
                "result_codes": result_codes,
                "result_count": record.result_count,
                "status": record.status,
                "task_id": record.task_id,
                "created_at": record.created_at.strftime("%Y-%m-%d %H:%M:%S") if record.created_at else None
            })
        
        return items, total

    def get_history_detail(
        self,
        history_id: int,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        获取策略执行历史详情
        
        Args:
            history_id: 历史记录ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            历史记录详情，如果不存在或无权限则返回None
        """
        record = strategy_history_dao.find_by_id(history_id)
        
        if not record:
            return None
        
        # 权限验证
        if record.user_id != user_id:
            return None
        
        # 解析JSON字段
        context = json.loads(record.context_json) if record.context_json else {}
        result_codes = json.loads(record.result_codes) if record.result_codes else []
        
        return {
            "strategy_name": record.strategy_name,
            "strategy_label": record.strategy_label,
            "entity_type": record.entity_type,
            "period": record.period,
            "base_date": record.base_date,
            "context": context,
            "context_hash": record.context_hash,
            "result_codes": result_codes,
            "result_count": record.result_count,
            "status": record.status,
            "created_at": record.created_at.strftime("%Y-%m-%d %H:%M:%S") if record.created_at else None
        }

    def delete_history_by_hash(self, context_hash: str, user_id: str) -> bool:
        """
        根据context_hash删除策略执行历史记录
        
        Args:
            context_hash: 参数哈希值
            user_id: 用户ID（用于权限验证）
            
        Returns:
            是否删除成功
        """
        return strategy_history_dao.delete_by_context_hash(context_hash, user_id)

    def delete_history(self, history_id: int, user_id: str) -> bool:
        """
        根据ID删除策略执行历史记录
        
        Args:
            history_id: 记录ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            是否删除成功
        """
        return strategy_history_dao.delete(history_id, user_id)


# 全局服务实例
strategy_history_service = StrategyHistoryService()
