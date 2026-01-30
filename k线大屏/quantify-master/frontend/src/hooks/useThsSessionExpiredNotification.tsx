/**
 * 同花顺登录态过期全局通知Hook
 * 
 * 监听ths-session-expired事件，在任意页面显示登录过期通知
 */
import { useEffect, useCallback, useRef } from 'react';
import { notification, Button } from 'antd';
import { useAppStore } from '../stores/useAppStore.ts';

interface ThsSessionExpiredEventDetail {
  user_id: number;
  ths_account: string;
  message: string;
}

export const useThsSessionExpiredNotification = () => {
  const setThsLoginModalOpen = useAppStore(state => state.setThsLoginModalOpen);
  
  // 防止重复通知
  const lastNotificationRef = useRef<{ account: string; time: number } | null>(null);
  const DEBOUNCE_MS = 5000; // 5秒内同一账号不重复通知

  const handleSessionExpired = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<ThsSessionExpiredEventDetail>;
    const { ths_account, message } = customEvent.detail;
    
    // 防抖：5秒内同一账号不重复通知
    const now = Date.now();
    if (
      lastNotificationRef.current?.account === ths_account &&
      now - lastNotificationRef.current.time < DEBOUNCE_MS
    ) {
      return;
    }
    lastNotificationRef.current = { account: ths_account, time: now };

    // 显示通知
    const notificationKey = `ths-session-expired-${ths_account}`;
    notification.warning({
      key: notificationKey,
      message: '同花顺登录已过期',
      description: message || `账号 ${ths_account} 需要重新登录`,
      duration: 0, // 不自动关闭
      btn: (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            notification.destroy(notificationKey);
            setThsLoginModalOpen(true);
          }}
        >
          去登录
        </Button>
      ),
      placement: 'topRight',
    });
  }, [setThsLoginModalOpen]);

  useEffect(() => {
    window.addEventListener('ths-session-expired', handleSessionExpired);
    
    return () => {
      window.removeEventListener('ths-session-expired', handleSessionExpired);
    };
  }, [handleSessionExpired]);
};

export default useThsSessionExpiredNotification;
