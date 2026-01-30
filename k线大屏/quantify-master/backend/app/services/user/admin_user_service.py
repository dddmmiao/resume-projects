"""管理员用户管理服务

封装管理员对用户的管理操作业务逻辑，调用 DAO 层进行数据库操作。
"""

from typing import List, Dict, Any, Optional

from loguru import logger

from app.dao.ths_account_dao import ths_account_dao
from app.dao.user_dao import user_dao
from app.models.entities import ThsAccount
from app.services.external.ths.auth.login_service import ths_login_service


class AdminUserService:
    """管理员用户管理相关业务逻辑"""

    def list_users_with_ths_accounts(
        self,
        page: int = 1,
        page_size: int = 20,
        keyword: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        获取用户列表（含同花顺账号信息）
        
        Args:
            page: 页码
            page_size: 每页数量
            keyword: 搜索关键词
            
        Returns:
            {"users": [...], "total": int, "page": int, "page_size": int}
        """
        try:
            # 查询用户列表
            users, total = user_dao.list_with_pagination(page, page_size, keyword)
            
            # 获取所有用户的同花顺账号
            user_ids = [u.id for u in users]
            ths_accounts = ths_account_dao.find_by_user_ids(user_ids)
            
            # 按用户ID分组
            user_ths_map: Dict[int, List[ThsAccount]] = {}
            for acc in ths_accounts:
                if acc.user_id not in user_ths_map:
                    user_ths_map[acc.user_id] = []
                user_ths_map[acc.user_id].append(acc)
            
            # 构建响应
            user_list = []
            for user in users:
                ths_account_list = []
                for acc in user_ths_map.get(user.id, []):
                    # 检查该账号是否有Cookie（通过统一的登录服务）
                    session = ths_login_service.get_session(acc.ths_account)
                    has_cookie = bool(session and session.get("cookies"))
                    
                    ths_account_list.append({
                        "ths_account": acc.ths_account,
                        "nickname": acc.nickname,
                        "is_active": acc.is_active,
                        "has_cookie": has_cookie,
                        "mobile": acc.mobile,
                        "last_login_method": acc.last_login_method,
                        "last_login_at": acc.last_login_at.isoformat() if acc.last_login_at else None,
                        "message_forward_enabled": acc.message_forward_enabled,
                        "message_forward_type": acc.message_forward_type,
                        "auto_relogin_enabled": acc.auto_relogin_enabled,
                    })
                
                user_list.append({
                    "username": user.username,
                    "nickname": user.nickname,
                    "is_active": user.is_active,
                    "is_admin": user.is_admin,
                    "created_at": user.created_at.isoformat() if user.created_at else "",
                    "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
                    "ths_accounts": ths_account_list,
                    "pushplus_friend_token": user.pushplus_friend_token,
                })
            
            return {
                "users": user_list,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        except Exception as e:
            logger.error(f"获取用户列表失败: {e}")
            raise


    def delete_ths_cookie(self, user_id: int, ths_account: str) -> bool:
        """
        删除用户的同花顺Cookie
        
        Args:
            user_id: 用户ID
            ths_account: 同花顺账号
            
        Returns:
            是否成功
        """
        try:
            ths_login_service.logout(ths_account)
            logger.info(f"已删除用户 {user_id} 的同花顺账号 {ths_account} Cookie")
            return True
        except Exception as e:
            logger.error(f"删除Cookie失败: {e}")
            raise


    def update_ths_account_config(
        self,
        ths_account: str,
        user_id: int,
        auto_relogin_enabled: Optional[bool] = None,
        message_forward_enabled: Optional[bool] = None,
        message_forward_token: Optional[str] = None,
        message_forward_type: Optional[str] = None,
        nickname: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> bool:
        """更新同花顺账号配置"""
        try:
            from app.dao.ths_account_dao import ths_account_dao
            from datetime import datetime
            
            # 通过ths_account和user_id查询账号（权限验证）
            account = ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
            if not account:
                return False
            
            # 更新字段
            if auto_relogin_enabled is not None:
                account.auto_relogin_enabled = auto_relogin_enabled
            if message_forward_enabled is not None:
                account.message_forward_enabled = message_forward_enabled
            if message_forward_token is not None:
                account.message_forward_token = message_forward_token
            if message_forward_type is not None:
                account.message_forward_type = message_forward_type
            if nickname is not None:
                account.nickname = nickname
            if is_active is not None:
                account.is_active = is_active
            
            account.updated_at = datetime.now()
            ths_account_dao.update(account)
            
            logger.info(f"同花顺账号 {ths_account} 配置已更新")
            return True
        except Exception as e:
            logger.error(f"更新同花顺账号配置失败: {e}")
            raise

    def update_user_status_by_username(self, username: str, is_active: bool):
        """通过用户名更新用户状态"""
        try:
            from app.dao.user_dao import user_dao
            from datetime import datetime
            
            # 通过用户名查找用户
            user = user_dao.find_by_username(username)
            if not user:
                return None
                
            # 更新状态
            user.is_active = is_active
            user.updated_at = datetime.now()
            
            # 保存更新
            updated_user = user_dao.update(user)
            logger.info(f"用户 {username} 状态已更新为 {'启用' if is_active else '禁用'}")
            return updated_user
            
        except Exception as e:
            logger.error(f"更新用户状态失败: {e}")
            raise
    
    def update_user_pushplus_token(self, username: str, pushplus_friend_token: Optional[str]) -> bool:
        """更新用户的消息推送令牌
        
        Args:
            username: 用户名
            pushplus_friend_token: 推送令牌（传None或空字符串表示清除）
        """
        try:
            from datetime import datetime
            
            user = user_dao.find_by_username(username)
            if not user:
                return False
            
            # 空字符串转为 None
            user.pushplus_friend_token = pushplus_friend_token if pushplus_friend_token else None
            user.updated_at = datetime.now()
            
            user_dao.update(user)
            logger.info(f"用户 {username} 推送令牌已更新")
            return True
        except Exception as e:
            logger.error(f"更新用户推送令牌失败: {e}")
            raise

    def delete_user(self, user_id: int) -> bool:
        """删除用户及其关联数据"""
        try:
            from app.dao.user_dao import user_dao
            from app.dao.ths_account_dao import ths_account_dao
            from app.services.external.ths.auth.login_service import ths_login_service
            from datetime import datetime
            
            # 查找用户
            user = user_dao.find_by_id(user_id)
            if not user:
                return False
                
            # 删除用户相关的同花顺账号
            ths_accounts = ths_account_dao.find_by_user(user_id)
            for account in ths_accounts:
                # 清理登录会话
                try:
                    ths_login_service.logout(account.ths_account)
                except Exception as e:
                    logger.warning(f"清理用户 {user.username} 的同花顺会话失败: {e}")
                
                # 删除账号记录
                ths_account_dao.delete(account)
                
            # 删除用户
            user_dao.delete(user)
            
            logger.info(f"用户已删除: {user.username} (ID: {user_id})")
            return True
            
        except Exception as e:
            logger.error(f"删除用户失败: {e}")
            return False


# 全局服务实例
admin_user_service = AdminUserService()
