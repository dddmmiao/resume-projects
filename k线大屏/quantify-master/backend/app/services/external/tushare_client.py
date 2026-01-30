"""
Tushare 原生客户端封装：限流、并发与重试

职责：
- 维护 per-API 的速率策略与并发限制
- 统一提供 call_pro(api_name, **kwargs) 调用入口
"""

import threading
from typing import Any, Dict

from loguru import logger

from app.core.exceptions import TaskCancelledException


class TushareClient:
    def __init__(self, pro, rate_policies: Dict[str, Dict[str, Any]]):
        self.pro = pro
        self._rate_policies = rate_policies or {}
        self._rate_buckets = {}
        self._semaphores = {}
        self._lock = threading.Lock()

    def update_rate_policies(self, rate_policies: Dict[str, Dict[str, Any]]) -> None:
        """动态更新频次配置"""
        with self._lock:
            self._rate_policies = rate_policies or {}
            # 重置信号量以应用新的并发配置
            self._semaphores.clear()

    def _get_policy(self, api_name: str):
        p = self._rate_policies.get(api_name)
        if not p:
            p = self._rate_policies.get('default', {})
        return p

    def _acquire_concurrency(self, api_name: str):
        policy = self._get_policy(api_name)
        max_conc = int(policy.get('concurrency') or 0)
        if max_conc > 0:
            with self._lock:
                if api_name not in self._semaphores:
                    self._semaphores[api_name] = threading.Semaphore(max_conc)
                sem = self._semaphores[api_name]
            sem.acquire()

    def _release_concurrency(self, api_name: str):
        sem = self._semaphores.get(api_name)
        if sem:
            try:
                sem.release()
            except Exception:
                pass

    def _throttle(self, api_name: str):
        import time
        from collections import deque

        policy = self._get_policy(api_name)
        per_minute = policy.get('per_minute') or 0
        per_second = policy.get('per_second') or 0
        burst = policy.get('burst') or 0

        with self._lock:
            buckets = self._rate_buckets.get(api_name)
            if not buckets:
                buckets = {'per_minute': deque(), 'per_second': deque()}
                self._rate_buckets[api_name] = buckets

        now = time.time()

        if per_second > 0:
            sec_bucket = buckets['per_second']
            one_sec_ago = now - 1
            while sec_bucket and sec_bucket[0] < one_sec_ago:
                sec_bucket.popleft()
            if len(sec_bucket) >= per_second:
                sleep_s = max(sec_bucket[0] + 1 - now, 0)
                if sleep_s > 0:
                    time.sleep(sleep_s)
            sec_bucket.append(time.time())

        if per_minute > 0:
            min_bucket = buckets['per_minute']
            one_minute_ago = now - 60
            while min_bucket and min_bucket[0] < one_minute_ago:
                min_bucket.popleft()
            limit_with_burst = int(per_minute) + int(burst)
            if len(min_bucket) >= limit_with_burst:
                sleep_s = max(min_bucket[0] + 60 - now, 0)
                if sleep_s > 0:
                    time.sleep(sleep_s)
            min_bucket.append(time.time())

    def call_pro(self, api_name: str, **kwargs):
        import time
        import random
        # 可选 task_id，用于取消检查
        task_id = kwargs.pop('task_id', None)
        from app.services.core.redis_task_manager import redis_task_manager as _tm

        policy = self._get_policy(api_name)
        retries = int(policy.get('retries', 3))
        backoff = float(policy.get('backoff_start', 1.0))
        jitter = float(policy.get('jitter', 0.0))
        last_exc = None

        for _ in range(max(retries, 1)):
            try:
                if task_id and _tm and _tm.is_task_cancelled(task_id):
                    raise TaskCancelledException("任务已取消")
                self._throttle(api_name)
                self._acquire_concurrency(api_name)
                pro_func = getattr(self.pro, api_name)
                result = pro_func(**kwargs)
                if result is None:
                    return result
                if hasattr(result, 'empty') and result.empty:
                    return result
                return result
            except Exception as ex:
                last_exc = ex
                msg = str(ex)
                if any(k in msg for k in ["最多访问该接口", "频次", "rate"]):
                    sleep_time = backoff + (random.random() * jitter if jitter > 0 else 0)
                    time.sleep(sleep_time)
                    backoff = min(backoff * 2, 8)
                    continue
                raise
            finally:
                self._release_concurrency(api_name)

        if last_exc:
            logger.error(f"Tushare API调用失败: {api_name}, 参数: {kwargs}, 错误: {last_exc}")
            raise last_exc
        return None
