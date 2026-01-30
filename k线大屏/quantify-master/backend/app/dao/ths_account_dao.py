"""
同花顺账号 DAO 层
负责 ThsAccount 表的数据库操作
"""

from datetime import datetime
from typing import Dict, List, Optional

from loguru import logger
from sqlmodel import Session, select

from app.models.base.database import engine
from app.models.entities import ThsAccount


class ThsAccountDAO:
    """同花顺账号数据访问对象"""

    def find_by_user_id(self, user_id: int) -> List[ThsAccount]:
        """
        查询用户的所有账号
        
        Args:
            user_id: 用户ID
            
        Returns:
            账号列表
        """
        with Session(engine) as session:
            statement = select(ThsAccount).where(
                ThsAccount.user_id == user_id
            ).order_by(
                ThsAccount.created_at.asc()
            )
            return list(session.exec(statement).all())

    def find_by_ths_account_and_user(self, ths_account: str, user_id: int) -> Optional[ThsAccount]:
        """
        查询用户的指定同花顺账号
        
        Args:
            ths_account: 同花顺账号
            user_id: 用户ID
            
        Returns:
            账号对象
        """
        with Session(engine) as session:
            statement = select(ThsAccount).where(
                ThsAccount.ths_account == ths_account,
                ThsAccount.user_id == user_id
            )
            return session.exec(statement).first()

    def find_by_ths_account(self, ths_account: str) -> Optional[ThsAccount]:
        """
        根据同花顺账号查询（不限用户）
        
        Args:
            ths_account: 同花顺账号
            
        Returns:
            账号对象
        """
        with Session(engine) as session:
            statement = select(ThsAccount).where(
                ThsAccount.ths_account == ths_account
            )
            return session.exec(statement).first()

    def get_most_recent_accounts_per_user(self, account_list: list = None) -> List[str]:
        """获取每个用户的最近登录账号
        
        Args:
            account_list: 可选，限定在这些账号中查找
            
        Returns:
            每个用户最近登录的账号列表（ths_account 字符串）
        """
        with Session(engine) as session:
            # 获取所有符合条件的账号
            statement = select(ThsAccount).where(ThsAccount.last_login_at.isnot(None))
            if account_list:
                statement = statement.where(ThsAccount.ths_account.in_(account_list))
            accounts = session.exec(statement).all()
            
            if not accounts:
                return []
            
            # 按 user_id 分组，取每组最近登录的
            user_accounts: Dict[int, ThsAccount] = {}
            for acc in accounts:
                if acc.user_id is None:
                    continue
                if acc.user_id not in user_accounts:
                    user_accounts[acc.user_id] = acc
                elif acc.last_login_at > user_accounts[acc.user_id].last_login_at:
                    user_accounts[acc.user_id] = acc
            
            return [acc.ths_account for acc in user_accounts.values()]

    def is_most_recent_account(self, ths_account: str, user_id: int = None) -> bool:
        """检查指定账号是否是最近登录的账号
        
        Args:
            ths_account: 同花顺账号
            user_id: 可选，限定在该用户的账号中检查
            
        Returns:
            是否是最近登录的账号
        """
        with Session(engine) as session:
            statement = select(ThsAccount).where(ThsAccount.last_login_at.isnot(None))
            if user_id:
                statement = statement.where(ThsAccount.user_id == user_id)
            statement = statement.order_by(ThsAccount.last_login_at.desc()).limit(1)
            most_recent = session.exec(statement).first()
            return most_recent is not None and most_recent.ths_account == ths_account

    def create(self, account: ThsAccount) -> ThsAccount:
        """
        创建账号
        
        Args:
            account: 账号对象
            
        Returns:
            创建后的账号对象（包含生成的ID）
        """
        with Session(engine) as session:
            session.add(account)
            session.commit()
            session.refresh(account)
            return account

    def update(self, account: ThsAccount) -> ThsAccount:
        """
        更新账号
        
        Args:
            account: 账号对象
            
        Returns:
            更新后的账号对象
        """
        with Session(engine) as session:
            account.updated_at = datetime.now()
            session.add(account)
            session.commit()
            session.refresh(account)
            return account

    def delete(self, account: ThsAccount) -> None:
        """
        删除账号
        
        Args:
            account: 账号对象
        """
        with Session(engine) as session:
            session.delete(account)
            session.commit()


    def find_by_user_ids(self, user_ids: List[int]) -> List[ThsAccount]:
        """
        查询多个用户的所有账号
        
        Args:
            user_ids: 用户ID列表
            
        Returns:
            账号列表
        """
        if not user_ids:
            return []
        with Session(engine) as session:
            statement = select(ThsAccount).where(ThsAccount.user_id.in_(user_ids))
            return list(session.exec(statement).all())

    def find_by_ids(self, account_ids: List[int]) -> List[ThsAccount]:
        """
        根据账号ID列表批量查询账号
        
        Args:
            account_ids: 账号ID列表
            
        Returns:
            账号列表
        """
        if not account_ids:
            return []
        with Session(engine) as session:
            statement = select(ThsAccount).where(ThsAccount.id.in_(account_ids))
            return list(session.exec(statement).all())
    
    def update_login_info(
        self,
        ths_account: str,
        nickname: Optional[str] = None,
        mobile: Optional[str] = None,
        login_method: Optional[str] = None,
        encrypted_password: Optional[str] = None
    ) -> int:
        """
        更新账号的登录相关信息（批量更新所有匹配的账号）
        
        Args:
            ths_account: 同花顺账号标识
            nickname: 昵称
            mobile: 手机号
            login_method: 登录方式
            encrypted_password: 加密密码
            
        Returns:
            更新的账号数量
        """
        with Session(engine) as session:
            statement = select(ThsAccount).where(ThsAccount.ths_account == ths_account)
            accounts = list(session.exec(statement).all())
            
            if not accounts:
                return 0
            
            login_time = datetime.now()
            
            for account in accounts:
                account.last_login_method = login_method
                account.last_login_at = login_time
                account.updated_at = login_time
                
                if nickname:
                    account.nickname = nickname
                if mobile:
                    account.mobile = mobile
                if encrypted_password:
                    account.encrypted_password = encrypted_password
                
                session.add(account)
            
            session.commit()
            return len(accounts)


# 全局 DAO 实例
ths_account_dao = ThsAccountDAO()
