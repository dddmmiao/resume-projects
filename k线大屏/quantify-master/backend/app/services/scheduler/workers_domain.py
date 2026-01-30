"""
领域同步入口与后台实现拆分（概念、行业、股票基础、热度、交易日历）
逐步将实现从类中迁移到独立方法，保持行为一致。
"""

import asyncio
import threading
from typing import Any, Dict, List

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.services.core.redis_task_manager import TaskStatus
from app.services.core.task_message_formatter import task_message_formatter


def execute_concept_sync_async(service: Any, task_id: str):
    """概念同步任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager

    logger.info("开始执行概念板块同步任务")
    redis_task_manager.update_task_progress(task_id, 10, "开始同步概念板块数据...")

    # 调用领域层后台实现
    sync_enhanced_concepts_background(service, task_id=task_id)

    # 使用统一的文案格式化器
    result = getattr(service, "_concept_sync_result", {})
    concept_count = result.get("concept_count", 0)
    relation_count = result.get("relation_count", 0)
    
    completion_message = task_message_formatter.format_relation_sync(
        entity_name="概念",
        entity_count=concept_count,
        relation_count=relation_count
    )
    redis_task_manager.update_task_progress(task_id, 100, completion_message)

    # 概念同步完成后，失效概念相关缓存
    try:
        from app.services.core.cache_service import cache_service
        cache_service.invalidate_concept_cache()
        cache_service.invalidate_all_concept_codes()
    except Exception:
        pass

    logger.info("概念同步任务完成 (缓存已失效)")
    return getattr(service, "_concept_sync_result", {"success": True})


def execute_industry_sync_async(service: Any, task_id: str):
    """行业同步任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager

    logger.info("开始执行行业板块同步任务")
    redis_task_manager.update_task_progress(task_id, 10, "开始同步行业板块数据...")

    # 调用领域层后台实现
    sync_enhanced_industries_background(service, task_id=task_id)

    # 使用统一的文案格式化器
    result = getattr(service, "_industry_sync_result", {})
    industry_count = result.get("industry_count", 0)
    relation_count = result.get("relation_count", 0)
    
    completion_message = task_message_formatter.format_relation_sync(
        entity_name="行业",
        entity_count=industry_count,
        relation_count=relation_count
    )
    redis_task_manager.update_task_progress(task_id, 100, completion_message)

    # 行业同步完成后，失效行业相关缓存
    try:
        from app.services.core.cache_service import cache_service
        cache_service.invalidate_industry_cache()
        cache_service.invalidate_all_industry_codes()
    except Exception:
        pass

    logger.info("行业同步任务完成 (缓存已失效)")
    return getattr(service, "_industry_sync_result", {"success": True})


def execute_stock_sync_async(service: Any, task_id: str):
    """股票与可转债基础数据同步任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager

    logger.info("开始执行股票和可转债基础数据同步任务")
    redis_task_manager.update_task_progress(task_id, 10, "开始同步股票和可转债数据...")

    # 调用领域层后台实现（包含股票、可转债与赎回信息）
    sync_enhanced_stocks_and_bonds_background(service, task_id=task_id)

    # 使用统一的文案格式化器
    result = getattr(service, "_stocks_bonds_sync_result", {})
    stock_count = result.get("stock_count", 0)
    bond_count = result.get("bond_count", 0)
    call_count = result.get("call_count", 0)
    
    parts = {}
    if stock_count > 0:
        parts["股票"] = stock_count
    if bond_count > 0:
        parts["可转债"] = bond_count
    if call_count > 0:
        parts["赎回"] = call_count
    
    completion_message = task_message_formatter.format_multi_entity_sync(parts)
    redis_task_manager.update_task_progress(task_id, 100, completion_message)

    # 股票和可转债同步完成后，失效相关缓存
    try:
        from app.services.core.cache_service import cache_service
        cache_service.invalidate_stock_cache()
        cache_service.invalidate_all_stock_codes()
        cache_service.invalidate_bond_cache()
        cache_service.invalidate_all_bond_codes()
        cache_service.invalidate_bond_call_cache()
    except Exception:
        pass

    logger.info("股票和可转债同步任务完成 (缓存已失效)")
    return getattr(service, "_stocks_bonds_sync_result", {"success": True})


def execute_hot_sync_async(service: Any, task_id: str):
    """热度数据同步任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager

    logger.info("开始执行热度数据同步任务")
    redis_task_manager.update_task_progress(task_id, 10, "开始同步热度数据...")
    sync_enhanced_hot_data_background(service, task_id=task_id)

    # 使用统一的文案格式化器（自动解析热度统计信息）
    result = getattr(service, "_hot_data_sync_result", {})
    completion_message = task_message_formatter.format_generic_completion("热度数据同步", result)
    redis_task_manager.update_task_progress(task_id, 100, completion_message)
    
    # 热度数据同步完成后，失效相关缓存
    try:
        from app.services.core.cache_service import cache_service
        cache_service.invalidate_stock_cache()
        cache_service.invalidate_bond_cache()
        cache_service.invalidate_concept_cache()
        cache_service.invalidate_industry_cache()
        logger.info("热度数据缓存已失效")
    except Exception as e:
        logger.warning(f"热度数据缓存失效失败: {e}")
    
    logger.info("热度数据同步任务完成")
    return getattr(service, "_hot_data_sync_result", {"success": True})


def execute_trade_calendar_sync_async(service: Any, task_id: str):
    """交易日历同步任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager

    logger.info("开始执行交易日历同步任务")
    redis_task_manager.update_task_progress(task_id, 10, "开始同步交易日历数据...")
    sync_enhanced_trade_calendar_background(service, task_id=task_id)

    # 使用统一的文案格式化器
    result = getattr(service, "_trade_calendar_sync_result", {})
    total_synced = result.get("total_synced", 0)
    start_date = result.get("start_date")
    end_date = result.get("end_date")
    
    completion_message = task_message_formatter.format_calendar_sync(
        total=total_synced,
        start_date=start_date,
        end_date=end_date
    )
    redis_task_manager.update_task_progress(task_id, 100, completion_message)
    logger.info("交易日历同步任务完成")
    return getattr(service, "_trade_calendar_sync_result", {"success": True})


def sync_enhanced_concepts_background(service: Any, task_id: str = None) -> None:
    from app.services.core.redis_task_manager import redis_task_manager
    from app.core.exceptions import CancellationException

    try:
        from app.services.data.concept_service import ConceptService
        logger.info("开始同步概念板块数据")

        redis_task_manager.update_task_progress(task_id, 30, "正在同步概念数据...")
        concept_service = ConceptService()
        enhanced_concepts_result = concept_service.sync_enhanced_concepts(task_id=task_id)
        enhanced_concepts = enhanced_concepts_result.get("rows") or []
        concept_count = int(enhanced_concepts_result.get("total", len(enhanced_concepts)))
        if concept_count == 0:
            logger.warning("未获取到概念数据")
            service._concept_sync_result = {
                "inserted_count": 0,
                "concept_count": 0,
                "relation_count": 0,
            }
            return

        redis_task_manager.update_task_progress(task_id, 70, "正在同步概念与股票关系...")
        relation_count = 0

        if enhanced_concepts:
            optimal_workers = service._calculate_task_concurrency("concept_sync", len(enhanced_concepts))
            batch_size = service.CONCURRENCY_CONFIG["concept_sync"]["batch_size"]
            logger.info(
                f"概念关系同步使用 {optimal_workers} 个并发线程，处理 {len(enhanced_concepts)} 个概念（批大小 {batch_size}）")
            relation_count = concept_service.sync_concept_stock_relations(
                enhanced_concepts,
                task_id=task_id,
                optimal_workers=optimal_workers,
                batch_size=batch_size,
            )

        total_count = concept_count + relation_count

        result_summary: List[str] = []
        if concept_count > 0:
            result_summary.append(f"概念{concept_count}个")
        if relation_count > 0:
            result_summary.append(f"关系{relation_count}条")
        summary_text = (
            f"概念板块同步完成 - 成功更新: {', '.join(result_summary)}" if result_summary else "概念板块同步完成 - 无数据更新"
        )

        service._concept_sync_result = {
            "total_records": total_count,
            "concept_count": concept_count,
            "relation_count": relation_count,
        }
        logger.info(f"概念板块同步完成: {summary_text}")

    except CancellationException:
        logger.info("概念板块同步任务已取消")
        raise
    except Exception as e:

        logger.error(f"概念板块同步失败: {e}")
        if hasattr(service, "_concept_sync_result"):
            service._concept_sync_result = {
                "total_records": 0,
                "error": str(e),
            }
        raise


def sync_enhanced_industries_background(service: Any, task_id: str = None) -> None:
    from app.services.core.redis_task_manager import redis_task_manager
    from app.core.exceptions import CancellationException

    try:
        from app.services.data.industry_service import IndustryService

        logger.info("开始同步行业板块数据")

        redis_task_manager.update_task_progress(task_id, 30, "正在同步行业数据...")
        industry_service = IndustryService()
        enhanced_industries_result = industry_service.sync_enhanced_industries(task_id=task_id)
        enhanced_industries = enhanced_industries_result.get("rows") or []
        industry_count = int(enhanced_industries_result.get("total", len(enhanced_industries)))
        if industry_count == 0:
            logger.warning("未获取到行业数据")
            service._industry_sync_result = {
                "inserted_count": 0,
                "industry_count": 0,
                "relation_count": 0,
            }
            return

        redis_task_manager.update_task_progress(task_id, 70, "正在同步行业与股票关系...")
        relation_count = 0
        if enhanced_industries:
            optimal_workers = service._calculate_task_concurrency("industry_sync", len(enhanced_industries))
            batch_size = service.CONCURRENCY_CONFIG["industry_sync"]["batch_size"]
            logger.info(
                f"行业关系同步使用 {optimal_workers} 个并发线程，处理 {len(enhanced_industries)} 个行业（批大小 {batch_size}）")
            relation_count = industry_service.sync_industry_stock_relations(
                enhanced_industries,
                task_id=task_id,
                optimal_workers=optimal_workers,
                batch_size=batch_size,
            )

        total_count = industry_count + relation_count

        result_summary: List[str] = []
        if industry_count > 0:
            result_summary.append(f"行业{industry_count}个")
        if relation_count > 0:
            result_summary.append(f"关系{relation_count}条")
        summary_text = (
            f"行业板块同步完成 - 成功更新: {', '.join(result_summary)}" if result_summary else "行业板块同步完成 - 无数据更新"
        )

        service._industry_sync_result = {
            "total_records": total_count,
            "industry_count": industry_count,
            "relation_count": relation_count,
        }
        logger.info(f"行业板块同步完成: {summary_text}")

    except CancellationException:
        logger.info("行业板块同步任务已取消")
        raise
    except Exception as e:

        logger.error(f"行业板块同步失败: {e}")
        if hasattr(service, "_industry_sync_result"):
            service._industry_sync_result = {
                "total_records": 0,
                "error": str(e),
            }
        raise


# 股票/可转债同步
def sync_enhanced_stocks_and_bonds_background(service: Any, task_id: str = None) -> None:
    from app.services.core.redis_task_manager import redis_task_manager
    from app.core.exceptions import CancellationException

    try:
        from app.services.data.stock_service import stock_service
        from app.services.data.convertible_bond_service import convertible_bond_service

        logger.info("开始同步股票、可转债与赎回信息数据")

        redis_task_manager.update_task_progress(task_id, 50, "正在同步股票和可转债数据...")
        # 并行执行三类子任务
        from app.services.data.convertible_bond_call_service import convertible_bond_call_service
        from app.utils.concurrent_utils import process_concurrently

        def _sync_stock():
            r = stock_service.sync_stock_basic_info(task_id=task_id)
            return (EntityTypes.STOCK, r)

        def _sync_bond():
            r = convertible_bond_service.sync_convertible_bonds_info(task_id=task_id)
            return (EntityTypes.BOND, r)

        def _sync_call():
            r = convertible_bond_call_service.sync_convertible_bond_call_info(ts_code=None, task_id=task_id)
            return ("call", r)

        tasks = [_sync_stock, _sync_bond, _sync_call]
        results = process_concurrently(
            tasks,
            lambda task: task(),
            max_workers=3,
            error_handler=lambda task, e: (task.__name__, {"error": str(e)})
        )

        results_map = {k: r for k, r in results}

        stock_result = results_map.get(EntityTypes.STOCK, {"total_count": 0})
        bond_result = results_map.get(EntityTypes.BOND, {"total_count": 0})
        call_result = results_map.get("call", {"total_count": 0})

        stock_count = stock_result.get("total_count", 0)
        bond_count = bond_result.get("total_count", 0)
        call_count = call_result.get("total_count", 0)

        total_count = stock_count + bond_count + call_count

        result_summary: List[str] = []
        if stock_count > 0:
            result_summary.append(f"股票{stock_count}条")
        if bond_count > 0:
            result_summary.append(f"可转债{bond_count}条")
        if call_count > 0:
            result_summary.append(f"赎回{call_count}条")
        summary_text = (
            f"股票/可转债数据同步完成 - 成功更新: {', '.join(result_summary)}" if result_summary else "股票/可转债数据同步完成 - 无数据更新"
        )

        service._stocks_bonds_sync_result = {
            "success_count": 3,
            "total_records": total_count,
            "stock_count": stock_count,
            "bond_count": bond_count,
            "call_count": call_count,
        }
        logger.info(f"股票/可转债数据同步完成: {summary_text}")

    except CancellationException:
        logger.info("股票/可转债同步任务已取消")
        raise
    except Exception as e:

        logger.error(f"股票/可转债数据同步失败: {e}")
        if hasattr(service, "_stocks_bonds_sync_result"):
            service._stocks_bonds_sync_result = {
                "success_count": 0,
                "total_records": 0,
                "error": str(e),
            }
        raise


# 清理任务
def _create_cleanup_worker(data_type: str):
    def worker() -> Dict[str, Any]:

        try:
            if data_type == EntityTypes.STOCK:
                from app.services.data.stock_service import stock_service
                count = stock_service.cleanup_expired_data()
                return {"type": data_type, "count": count, "success": True}
            elif data_type == EntityTypes.BOND:
                from app.services.data.convertible_bond_service import convertible_bond_service
                count = convertible_bond_service.cleanup_expired_data()
                return {"type": data_type, "count": count, "success": True}
            elif data_type == EntityTypes.CONCEPT:
                from app.services.data.concept_service import concept_service
                count = concept_service.cleanup_expired_data()
                return {"type": data_type, "count": count, "success": True}
            elif data_type == EntityTypes.INDUSTRY:
                from app.services.data.industry_service import industry_service
                count = industry_service.cleanup_expired_data()
                return {"type": data_type, "count": count, "success": True}
            else:
                return {"type": data_type, "count": 0, "success": False, "error": f"未知数据类型: {data_type}"}
        except Exception as e:
            logger.error(f"清理{data_type}数据失败: {e}")
            return {"type": data_type, "count": 0, "success": False, "error": str(e)}

    return worker


def execute_cleanup_expired_data_async(task_id: str) -> Dict[str, Any]:
    from app.services.core.redis_task_manager import redis_task_manager
    from app.core.exceptions import CancellationException

    try:
        logger.info("开始执行清理过期数据任务")
        redis_task_manager.update_task_progress(task_id, 10, "开始清理过期数据...")
        workers = [
            _create_cleanup_worker(EntityTypes.STOCK),
            _create_cleanup_worker(EntityTypes.BOND),
            _create_cleanup_worker(EntityTypes.CONCEPT),
            _create_cleanup_worker(EntityTypes.INDUSTRY),
        ]

        total_count = 0
        details: List[Dict[str, Any]] = []
        total = len(workers)
        for idx, worker in enumerate(workers, start=1):
            # 检查取消状态
            if task_id and redis_task_manager.is_task_cancelled(task_id):
                logger.info("清理过期数据任务已被取消")
                raise CancellationException("清理过期数据任务已被取消")

            result = worker()
            if result.get("success"):
                total_count += int(result.get("count", 0))
            details.append(result)
            percent = 10 + int(idx / total * 85)
            redis_task_manager.update_task_progress(task_id, percent, f"正在清理 {idx}/{total}：{result.get('type')}")

        cleanup_result = {"success": True, "total_cleaned": total_count, "details": details}
        
        # 构建详细统计信息
        from app.constants.entity_types import EntityTypes
        detail_stats = {}
        for detail in details:
            if detail.get("success") and detail.get("count", 0) > 0:
                entity_type = detail.get("type", "")
                chinese_name = EntityTypes.get_chinese_name(entity_type)
                detail_stats[chinese_name] = detail.get("count", 0)
        
        # 使用统一的文案格式化器
        completion_message = task_message_formatter.format_deletion(
            total=total_count,
            details=detail_stats if detail_stats else None
        )
        redis_task_manager.update_task_progress(task_id, 100, completion_message)
        logger.info(f"数据清理任务完成: {cleanup_result}")
        return cleanup_result
    except CancellationException:
        logger.info("清理过期数据任务已被取消")
        return {"success": True, "cancelled": True}
    except Exception as e:
        logger.error(f"数据清理任务执行失败: {e}")
        return {"success": False, "error": str(e)}


# 热度数据同步
def sync_enhanced_hot_data_background(service: Any, task_id: str = None) -> None:
    from app.core.exceptions import CancellationException
    from app.services.core.redis_task_manager import redis_task_manager

    try:
        from app.services.data.hot_sync_service import hot_sync_service
        from datetime import datetime

        logger.info("开始并发同步热度数据")

        redis_task_manager.update_task_progress(task_id, 30, "正在同步热度数据...")

        # 使用当天日期（YYYYMMDD格式）
        trade_date = datetime.now().strftime("%Y%m%d")
        logger.info(f"同步日期（当天）: {trade_date}")
        optimal_workers = service._calculate_task_concurrency("hot_sync")
        logger.info(f"热度数据同步使用 {optimal_workers} 个并发线程")

        def sync_stock_hot():
            try:
                result = hot_sync_service.sync_stock_hot_data(trade_date)
                return {"type": EntityTypes.STOCK, "result": result, "success": True}
            except CancellationException:
                raise  # 重新抛出取消异常，让上层处理
            except Exception as e:
                logger.error(f"股票热度数据同步失败: {e}")
                return {"type": EntityTypes.STOCK, "result": {"success": 0}, "success": False, "error": str(e)}

        def sync_bond_hot():
            try:
                result = hot_sync_service.sync_convertible_bond_hot_data(trade_date)
                return {"type": EntityTypes.BOND, "result": result, "success": True}
            except CancellationException:
                raise  # 重新抛出取消异常，让上层处理
            except Exception as e:
                logger.error(f"可转债热度数据同步失败: {e}")
                return {"type": EntityTypes.BOND, "result": {"success": 0}, "success": False, "error": str(e)}

        def sync_concept_hot():
            try:
                result = hot_sync_service.sync_concept_hot_data(trade_date)
                return {"type": EntityTypes.CONCEPT, "result": result, "success": True}
            except CancellationException:
                raise  # 重新抛出取消异常，让上层处理
            except Exception as e:
                logger.error(f"概念热度数据同步失败: {e}")
                return {"type": EntityTypes.CONCEPT, "result": {"success": 0}, "success": False, "error": str(e)}

        def sync_industry_hot():
            try:
                result = hot_sync_service.sync_industry_hot_data(trade_date)
                return {"type": EntityTypes.INDUSTRY, "result": result, "success": True}
            except CancellationException:
                raise  # 重新抛出取消异常，让上层处理
            except Exception as e:
                logger.error(f"行业热度数据同步失败: {e}")
                return {"type": EntityTypes.INDUSTRY, "result": {"success": 0}, "success": False, "error": str(e)}

        hot_sync_tasks = [sync_stock_hot, sync_bond_hot, sync_concept_hot, sync_industry_hot]
        from app.utils.concurrent_utils import process_concurrently

        results_list = process_concurrently(
            hot_sync_tasks,
            lambda task: task(),
            max_workers=optimal_workers,
            error_handler=lambda task, e: {"type": task.__name__, "success": False, "error": str(e)}
        )

        results: Dict[str, Any] = {}
        for result in results_list:
            results[result["type"]] = result
            if result.get("success", False):
                logger.info(f"{result['type']}热度数据同步完成")

        stock_hot_count = results.get(EntityTypes.STOCK, {}).get("result", {}).get("success", 0)
        bond_hot_count = results.get(EntityTypes.BOND, {}).get("result", {}).get("success", 0)
        concept_hot_count = results.get(EntityTypes.CONCEPT, {}).get("result", {}).get("success", 0)
        industry_hot_count = results.get(EntityTypes.INDUSTRY, {}).get("result", {}).get("success", 0)
        total_count = stock_hot_count + bond_hot_count + concept_hot_count + industry_hot_count

        result_summary: List[str] = []
        if stock_hot_count > 0:
            result_summary.append(f"股票热度{stock_hot_count}条")
        if bond_hot_count > 0:
            result_summary.append(f"可转债热度{bond_hot_count}条")
        if concept_hot_count > 0:
            result_summary.append(f"概念热度{concept_hot_count}条")
        if industry_hot_count > 0:
            result_summary.append(f"行业热度{industry_hot_count}条")
        summary_text = (
            f"热度数据同步完成 - 成功更新: {', '.join(result_summary)}" if result_summary else "热度数据同步完成 - 无数据更新"
        )

        service._hot_data_sync_result = {
            "success_count": 4,
            "inserted_count": total_count,
            "stock_hot_count": stock_hot_count,
            "bond_hot_count": bond_hot_count,
            "concept_hot_count": concept_hot_count,
            "industry_hot_count": industry_hot_count
        }
        logger.info(f"热度数据同步完成: {summary_text}")
    except CancellationException:
        logger.info("热度数据同步任务已取消")
        raise
    except Exception as e:
        logger.error(f"热度数据同步失败: {e}")
        if hasattr(service, "_hot_data_sync_result"):
            service._hot_data_sync_result = {
                "success_count": 0,
                "inserted_count": 0,
                "error": str(e)
            }
        raise


def sync_enhanced_trade_calendar_background(service: Any, task_id: str = None) -> None:
    from app.core.exceptions import CancellationException
    from app.services.core.redis_task_manager import redis_task_manager
    from datetime import datetime, timedelta

    try:
        from app.services.data.trade_calendar_service import trade_calendar_service

        logger.info("开始同步交易日历数据")

        redis_task_manager.update_task_progress(task_id, 50, "正在同步交易日历数据...")

        # 使用 sync_trade_calendar 方法直接同步所有交易所
        sync_result = trade_calendar_service.sync_trade_calendar(task_id=task_id)
        if sync_result.get("cancelled", False):
            logger.info("交易日历同步已被取消")
            service._trade_calendar_sync_result = {"success": True, "cancelled": True}
            return

        total_synced = sync_result.get("total_count", 0)
        total_errors = sync_result.get("total_errors", 0)

        result_message = f"交易日历同步完成，共同步{total_synced}条记录"

        service._trade_calendar_sync_result = {
            "total_synced": total_synced,
            "total_errors": total_errors,
            "start_date": datetime.now().strftime("%Y%m%d"),
            "end_date": (datetime.now() + timedelta(days=365)).strftime("%Y%m%d"),
            "exchanges": ["SSE", "SZSE"],
            "success": True
        }
        logger.info(f"交易日历同步完成: {result_message}")
    except CancellationException:
        logger.info("交易日历同步任务已取消")
        raise
    except Exception as e:
        logger.error(f"交易日历同步失败: {e}")
        if hasattr(service, "_trade_calendar_sync_result"):
            service._trade_calendar_sync_result = {
                "total_synced": 0,
                "total_errors": 1,
                "exchanges": [],
                "success": False,
                "error": str(e),
            }
        raise


def execute_stock_auction_sync_async(task_id: str, options: Dict[str, Any] = None):
    """股票开盘竞价数据同步任务执行入口
    
    参考K线同步的逻辑，支持通过 options 传递 force_sync、ts_codes、all_selected 参数
    
    Args:
        task_id: 任务ID
        options: 任务选项，可包含：
            - force_sync: 是否强制同步（全量）
            - ts_codes: 股票代码列表（可选），如果为None或all_selected为True则同步所有股票
            - all_selected: 是否全选（如果为True，则忽略ts_codes，同步所有股票）
    """
    from app.services.core.redis_task_manager import redis_task_manager
    from app.services.data.stock_kline_service import stock_kline_service
    from app.core.exceptions import CancellationException
    
    try:
        # 从 options 中获取参数（不再在此处根据交易日跳过，交易日逻辑交由调度层处理）
        opts = options or {}
        force_sync = bool(opts.get("force_sync", False))
        all_selected = bool(opts.get("all_selected", False))
        ts_codes = opts.get("ts_codes")
        
        # 如果全选或未指定codes，则同步所有股票
        if all_selected or ts_codes is None:
            ts_codes = None  # sync_auction_data 会处理 None 的情况
            codes_display = "全部股票"
        else:
            codes_display = f"{len(ts_codes)} 只股票"
        
        sync_mode = "全量" if force_sync else "增量"
        logger.info(f"开始执行股票开盘竞价数据同步任务（{sync_mode}同步，{codes_display}）")

        # 任务是否在非交易日执行由调度层控制；此处不再根据交易日跳过
        redis_task_manager.update_task_progress(task_id, 10, f"开始同步股票开盘竞价数据", TaskStatus.RUNNING)
        
        # 同步开盘竞价数据
        result = stock_kline_service.sync_auction_data(
            force_sync=force_sync,
            task_id=task_id,
            ts_codes=ts_codes
        )
        
        # 处理副作用：缓存失效（开盘竞价数据影响所有股票的日线）
        inserted_count = result.get("inserted_count", 0)
        updated_count = result.get("updated_count", 0)
        result_ts_codes = result.get("ts_codes", [])
        
        if (inserted_count > 0 or updated_count > 0) and result_ts_codes:
            try:
                stock_kline_service._invalidate_cache("daily", result_ts_codes)
                logger.info(f"已失效 {len(result_ts_codes)} 只股票的日线缓存")
            except Exception as e:
                logger.warning(f"缓存处理失败，但不影响同步结果: {e}")
        
        # 使用统一的文案格式化器
        completion_message = task_message_formatter.format_auction_sync(
            inserted=inserted_count,
            updated=updated_count
        )
        logger.info(f"股票开盘竞价数据同步任务完成: {completion_message}")

        if not force_sync:
            try:
                from datetime import datetime
                from app.services.data.stock_service import stock_service
                from app.services.external.ths.favorites.favorite_service import ths_favorite_service

                today_str = datetime.now().strftime("%Y%m%d")
                top_result = stock_service.filter_stocks(
                    limit=30,
                    sort_by="auction_vol",
                    sort_period="daily",
                    sort_order="desc",
                    trade_date=today_str,
                )
                stocks = top_result.get("stocks") or []
                top_codes = [s.get("ts_code") for s in stocks if s.get("ts_code")]
                if top_codes:
                    ths_favorite_service.reset_group_with_date_suffix_for_all_accounts("竞价排行", top_codes, today_str[4:8], rebuild=True, reverse_add=True)
            except Exception as e:
                logger.warning(f"更新同花顺自选分组 '竞价排行' 失败: {e}")

        # 更新任务进度为完成状态
        try:
            redis_task_manager.update_task_progress(
                task_id,
                100,
                completion_message,
                TaskStatus.COMPLETED
            )
        except Exception as e:
            logger.warning(f"更新股票开盘竞价数据同步任务进度为完成状态失败: {e}")

        return {
            "success": True,
            "inserted_count": int(inserted_count) if inserted_count is not None else 0,
            "updated_count": int(updated_count) if updated_count is not None else 0
        }
        
    except CancellationException:
        redis_task_manager.update_task_progress(task_id, 0, "股票开盘竞价数据同步任务已取消", TaskStatus.CANCELLED)
        logger.info("股票开盘竞价数据同步任务已取消")
        return {"success": True, "cancelled": True}
        
    except Exception as e:
        error_message = f"同步股票开盘竞价数据失败: {str(e)}"
        redis_task_manager.update_task_progress(task_id, 0, error_message, TaskStatus.FAILED, error=error_message)
        logger.error(error_message)
        raise


def execute_auto_relogin_check_async(task_id: str):
    """自动补登录检查任务执行入口"""
    from app.services.core.redis_task_manager import redis_task_manager
    from app.services.scheduler.auto_relogin import check_user_login_state
    
    logger.info("开始执行自动补登录检查任务")
    redis_task_manager.update_task_progress(task_id, 10, "检查用户登录态...")
    
    try:
        check_user_login_state()
        
        redis_task_manager.update_task_progress(task_id, 100, "自动补登录检查完成")
        logger.info("自动补登录检查任务完成")
    except Exception as e:
        logger.error(f"自动补登录检查任务失败: {e}")
        redis_task_manager.update_task_progress(
            task_id, 0, f"检查失败: {str(e)}", TaskStatus.FAILED
        )
        raise


def _sort_codes_before_push(
    codes: List[str], 
    entity_type: str, 
    trade_date: str = None,
    sort_by: str = None,
    sort_order: str = "asc"
) -> List[str]:
    """推送前对代码列表进行排序
    
    使用 get_filtered_ts_codes 方法获取排序后的代码列表，符合三层架构。
    支持配置化的排序字段和排序方向。
    
    Args:
        codes: 代码列表
        entity_type: 实体类型 (stock, convertible_bond 支持排序)
        trade_date: 交易日期 (YYYYMMDD格式)
        sort_by: 排序字段（可选），如果不提供则使用默认值
                 - 股票默认: auction_vol
                 - 可转债默认: vol
                 - 支持: max_concept_heat, max_industry_heat 等
        sort_order: 排序方向，asc（升序）或 desc（降序），默认 asc
        
    Returns:
        排序后的代码列表
    """
    if not codes:
        return codes
    
    # 行业/概念保持原顺序（可在同花顺端排序）
    if entity_type not in (EntityTypes.STOCK, EntityTypes.BOND):
        logger.debug(f"实体类型 {entity_type} 不支持成交量排序，保持原顺序")
        return codes
    
    # 确定排序字段（如果未配置，使用默认值）
    if not sort_by:
        sort_by = "auction_vol" if entity_type == EntityTypes.STOCK else "vol"
    
    try:
        if entity_type == EntityTypes.STOCK:
            from app.services.data.stock_service import stock_service
            sorted_codes = stock_service.get_filtered_ts_codes(
                ts_codes_filter=codes,
                sort_by=sort_by,
                sort_order=sort_order,
                trade_date=trade_date,
            )
        else:  # EntityTypes.BOND (可转债)
            from app.services.data.convertible_bond_service import convertible_bond_service
            sorted_codes = convertible_bond_service.get_filtered_ts_codes(
                ts_codes_filter=codes,
                sort_by=sort_by,
                sort_order=sort_order,
                trade_date=trade_date,
            )
        
        # 如果排序结果为空或不完整，保留原始代码中未在排序结果中的代码
        if sorted_codes:
            # 保留未在排序结果中的代码（可能没有排序数据）
            remaining = [c for c in codes if c not in sorted_codes]
            sorted_codes.extend(remaining)
            logger.info(f"{sort_by}排序完成（{sort_order}）: {len(sorted_codes) - len(remaining)}/{len(codes)} 个代码有数据")
            return sorted_codes
        else:
            logger.warning(f"{sort_by}排序返回空结果，保持原顺序")
            return codes
            
    except Exception as e:
        logger.warning(f"{sort_by}排序失败，保持原顺序: {e}")
        return codes


def execute_strategy_push_to_ths_async(task_id: str, options: Dict[str, Any] = None) -> None:
    """执行策略计算并推送结果到同花顺自选分组
    
    从 system_config 读取策略配置，支持多策略多配置，每个配置独立推送到指定分组
    """
    from app.services.core.redis_task_manager import redis_task_manager, TaskStatus
    from app.services.management.strategy_registry import strategy_registry
    from app.services.external.ths.favorites.favorite_service import ths_favorite_service
    from app.services.data.trade_calendar_service import trade_calendar_service
    from app.services.core.system_config_service import system_config_service

    try:
        logger.info(f"开始执行策略推送任务 | task_id: {task_id}")
        redis_task_manager.update_task_progress(task_id, 5, "读取策略配置...")

        # 从 system_config 读取策略推送配置
        config = system_config_service.get_json("strategy_push_config")
        if not config:
            logger.warning("未找到策略推送配置，跳过执行")
            redis_task_manager.update_task_progress(
                task_id, 100, "未配置策略推送参数，跳过执行", TaskStatus.COMPLETED
            )
            return

        # 检查是否启用
        if not config.get("enabled", False):
            logger.info("策略推送已禁用，跳过执行")
            redis_task_manager.update_task_progress(
                task_id, 100, "策略推送已禁用", TaskStatus.COMPLETED
            )
            return

        configs = config.get("configs", [])
        max_total = config.get("max_total_configs", 10)
        base_date = config.get("base_date", "")  # 自定义基准日期
        use_dynamic_hot_filter = config.get("use_dynamic_hot_filter", False)  # 动态热门筛选
        
        # 过滤掉禁用的配置
        configs = [c for c in configs if c.get("enabled", True)]
        
        if not configs:
            logger.info("策略推送配置为空，跳过执行")
            redis_task_manager.update_task_progress(
                task_id, 100, "无策略配置", TaskStatus.COMPLETED
            )
            return

        # 限制配置数量
        if len(configs) > max_total:
            logger.warning(f"策略配置数量 {len(configs)} 超过限制 {max_total}，只执行前 {max_total} 个")
            configs = configs[:max_total]

        # 确定基准日期：优先使用配置的base_date，否则使用最新交易日
        if base_date:
            trade_date_str = base_date.replace("-", "")
            logger.info(f"使用配置的基准日期: {trade_date_str}")
        else:
            latest_trade_date = trade_calendar_service.get_latest_trading_day()
            if not latest_trade_date:
                logger.error("无法获取最新交易日")
                redis_task_manager.update_task_progress(
                    task_id, 0, "无法获取最新交易日", TaskStatus.FAILED
                )
                return
            trade_date_str = latest_trade_date.replace("-", "")
        logger.info(f"策略推送: 共 {len(configs)} 个配置，交易日={trade_date_str}")

        import uuid
        import threading
        from app.utils.concurrent_utils import process_concurrently, ConcurrentConfig
        from app.services.management.strategy_history_service import strategy_history_service

        # 进度跟踪
        progress_lock = threading.Lock()
        completed_count = [0]
        results = []  # [(success, codes_count, strategy_name, ths_group_name)]

        def execute_single_config(item):
            """执行单个策略配置"""
            strategy_name = item.get("strategy_name")
            ths_group_name = item.get("ths_group_name", "策略推送")
            entity_type = item.get("entity_type", "stock")
            period = item.get("period", "daily")
            params_json = item.get("params_json", {})

            if not strategy_name:
                logger.warning(f"配置缺少策略名称，跳过")
                return (False, 0, strategy_name, ths_group_name, "缺少策略名称")

            # 获取策略label
            strategy_info = strategy_registry.get_strategy_info(strategy_name) or {}
            strategy_label = strategy_info.get("label", strategy_name)

            # 构建策略上下文
            context = {
                "entity_type": entity_type,
                "period": period,
                **params_json,
                "trade_date": trade_date_str,
            }
            
            # 动态热门筛选：如果启用，动态获取热门概念/行业
            if use_dynamic_hot_filter:
                try:
                    from app.services.data.concept_service import concept_service
                    from app.services.data.industry_service import industry_service
                    
                    hot_concepts = concept_service.get_hot_concept_codes()
                    hot_industries = industry_service.get_hot_industry_codes()
                    
                    if hot_concepts:
                        context["filter_concepts"] = hot_concepts
                        logger.info(f"动态热门概念: {len(hot_concepts)} 个")
                    if hot_industries:
                        context["filter_industries"] = hot_industries
                        logger.info(f"动态热门行业: {len(hot_industries)} 个")
                except Exception as e:
                    logger.warning(f"获取动态热门数据失败: {e}")

            logger.info(f"执行策略 {strategy_name}: entity_type={context.get('entity_type')}, ths_group={ths_group_name}")

            # 执行策略计算
            try:
                sub_task_id = str(uuid.uuid4())
                # 初始化子任务进度（必须先初始化，否则execute_strategy_async无法更新进度和结果）
                redis_task_manager.redis_client.hset(
                    f"task_progress:{sub_task_id}",
                    mapping={"task_id": sub_task_id, "name": f"策略:{strategy_name}", "progress": "0", "status": "running"}
                )
                strategy_registry.execute_strategy_async(
                    task_id=sub_task_id,
                    strategy_name=strategy_name,
                    context=context,
                    user_id="system_push"
                )
                sub_result = redis_task_manager.get_task_progress(sub_task_id)
                selected_codes = sub_result.get("result", {}).get("selected_codes", []) if sub_result else []
                redis_task_manager.redis_client.delete(f"task_progress:{sub_task_id}")
            except Exception as e:
                logger.error(f"策略 {strategy_name} 计算失败: {e}")
                return (False, 0, strategy_name, ths_group_name, str(e))

            if not selected_codes:
                logger.info(f"策略 {strategy_name} 未筛选出结果")
                # 无结果也保存执行历史
                try:
                    from app.utils.key_generator import generate_context_hash
                    context_hash = generate_context_hash()
                    strategy_history_service.create_history(
                        user_id="system_push",
                        strategy_name=strategy_name,
                        strategy_label=strategy_label,
                        entity_type=context.get("entity_type", "stock"),
                        period=context.get("period", "daily"),
                        base_date=trade_date_str,
                        context={**context, "ths_group_name": ths_group_name},
                        context_hash=context_hash,
                        selected_codes=[],
                        status="success"
                    )
                except Exception as he:
                    logger.warning(f"保存推送历史失败: {he}")
                return (True, 0, strategy_name, ths_group_name, "无结果")

            # 推送前排序（使用配置的排序字段和方向）
            try:
                config_sort_by = item.get("sort_by")  # 可选，不配置则使用默认值
                config_sort_order = item.get("sort_order", "asc")
                selected_codes = _sort_codes_before_push(
                    selected_codes, entity_type, trade_date_str,
                    sort_by=config_sort_by,
                    sort_order=config_sort_order
                )
                logger.info(f"策略 {strategy_name} 结果已排序")
            except Exception as sort_e:
                logger.warning(f"排序失败，保持原顺序: {sort_e}")

            # 推送到同花顺分组（带日期后缀）
            try:
                date_suffix = trade_date_str[4:8]  # YYYYMMDD -> MMDD
                push_success = ths_favorite_service.reset_group_with_date_suffix_for_all_accounts(
                    ths_group_name, selected_codes, date_suffix, rebuild=True, reverse_add=True
                )
                if not push_success:
                    logger.warning(f"推送到分组 '{ths_group_name}' 失败")
                    return (False, len(selected_codes), strategy_name, ths_group_name, "推送失败")
                logger.info(f"成功推送 {len(selected_codes)} 个标的到分组 '{ths_group_name}'")
                # 保存执行历史
                try:
                    from app.utils.key_generator import generate_context_hash
                    context_hash = generate_context_hash()
                    strategy_history_service.create_history(
                        user_id="system_push",
                        strategy_name=strategy_name,
                        strategy_label=strategy_label,
                        entity_type=context.get("entity_type", "stock"),
                        period=context.get("period", "daily"),
                        base_date=trade_date_str,
                        context={**context, "ths_group_name": ths_group_name},
                        context_hash=context_hash,
                        selected_codes=selected_codes,
                        status="success"
                    )
                except Exception as he:
                    logger.warning(f"保存推送历史失败: {he}")
                return (True, len(selected_codes), strategy_name, ths_group_name, None)
            except Exception as e:
                logger.error(f"推送到同花顺分组 '{ths_group_name}' 失败: {e}")
                # 保存失败历史
                try:
                    from app.utils.key_generator import generate_context_hash
                    context_hash = generate_context_hash()
                    strategy_history_service.create_history(
                        user_id="system_push",
                        strategy_name=strategy_name,
                        strategy_label=strategy_label,
                        entity_type=context.get("entity_type", "stock"),
                        period=context.get("period", "daily"),
                        base_date=trade_date_str,
                        context={**context, "ths_group_name": ths_group_name, "error": str(e)},
                        context_hash=context_hash,
                        selected_codes=[],
                        status="failed"
                    )
                except Exception as he:
                    logger.warning(f"保存推送历史失败: {he}")
                return (False, 0, strategy_name, ths_group_name, str(e))

        def on_progress(result, completed, total):
            """进度回调"""
            with progress_lock:
                completed_count[0] = completed
                progress = 10 + int((completed / max(1, total)) * 85)
                success, codes, name, group, error = result
                status_text = f"成功推送{codes}个" if success and codes > 0 else ("无结果" if success else f"失败:{error[:20]}")
                redis_task_manager.update_task_progress(
                    task_id, progress, 
                    f"已完成 {completed}/{total}: {name} -> {group} ({status_text})",
                    processed_items=completed,
                    total_items=total
                )

        def on_error(item, e):
            """错误处理"""
            strategy_name = item.get("strategy_name", "未知")
            logger.error(f"策略 {strategy_name} 执行异常: {e}")
            return (False, 0, strategy_name, item.get("ths_group_name", ""), str(e))

        # 并行执行所有策略配置
        redis_task_manager.update_task_progress(
            task_id, 10, f"开始并行执行 {len(configs)} 个策略配置...",
            total_items=len(configs)
        )
        
        results = process_concurrently(
            configs,
            execute_single_config,
            max_workers=min(len(configs), ConcurrentConfig.get_optimal_workers()),
            error_handler=on_error,
            progress_callback=on_progress
        )

        # 统计结果
        success_count = sum(1 for r in results if r[0])
        fail_count = len(results) - success_count
        total_codes = sum(r[1] for r in results)

        completion_message = f"策略推送完成: 成功{success_count}个, 失败{fail_count}个, 共推送{total_codes}个标的"
        redis_task_manager.update_task_progress(
            task_id, 100, completion_message, TaskStatus.COMPLETED
        )
        logger.info(completion_message)

    except Exception as e:
        logger.error(f"策略推送任务失败: {e}")
        redis_task_manager.update_task_progress(
            task_id, 0, f"任务失败: {str(e)}", TaskStatus.FAILED
        )
        raise

