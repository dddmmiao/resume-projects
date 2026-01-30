import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Spin, message, Button, Input } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SliderCaptchaModal from '../components/SliderCaptchaModal.tsx';
import { ThsMessages } from '../utils/thsMessages.ts';
import { validateSmsCode } from '../utils/thsValidation.ts';

// 补登录页面专用 fetch（无需认证，避免 401 重定向）
const reloginFetch = async (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};

interface ReloginState {
  status: string;
  method: string;
  username: string;
  nickname?: string;
  session_id?: string;
  mobile?: string;
  timeout_at?: string;
  started_at?: string;
}

interface CaptchaImages {
  background: string;
  slider: string;
  init_y?: number;
}

// 检测是否为移动端
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// 自定义 Toast（移动端兼容）
const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
  if (isMobile()) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${type === 'success' ? 'rgba(82, 196, 26, 0.9)' : 'rgba(255, 77, 79, 0.9)'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999;
      max-width: 80%;
      text-align: center;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  } else {
    type === 'success' ? message.success(msg) : message.error(msg);
  }
};

// 移动端 Loading 动画样式修复
const MobileLoadingStyles = () => (
  <style>{`
    @keyframes relogin-spin { to { transform: rotate(360deg); } }
    /* 修复Ant Design Button loading图标动画 */
    .ant-btn-loading-icon .anticon {
      animation: relogin-spin 1s linear infinite !important;
    }
    .ant-spin-dot-item {
      animation: relogin-spin 1s linear infinite !important;
    }
  `}</style>
);

const Relogin: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const username = searchParams.get('username');
  const account = searchParams.get('account');
  
  const [loading, setLoading] = useState(true);
  const [reloginState, setReloginState] = useState<ReloginState | null>(null);
  const [qrImage, setQrImage] = useState<string>('');
  const [smsCode, setSmsCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // SMS相关状态
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const smsCountdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // 滑块验证码状态
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaImages, setCaptchaImages] = useState<CaptchaImages | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  
  // QR相关状态
  const [qrLoading, setQrLoading] = useState(false);
  
  // 轮询二维码状态
  const startQrPolling = useCallback((sid: string) => {
    // 清除之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await reloginFetch(`/api/ths/qr/status/${sid}`);
        const data = await response.json();
        
        if (data.success && data.data) {
          if (data.data.status === 'success') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setReloginState(prev => prev ? { ...prev, status: 'success' } : null);
            showToast(ThsMessages.QR_SCAN_SUCCESS);
          } else if (data.data.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            showToast(ThsMessages.LOGIN_FAILED, 'error');
          }
        }
      } catch (error) {
        console.error('轮询二维码状态失败:', error);
      }
    }, 2000);
  }, []);
  
  // 加载二维码（根据session_id）
  const loadQrCode = useCallback(async (sid: string) => {
    try {
      const response = await reloginFetch(`/api/ths/qr/status/${sid}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        if (data.data.status === 'qr_ready' && data.data.qr_image) {
          setQrImage(data.data.qr_image);
          startQrPolling(sid);
        } else if (data.data.status === 'success') {
          setReloginState(prev => prev ? { ...prev, status: 'success' } : null);
          showToast(ThsMessages.RELOGIN_SUCCESS);
        }
      }
    } catch (error) {
      console.error('加载二维码失败:', error);
    }
  }, [startQrPolling]);
  
  // 主动发送短信验证码
  const handleSendSms = useCallback(async () => {
    if (!reloginState?.mobile) {
      showToast(ThsMessages.MISSING_MOBILE, 'error');
      return;
    }
    
    setSmsSending(true);
    try {
      const response = await reloginFetch('/api/ths/sms/send', {
        method: 'POST',
        body: JSON.stringify({ mobile: reloginState.mobile })
      });
      
      // 处理429限流
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || ThsMessages.RATE_LIMITED('发送验证码');
        showToast(msg, 'error');
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 检查是否需要滑块验证
        if (data.data?.captcha_required && data.data?.captcha_images) {
          setCaptchaImages({
            background: data.data.captcha_images.background,
            slider: data.data.captcha_images.slider,
            init_y: data.data.captcha_images.init_y,
          });
          setCaptchaRequired(true);
          showToast(ThsMessages.CAPTCHA_REQUIRED);
        } else {
          setSmsSent(true);
          // 启动60秒倒计时
          setSmsCountdown(60);
          if (smsCountdownRef.current) clearInterval(smsCountdownRef.current);
          smsCountdownRef.current = setInterval(() => {
            setSmsCountdown(prev => {
              if (prev <= 1) {
                if (smsCountdownRef.current) clearInterval(smsCountdownRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          showToast(ThsMessages.SMS_SENT);
        }
      } else {
        showToast(data.message || ThsMessages.SMS_SEND_FAILED, 'error');
      }
    } catch (error) {
      console.error('发送验证码失败:', error);
      showToast(ThsMessages.SMS_SEND_FAILED, 'error');
    } finally {
      setSmsSending(false);
    }
  }, [reloginState?.mobile]);
  
  // 会话过期时重新初始化验证码（重新发送短信获取新会话）
  const handleReInitCaptcha = useCallback(async () => {
    if (!reloginState?.mobile) return;
    
    setCaptchaLoading(true);
    showToast(ThsMessages.SESSION_EXPIRED_REINIT, 'error');
    try {
      const response = await reloginFetch('/api/ths/sms/send', {
        method: 'POST',
        body: JSON.stringify({ mobile: reloginState.mobile })
      });
      const data = await response.json();
      
      if (data.success && data.data?.captcha_required && data.data?.captcha_images) {
        setCaptchaImages({
          background: data.data.captcha_images.background,
          slider: data.data.captcha_images.slider,
          init_y: data.data.captcha_images.init_y,
        });
        showToast(ThsMessages.CAPTCHA_REQUIRED);
      } else if (data.success) {
        // 不需要滑块验证，直接发送成功
        setCaptchaRequired(false);
        setCaptchaImages(null);
        setSmsSent(true);
        showToast(ThsMessages.SMS_SENT);
      } else {
        showToast(data.message || ThsMessages.CAPTCHA_GET_FAILED, 'error');
      }
    } catch (error) {
      showToast(ThsMessages.CAPTCHA_GET_FAILED, 'error');
    } finally {
      setCaptchaLoading(false);
    }
  }, [reloginState?.mobile]);
  
  // 刷新滑块验证码
  const handleRefreshCaptcha = useCallback(async () => {
    if (!reloginState?.mobile) return;
    
    setCaptchaLoading(true);
    try {
      const response = await reloginFetch('/api/ths/sms/captcha/refresh', {
        method: 'POST',
        body: JSON.stringify({ mobile: reloginState.mobile })
      });
      const data = await response.json();
      
      if (data.success && data.data?.captcha_images) {
        setCaptchaImages({
          background: data.data.captcha_images.background,
          slider: data.data.captcha_images.slider,
          init_y: data.data.captcha_images.init_y,
        });
      } else {
        // 会话过期时重新初始化
        if (data.message?.includes('过期')) {
          handleReInitCaptcha();
        } else {
          showToast(data.message || ThsMessages.CAPTCHA_REFRESH_FAILED, 'error');
        }
      }
    } catch (error) {
      showToast(ThsMessages.CAPTCHA_REFRESH_FAILED, 'error');
    } finally {
      setCaptchaLoading(false);
    }
  }, [reloginState?.mobile, handleReInitCaptcha]);
  
  // 提交滑块验证（由SliderCaptchaModal调用）
  const handleSubmitCaptcha = useCallback(async (x: number, trackWidth: number) => {
    if (!reloginState?.mobile) return;
    
    setCaptchaLoading(true);
    try {
      const response = await reloginFetch('/api/ths/sms/captcha', {
        method: 'POST',
        body: JSON.stringify({
          mobile: reloginState.mobile,
          x: x,
          track_width: trackWidth
        })
      });
      const data = await response.json();
      
      if (data.success) {
        setCaptchaRequired(false);
        setCaptchaImages(null);
        setSmsSent(true);
        setSmsCountdown(60);
        if (smsCountdownRef.current) clearInterval(smsCountdownRef.current);
        smsCountdownRef.current = setInterval(() => {
          setSmsCountdown(prev => {
            if (prev <= 1) {
              if (smsCountdownRef.current) clearInterval(smsCountdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        showToast(ThsMessages.SMS_SENT);
      } else {
        showToast(data.message || ThsMessages.CAPTCHA_VERIFY_FAILED, 'error');
        // 验证失败时自动刷新验证码
        handleRefreshCaptcha();
      }
    } catch (error) {
      showToast(ThsMessages.CAPTCHA_VERIFY_FAILED, 'error');
      // 验证失败时自动刷新验证码
      handleRefreshCaptcha();
    } finally {
      setCaptchaLoading(false);
    }
  }, [reloginState?.mobile, handleRefreshCaptcha]);
  
  // 主动获取二维码
  const handleGetQrCode = useCallback(async () => {
    if (!account) {
      showToast(ThsMessages.MISSING_ACCOUNT, 'error');
      return;
    }
    
    setQrLoading(true);
    setQrImage('');
    try {
      const response = await reloginFetch('/api/ths/qr/generate', {
        method: 'POST',
        body: JSON.stringify({ ths_account: account })
      });
      
      // 处理429限流
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || ThsMessages.RATE_LIMITED('生成二维码');
        showToast(msg, 'error');
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        const sid = data.data.session_id;
        
        if (data.data.qr_image) {
          setQrImage(data.data.qr_image);
          startQrPolling(sid);
        } else {
          // 等待二维码准备好
          setTimeout(() => loadQrCode(sid), 1000);
        }
      } else {
        // 使用统一的错误消息
        const errorMsg = data.message || ThsMessages.QR_GENERATE_FAILED;
        showToast(errorMsg, 'error');
      }
    } catch (error: any) {
      console.error('获取二维码失败:', error);
      showToast(ThsMessages.QR_GENERATE_FAILED, 'error');
    } finally {
      setQrLoading(false);
    }
  }, [account, startQrPolling, loadQrCode]);
  
  // 加载补登录状态（统一从 Redis 获取）
  const fetchReloginState = useCallback(async () => {
    if (!username || !account) {
      showToast(ThsMessages.MISSING_PARAMS, 'error');
      setLoading(false);
      return;
    }
    
    try {
      const response = await reloginFetch(`/api/admin/relogin/state?username=${username}&account=${account}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        setReloginState(data.data);
        
        // 二维码方式：用户需要点击按钮主动获取二维码
        // 不再自动恢复之前的二维码，简化流程
      } else {
        showToast(data.message || ThsMessages.LOAD_RELOGIN_STATE_FAILED, 'error');
      }
    } catch (error) {
      console.error('加载补登录状态失败:', error);
      showToast(ThsMessages.LOAD_RELOGIN_STATE_FAILED, 'error');
    } finally {
      setLoading(false);
    }
  }, [username, account]);
  
  // 提交短信验证码
  const handleSmsSubmit = async (codeOverride?: string) => {
    const code = codeOverride ?? smsCode;
    const smsCodeError = validateSmsCode(code);
    if (smsCodeError) {
      showToast(smsCodeError, 'error');
      return;
    }
    
    const mobile = reloginState?.mobile;
    if (!mobile) {
      showToast(ThsMessages.MISSING_MOBILE, 'error');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await reloginFetch('/api/ths/sms/login', {
        method: 'POST',
        body: JSON.stringify({
          mobile: mobile,
          sms_code: code
        })
      });
      
      // 处理429限流
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || ThsMessages.RATE_LIMITED('登录');
        showToast(msg, 'error');
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        setReloginState(prev => prev ? { ...prev, status: 'success' } : null);
        showToast(ThsMessages.RELOGIN_SUCCESS);
      } else {
        showToast(data.message || ThsMessages.LOGIN_FAILED, 'error');
      }
    } catch (error) {
      console.error('短信登录失败:', error);
      showToast(ThsMessages.SMS_LOGIN_FAILED, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  
  useEffect(() => {
    fetchReloginState();
    
    // 组件卸载时清理定时器
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (smsCountdownRef.current) {
        clearInterval(smsCountdownRef.current);
      }
    };
  }, [fetchReloginState]);
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }
  
  if (!reloginState) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: '#f5f5f5',
        padding: 20,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '10vh'
      }}>
        {/* 移动端Loading动画修复 */}
        <MobileLoadingStyles />
        <Card title="补登录" style={{ width: 400 }}>
          <p>未找到补登录任务</p>
          <Button type="primary" onClick={() => navigate('/')}>返回首页</Button>
        </Card>
      </div>
    );
  }
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      padding: '20px',
      background: '#f0f2f5'
    }}>
      {/* 移动端Loading动画修复 */}
      <MobileLoadingStyles />
      <Card 
        title={`同花顺账号补登录 - ${reloginState.nickname || account}`}
        style={{ width: '100%', maxWidth: 500 }}
      >
        {reloginState.status === 'success' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ 
              fontSize: 48, 
              color: '#52c41a', 
              marginBottom: 16 
            }}>
              ✓
            </div>
            <p style={{ fontSize: 18, color: '#333', marginBottom: 8 }}>
              补登录成功
            </p>
            <p style={{ color: '#666', marginBottom: 24 }}>
              账号 {reloginState.nickname || account} 已成功登录
            </p>
            <Button type="primary" onClick={() => {
              // 检查是否已登录系统，未登录则跳转到登录页并携带用户名
              const token = localStorage.getItem('token');
              if (token) {
                navigate('/');
              } else {
                // 携带用户名跳转到登录页
                navigate(`/login?username=${encodeURIComponent(username || '')}`);
              }
            }}>
              进入系统
            </Button>
          </div>
        )}
        
        {reloginState.status === 'failed' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ 
              fontSize: 48, 
              color: '#ff4d4f', 
              marginBottom: 16 
            }}>
              ✗
            </div>
            <p style={{ fontSize: 18, color: '#333', marginBottom: 8 }}>
              补登录失败
            </p>
            <p style={{ color: '#666', marginBottom: 24 }}>
              请稍后重试或联系管理员
            </p>
            <Button onClick={() => navigate('/')}>返回首页</Button>
          </div>
        )}
        
        {reloginState.status === 'waiting_user' && reloginState.method === 'qr' && (
          <div style={{ textAlign: 'center' }}>
            {/* 提示文字 */}
            <p style={{ color: '#666', marginBottom: 16 }}>
              {qrImage ? '请使用微信扫描下方二维码' : '点击按钮获取登录二维码'}
            </p>
            
            {/* 二维码或获取按钮 */}
            {qrImage ? (
              <div style={{ 
                display: 'inline-block',
                padding: 12,
                background: '#fff',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                marginBottom: 16
              }}>
                <img 
                  src={qrImage} 
                  alt="登录二维码" 
                  style={{ width: 180, height: 180, display: 'block' }}
                />
              </div>
            ) : (
              <div style={{ padding: 40 }}>
                <Button 
                  type="primary" 
                  size="large"
                  loading={qrLoading}
                  onClick={handleGetQrCode}
                >
                  获取二维码
                </Button>
              </div>
            )}
            
            {/* 刷新二维码 */}
            {qrImage && (
              <div style={{ marginTop: 16 }}>
                <Button 
                  type="link" 
                  loading={qrLoading}
                  onClick={handleGetQrCode}
                >
                  刷新二维码
                </Button>
              </div>
            )}
          </div>
        )}
        
        {reloginState.status === 'waiting_user' && reloginState.method === 'sms' && (
          <div style={{ textAlign: 'center' }}>
            {/* 发送验证码或输入验证码 */}
            {!smsSent ? (
              <>
                <p style={{ color: '#666', marginBottom: 24 }}>
                  点击按钮向 {reloginState.mobile} 发送验证码
                </p>
                <Button 
                  type="primary" 
                  size="large"
                  loading={smsSending}
                  onClick={handleSendSms}
                >
                  发送验证码
                </Button>
              </>
            ) : (
              <>
                <p style={{ color: '#666', marginBottom: 24 }}>
                  验证码已发送至 {reloginState.mobile}
                </p>
                
                {/* 验证码输入 - 输入完成自动提交 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  marginBottom: 24 
                }}>
                  <Input.OTP
                    length={6}
                    value={smsCode}
                    onChange={(value) => {
                      setSmsCode(value);
                      // 输入6位后自动提交（仅在验证码已发送后触发）
                      if (value.length === 6 && smsSent && !submitting) {
                        setTimeout(() => handleSmsSubmit(value), 100);
                      }
                    }}
                    size="large"
                  />
                </div>
                
                {/* 提交按钮（保留手动提交选项） */}
                <Button 
                  type="primary" 
                  block
                  size="large"
                  loading={submitting}
                  onClick={() => handleSmsSubmit()}
                >
                  {submitting ? '验证中...' : '确认登录'}
                </Button>
                
                {/* 重新发送 */}
                <div style={{ marginTop: 16 }}>
                  {smsCountdown > 0 ? (
                    <span style={{ color: '#999' }}>{smsCountdown}秒后可重新发送</span>
                  ) : (
                    <Button type="link" onClick={handleSendSms} loading={smsSending}>
                      重新发送验证码
                    </Button>
                  )}
                </div>
              </>
            )}
            
          </div>
        )}
        
        {reloginState.status === 'waiting_user' && reloginState.method === 'password' && (
          <div style={{ textAlign: 'center' }}>
            <Spin tip="系统正在自动登录..." />
            <p style={{ marginTop: 20, color: '#666' }}>
              使用密码自动登录中，无需您操作
            </p>
          </div>
        )}
        
        {reloginState.status === 'pending' && (
          <div style={{ textAlign: 'center' }}>
            <Spin tip="正在准备补登录..." />
          </div>
        )}
      </Card>
      
      {/* 滑块验证码弹窗 - 顶层显示 */}
      <SliderCaptchaModal
        open={captchaRequired}
        captchaImages={captchaImages}
        loading={captchaLoading}
        onSubmit={handleSubmitCaptcha}
        onCancel={() => {
          setCaptchaRequired(false);
          setCaptchaImages(null);
        }}
        onRefresh={handleRefreshCaptcha}
      />
    </div>
  );
};

export default Relogin;
