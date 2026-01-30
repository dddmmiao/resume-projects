"""邀请码管理服务

封装邀请码管理业务逻辑，调用 DAO 层进行数据库操作。
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

from loguru import logger

from app.models.entities import InvitationCode
from app.dao.invitation_code_dao import invitation_code_dao


class InvitationCodeService:
    """邀请码管理相关业务逻辑"""

    def list_codes(
        self,
        page: int = 1,
        page_size: int = 20,
        include_expired: bool = True
    ) -> Dict[str, Any]:
        """
        获取邀请码列表
        
        Args:
            page: 页码
            page_size: 每页数量
            include_expired: 是否包含过期的邀请码
            
        Returns:
            {"codes": [...], "total": int, "page": int, "page_size": int}
        """
        try:
            codes, total = invitation_code_dao.list_all(
                page=page,
                page_size=page_size,
                include_expired=include_expired
            )
            
            code_list = [
                {
                    "code": c.code,
                    "max_uses": c.max_uses,
                    "used_count": c.used_count,
                    "expires_at": c.expires_at.isoformat() if c.expires_at else None,
                    "is_active": c.is_active,
                    "is_valid": c.is_valid(),
                    "remark": c.remark,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in codes
            ]
            
            return {
                "codes": code_list,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        except Exception as e:
            logger.error(f"获取邀请码列表失败: {e}")
            raise

    def create_code(
        self,
        created_by: int,
        code: Optional[str] = None,
        max_uses: int = 1,
        expires_days: Optional[int] = None,
        remark: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        创建邀请码
        
        Args:
            created_by: 创建人用户ID
            code: 自定义邀请码，不填则自动生成
            max_uses: 最大使用次数，0表示无限制
            expires_days: 有效期天数，不填则永不过期
            remark: 备注
            
        Returns:
            创建的邀请码信息
        """
        try:
            # 计算过期时间
            expires_at = None
            if expires_days and expires_days > 0:
                expires_at = datetime.now() + timedelta(days=expires_days)
            
            invitation = invitation_code_dao.create(
                code=code,
                max_uses=max_uses,
                expires_at=expires_at,
                created_by=created_by,
                remark=remark
            )
            
            logger.info(f"邀请码创建成功: {invitation.code} (创建人: {created_by})")
            
            return {
                "code": invitation.code,
                "max_uses": invitation.max_uses,
                "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
                "remark": invitation.remark,
            }
        except Exception as e:
            logger.error(f"创建邀请码失败: {e}")
            raise

    def update_status(self, code_id: int, is_active: bool) -> Optional[InvitationCode]:
        """
        更新邀请码状态（启用/禁用）
        
        Args:
            code_id: 邀请码ID
            is_active: 是否启用
            
        Returns:
            更新后的邀请码对象，不存在则返回 None
        """
        try:
            invitation = invitation_code_dao.update_status(code_id, is_active)
            if invitation:
                logger.info(f"邀请码状态已更新: {invitation.code} -> {'启用' if is_active else '禁用'}")
            return invitation
        except Exception as e:
            logger.error(f"更新邀请码状态失败: {e}")
            raise

    def delete_code(self, code_id: int) -> bool:
        """
        删除邀请码
        
        Args:
            code_id: 邀请码ID
            
        Returns:
            是否删除成功
        """
        try:
            success = invitation_code_dao.delete(code_id)
            if success:
                logger.info(f"邀请码已删除: ID={code_id}")
            return success
        except Exception as e:
            logger.error(f"删除邀请码失败: {e}")
            raise
    
    def update_status_by_code(self, code: str, is_active: bool) -> Optional[InvitationCode]:
        """
        根据邀请码字符串更新状态
        
        Args:
            code: 邀请码字符串
            is_active: 是否启用
            
        Returns:
            更新后的邀请码对象，不存在则返回 None
        """
        try:
            # 先查找邀请码
            invitation = invitation_code_dao.find_by_code(code)
            if not invitation:
                logger.warning(f"邀请码不存在: {code}")
                return None
            
            # 更新状态
            updated_invitation = invitation_code_dao.update_status(invitation.id, is_active)
            if updated_invitation:
                logger.info(f"邀请码状态已更新: {code} -> {'启用' if is_active else '禁用'}")
            return updated_invitation
        except Exception as e:
            logger.error(f"更新邀请码状态失败: {e}")
            raise
    
    def delete_by_code(self, code: str) -> bool:
        """
        根据邀请码字符串删除邀请码
        
        Args:
            code: 邀请码字符串
            
        Returns:
            是否删除成功
        """
        try:
            # 先查找邀请码
            invitation = invitation_code_dao.find_by_code(code)
            if not invitation:
                return False
            
            # 删除邀请码
            success = invitation_code_dao.delete(invitation.id)
            if success:
                logger.info(f"邀请码已删除: {code}")
            return success
        except Exception as e:
            logger.error(f"删除邀请码失败: {e}")
            raise


# 全局服务实例
invitation_code_service = InvitationCodeService()
