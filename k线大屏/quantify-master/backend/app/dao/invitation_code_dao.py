"""
邀请码数据访问层
"""

import secrets
from datetime import datetime
from typing import Optional, List

from sqlmodel import Session, select

from app.models.base.database import engine
from app.models.entities import InvitationCode


class InvitationCodeDAO:
    """邀请码数据访问对象"""
    
    @staticmethod
    def generate_code(length: int = 8) -> str:
        """生成随机邀请码"""
        return secrets.token_urlsafe(length)[:length].upper()
    
    
    def find_by_code(self, code: str) -> Optional[InvitationCode]:
        """根据邀请码字符串查询"""
        with Session(engine) as session:
            statement = select(InvitationCode).where(InvitationCode.code == code)
            return session.exec(statement).first()
    
    def create(
        self,
        code: Optional[str] = None,
        max_uses: int = 1,
        expires_at: Optional[datetime] = None,
        created_by: Optional[int] = None,
        remark: Optional[str] = None
    ) -> InvitationCode:
        """创建邀请码"""
        with Session(engine) as session:
            invitation = InvitationCode(
                code=code or self.generate_code(),
                max_uses=max_uses,
                expires_at=expires_at,
                created_by=created_by,
                remark=remark
            )
            session.add(invitation)
            session.commit()
            session.refresh(invitation)
            return invitation
    
    def use_code(self, code: str) -> bool:
        """使用邀请码（增加使用次数）
        
        Returns:
            True: 使用成功
            False: 邀请码无效或已用完
        """
        with Session(engine) as session:
            statement = select(InvitationCode).where(InvitationCode.code == code)
            invitation = session.exec(statement).first()
            
            if not invitation or not invitation.is_valid():
                return False
            
            invitation.used_count += 1
            invitation.updated_at = datetime.now()
            session.add(invitation)
            session.commit()
            return True
    
    def validate_code(self, code: str) -> tuple[bool, str]:
        """验证邀请码是否有效
        
        Returns:
            (is_valid, message)
        """
        invitation = self.find_by_code(code)
        
        if not invitation:
            return False, "邀请码不存在"
        
        if not invitation.is_active:
            return False, "邀请码已被禁用"
        
        if invitation.expires_at and datetime.now() > invitation.expires_at:
            return False, "邀请码已过期"
        
        if invitation.max_uses > 0 and invitation.used_count >= invitation.max_uses:
            return False, "邀请码已达到使用上限"
        
        return True, "邀请码有效"
    
    def list_all(
        self,
        page: int = 1,
        page_size: int = 20,
        include_expired: bool = True
    ) -> tuple[List[InvitationCode], int]:
        """分页查询邀请码列表"""
        with Session(engine) as session:
            # 基础查询
            statement = select(InvitationCode)
            
            if not include_expired:
                statement = statement.where(
                    (InvitationCode.expires_at == None) | 
                    (InvitationCode.expires_at > datetime.now())
                )
            
            # 计算总数
            count_stmt = select(InvitationCode)
            if not include_expired:
                count_stmt = count_stmt.where(
                    (InvitationCode.expires_at == None) | 
                    (InvitationCode.expires_at > datetime.now())
                )
            total = len(list(session.exec(count_stmt).all()))
            
            # 分页
            statement = statement.order_by(InvitationCode.created_at.desc())
            statement = statement.offset((page - 1) * page_size).limit(page_size)
            
            codes = list(session.exec(statement).all())
            return codes, total
    
    def update_status(self, code_id: int, is_active: bool) -> Optional[InvitationCode]:
        """更新邀请码状态"""
        with Session(engine) as session:
            invitation = session.get(InvitationCode, code_id)
            if not invitation:
                return None
            
            invitation.is_active = is_active
            invitation.updated_at = datetime.now()
            session.add(invitation)
            session.commit()
            session.refresh(invitation)
            return invitation
    
    def delete(self, code_id: int) -> bool:
        """删除邀请码"""
        with Session(engine) as session:
            invitation = session.get(InvitationCode, code_id)
            if not invitation:
                return False
            
            session.delete(invitation)
            session.commit()
            return True


# 全局单例
invitation_code_dao = InvitationCodeDAO()
