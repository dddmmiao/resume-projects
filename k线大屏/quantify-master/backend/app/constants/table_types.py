"""
表类型常量定义
"""
from typing import Tuple, Type


class TableTypes:
    """表类型常量"""
    
    # K线数据表类型
    STOCK = "stock"
    CONVERTIBLE_BOND = "convertible_bond"
    CONCEPT = "concept"
    INDUSTRY = "industry"
    
    # 所有支持的表类型列表
    ALL_TYPES = [STOCK, CONVERTIBLE_BOND, CONCEPT, INDUSTRY]
    
    # 表类型到中文名称的映射
    CHINESE_NAMES = {
        STOCK: "股票",
        CONVERTIBLE_BOND: "可转债",
        CONCEPT: "概念",
        INDUSTRY: "行业"
    }
    
    # 表类型到实体代码字段的映射
    ENTITY_CODE_FIELDS = {
        STOCK: "ts_code",
        CONVERTIBLE_BOND: "ts_code",
        CONCEPT: "concept_code",
        INDUSTRY: "industry_code",
    }
    
    # 表类型到名称字段的映射
    NAME_FIELDS = {
        STOCK: "name",
        CONVERTIBLE_BOND: "bond_short_name",
        CONCEPT: "concept_name",
        INDUSTRY: "industry_name",
    }
    
    @classmethod
    def is_valid_table_type(cls, table_type: str) -> bool:
        """验证表类型是否有效"""
        return table_type in cls.ALL_TYPES
    
    @classmethod
    def get_chinese_name(cls, table_type: str) -> str:
        """获取表类型的中文名称"""
        return cls.CHINESE_NAMES.get(table_type, table_type)
    
    @classmethod
    def get_name_field(cls, table_type: str) -> str:
        """获取表类型对应的名称字段"""
        return cls.NAME_FIELDS.get(table_type)
    
    @classmethod
    def entity_type_to_table_type(cls, entity_type: str) -> str:
        """将实体类型转换为表类型（需要导入 EntityTypes）"""
        from .entity_types import EntityTypes
        return EntityTypes.entity_type_to_table_type(entity_type)
    
    @classmethod
    def table_type_to_entity_type(cls, table_type: str) -> str:
        """将表类型转换为实体类型"""
        from .entity_types import EntityTypes
        return EntityTypes.TABLE_TYPE_TO_ENTITY.get(table_type)
        
    @classmethod
    def get_model_info(cls, table_type: str) -> Tuple[Type, str]:
        """
        根据表类型获取模型类和实体代码字段
        
        Args:
            table_type: 表类型
            
        Returns:
            模型类和实体代码字段的元组
            
        Raises:
            ValueError: 如果表类型不支持
        """
        if table_type not in cls.ENTITY_CODE_FIELDS:
            raise ValueError(f"不支持的表类型: {table_type}")
        
        # 延迟导入模型类以避免循环导入
        if table_type == cls.STOCK:
            from ..models.entities.stock import Stock
            return Stock, cls.ENTITY_CODE_FIELDS[table_type]
        elif table_type == cls.CONVERTIBLE_BOND:
            from ..models.entities.convertible_bond import ConvertibleBond
            return ConvertibleBond, cls.ENTITY_CODE_FIELDS[table_type]
        elif table_type == cls.CONCEPT:
            from ..models.entities.concept import Concept
            return Concept, cls.ENTITY_CODE_FIELDS[table_type]
        elif table_type == cls.INDUSTRY:
            from ..models.entities.concept import Industry
            return Industry, cls.ENTITY_CODE_FIELDS[table_type]
        else:
            raise ValueError(f"不支持的表类型: {table_type}")
