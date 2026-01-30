import React, { useState, useRef, useEffect } from 'react';
import { Select, Button, Dropdown, Menu } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DownOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { getSortOptions, getFieldLabel, getDefaultOrder, DataType, Period } from '../shared/constants.ts';

interface CleanSortSelectProps {
  currentSortType: string;
  currentSortOrder: 'asc' | 'desc';
  dataType: DataType;
  onChange: (sortType: string, sortOrder: 'asc' | 'desc') => void;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  period?: Period; // 当前选择的周期
}

const CleanSortSelect: React.FC<CleanSortSelectProps> = ({
  currentSortType,
  currentSortOrder,
  dataType,
  onChange,
  size = 'small',
  style,
  theme = 'dark',
  period = 'daily' // 默认日线
}) => {
  // 获取显示的标签文字（使用统一配置）
  const getDisplayLabel = (value: string): string => {
    return getFieldLabel(value, period);
  };

  // 构建菜单项（使用统一配置）
  const buildMenuItems = (): MenuProps['items'] => {
    const sortOptions = getSortOptions(dataType, period);
    const items: MenuProps['items'] = [];

    // 添加分隔线位置
    let separatorAdded = false;

    sortOptions.forEach((option, index) => {
      // 在动态字段前添加分隔线
      if (!separatorAdded && (option.key === 'pct_chg' || option.key === 'volatility')) {
        items.push({ type: 'divider' });
        separatorAdded = true;
      }

      if (option.children) {
        // 二级菜单
        items.push({
          key: option.key,
          label: option.label,
          children: option.children.map(child => ({
            key: child.key,
            label: child.label
          }))
        });
      } else {
        // 普通菜单项
        items.push({
          key: option.key,
          label: option.label
        });
      }
    });

    return items;
  };

  const [dropdownVisible, setDropdownVisible] = useState(false);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    // 使用统一配置的默认排序方向
    const defaultOrder = getDefaultOrder(key as string);
    onChange(key as string, defaultOrder);
    setDropdownVisible(false);
  };

  const handleOrderToggle = () => {
    onChange(currentSortType, currentSortOrder === 'asc' ? 'desc' : 'asc');
  };

  // 根据主题获取样式
  const getThemeStyle = () => {
    switch (theme) {
      case 'light':
        return {
          background: '#fff',
          borderColor: '#d9d9d9',
          color: '#000000',
          hoverBorderColor: '#40a9ff',
          hoverShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          normalShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
        };
      case 'blue':
        return {
          background: 'rgba(23, 125, 220, 0.15)',
          borderColor: 'rgba(23, 125, 220, 0.25)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(23, 125, 220, 0.4)',
          hoverShadow: '0 4px 12px rgba(23, 125, 220, 0.2)',
          normalShadow: '0 2px 4px rgba(23, 125, 220, 0.1)'
        };
      case 'purple':
        return {
          background: 'rgba(114, 46, 209, 0.18)',
          borderColor: 'rgba(114, 46, 209, 0.28)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(114, 46, 209, 0.4)',
          hoverShadow: '0 4px 12px rgba(114, 46, 209, 0.2)',
          normalShadow: '0 2px 4px rgba(114, 46, 209, 0.1)'
        };
      case 'green':
        return {
          background: 'rgba(54,179,126,0.18)',
          borderColor: 'rgba(54,179,126,0.28)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(54,179,126,0.4)',
          hoverShadow: '0 4px 12px rgba(54,179,126,0.2)',
          normalShadow: '0 2px 4px rgba(54,179,126,0.1)'
        };
      case 'orange':
        return {
          background: 'rgba(250,140,22,0.20)',
          borderColor: 'rgba(250,140,22,0.30)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(250,140,22,0.4)',
          hoverShadow: '0 4px 12px rgba(250,140,22,0.2)',
          normalShadow: '0 2px 4px rgba(250,140,22,0.1)'
        };
      case 'cyan':
        return {
          background: 'rgba(0,170,170,0.18)',
          borderColor: 'rgba(0,170,170,0.28)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(0,170,170,0.4)',
          hoverShadow: '0 4px 12px rgba(0,170,170,0.2)',
          normalShadow: '0 2px 4px rgba(0,170,170,0.1)'
        };
      case 'red':
        return {
          background: 'rgba(220,38,38,0.18)',
          borderColor: 'rgba(220,38,38,0.28)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(220,38,38,0.4)',
          hoverShadow: '0 4px 12px rgba(220,38,38,0.2)',
          normalShadow: '0 2px 4px rgba(220,38,38,0.1)'
        };
      case 'gold':
        return {
          background: 'rgba(250,173,20,0.18)',
          borderColor: 'rgba(250,173,20,0.28)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(250,173,20,0.4)',
          hoverShadow: '0 4px 12px rgba(250,173,20,0.2)',
          normalShadow: '0 2px 4px rgba(250,173,20,0.1)'
        };
      case 'dark':
        return {
          background: 'rgba(255, 255, 255, 0.1)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          hoverBorderColor: 'rgba(255, 255, 255, 0.4)',
          hoverShadow: '0 4px 12px rgba(255, 255, 255, 0.1)',
          normalShadow: '0 2px 4px rgba(255, 255, 255, 0.05)'
        };
      default:
        // 默认主题：白色背景，黑色文字
        return {
          background: '#ffffff',
          borderColor: '#d9d9d9',
          color: '#000000',
          hoverBorderColor: '#40a9ff',
          hoverShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          normalShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
        };
    }
  };

  const themeStyle = getThemeStyle();

  const menuItems = buildMenuItems();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      {/* 排序类型选择 - 使用 Dropdown + Menu 实现二级菜单 */}
      <Dropdown
        menu={{
          items: menuItems,
          onClick: handleMenuClick,
          selectedKeys: [currentSortType],
        }}
        trigger={['click']}
        open={dropdownVisible}
        onOpenChange={setDropdownVisible}
      >
        <Button
          style={{
            color: themeStyle.color,
            background: 'transparent',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            border: `1px solid ${themeStyle.borderColor}`,
            borderRadius: 6,
            padding: '0 12px',
            minWidth: '140px',
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
            boxShadow: 'none'
          }}
          size={size}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = themeStyle.hoverBorderColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = themeStyle.borderColor;
          }}
        >
          <span>{getDisplayLabel(currentSortType)}</span>
          <DownOutlined style={{ fontSize: '12px', marginLeft: 8 }} />
        </Button>
      </Dropdown>

      {/* 排序方向按钮 */}
      <Button
        type="default"
        ghost
        size={size}
        icon={currentSortOrder === 'asc' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        onClick={handleOrderToggle}
        className="sort-order-btn"
        style={{
          color: themeStyle.color,
          background: 'transparent',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          border: `1px solid ${themeStyle.borderColor}`,
          borderRadius: 6,
          padding: '0 12px',
          minWidth: '40px',
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s ease, border-color 0.2s ease',
          fontSize: '14px',
          boxShadow: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.borderColor = themeStyle.hoverBorderColor;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.borderColor = themeStyle.borderColor;
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        }}
        title={`当前${currentSortOrder === 'asc' ? '升序' : '降序'} (点击切换)`}
      />
    </div>
  );
};

export default CleanSortSelect;
