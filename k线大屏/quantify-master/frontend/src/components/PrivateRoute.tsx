/**
 * 私有路由组件
 * 需要登录才能访问的路由
 */
import React from 'react';
import { Navigate } from 'react-router-dom';

interface PrivateRouteProps {
  children: React.ReactElement;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    // 未登录，跳转到登录页
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

export default PrivateRoute;
