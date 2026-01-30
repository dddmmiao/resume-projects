"""
数值转换通用工具
"""

from typing import Optional, Any


def safe_float(value: Any) -> Optional[float]:
    """安全转换为浮点数，处理pandas NA值"""
    import pandas as pd
    
    if value is None or pd.isna(value):
        return None
    
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
