"""
任务完成消息格式化工具
统一管理所有后台任务的完成提示文案
"""

from typing import Dict, Optional, Any, List


class TaskMessageFormatter:
    """任务消息格式化器 - 统一生成任务完成的提示文案"""
    
    @staticmethod
    def _format_duration(duration_ms: Optional[int]) -> str:
        """
        格式化耗时文本，根据时长自动选择合适的单位
        
        - < 1秒: 显示毫秒 (如 "500ms")
        - 1-60秒: 显示秒 (如 "30s")
        - 1-60分钟: 显示分钟+秒 (如 "5分30秒")
        - >= 1小时: 显示小时+分钟 (如 "1小时30分")
        """
        if not duration_ms or duration_ms < 0:
            return ""
        
        # 转换为秒
        total_seconds = duration_ms / 1000
        
        # < 1秒，显示毫秒
        if total_seconds < 1:
            return f"，耗时 {duration_ms}ms"
        
        # < 60秒，显示秒
        if total_seconds < 60:
            seconds = round(total_seconds)
            return f"，耗时 {seconds}s"
        
        # < 1小时，显示分钟+秒
        if total_seconds < 3600:
            minutes = int(total_seconds // 60)
            seconds = int(total_seconds % 60)
            if seconds > 0:
                return f"，耗时 {minutes}分{seconds}秒"
            else:
                return f"，耗时 {minutes}分钟"
        
        # >= 1小时，显示小时+分钟
        hours = int(total_seconds // 3600)
        remaining_minutes = int((total_seconds % 3600) // 60)
        if remaining_minutes > 0:
            return f"，耗时 {hours}小时{remaining_minutes}分"
        else:
            return f"，耗时 {hours}小时"
    
    @staticmethod
    def format_sync_completion(
        entity_type: str,
        inserted: int,
        updated: int,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化同步类任务完成文案（K线、基础数据等）
        
        Args:
            entity_type: 实体类型描述（如"股票K线"、"概念板块"）
            inserted: 新增数量
            updated: 更新数量
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_sync_completion("股票K线", 1000, 500, 45000)
            "股票K线执行完成，新增 1000 条，更新 500 条，耗时 45s"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        return f"{entity_type}执行完成，新增 {inserted} 条，更新 {updated} 条{dur_text}"
    
    @staticmethod
    def format_multi_entity_sync(
        parts: Dict[str, int],
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化多实体同步完成文案（股票+可转债+赎回等）
        
        Args:
            parts: 实体类型和数量的字典，如 {"股票": 5000, "可转债": 300, "赎回": 50}
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_multi_entity_sync({"股票": 5000, "可转债": 300}, 60000)
            "执行完成，股票 5000 条，可转债 300 条，耗时 60s"
        """
        if not parts:
            return "执行完成"
        
        part_texts = [f"{name} {count} 条" for name, count in parts.items() if count > 0]
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        
        if part_texts:
            return f"执行完成，{('，'.join(part_texts))}{dur_text}"
        else:
            return f"执行完成{dur_text}"
    
    @staticmethod
    def format_relation_sync(
        entity_name: str,
        entity_count: int,
        relation_count: int,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化带关系的同步完成文案（概念+关系、行业+关系）
        
        Args:
            entity_name: 实体名称（如"概念"、"行业"）
            entity_count: 实体数量
            relation_count: 关系数量
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_relation_sync("概念", 500, 15000, 30000)
            "执行完成，概念 500 个，关系 15000 条，耗时 30s"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        return f"执行完成，{entity_name} {entity_count} 个，关系 {relation_count} 条{dur_text}"
    
    @staticmethod
    def format_calendar_sync(
        total: int,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化交易日历同步完成文案
        
        Args:
            total: 同步总数
            start_date: 起始日期（YYYYMMDD）
            end_date: 结束日期（YYYYMMDD）
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_calendar_sync(2500, "20240101", "20241231", 15000)
            "交易日历同步完成，共同步 2500 条（20240101→20241231），耗时 15s"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        date_range = f"（{start_date}→{end_date}）" if start_date and end_date else ""
        return f"交易日历同步完成，共同步 {total} 条{date_range}{dur_text}"
    
    @staticmethod
    def format_deletion(
        total: int,
        details: Optional[Dict[str, int]] = None,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化删除任务完成文案
        
        Args:
            total: 删除总数
            details: 各类型删除数量，如 {"股票": 100, "可转债": 50, "概念": 200, "行业": 80}
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_deletion(430, {"股票": 100, "可转债": 50, "概念": 200, "行业": 80}, 5000)
            "清理完成，共删除 430 条（股票 100，可转债 50，概念 200，行业 80），耗时 5s"
            >>> format_deletion(50000, duration_ms=5000)
            "清理完成，共删除 50000 条数据，耗时 5s"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        
        # 如果有详细统计，显示各类型数量
        if details and any(v > 0 for v in details.values()):
            detail_parts = [f"{name} {count}" for name, count in details.items() if count > 0]
            detail_text = f"（{'，'.join(detail_parts)}）" if detail_parts else ""
            return f"清理完成，共删除 {total} 条{detail_text}{dur_text}"
        else:
            return f"清理完成，共删除 {total} 条数据{dur_text}"
    
    @staticmethod
    def format_auction_sync(
        inserted: int,
        updated: int,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化竞价数据同步完成文案
        
        Args:
            inserted: 新增数量
            updated: 更新数量
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_auction_sync(120, 350, 10000)
            "开盘竞价数据同步完成，新增 120 条，更新 350 条，耗时 10s"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        return f"开盘竞价数据同步完成，新增 {inserted} 条，更新 {updated} 条{dur_text}"
    
    @staticmethod
    def format_generic_completion(
        task_name: str,
        result: Optional[Any] = None,
        duration_ms: Optional[int] = None
    ) -> str:
        """
        格式化通用任务完成文案（兜底方法）
        支持自动解析result中的统计信息
        
        Args:
            task_name: 任务名称
            result: 任务结果（可选），支持多种格式：
                   - 热度数据：{"stock_hot_count": 120, "bond_hot_count": 45, ...}
                   - K线数据：{"inserted_count": 100, "updated_count": 200}
                   - 通用统计：{"total": 300, "success": 250}
            duration_ms: 耗时（毫秒）
            
        Returns:
            完整的提示文案
            
        Examples:
            >>> format_generic_completion("热度数据同步", {"stock_hot_count": 120, "bond_hot_count": 45})
            "热度数据同步完成，更新 股票 120 条, 可转债 45 条"
            >>> format_generic_completion("数据同步", {"inserted_count": 100, "updated_count": 200})
            "数据同步完成，新增 100 条，更新 200 条"
        """
        dur_text = TaskMessageFormatter._format_duration(duration_ms)
        
        # 如果没有result，返回简单的完成文案
        if not result or not isinstance(result, dict):
            return f"{task_name}完成{dur_text}"
        
        # 尝试解析热度数据统计（stock_hot_count, bond_hot_count, concept_hot_count, industry_hot_count）
        stock_count = result.get("stock_hot_count", 0)
        bond_count = result.get("bond_hot_count", 0)
        concept_count = result.get("concept_hot_count", 0)
        industry_count = result.get("industry_hot_count", 0)
        
        if any([stock_count, bond_count, concept_count, industry_count]):
            details = []
            if stock_count > 0:
                details.append(f"股票 {stock_count} 条")
            if bond_count > 0:
                details.append(f"可转债 {bond_count} 条")
            if concept_count > 0:
                details.append(f"概念 {concept_count} 条")
            if industry_count > 0:
                details.append(f"行业 {industry_count} 条")
            
            if details:
                return f"{task_name}完成，更新 {', '.join(details)}{dur_text}"
            else:
                return f"{task_name}完成，无数据更新{dur_text}"
        
        # 尝试解析新增/更新统计（inserted_count, updated_count）
        inserted = result.get("inserted_count")
        updated = result.get("updated_count")
        if inserted is not None or updated is not None:
            inserted = inserted or 0
            updated = updated or 0
            if inserted > 0 and updated > 0:
                return f"{task_name}完成，新增 {inserted} 条，更新 {updated} 条{dur_text}"
            elif inserted > 0:
                return f"{task_name}完成，新增 {inserted} 条{dur_text}"
            elif updated > 0:
                return f"{task_name}完成，更新 {updated} 条{dur_text}"
            else:
                return f"{task_name}完成，无数据更新{dur_text}"
        
        # 尝试解析总数统计（total, success）
        total = result.get("total")
        success = result.get("success")
        if total is not None:
            if success is not None:
                return f"{task_name}完成，处理 {total} 条，成功 {success} 条{dur_text}"
            else:
                return f"{task_name}完成，处理 {total} 条{dur_text}"
        
        # 兜底：返回简单的完成文案
        return f"{task_name}完成{dur_text}"


# 全局单例
task_message_formatter = TaskMessageFormatter()
