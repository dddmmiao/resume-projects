import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, message, Spin } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './TradingCalendar.css';
import authFetch from '../utils/authFetch.ts';

type CalendarValue = Date | null;

interface TradingCalendarProps {
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  selectedDate?: string; // YYYYMMDD 格式
  onDateChange: (date: string) => void; // YYYYMMDD 格式
  period?: 'daily' | 'weekly' | 'monthly';  // 周期类型
}

interface TradingDayInfo {
  trade_date: string;
  is_open: boolean;
}

const TradingCalendar: React.FC<TradingCalendarProps> = ({
  theme,
  selectedDate,
  onDateChange,
  period = 'daily',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarData, setCalendarData] = useState<TradingDayInfo[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<CalendarValue>(
    selectedDate ? parseSelectedDate(selectedDate) : null
  );

  // 获取今天的日期字符串 (YYYYMMDD格式)
  const getTodayString = useCallback(() => {
    const today = new Date();
    return formatDateToString(today);
  }, []);

  // 如果没有选中日期，默认使用今天
  const displayDate = selectedDate || getTodayString();

  const isDark = theme !== 'light';

  // 解析选中日期字符串为Date对象
  function parseSelectedDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // 月份从0开始
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
  }

  // 格式化Date为YYYYMMDD字符串
  function formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // 格式化Date为YYYY-MM-DD字符串（用于API调用）
  function formatDateForAPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 获取交易日历数据
  const fetchTradingCalendar = useCallback(async () => {
    setLoading(true);
    try {
      // 获取更大范围的数据（过去5年到未来1年）
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 5);
      
      const response = await authFetch(`/api/trade-calendar/trading-days?start_date=${formatDateForAPI(startDate)}&end_date=${formatDateForAPI(endDate)}`);
      const result = await response.json();
      
      if (result.success) {
        setCalendarData(result.data.trading_days || []);
      } else {
        console.error('获取交易日历失败:', result);
        message.error('获取交易日历失败');
      }
    } catch (error) {
      console.error('获取交易日历失败:', error);
      message.error('获取交易日历失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 判断是否为交易日
  const isTradingDay = useCallback((date: Date) => {
    const dateStr = formatDateForAPI(date);
    const dayInfo = calendarData.find(d => d.trade_date === dateStr);
    return dayInfo?.is_open || false;
  }, [calendarData]);

  // 处理日期选择
  const handleDateSelect = useCallback((value: any) => {
    // react-calendar 可能返回 Date 或 Date[]，我们只处理单个 Date
    const selectedDate = Array.isArray(value) ? value[0] : value;
    if (!selectedDate || !(selectedDate instanceof Date)) return;
    
    if (period === 'weekly') {
      // 周线模式：选择该周的周日，作为该周的代表日期（可能是未来自然日，用于匹配该周K线的 trade_date）
      const dayOfWeek = selectedDate.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const sunday = new Date(selectedDate);
      sunday.setDate(selectedDate.getDate() + daysUntilSunday);
      const dateStr = formatDateToString(sunday);
      setSelectedCalendarDate(sunday);
      onDateChange(dateStr);
      setIsModalOpen(false);
    } else if (period === 'monthly') {
      // 月线模式：选择该月的月末，作为该月的代表日期（可能是未来自然日，用于匹配该月K线的 trade_date）
      const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      const dateStr = formatDateToString(lastDay);
      setSelectedCalendarDate(lastDay);
      onDateChange(dateStr);
      setIsModalOpen(false);
    } else {
      // 日线模式：必须是交易日
      if (isTradingDay(selectedDate)) {
        const dateStr = formatDateToString(selectedDate);
        setSelectedCalendarDate(selectedDate);
        onDateChange(dateStr);
        setIsModalOpen(false);
      } else {
        message.warning({ content: '请选择交易日', duration: 2 });
      }
    }
  }, [isTradingDay, onDateChange, period]);

  // 定义日期类名函数
  // 只在 day 视图（view === 'month'）按交易日状态着色；
  // 在月份/年份选择视图下不再应用 trading-day/non-trading-day 等类名，避免方块颜色异常
  const getTileClassName = useCallback(
    ({ date, view }: { date: Date; view: string }) => {
      // 仅在按天展示的视图中根据交易日状态上色
      if (view !== 'month') {
        return '';
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      
      const classNames: string[] = [];
      
      // 先检查是否是今天
      if (checkDate.getTime() === today.getTime()) {
        classNames.push('today');
      }
      
      // 然后按照交易日状态分类
      if (checkDate > today) {
        classNames.push('future-date');
      } else if (isTradingDay(date)) {
        classNames.push('trading-day');
      } else {
        classNames.push('non-trading-day');
      }
      
      return classNames.join(' ');
    },
    [isTradingDay]
  );
  
  // 定义日期禁用函数
  const tileDisabled = useCallback(({ date }: { date: Date }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    return checkDate > today;
  }, []);

  // 打开模态框时获取数据
  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
    fetchTradingCalendar();
  }, [fetchTradingCalendar]);
  
  // 移除日期范围限制，允许用户浏览任意时间
  
  // 当选中日期变化时更新组件内部状态
  useEffect(() => {
    if (selectedDate) {
      setSelectedCalendarDate(parseSelectedDate(selectedDate));
    } else {
      setSelectedCalendarDate(null);
    }
  }, [selectedDate]);

  // 周线模式：当前显示的月份
  const [weekViewMonth, setWeekViewMonth] = useState(() => {
    if (selectedDate) {
      const d = parseSelectedDate(selectedDate);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  // 获取某月的所有周
  const getWeeksOfMonth = useCallback((monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    
    const weeks: { weekNum: number; startDate: Date; endDate: Date }[] = [];
    
    // 从月初所在周的周日开始
    let current = new Date(startOfMonth);
    current.setDate(current.getDate() - current.getDay()); // 走到周日
    
    while (current <= endOfMonth) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6); // 周六
      
      // 计算周数（简化版）
      const startOfYear = new Date(weekStart.getFullYear(), 0, 1);
      const days = Math.floor((weekStart.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      
      weeks.push({ weekNum, startDate: weekStart, endDate: weekEnd });
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  }, []);

  // 周状态
  const getWeekStatus = useCallback((weekStart: Date, weekEnd: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isFuture = weekStart > today;
    const isCurrentWeek = today >= weekStart && today <= weekEnd;
    
    // 选中的是周五，直接判断是否在周内
    let isSelected = false;
    if (selectedDate) {
      const selected = parseSelectedDate(selectedDate);
      isSelected = selected >= weekStart && selected <= weekEnd;
    }
    
    return { isFuture, isCurrentWeek, isSelected };
  }, [selectedDate]);

  // 周点击
  const handleWeekClick = useCallback((weekEnd: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    
    if (weekStart > today) {
      return;
    }
    
    // 选择周五作为该周的代表日期（与后端 trade_date 一致）
    // weekEnd 是周六，-1 得到周五
    const friday = new Date(weekEnd);
    friday.setDate(friday.getDate() - 1);
    const dateStr = formatDateToString(friday);
    onDateChange(dateStr);
    setIsModalOpen(false);
  }, [onDateChange]);

  // 月份切换
  const changeWeekViewMonth = useCallback((direction: 'prev' | 'next') => {
    setWeekViewMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + (direction === 'prev' ? -1 : 1));
      return newMonth;
    });
  }, []);

  // 格式化日期为 MM/DD
  const formatShortDate = (date: Date) => {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${m}/${d}`;
  };

  // 计算可浏览的日期范围：根据已加载的交易日历数据动态确定
  // 有多少交易日历数据，就能浏览到多少日期
  const minDate = useMemo(() => {
    if (!calendarData.length) return undefined;

    // trade_date 为 YYYY-MM-DD 字符串，按字符串比较即可找到最小值
    const earliest = calendarData.reduce((min, d) =>
      d.trade_date < min ? d.trade_date : min,
      calendarData[0].trade_date,
    );

    const d = new Date(earliest);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [calendarData]);

  const maxDate = useMemo(() => {
    if (!calendarData.length) return undefined;

    const latest = calendarData.reduce((max, d) =>
      d.trade_date > max ? d.trade_date : max,
      calendarData[0].trade_date,
    );

    const d = new Date(latest);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [calendarData]);

  // 与GlobalControls中Ant Design Select size="small"保持一致
  const isLight = theme === 'light';
  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 7px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 400,
    border: isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.15)',
    background: isLight ? '#ffffff' : 'rgba(255,255,255,0.04)',
    color: isLight ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.85)',
    transition: 'border-color 0.2s, background 0.2s',
    width: '100px',
    height: '24px',
    boxSizing: 'border-box',
  };

  return (
    <>
      {/* 日期显示 */}
      <div
        className="trading-calendar-btn"
        onClick={handleOpenModal}
        style={buttonStyle}
        title="点击选择交易日期"
      >
        {formatDateForAPI(parseSelectedDate(displayDate))}
      </div>

      {/* 交易日历模态框 */}
      <Modal
        title={
          <div style={{ 
            color: isDark ? '#ffffff' : '#000000',
            fontWeight: 500,
            fontSize: '16px'
          }}>
            {period === 'weekly' ? '选择周' : period === 'monthly' ? '选择月份' : '选择交易日期'}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={400}
        centered
        maskClosable={true}
        className={`trading-calendar ${isDark ? 'dark' : 'light'}`}
      >
        <div style={{ padding: '16px 0' }}>
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 0',
              color: isDark ? '#ffffff' : '#000000'
            }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, fontSize: '14px', opacity: 0.7 }}>
                加载交易日历...
              </div>
            </div>
          ) : period === 'weekly' ? (
            // 周线模式：周列表视图
            <div className="week-selector">
              {/* 月份导航 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 8px 16px',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                marginBottom: '12px'
              }}>
                <button
                  onClick={() => changeWeekViewMonth('prev')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: isDark ? '#fff' : '#000',
                    padding: '4px 12px'
                  }}
                >
                  ‹
                </button>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  color: isDark ? '#fff' : '#000'
                }}>
                  {weekViewMonth.getFullYear()}年{weekViewMonth.getMonth() + 1}月
                </span>
                <button
                  onClick={() => changeWeekViewMonth('next')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: isDark ? '#fff' : '#000',
                    padding: '4px 12px'
                  }}
                >
                  ›
                </button>
              </div>
              
              {/* 周列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {getWeeksOfMonth(weekViewMonth).map((week, index) => {
                  const status = getWeekStatus(week.startDate, week.endDate);
                  return (
                    <button
                      key={index}
                      onClick={() => !status.isFuture && handleWeekClick(week.endDate)}
                      disabled={status.isFuture}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: status.isSelected 
                          ? '2px solid #1890ff' 
                          : `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                        background: status.isSelected
                          ? (isDark ? 'rgba(24,144,255,0.2)' : 'rgba(24,144,255,0.1)')
                          : status.isCurrentWeek
                            ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
                            : 'transparent',
                        cursor: status.isFuture ? 'not-allowed' : 'pointer',
                        opacity: status.isFuture ? 0.4 : 1,
                        color: isDark ? '#fff' : '#000',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontWeight: status.isSelected ? 600 : 400 }}>
                        第{week.weekNum}周
                      </span>
                      <span style={{ 
                        fontSize: '13px',
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'
                      }}>
                        {formatShortDate(week.startDate)} - {formatShortDate(week.endDate)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="calendar-wrapper">
              <Calendar
                onChange={handleDateSelect}
                value={selectedCalendarDate}
                tileClassName={getTileClassName}
                tileDisabled={period === 'daily' ? tileDisabled : undefined}
                locale="zh-CN"
                next2Label={null}
                prev2Label={null}
                showNeighboringMonth={false}
                selectRange={false}
                returnValue="start"
                minDate={minDate}
                maxDate={maxDate}
                // 月线模式：直接显示月份选择视图
                view={period === 'monthly' ? 'year' : 'month'}
                maxDetail={period === 'monthly' ? 'year' : 'month'}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TradingCalendar;
