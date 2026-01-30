"""
自选批量解析 API
"""

from typing import List, Optional, Dict, Any
from typing import Union, Literal

from fastapi import APIRouter, Body, Header, Request
from loguru import logger
from pydantic import BaseModel, validator

from .concepts import ConceptDetailInfo
from .convertible_bonds import ConvertibleBondDetailInfo
from .industries import IndustryDetailInfo
from .stocks import StockDetailInfo
from ..core.exceptions import DatabaseException
from ..services.external.ths.core.constants import ThsSessionExpiredException
from ..core.response_models import ApiResponse

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


class FavoritesResolveRequest(BaseModel):
    stocks: Optional[List[str]] = None
    convertible_bonds: Optional[List[str]] = None
    concepts: Optional[List[str]] = None
    industries: Optional[List[str]] = None
    trade_date: Optional[str] = None  # 交易日期(YYYYMMDD)，默认为最新交易日
    group_name: Optional[str] = None


class ThsBatchPushRequest(BaseModel):
    """批量推送到同花顺分组请求"""
    group_name: str  # 目标分组名称
    ts_codes: List[str]  # 要推送的代码列表
    rebuild: bool = True  # 是否清空分组后重建（默认True，全量替换）


class FavoriteStockItem(StockDetailInfo):
    type: Literal['stock'] = 'stock'


class FavoriteConvertibleBondItem(ConvertibleBondDetailInfo):
    type: Literal['convertible_bond'] = 'convertible_bond'


class FavoriteConceptItem(ConceptDetailInfo):
    type: Literal['concept'] = 'concept'


class FavoriteIndustryItem(IndustryDetailInfo):
    type: Literal['industry'] = 'industry'


FavoriteResolvedItem = Union[
    FavoriteStockItem,
    FavoriteConvertibleBondItem,
    FavoriteConceptItem,
    FavoriteIndustryItem,
]


@router.post("/resolve", response_model=ApiResponse[List[FavoriteResolvedItem]])
async def resolve_favorites(
    request: Request,
    payload: FavoritesResolveRequest = Body(...),
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """
    批量解析自选代码，返回扁平列表，每项带 type，便于前端识别。
    后端内部按类型逐类查询，前端仅一次请求。
    
    Args:
        payload: 包含各类型代码列表和可选的交易日期的请求体
                trade_date: 交易日期(YYYYMMDD格式)，如不传入则使用最新交易日
    """
    try:
        from ..services.data.stock_service import StockService
        from ..services.data.convertible_bond_service import convertible_bond_service
        from ..services.data.concept_service import concept_service
        from ..services.data.industry_service import industry_service
        from ..services.data.trade_calendar_service import trade_calendar_service
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        stock_service = StockService()
        # 使用前端传入的交易日期，如果没有传入则使用最新交易日
        effective_trade_date = payload.trade_date or trade_calendar_service.get_latest_trading_day()

        # 1. 组装待解析代码集合：优先使用同花顺自选
        all_codes: List[str] = []

        try:
            ths_groups = ths_favorite_service.list_groups(ths_account=ths_account)
            ths_codes: List[str] = []

            target_groups = ths_groups
            requested_group_name = payload.group_name
            if requested_group_name:
                filtered_groups = [g for g in ths_groups if g.get("group_name") == requested_group_name]
                if not filtered_groups:
                    logger.warning(
                        f"resolve_favorites: 指定的同花顺自选分组未找到: {requested_group_name}"
                    )
                target_groups = filtered_groups

            for group in target_groups:
                for item in group.get("items", []) or []:
                    code = item.get("ts_code") or item.get("code")
                    if code:
                        ths_codes.append(code)
            all_codes = list(dict.fromkeys(ths_codes))
            if requested_group_name:
                logger.info(
                    f"resolve_favorites: 从同花顺分组 {requested_group_name} 获取到 {len(all_codes)} 个唯一代码"
                )
            else:
                logger.info(
                    f"resolve_favorites: 从同花顺自选获取到 {len(all_codes)} 个唯一代码"
                )
        except Exception as ths_error:
            logger.error(
                f"resolve_favorites: 从同花顺获取自选列表失败: {ths_error}"
            )

        if not all_codes:
            return create_success_response(
                data=[],
                message="未找到任何可解析的自选代码",
            )

        resolved: List[Dict[str, Any]] = []

        def try_resolve_single(code: str) -> Optional[Dict[str, Any]]:
            """按顺序尝试将 code 解析为 stock / bond / concept / industry。"""
            # 股票
            try:
                res = stock_service.filter_stocks(
                    search=code,
                    limit=1,
                    offset=0,
                    sort_by=None,
                    sort_order="asc",
                    trade_date=effective_trade_date,
                )
                items = res.get("stocks", [])
                if items:
                    item = items[0]
                    if item:
                        data_dict = dict(item)
                        model = FavoriteStockItem(type='stock', **data_dict)
                        return model.dict()
            except Exception as e:
                logger.warning(f"resolve_favorites: 按股票解析 {code} 失败: {e}")

            # 可转债
            try:
                res = convertible_bond_service.filter_convertible_bonds(
                    search=code,
                    limit=1,
                    offset=0,
                    trade_date=effective_trade_date,
                )
                items = res.get("bonds", [])
                if items:
                    item = items[0]
                    if item:
                        data_dict = dict(item)
                        model = FavoriteConvertibleBondItem(type='convertible_bond', **data_dict)
                        return model.dict()
            except Exception as e:
                logger.warning(f"resolve_favorites: 按可转债解析 {code} 失败: {e}")

            # 概念
            try:
                res = concept_service.filter_concepts(
                    search=code,
                    limit=1,
                    offset=0,
                    trade_date=effective_trade_date,
                )
                items = res.get("concepts", [])
                if items:
                    item = items[0]
                    if item:
                        data_dict = dict(item)
                        model = FavoriteConceptItem(type='concept', **data_dict)
                        return model.dict()
            except Exception as e:
                logger.warning(f"resolve_favorites: 按概念解析 {code} 失败: {e}")

            # 行业
            try:
                res = industry_service.filter_industries(
                    search=code,
                    limit=1,
                    offset=0,
                    trade_date=effective_trade_date,
                )
                items = res.get("industries", [])
                if items:
                    item = items[0]
                    if item:
                        data_dict = dict(item)
                        model = FavoriteIndustryItem(type='industry', **data_dict)
                        return model.dict()
            except Exception as e:
                logger.warning(f"resolve_favorites: 按行业解析 {code} 失败: {e}")

            return None

        for code in all_codes:
            item = try_resolve_single(code)
            if item:
                resolved.append(item)

        # 去重（按 type + 代码字段）并保持顺序
        seen = set()
        uniq: List[Dict[str, Any]] = []
        for it in resolved:
            code_key = it.get("ts_code") or it.get("concept_code") or it.get("industry_code")
            key = (it.get("type"), code_key)
            if key in seen:
                continue
            seen.add(key)
            uniq.append(it)

        return create_success_response(
            data=uniq,
            message=f"解析成功，共{len(uniq)}项"
        )
    except Exception as e:
        logger.error(f"解析自选失败: {str(e)}")
        raise DatabaseException(f"解析自选失败: {str(e)}")


class ThsFavoriteGroupResponse(BaseModel):
    group_id: str
    group_name: str


class ThsFavoriteModifyRequest(BaseModel):
    ts_code: str


class ThsFavoriteGroupCreateRequest(BaseModel):
    group_name: str
    
    @validator('group_name')
    def validate_group_name(cls, v):
        v = v.strip() if v else ''
        if not v:
            raise ValueError('分组名称不能为空')
        if len(v) > 20:
            raise ValueError('分组名称不能超过20个字符')
        return v

@router.get("/ths/groups", response_model=ApiResponse[List[ThsFavoriteGroupResponse]])
async def get_ths_groups(
    request: Request,
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """获取当前同花顺账号的所有自选分组（仅返回分组信息，不包含分组内股票列表）。"""
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        raw_groups = ths_favorite_service.list_groups(ths_account=ths_account)
        groups: List[ThsFavoriteGroupResponse] = []

        for g in raw_groups:
            groups.append(
                ThsFavoriteGroupResponse(
                    group_id=g.get("group_id") or "",
                    group_name=g.get("group_name") or "",
                )
            )

        return create_success_response(
            data=groups,
            message=f"获取同花顺自选分组成功，共{len(groups)}个分组",
        )
    except ThsSessionExpiredException as e:
        # 会话过期，返回200 + success=false，避免前端401拦截跳转
        logger.warning(f"同花顺会话过期: {e.ths_account}")
        from ..core.response_models import create_error_response
        return create_error_response(
            message="同花顺登录已过期，请重新登录"
        )
    except Exception as e:
        logger.error(f"获取同花顺自选分组失败: {str(e)}")
        raise DatabaseException(f"获取同花顺自选分组失败: {str(e)}")


@router.post("/ths/groups/{group_identifier}/items", response_model=ApiResponse[bool])
async def add_item_to_ths_group(
    request: Request,
    group_identifier: str,
    body: ThsFavoriteModifyRequest = Body(...),
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """向指定的同花顺自选分组添加一只股票。

    `group_identifier` 可以是分组名称或分组 ID。
    """
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        ths_favorite_service.add_to_group(group_identifier, body.ts_code, ths_account=ths_account)
        return create_success_response(data=True, message="添加到同花顺分组成功")
    except Exception as e:
        logger.error(f"添加到同花顺分组失败: {str(e)}")
        raise DatabaseException(f"添加到同花顺分组失败: {str(e)}")


@router.delete("/ths/groups/{group_identifier}/items/{ts_code}", response_model=ApiResponse[bool])
async def remove_item_from_ths_group(
    request: Request,
    group_identifier: str,
    ts_code: str,
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """从指定的同花顺自选分组中删除一只股票。

    `group_identifier` 可以是分组名称或分组 ID。
    """
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        ths_favorite_service.remove_from_group(group_identifier, ts_code, ths_account=ths_account)
        return create_success_response(data=True, message="从同花顺分组删除成功")
    except Exception as e:
        logger.error(f"从同花顺分组删除失败: {str(e)}")
        raise DatabaseException(f"从同花顺分组删除失败: {str(e)}")


@router.post("/ths/groups", response_model=ApiResponse[bool])
async def create_ths_group(
    request: Request,
    body: ThsFavoriteGroupCreateRequest = Body(...),
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """创建同花顺自选分组。"""
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        ths_favorite_service.add_group(body.group_name, ths_account=ths_account)
        return create_success_response(data=True, message=f"创建同花顺分组 '{body.group_name}' 成功")
    except Exception as e:
        logger.error(f"创建同花顺分组失败: {str(e)}")
        raise DatabaseException(f"创建同花顺分组失败: {str(e)}")


@router.delete("/ths/groups/{group_identifier}", response_model=ApiResponse[bool])
async def delete_ths_group(
    request: Request,
    group_identifier: str,
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """删除同花顺自选分组。
    
    `group_identifier` 可以是分组名称或分组 ID。
    """
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        ths_favorite_service.delete_group(group_identifier, ths_account=ths_account)
        return create_success_response(data=True, message=f"删除同花顺分组 '{group_identifier}' 成功")
    except Exception as e:
        logger.error(f"删除同花顺分组失败: {str(e)}")
        raise DatabaseException(f"删除同花顺分组失败: {str(e)}")


@router.post("/ths/groups/{group_identifier}/batch", response_model=ApiResponse[Dict[str, Any]])
async def batch_push_to_ths_group(
    request: Request,
    group_identifier: str,
    body: ThsBatchPushRequest = Body(...),
    ths_account: Optional[str] = Header(default=None, alias="X-THS-Account"),
):
    """批量推送代码到同花顺自选分组。
    
    - `group_identifier`: 目标分组名称或ID
    - `ts_codes`: 要推送的代码列表
    - `rebuild`: 是否清空分组后重建（默认True，全量替换）
    
    如果分组不存在，会自动创建。
    """
    try:
        from ..core.response_models import create_success_response
        from ..services.external.ths.favorites.favorite_service import ths_favorite_service

        if not body.ts_codes:
            return create_success_response(
                data={"group_name": group_identifier, "pushed_count": 0},
                message="代码列表为空，无需推送"
            )

        ths_favorite_service.reset_group_to_ts_codes(
            group_name_or_id=group_identifier,
            ts_codes=body.ts_codes,
            ths_account=ths_account,
            rebuild=body.rebuild
        )
        
        return create_success_response(
            data={
                "group_name": group_identifier,
                "pushed_count": len(body.ts_codes),
                "codes": body.ts_codes[:10],  # 只返回前10个用于预览
                "total": len(body.ts_codes)
            },
            message=f"成功推送 {len(body.ts_codes)} 个代码到分组 '{group_identifier}'"
        )
    except ThsSessionExpiredException:
        from ..core.response_models import create_error_response
        return create_error_response(
            message="同花顺登录已过期，请重新登录",
            status_code=401
        )
    except Exception as e:
        logger.error(f"批量推送到同花顺分组失败: {str(e)}")
        raise DatabaseException(f"批量推送到同花顺分组失败: {str(e)}")



