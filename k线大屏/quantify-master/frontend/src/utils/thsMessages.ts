/**
 * 同花顺登录相关消息常量
 * 统一桌面端和移动端的提示消息
 */

export const ThsMessages = {
  // 验证相关
  MOBILE_EMPTY: '请输入手机号',
  MOBILE_INVALID: '请输入正确的手机号',
  SMS_CODE_EMPTY: '请输入验证码',
  SMS_CODE_INVALID: '请输入4-6位验证码',
  USERNAME_EMPTY: '请输入手机号或用户名',
  PASSWORD_EMPTY: '请输入密码',
  COOKIE_EMPTY: '请输入Cookie字符串',
  
  // 短信发送相关
  SMS_SENT: '验证码已发送',
  SMS_SEND_FAILED: '发送验证码失败',
  SMS_EXPIRED: '验证码已过期，请重新获取',
  SMS_RATE_LIMITED: (seconds: number) => `请等待${seconds}秒后重试`,
  SMS_LOGIN_FAILED: '短信登录失败',
  
  // 验证码相关
  CAPTCHA_REINIT: '请重新验证',
  CAPTCHA_REFRESH_FAILED: '刷新失败',
  CAPTCHA_VERIFY_FAILED: '验证失败，请重试',
  CAPTCHA_GETTING: '正在重新获取验证码...',
  CAPTCHA_GET_FAILED: '获取验证码失败',
  
  // 二维码相关
  QR_GENERATE_FAILED: '生成二维码失败',
  QR_EXPIRED: '二维码已过期，请刷新后重试',
  QR_RATE_LIMITED: '生成二维码过于频繁，请稍后再试',
  QR_RATE_LIMITED_SECONDS: (seconds: number) => `生成二维码过于频繁，请${seconds}秒后再试`,
  QR_SWITCH_RATE_LIMITED: (seconds: number) => `切换账号过于频繁，请${seconds}秒后再试`,
  QR_LOGIN_ERROR: '登录异常，请重试',
  
  // 通用限流消息
  RATE_LIMITED_SECONDS: (action: string, seconds: number) => `${action}过于频繁，请${seconds}秒后再试`,
  RATE_LIMITED: (action: string) => `${action}过于频繁，请稍后再试`,
  
  // 补登录相关
  LOAD_RELOGIN_STATE_FAILED: '加载补登录状态失败',
  RELOGIN_SUCCESS: '登录成功！',
  QR_SCAN_SUCCESS: '扫码登录成功！',
  MISSING_MOBILE: '缺少手机号',
  MISSING_ACCOUNT: '缺少账号信息',
  MISSING_PARAMS: '缺少必要参数',
  CAPTCHA_REQUIRED: '请完成滑块验证',
  SESSION_EXPIRED_REINIT: '会话已过期，正在重新获取...',
  
  // 登录相关
  LOGIN_SUCCESS: (nickname: string) => `登录成功！用户：${nickname}`,
  LOGIN_SESSION_REFRESHED: (nickname: string) => `${nickname} 会话已刷新`,
  LOGIN_FAILED: '登录失败',
  LOGIN_NO_ACCOUNT_INFO: '登录成功但未获取到有效的账号信息，请重试',
  LOGIN_ACCOUNT_EXISTS: '账号已存在',
  PASSWORD_LOGIN_FAILED: '密码登录失败',
  COOKIE_LOGIN_FAILED: 'Cookie登录失败',
  
} as const;

/**
 * 超时和限流常量
 */
export const ThsTimeouts = {
  QR_SESSION_TIMEOUT_MS: 180000,      // 二维码会话超时：3分钟
  SMS_SESSION_TIMEOUT_MS: 300000,     // 短信验证码超时：5分钟
  SMS_RETRY_DEBOUNCE_MS: 3000,        // 短信发送防抖：3秒
} as const;

/**
 * 处理429限流错误，返回友好提示消息
 * @param error Axios错误对象
 * @param defaultMessage 默认错误消息
 * @returns 友好提示消息
 */
export const handle429Error = (error: any, defaultMessage: string = '请求过于频繁，请稍后再试'): string => {
  if (error.response?.status === 429) {
    const retryAfter = error.response?.headers?.['x-retry-after'];
    return retryAfter 
      ? `请求过于频繁，请${retryAfter}秒后再试`
      : defaultMessage;
  }
  return error.response?.data?.message || error.response?.data?.detail || error.message || defaultMessage;
};

/**
 * 检查是否为429限流错误
 */
export const is429Error = (error: any): boolean => {
  return error.response?.status === 429;
};
