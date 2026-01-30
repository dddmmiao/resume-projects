/**
 * 同花顺登录相关类型定义
 * 桌面端和移动端共用
 */

/**
 * 登录方式
 */
export type LoginMethod = 'qr' | 'sms' | 'password' | 'cookie';

/**
 * 二维码状态机
 */
export type QrState = 
  | { type: 'idle' }                                          // 空闲
  | { type: 'loading' }                                       // 生成中
  | { type: 'ready'; sessionId: string; image: string }       // 就绪，等待扫码
  | { type: 'polling'; sessionId: string; image: string }     // 轮询中
  | { type: 'success' }                                       // 登录成功
  | { type: 'expired' }                                       // 已过期
  | { type: 'error'; message?: string };                      // 错误
