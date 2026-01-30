"""
JWT认证工具类
提供密码加密、Token生成和验证功能
"""
import base64
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from loguru import logger
from config.config import settings

# JWT配置 - 与全局配置保持一致
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = getattr(settings, "ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7天

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Fernet 加密密钥（用于可逆加密，如 THS 密码）
_fernet_key = None


def _get_fernet() -> Fernet:
    """获取 Fernet 加密实例（懒加载）"""
    global _fernet_key
    if _fernet_key is None:
        # 使用 SECRET_KEY 派生 Fernet 密钥
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"ths_password_salt",
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(SECRET_KEY.encode()))
        _fernet_key = Fernet(key)
    return _fernet_key


def encrypt_password(password: str) -> str:
    """加密密码（可逆，用于 THS 等外部服务密码）
    
    Args:
        password: 明文密码
        
    Returns:
        加密后的密码
    """
    if not password:
        return ""
    try:
        f = _get_fernet()
        return f.encrypt(password.encode()).decode()
    except Exception as e:
        logger.error(f"加密密码失败: {e}")
        return ""


def decrypt_password(encrypted: str) -> Optional[str]:
    """解密密码
    
    Args:
        encrypted: 加密的密码
        
    Returns:
        解密后的明文密码，失败返回 None
    """
    if not encrypted:
        return None
    try:
        f = _get_fernet()
        return f.decrypt(encrypted.encode()).decode()
    except Exception as e:
        logger.error(f"解密密码失败: {e}")
        return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
        
    Returns:
        bool: 密码是否匹配
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"密码验证失败: {e}")
        return False


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    Args:
        password: 明文密码
        
    Returns:
        str: 哈希后的密码
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建JWT访问令牌
    
    Args:
        data: 要编码的数据（通常包含user_id、username等）
        expires_delta: 过期时间增量
        
    Returns:
        str: JWT token
    """
    to_encode = data.copy()

    # RFC7519 要求 "sub" 声明为字符串，避免 jose 解码时报 "Subject must be a string"
    subject = to_encode.get("sub")
    if subject is not None:
        to_encode["sub"] = str(subject)
    
    if expires_delta:
        expire = datetime.now() + expires_delta
    else:
        expire = datetime.now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    解码JWT访问令牌
    
    Args:
        token: JWT token
        
    Returns:
        Optional[dict]: 解码后的数据，失败返回None
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"Token解码失败: {e}")
        return None
    except Exception as e:
        logger.error(f"Token解码异常: {e}")
        return None
