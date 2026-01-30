"""
策略执行历史 DAO 层
"""

from datetime import datetime
from typing import List, Optional, Tuple

from loguru import logger
from sqlmodel import Session, select, func, desc

from app.models.base.database import engine
from app.models.management.strategy_history import StrategyExecutionHistory


class StrategyHistoryDAO:
    """策略执行历史数据访问对象"""
    
    # 每用户最大保留记录数
    MAX_HISTORY_PER_USER = 100

    def create(self, history: StrategyExecutionHistory) -> StrategyExecutionHistory:
        """
        创建策略执行历史记录（每次都创建新记录）
        
        Args:
            history: 历史记录对象
            
        Returns:
            创建后的历史记录对象
        """
        with Session(engine) as session:
            # 直接创建新记录
            session.add(history)
            session.commit()
            session.refresh(history)
            
            # 清理超出限制的旧记录
            self._cleanup_old_records(session, history.user_id)
            
            return history

    def _cleanup_old_records(self, session: Session, user_id: str) -> None:
        """清理超出限制的旧记录"""
        try:
            # 统计该用户的记录数
            count_query = select(func.count(StrategyExecutionHistory.id)).where(
                StrategyExecutionHistory.user_id == user_id
            )
            total = session.exec(count_query).one()
            
            if total > self.MAX_HISTORY_PER_USER:
                # 查找需要删除的记录ID（最旧的）
                excess_count = total - self.MAX_HISTORY_PER_USER
                old_records_query = (
                    select(StrategyExecutionHistory.id)
                    .where(StrategyExecutionHistory.user_id == user_id)
                    .order_by(StrategyExecutionHistory.created_at.asc())
                    .limit(excess_count)
                )
                old_ids = list(session.exec(old_records_query).all())
                
                if old_ids:
                    # 删除旧记录
                    for old_id in old_ids:
                        old_record = session.get(StrategyExecutionHistory, old_id)
                        if old_record:
                            session.delete(old_record)
                    session.commit()
                    logger.debug(f"清理用户 {user_id} 的 {len(old_ids)} 条旧历史记录")
        except Exception as e:
            logger.warning(f"清理旧历史记录失败: {e}")

    def find_by_id(self, history_id: int) -> Optional[StrategyExecutionHistory]:
        """
        根据ID查询历史记录
        
        Args:
            history_id: 记录ID
            
        Returns:
            历史记录对象
        """
        with Session(engine) as session:
            return session.get(StrategyExecutionHistory, history_id)

    def list_by_user(
        self,
        user_id: str,
        entity_type: Optional[str] = None,
        period: Optional[str] = None,
        strategy_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[StrategyExecutionHistory], int]:
        """
        分页查询用户的策略执行历史（按user_id隔离）
        
        Args:
            user_id: 用户ID
            entity_type: 标的类型（可选筛选）
            period: 周期（可选筛选）
            strategy_name: 策略名称（可选筛选）
            page: 页码，从1开始
            page_size: 每页数量
            
        Returns:
            (历史记录列表, 总数)
        """
        with Session(engine) as session:
            # 构建查询（按user_id筛选，用户间隔离）
            query = select(StrategyExecutionHistory).where(
                StrategyExecutionHistory.user_id == user_id
            )
            count_query = select(func.count(StrategyExecutionHistory.id)).where(
                StrategyExecutionHistory.user_id == user_id
            )
            
            # 标的类型筛选
            if entity_type:
                query = query.where(StrategyExecutionHistory.entity_type == entity_type)
                count_query = count_query.where(StrategyExecutionHistory.entity_type == entity_type)
            
            # 周期筛选
            if period:
                query = query.where(StrategyExecutionHistory.period == period)
                count_query = count_query.where(StrategyExecutionHistory.period == period)
            
            # 策略名称筛选
            if strategy_name:
                query = query.where(StrategyExecutionHistory.strategy_name == strategy_name)
                count_query = count_query.where(StrategyExecutionHistory.strategy_name == strategy_name)
            
            # 总数
            total = session.exec(count_query).one()
            
            # 分页，按创建时间倒序
            offset = (page - 1) * page_size
            query = query.order_by(desc(StrategyExecutionHistory.created_at)).offset(offset).limit(page_size)
            records = list(session.exec(query).all())
            
            return records, total

    def delete(self, history_id: int, user_id: str) -> bool:
        """
        删除历史记录（需要验证用户ID）
        
        Args:
            history_id: 记录ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            是否删除成功
        """
        with Session(engine) as session:
            record = session.get(StrategyExecutionHistory, history_id)
            if record and record.user_id == user_id:
                session.delete(record)
                session.commit()
                return True
            return False

    def delete_all_by_user(self, user_id: str) -> int:
        """
        删除用户的所有历史记录
        
        Args:
            user_id: 用户ID
            
        Returns:
            删除的记录数
        """
        with Session(engine) as session:
            query = select(StrategyExecutionHistory).where(
                StrategyExecutionHistory.user_id == user_id
            )
            records = list(session.exec(query).all())
            count = len(records)
            
            for record in records:
                session.delete(record)
            session.commit()
            
            return count


    def delete_by_context_hash(self, context_hash: str, user_id: str = None) -> bool:
        """
        根据上下文哈希删除历史记录（context_hash唯一）
        
        Args:
            context_hash: 策略参数哈希值
            user_id: 用户ID（可选，用于权限验证）
            
        Returns:
            是否删除成功
        """
        with Session(engine) as session:
            query = select(StrategyExecutionHistory).where(
                StrategyExecutionHistory.context_hash == context_hash
            )
            if user_id:
                query = query.where(StrategyExecutionHistory.user_id == user_id)
            
            record = session.exec(query).first()
            if record:
                session.delete(record)
                session.commit()
                return True
            return False

    def update_by_task_id(
        self,
        task_id: str,
        status: str,
        result_codes: str = "[]",
        result_count: int = 0
    ) -> Optional[str]:
        """
        根据任务ID更新历史记录状态
        
        Args:
            task_id: 任务ID
            status: 新状态
            result_codes: 结果代码JSON
            result_count: 结果数量
            
        Returns:
            更新成功返回context_hash，失败返回None
        """
        with Session(engine) as session:
            record = session.exec(
                select(StrategyExecutionHistory)
                .where(StrategyExecutionHistory.task_id == task_id)
            ).first()
            
            if record:
                record.status = status
                record.result_codes = result_codes
                record.result_count = result_count
                session.add(record)
                session.commit()
                return record.context_hash
            return None

    def get_latest_by_strategy(
        self, 
        strategy_name: str, 
        entity_type: str
    ) -> Optional[StrategyExecutionHistory]:
        """
        根据策略名称和标的类型查询最新的历史记录
        
        Args:
            strategy_name: 策略名称
            entity_type: 标的类型
            
        Returns:
            历史记录对象，不存在返回None
        """
        with Session(engine) as session:
            query = (
                select(StrategyExecutionHistory)
                .where(StrategyExecutionHistory.strategy_name == strategy_name)
                .where(StrategyExecutionHistory.entity_type == entity_type)
                .order_by(desc(StrategyExecutionHistory.created_at))
                .limit(1)
            )
            return session.exec(query).first()



# 全局 DAO 实例
strategy_history_dao = StrategyHistoryDAO()
