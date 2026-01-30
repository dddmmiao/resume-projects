"""
Tushare数据服务
"""

import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import pandas as pd
import tushare as ts
from loguru import logger

from app.core.exceptions import TaskCancelledException, CancellationException
from config.config import settings
from .tushare.constants import (
    THS_INDEX_FIELDS,
    THS_DAILY_FIELDS,
    THS_HOT_FIELDS,
    CB_DAILY_FIELDS,
    STOCK_BASIC_FIELDS,
    CB_CALL_FIELDS,
    WEEKLY_FIELDS,
    MONTHLY_FIELDS,
    CB_BASIC_FIELDS,
    STK_AUCTION_FIELDS,
    DAILY_BASIC_FIELDS,
)
from .tushare.dto import (
    ConceptDTO,
    IndustryDTO,
    ThsDailyDTO,
    ThsMemberDTO,
    ThsHotDTO,
    StockDTO,
    CbDailyDTO,
    CbCallDTO,
    CbBasicDTO,
    StockKlineDTO,
    StockAuctionDTO,
    TradeCalDTO,
    ThsIndexDTO,
    DailyBasicDTO,
)


class TushareService:
    """Tushare数据服务类"""

    def __init__(self):
        """初始化Tushare服务"""
        if not hasattr(settings, "TUSHARE_TOKEN") or not settings.TUSHARE_TOKEN:
            raise ValueError("请在配置文件中设置TUSHARE_TOKEN")

        # 直接传递token给pro_api，避免set_token()写入文件时的权限问题
        self.pro = ts.pro_api(token=settings.TUSHARE_TOKEN)

        # 验证Token有效性
        try:
            # 测试基础权限
            test_cal = self.pro.trade_cal(
                exchange="SSE", start_date="20240801", end_date="20240801"
            )
            if test_cal.empty:
                logger.warning("Tushare Token可能无效或权限不足 - 无法获取交易日历")
            else:
                logger.info("Tushare服务初始化成功，Token验证通过")
        except Exception as e:
            logger.error(f"Tushare Token验证失败: {e}")
            logger.warning("请检查Token是否有效，账户是否正常，权限是否足够")
            # 不抛出异常，继续初始化，让服务尝试运行

        # 初始化通用限流桶（按接口维度）
        # 结构: { api_name: deque[timestamps] }
        import threading
        # 速率与重试全局控制
        self._lock = threading.Lock()

        # 可按接口名精细控制的策略字典（可在运行时动态调整）
        # 根据Tushare的实际限制设置差异化的限流策略
        # 字段说明：
        #  - per_minute: 每分钟最大请求数（0/None 表示不限制）
        #  - per_second: 每秒最大请求数（0/None 表示不限制）
        #  - burst: 突发余量（仅用于每分钟窗口，给予短时突发的额外容量）
        #  - concurrency: 同时并发上限
        #  - retries: 频控重试次数
        #  - backoff_start: 初始退避秒数
        #  - jitter: 退避抖动上限秒数
        self._default_rate_policies = {
            'default': {
                'per_minute': 2000,
                'per_second': 30,
                'burst': 50,
                'concurrency': 15,
                'retries': 3,
                'backoff_start': 1.0,
                'jitter': 0.5,
            },
            # daily接口优化限制（基于官方限制：每分钟500次）
            'daily': {
                'per_minute': 500,    # 官方限制：每分钟500次
                'per_second': 8,      # 500/60 ≈ 8.3，保守设置为8
                'burst': 15,          # 允许突发请求
                'concurrency': 8,     # 优化并发数，充分利用API限制
                'retries': 3,
                'backoff_start': 1.0,
                'jitter': 0.5,
            },
            # daily_basic接口（每日指标）：官方限制每分钟500次
            'daily_basic': {
                'per_minute': 500,
                'per_second': 8,
                'burst': 15,
                'concurrency': 8,
                'retries': 3,
                'backoff_start': 1.0,
                'jitter': 0.5,
            },
            # cb_daily接口中等限制（可转债日线）
            'cb_daily': {
                'per_minute': 480,
                'per_second': 10,
                'burst': 20,
                'concurrency': 5,
                'retries': 3,
                'backoff_start': 1.2,
                'jitter': 0.6,
            },
            # ths_daily接口严格限制（同花顺板块指数行情）
            # Tushare实际限制：100次/分钟，这里设置为90次/分钟留10%安全余量
            'ths_daily': {
                'per_minute': 90,
                'per_second': 2,
                'burst': 5,
                'concurrency': 2,
                'retries': 3,
                'backoff_start': 2.0,
                'jitter': 1.0,
            },
            # weekly接口（股票周线）：官方上限约800/min，这里设置为400/min留更多余量
            'weekly': {
                'per_minute': 400,
                'per_second': 8,
                'burst': 10,
                'concurrency': 2,
                'retries': 3,
                'backoff_start': 1.5,
                'jitter': 0.8,
            },
            # monthly接口（股票月线）：官方上限约800/min，这里设置为400/min留更多余量
            'monthly': {
                'per_minute': 400,
                'per_second': 8,
                'burst': 10,
                'concurrency': 2,
                'retries': 3,
                'backoff_start': 1.5,
                'jitter': 0.8,
            },
            # stk_auction接口（开盘竞价）：参考daily接口限制
            'stk_auction': {
                'per_minute': 500,
                'per_second': 8,
                'burst': 15,
                'concurrency': 8,
                'retries': 3,
                'backoff_start': 1.0,
                'jitter': 0.5,
            },
            # ths_member接口严格限制
            'ths_member': {
                'per_minute': 200,
                'per_second': 5,
                'burst': 10,
                'concurrency': 3,
                'retries': 3,
                'backoff_start': 1.5,
                'jitter': 0.8,
            },
        }

        # 限流策略说明：
        # 1. default: 宽松策略，适用于大部分接口（stock_basic, weekly, monthly等）
        # 2. daily: 中等限制，适用于股票日线数据接口
        # 3. ths_daily: 中等限制，适用于同花顺板块指数行情接口
        # 4. ths_member: 严格限制，适用于同花顺板块成分接口

        # 从 Redis 加载配置并合并默认值
        self._rate_policies = self._load_rate_policies()

        # 记录限流策略配置
        logger.info("Tushare限流策略配置:")
        for api_name, policy in self._rate_policies.items():
            logger.info(
                f"  {api_name}: {policy['per_minute']}/分钟, {policy['per_second']}/秒, 并发上限{policy['concurrency']}")

        # 初始化客户端
        from ..external.tushare_client import TushareClient
        self._client = TushareClient(self.pro, self._rate_policies)

    def _load_rate_policies(self) -> dict:
        """从 Redis 加载频次配置（Redis 配置已包含默认值）"""
        try:
            from app.services.core.system_config_service import system_config_service
            redis_policies = system_config_service.get_tushare_rate_policies()
            if redis_policies:
                logger.info(f"已从 Redis 加载 Tushare 频次配置")
                return redis_policies
        except Exception as e:
            logger.warning(f"从 Redis 加载 Tushare 频次配置失败，使用默认值: {e}")
        
        return self._default_rate_policies.copy()
    
    def reload_rate_policies(self) -> None:
        """重新加载频次配置（运行时动态更新）"""
        self._rate_policies = self._load_rate_policies()
        self._client.update_rate_policies(self._rate_policies)
        logger.info("已重新加载 Tushare 频次配置")

    # ---------------- 通用限流与重试封装 ----------------
    def _call_pro(self, api_name: str, **kwargs):
        try:
            return self._client.call_pro(api_name, **kwargs)
        except TaskCancelledException:
            # 统一处理取消异常，重新抛出让上层处理
            raise CancellationException("任务已取消")
        except Exception as e:
            # 统一处理其他异常，记录日志后重新抛出
            logger.error(f"Tushare API调用失败: {api_name}, 参数: {kwargs}, 错误: {e}")
            raise

    def get_stock_list(self, task_id: str = None) -> List[StockDTO]:
        """获取股票列表（返回 DTO）。"""
        df = self._call_pro(
            'stock_basic',
            exchange="",
            list_status="L",
            fields=STOCK_BASIC_FIELDS,
            task_id=task_id,
        )

        if df is None or df.empty:
            logger.warning("Tushare获取股票列表为空或失败")
            return []

        dtos: List[StockDTO] = []
        for _, row in df.iterrows():
            dtos.append(
                StockDTO(
                    ts_code=row.get("ts_code"),
                    symbol=row.get("symbol"),
                    name=row.get("name"),
                    area=row.get("area"),
                    industry=row.get("industry"),
                    market=row.get("market"),
                    list_date=row.get("list_date"),
                    is_hs=row.get("is_hs"),
                )
            )
        logger.info(f"Tushare获取股票列表成功，共{len(dtos)}只股票")
        return dtos

    # ==================== K线数据 ====================

    def get_daily_data(
            self,
            ts_code: Optional[str] = None,
            trade_date: Optional[str] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> List[StockKlineDTO]:
        """
        获取日线数据（返回 DTO 列表，保持统一架构）。
        """
        df = self._call_pro(
            'daily',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            task_id=task_id,
        )
        if df is None or df.empty:
            logger.warning("获取日线数据为空")
            return []
        result: List[StockKlineDTO] = []
        for _, row in df.iterrows():
            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else 0.0
                except Exception:
                    return 0.0

            result.append(
                StockKlineDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=str(row.get("trade_date")),
                    open=_sf(row.get("open")),
                    high=_sf(row.get("high")),
                    low=_sf(row.get("low")),
                    close=_sf(row.get("close")),
                    pre_close=(float(row.get("pre_close")) if pd.notna(row.get("pre_close")) else None),
                    change=(float(row.get("change")) if pd.notna(row.get("change")) else None),
                    pct_chg=(float(row.get("pct_chg")) if pd.notna(row.get("pct_chg")) else None),
                    vol=(float(row.get("vol")) if pd.notna(row.get("vol")) else None),
                    amount=(float(row.get("amount")) if pd.notna(row.get("amount")) else None),
                )
            )
        logger.info(f"获取日线数据成功，股票: {ts_code}, 记录数: {len(result)}")
        return result

    def get_auction_data(
            self,
            ts_code: Optional[str] = None,
            trade_date: Optional[str] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> List[StockAuctionDTO]:
        """
        获取开盘竞价数据（返回 DTO 列表）
        
        Args:
            ts_code: 股票代码
            trade_date: 交易日期（YYYYMMDD格式）
            start_date: 开始日期
            end_date: 结束日期
            task_id: 任务ID，用于取消检查
            
        Returns:
            开盘竞价数据DTO列表
        """
        df = self._call_pro(
            'stk_auction',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            fields=STK_AUCTION_FIELDS,
            task_id=task_id,
        )
        if df is None or df.empty:
            logger.warning("获取开盘竞价数据为空")
            return []
        result: List[StockAuctionDTO] = []
        for _, row in df.iterrows():
            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else 0.0
                except Exception:
                    return 0.0
            
            def _si(v):
                try:
                    return int(v) if pd.notna(v) else 0
                except Exception:
                    return 0
            
            result.append(
                StockAuctionDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=str(row.get("trade_date")),
                    vol=_si(row.get("vol")),
                    price=_sf(row.get("price")),
                    amount=_sf(row.get("amount")),
                    pre_close=_sf(row.get("pre_close")),
                    turnover_rate=_sf(row.get("turnover_rate")) if pd.notna(row.get("turnover_rate")) else None,
                    volume_ratio=_sf(row.get("volume_ratio")) if pd.notna(row.get("volume_ratio")) else None,
                    float_share=_sf(row.get("float_share")) if pd.notna(row.get("float_share")) else None,
                )
            )
        
        # 优化日志：根据查询条件显示不同信息
        if ts_code:
            log_msg = f"获取开盘竞价数据成功 | 股票: {ts_code}, 记录数: {len(result)}"
        elif trade_date:
            log_msg = f"获取开盘竞价数据成功 | 日期: {trade_date}, 记录数: {len(result)}"
        else:
            log_msg = f"获取开盘竞价数据成功 | 日期范围: {start_date}-{end_date}, 记录数: {len(result)}"
        logger.info(log_msg)
        return result

    def get_daily_basic(
            self,
            ts_code: Optional[str] = None,
            trade_date: Optional[str] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> List[DailyBasicDTO]:
        """
        获取每日指标数据（返回 DTO 列表）
        
        Args:
            ts_code: 股票代码
            trade_date: 交易日期（YYYYMMDD格式）
            start_date: 开始日期
            end_date: 结束日期
            task_id: 任务ID，用于取消检查
            
        Returns:
            每日指标数据DTO列表
        """
        df = self._call_pro(
            'daily_basic',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            fields=DAILY_BASIC_FIELDS,
            task_id=task_id,
        )
        if df is None or df.empty:
            logger.warning("获取每日指标数据为空")
            return []
        
        result: List[DailyBasicDTO] = []
        for _, row in df.iterrows():
            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else None
                except Exception:
                    return None
            
            result.append(
                DailyBasicDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=str(row.get("trade_date")),
                    close=_sf(row.get("close")),
                    turnover_rate=_sf(row.get("turnover_rate")),
                    turnover_rate_f=_sf(row.get("turnover_rate_f")),
                    volume_ratio=_sf(row.get("volume_ratio")),
                    pe=_sf(row.get("pe")),
                    pe_ttm=_sf(row.get("pe_ttm")),
                    pb=_sf(row.get("pb")),
                    ps=_sf(row.get("ps")),
                    ps_ttm=_sf(row.get("ps_ttm")),
                    dv_ratio=_sf(row.get("dv_ratio")),
                    dv_ttm=_sf(row.get("dv_ttm")),
                    total_share=_sf(row.get("total_share")),
                    float_share=_sf(row.get("float_share")),
                    free_share=_sf(row.get("free_share")),
                    total_mv=_sf(row.get("total_mv")),
                    circ_mv=_sf(row.get("circ_mv")),
                )
            )
        
        # 优化日志
        if ts_code:
            log_msg = f"获取每日指标数据成功 | 股票: {ts_code}, 记录数: {len(result)}"
        elif trade_date:
            log_msg = f"获取每日指标数据成功 | 日期: {trade_date}, 记录数: {len(result)}"
        else:
            log_msg = f"获取每日指标数据成功 | 日期范围: {start_date}-{end_date}, 记录数: {len(result)}"
        logger.info(log_msg)
        return result

    def get_weekly_data(
            self,
            ts_code: Optional[str] = None,
            trade_date: Optional[str] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> List[StockKlineDTO]:
        """
        获取周线数据（返回 DTO 列表，保持统一架构）。
        """
        df = self._call_pro(
            'weekly',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            fields=WEEKLY_FIELDS,
            task_id=task_id,
        )
        if df is None or df.empty:
            logger.warning("获取周线数据为空")
            return []
        result: List[StockKlineDTO] = []
        for _, row in df.iterrows():
            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else 0.0
                except Exception:
                    return 0.0

            # 处理周线数据的pct_chg格式：Tushare周线返回的是小数形式(0.10)，需要转换为百分比格式(10.0)
            pct_chg_raw = row.get("pct_chg")
            pct_chg_value = None
            if pd.notna(pct_chg_raw):
                pct_chg_float = float(pct_chg_raw)
                # 周线数据通常是小数值，需要乘以100转换为百分比
                # 使用更严格的判断：如果绝对值小于0.1，说明是小数格式
                if abs(pct_chg_float) < 0.1:
                    pct_chg_value = pct_chg_float * 100
                else:
                    pct_chg_value = pct_chg_float

            result.append(
                StockKlineDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=str(row.get("trade_date")),
                    open=_sf(row.get("open")),
                    high=_sf(row.get("high")),
                    low=_sf(row.get("low")),
                    close=_sf(row.get("close")),
                    pre_close=(float(row.get("pre_close")) if pd.notna(row.get("pre_close")) else None),
                    change=(float(row.get("change")) if pd.notna(row.get("change")) else None),
                    pct_chg=pct_chg_value,
                    vol=(float(row.get("vol")) if pd.notna(row.get("vol")) else None),
                    amount=(float(row.get("amount")) if pd.notna(row.get("amount")) else None),
                )
            )
        logger.info(f"获取周线数据成功，股票: {ts_code}, 记录数: {len(result)}")
        return result

    def get_monthly_data(
            self,
            ts_code: Optional[str] = None,
            trade_date: Optional[str] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            task_id: str = None,
    ) -> List[StockKlineDTO]:
        """
        获取月线数据（返回 DTO 列表，保持统一架构）。
        """
        df = self._call_pro(
            'monthly',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            fields=MONTHLY_FIELDS,
            task_id=task_id,
        )
        if df is None or df.empty:
            logger.warning("获取月线数据为空")
            return []
        result: List[StockKlineDTO] = []
        for _, row in df.iterrows():
            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else 0.0
                except Exception:
                    return 0.0

            # 处理月线数据的pct_chg格式：Tushare月线返回的是小数形式(0.10)，需要转换为百分比格式(10.0)
            pct_chg_raw = row.get("pct_chg")
            pct_chg_value = None
            if pd.notna(pct_chg_raw):
                pct_chg_float = float(pct_chg_raw)
                # 月线数据通常是小数值，需要乘以100转换为百分比
                # 使用更严格的判断：如果绝对值小于0.1，说明是小数格式
                if abs(pct_chg_float) < 0.1:
                    pct_chg_value = pct_chg_float * 100
                else:
                    pct_chg_value = pct_chg_float

            result.append(
                StockKlineDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=str(row.get("trade_date")),
                    open=_sf(row.get("open")),
                    high=_sf(row.get("high")),
                    low=_sf(row.get("low")),
                    close=_sf(row.get("close")),
                    pre_close=(float(row.get("pre_close")) if pd.notna(row.get("pre_close")) else None),
                    change=(float(row.get("change")) if pd.notna(row.get("change")) else None),
                    pct_chg=pct_chg_value,
                    vol=(float(row.get("vol")) if pd.notna(row.get("vol")) else None),
                    amount=(float(row.get("amount")) if pd.notna(row.get("amount")) else None),
                )
            )
        logger.info(f"获取月线数据成功，股票: {ts_code}, 记录数: {len(result)}")
        return result

    def get_trade_cal(
            self,
            exchange: str = "",
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            is_open: Optional[str] = None,
            task_id: str = None,
    ) -> List[TradeCalDTO]:
        """
        获取交易日历

        Args:
            exchange: 交易所 SSE上交所 SZSE深交所
            start_date: 开始日期
            end_date: 结束日期
            is_open: 是否交易 '0'休市 '1'交易
            task_id: 任务id

        Returns:
            交易日历DTO列表
        """
        df = self._call_pro(
            'trade_cal', exchange=exchange, start_date=start_date, end_date=end_date, is_open=is_open, task_id=task_id
        )

        if df.empty:
            logger.warning("获取交易日历为空")
            return []

        # 转换为 DTO 列表
        items: List[TradeCalDTO] = []
        for _, row in df.iterrows():
            items.append(
                TradeCalDTO(
                    exchange=row.get("exchange"),
                    cal_date=str(row.get("cal_date")),
                    is_open=int(row.get("is_open") or 0),
                )
            )

        logger.info(f"获取交易日历成功，记录数: {len(items)}")
        return items

    # ==================== 可转债相关接口 ====================

    def get_convertible_bond_basic(
            self, ts_code: str = None, task_id: str = None
    ) -> List[CbBasicDTO]:
        """
        获取可转债基本信息

        Args:
            ts_code: 转债代码，可选

        Returns:
            可转债基本信息列表
        """
        if not self.pro:
            raise Exception("Tushare Pro未初始化")

        logger.info(f"开始获取可转债基本信息，ts_code: {ts_code or '全部'}")

        # 获取可转债基本信息，包含退市日期等关键字段
        df = self._call_pro(
            'cb_basic',
            fields=CB_BASIC_FIELDS,
            task_id=task_id,
        )

        if df.empty:
            logger.warning("未获取到可转债基本信息")
            return []

        logger.debug(f"获取可转债基本信息完成 | 数量: {len(df)}")

        # 转换为 DTO 列表
        result: List[CbBasicDTO] = []
        for _, row in df.iterrows():
            issue_size_raw = row.get("issue_size")
            issue_size_val = (
                float(issue_size_raw) / 100000000
                if pd.notna(issue_size_raw) and issue_size_raw
                else None
            )

            def _sf(v):
                try:
                    return float(v) if pd.notna(v) else None
                except Exception:
                    return None

            # 处理 remain_size（剩余规模，Tushare返回值为元，需转换为亿元）
            remain_size_raw = row.get("remain_size")
            remain_size_val = (
                float(remain_size_raw) / 100000000
                if pd.notna(remain_size_raw) and remain_size_raw
                else None
            )

            result.append(
                CbBasicDTO(
                    ts_code=row.get("ts_code"),
                    bond_short_name=row.get("bond_short_name"),
                    stk_code=row.get("stk_code"),
                    stk_short_name=row.get("stk_short_name"),
                    list_date=row.get("list_date"),
                    delist_date=row.get("delist_date"),
                    issue_date=row.get("issue_date"),
                    maturity_date=row.get("maturity_date"),
                    issue_size=issue_size_val,
                    remain_size=remain_size_val,
                    conv_start_date=row.get("conv_start_date"),
                    conv_end_date=row.get("conv_end_date"),
                    first_conv_price=_sf(row.get("first_conv_price")),
                    conv_price=_sf(row.get("conv_price")),
                    list_status=row.get("list_status", "L"),
                )
            )

        return result

    def get_convertible_bond_prices(
            self,
            ts_code: str = None,
            trade_date: str = None,
            start_date: str = None,
            end_date: str = None,
            task_id: str = None,
    ) -> List[CbDailyDTO]:
        """
        获取可转债价格数据

        Args:
            ts_code: 转债代码，可选
            trade_date: 交易日期，可选
            start_date: 开始日期，可选
            end_date: 结束日期，可选

        Returns:
            可转债价格数据列表
        """
        if not self.pro:
            raise Exception("Tushare Pro未初始化")

        logger.debug(
            f"获取可转债价格 | ts_code: {ts_code or '全部'} | trade_date: {trade_date} | start_date: {start_date} | end_date: {end_date}"
        )

        # 获取可转债价格数据 (使用cb_daily接口)，包含专用字段
        df = self._call_pro(
            'cb_daily',
            ts_code=ts_code,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            fields=CB_DAILY_FIELDS,
            task_id=task_id,
        )

        if df.empty:
            logger.warning(
                f"未获取到可转债价格数据，ts_code={ts_code}, start_date={start_date}, end_date={end_date}"
            )
            return []

        logger.debug(f"获取可转债价格完成 | ts_code: {ts_code or '全部'} | 数量: {len(df)}")

        # 转换为 DTO 列表
        from app.utils.number_utils import safe_float as _safe_float

        dtos: List[CbDailyDTO] = []
        for _, row in df.iterrows():
            # 规整交易日为字符串YYYYMMDD
            td_raw = row.get("trade_date")
            from app.utils import date_utils
            td_val = date_utils.normalize_to_yyyymmdd(td_raw)

            pre_close_v = _safe_float(row.get("pre_close")) or 0.0
            close_v = _safe_float(row.get("close"))
            open_v = _safe_float(row.get("open"))
            high_v = _safe_float(row.get("high"))
            low_v = _safe_float(row.get("low"))

            # 必填OHLC字段容错：若为空则用可得值回填，避免入库失败
            if close_v is None:
                close_v = (
                    pre_close_v
                    if pre_close_v != 0.0
                    else (open_v if open_v is not None else 0.0)
                )
            if open_v is None:
                open_v = close_v
            if high_v is None:
                high_v = max(open_v, close_v)
            if low_v is None:
                low_v = min(open_v, close_v)

            change_v = _safe_float(row.get("change"))
            if change_v is None and pre_close_v != 0.0 and close_v is not None:
                change_v = close_v - pre_close_v
            pct_chg_v = _safe_float(row.get("pct_chg"))
            if (
                    pct_chg_v is None
                    and change_v is not None
                    and pre_close_v != 0.0
            ):
                try:
                    pct_chg_v = round(change_v / pre_close_v * 100, 4)
                except Exception:
                    pct_chg_v = None

            vol_v = None
            try:
                vol_v = int(row.get("vol")) if pd.notna(row.get("vol")) else 0
            except Exception:
                vol_v = 0
            amount_v = _safe_float(row.get("amount"))
            if amount_v is None:
                amount_v = 0.0
            # 成交额单位转换：TuShare cb_daily 返回万元，转换为千元以与股票数据保持一致
            amount_v = amount_v * 10

            dtos.append(
                CbDailyDTO(
                    ts_code=row.get("ts_code"),
                    trade_date=td_val or "",
                    pre_close=pre_close_v,
                    open=open_v or 0.0,
                    high=high_v or 0.0,
                    low=low_v or 0.0,
                    close=close_v or 0.0,
                    change=change_v or 0.0,
                    pct_chg=pct_chg_v or 0.0,
                    vol=int(vol_v or 0),
                    amount=amount_v or 0.0,
                    bond_over_rate=_safe_float(row.get("bond_over_rate")),
                    cb_value=_safe_float(row.get("cb_value")),
                    cb_over_rate=_safe_float(row.get("cb_over_rate")),
                )
            )

        return dtos

    # ==================== 同花顺相关接口 ====================

    def get_ths_index(self, exchange: str = "A", index_type: str = None, task_id: str = None) -> List[ThsIndexDTO]:
        """
        获取同花顺概念和行业指数

        Args:
            exchange: 交易所代码，A-A股市场
            index_type: 类型
            task_id: 任务id

        Returns:
            指数列表
        """
        logger.info(f"获取同花顺指数数据，交易所: {exchange}, 类型: {index_type or 'ALL'}")

        kwargs = {"exchange": exchange}
        if index_type:
            # 文档参数名为 type，用 index_type 避免覆盖内建标识符
            kwargs["type"] = index_type

        # 规范字段集合，确保包含类型字段
        kwargs["fields"] = THS_INDEX_FIELDS

        df = self._call_pro('ths_index', task_id=task_id, **kwargs)

        if df is None or df.empty:
            logger.warning("未获取到同花顺指数数据")
            return []

        # DTO 输出
        dtos: List[ThsIndexDTO] = []
        for _, row in df.iterrows():
            cnt = row.get("count")
            cnt_int = int(float(cnt)) if (cnt is not None and pd.notna(cnt)) else 0
            dtos.append(
                ThsIndexDTO(
                    ts_code=row.get("ts_code", ""),
                    name=row.get("name", ""),
                    count=cnt_int,
                    exchange=row.get("exchange", ""),
                    list_date=row.get("list_date", ""),
                    type=row.get("type", ""),
                )
            )
        logger.info(f"成功获取 {len(dtos)} 个同花顺指数")
        return dtos

    def get_ths_daily(
            self, ts_code: str, start_date: str = None, end_date: str = None, task_id: str = None
    ) -> List[ThsDailyDTO]:
        if not end_date:
            end_date = datetime.now().strftime("%Y%m%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

        logger.debug(f"获取板块行情 | ts_code: {ts_code} | 范围: {start_date}..{end_date}")

        df = self._call_pro(
            'ths_daily',
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields=THS_DAILY_FIELDS,
            task_id=task_id,
        )

        if df is None or df.empty:
            logger.warning(f"未获取到 {ts_code} 的行情数据")
            return []

        df = df.sort_values("trade_date")

        dtos: List[ThsDailyDTO] = []
        for _, row in df.iterrows():
            vol = float(row.get("vol", 0)) if row.get("vol") else 0
            avg_price = float(row.get("avg_price", 0)) if row.get("avg_price") else 0
            # 成交额单位转换：vol*avg_price 计算结果比实际少100倍，因为 vol单位是手，需要 ×100 修正后 /1000 转千元
            # 净效果：/10
            calculated_amount = (vol * avg_price / 10) if vol and avg_price else 0
            # 市值单位转换：TuShare返回的是"元"，我们需要"千万元"，所以除以10000000
            total_mv_yuan = float(row.get("total_mv", 0) or 0)
            float_mv_yuan = float(row.get("float_mv", 0) or 0)
            
            dtos.append(
                ThsDailyDTO(
                    ts_code=row.get("ts_code", ""),
                    trade_date=row.get("trade_date", ""),
                    open=float(row.get("open", 0) or 0),
                    high=float(row.get("high", 0) or 0),
                    low=float(row.get("low", 0) or 0),
                    close=float(row.get("close", 0) or 0),
                    pre_close=float(row.get("pre_close", 0) or 0),
                    change=float(row.get("change", 0) or 0),
                    pct_chg=float(row.get("pct_change", 0) or 0),
                    vol=vol,
                    amount=calculated_amount,
                    turnover_rate=float(row.get("turnover_rate", 0) or 0),
                    total_mv=total_mv_yuan / 10000000,  # 转换为千万元（1千万 = 10000000元）
                    float_mv=float_mv_yuan / 10000000,  # 转换为千万元
                )
            )
        logger.debug(f"获取板块行情完成 | ts_code: {ts_code} | 数量: {len(dtos)}")
        return dtos

    def get_ths_member(self, ts_code: str, task_id: str = None) -> List[ThsMemberDTO]:
        """
        获取同花顺概念板块成分

        Args:
            ts_code: 板块指数代码
            task_id: 任务id

        Returns:
            成分股列表
        """
        logger.debug(f"获取板块成分 | ts_code: {ts_code}")

        df = self._call_pro('ths_member', ts_code=ts_code, task_id=task_id)

        if df is None or df.empty:
            logger.warning(f"未获取到 {ts_code} 的成分股数据")
            return []

        # DTO 输出
        dtos: List[ThsMemberDTO] = []
        for _, row in df.iterrows():
            dtos.append(
                ThsMemberDTO(
                    ts_code=row.get("ts_code", ""),
                    code=row.get("con_code", ""),
                    name=row.get("con_name", ""),
                )
            )
        logger.debug(f"获取板块成分完成 | ts_code: {ts_code} | 数量: {len(dtos)}")
        return dtos

    def get_ths_hot(
            self, trade_date: str = None, market: str = None, task_id: str = None
    ) -> List[ThsHotDTO]:
        """
        获取同花顺热榜

        Args:
            trade_date: 交易日期 YYYYMMDD，默认为最新交易日
            task_id: 任务id
            market: 市场

        Returns:
            热榜数据列表
        """
        if not trade_date:
            trade_date = datetime.now().strftime("%Y%m%d")

        logger.info(
            f"获取同花顺热榜: trade_date={trade_date}, market={market}"
        )

        kwargs = {"trade_date": trade_date}
        if market:
            kwargs["market"] = market
        # 使用固定的字段列表
        kwargs["fields"] = THS_HOT_FIELDS
        
        # 先尝试使用 is_new=Y 获取数据
        kwargs["is_new"] = "Y"
        df = self._call_pro('ths_hot', task_id=task_id, **kwargs)

        # 如果 is_new=Y 没有数据，尝试 is_new=N
        if df is None or df.empty:
            logger.info(f"is_new=Y 未获取到数据，尝试使用 is_new=N 获取")
            kwargs["is_new"] = "N"
            df = self._call_pro('ths_hot', task_id=task_id, **kwargs)

        if df is None or df.empty:
            logger.warning(f"未获取到 {trade_date} 的热榜数据 (is_new=Y 和 is_new=N 都无数据)")
            return []

        # DTO + mapper 输出（保留 ts_name、rank、hot、rank_time、concept、rank_reason）
        dtos: List[ThsHotDTO] = []
        for _, row in df.iterrows():
            dtos.append(
                ThsHotDTO(
                    trade_date=row.get("trade_date", ""),
                    ts_code=row.get("ts_code", ""),
                    ts_name=(row.get("ts_name") or row.get("name", "")),
                    rank=int(row.get("rank", 0) or 0),
                    hot=float(row.get("hot", 0) or 0),
                    rank_time=row.get("rank_time", ""),
                    concept=row.get("concept"),
                    rank_reason=row.get("rank_reason"),
                )
            )

        # 去重：相同 ts_code 取 rank_time 最新的（rank_time 字符串比较，越大表示越新）
        dedup_map: Dict[str, ThsHotDTO] = {}
        for dto in dtos:
            code = dto.ts_code
            if not code:
                continue
            prev = dedup_map.get(code)
            if prev is None:
                dedup_map[code] = dto
            else:
                # 比较 rank_time，取更大的（更新的），如果为空字符串则视为最小
                dto_rank_time = dto.rank_time or ""
                prev_rank_time = prev.rank_time or ""
                if dto_rank_time > prev_rank_time:
                    dedup_map[code] = dto

        dedup_list = list(dedup_map.values())
        dedup_list.sort(key=lambda x: (-x.hot, x.rank))
        for idx, dto in enumerate(dedup_list, start=1):
            dto.rank = idx

        logger.info(f"成功获取 {len(dedup_list)} 条热榜数据（去重后）")
        return dedup_list

    def get_industry_list(self, task_id: str = None) -> List[IndustryDTO]:
        """
        获取行业板块列表（直接从 ths_index type='I' 构造 DTO）。

        Returns:
            行业板块列表
        """
        # 根据文档，行业指数使用 type='I'
        indices = self.get_ths_index(index_type='I', task_id=task_id)

        # 筛选行业类指数（DTO无必要，直接映射字段名）
        industry_boards: List[IndustryDTO] = []
        for idx in indices:
            industry_boards.append(
                IndustryDTO(
                    industry_code=idx.ts_code,
                    industry_name=idx.name,
                    list_date=idx.list_date,
                )
            )

        logger.info(f"从同花顺指数中筛选出 {len(industry_boards)} 个行业板块")
        return industry_boards

    def get_concept_list(self, task_id: str = None) -> List[ConceptDTO]:
        """获取概念板块列表（直接从 ths_index type='N' 构造 DTO）。"""
        indices = self.get_ths_index(index_type='N', task_id=task_id)
        if not indices:
            return []
        result: List[ConceptDTO] = []
        for idx in indices:
            result.append(
                ConceptDTO(
                    concept_code=idx.ts_code,
                    concept_name=idx.name,
                    list_date=idx.list_date,
                )
            )
        logger.info(f"标准化概念列表完成，共 {len(result)} 个概念")
        return result

    def get_convertible_bond_call_info(
            self, ts_code: str = None, task_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        获取可转债赎回信息

        Args:
            ts_code: 转债代码，如果为None则获取所有
            task_id: 任务ID，用于取消检查

        Returns:
            List[Dict]: 赎回信息列表
        """
        logger.info(f"获取可转债赎回信息 - ts_code: {ts_code}")

        # 调用Tushare接口
        params = {
            "fields": CB_CALL_FIELDS,
            "task_id": task_id
        }
        if ts_code:
            params["ts_code"] = ts_code

        df = self._call_pro('cb_call', **params)

        if df is None or df.empty:
            logger.warning(f"未获取到可转债赎回信息 - ts_code: {ts_code}")
            return []

        logger.info(f"获取到 {len(df)} 条可转债赎回信息")

        # 辅助函数
        from app.utils.number_utils import safe_float as _safe_float

        def _parse_date(date_str):
            """解析日期字符串为date对象（使用通用日期工具）"""
            if pd.isna(date_str) or date_str is None:
                return None
            try:
                from app.utils import date_utils
                dt = date_utils.parse_date(str(date_str))
                return dt.date() if dt else None
            except Exception:
                return None

        # 构造 DTO + mapper 输出
        dtos: List[CbCallDTO] = []
        for _, row in df.iterrows():
            dtos.append(
                CbCallDTO(
                    ts_code=row.get("ts_code"),
                    call_type=row.get("call_type"),
                    is_call=row.get("is_call"),
                    ann_date=str(_parse_date(row.get("ann_date"))) if _parse_date(row.get("ann_date")) else None,
                    call_date=str(_parse_date(row.get("call_date"))) if _parse_date(row.get("call_date")) else None,
                    call_price=_safe_float(row.get("call_price")),
                    call_price_tax=_safe_float(row.get("call_price_tax")),
                    call_vol=_safe_float(row.get("call_vol")),
                    call_amount=_safe_float(row.get("call_amount")),
                    payment_date=str(_parse_date(row.get("payment_date"))) if _parse_date(
                        row.get("payment_date")) else None,
                    call_reg_date=str(_parse_date(row.get("call_reg_date"))) if _parse_date(
                        row.get("call_reg_date")) else None,
                )
            )
        from .tushare.mappers import cb_call_to_dicts
        return cb_call_to_dicts(dtos)


# 全局Tushare服务 - 惰性初始化代理
class _LazyTushareServiceProxy:
    def __init__(self):
        self._instance = None
        self._init_error = None
        self._retry_count = 0
        self._max_retries = 3
        self._lock = threading.Lock()  # 添加线程锁
        self._initializing = False  # 标记是否正在初始化

    def _ensure_initialized(self):
        # 使用双重检查锁定模式确保线程安全
        if self._instance is not None:
            return

        with self._lock:
            # 再次检查，防止在获取锁的过程中其他线程已经完成初始化
            if self._instance is not None:
                return

            # 检查是否正在初始化，防止重复初始化
            if self._initializing:
                # 等待初始化完成
                while self._initializing and self._instance is None:
                    import time
                    time.sleep(0.01)  # 短暂等待
                return

            # 检查是否有初始化错误且重试次数已用完
            if self._init_error is not None and self._retry_count >= self._max_retries:
                return

            try:
                self._initializing = True

                self._instance = TushareService()
                self._retry_count = 0  # 重置重试计数

            except Exception as e:
                self._retry_count += 1
                self._init_error = e
                logger.warning(f"Tushare服务初始化失败 (第{self._retry_count}次): {e}")

                # 如果重试次数用完，记录最终错误
                if self._retry_count >= self._max_retries:
                    logger.error(f"Tushare服务初始化最终失败，已重试{self._retry_count}次: {e}")
            finally:
                self._initializing = False

    def __getattr__(self, name):
        self._ensure_initialized()
        if self._instance is None:
            if self._retry_count < self._max_retries:
                # 如果还有重试机会，再次尝试初始化
                self._init_error = None
                self._ensure_initialized()
                if self._instance is None:
                    raise RuntimeError(f"Tushare服务初始化失败，已重试{self._max_retries}次: {self._init_error}")
            else:
                raise RuntimeError(f"Tushare服务初始化失败，已重试{self._max_retries}次: {self._init_error}")
        return getattr(self._instance, name)

    def is_ready(self) -> bool:
        self._ensure_initialized()
        return self._instance is not None


tushare_service = _LazyTushareServiceProxy()
