/**
 * 桌面端列表骨架屏组件
 * 与KLineCard布局一致，避免加载完成后的割裂感
 */

import React from 'react';
import { Card } from 'antd';

interface DesktopListSkeletonProps {
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  count?: number;
  compact?: boolean;
}

// 骨架块组件
const SkeletonBlock: React.FC<{ 
  width: number | string; 
  height: number; 
  theme: string;
  style?: React.CSSProperties;
}> = ({ width, height, theme, style }) => {
  const isDark = theme !== 'light';
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        ...style,
      }}
    />
  );
};

// 单个骨架卡片
const SkeletonCard: React.FC<{ theme: string; compact?: boolean }> = ({ theme, compact }) => {
  const isDark = theme !== 'light';
  
  // 紧凑模式骨架
  if (compact) {
    return (
      <Card
        style={{
          borderRadius: 12,
          animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        }}
        styles={{ body: {
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}}
      >
        {/* 左侧：名称+代码 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <SkeletonBlock width={70} height={14} theme={theme} />
            <SkeletonBlock width={45} height={12} theme={theme} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <SkeletonBlock width={35} height={16} theme={theme} style={{ borderRadius: 8 }} />
            <SkeletonBlock width={40} height={16} theme={theme} style={{ borderRadius: 8 }} />
          </div>
        </div>
        {/* 右侧：价格指标 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <SkeletonBlock width={55} height={16} theme={theme} />
          <SkeletonBlock width={45} height={14} theme={theme} />
          <SkeletonBlock width={20} height={20} theme={theme} style={{ borderRadius: 4 }} />
        </div>
      </Card>
    );
  }
  
  return (
    <Card
      style={{
        height: 380,
        borderRadius: 12,
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
      }}
      styles={{ body: {
        padding: 12,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}}
    >
      {/* Header区域 */}
      <div style={{ marginBottom: 8 }}>
        {/* 第一行：名称 + 价格 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SkeletonBlock width={80} height={16} theme={theme} />
            <SkeletonBlock width={50} height={12} theme={theme} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SkeletonBlock width={60} height={18} theme={theme} />
            <SkeletonBlock width={50} height={14} theme={theme} />
          </div>
        </div>
        {/* 第二行：标签/指标 */}
        <div style={{ display: 'flex', gap: 6 }}>
          <SkeletonBlock width={40} height={18} theme={theme} style={{ borderRadius: 9 }} />
          <SkeletonBlock width={50} height={18} theme={theme} style={{ borderRadius: 9 }} />
          <SkeletonBlock width={45} height={18} theme={theme} style={{ borderRadius: 9 }} />
        </div>
      </div>
      
      {/* 控制栏区域 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8,
        padding: '4px 0',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <SkeletonBlock width={60} height={22} theme={theme} style={{ borderRadius: 4 }} />
          <SkeletonBlock width={50} height={22} theme={theme} style={{ borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SkeletonBlock width={22} height={22} theme={theme} style={{ borderRadius: 4 }} />
          <SkeletonBlock width={22} height={22} theme={theme} style={{ borderRadius: 4 }} />
        </div>
      </div>
      
      {/* K线图区域 */}
      <div style={{ 
        flex: 1,
        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        borderRadius: 8,
        minHeight: 200,
      }} />
    </Card>
  );
};

const DesktopListSkeleton: React.FC<DesktopListSkeletonProps> = ({ 
  theme = 'dark', 
  count = 12,
  compact = false,
}) => {
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
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} theme={theme} compact={compact} />
      ))}
    </>
  );
};

export default DesktopListSkeleton;
