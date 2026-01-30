"""
表工厂 - 提供统一的表模型获取接口
"""

from datetime import datetime, date
from typing import Type, List, Union

from ..management.dynamic_table_manager import DynamicTableManager


class TableFactory:
    """表工厂类 - 提供统一的表模型获取接口"""

    @staticmethod
    def get_stock_kline_table(year: int) -> Type:
        """获取股票K线表模型"""
        from app.constants.table_types import TableTypes
        return DynamicTableManager.get_or_create_table_model(TableTypes.STOCK, year)

    @staticmethod
    def get_convertible_bond_kline_table(year: int) -> Type:
        """获取可转债K线表模型"""
        from app.constants.table_types import TableTypes
        return DynamicTableManager.get_or_create_table_model(TableTypes.CONVERTIBLE_BOND, year)

    @staticmethod
    def get_concept_kline_table(year: int) -> Type:
        """获取概念指数K线表模型"""
        from app.constants.table_types import TableTypes
        return DynamicTableManager.get_or_create_table_model(TableTypes.CONCEPT, year)

    @staticmethod
    def get_industry_kline_table(year: int) -> Type:
        """获取行业指数K线表模型"""
        from app.constants.table_types import TableTypes
        return DynamicTableManager.get_or_create_table_model(TableTypes.INDUSTRY, year)

    @staticmethod
    def get_table_by_date(table_type: str, trade_date: Union[str, date]) -> Type:
        """根据交易日期获取表模型"""
        if isinstance(trade_date, str):
            # 支持 YYYYMMDD 和 YYYY-MM-DD 格式
            if "-" in trade_date:
                year = int(trade_date[:4])
            else:
                year = int(trade_date[:4])
        else:
            year = trade_date.year

        return DynamicTableManager.get_or_create_table_model(table_type, year)

    @staticmethod
    def get_tables_for_date_range(
            table_type: str, start_date: Union[str, date], end_date: Union[str, date]
    ) -> List[Type]:
        """获取日期范围内的所有表模型"""
        # 转换日期格式并获取年份范围
        if isinstance(start_date, str):
            start_year = int(start_date[:4])
        else:
            start_year = start_date.year
            
        if isinstance(end_date, str):
            end_year = int(end_date[:4])
        else:
            end_year = end_date.year
        
        # 获取年份范围内的所有表模型
        models = []
        for year in range(start_year, end_year + 1):
            try:
                model = DynamicTableManager.get_or_create_table_model(table_type, year)
                models.append(model)
            except ValueError:
                continue  # 跳过无效年份
        return models

    @staticmethod
    def get_current_year_table(table_type: str) -> Type:
        """获取当前年份的表模型"""
        current_year = datetime.now().year
        return DynamicTableManager.get_or_create_table_model(table_type, current_year)

    @staticmethod
    def get_table_model(table_type: str, year: int) -> Type:
        """
        通用的表模型获取方法
        
        Args:
            table_type: 表类型 ('stock', 'convertible_bond', 'concept', 'industry')
            year: 年份
            
        Returns:
            SQLAlchemy模型类
        """
        return DynamicTableManager.get_or_create_table_model(table_type, year)

    @staticmethod
    def get_table_type_from_model(table_model: Type) -> str:
        """
        从表模型获取表类型
        
        Args:
            table_model: SQLAlchemy模型类
            
        Returns:
            表类型字符串 ('stock', 'convertible_bond', 'concept', 'industry')
        """
        # 直接要求 _table_type 属性存在，不允许回退
        if not hasattr(table_model, '_table_type'):
            raise AttributeError(
                f"表模型 {table_model.__name__} 缺少 _table_type 属性，"
                f"请检查动态表模型是否正确创建"
            )
        
        return table_model._table_type


# 全局实例
table_factory = TableFactory()


