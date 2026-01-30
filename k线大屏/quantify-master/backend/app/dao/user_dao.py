"""
用户 DAO 层
负责 User 表的数据库操作
"""

from datetime import datetime
from typing import List, Optional, Tuple

from loguru import logger
from sqlmodel import Session, select, func, or_

from app.models.base.database import engine
from app.models.entities import User


class UserDAO:
    """用户数据访问对象"""

    def find_by_id(self, user_id: int) -> Optional[User]:
        """
        根据ID查询用户
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户对象
        """
        with Session(engine) as session:
            statement = select(User).where(User.id == user_id)
            return session.exec(statement).first()

    def find_by_username(self, username: str) -> Optional[User]:
        """
        根据用户名查询用户
        
        Args:
            username: 用户名
            
        Returns:
            用户对象
        """
        with Session(engine) as session:
            statement = select(User).where(User.username == username)
            return session.exec(statement).first()

    def create(self, user: User) -> User:
        """
        创建用户
        
        Args:
            user: 用户对象
            
        Returns:
            创建后的用户对象（包含生成的ID）
        """
        with Session(engine) as session:
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def update(self, user: User) -> User:
        """
        更新用户
        
        Args:
            user: 用户对象
            
        Returns:
            更新后的用户对象
        """
        with Session(engine) as session:
            user.updated_at = datetime.now()
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def update_last_login(self, user_id: int) -> Optional[User]:
        """
        更新用户最后登录时间
        
        Args:
            user_id: 用户ID
            
        Returns:
            更新后的用户对象
        """
        with Session(engine) as session:
            statement = select(User).where(User.id == user_id)
            user = session.exec(statement).first()
            if user:
                user.last_login_at = datetime.now()
                user.updated_at = datetime.now()
                session.add(user)
                session.commit()
                session.refresh(user)
            return user


    def list_with_pagination(
        self,
        page: int = 1,
        page_size: int = 20,
        keyword: Optional[str] = None
    ) -> Tuple[List[User], int]:
        """
        分页查询用户列表
        
        Args:
            page: 页码，从1开始
            page_size: 每页数量
            keyword: 搜索关键词（用户名/昵称）
            
        Returns:
            (用户列表, 总数)
        """
        with Session(engine) as session:
            # 构建查询
            query = select(User)
            count_query = select(func.count(User.id))
            
            # 关键词搜索
            if keyword:
                keyword_filter = or_(
                    User.username.contains(keyword),
                    User.nickname.contains(keyword),
                )
                query = query.where(keyword_filter)
                count_query = count_query.where(keyword_filter)
            
            # 总数
            total = session.exec(count_query).one()
            
            # 分页
            offset = (page - 1) * page_size
            query = query.order_by(User.id.desc()).offset(offset).limit(page_size)
            users = list(session.exec(query).all())
            
            return users, total


    def update_profile(
        self,
        user_id: int,
        nickname: Optional[str] = None
    ) -> Optional[User]:
        """
        更新用户个人信息
        
        Args:
            user_id: 用户ID
            nickname: 昵称
            
        Returns:
            更新后的用户对象
        """
        with Session(engine) as session:
            statement = select(User).where(User.id == user_id)
            user = session.exec(statement).first()
            if not user:
                return None
            
            if nickname is not None:
                user.nickname = nickname
            
            user.updated_at = datetime.now()
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def delete(self, user: User) -> None:
        """
        删除用户
        
        Args:
            user: 用户对象
        """
        with Session(engine) as session:
            # 重新查询用户确保在当前会话中
            existing_user = session.get(User, user.id)
            if existing_user:
                session.delete(existing_user)
                session.commit()

    def update_pushplus_token(
        self,
        user_id: int,
        friend_token: Optional[str] = None
    ) -> Optional[User]:
        """
        更新用户的PushPlus好友令牌
        
        Args:
            user_id: 用户ID
            friend_token: PushPlus好友令牌
            
        Returns:
            更新后的用户对象
        """
        with Session(engine) as session:
            statement = select(User).where(User.id == user_id)
            user = session.exec(statement).first()
            if not user:
                return None
            
            # 空字符串也视为清除令牌
            user.pushplus_friend_token = friend_token if friend_token else None
            user.updated_at = datetime.now()
            session.add(user)
            session.commit()
            session.refresh(user)
            return user


# 全局 DAO 实例
user_dao = UserDAO()
