import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import authFetch from '../utils/authFetch.ts';
import {
  Layout,
  Card,
  Button,
  Spin,
  message,
  Row,
  Col,
  Tabs,
  InputNumber,
  Radio,
  Switch,
  Tooltip,
  Input,
  Modal,
} from 'antd';
import dayjs from 'dayjs';
import {
  SettingOutlined,
  DashboardOutlined,
  MonitorOutlined,
  SyncOutlined,
  DollarOutlined,
  StockOutlined,
  BulbOutlined,
  ApartmentOutlined,
  TeamOutlined,
  GiftOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { hasWritePermission } from '../types/user.ts';
import { Alert } from 'antd';

// 导入自定义hooks
import { useSystemMonitor } from '../hooks/useSystemMonitor.ts';
import { useSimpleToast } from '../hooks/useToastExtractor.ts';
import { useTaskProgress } from '../hooks/useTaskProgress.ts';
import { useSchedulerTasks } from '../hooks/useSchedulerTasks.ts';

// 导入拆分后的组件
import MonitorPanel from '../components/admin/MonitorPanel.tsx';
import SchedulerTaskPanel from '../components/admin/SchedulerTaskPanel.tsx';
import KLineSyncTabOptimized from '../components/admin/KLineSyncTabOptimized.tsx';
import UserManagement from '../components/admin/UserManagement.tsx';
import InvitationCodeManagement from '../components/admin/InvitationCodeManagement.tsx';
import StrategyPushConfig from '../components/admin/StrategyPushConfig.tsx';
import { useAppStore } from '../stores/useAppStore.ts';

const { Content, Header } = Layout;


// 将整个 AdminPanel 用 React.memo 包裹，避免因 schedulerTasks 变化而重渲染
const AdminPanel = memo(() => {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);

  // Toast 提取器
  const { showProgressToast } = useSimpleToast();
  const userInfo = useAppStore(state => state.userInfo);
  const loadUserProfile = useAppStore(state => state.loadUserProfile);
  const isReadOnly = !hasWritePermission(userInfo);
  const [currentDataSource] = useState<string>('tushare');
  const [loading, setLoading] = useState(true);

  // 数据同步相关状态
  const [syncingStockData, setSyncingStockData] = useState(false);
  const [syncingConvertibleBondPrices, setSyncingConvertibleBondPrices] = useState(false);
  const [syncingConcepts, setSyncingConcepts] = useState(false);
  const [syncingIndustries, setSyncingIndustries] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedItemNames, setSelectedItemNames] = useState<Record<string, string>>({});
  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedConceptNames, setSelectedConceptNames] = useState<Record<string, string>>({});
  const [selectedIndustryNames, setSelectedIndustryNames] = useState<Record<string, string>>({});

  // K线同步配置 - 为每种数据类型创建独立状态
  const [stockSyncPeriods, setStockSyncPeriods] = useState<string[]>(['daily']);
  const [bondSyncPeriods, setBondSyncPeriods] = useState<string[]>(['daily']);
  const [conceptSyncPeriods, setConceptSyncPeriods] = useState<string[]>(['daily']);
  const [industrySyncPeriods, setIndustrySyncPeriods] = useState<string[]>(['daily']);
  // 各Tab全选标志（由后端根据标志获取全部代码）
  const [stockAllSelected, setStockAllSelected] = useState<boolean>(false);
  const [bondAllSelected, setBondAllSelected] = useState<boolean>(false);
  const [conceptAllSelected, setConceptAllSelected] = useState<boolean>(false);
  const [industryAllSelected, setIndustryAllSelected] = useState<boolean>(false);
  // 当前激活的K线数据子Tab
  const [activeKlineTab, setActiveKlineTab] = useState<'stock' | 'convertible_bond' | 'concept' | 'industry'>('stock');

  // 新增：同步数据类型状态
  const [syncKline, setSyncKline] = useState<boolean>(true);  // 默认选中K线
  const [syncAuction, setSyncAuction] = useState<boolean>(false);
  // 新增：同步模式状态
  const [syncMode, setSyncMode] = useState<'incremental' | 'full' | 'range'>('incremental');
  // 新增：删除范围状态
  const [deleteScope, setDeleteScope] = useState<'range' | 'full_periods' | 'all'>('range');

  // 日期范围选择
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  // 全量同步月数配置（默认12个月）
  const [fullSyncMonths, setFullSyncMonths] = useState<number>(12);
  // K线显示年份数量配置（默认5年）
  const [klineDisplayYears, setKlineDisplayYears] = useState<number>(5);

  const indicatorSource = useAppStore(state => state.indicatorSource);
  const setIndicatorSource = useAppStore(state => state.setIndicatorSource);

  const saveFullSyncMonthsTimerRef = useRef<number | null>(null);
  const saveKlineDisplayYearsTimerRef = useRef<number | null>(null);
  const saveIndicatorSourceTimerRef = useRef<number | null>(null);

  // 登录方式配置状态
  const [loginMethodsConfig, setLoginMethodsConfig] = useState<{ qr: boolean; sms: boolean; password: boolean; cookie: boolean }>({
    qr: true,
    sms: true,
    password: true,
    cookie: true,
  });
  const saveLoginMethodsTimerRef = useRef<number | null>(null);

  // 自动补登录配置状态
  const [autoReloginConfig, setAutoReloginConfig] = useState<{
    auto_relogin_enabled: boolean;
    pushplus_token: string;
    pushplus_secret_key: string;
    relogin_timeout_minutes: number;
  }>({
    auto_relogin_enabled: false,
    pushplus_token: '',
    pushplus_secret_key: '',
    relogin_timeout_minutes: 10,
  });
  const saveAutoReloginTimerRef = useRef<number | null>(null);

  // 滑块验证模式配置状态
  const [captchaMode, setCaptchaMode] = useState<'combined' | 'auto' | 'manual'>('combined');
  const saveCaptchaModeTimerRef = useRef<number | null>(null);

  // Tushare 频次配置状态
  const [tushareRatePolicies, setTushareRatePolicies] = useState<Record<string, { per_minute: number; per_second: number; concurrency: number }>>({});
  const saveTushareRatePoliciesTimerRef = useRef<number | null>(null);
  const [tushareRateModalVisible, setTushareRateModalVisible] = useState(false);

  // Tushare API 文档链接
  const tushareApiDocs: Record<string, string> = {
    daily: 'https://tushare.pro/document/2?doc_id=27',
    daily_basic: 'https://tushare.pro/document/2?doc_id=32',
    cb_daily: 'https://tushare.pro/document/2?doc_id=187',
    ths_daily: 'https://tushare.pro/document/2?doc_id=260',
    weekly: 'https://tushare.pro/document/2?doc_id=144',
    monthly: 'https://tushare.pro/document/2?doc_id=145',
    stk_auction: 'https://tushare.pro/document/2?doc_id=369',
  };

  const scheduleSaveCaptchaMode = (mode: 'combined' | 'auto' | 'manual') => {
    if (saveCaptchaModeTimerRef.current) {
      window.clearTimeout(saveCaptchaModeTimerRef.current);
    }
    saveCaptchaModeTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ captcha_mode: mode })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '滑块验证模式已保存', key: 'captcha-mode-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'captcha-mode-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'captcha-mode-save', duration: 2 });
      }
    }, 600);
  };

  const scheduleSaveTushareRatePolicies = (policies: Record<string, { per_minute: number; per_second: number; concurrency: number }>) => {
    if (saveTushareRatePoliciesTimerRef.current) {
      window.clearTimeout(saveTushareRatePoliciesTimerRef.current);
    }
    saveTushareRatePoliciesTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ tushare_rate_policies: policies })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: 'Tushare 频次配置已保存', key: 'tushare-rate-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'tushare-rate-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'tushare-rate-save', duration: 2 });
      }
    }, 600);
  };

  const updateTushareRatePolicy = (apiName: string, field: string, value: number) => {
    const newPolicies = {
      ...tushareRatePolicies,
      [apiName]: { ...tushareRatePolicies[apiName], [field]: value }
    };
    setTushareRatePolicies(newPolicies);
    scheduleSaveTushareRatePolicies(newPolicies);
  };

  const scheduleSaveDefaultSyncMonths = (months: number) => {
    if (saveFullSyncMonthsTimerRef.current) {
      window.clearTimeout(saveFullSyncMonthsTimerRef.current);
    }
    saveFullSyncMonthsTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ default_sync_months: months })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '配置已保存', key: 'system-config-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'system-config-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'system-config-save', duration: 2 });
      }
    }, 600);
  };

  const scheduleSaveKlineDisplayYears = (years: number) => {
    if (saveKlineDisplayYearsTimerRef.current) {
      window.clearTimeout(saveKlineDisplayYearsTimerRef.current);
    }
    saveKlineDisplayYearsTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ kline_display_years: years })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '配置已保存', key: 'system-config-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'system-config-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'system-config-save', duration: 2 });
      }
    }, 600);
  };

  const scheduleSaveIndicatorSource = (source: 'frontend' | 'db') => {
    if (saveIndicatorSourceTimerRef.current !== null) {
      window.clearTimeout(saveIndicatorSourceTimerRef.current);
    }
    saveIndicatorSourceTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ indicator_source: source })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '配置已保存', key: 'system-config-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'system-config-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'system-config-save', duration: 2 });
      }
    }, 300);
  };

  const scheduleSaveLoginMethods = (config: { qr: boolean; sms: boolean; password: boolean; cookie: boolean }) => {
    if (saveLoginMethodsTimerRef.current !== null) {
      window.clearTimeout(saveLoginMethodsTimerRef.current);
    }
    saveLoginMethodsTimerRef.current = window.setTimeout(async () => {
      try {
        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ login_methods: config })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '登录方式配置已保存', key: 'login-methods-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'login-methods-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'login-methods-save', duration: 2 });
      }
    }, 300);
  };

  const scheduleSaveAutoRelogin = (config: typeof autoReloginConfig) => {
    if (saveAutoReloginTimerRef.current !== null) {
      window.clearTimeout(saveAutoReloginTimerRef.current);
    }
    saveAutoReloginTimerRef.current = window.setTimeout(async () => {
      try {
        // 转换格式以匹配统一接口
        const reloginConfig = {
          auto_relogin_enabled: config.auto_relogin_enabled.toString(),
          pushplus_token: config.pushplus_token,
          pushplus_secret_key: config.pushplus_secret_key,
          relogin_timeout_minutes: config.relogin_timeout_minutes.toString(),
        };

        const resp = await authFetch('/api/admin/system/config', {
          method: 'POST',
          body: JSON.stringify({ relogin_config: reloginConfig })
        });
        const data = await resp.json();
        if (data?.success) {
          message.success({ content: '自动补登录配置已保存', key: 'auto-relogin-save', duration: 1 });
        } else {
          message.error({ content: data?.message || '保存失败', key: 'auto-relogin-save', duration: 2 });
        }
      } catch (error: any) {
        message.error({ content: '保存失败', key: 'auto-relogin-save', duration: 2 });
      }
    }, 600);
  };
  // 删除相关状态
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  // 删除基础数据开关（仅当选中所有周期时显示）
  const [stockDeleteBasic, setStockDeleteBasic] = useState<boolean>(false);
  const [bondDeleteBasic, setBondDeleteBasic] = useState<boolean>(false);
  const [conceptDeleteBasic, setConceptDeleteBasic] = useState<boolean>(false);
  const [industryDeleteBasic, setIndustryDeleteBasic] = useState<boolean>(false);
  // 调度任务相关状态由 useSchedulerTasks 管理

  // 用于在任务完成时刷新任务列表的ref
  const fetchSchedulerTasksRef = useRef<(() => Promise<void>) | null>(null);

  // 任务完成回调保持稳定引用，避免依赖链导致重复执行
  const onTaskComplete = useCallback((taskCode: string, data: any) => {
    // 任务完成后刷新任务列表，更新上次执行时间
    fetchSchedulerTasksRef.current?.()
    if (taskCode === 'concept_sync' || taskCode === 'manual_concept_sync') {
      setSyncingConcepts(false);
    } else if (taskCode === 'industry_sync' || taskCode === 'manual_industry_sync') {
      setSyncingIndustries(false);
    } else if (taskCode === 'stock_sync' || taskCode === 'manual_stock_sync') {
      setSyncingStockData(false);
    } else if (taskCode === 'convertible_bond_sync' || taskCode === 'manual_bond_sync') {
      setSyncingConvertibleBondPrices(false);
    } else if (taskCode?.startsWith('batch_delete_')) {
      // 批量删除任务完成
      if (data?.success_count !== undefined) {
        message.success(`批量删除完成：成功 ${data.success_count} 个，共删除 ${data.total_deleted} 条记录`);
        if (data.fail_count > 0) {
          message.warning(`${data.fail_count} 个代码删除失败`);
        }
      }
    }
  }, []);

  // 任务执行进度（自定义 hook）
  const {
    taskExecutions,
    startTaskProgressMonitoring,
    cancelTaskExecution,
    clearTaskExecution,
    restoreRunningTasks,
  } = useTaskProgress({ showProgressToast, onTaskComplete });

  // cron 编辑与全量开关由 useSchedulerTasks 管理

  // 系统监控相关状态
  const { systemStatus, statisticsCount } = useSystemMonitor();

  // ref for main content
  const taskPanelRef = useRef<HTMLDivElement>(null);

  // 获取同步状态（后端接口已移除）
  const fetchSyncStatus = useCallback(async () => {
    return null;
  }, []);


  // 进度监控由 useTaskProgress 提供 startTaskProgressMonitoring

  // 加载系统配置
  useEffect(() => {
    const loadSystemConfig = async () => {
      try {
        // 使用统一的系统配置接口
        const response = await authFetch('/api/admin/system/config');
        const respData = await response.json();
        if (respData.success && respData.data) {
          const data = respData.data;

          // 设置默认同步月数
          if (data.default_sync_months) {
            setFullSyncMonths(data.default_sync_months);
          }

          // 设置K线显示年份
          if (data.kline_display_years) {
            setKlineDisplayYears(data.kline_display_years);
          }

          // 设置指标数据源
          if (data.indicator_source) {
            const src = (data.indicator_source === 'db') ? 'db' : 'frontend';
            setIndicatorSource(src);
          }

          // 设置补登录配置
          if (data.relogin_config) {
            setAutoReloginConfig({
              auto_relogin_enabled: data.relogin_config.auto_relogin_enabled === 'true',
              pushplus_token: data.relogin_config.pushplus_token || '',
              pushplus_secret_key: data.relogin_config.pushplus_secret_key || '',
              relogin_timeout_minutes: parseInt(data.relogin_config.relogin_timeout_minutes) || 10,
            });
          }

          // 设置登录方式配置
          if (data.login_methods) {
            setLoginMethodsConfig(data.login_methods);
          }

          // 设置滑块验证模式配置
          if (data.captcha_mode) {
            setCaptchaMode(data.captcha_mode as 'combined' | 'auto' | 'manual');
          }

          // 设置 Tushare 频次配置
          if (data.tushare_rate_policies) {
            setTushareRatePolicies(data.tushare_rate_policies);
          }
        }
      } catch (error) {
        console.error('加载系统配置失败:', error);
      }
    };
    loadSystemConfig();

    // 加载用户信息
    if (!userInfo) {
      loadUserProfile();
    }
  }, [setIndicatorSource, userInfo, loadUserProfile]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveFullSyncMonthsTimerRef.current !== null) {
        window.clearTimeout(saveFullSyncMonthsTimerRef.current);
      }
      if (saveKlineDisplayYearsTimerRef.current !== null) {
        window.clearTimeout(saveKlineDisplayYearsTimerRef.current);
      }
      if (saveIndicatorSourceTimerRef.current !== null) {
        window.clearTimeout(saveIndicatorSourceTimerRef.current);
      }
      if (saveLoginMethodsTimerRef.current !== null) {
        window.clearTimeout(saveLoginMethodsTimerRef.current);
      }
      if (saveAutoReloginTimerRef.current !== null) {
        window.clearTimeout(saveAutoReloginTimerRef.current);
      }
    };
  }, []);

  // 初始化数据
  const initDataRef = useRef(false);
  useEffect(() => {
    if (initDataRef.current) return;
    initDataRef.current = true;

    const initData = async () => {
      setLoading(true);
      await fetchSyncStatus();
      // 恢复正在运行的任务（使用 hook 封装）
      const restored = await restoreRunningTasks();

      // 若存在运行中的手动K线同步任务，恢复所有任务的条件，并切换到第一个任务的tab
      try {
        const candidateTaskIds = [
          'manual_stock_sync',
          'manual_bond_sync',
          'manual_concept_sync',
          'manual_industry_sync',
        ];

        const subjectTypeToTab = {
          stock: 'stock',
          bond: 'convertible_bond',
          concept: 'concept',
          industry: 'industry',
        } as const;

        type SubjectTypeKey = keyof typeof subjectTypeToTab;
        const isSubjectTypeKey = (v: string): v is SubjectTypeKey => v in subjectTypeToTab;

        let firstRunningTab: 'stock' | 'convertible_bond' | 'concept' | 'industry' | null = null;

        // 遍历所有运行中的任务，恢复各自的条件
        for (const taskId of candidateTaskIds) {
          const task = (restored as any)?.[taskId];
          if (!task || !['running', 'pending', 'cancelling'].includes(task.status)) {
            continue;
          }

          const od = (task?.operationDetails || {}) as any;
          const subjectType = (od.subject_type || '').toString();
          const selection = (od.selection || {}) as any;
          const periods = (od.periods || []) as string[];
          const options = (od.options || {}) as any;

          const tabFromSubject = (isSubjectTypeKey(subjectType)
            ? subjectTypeToTab[subjectType]
            : undefined) || (taskId === 'manual_bond_sync' ? 'convertible_bond' as const : undefined);

          if (!tabFromSubject) continue;

          // 记录第一个运行中任务的tab，用于切换
          if (!firstRunningTab) {
            firstRunningTab = tabFromSubject;
          }

          const codes: string[] = (selection.codes || selection.ts_codes || []) as any;
          const allSelected = !!selection.all_selected;

          // 根据tab类型恢复对应的条件
          if (tabFromSubject === 'stock') {
            setStockAllSelected(allSelected);
            setSelectedItems(allSelected ? [] : codes);
            setSelectedItemNames({});
            if (Array.isArray(periods) && periods.length) setStockSyncPeriods(periods);
            if (typeof options.sync_auction === 'boolean') setSyncAuction(!!options.sync_auction);
          } else if (tabFromSubject === 'convertible_bond') {
            setBondAllSelected(allSelected);
            setSelectedItems(allSelected ? [] : codes);
            setSelectedItemNames({});
            if (Array.isArray(periods) && periods.length) setBondSyncPeriods(periods);
          } else if (tabFromSubject === 'concept') {
            setConceptAllSelected(allSelected);
            setSelectedConcepts(allSelected ? [] : codes);
            setSelectedConceptNames({});
            if (Array.isArray(periods) && periods.length) setConceptSyncPeriods(periods);
          } else if (tabFromSubject === 'industry') {
            setIndustryAllSelected(allSelected);
            setSelectedIndustries(allSelected ? [] : codes);
            setSelectedIndustryNames({});
            if (Array.isArray(periods) && periods.length) setIndustrySyncPeriods(periods);
          }

          // 同步选项恢复（对所有tab通用）
          if (typeof options.sync_kline === 'boolean') setSyncKline(!!options.sync_kline);

          const startDate = options.start_date;
          const endDate = options.end_date;
          if (startDate && endDate) {
            setSyncMode('range');
            setDateRange([dayjs(startDate, 'YYYYMMDD'), dayjs(endDate, 'YYYYMMDD')]);
          } else if (options.force_sync) {
            setSyncMode('full');
          } else {
            setSyncMode('incremental');
          }
        }

        // 切换到第一个运行中任务的tab
        if (firstRunningTab) {
          setActiveKlineTab(firstRunningTab);
        }
      } catch {
        // ignore restore ui state errors
      }
      setLoading(false);
    };
    initData();
  }, [fetchSyncStatus, restoreRunningTasks]);

  // 监听Content容器的滚动位置变化，防止自动跳转
  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const handleScroll = () => {
      const currentScrollTop = node.scrollTop || 0;
      if (currentScrollTop > 0 && Math.abs(currentScrollTop - lastScrollTopRef.current) > 100) {
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = lastScrollTopRef.current;
          }
        }, 0);
      }
      lastScrollTopRef.current = currentScrollTop;
    };
    node.addEventListener('scroll', handleScroll);
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, []);




  // 通用选项获取封装（只返回 options 数组，供 SearchSelect 使用）
  const fetchStockOptionsSimple = useCallback(async (keyword: string) => {
    const url = `/api/stocks/search?keyword=${encodeURIComponent(keyword)}&limit=100`;
    const response = await authFetch(url);
    if (!response.ok) return [];
    const result = await response.json();
    const list = result?.data ?? (Array.isArray(result) ? result : []);
    return (list || []).map((s: any) => ({ label: s.name, value: s.ts_code }));
  }, []);

  const fetchBondOptionsSimple = useCallback(async (keyword: string) => {
    const url = `/api/convertible-bonds/search?keyword=${encodeURIComponent(keyword)}&limit=100`;
    const response = await authFetch(url);
    if (!response.ok) return [];
    const result = await response.json();
    const list = result?.data ?? [];
    return (list || []).map((b: any) => ({ label: b.bond_short_name, value: b.ts_code }));
  }, []);

  const fetchConceptOptionsSimple = useCallback(async (keyword: string) => {
    const url = `/api/concepts/search?keyword=${encodeURIComponent(keyword)}&limit=100`;
    const response = await authFetch(url);
    if (!response.ok) return [];
    const result = await response.json();
    const list = result?.data ?? [];
    return (list || []).map((c: any) => ({ label: c.concept_name, value: c.concept_code }));
  }, []);

  const fetchIndustryOptionsSimple = useCallback(async (keyword: string) => {
    const url = `/api/industries/search?keyword=${encodeURIComponent(keyword)}&limit=100`;
    const response = await authFetch(url);
    if (!response.ok) return [];
    const result = await response.json();
    const list = result?.data ?? [];
    return (list || []).map((i: any) => ({ label: i.industry_name, value: i.industry_code }));
  }, []);

  // 股票K线数据同步处理函数
  const handleSyncStockData = async (forceFull?: boolean) => {
    if (!stockAllSelected && selectedItems.length === 0) {
      message.warning('请选择要同步的股票或使用全选');
      return;
    }

    if (stockSyncPeriods.length === 0) {
      message.warning('请选择K线周期');
      return;
    }

    // 计算日期范围
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (dateRange) {
      // 使用用户选择的日期范围
      startDate = dateRange[0].format('YYYYMMDD');
      endDate = dateRange[1].format('YYYYMMDD');
    }
    // 如果勾选全量，不传日期参数，让后端从Redis读取配置

    if (syncingStockData) {
      message.warning('同步正在进行中，请稍候...');
      return;
    }

    try {
      setSyncingStockData(true);

      const response = await authFetch('/api/stocks/sync', {
        method: 'POST',
        body: JSON.stringify({
          ts_codes: stockAllSelected ? [] : selectedItems,
          periods: stockSyncPeriods,
          all_selected: stockAllSelected,
          sync_mode: 'sync',  // 使用同步执行模式
          options: {
            force_sync: !!forceFull,
            sync_kline: syncKline,
            sync_auction: syncAuction && stockSyncPeriods.includes('daily'),
            ...(startDate && endDate ? { start_date: startDate, end_date: endDate } : {})
          }
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 处理单个或多个execution ID
        if (result.task_execution_id) {
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_stock_sync', executionIds);
        } else {
          setSyncingStockData(false);
        }
      } else {
        if (result.task_execution_id) {
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_stock_sync', executionIds);
          message.warning(result.message || '任务正在运行中');
        } else {
          message.error(result.message);
        }
        setSyncingStockData(false);
      }
    } catch (error) {
      message.error('同步股票K线数据失败');
      setSyncingStockData(false);
    }
  };

  // 可转债K线数据同步处理函数
  const handleSyncBondData = async (forceFull?: boolean) => {
    if (!bondAllSelected && selectedItems.length === 0) {
      message.warning('请选择要同步的可转债或使用全选');
      return;
    }

    // 计算日期范围
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (dateRange) {
      startDate = dateRange[0].format('YYYYMMDD');
      endDate = dateRange[1].format('YYYYMMDD');
    }
    // 如果勾选全量，不传日期参数，让后端从Redis读取配置

    if (bondSyncPeriods.length === 0) {
      message.warning('请选择K线周期');
      return;
    }


    if (syncingConvertibleBondPrices) {
      message.warning('同步正在进行中，请稍候...');
      return;
    }

    try {
      setSyncingConvertibleBondPrices(true);

      const response = await authFetch('/api/convertible-bonds/sync', {
        method: 'POST',
        body: JSON.stringify({
          ts_codes: bondAllSelected ? [] : selectedItems,
          periods: bondSyncPeriods,
          all_selected: bondAllSelected,
          sync_mode: 'sync',
          options: {
            force_sync: !!forceFull,
            sync_kline: syncKline,
            ...(startDate && endDate ? { start_date: startDate, end_date: endDate } : {})
          }
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 如果返回了任务执行ID，开始监控进度
        if (result.task_execution_id) {
          // 处理单个或多个execution ID
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_bond_sync', executionIds);
        } else {
          setSyncingConvertibleBondPrices(false);
        }
      } else {
        if (result.task_execution_id) {
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_bond_sync', executionIds);
          message.warning(result.message || '任务正在运行中');
        } else {
          message.error(result.message);
        }
        setSyncingConvertibleBondPrices(false);
      }
    } catch (error) {
      message.error('同步可转债K线数据失败');
      setSyncingConvertibleBondPrices(false);
    }
  };

  // 概念同步处理函数
  const handleSyncConcepts = async (forceFull?: boolean) => {
    if (!conceptAllSelected && selectedConcepts.length === 0) {
      message.warning('请选择要同步的概念或使用全选');
      return;
    }

    // 计算日期范围
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (dateRange) {
      startDate = dateRange[0].format('YYYYMMDD');
      endDate = dateRange[1].format('YYYYMMDD');
    }
    // 如果勾选全量，不传日期参数，让后端从Redis读取配置

    setSyncingConcepts(true);
    try {
      const response = await authFetch('/api/concepts/sync', {
        method: 'POST',
        body: JSON.stringify({
          concept_codes: conceptAllSelected ? [] : selectedConcepts,
          periods: conceptSyncPeriods,
          all_selected: conceptAllSelected,
          options: {
            force_sync: !!forceFull,
            sync_kline: syncKline,
            ...(startDate && endDate ? { start_date: startDate, end_date: endDate } : {})
          },
          sync_mode: 'sync'
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 如果返回了任务执行ID，开始监控进度
        if (result.task_execution_id) {
          // 处理单个或多个execution ID
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_concept_sync', executionIds);
        } else {
          setSyncingConcepts(false);
        }
      } else {
        if (result.task_execution_id) {
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_concept_sync', executionIds);
          message.warning(result.message || '任务正在运行中');
        } else {
          message.error(result.message);
        }
        setSyncingConcepts(false);
      }
    } catch (error) {
      message.error('同步概念板块数据失败');
      setSyncingConcepts(false);
    }
  };

  // 行业同步处理函数
  const handleSyncIndustries = async (forceFull?: boolean) => {
    if (!industryAllSelected && selectedIndustries.length === 0) {
      message.warning('请选择要同步的行业或使用全选');
      return;
    }

    // 计算日期范围
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (dateRange) {
      startDate = dateRange[0].format('YYYYMMDD');
      endDate = dateRange[1].format('YYYYMMDD');
    }
    // 如果勾选全量，不传日期参数，让后端从Redis读取配置

    setSyncingIndustries(true);
    try {
      const response = await authFetch('/api/industries/sync', {
        method: 'POST',
        body: JSON.stringify({
          industry_codes: industryAllSelected ? [] : selectedIndustries,
          periods: industrySyncPeriods,
          all_selected: industryAllSelected,
          options: {
            force_sync: !!forceFull,
            sync_kline: syncKline,
            ...(startDate && endDate ? { start_date: startDate, end_date: endDate } : {})
          },
          sync_mode: 'sync'
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 如果返回了任务执行ID，开始监控进度
        if (result.task_execution_id) {
          // 处理单个或多个execution ID
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_industry_sync', executionIds);
        } else {
          setSyncingIndustries(false);
        }
      } else {
        if (result.task_execution_id) {
          const executionIds = Array.isArray(result.task_execution_id)
            ? result.task_execution_id
            : [result.task_execution_id];
          startTaskProgressMonitoring('manual_industry_sync', executionIds);
          message.warning(result.message || '任务正在运行中');
        } else {
          message.error(result.message);
        }
        setSyncingIndustries(false);
      }
    } catch (error) {
      message.error('同步行业板块数据失败');
      setSyncingIndustries(false);
    }
  };

  // 获取当前Tab已选中的代码
  const getCurrentSelectedCodes = () => {
    switch (activeKlineTab) {
      case 'stock':
        return stockAllSelected ? [] : selectedItems;
      case 'convertible_bond':
        return bondAllSelected ? [] : selectedItems;
      case 'concept':
        return conceptAllSelected ? [] : selectedConcepts;
      case 'industry':
        return industryAllSelected ? [] : selectedIndustries;
      default:
        return [];
    }
  };

  // 辅助函数：获取当前tab的状态值
  const getCurrentTabState = <T,>(stockVal: T, bondVal: T, conceptVal: T, industryVal: T): T => {
    switch (activeKlineTab) {
      case 'stock': return stockVal;
      case 'convertible_bond': return bondVal;
      case 'concept': return conceptVal;
      case 'industry': return industryVal;
      default: return stockVal;
    }
  };

  // 辅助函数：获取当前tab的周期数组
  const getCurrentPeriods = () => getCurrentTabState(stockSyncPeriods, bondSyncPeriods, conceptSyncPeriods, industrySyncPeriods);

  // 辅助函数：获取当前tab的数据类型名称
  const getCurrentTypeName = () => {
    const typeMap = { 'stock': '股票', 'convertible_bond': '可转债', 'concept': '概念', 'industry': '行业' };
    return typeMap[activeKlineTab];
  };

  // 辅助函数：判断当前tab是否全选
  const isCurrentTabAllSelected = () => getCurrentTabState(stockAllSelected, bondAllSelected, conceptAllSelected, industryAllSelected);

  // 统一同步处理函数
  const handleUnifiedSync = async () => {
    const typeName = getCurrentTypeName();
    const codes = getCurrentSelectedCodes();
    const isAllSelected = isCurrentTabAllSelected();
    const currentPeriods = getCurrentPeriods();

    if (codes.length === 0 && !isAllSelected) {
      message.warning(`请选择要同步的${typeName}或使用全选`);
      return;
    }

    if (currentPeriods.length === 0) {
      message.warning('请选择K线周期');
      return;
    }

    if (!syncKline && !(activeKlineTab === 'stock' && syncAuction)) {
      message.warning('请选择要同步的数据类型');
      return;
    }

    // 根据当前tab调用对应的同步函数
    const forceFull = syncMode === 'full';
    if (activeKlineTab === 'stock') {
      await handleSyncStockData(forceFull);
    } else if (activeKlineTab === 'convertible_bond') {
      await handleSyncBondData(forceFull);
    } else if (activeKlineTab === 'concept') {
      await handleSyncConcepts(forceFull);
    } else if (activeKlineTab === 'industry') {
      await handleSyncIndustries(forceFull);
    }
  };

  // 统一删除处理函数
  const handleUnifiedDelete = async () => {
    await handleSmartDelete();
  };

  // 智能删除：根据当前选择的条件决定删除什么
  const handleSmartDelete = async () => {
    const typeName = getCurrentTypeName();
    const codes = getCurrentSelectedCodes();
    const isAllSelected = isCurrentTabAllSelected();

    if (codes.length === 0 && !isAllSelected) {
      message.warning(`请选择要删除的${typeName}或使用全选`);
      return;
    }

    // 获取当前选中的周期
    const currentPeriods = getCurrentPeriods();
    const deleteBasic = getCurrentTabState(stockDeleteBasic, bondDeleteBasic, conceptDeleteBasic, industryDeleteBasic);
    const allPeriodsSelected = currentPeriods.includes('daily') && currentPeriods.includes('weekly') && currentPeriods.includes('monthly');

    // 检查周期选择
    if (currentPeriods.length === 0) {
      message.warning('请选择K线周期');
      return;
    }
    const codeCount = isAllSelected ? '全部' : codes.length;

    // 根据deleteScope决定删除类型
    let deleteType = '';
    let confirmMessage = '';
    const periodNames = currentPeriods.map(p => p === 'daily' ? '日线' : p === 'weekly' ? '周线' : '月线').join('、');

    if (deleteScope === 'range') {
      // 删除指定日期范围的K线
      if (!dateRange || dateRange.length !== 2) {
        message.warning('请选择日期范围');
        return;
      }
      deleteType = 'kline-range';
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      confirmMessage = `确认删除 ${codeCount} 个${typeName}代码在 ${startDate}~${endDate} 期间的${periodNames}K线数据？此操作不可恢复！`;
    } else if (deleteScope === 'full_periods') {
      // 删除选中周期的全部K线
      deleteType = 'kline-full';
      if (allPeriodsSelected && deleteBasic) {
        // 选中所有周期 + 基础数据 = 删除所有数据
        deleteType = 'all';
        confirmMessage = `确认删除 ${codeCount} 个${typeName}代码的所有数据？包括K线、基础信息和关联数据，此操作不可恢复！`;
      } else {
        confirmMessage = `确认删除 ${codeCount} 个${typeName}代码的所有${periodNames}K线数据？此操作不可恢复！`;
      }
    } else {
      message.warning('请选择删除范围');
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        message.warning({
          content: confirmMessage,
          duration: 3,
          onClose: () => resolve()
        });
      });

      setDeleteLoading(true);

      // 构建批量删除请求
      let startDate: string | undefined;
      let endDate: string | undefined;
      let deleteScopeParam: 'all' | 'kline' = 'kline';

      if (deleteType === 'all') {
        deleteScopeParam = 'all';
      } else if (deleteType === 'kline-range' && dateRange) {
        startDate = dateRange[0].format('YYYYMMDD');
        endDate = dateRange[1].format('YYYYMMDD');
      } else if (deleteType === 'kline-full') {
        const end = dayjs();
        const start = end.subtract(fullSyncMonths, 'month');
        startDate = start.format('YYYYMMDD');
        endDate = end.format('YYYYMMDD');
      }

      const requestBody = {
        ts_codes: codes,  // 改为 ts_codes 数组
        data_type: activeKlineTab,
        delete_scope: deleteScopeParam,
        periods: deleteScopeParam === 'kline' ? currentPeriods : undefined,
        start_date: startDate,
        end_date: endDate
      };

      // 调用批量删除接口
      const response = await authFetch('/api/admin/delete-code-data', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success && data.data?.task_id) {
        const taskId = data.data.task_id;
        message.success(`批量删除任务已创建，共 ${codes.length} 个代码`);

        // 启动进度监控
        startTaskProgressMonitoring(taskId, `batch_delete_${activeKlineTab}`);
      } else {
        message.error('创建删除任务失败');
      }
    } catch (error: any) {
      console.error('删除数据失败:', error);
      message.error(error.response?.data?.message || error.response?.data?.detail || '删除数据失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 定时任务（自定义 hook）
  const {
    schedulerTasks,
    loadingSchedulerTasks,
    fetchSchedulerTasks,
    triggeringTasks,
    handleTriggerTask,
    editingTaskId,
    editingCron,
    setEditingCron,
    startEditCron,
    cancelEditCron,
    saveCronExpression,
    updatingCron,
    taskForceFullById,
    setTaskForceFullById,
    updatingStatus,
    updateTaskStatus,
  } = useSchedulerTasks(startTaskProgressMonitoring);

  // 设置fetchSchedulerTasks的ref，供onTaskComplete使用
  useEffect(() => {
    fetchSchedulerTasksRef.current = fetchSchedulerTasks;
  }, [fetchSchedulerTasks]);


  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ padding: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Spin size="large" />
            <p style={{ marginTop: '16px', fontSize: '16px' }}>加载后台管理数据中...</p>
          </div>
        </Content>
      </Layout>
    );
  }

  return (
    <>
      <style>{`
        .compact-input-number .ant-input-number-handler-wrap {
          width: 18px !important;
        }
        .compact-input-number .ant-input-number-handler {
          height: 18px !important;
        }
      `}</style>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{
          background: '#001529',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              color: 'white',
              fontSize: '20px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <SettingOutlined />
              后台管理系统
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Button
              icon={<DashboardOutlined />}
              onClick={() => navigate('/')}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #40a9ff', color: '#40a9ff' }}
            >
              K线大屏
            </Button>
          </div>
        </Header>

        <Content
          ref={contentRef}
          style={{
            padding: '24px',
            background: '#f0f2f5',
            overflowY: 'auto',
            height: 'calc(100vh - 64px)', // 减去Header高度
            scrollBehavior: 'auto', // 禁用平滑滚动
            scrollSnapType: 'none', // 禁用滚动捕捉
            scrollSnapAlign: 'none' // 禁用滚动对齐
          }}
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {isReadOnly && (
              <Alert
                message="当前为管理员模式"
                description="您拥有全局查看权限，但无法进行任何修改操作。所有操作按钮已被禁用。如需执行操作，请使用超级管理员账号登录。"
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: '24px' }}
              />
            )}
            {/* 系统监控 */}
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MonitorOutlined />
                  <span>系统监控</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
            >
              <MonitorPanel
                statisticsCount={statisticsCount}
                systemStatus={systemStatus}
                currentDataSource={currentDataSource}
              />
            </Card>

            {/* 数据同步管理 */}
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SyncOutlined />
                  <span>数据同步管理</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
            >
              <Row gutter={[16, 16]}>
                {/* 数据同步 */}
                <Col span={24}>
                  <Card size="small" title="K线数据同步">
                    <Tabs
                      activeKey={activeKlineTab}
                      size="small"
                      type="card"
                      onChange={(activeKey) => {
                        // 切换tab时清空选择（搜索由通用组件自行维护）
                        if (activeKey !== 'test') {
                          setSelectedItems([]);
                          setSelectedItemNames({});
                        }
                        setActiveKlineTab(activeKey as any);
                        // 切换tab时重置竞价数据状态（仅在股票tab时有效）
                        if (activeKey !== 'stock') {
                          setSyncAuction(false);
                        }
                      }}
                      items={[
                        {
                          key: 'stock',
                          label: <span><StockOutlined />股票</span>,
                          children: (
                            <KLineSyncTabOptimized
                              activeTab="stock"
                              dateRange={dateRange}
                              setDateRange={setDateRange}
                              placeholder="搜索名称/代码"
                              fetchOptions={fetchStockOptionsSimple}
                              selectedValues={selectedItems}
                              selectedNames={selectedItemNames as any}
                              onChangeSelected={(values, names) => { setSelectedItems(values); setSelectedItemNames(names as any); }}
                              allSelected={stockAllSelected}
                              setAllSelected={setStockAllSelected}
                              periods={stockSyncPeriods as any}
                              setPeriods={(vals: any) => setStockSyncPeriods(vals as string[])}
                              syncing={syncingStockData}
                              onClickSync={handleUnifiedSync}
                              onCancelTask={() => cancelTaskExecution('manual_stock_sync')}
                              execution={taskExecutions['manual_stock_sync']}
                              syncMode={syncMode}
                              setSyncMode={setSyncMode}
                              syncKline={syncKline}
                              setSyncKline={setSyncKline}
                              syncAuction={syncAuction}
                              setSyncAuction={setSyncAuction}
                              showAuctionCheckbox={true}
                              deleteScope={deleteScope}
                              setDeleteScope={setDeleteScope}
                              includeBasic={stockDeleteBasic}
                              setIncludeBasic={setStockDeleteBasic}
                              onClickDelete={handleUnifiedDelete}
                              deleting={deleteLoading}
                              readOnly={isReadOnly}
                            />
                          )
                        },
                        {
                          key: 'convertible_bond',
                          label: <span><DollarOutlined />可转债</span>,
                          children: (
                            <KLineSyncTabOptimized
                              activeTab="convertible_bond"
                              dateRange={dateRange}
                              setDateRange={setDateRange}
                              placeholder="搜索名称/代码"
                              fetchOptions={fetchBondOptionsSimple}
                              selectedValues={selectedItems}
                              selectedNames={selectedItemNames as any}
                              onChangeSelected={(values, names) => { setSelectedItems(values); setSelectedItemNames(names as any); }}
                              allSelected={bondAllSelected}
                              setAllSelected={setBondAllSelected}
                              periods={bondSyncPeriods as any}
                              setPeriods={(vals: any) => setBondSyncPeriods(vals as string[])}
                              syncing={syncingConvertibleBondPrices}
                              onClickSync={handleUnifiedSync}
                              onCancelTask={() => cancelTaskExecution('manual_bond_sync')}
                              execution={taskExecutions['manual_bond_sync']}
                              syncMode={syncMode}
                              setSyncMode={setSyncMode}
                              syncKline={syncKline}
                              setSyncKline={setSyncKline}
                              deleteScope={deleteScope}
                              setDeleteScope={setDeleteScope}
                              includeBasic={bondDeleteBasic}
                              setIncludeBasic={setBondDeleteBasic}
                              onClickDelete={handleUnifiedDelete}
                              deleting={deleteLoading}
                              readOnly={isReadOnly}
                            />
                          )
                        },
                        {
                          key: 'concept',
                          label: <span><BulbOutlined />概念</span>,
                          children: (
                            <KLineSyncTabOptimized
                              activeTab="concept"
                              dateRange={dateRange}
                              setDateRange={setDateRange}
                              placeholder="搜索名称/代码"
                              fetchOptions={fetchConceptOptionsSimple}
                              selectedValues={selectedConcepts}
                              selectedNames={selectedConceptNames as any}
                              onChangeSelected={(values, names) => { setSelectedConcepts(values); setSelectedConceptNames(names as any); }}
                              allSelected={conceptAllSelected}
                              setAllSelected={setConceptAllSelected}
                              periods={conceptSyncPeriods as any}
                              setPeriods={(vals: any) => setConceptSyncPeriods(vals as string[])}
                              syncing={syncingConcepts}
                              onClickSync={handleUnifiedSync}
                              onCancelTask={() => cancelTaskExecution('manual_concept_sync')}
                              execution={taskExecutions['manual_concept_sync']}
                              syncMode={syncMode}
                              setSyncMode={setSyncMode}
                              syncKline={syncKline}
                              setSyncKline={setSyncKline}
                              deleteScope={deleteScope}
                              setDeleteScope={setDeleteScope}
                              includeBasic={conceptDeleteBasic}
                              setIncludeBasic={setConceptDeleteBasic}
                              onClickDelete={handleUnifiedDelete}
                              deleting={deleteLoading}
                              readOnly={isReadOnly}
                            />
                          )
                        },
                        {
                          key: 'industry',
                          label: <span><ApartmentOutlined />行业</span>,
                          children: (
                            <KLineSyncTabOptimized
                              activeTab="industry"
                              dateRange={dateRange}
                              setDateRange={setDateRange}
                              placeholder="搜索名称/代码"
                              fetchOptions={fetchIndustryOptionsSimple}
                              selectedValues={selectedIndustries}
                              selectedNames={selectedIndustryNames as any}
                              onChangeSelected={(values, names) => { setSelectedIndustries(values); setSelectedIndustryNames(names as any); }}
                              allSelected={industryAllSelected}
                              setAllSelected={setIndustryAllSelected}
                              periods={industrySyncPeriods as any}
                              setPeriods={(vals: any) => setIndustrySyncPeriods(vals as string[])}
                              syncing={syncingIndustries}
                              onClickSync={handleUnifiedSync}
                              onCancelTask={() => cancelTaskExecution('manual_industry_sync')}
                              execution={taskExecutions['manual_industry_sync']}
                              syncMode={syncMode}
                              setSyncMode={setSyncMode}
                              syncKline={syncKline}
                              setSyncKline={setSyncKline}
                              deleteScope={deleteScope}
                              setDeleteScope={setDeleteScope}
                              includeBasic={industryDeleteBasic}
                              setIncludeBasic={setIndustryDeleteBasic}
                              onClickDelete={handleUnifiedDelete}
                              deleting={deleteLoading}
                              readOnly={isReadOnly}
                            />
                          )
                        },
                      ]
                      }
                    />
                  </Card>
                </Col>
              </Row>

              {/* 定时任务管理 */}
              <SchedulerTaskPanel
                schedulerTasks={schedulerTasks}
                loadingSchedulerTasks={loadingSchedulerTasks}
                taskExecutions={taskExecutions}
                triggeringTasks={triggeringTasks}
                handleTriggerTask={handleTriggerTask}
                taskPanelRef={taskPanelRef}
                editingTaskId={editingTaskId}
                editingCron={editingCron}
                setEditingCron={setEditingCron}
                startEditCron={startEditCron}
                cancelEditCron={cancelEditCron}
                saveCronExpression={saveCronExpression}
                clearTaskExecution={clearTaskExecution}
                cancelTaskExecution={cancelTaskExecution}
                updatingCron={updatingCron}
                taskForceFullById={taskForceFullById}
                setTaskForceFullById={setTaskForceFullById}
                updatingStatus={updatingStatus}
                onUpdateTaskStatus={updateTaskStatus}
                readOnly={isReadOnly}
              />

              {/* 同花顺 用户列表（按 user_key 展示和删除 Cookie） */}
            </Card>

            {/* 系统设置 */}
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SettingOutlined />
                  <span>系统设置</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
            >
              <div style={{ padding: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 12, marginTop: -8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      全量同步默认范围
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      勾选"全量"后，同步最近<strong>{fullSyncMonths}个月</strong>的数据（即 {dayjs().subtract(fullSyncMonths, 'month').format('YYYY-MM-DD')} 至今天）
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InputNumber
                      className="compact-input-number"
                      value={fullSyncMonths}
                      disabled={isReadOnly}
                      onChange={(value) => {
                        const months = value || 12;
                        setFullSyncMonths(months);
                        scheduleSaveDefaultSyncMonths(months);
                      }}
                      min={1}
                      max={36}
                      style={{ width: 100 }}
                      addonAfter="个月"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      最大K线显示年份数量
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      前端K线图可查询的历史数据范围，最多显示<strong>{klineDisplayYears}年</strong>数据
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InputNumber
                      className="compact-input-number"
                      value={klineDisplayYears}
                      disabled={isReadOnly}
                      onChange={(value) => {
                        const years = value || 5;
                        setKlineDisplayYears(years);
                        scheduleSaveKlineDisplayYears(years);
                      }}
                      min={1}
                      max={10}
                      style={{ width: 100 }}
                      addonAfter="年"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      指标数据源
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      k线指标数据来源
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio.Group
                      value={indicatorSource}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        const src = e.target.value as 'frontend' | 'db';
                        setIndicatorSource(src);
                        scheduleSaveIndicatorSource(src);
                      }}
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Radio.Button value="frontend">前端现算</Radio.Button>
                      <Radio.Button value="db">数据库</Radio.Button>
                    </Radio.Group>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      同花顺登录方式
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      前台同花顺登录弹窗中可用的登录方式，至少需要启用一种方式
                    </div>
                  </div>
                  <div
                    style={{
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, minWidth: 30 }}>微信扫码</span>
                      <Switch
                        size="small"
                        checked={loginMethodsConfig.qr}
                        disabled={isReadOnly}
                        onChange={(checked) => {
                          const newConfig = { ...loginMethodsConfig, qr: checked };
                          if (!newConfig.qr && !newConfig.sms && !newConfig.password && !newConfig.cookie) {
                            message.warning('至少需要启用一种登录方式');
                            return;
                          }
                          setLoginMethodsConfig(newConfig);
                          scheduleSaveLoginMethods(newConfig);
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, minWidth: 30 }}>短信验证码</span>
                      <Switch
                        size="small"
                        checked={loginMethodsConfig.sms}
                        disabled={isReadOnly}
                        onChange={(checked) => {
                          const newConfig = { ...loginMethodsConfig, sms: checked };
                          if (!newConfig.qr && !newConfig.sms && !newConfig.password && !newConfig.cookie) {
                            message.warning('至少需要启用一种登录方式');
                            return;
                          }
                          setLoginMethodsConfig(newConfig);
                          scheduleSaveLoginMethods(newConfig);
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, minWidth: 30 }}>账号密码</span>
                      <Switch
                        size="small"
                        checked={loginMethodsConfig.password}
                        disabled={isReadOnly}
                        onChange={(checked) => {
                          const newConfig = { ...loginMethodsConfig, password: checked };
                          if (!newConfig.qr && !newConfig.sms && !newConfig.password && !newConfig.cookie) {
                            message.warning('至少需要启用一种登录方式');
                            return;
                          }
                          setLoginMethodsConfig(newConfig);
                          scheduleSaveLoginMethods(newConfig);
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, minWidth: 30 }}>Cookie配置</span>
                      <Switch
                        size="small"
                        checked={loginMethodsConfig.cookie}
                        disabled={isReadOnly}
                        onChange={(checked) => {
                          const newConfig = { ...loginMethodsConfig, cookie: checked };
                          if (!newConfig.qr && !newConfig.sms && !newConfig.password && !newConfig.cookie) {
                            message.warning('至少需要启用一种登录方式');
                            return;
                          }
                          setLoginMethodsConfig(newConfig);
                          scheduleSaveLoginMethods(newConfig);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 滑块验证模式配置 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      同花顺登录滑块验证模式
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      同花顺登录滑块验证处理方式
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio.Group
                      value={captchaMode}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        const mode = e.target.value as 'combined' | 'auto' | 'manual';
                        setCaptchaMode(mode);
                        scheduleSaveCaptchaMode(mode);
                      }}
                      optionType="button"
                      buttonStyle="solid"
                    >
                      <Tooltip title="先尝试自动识别，失败后弹出手动验证">
                        <Radio.Button value="combined">组合</Radio.Button>
                      </Tooltip>
                      <Tooltip title="仅自动识别，失败则报错">
                        <Radio.Button value="auto">自动</Radio.Button>
                      </Tooltip>
                      <Tooltip title="跳过自动识别，直接弹出手动验证">
                        <Radio.Button value="manual">手动</Radio.Button>
                      </Tooltip>
                    </Radio.Group>
                  </div>
                </div>

                {/* Tushare API 频次限制 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      Tushare API 频次限制
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      配置各接口的请求频率限制
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <Button size="small" onClick={() => setTushareRateModalVisible(true)} disabled={isReadOnly}>
                      {isReadOnly ? '查看' : '配置'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Tushare 频次配置 Modal */}
            <Modal
              title="Tushare API 频次配置"
              open={tushareRateModalVisible}
              onCancel={() => setTushareRateModalVisible(false)}
              footer={null}
              width={420}
            >
              <p style={{ color: '#8c8c8c', marginBottom: 12, fontSize: 12 }}>
                配置各接口的请求频率限制，修改后自动保存
              </p>
              {Object.keys(tushareRatePolicies).length === 0 ? (
                <div style={{ color: '#999', fontSize: 12 }}>暂无配置</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* 表头 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', width: 80 }}>接口</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', width: 80, textAlign: 'center' }}>每分钟</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', width: 80, textAlign: 'center' }}>每秒</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', width: 80, textAlign: 'center' }}>并发</div>
                  </div>
                  {/* 数据行 */}
                  {Object.entries(tushareRatePolicies).map(([apiName, policy]) => (
                    <div
                      key={apiName}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <div style={{ fontSize: 13, width: 80 }}>
                        {tushareApiDocs[apiName] ? (
                          <a href={tushareApiDocs[apiName]} target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                            {apiName}
                          </a>
                        ) : (
                          <span style={{ color: '#262626' }}>{apiName}</span>
                        )}
                      </div>
                      <InputNumber
                        className="compact-input-number"
                        size="small"
                        min={1}
                        max={10000}
                        value={policy.per_minute}
                        disabled={isReadOnly}
                        onChange={(v) => updateTushareRatePolicy(apiName, 'per_minute', v || 100)}
                        style={{ width: 80 }}
                      />
                      <InputNumber
                        className="compact-input-number"
                        size="small"
                        min={1}
                        max={100}
                        value={policy.per_second}
                        disabled={isReadOnly}
                        onChange={(v) => updateTushareRatePolicy(apiName, 'per_second', v || 5)}
                        style={{ width: 80 }}
                      />
                      <InputNumber
                        className="compact-input-number"
                        size="small"
                        min={1}
                        max={50}
                        value={policy.concurrency}
                        disabled={isReadOnly}
                        onChange={(v) => updateTushareRatePolicy(apiName, 'concurrency', v || 5)}
                        style={{ width: 80 }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Modal>

            {/* 消息通知设置 */}
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BulbOutlined />
                  <span>消息通知设置</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
            >
              <div style={{ padding: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 12, marginTop: -8 }}>
                {/* PushPlus Token */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      PushPlus Token
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      用于系统消息推送（补登录通知、策略推送等），
                      <a href="https://www.pushplus.plus/" target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                        获取Token
                      </a>
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <Input.Password
                      style={{ width: 250 }}
                      value={autoReloginConfig.pushplus_token}
                      disabled={isReadOnly}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newConfig = { ...autoReloginConfig, pushplus_token: e.target.value };
                        setAutoReloginConfig(newConfig);
                        scheduleSaveAutoRelogin(newConfig);
                      }}
                      placeholder="请输入PushPlus Token"
                    />
                  </div>
                </div>

                {/* PushPlus SecretKey */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      SecretKey
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      用于自动获取用户二维码和同步好友令牌，
                      <a href="https://www.pushplus.plus/uc.html" target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
                        前往配置
                      </a>
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <Input.Password
                      style={{ width: 250 }}
                      value={autoReloginConfig.pushplus_secret_key}
                      disabled={isReadOnly}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newConfig = { ...autoReloginConfig, pushplus_secret_key: e.target.value };
                        setAutoReloginConfig(newConfig);
                        scheduleSaveAutoRelogin(newConfig);
                      }}
                      placeholder="请输入SecretKey"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* 自动补登录设置 */}
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SafetyCertificateOutlined />
                  <span>自动补登录设置</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
            >
              <div style={{ padding: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 12, marginTop: -8 }}>
                {/* 启用开关 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      启用自动补登录
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      开启后，系统会自动检查用户登录态并触发补登录
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <Switch
                      checked={autoReloginConfig.auto_relogin_enabled}
                      disabled={isReadOnly}
                      onChange={(checked) => {
                        const newConfig = { ...autoReloginConfig, auto_relogin_enabled: checked };
                        setAutoReloginConfig(newConfig);
                        scheduleSaveAutoRelogin(newConfig);
                      }}
                    />
                  </div>
                </div>

                {/* 超时时间 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                      超时时间
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      用户需要在此时间内完成补登录操作
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <InputNumber
                      style={{ width: 120 }}
                      min={1}
                      max={60}
                      value={autoReloginConfig.relogin_timeout_minutes}
                      disabled={isReadOnly}
                      onChange={(value) => {
                        if (value !== null) {
                          const newConfig = { ...autoReloginConfig, relogin_timeout_minutes: value };
                          setAutoReloginConfig(newConfig);
                          scheduleSaveAutoRelogin(newConfig);
                        }
                      }}
                      addonAfter="分钟"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* 策略推送设置 */}
            <StrategyPushConfig readOnly={isReadOnly} />

            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TeamOutlined />
                  <span>用户管理</span>
                </div>
              }
              style={{ marginBottom: '24px' }}
              styles={{ body: { paddingTop: 8 } }}
            >
              <Tabs
                defaultActiveKey="users"
                items={[
                  {
                    key: 'users',
                    label: <span><TeamOutlined />用户列表</span>,
                    children: <UserManagement loginMethodsConfig={loginMethodsConfig} readOnly={isReadOnly} />,
                  },
                  {
                    key: 'invitation-codes',
                    label: <span><GiftOutlined />邀请码管理</span>,
                    children: <InvitationCodeManagement readOnly={isReadOnly} />,
                  },
                ]}
              />
            </Card>
          </div>
        </Content>
      </Layout>
    </>
  );
});

// 导出组件
export default AdminPanel;
