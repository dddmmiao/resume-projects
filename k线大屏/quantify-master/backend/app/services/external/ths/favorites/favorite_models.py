"""
同花顺自选股数据模型
定义自选股相关的数据结构
"""

from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class THSFavorite:
    """
    同花顺自选股的单个项目数据类。

    Attributes:
        code (str): 项目代码 (例如股票代码 "000001")。
        market (Optional[str]): 项目所属市场的缩写 (例如 "SZ", "SH")。可能为 None。
    """
    code: str
    market: Optional[str] = None

    def __repr__(self) -> str:
        if self.market:
            return f"THSFavorite(code='{self.code}', market='{self.market}')"
        return f"THSFavorite(code='{self.code}')"


class THSFavoriteGroup:
    """
    同花顺自选股的分组类。

    Attributes:
        group_id (str): 分组的唯一标识符。
        name (str): 分组的名称。
        items (List[THSFavorite]): 该分组包含的自选项目列表。
    """
    group_id: str
    name: str
    items: List[THSFavorite]

    def __init__(self, name: str, group_id: str, items: List[THSFavorite]):
        self.name = name
        self.group_id = group_id
        self.items = items

    def __repr__(self) -> str:
        return f"THSFavoriteGroup(name='{self.name}', group_id='{self.group_id}', items_count={len(self.items)})"
