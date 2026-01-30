import React from 'react';
import { UserOutlined } from '@ant-design/icons';
import { type Theme, getThemeColors } from './theme.ts';

interface MobileUserAvatarProps {
  theme: Theme;
  onClick: () => void;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isLoading?: boolean; // 用户信息是否正在加载
}

const MobileUserAvatar: React.FC<MobileUserAvatarProps> = ({ theme, onClick, isAdmin = false, isSuperAdmin = false, isLoading = false }) => {
  const currentTheme = getThemeColors(theme);

  // 加载中显示灰色，超级管理员用金色，管理员用红色，普通用户用主题色
  const getBgColor = () => {
    if (isLoading) {
      return currentTheme.textSecondary;
    }
    if (isSuperAdmin) {
      return '#faad14'; // 超级管理员 - 金色
    }
    if (isAdmin) {
      return '#ff4d4f'; // 管理员 - 红色
    }
    return currentTheme.primary; // 普通用户 - 主题色
  };

  const iconColor = isLoading ? (theme === 'dark' ? '#a0a0a0' : '#ffffff') : '#ffffff';

  return (
    <div
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        backgroundColor: getBgColor(),
        color: iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <UserOutlined style={{ fontSize: 16 }} />
    </div>
  );
};

export default MobileUserAvatar;
