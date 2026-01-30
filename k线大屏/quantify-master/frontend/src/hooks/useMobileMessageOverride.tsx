import React, { useEffect, useState, useCallback } from 'react';
import { message } from 'antd';

export type MobileToastType = 'success' | 'error' | 'info' | 'warning';

interface MobileToastItem {
  id: number;
  type: MobileToastType;
  content: React.ReactNode;
}

interface UseMobileMessageOverrideResult {
  MobileToastHost: React.FC;
}

// 在移动端页面内部调用，用于接管 antd message 的渲染。
export const useMobileMessageOverride = (isMobile: boolean): UseMobileMessageOverrideResult => {
  const [toasts, setToasts] = useState<MobileToastItem[]>([]);

  const showMobileToast = useCallback(
    (type: MobileToastType, content: React.ReactNode, durationSeconds?: number) => {
      if (!content) return;
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, type, content }]);
      const ms = Math.max(500, (durationSeconds ?? 2) * 1000);
      window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, ms);
    },
    []
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const original = {
      open: message.open,
      success: message.success,
      error: message.error,
      info: message.info,
      warning: message.warning,
      destroy: message.destroy,
    } as const;

    const extractContentAndDuration = (args: any[]): { type?: MobileToastType; content: React.ReactNode; duration?: number } => {
      const [arg0, arg1] = args;
      let content: React.ReactNode = '';
      let duration: number | undefined;
      let type: MobileToastType | undefined;

      if (arg0 && typeof arg0 === 'object' && !React.isValidElement(arg0)) {
        content = arg0.content ?? '';
        if (typeof arg0.duration === 'number') duration = arg0.duration;
        if (arg0.type && ['success', 'error', 'info', 'warning'].includes(arg0.type)) {
          type = arg0.type as MobileToastType;
        }
      } else {
        if (arg0 !== undefined) content = arg0;
        if (typeof arg1 === 'number') duration = arg1;
      }

      return { type, content, duration };
    };

    // @ts-ignore
    message.open = (...args: any[]) => {
      const { type, content, duration } = extractContentAndDuration(args);
      const finalType: MobileToastType = type || 'info';
      showMobileToast(finalType, content, duration);
      return {} as any;
    };

    const wrapType = (t: MobileToastType) =>
      // @ts-ignore
      (...args: any[]) => {
        const { content, duration } = extractContentAndDuration(args);
        showMobileToast(t, content, duration);
        return {} as any;
      };

    // @ts-ignore
    message.success = wrapType('success');
    // @ts-ignore
    message.error = wrapType('error');
    // @ts-ignore
    message.info = wrapType('info');
    // @ts-ignore
    message.warning = wrapType('warning');

    // @ts-ignore
    message.destroy = () => {
      clearToasts();
      return {} as any;
    };

    return () => {
      // 恢复原始实现
      // @ts-ignore
      message.open = original.open;
      // @ts-ignore
      message.success = original.success;
      // @ts-ignore
      message.error = original.error;
      // @ts-ignore
      message.info = original.info;
      // @ts-ignore
      message.warning = original.warning;
      // @ts-ignore
      message.destroy = original.destroy;
    };
  }, [isMobile, showMobileToast, clearToasts]);

  const MobileToastHost: React.FC = () => {
    if (!toasts.length) return null;

    // 获取图标和颜色配置
    const getToastConfig = (type: MobileToastType) => {
      switch (type) {
        case 'success':
          return { icon: '✓', bg: '#52c41a', iconBg: 'rgba(82, 196, 26, 0.15)' };
        case 'error':
          return { icon: '✕', bg: '#ff4d4f', iconBg: 'rgba(255, 77, 79, 0.15)' };
        case 'warning':
          return { icon: '!', bg: '#faad14', iconBg: 'rgba(250, 173, 20, 0.15)' };
        default:
          return { icon: 'i', bg: '#1677ff', iconBg: 'rgba(22, 119, 255, 0.15)' };
      }
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const config = getToastConfig(toast.type);
          return (
            <div
              key={toast.id}
              style={{
                minWidth: 120,
                maxWidth: 280,
                padding: '16px 20px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                pointerEvents: 'auto',
                animation: 'mobileToastFadeIn 0.2s ease-out',
              }}
            >
              {/* 图标 */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: config.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                  fontSize: 18,
                  fontWeight: 700,
                  color: config.bg,
                }}
              >
                {config.icon}
              </div>
              {/* 内容 */}
              <div style={{ 
                fontWeight: 500,
                wordBreak: 'break-word',
              }}>
                {toast.content}
              </div>
            </div>
          );
        })}
        {/* 动画样式 */}
        <style>{`
          @keyframes mobileToastFadeIn {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    );
  };

  return { MobileToastHost };
};
