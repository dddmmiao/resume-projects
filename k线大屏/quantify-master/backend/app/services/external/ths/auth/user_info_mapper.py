"""
同花顺用户信息映射器
处理同花顺API返回的user_info到系统内部字段的映射
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class MappedThsUserInfo:
    """映射后的同花顺用户信息"""
    ths_account: str       # 同花顺账号标识 (uid字符串)
    ths_uid: Optional[int] # 同花顺用户ID (原始uid数值)
    nickname: str          # 显示昵称
    avatar: Optional[str]  # 头像URL
    
    def __post_init__(self):
        """确保关键字段非空"""
        if not self.ths_account:
            raise ValueError("映射后的ths_account不能为空")


class ThsUserInfoMapper:
    """同花顺用户信息映射器"""
    
    @staticmethod
    def map_user_info(ths_user_info: Dict[str, Any]) -> MappedThsUserInfo:
        """
        将同花顺API返回的user_info映射为系统字段
        
        同花顺API字段结构:
        {
            "uid": 556877543,                    # int类型用户ID
            "nickname": "mo_**543eqf",          # 显示昵称
            "avatar": "https://u.thsi.cn/..."   # 头像URL
        }
        
        系统字段映射:
        - ths_account: uid的字符串形式，作为稳定的账号标识
        - ths_uid: uid的原始数值，用于构建User-Agent等
        - nickname: 保持原值，用于前端展示
        - avatar: 保持原值
        
        Args:
            ths_user_info: 同花顺API返回的user_info字典
            
        Returns:
            MappedThsUserInfo: 映射后的用户信息
            
        Raises:
            ValueError: 当关键字段缺失或无效时
        """
        if not isinstance(ths_user_info, dict):
            raise ValueError(f"期望字典类型，得到: {type(ths_user_info)}")
        
        # 直接提取字段（无回退逻辑）
        uid = ths_user_info.get("uid")
        nickname = ths_user_info.get("nickname", "").strip()
        avatar = ths_user_info.get("avatar")

        # 要求uid和nickname都存在
        if uid is None:
            raise ValueError(f"user_info中缺少uid字段: {ths_user_info}")
        if not nickname:
            raise ValueError(f"user_info中缺少nickname字段: {ths_user_info}")

        # 使用uid字符串作为稳定的ths_account标识；nickname仅用于展示
        return MappedThsUserInfo(
            ths_account=str(uid),
            ths_uid=uid,
            nickname=nickname,
            avatar=avatar,
        )
    
    @staticmethod
    def validate_user_info_structure(ths_user_info: Dict[str, Any]) -> bool:
        """
        验证同花顺user_info结构是否符合预期
        
        Args:
            ths_user_info: 同花顺API返回的user_info
            
        Returns:
            bool: 结构是否有效
        """
        if not isinstance(ths_user_info, dict):
            return False
            
        # 必须同时包含uid和nickname字段，且均有效
        has_uid = "uid" in ths_user_info and ths_user_info["uid"] is not None
        has_nickname = "nickname" in ths_user_info and ths_user_info["nickname"]
        
        return has_uid and has_nickname
