"""
数据管理服务
用于管理数据的删除、清理等操作
"""

from typing import Dict, Any, List, Optional
from loguru import logger
from datetime import datetime

from app.core.exceptions import DatabaseException
from app.constants.table_types import TableTypes


class DataManagementService:
    """数据管理服务"""
    
    def delete_code_data(
        self,
        ts_code: str,
        data_type: str,
        delete_scope: str = "kline",
        periods: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        统一的删除代码数据方法
        
        Args:
            ts_code: 要删除的代码
            data_type: 数据类型 (stock, convertible_bond, concept, industry)
            delete_scope: 删除范围 ("all" | "kline")
                - "all": 删除所有数据（K线 + 基础信息 + 关联数据）
                - "kline": 仅删除 K 线数据
            periods: 可选，周期列表（如 ["daily", "weekly"]），为空则删除所有周期
            start_date: 开始日期 (YYYYMMDD)，delete_scope="kline" 时必填
            end_date: 结束日期 (YYYYMMDD)，delete_scope="kline" 时必填
            
        Returns:
            删除统计信息
        """
        try:
            # 验证数据类型
            table_type_map = {
                'stock': TableTypes.STOCK,
                'convertible_bond': TableTypes.CONVERTIBLE_BOND,
                'concept': TableTypes.CONCEPT,
                'industry': TableTypes.INDUSTRY
            }
            
            table_type = table_type_map.get(data_type)
            if not table_type:
                raise ValueError(f"不支持的数据类型: {data_type}")
            
            if delete_scope == "all":
                return self._delete_all_data(ts_code, data_type, table_type)
            else:
                return self._delete_kline_data(ts_code, data_type, table_type, periods, start_date, end_date)
                
        except Exception as e:
            logger.error(f"删除数据失败: {e}")
            raise DatabaseException(f"删除数据失败: {str(e)}")
    
    def _delete_all_data(self, ts_code: str, data_type: str, table_type: str) -> Dict[str, Any]:
        """删除所有数据（K线 + 基础信息 + 关联数据）"""
        logger.info(f"开始删除 {ts_code} 的所有 {data_type} 数据")
        
        deleted_stats = {
            "kline_count": 0,
            "basic_count": 0,
            "relation_count": 0,
            "deleted_years": [],
            "delete_scope": "all"
        }
        
        # 1. 删除K线数据（动态获取所有年份）
        from app.dao.factory import get_kline_table_years
        years = get_kline_table_years()
        
        from app.services.scheduler.cleanup import cleanup_kline_for_codes
        kline_deleted = cleanup_kline_for_codes(years, table_type, [ts_code])
        deleted_stats["kline_count"] = kline_deleted
        deleted_stats["deleted_years"] = years
        
        # 2. 删除基础信息和关联信息
        from app.dao.query_utils import delete_records_with_filter
        
        if data_type == 'stock':
            from app.models.stock import Stock, StockConcept, StockIndustry
            concept_deleted = delete_records_with_filter(StockConcept, StockConcept.ts_code == ts_code)
            industry_deleted = delete_records_with_filter(StockIndustry, StockIndustry.ts_code == ts_code)
            stock_deleted = delete_records_with_filter(Stock, Stock.ts_code == ts_code)
            deleted_stats["relation_count"] = concept_deleted + industry_deleted
            deleted_stats["basic_count"] = stock_deleted
            
        elif data_type == 'convertible_bond':
            from app.models.convertible_bond import ConvertibleBond, ConvertibleBondCall
            call_deleted = delete_records_with_filter(ConvertibleBondCall, ConvertibleBondCall.ts_code == ts_code)
            bond_deleted = delete_records_with_filter(ConvertibleBond, ConvertibleBond.ts_code == ts_code)
            deleted_stats["relation_count"] = call_deleted
            deleted_stats["basic_count"] = bond_deleted
            
        elif data_type == 'concept':
            from app.models.concept import Concept, StockConcept
            stock_concept_deleted = delete_records_with_filter(StockConcept, StockConcept.concept_code == ts_code)
            concept_deleted = delete_records_with_filter(Concept, Concept.concept_code == ts_code)
            deleted_stats["relation_count"] = stock_concept_deleted
            deleted_stats["basic_count"] = concept_deleted
            
        elif data_type == 'industry':
            from app.models.industry import Industry, StockIndustry
            stock_industry_deleted = delete_records_with_filter(StockIndustry, StockIndustry.industry_code == ts_code)
            industry_deleted = delete_records_with_filter(Industry, Industry.industry_code == ts_code)
            deleted_stats["relation_count"] = stock_industry_deleted
            deleted_stats["basic_count"] = industry_deleted
        
        # 3. 清理相关缓存
        self._invalidate_caches_for_deleted_code(ts_code, data_type, table_type)
        
        total_deleted = deleted_stats["kline_count"] + deleted_stats["basic_count"] + deleted_stats["relation_count"]
        deleted_stats["total_deleted"] = total_deleted
        
        logger.info(
            f"成功删除 {ts_code} 的所有数据: "
            f"K线{deleted_stats['kline_count']}条, "
            f"基础信息{deleted_stats['basic_count']}条, "
            f"关联信息{deleted_stats['relation_count']}条, "
            f"共{total_deleted}条"
        )
        
        return {
            "success": True,
            "ts_code": ts_code,
            "data_type": data_type,
            **deleted_stats
        }
    
    def _delete_kline_data(
        self,
        ts_code: str,
        data_type: str,
        table_type: str,
        periods: Optional[List[str]],
        start_date: str,
        end_date: str
    ) -> Dict[str, Any]:
        """仅删除 K 线数据"""
        # 验证日期参数
        if not start_date or not end_date:
            raise ValueError("删除K线数据时，开始日期和结束日期不能为空")
        
        try:
            start_dt = datetime.strptime(start_date, "%Y%m%d")
            end_dt = datetime.strptime(end_date, "%Y%m%d")
            if start_dt > end_dt:
                raise ValueError("开始日期不能大于结束日期")
        except ValueError as e:
            raise ValueError(f"日期格式错误: {e}")
        
        periods_desc = ", ".join(periods) if periods else "所有周期"
        logger.info(f"开始删除 {ts_code} 的 {data_type} K线数据 ({start_date} ~ {end_date}, {periods_desc})")
        
        deleted_stats = {
            "kline_count": 0,
            "basic_count": 0,
            "relation_count": 0,
            "deleted_years": [],
            "date_range": f"{start_date} ~ {end_date}",
            "periods": periods if periods else ["all"],
            "delete_scope": "kline"
        }
        
        # 获取所有年份表
        from app.dao.factory import get_kline_table_years
        years = get_kline_table_years(table_type)
        
        # 计算需要删除的年份范围
        start_year = start_dt.year
        end_year = end_dt.year
        target_years = [y for y in years if start_year <= y <= end_year]
        
        if not target_years:
            logger.warning(f"没有找到 {start_year}-{end_year} 年份的K线表")
            deleted_stats["total_deleted"] = 0
            return {
                "success": True,
                "ts_code": ts_code,
                "data_type": data_type,
                **deleted_stats
            }
        
        # 复用 cleanup_kline_for_codes 方法删除 K 线数据
        from app.services.scheduler.cleanup import cleanup_kline_for_codes
        kline_deleted = cleanup_kline_for_codes(
            years=target_years,
            table_type=table_type,
            codes=[ts_code],
            start_date=start_date,
            end_date=end_date,
            periods=periods
        )
        deleted_stats["kline_count"] = kline_deleted
        deleted_stats["deleted_years"] = target_years
        
        # 使缓存失效
        self._invalidate_caches_for_deleted_code(ts_code, data_type, table_type)
        
        deleted_stats["total_deleted"] = deleted_stats["kline_count"]
        
        logger.info(
            f"✅ 完成删除 {ts_code} 的 {data_type} K线数据: "
            f"{deleted_stats['kline_count']}条 (周期: {periods_desc}, 涉及年份: {deleted_stats['deleted_years']})"
        )
        
        return {
            "success": True,
            "ts_code": ts_code,
            "data_type": data_type,
            **deleted_stats
        }
    
    def _invalidate_caches_for_deleted_code(self, ts_code: str, data_type: str, table_type: str):
        """
        为删除的代码失效相关缓存
        
        Args:
            ts_code: 删除的代码
            data_type: 数据类型
            table_type: 表类型
        """
        try:
            from app.services.core.cache_service import cache_service
            
            logger.info(f"开始清理 {ts_code} ({data_type}) 的相关缓存")
            
            # 1. 清理对应类型的缓存
            if data_type == 'stock':
                cache_service.invalidate_stock_cache()
                cache_service.invalidate_all_stock_codes()
            elif data_type == 'convertible_bond':
                cache_service.invalidate_bond_cache()
                cache_service.invalidate_all_bond_codes()
            elif data_type == 'concept':
                cache_service.invalidate_concept_cache()
                cache_service.invalidate_all_concept_codes()
            elif data_type == 'industry':
                cache_service.invalidate_industry_cache()
                cache_service.invalidate_all_industry_codes()
            
            # 2. 清理K线相关缓存
            cache_service.invalidate_kline_latest_dates(table_type)
            
            # 3. 如果是股票或可转债，还需要清理关联的概念和行业缓存
            if data_type in ['stock', 'convertible_bond']:
                cache_service.invalidate_concept_cache()
                cache_service.invalidate_industry_cache()
            
            logger.info(f"已清理 {ts_code} ({data_type}) 的所有相关缓存")
            
        except Exception as e:
            logger.warning(f"清理缓存失败: {e}，但数据已删除")
    

# 单例实例
data_management_service = DataManagementService()
