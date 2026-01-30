"""
DAO层配置模块 - SQLModel优化版本
提供统一的DAO层配置参数和格式化方法
"""


class DAOConfig:
    """DAO层统一配置"""
    
    # 🚀 批量操作配置
    DEFAULT_BATCH_SIZE = 500
    
    @staticmethod
    def format_upsert_result(stats: dict) -> dict:
        """格式化批量操作结果
        
        Args:
            stats: 批量操作统计结果
            
        Returns:
            标准化的结果格式
        """
        return {
            "inserted_count": int(stats.get("inserted", 0)),
            "updated_count": int(stats.get("updated", 0)),
            "total_count": int(stats.get("total", 0))
        }
    
    
    @staticmethod
    def format_query_result(data: list, total: int = None) -> dict:
        """格式化查询结果
        
        Args:
            data: 查询数据
            total: 总数量，如果不提供则使用len(data)
            
        Returns:
            标准化的查询结果格式
        """
        return {
            "data": data,
            "total": total if total is not None else len(data)
        }

