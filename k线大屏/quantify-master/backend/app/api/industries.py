"""
行业板块API路由
"""

from typing import Optional, List, Dict

from fastapi import APIRouter, Query, Body, HTTPException
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import (
    ValidationException,
    DatabaseException,
)
from ..core.response_models import (
    create_success_response,
    ApiResponse,
)
from ..models.schemas.kline_schemas import IndexKlineItem
from ..services.data.industry_kline_service import industry_kline_service
from ..services.data.industry_service import industry_service

router = APIRouter(prefix="/api/industries", tags=["industries"])


# ========== 行业API模型定义 ==========

class IndustryBasicInfo(BaseModel):
    """行业基本信息模型"""

    industry_code: Optional[str] = None
    industry_name: Optional[str] = None


class IndustryDetailInfo(BaseModel):
    """行业详细信息模型 - 只包含必要字段"""

    industry_code: str
    industry_name: str
    is_hot: bool = False
    hot_concept: Optional[str] = None
    hot_rank_reason: Optional[str] = None


class IndustryStockInfo(BaseModel):
    """行业关联股票信息模型"""

    ts_code: str
    symbol: str
    name: str
    area: Optional[str] = None
    industry: Optional[str] = None
    market: Optional[str] = None


class IndustryKlineInfo(BaseModel):
    """行业K线信息模型"""

    industry_code: str
    period: str
    count: int
    klines: List[IndexKlineItem]


class IndustrySearchItem(BaseModel):
    """行业搜索项模型"""

    industry_code: str
    industry_name: str


class IndustrySearchResponse(BaseModel):
    """行业搜索响应模型"""

    success: bool = True
    message: str = "搜索行业成功"
    data: List[IndustrySearchItem]


class IndustryStatsItem(BaseModel):
    """行业统计明细项（与股票统计保持一致结构）"""
    code: str
    name: str
    open: float = 0.0  # 开盘价
    close: float
    pct_chg: float
    intraday_pct: float
    amount: float
    circ_mv: float = 0.0  # 流通市值(万元)，用于气泡图大小


class IndustryStatsResponse(BaseModel):
    """行业统计响应模型（只返回items，summary由前端计算）"""
    items: List[IndustryStatsItem]


class IndustryCompareRequest(BaseModel):
    """行业日期对比统计请求模型"""
    search: Optional[str] = None
    ts_codes: Optional[List[str]] = None  # 直接指定代码列表筛选
    base_date: str  # 基准日期 YYYYMMDD
    compare_date: str  # 对比日期 YYYYMMDD
    sort_period: str = "daily"  # 周期类型 (daily/weekly/monthly)


class IndustryCompareStatsItem(BaseModel):
    """日期对比统计项"""
    code: str
    name: str
    open: Optional[float] = None  # A日开盘价
    close: float
    pct_chg: float
    max_pct: Optional[float] = None  # 区间最大涨幅
    min_pct: Optional[float] = None  # 区间最大回撤
    high_price: Optional[float] = None  # 区间最高价
    low_price: Optional[float] = None  # 区间最低价
    amount: float = 0.0
    circ_mv: float = 0.0  # 流通市值


class IndustryCompareStatsResponse(BaseModel):
    """日期对比统计响应模型（summary由前端计算）"""
    base_date: str
    compare_date: str
    items: List[IndustryCompareStatsItem] = []


class IndustryOption(BaseModel):
    """行业选项模型（用于下拉筛选）"""

    industry_code: str
    industry_name: str
    is_hot: Optional[bool] = None


class IndustryListRequest(BaseModel):
    """行业列表请求模型（POST）"""
    search: Optional[str] = None
    ts_codes: Optional[List[str]] = None  # 直接指定代码列表筛选
    page: int = 1
    page_size: int = 20
    sort_by: Optional[str] = None
    sort_order: str = "desc"
    sort_period: Optional[str] = "daily"
    hot_sort: bool = False
    trade_date: Optional[str] = None


@router.post("", response_model=ApiResponse[List[IndustryDetailInfo]])
async def get_industries(request: IndustryListRequest = Body(...)):
    """获取行业板块列表（POST，仅请求体），与股票保持一致"""
    try:
        from ..core.validators import (
            normalize_pagination,
        )
        from ..core.response_models import create_list_response

        # 参数验证和标准化
        page, page_size, offset = normalize_pagination(request.page, request.page_size)

        logger.info(
            f"获取行业列表 - search: {request.search}, page: {request.page}, ts_codes: {len(request.ts_codes) if request.ts_codes else 0}"
        )

        # 如果启用热度排序，设置默认排序
        if request.hot_sort and not request.sort_by:
            request.sort_by = "hot_score"
            request.sort_order = "desc"

        # 使用统一的行业筛选方法，通过策略哈希值筛选
        from ..services.data.trade_calendar_service import trade_calendar_service
        effective_trade_date = request.trade_date or trade_calendar_service.get_latest_trading_day()
        
        result = industry_service.filter_industries(
            search=request.search,
            limit=page_size,
            offset=offset,
            sort_by=request.sort_by,
            sort_period=request.sort_period or "daily",
            sort_order=request.sort_order,
            hot_sort=request.hot_sort,
            ts_codes=request.ts_codes,
            trade_date=effective_trade_date,
        )

        return create_list_response(
            items=result.get("industries", []),
            total=result.get("total", 0),
            page=request.page,
            page_size=request.page_size,
            message=f"获取行业列表成功，共{result.get('total', 0)}个行业",
        )

    except Exception as e:
        logger.error(f"获取行业列表失败: {str(e)}")
        raise DatabaseException(f"获取行业列表失败: {str(e)}")


@router.post("/ts-codes", response_model=ApiResponse[List[str]])
async def get_industry_codes(request: IndustryListRequest = Body(...)):
    """获取符合筛选条件的行业代码列表（支持排序和数量限制）。"""
    from ..core.response_models import create_success_response
    from ..services.data.trade_calendar_service import trade_calendar_service

    try:
        effective_trade_date = request.trade_date or trade_calendar_service.get_latest_trading_day()
        # 后端最大限制 500 条
        MAX_PUSH_LIMIT = 500
        effective_limit = min(request.page_size, MAX_PUSH_LIMIT) if request.page_size and request.page_size > 0 else None
        
        codes = industry_service.get_filtered_industry_codes(
            search=request.search,
            ts_codes_filter=request.ts_codes,
            sort_by=request.sort_by or "hot_score",
            sort_order=request.sort_order or "desc",
            sort_period=request.sort_period or "daily",
            trade_date=effective_trade_date,
            limit=effective_limit,
        )
        return create_success_response(
            data=codes,
            message=f"获取行业代码列表成功，共{len(codes)}个代码",
        )
    except Exception as e:
        logger.error(f"获取行业代码列表失败: {str(e)}")
        raise DatabaseException(f"获取行业代码列表失败: {str(e)}")


@router.post("/stats", response_model=ApiResponse[IndustryStatsResponse])
async def get_industry_stats(request: IndustryListRequest = Body(...)):
    """获取当前筛选条件下的行业统计信息（不分页，聚合全部结果）。"""
    from ..core.response_models import create_success_response
    from ..services.data.trade_calendar_service import trade_calendar_service

    try:
        effective_trade_date = request.trade_date or trade_calendar_service.get_latest_trading_day()

        stats_dict: Dict[str, Any] = industry_service.get_industry_stats(
            search=request.search,
            ts_codes=request.ts_codes,
            trade_date=effective_trade_date,
            sort_period=request.sort_period or "daily",
        )

        stats_model = IndustryStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取行业统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取行业统计信息失败: {str(e)}")
        raise DatabaseException(f"获取行业统计信息失败: {str(e)}")


@router.post("/stats/compare", response_model=ApiResponse[IndustryCompareStatsResponse])
async def get_industry_compare_stats(request: IndustryCompareRequest = Body(...)):
    """获取两个日期之间的行业涨跌对比统计。"""
    from ..core.response_models import create_success_response

    try:
        stats_dict = industry_service.get_industry_compare_stats(
            search=request.search,
            ts_codes=request.ts_codes,
            base_date=request.base_date,
            compare_date=request.compare_date,
            sort_period=request.sort_period,
        )

        stats_model = IndustryCompareStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取行业对比统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取行业对比统计信息失败: {str(e)}")
        raise DatabaseException(f"获取行业对比统计信息失败: {str(e)}")


@router.get("/options", response_model=ApiResponse[List[IndustryOption]])
async def get_industry_options(
        hot_sort: bool = Query(True, description="是否按热度排序"),
        search: Optional[str] = Query(None, description="搜索关键词"),
        trade_date: Optional[str] = Query(None, description="交易日期(YYYYMMDD)，默认为最新交易日"),
):
    """获取行业选项列表（用于下拉筛选，不分页）"""
    try:
        logger.info(f"获取行业选项列表 - hot_sort: {hot_sort}, search: {search}")

        # 获取所有行业数据（不分页）
        from ..services.data.trade_calendar_service import trade_calendar_service
        effective_trade_date = trade_date or trade_calendar_service.get_latest_trading_day()
        
        result = industry_service.filter_industries(
            search=search,
            sort_by="hot_score" if hot_sort else "industry_name",
            sort_order="desc" if hot_sort else "asc",
            limit=None,  # 不分页，获取所有数据
            offset=0,
            hot_sort=hot_sort,
            trade_date=effective_trade_date  # 使用前端传入或默认的交易日期
        )

        # 转换为选项格式
        options = []
        for industry in result.get('industries', []):
            options.append(IndustryOption(
                industry_code=industry.get('industry_code', ''),
                industry_name=industry.get('industry_name', ''),
                is_hot=bool(industry.get('is_hot'))
            ))

        return create_success_response(
            data=options,
            message=f"获取行业选项成功，共{len(options)}个行业"
        )

    except Exception as e:
        logger.error(f"获取行业选项失败: {str(e)}")
        raise DatabaseException(f"获取行业选项失败: {str(e)}")


@router.get("/search", response_model=IndustrySearchResponse)
async def search_industries(
        keyword: str = Query(..., description="搜索关键词"),
        limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
):
    """搜索行业"""
    try:
        logger.info(f"搜索行业 - keyword: {keyword}, limit: {limit}")

        # 调用服务层进行搜索
        industries = industry_service.search_industries(
            keyword=keyword,
            limit=limit
        )

        # 转换为简化的数据格式
        simplified_data = [
            IndustrySearchItem(
                industry_code=industry.get("industry_code", ""),
                industry_name=industry.get("industry_name", "")
            )
            for industry in industries
        ]

        return IndustrySearchResponse(
            success=True,
            message="搜索行业成功",
            data=simplified_data
        )

    except Exception as e:
        logger.error(f"搜索行业失败: {str(e)}")
        raise DatabaseException(f"搜索行业失败: {str(e)}")


# ========== 行业K线相关接口 ==========


@router.get("/{ts_code}/klines", response_model=ApiResponse[IndustryKlineInfo])
async def get_industry_klines(
        ts_code: str,
        period: str = Query("daily", description="周期类型: daily/weekly/monthly"),
        limit: int = Query(500, ge=1, le=2000, description="限制数量"),
        end_date: Optional[str] = Query(None, description="结束日期: YYYYMMDD格式，K线数据截止到该日期"),
):
    """获取行业K线数据"""
    try:
        from ..core.validators import (
            validate_industry_ts_code,
            validate_period,
        )

        # 参数验证
        ts_code = validate_industry_ts_code(ts_code)
        period = validate_period(period)

        logger.info(
            f"获取行业K线数据 - ts_code: {ts_code}, period: {period}"
        )

        klines = industry_kline_service.get_industry_kline_data(
            ts_code=ts_code,
            period=period,
            limit=limit,
            end_date=end_date,
        )

        return ApiResponse[IndustryKlineInfo](
            success=True,
            message=f"获取{ts_code} {period}行业K线数据成功",
            data=IndustryKlineInfo(
                industry_code=ts_code,
                period=period,
                count=len(klines),
                klines=klines,
            ),
        )

    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"获取行业K线数据失败: {str(e)}")
        raise DatabaseException(f"获取行业K线数据失败: {str(e)}")


class SyncIndustryDataRequest(BaseModel):
    """同步行业数据请求模型"""
    industry_codes: List[str] = []
    all_selected: bool = False
    sync_mode: str = "sync"
    options: dict = {}
    periods: List[str] = ["daily"]


# ========== 行业数据同步接口 ==========

@router.post("/sync")
async def sync_industry_data(request: SyncIndustryDataRequest):
    """同步行业K线数据（任务式、支持多周期），与股票接口保持一致结构"""
    try:
        valid_periods = ("daily", "weekly", "monthly")
        invalid_periods = [p for p in request.periods if p not in valid_periods]
        if invalid_periods:
            raise HTTPException(status_code=400, detail=f"不支持的周期: {invalid_periods}，仅支持 {valid_periods}")

        if not request.periods:
            raise HTTPException(status_code=400, detail="请选择至少一个K线周期")

        selection = {"codes": request.industry_codes or [], "all_selected": bool(request.all_selected)}
        if not selection["all_selected"] and not selection["codes"]:
            raise HTTPException(status_code=400, detail="请选择要同步的行业或使用全选")

        options = request.options or {}

        from ..services.data.industry_kline_service import industry_kline_service
        result = industry_kline_service.create_kline_sync_tasks(
            selection=selection,
            periods=request.periods,
            options=options,
        )
        return {**result, "execution_mode": getattr(request, "sync_mode", "sync")}

    except Exception as e:
        logger.error(f"启动行业同步任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
