"""
K线服务基类
提供通用的K线数据同步功能，消除代码重复
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta, date
from loguru import logger

from app.core.exceptions import CancellationException, DatabaseException


class BaseKlineService(ABC):
    """K线服务基类，提供通用的K线数据同步功能"""

    def __init__(self, entity_type: str):
        """
        初始化基类
        
        Args:
            entity_type: 实体类型 ('stock', 'bond', 'concept', 'industry')
        """
        self.entity_type = entity_type
        logger.debug(f"{entity_type} K线服务初始化")

    def sync_kline_data_universal(
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
        通用K线数据同步方法
        
        Args:
            ts_codes: 代码列表
            periods: 周期类型列表
            force_sync: 是否强制同步
            concurrent_workers: 并发工作线程数
            task_id: 任务ID，用于取消检查
            start_date: 开始日期 (YYYYMMDD格式)
            end_date: 结束日期 (YYYYMMDD格式)

        Returns:
            { "inserted_count": 新增条数, "updated_count": 更新条数 }
        """
        import time
        start_time = time.time()
        
        if periods is None:
            periods = ["daily"]
        
        try:
            # 并发处理代码列表（日期范围在方法内部获取）
            process_start_time = time.time()
            result, processed_codes = self._process_codes_concurrently(
                codes=ts_codes,
                periods=periods,
                force_sync=force_sync,
                concurrent_workers=concurrent_workers,
                task_id=task_id,
                start_date=start_date,
                end_date=end_date
            )
            process_duration = time.time() - process_start_time

            # 同步完成后的后续处理：缓存失效、排序字段更新、技术指标更新
            post_process_start_time = time.time()
            self._post_sync_processing(processed_codes, periods, force_sync, task_id)
            post_process_duration = time.time() - post_process_start_time

            total_duration = time.time() - start_time
            logger.info(
                f"{self.entity_type}K线同步完成 | {result} | "
                f"总耗时: {total_duration:.2f}s | "
                f"数据处理: {process_duration:.2f}s | "
                f"后续处理: {post_process_duration:.2f}s | "
                f"平均每代码: {total_duration/len(processed_codes):.3f}s" if processed_codes else f"总耗时: {total_duration:.2f}s"
            )
            return result

        except CancellationException:
            total_duration = time.time() - start_time
            logger.info(f"{self.entity_type}K线同步已取消 | 耗时: {total_duration:.2f}s")
            return {"inserted_count": 0, "updated_count": 0, "cancelled": True}
        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(f"❌ {self.entity_type}K线同步失败 | 耗时: {total_duration:.2f}s | 错误: {e}")
            raise DatabaseException(f"同步{self.entity_type}K线数据失败: {e}")

    def _process_codes_concurrently(
            self,
            codes: List[str],
            periods: List[str],
            force_sync: bool,
            concurrent_workers: int,
            task_id: str,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None
    ) -> Tuple[Dict[str, int], List[str]]:
        """
        并发处理代码列表（日期范围在方法内部获取）
        
        Args:
            codes: 代码列表
            periods: 周期列表
            force_sync: 是否强制同步
            concurrent_workers: 并发数
            task_id: 任务ID
            start_date: 开始日期 (YYYYMMDD格式)
            end_date: 结束日期 (YYYYMMDD格式)
            
        Returns:
            (result_dict, processed_codes): 结果字典和已处理的代码列表
        """
        import time
        import threading
        from typing import Tuple as TypingTuple
        
        # 批量智能日期范围计算：为每个代码计算各个周期的精确日期范围
        from ..core.smart_date_range_calculator import SmartDateRangeCalculator

        # 如果指定了日期范围，使用指定范围；否则使用智能计算
        if start_date and end_date:
            logger.info(f"使用指定日期范围 | {start_date} ~ {end_date}")
            # 为所有代码使用相同的日期范围；保持与 SmartDateRangeCalculator 返回格式一致
            # 每个周期和 overall 都使用 (start_date, end_date) 元组，便于后续统一解包
            period_ranges = {
                code: {
                    'overall': (start_date, end_date),
                    **{period: (start_date, end_date) for period in periods}
                }
                for code in codes
            }
        else:
            period_ranges = SmartDateRangeCalculator.calculate_period_ranges_for_codes(
                codes,
                periods,
                self.entity_type,
                force_sync
            )
        
        # 提取overall范围（用于fetch数据）
        date_ranges = {
            code: ranges['overall'] 
            for code, ranges in period_ranges.items() 
            if ranges.get('overall')
        }
        
        # 检查是否所有数据都是最新的
        if not date_ranges:
            logger.info(
                f"所有{self.entity_type}K线数据都是最新的，无需同步 | "
                f"总代码数: {len(codes)}"
            )
            return {
                "inserted_count": 0,
                "updated_count": 0,
                "total": 0,
                "total_codes": len(codes),
                "periods": periods
            }, []
        
        logger.info(
            f"开始同步 {self.entity_type} K线数据 | "
            f"总代码数: {len(codes)}, "
            f"需要同步: {len(date_ranges)}, "
            f"周期: {periods}, "
            f"force_sync={force_sync}, "
            f"并发数: {concurrent_workers}"
        )
        
        # 初始化周期处理器
        from app.services.data.kline_period_processor import KlinePeriodProcessor
        period_processor = KlinePeriodProcessor(self.entity_type)

        # 启用并发执行
        inserted_count = 0
        updated_count = 0
        processed_count = 0
        error_count = 0

        result_lock = threading.Lock()
        start_time = time.time()

        def worker(code_and_range: TypingTuple[str, TypingTuple[str, str]]) -> Dict[str, int]:
            code, (start_date, end_date) = code_and_range
            worker_start_time = time.time()
            local_inserted = 0
            local_updated = 0
            local_error = False

            try:
                # 使用该代码的特定日期范围
                # 首先获取日线数据（作为基础数据）
                fetch_start_time = time.time()
                daily_kline_data = self._fetch_kline_from_tushare(
                    code, start_date, end_date, task_id=task_id
                )
                fetch_duration = time.time() - fetch_start_time

                if not daily_kline_data:
                    logger.warning(f"未获取到日线数据 | ts_code: {code} | 范围: {start_date}..{end_date} | 耗时: {fetch_duration:.3f}s")
                    return {"inserted": 0, "updated": 0}

                # 使用周期处理器处理所有周期
                def period_progress_callback(period, completed, total):
                    """周期处理进度回调"""
                    logger.debug(f"{code} {period}周期处理完成 ({completed}/{total})")
                
                # 获取该代码的周期范围
                code_period_ranges = period_ranges.get(code, {}) if period_ranges else {}
                
                result = period_processor.process_periods(
                    daily_data=daily_kline_data,
                    periods=periods,
                    bulk_store_func=lambda data, batch: self._bulk_store_data(data, batch),
                    batch_size=500,
                    progress_callback=period_progress_callback,
                    period_ranges=code_period_ranges
                )
                
                local_inserted = result.get("inserted_count", 0)
                local_updated = result.get("updated_count", 0)
                worker_duration = time.time() - worker_start_time

                logger.debug(
                    f"{code} 同步完成 | "
                    f"日期: {start_date}..{end_date} | "
                    f"耗时: {worker_duration:.2f}s | "
                    f"插入: {local_inserted} | 更新: {local_updated}"
                )

            except Exception as e:
                worker_duration = time.time() - worker_start_time
                local_error = True
                logger.error(f"❌ {code} 同步失败 | 耗时: {worker_duration:.3f}s | 错误: {e}")

            return {"inserted": local_inserted, "updated": local_updated, "error": local_error}

        max_workers = int(concurrent_workers or 1)
        if max_workers < 1:
            max_workers = 1

        # 将字典转换为 (code, date_range) 元组列表
        codes_with_ranges_list = list(date_ranges.items())
        
        logger.info(f"开始并发处理 {len(codes_with_ranges_list)} 个代码，并发数: {max_workers}")

        # 统一并发执行
        from app.utils.concurrent_utils import process_concurrently

        def progress_callback(result, completed, total):
            """进度回调函数"""
            elapsed = time.time() - start_time
            avg_time = elapsed / completed if completed > 0 else 0
            remaining = (total - completed) * avg_time
            
            # 更新 Redis 任务进度
            if task_id:
                try:
                    from app.services.scheduler.progress_utils import (
                        update_progress_with_consistent_logic,
                        get_task_type_chinese_mapping
                    )
                    
                    # 获取任务类型的中文映射
                    task_type_mapping = get_task_type_chinese_mapping("kline_sync")
                    task_type_chinese = task_type_mapping.get(self.entity_type, f"{self.entity_type}K线数据")
                    
                    update_progress_with_consistent_logic(
                        task_id=task_id,
                        processed=completed,
                        total=total,
                        task_name=task_type_chinese,
                        current_item_name=f"已同步{completed}个{task_type_chinese}"
                    )
                except Exception as e:
                    logger.warning(f"更新任务进度失败: {e}")
            
            logger.info(
                f"进度: {completed}/{total} ({completed/total*100:.1f}%) | "
                f"已耗时: {elapsed:.1f}秒 | "
                f"预计剩余: {remaining:.1f}秒"
            )

        results = process_concurrently(
            codes_with_ranges_list,
            worker,
            max_workers=max_workers,
            error_handler=lambda code_and_range, e: {"inserted": 0, "updated": 0},
            progress_callback=progress_callback
        )

        # 聚合结果
        for r in results:
            with result_lock:
                inserted_count += r.get("inserted", 0)
                updated_count += r.get("updated", 0)
                if r.get("error", False):
                    error_count += 1
                processed_count += 1

        total_duration = time.time() - start_time
        logger.info(
            f"🏁 并发处理完成 | "
            f"总耗时: {total_duration:.2f}秒 | "
            f"成功: {processed_count - error_count} | "
            f"失败: {error_count} | "
            f"插入: {inserted_count} | "
            f"更新: {updated_count}"
        )

        # 返回结果和已处理的代码列表
        processed_codes = list(date_ranges.keys())
        return {
            "inserted_count": int(inserted_count),
            "updated_count": int(updated_count),
            "total": int(inserted_count) + int(updated_count),
            "total_codes": len(processed_codes),
            "periods": periods,
        }, processed_codes

    @staticmethod
    def _parse_yyyymmdd(date_str: str) -> date:
        """解析 YYYYMMDD 格式的日期字符串为 date 对象"""
        return datetime.strptime(date_str, "%Y%m%d").date()

    @staticmethod
    def is_valid_weekly_range(start_date: str, end_date: str) -> bool:
        """校验用于周线同步的日期范围是否符合业务规则。

        规则：
        - 如果结束日期在当前周之前（完全属于过去周）：
          - 起始日期必须是该周的周一
          - 结束日期必须是某周的周日
          - 总天数必须是 7 的整数倍（若干完整自然周）
        - 如果范围覆盖当前周：
          - 当前周允许不完整
          - 但如果起始日期早于当前周的周一，则起始日期必须是其所在周的周一，避免截断过去周
        """
        try:
            start = BaseKlineService._parse_yyyymmdd(start_date)
            end = BaseKlineService._parse_yyyymmdd(end_date)
        except Exception:
            return False

        if start > end:
            return False

        today = datetime.today().date()
        cur_week_start = today - timedelta(days=today.weekday())

        def week_start(d: date) -> date:
            return d - timedelta(days=d.weekday())

        def week_end(d: date) -> date:
            return week_start(d) + timedelta(days=6)

        # 完全在过去周：必须是若干完整自然周
        if end < cur_week_start:
            if start != week_start(start):
                return False
            if end != week_end(end):
                return False
            delta_days = (end - start).days + 1
            return delta_days % 7 == 0

        # 覆盖当前周：当前周允许不完整，但不能截断更早的周
        if start < cur_week_start and start != week_start(start):
            return False

        return True

    @staticmethod
    def validate_period_date_range(period: str, start_date: str, end_date: str, entity_name: str = "") -> Tuple[bool, str]:
        """统一校验指定周期的日期范围是否合法
        
        Args:
            period: 周期类型 (daily/weekly/monthly)
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)
            entity_name: 实体名称（用于日志），如"股票"、"可转债"等
        
        Returns:
            (is_valid, warning_message): 是否合法和警告信息
        """
        if period == "daily":
            return True, ""  # 日线不需要校验
        
        period_name_map = {"weekly": "周线", "monthly": "月线"}
        period_name = period_name_map.get(period, period)
        
        if period == "weekly":
            is_valid = BaseKlineService.is_valid_weekly_range(start_date, end_date)
            if not is_valid:
                msg = f"跳过{entity_name}{period_name}同步：日期范围 {start_date}~{end_date} 不满足完整周规则"
                return False, msg
        elif period == "monthly":
            is_valid = BaseKlineService.is_valid_monthly_range(start_date, end_date)
            if not is_valid:
                msg = f"跳过{entity_name}{period_name}同步：日期范围 {start_date}~{end_date} 不满足完整月规则"
                return False, msg
        
        return True, ""

    @staticmethod
    def is_valid_monthly_range(start_date: str, end_date: str) -> bool:
        """校验用于月线同步的日期范围是否符合业务规则。

        规则：
        - 如果结束日期在当前月之前（完全属于过去月份）：
          - 起始日期必须是所在月份的 1 号
          - 结束日期必须是所在月份的最后一天
        - 如果范围覆盖当前月：
          - 当前月允许不完整
          - 但如果起始日期早于当月 1 号，则起始日期必须是其所在月份的 1 号，避免截断过去月份
        """
        try:
            start = BaseKlineService._parse_yyyymmdd(start_date)
            end = BaseKlineService._parse_yyyymmdd(end_date)
        except Exception:
            return False

        if start > end:
            return False

        today = datetime.today().date()
        cur_month_start = today.replace(day=1)

        def month_start(d: date) -> date:
            return d.replace(day=1)

        def month_end(d: date) -> date:
            # 利用“下月 1 号减 1 天”得到当月最后一天
            next_month = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
            return next_month - timedelta(days=1)

        # 完全在过去月份：必须是若干完整自然月
        if end < cur_month_start:
            if start != month_start(start):
                return False
            if end != month_end(end):
                return False
            return True

        # 覆盖当前月：当前月允许不完整，但不能截断更早的月份
        if start < cur_month_start and start != month_start(start):
            return False

        return True

    @abstractmethod
    def _fetch_kline_from_tushare(
            self, ts_code: str, start_date: str, end_date: str, task_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        从Tushare获取K线数据（子类实现）
        
        Args:
            ts_code: 代码
            start_date: 开始日期
            end_date: 结束日期
            task_id: 任务ID
            
        Returns:
            K线数据列表
        """
        pass

    @abstractmethod
    def _bulk_store_data(
            self,
            data: List[Dict[str, Any]],
            batch_size: int = 500
    ) -> Dict[str, int]:
        """
        批量存储K线数据（子类实现）
        
        Args:
            data: K线数据列表（已通过上层过滤）
            batch_size: 批量大小
            
        Returns:
            存储结果
        """
        pass

    def _post_sync_processing(self, codes: List[str], periods: List[str], force_sync: bool, task_id: str = None):
        """
        同步完成后的后续处理
        
        Args:
            codes: 代码列表
            periods: 周期列表
            force_sync: 是否强制同步
            task_id: 任务ID，用于检查取消状态
        """
        try:
            from app.services.management import indicator_updater

            # 失效K线最新日期缓存
            try:
                from app.services.core.cache_service import cache_service
                from app.constants.table_types import TableTypes
                table_type = TableTypes.entity_type_to_table_type(self.entity_type)
                deleted_count = cache_service.invalidate_kline_latest_dates(table_type)
                logger.debug(f"失效{table_type}K线最新日期缓存 | 删除: {deleted_count}")
            except Exception as e:
                logger.warning(f"失效K线最新日期缓存失败: {e}")

            # 在开始指标计算前再次检查取消状态
            if task_id:
                from app.services.core.redis_task_manager import redis_task_manager
                if redis_task_manager.is_task_cancelled(task_id):
                    logger.info(f"任务在指标计算前被取消 | task_id: {task_id}")
                    raise CancellationException("任务已取消")

            # 第二步：异步更新数据
            for period in periods:
                # 异步更新技术指标
                try:
                    def on_indicator_complete(e_type: str, p: str, e_codes: List[str], success: bool, updated_rows: int):
                        """指标更新完成后的回调：失效缓存"""
                        try:
                            # 失效K线缓存（缓存预热已关闭，改为懒加载模式）
                            self._invalidate_cache(p, e_codes)
                            logger.debug(f"失效{e_type} {p}K线缓存完成")
                        except Exception as e:
                            logger.warning(f"{e_type}{p}缓存处理失败: {e}")

                    indicator_updater.async_sync_indicators(
                        entity_type=self.entity_type, 
                        entity_codes=codes, 
                        period=period, 
                        force_sync=force_sync,
                        on_complete=on_indicator_complete  # 指标更新完成后执行缓存失效
                    )
                except Exception as e:
                    logger.error(f"启动{self.entity_type}{period}技术指标异步更新失败: {e}")
                    # 如果技术指标更新启动失败，仍然失效缓存（避免缓存数据不更新）
                    try:
                        self._invalidate_cache(period, codes)
                        logger.warning(f"{self.entity_type}{period}技术指标更新启动失败，已失效缓存以确保数据一致性")
                    except Exception as cache_e:
                        logger.warning(f"{self.entity_type}{period}缓存失效失败: {cache_e}")
        except Exception as e:
            logger.error(f"{self.entity_type} K线同步后续处理失败: {e}")

    @abstractmethod
    def _invalidate_cache(self, period: str, codes: List[str]):
        """
        失效缓存（子类实现）
        
        Args:
            period: 周期
            codes: 代码列表
        """
        pass

    def _preheat_cache(self, period: str, codes: List[str]):
        """
        预热缓存：指标计算完成后，重新加载数据到缓存
        
        优化策略：
        1. 分批处理，避免内存峰值过高
        2. 降低并发数，减少数据库/Redis压力
        3. 批次间添加间隔，让系统有喘息时间
        
        Args:
            period: 周期
            codes: 代码列表
        """
        def warmup_task():
            import time
            from concurrent.futures import ThreadPoolExecutor, as_completed
            from app.utils.concurrent_utils import ConcurrentConfig
            
            start_time = time.time()
            total_codes = len(codes)
            
            try:
                # 获取缓存方法（子类实现）
                get_full_fn = self._get_kline_data_full_method(period)
                if not get_full_fn:
                    logger.warning(f"{self.entity_type} 未实现缓存预热方法")
                    return
                
                # 优化参数：使用自适应并发数，分批处理
                max_workers = max(1, ConcurrentConfig.get_optimal_workers() // 2)  # 使用一半的并发数，减少资源压力
                batch_size = 50  # 每批处理50个代码
                batch_interval = 0.3  # 批次间隔0.3秒
                
                success_count = 0
                completed_count = 0
                log_interval = max(1, total_codes // 10)
                
                # 分批处理
                for batch_start in range(0, total_codes, batch_size):
                    batch_end = min(batch_start + batch_size, total_codes)
                    batch_codes = codes[batch_start:batch_end]
                    
                    with ThreadPoolExecutor(max_workers=max_workers) as executor:
                        futures = {executor.submit(get_full_fn, code): code for code in batch_codes}
                        
                        for future in as_completed(futures):
                            completed_count += 1
                            try:
                                future.result()
                                success_count += 1
                            except Exception:
                                pass
                            
                            # 输出进度
                            if completed_count % log_interval == 0 or completed_count == total_codes:
                                elapsed = time.time() - start_time
                                progress_pct = completed_count / total_codes * 100
                                avg_time = elapsed / completed_count
                                remaining_time = avg_time * (total_codes - completed_count)
                                logger.info(
                                    f"{self.entity_type} {period} 缓存预热进度: {completed_count}/{total_codes} ({progress_pct:.1f}%) | "
                                    f"已耗时: {elapsed:.1f}s | 预计剩余: {remaining_time:.1f}s"
                                )
                    
                    # 批次间休息，让系统有喘息时间
                    if batch_end < total_codes:
                        time.sleep(batch_interval)
                
                elapsed = time.time() - start_time
                logger.info(f"{self.entity_type} {period}缓存预热完成: {success_count}/{total_codes} | 总耗时: {elapsed:.2f}s")
            except Exception as e:
                elapsed = time.time() - start_time
                logger.warning(f"{self.entity_type} {period}缓存预热失败: {e} | 耗时: {elapsed:.2f}s")
        
        # 使用通用异步工具执行预热，不阻塞主流程
        from app.utils.concurrent_utils import run_async
        run_async(warmup_task, name=f"cache_warmup_{self.entity_type}_{period}")

    def _get_kline_data_full_method(self, period: str):
        """
        获取带缓存的K线数据方法（子类可覆盖）
        
        Args:
            period: 周期
            
        Returns:
            可调用的缓存方法，或None
        """
        return None
