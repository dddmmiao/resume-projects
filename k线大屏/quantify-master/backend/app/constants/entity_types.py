"""
实体类型常量定义
"""

class EntityTypes:
    """实体类型常量"""
    
    # 业务实体类型
    STOCK = "stock"
    BOND = "bond"  # 可转债
    CONCEPT = "concept"
    INDUSTRY = "industry"
    
    # 所有支持的实体类型列表
    ALL_TYPES = [STOCK, BOND, CONCEPT, INDUSTRY]
    
    # 实体类型到中文名称的映射
    CHINESE_NAMES = {
        STOCK: "股票",
        BOND: "可转债",
        CONCEPT: "概念",
        INDUSTRY: "行业"
    }
    
    # 实体类型到表类型的映射
    ENTITY_TO_TABLE_TYPE = {
        STOCK: "stock",
        BOND: "convertible_bond",
        CONCEPT: "concept",
        INDUSTRY: "industry"
    }
    
    # 表类型到实体类型的映射（反向映射）
    TABLE_TYPE_TO_ENTITY = {
        "stock": STOCK,
        "convertible_bond": BOND,
        "concept": CONCEPT,
        "industry": INDUSTRY
    }
    
    @classmethod
    def is_valid_entity_type(cls, entity_type: str) -> bool:
        """验证实体类型是否有效"""
        return entity_type in cls.ALL_TYPES
    
    @classmethod
    def get_chinese_name(cls, entity_type: str) -> str:
        """获取实体类型的中文名称"""
        return cls.CHINESE_NAMES.get(entity_type, entity_type)
    
    @classmethod
    def entity_type_to_table_type(cls, entity_type: str) -> str:
        """将实体类型转换为表类型"""
        return cls.ENTITY_TO_TABLE_TYPE.get(entity_type, entity_type)
    
    @classmethod
    def get_all_chinese_names(cls) -> dict:
        """获取所有实体类型的中文名称映射"""
        return cls.CHINESE_NAMES.copy()
