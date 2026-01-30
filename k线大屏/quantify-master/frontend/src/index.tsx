import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import './index.css';
import App from './App.tsx';

// 🚀 过滤第三方浏览器注入脚本的错误（如UC浏览器）
window.addEventListener('error', (event) => {
  const filename = event.filename || '';
  // 过滤UC浏览器、夸克等注入脚本的错误
  if (filename.includes('ucbrowser') || 
      filename.includes('quark') || 
      filename.includes('inject') ||
      filename.includes('extension')) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason || '');
  // 过滤第三方脚本的Promise错误
  if (reason.includes('ucbrowser') || reason.includes('tagName')) {
    event.preventDefault();
    return false;
  }
});

// 初始化 vconsole 用于移动端调试（仅移动端显示）
if (process.env.NODE_ENV !== 'production') {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768;
  if (isMobile) {
    import('vconsole').then(({ default: VConsole }) => {
      new VConsole();
    });
  }
}

// 设置dayjs中文
dayjs.locale('zh-cn');

// 全局配置 Ant Design message，确保移动端和桌面端 toast 都能按预期自动关闭
message.config({
  duration: 2,
  maxCount: 3,
});

// 开发环境下将 message 暴露到 window，方便在控制台手动调试销毁行为
if (process.env.NODE_ENV !== 'production') {
  // @ts-ignore
  (window as any).__antdMessage = message;
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <ConfigProvider locale={zhCN}>
    <App />
  </ConfigProvider>
);
