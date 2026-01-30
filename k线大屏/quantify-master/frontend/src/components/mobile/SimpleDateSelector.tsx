import React, { useState } from 'react';
import { Button, Input, Space, message } from 'antd';
import { getThemeColors } from './theme.ts';

interface SimpleDateSelectorProps {
  theme: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
}

const SimpleDateSelector: React.FC<SimpleDateSelectorProps> = ({
  theme,
  selectedDate,
  onDateChange,
  onClose
}) => {
  const [inputValue, setInputValue] = useState('');
  const isDark = theme === 'dark';
  const currentTheme = getThemeColors(theme as 'light' | 'dark');
  
  const quickOptions = [
    { label: '今天', days: 0, desc: '最新数据' },
    { label: '昨天', days: -1, desc: '前1个交易日' },
    { label: '3天前', days: -3, desc: '前3个交易日' },
    { label: '1周前', days: -7, desc: '前1周' },
    { label: '2周前', days: -14, desc: '前2周' },
    { label: '1月前', days: -30, desc: '前1个月' },
    { label: '3月前', days: -90, desc: '前3个月' },
    { label: '半年前', days: -180, desc: '前半年' },
  ];

  const handleQuickSelect = (days: number) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    onDateChange(dateStr);
    onClose();
  };

  const handleManualInput = () => {
    // 支持多种输入格式
    const input = inputValue.trim();
    if (!input) return;

    let dateStr = '';
    
    // 格式1: YYYY-MM-DD 或 YYYY/MM/DD
    const format1 = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input);
    if (format1) {
      const [, year, month, day] = format1;
      dateStr = year + month.padStart(2, '0') + day.padStart(2, '0');
    }
    
    // 格式2: MM-DD 或 MM/DD (当年)
    const format2 = /^(\d{1,2})[-/](\d{1,2})$/.exec(input);
    if (format2) {
      const [, month, day] = format2;
      const currentYear = new Date().getFullYear();
      dateStr = currentYear + month.padStart(2, '0') + day.padStart(2, '0');
    }
    
    // 格式3: YYYYMMDD
    const format3 = /^(\d{8})$/.exec(input);
    if (format3) {
      dateStr = input;
    }

    if (dateStr && /^\d{8}$/.test(dateStr)) {
      // 验证日期有效性
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6));
      const day = parseInt(dateStr.substring(6, 8));
      const testDate = new Date(year, month - 1, day);
      
      if (testDate.getFullYear() === year && 
          testDate.getMonth() === month - 1 && 
          testDate.getDate() === day) {
        onDateChange(dateStr);
        onClose();
        return;
      }
    }
    
    message.error('日期格式错误，请使用 2024-03-15 或 03-15 格式');
  };

  // 格式化显示当前选择的日期
  const formatCurrentDate = () => {
    if (!selectedDate || selectedDate.length !== 8) return '未选择日期';
    const year = selectedDate.substring(0, 4);
    const month = selectedDate.substring(4, 6);
    const day = selectedDate.substring(6, 8);
    return `${year}年${month}月${day}日`;
  };

  return (
    <div style={{ 
      padding: '16px',
      background: isDark ? '#1a1a1a' : '#ffffff',
      height: '100%'
    }}>
      {/* 当前选择显示 */}
      <div style={{ 
        marginBottom: '20px',
        textAlign: 'center',
        padding: '12px',
        background: isDark ? '#2a2a2a' : '#f8f9fa',
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#333' : '#e9ecef'}`
      }}>
        <div style={{ 
          fontSize: '14px', 
          color: isDark ? '#999' : '#6c757d',
          marginBottom: '4px'
        }}>
          当前选择
        </div>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          color: isDark ? '#fff' : '#212529'
        }}>
          {formatCurrentDate()}
        </div>
      </div>

      {/* 快速选择 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          marginBottom: '12px',
          color: isDark ? '#fff' : '#212529'
        }}>
          快速选择
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '8px'
        }}>
          {quickOptions.map((option) => (
            <Button
              key={option.label}
              onClick={() => handleQuickSelect(option.days)}
              style={{ 
                height: '48px',
                background: isDark ? '#333' : '#fff',
                borderColor: isDark ? '#555' : '#d1d5db',
                color: isDark ? '#fff' : '#374151',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{option.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>{option.desc}</div>
            </Button>
          ))}
        </div>
      </div>

      {/* 手动输入 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          marginBottom: '8px',
          color: isDark ? '#fff' : '#212529'
        }}>
          手动输入
        </div>
        <div style={{ marginBottom: '8px' }}>
          <Input
            placeholder="如: 2024-03-15 或 03-15"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleManualInput}
            style={{ 
              background: isDark ? '#333' : '#fff',
              borderColor: isDark ? '#555' : '#d1d5db',
              color: isDark ? '#fff' : '#000'
            }}
            size="large"
          />
        </div>
        <div style={{ 
          fontSize: '12px', 
          color: isDark ? '#999' : '#6c757d',
          marginBottom: '8px'
        }}>
          支持格式：2024-03-15、2024/03/15、03-15、20240315
        </div>
        <Button 
          block
          onClick={handleManualInput}
          disabled={!inputValue.trim()}
          style={{
            background: inputValue.trim() ? currentTheme.primary : currentTheme.card,
            borderColor: inputValue.trim() ? currentTheme.primary : currentTheme.border,
            color: inputValue.trim() ? '#ffffff' : currentTheme.textSecondary,
            borderRadius: '12px',
            fontWeight: 500
          }}
        >
          应用日期
        </Button>
      </div>

      {/* 底部操作 */}
      <div style={{ 
        position: 'sticky',
        bottom: 0,
        paddingTop: '12px',
        borderTop: `1px solid ${isDark ? '#333' : '#e9ecef'}`,
        background: isDark ? '#1a1a1a' : '#ffffff'
      }}>
        <Space style={{ width: '100%' }} size="middle">
          <Button 
            block
            onClick={() => {
              onDateChange(''); // 清除选择
              onClose();
            }}
            style={{
              background: isDark ? '#333' : '#f8f9fa',
              borderColor: isDark ? '#555' : '#d1d5db',
              color: isDark ? '#fff' : '#6c757d'
            }}
          >
            清除
          </Button>
          <Button 
            block
            onClick={onClose}
            style={{
              background: currentTheme.primary,
              borderColor: currentTheme.primary,
              color: '#ffffff',
              borderRadius: '12px',
              fontWeight: 500
            }}
          >
            完成
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default SimpleDateSelector;
