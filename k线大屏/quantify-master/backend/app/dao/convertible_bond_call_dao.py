"""
可转债赎回信息数据访问层 (DAO) - SQLModel优化版本
负责可转债赎回相关数据的数据库操作，提供高性能的查询功能
"""

from typing import List, Dict, Any, Optional

from loguru import logger

from .dao_config import DAOConfig
from .query_utils import query_utils
from ..models import ConvertibleBondCall


class ConvertibleBondCallDAO:
    """可转债赎回信息数据访问对象"""

    @staticmethod
    def get_call_details_by_ts_code(ts_code: str) -> List[Dict[str, Any]]:
        """
        获取可转债赎回详细信息
        
        Args:
            ts_code: 可转债代码
            
        Returns:
            赎回详细信息列表
        """
        try:
            return query_utils.get_all_records(
                model_class=ConvertibleBondCall,
                filters={"ts_code": ts_code}
            )
        except Exception as e:
            logger.warning(f"获取赎回详细信息失败 - {ts_code}: {e}")
            return []

    @staticmethod
    def sync_convertible_bond_call_data(
            call_data_list: List[Dict[str, Any]],
            batch_size: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        同步可转债赎回数据
        
        Args:
            call_data_list: 赎回数据列表
            batch_size: 批处理大小
            
        Returns:
            统计信息和变更集
        """
        if not call_data_list:
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": 0
            })

        try:
            from ..dao.utils.batch_operations import batch_operations

            # 使用 MySQL 生成式 upsert，避免唯一键冲突导致的事务回滚
            # bulk_upsert_mysql_generated 内部已管理数据库会话和事务
            stats = batch_operations.bulk_upsert_mysql_generated(
                table_model=ConvertibleBondCall,
                data=call_data_list,
                batch_size=batch_size or DAOConfig.DEFAULT_BATCH_SIZE,
            )
            return DAOConfig.format_upsert_result(stats)

        except Exception as e:
            logger.error(f"同步可转债赎回数据失败: {e}")
            # 不抛出异常，返回失败结果
            return DAOConfig.format_upsert_result({
                "inserted": 0,
                "updated": 0,
                "total": len(call_data_list) if call_data_list else 0
            })


# 创建全局DAO实例
convertible_bond_call_dao = ConvertibleBondCallDAO()
