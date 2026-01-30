"""
股票K线服务 - 专门处理股票K线数据
"""

from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timedelta

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.constants.table_types import TableTypes
from app.core.exceptions import CancellationException
from app.services.scheduler.progress_utils import update_progress_with_consistent_logic
from app.utils.concurrent_utils import process_concurrently
from .base_kline_service import BaseKlineService
from ..core.cache_service import cache_service, service_cached
from ..external.tushare_service import tushare_service
from ...core.exceptions import ValidationException, DatabaseException
from ...models.schemas.kline_schemas import StockKlineItem


class StockKlineService(BaseKlineService):
    """股票K线数据服务类"""

    def __init__(self):
        super().__init__(EntityTypes.STOCK)
        self.data_service = tushare_service
        logger.info("股票K线服务初始化完成")

    @service_cached(
        "klines:stock",
        key_fn=lambda self, ts_code, period="daily", use_cache=True: f"{period}:{ts_code}" if use_cache else "",
        ttl_seconds=86400,
    )
    def _get_stock_kline_data_full(
            self,
            ts_code: str,
            period: str = "daily",
            use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        获取股票K线数据（全量，带缓存，返回原始字典列表）。

        Args:
            ts_code: 股票代码
            period: 周期类型 (daily/weekly/monthly)

        Returns:
            K线数据字典列表（包含所有字段，包括指标字段）
        """
        try:
            logger.debug(f"获取股票K线数据 - ts_code: {ts_code}, period: {period}")

            from ...dao.kline_query_utils import KlineQueryUtils

            # 全量取数（装饰器已处理缓存与旁路）
            data = KlineQueryUtils.get_kline_data(
                ts_code=ts_code,
                period=period,
                table_type=TableTypes.STOCK,
            )
            return data

        except Exception as e:
            logger.error(f"获取股票K线数据失败: {str(e)}")
            raise DatabaseException(f"获取股票K线数据失败: {str(e)}")

    def get_stock_kline_data(
            self,
            ts_code: str,
            period: str = "daily",
            limit: int = 500,
            end_date: Optional[str] = None,
    ) -> List[StockKlineItem]:
        """
        获取股票K线数据（按 limit 切片，转换为Pydantic模型，过滤指标字段）。

        Args:
            ts_code: 股票代码
            period: 周期类型 (daily/weekly/monthly)
            limit: 限制数量
            end_date: 结束日期 (YYYYMMDD格式)，K线数据截止到该日期

        Returns:
            K线数据列表（Pydantic模型，不包含指标字段）
        """
        # 根据系统配置的最大显示年份，校验limit
        from ...dao.query_config import QueryConfig
        effective_limit = QueryConfig.get_effective_limit(limit)
        
        # 获取完整数据（包含指标字段，使用缓存）
        data = self._get_stock_kline_data_full(ts_code=ts_code, period=period)
        
        # 如果指定了结束日期，过滤数据
        # 前端负责将周线/月线的日期转换为对应周期的结束日期
        # 注：trade_date 已在 _process_kline_row 中转为 YYYYMMDD 格式
        if end_date and data:
            data = [item for item in data if item.get('trade_date', '') <= end_date]
        
        # 限制数量（使用校验后的effective_limit）
        if effective_limit and len(data) > effective_limit:
            data = data[-effective_limit:]
        
        # 转换为Pydantic模型（自动过滤未定义的字段，即指标字段）
        from ...dao.kline_query_utils import KlineQueryUtils
        from ...constants.table_types import TableTypes
        
        return KlineQueryUtils.convert_kline_data_to_models(data, TableTypes.STOCK)

    # ============== 指标数据（直接使用K线数据缓存，避免重复缓存） ==============
    def _get_stock_indicators_full(self, ts_code: str, period: str = "daily") -> List[Dict[str, Any]]:
        """
        获取股票指标数据（直接使用K线数据缓存，因为K线数据已包含所有指标字段）
        
        Args:
            ts_code: 股票代码
            period: 周期类型
            
        Returns:
            指标数据列表（实际就是K线数据，包含所有指标字段）
        """
        try:
            # 直接使用K线数据缓存，K线数据已包含所有指标字段
            data = self._get_stock_kline_data_full(ts_code=ts_code, period=period)
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.error(f"获取股票指标数据失败: ts_code={ts_code}, period={period}, error={e}")
            return []

    def get_stock_indicators_cached(self, ts_code: str, period: str = "daily", limit: int = 100, end_date: Optional[str] = None) -> List[
        Dict[str, Any]]:
        data = self._get_stock_indicators_full(ts_code=ts_code, period=period)
        if not isinstance(data, list):
            return []
        # 按end_date过滤
        if end_date:
            data = [d for d in data if d.get('trade_date', '') <= end_date]
        # 按limit截断
        if limit and len(data) > int(limit):
            return data[-int(limit):]
        return data

    def batch_get_stock_indicators_cached(self, ts_codes: List[str], period: str = "daily", limit: int = 100, end_date: Optional[str] = None) -> Dict[
        str, List[Dict[str, Any]]]:
        """批量获取股票指标数据（基于原有缓存方案优化）"""
        if not ts_codes:
            return {}

        from app.utils.concurrent_utils import process_concurrently, ConcurrentConfig

        def fetch_single(code: str):
            try:
                data = self.get_stock_indicators_cached(ts_code=code, period=period, limit=limit, end_date=end_date)
                return (code, data or [])
            except Exception as e:
                logger.debug(f"获取股票指标数据失败: {code}, {e}")
                return (code, [])

        max_workers = ConcurrentConfig.get_optimal_workers()
        results = process_concurrently(ts_codes, fetch_single, max_workers=max_workers)

        # 转换为字典格式
        result = {code: data for code, data in results if data}

        return result

    def sync_stock_kline_data(
            self,
            ts_codes: List[str],
            periods=None,
            force_sync: bool = False,
            concurrent_workers: int = 0,
            task_id: str = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        同步股票K线数据

        Args:
            ts_codes: 股票代码列表
            periods: 周期类型列表
            force_sync: 是否强制同步
            concurrent_workers: 并发工作线程数
            task_id: 任务ID，用于取消检查

        Returns:
            { "inserted_count": 新增条数, "updated_count": 更新条数 }
        """
        return self.sync_kline_data_universal(
            ts_codes=ts_codes,
            periods=periods,
            force_sync=force_sync,
            concurrent_workers=concurrent_workers,
            task_id=task_id,
            start_date=start_date,
            end_date=end_date,
        )

    def _fetch_kline_from_tushare(
            self, ts_code: str, start_date: str, end_date: str, task_id: str = None
    ) -> List[Dict[str, Any]]:
        """从Tushare获取股票K线数据（含每日指标）"""
        import time
        start_time = time.time()
        
        try:
            # 使用股票接口获取K线数据
            logger.debug(f"开始获取 {ts_code} 的K线数据，日期范围: {start_date}-{end_date}")
            
            api_start_time = time.time()
            daily_dtos = self.data_service.get_daily_data(
                ts_code=ts_code, start_date=start_date, end_date=end_date, task_id=task_id
            )
            api_duration = time.time() - api_start_time

            # 转换 DTO 为可变字典列表
            from ..external.tushare import mappers as strict_mappers
            kline_data = strict_mappers.stock_kline_to_upsert_dicts(daily_dtos) if daily_dtos else []

            if not kline_data:
                total_duration = time.time() - start_time
                logger.warning(f"未获取到K线数据 | ts_code: {ts_code} | API耗时: {api_duration:.3f}s | 总耗时: {total_duration:.3f}s")
                return []

            # 获取每日指标数据并合并到K线数据中
            try:
                daily_basic_dtos = self.data_service.get_daily_basic(
                    ts_code=ts_code, start_date=start_date, end_date=end_date, task_id=task_id
                )
                if daily_basic_dtos:
                    # 构建日期到指标数据的映射
                    basic_map = {dto.trade_date: dto for dto in daily_basic_dtos}
                    # 合并指标数据到K线数据
                    for kline in kline_data:
                        trade_date = kline.get('trade_date')
                        if trade_date:
                            # 转换日期格式（如果需要）
                            date_key = trade_date.replace('-', '') if '-' in str(trade_date) else str(trade_date)
                            basic = basic_map.get(date_key)
                            if basic:
                                kline['turnover_rate_f'] = basic.turnover_rate_f
                                kline['volume_ratio'] = basic.volume_ratio
                                kline['pe'] = basic.pe
                                kline['pe_ttm'] = basic.pe_ttm
                                kline['pb'] = basic.pb
                                kline['ps'] = basic.ps
                                kline['ps_ttm'] = basic.ps_ttm
                                kline['dv_ratio'] = basic.dv_ratio
                                kline['dv_ttm'] = basic.dv_ttm
                                kline['total_share'] = basic.total_share
                                kline['float_share'] = basic.float_share
                                kline['free_share'] = basic.free_share
                                kline['total_mv'] = basic.total_mv
                                kline['circ_mv'] = basic.circ_mv
                    logger.debug(f"合并每日指标 | ts_code: {ts_code} | 指标记录: {len(daily_basic_dtos)}")
            except Exception as e:
                logger.warning(f"获取每日指标失败 | ts_code: {ts_code} | 错误: {e}")

            total_duration = time.time() - start_time
            logger.debug(
                f"获取股票K线 | ts_code: {ts_code} | "
                f"记录: {len(kline_data)} | "
                f"耗时: {total_duration:.2f}s"
            )
            return kline_data

        except CancellationException:
            # 重新抛出取消异常，让上层处理
            raise
        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"❌ 获取股票K线失败 | ts_code: {ts_code} | 耗时: {total_duration:.3f}s | 错误: {e}")
            logger.error(f"错误详情: ts_code={ts_code}, start_date={start_date}, end_date={end_date}")
            return []

    def _bulk_store_data(
            self,
            data: List[Dict[str, Any]],
            batch_size: int = 500
    ) -> Dict[str, int]:
        """批量存储股票K线数据"""
        import time
        start_time = time.time()
        
        try:
            logger.debug(f"开始批量存储股票K线 | 数量: {len(data)} | batch_size: {batch_size}")
            from ...dao.stock_kline_dao import stock_kline_dao

            result = stock_kline_dao.bulk_upsert_stock_kline_data(
                data=data,
                batch_size=batch_size
            )

            total_duration = time.time() - start_time
            total_changed = result.get("inserted_count", 0) + result.get("updated_count", 0)

            # 优化日志：保留关键统计信息
            if total_changed > 0:
                logger.info(
                    f"股票K线数据更新 | "
                    f"插入: {result.get('inserted_count', 0)} | "
                    f"更新: {result.get('updated_count', 0)} | "
                    f"总计: {total_changed} | "
                    f"耗时: {total_duration:.2f}秒"
                )
            else:
                logger.debug(
                    f"股票K线数据已是最新 | "
                    f"数据量: {len(data)}条 | "
                    f"耗时: {total_duration:.2f}秒"
                )

            return result

        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"❌ 股票K线存储失败 | 耗时: {total_duration:.3f}s | 错误: {e}")
            return {"inserted_count": 0, "updated_count": 0}

    def _invalidate_cache(self, period: str, codes: List[str]):
        """失效股票缓存"""
        cache_service.invalidate_stock_klines_for_codes(period, codes)

    def _get_kline_data_full_method(self, period: str):
        """获取带缓存的K线数据方法（用于预热）"""
        return lambda code: self._get_stock_kline_data_full(code, period)

    def sync_auction_data(
            self,
            force_sync: bool = False,
            task_id: str = None,
            ts_codes: Optional[List[str]] = None,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        同步开盘竞价数据（支持全量和增量同步）
        
        核心职责：
        - 计算日期范围
        - 获取开盘竞价数据
        - 处理并存储数据
        - 返回同步结果和所有股票代码
        
        副作用（如缓存失效）由调用方负责。
        
        Args:
            force_sync: 是否强制同步（全量），如果为False则增量同步
            task_id: 任务ID，用于取消检查
            ts_codes: 股票代码列表（可选），如果为None则同步所有股票
            start_date: 显式开始日期（YYYYMMDD），优先使用此日期而不是智能计算
            end_date: 显式结束日期（YYYYMMDD），优先使用此日期而不是智能计算
            
        Returns:
            {
                "inserted_count": 新增条数,
                "updated_count": 更新条数,
                "total": 总条数,
                "ts_codes": 所有股票代码列表（用于缓存失效）
            }
        """
        import time
        from ...services.data.stock_service import stock_service
        from ..core.smart_date_range_calculator import SmartDateRangeCalculator
        
        start_time = time.time()
        
        try:
            # 获取股票代码列表
            if ts_codes is None:
                # 如果没有指定codes，则获取所有股票代码
                ts_codes = stock_service.get_all_ts_codes_cached()
                if not ts_codes:
                    logger.warning("未获取到股票代码列表")
                    return {"inserted_count": 0, "updated_count": 0, "total": 0, "ts_codes": []}
                logger.info(f"获取到 {len(ts_codes)} 只股票（全部）")
            else:
                # 如果指定了codes，使用指定的codes
                if not ts_codes:
                    logger.warning("股票代码列表为空")
                    return {"inserted_count": 0, "updated_count": 0, "total": 0, "ts_codes": []}
                logger.info(f"同步指定 {len(ts_codes)} 只股票的竞价数据")
            
            # 始终调用智能计算器获取 latest_daily_dates（用于区分新/旧记录）
            # 显式日期模式 = 指定范围的全量同步，force_sync=True 确保所有代码都有日期范围
            period_ranges = SmartDateRangeCalculator.calculate_period_ranges_for_codes(
                ts_codes=ts_codes,
                periods=["daily"],
                entity_type=EntityTypes.STOCK,
                force_sync=True,  # 始终使用全量模式计算，确保所有代码都有范围
            )

            # 计算每个代码对应的最新日线日期（用于区分新旧记录）
            latest_daily_dates: Dict[str, str] = {
                code: ranges.get("_latest_daily")
                for code, ranges in period_ranges.items()
                if ranges.get("_latest_daily")
            }

            # 根据是否有显式日期决定 date_ranges 的来源
            if start_date and end_date:
                # 显式日期模式：使用指定的日期范围
                logger.info(f"使用显式日期范围同步竞价数据: {start_date} 到 {end_date}")
                date_ranges = {code: (start_date, end_date) for code in ts_codes}
            else:
                # 智能计算模式：从 period_ranges 提取 daily 范围
                date_ranges = {
                    code: ranges["daily"]
                    for code, ranges in period_ranges.items()
                    if ranges.get("daily")
                }

            # 检查是否所有数据都是最新的
            if not date_ranges:
                logger.info(
                    f"🎯 所有开盘竞价数据都是最新的，无需同步 | "
                    f"总代码数: {len(ts_codes)}"
                )
                return {"inserted_count": 0, "updated_count": 0, "total": 0, "ts_codes": ts_codes}

            # 计算统一的日期范围（全局 start/end）
            if start_date and end_date:
                # 显式日期模式：直接使用提供的日期范围
                global_start_date = start_date
                global_end_date = end_date
            elif force_sync:
                # 全量模式：仍然使用各代码 daily 范围的最小/最大值
                all_ranges = list(date_ranges.values())
                global_start_date = min(r[0] for r in all_ranges)
                global_end_date = max(r[1] for r in all_ranges)
            else:
                # 增量模式：竞价只拉当天这一根，不补历史缺口
                today_str = datetime.now().strftime("%Y%m%d")
                global_start_date = today_str
                global_end_date = today_str

            codes_to_sync_count = len(date_ranges)
            codes_up_to_date = len(ts_codes) - codes_to_sync_count
            sync_mode = "全量" if force_sync else "增量"
            logger.info(
                f"🚀 开始{sync_mode}同步开盘竞价数据 | "
                f"总代码数: {len(ts_codes)}, "
                f"需要同步: {codes_to_sync_count}, "
                f"已是最新: {codes_up_to_date}, "
                f"日期范围: {global_start_date} 到 {global_end_date}"
            )

            # 按模式选择取数方式：
            # - 增量：按交易日循环，使用 trade_date 参数批量获取所有股票的竞价数据
            # - 全量：在 worker 中按股票代码 + 日期区间调用 Tushare
            trade_dates: List[str] = []

            if not force_sync:
                # 按交易日从 Tushare 获取竞价数据（每个交易日一次调用），由 worker 负责实际拉取与处理
                start_dt_obj = datetime.strptime(global_start_date, "%Y%m%d").date()
                end_dt_obj = datetime.strptime(global_end_date, "%Y%m%d").date()
                total_days = (end_dt_obj - start_dt_obj).days + 1

                logger.info(
                    f"按交易日从 Tushare 获取竞价数据 | "
                    f"日期范围: {global_start_date} 到 {global_end_date}，预计天数: {total_days}"
                )

                cur_date = start_dt_obj
                while cur_date <= end_dt_obj:
                    trade_dates.append(cur_date.strftime("%Y%m%d"))
                    cur_date = cur_date + timedelta(days=1)
            else:
                logger.info(
                    "按 code 从 Tushare 获取竞价数据"
                )

            # 与 K 线同步保持一致：每个 worker 负责单个单位的本地处理 + 入库
            total_codes = len(date_ranges)

            logger.info(
                f"按股票代码处理（并发） | "
                f"股票数量: {total_codes}, "
                f"日期范围: {global_start_date} 到 {global_end_date}"
            )

            # 适度并发，避免对 Tushare 和数据库压力过大
            max_workers = 6

            from .auction_data_processor import auction_data_processor

            def worker_incremental(trade_date: str) -> Dict[str, Any]:
                """增量模式：按交易日从 Tushare 获取竞价数据后进行本地处理 + 入库"""
                # 检查任务是否取消
                if task_id:
                    from app.services.core.redis_task_manager import redis_task_manager
                    task_info = redis_task_manager.get_task_progress(task_id)
                    if task_info and task_info.get("status") == "cancelling":
                        raise CancellationException("任务已取消")

                worker_start = time.time()
                # 按交易日从 Tushare 获取当日所有股票的竞价数据
                fetch_start = time.time()
                day_dtos = self.data_service.get_auction_data(
                    trade_date=trade_date,
                    task_id=task_id,
                )
                fetch_duration = time.time() - fetch_start

                # 根据每只股票的日期范围进行过滤
                # 只处理在 date_ranges 中指定的股票，避免同步用户未请求的股票
                filtered_dtos: List[Any] = []
                codes_for_day: Set[str] = set()

                for dto in day_dtos:
                    code = dto.ts_code
                    if not code:
                        continue
                    # 只处理在 date_ranges 中存在的股票
                    if code not in date_ranges:
                        continue
                    filtered_dtos.append(dto)
                    codes_for_day.add(code)

                if not day_dtos:
                    logger.debug(
                        f"⚠️ 未获取到 {trade_date} 的竞价数据，"
                        f"API耗时: {fetch_duration:.3f}秒"
                    )

                if not filtered_dtos:
                    logger.debug(
                        f"⚠️ {trade_date} 的竞价数据中没有需要在日期范围内同步的记录"
                    )

                # 本地处理并入库
                process_start = time.time()
                result = auction_data_processor.process_auction_data(
                    auction_dtos=filtered_dtos,
                    bulk_store_func=lambda data, batch: self._bulk_store_data(data, batch),
                    batch_size=500,
                    latest_daily_dates=latest_daily_dates,
                )
                process_duration = time.time() - process_start

                inserted = int(result.get("inserted_count", 0) or 0)
                updated = int(result.get("updated_count", 0) or 0)
                total_duration = time.time() - worker_start

                logger.debug(
                    f"{trade_date} 竞价数据同步完成 | "
                    f"涉及股票数: {len(codes_for_day)} | "
                    f"过滤后条数: {len(filtered_dtos)} | "
                    f"插入: {inserted}, 更新: {updated} | "
                    f"总耗时: {total_duration:.2f}秒 | "
                    f"Tushare: {fetch_duration:.2f}秒 | "
                    f"本地处理+入库: {process_duration:.2f}秒"
                )

                return {
                    "trade_date": trade_date,
                    "codes": list(codes_for_day),
                    "count": len(filtered_dtos),
                    "inserted": inserted,
                    "updated": updated,
                    "error": False,
                }

            def worker_full(code: str) -> Dict[str, Any]:
                """全量模式：按股票代码 + 日期区间从 Tushare 获取 DTO 后进行本地处理 + 入库"""
                # 检查任务是否取消
                if task_id:
                    from app.services.core.redis_task_manager import redis_task_manager
                    task_info = redis_task_manager.get_task_progress(task_id)
                    if task_info and task_info.get("status") == "cancelling":
                        raise CancellationException("任务已取消")

                worker_start = time.time()

                code_range = date_ranges.get(code)
                if not code_range:
                    logger.warning(f"全量同步时未找到日期范围 | ts_code: {code}")
                    return {
                        "code": code,
                        "count": 0,
                        "inserted": 0,
                        "updated": 0,
                        "error": False,
                    }

                start_i, end_i = code_range
                fetch_start = time.time()
                code_dtos = self.data_service.get_auction_data(
                    ts_code=code,
                    start_date=start_i,
                    end_date=end_i,
                    task_id=task_id,
                )
                fetch_duration = time.time() - fetch_start

                if not code_dtos:
                    logger.warning(
                        f"⚠️ 全量同步 {code} 的竞价数据为空（范围: {start_i}..{end_i}），"
                        f"API耗时: {fetch_duration:.3f}秒"
                    )
                    return {
                        "code": code,
                        "count": 0,
                        "inserted": 0,
                        "updated": 0,
                        "error": False,
                    }

                # 本地处理并入库
                process_start = time.time()
                result = auction_data_processor.process_auction_data(
                    auction_dtos=code_dtos,
                    bulk_store_func=lambda data, batch: self._bulk_store_data(data, batch),
                    batch_size=500,
                    latest_daily_dates=latest_daily_dates,
                )
                process_duration = time.time() - process_start

                inserted = int(result.get("inserted_count", 0) or 0)
                updated = int(result.get("updated_count", 0) or 0)
                total_duration = time.time() - worker_start

                logger.debug(
                    f"{code} 竞价数据同步完成 | "
                    f"日期范围: {start_i}..{end_i} | "
                    f"拉取条数: {len(code_dtos)} | "
                    f"插入: {inserted}, 更新: {updated} | "
                    f"总耗时: {total_duration:.2f}秒 | "
                    f"本地处理+入库: {process_duration:.2f}秒"
                )

                return {
                    "code": code,
                    "count": len(code_dtos),
                    "inserted": inserted,
                    "updated": updated,
                    "error": False,
                }

            total_records = 0
            total_inserted = 0
            total_updated = 0

            def progress_callback(result: Dict[str, Any], completed: int, total: int) -> None:
                """进度回调：计算 ETA、输出日志并更新任务进度"""
                nonlocal total_records, total_inserted, total_updated

                if result:
                    count = int(result.get("count", 0) or 0)
                    inserted = int(result.get("inserted", 0) or 0)
                    updated = int(result.get("updated", 0) or 0)
                else:
                    count = inserted = updated = 0

                total_records += count
                total_inserted += inserted
                total_updated += updated

                elapsed = time.time() - start_time
                avg_time = elapsed / completed if completed > 0 else 0.0
                remaining = (total - completed) * avg_time

                logger.info(
                    f"进度: {completed}/{total} ({completed/total*100:.1f}%) | "
                    f"已耗时: {elapsed:.1f}秒 | "
                    f"预计剩余: {remaining:.1f}秒 | "
                    f"累计Tushare记录: {total_records} 条 | "
                    f"累计入库: 插入 {total_inserted} 条, 更新 {total_updated} 条"
                )

                # 使用与K线同步相同的统一进度更新逻辑
                if task_id:
                    try:
                        task_name = "开盘竞价数据"
                        unit_desc = "只股票" if force_sync else "个交易日"
                        current_item_name = f"正在同步第 {completed}/{total} {unit_desc}"
                        update_progress_with_consistent_logic(
                            task_id=task_id,
                            processed=completed,
                            total=total,
                            task_name=task_name,
                            current_item_name=current_item_name,
                        )
                    except Exception as e:
                        logger.warning(f"更新竞价数据同步任务进度失败: {e}")

            def error_handler(item: str, e: Exception) -> Dict[str, Any]:
                if force_sync:
                    logger.warning(f"查询或处理股票 {item} 的竞价数据失败: {e}，跳过")
                    return {
                        "code": item,
                        "count": 0,
                        "inserted": 0,
                        "updated": 0,
                        "error": True,
                    }
                else:
                    logger.warning(f"查询或处理交易日 {item} 的竞价数据失败: {e}，跳过")
                    return {
                        "trade_date": item,
                        "codes": [],
                        "count": 0,
                        "inserted": 0,
                        "updated": 0,
                        "error": True,
                    }

            if force_sync:
                items = list(date_ranges.keys())
                worker_fn = worker_full
            else:
                items = trade_dates
                worker_fn = worker_incremental

            logger.info(
                f"开始并发同步开盘竞价数据 | "
                f"模式: {'全量(按代码)' if force_sync else '增量(按交易日)'} | "
                f"任务数: {len(items)} | "
                f"并发数: {max_workers}"
            )

            results = process_concurrently(
                items,
                worker_fn,
                max_workers=max_workers,
                error_handler=error_handler,
                progress_callback=progress_callback,
            )

            # 聚合结果（与 K 线同步风格一致）
            final_inserted = 0
            final_updated = 0
            error_count = 0
            synced_codes: List[str] = []

            for r in results:
                if not r:
                    continue
                inserted = int(r.get("inserted", 0) or 0)
                updated = int(r.get("updated", 0) or 0)
                is_error = bool(r.get("error", False))

                final_inserted += inserted
                final_updated += updated
                if is_error:
                    error_count += 1

                if force_sync:
                    code = r.get("code")
                    if code and (inserted > 0 or updated > 0):
                        synced_codes.append(code)
                else:
                    # 增量模式：worker 按交易日返回涉及的股票代码列表
                    r_codes = r.get("codes") or []
                    if inserted > 0 or updated > 0:
                        for c in r_codes:
                            if c and c not in synced_codes:
                                synced_codes.append(c)

            total_duration = time.time() - start_time

            logger.info(
                f"🏁 并发同步开盘竞价数据完成 | "
                f"总耗时: {total_duration:.2f}秒 | "
                f"成功: {len(synced_codes)} 只股票 | "
                f"失败: {error_count} 只股票 | "
                f"插入: {final_inserted} | "
                f"更新: {final_updated}"
            )

            if not synced_codes:
                logger.warning("没有有效的开盘竞价数据需要更新")
                return {"inserted_count": 0, "updated_count": 0, "total": 0, "ts_codes": []}

            return {
                "inserted_count": final_inserted,
                "updated_count": final_updated,
                "total": final_inserted + final_updated,
                "ts_codes": synced_codes,  # 返回实际同步的股票代码，供调用方处理缓存失效
            }
            
        except CancellationException:
            total_duration = time.time() - start_time
            logger.info(f"开盘竞价同步已取消 | 耗时: {total_duration:.2f}s")
            return {"inserted_count": 0, "updated_count": 0, "cancelled": True}
        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"❌ 开盘竞价同步失败 | 耗时: {total_duration:.2f}s | 错误: {e}")
            raise DatabaseException(f"同步开盘竞价数据失败: {e}")

    # 路由薄化：统一任务创建入口（仅做业务层校验与调度触发聚合）
    def create_kline_sync_tasks(
            self,
            selection: Dict[str, Any],
            periods: List[str],
            options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            valid_periods = ("daily", "weekly", "monthly")
            if not periods or any(p not in valid_periods for p in periods):
                raise ValidationException(f"不支持的周期: {periods}，仅支持 {valid_periods}")

            selection = selection or {}
            all_selected = bool(selection.get("all_selected", False))
            codes = selection.get("codes") or []
            if not all_selected and not codes:
                raise ValidationException("请选择要同步的股票或使用全选")

            options = options or {}
            sync_kline = bool(options.get("sync_kline", True))  # 默认同步K线
            sync_auction = bool(options.get("sync_auction", False))
            force_sync = bool(options.get("force_sync", False))
            # 可选的显式日期范围（通常来自前端日历筛选）
            start_date = options.get("start_date")
            end_date = options.get("end_date")

            from app.services import SchedulerService, scheduler_service

            # 构建任务选项
            task_options: Dict[str, Any] = {
                "force_sync": force_sync,
                "sync_kline": sync_kline,
            }
            if start_date and end_date:
                task_options["start_date"] = start_date
                task_options["end_date"] = end_date

            # 如果勾选了竞价数据，将 sync_auction 相关选项传递给任务
            if sync_auction and "daily" in periods:
                task_options["sync_auction"] = True
                task_options["ts_codes"] = codes if not all_selected else None
                task_options["all_selected"] = all_selected
            
            # 创建单个任务，内部处理所有周期
            req = SchedulerService.UnifiedKlineSyncRequest(
                subject_type=EntityTypes.STOCK,
                selection={"codes": codes, "all_selected": all_selected},
                periods=periods,  # 传递完整periods列表
                options=task_options,
            )
            result = scheduler_service.execute_kline_sync_unified(req)
            
            if not result.get("task_execution_id"):
                raise DatabaseException("未能创建同步任务")

            # 如果任务未创建（例如：同类型任务 running/cancelling），透传结果
            if result.get("success") is False:
                return {
                    "success": False,
                    "message": result.get("message", "任务正在运行中"),
                    "task_execution_id": result["task_execution_id"],
                }

            period_names = {"daily": "日线", "weekly": "周线", "monthly": "月线"}
            period_display = "、".join([period_names.get(p, p) for p in periods])
            auction_display = "（包含竞价数据）" if sync_auction and "daily" in periods else ""

            return {
                "success": True,
                "message": f"股票{period_display}同步任务已创建{auction_display}",
                "task_execution_id": result["task_execution_id"],
            }
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"创建股票同步任务失败: {e}")
            raise DatabaseException(str(e))


# 创建全局服务实例
stock_kline_service = StockKlineService()
