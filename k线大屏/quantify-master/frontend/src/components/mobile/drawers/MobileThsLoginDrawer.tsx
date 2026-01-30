/**
 * 移动端同花顺登录半屏Drawer
 * 基于现有ThsLoginModal逻辑，适配移动端交互
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Input, Space, Typography, message } from 'antd';
import { QrcodeOutlined, MobileOutlined, LockOutlined, UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { getThemeColors, type Theme } from '../theme.ts';
import { useAppStore } from '../../../stores/useAppStore.ts';
import axiosInstance from '../../../utils/axios.ts';
import { setThsUsername } from '../../../utils/userKey.ts';
import { useMobileMessageOverride } from '../../../hooks/useMobileMessageOverride.tsx';
import { BottomDrawer } from '../BottomDrawer.tsx';
import SliderCaptchaModal from '../../SliderCaptchaModal.tsx';
import { validateMobile, validateUsername, validatePassword, validateCookieStr, validateSmsCode } from '../../../utils/thsValidation.ts';
import { ThsMessages, ThsTimeouts, handle429Error, is429Error } from '../../../utils/thsMessages.ts';
import type { LoginMethod, QrState } from '../../../types/thsLogin.ts';

const { Text } = Typography;
const { QR_SESSION_TIMEOUT_MS, SMS_SESSION_TIMEOUT_MS, SMS_RETRY_DEBOUNCE_MS } = ThsTimeouts;

interface MobileThsLoginDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onSuccess?: (username: string) => void;
}

type LoginStep = 'select' | 'login';

const MobileThsLoginDrawer: React.FC<MobileThsLoginDrawerProps> = React.memo(({ theme, open, onClose, onSuccess }) => {
  const currentTheme = getThemeColors(theme);
  
  
  // 使用移动端专用的toast方法
  const { MobileToastHost } = useMobileMessageOverride(true);
  
  // 全局状态 - 仅订阅实际需要的状态
  const thsAccounts = useAppStore(state => state.thsAccounts);
  const loadThsAccounts = useAppStore(state => state.loadThsAccounts);
  const thsLoginMethods = useAppStore(state => state.thsLoginMethods);
  const availableMethods = useMemo(() => thsLoginMethods as LoginMethod[], [thsLoginMethods]);
  
  // 步骤和方法状态
  const [currentStep, setCurrentStep] = useState<LoginStep>('select');
  const [selectedMethod, setSelectedMethod] = useState<LoginMethod>('sms');

  
  // 各种登录方法的状态
  const [smsSendLoading, setSmsSendLoading] = useState(false); // 发送验证码loading
  const [smsLoginLoading, setSmsLoginLoading] = useState(false); // 登录按钮lloading
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [cookieLoading, setCookieLoading] = useState(false);
  const [mobile, setMobile] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsCodeSent, setSmsCodeSent] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [pwdUsername, setPwdUsername] = useState('');
  const [pwdPassword, setPwdPassword] = useState('');
  const [cookieStr, setCookieStr] = useState('');
  
  // 滑块验证码状态
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaImages, setCaptchaImages] = useState<{ background: string; slider: string; init_y?: number } | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  
  // 二维码状态
  const [qrState, setQrState] = useState<QrState>({ type: 'idle' });
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastQrGenerateTimeRef = useRef<number>(0);
  const qrPollingRef = useRef<boolean>(false);
  const isGeneratingRef = useRef<boolean>(false);
  
  // 短信限流状态
  const lastSmsGenerateTimeRef = useRef<number>(0);
  const smsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const smsCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 登录方式配置
  const loginMethods = [
    {
      key: 'sms' as LoginMethod,
      title: '短信登录',
      description: '使用手机号验证码登录',
      icon: <MobileOutlined style={{ fontSize: '24px', color: currentTheme.positive }} />,
      available: availableMethods.includes('sms'),
      recommended: true
    },
    {
      key: 'qr' as LoginMethod,
      title: '微信扫码',
      description: '使用微信扫描二维码登录',
      icon: <QrcodeOutlined style={{ fontSize: '24px', color: currentTheme.positive }} />,
      available: availableMethods.includes('qr'),
      recommended: false
    },
    {
      key: 'password' as LoginMethod,
      title: '账号密码',
      description: '使用用户名和密码登录',
      icon: <LockOutlined style={{ fontSize: '24px', color: currentTheme.positive }} />,
      available: availableMethods.includes('password'),
      recommended: false
    },
    {
      key: 'cookie' as LoginMethod,
      title: 'Cookie导入',
      description: '手动导入Cookie字符串',
      icon: <FileTextOutlined style={{ fontSize: '24px', color: currentTheme.positive }} />,
      available: availableMethods.includes('cookie'),
      recommended: false
    }
  ];

  // 🚀 根据可选登录方式数量和当前步骤动态计算半屏高度
  const availableMethodsCount = loginMethods.filter(m => m.available).length;
  const drawerHeight = useMemo(() => {
    // 登录页面需要更多高度（输入框、按钮等）
    if (currentStep === 'login') return '70vh';
    // 选择页面：根据方式数量动态调整
    if (availableMethodsCount <= 1) return '40vh';
    if (availableMethodsCount === 2) return '55vh';
    if (availableMethodsCount === 3) return '65vh';
    return '75vh';
  }, [currentStep, availableMethodsCount]);

  // 处理登录成功（与桌面端保持一致）
  const handleLoginSuccess = useCallback(async (username: string, loginMobile?: string, nickname?: string, loginMethod?: string) => {
    // 确保username是字符串类型并校验非空
    const usernameStr = String(username).trim();
    if (!usernameStr) {
      message.error(ThsMessages.LOGIN_NO_ACCOUNT_INFO);
      return;
    }
    
    // 检查是否为相同账号登录
    const currentAccount = thsAccounts.find(acc => acc.is_online);
    const isSameAccount = currentAccount?.ths_account === usernameStr;
    
    setThsUsername(usernameStr);
    try {
      const response = await axiosInstance.post('/api/user/ths-accounts', {
        ths_account: usernameStr,
        mobile: loginMobile || mobile || null,
        nickname: nickname,
        login_method: loginMethod,
      });
      
      if (response.data?.success) {
        // 成功消息已在具体登录方式中显示，这里不再重复显示
      } else if (response.data?.message?.includes('已存在')) {
        if (isSameAccount) {
          // 相同账号重复登录，提示会话刷新
          message.success(ThsMessages.LOGIN_SESSION_REFRESHED(nickname || usernameStr));
        } else {
          message.info(ThsMessages.LOGIN_ACCOUNT_EXISTS);
        }
      } else {
        message.warning(response.data?.message || ThsMessages.LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('绑定THS账号失败:', error);
      if (error.response?.data?.message?.includes('已存在')) {
        if (isSameAccount) {
          // 相同账号重复登录，提示会话刷新
          message.success(ThsMessages.LOGIN_SESSION_REFRESHED(nickname || usernameStr));
        } else {
          message.info(ThsMessages.LOGIN_ACCOUNT_EXISTS);
        }
      } else {
        message.error(ThsMessages.LOGIN_FAILED + ': ' + (error.response?.data?.message || error.message));
      }
    }
    
    // 刷新全局账号状态，并切换到新账号
    try {
      await loadThsAccounts(usernameStr);
    } catch (error) {
      console.error('刷新账号状态失败:', error);
    }
    
    if (onSuccess) onSuccess(username);
    onClose();
  }, [onSuccess, loadThsAccounts, thsAccounts, mobile, onClose]);

  // 二维码状态派生（与桌面端一致）
  const qrStateHelpers = useMemo(() => ({
    isLoading: qrState.type === 'loading',
    isPolling: qrState.type === 'polling',
    isExpired: qrState.type === 'expired',
    isError: qrState.type === 'error',
    hasImage: qrState.type === 'polling' || qrState.type === 'ready',
    getImage: () => (qrState.type === 'polling' || qrState.type === 'ready') ? qrState.image : null,
    getSessionId: () => (qrState.type === 'polling' || qrState.type === 'ready') ? qrState.sessionId : null,
  }), [qrState]);

  // 二维码状态清理
  const clearQrState = useCallback((options: { resetDebounce?: boolean; setExpired?: boolean } = {}) => {
    qrPollingRef.current = false;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    
    if (options.setExpired) {
      setQrState({ type: 'expired' });
    } else {
      setQrState({ type: 'idle' });
    }
    
    if (options.resetDebounce) {
      lastQrGenerateTimeRef.current = 0;
    }
  }, []);

  // 轮询二维码状态（与桌面端一致）
  const startPollingQrStatus = useCallback((sessionId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }

    qrPollingRef.current = true;
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await axiosInstance.get(`/api/ths/qr/status/${sessionId}`);

        if (!qrPollingRef.current) return;
        
        if (response.data?.success && response.data.data?.status === 'success') {
          // 登录成功
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          qrPollingRef.current = false;
          
          const thsAccount = response.data.data?.ths_account;
          const nickname = response.data.data?.nickname;
          
          if (!thsAccount || !nickname) {
            message.error(ThsMessages.LOGIN_NO_ACCOUNT_INFO);
            setQrState({ type: 'error', message: ThsMessages.LOGIN_NO_ACCOUNT_INFO });
            return;
          }
          
          // 智能提示（与桌面端一致）
          const currentAccount = thsAccounts.find(acc => acc.is_online);
          const isSameAccount = currentAccount?.ths_account === thsAccount;
          
          message.success(isSameAccount 
            ? ThsMessages.LOGIN_SESSION_REFRESHED(nickname) 
            : ThsMessages.LOGIN_SUCCESS(nickname)
          );
          
          setQrState({ type: 'success' });
          await handleLoginSuccess(thsAccount, undefined, nickname, 'qr');
          clearQrState({ resetDebounce: true });
        } else if (!response.data?.success || response.data.data?.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          qrPollingRef.current = false;
          message.error(response.data?.message || ThsMessages.LOGIN_FAILED);
          setQrState({ type: 'error', message: response.data?.message || ThsMessages.LOGIN_FAILED });
          lastQrGenerateTimeRef.current = 0;
        }
      } catch (error: any) {
        console.error('轮询登录状态失败:', error);

        if (!qrPollingRef.current) return;

        if (error.response?.status === 404) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          clearQrState({ resetDebounce: true, setExpired: true });
        } else {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          message.error(ThsMessages.QR_LOGIN_ERROR);
          setQrState({ type: 'error', message: ThsMessages.QR_LOGIN_ERROR });
          lastQrGenerateTimeRef.current = 0;
        }
      }
    }, 2000);
    
    // 超时
    pollTimeoutRef.current = setTimeout(() => {
      if (!qrPollingRef.current) return;
      qrPollingRef.current = false;
      message.warning(ThsMessages.QR_EXPIRED);
      clearQrState({ resetDebounce: true, setExpired: true });
      axiosInstance.delete(`/api/ths/qr/cancel/${sessionId}`).catch(() => {});
    }, QR_SESSION_TIMEOUT_MS);
  }, [clearQrState, handleLoginSuccess, thsAccounts]);

  const handleQrLogin = useCallback(async () => {
    // 检查现存会话（与桌面端一致）
    const existingSessionId = qrStateHelpers.getSessionId();
    if (existingSessionId && qrState.type === 'ready') {
      try {
        const checkResponse = await axiosInstance.get(`/api/ths/qr/status/${existingSessionId}`);
        if (checkResponse.data?.success && 
            checkResponse.data.data?.status !== 'failed' && 
            checkResponse.data.data?.status !== 'timeout') {
          const image = qrStateHelpers.getImage()!;
          setQrState({ type: 'polling', sessionId: existingSessionId, image });
          startPollingQrStatus(existingSessionId);
          return;
        }
      } catch {
        clearQrState({ resetDebounce: true });
      }
    }
    
    // 生成中检查（与桌面端一致）
    if (isGeneratingRef.current) return;
    
    // 防抖
    const now = Date.now();
    if (now - lastQrGenerateTimeRef.current < QR_SESSION_TIMEOUT_MS) {
      const remainingSeconds = Math.ceil((QR_SESSION_TIMEOUT_MS - (now - lastQrGenerateTimeRef.current)) / 1000);
      message.warning(ThsMessages.QR_RATE_LIMITED_SECONDS(remainingSeconds));
      return;
    }
    
    isGeneratingRef.current = true;
    lastQrGenerateTimeRef.current = now;
    setQrState({ type: 'loading' });

    try {
      const response = await axiosInstance.post('/api/ths/qr/generate', {
        headless: true
      }, {
        timeout: 30000
      });
      
      // 响应验证（与桌面端一致）
      if (!response.data?.success) {
        message.error(response.data?.message || ThsMessages.QR_GENERATE_FAILED);
        setQrState({ type: 'error', message: response.data?.message });
        lastQrGenerateTimeRef.current = 0;
        return;
      }
      
      const sessionId = response.data.data?.session_id;
      const qrImageData = response.data.data?.qr_image;
      
      if (!sessionId || !qrImageData) {
        message.error(ThsMessages.QR_GENERATE_FAILED);
        setQrState({ type: 'error', message: ThsMessages.QR_GENERATE_FAILED });
        lastQrGenerateTimeRef.current = 0;
        return;
      }
      
      const newState: QrState = { type: 'polling', sessionId, image: qrImageData };
      setQrState(newState);
      startPollingQrStatus(sessionId);

    } catch (error: any) {
      console.error('生成二维码失败:', error);
      
      if (is429Error(error)) {
        const retryAfter = error.response?.headers?.['x-retry-after'];
        if (retryAfter) {
          const retryAfterSeconds = parseInt(retryAfter);
          lastQrGenerateTimeRef.current = Date.now() - (QR_SESSION_TIMEOUT_MS - retryAfterSeconds * 1000);
          const friendlyMessage = retryAfterSeconds < 60 
            ? ThsMessages.QR_SWITCH_RATE_LIMITED(retryAfterSeconds)
            : error.response?.data?.detail || ThsMessages.QR_RATE_LIMITED;
          message.warning(friendlyMessage);
          setQrState({ type: 'error', message: friendlyMessage });
        } else {
          message.warning(error.response?.data?.detail || ThsMessages.QR_RATE_LIMITED);
          setQrState({ type: 'error', message: error.response?.data?.detail });
        }
      } else {
        message.error(error.response?.data?.detail || error.response?.data?.message || error.message || ThsMessages.QR_GENERATE_FAILED);
        setQrState({ type: 'error', message: error.message });
        lastQrGenerateTimeRef.current = 0;
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, [qrStateHelpers, qrState.type, clearQrState, startPollingQrStatus]);

  // 清理短信状态
  const clearSmsState = useCallback((options: { resetDebounce?: boolean } = {}) => {
    // 1. 停止所有定时器
    if (smsCountdownIntervalRef.current) {
      clearInterval(smsCountdownIntervalRef.current);
      smsCountdownIntervalRef.current = null;
    }
    if (smsTimeoutRef.current) {
      clearTimeout(smsTimeoutRef.current);
      smsTimeoutRef.current = null;
    }
    
    // 2. 重置状态
    setSmsCodeSent(false);
    setSmsCountdown(0);
    setSmsCode('');
    
    // 3. 重置防抖计时器
    if (options.resetDebounce) {
      lastSmsGenerateTimeRef.current = 0;
    }
  }, []);

  // 发送短信验证码（带限流和超时机制）
  const handleSendSmsCode = useCallback(async () => {
    const now = Date.now();
    
    // 限流检查：60秒内只能发送一次（在设置loading之前检查，避免闪烁）
    if (smsCountdown > 0) {
      message.warning(ThsMessages.SMS_RATE_LIMITED(smsCountdown));
      return;
    }
    
    // 防抖：避免意外双击
    if (now - lastSmsGenerateTimeRef.current < SMS_RETRY_DEBOUNCE_MS) {
      return;
    }
    lastSmsGenerateTimeRef.current = now;

    const mobileError = validateMobile(mobile);
    if (mobileError) {
      message.warning(mobileError);
      return;
    }

    try {
      setSmsSendLoading(true);
      clearSmsState(); // 清理之前的状态
      
      const response = await axiosInstance.post('/api/ths/sms/send', {
        mobile: mobile.trim(),
      });
      
      if (response.data?.success) {
        const data = response.data.data;
        
        // 检查是否需要滑块验证
        if (data?.captcha_required === true && data?.captcha_images) {
          setCaptchaRequired(true);
          setCaptchaImages(data.captcha_images);
          
          // 弹出滑块验证码弹窗
          return;
        }
        
        message.success(ThsMessages.SMS_SENT);
        setCaptchaRequired(false);
        setCaptchaImages(null);
        setSmsCodeSent(true);
        setSmsCountdown(60);
        
        // 开始60秒倒计时
        smsCountdownIntervalRef.current = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              if (smsCountdownIntervalRef.current) {
                clearInterval(smsCountdownIntervalRef.current);
                smsCountdownIntervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        // 设置5分钟验证码过期超时
        smsTimeoutRef.current = setTimeout(() => {
          message.warning(ThsMessages.SMS_EXPIRED);
          clearSmsState();
        }, SMS_SESSION_TIMEOUT_MS);
        
      } else {
        message.error(response.data?.message || ThsMessages.SMS_SEND_FAILED);
      }
    } catch (error: any) {
      console.error('发送验证码失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.SMS_SEND_FAILED));
      }
    } finally {
      setSmsSendLoading(false);
    }
  }, [mobile, smsCountdown, clearSmsState]);

  // 会话过期时重新初始化验证码（不关闭窗口）
  const handleReInitCaptcha = useCallback(async () => {
    if (!mobile) return;
    
    try {
      setCaptchaLoading(true);
      message.loading({ content: ThsMessages.CAPTCHA_GETTING, key: 'reinit' });
      
      const response = await axiosInstance.post('/api/ths/sms/send', {
        mobile: mobile.trim(),
      });
      
      if (response.data?.success) {
        const data = response.data.data;
        if (data?.captcha_required && data?.captcha_images) {
          setCaptchaImages(data.captcha_images);
          message.success({ content: ThsMessages.CAPTCHA_REINIT, key: 'reinit' });
          
        }
      } else {
        message.error({ content: response.data?.message || ThsMessages.CAPTCHA_GET_FAILED, key: 'reinit' });
      }
    } catch (error: any) {
      console.error('重新获取验证码失败:', error);
      message.error({ content: ThsMessages.CAPTCHA_GET_FAILED, key: 'reinit' });
    } finally {
      setCaptchaLoading(false);
    }
  }, [mobile]);

  // 刷新滑块验证码（需要在handleSubmitCaptcha之前定义）
  const handleRefreshCaptcha = useCallback(async () => {
    if (!mobile) return;
    
    try {
      setCaptchaLoading(true);
      const response = await axiosInstance.post('/api/ths/sms/captcha/refresh', {
        mobile: mobile.trim(),
      });
      
      if (response.data?.success && response.data.data?.captcha_images) {
        setCaptchaImages(response.data.data.captcha_images);
      } else {
        message.error(response.data?.message || ThsMessages.CAPTCHA_REFRESH_FAILED);
      }
    } catch (error: any) {
      console.error('刷新验证码失败:', error);
      const errorDetail = error.response?.data?.detail || '';
      // 使用错误码检测会话过期
      if (errorDetail === 'SESSION_EXPIRED') {
        handleReInitCaptcha();
      } else {
        message.error(errorDetail || ThsMessages.CAPTCHA_REFRESH_FAILED);
      }
    } finally {
      setCaptchaLoading(false);
    }
  }, [mobile, handleReInitCaptcha]);

  // 提交滑块验证码（由SliderCaptchaModal调用）
  const handleSubmitCaptcha = useCallback(async (x: number, trackWidth: number) => {
    if (!mobile || !captchaRequired) return;
    
    try {
      setCaptchaLoading(true);
      const response = await axiosInstance.post('/api/ths/sms/captcha', {
        mobile: mobile.trim(),
        x: x,
        track_width: trackWidth,
      });
      
      if (response.data?.success) {
        message.success(ThsMessages.SMS_SENT);
        setCaptchaRequired(false);
        setCaptchaImages(null);
        setSmsCodeSent(true);
        setSmsCountdown(60);
        
        smsCountdownIntervalRef.current = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              if (smsCountdownIntervalRef.current) {
                clearInterval(smsCountdownIntervalRef.current);
                smsCountdownIntervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        message.error(response.data?.message || ThsMessages.CAPTCHA_VERIFY_FAILED);
      }
    } catch (error: any) {
      console.error('验证码验证失败:', error);
      const errorDetail = error.response?.data?.detail || '';
      // 使用错误码检测会话过期
      if (errorDetail === 'SESSION_EXPIRED') {
        handleReInitCaptcha();
      } else {
        message.error(errorDetail || ThsMessages.CAPTCHA_VERIFY_FAILED);
        // 验证失败时自动刷新验证码
        handleRefreshCaptcha();
      }
    } finally {
      setCaptchaLoading(false);
    }
  }, [mobile, captchaRequired, handleRefreshCaptcha, handleReInitCaptcha]);

  // 短信登录
  const handleSmsLogin = useCallback(async (codeOverride?: string) => {
    const code = codeOverride ?? smsCode;
    const mobileError = validateMobile(mobile);
    if (mobileError) {
      message.warning(mobileError);
      return;
    }
    const smsCodeError = validateSmsCode(code);
    if (smsCodeError) {
      message.warning(smsCodeError);
      return;
    }

    try {
      setSmsLoginLoading(true);
      const response = await axiosInstance.post('/api/ths/sms/login', {
        mobile: mobile.trim(),
        sms_code: code.trim()
      });
      
      const resData = response.data?.data;
      if (response.data?.success && (resData?.username || resData?.ths_account)) {
        message.success(ThsMessages.LOGIN_SUCCESS(resData.nickname || resData.ths_account || resData.username));
        await handleLoginSuccess(resData.ths_account || resData.username, mobile.trim(), resData.nickname, 'sms');
      } else {
        message.error(response.data?.message || ThsMessages.SMS_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('短信登录失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.SMS_LOGIN_FAILED));
      }
    } finally {
      setSmsLoginLoading(false);
    }
  }, [mobile, smsCode, handleLoginSuccess]);

  // 密码登录
  const handlePasswordLogin = useCallback(async () => {
    const usernameError = validateUsername(pwdUsername);
    if (usernameError) {
      message.warning(usernameError);
      return;
    }
    const passwordError = validatePassword(pwdPassword);
    if (passwordError) {
      message.warning(passwordError);
      return;
    }

    try {
      setPasswordLoading(true);
      const response = await axiosInstance.post('/api/ths/login/password', {
        username: pwdUsername.trim(),
        password: pwdPassword.trim()
      });
      
      const resData = response.data?.data;
      if (response.data?.success && (resData?.username || resData?.ths_account)) {
        message.success(ThsMessages.LOGIN_SUCCESS(resData.nickname || resData.ths_account || resData.username));
        await handleLoginSuccess(resData.ths_account || resData.username, pwdUsername.trim(), resData.nickname, 'password');
      } else {
        message.error(response.data?.message || ThsMessages.PASSWORD_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('密码登录失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.PASSWORD_LOGIN_FAILED));
      }
    } finally {
      setPasswordLoading(false);
    }
  }, [pwdUsername, pwdPassword, handleLoginSuccess]);

  // Cookie登录
  const handleCookieLogin = useCallback(async () => {
    const cookieError = validateCookieStr(cookieStr);
    if (cookieError) {
      message.warning(cookieError);
      return;
    }

    try {
      setCookieLoading(true);
      const response = await axiosInstance.post('/api/admin/ths/cookies/update', {
        cookie_str: cookieStr.trim()
      });
      
      const resData = response.data?.data;
      if (response.data?.success && (resData?.username || resData?.ths_account)) {
        message.success(ThsMessages.LOGIN_SUCCESS(resData.nickname || resData.ths_account || resData.username));
        await handleLoginSuccess(resData.ths_account || resData.username, undefined, resData.nickname, 'cookie');
      } else {
        message.error(response.data?.message || ThsMessages.COOKIE_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('Cookie登录失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.COOKIE_LOGIN_FAILED));
      }
    } finally {
      setCookieLoading(false);
    }
  }, [cookieStr, handleLoginSuccess]);

  // 重置状态
  const resetState = useCallback(() => {
    // 延迟重置状态，避免在Drawer关闭动画期间的视觉跳跃
    setCurrentStep('select');
    setSelectedMethod('sms');
    setMobile('');
    setSmsCode('');
    setSmsCodeSent(false);
    setSmsCountdown(0);
    setPwdUsername('');
    setPwdPassword('');
    setCookieStr('');
    clearQrState({ resetDebounce: true });
    clearSmsState({ resetDebounce: true });
  }, [clearQrState, clearSmsState]);

  useEffect(() => {
    if (!open) {
      // 🚀 延迟重置状态，等待Drawer关闭动画完成（约300ms），避免闪烁
      const timer = setTimeout(() => {
        resetState();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [open, resetState]);

  // 当进入QR登录页面时自动生成二维码
  useEffect(() => {
    if (open && currentStep === 'login' && selectedMethod === 'qr' && qrState.type === 'idle') {
      handleQrLogin();
    }
  }, [open, currentStep, selectedMethod, qrState.type, handleQrLogin]);

  // 当离开QR登录页面时停止轮询
  useEffect(() => {
    if (currentStep === 'select' || selectedMethod !== 'qr') {
      // 停止二维码轮询但保留会话（用于3分钟内复用）
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [currentStep, selectedMethod]);

  // 🚀 移动端Loading动画样式 - 覆盖 mobile-simple.css 的全局 animation: none
  const mobileLoadingStyles = useMemo(() => (
    <style>{`
      @keyframes mobile-spin { to { transform: rotate(360deg); } }
      .mobile-spinner {
        width: 48px; height: 48px;
        border: 3px solid ${currentTheme.border};
        border-top-color: ${currentTheme.positive};
        border-radius: 50%;
        animation: mobile-spin 1s linear infinite !important;
      }
      /* 修复Ant Design Button loading图标动画 */
      .ant-btn-loading-icon .anticon {
        animation: mobile-spin 1s linear infinite !important;
      }
    `}</style>
  ), [currentTheme]);

  // 二维码加载动画
  const LoadingSpinner = useMemo(() => (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      {mobileLoadingStyles}
      <div className="mobile-spinner" style={{ display: 'inline-block' }} />
      <div style={{ marginTop: 20, color: currentTheme.text, fontSize: '16px', fontWeight: 500 }}>
        正在生成二维码...
      </div>
    </div>
  ), [currentTheme, mobileLoadingStyles]);

  // 渲染登录方式选择
  const renderMethodSelection = () => (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loginMethods.filter(method => method.available).map((method) => (
          <div
            key={method.key}
            onClick={() => {
              setSelectedMethod(method.key);
              setCurrentStep('login');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px',
              background: currentTheme.card,
              borderRadius: '12px',
              border: `1px solid ${currentTheme.border}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            <div style={{ marginRight: '16px' }}>
              {method.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: currentTheme.text,
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {method.title}
                {method.recommended && (
                  <span style={{
                    background: currentTheme.positive,
                    color: theme === 'dark' ? '#000000' : '#ffffff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600
                  }}>
                    推荐
                  </span>
                )}
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: currentTheme.textSecondary,
                opacity: 0.8
              }}>
                {method.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染具体登录页面
  const renderLoginPage = () => {
    return (
      <div style={{ padding: '10px 0' }}>

        {selectedMethod === 'sms' && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ 
                color: currentTheme.text, 
                fontWeight: 500, 
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                手机号
              </div>
              <Input
                size="large"
                placeholder="请输入手机号"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                style={{
                  borderRadius: '8px',
                  height: '48px',
                  backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#ffffff',
                  borderColor: currentTheme.border,
                  color: currentTheme.text
                }}
              />
            </div>
            
            <div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                marginBottom: '8px' 
              }}>
                <div style={{ 
                  color: currentTheme.text, 
                  fontWeight: 500,
                  fontSize: '14px'
                }}>
                  验证码
                </div>
                <Button
                  size="small"
                  loading={smsSendLoading}
                  disabled={smsCountdown > 0}
                  onClick={handleSendSmsCode}
                  style={{
                    height: '32px',
                    fontSize: '12px',
                    background: smsCountdown > 0 
                      ? currentTheme.textSecondary 
                      : currentTheme.positive,
                    borderColor: smsCountdown > 0 
                      ? currentTheme.textSecondary 
                      : currentTheme.positive,
                    borderRadius: '6px',
                    color: theme === 'dark' ? '#000000' : '#ffffff',
                    boxShadow: 'none'
                  }}
                >
                  {smsCountdown > 0 ? `${smsCountdown}s后重发` : '发送验证码'}
                </Button>
              </div>
              <Input
                size="large"
                placeholder="请输入6位验证码"
                value={smsCode}
                onChange={(e) => {
                  const value = e.target.value;
                  setSmsCode(value);
                  // 输入6位后自动提交（传递当前值避免状态延迟）
                  if (value.length === 6 && smsCodeSent && !smsLoginLoading) {
                    setTimeout(() => handleSmsLogin(value), 100);
                  }
                }}
                maxLength={6}
                disabled={!smsCodeSent}
                style={{
                  borderRadius: '8px',
                  height: '48px',
                  backgroundColor: !smsCodeSent 
                    ? (theme === 'dark' ? 'rgba(255,255,255,0.02)' : '#f5f5f5')
                    : (theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#ffffff'),
                  borderColor: !smsCodeSent ? currentTheme.border : currentTheme.positive,
                  color: currentTheme.text,
                  opacity: !smsCodeSent ? 0.6 : 1
                }}
              />
            </div>
            
            <Button
              size="large"
              block
              loading={smsLoginLoading}
              disabled={!smsCodeSent || !smsCode.trim()}
              onClick={() => handleSmsLogin()}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                marginTop: '8px',
                background: (!smsCodeSent || !smsCode.trim()) 
                  ? currentTheme.textSecondary 
                  : currentTheme.positive,
                borderColor: (!smsCodeSent || !smsCode.trim()) 
                  ? currentTheme.textSecondary 
                  : currentTheme.positive,
                color: theme === 'dark' ? '#000000' : '#ffffff',
                opacity: (!smsCodeSent || !smsCode.trim()) ? 0.6 : 1,
                boxShadow: 'none'
              }}
            >
              登录
            </Button>
          </Space>
        )}

        {selectedMethod === 'qr' && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {qrStateHelpers.isLoading && LoadingSpinner}
            
            {qrStateHelpers.isExpired && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '16px', color: currentTheme.textSecondary, marginBottom: '20px' }}>
                  二维码已过期
                </div>
                <Button
                  size="large"
                  onClick={handleQrLogin}
                  style={{
                    background: currentTheme.positive,
                    borderColor: currentTheme.positive,
                    boxShadow: 'none'
                  }}
                >
                  刷新二维码
                </Button>
              </div>
            )}
            
            {qrStateHelpers.isError && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '16px', color: currentTheme.positive, marginBottom: '20px' }}>
                  生成二维码失败
                </div>
                <Button
                  size="large"
                  onClick={handleQrLogin}
                  style={{
                    background: currentTheme.positive,
                    borderColor: currentTheme.positive
                  }}
                >
                  重试
                </Button>
              </div>
            )}
            
            
            {qrStateHelpers.hasImage && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <img 
                  src={qrStateHelpers.getImage()!} 
                  alt="登录二维码" 
                  style={{ 
                    width: '200px', 
                    height: '200px',
                    border: `1px solid ${currentTheme.border}`,
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    padding: '8px'
                  }} 
                />
                <div style={{ 
                  marginTop: 12, 
                  color: currentTheme.textSecondary,
                  fontSize: '14px'
                }}>
                  请使用微信扫描二维码
                </div>
              </div>
            )}
          </Space>
        )}

        {selectedMethod === 'password' && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ color: currentTheme.text, fontWeight: 500 }}>手机号/用户名</Text>
              <Input
                size="large"
                placeholder="请输入手机号或用户名"
                value={pwdUsername}
                onChange={(e) => setPwdUsername(e.target.value)}
                prefix={<UserOutlined />}
                style={{
                  marginTop: '8px',
                  borderRadius: '8px',
                  height: '48px'
                }}
              />
            </div>
            <div>
              <Text style={{ color: currentTheme.text, fontWeight: 500 }}>密码</Text>
              <Input.Password
                size="large"
                placeholder="请输入密码"
                value={pwdPassword}
                onChange={(e) => setPwdPassword(e.target.value)}
                style={{
                  marginTop: '8px',
                  borderRadius: '8px',
                  height: '48px'
                }}
              />
            </div>
            <Button
              size="large"
              block
              loading={passwordLoading}
              onClick={handlePasswordLogin}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                marginTop: '16px',
                background: currentTheme.positive,
                borderColor: currentTheme.positive,
                boxShadow: 'none'
              }}
            >
              登录
            </Button>
          </Space>
        )}

        {selectedMethod === 'cookie' && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ color: currentTheme.text, fontWeight: 500 }}>Cookie字符串</Text>
              <Input.TextArea
                placeholder="请粘贴完整的Cookie字符串"
                value={cookieStr}
                onChange={(e) => setCookieStr(e.target.value)}
                rows={4}
                style={{
                  marginTop: '8px',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
            <Button
              size="large"
              block
              loading={cookieLoading}
              onClick={handleCookieLogin}
              style={{
                height: '48px',
                borderRadius: '12px',
                fontWeight: 500,
                marginTop: '16px',
                background: currentTheme.positive,
                borderColor: currentTheme.positive,
                boxShadow: 'none'
              }}
            >
              登录
            </Button>
          </Space>
        )}
      </div>
    );
  };


  // 获取当前步骤的标题
  const getCurrentTitle = () => {
    if (currentStep === 'select') {
      return '选择登录方式';
    } else {
      const method = loginMethods.find(m => m.key === selectedMethod);
      return method?.title || '登录';
    }
  };

  return (
    <BottomDrawer
      theme={theme}
      title={getCurrentTitle()}
      onBack={currentStep === 'login' ? () => setCurrentStep('select') : undefined}
      onClose={onClose}
      open={open}
      height={drawerHeight}
      maskClosable={true}
      zIndex={1002}
    >
      {/* 移动端Loading动画样式 */}
      {mobileLoadingStyles}
      
      <div style={{ minHeight: '20px' }}>
        {currentStep === 'select' && renderMethodSelection()}
        {currentStep === 'login' && renderLoginPage()}
      </div>
      
      {/* 移动端专用Toast */}
      <MobileToastHost />
      
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
        primaryColor={currentTheme.positive}
      />
    </BottomDrawer>
  );
}, (prevProps, nextProps) => {
  // 只在关键props变化时才重渲染，忽略函数引用变化
  return prevProps.theme === nextProps.theme && 
         prevProps.open === nextProps.open;
});

export default MobileThsLoginDrawer;
