"""
并发处理工具类
统一管理项目中的并发操作，提供标准化的并发处理接口
"""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Callable, TypeVar

from loguru import logger

from app.core.exceptions import CancellationException
from app.core.logging_context import get_trace_id, set_trace_id

T = TypeVar('T')
R = TypeVar('R')


class ConcurrentConfig:
    """并发配置类"""

    # 默认配置
    DEFAULT_MAX_WORKERS = 5
    DEFAULT_BATCH_SIZE = 500

    # 根据CPU核心数自动调整
    @classmethod
    def get_optimal_workers(cls, base_workers: int = None) -> int:
        """获取最优的线程池大小"""
        if base_workers is not None:
            return max(1, min(base_workers, os.cpu_count() or 4))

        # 根据CPU核心数自动计算
        cpu_count = os.cpu_count() or 4
        if cpu_count <= 2:
            return 2
        elif cpu_count <= 4:
            return 3
        elif cpu_count <= 8:
            return 5
        else:
            return min(8, cpu_count)

    @classmethod
    def get_batch_size(cls, total_items: int, target_batches: int = 12) -> int:
        """根据总数量计算合适的批次大小"""
        if total_items <= 0:
            return 1

        batch_size = max(1, total_items // target_batches)
        return min(batch_size, cls.DEFAULT_BATCH_SIZE)


class ConcurrentProcessor:
    """并发处理器"""

    def __init__(self, max_workers: int = None, batch_size: int = None):
        self.max_workers = max_workers or ConcurrentConfig.get_optimal_workers()
        self.batch_size = batch_size or ConcurrentConfig.DEFAULT_BATCH_SIZE

    def process_items(
            self,
            items: List[T],
            process_func: Callable[[T], R],
            error_handler: Callable[[T, Exception], R] = None,
            batch_size: int = None
    ) -> List[R]:
        """
        并发处理项目列表
        
        Args:
            items: 要处理的项目列表
            process_func: 处理单个项目的函数
            error_handler: 错误处理函数，接收 (item, exception) 参数
            batch_size: 批次大小，None时使用默认值
            
        Returns:
            处理结果列表
        """
        if not items:
            return []

        batch_size = batch_size or self.batch_size
        results = []

        # 分批处理
        total_batches = (len(items) + batch_size - 1) // batch_size

        for batch_idx in range(total_batches):
            start_idx = batch_idx * batch_size
            end_idx = min(start_idx + batch_size, len(items))
            batch_items = items[start_idx:end_idx]

            # 并发处理当前批次
            batch_results = self._process_batch(
                batch_items, process_func, error_handler
            )
            results.extend(batch_results)

        return results

    def _process_batch(
            self,
            items: List[T],
            process_func: Callable[[T], R],
            error_handler: Callable[[T, Exception], R] = None
    ) -> List[R]:
        """处理单个批次"""
        results = []
        
        # 捕获父线程的 trace_id
        parent_trace_id = get_trace_id()
        
        def wrapped_func(item):
            if parent_trace_id:
                set_trace_id(parent_trace_id)
            return process_func(item)

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # 提交所有任务
            future_to_item = {
                executor.submit(wrapped_func, item): item
                for item in items
            }

            # 收集结果
            try:
                for future in as_completed(future_to_item):
                    item = future_to_item[future]
                    try:
                        result = future.result()
                        results.append(result)
                    except CancellationException:
                        # 取消所有未完成的任务
                        for fut in future_to_item:
                            fut.cancel()
                        # 重新抛出取消异常，让上层处理
                        raise
                    except Exception as e:
                        if error_handler:
                            result = error_handler(item, e)
                            results.append(result)
                        else:
                            logger.warning(f"处理项目失败: {item}, 错误: {e}")
                            results.append(None)
            except CancellationException:
                # 取消所有未完成的任务
                for fut in future_to_item:
                    fut.cancel()
                # 重新抛出取消异常，让上层处理
                raise

        return results


class ConcurrentMapper:
    """并发映射器 - 用于批量数据转换"""

    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or ConcurrentConfig.get_optimal_workers()

    def map_items(
            self,
            items: List[T],
            map_func: Callable[[T], R],
            error_handler: Callable[[T, Exception], R] = None
    ) -> List[R]:
        """
        并发映射项目列表
        
        Args:
            items: 要映射的项目列表
            map_func: 映射函数
            error_handler: 错误处理函数
            
        Returns:
            映射结果列表
        """
        if not items:
            return []

        results = []
        
        # 捕获父线程的 trace_id
        parent_trace_id = get_trace_id()
        
        def wrapped_func(item):
            if parent_trace_id:
                set_trace_id(parent_trace_id)
            return map_func(item)

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # 提交所有任务
            future_to_item = {
                executor.submit(wrapped_func, item): item
                for item in items
            }

            # 收集结果
            for future in as_completed(future_to_item):
                item = future_to_item[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    if error_handler:
                        result = error_handler(item, e)
                        results.append(result)
                    else:
                        logger.warning(f"映射项目失败: {item}, 错误: {e}")
                        results.append(None)

        return results


# 全局实例
concurrent_processor = ConcurrentProcessor()
concurrent_mapper = ConcurrentMapper()


# 便捷函数
def process_concurrently(
        items: List[T],
        process_func: Callable[[T], R],
        max_workers: int = None,
        error_handler: Callable[[T, Exception], R] = None,
        progress_callback: Callable[[R, int, int], None] = None
) -> List[R]:
    """
    便捷的并发处理函数，支持实时进度回调
    
    Args:
        items: 要处理的项目列表
        process_func: 处理单个项目的函数
        max_workers: 最大并发数
        error_handler: 错误处理函数
        progress_callback: 进度回调函数，参数为 (result, completed, total)
    """
    if not items:
        return []
    
    results = []
    completed_count = 0
    total_count = len(items)
    
    # 捕获父线程的 trace_id，用于传递到子线程
    parent_trace_id = get_trace_id()
    
    def wrapped_process_func(item):
        """包装处理函数，在子线程中设置 trace_id"""
        if parent_trace_id:
            set_trace_id(parent_trace_id)
        return process_func(item)
    
    with ThreadPoolExecutor(max_workers=max_workers or ConcurrentConfig.get_optimal_workers()) as executor:
        # 提交所有任务（使用包装后的函数）
        future_to_item = {
            executor.submit(wrapped_process_func, item): item
            for item in items
        }
        
        # 实时收集结果
        try:
            for future in as_completed(future_to_item):
                item = future_to_item[future]
                try:
                    result = future.result()
                    results.append(result)
                    completed_count += 1
                    
                    # 调用进度回调
                    if progress_callback:
                        progress_callback(result, completed_count, total_count)
                        
                except CancellationException:
                    # 取消所有未完成的任务
                    for fut in future_to_item:
                        fut.cancel()
                    # 重新抛出取消异常，让上层处理
                    raise
                except Exception as e:
                    if error_handler:
                        result = error_handler(item, e)
                        results.append(result)
                        completed_count += 1
                        
                        # 调用进度回调
                        if progress_callback:
                            progress_callback(result, completed_count, total_count)
                    else:
                        logger.warning(f"处理项目失败: {item}, 错误: {e}")
                        results.append(None)
                        completed_count += 1
                        
        except CancellationException:
            # 取消所有未完成的任务
            for fut in future_to_item:
                fut.cancel()
            # 重新抛出取消异常，让上层处理
            raise
    
    return results


def map_concurrently(
        items: List[T],
        map_func: Callable[[T], R],
        max_workers: int = None,
        error_handler: Callable[[T, Exception], R] = None
) -> List[R]:
    """便捷的并发映射函数"""
    mapper = ConcurrentMapper(max_workers=max_workers)
    return mapper.map_items(items, map_func, error_handler)


def run_async(task: Callable[[], None], name: str = "async_task") -> None:
    """
    异步执行任务（不阻塞当前线程）
    
    用于替代 threading.Thread(daemon=True).start() 模式
    
    Args:
        task: 要执行的任务函数（无参数）
        name: 任务名称，用于线程命名
    """
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=name)
    executor.submit(task)
    executor.shutdown(wait=False)
