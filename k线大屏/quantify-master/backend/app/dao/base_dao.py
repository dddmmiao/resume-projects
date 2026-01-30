"""
基础数据访问层组件 - SQLModel优化版本
提供通用的DAO功能，支持高性能的数据库操作
"""
from typing import Type

from loguru import logger
from sqlmodel import update

from app.models import db_session_context


class BaseDAO:
    """基础DAO功能"""
    
    @staticmethod
    def clear_hot_data(model_class: Type) -> int:
        """
        清空指定模型的热度数据字段
        
        Args:
            model_class: 模型类
            
        Returns:
            影响的记录数（-1表示未知但执行成功）
        """
        try:
            # 🚀 SQLModel优化：使用上下文管理器和update语句
            with db_session_context() as db:
                # 只更新有热度数据的记录（避免无效更新）
                stmt = update(model_class).where(
                    model_class.hot_rank.isnot(None)
                ).values(
                    hot_rank=None,
                    hot_score=None,
                    hot_date=None,
                    hot_concept=None,
                    hot_rank_reason=None
                )
                
                # 执行批量更新
                result = db.exec(stmt)
                # rowcount可能返回-1（未知），使用-1表示执行成功但行数未知
                affected_rows = result.rowcount if hasattr(result, 'rowcount') else -1
                db.commit()
                
                logger.info(f"清空热度字段成功: {model_class.__tablename__}, 影响行数: {affected_rows}")
                return affected_rows if affected_rows >= 0 else -1
        except Exception as e:
            logger.error(f"清空热度数据失败: {model_class.__tablename__}, 错误: {e}")
            raise  # 抛出异常让调用方知道清空失败


# 创建全局实例
base_dao = BaseDAO()
