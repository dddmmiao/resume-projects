import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.tsx';
import MobileDashboard from './pages/MobileDashboard.tsx';
import AdminPanel from './pages/AdminPanel.tsx';
import Relogin from './pages/Relogin.tsx';
import NotFound from './pages/NotFound.tsx';
import Login from './pages/Login.tsx';
import PrivateRoute from './components/PrivateRoute.tsx';
import AdminRoute from './components/AdminRoute.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { useMobileDetection } from './hooks/useMobileDetection.ts';
import { useAppStore } from './stores/useAppStore.ts';
import { useThsSessionExpiredNotification } from './hooks/useThsSessionExpiredNotification.tsx';
import './App.css';

// 主页面路由组件 - 根据设备类型渲染不同组件
const MainPage: React.FC = () => {
  const { isMobile } = useMobileDetection();

  const theme = useAppStore(state => state.mobileTheme);
  const setMobileTheme = useAppStore(state => state.setMobileTheme);

  const handleThemeChange = (newTheme: string) => {
    const validTheme = newTheme === 'light' ? 'light' : 'dark';
    setMobileTheme(validTheme);
  };
  
  // 根据设备类型渲染对应组件
  if (isMobile) {
    return <MobileDashboard theme={theme} onThemeChange={handleThemeChange} />;
  }
  
  return <Dashboard />;
};

// 主App组件
const App: React.FC = () => {
  const theme = useAppStore(state => state.mobileTheme);
  const setMobileTheme = useAppStore(state => state.setMobileTheme);
  const loadSystemConfig = useAppStore(state => state.loadSystemConfig);
  
  // 🚀 应用初始化时加载系统配置（indicatorSource、loginMethods等）
  useEffect(() => {
    loadSystemConfig();
  }, [loadSystemConfig]);
  
  // 🚀 全局监听同花顺登录态过期事件
  useThsSessionExpiredNotification();

  const handleMobileThemeChange = (newTheme: string) => {
    const validTheme = newTheme === 'light' ? 'light' : 'dark';
    setMobileTheme(validTheme);
  };

  return (
    <ErrorBoundary>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/relogin" element={<Relogin />} />
            <Route path="/" element={<PrivateRoute><MainPage /></PrivateRoute>} />
            <Route path="/mobile" element={
              <PrivateRoute>
                <MobileDashboard theme={theme} onThemeChange={handleMobileThemeChange} />
              </PrivateRoute>
            } />
            <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
