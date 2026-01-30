/**
 * Axios配置和拦截器
 * 自动添加JWT token到请求头
 */
import axios from 'axios';
import { message } from 'antd';

// 超时配置常量
const AXIOS_TIMEOUT = 30000; // 30秒，与后端25秒保持5秒缓冲

// 创建axios实例
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  timeout: AXIOS_TIMEOUT,
});

// 请求拦截器 - 自动添加token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理401错误
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const errorCode = error.response?.data?.code;
      
      // 🚀 同花顺登录态过期 - 触发全局事件通知
      if (errorCode === 'THS_SESSION_EXPIRED') {
        const eventData = error.response?.data?.data || {};
        window.dispatchEvent(new CustomEvent('ths-session-expired', {
          detail: {
            user_id: eventData.user_id,
            ths_account: eventData.ths_account,
            message: error.response?.data?.message
          }
        }));
        // 不跳转登录页，只触发事件
        return Promise.reject(error);
      }
      
      // 系统Token过期或无效
      localStorage.removeItem('access_token');
      
      // 跳转到登录页
      if (window.location.pathname !== '/login') {
        message.error('登录已过期，请重新登录');
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      message.error('权限不足');
    } else if (error.response?.status >= 500) {
      message.error('服务器错误，请稍后重试');
    }
    
    return Promise.reject(error);
  }
);

export default axiosInstance;
