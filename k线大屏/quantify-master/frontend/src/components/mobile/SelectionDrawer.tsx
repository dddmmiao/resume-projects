// 通用的选择抽屉组件

import React, { useMemo } from 'react';
import { List } from 'antd';
import { BottomDrawer } from './BottomDrawer.tsx';
import { DrawerListItem } from './DrawerListItem.tsx';
import { Theme } from './theme.ts';

export interface SelectionOption {
  key: string | number | null;
  label: string;
  icon?: string;
  value?: any; // 兼容不同的数据结构
  extra?: React.ReactNode | ((selected: boolean) => React.ReactNode);
}

interface SelectionDrawerProps {
  theme: Theme;
  title: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void; // 返回按钮回调
  options: SelectionOption[];
  selectedValue?: string | number | null;
  valueKey?: 'key' | 'value'; // 用于判断选中状态，默认 'key'
  maxHeight?: string;
  autoHeight?: boolean; // 是否根据选项数量自动计算高度
  onSelect: (option: SelectionOption) => void;
  autoClose?: boolean; // 是否自动关闭，默认 true
  footer?: React.ReactNode; // 底部额外内容（如滑块）
  /** 禁用滚动锁定（嵌套在其他Drawer内时使用） */
  disableScrollLock?: boolean;
}

// 根据选项数量计算合适的高度
const calculateAutoHeight = (optionCount: number, hasFooter: boolean = false): string => {
  const itemHeight = 56;
  const headerHeight = 60;
  const contentPadding = 24; // 顶部12px + 底部12px
  const safeAreaHeight = 20;
  const footerHeight = hasFooter ? 100 : 0; // footer 预留高度
  const totalHeight = optionCount * itemHeight + headerHeight + contentPadding + safeAreaHeight + footerHeight;
  const minVh = 30;
  const maxVh = 80;
  const vh = Math.min(maxVh, Math.max(minVh, Math.ceil(totalHeight / window.innerHeight * 100)));
  return `${vh}vh`;
};

export const SelectionDrawer: React.FC<SelectionDrawerProps> = ({
  theme,
  title,
  open,
  onClose,
  onBack,
  options,
  selectedValue,
  valueKey = 'key',
  maxHeight = '50vh',
  autoHeight = true,
  onSelect,
  autoClose = true,
  footer,
  disableScrollLock = false,
}) => {
  // 动态计算高度
  const drawerHeight = useMemo(() => {
    if (!autoHeight) return maxHeight;
    return calculateAutoHeight(options.length, !!footer);
  }, [autoHeight, maxHeight, options.length, footer]);

  const handleItemClick = (option: SelectionOption) => {
    onSelect(option);
    if (autoClose) {
      onClose();
    }
  };

  const isSelected = (option: SelectionOption): boolean => {
    const optionValue = valueKey === 'key' ? option.key : option.value;
    return String(optionValue) === String(selectedValue);
  };

  const renderExtra = (option: SelectionOption): React.ReactNode => {
    if (!option.extra) return null;
    if (typeof option.extra === 'function') {
      return option.extra(isSelected(option));
    }
    return option.extra;
  };

  return (
    <BottomDrawer
      title={title}
      theme={theme}
      maxHeight={drawerHeight}
      onClose={onClose}
      onBack={onBack}
      open={open}
      zIndex={2100}
      disableScrollLock={disableScrollLock}
    >
      <List
        dataSource={options}
        renderItem={(item: SelectionOption) => (
          <DrawerListItem
            theme={theme}
            selected={isSelected(item)}
            onClick={() => handleItemClick(item)}
            label={item.label}
            icon={item.icon}
            extra={renderExtra(item)}
          />
        )}
      />
      {footer && (
        <div style={{ padding: '16px 0' }}>
          {footer}
        </div>
      )}
    </BottomDrawer>
  );
};

