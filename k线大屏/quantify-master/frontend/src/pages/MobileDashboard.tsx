import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import authFetch from '../utils/authFetch.ts';
import { useMobileDetection } from '../hooks/useMobileDetection.ts';
import { addThsAccountHeaders, onThsAccountChanged } from '../utils/thsAccountUtils.ts';
import '../styles/mobile-simple.css';
import { getThsUsername } from '../utils/userKey.ts';
import { MobileToolbar, MobileListSection } from '../components/mobile/list/index.ts';
import DetailSection from '../components/mobile/detail/DetailSection.tsx';
import {
  FilterDrawerSection,
  SortDrawerSection,
  SettingsDrawer,
  DataTypeDrawer,
  StrategyDrawer,
  PeriodDrawer,
  IndicatorDrawer,
  TimeRangeDrawer,
  TradeDateDrawer,
  FavoriteGroupDrawer,
  THSCookieDrawer,
  UserDrawer,
} from '../components/mobile/drawers/index.ts';
import MobileThsLoginDrawer from '../components/mobile/drawers/MobileThsLoginDrawer.tsx';
import UserEditDrawer from '../components/mobile/drawers/UserEditDrawer.tsx';
import FavoriteAddDrawer from '../components/mobile/drawers/FavoriteAddDrawer.tsx';
import MobilePushDrawer from '../components/mobile/drawers/MobilePushDrawer.tsx';
import { useThsPush } from '../hooks/useThsPush.ts';
import { type IndicatorType, type DataType, type Period, type Layout as LayoutType } from '../components/mobile/constants.ts';
import {
  getThemeColors,
  getBackgroundGradient,
  type Theme
} from '../components/mobile/theme.ts';
import { sortFieldMap } from '../components/mobile/utils.ts';
import { ConfigProvider, Layout, message, theme as antdTheme } from 'antd';
import { convertDateForPeriod } from '../utils/dateUtils.ts';

import useDetailPanelState from '../hooks/useDetailPanelState.ts';
import useMiniKlinesCache from '../hooks/useMiniKlinesCache.ts';
import usePerCodeConfig from '../hooks/usePerCodeConfig.ts';
import { useAppStore } from '../stores/useAppStore.ts';
import useBodyScrollLock from '../hooks/useBodyScrollLock.ts';
import { useMobileMessageOverride } from '../hooks/useMobileMessageOverride.tsx';
import StatsModal from '../components/mobile/StatsModal.tsx';

// 懒加载大型组件
const StrategyConfigModal = lazy(() => import('../components/StrategyConfigModal.tsx'));

interface MobileDashboardProps {
  theme: Theme;
  onThemeChange: (theme: string) => void;
}

const MobileDashboard: React.FC<MobileDashboardProps> = ({ theme, onThemeChange }) => {
  const [dataType, setDataType] = useState<DataType>('stock');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true); // 初始为true，避免短暂显示空状态
  const [stockData, setStockData] = useState<any[]>([]);
  const [total, setTotal] = useState(0); // 总数据量
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 下拉刷新触发器
  const thsUsername = getThsUsername();

  const layout = useAppStore(state => state.mobileLayout) as LayoutType;
  const setLayout = useAppStore(state => state.setMobileLayout);
  const hasAnyLoggedInAccount = useAppStore(state => state.hasAnyLoggedInAccount);
  const loadThsAccounts = useAppStore(state => state.loadThsAccounts);
  const loadTradingDays = useAppStore(state => state.loadTradingDays);
  const getLatestTradingDate = useAppStore(state => state.getLatestTradingDate);

  // 🚀 对齐桌面端：后端状态和初始化控制
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const initializationDoneRef = useRef(false);

  // 根据布局动态调整每页数量：grid紧凑可以多显示，large大卡片需要少显示
  const pageSize = useMemo(() => layout === 'grid' ? 40 : 30, [layout]);
  const [period, setPeriod] = useState<Period>('daily');
  const [timeRange, setTimeRange] = useState<number | string>(30); // 默认30天（移动端列表页）
  const [indicator, setIndicator] = useState<IndicatorType>('none');
  // 全局主图叠加指标（MA/EXPMA/BOLL/SAR/TD，可多选）
  const [mainOverlays, setMainOverlays] = useState<Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>>([]);
  const [strategy, setStrategy] = useState<string>(''); // 策略选择
  const [strategyParams, setStrategyParams] = useState<any>(null); // 策略参数
  // 活动历史筛选：存储当前应用的历史结果筛选，独立于日期
  const [activeHistoryFilter, setActiveHistoryFilter] = useState<{
    ts_codes: string[];
    targetDate: string;
  } | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [strategyVisible, setStrategyVisible] = useState(false);
  const [strategyConfigVisible, setStrategyConfigVisible] = useState(false);
  const [timeRangeDrawerVisible, setTimeRangeDrawerVisible] = useState(false);
  const [sortBy, setSortBy] = useState<'hot_score' | 'pct_chg' | 'intraperiod_pct_chg' | 'volatility' | 'call_countdown' | 'issue_date' | 'list_date' | 'price' | 'change_val' | 'amount' | 'turnover' | 'amplitude' | 'market_cap' | 'volume' | 'auction_vol' | 'auction_amount' | 'auction_turnover_rate' | 'auction_volume_ratio' | 'auction_pct_chg' | 'name' | 'bond_short_name' | 'concept_name' | 'industry_name' | 'vol' | 'total_mv' | 'turnover_rate'>('hot_score');

  // 🔧 基准日期：用户通过日历选择的原始日期（不随周期切换而变化）
  const [baseTradeDate, setBaseTradeDate] = useState<string>('');
  // 显示/请求日期：根据当前周期从 baseTradeDate 计算得出
  const [tradeDate, setTradeDate] = useState<string>('');
  const [displayTradeDate, setDisplayTradeDate] = useState<string>('');
  // 标记用户是否手动选择过日期（手动选择后才在请求中携带 trade_date）
  const userChangedTradeDateRef = useRef<boolean>(false);
  // 自选分组（与桌面端对齐）
  const [favorites, setFavorites] = useState<Record<string, { stocks: string[]; convertible_bonds: string[]; concepts: string[]; industries: string[] }>>({});
  const [currentFavoriteGroup, setCurrentFavoriteGroup] = useState<string>('');
  const favoritesInflightRef = useRef<boolean>(false);
  const favoritesResolveInflightRef = useRef<Promise<any> | null>(null);
  const lastFavoritesSignatureRef = useRef<string | null>(null);
  const [tradeDateDrawerVisible, setTradeDateDrawerVisible] = useState(false); // 交易日期选择Drawer
  const [favoriteGroupDrawerVisible, setFavoriteGroupDrawerVisible] = useState(false); // 自选分组选择Drawer
  const [favoriteGroupNames, setFavoriteGroupNames] = useState<string[]>([]);
  const [thsCookieDrawerVisible, setThsCookieDrawerVisible] = useState(false); // 同花顺Cookie配置
  const [favoriteAddDrawerVisible, setFavoriteAddDrawerVisible] = useState(false); // 添加到自选分组Drawer
  const [pushDrawerVisible, setPushDrawerVisible] = useState(false); // 推送到同花顺Drawer
  const [sortCategory, setSortCategory] = useState<'main' | 'auction'>('main'); // 排序分类：主菜单或集合竞价子菜单
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 统计相关状态
  const [statsVisible, setStatsVisible] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // 用户抽屉状态
  const [userDrawerVisible, setUserDrawerVisible] = useState(false);
  const [thsLoginDrawerVisible, setThsLoginDrawerVisible] = useState(false);
  const [userEditDrawerVisible, setUserEditDrawerVisible] = useState(false);
  const [cachedUserInfo, setCachedUserInfo] = useState<any>(null); // 🚀 缓存用户信息，避免重复API调用
  const [userRefreshTrigger, setUserRefreshTrigger] = useState(0); // 🚀 触发UserDrawer刷新用户信息
  const [statsData, setStatsData] = useState<any>(null);
  const { miniKlines, setMiniKlines, clearOldCache } = useMiniKlinesCache();

  // 🚀 推送到同花顺逻辑
  const { pushLoading, batchPushToThsGroup } = useThsPush(() => loadFavorites());

  // 移除无限滚动相关的refs
  const {
    detailVisible,
    selectedStock,
    detailCurrentTsCode,
    detailCurrentName,
    detailDataType,
    isShowingUnderlying,
    isShowingBond,
    originalSelectedStock,
    currentKlineData,
    setDetailVisible,
    setSelectedStock,
    setDetailCurrentTsCode,
    setDetailCurrentName,
    setDetailDataType,
    setIsShowingUnderlying,
    setIsShowingBond,
    setCurrentKlineData,
    handleCardClick,
    handleKlineDataUpdate,
  } = useDetailPanelState(dataType);
  const [tagsModalVisible, setTagsModalVisible] = useState(false);
  const [callRecordsModalVisible, setCallRecordsModalVisible] = useState(false);
  const [hotInfoModalVisible, setHotInfoModalVisible] = useState(false);
  const [hotInfoStock, setHotInfoStock] = useState<any>(null); // 列表页点击火苗时的股票数据
  // 详情页专用的Drawer状态
  const [detailPeriodDrawerVisible, setDetailPeriodDrawerVisible] = useState(false);
  const [detailIndicatorDrawerVisible, setDetailIndicatorDrawerVisible] = useState(false);
  const [detailTimeRangeDrawerVisible, setDetailTimeRangeDrawerVisible] = useState(false);

  // 详情页内部状态管理（与网页端保持一致）
  // 每个code独立的周期、范围、指标和主图叠加指标状态 - 核心状态管理
  const {
    cardPeriods,
    cardTimeRanges,
    setCardPeriods,
    setCardTimeRanges,
    setCardIndicators,
    setCardMainOverlays,
    getPeriodForCode,
    getTimeRangeForCode,
    getIndicatorForCode,
    getMainOverlaysForCode,
    setPeriodForCode,
    setTimeRangeForCode,
    setIndicatorForCode,
    setMainOverlaysForCode,
  } = usePerCodeConfig(period, timeRange, indicator, mainOverlays);

  // 十字线模式状态管理（移动端专用）
  const [globalIsSnapMode, setGlobalIsSnapMode] = useState(false);

  // 从全局 store 读取十字线模式，并同步到本地状态
  const globalCrosshairMode = useAppStore((state) => state.crosshairMode);
  const [localCrosshairMode, setLocalCrosshairMode] = useState<1 | 2 | 3>(
    (globalCrosshairMode === 0 ? 1 : globalCrosshairMode) as 1 | 2 | 3
  );

  // 当全局 store 变化时，同步更新本地状态
  useEffect(() => {
    if (globalCrosshairMode !== 0) {
      setLocalCrosshairMode(globalCrosshairMode as 1 | 2 | 3);
    }
  }, [globalCrosshairMode]);

  // 全局指标变化时，重置所有卡片的个别指标设置
  // 全局周期变化时，清空所有个别设置，实现全局覆盖效果
  useEffect(() => {
    setCardPeriods({});
  }, [period, setCardPeriods]);

  // 全局范围变化时，清空所有个别设置，实现全局覆盖效果
  useEffect(() => {
    setCardTimeRanges({});
  }, [timeRange, setCardTimeRanges]);

  // 全局指标变化时，清空所有个别设置，实现全局覆盖效果
  useEffect(() => {
    // 通过设置面板等方式改变全局指标时，清空所有个别设置
    // 这样所有卡片和详情页都会回到显示全局指标的状态
    setCardIndicators({});
  }, [indicator, setCardIndicators]);

  // 全局主图叠加指标变化时，清空所有个别设置
  useEffect(() => {
    setCardMainOverlays({});
  }, [mainOverlays, setCardMainOverlays]);

  // 🎯 指标系统核心逻辑说明：
  // 1. 每个卡片(code)都有独立的指标状态存储在 cardIndicators 和 cardMainOverlays 中
  // 2. getIndicatorForCode() 获取指定code的副图指标：优先个别设置，否则使用全局指标
  // 3. getMainOverlaysForCode() 获取指定code的主图叠加指标：优先个别设置，否则使用全局设置
  // 4. 全局指标变化时，清空所有个别设置，实现全局覆盖效果

  // 十字线数据跟随状态
  const [cardKlineData, setCardKlineData] = useState<Record<string, any>>({});

  // 处理卡片K线数据更新
  const handleCardKlineDataUpdate = useCallback((tsCode: string) => (latestData: any) => {
    if (latestData) {
      // 更新十字线跟随数据
      setCardKlineData(prev => ({
        ...prev,
        [tsCode]: latestData
      }));

      // 同时更新miniKlines缓存，确保header显示最新数据
      setMiniKlines(prev => {
        const currentData = prev[tsCode] || [];
        // 如果缓存为空或最新数据不同，则更新
        if (currentData.length === 0 ||
          currentData[currentData.length - 1]?.trade_date !== latestData.trade_date) {
          return {
            ...prev,
            [tsCode]: [...currentData.filter(d => d.trade_date !== latestData.trade_date), latestData]
          };
        }
        return prev;
      });
    }
  }, [setMiniKlines]);

  // 行业和概念筛选
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'industry' | 'concept' | null>(null); // 当前筛选分类
  const [availableIndustries, setAvailableIndustries] = useState<any[]>([]);
  const [availableConcepts, setAvailableConcepts] = useState<any[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);

  // 排序、周期、指标、范围选择Drawer
  const [sortDrawerVisible, setSortDrawerVisible] = useState(false);
  const [periodDrawerVisible, setPeriodDrawerVisible] = useState(false);
  const [indicatorDrawerVisible, setIndicatorDrawerVisible] = useState(false);
  const [dataTypeDrawerVisible, setDataTypeDrawerVisible] = useState(false); // 类型选择Drawer

  const { isMobile } = useMobileDetection();
  const { MobileToastHost } = useMobileMessageOverride(isMobile);

  const closeDetail = useCallback(() => {
    // 关闭详情时通知对应代码的列表卡片刷新画线
    if (detailCurrentTsCode) {
      window.dispatchEvent(new CustomEvent('refreshDrawings', {
        detail: { ts_code: detailCurrentTsCode }
      }));
    }

    setDetailVisible(false);
    setSelectedStock(null);
    setCurrentKlineData(null);
  }, [detailCurrentTsCode, setDetailVisible, setSelectedStock, setCurrentKlineData]);

  // Drawer关闭处理器
  const handleDrawerClose = useCallback(() => {
    // 如果已经关闭，不要重复执行
    if (!detailVisible && !selectedStock) {
      return;
    }

    closeDetail();
  }, [selectedStock, detailVisible, closeDetail]);

  // 详情页关闭处理器（保留防抖和事件处理）
  const lastCloseTimeRef = useRef<number>(0);

  const handleDetailClose = useCallback((event?: React.MouseEvent | React.KeyboardEvent | React.TouchEvent) => {
    const now = Date.now();

    // 防抖：500ms内只允许调用一次
    if (now - lastCloseTimeRef.current < 500) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    lastCloseTimeRef.current = now;

    // 阻止事件默认行为和传播
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    closeDetail();
  }, [closeDetail]);

  // 加载同花顺自选分组（仅在自选tab使用）
  const loadFavorites = useCallback(() => {
    if (favoritesInflightRef.current) return;
    favoritesInflightRef.current = true;
    (async () => {
      try {
        const resp = await authFetch('/api/favorites/ths/groups', {
          headers: addThsAccountHeaders({
            'Content-Type': 'application/json',
            'X-THS-User-Key': thsUsername,
          }),
        });
        if (!resp.ok) throw new Error('获取同花顺自选分组失败');
        const result = await resp.json();
        if (result && result.success === false) {
          throw new Error(result.message || '获取同花顺自选分组失败');
        }
        const groups = (result?.data || []) as any[];
        const base: Record<string, { stocks: string[]; convertible_bonds: string[]; concepts: string[]; industries: string[] }> = {};
        const groupNames: string[] = [];
        (groups || []).forEach((g: any) => {
          const name = g.group_name || g.name;
          if (!name) return;
          groupNames.push(name);
          base[name] = { stocks: [], convertible_bonds: [], concepts: [], industries: [] };
        });
        setFavorites(base);
        setFavoriteGroupNames(groupNames);
        if (groupNames.length > 0) {
          setCurrentFavoriteGroup(prev => (prev && base[prev] ? prev : groupNames[0]));
        }
      } catch (e: any) {
        console.error('Failed to load THS favorite groups', e);
        message.error(e?.message || '获取同花顺自选分组失败');
        setFavorites({});
        setCurrentFavoriteGroup('');
        setFavoriteGroupNames([]);
      } finally {
        favoritesInflightRef.current = false;
      }
    })();
  }, [thsUsername]);

  // 🚀 创建自选分组
  const createFavoriteGroup = useCallback((groupName: string) => {
    if (!groupName || !groupName.trim()) {
      message.error('分组名称不能为空');
      return;
    }
    authFetch('/api/favorites/ths/groups', {
      method: 'POST',
      headers: addThsAccountHeaders({
        'X-THS-User-Key': thsUsername,
      }),
      body: JSON.stringify({ group_name: groupName.trim() }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('创建同花顺分组失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '创建同花顺分组失败');
        }
        loadFavorites();
      })
      .catch((error) => {
        console.error('Failed to create THS favorite group', error);
        message.error(error?.message || '创建同花顺分组失败');
      });
  }, [thsUsername, loadFavorites]);

  // 🚀 删除自选分组（返回Promise支持异步等待）
  const deleteFavoriteGroup = useCallback(async (groupName: string): Promise<void> => {
    if (!groupName) {
      message.error('请选择要删除的分组');
      return;
    }
    try {
      const resp = await authFetch(`/api/favorites/ths/groups/${encodeURIComponent(groupName)}`, {
        method: 'DELETE',
        headers: addThsAccountHeaders({
          'X-THS-User-Key': thsUsername,
        }),
      });
      if (!resp.ok) throw new Error('删除同花顺分组失败');
      const resJson = await resp.json();
      if (resJson && resJson.success === false) {
        throw new Error(resJson.message || '删除同花顺分组失败');
      }
      loadFavorites();
      if (currentFavoriteGroup === groupName) {
        setCurrentFavoriteGroup('');
      }
    } catch (error: any) {
      console.error('Failed to delete THS favorite group', error);
      message.error(error?.message || '删除同花顺分组失败');
      throw error; // 重新抛出以便调用方知道删除失败
    }
  }, [thsUsername, loadFavorites, currentFavoriteGroup]);

  // 🚀 添加标的到自选分组（乐观更新）
  const addToFavorites = useCallback((itemCode: string, groupName?: string, _itemType?: string) => {
    const targetGroup = groupName || currentFavoriteGroup;
    if (!targetGroup) {
      message.warning('请先选择自选分组');
      return;
    }

    // 乐观更新：立即更新本地状态
    setFavorites(prev => {
      const updated = { ...prev };
      if (updated[targetGroup]) {
        updated[targetGroup] = {
          ...updated[targetGroup],
          stocks: [...updated[targetGroup].stocks, itemCode],
        };
      }
      return updated;
    });

    // 异步调用API
    authFetch(`/api/favorites/ths/groups/${encodeURIComponent(targetGroup)}/items`, {
      method: 'POST',
      headers: addThsAccountHeaders({
        'Content-Type': 'application/json',
        'X-THS-User-Key': thsUsername,
      }),
      body: JSON.stringify({ ts_code: itemCode }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('添加到自选失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '添加到自选失败');
        }
        // 成功时静默处理，不显示提示
      })
      .catch((error) => {
        console.error('Failed to add to favorites', error);
        // 失败时回滚本地状态
        setFavorites(prev => {
          const updated = { ...prev };
          if (updated[targetGroup]) {
            updated[targetGroup] = {
              ...updated[targetGroup],
              stocks: updated[targetGroup].stocks.filter(c => c !== itemCode),
            };
          }
          return updated;
        });
        message.error(error?.message || '添加到自选失败');
      });
  }, [thsUsername, currentFavoriteGroup]);

  // 🚀 从自选分组移除标的（乐观更新）
  const removeFromFavorites = useCallback((itemCode: string, groupName?: string, _itemType?: string) => {
    const targetGroup = groupName || currentFavoriteGroup;
    if (!targetGroup) {
      message.warning('请先选择自选分组');
      return;
    }

    // 乐观更新：立即更新本地状态
    setFavorites(prev => {
      const updated = { ...prev };
      if (updated[targetGroup]) {
        updated[targetGroup] = {
          ...updated[targetGroup],
          stocks: updated[targetGroup].stocks.filter(c => c !== itemCode),
        };
      }
      return updated;
    });

    // 异步调用API
    authFetch(`/api/favorites/ths/groups/${encodeURIComponent(targetGroup)}/items/${encodeURIComponent(itemCode)}`, {
      method: 'DELETE',
      headers: addThsAccountHeaders({
        'X-THS-User-Key': thsUsername,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('从自选移除失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '从自选移除失败');
        }
        // 成功时静默处理，不显示提示
      })
      .catch((error) => {
        console.error('Failed to remove from favorites', error);
        // 失败时回滚本地状态
        setFavorites(prev => {
          const updated = { ...prev };
          if (updated[targetGroup]) {
            updated[targetGroup] = {
              ...updated[targetGroup],
              stocks: [...updated[targetGroup].stocks, itemCode],
            };
          }
          return updated;
        });
        message.error(error?.message || '从自选移除失败');
      });
  }, [thsUsername, currentFavoriteGroup]);

  // 🚀 判断标的是否在指定分组中
  const isInFavorites = useCallback((itemCode: string, groupName: string, _itemType?: string): boolean => {
    const group = favorites[groupName];
    if (!group) return false;
    return group.stocks.includes(itemCode) ||
      group.convertible_bonds.includes(itemCode) ||
      group.concepts.includes(itemCode) ||
      group.industries.includes(itemCode);
  }, [favorites]);

  // 解析自选分组数据并加载列表
  const fetchFavoritesData = useCallback(async (page: number = 1) => {
    if (!currentFavoriteGroup) return;
    const favSignature = JSON.stringify({
      page,
      pageSize,
      tradeDate: tradeDate || '',
      group: currentFavoriteGroup || '',
      search: searchKeyword || '',
      sortBy,
      sortOrder,
    });
    if (favoritesResolveInflightRef.current && lastFavoritesSignatureRef.current === favSignature) {
      await favoritesResolveInflightRef.current;
      return;
    }
    lastFavoritesSignatureRef.current = favSignature;

    setLoading(true);
    try {
      const payload: any = {};
      if (tradeDate) payload.trade_date = tradeDate;
      if (currentFavoriteGroup) payload.group_name = currentFavoriteGroup;

      const p = authFetch('/api/favorites/resolve', {
        method: 'POST',
        headers: addThsAccountHeaders({
          'Content-Type': 'application/json',
          'X-THS-User-Key': thsUsername,
        }),
        body: JSON.stringify(payload),
      });
      favoritesResolveInflightRef.current = p;
      const resp = await p;
      if (!resp.ok) throw new Error('解析同花顺自选分组失败');
      const resolved = await resp.json();
      let items = (resolved?.data || []) as any[];

      // 更新当前分组本地映射（用于收藏状态）
      try {
        const stocks: string[] = [];
        const convertible_bonds: string[] = [];
        const concepts: string[] = [];
        const industries: string[] = [];
        (items || []).forEach((it: any) => {
          const code = it.ts_code || it.concept_code || it.industry_code;
          const t = it.type;
          if (!code) return;
          if (t === 'convertible_bond') {
            if (!convertible_bonds.includes(code)) convertible_bonds.push(code);
          } else if (t === 'concept') {
            if (!concepts.includes(code)) concepts.push(code);
          } else if (t === 'industry') {
            if (!industries.includes(code)) industries.push(code);
          } else {
            if (!stocks.includes(code)) stocks.push(code);
          }
        });
        setFavorites(prev => ({ ...(prev || {}), [currentFavoriteGroup]: { stocks, convertible_bonds, concepts, industries } }));
      } catch (_) { /* noop */ }

      // 搜索过滤
      if (searchKeyword) {
        items = items.filter((item: any) => {
          const name = item.name || item.bond_short_name || item.concept_name || item.industry_name;
          const code = item.ts_code || item.concept_code || item.industry_code;
          return name?.toLowerCase().includes(searchKeyword.toLowerCase()) || code?.toLowerCase().includes(searchKeyword.toLowerCase());
        });
      }

      // 排序
      if (sortBy) {
        items.sort((a: any, b: any) => {
          let aVal: any = a[sortBy];
          let bVal: any = b[sortBy];
          if (typeof aVal === 'string') aVal = parseFloat(aVal) || 0;
          if (typeof bVal === 'string') bVal = parseFloat(bVal) || 0;
          return sortOrder === 'desc' ? (bVal - aVal) : (aVal - bVal);
        });
      }

      // 分页
      const totalCount = items.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedItems = items.slice(startIndex, endIndex);

      // 规范化数据结构
      const normalizedItems = paginatedItems.map((it: any) => {
        const t = it.type;
        if (t === 'concept') {
          return { ...it, ts_code: it.concept_code, name: it.concept_name, type: 'concept', underlying_stock: null, kline: null };
        }
        if (t === 'industry') {
          return { ...it, ts_code: it.industry_code, name: it.industry_name, type: 'industry', underlying_stock: null, kline: null };
        }
        if (t === 'convertible_bond') {
          return { ...it, type: 'convertible_bond', underlying_stock: { ts_code: it.stk_code, name: it.stk_short_name }, name: it.bond_short_name, latest_price: it.latest_price || null, concepts: it.concepts || [], industries: it.industries || [], call_records: it.call_records || [], kline: null };
        }
        return { ...it, type: 'stock', underlying_stock: null, kline: null };
      });

      setStockData(normalizedItems);
      setTotal(totalCount);
    } catch (e: any) {
      setStockData([]);
      setTotal(0);
    } finally {
      setLoading(false);
      favoritesResolveInflightRef.current = null;
    }
  }, [currentFavoriteGroup, pageSize, tradeDate, searchKeyword, sortBy, sortOrder, thsUsername]);


  // 获取行业和概念列表（用于筛选）- 添加热度排序
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [indResponse, conResponse] = await Promise.all([
          authFetch('/api/industries/options?hot_sort=true'),
          authFetch('/api/concepts/options?hot_sort=true')
        ]);
        if (indResponse.ok) {
          const indResult = await indResponse.json();
          setAvailableIndustries(indResult.data || []);
        }
        if (conResponse.ok) {
          const conResult = await conResponse.json();
          setAvailableConcepts(conResult.data || []);
        }
      } catch (error) {
        // Failed to fetch filter options
      }
    };
    fetchOptions();
  }, []);

  // 当Drawer打开时禁用body滚动，防止滚动穿透
  // 注意：Ant Design Drawer 组件自带遮罩层（mask）来处理滚动穿透
  // 使用 useBodyScrollLock 会导致 body position:fixed + top负值，引起页面下滑后点击位置错位
  // 因此，所有 Drawer 都不应该使用 body scroll lock，让 Drawer 的 mask 自己处理滚动穿透
  // 
  // 如果未来需要 body scroll lock，只对那些没有遮罩的特殊场景使用
  const isAnyDrawerOpen = false; // 暂时禁用所有 body scroll lock
  useBodyScrollLock(isAnyDrawerOpen);

  // 打开筛选Drawer时重置分类状态
  useEffect(() => {
    if (filterDrawerVisible) {
      setFilterCategory(null);
    }
  }, [filterDrawerVisible]);


  // 数据类型切换时清理部分缓存
  useEffect(() => {
    clearOldCache();
  }, [dataType, clearOldCache]);

  // 跟踪上一次的交易日期和页码，避免在非第一页切换日期时同时请求当前页和第一页
  const prevTradeDateRef = useRef<string | null>(null);
  const prevPageRef = useRef<number | null>(null);



  // 加载数据（使用后端接口，与桌面端一致的类型）
  useEffect(() => {
    // 等待初始化完成后再加载数据（tradeDate被设置后表示初始化完成），避免重复请求
    if (!tradeDate) return;

    // 检测"日期变化但页码尚未重置"的场景（例如在第 N 页切换日期）
    const prevTradeDate = prevTradeDateRef.current;
    const prevPage = prevPageRef.current;

    const tradeDateChanged = prevTradeDate !== null && prevTradeDate !== tradeDate;
    const pageChanged = prevPage !== null && prevPage !== currentPage;

    prevTradeDateRef.current = tradeDate;
    prevPageRef.current = currentPage;

    if (tradeDateChanged && !pageChanged && currentPage > 1) {
      // 先将页码重置到第1页，等下一轮 effect 再按新日期加载数据，避免当前页和第1页各请求一次
      setCurrentPage(1);
      return;
    }

    let cancelled = false;
    const load = async () => {
      // 自选tab由专用逻辑处理
      if (dataType === 'favorites') return;
      // 分页模式：始终显示loading
      setLoading(true);

      try {
        const endpointMap: Record<string, string> = {
          stock: '/api/stocks',
          concept: '/api/concepts',
          industry: '/api/industries',
          'convertible_bond': '/api/convertible-bonds',
          favorites: '/api/stocks' // 简化：自选先复用股票接口，由服务端按参数解析
        };
        const url = endpointMap[dataType];
        const requestBody: any = {
          page: currentPage,
          page_size: pageSize,
          search: searchKeyword || undefined,
          industries: selectedIndustry ? [selectedIndustry] : undefined,
          concepts: selectedConcept ? [selectedConcept] : undefined,
          // 仅当用户手动选择过日期时才携带 trade_date，否则由后端使用最新交易日
          trade_date: userChangedTradeDateRef.current ? tradeDate : undefined,
        };

        // 自定义代码列表（对比结果/历史结果应用）
        if (strategyParams?.custom_codes && strategyParams.custom_codes.length > 0) {
          requestBody.ts_codes = strategyParams.custom_codes;
        }

        // 为概念和行业类型添加特定的排序逻辑（与网页端保持一致）
        if (dataType === 'concept' || dataType === 'industry') {
          if (sortBy === 'hot_score') {
            requestBody.hot_sort = true;
            requestBody.sort_by = 'hot_score';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'pct_chg') {
            requestBody.sort_by = 'pct_chg';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'intraperiod_pct_chg') {
            requestBody.sort_by = 'intraperiod_pct_chg';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'volatility') {
            requestBody.sort_by = 'volatility';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'list_date') {
            requestBody.sort_by = 'list_date';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'concept_name' && dataType === 'concept') {
            requestBody.sort_by = 'concept_name';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'industry_name' && dataType === 'industry') {
            requestBody.sort_by = 'industry_name';
            requestBody.sort_order = sortOrder;
          } else {
            requestBody.sort_by = sortFieldMap[sortBy as string] || sortBy;
            requestBody.sort_order = sortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'pct_chg', 'volatility', 'intraperiod_pct_chg'].includes(sortBy)) {
              requestBody.sort_period = period;
            } else if (['total_mv', 'turnover_rate'].includes(sortBy)) {
              // 市值和换手率固定使用日线
              requestBody.sort_period = 'daily';
            }
          }
        } else if (dataType === 'stock') {
          // 股票排序逻辑（与网页端保持一致）
          if (sortBy === 'hot_score') {
            requestBody.hot_sort = true;
            requestBody.sort_by = 'hot_score';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'pct_chg') {
            requestBody.sort_by = 'pct_chg';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'intraperiod_pct_chg') {
            requestBody.sort_by = 'intraperiod_pct_chg';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'volatility') {
            requestBody.sort_by = 'volatility';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'list_date') {
            requestBody.sort_by = 'list_date';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'name') {
            requestBody.sort_by = 'name';
            requestBody.sort_order = sortOrder;
          } else if (sortBy.startsWith('auction_')) {
            // 集合竞价字段固定使用日线
            requestBody.sort_by = sortBy;
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = 'daily';
          } else {
            requestBody.sort_by = sortFieldMap[sortBy as string] || sortBy;
            requestBody.sort_order = sortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'pct_chg', 'volatility', 'intraperiod_pct_chg'].includes(sortBy)) {
              requestBody.sort_period = period;
            } else if (['total_mv', 'turnover_rate'].includes(sortBy)) {
              // 市值和换手率固定使用日线
              requestBody.sort_period = 'daily';
            }
          }
        } else if (dataType === 'convertible_bond') {
          // 可转债排序逻辑
          if (sortBy === 'hot_score') {
            requestBody.hot_sort = true;
            requestBody.sort_by = 'hot_score';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'pct_chg') {
            requestBody.sort_by = 'pct_chg';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'intraperiod_pct_chg') {
            requestBody.sort_by = 'intraperiod_pct_chg';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'volatility') {
            requestBody.sort_by = 'volatility';
            requestBody.sort_order = sortOrder;
            requestBody.sort_period = period;
          } else if (sortBy === 'call_countdown') {
            requestBody.sort_by = 'call_countdown';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'issue_date') {
            requestBody.sort_by = 'list_date';
            requestBody.sort_order = sortOrder;
          } else if (sortBy === 'bond_short_name') {
            requestBody.sort_by = 'bond_short_name';
            requestBody.sort_order = sortOrder;
          } else {
            requestBody.sort_by = sortFieldMap[sortBy as string] || sortBy;
            requestBody.sort_order = sortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'pct_chg', 'volatility', 'intraperiod_pct_chg'].includes(sortBy)) {
              requestBody.sort_period = period;
            }
          }
        }

        const response = await authFetch(url, {
          method: dataType === 'stock' ? 'POST' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          // Request failed
          throw new Error(`加载失败: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        const list = Array.isArray(result?.data) ? result.data : (result?.items || []);
        if (cancelled) return;

        // 分页模式：直接替换数据，不追加
        setStockData(list);
        // 设置总数（从API响应中获取）
        const totalCount = result?.total ?? result?.pagination?.total ?? 0;
        setTotal(totalCount);
      } catch (e) {
        // 回退：如果接口不可用，避免白屏
        if (!cancelled) {
          setStockData([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dataType, searchKeyword, currentPage, pageSize, period, sortBy, sortOrder, selectedIndustry, selectedConcept, strategyParams, tradeDate, refreshTrigger]);

  // 监听同花顺账号切换，重新加载自选股数据
  useEffect(() => {
    const cleanupAccountListener = onThsAccountChanged(() => {
      if (dataType === 'favorites') {
        setFavorites({});
        setCurrentFavoriteGroup('');
        loadFavorites();
      }
    });

    return cleanupAccountListener;
  }, [dataType, loadFavorites]);

  // 🚀 对齐桌面端：监听账号加载完成事件，预加载自选分组
  useEffect(() => {
    const handleAccountsLoaded = () => {
      if (!favoritesInflightRef.current) {
        loadFavorites();
      }
    };
    window.addEventListener('thsAccountsLoaded', handleAccountsLoaded);
    return () => {
      window.removeEventListener('thsAccountsLoaded', handleAccountsLoaded);
    };
  }, [loadFavorites]);

  // 自选tab数据加载（与桌面端对齐）：仅在自选tab下请求 /api/favorites/ths/groups 和 /api/favorites/resolve
  useEffect(() => {
    if (dataType !== 'favorites') return;
    if (currentFavoriteGroup) {
      fetchFavoritesData(currentPage);
    } else {
      loadFavorites();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataType, currentFavoriteGroup, currentPage, tradeDate, sortBy, sortOrder, searchKeyword, pageSize]);

  // 获取统计数据
  const fetchStats = useCallback(async () => {
    if (dataType !== 'stock' && dataType !== 'convertible_bond' && dataType !== 'concept' && dataType !== 'industry') {
      return;
    }

    setStatsLoading(true);

    try {
      const requestBody: any = {
        page: 1,
        page_size: pageSize,
        search: searchKeyword || undefined,
        trade_date: tradeDate || undefined,
        sort_period: period,
      };

      if (dataType === 'stock' || dataType === 'convertible_bond') {
        const currentIndustries = selectedIndustry ? [selectedIndustry] : [];
        const currentConcepts = selectedConcept ? [selectedConcept] : [];
        requestBody.industries = currentIndustries.length > 0 ? currentIndustries : undefined;
        requestBody.concepts = currentConcepts.length > 0 ? currentConcepts : undefined;
      }

      // 自定义代码列表（对比结果/历史结果应用）
      if (strategyParams?.custom_codes && strategyParams.custom_codes.length > 0) {
        requestBody.ts_codes = strategyParams.custom_codes;
      }

      let url = '/api/stocks/stats';
      if (dataType === 'convertible_bond') url = '/api/convertible-bonds/stats';
      else if (dataType === 'concept') url = '/api/concepts/stats';
      else if (dataType === 'industry') url = '/api/industries/stats';

      const resp = await authFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        throw new Error('获取统计数据失败');
      }

      const json = await resp.json();
      if (!json || json.success === false || !json.data) {
        throw new Error(json?.message || '获取统计数据失败');
      }

      setStatsData(json.data);
    } catch (err: any) {
      const msg = err?.message || '获取统计数据失败';
      message.error(msg);
    } finally {
      setStatsLoading(false);
    }
  }, [dataType, selectedIndustry, selectedConcept, searchKeyword, tradeDate, pageSize, strategyParams, period]);

  const handleOpenStatsModal = useCallback(() => {
    if (dataType !== 'stock' && dataType !== 'convertible_bond' && dataType !== 'concept' && dataType !== 'industry') {
      return;
    }
    setStatsVisible(true);
    if (!statsData && !statsLoading) {
      fetchStats();
    }
  }, [dataType, statsData, statsLoading, fetchStats]);

  const handleCloseStatsModal = useCallback(() => {
    setStatsVisible(false);
  }, []);

  // 当筛选条件或周期变化时清空统计数据
  useEffect(() => {
    setStatsData(null);
    setStatsVisible(false);
  }, [dataType, selectedIndustry, selectedConcept, searchKeyword, tradeDate, period]);

  // 切换到自选tab时重置分页与列表
  useEffect(() => {
    // 切换数据类型时清除活动历史筛选，避免跨类型携带ts_codes
    setActiveHistoryFilter(null);
    setStrategyParams(null);
    if (dataType === 'favorites') {
      setCurrentPage(1);
      setStockData([]);
      setTotal(0);
    }
  }, [dataType]);

  // 🔧 修复：监听交易日期变化，重置到第1页，并清空当前策略结果（但如果是历史应用触发的则保留）
  useEffect(() => {
    setCurrentPage(1); // 日期变化时重置到第1页
    // 检查是否是历史应用触发的日期变化
    if (activeHistoryFilter && activeHistoryFilter.targetDate === tradeDate) {
      // 历史应用触发，使用活动筛选作为策略参数
      setStrategyParams({ custom_codes: activeHistoryFilter.ts_codes });
    } else {
      // 用户手动改变日期，清除筛选
      setActiveHistoryFilter(null);
      setStrategyParams(null);
    }
    // 同步展示日期
    if (tradeDate) setDisplayTradeDate(tradeDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeDate]);

  // 🔧 周期切换时从 baseTradeDate 重新计算 tradeDate
  // 这样 周→月→周 切换时，日期会变化但能恢复到原来的周
  const prevPeriodRef = useRef<Period>(period);
  useEffect(() => {
    if (prevPeriodRef.current === period || !baseTradeDate) {
      prevPeriodRef.current = period;
      return;
    }
    prevPeriodRef.current = period;

    // 从基准日期计算当前周期的显示日期
    const newDate = convertDateForPeriod(baseTradeDate, period);
    if (newDate) {
      setTradeDate(newDate);
      setDisplayTradeDate(newDate);
    }
  }, [period, baseTradeDate]);

  // 🚀 对齐桌面端：健康检查函数
  const checkBackendStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        mode: 'cors'
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.status === 'healthy') {
          setBackendStatus('online');
          return 'online';
        } else {
          setBackendStatus('offline');
          return 'offline';
        }
      } else {
        setBackendStatus('offline');
        return 'offline';
      }
    } catch (error) {
      setBackendStatus('offline');
      return 'offline';
    }
  }, []);

  // 🚀 对齐桌面端：初始化逻辑（健康检查 + THS账号预加载 + 交易日期）
  useEffect(() => {
    // 防止重复执行初始化
    if (initializationDoneRef.current || baseTradeDate) return;

    let cancelled = false;

    (async () => {
      try {
        initializationDoneRef.current = true;

        // 先检查后端服务状态
        const healthStatus = await checkBackendStatus();

        // 只有在服务健康时才加载其他数据
        if (!cancelled && healthStatus === 'online') {
          await Promise.all([
            // 加载全局交易日历（与桌面端对齐）
            loadTradingDays(),
            // 预加载同花顺账号数据，避免切换自选tab时闪烁
            loadThsAccounts().catch(() => { }),
            // 预加载用户信息
            authFetch('/api/user/profile').then(async resp => {
              const data = await resp.json();
              if (data.success) {
                setCachedUserInfo(data.data);
              }
            }).catch(() => { })
          ]);

          // 从全局日历获取最近开盘日（与桌面端对齐）
          const latestDate = getLatestTradingDate();
          if (!cancelled && latestDate) {
            setBaseTradeDate(latestDate);
            setTradeDate(latestDate);
            setDisplayTradeDate(latestDate);
          }
        }
      } catch (error) {
        console.error('移动端初始化失败:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [baseTradeDate, checkBackendStatus, loadThsAccounts, loadTradingDays, getLatestTradingDate]);

  // 日历选择日期时的处理函数
  const handleDateChange = useCallback((newDate: string) => {
    // 标记用户已手动选择日期
    userChangedTradeDateRef.current = true;
    // 更新基准日期（日历组件已经根据周期转换过了）
    setBaseTradeDate(newDate);
    setTradeDate(newDate);
    setDisplayTradeDate(newDate);
  }, []);

  // 🚀 K线数据由KLineChart组件内部的useKLineData hook自己管理
  // 移除了MobileDashboard中的重复K线预加载逻辑，避免每个ts_code调用4次kline接口

  // 图表resize函数
  const triggerChartResize = useCallback(() => {
    // 移动端优化：不触发全局resize事件
  }, []);

  // 详情页打开时，强制resize图表（解决Drawer动画过程中尺寸计算错误的问题）
  useEffect(() => {
    if (!detailVisible) return;

    // Drawer动画完成后resize图表
    // 使用requestAnimationFrame确保DOM更新后再执行
    const timer = setTimeout(() => {
      triggerChartResize();
    }, 300); // Drawer动画通常需要200-300ms

    return () => clearTimeout(timer);
  }, [detailVisible, triggerChartResize]);

  // 当详情页的周期或范围变化时，也需要resize图表
  useEffect(() => {
    if (!detailVisible || !detailCurrentTsCode) return;

    // 延迟resize，确保图表配置已更新
    const timer = setTimeout(() => {
      triggerChartResize();
    }, 150);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailVisible, detailCurrentTsCode, cardPeriods[detailCurrentTsCode], cardTimeRanges[detailCurrentTsCode], triggerChartResize]);

  // 分页模式不需要IntersectionObserver

  // 使用 useMemo 缓存主题相关计算，避免不必要的重新计算
  const currentTheme = useMemo(() => getThemeColors(theme), [theme]);
  const backgroundGradient = useMemo(() => getBackgroundGradient(theme), [theme]);

  // 移除useCallback，直接使用内联函数确保立即响应

  if (!isMobile) return null;

  // 分页处理函数
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // 页面切换时滚动到顶部（延迟执行确保在渲染后）
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  };

  // 获取内容区域样式
  const getContentStyle = () => ({
    marginTop: '92px', // 48 + 44
    padding: '4px',
    paddingBottom: '20px',
    maxWidth: '100vw',
    overflowX: 'hidden' as const,
    background: backgroundGradient,
    transition: 'none',
  });

  // 🚀 对齐桌面端：服务离线时显示错误界面（健康检查在后台进行，不阻塞UI）
  if (backendStatus === 'offline') {
    return (
      <Layout style={{ minHeight: '100vh', background: currentTheme.bg }}>
        <div style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          padding: '20px',
          color: currentTheme.text,
        }}>
          <div style={{ fontSize: '18px', marginBottom: '16px' }}>服务暂时不可用</div>
          <div style={{ fontSize: '14px', color: currentTheme.textSecondary, marginBottom: '20px', textAlign: 'center' }}>
            请检查网络连接后重试
          </div>
          <button
            onClick={() => {
              setBackendStatus('checking');
              checkBackendStatus();
            }}
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              borderRadius: '8px',
              border: 'none',
              background: '#1890ff',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            重新检查
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <Layout
        style={{
          minHeight: '100vh',
          background: currentTheme.bg,
          color: currentTheme.text,
          overflowX: 'hidden' as const,
          position: 'relative',
          transition: 'none',
        }}
      >
        {/* 头部工具栏 */}
        <MobileToolbar
          theme={theme}
          currentTheme={currentTheme}
          dataType={dataType}
          currentFavoriteGroup={currentFavoriteGroup}
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
          setCurrentPage={setCurrentPage}
          period={period}
          timeRange={timeRange}
          indicator={indicator}
          mainOverlays={mainOverlays}
          sortBy={sortBy}
          sortOrder={sortOrder}
          tradeDate={tradeDate}
          displayTradeDate={displayTradeDate}
          setDataTypeDrawerVisible={setDataTypeDrawerVisible}
          setSortDrawerVisible={setSortDrawerVisible}
          setPeriodDrawerVisible={setPeriodDrawerVisible}
          setTimeRangeDrawerVisible={setTimeRangeDrawerVisible}
          setTradeDateDrawerVisible={setTradeDateDrawerVisible}
          setIndicatorDrawerVisible={setIndicatorDrawerVisible}
          setFilterDrawerVisible={setFilterDrawerVisible}
          selectedIndustry={selectedIndustry}
          selectedConcept={selectedConcept}
          availableIndustries={availableIndustries}
          availableConcepts={availableConcepts}
          setSortCategory={setSortCategory}
          strategy={strategy}
          setStrategyVisible={setStrategyVisible}
          setStrategyConfigVisible={setStrategyConfigVisible}
          onClickStats={handleOpenStatsModal}
          statsLoading={statsLoading}
          onUserAvatarClick={() => setUserDrawerVisible(true)}
          isAdmin={cachedUserInfo?.is_admin === true}
          isSuperAdmin={cachedUserInfo?.is_super_admin === true}
          isUserLoading={cachedUserInfo === null}
          onClickPush={() => setPushDrawerVisible(true)}
          pushLoading={pushLoading}
        />

        {/* 主列表区域 */}
        <MobileListSection
          theme={theme}
          currentTheme={currentTheme}
          dataType={dataType}
          layout={layout}
          loading={loading}
          stockData={stockData}
          contentStyle={getContentStyle()}
          getPeriodForCode={getPeriodForCode}
          getTimeRangeForCode={getTimeRangeForCode}
          getIndicatorForCode={getIndicatorForCode}
          getMainOverlaysForCode={getMainOverlaysForCode}
          handleCardClick={handleCardClick}
          setHotInfoStock={setHotInfoStock}
          setHotInfoModalVisible={setHotInfoModalVisible}
          cardKlineData={cardKlineData}
          miniKlines={miniKlines}
          handleCardKlineDataUpdate={handleCardKlineDataUpdate}
          tradeDate={tradeDate}
          searchKeyword={searchKeyword}
          total={total}
          currentPage={currentPage}
          pageSize={pageSize}
          handlePageChange={handlePageChange}
          onRefresh={async () => {
            // 重置到第一页并触发数据刷新
            setCurrentPage(1);
            if (dataType === 'favorites') {
              loadFavorites();
            }
            // 触发数据重新加载
            setRefreshTrigger(prev => prev + 1);
            // 等待加载完成的视觉反馈
            await new Promise(resolve => setTimeout(resolve, 300));
          }}
        />

        <MobileToastHost />

        {/* 筛选选择 - 行业和概念 */}
        <FilterDrawerSection
          theme={theme}
          currentTheme={currentTheme}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterDrawerVisible={filterDrawerVisible}
          setFilterDrawerVisible={setFilterDrawerVisible}
          selectedIndustry={selectedIndustry}
          setSelectedIndustry={setSelectedIndustry}
          selectedConcept={selectedConcept}
          setSelectedConcept={setSelectedConcept}
          availableIndustries={availableIndustries}
          availableConcepts={availableConcepts}
          setCurrentPage={setCurrentPage}
        />

        {/* 排序选择 - 支持二级菜单 */}
        <SortDrawerSection
          theme={theme}
          currentTheme={currentTheme}
          dataType={dataType}
          period={period}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sortCategory={sortCategory}
          setSortCategory={setSortCategory}
          sortDrawerVisible={sortDrawerVisible}
          setSortDrawerVisible={setSortDrawerVisible}
          setCurrentPage={setCurrentPage}
          setSortBy={setSortBy}
          setSortOrder={setSortOrder}
        />

        {/* 周期选择 */}
        <PeriodDrawer
          theme={theme}
          open={periodDrawerVisible}
          onClose={() => setPeriodDrawerVisible(false)}
          period={period}
          setPeriod={setPeriod}
          setCurrentPage={setCurrentPage}
        />

        {/* 指标选择 */}
        <IndicatorDrawer
          theme={theme}
          open={indicatorDrawerVisible}
          onClose={() => setIndicatorDrawerVisible(false)}
          dataType={dataType}
          period={period}
          indicator={indicator}
          setIndicator={setIndicator}
          mainOverlays={mainOverlays}
          setMainOverlays={setMainOverlays}
        />

        {/* 范围选择 */}
        <TimeRangeDrawer
          theme={theme}
          open={timeRangeDrawerVisible}
          onClose={() => setTimeRangeDrawerVisible(false)}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          setCurrentPage={setCurrentPage}
        />

        {/* 策略选择 */}
        <StrategyDrawer
          theme={theme}
          open={strategyVisible}
          onClose={() => setStrategyVisible(false)}
          strategy={strategy}
          setStrategy={setStrategy}
          setStrategyConfigVisible={setStrategyConfigVisible}
          setStrategyParams={setStrategyParams}
          setCurrentPage={setCurrentPage}
          dataType={dataType}
        />

        {/* 类型选择Drawer */}
        <DataTypeDrawer
          theme={theme}
          open={dataTypeDrawerVisible}
          onClose={() => setDataTypeDrawerVisible(false)}
          dataType={dataType}
          indicator={indicator}
          setDataType={setDataType}
          setIndicator={setIndicator}
          setCurrentPage={setCurrentPage}
          onSelectFavorites={async () => {
            // 先检查 Cookie 状态（从store获取）
            const hasCookies = hasAnyLoggedInAccount();
            setDataTypeDrawerVisible(false);
            if (!hasCookies) {
              setThsCookieDrawerVisible(true);
              return;
            }
            // 已有 Cookie，若未加载分组则加载一次
            if (favoriteGroupNames.length === 0 && !favoritesInflightRef.current) {
              loadFavorites();
            }
            setFavoriteGroupDrawerVisible(true);
          }}
        />

        {/* 策略配置Modal - 懒加载 */}
        {dataType !== 'favorites' && (
          <Suspense fallback={null}>
            <StrategyConfigModal
              open={strategyConfigVisible}
              onCancel={() => setStrategyConfigVisible(false)}
              onBackToStrategyList={() => {
                setStrategyConfigVisible(false);
                setStrategyVisible(true);
              }}
              onSubmit={() => { }}
              strategy={strategy || 'auction_volume'}
              dataType={dataType}
              globalPeriod={period}
              tradeDate={tradeDate}
              onApplyStrategyFilter={(params) => {
                // 历史结果应用：设置活动历史筛选
                if (params.ts_codes && params.from_history) {
                  let targetDate = params.base_date || '';
                  if (targetDate.includes('-')) {
                    targetDate = targetDate.replace(/-/g, '');
                  }
                  setActiveHistoryFilter({
                    ts_codes: params.ts_codes,
                    targetDate: targetDate || tradeDate,
                  });
                  // 如果日期需要变化
                  if (targetDate && targetDate !== tradeDate) {
                    setTradeDate(targetDate);
                    setBaseTradeDate(targetDate);
                    userChangedTradeDateRef.current = true;
                  } else {
                    setStrategyParams({ custom_codes: params.ts_codes });
                  }
                } else {
                  setStrategyParams(params);
                }
                setStrategyConfigVisible(false);
                setCurrentPage(1);
              }}
              onSaveConfig={(config) => {
                localStorage.setItem(`strategy_config_${strategy}_${dataType}`, JSON.stringify(config));
              }}
              savedConfig={(() => {
                try {
                  const saved = localStorage.getItem(`strategy_config_${strategy}_${dataType}`);
                  return saved ? JSON.parse(saved) : undefined;
                } catch {
                  return undefined;
                }
              })()}
              theme={theme}
              isMobile={true}
            />
          </Suspense>
        )}

        {/* 详情区块（Drawer + 选择抽屉 + 底部抽屉） */}
        <DetailSection
          theme={theme}
          currentTheme={currentTheme}
          detailVisible={detailVisible}
          onDrawerClose={handleDrawerClose}
          onAfterOpenChange={(open: boolean) => {
            if (open) triggerChartResize();
          }}
          selectedStock={selectedStock}
          detailCurrentTsCode={detailCurrentTsCode}
          detailCurrentName={detailCurrentName}
          detailDataType={detailDataType}
          dataType={dataType}
          originalSelectedStock={originalSelectedStock}
          isShowingUnderlying={isShowingUnderlying}
          isShowingBond={isShowingBond}
          currentKlineData={currentKlineData}
          miniKlines={miniKlines}
          getPeriodForCode={getPeriodForCode}
          getTimeRangeForCode={getTimeRangeForCode}
          getIndicatorForCode={getIndicatorForCode}
          getMainOverlaysForCode={getMainOverlaysForCode}
          setDetailCurrentTsCode={setDetailCurrentTsCode}
          setDetailCurrentName={setDetailCurrentName}
          setDetailDataType={setDetailDataType}
          setIsShowingUnderlying={setIsShowingUnderlying}
          setIsShowingBond={setIsShowingBond}
          setTagsModalVisible={setTagsModalVisible}
          setCallRecordsModalVisible={setCallRecordsModalVisible}
          setHotInfoModalVisible={setHotInfoModalVisible}
          setDetailPeriodDrawerVisible={setDetailPeriodDrawerVisible}
          setDetailTimeRangeDrawerVisible={setDetailTimeRangeDrawerVisible}
          setDetailIndicatorDrawerVisible={setDetailIndicatorDrawerVisible}
          handleDetailClose={handleDetailClose}
          globalIsSnapMode={globalIsSnapMode}
          setGlobalIsSnapMode={setGlobalIsSnapMode}
          tradeDate={tradeDate}
          handleKlineDataUpdate={handleKlineDataUpdate}
          detailPeriodDrawerVisible={detailPeriodDrawerVisible}
          detailIndicatorDrawerVisible={detailIndicatorDrawerVisible}
          detailTimeRangeDrawerVisible={detailTimeRangeDrawerVisible}
          setPeriodForCode={setPeriodForCode}
          setTimeRangeForCode={setTimeRangeForCode}
          setIndicatorForCode={setIndicatorForCode}
          setMainOverlaysForCode={setMainOverlaysForCode}
          tagsModalVisible={tagsModalVisible}
          callRecordsModalVisible={callRecordsModalVisible}
          hotInfoModalVisible={hotInfoModalVisible}
          hotInfoStock={hotInfoStock}
          setHotInfoStock={setHotInfoStock}
          favoriteGroups={favoriteGroupNames}
          isInFavorites={isInFavorites}
          onFavoriteClick={() => setFavoriteAddDrawerVisible(true)}
        />

        {/* 设置 Drawer */}
        <SettingsDrawer
          theme={theme}
          currentTheme={currentTheme}
          open={settingsVisible}
          onClose={() => {
            setSettingsVisible(false);
            setUserDrawerVisible(true);
          }}
          onThemeChange={onThemeChange}
          layout={layout}
          setLayout={setLayout}
          localCrosshairMode={localCrosshairMode}
          setLocalCrosshairMode={setLocalCrosshairMode}
        />

        {/* 交易日期选择Drawer */}
        <TradeDateDrawer
          theme={theme}
          open={tradeDateDrawerVisible}
          onClose={() => setTradeDateDrawerVisible(false)}
          tradeDate={tradeDate}
          onDateChange={handleDateChange}
          period={period}
        />

        {/* 自选分组二级菜单 */}
        <FavoriteGroupDrawer
          theme={theme}
          open={favoriteGroupDrawerVisible}
          onClose={() => setFavoriteGroupDrawerVisible(false)}
          onBack={() => setDataTypeDrawerVisible(true)}
          groups={favoriteGroupNames}
          currentGroup={currentFavoriteGroup}
          onSelectGroup={(name) => {
            setCurrentFavoriteGroup(name);
            setFavoriteGroupDrawerVisible(false);
            if (dataType !== 'favorites') setDataType('favorites');
            setCurrentPage(1);
          }}
          onCreateGroup={createFavoriteGroup}
          onDeleteGroup={deleteFavoriteGroup}
        />

        {/* 同花顺 Cookie 配置抽屉 */}
        <THSCookieDrawer
          theme={theme}
          open={thsCookieDrawerVisible}
          onClose={() => setThsCookieDrawerVisible(false)}
          thsUsername={thsUsername}
          onUpdated={() => {
            setThsCookieDrawerVisible(false);
            if (favoriteGroupNames.length === 0 && !favoritesInflightRef.current) {
              loadFavorites();
            }
            setFavoriteGroupDrawerVisible(true);
          }}
        />

        {/* 推送到同花顺抽屉 */}
        <MobilePushDrawer
          visible={pushDrawerVisible}
          onClose={() => setPushDrawerVisible(false)}
          theme={theme}
          thsGroups={favoriteGroupNames}
          total={total}
          pushLoading={pushLoading}
          onLoadGroups={loadFavorites}
          onPush={(groupName, pushCount) => {
            batchPushToThsGroup(groupName, pushCount, {
              dataType: dataType as 'stock' | 'convertible_bond' | 'concept' | 'industry',
              searchKeyword,
              tradeDate,
              userChangedTradeDate: userChangedTradeDateRef.current,
              sortBy,
              sortOrder,
              sortPeriod: period,
              tsCodes: activeHistoryFilter?.ts_codes || strategyParams?.custom_codes || strategyParams?.codes,
              filterIndustry: selectedIndustry ? [selectedIndustry] : undefined,
              filterConcepts: selectedConcept ? [selectedConcept] : undefined,
            });
          }}
        />

        {/* 统计弹窗 */}
        <StatsModal
          theme={theme}
          open={statsVisible}
          onClose={handleCloseStatsModal}
          stats={statsData}
          loading={statsLoading}
          dataType={dataType as 'stock' | 'convertible_bond' | 'concept' | 'industry'}
          tradeDate={tradeDate}
          period={period}
          industries={selectedIndustry ? [selectedIndustry] : undefined}
          concepts={selectedConcept ? [selectedConcept] : undefined}
          search={searchKeyword || undefined}
          tsCodes={activeHistoryFilter?.ts_codes || strategyParams?.custom_codes || strategyParams?.codes}
        />

        {/* 用户功能抽屉 */}
        <UserDrawer
          theme={theme}
          open={userDrawerVisible}
          onClose={() => setUserDrawerVisible(false)}
          refreshTrigger={userRefreshTrigger}
          initialUserInfo={cachedUserInfo}
          onOpenThsLogin={() => {
            setUserDrawerVisible(false);
            setThsLoginDrawerVisible(true);
          }}
          onOpenUserEdit={(userInfo: any) => {
            setCachedUserInfo(userInfo); // 🚀 缓存用户信息
            setUserDrawerVisible(false);
            setUserEditDrawerVisible(true);
          }}
          onOpenSettings={() => {
            setSettingsVisible(true);
          }}
        />

        {/* 同花顺登录抽屉 - 独立管理，避免嵌套冲突 */}
        <MobileThsLoginDrawer
          theme={theme}
          open={thsLoginDrawerVisible}
          onClose={() => {
            setThsLoginDrawerVisible(false);
            setUserDrawerVisible(true);
          }}
          onSuccess={() => {
            setThsLoginDrawerVisible(false);
            setUserDrawerVisible(true);
          }}
        />

        {/* 用户编辑抽屉 - 独立管理用户信息编辑 */}
        <UserEditDrawer
          theme={theme}
          open={userEditDrawerVisible}
          initialUserInfo={cachedUserInfo}
          onClose={() => {
            setUserEditDrawerVisible(false);
            setUserDrawerVisible(true);
          }}
          onSuccess={() => {
            setCachedUserInfo(null);
            setUserRefreshTrigger(prev => prev + 1);
            setUserEditDrawerVisible(false);
            setUserDrawerVisible(true);
          }}
        />

        {/* 添加到自选分组抽屉 */}
        <FavoriteAddDrawer
          theme={theme}
          open={favoriteAddDrawerVisible}
          onClose={() => setFavoriteAddDrawerVisible(false)}
          item={selectedStock}
          favoriteGroups={favoriteGroupNames}
          isInFavorites={isInFavorites}
          onAddToFavorites={addToFavorites}
          onRemoveFromFavorites={removeFromFavorites}
        />
      </Layout>
    </ConfigProvider>
  );
};

export default MobileDashboard;

