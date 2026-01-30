"""
数据统计API路由
统一管理所有数据统计相关的接口
"""

from typing import Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import DatabaseException
from ..core.response_models import create_success_response
from ..services.data.concept_service import concept_service
from ..services.data.convertible_bond_service import convertible_bond_service
from ..services.data.industry_service import industry_service
from ..services.data.stock_service import stock_service

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


# ========== 统计API模型定义 ==========

class DataStatistics(BaseModel):
    """数据统计概览模型"""

    stock: int
    convertible_bond: int
    concept: int
    industry: int


class MarketStatistics(BaseModel):
    """市场统计模型"""

    total_market_cap: Optional[float] = None
    avg_pe_ratio: Optional[float] = None
    avg_pb_ratio: Optional[float] = None
    total_turnover: Optional[float] = None
    market_trend: Optional[str] = None


class IndustryStatistics(BaseModel):
    """行业统计模型"""

    industry_name: str
    stock_count: int
    avg_market_cap: Optional[float] = None
    avg_pe_ratio: Optional[float] = None
    total_turnover: Optional[float] = None
    growth_rate: Optional[float] = None


class ConceptStatistics(BaseModel):
    """概念统计模型"""

    concept_name: str
    stock_count: int
    avg_market_cap: Optional[float] = None
    avg_pe_ratio: Optional[float] = None
    total_turnover: Optional[float] = None
    hot_score: Optional[float] = None


@router.get("/overview")
async def get_data_statistics_overview():
    """获取数据统计概览 - 统一的数据统计接口"""
    try:
        logger.info("获取数据统计概览")

        # 并行获取各种数据统计
        stock_count = len(stock_service.get_all_ts_codes_cached())
        bond_count = len(convertible_bond_service.get_all_ts_codes_cached())
        concept_count = len(concept_service.get_all_ts_codes_cached())
        industry_count = len(industry_service.get_all_ts_codes_cached())

        statistics = {
            "stock": stock_count,
            "convertible_bond": bond_count,
            "concept": concept_count,
            "industry": industry_count,
            "total": stock_count + bond_count + concept_count + industry_count
        }

        return create_success_response(
            data=statistics,
            message="获取数据统计概览成功"
        )

    except Exception as e:
        logger.error(f"获取数据统计概览失败: {str(e)}")
        raise DatabaseException(f"获取数据统计概览失败: {str(e)}")
