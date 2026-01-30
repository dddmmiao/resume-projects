"""
可转债赎回信息服务模块

提供可转债赎回相关的业务逻辑服务
"""

from typing import List, Dict, Any

from loguru import logger

from app.core.exceptions import CancellationException
from ..core.cache_service import service_cached
from ..external.tushare_service import tushare_service
from ...dao.convertible_bond_call_dao import convertible_bond_call_dao


class ConvertibleBondCallService:
    """可转债赎回信息服务类"""

    def __init__(self):
        self.data_service = tushare_service
        logger.info("可转债赎回信息服务初始化完成")

    @service_cached("bond_calls:members", key_fn=lambda self, ts_code: ts_code.strip() if ts_code else "")
    def get_convertible_bond_call_info(self, ts_code: str) -> List[Dict[str, Any]]:
        """
        获取可转债赎回信息

        Args:
            ts_code: 可转债代码

        Returns:
            赎回信息列表
        """
        try:
            logger.debug(f"获取可转债赎回信息 - ts_code: {ts_code}")

            # 通过 DAO 回源
            call_info_list = convertible_bond_call_dao.get_call_details_by_ts_code(ts_code)

            # 直接返回call_info_list，让路由层根据返回模型取字段
            result = []
            for call_info in call_info_list:
                # 内联状态映射逻辑
                is_call_value = call_info.get("is_call")
                status_map = {
                    "公告不强赎": {
                        "status": "not_called",
                        "display_name": "公告不强赎",
                        "description": "公告不执行强制赎回",
                        "color": "green",
                        "priority": 1,
                    },
                    "公告提示强赎": {
                        "status": "call_warning",
                        "display_name": "公告提示强赎",
                        "description": "提示可能强制赎回",
                        "color": "orange",
                        "priority": 2,
                    },
                    "已满足强赎条件": {
                        "status": "call_condition_met",
                        "display_name": "已满足强赎条件",
                        "description": "满足强赎条件但未执行",
                        "color": "yellow",
                        "priority": 3,
                    },
                    "公告实施强赎": {
                        "status": "called",
                        "display_name": "公告实施强赎",
                        "description": "已执行强制赎回",
                        "color": "red",
                        "priority": 4,
                    },
                    "公告到期赎回": {
                        "status": "matured",
                        "display_name": "公告到期赎回",
                        "description": "已到期赎回",
                        "color": "red",
                        "priority": 5,
                    },
                }
                call_info['call_status'] = status_map.get(
                    is_call_value,
                    {
                        "status": "unknown",
                        "display_name": is_call_value or "未知",
                        "description": "未知状态",
                        "color": "gray",
                        "priority": 0,
                    },
                )
                result.append(call_info)

            logger.debug(f"获取可转债赎回信息完成，共{len(result)}条记录")
            return result

        except Exception as e:
            logger.error(f"获取可转债赎回信息失败: {str(e)}")
            return []

    def sync_convertible_bond_call_info(self, ts_code: str = None, task_id: str = None) -> Dict[str, Any]:
        """
        同步可转债赎回信息

        Args:
            ts_code: 可转债代码，None表示同步所有
            task_id: 任务ID

        Returns:
            包含同步结果的字典，包含 total_count 和 created_count
        """
        try:
            logger.info(f"开始同步可转债赎回信息 - ts_code: {ts_code}")

            # 使用Tushare服务获取赎回信息数据
            call_data_list = self.data_service.get_convertible_bond_call_info(ts_code, task_id)

            if not call_data_list:
                logger.warning("未获取到可转债赎回信息数据")
                return {
                    "total_count": 0,
                    "created_count": 0
                }

            # 过滤掉不存在的可转债代码，避免外键约束失败
            from .convertible_bond_service import convertible_bond_service

            # 🚀 性能优化：优化代码过滤逻辑，减少重复字典访问
            # 一次性提取所有ts_code
            ts_codes = []
            items_with_code = []
            for item in call_data_list:
                ts_code = item.get('ts_code')
                if ts_code:
                    ts_codes.append(ts_code)
                    items_with_code.append((item, ts_code))
            
            if ts_codes:
                # 查询数据库中存在的可转债代码
                existing_bonds = convertible_bond_service.get_convertible_bonds_by_codes(ts_codes)
                existing_codes = {bond['ts_code'] for bond in existing_bonds}

                # 一次性过滤，避免重复循环
                filtered_call_data = []
                for item, ts_code in items_with_code:
                    if ts_code in existing_codes:
                        filtered_call_data.append(item)
                    else:
                        logger.debug(f"跳过不存在的可转债代码: {ts_code}")
            else:
                filtered_call_data = []

            if not filtered_call_data:
                logger.warning("过滤后没有有效的可转债赎回信息数据")
                return {
                    "total_count": 0,
                    "created_count": 0
                }

            logger.info(f"过滤前: {len(call_data_list)}条, 过滤后: {len(filtered_call_data)}条")

            # 🚀 优化：使用DAO标准化返回
            result = convertible_bond_call_dao.sync_convertible_bond_call_data(filtered_call_data)

            logger.success(
                f"可转债赎回信息同步完成 - 创建: {result.get('inserted_count', 0)}条, "
                f"更新: {result.get('updated_count', 0)}条, 总计: {result.get('total_count', 0)}条"
            )

            # 使用DAO标准返回格式
            return {
                "total_count": result.get('total_count', 0),
                "created_count": result.get('inserted_count', 0)
            }

        except CancellationException:
            raise
        except Exception as e:
            logger.error(f"同步可转债赎回信息失败: {str(e)}")
            return {
                "total_count": 0,
                "created_count": 0
            }


# 创建全局服务实例
convertible_bond_call_service = ConvertibleBondCallService()
