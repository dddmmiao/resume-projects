/**
 * 移动端下拉刷新组件
 * 支持触摸手势下拉刷新列表
 */

import React, { useState, useRef, useCallback, ReactNode } from 'react';
import { getThemeColors, type Theme } from './theme.ts';

interface PullToRefreshProps {
  theme: Theme;
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  pullThreshold?: number;  // 触发刷新的下拉距离
  maxPullDistance?: number; // 最大下拉距离
}

type RefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing';

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  theme,
  children,
  onRefresh,
  disabled = false,
  pullThreshold = 60,
  maxPullDistance = 100,
}) => {
  const currentTheme = getThemeColors(theme);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshState === 'refreshing') return;
    
    // 检查页面滚动位置
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop > 5) return; // 允许5px误差
    
    startYRef.current = e.touches[0].clientY;
    isPullingRef.current = true;
  }, [disabled, refreshState]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPullingRef.current || disabled || refreshState === 'refreshing') return;
    
    // 检查页面滚动位置
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop > 5) {
      isPullingRef.current = false;
      setPullDistance(0);
      setRefreshState('idle');
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    
    if (diff > 0) {
      e.preventDefault();
      // 使用阻尼效果，下拉越多阻力越大
      const distance = Math.min(diff * 0.5, maxPullDistance);
      setPullDistance(distance);
      setRefreshState(distance >= pullThreshold ? 'ready' : 'pulling');
    }
  }, [disabled, refreshState, pullThreshold, maxPullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || disabled) return;
    
    isPullingRef.current = false;

    if (refreshState === 'ready') {
      setRefreshState('refreshing');
      setPullDistance(pullThreshold);
      
      try {
        await onRefresh();
      } finally {
        setRefreshState('idle');
        setPullDistance(0);
      }
    } else {
      setRefreshState('idle');
      setPullDistance(0);
    }
  }, [disabled, refreshState, pullThreshold, onRefresh]);

  const getIndicatorContent = () => {
    switch (refreshState) {
      case 'pulling':
        return '↓ 下拉刷新';
      case 'ready':
        return '↑ 释放刷新';
      case 'refreshing':
        return '⟳ 刷新中...';
      default:
        return '';
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 下拉指示器 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: pullDistance,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: refreshState === 'refreshing' ? 'none' : 'height 0.2s ease',
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: currentTheme.textSecondary,
            transform: refreshState === 'refreshing' ? 'none' : `translateY(${pullDistance - 30}px)`,
            animation: refreshState === 'refreshing' ? 'spin 1s linear infinite' : 'none',
          }}
        >
          {getIndicatorContent()}
        </span>
      </div>
      
      {/* 内容区域 */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: refreshState === 'refreshing' ? 'none' : 'transform 0.2s ease',
        }}
      >
        {children}
      </div>
      
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default PullToRefresh;
