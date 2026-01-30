"""
股票相关API路由
"""

from typing import List, Optional, Dict

from fastapi import APIRouter, Query, HTTPException, Body
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import (
    DatabaseException,
)
from ..core.response_models import (
    create_success_response,
    ApiResponse,
)
from ..models.schemas.kline_schemas import StockKlineItem
from ..services.data.stock_kline_service import stock_kline_service
from ..services.data.stock_service import StockService


class StockListRequest(BaseModel):
    """股票列表请求模型"""
    industries: Optional[List[str]] = None
    concepts: Optional[List[str]] = None
    search: Optional[str] = None
    ts_codes: Optional[List[str]] = None  # 直接指定代码列表筛选
    page: int = 1
    page_size: int = 20
    sort_by: Optional[str] = None
    sort_order: str = "asc"
    sort_period: Optional[str] = "daily"
    hot_sort: bool = False
    trade_date: Optional[str] = None  # 交易日期(YYYYMMDD)，默认为最新交易日


router = APIRouter(prefix="/api/stocks", tags=["stocks"])
stock_service = StockService()


class StockInfo(BaseModel):
    """股票信息模型"""

    ts_code: str
    symbol: str
    name: str
    area: Optional[str] = None
    industry: Optional[str] = None
    market: Optional[str] = None
    is_hs: Optional[str] = None


class ConvertibleBondCallStatus(BaseModel):
    """可转债赎回状态模型"""
    status: str
    display_name: str
    description: str
    color: str
    priority: int


class ConvertibleBondCallInfo(BaseModel):
    """可转债赎回信息模型"""
    call_type: Optional[str] = None
    is_call: Optional[str] = None
    call_status: Optional[ConvertibleBondCallStatus] = None
    ann_date: Optional[str] = None
    call_date: Optional[str] = None
    call_price: Optional[float] = None


class ConvertibleBondBasicInfo(BaseModel):
    """可转债基本信息模型（用于股票关联的可转债）"""

    ts_code: str
    bond_short_name: str
    call_records: List[ConvertibleBondCallInfo] = []


class StockDetailInfo(BaseModel):
    """股票详细信息模型 - 只包含必要字段"""

    ts_code: str
    name: str
    is_hot: Optional[bool] = False
    concepts: List[str] = []
    industries: List[str] = []
    convertible_bonds: List[ConvertibleBondBasicInfo] = []
    hot_concept: Optional[str] = None
    hot_rank_reason: Optional[str] = None


class StockKlineInfo(BaseModel):
    """股票K线信息模型"""

    ts_code: str
    period: str
    count: int
    klines: List[StockKlineItem]


class StockStatisticsInfo(BaseModel):
    """股票统计信息模型"""

    total_count: int
    market_distribution: Dict[str, int]
    industry_distribution: Dict[str, int]
    concept_distribution: Dict[str, int]


class StockStatsItem(BaseModel):
    """股票统计明细项"""
    code: str
    name: str
    open: float = 0.0  # 开盘价
    close: float
    pct_chg: float
    intraday_pct: float
    amount: float
    circ_mv: float = 0.0  # 流通市值(万元)，用于气泡图大小


class StockStatsResponse(BaseModel):
    """股票统计响应模型（只返回items，summary由前端计算）"""

    items: List[StockStatsItem]


class StockCompareRequest(BaseModel):
    """股票日期对比统计请求模型"""
    industries: Optional[List[str]] = None
    concepts: Optional[List[str]] = None
    search: Optional[str] = None
    ts_codes: Optional[List[str]] = None  # 直接指定代码列表筛选
    base_date: str  # 基准日期 YYYYMMDD
    compare_date: str  # 对比日期 YYYYMMDD
    sort_period: Optional[str] = "daily"  # 周期类型: daily/weekly/monthly


class CompareStatsItem(BaseModel):
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


class StockCompareStatsResponse(BaseModel):
    """日期对比统计响应模型（summary由前端计算）"""
    base_date: str
    compare_date: str
    items: List[CompareStatsItem] = []


def _build_stock_query_context(request: StockListRequest):
    from ..core.validators import SearchParams
    from ..services.data.trade_calendar_service import trade_calendar_service

    effective_trade_date = request.trade_date or trade_calendar_service.get_latest_trading_day()

    search_params = SearchParams(
        search=request.search,
        industries=request.industries,
        concepts=request.concepts,
        sort_by=request.sort_by,
        sort_order=request.sort_order,
        hot_sort=request.hot_sort,
    )

    concept_list = search_params.get_concept_list()
    industry_list = search_params.get_industry_list()

    return effective_trade_date, industry_list, concept_list


@router.post("", response_model=ApiResponse[List[StockDetailInfo]])
async def get_stocks(request: StockListRequest = Body(...)):
    """获取股票列表"""
    try:
        from ..core.validators import (
            normalize_pagination,
        )
        from ..core.response_models import create_list_response

        # 参数验证和标准化
        page, page_size, offset = normalize_pagination(request.page, request.page_size)

        logger.info(
            f"获取股票列表 - industries: {request.industries}, concepts: {request.concepts}, search: {request.search}, page: {request.page}"
        )

        # 如果启用热度排序，设置默认排序
        if request.hot_sort and not request.sort_by:
            request.sort_by = "hot_score"
            request.sort_order = "desc"

        effective_trade_date, industry_list, concept_list = _build_stock_query_context(request)
        
        filter_result = stock_service.filter_stocks(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            limit=page_size,
            offset=offset,
            sort_by=request.sort_by,  # 直接使用前端传入的字段名
            sort_period=request.sort_period or "daily",
            sort_order=request.sort_order,
            trade_date=effective_trade_date,  # 使用前端传入或默认的交易日期
        )

        # 使用标准列表响应
        return create_list_response(
            items=filter_result.get("stocks", []),
            total=filter_result.get("total", 0),
            page=request.page,
            page_size=request.page_size,
            message=f"获取股票列表成功，共{filter_result.get('total', 0)}条记录",
        )

    except Exception as e:
        logger.error(f"获取股票列表失败: {str(e)}")
        raise DatabaseException(f"获取股票列表失败: {str(e)}")


@router.post("/ts-codes", response_model=ApiResponse[List[str]])
async def get_stock_ts_codes(request: StockListRequest = Body(...)):
    """获取符合筛选条件的股票代码列表（支持排序和数量限制）。
    
    用于批量推送等场景，只返回 ts_code 列表，不返回详细数据。
    通过 page_size 参数控制返回数量（默认不限制）。
    """
    from ..core.response_models import create_success_response

    try:
        effective_trade_date, industry_list, concept_list = _build_stock_query_context(request)

        # 使用轻量级方法获取符合条件的 ts_code（支持排序和限制）
        # 后端最大限制 500 条
        MAX_PUSH_LIMIT = 500
        effective_limit = min(request.page_size, MAX_PUSH_LIMIT) if request.page_size and request.page_size > 0 else None
        
        ts_codes = stock_service.get_filtered_ts_codes(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes_filter=request.ts_codes,
            sort_by=request.sort_by or "hot_score",
            sort_order=request.sort_order or "desc",
            sort_period=request.sort_period or "daily",
            trade_date=effective_trade_date,
            limit=effective_limit,
        )
        
        return create_success_response(
            data=ts_codes,
            message=f"获取股票代码列表成功，共{len(ts_codes)}个代码",
        )

    except Exception as e:
        logger.error(f"获取股票代码列表失败: {str(e)}")
        raise DatabaseException(f"获取股票代码列表失败: {str(e)}")


@router.post("/stats", response_model=ApiResponse[StockStatsResponse])
async def get_stock_stats(request: StockListRequest = Body(...)):
    """获取当前筛选条件下的股票统计信息（不分页，聚合全部结果）。"""
    from ..core.response_models import create_success_response

    try:
        effective_trade_date, industry_list, concept_list = _build_stock_query_context(request)

        stats_dict = stock_service.get_stock_stats(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            trade_date=effective_trade_date,
            sort_period=request.sort_period or "daily",
        )

        # 将字典转换为响应模型
        stats_model = StockStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取股票统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取股票统计信息失败: {str(e)}")
        raise DatabaseException(f"获取股票统计信息失败: {str(e)}")


@router.post("/stats/compare", response_model=ApiResponse[StockCompareStatsResponse])
async def get_stock_compare_stats(request: StockCompareRequest = Body(...)):
    """获取两个日期之间的股票涨跌对比统计。
    
    计算公式：(B日收盘 - A日收盘) / A日收盘 * 100
    """
    from ..core.response_models import create_success_response
    from ..core.validators import SearchParams

    try:
        search_params = SearchParams(
            search=request.search,
            industries=request.industries,
            concepts=request.concepts,
        )
        concept_list = search_params.get_concept_list()
        industry_list = search_params.get_industry_list()

        stats_dict = stock_service.get_stock_compare_stats(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            base_date=request.base_date,
            compare_date=request.compare_date,
            sort_period=request.sort_period or "daily",
        )

        stats_model = StockCompareStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取股票对比统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取股票对比统计信息失败: {str(e)}")
        raise DatabaseException(f"获取股票对比统计信息失败: {str(e)}")


class StockSearchItem(BaseModel):
    """股票搜索项模型"""

    ts_code: str
    name: str


class StockSearchResponse(BaseModel):
    """股票搜索响应模型"""

    success: bool = True
    message: str = "搜索股票成功"
    data: List[StockSearchItem]


@router.get("/search", response_model=StockSearchResponse)
async def search_stocks(
        keyword: str = Query(..., description="搜索关键词"),
        limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
):
    """搜索股票"""
    try:
        logger.info(f"搜索股票 - keyword: {keyword}, limit: {limit}")

        # 调用服务层进行搜索
        stocks = stock_service.search_stocks(
            keyword=keyword,
            limit=limit
        )

        # 转换为简化的数据格式
        simplified_data = [
            StockSearchItem(
                ts_code=stock.get("ts_code", ""),
                name=stock.get("name", "")
            )
            for stock in stocks
        ]

        return StockSearchResponse(
            success=True,
            message="搜索股票成功",
            data=simplified_data,
        )
    except Exception as e:
        logger.error(f"搜索股票失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"搜索股票失败: {str(e)}")


@router.get("/{ts_code}/concepts")
async def get_stock_concepts(ts_code: str):
    """获取股票的所有概念"""
    try:
        logger.info(f"获取股票概念 - ts_code: {ts_code}")

        concepts = stock_service.get_stock_concepts(ts_code)

        if not concepts:
            logger.warning(f"股票 {ts_code} 没有关联的概念")

        return create_success_response(
            data=concepts,
            message=f"获取股票 {ts_code} 的概念成功，共{len(concepts)}个概念",
        )

    except Exception as e:
        logger.error(f"获取股票概念失败: {str(e)}")
        raise DatabaseException(f"获取股票概念失败: {str(e)}")


@router.get("/{ts_code}/industries")
async def get_stock_industries(ts_code: str):
    """获取股票所属的行业板块"""
    try:
        logger.info(f"获取股票行业 - ts_code: {ts_code}")

        industries = stock_service.get_stock_industries(ts_code)

        if not industries:
            logger.warning(f"股票 {ts_code} 没有关联的行业")

        return create_success_response(
            data=industries, 
            message=f"获取股票 {ts_code} 的行业成功，共{len(industries)}个行业"
        )

    except Exception as e:
        logger.error(f"获取股票行业失败: {str(e)}")
        raise DatabaseException(f"获取股票行业失败: {str(e)}")


# ========== 股票K线相关接口 ==========


@router.get("/{ts_code}/klines", response_model=ApiResponse[StockKlineInfo])
async def get_stock_klines(
        ts_code: str,
        period: str = Query("daily", description="周期类型: daily/weekly/monthly"),
        limit: int = Query(500, ge=1, le=2000, description="限制数量"),
        end_date: Optional[str] = Query(None, description="结束日期: YYYYMMDD格式，K线数据截止到该日期"),
):
    """获取股票K线数据"""
    try:
        from ..core.validators import (
            validate_ts_code,
            validate_period,
        )

        # 参数验证
        ts_code = validate_ts_code(ts_code)
        period = validate_period(period)

        logger.info(
            f"获取股票K线数据 - ts_code: {ts_code}, period: {period}"
        )

        # 使用专用服务获取数据
        klines = stock_kline_service.get_stock_kline_data(
            ts_code=ts_code,
            period=period,
            limit=limit,
            end_date=end_date,
        )

        return ApiResponse[StockKlineInfo](
            success=True,
            message=f"获取{ts_code} {period}K线数据成功",
            data=StockKlineInfo(
                ts_code=ts_code,
                period=period,
                count=len(klines),
                klines=klines,
            ),
        )

    except Exception as e:
        logger.error(f"获取股票K线数据失败: {str(e)}")
        raise DatabaseException(f"获取股票K线数据失败: {str(e)}")


class SyncStockDataRequest(BaseModel):
    """同步股票数据请求模型（统一任务式，支持多周期）"""
    ts_codes: List[str] = []
    periods: List[str] = ["daily"]  # daily | weekly | monthly（支持多周期）
    all_selected: bool = False  # 全选标志：服务端自行获取全部代码
    sync_mode: str = "sync"  # 同步模式
    options: dict = {}  # 额外选项


# ========== 股票数据同步接口 ==========

@router.post("/sync")
async def sync_stock_data(request: SyncStockDataRequest):
    """同步股票K线数据到数据库（任务式、支持多周期）"""
    try:
        # 校验周期
        valid_periods = ("daily", "weekly", "monthly")
        invalid_periods = [p for p in request.periods if p not in valid_periods]
        if invalid_periods:
            raise HTTPException(status_code=400, detail=f"不支持的周期: {invalid_periods}，仅支持 {valid_periods}")

        if not request.periods:
            raise HTTPException(status_code=400, detail="请选择至少一个K线周期")

        selection = {"codes": request.ts_codes or [], "all_selected": bool(request.all_selected)}
        if not selection["all_selected"] and not selection["codes"]:
            raise HTTPException(status_code=400, detail="请选择要同步的股票或使用全选")

        options = request.options or {}

        # 委托业务 service 处理
        from ..services.data.stock_kline_service import stock_kline_service
        return {
            **stock_kline_service.create_kline_sync_tasks(
                selection=selection,
                periods=request.periods,
                options=options,
            ),
            "execution_mode": request.sync_mode,
        }

    except Exception as e:
        logger.error(f"股票同步失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"股票同步失败: {str(e)}")
