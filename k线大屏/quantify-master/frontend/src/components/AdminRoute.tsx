/**
 * 管理员路由组件
 * 只有管理员才能访问的路由
 */
import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import authFetch from '../utils/authFetch.ts';

interface AdminRouteProps {
  children: React.ReactElement;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const navigate = useNavigate();
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean | null>(null);
  const token = localStorage.getItem('access_token');
  
  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!token) {
        setHasAdminAccess(false);
        return;
      }
      
      try {
        // 调用管理API验证权限，如果没有权限会返回403
        const response = await authFetch('/api/admin/tasks/running');
        if (response.ok) {
          setHasAdminAccess(true);
        } else if (response.status === 403) {
          setHasAdminAccess(false);
        }
      } catch (error) {
        setHasAdminAccess(false);
      }
    };
    
    checkAdminAccess();
  }, [token]);

  // 未登录，跳转到登录页
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  // 权限检查中
  if (hasAdminAccess === null) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>验证权限中...</div>;
  }

  // 有管理员权限
  if (hasAdminAccess) {
    return <>{children}</>;
  }

  // 无管理员权限
  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h2>访问被拒绝</h2>
      <p>您没有访问此页面的权限</p>
      <Button onClick={() => navigate('/')}>返回首页</Button>
    </div>
  );
};

export default AdminRoute;
