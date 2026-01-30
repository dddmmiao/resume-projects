// 统一的移动端 Drawer 组件

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Drawer, DrawerProps, Button } from 'antd';
import { Theme, getThemeColors } from './theme.ts';

interface BottomDrawerProps extends Omit<DrawerProps, 'placement' | 'styles'> {
  theme: Theme;
  /** 最大高度，内容少时自适应，超过时滚动。默认70vh */
  maxHeight?: string;
  /** 最小高度，默认不限制 */
  minHeight?: string;
  /** 是否启用自适应高度，默认true */
  autoHeight?: boolean;
  zIndex?: number;
  /** 是否使用统一的内容容器样式（padding: 0 16px 20px），默认true */
  useContentContainer?: boolean;
  /** 返回按钮回调，传入则显示返回按钮 */
  onBack?: () => void;
  /** 返回按钮文字，默认"返回" */
  backText?: string;
  /** 保存按钮回调，传入则显示保存按钮 */
  onSave?: () => void;
  /** 保存按钮文字，默认"保存" */
  saveText?: string;
  /** 保存按钮loading状态 */
  saveLoading?: boolean;
  /** 保存按钮禁用状态 */
  saveDisabled?: boolean;
  /** 禁用滚动锁定（嵌套在其他Drawer内时使用），默认false */
  disableScrollLock?: boolean;
}

export const BottomDrawer: React.FC<BottomDrawerProps> = ({ 
  theme, 
  maxHeight = '70vh',
  minHeight,
  autoHeight = true,
  children,
  zIndex,
  open,
  useContentContainer = true,
  onBack,
  backText = '返回',
  onSave,
  saveText = '保存',
  saveLoading = false,
  saveDisabled = false,
  disableScrollLock = false,
  extra,
  title,
  ...props 
}) => {
  const currentTheme = getThemeColors(theme);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  // 🚀 监听内容高度变化，实现自适应高度
  const updateContentHeight = useCallback(() => {
    if (!autoHeight || !contentRef.current) return;
    
    const contentEl = contentRef.current;
    const scrollHeight = contentEl.scrollHeight;
    // header高度约45px，padding约17px
    const headerHeight = 45;
    const paddingHeight = 17;
    const totalHeight = scrollHeight + headerHeight + paddingHeight;
    
    setContentHeight(totalHeight);
  }, [autoHeight]);

  // 监听内容变化
  useEffect(() => {
    if (!open || !autoHeight) return;
    
    // 初始计算
    const timer = setTimeout(updateContentHeight, 50);
    
    // 使用 ResizeObserver 监听内容变化
    const observer = new ResizeObserver(() => {
      updateContentHeight();
    });
    
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [open, autoHeight, updateContentHeight, children]);

  // 计算最终高度
  const calculatedHeight = useMemo(() => {
    if (!autoHeight) return maxHeight;
    if (contentHeight === null) return maxHeight;
    
    // 解析 maxHeight (支持 vh 和 px)
    let maxHeightPx: number;
    if (maxHeight.endsWith('vh')) {
      maxHeightPx = (parseFloat(maxHeight) / 100) * window.innerHeight;
    } else if (maxHeight.endsWith('px')) {
      maxHeightPx = parseFloat(maxHeight);
    } else {
      maxHeightPx = parseFloat(maxHeight);
    }
    
    // 解析 minHeight
    let minHeightPx = 0;
    if (minHeight) {
      if (minHeight.endsWith('vh')) {
        minHeightPx = (parseFloat(minHeight) / 100) * window.innerHeight;
      } else if (minHeight.endsWith('px')) {
        minHeightPx = parseFloat(minHeight);
      } else {
        minHeightPx = parseFloat(minHeight);
      }
    }
    
    // 应用约束
    const finalHeight = Math.max(minHeightPx, Math.min(contentHeight, maxHeightPx));
    return `${finalHeight}px`;
  }, [autoHeight, contentHeight, maxHeight, minHeight]);
  
  // 构建header extra：返回按钮、保存按钮、自定义extra
  const headerExtra = useMemo(() => {
    if (!onBack && !onSave && !extra) return undefined;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 6 }}>
        {onBack && (
          <Button
            type="text"
            onClick={onBack}
            style={{ color: currentTheme.text, padding: '4px 8px', fontSize: '14px' }}
          >
            {backText}
          </Button>
        )}
        {onSave && (
          <Button
            type="text"
            onClick={onSave}
            loading={saveLoading}
            disabled={saveDisabled}
            style={{ 
              color: saveDisabled ? currentTheme.textSecondary : currentTheme.positive, 
              padding: '4px 8px', 
              fontSize: '15px',
              fontWeight: 500
            }}
          >
            {saveText}
          </Button>
        )}
        {extra}
      </div>
    );
  }, [onBack, backText, onSave, saveText, saveLoading, saveDisabled, extra, currentTheme]);

  // 🚀 Drawer打开时锁定body滚动，防止底层列表滑动（嵌套Drawer时可禁用）
  useEffect(() => {
    if (open && !disableScrollLock) {
      // 保存当前滚动位置
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // 恢复滚动
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [open, disableScrollLock]);

  return (
    <Drawer
      {...props}
      open={open}
      title={title}
      extra={headerExtra}
      placement="bottom"
      height={calculatedHeight}
      className={`mobile-drawer-${theme} hide-scrollbar`}
      zIndex={zIndex}
      destroyOnClose={false}
      forceRender={true}
      maskStyle={{ 
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)'
      }}
      styles={{ 
        body: { 
          background: currentTheme.bg,
          color: currentTheme.text, 
          padding: '0',
          overflow: 'auto', // 🚀 内容超过高度时自动支持滚动
          WebkitOverflowScrolling: 'touch', // iOS平滑滚动
          overscrollBehavior: 'contain' // 防止弹性滚动传递到父级
        },
        header: { 
          background: currentTheme.bg,
          borderBottom: `1px solid ${currentTheme.border}`,
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          padding: '10px 10px',
          color: currentTheme.text
        },
        wrapper: {
          borderRadius: '16px 16px 0 0',
          background: currentTheme.bg,
          overflow: 'hidden'
        }
      }}
    >
      {useContentContainer ? (
        <div ref={contentRef} style={{ padding: '5px 16px 12px' }}>
          {children}
        </div>
      ) : (
        <div ref={contentRef}>
          {children}
        </div>
      )}
    </Drawer>
  );
};

