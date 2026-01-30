"""
动态表管理器 - 简洁版本基于SQLModel继承
自动生成按年份分表的K线数据模型
"""

from typing import Type, Dict

from loguru import logger
from sqlalchemy import Index, UniqueConstraint
from sqlmodel import SQLModel

from app.constants.table_types import TableTypes


class DynamicTableManager:
    """动态表管理器 - 简洁版本，利用SQLModel继承机制"""

    # 缓存已创建的模型类
    _model_cache: Dict[str, Type] = {}

    # 支持的表类型 - 保持现有格式
    TABLE_TYPES = {
        TableTypes.STOCK: {
            "table_prefix": "stock_klines",
            "index_prefix": "idx_stock",
            "base_class_import": "app.models.klines.stock_kline.StockKlineDataBase",
            "class_prefix": "Stock",
        },
        TableTypes.CONVERTIBLE_BOND: {
            "table_prefix": "convertible_bond_klines",
            "index_prefix": "idx_convertible_bond",
            "base_class_import": "app.models.klines.convertible_bond_kline.ConvertibleBondKlineDataBase",
            "class_prefix": "ConvertibleBond",
        },
        TableTypes.CONCEPT: {
            "table_prefix": "concept_klines",
            "index_prefix": "idx_concept",
            "base_class_import": "app.models.klines.concept_kline.ConceptKlineDataBase",
            "class_prefix": "Concept",
        },
        TableTypes.INDUSTRY: {
            "table_prefix": "industry_klines",
            "index_prefix": "idx_industry",
            "base_class_import": "app.models.klines.industry_kline.IndustryKlineDataBase",
            "class_prefix": "Industry",
        },
    }

    @classmethod
    def get_or_create_table_model(cls, table_type: str, year: int) -> Type[SQLModel]:
        """
        获取或创建指定类型和年份的表模型 - 简洁版本

        Args:
            table_type: 表类型 ('stock', 'convertible_bond', 'concept', 'industry')
            year: 年份

        Returns:
            SQLModel表模型类
        """
        cache_key = f"{table_type}_{year}"

        # 检查缓存
        if cache_key in cls._model_cache:
            return cls._model_cache[cache_key]

        # 验证表类型
        if table_type not in cls.TABLE_TYPES:
            raise ValueError(f"不支持的表类型: {table_type}")

        # 验证年份
        if not (1900 <= year <= 9999):
            raise ValueError(f"无效的年份: {year}")

        # 🚀 核心：使用简洁的SQLModel继承方案创建动态表
        model_class = cls._create_dynamic_model(table_type, year)

        # 缓存模型
        cls._model_cache[cache_key] = model_class

        # 只在发生错误时才输出详细日志，正常情况下只输出汇总信息
        # logger.info(f"✅ 动态表创建成功: {cache_key} -> {model_class.__name__}")
        return model_class

    @classmethod
    def _create_dynamic_model(cls, table_type: str, year: int) -> Type[SQLModel]:
        """创建动态表模型 - 基于基类表结构但避免字段继承冲突"""
        config = cls.TABLE_TYPES[table_type]
        
        # 1. 动态导入基类
        base_class = cls._import_base_class(config["base_class_import"])
        
        # 2. 生成类名和表名 - 保持现有格式
        class_name = f"{config['class_prefix']}Klines{year}"
        table_name = f"{config['table_prefix']}_{year}"
        
        # 3. 创建索引和约束 - 保持现有格式和命名
        indexes_and_constraints = cls._create_table_indexes_and_constraints(config["index_prefix"], year)
        
        # 4. 🚀 核心：创建基于基类表结构但独立的动态表模型
        return cls._create_dynamic_class(base_class, table_name, class_name, table_type, year, indexes_and_constraints)

    @classmethod
    def _create_dynamic_class(cls, base_class: Type[SQLModel], table_name: str, class_name: str, table_type: str, year: int, indexes_and_constraints: list = None) -> Type[SQLModel]:
        """创建动态类，使用SQLModel的标准继承方式"""
        if indexes_and_constraints is None:
            indexes_and_constraints = []

        from sqlalchemy import Index
        
        # 🔧 构建完整的__table_args__，包含索引
        table_args = []
        
        # 添加标准索引
        index_prefix = f"{table_type.replace('_klines', '')}_klines"
        table_args.extend([
            Index(f"{index_prefix}_{year}_code_date", "ts_code", "trade_date"),
            Index(f"{index_prefix}_{year}_code_period", "ts_code", "period"), 
            Index(f"{index_prefix}_{year}_date_period", "trade_date", "period"),
            Index(f"{index_prefix}_{year}_unique_record", "ts_code", "period", "trade_date", unique=True),
        ])
        
        # 添加配置项
        table_args.append({"extend_existing": True})
        
        # 🚀 使用标准的SQLModel类继承方式
        class DynamicModel(base_class, table=True):
            __tablename__ = table_name
            __table_args__ = tuple(table_args)
            
            # 添加元数据
            _table_type: str = table_type
            _year: int = year
        
        # 设置类名和模块
        DynamicModel.__name__ = class_name
        DynamicModel.__qualname__ = class_name
        DynamicModel.__module__ = base_class.__module__
        
        return DynamicModel


    @classmethod
    def _import_base_class(cls, import_path: str) -> Type[SQLModel]:
        """动态导入基类"""
        module_path, class_name = import_path.rsplit(".", 1)
        
        # 动态导入模块
        import importlib
        module = importlib.import_module(module_path)
        base_class = getattr(module, class_name)
        
        return base_class


    @classmethod
    def _create_table_indexes_and_constraints(cls, index_prefix: str, year: int) -> list:
        """创建表索引和约束 - 保持现有格式和命名，确保批量操作能检测到唯一键"""
        return [
            # 🔧 重要：添加 UniqueConstraint 确保批量操作能检测到唯一键约束
            UniqueConstraint('ts_code', 'period', 'trade_date', name=f'uk_{index_prefix}_{year}'),
            # 保持原有索引格式
            Index(f'{index_prefix}_code_date_{year}', 'ts_code', 'trade_date'),
            Index(f'{index_prefix}_code_period_{year}', 'ts_code', 'period'), 
            Index(f'{index_prefix}_date_period_{year}', 'trade_date', 'period'),
            Index(f'{index_prefix}_unique_{year}', 'ts_code', 'period', 'trade_date', unique=True),
        ]

    @classmethod
    def get_table_name(cls, table_type: str, year: int) -> str:
        """获取表名 - 工具方法"""
        if table_type not in cls.TABLE_TYPES:
            raise ValueError(f"不支持的表类型: {table_type}")
        config = cls.TABLE_TYPES[table_type]
        return f"{config['table_prefix']}_{year}"

    @classmethod
    def clear_cache(cls):
        """清空模型缓存"""
        cleared_count = len(cls._model_cache)
        cls._model_cache.clear()
        logger.info(f"动态表模型缓存已清空，清理了 {cleared_count} 个缓存的表模型")

    @classmethod
    def get_cache_info(cls) -> dict:
        """获取缓存信息"""
        return {
            "cached_models": len(cls._model_cache),
            "cached_tables": list(cls._model_cache.keys())
        }
    
    @classmethod
    def force_recreate_all_cached_models(cls) -> dict:
        """强制重新创建所有已缓存的模型（用于配置更新后）"""
        old_cache = cls._model_cache.copy()
        cls.clear_cache()
        
        recreated = {}
        for cache_key in old_cache.keys():
            try:
                table_type, year = cache_key.split('_', 1)
                year = int(year)
                new_model = cls.get_or_create_table_model(table_type, year)
                recreated[cache_key] = {
                    "success": True,
                    "model_name": new_model.__name__,
                    "table_name": new_model.__tablename__ if hasattr(new_model, '__tablename__') else None,
                    "has_table": hasattr(new_model, '__table__') and new_model.__table__ is not None
                }
            except Exception as e:
                recreated[cache_key] = {
                    "success": False,
                    "error": str(e)
                }
        
        return {
            "total_recreated": len(old_cache),
            "results": recreated
        }
