// 多选抽屉组件 - 用于移动端概念/行业多选

import React, { useState, useMemo } from 'react';
import { List, Checkbox, Input, Button, Tag, Empty } from 'antd';
import { SearchOutlined, CheckOutlined } from '@ant-design/icons';
import { BottomDrawer } from './BottomDrawer.tsx';
import { getThemeColors, Theme } from './theme.ts';

export interface MultiSelectOption {
  code: string;
  name: string;
  isHot?: boolean;
}

interface MultiSelectDrawerProps {
  theme: Theme;
  title: string;
  open: boolean;
  onClose: () => void;
  options: MultiSelectOption[];
  selectedValues: string[];
  onConfirm: (values: string[]) => void;
  loading?: boolean;
  placeholder?: string;
  hotLabel?: string;
  onFetchOptions?: () => Promise<any>;
}

export const MultiSelectDrawer: React.FC<MultiSelectDrawerProps> = ({
  theme,
  title,
  open,
  onClose,
  options,
  selectedValues,
  onConfirm,
  loading = false,
  placeholder = '搜索',
  hotLabel = '🔥 一键选热门',
  onFetchOptions,
}) => {
  const currentTheme = getThemeColors(theme);
  const [searchText, setSearchText] = useState('');
  const [localSelected, setLocalSelected] = useState<string[]>(selectedValues);

  // 同步外部选中状态
  React.useEffect(() => {
    if (open) {
      setLocalSelected(selectedValues);
      setSearchText('');
      if (onFetchOptions && options.length === 0) {
        onFetchOptions();
      }
    }
  }, [open, selectedValues]);

  // 过滤选项
  const filteredOptions = useMemo(() => {
    if (!searchText) return options;
    return options.filter(opt => 
      opt.name.toLowerCase().includes(searchText.toLowerCase()) ||
      opt.code.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [options, searchText]);

  // 热门选项
  const hotOptions = useMemo(() => options.filter(opt => opt.isHot), [options]);

  const handleToggle = (code: string) => {
    setLocalSelected(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const handleSelectAllHot = () => {
    const hotCodes = hotOptions.map(opt => opt.code);
    setLocalSelected(prev => {
      const newSet = new Set(prev);
      hotCodes.forEach(code => newSet.add(code));
      return Array.from(newSet);
    });
  };

  const handleClear = () => {
    setLocalSelected([]);
  };

  const handleConfirm = () => {
    onConfirm(localSelected);
    onClose();
  };

  const selectedCount = localSelected.length;

  return (
    <BottomDrawer
      title={title}
      theme={theme}
      maxHeight="75vh"
      open={open}
      onClose={onClose}
      zIndex={2200}
      disableScrollLock
    >
      {/* 搜索栏 */}
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder={placeholder}
          prefix={<SearchOutlined style={{ color: currentTheme.textSecondary }} />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          style={{ 
            background: currentTheme.card,
            borderColor: currentTheme.border,
          }}
        />
      </div>

      {/* 快捷操作栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {hotOptions.length > 0 && (
            <Tag 
              color="red" 
              style={{ cursor: 'pointer', margin: 0 }}
              onClick={handleSelectAllHot}
            >
              {hotLabel}
            </Tag>
          )}
          <Tag 
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={handleClear}
          >
            清空
          </Tag>
        </div>
        <span style={{ fontSize: 12, color: currentTheme.textSecondary }}>
          已选 {selectedCount} 项
        </span>
      </div>

      {/* 已选标签展示 */}
      {selectedCount > 0 && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 6, 
          marginBottom: 12,
          padding: 8,
          background: theme === 'light' ? 'rgba(24, 144, 255, 0.05)' : 'rgba(24, 144, 255, 0.1)',
          borderRadius: 6,
          maxHeight: 80,
          overflowY: 'auto'
        }}>
          {localSelected.map(code => {
            const opt = options.find(o => o.code === code);
            return (
              <Tag 
                key={code}
                closable
                onClose={() => handleToggle(code)}
                style={{ margin: 0 }}
              >
                {opt?.isHot ? '🔥' : ''}{opt?.name || code}
              </Tag>
            );
          })}
        </div>
      )}

      {/* 选项列表 */}
      <div style={{ 
        maxHeight: selectedCount > 0 ? 'calc(75vh - 280px)' : 'calc(75vh - 200px)', 
        overflowY: 'auto',
        marginBottom: 12
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: currentTheme.textSecondary }}>
            加载中...
          </div>
        ) : filteredOptions.length === 0 ? (
          <Empty description="无匹配项" />
        ) : (
          <List
            dataSource={filteredOptions}
            renderItem={(item: MultiSelectOption) => {
              const isChecked = localSelected.includes(item.code);
              return (
                <div
                  onClick={() => handleToggle(item.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 8px',
                    borderBottom: `1px solid ${currentTheme.border}`,
                    cursor: 'pointer',
                    background: isChecked 
                      ? (theme === 'light' ? 'rgba(24, 144, 255, 0.08)' : 'rgba(24, 144, 255, 0.15)')
                      : 'transparent'
                  }}
                >
                  <Checkbox checked={isChecked} style={{ marginRight: 12 }} />
                  <span style={{ 
                    flex: 1, 
                    color: currentTheme.text,
                    fontWeight: isChecked ? 500 : 400
                  }}>
                    {item.isHot ? '🔥 ' : ''}{item.name}
                  </span>
                  {isChecked && (
                    <CheckOutlined style={{ color: currentTheme.primary, fontSize: 14 }} />
                  )}
                </div>
              );
            }}
          />
        )}
      </div>

      {/* 底部确认按钮 */}
      <div style={{ 
        display: 'flex', 
        gap: 12,
        paddingTop: 8,
        borderTop: `1px solid ${currentTheme.border}`
      }}>
        <Button 
          block 
          onClick={onClose}
          style={{ flex: 1 }}
        >
          取消
        </Button>
        <Button 
          type="primary" 
          block 
          onClick={handleConfirm}
          style={{ flex: 2 }}
        >
          确认 {selectedCount > 0 ? `(${selectedCount})` : ''}
        </Button>
      </div>
    </BottomDrawer>
  );
};
