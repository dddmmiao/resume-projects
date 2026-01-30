/**
 * 同花顺账号标签组件
 * 用于显示和管理用户的多个同花顺账号
 */
import React, { useEffect } from 'react';
import { Tag, Space, Modal, message } from 'antd';
import axiosInstance from '../utils/axios.ts';
import { useAppStore } from '../stores/useAppStore.ts';

interface ThsAccount {
  ths_account: string;
  nickname: string | null;
  mobile: string | null;
  is_online: boolean;
  is_active: boolean;
  last_login_at: string | null;
}

interface ThsAccountTagsProps {
  onAccountSelect?: (account: ThsAccount) => void;
  onAddAccount?: () => void;
  refreshTrigger?: number; // 用于外部触发刷新
  accounts?: ThsAccount[]; // 外部传入账号列表，避免重复请求
  onAccountsLoaded?: (accounts: ThsAccount[]) => void; // 加载完成回调
  onAccountDeleted?: () => void; // 删除成功回调，用于关闭窗口等操作
  onRefreshNeeded?: () => void; // 需要父组件刷新历史账号列表的回调
}

const ThsAccountTags: React.FC<ThsAccountTagsProps> = ({
  onAccountSelect,
  onAddAccount,
  refreshTrigger = 0,
  accounts: externalAccounts,
  onAccountsLoaded,
  onAccountDeleted,
  onRefreshNeeded
}) => {
  // 优先使用外部传入的账号列表，如果没有则使用全局store的数据
  const globalAccounts = useAppStore(state => state.thsAccounts);
  const loadThsAccounts = useAppStore(state => state.loadThsAccounts);
  const accounts = externalAccounts ?? globalAccounts;

  // 当账号数据变化时，通知父组件
  useEffect(() => {
    if (externalAccounts) return; // 外部已传入，无需处理
    // 通知父组件账号数据已加载/更新
    onAccountsLoaded?.(globalAccounts);
  }, [externalAccounts, globalAccounts, onAccountsLoaded, refreshTrigger, accounts?.length]);

  // 禁用账号（用户看到的是删除，实际是禁用）
  const handleDelete = async (thsAccount: string, accountName: string) => {
    try {
      // 判断删除的是否是当前登录账号
      const deletingCurrentAccount = accounts.find(acc => 
        acc.ths_account === thsAccount && acc.is_online && acc.is_active
      );
      
      // 使用PATCH请求禁用账号，而不是DELETE删除
      const response = await axiosInstance.patch(`/api/user/ths-accounts/${encodeURIComponent(thsAccount)}/disable`);
      if (response.data.success) {
        message.success('账号删除成功');
        
        // 立即刷新全局账号状态，确保UI更新
        try {
          await loadThsAccounts();
          
          // 等待全局状态刷新完成后，再通知父组件刷新历史账号列表
          if (onRefreshNeeded) {
            onRefreshNeeded();
          }
        } catch (error) {
          console.error('刷新账号状态失败:', error);
          // 即使刷新失败，也要通知父组件刷新，避免UI不一致
          if (onRefreshNeeded) {
            onRefreshNeeded();
          }
        }
        
        // 只有删除当前登录账号时才关闭窗口，删除其他账号时保持窗口打开
        if (deletingCurrentAccount && onAccountDeleted) {
          onAccountDeleted();
        }
      } else {
        message.error(response.data.message || '删除失败');
      }
    } catch (error: any) {
      console.error('删除账号失败:', error);
      message.error(error.response?.data?.message || '删除账号失败');
    }
  };

  // 点击账号标签
  const handleAccountClick = (account: ThsAccount) => {
    if (onAccountSelect) {
      onAccountSelect(account);
    }
  };

  // 无历史账号时不渲染
  if (accounts.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '10px' }}>
      {/* 所有账号统一显示 */}
      {accounts.length > 0 && (
        <div>
          <Space wrap size="small" align="center">
            <span style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: '13px' }}>历史账号：</span>
            {accounts.map((account) => (
              <Tag
                key={account.ths_account}
                color={account.is_online && account.is_active ? "green" : "default"}
                closable
                onClose={(e) => {
                  e.preventDefault();
                  const isOnline = account.is_online && account.is_active;
                  Modal.confirm({
                    title: isOnline ? '确认注销' : '确认删除',
                    content: isOnline 
                      ? `确定要注销当前登录的账号"${account.nickname || account.ths_account}"吗？注销后需要重新登录。`
                      : `确定要删除账号"${account.nickname || account.ths_account}"吗？`,
                    okText: isOnline ? '确定注销' : '确定',
                    cancelText: '取消',
                    okType: isOnline ? 'danger' : 'primary',
                    onOk: () => handleDelete(account.ths_account, account.nickname || account.ths_account)
                  });
                }}
                onClick={() => handleAccountClick(account)}
                style={{ 
                  cursor: 'pointer',
                  padding: '2px 8px',
                  fontSize: '12px',
                  fontWeight: account.is_online && account.is_active ? 500 : 'normal'
                }}
              >
                {account.nickname || account.ths_account}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
};

export default ThsAccountTags;
