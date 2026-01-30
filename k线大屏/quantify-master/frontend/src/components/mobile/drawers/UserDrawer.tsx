import React, { useState, useEffect, useRef } from 'react';
import { Avatar, Button, message } from 'antd';
import { UserOutlined, EditOutlined, LogoutOutlined, CrownOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getThemeColors, type Theme, getCardBackgroundGradient } from '../theme.ts';
import { useAppStore } from '../../../stores/useAppStore.ts';
import authFetch from '../../../utils/authFetch.ts';
import { BottomDrawer } from '../BottomDrawer.tsx';


interface UserDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onOpenThsLogin: () => void;
  onOpenUserEdit: (userInfo: any) => void; // 🚀 传递用户信息给父组件
  onOpenSettings: () => void; // 🚀 打开设置页面
  refreshTrigger?: number; // 🚀 当这个值变化时，重新获取用户信息
  initialUserInfo?: any; // 🚀 预加载的用户信息
}

// 🚀 移动端专用同花顺账号列表组件
interface MobileThsAccountListProps {
  theme: Theme;
}

const MobileThsAccountList: React.FC<MobileThsAccountListProps> = ({ theme }) => {
  const currentTheme = getThemeColors(theme);
  const thsAccounts = useAppStore(state => state.thsAccounts);

  // 退出同花顺账号
  const handleLogout = async () => {
    const currentOnlineAccount = thsAccounts.find(acc => acc.is_online && acc.is_active);
    if (!currentOnlineAccount?.ths_account) return;

    try {
      const response = await authFetch('/api/ths/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ths_account: currentOnlineAccount.ths_account })
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
  };

  // 获取当前在线账号
  const currentOnlineAccount = thsAccounts.find(acc => acc.is_online && acc.is_active);

  // 无账号状态
  if (!currentOnlineAccount) {
    return (
      <div style={{
        padding: '16px',
        textAlign: 'center',
        color: currentTheme.textSecondary,
        fontSize: '14px',
      }}>
        暂无同花顺账号，点击上方"添加"按钮登录
      </div>
    );
  }

  // 有账号状态 - 显示当前在线账号
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* 在线状态指示器 */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: currentOnlineAccount.is_online ? '#52c41a' : '#d9d9d9',
          flexShrink: 0,
        }} />
        {/* 账号信息 - 突出显示 */}
        <div>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            color: currentTheme.text,
          }}>
            {currentOnlineAccount.nickname || currentOnlineAccount.ths_account}
          </div>
          <div style={{
            fontSize: '12px',
            color: currentOnlineAccount.is_online ? '#52c41a' : currentTheme.textSecondary,
            marginTop: '2px',
          }}>
            {currentOnlineAccount.is_online ? '在线' : '离线'}
          </div>
        </div>
      </div>
      {/* 退出账号按钮 */}
      <Button
        type="text"
        size="small"
        icon={<LogoutOutlined />}
        onClick={handleLogout}
        style={{
          color: currentTheme.textSecondary,
          fontSize: '14px',
        }}
      >
        退出
      </Button>
    </div>
  );
};

const UserDrawer: React.FC<UserDrawerProps> = ({ theme, open, onClose, onOpenThsLogin, onOpenUserEdit, onOpenSettings, refreshTrigger, initialUserInfo }) => {
  const navigate = useNavigate();
  const currentTheme = getThemeColors(theme);

  // 优先使用预加载的用户信息
  const [userInfo, setUserInfo] = useState<any>(initialUserInfo || null);
  const userInfoFetchedRef = useRef(!!initialUserInfo); // 如果有初始值则标记已获取
  const lastRefreshTriggerRef = useRef(refreshTrigger);

  // Store状态
  const hasAnyLoggedInAccount = useAppStore(state => state.hasAnyLoggedInAccount);

  // 当initialUserInfo变化时更新
  useEffect(() => {
    if (initialUserInfo && !userInfoFetchedRef.current) {
      setUserInfo(initialUserInfo);
      userInfoFetchedRef.current = true;
    }
  }, [initialUserInfo]);

  // 获取用户信息 - 只在首次打开或触发刷新时获取（无预加载数据时）
  useEffect(() => {
    // 检查是否需要强制刷新（用户编辑成功后）
    const shouldForceRefresh = refreshTrigger !== undefined && refreshTrigger !== lastRefreshTriggerRef.current;
    if (shouldForceRefresh) {
      userInfoFetchedRef.current = false;
      lastRefreshTriggerRef.current = refreshTrigger;
    }

    // 已获取过或未打开时不再请求
    if (!open || userInfoFetchedRef.current) return;

    const fetchUserProfile = async () => {
      try {
        const response = await authFetch('/api/user/profile');
        const data = await response.json();
        if (data.success) {
          setUserInfo(data.data);
          userInfoFetchedRef.current = true; // 标记已获取
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }
    };

    fetchUserProfile();
  }, [open, refreshTrigger]);

  // 处理退出登录（与桌面端保持一致）
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    message.success('已登出');
    navigate('/login');
    onClose();
  };

  const isSuperAdmin = userInfo?.is_super_admin === true;
  const isAdmin = userInfo?.is_admin === true;
  const hasAdminAccess = isSuperAdmin || isAdmin;

  return (
    <BottomDrawer
      theme={theme}
      title="用户中心"
      onClose={onClose}
      open={open}
      maxHeight="75vh"
      maskClosable={true}
      zIndex={1001}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '20px',
        padding: "10px 0 0 0"
      }}>
        {/* 用户信息卡片 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '16px',
          background: getCardBackgroundGradient(theme),
          borderRadius: '12px',
          border: `1px solid ${currentTheme.border}`,
        }}>
          <Avatar
            size={44}
            icon={<UserOutlined />}
            style={{
              backgroundColor: isSuperAdmin ? '#faad14' : isAdmin ? '#ff4d4f' : currentTheme.primary,
              color: '#ffffff',
              border: `2px solid ${isSuperAdmin ? '#faad14' : isAdmin ? '#ff4d4f' : currentTheme.primary}`,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }}>
              <span style={{
                fontWeight: 600,
                fontSize: '18px',
                color: currentTheme.text,
                lineHeight: 1.2
              }}>
                {userInfo?.nickname || userInfo?.username || '用户'}
              </span>
              {isSuperAdmin && (
                <div style={{
                  background: '#faad14',
                  color: '#000000',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}>
                  <CrownOutlined />
                  超级管理员
                </div>
              )}
              {!isSuperAdmin && isAdmin && (
                <div style={{
                  background: currentTheme.positive,
                  color: theme === 'dark' ? '#000000' : '#ffffff',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}>
                  <CrownOutlined />
                  管理员
                </div>
              )}
            </div>
            <div style={{
              color: currentTheme.textSecondary,
              fontSize: '14px',
              opacity: 0.8
            }}>
              {userInfo?.username}
            </div>
          </div>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => onOpenUserEdit(userInfo)}
            style={{
              color: currentTheme.text,
              border: 'none',
              borderRadius: '8px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            size="large"
          />
        </div>

        {/* 同花顺账号 - 与用户信息同属账号类 */}
        <div style={{
          padding: '16px',
          background: currentTheme.card,
          borderRadius: '12px',
          border: `1px solid ${currentTheme.border}`,
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: currentTheme.textSecondary,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔗 同花顺账号
            </span>
            {!hasAnyLoggedInAccount() && (
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={onOpenThsLogin}
                style={{
                  background: currentTheme.positive,
                  borderColor: currentTheme.positive,
                  color: '#ffffff',
                  borderRadius: '6px',
                  fontSize: '12px',
                  height: '28px',
                  boxShadow: 'none'
                }}
              >
                添加
              </Button>
            )}
          </div>
          <MobileThsAccountList theme={theme} />
        </div>

        {/* 操作区域 - 管理后台、设置、退出登录 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 管理后台按钮 - 管理员专属，特殊样式 */}
          {hasAdminAccess && (
            <Button
              block
              size="large"
              onClick={() => {
                onClose();
                navigate('/admin');
              }}
              icon={<CrownOutlined />}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                background: isSuperAdmin ? '#faad14' : currentTheme.positive,
                borderColor: isSuperAdmin ? '#faad14' : currentTheme.positive,
                color: '#000000',
              }}
            >
              管理后台
            </Button>
          )}
          {/* 设置按钮 - 统一样式 */}
          <Button
            block
            size="large"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            icon={<SettingOutlined />}
            style={{
              height: '48px',
              borderRadius: '12px',
              fontWeight: 500,
              background: currentTheme.card,
              borderColor: currentTheme.border,
              color: currentTheme.text,
            }}
          >
            设置
          </Button>
          {/* 退出登录按钮 - 统一样式 */}
          <Button
            block
            size="large"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{
              height: '48px',
              borderRadius: '12px',
              fontWeight: 500,
              background: currentTheme.card,
              borderColor: currentTheme.border,
              color: currentTheme.text,
            }}
          >
            退出登录
          </Button>
        </div>
      </div>

    </BottomDrawer>
  );
};

export default UserDrawer;
