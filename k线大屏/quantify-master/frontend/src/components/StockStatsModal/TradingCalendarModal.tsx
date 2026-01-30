import React, { useCallback, useState, useMemo } from 'react';
import { Modal, Spin, message } from 'antd';
import Calendar from 'react-calendar';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { parseYYYYMMDD, formatYYYYMMDD } from './constants.ts';

dayjs.extend(weekOfYear);

interface TradingCalendarModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  value: string; // YYYYMMDD format
  onChange: (dateStr: string) => void;
  tradingDays: string[]; // YYYY-MM-DD format array
  tradingDaysLoading: boolean;
  isDarkTheme: boolean;
  textColor: string;
  // 日期禁用逻辑
  disableFuture?: boolean;
  disableBefore?: string; // YYYYMMDD - 禁用此日期之前的日期
  disableAfter?: string;  // YYYYMMDD - 禁用此日期及之后的日期
  // 验证逻辑
  validateDate?: (date: Date) => { valid: boolean; message?: string };
  // 周期类型
  period?: 'daily' | 'weekly' | 'monthly';
}

const TradingCalendarModal: React.FC<TradingCalendarModalProps> = ({
  title,
  open,
  onClose,
  value,
  onChange,
  tradingDays,
  tradingDaysLoading,
  isDarkTheme,
  textColor,
  disableFuture = true,
  disableBefore,
  disableAfter,
  validateDate,
  period = 'daily',
}) => {
  // 周/月选择器的当前显示月份/年份
  const [currentDate, setCurrentDate] = useState(() => value ? dayjs(value, 'YYYYMMDD') : dayjs());
  // 判断是否为交易日
  const isTradingDay = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    return tradingDays.includes(dateStr);
  }, [tradingDays]);

  // 日历样式类名
  const getCalendarTileClassName = useCallback(({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    const classes: string[] = [];
    
    if (checkDate.getTime() === today.getTime()) {
      classes.push('today');
    }
    
    if (checkDate > today) {
      classes.push('future-date');
    } else if (isTradingDay(date)) {
      classes.push('trading-day');
    } else {
      classes.push('non-trading-day');
    }
    
    return classes.join(' ');
  }, [isTradingDay]);

  // 禁用日期逻辑
  const tileDisabled = useCallback(({ date }: { date: Date }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // 禁用未来日期
    if (disableFuture && checkDate > today) return true;
    
    // 禁用指定日期之前的日期
    if (disableBefore) {
      const beforeDt = parseYYYYMMDD(disableBefore);
      if (beforeDt) {
        beforeDt.setHours(0, 0, 0, 0);
        if (checkDate < beforeDt) return true;
      }
    }
    
    // 禁用指定日期之后的日期（允许等于，支持日内统计）
    if (disableAfter) {
      const afterDt = parseYYYYMMDD(disableAfter);
      if (afterDt) {
        afterDt.setHours(0, 0, 0, 0);
        if (checkDate > afterDt) return true;
      }
    }
    
    return false;
  }, [disableFuture, disableBefore, disableAfter]);

  // 日历选择处理（日线模式）
  const handleCalendarSelect = useCallback((selectedValue: any) => {
    const selectedDate = Array.isArray(selectedValue) ? selectedValue[0] : selectedValue;
    if (!selectedDate || !(selectedDate instanceof Date)) return;
    
    if (!isTradingDay(selectedDate)) {
      message.warning('请选择交易日');
      return;
    }
    
    // 自定义验证
    if (validateDate) {
      const result = validateDate(selectedDate);
      if (!result.valid) {
        message.warning(result.message || '日期选择无效');
        return;
      }
    }
    
    onChange(formatYYYYMMDD(selectedDate));
    onClose();
  }, [isTradingDay, validateDate, onChange, onClose]);

  // 切换月份（周线模式）
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'prev' ? prev.subtract(1, 'month') : prev.add(1, 'month'));
  };

  // 切换年份（月线模式）
  const changeYear = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'prev' ? prev.subtract(1, 'year') : prev.add(1, 'year'));
  };

  // 获取当月的周列表（周线模式）
  const weeks = useMemo(() => {
    const startOfMonth = currentDate.startOf('month');
    const endOfMonth = currentDate.endOf('month');
    const result: { weekNum: number; startDate: dayjs.Dayjs; endDate: dayjs.Dayjs }[] = [];
    
    let current = startOfMonth.startOf('week');
    while (current <= endOfMonth) {
      const weekEnd = current.endOf('week');
      result.push({ weekNum: current.week(), startDate: current, endDate: weekEnd });
      current = current.add(1, 'week');
    }
    return result;
  }, [currentDate]);

  // 处理周点击
  const handleWeekClick = (weekStart: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');
    if (weekStart > today) {
      message.warning('不能选择未来的周');
      return;
    }
    // 选择周五作为该周的代表日期（day(5) = 周五）
    const friday = weekStart.day(5);
    onChange(friday.format('YYYYMMDD'));
    onClose();
  };

  // 处理月点击
  const handleMonthClick = (month: number) => {
    const today = dayjs().startOf('day');
    const targetMonth = currentDate.month(month);
    if (targetMonth.startOf('month') > today) {
      message.warning('不能选择未来的月份');
      return;
    }
    // 选择月末日期作为该月的代表日期
    onChange(targetMonth.endOf('month').format('YYYYMMDD'));
    onClose();
  };

  // 获取周状态（含日期限制逻辑）
  const getWeekStatus = (weekStart: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');
    const weekEnd = weekStart.endOf('week');
    const friday = weekStart.day(5); // 周五作为该周代表日期
    const isFuture = weekStart > today;
    const isCurrentWeek = today >= weekStart && today <= weekEnd;
    
    // 日期限制检查（基于周五）
    let isDisabledByRange = false;
    if (disableBefore) {
      const beforeDt = dayjs(disableBefore, 'YYYYMMDD');
      if (friday < beforeDt) isDisabledByRange = true;
    }
    if (disableAfter) {
      const afterDt = dayjs(disableAfter, 'YYYYMMDD');
      if (friday > afterDt) isDisabledByRange = true;
    }
    
    let isSelected = false;
    if (value) {
      const selected = dayjs(value, 'YYYYMMDD');
      isSelected = selected >= weekStart && selected <= weekEnd;
    }
    return { isFuture: isFuture || isDisabledByRange, isCurrentWeek, isSelected };
  };

  // 获取月状态（含日期限制逻辑）
  const getMonthStatus = (month: number) => {
    const today = dayjs().startOf('day');
    const targetMonth = currentDate.month(month);
    const monthStart = targetMonth.startOf('month');
    const monthEnd = targetMonth.endOf('month');
    const isFuture = monthStart > today;
    const isCurrentMonth = today >= monthStart && today <= monthEnd;
    
    // 日期限制检查（基于月末）
    let isDisabledByRange = false;
    if (disableBefore) {
      const beforeDt = dayjs(disableBefore, 'YYYYMMDD');
      if (monthEnd < beforeDt) isDisabledByRange = true;
    }
    if (disableAfter) {
      const afterDt = dayjs(disableAfter, 'YYYYMMDD');
      if (monthStart > afterDt) isDisabledByRange = true;
    }
    
    let isSelected = false;
    if (value) {
      const selected = dayjs(value, 'YYYYMMDD');
      isSelected = selected >= monthStart && selected <= monthEnd;
    }
    return { isFuture: isFuture || isDisabledByRange, isCurrentMonth, isSelected };
  };

  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  // 按钮样式
  const buttonStyle = (isSelected: boolean, isDisabled: boolean, isCurrent: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
    background: isSelected 
      ? (isDarkTheme ? '#1890ff' : '#1890ff') 
      : isCurrent 
        ? (isDarkTheme ? 'rgba(24,144,255,0.2)' : 'rgba(24,144,255,0.1)')
        : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
    color: isSelected ? '#fff' : isDisabled ? (isDarkTheme ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)') : textColor,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    textAlign: 'center' as const,
  });

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      centered
      className={`trading-calendar ${isDarkTheme ? 'dark' : 'light'}`}
      zIndex={10220}
    >
      <div style={{ padding: '16px 0' }}>
        {tradingDaysLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, fontSize: '14px', opacity: 0.7, color: textColor }}>
              加载交易日历...
            </div>
          </div>
        ) : period === 'weekly' ? (
          // 周线模式：周选择器
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => changeMonth('prev')} style={{ ...buttonStyle(false, false, false), padding: '4px 12px' }}>‹</button>
              <span style={{ fontSize: 15, fontWeight: 500, color: textColor }}>{currentDate.format('YYYY年MM月')}</span>
              <button onClick={() => changeMonth('next')} style={{ ...buttonStyle(false, false, false), padding: '4px 12px' }}>›</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weeks.map((week, index) => {
                const status = getWeekStatus(week.startDate);
                return (
                  <button
                    key={index}
                    onClick={() => !status.isFuture && handleWeekClick(week.startDate)}
                    disabled={status.isFuture}
                    style={buttonStyle(status.isSelected, status.isFuture, status.isCurrentWeek)}
                  >
                    <span>第{week.weekNum}周</span>
                    <span style={{ marginLeft: 12, opacity: 0.7 }}>
                      {week.startDate.format('MM/DD')} - {week.endDate.format('MM/DD')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : period === 'monthly' ? (
          // 月线模式：月选择器
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => changeYear('prev')} style={{ ...buttonStyle(false, false, false), padding: '4px 12px' }}>‹</button>
              <span style={{ fontSize: 15, fontWeight: 500, color: textColor }}>{currentDate.format('YYYY年')}</span>
              <button onClick={() => changeYear('next')} style={{ ...buttonStyle(false, false, false), padding: '4px 12px' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {months.map((monthName, index) => {
                const status = getMonthStatus(index);
                return (
                  <button
                    key={index}
                    onClick={() => !status.isFuture && handleMonthClick(index)}
                    disabled={status.isFuture}
                    style={buttonStyle(status.isSelected, status.isFuture, status.isCurrentMonth)}
                  >
                    {monthName}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // 日线模式：原有日历
          <div className="calendar-wrapper">
            <Calendar
              onChange={handleCalendarSelect}
              value={value ? parseYYYYMMDD(value) : null}
              tileClassName={getCalendarTileClassName}
              tileDisabled={tileDisabled}
              locale="zh-CN"
              next2Label={null}
              prev2Label={null}
              showNeighboringMonth={false}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TradingCalendarModal;
