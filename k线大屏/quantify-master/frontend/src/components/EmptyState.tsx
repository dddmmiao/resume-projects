/**
 * 统一空状态组件
 * 用于列表、搜索结果等场景的空数据展示
 */

import React from 'react';

type EmptyStateType = 'empty' | 'search' | 'error' | 'offline' | 'favorites';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  searchKeyword?: string;
  theme?: 'dark' | 'light';
  action?: React.ReactNode;
}

const EMPTY_STATE_CONFIG: Record<EmptyStateType, { icon: string; defaultTitle: string; defaultDesc: string }> = {
  empty: {
    icon: '📊',
    defaultTitle: '暂无数据',
    defaultDesc: '请稍后重试',
  },
  search: {
    icon: '🔍',
    defaultTitle: '未找到结果',
    defaultDesc: '尝试其他关键词',
  },
  error: {
    icon: '⚠️',
    defaultTitle: '加载失败',
    defaultDesc: '请检查网络后重试',
  },
  offline: {
    icon: '🔌',
    defaultTitle: '服务离线',
    defaultDesc: '后端服务暂时不可用',
  },
  favorites: {
    icon: '⭐',
    defaultTitle: '暂无自选',
    defaultDesc: '点击标的卡片上的星星添加到自选',
  },
};

const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'empty',
  title,
  description,
  searchKeyword,
  theme = 'dark',
  action,
}) => {
  const config = EMPTY_STATE_CONFIG[type];
  const isDark = theme === 'dark';
  
  const displayTitle = title || config.defaultTitle;
  const displayDesc = type === 'search' && searchKeyword 
    ? `未找到与 "${searchKeyword}" 相关的结果`
    : (description || config.defaultDesc);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 48,
          marginBottom: 16,
          opacity: 0.8,
        }}
      >
        {config.icon}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
          marginBottom: 8,
        }}
      >
        {displayTitle}
      </div>
      <div
        style={{
          fontSize: 14,
          color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
          maxWidth: 300,
          lineHeight: 1.5,
        }}
      >
        {displayDesc}
      </div>
      {action && (
        <div style={{ marginTop: 20 }}>
          {action}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
