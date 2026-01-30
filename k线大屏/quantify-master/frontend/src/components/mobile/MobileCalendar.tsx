import React, { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { message } from 'antd';
import './MobileCalendar.css';
import { shouldDisableDate, validateSelectedDate } from '../StockStatsModal/constants.ts';

dayjs.extend(weekOfYear);

interface MobileCalendarProps {
  theme: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
  period?: 'daily' | 'weekly' | 'monthly';  // 周期类型
  // 与桌面端保持一致的属性名
  minDate?: string;  // YYYYMMDD - 禁用此日期之前的日期（对应桌面端 disableBefore）
  maxDate?: string;  // YYYYMMDD - 禁用此日期及之后的日期（对应桌面端 disableAfter）
  // 交易日历数据（从全局 store 传入，避免重复请求）
  tradingDays?: string[];  // YYYY-MM-DD 格式数组
}

const MobileCalendar: React.FC<MobileCalendarProps> = ({
  theme,
  selectedDate,
  onDateChange,
  onClose,
  period = 'daily',
  minDate,
  maxDate,
  tradingDays = [],
}) => {
  const isDark = theme === 'dark';
  const [currentDate, setCurrentDate] = useState(dayjs());

  // 判断是否为交易日（使用传入的 tradingDays）
  const isTradingDay = useCallback((date: dayjs.Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    return tradingDays.includes(dateStr);
  }, [tradingDays]);

  // 获取当月的日期数据
  const getCalendarDays = () => {
    const startOfMonth = currentDate.startOf('month');
    const endOfMonth = currentDate.endOf('month');
    const startDate = startOfMonth.startOf('week');
    const endDate = endOfMonth.endOf('week');
    
    const days = [];
    let current = startDate;
    
    while (current <= endDate) {
      days.push(current);
      current = current.add(1, 'day');
    }
    
    return days;
  };

  // 处理日期点击 - 使用共享验证函数
  const handleDateClick = (date: dayjs.Dayjs) => {
    const nativeDate = date.toDate();
    
    // 使用共享验证函数（以桌面端逻辑为准）
    const result = validateSelectedDate(nativeDate, {
      disableBefore: minDate,
      disableAfter: maxDate,
      tradingDays: tradingDays.length > 0 ? tradingDays : undefined,
    });
    
    if (!result.valid) {
      message.warning({ content: result.message || '日期选择无效', duration: 2 });
      return;
    }
    
    const dateStr = date.format('YYYYMMDD');
    onDateChange(dateStr);
    onClose();
  };

  // 获取日期状态 - 使用共享禁用函数
  const getDateStatus = (date: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');
    const isCurrentMonth = date.month() === currentDate.month();
    const isToday = date.isSame(today, 'day');
    const isSelected = selectedDate && date.format('YYYYMMDD') === selectedDate;
    const isFuture = date > today;
    const isTrading = isTradingDay(date);
    
    // 使用共享禁用函数（以桌面端逻辑为准）
    const isDisabled = shouldDisableDate(date.toDate(), {
      disableFuture: true,
      disableBefore: minDate,
      disableAfter: maxDate,
      tradingDays: tradingDays.length > 0 ? tradingDays : undefined,
    });
    
    return {
      isCurrentMonth,
      isToday,
      isSelected,
      isFuture,
      isTrading,
      isDisabled
    };
  };

  // 切换月份
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => 
      direction === 'prev' ? prev.subtract(1, 'month') : prev.add(1, 'month')
    );
  };

  // 切换年份
  const changeYear = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => 
      direction === 'prev' ? prev.subtract(1, 'year') : prev.add(1, 'year')
    );
  };

  // 获取当月的周列表（周线模式）
  const getWeeksOfMonth = () => {
    const startOfMonth = currentDate.startOf('month');
    const endOfMonth = currentDate.endOf('month');
    const weeks: { weekNum: number; startDate: dayjs.Dayjs; endDate: dayjs.Dayjs }[] = [];
    
    let current = startOfMonth.startOf('week');
    while (current <= endOfMonth) {
      const weekEnd = current.endOf('week');
      weeks.push({
        weekNum: current.week(),
        startDate: current,
        endDate: weekEnd
      });
      current = current.add(1, 'week');
    }
    return weeks;
  };

  // 处理周点击
  const handleWeekClick = (weekStart: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');

    // 如果整周都是未来，不允许选择
    if (weekStart > today) {
      message.warning({ content: '不能选择未来的周', duration: 2 });
      return;
    }

    // 选择周五作为该周的代表日期（day(5) = 周五）
    const friday = weekStart.day(5);
    const dateStr = friday.format('YYYYMMDD');
    onDateChange(dateStr);
    onClose();
  };

  // 处理月点击
  const handleMonthClick = (month: number) => {
    const today = dayjs().startOf('day');
    const targetMonth = currentDate.month(month);
    const monthEnd = targetMonth.endOf('month');

    // 如果整月都是未来，不允许选择
    if (targetMonth.startOf('month') > today) {
      message.warning({ content: '不能选择未来的月份', duration: 2 });
      return;
    }

    // 选择月末日期作为该月的代表日期（允许落在未来的自然日，用于匹配该月的K线trade_date）
    const dateStr = monthEnd.format('YYYYMMDD');
    onDateChange(dateStr);
    onClose();
  };

  // 获取周状态（是否选中、是否禁用，含日期限制逻辑）
  const getWeekStatus = (weekStart: dayjs.Dayjs) => {
    const today = dayjs().startOf('day');
    const weekEnd = weekStart.endOf('week');
    const friday = weekStart.day(5); // 周五作为该周代表日期
    const isFuture = weekStart > today;
    const isCurrentWeek = today >= weekStart && today <= weekEnd;
    
    // 日期限制检查（基于周五）
    let isDisabledByRange = false;
    if (minDate) {
      const minDt = dayjs(minDate, 'YYYYMMDD');
      if (friday < minDt) isDisabledByRange = true;
    }
    if (maxDate) {
      const maxDt = dayjs(maxDate, 'YYYYMMDD');
      if (friday > maxDt) isDisabledByRange = true;
    }
    
    // 选中的是周五，直接判断是否在周内
    let isSelected = false;
    if (selectedDate) {
      const selected = dayjs(selectedDate, 'YYYYMMDD');
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
    if (minDate) {
      const minDt = dayjs(minDate, 'YYYYMMDD');
      if (monthEnd < minDt) isDisabledByRange = true;
    }
    if (maxDate) {
      const maxDt = dayjs(maxDate, 'YYYYMMDD');
      if (monthStart > maxDt) isDisabledByRange = true;
    }
    
    // 判断是否选中：selectedDate 在这个月内
    let isSelected = false;
    if (selectedDate) {
      const selected = dayjs(selectedDate, 'YYYYMMDD');
      isSelected = selected >= monthStart && selected <= monthEnd;
    }
    
    return { isFuture: isFuture || isDisabledByRange, isCurrentMonth, isSelected };
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const calendarDays = getCalendarDays();
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  // 周线模式：渲染周选择器
  if (period === 'weekly') {
    const weeks = getWeeksOfMonth();
    return (
      <div className={`mobile-calendar ${isDark ? 'dark' : 'light'}`}>
        <div className="calendar-header">
          <button className="nav-button" onClick={() => changeMonth('prev')}>‹</button>
          <div className="month-year">{currentDate.format('YYYY年MM月')}</div>
          <button className="nav-button" onClick={() => changeMonth('next')}>›</button>
        </div>
        
        <div className="week-list">
          {weeks.map((week, index) => {
            const status = getWeekStatus(week.startDate);
            return (
              <button
                key={index}
                className={`week-item ${status.isSelected ? 'selected' : ''} ${status.isFuture ? 'disabled' : ''} ${status.isCurrentWeek ? 'current' : ''}`}
                onClick={() => !status.isFuture && handleWeekClick(week.startDate)}
                disabled={status.isFuture}
              >
                <span className="week-num">第{week.weekNum}周</span>
                <span className="week-range">
                  {week.startDate.format('MM/DD')} - {week.endDate.format('MM/DD')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 月线模式：渲染月选择器
  if (period === 'monthly') {
    return (
      <div className={`mobile-calendar ${isDark ? 'dark' : 'light'}`}>
        <div className="calendar-header">
          <button className="nav-button" onClick={() => changeYear('prev')}>‹</button>
          <div className="month-year">{currentDate.format('YYYY年')}</div>
          <button className="nav-button" onClick={() => changeYear('next')}>›</button>
        </div>
        
        <div className="month-grid">
          {months.map((monthName, index) => {
            const status = getMonthStatus(index);
            return (
              <button
                key={index}
                className={`month-item ${status.isSelected ? 'selected' : ''} ${status.isFuture ? 'disabled' : ''} ${status.isCurrentMonth ? 'current' : ''}`}
                onClick={() => !status.isFuture && handleMonthClick(index)}
                disabled={status.isFuture}
              >
                {monthName}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 日线模式：保持原有的日期选择器
  return (
    <div className={`mobile-calendar ${isDark ? 'dark' : 'light'}`}>
      {/* 头部 */}
      <div className="calendar-header">
        <button 
          className="nav-button"
          onClick={() => changeMonth('prev')}
        >
          ‹
        </button>
        <div className="month-year">
          {currentDate.format('YYYY年MM月')}
        </div>
        <button 
          className="nav-button"
          onClick={() => changeMonth('next')}
        >
          ›
        </button>
      </div>

      {/* 星期标题 */}
      <div className="week-header">
        {weekDays.map(day => (
          <div key={day} className="week-day">
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="calendar-grid">
        {calendarDays.map((date, index) => {
          const status = getDateStatus(date);
          return (
            <button
              key={index}
              className={`calendar-day ${
                status.isCurrentMonth ? 'current-month' : 'other-month'
              } ${
                status.isToday ? 'today' : ''
              } ${
                status.isSelected ? 'selected' : ''
              } ${
                status.isDisabled ? 'disabled' : ''
              } ${
                status.isTrading && status.isCurrentMonth && !status.isDisabled ? 'trading' : ''
              }`}
              onClick={() => !status.isDisabled && handleDateClick(date)}
              disabled={status.isDisabled}
            >
              {date.date()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileCalendar;
