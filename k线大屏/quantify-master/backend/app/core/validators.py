"""
统一参数验证器
"""

import re
from typing import List, Optional, Union

from fastapi import HTTPException
from pydantic import BaseModel, Field


class SearchParams(BaseModel):
    """搜索参数模型"""

    search: Optional[str] = Field(None, description="搜索关键词")
    industries: Optional[Union[str, List[str]]] = Field(None, description="行业筛选，支持字符串(逗号分隔)或字符串数组")
    concepts: Optional[Union[str, List[str]]] = Field(None, description="概念筛选，支持字符串(逗号分隔)或字符串数组")
    sort_by: Optional[str] = Field(None, description="排序字段")
    sort_order: str = Field("asc", description="排序方式，asc 或 desc")
    hot_sort: bool = Field(False, description="是否按热度排序")

    def get_concept_list(self) -> List[str]:
        """获取概念列表"""
        if not self.concepts:
            return []
        return [c.strip() for c in self.concepts if isinstance(c, str) and c.strip()]

    def get_industry_list(self) -> List[str]:
        """获取行业列表"""
        if not self.industries:
            return []
        return [c.strip() for c in self.industries if isinstance(c, str) and c.strip()]


def validate_ts_code(ts_code: str) -> str:
    """验证单个证券代码"""
    if not re.match(r"^.+\.(SZ|SH|BJ)$", ts_code):
        raise HTTPException(
            status_code=400,
            detail=f"证券代码格式错误: {ts_code}，应为: *.SZ、*.SH 或 *.BJ",
        )
    return ts_code


def validate_concept_ts_code(ts_code: str) -> str:
    """验证概念指数代码（同花顺概念 .TI）"""
    if not re.match(r"^\d{6}\.TI$", ts_code):
        raise HTTPException(
            status_code=400,
            detail=f"概念代码格式错误: {ts_code}，应为: 6位数字.TI，例如 885959.TI",
        )
    return ts_code


def validate_industry_ts_code(ts_code: str) -> str:
    """验证行业指数代码（同花顺行业 .TI）"""
    if not re.match(r"^\d{6}\.TI$", ts_code):
        raise HTTPException(
            status_code=400,
            detail=f"行业代码格式错误: {ts_code}，应为: 6位数字.TI，例如 885001.TI",
        )
    return ts_code


def validate_period(period: str) -> str:
    """验证周期类型"""
    valid_periods = ["daily", "weekly", "monthly"]
    if period not in valid_periods:
        raise HTTPException(
            status_code=400,
            detail=f'不支持的周期类型: {period}，支持的类型: {", ".join(valid_periods)}',
        )
    return period


def normalize_pagination(page: int = 1, page_size: int = 20) -> tuple:
    """标准化分页参数"""
    page = max(1, page)
    page_size = max(1, min(1000, page_size))
    offset = (page - 1) * page_size
    return page, page_size, offset
