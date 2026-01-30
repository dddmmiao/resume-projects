"""
用户服务 - 统一的用户相关业务逻辑
包括认证、注册、用户信息管理等，集成缓存优化
"""

from typing import Optional
from loguru import logger

from app.models.entities import User
from app.dao.user_dao import user_dao
from app.dao.invitation_code_dao import invitation_code_dao
from app.utils.auth import verify_password, get_password_hash
from app.services.core.cache_service import cache_service, service_cached
from app.services.core.user_cache_keys import user_cache_keys

# 业务异常常量
USERNAME_EXISTS = "USERNAME_EXISTS"
INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
USER_DISABLED = "USER_DISABLED"
INVALID_INVITATION_CODE = "INVALID_INVITATION_CODE"


class UserService:
    """统一的用户服务类"""

    # ========== 认证相关方法 ==========

    def register(
        self,
        username: str,
        password: str,
        nickname: Optional[str] = None,
        invitation_code: Optional[str] = None,
    ) -> User:
        """注册新用户"""
        try:
            # 验证邀请码（必填）
            if not invitation_code:
                raise ValueError(INVALID_INVITATION_CODE)
            
            is_valid, msg = invitation_code_dao.validate_code(invitation_code)
            if not is_valid:
                logger.warning(f"邀请码验证失败: {msg}")
                raise ValueError(INVALID_INVITATION_CODE)
            
            # 检查用户名是否已存在
            existing_user = user_dao.find_by_username(username)
            if existing_user:
                raise ValueError(USERNAME_EXISTS)

            # 构建新用户对象
            new_user = User(
                username=username,
                password_hash=get_password_hash(password),
                nickname=nickname or username,
                is_active=True,
                is_admin=False,
            )

            # 调用 DAO 创建用户
            created_user = user_dao.create(new_user)
            
            # 使用邀请码（增加使用次数）
            invitation_code_dao.use_code(invitation_code)

            logger.info(f"新用户注册成功: {created_user.username} (ID: {created_user.id}), 使用邀请码: {invitation_code}")
            return created_user
        except ValueError:
            # 业务校验类错误直接抛出，由上层处理
            raise
        except Exception as e:
            logger.error(f"用户注册失败: {e}")
            raise

    def authenticate(self, username: str, password: str) -> Optional[User]:
        """用户认证"""
        try:
            # 查询用户
            user = user_dao.find_by_username(username)

            if not user:
                raise ValueError(INVALID_CREDENTIALS)

            # 验证密码
            if not user.password_hash or not verify_password(password, user.password_hash):
                raise ValueError(INVALID_CREDENTIALS)

            # 检查用户状态
            if not user.is_active:
                raise ValueError(USER_DISABLED)

            # 更新最后登录时间（调用 DAO）
            updated_user = user_dao.update_last_login(user.id)

            logger.info(f"用户登录成功: {user.username} (ID: {user.id})")
            return updated_user or user
        except ValueError:
            # 业务错误直接抛出，由上层决定返回内容
            raise
        except Exception as e:
            logger.error(f"用户登录失败: {e}")
            raise

    # ========== 用户信息管理方法 ==========
    def find_user_by_id(self, user_id: int) -> Optional[User]:
        """
        根据用户ID查找用户
        """
        try:
            return user_dao.find_by_id(user_id)
        except Exception as e:
            logger.error(f"根据用户ID查找用户失败: {e}")
            return None

    def find_user_by_username(self, username: str) -> Optional[User]:
        """
        根据用户名查找用户
        
        用于认证和权限检查，访问频繁但用户名不常变
        """
        try:
            return user_dao.find_by_username(username)
        except Exception as e:
            logger.error(f"根据用户名查找用户失败: {e}")
            return None

    def update_profile(
        self,
        user_id: int,
        nickname: Optional[str] = None
    ) -> Optional[User]:
        """
        更新用户个人信息（统一方法，带缓存清理）
        """
        try:
            updated_user = user_dao.update_profile(user_id, nickname)
            if updated_user:
                # 清理相关缓存
                cache_service.delete_keys_by_patterns(
                    user_cache_keys.user_profile_cache_patterns(user_id, updated_user.username)
                )
                logger.info(f"用户更新个人信息: {updated_user.username} (ID: {updated_user.id})")
            return updated_user
        except Exception as e:
            logger.error(f"更新个人信息失败: {e}")
            raise

    def update_pushplus_token(
        self,
        user_id: int,
        friend_token: Optional[str] = None
    ) -> Optional[User]:
        """
        更新用户的PushPlus好友令牌
        
        Args:
            user_id: 用户ID
            friend_token: PushPlus好友令牌（传None或空字符串表示清除）
        """
        try:
            updated_user = user_dao.update_pushplus_token(user_id, friend_token)
            if updated_user:
                logger.info(f"用户更新PushPlus令牌: {updated_user.username} (ID: {updated_user.id})")
            return updated_user
        except Exception as e:
            logger.error(f"更新PushPlus令牌失败: {e}")
            raise


# 全局服务实例
user_service = UserService()
