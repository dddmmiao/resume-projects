/**
 * 应用状态管理
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import authFetch from '../utils/authFetch.ts';
import {
  Stock,
  StockGridItem,
  PeriodType,
  ToolbarState,
  AppState,
  GridItem,
  DashboardTheme,
  MobileTheme,
  MobileLayout
} from '../types';
import { UserInfo } from '../types/user.ts';

interface ThsAccount {
  ths_account: string;
  nickname: string | null;
  mobile: string | null;
  is_active: boolean;
  auto_relogin_enabled: boolean;
  is_online: boolean;
  last_login_at: string | null;
}

// 图表联动状态
interface ChartSyncState {
  start: number;
  end: number;
  sourceId: string; // 触发变化的图表ID，用于避免循环更新
  timestamp: number; // 时间戳，用于检测变化
}

// 十字线联动状态
interface CrosshairSyncState {
  tradeDate: string; // 交易日期（用于跨图表同步，确保日期一致）
  sourceId: string; // 触发变化的图表ID
  timestamp: number; // 时间戳
}

// 指标线显示设置（控制每个指标显示哪些线）
export interface IndicatorLineSettings {
  expma: number[];  // EXPMA线: [5, 10, 20, 60, 250]
  ma: number[];     // MA线: [5, 10, 20, 60, 250]
  boll: string[];   // BOLL线: ['upper', 'mid', 'lower']
  kdj: string[];    // KDJ线: ['k', 'd', 'j']
  macd: string[];   // MACD线: ['dif', 'dea', 'macd']
  dmi: string[];    // DMI线: ['pdi', 'mdi', 'adx', 'adxr']
}

interface AppStore extends AppState {
  // ThsAccount state
  thsAccounts: ThsAccount[];
  currentThsAccount: ThsAccount | null;

  // 登录方式配置
  thsLoginMethods: string[];

  // 图表联动状态
  chartSyncEnabled: boolean;
  globalDataZoom: ChartSyncState | null;
  globalCrosshairPosition: CrosshairSyncState | null;

  // 全局交易日历（YYYY-MM-DD格式）
  tradingDays: string[];
  tradingDaysLoading: boolean;

  // Actions
  setPeriod: (period: PeriodType) => void;
  setGridSize: (size: 'small' | 'medium' | 'large') => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setSelectedStocks: (stocks: string[]) => void;
  addSelectedStock: (stock: string) => void;
  removeSelectedStock: (stock: string) => void;

  setStocks: (stocks: Stock[]) => void;
  setGridItems: (items: StockGridItem[]) => void;
  updateGridItem: (ts_code: string, updates: Partial<StockGridItem>) => void;
  addGridItem: (item: StockGridItem) => void;
  removeGridItem: (ts_code: string) => void;

  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;

  // 全局十字线模式
  setCrosshairMode: (mode: 0 | 1 | 2 | 3) => void;
  switchCrosshairMode: () => void;

  // 指标数据源（frontend: 前端现算 / db: 数据库）
  setIndicatorSource: (source: 'frontend' | 'db') => void;

  // 指标线显示设置
  indicatorLineSettings: IndicatorLineSettings;
  setIndicatorLineSettings: (settings: Partial<IndicatorLineSettings>) => void;

  // 设置类（统一收敛到 app-store）
  setDashboardTheme: (theme: DashboardTheme) => void;
  setMobileTheme: (theme: MobileTheme) => void;
  setMobileLayout: (layout: MobileLayout) => void;
  setThsUsername: (username: string) => void;
  dashboardLayout: 'normal' | 'compact';
  setDashboardLayout: (layout: 'normal' | 'compact') => void;

  // User Profile
  userInfo: UserInfo | null;
  setUserInfo: (userInfo: UserInfo | null) => void;
  loadUserProfile: () => Promise<void>;

  // ThsAccount actions
  setThsAccounts: (accounts: ThsAccount[]) => void;
  setCurrentThsAccount: (account: ThsAccount | null) => void;
  switchToAccount: (thsAccount: string) => void;
  loadThsAccounts: (switchToAccountId?: string) => Promise<void>;
  hasAnyLoggedInAccount: () => boolean;
  getAccountByName: (thsAccountName: string) => ThsAccount | null;

  // 登录方式配置actions
  setThsLoginMethods: (methods: string[]) => void;

  // 系统配置加载（从后端获取，所有用户共享）
  loadSystemConfig: () => Promise<void>;

  // 同花顺登录弹窗控制
  thsLoginModalOpen: boolean;
  setThsLoginModalOpen: (open: boolean) => void;

  // 图表联动 actions
  setChartSyncEnabled: (enabled: boolean) => void;
  setGlobalDataZoom: (state: ChartSyncState) => void;
  setGlobalCrosshairPosition: (state: CrosshairSyncState | null) => void;

  // 交易日历 actions
  setTradingDays: (days: string[]) => void;
  loadTradingDays: () => Promise<void>;
  getLatestTradingDate: () => string | null;

  // Grid layout actions
  updateGridLayout: (layout: GridItem[]) => void;
  resetGridLayout: () => void;

  // Utility actions
  clearAll: () => void;
  refreshData: () => void;
}

// 默认工具栏状态
const defaultToolbarState: ToolbarState = {
  period: 'daily',
  gridSize: 'medium',
  autoRefresh: false,
  refreshInterval: 30000, // 30秒
  selectedStocks: [],
};

// 默认应用状态
const defaultAppState: AppState = {
  toolbar: defaultToolbarState,
  stocks: [],
  gridItems: [],
  loading: false,
  error: undefined,
  crosshairMode: 1, // 默认自由十字线模式（与移动端设置面板保持一致）
  indicatorSource: 'frontend',

  dashboardTheme: 'dark',
  mobileTheme: 'dark',
  mobileLayout: 'grid',
  thsUsername: '', // 真实用户名，未登录为空
  dashboardLayout: 'normal' as 'normal' | 'compact', // 桌面端布局：normal=正常，compact=紧凑
  userInfo: null,
};

// 扩展默认状态（包含ThsAccount相关状态）
const extendedDefaultState = {
  ...defaultAppState,
  thsAccounts: [] as ThsAccount[],
  currentThsAccount: null as ThsAccount | null,
  thsLoginMethods: ['qr', 'sms', 'cookie'] as string[], // 默认登录方式
  thsLoginModalOpen: false, // 同花顺登录弹窗状态
  // 图表联动状态
  chartSyncEnabled: false, // 默认关闭联动
  globalDataZoom: null as ChartSyncState | null,
  globalCrosshairPosition: null as CrosshairSyncState | null,
  // 全局交易日历
  tradingDays: [] as string[],
  tradingDaysLoading: false,
  // 指标线显示设置（默认全部显示）
  indicatorLineSettings: {
    expma: [5, 10, 20, 60, 250],
    ma: [5, 10, 20, 60, 250],
    boll: ['upper', 'mid', 'lower'],
    kdj: ['k', 'd', 'j'],
    macd: ['dif', 'dea', 'macd'],
    dmi: ['pdi', 'mdi', 'adx', 'adxr'],
  } as IndicatorLineSettings,
};

// 创建store
export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...extendedDefaultState,

        // Toolbar actions
        setPeriod: (period) =>
          set(
            (state) => ({
              toolbar: { ...state.toolbar, period },
            }),
            false,
            'setPeriod'
          ),

        setGridSize: (gridSize) =>
          set(
            (state) => ({
              toolbar: { ...state.toolbar, gridSize },
            }),
            false,
            'setGridSize'
          ),

        setAutoRefresh: (autoRefresh) =>
          set(
            (state) => ({
              toolbar: { ...state.toolbar, autoRefresh },
            }),
            false,
            'setAutoRefresh'
          ),

        setRefreshInterval: (refreshInterval) =>
          set(
            (state) => ({
              toolbar: { ...state.toolbar, refreshInterval },
            }),
            false,
            'setRefreshInterval'
          ),

        setSelectedStocks: (selectedStocks) =>
          set(
            (state) => ({
              toolbar: { ...state.toolbar, selectedStocks },
            }),
            false,
            'setSelectedStocks'
          ),

        addSelectedStock: (stock) =>
          set(
            (state) => ({
              toolbar: {
                ...state.toolbar,
                selectedStocks: [...state.toolbar.selectedStocks, stock],
              },
            }),
            false,
            'addSelectedStock'
          ),

        removeSelectedStock: (stock) =>
          set(
            (state) => ({
              toolbar: {
                ...state.toolbar,
                selectedStocks: state.toolbar.selectedStocks.filter(s => s !== stock),
              },
            }),
            false,
            'removeSelectedStock'
          ),

        // Data actions
        setStocks: (stocks) =>
          set({ stocks }, false, 'setStocks'),

        setGridItems: (gridItems) =>
          set({ gridItems }, false, 'setGridItems'),

        updateGridItem: (ts_code, updates) =>
          set(
            (state) => ({
              gridItems: state.gridItems.map(item =>
                item.ts_code === ts_code ? { ...item, ...updates } : item
              ),
            }),
            false,
            'updateGridItem'
          ),

        addGridItem: (item) =>
          set(
            (state) => ({
              gridItems: [...state.gridItems, item],
            }),
            false,
            'addGridItem'
          ),

        removeGridItem: (ts_code) =>
          set(
            (state) => ({
              gridItems: state.gridItems.filter(item => item.ts_code !== ts_code),
            }),
            false,
            'removeGridItem'
          ),

        // UI state actions
        setLoading: (loading) =>
          set({ loading }, false, 'setLoading'),

        setError: (error) =>
          set({ error }, false, 'setError'),

        // 全局十字线模式
        setCrosshairMode: (crosshairMode) =>
          set({ crosshairMode }, false, 'setCrosshairMode'),

        switchCrosshairMode: () =>
          set(
            (state) => ({
              crosshairMode: ((state.crosshairMode + 1) % 4) as 0 | 1 | 2 | 3,
            }),
            false,
            'switchCrosshairMode'
          ),

        setIndicatorSource: (indicatorSource) =>
          set({ indicatorSource }, false, 'setIndicatorSource'),

        setIndicatorLineSettings: (settings) =>
          set(
            (state) => ({
              indicatorLineSettings: { ...state.indicatorLineSettings, ...settings },
            }),
            false,
            'setIndicatorLineSettings'
          ),

        setDashboardTheme: (dashboardTheme) =>
          set({ dashboardTheme }, false, 'setDashboardTheme'),

        setMobileTheme: (mobileTheme) =>
          set({ mobileTheme }, false, 'setMobileTheme'),

        setMobileLayout: (mobileLayout) =>
          set({ mobileLayout }, false, 'setMobileLayout'),

        setDashboardLayout: (dashboardLayout) =>
          set({ dashboardLayout }, false, 'setDashboardLayout'),

        setThsUsername: (thsUsername) =>
          set({ thsUsername }, false, 'setThsUsername'),

        // User Profile actions
        setUserInfo: (userInfo) =>
          set({ userInfo }, false, 'setUserInfo'),

        loadUserProfile: async () => {
          try {
            const response = await authFetch('/api/user/profile');
            const data = await response.json();
            if (data.success) {
              set({ userInfo: data.data }, false, 'loadUserProfile');
            }
          } catch (error) {
            console.error('获取用户信息失败:', error);
          }
        },

        // 图表联动 actions
        setChartSyncEnabled: (chartSyncEnabled) =>
          set({ chartSyncEnabled }, false, 'setChartSyncEnabled'),

        setGlobalDataZoom: (globalDataZoom) =>
          set({ globalDataZoom }, false, 'setGlobalDataZoom'),

        setGlobalCrosshairPosition: (globalCrosshairPosition) =>
          set({ globalCrosshairPosition }, false, 'setGlobalCrosshairPosition'),

        // Grid layout actions
        updateGridLayout: (layout) =>
          set(
            (state) => ({
              gridItems: state.gridItems.map(item => {
                const layoutItem = layout.find(l => l.i === item.i);
                return layoutItem ? { ...item, ...layoutItem } : item;
              }),
            }),
            false,
            'updateGridLayout'
          ),

        resetGridLayout: () =>
          set(
            (state) => {
              const { gridSize } = state.toolbar;
              const itemsPerRow = gridSize === 'small' ? 6 : gridSize === 'medium' ? 4 : 3;
              const itemWidth = 12 / itemsPerRow;
              const itemHeight = gridSize === 'small' ? 3 : gridSize === 'medium' ? 4 : 5;

              const resetItems = state.gridItems.map((item, index) => ({
                ...item,
                x: (index % itemsPerRow) * itemWidth,
                y: Math.floor(index / itemsPerRow) * itemHeight,
                w: itemWidth,
                h: itemHeight,
              }));

              return { gridItems: resetItems };
            },
            false,
            'resetGridLayout'
          ),

        // ThsAccount actions
        setThsAccounts: (thsAccounts) =>
          set({ thsAccounts }, false, 'setThsAccounts'),

        setCurrentThsAccount: (currentThsAccount) =>
          set({ currentThsAccount }, false, 'setCurrentThsAccount'),

        switchToAccount: (thsAccount) => {
          const { thsAccounts } = get();
          const account = thsAccounts.find(acc => acc.ths_account === thsAccount);
          if (account) {
            set({ currentThsAccount: account }, false, 'switchToAccount');
            // 触发数据重新加载（这里可以添加事件通知）
            window.dispatchEvent(new CustomEvent('thsAccountChanged', { detail: account }));
          }
        },

        // 检查是否有任何账号已登录
        hasAnyLoggedInAccount: () => {
          const { thsAccounts } = get();
          return thsAccounts.some(acc => acc.is_online);
        },

        // 根据账号名获取特定账号
        getAccountByName: (thsAccountName: string) => {
          const { thsAccounts } = get();
          return thsAccounts.find(acc => acc.ths_account === thsAccountName) || null;
        },

        loadThsAccounts: async (switchToAccountId?: string) => {
          try {
            const response = await authFetch('/api/user/ths-accounts');
            const data = await response.json();

            if (data.success && data.data) {
              const accounts = data.data.map((account: any) => ({
                ths_account: account.ths_account,
                nickname: account.nickname || null,
                mobile: account.mobile || null,
                last_login_at: account.last_login_at || null,
                is_active: account.is_active || false,
                is_online: account.is_online || false,
              })) as ThsAccount[];

              set({ thsAccounts: accounts }, false, 'loadThsAccounts');

              // 如果指定了要切换的账号，直接切换到该账号（登录成功后使用）
              if (switchToAccountId) {
                const targetAccount = accounts.find(acc => acc.ths_account === switchToAccountId);
                if (targetAccount) {
                  set({ currentThsAccount: targetAccount }, false, 'loadThsAccounts-switchToAccount');
                }
              } else {
                // 初始化/修正当前账号（如果当前账号不存在于最新列表中）
                const { currentThsAccount } = get();
                if (currentThsAccount && !accounts.find(acc => acc.ths_account === currentThsAccount.ths_account)) {
                  const firstOnlineAccount = accounts.find(acc => acc.is_online && acc.is_active);
                  set({ currentThsAccount: firstOnlineAccount || null }, false, 'loadThsAccounts-correctCurrentAccount');
                }

                // 如果之前没有当前账号，设置第一个在线账号
                if (!currentThsAccount && accounts.length > 0) {
                  const firstOnlineAccount = accounts.find(acc => acc.is_online && acc.is_active);
                  if (firstOnlineAccount) {
                    set({ currentThsAccount: firstOnlineAccount }, false, 'loadThsAccounts-setCurrentAccount');
                  }
                }
              }

              // 账号加载成功后，触发自选分组数据加载（通过事件机制）
              const hasOnlineAccount = accounts.some(acc => acc.is_online && acc.is_active);
              if (hasOnlineAccount) {
                // 触发自选数据预加载事件
                window.dispatchEvent(new CustomEvent('thsAccountsLoaded'));
              }
            }
          } catch (error) {
            console.error('加载同花顺账号失败:', error);
          }
        },

        // 登录方式配置actions
        setThsLoginMethods: (methods: string[]) =>
          set({ thsLoginMethods: methods }, false, 'setThsLoginMethods'),

        // 加载系统配置（从后端获取，所有用户共享）
        loadSystemConfig: async () => {
          // 如果没有token，跳过配置加载（避免在relogin等公开页面报错）
          const token = localStorage.getItem('token');
          if (!token) {
            return;
          }

          try {
            const response = await authFetch('/api/user/config');
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data) {
                const updates: Partial<AppStore> = {};

                // 1. 指标数据源（系统配置）
                if (data.data.indicator_source) {
                  const source = data.data.indicator_source;
                  if (source === 'frontend' || source === 'db') {
                    updates.indicatorSource = source;
                  }
                }

                // 2. 登录方式配置（系统配置）
                if (data.data.login_methods) {
                  const config = data.data.login_methods;
                  const methods: string[] = [];
                  if (config.sms) methods.push('sms');
                  if (config.qr) methods.push('qr');
                  if (config.password) methods.push('password');
                  if (config.cookie) methods.push('cookie');
                  updates.thsLoginMethods = methods;
                }

                if (Object.keys(updates).length > 0) {
                  set(updates as any, false, 'loadSystemConfig');
                }
              }
            }
          } catch (error) {
            console.error('加载系统配置失败:', error);
            // 失败时保持默认配置
          }
        },

        // 同花顺登录弹窗控制
        setThsLoginModalOpen: (open: boolean) =>
          set({ thsLoginModalOpen: open }, false, 'setThsLoginModalOpen'),

        // 交易日历 actions
        setTradingDays: (days: string[]) =>
          set({ tradingDays: days }, false, 'setTradingDays'),

        loadTradingDays: async () => {
          const state = get();
          // 如果已加载或正在加载，跳过
          if (state.tradingDays.length > 0 || state.tradingDaysLoading) return;

          set({ tradingDaysLoading: true }, false, 'loadTradingDays/start');
          try {
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 5);

            const formatDate = (d: Date) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            };

            const response = await authFetch(
              `/api/trade-calendar/trading-days?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`
            );
            const result = await response.json();

            if (result.success && result.data?.trading_days) {
              // 只保留开市的交易日，提取日期字符串
              const openDays = result.data.trading_days
                .filter((d: any) => d.is_open)
                .map((d: any) => d.trade_date);
              set({ tradingDays: openDays, tradingDaysLoading: false }, false, 'loadTradingDays/success');
            } else {
              set({ tradingDaysLoading: false }, false, 'loadTradingDays/empty');
            }
          } catch (error) {
            console.error('加载交易日历失败:', error);
            set({ tradingDaysLoading: false }, false, 'loadTradingDays/error');
          }
        },

        getLatestTradingDate: () => {
          const { tradingDays } = get();
          if (tradingDays.length === 0) return null;

          const today = new Date();
          const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());

          // 找到最近的交易日（今天或之前）
          for (let i = tradingDays.length - 1; i >= 0; i--) {
            const dateStr = tradingDays[i];
            const [y, m, d] = dateStr.split('-').map(Number);
            const tradingDate = new Date(y, m - 1, d);

            if (tradingDate <= now) {
              return dateStr.replace(/-/g, ''); // 返回YYYYMMDD格式
            }
          }
          return null;
        },

        // Utility actions
        clearAll: () =>
          set(defaultAppState, false, 'clearAll'),

        refreshData: () => {
          // 这里可以触发数据刷新逻辑
        },
      }),
      {
        name: 'app-store',
        // 只持久化 crosshairMode
        // 只持久化用户个人配置，系统配置从后端加载
        partialize: (state) => ({
          crosshairMode: state.crosshairMode,
          dashboardTheme: state.dashboardTheme,
          mobileTheme: state.mobileTheme,
          mobileLayout: state.mobileLayout,
          thsUsername: state.thsUsername,
          dashboardLayout: state.dashboardLayout,
        }),
      }
    ),
    {
      name: 'app-store',
    }
  )
);

// 选择器函数
export const useToolbar = () => useAppStore(state => state.toolbar);
export const useStocks = () => useAppStore(state => state.stocks);
export const useGridItems = () => useAppStore(state => state.gridItems);
export const useLoading = () => useAppStore(state => state.loading);
export const useError = () => useAppStore(state => state.error);

// 工具函数
export const getGridSizeConfig = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return { itemsPerRow: 6, itemHeight: 3, minItemWidth: 2, minItemHeight: 2 };
    case 'medium':
      return { itemsPerRow: 4, itemHeight: 4, minItemWidth: 3, minItemHeight: 3 };
    case 'large':
      return { itemsPerRow: 3, itemHeight: 5, minItemWidth: 4, minItemHeight: 4 };
    default:
      return { itemsPerRow: 4, itemHeight: 4, minItemWidth: 3, minItemHeight: 3 };
  }
};
