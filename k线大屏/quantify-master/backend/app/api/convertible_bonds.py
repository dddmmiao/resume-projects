"""
可转债API接口
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Query, Body, HTTPException
from loguru import logger
from pydantic import BaseModel

from ..core.exceptions import (
    ValidationException,
    DatabaseException,
)
# 接口返回模型定义
from ..core.response_models import (
    ApiResponse,
)
from ..models.schemas.kline_schemas import ConvertibleBondKlineItem
from ..services.data.convertible_bond_kline_service import convertible_bond_kline_service
from ..services.data.convertible_bond_service import convertible_bond_service

router = APIRouter(prefix="/api/convertible-bonds", tags=["convertible-bonds"])


# ========== 可转债接口返回模型定义 ==========

class ConvertibleBondCallStatus(BaseModel):
    """可转债赎回状态模型"""

    status: str
    display_name: str
    description: str
    color: str
    priority: int


class ConvertibleBondCallInfo(BaseModel):
    """可转债赎回信息模型 - 只包含必要字段"""

    call_type: str
    is_call: str
    call_status: ConvertibleBondCallStatus
    ann_date: Optional[str] = None
    call_date: Optional[str] = None
    call_price: Optional[float] = None


class ConvertibleBondBasicInfo(BaseModel):
    """可转债基本信息模型"""

    ts_code: str
    bond_short_name: str
    stk_code: Optional[str] = None
    stk_short_name: Optional[str] = None
    conv_end_date: Optional[str] = None
    list_status: Optional[str] = None
    conv_price: Optional[float] = None


class ConvertibleBondDetailInfo(BaseModel):
    """可转债详细信息模型 - 只包含必要字段"""

    ts_code: str
    bond_short_name: str
    stk_code: Optional[str] = None
    stk_short_name: Optional[str] = None
    concepts: List[str] = []
    industries: List[str] = []
    call_records: List[ConvertibleBondCallInfo] = []
    is_hot: bool = False
    hot_concept: Optional[str] = None
    hot_rank_reason: Optional[str] = None


class ConvertibleBondKlineInfo(BaseModel):
    """可转债K线信息模型"""

    ts_code: str
    period: str
    count: int
    klines: List[ConvertibleBondKlineItem]


class ConvertibleBondSearchItem(BaseModel):
    """可转债搜索项模型"""

    ts_code: str
    bond_short_name: str


class ConvertibleBondSearchResponse(BaseModel):
    """可转债搜索响应模型"""

    success: bool = True
    message: str = "搜索可转债成功"
    data: List[ConvertibleBondSearchItem]


class ConvertibleBondStatsItem(BaseModel):
    """可转债统计明细项（与股票统计保持一致结构）"""
    code: str
    name: str
    open: float = 0.0  # 开盘价
    close: float
    pct_chg: float
    intraday_pct: float
    amount: float
    circ_mv: float = 0.0  # 流通市值(万元)


class ConvertibleBondStatsResponse(BaseModel):
    """可转债统计响应模型（只返回items，summary由前端计算）"""
    items: List[ConvertibleBondStatsItem]


class ConvertibleBondCompareRequest(BaseModel):
    """可转债日期对比统计请求模型"""
    industries: Optional[List[str]] = None
    concepts: Optional[List[str]] = None
    search: Optional[str] = None
    ts_codes: Optional[List[str]] = None  # 直接指定代码列表筛选
    base_date: str  # 基准日期 YYYYMMDD
    compare_date: str  # 对比日期 YYYYMMDD
    sort_period: str = "daily"  # 周期类型 (daily/weekly/monthly)


class ConvertibleBondCompareStatsItem(BaseModel):
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
    circ_mv: float = 0.0  # 流通市值(万元)


class ConvertibleBondCompareStatsResponse(BaseModel):
    """日期对比统计响应模型（summary由前端计算）"""
    base_date: str
    compare_date: str
    items: List[ConvertibleBondCompareStatsItem] = []


# ========== API路由定义 ==========


class ConvertibleBondListRequest(BaseModel):
    """可转债列表请求模型（POST）"""
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


def _build_cb_query_context(request: ConvertibleBondListRequest):
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


@router.post("", response_model=ApiResponse[List[ConvertibleBondDetailInfo]])
async def get_convertible_bonds(request: ConvertibleBondListRequest = Body(...)):
    """获取可转债列表（POST，仅请求体），与股票保持一致"""
    try:
        from ..core.validators import (
            SearchParams,
            normalize_pagination,
        )
        from ..core.response_models import create_list_response

        # 参数验证和标准化
        page, page_size, offset = normalize_pagination(request.page, request.page_size)

        # 使用搜索参数模型验证并构建上下文

        logger.info(
            f"获取可转债列表 - industries: {request.industries}, concepts: {request.concepts}, search: {request.search}, page: {request.page}, ts_codes: {len(request.ts_codes) if request.ts_codes else 0}"
        )

        # 如果启用热度排序，设置默认排序
        if request.hot_sort and not request.sort_by:
            request.sort_by = "hot_score"
            request.sort_order = "desc"

        effective_trade_date, industry_list, concept_list = _build_cb_query_context(request)
        
        filter_result = convertible_bond_service.filter_convertible_bonds(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            limit=page_size,
            offset=offset,
            sort_by=request.sort_by,
            sort_period=request.sort_period or "daily",
            sort_order=request.sort_order,
            trade_date=effective_trade_date,
        )

        # 使用标准列表响应
        return create_list_response(
            items=filter_result.get("bonds", []),
            total=filter_result.get("total", 0),
            page=request.page,
            page_size=request.page_size,
            message=f"获取可转债列表成功，共{filter_result.get('total', 0)}条记录",
        )

    except Exception as e:
        logger.error(f"获取可转债列表失败: {str(e)}")
        raise DatabaseException(f"获取可转债列表失败: {str(e)}")


@router.post("/ts-codes", response_model=ApiResponse[List[str]])
async def get_convertible_bond_ts_codes(request: ConvertibleBondListRequest = Body(...)):
    """获取符合筛选条件的可转债代码列表（支持排序和数量限制）。"""
    from ..core.response_models import create_success_response

    try:
        effective_trade_date, industry_list, concept_list = _build_cb_query_context(request)
        # 后端最大限制 500 条
        MAX_PUSH_LIMIT = 500
        effective_limit = min(request.page_size, MAX_PUSH_LIMIT) if request.page_size and request.page_size > 0 else None
        
        ts_codes = convertible_bond_service.get_filtered_ts_codes(
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
            message=f"获取可转债代码列表成功，共{len(ts_codes)}个代码",
        )
    except Exception as e:
        logger.error(f"获取可转债代码列表失败: {str(e)}")
        raise DatabaseException(f"获取可转债代码列表失败: {str(e)}")


@router.post("/stats", response_model=ApiResponse[ConvertibleBondStatsResponse])
async def get_convertible_bond_stats(request: ConvertibleBondListRequest = Body(...)):
    """获取当前筛选条件下的可转债统计信息（不分页，聚合全部结果）。"""
    from ..core.response_models import create_success_response

    try:
        effective_trade_date, industry_list, concept_list = _build_cb_query_context(request)

        stats_dict: Dict[str, Any] = convertible_bond_service.get_convertible_bond_stats(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            trade_date=effective_trade_date,
            sort_period=request.sort_period or "daily",
        )

        stats_model = ConvertibleBondStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取可转债统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取可转债统计信息失败: {str(e)}")
        raise DatabaseException(f"获取可转债统计信息失败: {str(e)}")


@router.post("/stats/compare", response_model=ApiResponse[ConvertibleBondCompareStatsResponse])
async def get_convertible_bond_compare_stats(request: ConvertibleBondCompareRequest = Body(...)):
    """获取两个日期之间的可转债涨跌对比统计。
    
    计算公式：(B日收盘 - A日开盘) / A日开盘 * 100
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

        stats_dict = convertible_bond_service.get_convertible_bond_compare_stats(
            industry=industry_list,
            concepts=concept_list,
            search=request.search,
            ts_codes=request.ts_codes,
            base_date=request.base_date,
            compare_date=request.compare_date,
            sort_period=request.sort_period,
        )

        stats_model = ConvertibleBondCompareStatsResponse(**stats_dict)

        return create_success_response(
            data=stats_model,
            message="获取可转债对比统计信息成功",
        )
    except Exception as e:
        logger.error(f"获取可转债对比统计信息失败: {str(e)}")
        raise DatabaseException(f"获取可转债对比统计信息失败: {str(e)}")


@router.get("/search", response_model=ConvertibleBondSearchResponse)
async def search_convertible_bonds(
        keyword: str = Query(..., description="搜索关键词"),
        limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
):
    """搜索可转债"""
    try:
        logger.info(f"搜索可转债 - keyword: {keyword}, limit: {limit}")

        # 调用服务层进行搜索
        bonds = convertible_bond_service.search_convertible_bonds(
            keyword=keyword,
            limit=limit
        )

        # 转换为简化的数据格式
        simplified_data = [
            ConvertibleBondSearchItem(
                ts_code=bond.get("ts_code", ""),
                bond_short_name=bond.get("bond_short_name", "")
            )
            for bond in bonds
        ]

        return ConvertibleBondSearchResponse(
            success=True,
            message="搜索可转债成功",
            data=simplified_data,
        )
    except Exception as e:
        logger.error(f"搜索可转债失败: {str(e)}")
        raise DatabaseException(f"搜索可转债失败: {str(e)}")


# ========== 可转债K线相关接口 ==========


@router.get("/{ts_code}/klines", response_model=ApiResponse[ConvertibleBondKlineInfo])
async def get_convertible_bond_klines(
        ts_code: str,
        period: str = Query("daily", description="周期类型: daily/weekly/monthly"),
        limit: int = Query(500, ge=1, le=2000, description="限制数量"),
        end_date: Optional[str] = Query(None, description="结束日期: YYYYMMDD格式，K线数据截止到该日期"),
):
    """获取可转债K线数据"""
    try:
        from ..core.validators import (
            validate_ts_code,
            validate_period,
        )

        # 参数验证
        ts_code = validate_ts_code(ts_code)
        period = validate_period(period)

        logger.info(
            f"获取可转债K线数据 - ts_code: {ts_code}, period: {period}"
        )

        # 使用KlineService获取数据
        klines = convertible_bond_kline_service.get_convertible_bond_kline_data(
            ts_code=ts_code,
            period=period,
            limit=limit,
            end_date=end_date,
        )

        return ApiResponse[ConvertibleBondKlineInfo](
            success=True,
            message=f"获取{ts_code} {period}K线数据成功",
            data=ConvertibleBondKlineInfo(
                ts_code=ts_code,
                period=period,
                count=len(klines),
                klines=klines,
            ),
        )

    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"获取可转债K线数据失败: {str(e)}")
        raise DatabaseException(f"获取可转债K线数据失败: {str(e)}")


class SyncConvertibleBondDataRequest(BaseModel):
    """同步可转债数据请求模型"""
    ts_codes: List[str] = []
    all_selected: bool = False
    sync_mode: str = "sync"
    options: dict = {}
    periods: List[str] = ["daily"]  # 与股票一致：支持多周期


# ========== 可转债数据同步接口 ==========

@router.post("/sync")
async def sync_convertible_bond_data(request: SyncConvertibleBondDataRequest):
    """同步可转债K线数据到数据库（任务式、支持多周期），与股票接口保持一致结构"""
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
            raise HTTPException(status_code=400, detail="请选择要同步的可转债或使用全选")

        options = request.options or {}

        from ..services.data.convertible_bond_kline_service import convertible_bond_kline_service
        return {
            **convertible_bond_kline_service.create_kline_sync_tasks(
                selection=selection,
                periods=request.periods,
                options=options,
            ),
            "execution_mode": request.sync_mode
        }

    except Exception as e:
        logger.error(f"启动可转债同步任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"启动可转债同步任务失败: {str(e)}")
