"""
股票K线数据访问层 (DAO) - SQLModel优化版本
负责股票K线数据的数据库操作，提供高效的分表批量操作
"""
from typing import List, Dict, Any

from app.constants.table_types import TableTypes
from .utils.batch_operations import batch_operations


class StockKlineDAO:
    """股票K线数据访问对象"""

    @staticmethod
    def bulk_upsert_stock_kline_data(
            data: List[Dict[str, Any]],
            batch_size: int = 500
    ) -> Dict[str, int]:
        """
        批量插入或更新股票K线数据
        
        Args:
            data: 要upsert的股票K线数据列表
            batch_size: 批处理大小
            
        Returns:
            {"inserted_count": int, "updated_count": int}
        """
        return batch_operations.upsert_kline_partitioned(
            data=data,
            table_type=TableTypes.STOCK,
            batch_size=batch_size
        )


# 创建全局实例
stock_kline_dao = StockKlineDAO()
