"""
定时任务调度器
用于定时同步股票数据 - 统一使用增强版架构
"""

from typing import Optional

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

from app.services.management.scheduler_service import scheduler_service, TASK_CONFIG


class DataSyncScheduler:
    """数据同步调度器 - 统一使用scheduler_service的增强版方法"""

    def __init__(self):
        # 配置时区为中国时区
        china_tz = pytz.timezone("Asia/Shanghai")
        self.scheduler = AsyncIOScheduler(timezone=china_tz)
        self._is_running = False

    def start(self):
        """启动调度器"""
        if self._is_running:
            logger.warning("调度器已经在运行中")
            return

        try:
            # 添加定时任务
            self._add_scheduled_jobs()

            # 启动调度器
            self.scheduler.start()
            self._is_running = True
            logger.info("数据同步调度器启动成功")

        except Exception as e:
            logger.error(f"启动调度器失败: {e}")
            raise

    def stop(self):
        """停止调度器"""
        if not self._is_running:
            return

        try:
            self.scheduler.shutdown()
            self._is_running = False
            logger.info("数据同步调度器已停止")
        except Exception as e:
            logger.error(f"停止调度器失败: {e}")

    def _add_scheduled_jobs(self):
        """添加定时任务 - 从 TASK_CONFIG 统一配置读取"""
        
        for task_id, config in TASK_CONFIG.items():
            cron_parts = config["cron"].split()
            
            # 解析 cron 表达式
            trigger_kwargs = {"minute": cron_parts[0], "hour": cron_parts[1]}
            if cron_parts[2] != "*":
                trigger_kwargs["day"] = cron_parts[2]
            if cron_parts[3] != "*":
                trigger_kwargs["month"] = cron_parts[3]
            if cron_parts[4] != "*":
                trigger_kwargs["day_of_week"] = cron_parts[4]
            
            # 根据 trading_day_only 配置决定执行方式
            if config.get("trading_day_only", False):
                # 仅交易日执行
                task_id_copy = task_id  # 避免闭包问题
                func = lambda tid=task_id_copy: self._run_task_only_on_trading_day(tid)
            else:
                # 每天执行
                task_id_copy = task_id
                func = lambda tid=task_id_copy: scheduler_service.trigger_task(tid)
            
            self.scheduler.add_job(
                func=func,
                trigger=CronTrigger(**trigger_kwargs),
                id=task_id,
                name=config["name"],
                replace_existing=True,
                max_instances=1,
            )

        logger.info(f"定时任务添加完成 - 共注册 {len(self.scheduler.get_jobs())} 个任务，配置来自 TASK_CONFIG")

    def _run_task_only_on_trading_day(self, task_id: str, options: Optional[dict] = None):
        """仅在最新交易日执行指定任务（仅针对增量同步）。

        规则：
        - 如果 options.force_sync 为 True，则视为全量同步，不受交易日限制，直接执行；
        - 否则（增量同步），仅在 today 为最新交易日时执行，非交易日直接跳过；
        - 手动触发 scheduler_service.trigger_task 不经过此方法，自然不受限制。
        """

        opts = options or {}
        force_sync = bool(opts.get("force_sync", False))

        # 全量同步：不受交易日限制
        if not force_sync:
            try:
                from app.services.data.trade_calendar_service import trade_calendar_service

                is_today_latest = trade_calendar_service.is_today_latest_trading_day()
                if not is_today_latest:
                    logger.info(f"非交易日，跳过定时任务 | task_id: {task_id}")

                    # 为了让后台定时任务管理中的“下次执行时间”不要停留在过去，
                    # 在这里显式推进一次 next_run_time（跳过非交易日）。
                    try:
                        task = scheduler_service.tasks.get(task_id)
                        if task:
                            task.next_run_time = scheduler_service._calculate_next_run(
                                task.cron_expression, skip_non_trading_day=True
                            )
                    except Exception as update_err:
                        logger.warning(f"更新任务 {task_id} 的下次执行时间失败: {update_err}")

                    return
            except Exception as e:
                logger.warning(f"检查交易日状态失败，仍然执行任务 {task_id}: {e}")

        # 在交易日或全量模式、检查失败时正常触发任务
        scheduler_service.trigger_task(task_id, options)

    def reschedule_job(self, job_id: str, cron_expression: str):
        """重新调度任务
        
        Args:
            job_id: 任务ID
            cron_expression: Cron表达式
            
        Returns:
            dict: 包含success字段的结果
        """
        try:
            if not self._is_running:
                return {"success": False, "message": "调度器未运行"}

            # 解析cron表达式（使用中国时区）
            from apscheduler.triggers.cron import CronTrigger
            china_tz = pytz.timezone("Asia/Shanghai")
            # 解析cron表达式各部分
            parts = cron_expression.strip().split()
            if len(parts) == 5:
                minute, hour, day, month, day_of_week = parts
                trigger = CronTrigger(
                    minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week,
                    timezone=china_tz
                )
            else:
                # 如果解析失败，使用默认方式
                trigger = CronTrigger.from_crontab(cron_expression)

            # 重新调度任务
            self.scheduler.reschedule_job(job_id, trigger=trigger)
            return {"success": True, "message": f"任务 {job_id} 重新调度成功"}

        except Exception as e:
            logger.error(f"重新调度任务 {job_id} 失败: {e}")
            return {"success": False, "message": str(e)}

    @property
    def is_running(self):
        """检查调度器是否正在运行"""
        return self._is_running


# 全局调度器实例
data_sync_scheduler = DataSyncScheduler()
