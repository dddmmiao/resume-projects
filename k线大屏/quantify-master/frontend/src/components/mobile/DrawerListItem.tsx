// 可复用的 Drawer List Item 组件

import React, { memo, useMemo } from 'react';
import { List, Typography } from 'antd';
import { Theme, getThemeColors } from './theme.ts';

const { Text } = Typography;

interface DrawerListItemProps {
  theme: Theme;
  selected?: boolean;
  onClick: () => void;
  label: string;
  icon?: string;
  extra?: React.ReactNode;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
}

const DrawerListItemComponent: React.FC<DrawerListItemProps> = ({
  theme,
  selected = false,
  onClick,
  label,
  icon,
  extra,
  onMouseEnter,
  onMouseLeave
}) => {
  const currentTheme = useMemo(() => getThemeColors(theme), [theme]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!selected && onMouseEnter) {
      e.currentTarget.style.background = theme === 'light' 
        ? 'rgba(0, 0, 0, 0.04)' 
        : 'rgba(255, 255, 255, 0.08)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!selected && onMouseLeave) {
      e.currentTarget.style.background = 'transparent';
    }
  };

  const itemStyle = useMemo(() => ({
    padding: '14px 14px' as const,
    margin: '4px 0',
    borderRadius: '8px',
    border: 'none' as const,
    background: selected ? currentTheme.primary : 'transparent',
    cursor: 'pointer' as const
  }), [selected, currentTheme.primary]);

  const textStyle = useMemo(() => ({
    color: selected ? '#ffffff' : currentTheme.text,
    fontSize: '14px' as const,
    fontWeight: selected ? 500 : 400
  }), [selected, currentTheme.text]);

  return (
    <List.Item
      onClick={onClick}
      style={itemStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Text style={textStyle}>
        {icon && <span style={{ marginRight: 8 }}>{icon}</span>}
        {label}
      </Text>
      {extra}
    </List.Item>
  );
};

// 使用 memo 优化，只在 props 变化时重新渲染
export const DrawerListItem = memo(DrawerListItemComponent);

