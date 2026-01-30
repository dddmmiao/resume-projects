/* eslint-disable react-hooks/exhaustive-deps */
/**
 * 股票K线大屏主页面
 */
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useThemeHotkey } from '../hooks/useThemeHotkey.ts';
import { convertDateForPeriod } from '../utils/dateUtils.ts';
import { Layout, Alert, Spin, Typography, Button, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import '../components/FavoriteDropdown.css';
import './Dashboard.css';
import '../styles/mobile-simple.css';
import KLineDataDisplay from '../components/KLineDataDisplay.tsx';
import UserMenu from '../components/UserMenu.tsx';
import { Period } from '../shared/constants.ts';
import { useAppStore } from '../stores/useAppStore.ts';

// 懒加载Modal组件
const ThsCookieConfigModal = lazy(() => import('../components/ThsCookieConfigModal.tsx'));

const { Content } = Layout;
const { Title } = Typography;


const formatDateTime = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  const second = pad(d.getSeconds());
  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
};

const Dashboard: React.FC = () => {
  const theme = useAppStore(state => state.dashboardTheme);
  const setDashboardTheme = useAppStore(state => state.setDashboardTheme);
  const loadThsAccounts = useAppStore(state => state.loadThsAccounts);
  const loadTradingDays = useAppStore(state => state.loadTradingDays);
  const getLatestTradingDate = useAppStore(state => state.getLatestTradingDate);
  const [currentTime, setCurrentTime] = useState(new Date());
  // 🔧 基准日期：用户通过日历选择的原始日期（不随周期切换而变化）
  const [baseTradeDate, setBaseTradeDate] = useState<string>('');
  // 显示/请求日期：根据当前周期从 baseTradeDate 计算得出
  const [tradeDate, setTradeDate] = useState<string>('');
  // 标记用户是否手动选择过日期（手动选择后才在请求中携带 trade_date）
  const [userChangedTradeDate, setUserChangedTradeDate] = useState(false);
  const [cookieModalVisible, setCookieModalVisible] = useState(false);

  // 全局控制状态
  const [globalIndicator, setGlobalIndicator] = useState<string>('none');
  const [globalMainOverlays, setGlobalMainOverlays] = useState<string[]>([]);
  const [globalPeriod, setGlobalPeriod] = useState<string>('daily');
  const [globalTimeRange, setGlobalTimeRange] = useState<number | string | undefined>(60);

  // 使用useRef防止重复执行初始化逻辑
  const initializationDoneRef = useRef(false);

  // 桌面端：先检查服务健康状态，通过后再初始化数据
  useEffect(() => {
    // 防止重复执行初始化
    if (initializationDoneRef.current || baseTradeDate) return;
    
    let cancelled = false;

    (async () => {
      try {
        initializationDoneRef.current = true;
        
        // 先检查后端服务状态，获取实际状态
        const healthStatus = await checkBackendStatus();
        
        // 只有在服务健康时才加载其他数据
        if (!cancelled && healthStatus === 'online') {
          await Promise.all([
            // 加载全局交易日历（会自动跳过重复加载）
            loadTradingDays(),
            // 预加载同花顺账号数据，避免切换自选tab时闪烁
            loadThsAccounts().catch(() => {})
          ]);
        
          // 从全局日历获取最近开盘日
          const latestDate = getLatestTradingDate();
          if (!cancelled && !baseTradeDate && latestDate) {
            setBaseTradeDate(latestDate);
            setTradeDate(latestDate);
          }
        }
      } catch (error) {
        console.error('初始化失败:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [baseTradeDate]); // 移除函数依赖，只依赖baseTradeDate状态

  // 🔧 周期切换时从 baseTradeDate 重新计算 tradeDate
  // 这样 周→月→周 切换时，日期会变化但能恢复到原来的周
  const prevPeriodRef = useRef<string>(globalPeriod);
  useEffect(() => {
    if (prevPeriodRef.current === globalPeriod || !baseTradeDate) {
      prevPeriodRef.current = globalPeriod;
      return;
    }
    prevPeriodRef.current = globalPeriod;

    // 从基准日期计算当前周期的显示日期
    const newDate = convertDateForPeriod(baseTradeDate, globalPeriod);
    if (newDate) {
      setTradeDate(newDate);
    }
  }, [globalPeriod, baseTradeDate]);

  // 日历选择日期时的处理函数
  const handleDateChange = useCallback((newDate: string) => {
    // 标记用户已手动选择日期
    setUserChangedTradeDate(true);
    // 更新基准日期（日历组件已经根据周期转换过了）
    // 对于日线，日历返回的是选择的日期
    // 对于周线，日历返回的是周五
    // 对于月线，日历返回的是月底
    // 我们需要保存"原始概念"的日期，所以直接保存
    setBaseTradeDate(newDate);
    setTradeDate(newDate);
  }, []);

  // 实时更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleThemeChange = useCallback((newTheme: string) => {
    setDashboardTheme(newTheme as any);
  }, [setDashboardTheme]);

  // 主题快捷键
  useThemeHotkey({ theme, setTheme: handleThemeChange });

  const themeBg = useMemo(() => {
    switch (theme) {
      case 'light':
        return '#f0f2f5';
      case 'blue':
        return '#001d3d';
      case 'purple':
        return '#1e1033';
      case 'green':
        return '#0f2f1f';
      case 'orange':
        return '#2f1f0f';
      case 'cyan':
        return '#002a2e';
      case 'red':
        return '#2a0f0f';
      case 'gold':
        return '#2a2400';
      default:
        return '#001529';
    }
  }, [theme]);

  // 全局十字线模式状态
  const [globalIsSnapMode, setGlobalIsSnapMode] = useState(true);

  React.useEffect(() => {
    message.config({
      top: 60,
      duration: 3,
      maxCount: 3,
      getContainer: () => document.body,
    });
  }, []);

  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkBackendStatus = async () => {
    try {
      // 使用轻量的健康检查，不调用用户接口避免重复请求
      const response = await fetch('/api/health', {
        method: 'GET',
        mode: 'cors'
      });

      if (response.ok) {
        const data = await response.json();
        // health接口返回格式: {status: "healthy/unhealthy", ...}
        if (data && data.status === 'healthy') {
          setBackendStatus('online');
          return 'online';
        } else {
          setBackendStatus('offline');
          return 'offline';
        }
      } else {
        setBackendStatus('offline');
        return 'offline';
      }
    } catch (error) {
      setBackendStatus('offline');
      return 'offline';
    }
  };

  if (backendStatus === 'checking') {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5' }}>
          <div style={{
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column'
          }}>
            <Spin size="large" />
            <p style={{ marginTop: '16px' }}>检查后端服务状态...</p>
          </div>
        </Content>
      </Layout>
    );
  }

  if (backendStatus === 'offline') {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5' }}>
          <div style={{ padding: '16px 24px' }}>
            {/* 离线状态下不显示用户菜单，避免调用API */}
            <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '100px' }}>

            <Alert
              message="服务暂时不可用"
              description={
                <div>
                  <p>股票大屏功能暂时无法使用，请稍后再试。</p>
                  <p>如果问题持续存在，请联系技术支持。</p>
                </div>
              }
              type="warning"
              showIcon
              action={
                <Button
                  icon={<ReloadOutlined />}
                  onClick={checkBackendStatus}
                >
                  重新检查
                </Button>
              }
            />
            </div>
          </div>
        </Content>
      </Layout>
    );
  }

  // 桌面端布局
  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Content style={{ padding: '16px 24px', background: themeBg, overflow: 'auto', height: '100%' }}>
        <div className={`dashboard-theme ${theme}`} style={{
          maxWidth: '100%',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* 顶部导航：左侧标题，右侧时间+头像（全局控制） */}
          <div className="navigation-container" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            padding: '16px 24px',
            background: theme === 'light' ? '#ffffff' : 'rgba(255,255,255,0.1)',
            border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : 'none',
            boxShadow: 'none',
            borderRadius: '8px',
          }}>
            {/* 左侧：页面标题 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Title level={3} className="label-text" style={{ margin: 0 }}>
                📊 股票K线大屏系统
              </Title>
            </div>

            {/* 右侧：当前时间 + 用户头像（全局控制入口） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                className="label-text"
                style={{
                  fontSize: '16px',
                  fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{formatDateTime(currentTime)}</span>
              </div>
              <UserMenu />
            </div>
          </div>

          <KLineDataDisplay
            globalIsSnapMode={globalIsSnapMode}
            onSnapModeChange={setGlobalIsSnapMode}
            globalIndicator={globalIndicator}
            onGlobalIndicatorChange={setGlobalIndicator}
            globalMainOverlays={globalMainOverlays}
            onGlobalMainOverlaysChange={setGlobalMainOverlays}
            globalPeriod={globalPeriod as Period}
            globalTimeRange={globalTimeRange}
            onGlobalPeriodChange={setGlobalPeriod}
            onGlobalTimeRangeChange={setGlobalTimeRange}
            theme={theme}
            tradeDate={tradeDate}
            onTradeDateChange={handleDateChange}
            userChangedTradeDate={userChangedTradeDate}
          />
        </div>
      </Content>

      {/* Cookie 配置弹窗 - 懒加载 */}
      <Suspense fallback={null}>
        <ThsCookieConfigModal
          open={cookieModalVisible}
          onClose={() => setCookieModalVisible(false)}
          onStatusChange={() => {}}
        />
      </Suspense>
    </Layout>
  );
};

export default Dashboard;