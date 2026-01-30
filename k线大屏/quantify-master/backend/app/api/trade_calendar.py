"""
交易日历API接口
提供交易日历数据的同步功能
"""

from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Query
from loguru import logger
from pydantic import BaseModel

from app.core.exceptions import DatabaseException, ValidationException
from app.core.response_models import create_success_response
from app.services.data.trade_calendar_service import trade_calendar_service

router = APIRouter(prefix="/api/trade-calendar", tags=["trade-calendar"])


# ========== 交易日历API模型定义 ==========

class TradeCalendarInfo(BaseModel):
    """交易日历信息模型"""

    cal_date: str
    is_open: bool
    pretrade_date: Optional[str] = None


class TradeCalendarSyncRequest(BaseModel):
    """交易日历同步请求模型"""

    start_date: Optional[str] = None
    end_date: Optional[str] = None
    force_sync: bool = False


class TradeCalendarSyncResponse(BaseModel):
    """交易日历同步响应模型"""

    success: bool
    message: str
    synced_count: int
    start_date: str
    end_date: str
    total_days: int
    trade_days: int


@router.post("/sync")
async def sync_trade_calendar(
        start_date: Optional[str] = Query(None, description="开始日期 YYYYMMDD，默认今天"),
        end_date: Optional[str] = Query(None, description="结束日期 YYYYMMDD，默认未来一年")
):
    """
    手动同步交易日历数据
    
    Args:
        start_date: 开始日期
        end_date: 结束日期
        
    Returns:
        同步结果
    """
    try:
        # 验证日期格式
        if start_date:
            try:
                datetime.strptime(start_date, "%Y%m%d")
            except ValueError:
                raise ValidationException("开始日期格式错误，应为YYYYMMDD")

        if end_date:
            try:
                datetime.strptime(end_date, "%Y%m%d")
            except ValueError:
                raise ValidationException("结束日期格式错误，应为YYYYMMDD")

        # 执行同步
        result = trade_calendar_service.sync_trade_calendar(
            start_date=start_date,
            end_date=end_date
        )

        return create_success_response(
            data=result,
            message="交易日历同步完成"
        )

    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"同步交易日历失败: {str(e)}")
        raise DatabaseException(f"同步交易日历失败: {str(e)}")


@router.get("/trading-days")
async def get_trading_days(
        start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
        end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
        exchange: str = Query("SSE", description="交易所代码"),
        months: int = Query(6, description="获取月数（当未指定日期范围时）")
):
    """
    获取交易日历列表
    
    Args:
        start_date: 开始日期，格式：YYYY-MM-DD
        end_date: 结束日期，格式：YYYY-MM-DD
        exchange: 交易所代码
        months: 当未指定日期范围时，获取前后几个月的数据
        
    Returns:
        交易日列表
    """
    try:
        # 处理日期范围
        if not start_date or not end_date:
            # 默认获取前后几个月的数据
            now = date.today()
            start_date_obj = now - timedelta(days=30 * months)
            end_date_obj = now + timedelta(days=30 * months)
        else:
            # 统一使用 YYYY-MM-DD 格式
            try:
                start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
                end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                raise ValidationException("日期格式错误，应为 YYYY-MM-DD 格式")

        # 🚀 架构优化：统一使用业务层服务，避免重复调用
        # 获取交易日数据（包含详细信息）
        calendar_data = trade_calendar_service.get_trading_days_in_range(
            start_date=start_date_obj,
            end_date=end_date_obj,
            exchange=exchange,
            include_holidays=True  # 包含节假日信息以便前端显示
        )

        return create_success_response(
            data={
                "trading_days": calendar_data,
                "start_date": start_date_obj.strftime("%Y-%m-%d"),
                "end_date": end_date_obj.strftime("%Y-%m-%d"),
                "exchange": exchange
            },
            message="获取交易日历成功"
        )

    except ValidationException:
        raise
    except Exception as e:
        logger.error(f"获取交易日历失败: {str(e)}")
        raise DatabaseException(f"获取交易日历失败: {str(e)}")
