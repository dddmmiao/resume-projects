"""
统一K线调度入口拆分
"""

from typing import Dict, Any

from app.constants.entity_types import EntityTypes
from app.core.exceptions import CancellationException
from app.services.core.task_message_formatter import task_message_formatter

def execute_kline_sync_unified(req) -> Dict[str, Any]:
    """单一任务式入口：创建任务并立即返回 task_execution_id。支持多周期聚合。"""
    from app.services.core.redis_task_manager import redis_task_manager
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    from loguru import logger as logger

    # 参数校验
    from app.services.management.scheduler_service import SchedulerService
    if not isinstance(req, SchedulerService.UnifiedKlineSyncRequest):
        raise ValueError("req 必须为 UnifiedKlineSyncRequest 类型")

    subject_type = (req.subject_type or "").strip()
    subject_name = EntityTypes.get_chinese_name(subject_type)
    # 直接使用periods列表
    periods = req.periods or []
    selection = req.selection or {}
    options = req.options or {}

    # 校验周期
    valid_periods = ("daily", "weekly", "monthly")
    if not periods or any(p not in valid_periods for p in periods):
        raise ValueError(f"periods 必须包含至少一个有效周期: {valid_periods}")

    # 构建任务名称和代码
    period_names = {"daily": "日线", "weekly": "周线", "monthly": "月线"}
    period_display = "、".join([period_names.get(p, p) for p in periods])
    task_name = f"手动{subject_name}同步（{period_display}）"
    
    # 使用统一的任务代码（前端期望的key）
    task_code = f"manual_{subject_type}_sync"
    
    # 检查相同任务是否已经在运行
    if redis_task_manager.is_task_type_running(task_code):
        running_task = redis_task_manager.get_running_task_by_code(task_code)
        running_status = (running_task or {}).get("status", "")
        if running_status == "cancelling":
            msg = f"{subject_name}同步任务正在取消中，请稍后再试"
        else:
            msg = f"{subject_name}同步任务正在运行中，请勿重复触发"
        return {
            "success": False,
            "message": msg,
            "task_execution_id": running_task.get("task_id") if running_task else None,
        }

    def worker(task_id: str):
        try:
            logger.info(f"Worker开始执行 | task_id: {task_id} | periods: {periods}")
            redis_task_manager.update_task_progress(
                task_id,
                10,
                f"初始化{subject_name}同步（{period_display}）...",
                operation_details={
                    "subject_type": subject_type,
                    "selection": selection,
                    "periods": periods,
                    "options": options,
                },
            )

            # 解析代码集合
            all_selected = bool(selection.get("all_selected", False))
            input_codes = selection.get("codes") or []

            codes = []
            if all_selected:
                try:
                    if subject_type == EntityTypes.STOCK:
                        from app.services.data.stock_service import stock_service
                        codes = stock_service.get_all_ts_codes_cached()
                    elif subject_type == EntityTypes.BOND:
                        from app.services.data.convertible_bond_service import convertible_bond_service
                        codes = convertible_bond_service.get_all_ts_codes_cached()
                    elif subject_type == EntityTypes.CONCEPT:
                        from app.services.data.concept_service import concept_service
                        codes = concept_service.get_all_ts_codes_cached()
                    elif subject_type == EntityTypes.INDUSTRY:
                        from app.services.data.industry_service import industry_service
                        codes = industry_service.get_all_ts_codes_cached()
                    else:
                        raise ValueError(f"未知 subject_type: {subject_type}")
                except Exception as qe:
                    logger.error(f"查询全量代码失败: {qe}")
                    raise
            else:
                codes = [c for c in (input_codes or []) if isinstance(c, str) and c.strip()]

            if not codes:
                logger.info("代码集合为空，直接完成")
                redis_task_manager.update_task_progress(task_id, 100, "无可同步代码，任务完成")
                return {"success": True, "inserted_count": 0}

            redis_task_manager.update_task_progress(task_id, 10, f"准备同步 {len(codes)} 个目标，共 {len(periods)} 个周期...")

            # 提取选项
            force_sync = bool(options.get("force_sync", False))
            start_date = options.get("start_date")
            end_date = options.get("end_date")
            sync_kline = bool(options.get("sync_kline", True))
            sync_auction = bool(options.get("sync_auction", False))

            # 累计计数器
            total_inserted = 0
            total_updated = 0
            
            # 校验周期日期范围（如果指定了日期范围）
            valid_periods = []
            if start_date and end_date:
                from app.services.data.base_kline_service import BaseKlineService
                for period in periods:
                    is_valid, warning_msg = BaseKlineService.validate_period_date_range(
                        period, start_date, end_date, entity_name=subject_name
                    )
                    if is_valid:
                        valid_periods.append(period)
                    else:
                        logger.warning(warning_msg)
            else:
                valid_periods = periods
            
            if not valid_periods:
                logger.info("没有有效的周期需要同步")
                redis_task_manager.update_task_progress(task_id, 100, "没有有效的周期需要同步")
                return {"success": True, "inserted_count": 0, "updated_count": 0}
            
            # 进度回调：多周期并行时的细粒度进度更新
            total_periods = len(valid_periods)
            completed_periods = 0
            
            def period_progress_callback(period: str, completed: int, total: int):
                """周期处理进度回调（用于并行处理时的实时进度）"""
                nonlocal completed_periods
                completed_periods = completed
                progress = 10 + int((completed_periods / total_periods) * 85)
                period_name = period_names.get(period, period)
                redis_task_manager.update_task_progress(
                    task_id,
                    progress,
                    f"{period_name}处理完成 ({completed}/{total})"
                )
            
            # 一次性调用多周期同步（利用 KlinePeriodProcessor 的并行能力）
            logger.info(f"开始并行同步 {len(valid_periods)} 个周期: {valid_periods}")
            redis_task_manager.update_task_progress(
                task_id, 
                10, 
                f"开始并行同步{period_display}..."
            )
            
            result = _sync_all_periods(
                task_id=task_id,
                subject_type=subject_type,
                periods=valid_periods,
                codes=codes,
                all_selected=all_selected,
                force_sync=force_sync,
                sync_kline=sync_kline,
                sync_auction=sync_auction,
                start_date=start_date,
                end_date=end_date,
                progress_callback=period_progress_callback,
            )
            
            total_inserted = result.get("inserted_count", 0)
            total_updated = result.get("updated_count", 0)
            
            logger.info(f"多周期同步完成，总计新增: {total_inserted}，更新: {total_updated}")

            # 使用统一的文案格式化器
            completion_message = task_message_formatter.format_sync_completion(
                entity_type=f"{subject_name}{period_display}",
                inserted=total_inserted,
                updated=total_updated
            )
            redis_task_manager.update_task_progress(task_id, 100, completion_message)
            logger.info(f"任务 {task_id} 完成: {completion_message}")

            return {"success": True, "inserted_count": total_inserted, "updated_count": total_updated}
        except CancellationException:
            logger.info(f"任务 {task_id} 已取消")
            return {"success": False, "cancelled": True}
        except Exception as e:
            logger.error(f"任务 {task_id} 执行失败: {e}")
            raise

    task_execution_id = redis_task_manager.create_task(name=task_name, task_func=worker, code=task_code)
    return {
        "success": True,
        "message": f"任务已创建：{task_name}",
        "task_execution_id": task_execution_id,
    }


def _sync_all_periods(
    task_id: str,
    subject_type: str,
    periods: list,
    codes: list,
    all_selected: bool,
    force_sync: bool,
    sync_kline: bool,
    sync_auction: bool,
    start_date: str,
    end_date: str,
    progress_callback: callable = None,
) -> Dict[str, Any]:
    """
    多周期并行同步逻辑
    利用 KlinePeriodProcessor 的并行能力同时处理多个周期
    """
    from app.services.core.redis_task_manager import redis_task_manager
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    from loguru import logger
    
    inserted_count = 0
    updated_count = 0
    
    try:
        if subject_type == EntityTypes.STOCK:
            from app.services.data.stock_kline_service import stock_kline_service
            
            # 1. 同步K线数据（多周期并行）
            if sync_kline:
                kline_result = stock_kline_service.sync_stock_kline_data(
                    ts_codes=codes,
                    periods=periods,  # 传入多个周期，由底层并行处理
                    force_sync=force_sync,
                    concurrent_workers=SyncStrategyConfig.DEFAULT_CONCURRENT_WORKERS,
                    task_id=task_id,
                    start_date=start_date,
                    end_date=end_date,
                )
                inserted_count = int((kline_result or {}).get("inserted_count", 0))
                updated_count = int((kline_result or {}).get("updated_count", 0))
            
            # 2. 同步竞价数据（仅包含日线且勾选时）
            if "daily" in periods and sync_auction:
                try:
                    redis_task_manager.update_task_progress(
                        task_id, 85, 
                        "K线数据同步完成，开始同步竞价数据..." if sync_kline else "开始同步竞价数据..."
                    )
                    
                    auction_ts_codes = None if all_selected else codes
                    auction_result = stock_kline_service.sync_auction_data(
                        force_sync=force_sync,
                        task_id=task_id,
                        ts_codes=auction_ts_codes,
                        start_date=start_date,
                        end_date=end_date,
                    )
                    auction_inserted = int((auction_result or {}).get("inserted_count", 0))
                    auction_updated = int((auction_result or {}).get("updated_count", 0))

                    # 竞价数据写入后，按返回的代码列表失效日线缓存并预热
                    auction_result_ts_codes = (auction_result or {}).get("ts_codes") or []
                    if (auction_inserted > 0 or auction_updated > 0) and auction_result_ts_codes:
                        try:
                            stock_kline_service._invalidate_cache("daily", auction_result_ts_codes)
                            logger.info(f"已失效 {len(auction_result_ts_codes)} 只股票的日线缓存（竞价同步）")
                            # 同时失效 K 线最新日期缓存，确保下次查询能获取最新数据
                            from app.services.core.cache_service import cache_service
                            from app.constants.table_types import TableTypes
                            cache_service.invalidate_kline_latest_dates(TableTypes.STOCK)
                        except Exception as e:
                            logger.warning(f"竞价同步后缓存处理失败: {e}")

                    inserted_count += auction_inserted
                    updated_count += auction_updated
                    logger.info(f"竞价数据同步完成，插入: {auction_inserted}，更新: {auction_updated}")
                except Exception as auction_error:
                    logger.error(f"竞价数据同步失败: {auction_error}")
                    
        elif subject_type == EntityTypes.BOND:
            from app.services.data.convertible_bond_kline_service import convertible_bond_kline_service
            if sync_kline:
                kline_result = convertible_bond_kline_service.sync_convertible_bond_kline_data(
                    ts_codes=codes,
                    periods=periods,  # 传入多个周期
                    force_sync=force_sync,
                    concurrent_workers=SyncStrategyConfig.DEFAULT_CONCURRENT_WORKERS,
                    task_id=task_id,
                    start_date=start_date,
                    end_date=end_date,
                )
                inserted_count = int((kline_result or {}).get("inserted_count", 0))
                updated_count = int((kline_result or {}).get("updated_count", 0))
                
        elif subject_type == EntityTypes.CONCEPT:
            from app.services.data.concept_kline_service import concept_kline_service
            if sync_kline:
                result = concept_kline_service.sync_concept_kline_data(
                    ts_codes=codes,
                    periods=periods,  # 传入多个周期
                    force_sync=force_sync,
                    concurrent_workers=SyncStrategyConfig.DEFAULT_CONCURRENT_WORKERS,
                    task_id=task_id,
                    start_date=start_date,
                    end_date=end_date,
                )
                inserted_count = int((result or {}).get("inserted_count", 0))
                updated_count = int((result or {}).get("updated_count", 0))
                
        elif subject_type == EntityTypes.INDUSTRY:
            from app.services.data.industry_kline_service import industry_kline_service
            if sync_kline:
                result = industry_kline_service.sync_industry_kline_data(
                    ts_codes=codes,
                    periods=periods,  # 传入多个周期
                    force_sync=force_sync,
                    concurrent_workers=SyncStrategyConfig.DEFAULT_CONCURRENT_WORKERS,
                    task_id=task_id,
                    start_date=start_date,
                    end_date=end_date,
                )
                inserted_count = int((result or {}).get("inserted_count", 0))
                updated_count = int((result or {}).get("updated_count", 0))
        else:
            raise ValueError(f"未知 subject_type: {subject_type}")
            
    except Exception as se:
        logger.error(f"多周期同步失败: {se}")
        raise
    
    return {"inserted_count": inserted_count, "updated_count": updated_count}
