import { useAppStore } from '../stores/useAppStore.ts';

/**
 * 获取当前同花顺用户名
 * 如果未登录，返回空字符串
 */
export function getThsUsername(): string {
  const state = useAppStore.getState();
  return state.thsUsername || '';
}

/**
 * 设置同花顺用户名
 */
export function setThsUsername(username: string): void {
  const state = useAppStore.getState();
  state.setThsUsername(username);
}
