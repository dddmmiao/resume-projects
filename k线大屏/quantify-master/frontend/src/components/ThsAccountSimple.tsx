import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, message } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore.ts';
import ThsLoginModal from './ThsLoginModal.tsx';
import authFetch from '../utils/authFetch.ts';

interface ThsAccountSimpleProps {
  style?: React.CSSProperties;
  hideLoginButton?: boolean; // 隐藏登录按钮，用于移动端已有其他登录入口的情况
}

/**
 * 简化版同花顺账号组件 - 单账号在线模式
 * 只显示当前登录的账号，支持退出和登录
 */
export const ThsAccountSimple: React.FC<ThsAccountSimpleProps> = ({ style = {}, hideLoginButton = false }) => {
  const theme = useAppStore(state => state.dashboardTheme);
  const thsAccounts = useAppStore(state => state.thsAccounts);
  
  // 直接从全局状态获取当前在线账号，避免闪烁
  const currentOnlineAccount = thsAccounts.find(acc => acc.is_online && acc.is_active);
  const [currentAccount, setCurrentAccount] = useState<any>(currentOnlineAccount || null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);

  // 主题样式配置
  const getThemeStyles = () => {
    const isLight = theme === 'light';
    return {
      button: {
        background: isLight ? '#ffffff' : 'rgba(255,255,255,0.06)',
        border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.12)',
        color: isLight ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.88)',
        borderRadius: 6,
      },
      text: {
        primary: isLight ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.88)',
        secondary: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
      },
      bindButton: {
        background: isLight ? '#1890ff' : '#1890ff',
        border: 'none',
        color: '#ffffff',
        borderRadius: 6,
      }
    };
  };

  const themeStyles = getThemeStyles();

  // 组件不主动加载数据，依赖Dashboard页面的预加载
  const initializeAccounts = useCallback(async () => {
    // 只处理本地状态同步
    if (thsAccounts.length === 0) {
      setCurrentAccount(null);
    }
  }, [thsAccounts.length]);

  // 监听全局账号状态变化，同步更新本地状态
  useEffect(() => {
    const currentOnline = thsAccounts.find(acc => acc.is_online && acc.is_active);
    const newAccount = currentOnline ? {
      ths_account: currentOnline.ths_account,
      nickname: currentOnline.nickname || undefined,
      is_active: currentOnline.is_active,
      is_online: currentOnline.is_online
    } : null;
    
    // 只有当账号状态真正发生变化时才更新，避免不必要的重渲染
    if (JSON.stringify(currentAccount) !== JSON.stringify(newAccount)) {
      setCurrentAccount(newAccount);
    }
  }, [thsAccounts, currentAccount]);

  // 退出当前账号
  const handleLogout = useCallback(async () => {
    if (!currentAccount?.ths_account) return;

    try {
      const response = await authFetch('/api/ths/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ths_account: currentAccount.ths_account })
      });

      if (response.ok) {
        message.success('已退出同花顺账号');
        useAppStore.getState().loadThsAccounts();
      } else {
        message.error('退出失败，请重试');
      }
    } catch (error) {
      console.error('退出账号失败:', error);
      message.error('退出失败，请重试');
    }
  }, [currentAccount]);

  // 登录账号（无账号时）
  const handleLoginAccount = useCallback(() => {
    setLoginModalVisible(true);
  }, []);

  // 登录成功回调
  const handleLoginSuccess = useCallback(async (newUsername?: string) => {
    setLoginModalVisible(false);
    // 账号数据会通过ThsLoginModal的成功回调自动更新全局状态
  }, []);

  // 组件挂载时初始化
  useEffect(() => {
    initializeAccounts();
  }, [initializeAccounts]);

  // 状态指示器
  const StatusDot: React.FC<{ online: boolean }> = ({ online }) => (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: online ? '#52c41a' : '#d9d9d9',
        flexShrink: 0
      }}
    />
  );

  const content = (() => {
    // 无账号状态 - 根据hideLoginButton决定是否显示登录按钮
    if (!currentAccount) {
      if (hideLoginButton) {
        // 移动端等已有其他登录入口的情况，显示提示文字
        return (
          <div style={{
            padding: '8px 12px',
            color: themeStyles.text.secondary,
            fontSize: '14px',
            textAlign: 'center'
          }}>
            暂无同花顺账号
          </div>
        );
      }
      
      return (
        <Button
          type="primary"
          onClick={handleLoginAccount}
          style={{
            ...themeStyles.bindButton,
            ...style,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            height: 36,
          }}
        >
          登录同花顺账号
        </Button>
      );
    }

    // 有账号状态 - 显示当前账号和切换按钮
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 当前账号显示 */}
        <Button
          style={{
            ...themeStyles.button,
            ...style,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            height: 36,
            cursor: 'default',
          }}
        >
          <Space size={6} style={{ color: themeStyles.text.primary }}>
            <StatusDot online={currentAccount.is_online} />
            <div>
              <div style={{
                fontSize: '14px',
                fontWeight: 500,
                lineHeight: 1,
                color: currentAccount.is_online ? themeStyles.text.primary : themeStyles.text.secondary
              }}>
                {currentAccount.nickname || currentAccount.ths_account}
              </div>
              <div style={{
                fontSize: '11px',
                marginTop: 2,
                color: currentAccount.is_online ? '#52c41a' : themeStyles.text.secondary,
                lineHeight: 1
              }}>
              </div>
            </div>
          </Space>
        </Button>

        {/* 退出账号按钮 */}
        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{
            height: 36,
            padding: '0 8px',
            color: themeStyles.text.secondary,
            border: 'none',
            background: 'transparent'
          }}
          title="退出账号"
        />
      </div>
    );
  })();

  return (
    <>
      {content}
      <ThsLoginModal
        open={loginModalVisible}
        onClose={() => setLoginModalVisible(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
};
