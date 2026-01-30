"""
同花顺账号管理服务
"""

from datetime import datetime
from typing import List, Optional

from loguru import logger

from app.dao.ths_account_dao import ths_account_dao
from app.models.entities import ThsAccount
from app.services.core.cache_service import cache_service
from app.services.core.cache_service import service_cached
from app.services.core.user_cache_keys import user_cache_keys


class ThsAccountService:
    """同花顺账号管理服务"""

    @service_cached("", key_fn=lambda self, user_id: user_cache_keys.ths_account_ids(user_id), ttl_seconds=24*3600)
    def _get_user_account_ids(self, user_id: int) -> List[int]:
        """
        获取用户的账号ID列表（只缓存ID，避免SQLModel序列化问题）
        """
        try:
            accounts = ths_account_dao.find_by_user_id(user_id)
            return [acc.id for acc in accounts if acc.id is not None]
        except Exception as e:
            logger.error(f"获取用户账号ID列表失败: {e}")
            return []

    def get_user_accounts(self, user_id: int) -> List[ThsAccount]:
        """
        获取用户的所有同花顺账号（通过缓存的ID列表查询完整对象）
        """
        try:
            account_ids = self._get_user_account_ids(user_id)
            if not account_ids:
                return []
            return ths_account_dao.find_by_ids(account_ids)
        except Exception as e:
            logger.error(f"获取用户账号列表失败: {e}")
            return []

    def get_account_by_ths_account_and_user(self, ths_account: str, user_id: int) -> Optional[ThsAccount]:
        """
        根据ths_account获取账号并验证用户权限
        """
        try:
            # 直接通过DAO查询，确保返回正确的SQLModel对象
            return ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
        except Exception as e:
            logger.error(f"根据ths_account获取账号失败: {e}")
            return None

    def create_account(
        self,
        user_id: int,
        ths_account: str,
        nickname: Optional[str] = None,
        mobile: Optional[str] = None,
        account_type: str = "mobile",
        login_method: Optional[str] = None
    ) -> Optional[ThsAccount]:
        """
        创建同花顺账号
        
        Args:
            user_id: 用户ID
            ths_account: 同花顺账号
            nickname: 账号昵称
            mobile: 手机号
            account_type: 账号类型
            login_method: 登录方式
            
        Returns:
            创建的账号
        """
        try:
            # 业务逻辑：检查是否已存在
            existing = ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
            if existing:
                # 已存在同一账号时，更新最近登录方式和时间等信息
                if nickname:
                    existing.nickname = nickname
                if mobile:
                    existing.mobile = mobile
                existing.last_login_method = login_method
                existing.last_login_at = datetime.now()
                existing.is_active = True

                updated_account = ths_account_dao.update(existing)

                # 清理实际使用的缓存键
                cache_service.delete(user_cache_keys.ths_account_ids(user_id))

                logger.info(f"更新同花顺账号登录信息成功: {ths_account} (用户ID: {user_id})")
                return updated_account

            # 业务逻辑：构建账号对象（首次创建）
            account = ThsAccount(
                user_id=user_id,
                ths_account=ths_account,
                account_type=account_type,
                nickname=nickname or ths_account,
                mobile=mobile,
                last_login_method=login_method,
                last_login_at=datetime.now(),  # 使用系统时间
                is_active=True
            )
            
            # 调用DAO创建
            created_account = ths_account_dao.create(account)
            
            # 清理实际使用的缓存键
            cache_service.delete(user_cache_keys.ths_account_ids(user_id))
            
            logger.info(f"创建同花顺账号成功: {ths_account} (用户ID: {user_id})")
            return created_account
                
        except Exception as e:
            logger.error(f"创建账号失败: {e}")
            return None

    def update_account_by_ths_account(
        self,
        ths_account: str,
        user_id: int,
        nickname: Optional[str] = None,
        is_active: Optional[bool] = None,
        remark: Optional[str] = None
    ) -> Optional[ThsAccount]:
        """
        根据ts_account更新账号信息
        用于安全的账号操作，避免暴露内部ID
        
        Args:
            ths_account: 同花顺账号标识符
            user_id: 用户ID
            nickname: 昵称
            is_active: 是否启用
            remark: 备注
            
        Returns:
            更新后的账号
        """
        try:
            # 业务逻辑：查询并验证权限
            account = ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
            if not account:
                logger.warning(f"账号不存在或无权限: {ths_account}")
                return None

            # 业务逻辑：更新字段
            if nickname is not None:
                account.nickname = nickname
            if is_active is not None:
                account.is_active = is_active
            if remark is not None:
                account.remark = remark
            
            # 调用DAO更新
            updated_account = ths_account_dao.update(account)
            
            # 清理账号缓存
            cache_service.delete(user_cache_keys.ths_account_ids(user_id))
            
            logger.info(f"更新账号成功: {ths_account}")
            return updated_account
                
        except Exception as e:
            logger.error(f"更新账号失败: {e}")
            return None

    def disable_account_by_ths_account(self, ths_account: str, user_id: int) -> bool:
        """
        根据ts_account禁用账号（用户看到的是删除，实际是禁用以避免数据丢失）
        用于安全的账号操作，避免暴露内部ID
        
        Args:
            ths_account: 同花顺账号标识符
            user_id: 用户ID
            
        Returns:
            是否成功
        """
        try:
            # 业务逻辑：查询并验证权限
            account = ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
            if not account:
                logger.warning(f"账号不存在或无权限: {ths_account}")
                return False

            # 禁用账号：设置为不活跃状态
            account.is_active = False
            account.updated_at = datetime.now()
            
            # 调用DAO更新
            ths_account_dao.update(account)
            
            # 清理账号缓存
            cache_service.delete(user_cache_keys.ths_account_ids(user_id))
            
            # 使用 ThsLoginService 清理 Session
            from app.services.external.ths.auth.login_service import ths_login_service
            ths_login_service.logout(ths_account)
            
            logger.info(f"禁用账号成功: {ths_account}")
            return True
                
        except Exception as e:
            logger.error(f"禁用账号失败: {e}")
            return False

    def delete_account_by_ths_account(self, ths_account: str, user_id: int) -> bool:
        """
        根据ts_account删除账号（真实删除）
        用于安全的账号操作，避免暴露内部ID
        
        Args:
            ths_account: 同花顺账号标识符
            user_id: 用户ID
            
        Returns:
            是否成功
        """
        try:
            # 业务逻辑：查询并验证权限
            account = ths_account_dao.find_by_ths_account_and_user(ths_account, user_id)
            if not account:
                logger.warning(f"账号不存在或无权限: {ths_account}")
                return False

            # 调用DAO删除
            ths_account_dao.delete(account)
            
            # 清理账号缓存
            cache_service.delete(user_cache_keys.ths_account_ids(user_id))
            
            # 使用 ThsLoginService 清理 Session
            from app.services.external.ths.auth.login_service import ths_login_service
            ths_login_service.logout(ths_account)
            
            logger.info(f"删除账号成功: {ths_account}")
            return True
                
        except Exception as e:
            logger.error(f"删除账号失败: {e}")
            return False


# 全局服务实例
ths_account_service = ThsAccountService()
