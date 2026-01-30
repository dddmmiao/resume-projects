import React, { useState, useEffect } from 'react';
import { Input, message } from 'antd';
import { getThemeColors, type Theme } from '../theme.ts';
import authFetch from '../../../utils/authFetch.ts';
import { BottomDrawer } from '../BottomDrawer.tsx';

interface UserEditDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialUserInfo?: any;
}

const UserEditDrawer: React.FC<UserEditDrawerProps> = ({ theme, open, onClose, onSuccess, initialUserInfo }) => {
  const currentTheme = getThemeColors(theme);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');

  // 使用父组件传入的用户信息初始化
  useEffect(() => {
    if (open && initialUserInfo) {
      setNickname(initialUserInfo.nickname || '');
    }
  }, [open, initialUserInfo]);

  // 保存个人信息
  const handleSave = async () => {
    if (!nickname.trim()) {
      message.warning('请输入昵称');
      return;
    }
    
    try {
      setSaving(true);
      const response = await authFetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        onSuccess?.();
        onClose();
      } else {
        message.error(data.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = nickname.trim() !== (initialUserInfo?.nickname || '');

  return (
    <BottomDrawer
      theme={theme}
      title="编辑资料"
      onClose={onClose}
      open={open}
      maxHeight="50vh"
      maskClosable={true}
      onSave={handleSave}
      saveLoading={saving}
      saveDisabled={!hasChanges}
    >
      <div style={{
        padding: '10px 10px',
      }}>
        {/* 昵称输入区域 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            color: currentTheme.textSecondary,
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            昵称
          </label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="请输入昵称"
            maxLength={20}
            style={{
              height: '48px',
              fontSize: '16px',
              borderRadius: '10px',
              background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
              border: 'none',
              color: currentTheme.text,
              paddingLeft: '16px',
              paddingRight: '16px',
            }}
          />
          <div style={{
            fontSize: '12px',
            color: currentTheme.textSecondary,
            marginTop: '8px',
            textAlign: 'right',
          }}>
            {nickname.length}/20
          </div>
        </div>

        {/* 提示信息 */}
        <div style={{
          fontSize: '12px',
          color: currentTheme.textSecondary,
          lineHeight: 1.6,
        }}>
          昵称将在应用内展示，支持中英文和数字
        </div>
      </div>
    </BottomDrawer>
  );
};

export default UserEditDrawer;
