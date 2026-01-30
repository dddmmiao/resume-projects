import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, GiftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useMobileDetection } from '../hooks/useMobileDetection.ts';
import { useMobileMessageOverride } from '../hooks/useMobileMessageOverride.tsx';
import './Login.css';

const { TabPane } = Tabs;

interface LoginFormValues {
  username: string;
  password: string;
}

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
  nickname?: string;
  invitation_code: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  
  // 移动端检测和Toast工具
  const { isMobile } = useMobileDetection();
  const { MobileToastHost } = useMobileMessageOverride(isMobile);

  // 从URL参数读取用户名（补登录跳转携带）
  useEffect(() => {
    const usernameFromUrl = searchParams.get('username');
    if (usernameFromUrl) {
      loginForm.setFieldsValue({ username: usernameFromUrl });
    }
  }, [searchParams, loginForm]);

  // 登录处理
  const handleLogin = async (values: LoginFormValues) => {
    setLoginLoading(true);
    try {
      const response = await axios.post('/api/user/login', {
        username: values.username,
        password: values.password,
      });

      if (response.data.success) {
        const { access_token } = response.data.data;
        
        // 保存token到localStorage
        localStorage.setItem('access_token', access_token);
        
        message.success('登录成功！');
        
        // 跳转到主页
        navigate('/');
      } else {
        message.error(response.data.message || '登录失败');
      }
    } catch (error: any) {
      console.error('登录失败:', error);
      message.error(error.response?.data?.message || '登录失败，请检查网络连接');
    } finally {
      setLoginLoading(false);
    }
  };

  // 注册处理
  const handleRegister = async (values: RegisterFormValues) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setRegisterLoading(true);
    try {
      const response = await axios.post('/api/user/register', {
        username: values.username,
        password: values.password,
        nickname: values.nickname,
        invitation_code: values.invitation_code,
      });

      if (response.data.success) {
        message.success('注册成功！请登录');
        
        // 切换到登录tab
        registerForm.resetFields();
        
        // 自动填充用户名到登录表单
        loginForm.setFieldsValue({
          username: values.username,
        });
      } else {
        message.error(response.data.message || '注册失败');
      }
    } catch (error: any) {
      console.error('注册失败:', error);
      message.error(error.response?.data?.message || '注册失败，请检查网络连接');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-background" />
      <Card className="login-card" bordered={false}>
        <div className="login-header">
          <h1>股票K线大屏系统</h1>
        </div>

        <Tabs defaultActiveKey="login" centered>
          <TabPane tab="登录" key="login">
            <Form
              form={loginForm}
              name="login"
              onFinish={handleLogin}
              autoComplete="off"
              size="large"
            >
              <Form.Item
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="用户名"
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6个字符' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loginLoading}
                  block
                >
                  登录
                </Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane tab="注册" key="register">
            <Form
              form={registerForm}
              name="register"
              onFinish={handleRegister}
              autoComplete="off"
              size="large"
            >
              <Form.Item
                name="invitation_code"
                rules={[
                  { required: true, message: '请输入邀请码' },
                ]}
              >
                <Input
                  prefix={<GiftOutlined />}
                  placeholder="邀请码"
                  autoComplete="off"
                />
              </Form.Item>

              <Form.Item
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, max: 50, message: '用户名长度为3-50个字符' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="用户名"
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                name="nickname"
                rules={[
                  { max: 50, message: '昵称最多50个字符' },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="昵称（可选）"
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, max: 100, message: '密码长度为6-100个字符' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: '请确认密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="确认密码"
                  autoComplete="new-password"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={registerLoading}
                  block
                >
                  注册
                </Button>
              </Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
      
      {/* 移动端专用Toast */}
      <MobileToastHost />
    </div>
  );
};

export default Login;
