/**
 * 同花顺登录相关验证工具
 */

/**
 * 验证手机号格式
 * @param mobile 手机号
 * @returns 是否有效
 */
export const isValidMobile = (mobile: string): boolean => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(mobile.trim());
};

/**
 * 验证手机号并返回错误信息
 * @param mobile 手机号
 * @returns 错误信息，如果有效则返回null
 */
export const validateMobile = (mobile: string): string | null => {
  if (!mobile.trim()) {
    return '请输入手机号';
  }
  if (!isValidMobile(mobile)) {
    return '请输入正确的手机号';
  }
  return null;
};

/**
 * 验证短信验证码格式（精确6位数字）
 * @param code 验证码
 * @returns 是否有效
 */
export const isValidSmsCode = (code: string): boolean => {
  return /^\d{6}$/.test(code.trim());
};

/**
 * 验证短信验证码并返回错误信息
 * @param code 验证码
 * @returns 错误信息，如果有效则返回null
 */
export const validateSmsCode = (code: string): string | null => {
  if (!code.trim()) {
    return '请输入验证码';
  }
  if (!isValidSmsCode(code)) {
    return '请输入6位验证码';
  }
  return null;
};

/**
 * 验证用户名/手机号
 * @param username 用户名或手机号
 * @returns 错误信息，如果有效则返回null
 */
export const validateUsername = (username: string): string | null => {
  if (!username.trim()) {
    return '请输入手机号或用户名';
  }
  return null;
};

/**
 * 验证密码
 * @param password 密码
 * @returns 错误信息，如果有效则返回null
 */
export const validatePassword = (password: string): string | null => {
  if (!password.trim()) {
    return '请输入密码';
  }
  return null;
};

/**
 * 验证Cookie字符串
 * @param cookieStr Cookie字符串
 * @returns 错误信息，如果有效则返回null
 */
export const validateCookieStr = (cookieStr: string): string | null => {
  if (!cookieStr.trim()) {
    return '请输入Cookie字符串';
  }
  return null;
};
