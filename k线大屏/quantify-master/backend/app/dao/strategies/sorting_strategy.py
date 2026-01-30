"""
排序策略模块 - SQLModel优化版本
实现不同类型字段的排序策略，支持智能排序和缓存优化
"""

from abc import ABC, abstractmethod
from typing import List, Optional

from loguru import logger

# SQLModel上下文管理器导入
from app.models import db_session_context


class SortingStrategy(ABC):
    """排序策略基类"""
    
    @abstractmethod
    def get_sorted_codes(self, 
                        table_type: str, 
                        sort_by: str, 
                        sort_order: str,
                        sort_period: str = "daily",
                        trade_date: Optional[str] = None,
                        **kwargs) -> Optional[List[str]]:
        """
        获取排序后的代码列表
        
        Args:
            table_type: 表类型
            sort_by: 排序字段
            sort_order: 排序方向
            sort_period: 排序周期
            trade_date: 交易日期
            
        Returns:
            排序后的代码列表，None表示使用数据库原生排序
        """
        pass


class BaseSortingStrategy(SortingStrategy):
    """基础字段排序策略"""
    
    def get_sorted_codes(self, table_type: str, sort_by: str, sort_order: str, 
                        sort_period: str = "daily", trade_date: Optional[str] = None, 
                        **kwargs) -> Optional[List[str]]:
        """基础字段直接在数据库中排序，返回None让查询工具使用ORDER BY"""
        logger.debug(f"使用基础字段排序: {sort_by}")
        return None


class KlineSortingStrategy(SortingStrategy):
    """K线字段排序策略"""
    
    # 🚀 常量定义：安全的排序方向映射
    ORDER_MAPPING = {
        "asc": "ASC",
        "desc": "DESC"
    }
    
    # 🚀 常量定义：允许的排序字段（防止SQL注入）- 与前端和数据库字段匹配
    ALLOWED_SORT_FIELDS = frozenset({
        # === 基础字段（存在于实体表中） ===
        "hot_score",                    # 热度分数
        "name", "bond_short_name", "concept_name", "industry_name",  # 名称字段
        "list_date", "issue_date",      # 日期字段
        "call_countdown",               # 强赎倒计时（计算字段）
        
        # === K线字段（存在于K线表中） ===
        # 基础价格字段
        "open", "high", "low", "close", "pre_close", "change",
        # 成交数据
        "vol", "amount", "pct_chg", "volatility", "intraperiod_pct_chg",
        # 市值换手率（概念/行业专用）
        "total_mv", "turnover_rate",
        
        # === 竞价字段（股票K线表专用） ===
        "auction_vol", "auction_amount", "auction_turnover_rate", 
        "auction_volume_ratio", "auction_pct_chg"
    })
    
    def get_sorted_codes(self, table_type: str, sort_by: str, sort_order: str,
                        sort_period: str = "daily", trade_date: Optional[str] = None,
                        **kwargs) -> Optional[List[str]]:
        """从K线表获取排序后的codes"""
        if not trade_date:
            logger.warning("K线字段排序需要 trade_date 参数")
            return None
            
        try:
            # 🚀 安全检查：验证排序字段
            if sort_by not in KlineSortingStrategy.ALLOWED_SORT_FIELDS:
                logger.warning(f"不支持的排序字段: {sort_by}")
                return None
            
            # 🚀 优化：使用延迟导入避免循环依赖
            from app.models.base.table_factory import TableFactory
            from app.dao.query_utils import QueryUtils
            from sqlmodel import select, and_
            
            # 确定查询周期
            actual_period = QueryUtils._determine_kline_period(sort_by, sort_period)
            
            # 获取K线表模型
            year = int(trade_date[:4])
            table_model = TableFactory.get_table_model(table_type, year)
            if not table_model:
                logger.warning(f"未找到{year}年的{table_type}表模型")
                return None
            
            # 🚀 SQLModel优化：使用安全的查询构建
            order_clause = KlineSortingStrategy.ORDER_MAPPING.get(sort_order.lower(), "ASC")
            
            # 构建SQLModel查询
            sort_field = getattr(table_model, sort_by)
            stmt = select(table_model.ts_code).where(
                and_(
                    table_model.trade_date == trade_date,
                    table_model.period == actual_period,
                    sort_field.is_not(None)
                )
            )
            
            # 应用排序
            if order_clause == "DESC":
                stmt = stmt.order_by(sort_field.desc())
            else:
                stmt = stmt.order_by(sort_field.asc())
            
            # 🚀 SQLModel优化：统一使用上下文管理器
            with db_session_context() as db:
                result = db.exec(stmt).all()
            
            logger.info(f"K线表排序完成: {table_type}.{sort_by} {sort_order}, 获取 {len(result)} 个codes")
            return result
            
        except Exception as e:
            logger.error(f"K线表排序查询失败: {e}")
            return None


class SpecialFieldSortingStrategy(SortingStrategy):
    """特殊计算字段排序策略"""
    
    # 🚀 常量定义：支持的特殊字段
    SUPPORTED_SPECIAL_FIELDS = frozenset({
        "call_countdown"
    })
    
    # 🚀 常量定义：表名映射（避免硬编码）
    TABLE_MAPPING = {
        "convertible_bond": "stocks"  # 可转债数据在stocks表中
    }
    
    def get_sorted_codes(self, table_type: str, sort_by: str, sort_order: str,
                        sort_period: str = "daily", trade_date: Optional[str] = None,
                        **kwargs) -> Optional[List[str]]:
        """处理特殊计算字段的排序"""
        if sort_by == 'call_countdown':
            return self._get_call_countdown_sorted_codes(table_type, sort_order)
        
        logger.warning(f"未知的特殊字段: {sort_by}")
        return None
    
    def _get_call_countdown_sorted_codes(self, table_type: str, sort_order: str) -> Optional[List[str]]:
        """获取按强赎倒计时排序的可转债代码列表 - 基于最近未来的赎回日期(call_date)。"""
        if table_type != 'convertible_bond':
            logger.warning("call_countdown排序只支持可转债")
            return None
            
        try:
            # 🚀 SQLModel优化：使用模型查询替代硬编码SQL
            # 使用 ConvertibleBondCall.call_date 计算“距离最近未来赎回日的天数”
            from sqlmodel import select, func
            from app.models import ConvertibleBondCall

            # countdown = MIN(DATEDIFF(call_date, CURDATE()))，仅统计未来的赎回日
            countdown_expr = func.min(
                func.datediff(ConvertibleBondCall.call_date, func.curdate())
            )

            # 构建查询：每个 ts_code 聚合最近未来的赎回日
            stmt = (
                select(ConvertibleBondCall.ts_code)
                .where(
                    ConvertibleBondCall.call_date.is_not(None),
                    ConvertibleBondCall.call_date >= func.curdate(),
                )
                .group_by(ConvertibleBondCall.ts_code)
            )
            
            # 🚀 安全的排序方向处理
            if sort_order.lower() == "asc":
                # 倒计时越小（越接近当前日期）排在越前
                stmt = stmt.order_by(countdown_expr.asc())
            else:
                # 倒计时越大（赎回日越远）排在越前
                stmt = stmt.order_by(countdown_expr.desc())
            
            # 🚀 SQLModel优化：统一使用上下文管理器
            with db_session_context() as db:
                result = db.exec(stmt).all()
            
            logger.info(f"强赎倒计时排序完成: {sort_order}, 获取 {len(result)} 个可转债codes")
            return result
            
        except Exception as e:
            logger.error(f"强赎倒计时排序查询失败: {e}")
            return None


class ConceptIndustryHeatSortingStrategy(SortingStrategy):
    """概念/行业热度排序策略
    
    根据股票所属概念或行业的最大热度分数进行排序。
    - 一个股票可能属于多个概念/行业，取热度最高的那个作为排序依据
    - 没有关联概念/行业的股票，热度默认为0，排在最后（降序时）
    """
    
    # 支持的热度字段
    SUPPORTED_FIELDS = frozenset({'max_concept_heat', 'max_industry_heat'})
    
    def get_sorted_codes(self, table_type: str, sort_by: str, sort_order: str,
                        sort_period: str = "daily", trade_date: Optional[str] = None,
                        **kwargs) -> Optional[List[str]]:
        """获取按概念/行业热度排序的代码列表"""
        if sort_by not in self.SUPPORTED_FIELDS:
            logger.warning(f"不支持的热度排序字段: {sort_by}")
            return None
            
        try:
            from sqlmodel import select, func
            from app.models import Stock, Concept, Industry, StockConcept, StockIndustry, ConvertibleBond
            
            is_concept = sort_by == 'max_concept_heat'
            
            if table_type == 'stock':
                return self._get_stock_sorted_codes(sort_order, is_concept)
            elif table_type == 'convertible_bond':
                return self._get_bond_sorted_codes(sort_order, is_concept)
            else:
                logger.warning(f"表类型 {table_type} 不支持概念/行业热度排序")
                return None
                
        except Exception as e:
            logger.error(f"概念/行业热度排序查询失败: {e}")
            return None
    
    def _get_stock_sorted_codes(self, sort_order: str, is_concept: bool) -> Optional[List[str]]:
        """获取按概念/行业热度排序的股票代码列表"""
        from sqlmodel import select, func
        from app.models import Stock, Concept, Industry, StockConcept, StockIndustry
        
        with db_session_context() as db:
            if is_concept:
                # 按概念热度排序：Stock -> StockConcept -> Concept
                stmt = (
                    select(
                        Stock.ts_code,
                        func.coalesce(func.max(Concept.hot_score), 0).label('max_heat')
                    )
                    .outerjoin(StockConcept, Stock.ts_code == StockConcept.ts_code)
                    .outerjoin(Concept, StockConcept.concept_code == Concept.concept_code)
                    .where(Stock.list_status == 'L')  # 仅在市股票
                    .group_by(Stock.ts_code)
                )
            else:
                # 按行业热度排序：Stock -> StockIndustry -> Industry
                stmt = (
                    select(
                        Stock.ts_code,
                        func.coalesce(func.max(Industry.hot_score), 0).label('max_heat')
                    )
                    .outerjoin(StockIndustry, Stock.ts_code == StockIndustry.ts_code)
                    .outerjoin(Industry, StockIndustry.industry_code == Industry.industry_code)
                    .where(Stock.list_status == 'L')  # 仅在市股票
                    .group_by(Stock.ts_code)
                )
            
            # 应用排序
            if sort_order.lower() == "desc":
                stmt = stmt.order_by(func.coalesce(func.max(Concept.hot_score if is_concept else Industry.hot_score), 0).desc())
            else:
                stmt = stmt.order_by(func.coalesce(func.max(Concept.hot_score if is_concept else Industry.hot_score), 0).asc())
            
            result = db.exec(stmt).all()
            codes = [row[0] for row in result]
            
            heat_type = "概念" if is_concept else "行业"
            logger.info(f"股票{heat_type}热度排序完成: {sort_order}, 获取 {len(codes)} 个codes")
            return codes
    
    def _get_bond_sorted_codes(self, sort_order: str, is_concept: bool) -> Optional[List[str]]:
        """获取按概念/行业热度排序的可转债代码列表
        
        可转债通过正股(stk_code)关联到概念/行业
        """
        from sqlmodel import select, func
        from app.models import ConvertibleBond, Stock, Concept, Industry, StockConcept, StockIndustry
        
        with db_session_context() as db:
            if is_concept:
                # 可转债 -> 正股 -> StockConcept -> Concept
                stmt = (
                    select(
                        ConvertibleBond.ts_code,
                        func.coalesce(func.max(Concept.hot_score), 0).label('max_heat')
                    )
                    .outerjoin(Stock, ConvertibleBond.stk_code == Stock.ts_code)
                    .outerjoin(StockConcept, Stock.ts_code == StockConcept.ts_code)
                    .outerjoin(Concept, StockConcept.concept_code == Concept.concept_code)
                    .where(ConvertibleBond.list_status == 'L')  # 仅在市可转债
                    .group_by(ConvertibleBond.ts_code)
                )
            else:
                # 可转债 -> 正股 -> StockIndustry -> Industry
                stmt = (
                    select(
                        ConvertibleBond.ts_code,
                        func.coalesce(func.max(Industry.hot_score), 0).label('max_heat')
                    )
                    .outerjoin(Stock, ConvertibleBond.stk_code == Stock.ts_code)
                    .outerjoin(StockIndustry, Stock.ts_code == StockIndustry.ts_code)
                    .outerjoin(Industry, StockIndustry.industry_code == Industry.industry_code)
                    .where(ConvertibleBond.list_status == 'L')  # 仅在市可转债
                    .group_by(ConvertibleBond.ts_code)
                )
            
            # 应用排序
            if sort_order.lower() == "desc":
                stmt = stmt.order_by(func.coalesce(func.max(Concept.hot_score if is_concept else Industry.hot_score), 0).desc())
            else:
                stmt = stmt.order_by(func.coalesce(func.max(Concept.hot_score if is_concept else Industry.hot_score), 0).asc())
            
            result = db.exec(stmt).all()
            codes = [row[0] for row in result]
            
            heat_type = "概念" if is_concept else "行业"
            logger.info(f"可转债{heat_type}热度排序完成: {sort_order}, 获取 {len(codes)} 个codes")
            return codes


class SortingStrategyFactory:
    """排序策略工厂 - SQLModel优化版本"""
    
    # 🚀 性能优化：缓存策略实例
    _STRATEGY_CACHE = {
        'base': BaseSortingStrategy(),
        'kline': KlineSortingStrategy(), 
        'special': SpecialFieldSortingStrategy(),
        'concept_industry_heat': ConceptIndustryHeatSortingStrategy()
    }
    
    @staticmethod
    def create(sort_by: str) -> SortingStrategy:
        """
        根据排序字段创建相应的排序策略 - 缓存优化版本
        
        Args:
            sort_by: 排序字段名
            
        Returns:
            对应的排序策略实例
        """
        # 🚀 优化：延迟导入避免循环依赖
        from app.dao.query_utils import QueryUtils
        
        # 概念/行业热度字段
        if sort_by in ConceptIndustryHeatSortingStrategy.SUPPORTED_FIELDS:
            return SortingStrategyFactory._STRATEGY_CACHE['concept_industry_heat']
        # K线字段
        if QueryUtils._is_kline_table_field(sort_by):
            return SortingStrategyFactory._STRATEGY_CACHE['kline']
        # 特殊计算字段
        elif QueryUtils._is_special_calculated_field(sort_by):
            return SortingStrategyFactory._STRATEGY_CACHE['special']
        else:
            return SortingStrategyFactory._STRATEGY_CACHE['base']
