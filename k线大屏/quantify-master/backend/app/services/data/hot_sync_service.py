"""
热度数据同步服务
从Tushare获取热度数据并同步到数据库
"""

from typing import Dict

from loguru import logger

from app.core.exceptions import CancellationException
from app.dao.base_dao import base_dao
from app.models import Concept, Industry, ConvertibleBond, Stock
from ..external.tushare_service import tushare_service


class HotSyncService:
    """热度数据同步服务"""

    def __init__(self):
        self.tushare_service = tushare_service

    def sync_stock_hot_data(self, trade_date: str) -> Dict[str, int]:
        """同步股票热度数据"""
        logger.info(f"同步股票热度数据 - {trade_date}")
        result = {"success": 0, "failed": 0, "cleared": 0}

        try:
            # 🚀 性能优化：先清空再同步，减少不必要的更新操作
            cleared_count = self._clear_hot_data(Stock)
            result["cleared"] = cleared_count if cleared_count >= 0 else 0
            logger.info(f"清空股票热度数据: {cleared_count} 条")

            # 获取热门股票数据
            hot_stocks = self.tushare_service.get_ths_hot(trade_date=trade_date, market="热股")
            if not hot_stocks:
                logger.warning(f"未获取到热门股票数据，trade_date={trade_date}")
                return result

            logger.info(f"成功获取到 {len(hot_stocks)} 条热门股票数据")

            # 🚀 性能优化：一次性导入，避免重复导入
            from app.services.external.tushare.mappers import ths_hot_to_dicts
            from ...dao.stock_dao import stock_dao
            
            hot_stocks_dict = ths_hot_to_dicts(hot_stocks)
            sync_result = stock_dao.sync_hot_data(hot_data_list=hot_stocks_dict, trade_date=trade_date)

            # 直接使用DAO标准返回格式
            result.update({
                "inserted": sync_result.get("inserted_count", 0),
                "updated": sync_result.get("updated_count", 0),
                "total": sync_result.get("total_count", 0)
            })
            result["success"] = result["updated"]
            result["failed"] = result["total"] - result["success"]
            
            logger.info(f"股票热度同步完成: {result}")
            try:
                from app.services.data.stock_service import stock_service
                from app.services.external.ths.favorites.favorite_service import ths_favorite_service

                top_codes = stock_service.get_hot_stock_codes()
                if top_codes:
                    ths_favorite_service.reset_group_with_date_suffix_for_all_accounts("热门股票", top_codes, trade_date[4:8], rebuild=True, reverse_add=True)
            except Exception as e:
                logger.warning(f"更新同花顺自选分组 '热门股票' 失败: {e}")
            
        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步股票热度数据失败: {e}")
            raise
            
        return result

    def sync_convertible_bond_hot_data(self, trade_date: str) -> Dict[str, int]:
        """同步可转债热度数据"""
        logger.info(f"同步可转债热度数据 - {trade_date}")
        result = {"success": 0, "failed": 0, "cleared": 0}

        try:
            cleared_count = self._clear_hot_data(ConvertibleBond)
            result["cleared"] = cleared_count if cleared_count >= 0 else 0
            logger.info(f"清空可转债热度数据: {cleared_count} 条")

            hot_bonds = self.tushare_service.get_ths_hot(trade_date=trade_date, market="可转债")
            if not hot_bonds:
                logger.warning(f"未获取到热门可转债数据，trade_date={trade_date}")
                return result

            logger.info(f"成功获取到 {len(hot_bonds)} 条热门可转债数据")

            from app.services.external.tushare.mappers import ths_hot_to_dicts
            from ...dao.convertible_bond_dao import convertible_bond_dao
            
            hot_bonds_dict = ths_hot_to_dicts(hot_bonds)
            sync_result = convertible_bond_dao.sync_hot_data(hot_data_list=hot_bonds_dict, trade_date=trade_date)

            result.update({
                "inserted": sync_result.get("inserted_count", 0),
                "updated": sync_result.get("updated_count", 0),
                "total": sync_result.get("total_count", 0)
            })
            result["success"] = result["updated"]
            result["failed"] = result["total"] - result["success"]
            
            logger.info(f"可转债热度同步完成: {result}")
            try:
                from app.services.data.convertible_bond_service import convertible_bond_service
                from app.services.external.ths.favorites.favorite_service import ths_favorite_service

                top_codes = convertible_bond_service.get_hot_bond_codes()
                if top_codes:
                    ths_favorite_service.reset_group_with_date_suffix_for_all_accounts("热门可转债", top_codes, trade_date[4:8], rebuild=True, reverse_add=True)
            except Exception as e:
                logger.warning(f"更新同花顺自选分组 '热门可转债' 失败: {e}")
            
        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步可转债热度数据失败: {e}")
            raise
            
        return result

    def sync_concept_hot_data(self, trade_date: str) -> Dict[str, int]:
        """同步概念热度数据"""
        logger.info(f"同步概念热度数据 - {trade_date}")
        result = {"success": 0, "failed": 0, "cleared": 0}

        try:
            cleared_count = self._clear_hot_data(Concept)
            result["cleared"] = cleared_count if cleared_count >= 0 else 0
            logger.info(f"清空概念热度数据: {cleared_count} 条")

            hot_concepts = self.tushare_service.get_ths_hot(trade_date=trade_date, market="概念板块")
            if not hot_concepts:
                logger.warning(f"未获取到热门概念数据，trade_date={trade_date}")
                return result

            logger.info(f"成功获取到 {len(hot_concepts)} 条热门概念数据")

            from app.services.external.tushare.mappers import ths_hot_to_concept_dicts
            from ...dao.concept_dao import concept_dao
            
            hot_concepts_dict = ths_hot_to_concept_dicts(hot_concepts)
            sync_result = concept_dao.sync_hot_data(hot_data_list=hot_concepts_dict, trade_date=trade_date)

            result.update({
                "inserted": sync_result.get("inserted_count", 0),
                "updated": sync_result.get("updated_count", 0),
                "total": sync_result.get("total_count", 0)
            })
            result["success"] = result["updated"]
            result["failed"] = result["total"] - result["success"]
            
            logger.info(f"概念热度同步完成: {result}")
            try:
                from app.services.data.concept_service import concept_service
                from app.services.external.ths.favorites.favorite_service import ths_favorite_service

                top_codes = concept_service.get_hot_concept_codes()
                if top_codes:
                    ths_favorite_service.reset_group_with_date_suffix_for_all_accounts("热门概念", top_codes, trade_date[4:8], rebuild=True, reverse_add=True)
            except Exception as e:
                logger.warning(f"更新同花顺自选分组 '热门概念' 失败: {e}")
            
        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步概念热度数据失败: {e}")
            raise
            
        return result

    def sync_industry_hot_data(self, trade_date: str) -> Dict[str, int]:
        """同步行业热度数据"""
        logger.info(f"同步行业热度数据 - {trade_date}")
        result = {"success": 0, "failed": 0, "cleared": 0}

        try:
            cleared_count = self._clear_hot_data(Industry)
            result["cleared"] = cleared_count if cleared_count >= 0 else 0
            logger.info(f"清空行业热度数据: {cleared_count} 条")

            hot_industries = self.tushare_service.get_ths_hot(trade_date=trade_date, market="行业板块")
            if not hot_industries:
                logger.warning(f"未获取到热门行业数据，trade_date={trade_date}")
                return result

            logger.info(f"成功获取到 {len(hot_industries)} 条热门行业数据")

            from app.services.external.tushare.mappers import ths_hot_to_industry_dicts
            from ...dao.industry_dao import industry_dao
            
            hot_industries_dict = ths_hot_to_industry_dicts(hot_industries)
            sync_result = industry_dao.sync_hot_data(hot_data_list=hot_industries_dict, trade_date=trade_date)

            result.update({
                "inserted": sync_result.get("inserted_count", 0),
                "updated": sync_result.get("updated_count", 0),
                "total": sync_result.get("total_count", 0)
            })
            result["success"] = result["updated"]
            result["failed"] = result["total"] - result["success"]
            
            logger.info(f"行业热度同步完成: {result}")
            try:
                from app.services.data.industry_service import industry_service
                from app.services.external.ths.favorites.favorite_service import ths_favorite_service

                top_codes = industry_service.get_hot_industry_codes()
                if top_codes:
                    ths_favorite_service.reset_group_with_date_suffix_for_all_accounts("热门行业", top_codes, trade_date[4:8], rebuild=True, reverse_add=True)
            except Exception as e:
                logger.warning(f"更新同花顺自选分组 '热门行业' 失败: {e}")
            
        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步行业热度数据失败: {e}")
            raise
            
        return result

    def _clear_hot_data(self, model_class) -> int:
        """清空指定模型的热度数据"""
        # 调用DAO层方法清空热度数据，避免直接操作数据库
        logger.info(f"清空 {model_class.__tablename__} 热度数据")
        return base_dao.clear_hot_data(model_class)

# 创建全局实例
hot_sync_service = HotSyncService()
