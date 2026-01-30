"""
全量K线后台任务与通用K线worker
"""

from typing import Dict, Any, Optional

from loguru import logger

from app.constants.entity_types import EntityTypes
from app.core.exceptions import CancellationException
from app.services.core.task_message_formatter import task_message_formatter


def _update_kline_sync_progress(task_id: str, percentage: int, message: str):
    """更新K线同步任务进度的通用函数"""
    if not task_id:
        return
    try:
        from app.services.core.redis_task_manager import redis_task_manager
        redis_task_manager.update_task_progress(task_id, percentage, message)
    except Exception as e:
        logger.warning(f"更新任务进度失败: {e}")


def _sync_kline_data_with_progress(
    entity_type: str,
    service_module: str,
    kline_service_module: str,
    get_codes_func: str,
    task_id: str = None,
    force_sync: bool = False,
    concurrent_workers: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """通用的K线数据同步函数，带进度更新
    
    Args:
        entity_type: 实体类型（stock/bond/concept/industry）
        service_module: 服务模块路径
        kline_service_module: K线服务模块路径
        get_codes_func: 获取代码列表的方法名
        task_id: 任务ID
        force_sync: 是否强制同步
        concurrent_workers: 并发工作线程数，如果为None则使用默认值
        start_date: 开始日期 (YYYYMMDD格式)
        end_date: 结束日期 (YYYYMMDD格式)
    """
    try:
        # 动态导入服务
        service = __import__(service_module, fromlist=[service_module.split('.')[-1]]).__dict__[service_module.split('.')[-1]]
        kline_service = __import__(kline_service_module, fromlist=[kline_service_module.split('.')[-1]]).__dict__[kline_service_module.split('.')[-1]]
        
        from app.services.management.sync_strategy_config import SyncStrategyConfig
        
        # 如果没有指定并发数，使用默认值
        if concurrent_workers is None:
            concurrent_workers = SyncStrategyConfig.DEFAULT_CONCURRENT_WORKERS
        
        # 获取中文名称用于显示
        from app.constants.entity_types import EntityTypes
        chinese_name = EntityTypes.get_chinese_name(entity_type)
        
        # 更新任务进度：开始
        _update_kline_sync_progress(task_id, 10, f"开始同步{chinese_name}K线数据（并发数: {concurrent_workers}）...")
        
        # 获取所有代码
        get_codes_method = getattr(service, get_codes_func)
        codes = get_codes_method()
        if not codes:
            _update_kline_sync_progress(task_id, 100, f"没有{chinese_name}K线数据需要同步")
            return {"success": True, "count": 0}

        # 更新任务进度：获取代码完成
        _update_kline_sync_progress(task_id, 20, f"已获取{len(codes)}个{chinese_name}代码，开始同步（并发数: {concurrent_workers}）...")

        # 同步所有周期数据
        result = kline_service.sync_kline_data_universal(
            ts_codes=codes,
            periods=["daily", "weekly", "monthly"],
            force_sync=force_sync,
            concurrent_workers=concurrent_workers,
            task_id=task_id,
            start_date=start_date,
            end_date=end_date
        )
        
        # 更新任务进度：完成
        inserted_count = result.get('inserted_count', 0)
        updated_count = result.get('updated_count', 0)
        
        # 使用统一的文案格式化器
        completion_message = task_message_formatter.format_sync_completion(
            entity_type=f"{chinese_name}K线数据",
            inserted=inserted_count,
            updated=updated_count
        )
        
        _update_kline_sync_progress(task_id, 100, completion_message)
        
        return {
            "success": True,
            "result": result
        }
        
    except CancellationException:
        _update_kline_sync_progress(task_id, 100, f"{entity_type}K线数据同步任务已被取消")
        return {"success": True, "cancelled": True}
    except Exception as e:
        _update_kline_sync_progress(task_id, 100, f"{entity_type}K线数据同步失败: {str(e)}")
        logger.error(f"同步所有{entity_type}K线数据失败: {e}")
        return {"success": False, "error": str(e)}




# 新增按实体类型同步的后台任务方法（方案B）
def sync_all_stock_kline_data_background(task_id: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
    """同步所有股票K线数据（日线+周线+月线）
    
    使用 daily 接口，并发上限 8
    
    Args:
        task_id: 任务ID
        options: 任务选项，可包含 force_sync, start_date, end_date 参数
    """
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    opts = options or {}
    force_sync = bool(opts.get("force_sync", False))
    start_date = opts.get("start_date")
    end_date = opts.get("end_date")
    return _sync_kline_data_with_progress(
        entity_type=EntityTypes.STOCK,
        service_module="app.services.data.stock_service",
        kline_service_module="app.services.data.stock_kline_service", 
        get_codes_func="get_all_ts_codes_cached",
        task_id=task_id,
        force_sync=force_sync,
        concurrent_workers=SyncStrategyConfig.STOCK_KLINE_CONCURRENT_WORKERS,
        start_date=start_date,
        end_date=end_date
    )


def sync_all_bond_kline_data_background(task_id: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
    """同步所有可转债K线数据（日线+周线+月线）
    
    使用 cb_daily 接口，并发上限 5
    
    Args:
        task_id: 任务ID
        options: 任务选项，可包含 force_sync, start_date, end_date 参数
    """
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    opts = options or {}
    force_sync = bool(opts.get("force_sync", False))
    start_date = opts.get("start_date")
    end_date = opts.get("end_date")
    return _sync_kline_data_with_progress(
        entity_type=EntityTypes.BOND,
        service_module="app.services.data.convertible_bond_service",
        kline_service_module="app.services.data.convertible_bond_kline_service", 
        get_codes_func="get_all_ts_codes_cached",
        task_id=task_id,
        force_sync=force_sync,
        concurrent_workers=SyncStrategyConfig.BOND_KLINE_CONCURRENT_WORKERS,
        start_date=start_date,
        end_date=end_date
    )


def sync_all_concept_kline_data_background(task_id: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
    """同步所有概念K线数据（日线+周线+月线）
    
    使用 ths_daily 接口，并发上限 4
    
    Args:
        task_id: 任务ID
        options: 任务选项，可包含 force_sync, start_date, end_date 参数
    """
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    opts = options or {}
    force_sync = bool(opts.get("force_sync", False))
    start_date = opts.get("start_date")
    end_date = opts.get("end_date")
    return _sync_kline_data_with_progress(
        entity_type=EntityTypes.CONCEPT,
        service_module="app.services.data.concept_service",
        kline_service_module="app.services.data.concept_kline_service", 
        get_codes_func="get_all_ts_codes_cached",
        task_id=task_id,
        force_sync=force_sync,
        concurrent_workers=SyncStrategyConfig.CONCEPT_KLINE_CONCURRENT_WORKERS,
        start_date=start_date,
        end_date=end_date
    )


def sync_all_industry_kline_data_background(task_id: str = None, options: Dict[str, Any] = None) -> Dict[str, Any]:
    """同步所有行业K线数据（日线+周线+月线）
    
    使用 ths_daily 接口，并发上限 4
    
    Args:
        task_id: 任务ID
        options: 任务选项，可包含 force_sync, start_date, end_date 参数
    """
    from app.services.management.sync_strategy_config import SyncStrategyConfig
    opts = options or {}
    force_sync = bool(opts.get("force_sync", False))
    start_date = opts.get("start_date")
    end_date = opts.get("end_date")
    return _sync_kline_data_with_progress(
        entity_type=EntityTypes.INDUSTRY,
        service_module="app.services.data.industry_service",
        kline_service_module="app.services.data.industry_kline_service", 
        get_codes_func="get_all_ts_codes_cached",
        task_id=task_id,
        force_sync=force_sync,
        concurrent_workers=SyncStrategyConfig.INDUSTRY_KLINE_CONCURRENT_WORKERS,
        start_date=start_date,
        end_date=end_date
    )
