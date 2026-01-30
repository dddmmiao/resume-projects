import React from 'react';
import { Button, DatePicker, Space } from 'antd';
import { getThemeColors } from './theme.ts';

interface MobileDatePickerProps {
  theme: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
}

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({
  theme,
  selectedDate,
  onDateChange,
  onClose
}) => {
  const isDark = theme === 'dark';
  const currentTheme = getThemeColors(theme as 'light' | 'dark');
  
  const quickOptions = [
    { label: '今天', days: 0 },
    { label: '昨天', days: -1 },
    { label: '一周前', days: -7 },
    { label: '一月前', days: -30 },
    { label: '三月前', days: -90 },
    { label: '半年前', days: -180 },
  ];

  const handleQuickSelect = (days: number) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    onDateChange(dateStr);
  };

  const handleDatePickerChange = (date: any) => {
    if (date) {
      const d = date.toDate();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      onDateChange(dateStr);
    }
  };

  // 将YYYYMMDD格式转换为Date对象
  const parseDate = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return null;
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = parseDate(dateStr);
    if (!date) return '未选择';
    return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
  };

  const currentDate = selectedDate ? parseDate(selectedDate) : null;

  return (
    <div style={{ 
      padding: '20px 16px',
      background: isDark ? '#1a1a1a' : '#ffffff',
      height: '100%'
    }}>
      {/* 当前选择显示 */}
      <div style={{ 
        marginBottom: '24px',
        textAlign: 'center',
        padding: '16px',
        background: isDark ? '#2a2a2a' : '#f5f5f5',
        borderRadius: '8px'
      }}>
        <div style={{ 
          fontSize: '14px', 
          color: isDark ? '#999' : '#666',
          marginBottom: '4px'
        }}>
          当前选择
        </div>
        <div style={{ 
          fontSize: '18px', 
          fontWeight: 'bold',
          color: isDark ? '#fff' : '#000'
        }}>
          {selectedDate ? formatDate(selectedDate) : '未选择'}
        </div>
      </div>

      {/* 快速选择按钮 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          marginBottom: '12px',
          color: isDark ? '#fff' : '#000'
        }}>
          快速选择
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '8px'
        }}>
          {quickOptions.map((option) => (
            <Button
              key={option.label}
              onClick={() => handleQuickSelect(option.days)}
              style={{ 
                height: '44px',
                background: isDark ? '#333' : '#fff',
                borderColor: isDark ? '#555' : '#d9d9d9',
                color: isDark ? '#fff' : '#000'
              }}
              className={isDark ? 'dark-button' : ''}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 自定义日期选择 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          marginBottom: '12px',
          color: isDark ? '#fff' : '#000'
        }}>
          选择具体日期
        </div>
        <DatePicker
          onChange={handleDatePickerChange}
          style={{ width: '100%' }}
          size="large"
          placeholder="点击选择日期"
          className={isDark ? 'dark-date-picker' : ''}
        />
      </div>

      {/* 底部操作按钮 */}
      <div style={{ 
        position: 'sticky',
        bottom: 0,
        paddingTop: '16px',
        borderTop: `1px solid ${isDark ? '#333' : '#f0f0f0'}`,
        background: isDark ? '#1a1a1a' : '#ffffff'
      }}>
        <Space style={{ width: '100%' }}>
          <Button 
            block
            size="large"
            onClick={() => {
              onDateChange(''); // 清除选择
              onClose();
            }}
            style={{
              background: isDark ? '#333' : '#f5f5f5',
              borderColor: isDark ? '#555' : '#d9d9d9',
              color: isDark ? '#fff' : '#000'
            }}
          >
            清除
          </Button>
          <Button 
            block
            size="large"
            onClick={onClose}
            style={{
              background: currentTheme.primary,
              borderColor: currentTheme.primary,
              color: '#ffffff',
              borderRadius: '12px',
              fontWeight: 500
            }}
          >
            确定
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default MobileDatePicker;
