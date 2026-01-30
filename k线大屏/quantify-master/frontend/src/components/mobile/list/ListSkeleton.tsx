/**
 * 移动端列表骨架屏组件
 * 与StockCard布局完全一致，避免加载完成后的割裂感
 */

import React from 'react';
import { getThemeColors, getCardBackgroundGradient, type Theme } from '../theme.ts';

interface ListSkeletonProps {
  theme: Theme;
  count?: number;
  layout?: 'list' | 'grid' | 'large';
}

// 骨架块组件
const SkeletonBlock: React.FC<{ 
  width: number | string; 
  height: number; 
  theme: Theme;
  style?: React.CSSProperties;
}> = ({ width, height, theme, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 4,
      background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      ...style,
    }}
  />
);

// 单个骨架卡片 - 与StockCard布局完全一致
const SkeletonCard: React.FC<{ theme: Theme; layout: string }> = ({ theme, layout }) => {
  const currentTheme = getThemeColors(theme);
  
  // 与StockCard完全一致的样式
  const cardStyle: React.CSSProperties = {
    background: currentTheme.card,
    borderRadius: layout === 'large' ? 12 : 10,
    padding: layout === 'large' ? '8px' : (layout === 'grid' ? '6px' : '8px'),
    border: `1px solid ${currentTheme.border}`,
    boxShadow: theme === 'light' 
      ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' 
      : '0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)',
    backgroundImage: getCardBackgroundGradient(theme),
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
  };

  if (layout === 'large') {
    // 大卡布局：一行显示所有信息
    return (
      <div style={cardStyle}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 4,
          gap: 6
        }}>
          {/* 左侧：名称 + code */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SkeletonBlock width={70} height={16} theme={theme} />
            <SkeletonBlock width={45} height={11} theme={theme} />
          </div>
          {/* 右侧：涨跌幅 + 收盘价 + 涨跌值 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <SkeletonBlock width={55} height={14} theme={theme} />
            <SkeletonBlock width={45} height={14} theme={theme} />
            <SkeletonBlock width={40} height={14} theme={theme} />
          </div>
        </div>
        {/* K线图区域 - large布局180px */}
        <div style={{ 
          height: 180, 
          background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderRadius: 6,
        }} />
      </div>
    );
  }
  
  // 网格布局：两行显示
  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 2 }}>
        {/* 第一行：名称 + code */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3, gap: 4 }}>
          <SkeletonBlock width={60} height={14} theme={theme} style={{ flex: 'none' }} />
          <SkeletonBlock width={40} height={10} theme={theme} />
        </div>
        {/* 第二行：涨跌幅 + 收盘价 + 涨跌值 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <SkeletonBlock width={50} height={13} theme={theme} />
          <SkeletonBlock width={40} height={13} theme={theme} />
          <SkeletonBlock width={35} height={13} theme={theme} />
        </div>
      </div>
      {/* K线图区域 */}
      {layout === 'grid' && (
        <div style={{ 
          height: 120, 
          background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderRadius: 6,
          marginTop: 2,
        }} />
      )}
    </div>
  );
};

const ListSkeleton: React.FC<ListSkeletonProps> = ({ 
  theme, 
  count = 8,
  layout = 'grid' 
}) => {
  // 与MobileListSection完全一致的网格逻辑
  const isGridLayout = layout === 'grid';
  
  return (
    <>
      <style>
        {`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}
      </style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isGridLayout ? '1fr 1fr' : '1fr',
          gap: isGridLayout ? 6 : 8,
        }}
      >
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonCard key={index} theme={theme} layout={layout} />
        ))}
      </div>
    </>
  );
};

export default ListSkeleton;
