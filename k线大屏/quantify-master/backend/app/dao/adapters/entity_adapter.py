"""
实体适配器模块 - SQLModel优化版本
处理不同实体类型的筛选逻辑和特殊需求，提供统一的实体操作接口
支持高性能的代码转换和筛选功能，优化Service层缓存调用
"""

from abc import ABC, abstractmethod
from functools import wraps
from typing import List, Callable

from loguru import logger


def handle_adapter_exceptions(operation_name: str):
    """适配器异常处理装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> List[str]:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"{operation_name}失败: {e}")
                return []
        return wrapper
    return decorator


class EntityAdapter(ABC):
    """实体适配器基类"""
    
    @abstractmethod
    def convert_concept_filter_codes(self, concept_codes: List[str]) -> List[str]:
        """
        将概念关联的股票代码转换为当前实体的代码
        
        Args:
            concept_codes: 概念代码列表
            
        Returns:
            当前实体的代码列表
        """
        pass
    
    @abstractmethod  
    def convert_industry_filter_codes(self, industry_codes: List[str]) -> List[str]:
        """
        将行业关联的股票代码转换为当前实体的代码
        
        Args:
            industry_codes: 行业代码列表
            
        Returns:
            当前实体的代码列表
        """
        pass
    
    def get_entity_code_field(self) -> str:
        """获取实体的代码字段名"""
        return "ts_code"


class StockAdapter(EntityAdapter):
    """股票适配器 - 直接使用股票代码"""
    
    def convert_concept_filter_codes(self, concept_codes: List[str]) -> List[str]:
        """股票：概念直接关联到股票代码"""
        try:
            from ...services.data.concept_service import concept_service
            return concept_service.get_ts_codes_by_concept_codes(concept_codes)
        except Exception as e:
            logger.error(f"股票概念筛选失败: {e}")
            return []
    
    def convert_industry_filter_codes(self, industry_codes: List[str]) -> List[str]:
        """股票：行业直接关联到股票代码"""
        try:
            from ...services.data.industry_service import industry_service
            return industry_service.get_ts_codes_by_industry_codes(industry_codes)
        except Exception as e:
            logger.error(f"股票行业筛选失败: {e}")
            return []


class ConceptAdapter(EntityAdapter):
    """概念适配器 - 通过股票关联"""
    
    def convert_concept_filter_codes(self, concept_codes: List[str]) -> List[str]:
        """概念：不支持概念筛选概念（逻辑上不合理）"""
        logger.warning("概念实体不支持按概念筛选")
        return []
    
    def convert_industry_filter_codes(self, industry_codes: List[str]) -> List[str]:
        """概念：通过行业->股票->概念的关联获取概念代码"""
        try:
            from ...services.data.industry_service import industry_service
            from ...services.data.concept_service import concept_service
            
            # 1. 获取行业关联的股票代码
            stock_codes = industry_service.get_ts_codes_by_industry_codes(industry_codes)
            if not stock_codes:
                return []
            
            # 2. 通过股票获取相关概念代码
            concept_codes = concept_service.get_concept_codes_by_stock_codes(stock_codes)
            return concept_codes
            
        except Exception as e:
            logger.error(f"概念行业筛选失败: {e}")
            return []


class IndustryAdapter(EntityAdapter):
    """行业适配器 - 通过股票关联"""
    
    def convert_concept_filter_codes(self, concept_codes: List[str]) -> List[str]:
        """行业：通过概念->股票->行业的关联获取行业代码"""
        try:
            from ...services.data.concept_service import concept_service
            from ...services.data.industry_service import industry_service
            
            # 1. 获取概念关联的股票代码
            stock_codes = concept_service.get_ts_codes_by_concept_codes(concept_codes)
            if not stock_codes:
                return []
            
            # 2. 通过股票获取相关行业代码
            industry_codes = industry_service.get_industry_codes_by_stock_codes(stock_codes)
            return industry_codes
            
        except Exception as e:
            logger.error(f"行业概念筛选失败: {e}")
            return []
    
    def convert_industry_filter_codes(self, industry_codes: List[str]) -> List[str]:
        """行业：不支持行业筛选行业（逻辑上不合理）"""
        logger.warning("行业实体不支持按行业筛选")
        return []


class ConvertibleBondAdapter(EntityAdapter):
    """可转债适配器 - 需要特殊的股票代码转换"""
    
    @handle_adapter_exceptions("可转债概念筛选")
    def convert_concept_filter_codes(self, concept_codes: List[str]) -> List[str]:
        """可转债：概念->股票->可转债的转换"""
        from ...services.data.concept_service import concept_service
        
        # 1. 获取概念关联的股票代码
        stock_codes = concept_service.get_ts_codes_by_concept_codes(concept_codes)
        if not stock_codes:
            return []
        
        # 2. 将股票代码转换为可转债代码
        return self._convert_stock_codes_to_bond_codes(stock_codes)
    
    @handle_adapter_exceptions("可转债行业筛选")
    def convert_industry_filter_codes(self, industry_codes: List[str]) -> List[str]:
        """可转债：行业->股票->可转债的转换"""
        from ...services.data.industry_service import industry_service
        
        # 1. 获取行业关联的股票代码
        stock_codes = industry_service.get_ts_codes_by_industry_codes(industry_codes)
        if not stock_codes:
            return []
        
        # 2. 将股票代码转换为可转债代码
        return self._convert_stock_codes_to_bond_codes(stock_codes)
    
    @handle_adapter_exceptions("股票代码转可转债代码")
    def _convert_stock_codes_to_bond_codes(self, stock_codes: List[str]) -> List[str]:
        """将股票代码转换为可转债代码（使用Service层缓存）"""
        from ...services.data.convertible_bond_service import convertible_bond_service
        return convertible_bond_service.get_bond_codes_by_stock_codes(stock_codes)


class EntityAdapterFactory:
    """实体适配器工厂"""
    
    _adapters = {
        "stock": StockAdapter(),
        "concept": ConceptAdapter(), 
        "industry": IndustryAdapter(),
        "convertible_bond": ConvertibleBondAdapter(),
    }
    
    @classmethod
    def get_adapter(cls, table_type: str) -> EntityAdapter:
        """
        根据表类型获取对应的实体适配器
        
        Args:
            table_type: 表类型
            
        Returns:
            对应的实体适配器
        """
        adapter = cls._adapters.get(table_type)
        if not adapter:
            logger.warning(f"未找到表类型 {table_type} 的适配器，使用股票适配器")
            return cls._adapters["stock"]
        return adapter
