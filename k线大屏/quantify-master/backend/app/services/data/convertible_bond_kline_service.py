"""
可转债K线服务 - 专门处理可转债K线数据
"""

from typing import List, Dict, Any, Optional

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.constants.table_types import TableTypes
from app.core.exceptions import CancellationException
from .base_kline_service import BaseKlineService
from ..core.cache_service import service_cached
from ..external.tushare_service import tushare_service
from ...core.exceptions import ValidationException, DatabaseException
from ...models.schemas.kline_schemas import ConvertibleBondKlineItem


class ConvertibleBondKlineService(BaseKlineService):
    """可转债K线数据服务类"""

    def __init__(self):
        super().__init__(EntityTypes.BOND)
        self.data_service = tushare_service
        logger.info("可转债K线服务初始化完成")

    @service_cached(
        "klines:bond",
        key_fn=lambda self, ts_code, period="daily", use_cache=True: f"{period}:{ts_code}" if use_cache else "",
        ttl_seconds=86400,
    )
    def _get_convertible_bond_kline_data_full(
            self,
            ts_code: str,
            period: str = "daily",
            use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        获取可转债K线数据（全量，带缓存，返回原始字典列表）

        Args:
            ts_code: 可转债代码
            period: 周期类型 (daily/weekly/monthly)

        Returns:
            K线数据字典列表（包含所有字段，包括指标字段）
        """
        try:
            logger.debug(f"获取可转债K线数据 - ts_code: {ts_code}, period: {period}")

            # 直接从分表获取数据（DAO 已统一按日期升序排序）
            from ...dao.kline_query_utils import KlineQueryUtils

            data = KlineQueryUtils.get_kline_data(
                ts_code=ts_code,
                period=period,
                table_type=TableTypes.CONVERTIBLE_BOND,
            )
            return data

        except Exception as e:
            logger.error(f"获取可转债K线数据失败: {str(e)}")
            raise DatabaseException(f"获取可转债K线数据失败: {str(e)}")

    # ============== 指标数据（直接使用K线数据缓存，避免重复缓存） ==============
    def _get_bond_indicators_full(self, ts_code: str, period: str = "daily") -> List[Dict[str, Any]]:
        """
        获取可转债指标数据（直接使用K线数据缓存，因为K线数据已包含所有指标字段）
        
        Args:
            ts_code: 可转债代码
            period: 周期类型
            
        Returns:
            指标数据列表（实际就是K线数据，包含所有指标字段）
        """
        try:
            # 直接使用K线数据缓存，K线数据已包含所有指标字段
            data = self._get_convertible_bond_kline_data_full(ts_code=ts_code, period=period)
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.error(f"获取可转债指标数据失败: ts_code={ts_code}, period={period}, error={e}")
            return []

    def get_bond_indicators_cached(self, ts_code: str, period: str = "daily", limit: int = 100, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        data = self._get_bond_indicators_full(ts_code=ts_code, period=period)
        if not isinstance(data, list):
            return []
        # 按end_date过滤
        if end_date:
            data = [d for d in data if d.get('trade_date', '') <= end_date]
        # 按limit截断
        if limit and len(data) > int(limit):
            return data[-int(limit):]
        return data

    def batch_get_bond_indicators_cached(self, ts_codes: List[str], period: str = "daily", limit: int = 100, end_date: Optional[str] = None) -> Dict[
        str, List[Dict[str, Any]]]:
        """批量获取可转债指标数据（基于原有缓存方案优化）"""
        if not ts_codes:
            return {}

        from app.utils.concurrent_utils import process_concurrently, ConcurrentConfig

        def fetch_single(code: str):
            try:
                data = self.get_bond_indicators_cached(ts_code=code, period=period, limit=limit, end_date=end_date)
                return (code, data or [])
            except Exception as e:
                logger.debug(f"获取可转债指标数据失败: {code}, {e}")
                return (code, [])

        max_workers = ConcurrentConfig.get_optimal_workers()
        results = process_concurrently(ts_codes, fetch_single, max_workers=max_workers)

        # 转换为字典格式
        result = {code: data for code, data in results if data}

        return result

    def get_convertible_bond_kline_data(
            self,
            ts_code: str,
            period: str = "daily",
            limit: int = 500,
            end_date: Optional[str] = None,
    ) -> List[ConvertibleBondKlineItem]:
        """
        获取可转债K线数据（按 limit 切片，转换为Pydantic模型，过滤指标字段）。

        Args:
            ts_code: 可转债代码
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
        data = self._get_convertible_bond_kline_data_full(ts_code=ts_code, period=period)
        
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
        
        return KlineQueryUtils.convert_kline_data_to_models(data, TableTypes.CONVERTIBLE_BOND)

    def sync_convertible_bond_kline_data(
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
        同步可转债K线数据

        Args:
            ts_codes: 可转债代码列表
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
        """从Tushare获取可转债K线数据"""
        import time
        start_time = time.time()
        
        try:
            # 使用可转债接口获取K线数据
            logger.debug(f"开始获取 {ts_code} 的K线数据，日期范围: {start_date}-{end_date}")
            
            api_start_time = time.time()
            daily_dtos = self.data_service.get_convertible_bond_prices(
                ts_code=ts_code, start_date=start_date, end_date=end_date, task_id=task_id
            )
            api_duration = time.time() - api_start_time

            # 转换 DTO 为可变字典列表
            from ..external.tushare import mappers as strict_mappers
            kline_data = strict_mappers.cb_daily_dto_to_dicts(daily_dtos) if daily_dtos else []

            # 计算流通市值
            kline_data = self._enrich_with_circ_mv(ts_code, kline_data)

            total_duration = time.time() - start_time

            if not kline_data:
                logger.warning(f"未获取到K线数据 | ts_code: {ts_code} | API耗时: {api_duration:.3f}s | 总耗时: {total_duration:.3f}s")
                return []

            logger.debug(
                f"获取可转债K线 | ts_code: {ts_code} | "
                f"记录: {len(kline_data)} | "
                f"耗时: {total_duration:.2f}s"
            )
            return kline_data

        except CancellationException:
            # 重新抛出取消异常，让上层处理
            raise
        except Exception as e:
            total_duration = time.time() - start_time
            logger.debug(f"获取可转债K线失败 | ts_code: {ts_code} | 耗时: {total_duration:.3f}s | 错误: {e}")
            logger.debug(f"错误详情: ts_code={ts_code}, start_date={start_date}, end_date={end_date}")
            return []

    def _bulk_store_data(
            self,
            data: List[Dict[str, Any]],
            batch_size: int = 500
    ) -> Dict[str, int]:
        """批量存储可转债K线数据"""
        import time
        start_time = time.time()
        
        try:
            from ...dao.convertible_bond_kline_dao import convertible_bond_kline_dao

            result = convertible_bond_kline_dao.bulk_upsert_bond_kline_data(
                data=data,
                batch_size=batch_size
            )
            total_duration = time.time() - start_time
            total_changed = result.get("inserted_count", 0) + result.get("updated_count", 0)

            # 优化日志：保留关键统计信息
            if total_changed > 0:
                logger.debug(
                    f"可转债K线存储 | "
                    f"插入: {result.get('inserted_count', 0)} | "
                    f"更新: {result.get('updated_count', 0)} | "
                    f"耗时: {total_duration:.2f}s"
                )
            else:
                logger.debug(
                    f"可转债K线数据已是最新 | "
                    f"数据量: {len(data)}条 | "
                    f"耗时: {total_duration:.2f}秒"
                )

            return result

        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"❌ 可转债K线存储失败 | 耗时: {total_duration:.2f}s | 错误: {e}")
            return {"inserted_count": 0, "updated_count": 0}

    def _enrich_with_circ_mv(self, ts_code: str, kline_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        为K线数据添加流通市值字段
        
        计算公式: circ_mv = remain_size * 100 * close (万元)
        - remain_size: 剩余规模(亿元)
        - close: 收盘价
        - circ_mv: 流通市值(万元)
        """
        if not kline_data:
            return kline_data
        
        try:
            from .convertible_bond_service import convertible_bond_service
            bond_list = convertible_bond_service.get_convertible_bonds_by_codes([ts_code])
            
            if not bond_list:
                logger.debug(f"可转债 {ts_code} 未找到基础信息，跳过流通市值计算")
                return kline_data
            
            remain_size = bond_list[0].get('remain_size')
            if not remain_size:
                logger.debug(f"可转债 {ts_code} 无剩余规模数据，跳过流通市值计算")
                return kline_data
            
            remain_size = float(remain_size)
            
            for item in kline_data:
                close = item.get('close')
                if close is not None:
                    item['circ_mv'] = round(remain_size * 100 * float(close), 2)
            
            logger.debug(f"可转债 {ts_code} 流通市值计算完成 | remain_size: {remain_size}亿")
            
        except Exception as e:
            logger.warning(f"计算可转债 {ts_code} 流通市值失败: {e}")
        
        return kline_data

    def _invalidate_cache(self, period: str, codes: List[str]):
        """失效可转债缓存"""
        from ..core.cache_service import cache_service
        cache_service.invalidate_bond_klines_for_codes(period, codes)

    def _get_kline_data_full_method(self, period: str):
        """获取带缓存的K线数据方法（用于预热）"""
        return lambda code: self._get_convertible_bond_kline_data_full(code, period)

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
                raise ValidationException("请选择要同步的可转债或使用全选")

            options = options or {}
            force_sync = bool(options.get("force_sync", False))
            sync_kline = bool(options.get("sync_kline", True))
            start_date = options.get("start_date")
            end_date = options.get("end_date")

            from app.services import SchedulerService, scheduler_service

            # 构建任务选项
            req_options: Dict[str, Any] = {
                "force_sync": force_sync,
                "sync_kline": sync_kline,
            }
            if start_date and end_date:
                req_options["start_date"] = start_date
                req_options["end_date"] = end_date

            # 创建单个任务，内部处理所有周期
            req = SchedulerService.UnifiedKlineSyncRequest(
                subject_type=EntityTypes.BOND,
                selection={"codes": codes, "all_selected": all_selected},
                periods=periods,  # 传递完整periods列表
                options=req_options,
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

            return {
                "success": True,
                "message": f"可转债{period_display}同步任务已创建",
                "task_execution_id": result["task_execution_id"],
            }
        except (ValidationException, DatabaseException):
            raise
        except Exception as e:
            logger.error(f"创建可转债同步任务失败: {e}")
            raise DatabaseException(str(e))


# 创建全局服务实例
convertible_bond_kline_service = ConvertibleBondKlineService()
