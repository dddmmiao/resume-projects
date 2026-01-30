"""
同花顺服务相关常量和异常定义

提供统一的异常类型和错误文案，供 THS 相关 API 和 Service 使用
"""
from typing import Dict, Any


# ==================== 市场代码常量 ====================

# 市场类型代码映射
MARKET_CODE = {
    'SH': '17',    # 上海证券交易所
    'SHETF': '20', # 上海证券交易所ETF
    'ST': '22',    # 上海证券交易所ST
    'SZ': '33',    # 深圳证券交易所
    'SZETF': '36', # 深圳证券交易所ETF
    'ZS': '48',    # 指数
    'TI': '48',    # 指数
    'CYB': '38',   # 创业板
    'KC': '18',    # 科创板
    'BJ': '151',    # 北京证券交易所
    'HK': '55',    # 港股
    'US': '61',    # 美股
    'FT': '50',    # 期货
    'QH': '51',    # 期货主力
    'QZ': '53',    # 期指
    'OP': '79',    # 期权
    'JJ': '39',    # 基金
    'ZQ': '45',    # 债券
    'XSB': '67',   # 新三板
}

# 反向映射：代码 -> 市场名称
MARKET_NAME = {v: k for k, v in MARKET_CODE.items()}


def market_abbr(market_type: str) -> str:
    """
    将市场类型代码映射为对应的名称缩写
    """
    if not market_type:
        return market_type
    return MARKET_NAME.get(market_type, market_type)


def market_code(market_abbr_name: str) -> str:
    """
    将市场类型缩写映射为对应的代码
    """
    if not market_abbr_name:
        return market_abbr_name
    return MARKET_CODE.get(market_abbr_name.upper(), market_abbr_name)


def parse_ts_code(ts_code: str) -> tuple:
    """
    解析ts_code格式为(代码, API市场类型)
    
    Args:
        ts_code: 股票代码，如 '000016.SZ' 或 '000016'
        
    Returns:
        (code, api_market_type) 如 ('000016', '33')
    """
    if not ts_code:
        return ('', None)
    
    ts_code = ts_code.strip()
    
    if '.' in ts_code:
        code_part, market_suffix = ts_code.rsplit('.', 1)
        api_market_type = market_code(market_suffix.upper())
        return (code_part, api_market_type)
    else:
        # 没有市场后缀，尝试根据代码规则推断
        code = ts_code
        # 6开头是上海，0/3开头是深圳，8开头是北交所
        if code.startswith('6'):
            return (code, '17')  # SH
        elif code.startswith('0') or code.startswith('3'):
            return (code, '33')  # SZ
        elif code.startswith('8') or code.startswith('4'):
            return (code, '71')  # BJ
        else:
            return (code, None)


# ==================== 异常类定义 ====================

class ThsError(Exception):
    """同花顺服务基础异常"""
    
    def __init__(self, message: str = "", code: str = ""):
        self.message = message
        self.code = code
        super().__init__(message)


class ThsValidationError(ThsError):
    """
    同花顺业务校验失败
    
    例如：Cookie 无效、验证码错误、账号密码错误等
    对应 HTTP 400
    """
    pass


class ThsNetworkError(ThsError):
    """
    同花顺接口网络错误
    
    例如：DNS 解析失败、连接超时、服务不可用等
    对应 HTTP 502
    """
    pass


class ThsAuthError(ThsError):
    """
    同花顺认证失败
    
    例如：登录态过期、未登录等
    对应 HTTP 401
    """
    pass


class ThsSessionExpiredException(ThsAuthError):
    """
    同花顺登录会话过期异常
    
    用于触发前端全局通知，提示用户重新登录
    携带同花顺账号信息，便于前端显示
    """
    
    def __init__(self, ths_account: str, message: str = ""):
        self.ths_account = ths_account
        super().__init__(
            message=message or f"同花顺账号 {ths_account} 登录已过期，请重新登录",
            code="THS_SESSION_EXPIRED"
        )


# ==================== 错误文案常量 ====================

class ThsErrorMessages:
    """同花顺相关错误文案（用户可见）"""
    
    # Cookie 相关
    COOKIE_INVALID = "Cookie 验证失败：请确认已在同花顺官网登录并重新复制最新的 Cookie"
    COOKIE_EXPIRED = "Cookie 已过期，请重新登录同花顺并复制最新的 Cookie"
    
    # 网络相关
    NETWORK_ERROR = "无法连接同花顺服务器，请稍后重试"
    TIMEOUT_ERROR = "同花顺服务器响应超时，请稍后重试"
    
    # 登录相关
    LOGIN_FAILED = "登录失败，请检查账号信息后重试"
    QR_EXPIRED = "二维码已过期，请重新获取"
    QR_GENERATE_FAILED = "生成二维码失败，请稍后重试"
    SMS_SEND_FAILED = "验证码发送失败，请稍后重试"
    SMS_CODE_INVALID = "验证码错误或已过期"
    SMS_RATE_LIMITED = "验证码发送过于频繁，请稍后再试"
    PASSWORD_INVALID = "账号或密码错误"
    
    # 通用
    SERVER_ERROR = "服务器内部错误，请稍后重试"
    SESSION_NOT_FOUND = "会话不存在或已过期"
    USER_NOT_FOUND = "用户信息不存在"
    
    # 配置相关
    AT_LEAST_ONE_METHOD = "至少需要启用一种登录方式"


# ==================== HTTP 状态码映射 ====================

class ThsHttpStatus:
    """同花顺错误对应的 HTTP 状态码"""
    
    VALIDATION_ERROR = 400  # 业务校验失败
    AUTH_ERROR = 401        # 认证失败
    NOT_FOUND = 404         # 资源不存在
    RATE_LIMITED = 429      # 频率限制
    NETWORK_ERROR = 502     # 上游服务不可用
    SERVER_ERROR = 500      # 服务器内部错误
    TIMEOUT = 408           # 请求超时


# ==================== 辅助函数 ====================

def create_ths_error_response(
    error: ThsError,
    default_message: str = ThsErrorMessages.SERVER_ERROR
) -> Dict[str, Any]:
    """
    根据 ThsError 类型创建标准错误响应信息
    
    Args:
        error: ThsError 异常实例
        default_message: 默认错误文案
        
    Returns:
        {"status_code": int, "detail": str}
    """
    if isinstance(error, ThsValidationError):
        return {
            "status_code": ThsHttpStatus.VALIDATION_ERROR,
            "detail": error.message or default_message
        }
    elif isinstance(error, ThsNetworkError):
        return {
            "status_code": ThsHttpStatus.NETWORK_ERROR,
            "detail": ThsErrorMessages.NETWORK_ERROR
        }
    elif isinstance(error, ThsAuthError):
        return {
            "status_code": ThsHttpStatus.AUTH_ERROR,
            "detail": error.message or ThsErrorMessages.LOGIN_FAILED
        }
    else:
        return {
            "status_code": ThsHttpStatus.SERVER_ERROR,
            "detail": default_message
        }
