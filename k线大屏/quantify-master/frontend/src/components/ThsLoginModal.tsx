/**
 * 同花顺登录弹窗
 * 支持二维码和短信验证码两种登录方式
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Modal, Tabs, Button, Input, message, Space, Typography } from 'antd';
import { QrcodeOutlined, MobileOutlined, LoadingOutlined, SettingOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore.ts';
import axiosInstance from '../utils/axios.ts';  // THS登录需要先系统登录（JWT认证）
import { setThsUsername } from '../utils/userKey.ts';
import ThsAccountTags from './ThsAccountTags.tsx';
import SliderCaptchaModal from './SliderCaptchaModal.tsx';
import { validateMobile, validateUsername, validatePassword, validateCookieStr, validateSmsCode } from '../utils/thsValidation.ts';
import { ThsMessages, ThsTimeouts, handle429Error, is429Error } from '../utils/thsMessages.ts';
import type { LoginMethod, QrState } from '../types/thsLogin.ts';

const { Text } = Typography;
const { QR_SESSION_TIMEOUT_MS, SMS_SESSION_TIMEOUT_MS, SMS_RETRY_DEBOUNCE_MS } = ThsTimeouts;

interface ThsLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (username: string) => void;
}

const ThsLoginModal: React.FC<ThsLoginModalProps> = ({ open, onClose, onSuccess }) => {
  // 从全局store获取登录方式配置
  const thsLoginMethods = useAppStore(state => state.thsLoginMethods);
  const availableMethods = thsLoginMethods as LoginMethod[];
  
  // 默认登录方式，将由useEffect根据可用方式和UI顺序动态设置
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('sms');
  const [smsLoading, setSmsLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [cookieLoading, setCookieLoading] = useState(false);
  
  // 短信登录状态
  const [mobile, setMobile] = useState('');
  
  // 滑块验证码状态
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaImages, setCaptchaImages] = useState<{ background: string; slider: string; init_y?: number } | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  
  // 账号密码登录状态
  const [pwdUsername, setPwdUsername] = useState('');
  const [pwdPassword, setPwdPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);
  const smsCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastSmsGenerateTimeRef = useRef<number>(0);
  const smsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 二维码状态机
  const [qrState, setQrState] = useState<QrState>({ type: 'idle' });
  
  // 必需的Ref变量
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollingRef = useRef<boolean>(false);
  const prevLoginMethodRef = useRef<LoginMethod | null>(null);
  const lastQrGenerateTimeRef = useRef<number>(0);
  const isGeneratingRef = useRef<boolean>(false);
  const handleQrLoginRef = useRef<(() => void) | null>(null);
  const openRef = useRef<boolean>(open);
  const loginMethodRef = useRef<LoginMethod>(loginMethod);
  
  // Cookie配置状态
  const [cookieStr, setCookieStr] = useState('');
  
  // 从全局store获取状态更新方法和账号数据
  const loadThsAccounts = useAppStore(state => state.loadThsAccounts);
  const thsAccounts = useAppStore(state => state.thsAccounts);
  
  // 历史账号刷新触发器
  const [accountsRefreshTrigger, setAccountsRefreshTrigger] = useState(0);

  // 每次打开窗口时重置到第一个可用的tab
  useEffect(() => {
    if (open && availableMethods.length > 0) {
      setLoginMethod(availableMethods[0]);
    }
  }, [open, availableMethods]);

  const handleLoginSuccess = useCallback(async (username: string, mobile?: string, nickname?: string, loginMethod?: string) => {
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
        mobile: mobile || null,
        nickname: nickname,
        login_method: loginMethod,
      });
      
      if (response.data?.success) {
        // 成功消息已在具体登录方式中显示，这里不再重复显示
      } else if (response.data?.message?.includes('已存在')) {
        if (isSameAccount) {
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
          message.success(ThsMessages.LOGIN_SESSION_REFRESHED(nickname || usernameStr));
        } else {
          message.info(ThsMessages.LOGIN_ACCOUNT_EXISTS);
        }
      } else {
        message.error(ThsMessages.LOGIN_FAILED + ': ' + (error.response?.data?.message || error.message));
      }
    }
    
    // 关键修复：登录成功后立即刷新全局账号状态，并切换到新账号
    try {
      await loadThsAccounts(usernameStr);  // 传入新账号ID，确保在触发事件前切换
      // 🚀 触发ThsAccountTags组件刷新，确保UI立即更新
      setAccountsRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('刷新账号状态失败:', error);
    }
    
    if (onSuccess) onSuccess(username);
  }, [onSuccess, loadThsAccounts, thsAccounts]);


  // 基于状态机的派生状态（用于UI渲染）
  const qrStateHelpers = useMemo(() => ({
    isLoading: qrState.type === 'loading',
    isPolling: qrState.type === 'polling',
    isExpired: qrState.type === 'expired',
    isError: qrState.type === 'error',
    hasImage: qrState.type === 'polling' || qrState.type === 'ready',
    getImage: () => (qrState.type === 'polling' || qrState.type === 'ready') ? qrState.image : null,
    getSessionId: () => (qrState.type === 'polling' || qrState.type === 'ready') ? qrState.sessionId : null,
  }), [qrState]);

  // 统一的二维码状态清理函数（使用状态机）
  const clearQrState = useCallback((options: { resetDebounce?: boolean; setExpired?: boolean } = {}) => {
    // 1. 停止所有定时器
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    
    // 2. 更新状态机
    if (options.setExpired) {
      setQrState({ type: 'expired' });
    } else {
      setQrState({ type: 'idle' });
    }
    
    // 4. 可选：重置防抖时间（允许立即重新生成）
    if (options.resetDebounce) {
      lastQrGenerateTimeRef.current = 0;
    }
  }, []);


  const handleQrLogin = useCallback(async () => {
    // 检查现存会话：如果有有效会话，先验证后端状态再复用
    const existingSessionId = qrStateHelpers.getSessionId();
    if (existingSessionId && qrState.type === 'ready') {
      try {
        // 验证后端会话是否还存在
        const checkResponse = await axiosInstance.get(`/api/ths/qr/status/${existingSessionId}`);
        if (checkResponse.data?.success && 
            checkResponse.data.data?.status !== 'failed' && 
            checkResponse.data.data?.status !== 'timeout') {
          // 会话有效，复用，更新为轮询状态
          const image = qrStateHelpers.getImage()!;
          setQrState({ type: 'polling', sessionId: existingSessionId, image });
          startPollingQrStatus(existingSessionId);
          return;
        }
      } catch (error: any) {
        // 会话已失效（404或其他错误），清理并继续生成新二维码
        clearQrState({ resetDebounce: true });
      }
    }
    
    // 检查是否正在生成中（防止React严格模式或快速重复调用）
    if (isGeneratingRef.current) {
      return;
    }
    
    // 防抖：3分钟内不重复生成（在设置loading之前检查，避免闪烁）
    const now = Date.now();
    if (now - lastQrGenerateTimeRef.current < QR_SESSION_TIMEOUT_MS) {
      const remainingSeconds = Math.ceil((QR_SESSION_TIMEOUT_MS - (now - lastQrGenerateTimeRef.current)) / 1000);
      message.warning(ThsMessages.QR_RATE_LIMITED_SECONDS(remainingSeconds));
      return;  // 直接返回，不设置loading状态
    }
    
    // 通过防抖检查后，才设置loading状态
    isGeneratingRef.current = true;
    lastQrGenerateTimeRef.current = now;
    setQrState({ type: 'loading' });
    
    // 第1步：生成二维码
    try {
      const response = await axiosInstance.post('/api/ths/qr/generate', {
        headless: true
      }, {
        timeout: 30000 // 30秒超时，比后端25秒稍长
      });
      
      if (!response.data?.success) {
        message.error(response.data?.message || ThsMessages.QR_GENERATE_FAILED);
        // 更新状态机：错误
        setQrState({ type: 'error', message: response.data?.message });
        lastQrGenerateTimeRef.current = 0;
        return;
      }
      
      const sessionId = response.data.data?.session_id;
      const qrImageData = response.data.data?.qr_image;
      
      if (!sessionId || !qrImageData) {
        message.error(ThsMessages.QR_GENERATE_FAILED);
        // 更新状态机：错误
        setQrState({ type: 'error', message: '生成二维码失败' });
        lastQrGenerateTimeRef.current = 0;
        return;
      }
      
      // 更新状态机：轮询中
      const newState: QrState = { type: 'polling', sessionId, image: qrImageData };
      setQrState(newState);
      
      // 第2步：开始轮询登录状态
      startPollingQrStatus(sessionId);
    } catch (error: any) {
      console.error('二维码登录失败:', error);
      
      // 如果是429限流错误，提供更友好的提示
      if (error.response?.status === 429) {
        // 从响应头中读取剩余等待时间
        const retryAfter = error.response?.headers?.['x-retry-after'];
        if (retryAfter) {
          // 同步后端的防抖时间戳，避免用户重复点击触发429
          const retryAfterSeconds = parseInt(retryAfter);
          lastQrGenerateTimeRef.current = Date.now() - (QR_SESSION_TIMEOUT_MS - retryAfterSeconds * 1000);
          
          // 针对切换账号场景的友好提示
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
      isGeneratingRef.current = false;  // 清除生成中标志
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrStateHelpers, qrState.type, clearQrState]);

  // 更新handleQrLoginRef引用
  useEffect(() => {
    handleQrLoginRef.current = handleQrLogin;
  }, [handleQrLogin]);

  useEffect(() => {
    qrPollingRef.current = qrState.type === 'polling';
  }, [qrState]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    loginMethodRef.current = loginMethod;
  }, [loginMethod]);

  // 清理所有表单状态（登录成功后调用）- 定义在startPollingQrStatus之前避免循环依赖
  const clearAllFormState = useCallback(() => {
    setMobile('');
    setSmsCode('');
    setPwdUsername('');
    setPwdPassword('');
    setCookieStr('');
  }, []);

  // 清理短信状态 - 定义在startPollingQrStatus之前避免循环依赖
  const clearSmsState = useCallback((options: { resetDebounce?: boolean } = {}) => {
    if (smsCountdownRef.current) {
      clearInterval(smsCountdownRef.current);
      smsCountdownRef.current = null;
    }
    if (smsTimeoutRef.current) {
      clearTimeout(smsTimeoutRef.current);
      smsTimeoutRef.current = null;
    }
    setSmsCountdown(0);
    setSmsCode('');
    if (options.resetDebounce) {
      lastSmsGenerateTimeRef.current = 0;
    }
  }, []);

  const startPollingQrStatus = useCallback((sessionId: string) => {
    // 清除之前的定时器（如果有）
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

        if (!qrPollingRef.current) {
          return;
        }
        
        if (response.data?.success && response.data.data?.status === 'success') {
          // 登录成功 - 立即停止轮询并清理
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          qrPollingRef.current = false; // 停止轮询标志
          
          const thsAccount = response.data.data?.ths_account;
          const nickname = response.data.data?.nickname;
          
          if (!thsAccount || !nickname) {
            message.error(ThsMessages.LOGIN_NO_ACCOUNT_INFO);
            setQrState({ type: 'error', message: '登录成功但未获取到账号信息' });
            return;
          }
          
          // 智能提示：相同账号显示会话刷新，不同账号显示登录成功
          const currentAccount = thsAccounts.find(acc => acc.is_online);
          const isSameAccount = currentAccount?.ths_account === thsAccount;
          
          message.success(isSameAccount 
            ? ThsMessages.LOGIN_SESSION_REFRESHED(nickname) 
            : ThsMessages.LOGIN_SUCCESS(nickname)
          );
          
          // 传递ths_account和nickname
          await handleLoginSuccess(thsAccount, undefined, nickname, 'qr');
          
          // 清理状态后关闭
          clearQrState({ resetDebounce: true });
          clearSmsState({ resetDebounce: true });
          clearAllFormState();
          if (availableMethods.length > 0) setLoginMethod(availableMethods[0]);
          onClose();
        } else if (!response.data?.success || response.data.data?.status === 'failed') {
          // 登录失败 - 停止轮询
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
        // 其他状态（pending, qr_ready）继续轮询
      } catch (error: any) {
        console.error('轮询登录状态失败:', error);

        if (!qrPollingRef.current) {
          return;
        }

        // 404错误表示会话已过期，立即停止轮询并设置过期状态
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
    }, 2000); // 每2秒轮询一次
    
    // 超时停止轮询
    pollTimeoutRef.current = setTimeout(() => {
      if (!qrPollingRef.current) {
        return;
      }

      qrPollingRef.current = false;
      
      if (openRef.current && loginMethodRef.current === 'qr') {
        message.warning(ThsMessages.QR_EXPIRED);
        // 使用统一清理函数：超时后重置防抖，设置过期状态
        clearQrState({ resetDebounce: true, setExpired: true });
        // 异步取消后端会话
        axiosInstance.delete(`/api/ths/qr/cancel/${sessionId}`).catch(() => {});
      }
    }, QR_SESSION_TIMEOUT_MS);
  }, [clearQrState, clearSmsState, clearAllFormState, onClose, handleLoginSuccess, thsAccounts, availableMethods]);


  const handleSendSmsCode = async () => {
    // 1. 倒计时检查（优先级最高，避免用户误操作）
    if (smsCountdown > 0) {
      message.warning(ThsMessages.SMS_RATE_LIMITED(smsCountdown));
      return;
    }
    
    // 2. 防抖：避免意外双击
    const now = Date.now();
    if (now - lastSmsGenerateTimeRef.current < SMS_RETRY_DEBOUNCE_MS) {
      return;
    }
    lastSmsGenerateTimeRef.current = now;

    // 3. 手机号验证
    const mobileError = validateMobile(mobile);
    if (mobileError) {
      message.warning(mobileError);
      return;
    }
    
    try {
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
          
          // 弹出滑块验证码弹窗，不显示其他提示
          return;
        }
        
        message.success(response.data.message || ThsMessages.SMS_SENT);
        setCaptchaRequired(false);
        setCaptchaImages(null);
        
        // 开始60秒倒计时
        setSmsCountdown(60);
        smsCountdownRef.current = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              if (smsCountdownRef.current) {
                clearInterval(smsCountdownRef.current);
                smsCountdownRef.current = null;
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
        message.warning(handle429Error(error, ThsMessages.SMS_SEND_FAILED));
      } else {
        message.error(handle429Error(error, ThsMessages.SMS_SEND_FAILED));
      }
    }
  };

  // 提交滑块验证码（由SliderCaptchaModal调用）
  const handleSubmitCaptcha = async (x: number, trackWidth: number) => {
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
        
        // 开始60秒倒计时
        setSmsCountdown(60);
        smsCountdownRef.current = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              if (smsCountdownRef.current) {
                clearInterval(smsCountdownRef.current);
                smsCountdownRef.current = null;
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
  };

  // 会话过期时重新初始化验证码（不关闭窗口）
  const handleReInitCaptcha = async () => {
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
  };

  // 刷新滑块验证码（使用独立接口，不受60秒限流限制）
  const handleRefreshCaptcha = async () => {
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
  };

  const handleSmsLogin = async (codeOverride?: string) => {
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
      setSmsLoading(true);
      
      const response = await axiosInstance.post('/api/ths/sms/login', {
        mobile: mobile.trim(),
        sms_code: code.trim(),
      });
      
      if (response.data?.success) {
        const thsAccount = response.data.data?.ths_account;
        const nickname = response.data.data?.nickname;
        
        if (!thsAccount || !nickname) {
          message.error(ThsMessages.LOGIN_NO_ACCOUNT_INFO);
          return;
        }
        
        message.success(ThsMessages.LOGIN_SUCCESS(nickname));
        
        // 传递ths_account和nickname
        await handleLoginSuccess(thsAccount, mobile.trim(), nickname, 'sms');
        
        // 清理状态后关闭
        clearSmsState({ resetDebounce: true });
        clearAllFormState();
        if (availableMethods.length > 0) setLoginMethod(availableMethods[0]);
        onClose();
      } else {
        message.error(response.data?.message || ThsMessages.SMS_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('短信验证码登录失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.SMS_LOGIN_FAILED));
      }
    } finally {
      setSmsLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
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
        password: pwdPassword.trim(),
      });
      
      if (response.data?.success) {
        const thsAccount = response.data.data?.ths_account;
        const nickname = response.data.data?.nickname;
        
        if (!thsAccount || !nickname) {
          message.error(ThsMessages.LOGIN_NO_ACCOUNT_INFO);
          return;
        }
        
        message.success(ThsMessages.LOGIN_SUCCESS(nickname));
        
        // 传递ths_account和nickname
        await handleLoginSuccess(thsAccount, pwdUsername.trim(), nickname, 'password');
        
        // 清理状态后关闭
        clearAllFormState();
        if (availableMethods.length > 0) setLoginMethod(availableMethods[0]);
        onClose();
      } else {
        message.error(response.data?.message || ThsMessages.PASSWORD_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('账号密码登录失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.PASSWORD_LOGIN_FAILED));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // 登录方式配置现在从全局store获取，无需本地加载

  const handleCookieConfig = async () => {
    const cookieError = validateCookieStr(cookieStr);
    if (cookieError) {
      message.warning(cookieError);
      return;
    }
    
    try {
      setCookieLoading(true);
      
      const response = await axiosInstance.post('/api/admin/ths/cookies/update', {
        cookie_str: cookieStr.trim(),
      });
      
      if (response.data?.success) {
        setCookieStr('');
        
        // Cookie配置成功后，使用后端返回的真实用户信息
        const result = response.data?.data;
        const ths_account = result?.ths_account;
        const user_info = result?.user_info;
        const nickname = user_info?.nickname || ths_account;
        
        if (ths_account) {
          // 显示与其他登录方式一致的成功消息
          message.success(ThsMessages.LOGIN_SUCCESS(nickname));
          await handleLoginSuccess(ths_account, undefined, nickname, 'cookie');
        } else {
          // 后端返回格式异常时的降级处理
          message.success(ThsMessages.LOGIN_SUCCESS(''));
          await handleLoginSuccess('unknown_cookie_user');
        }
        
        // 清理状态后关闭
        clearAllFormState();
        if (availableMethods.length > 0) setLoginMethod(availableMethods[0]);
        onClose();
        // 登录成功后触发账号列表刷新
        setAccountsRefreshTrigger(prev => prev + 1);
      } else {
        message.error(response.data?.message || ThsMessages.COOKIE_LOGIN_FAILED);
      }
    } catch (error: any) {
      console.error('Cookie 配置失败:', error);
      if (is429Error(error)) {
        message.warning(handle429Error(error));
      } else {
        message.error(handle429Error(error, ThsMessages.COOKIE_LOGIN_FAILED));
      }
    } finally {
      setCookieLoading(false);
    }
  };

  // 停止二维码轮询（保留会话，只停止轮询）
  const stopQrPolling = useCallback(() => {
    qrPollingRef.current = false;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    // 如果当前是轮询状态，更新为就绪状态（保留会话）
    if (qrState.type === 'polling') {
      const newState: QrState = { type: 'ready', sessionId: qrState.sessionId, image: qrState.image };
      setQrState(newState);
    }
  }, [qrState]);

  // 监听弹窗打开/关闭和二维码tab切换
  useEffect(() => {
    if (!open) {
      // 关闭弹窗时停止轮询（保留状态，不重置为idle）
      stopQrPolling();
    } else if (open && loginMethod === 'qr') {
      // 弹窗打开且是二维码tab
      if (qrState.type === 'idle') {
        // 空闲状态：生成新二维码
        lastQrGenerateTimeRef.current = 0;
        handleQrLogin();
      } else if (qrState.type === 'ready') {
        // 就绪状态：有缓存的二维码，自动开始轮询
        const sessionId = qrStateHelpers.getSessionId()!;
        const image = qrStateHelpers.getImage()!;
        setQrState({ type: 'polling', sessionId, image });
        startPollingQrStatus(sessionId);
      }
      // expired、error、loading、polling状态保持不变
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loginMethod]); // 只依赖open和loginMethod，避免重复触发

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      if (smsCountdownRef.current) {
        clearInterval(smsCountdownRef.current);
      }
    };
  }, []);

  // 从二维码切换到其他登录方式时，停止轮询（保留会话）
  useEffect(() => {
    if (prevLoginMethodRef.current === 'qr' && loginMethod !== 'qr' && qrState.type === 'polling') {
      stopQrPolling();
    }
    
    // 从其他方式切回二维码，如果有就绪的会话则恢复轮询
    if (prevLoginMethodRef.current !== 'qr' && loginMethod === 'qr' && qrState.type === 'ready') {
      const sessionId = qrStateHelpers.getSessionId()!;
      const image = qrStateHelpers.getImage()!;
      setQrState({ type: 'polling', sessionId, image });
      startPollingQrStatus(sessionId);
    }
    
    // 更新上一次的登录方式
    prevLoginMethodRef.current = loginMethod;
  }, [loginMethod, qrState, qrStateHelpers, stopQrPolling, startPollingQrStatus]);

  const handleRefreshQr = () => {
    // 不重置防抖时间戳，让handleQrLogin的防抖检查生效
    // 如果后端返回429，会同步时间戳，下次点击就不会触发429了
    handleQrLogin();
  };

  const handleCancel = () => {
    // 关闭弹窗：只停止轮询，保留二维码会话（用于复用）
    stopQrPolling();
    
    // 清理短信状态
    clearSmsState({ resetDebounce: true });
    
    // 清空表单
    clearAllFormState();
    
    // 重置loginMethod为默认值，避免下次打开时触发错误的useEffect
    if (availableMethods.length > 0) {
      setLoginMethod(availableMethods[0]);
    }
    
    onClose();
  };

  const tabItems = [
    {
      key: 'sms',
      label: (
        <span>
          <MobileOutlined /> 短信验证码
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>手机号</Text>
            <Input
              size="large"
              placeholder="请输入手机号"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              maxLength={11}
            />
          </div>
          
          <div>
            <Text>短信验证码</Text>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                size="large"
                placeholder="请输入验证码"
                value={smsCode}
                onChange={(e) => {
                  const value = e.target.value;
                  setSmsCode(value);
                  // 输入6位后自动提交（仅在验证码已发送后触发）
                  if (value.length === 6 && smsCountdown > 0 && !smsLoading) {
                    setTimeout(() => handleSmsLogin(value), 100);
                  }
                }}
                maxLength={6}
                style={{ flex: 1 }}
              />
              <Button
                size="large"
                onClick={handleSendSmsCode}
                disabled={smsCountdown > 0}
                style={{ minWidth: '120px',boxShadow: 'none' }}
              >
                {smsCountdown > 0 ? `${smsCountdown}秒后重试` : '获取验证码'}
              </Button>
            </div>
          </div>
          
          <Button
            type="primary"
            size="large"
            block
            loading={smsLoading}
            onClick={() => handleSmsLogin()}
            icon={<MobileOutlined />}
            style={{ boxShadow: 'none' }}
          >
            登录
          </Button>
          
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：点击“获取验证码”发送短信，输入验证码后点击登录
          </Text>
        </Space>
      ),
    },
    {
      key: 'qr',
      label: (
        <span>
          <QrcodeOutlined /> 微信扫码
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {qrStateHelpers.isLoading && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <LoadingOutlined style={{ fontSize: 48, color: '#1890ff' }} />
              <div style={{ marginTop: 16 }}>
                <Text>正在生成二维码...</Text>
              </div>
            </div>
          )}
          
          {qrStateHelpers.isExpired && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '16px', color: '#faad14', marginBottom: '20px' }}>
                二维码已过期
              </div>
              <Button
                type="primary"
                size="large"
                onClick={handleRefreshQr}
              >
                刷新二维码
              </Button>
            </div>
          )}
          
          {qrStateHelpers.isError && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '16px', color: '#ff4d4f', marginBottom: '20px' }}>
                生成二维码失败
              </div>
              <Button
                type="primary"
                size="large"
                onClick={handleRefreshQr}
              >
                重试
              </Button>
            </div>
          )}
          
          {qrState.type === 'idle' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Button
                type="primary"
                size="large"
                onClick={handleQrLogin}
                loading={false}
              >
                生成二维码
              </Button>
            </div>
          )}
          
          {qrStateHelpers.hasImage && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <img 
                src={qrStateHelpers.getImage()!} 
                alt="登录二维码" 
                style={{ 
                  width: '240px', 
                  height: '240px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '8px',
                }} 
              />
              <div style={{ marginTop: 16 }}>
                <Text style={{ fontSize: '14px', color: '#666' }}>请使用微信扫码登录</Text>
              </div>
            </div>
          )}
        </Space>
      ),
    },
    {
      key: 'password',
      label: (
        <span>
          <LockOutlined /> 账号密码
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>手机号/用户名</Text>
            <Input
              size="large"
              placeholder="请输入手机号或用户名"
              value={pwdUsername}
              onChange={(e) => setPwdUsername(e.target.value)}
              prefix={<UserOutlined />}
            />
          </div>
          
          <div>
            <Text>密码</Text>
            <Input.Password
              size="large"
              placeholder="请输入密码"
              value={pwdPassword}
              onChange={(e) => setPwdPassword(e.target.value)}
              prefix={<LockOutlined />}
            />
          </div>
          
          <Button
            type="primary"
            size="large"
            block
            loading={passwordLoading}
            onClick={handlePasswordLogin}
            icon={<LockOutlined />}
            style={{ boxShadow: 'none' }}
          >
            登录
          </Button>
          
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：使用同花顺账号密码登录
          </Text>
        </Space>
      ),
    },
    {
      key: 'cookie',
      label: (
        <span>
          <SettingOutlined /> Cookie配置
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>Cookie 字符串</Text>
            <Input.TextArea
              rows={4}
              placeholder="v=你的v值; sid=你的sid值; ..."
              value={cookieStr}
              onChange={(e) => setCookieStr(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          
          <Button
            type="primary"
            size="large"
            block
            loading={cookieLoading}
            onClick={handleCookieConfig}
            icon={<SettingOutlined />}
            style={{ boxShadow: 'none' }}
          >
            配置 Cookie
          </Button>
          
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：打开浏览器开发者工具(F12)，登录 10jqka.com.cn 后复制 Cookie 值
          </Text>
        </Space>
      ),
    },
  ];

  // 选择历史账号进行登录
  const handleHistoricalAccountSelect = useCallback((account: any) => {
    // 设置账号信息到对应的登录方式
    if (account.ths_account) {
      setPwdUsername(account.ths_account);
      setMobile(account.mobile || '');
      // 切换到合适的登录方式
      if (account.mobile) {
        setLoginMethod('sms');
      } else {
        setLoginMethod('password');
      }
    }
  }, []);

  // 根据可用方式过滤tabs
  const filteredTabItems = tabItems.filter(item => availableMethods.includes(item.key as LoginMethod));

  return (
    <Modal
      title="同花顺账号登录"
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={480}
    >
      {/* 历史账号显示 - 使用ThsAccountTags组件 */}
      <ThsAccountTags
        refreshTrigger={accountsRefreshTrigger}
        onAccountSelect={handleHistoricalAccountSelect}
        onAccountDeleted={onClose}
        onRefreshNeeded={() => setAccountsRefreshTrigger(prev => prev + 1)}
      />
      
      <Tabs
        activeKey={loginMethod}
        onChange={(key) => setLoginMethod(key as LoginMethod)}
        items={filteredTabItems}
      />
      
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
    </Modal>
  );
};

export default ThsLoginModal;
