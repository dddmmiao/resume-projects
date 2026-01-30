"""
日期工具模块
提供通用的日期处理功能
"""

from datetime import datetime, date
from typing import Optional, Any

from loguru import logger


class DateUtils:
    """日期工具类"""

    @staticmethod
    def parse_date(date_str: str) -> Optional[datetime]:
        """
        解析日期字符串
        
        Args:
            date_str: 日期字符串，支持以下格式：
                - YYYYMMDD (如: 20231201)
                - YYYY-MM-DD (如: 2023-12-01)
                - ISO格式 (如: 2023-12-01T10:30:00)
                
        Returns:
            datetime对象，解析失败返回None
        """
        if not date_str:
            return None

        try:
            if len(date_str) == 8:  # YYYYMMDD
                return datetime.strptime(date_str, "%Y%m%d")
            elif len(date_str) == 10:  # YYYY-MM-DD
                return datetime.strptime(date_str, "%Y-%m-%d")
            else:
                return datetime.fromisoformat(date_str)
        except ValueError:
            logger.warning(f"无法解析日期: {date_str}")
            return None

    @staticmethod
    def parse_date_to_date(date_str: str) -> Optional[date]:
        """
        解析日期字符串为date对象
        
        Args:
            date_str: 日期字符串
            
        Returns:
            date对象，解析失败返回None
        """
        dt = DateUtils.parse_date(date_str)
        return dt.date() if dt else None

    @staticmethod
    def format_date_to_string(dt: datetime, format_str: str = "%Y%m%d") -> str:
        """
        格式化日期为字符串
        
        Args:
            dt: datetime对象
            format_str: 格式字符串，默认为YYYYMMDD
            
        Returns:
            格式化后的日期字符串
        """
        if not dt:
            return ""
        return dt.strftime(format_str)

    @staticmethod
    def is_valid_date_string(date_str: str) -> bool:
        """
        检查日期字符串是否有效
        
        Args:
            date_str: 日期字符串
            
        Returns:
            是否有效
        """
        return DateUtils.parse_date(date_str) is not None

    @staticmethod
    def normalize_to_yyyymmdd(value: Any) -> Optional[str]:
        """
        将多种日期输入规范化为 YYYYMMDD 字符串。
        支持: str(YYYYMMDD/YYYY-MM-DD/ISO)、datetime、date、int/float(数值日期如20240101)
        失败返回 None。
        """
        if value is None:
            return None
        # datetime/date 直接格式化
        if isinstance(value, datetime):
            return value.strftime("%Y%m%d")
        if isinstance(value, date):
            return value.strftime("%Y%m%d")
        # 数字类型
        try:
            if isinstance(value, (int, float)):
                s = str(int(value))
                return s.zfill(8) if len(s) <= 8 and s.isdigit() else (s if len(s) == 8 and s.isdigit() else None)
        except Exception:
            pass
        # 字符串类型
        try:
            s = str(value).strip()
            if not s:
                return None
            # 直接是8位数字
            if len(s) == 8 and s.isdigit():
                return s
            # 常见连字符格式
            if len(s) == 10 and s[4] == '-' and s[7] == '-':
                try:
                    dt = datetime.strptime(s, "%Y-%m-%d")
                    return dt.strftime("%Y%m%d")
                except Exception:
                    return None
            # ISO 格式
            try:
                dt = datetime.fromisoformat(s)
                return dt.strftime("%Y%m%d")
            except Exception:
                return None
        except Exception:
            return None


# 创建全局实例
date_utils = DateUtils()
