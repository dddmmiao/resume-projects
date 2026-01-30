import React from 'react';
import { Drawer } from 'antd';
import MobileCalendar from '../MobileCalendar.tsx';
import { type Theme } from '../theme.ts';

interface TradeDateDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  tradeDate: string;
  onDateChange: (date: string) => void;
  period?: 'daily' | 'weekly' | 'monthly';  // 周期类型
}

const TradeDateDrawer: React.FC<TradeDateDrawerProps> = ({
  theme,
  open,
  onClose,
  tradeDate,
  onDateChange,
  period = 'daily',
}) => {
  // 根据周期显示不同的标题
  const getTitle = () => {
    switch (period) {
      case 'weekly': return '选择周';
      case 'monthly': return '选择月份';
      default: return '选择交易日期';
    }
  };

  return (
    <Drawer
      title={getTitle()}
      placement="bottom"
      height="70%"
      open={open}
      onClose={onClose}
      className={theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}
      maskStyle={{ 
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)'
      }}
      styles={{
        body: {
          padding: '0',
          background: theme === 'dark' ? '#1a1a1a' : '#ffffff'
        },
        header: {
          background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
          borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#d9d9d9'}`,
          color: theme === 'dark' ? '#ffffff' : '#000000'
        },
        wrapper: {
          borderRadius: '16px 16px 0 0',
          background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
          overflow: 'hidden'
        }
      }}
    >
      <MobileCalendar
        theme={theme}
        selectedDate={tradeDate}
        onDateChange={onDateChange}
        onClose={onClose}
        period={period}
      />
    </Drawer>
  );
};

export default TradeDateDrawer;
