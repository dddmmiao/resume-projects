"""
定时任务管理服务
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Any, Optional

from loguru import logger


# 统一的定时任务配置（单一数据源）
# scheduler.py 和 scheduler_service.py 都从这里读取
TASK_CONFIG = {
    # 基础数据同步（开盘前）
    "stock_sync": {
        "name": "股票/可转债数据同步",
        "description": "每天上午8:30同步股票和可转债基础数据（开盘前）",
        "cron": "30 8 * * *",
        "trading_day_only": False,
    },
    "concept_sync": {
        "name": "概念板块同步",
        "description": "每天上午8:35同步概念板块数据（开盘前）",
        "cron": "35 8 * * *",
        "trading_day_only": False,
    },
    "industry_sync": {
        "name": "行业板块同步",
        "description": "每天上午8:40同步行业板块数据（开盘前）",
        "cron": "40 8 * * *",
        "trading_day_only": False,
    },
    # 交易日历
    "trade_calendar_sync": {
        "name": "交易日历同步",
        "description": "每周一00:05同步未来一年的交易日历数据",
        "cron": "5 0 * * 1",
        "trading_day_only": False,
    },
    # 清理任务
    "cleanup_expired_data": {
        "name": "清理过期数据",
        "description": "每天凌晨00:00清理过期数据",
        "cron": "0 0 * * *",
        "trading_day_only": False,
    },
    # 登录检查
    "auto_relogin_check": {
        "name": "自动补登录检查",
        "description": "每天上午9:00检查用户登录态并触发补登录",
        "cron": "0 9 * * *",
        "trading_day_only": False,
    },
    # 热度数据
    "hot_sync": {
        "name": "热度数据同步",
        "description": "每天4次同步热度数据（09:15、12:15、15:15、21:15）",
        "cron": "15 9,12,15,21 * * *",
        "trading_day_only": False,
    },
    # 竞价数据（仅交易日）
    "sync_stock_auction_data": {
        "name": "同步股票开盘竞价数据",
        "description": "每个交易日9:28同步股票开盘竞价数据",
        "cron": "28 9 * * *",
        "trading_day_only": True,
    },
    # K线数据（仅交易日）
    "sync_all_bond_kline_data": {
        "name": "同步所有可转债K线数据",
        "description": "每天下午16:10同步所有可转债K线数据",
        "cron": "10 16 * * *",
        "trading_day_only": True,
    },
    "sync_all_stock_kline_data": {
        "name": "同步所有股票K线数据",
        "description": "每天下午16:40同步所有股票K线数据",
        "cron": "40 16 * * *",
        "trading_day_only": True,
    },
    "sync_all_concept_kline_data": {
        "name": "同步所有概念K线数据",
        "description": "每天晚上19:40同步所有概念K线数据",
        "cron": "40 19 * * *",
        "trading_day_only": True,
    },
    "sync_all_industry_kline_data": {
        "name": "同步所有行业K线数据",
        "description": "每天晚上19:50同步所有行业K线数据",
        "cron": "50 19 * * *",
        "trading_day_only": True,
    },
    # 策略推送任务
    "strategy_push_to_ths": {
        "name": "策略计算推送",
        "description": "执行策略计算并推送结果到同花顺自选分组（参数从系统配置读取）",
        "cron": "0 20 * * *",
        "trading_day_only": True,
    },
}


@dataclass
class ScheduledTask:
    """定时任务信息"""

    id: str
    name: str
    description: str
    cron_expression: str
    next_run_time: Optional[datetime]
    last_run_time: Optional[datetime]
    status: str  # 'running', 'paused', 'stopped' - 内存中的状态，启动时从Redis加载

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "cron_expression": self.cron_expression,
            "next_run_time": (
                self.next_run_time.isoformat() if self.next_run_time else None
            ),
            "last_run_time": (
                self.last_run_time.isoformat() if self.last_run_time else None
            ),
            "status": self.status,
        }


class SchedulerService:
    """定时任务管理服务"""

    # 统一的并发度配置
    CONCURRENCY_CONFIG = {
        "hot_sync": {
            "max_workers": 4,
            "batch_size": None,
            "description": "热度数据同步 - 四类数据并发"
        },
        "concept_sync": {
            "max_workers": 4,
            "batch_size": 50,
            "description": "概念板块同步 - 分批并发处理"
        },
        "industry_sync": {
            "max_workers": 4,
            "batch_size": 50,
            "description": "行业板块同步 - 分批并发处理"
        },
        "stock_sync": {
            "max_workers": 2,
            "batch_size": None,
            "description": "股票数据同步 - 股票和可转债并发"
        }
    }

    def __init__(self):
        self.tasks = {}
        self._init_default_tasks()
    
    def _get_task_status_from_redis(self, task_id: str) -> str:
        """从Redis获取任务状态，如果不存在则返回默认值 'running'"""
        try:
            from app.services.core.cache_service import cache_service
            if cache_service.redis_client:
                status = cache_service.redis_client.get(f"scheduler:task_status:{task_id}")
                if status and str(status) in ('running', 'paused', 'stopped'):
                    return str(status)
        except Exception as e:
            logger.warning(f"从Redis获取任务 {task_id} 状态失败: {e}")
        return 'running'
    
    def _save_task_status_to_redis(self, task_id: str, status: str):
        """将任务状态保存到Redis"""
        try:
            from app.services.core.cache_service import cache_service
            if cache_service.redis_client:
                cache_service.redis_client.set(f"scheduler:task_status:{task_id}", status)
        except Exception as e:
            logger.warning(f"保存任务 {task_id} 状态到Redis失败: {e}")

    def _calculate_task_concurrency(self, task_type: str, data_size: int = None) -> int:
        """根据任务类型和数据量计算最优并发度"""
        config = self.CONCURRENCY_CONFIG.get(task_type, {})
        base_workers = config.get("max_workers", 4)

        if data_size is None:
            return base_workers

        # 考虑数据量
        if data_size < 10:
            return min(2, base_workers)  # 数据量小，减少并发
        elif data_size > 100:
            return min(base_workers + 2, 16)  # 数据量大，适当增加并发

        return base_workers

    @dataclass
    class UnifiedKlineSyncRequest:
        """统一的K线同步请求结构

        - subject_type: stock | bond | concept | industry
        - selection: { codes?: List[str]; all_selected?: bool }
        - periods: 周期列表: ["daily", "weekly", "monthly"]
        - options: { force_sync?: bool, sync_kline?: bool, sync_auction?: bool, start_date?: str, end_date?: str }
        """
        subject_type: str
        selection: Dict[str, Any]
        periods: Optional[list] = None
        options: Optional[Dict[str, Any]] = None

    @staticmethod
    def execute_kline_sync_unified(req: "SchedulerService.UnifiedKlineSyncRequest") -> Dict[str, Any]:
        from ..scheduler.kline_unified import execute_kline_sync_unified as _exec
        return _exec(req)

    def validate_task_id(self, task_id: str) -> bool:
        """校验任务ID是否存在于已注册任务表"""
        try:
            return task_id in self.tasks
        except Exception:
            return False

    @staticmethod
    def _get_last_run_time(task_id: str) -> Optional[datetime]:
        """从Redis任务缓存中获取任务上次执行时间"""
        try:
            from ..core.redis_task_manager import redis_task_manager
            # 查找该任务类型的最新执行记录（包括已完成的任务）
            all_tasks = redis_task_manager.get_all_tasks()
            latest_time = None
            for task_info in all_tasks.values():
                if task_info.get('code') == task_id:
                    started_at = task_info.get('started_at')
                    if started_at:
                        task_time = datetime.fromisoformat(started_at)
                        if latest_time is None or task_time > latest_time:
                            latest_time = task_time
            return latest_time
        except Exception as e:
            logger.warning(f"获取任务 {task_id} 上次执行时间失败: {e}")
            return None

    def _init_default_tasks(self):
        """初始化默认任务 - 从 TASK_CONFIG 统一配置读取"""
        import pytz
        china_tz = pytz.timezone("Asia/Shanghai")
        now = datetime.now(china_tz)
        
        # 从统一配置初始化所有任务
        for task_id, config in TASK_CONFIG.items():
            task = ScheduledTask(
                id=task_id,
                name=config["name"],
                description=config["description"],
                cron_expression=config["cron"],
                next_run_time=self._calculate_next_run(config["cron"]),
                last_run_time=self._get_last_run_time(task_id),
                status=self._get_task_status_from_redis(task_id),
            )
            self.tasks[task_id] = task

        # 系统重启后重置所有任务的下次执行时间（如果已过期）
        self._reset_expired_next_run_times()

    def _reset_expired_next_run_times(self):
        """重置所有已过期的下次执行时间"""
        import pytz
        china_tz = pytz.timezone("Asia/Shanghai")
        current_time = datetime.now(china_tz)
        
        reset_count = 0
        for task_id, task in self.tasks.items():
            if task.next_run_time and task.next_run_time < current_time:
                # 下次执行时间已过期，重新计算
                old_next_run = task.next_run_time
                task.next_run_time = self._calculate_next_run(task.cron_expression)
                reset_count += 1
                logger.info(
                    f"系统重启检测：任务 {task_id} ({task.name}) 的下次执行时间已过期 "
                    f"({old_next_run})，已重置为 {task.next_run_time}"
                )
        
        if reset_count > 0:
            logger.info(f"系统重启：已重置 {reset_count} 个定时任务的过期执行时间")
        else:
            logger.info("系统重启：所有定时任务的执行时间均有效，无需重置")

    def _calculate_next_run(self, cron_expression: str, skip_non_trading_day: bool = False) -> datetime:
        """计算下次执行时间
        
        Args:
            cron_expression: Cron表达式
            skip_non_trading_day: 是否跳过非交易日
        """
        from croniter import croniter
        import pytz

        # 使用中国时区
        china_tz = pytz.timezone("Asia/Shanghai")
        now = datetime.now(china_tz)

        # 创建croniter对象
        cron = croniter(cron_expression, now)
        next_time = cron.get_next(datetime)

        # 跳过非交易日：使用 get_next_trading_day 获取下一个交易日
        if skip_non_trading_day:
            try:
                from app.services.data.trade_calendar_service import trade_calendar_service
                next_date_str = next_time.strftime("%Y%m%d")
                
                # 检查当前计算的日期是否为交易日
                if not trade_calendar_service.is_trading_day(next_date_str):
                    # 获取下一个交易日
                    next_trading_day = trade_calendar_service.get_next_trading_day(next_date_str)
                    if next_trading_day:
                        # 直接用交易日日期，保留原时间
                        trading_date = datetime.strptime(next_trading_day, "%Y%m%d")
                        next_time = china_tz.localize(trading_date.replace(
                            hour=next_time.hour,
                            minute=next_time.minute,
                            second=0
                        ))
            except Exception as e:
                logger.warning(f"跳过非交易日检查失败: {e}")

        logger.info(f"计算cron '{cron_expression}' 的下次执行时间: {next_time}")
        return next_time

    def get_all_tasks(self) -> List[Dict[str, Any]]:
        """获取所有定时任务"""
        tasks = []
        for task in self.tasks.values():
            # 在后台直接解析 cron 为中文描述，避免前端频繁调用 cron/parse
            try:
                from cron_descriptor import get_description as _cron_desc
                cron_description = _cron_desc(task.cron_expression) if task.cron_expression else ""
            except Exception:
                cron_description = ""

            # 对 trading_day_only 任务，动态计算跳过非交易日后的 next_run_time
            trading_day_only = TASK_CONFIG.get(task.id, {}).get("trading_day_only", False)
            if trading_day_only and task.next_run_time:
                next_run_time = self._calculate_next_run(task.cron_expression, skip_non_trading_day=True)
            else:
                next_run_time = task.next_run_time

            tasks.append({
                "id": task.id,
                "name": task.name,
                "description": task.description,
                "cron_expression": task.cron_expression,
                "cron_description": cron_description,
                "next_run_time": (next_run_time.isoformat() if next_run_time else None),
                "last_run_time": (task.last_run_time.isoformat() if task.last_run_time else None),
                "status": task.status,
            })
        return tasks

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取单个任务信息"""
        task = self.tasks.get(task_id)
        if not task:
            return None

        # 对 trading_day_only 任务，动态计算跳过非交易日后的 next_run_time
        trading_day_only = TASK_CONFIG.get(task_id, {}).get("trading_day_only", False)
        if trading_day_only and task.next_run_time:
            next_run_time = self._calculate_next_run(task.cron_expression, skip_non_trading_day=True)
        else:
            next_run_time = task.next_run_time

        return {
            "id": task.id,
            "name": task.name,
            "description": task.description,
            "cron_expression": task.cron_expression,
            "next_run_time": (
                next_run_time.isoformat() if next_run_time else None
            ),
            "last_run_time": (
                task.last_run_time.isoformat() if task.last_run_time else None
            ),
            "status": task.status,
        }

    def trigger_task(self, task_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """手动触发任务（异步执行）"""
        task = self.tasks.get(task_id)
        if not task:
            return {
                "success": False,
                "message": f"任务 {task_id} 不存在",
                "task_execution_id": None,
            }

        # 如果任务未处于运行状态，则禁止触发（包括定时触发与手动触发）
        if task.status != "running":
            return {
                "success": False,
                "message": f"任务 {task_id} 当前状态为 {task.status}，已禁止触发",
                "task_execution_id": None,
            }

        # 检查任务是否已经在运行
        from ..core.redis_task_manager import redis_task_manager
        if redis_task_manager.is_task_type_running(task_id):
            running_task = redis_task_manager.get_running_task_by_code(task_id)
            return {
                "success": False,
                "message": f"任务 {task_id} 正在运行中，请勿重复触发",
                "task_execution_id": running_task.get("task_id") if running_task else None,
            }

        try:
            # 更新任务上次执行时间（将在Redis任务创建时自动记录）
            task.last_run_time = datetime.now()

            # 任务配置映射
            _opts = options or {}
            
            # 导入领域层方法
            from ..scheduler.workers_kline_all import (
                sync_all_stock_kline_data_background,
                sync_all_bond_kline_data_background,
                sync_all_concept_kline_data_background,
                sync_all_industry_kline_data_background,
            )
            from ..scheduler.workers_domain import (
                execute_concept_sync_async,
                execute_industry_sync_async,
                execute_stock_sync_async,
                execute_hot_sync_async,
                execute_trade_calendar_sync_async,
                execute_cleanup_expired_data_async,
                execute_stock_auction_sync_async,
                execute_auto_relogin_check_async,
                execute_strategy_push_to_ths_async,
            )
            
            # 创建任务配置
            task_configs = {
                "concept_sync": ("概念板块同步", lambda t_id, options=None: execute_concept_sync_async(self, t_id)),
                "industry_sync": ("行业板块同步", lambda t_id, options=None: execute_industry_sync_async(self, t_id)),
                "stock_sync": ("股票/可转债数据同步", lambda t_id, options=None: execute_stock_sync_async(self, t_id)),
                "hot_sync": ("热度数据同步", lambda t_id, options=None: execute_hot_sync_async(self, t_id)),
                "trade_calendar_sync": ("交易日历同步", lambda t_id, options=None: execute_trade_calendar_sync_async(self, t_id)),
                "cleanup_expired_data": ("清理过期数据", lambda t_id, options=None: execute_cleanup_expired_data_async(t_id)),

                # K线同步任务：传递 options，领域层方法会从中提取 force_sync
                "sync_all_stock_kline_data": ("同步所有股票K线数据", lambda t_id, options=None: sync_all_stock_kline_data_background(t_id, options=options)),
                "sync_all_bond_kline_data": ("同步所有可转债K线数据", lambda t_id, options=None: sync_all_bond_kline_data_background(t_id, options=options)),
                "sync_all_concept_kline_data": ("同步所有概念K线数据", lambda t_id, options=None: sync_all_concept_kline_data_background(t_id, options=options)),
                "sync_all_industry_kline_data": ("同步所有行业K线数据", lambda t_id, options=None: sync_all_industry_kline_data_background(t_id, options=options)),
                "sync_stock_auction_data": ("同步股票开盘竞价数据", lambda t_id, options=None: execute_stock_auction_sync_async(t_id, options=options)),
                "auto_relogin_check": ("自动补登录检查", lambda t_id, options=None: execute_auto_relogin_check_async(t_id)),
                "strategy_push_to_ths": ("策略计算推送", lambda t_id, options=None: execute_strategy_push_to_ths_async(t_id, options=options)),
            }

            if task_id not in task_configs:
                return {
                    "success": False,
                    "message": f"未知任务类型: {task_id}",
                    "task_execution_id": None,
                }

            task_name, task_func = task_configs[task_id]
            
            # 统一传递 options 参数，所有接口层方法都接受 options（需要时使用，不需要时忽略）
            execution_id = redis_task_manager.create_task(
                name=task_name, 
                task_func=task_func, 
                code=task_id,
                options=_opts
            )

            # 更新下次执行时间
            task.next_run_time = self._calculate_next_run(task.cron_expression)

            return {
                "success": True,
                "message": f"任务 {task_id} 触发成功",
                "task_execution_id": execution_id,
            }

        except Exception as e:
            logger.error(f"触发任务 {task_id} 失败: {e}")
            return {
                "success": False,
                "message": f"触发任务失败: {str(e)}",
                "task_execution_id": None,
            }

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        """更新定时任务的启用状态（running/paused/stopped）"""
        try:
            if status not in {"running", "paused", "stopped"}:
                return {"success": False, "message": f"无效的任务状态: {status}"}

            task = self.tasks.get(task_id)
            if not task:
                return {"success": False, "message": f"任务 {task_id} 不存在"}

            old_status = task.status
            task.status = status
            
            # 同步保存状态到Redis
            self._save_task_status_to_redis(task_id, status)

            # 当任务重新启用时，重新计算下次执行时间；暂停/停止时将下次执行时间置空，方便前端显示
            if status == "running":
                try:
                    task.next_run_time = self._calculate_next_run(task.cron_expression)
                except Exception as e:
                    # 即使计算失败也不影响状态更新
                    logger.warning(f"计算任务 {task_id} 下次执行时间失败: {e}")
            else:
                task.next_run_time = None

            logger.info(f"任务 {task_id} 状态已从 {old_status} 修改为 {status}")

            return {
                "success": True,
                "message": f"任务 {task.name} 状态已修改为 {status}",
                "task": task.to_dict(),
            }

        except Exception as e:
            logger.error(f"更新任务 {task_id} 状态失败: {e}")
            return {"success": False, "message": f"更新任务状态失败: {str(e)}"}

    def update_task_cron(self, task_id: str, cron_expression: str) -> Dict[str, Any]:
        """修改定时任务的执行周期"""
        try:
            # 验证cron表达式格式
            if not self._validate_cron_expression(cron_expression):
                return {
                    "success": False,
                    "message": f"无效的cron表达式: {cron_expression}",
                }

            # 查找任务
            task = self.tasks.get(task_id)

            if not task:
                return {"success": False, "message": f"任务 {task_id} 不存在"}

            # 更新cron表达式和下次执行时间
            old_cron = task.cron_expression
            task.cron_expression = cron_expression
            task.next_run_time = self._calculate_next_run(cron_expression)

            logger.info(
                f"任务 {task_id} 的执行周期已从 '{old_cron}' 修改为 '{cron_expression}'"
            )
            logger.info(f"任务 {task_id} 的下次执行时间: {task.next_run_time}")

            # 同步到 APScheduler
            try:
                from app.core.scheduler import data_sync_scheduler
                _r = data_sync_scheduler.reschedule_job(task_id, cron_expression)
                if not _r.get("success"):
                    logger.warning(f"APScheduler重设失败: {_r}")
            except Exception as se:
                logger.warning(f"同步APScheduler触发器失败: {se}")

            return {
                "success": True,
                "message": f"任务 {task.name} 的执行周期已修改为: {cron_expression}",
                "task": task.to_dict(),
            }

        except Exception as e:
            logger.error(f"修改任务 {task_id} 执行周期失败: {e}")
            return {"success": False, "message": f"修改执行周期失败: {str(e)}"}

    @staticmethod
    def _validate_cron_expression(cron_expression: str) -> bool:
        """验证cron表达式格式和范围"""
        try:
            parts = cron_expression.strip().split()
            if len(parts) != 5:
                return False
            
            # 范围验证: 分钟(0-59), 小时(0-23), 日(1-31), 月(1-12), 周(0-6)
            ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
            for i, (part, (min_val, max_val)) in enumerate(zip(parts, ranges)):
                if part == "*":
                    continue
                # 处理逗号分隔的值
                for val in part.split(","):
                    # 处理范围 (如 1-5)
                    if "-" in val:
                        start, end = val.split("-")
                        if not (min_val <= int(start) <= max_val and min_val <= int(end) <= max_val):
                            return False
                    elif val.isdigit():
                        if not (min_val <= int(val) <= max_val):
                            return False
            
            # 使用croniter做最终验证
            from croniter import croniter
            croniter(cron_expression)
            return True
        except Exception:
            return False


# 创建全局实例
scheduler_service = SchedulerService()
