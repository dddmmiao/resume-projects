"""
统一筛选器处理器 - SQLModel优化版本
使用实体适配器模式处理不同实体的筛选逻辑，支持高效的集合操作和缓存优化
"""

from typing import List, Optional, Dict, Any, Set

from loguru import logger

from ..adapters.entity_adapter import EntityAdapterFactory


class FilterProcessor:
    """统一筛选器处理器 - SQLModel优化版本"""
    
    # 🚀 常量定义：支持的实体类型
    SUPPORTED_ENTITY_TYPES = frozenset({
        "stock", "concept", "industry", "convertible_bond"
    })
    
    # 🚀 常量定义：筛选限制映射
    FILTER_RESTRICTIONS = {
        "concept": {"concepts"},  # 概念实体不支持按概念筛选
        "industry": {"industries"}  # 行业实体不支持按行业筛选
    }
    
    @staticmethod
    def build_entity_filters(
        table_type: str,
        concepts: Optional[List[str]] = None,
        industries: Optional[List[str]] = None,
        strategy_codes: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        为指定实体构建筛选条件
        
        Args:
            table_type: 实体类型 (stock/concept/industry/convertible_bond)
            concepts: 概念代码列表
            industries: 行业代码列表
            strategy_codes: 策略筛选的代码列表
            
        Returns:
            筛选条件字典，None表示无筛选条件
        """
        adapter = EntityAdapterFactory.get_adapter(table_type)
        allowed_codes: Optional[Set[str]] = None
        
        # 1. 策略筛选优先（如果有的话）
        if strategy_codes:
            allowed_codes = set(strategy_codes)
            logger.info(f"策略筛选({table_type}): {len(strategy_codes)}个代码")
        
        # 🚀 优化：使用统一的筛选处理逻辑
        # 2. 概念筛选
        if concepts:
            allowed_codes = FilterProcessor._apply_filter(
                allowed_codes, adapter.convert_concept_filter_codes(concepts),
                "概念", table_type
            )
            if allowed_codes is False:  # 使用False表示空筛选结果
                return FilterProcessor._empty_filter()
        
        # 3. 行业筛选
        if industries:
            allowed_codes = FilterProcessor._apply_filter(
                allowed_codes, adapter.convert_industry_filter_codes(industries),
                "行业", table_type
            )
            if allowed_codes is False:  # 使用False表示空筛选结果
                return FilterProcessor._empty_filter()
        
        # 4. 构建最终筛选条件
        if allowed_codes is None:
            return None  # 无筛选条件
        
        if not allowed_codes:
            return FilterProcessor._empty_filter()
        
        # 获取实体的代码字段名
        code_field = adapter.get_entity_code_field()
        return {code_field: list(allowed_codes)}
    
    @staticmethod
    def _apply_filter(
        current_codes: Optional[Set[str]], 
        filter_codes: List[str], 
        filter_type: str, 
        table_type: str
    ) -> Optional[Set[str]]:
        """应用单个筛选器的通用逻辑
        
        Args:
            current_codes: 当前允许的代码集合
            filter_codes: 筛选器返回的代码列表
            filter_type: 筛选器类型（用于日志）
            table_type: 实体类型
            
        Returns:
            筛选后的代码集合，False表示无匹配结果
        """
        if not filter_codes:
            logger.info(f"{filter_type}筛选({table_type})无匹配结果")
            return False  # 使用False表示空筛选结果
        
        filter_codes_set = set(filter_codes)
        if current_codes is not None:
            result = current_codes & filter_codes_set
            if not result:
                logger.info(f"多重筛选({table_type})无匹配结果")
                return False
            allowed_codes = result
        else:
            allowed_codes = filter_codes_set
        
        logger.info(f"{filter_type}筛选({table_type}): {len(filter_codes)}个代码")
        return allowed_codes
    
    @staticmethod
    def _empty_filter() -> Dict[str, Any]:
        """返回空筛选结果"""
        return {"ts_code": []}
    
    @staticmethod
    def validate_filter_combination(
        table_type: str,
        concepts: Optional[List[str]] = None,
        industries: Optional[List[str]] = None
    ) -> bool:
        """
        验证筛选条件组合是否合理 - 优化版本
        
        Args:
            table_type: 实体类型
            concepts: 概念筛选
            industries: 行业筛选
            
        Returns:
            True表示组合合理，False表示不合理
        """
        # 🚀 优化：使用常量映射进行验证
        restrictions = FilterProcessor.FILTER_RESTRICTIONS.get(table_type, set())
        
        if "concepts" in restrictions and concepts:
            logger.warning("概念实体不支持按概念筛选")
            return False
        
        if "industries" in restrictions and industries:
            logger.warning("行业实体不支持按行业筛选")
            return False
        
        return True
