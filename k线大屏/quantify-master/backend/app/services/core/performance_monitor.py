"""
系统监控服务 - 用于监控系统状态和性能
"""

import time
from typing import Dict, Any

import psutil
from loguru import logger


class SystemMonitor:
    """系统监控器"""

    def __init__(self):
        # 缓存最近一次 CPU 结果，避免首次采样返回 0.0
        self._last_cpu_percent: float = 0.0
        self._last_cpu_ts: float = 0.0

    def get_system_status(self) -> Dict[str, Any]:
        """获取系统状态（供路由调用）"""
        try:
            import os
            # psutil.cpu_percent 第一次采样可能返回 0.0，需要带 interval 或做预热
            now = time.time()
            if (now - self._last_cpu_ts) > 1.0:
                # 间隔采样 300ms，提升稳定性
                cpu_percent = psutil.cpu_percent(interval=0.3)
                # 如果仍为 0 且系统 load 较高，用 loadavg 估算一个下限
                try:
                    if cpu_percent == 0.0:
                        la1 = psutil.getloadavg()[0] if hasattr(psutil, "getloadavg") else 0.0
                        cores = os.cpu_count() or 1
                        est = min(100.0, max(0.0, la1 / cores * 100.0))
                        cpu_percent = round(est, 2) if est > 0 else 0.0
                except Exception:
                    pass
                self._last_cpu_percent = cpu_percent
                self._last_cpu_ts = now
            else:
                cpu_percent = self._last_cpu_percent
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            uptime = time.time() - psutil.boot_time()
            load_average = [0, 0, 0]
            try:
                if hasattr(psutil, "getloadavg"):
                    load_average = list(psutil.getloadavg())
            except Exception:
                pass

            return {
                "cpu": round(cpu_percent, 2),
                "memory": round(memory.percent, 2),
                "disk": round((disk.used / disk.total) * 100, 2),
                "network": 0,
                "uptime": int(uptime),
                "load_average": [round(x, 2) for x in load_average],
            }
        except Exception as e:
            logger.error(f"获取系统状态失败: {e}")
            raise

    def get_system_info(self) -> Dict[str, Any]:
        """获取系统基本信息（供路由调用）"""
        try:
            import platform
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            system_info = {
                "platform": platform.system(),
                "platform_version": platform.version(),
                "architecture": platform.machine(),
                "processor": platform.processor(),
                "hostname": platform.node(),
                "python_version": platform.python_version(),
            }

            memory_info = {
                "total": memory.total,
                "available": memory.available,
                "used": memory.used,
                "free": memory.free,
                "percent": memory.percent,
            }

            disk_info = {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": round((disk.used / disk.total) * 100, 2),
            }

            return {"system": system_info, "memory": memory_info, "disk": disk_info}
        except Exception as e:
            logger.error(f"获取系统信息失败: {e}")
            raise


# 全局系统监控器实例
system_monitor = SystemMonitor()
