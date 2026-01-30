/**
 * 同花顺账号相关工具函数
 */
import { useAppStore } from '../stores/useAppStore.ts';

/**
 * 获取当前选中的同花顺账号
 */
export const getCurrentThsAccount = () => {
  return useAppStore.getState().currentThsAccount;
};

/**
 * 获取当前账号的ths_account字段值
 */
export const getCurrentThsAccountName = (): string | undefined => {
  const account = getCurrentThsAccount();
  return account?.ths_account;
};

/**
 * 为API请求添加当前同花顺账号的请求头
 */
export const addThsAccountHeaders = (headers: Record<string, string> = {}): Record<string, string> => {
  const accountName = getCurrentThsAccountName();
  if (accountName) {
    return {
      ...headers,
      'X-THS-Account': accountName
    };
  }
  return headers;
};

/**
 * 监听账号切换事件
 */
export const onThsAccountChanged = (callback: (account: any) => void) => {
  const handleAccountChange = (event: CustomEvent) => {
    callback(event.detail);
  };
  
  window.addEventListener('thsAccountChanged', handleAccountChange as EventListener);
  
  // 返回清理函数
  return () => {
    window.removeEventListener('thsAccountChanged', handleAccountChange as EventListener);
  };
};
