// 可复用的工具栏按钮组件

import React from 'react';
import { Theme, getThemeColors } from './theme.ts';

interface ToolbarButtonProps {
  theme: Theme;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  activeColor?: string;
  style?: React.CSSProperties;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  theme,
  onClick,
  children,
  active = false,
  activeColor,
  style
}) => {
  const currentTheme = getThemeColors(theme);
  const resolvedActiveColor = activeColor || currentTheme.primary;

  return (
    <div
      onClick={onClick}
      style={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '0 12px',
        height: 32,
        borderRadius: 6,
        background: currentTheme.card, 
        border: `1px solid ${currentTheme.border}`,
        color: active ? resolvedActiveColor : currentTheme.text,
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {children}
    </div>
  );
};

