/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { message } from 'antd';
import { getThsUsername } from '../utils/userKey.ts';
import authFetch from '../utils/authFetch.ts';
import { addThsAccountHeaders, onThsAccountChanged } from '../utils/thsAccountUtils.ts';
import { useAppStore } from '../stores/useAppStore.ts';

import DashboardToolbar from './DashboardToolbar.tsx';
import KLineCard from './KLineCard.tsx';
import DesktopListSkeleton from './DesktopListSkeleton.tsx';
import EmptyState from './EmptyState.tsx';
import GlobalControls from './GlobalControls.tsx';
import StrategyConfigModal from './StrategyConfigModal.tsx';
import PaginationPanel from './PaginationPanel.tsx';
import FavoriteGroupsModal from './FavoriteGroupsModal.tsx';
import StockStatsModal, { StockStats } from './StockStatsModal.tsx';
import { removeFireEmoji } from '../utils/text.ts';
import { Period } from '../shared/constants.ts';
import { getKlineDataTypeFromItem } from './mobile/utils.ts';
import { useThsPush, type PushParams } from '../hooks/useThsPush.ts';

type Props = {
  globalIsSnapMode?: boolean;
  onSnapModeChange?: (isSnapMode: boolean) => void;
  globalIndicator?: string;
  onGlobalIndicatorChange?: (indicator: string) => void;
  globalMainOverlays?: string[];
  onGlobalMainOverlaysChange?: (overlays: string[]) => void;
  globalPeriod?: Period;
  globalTimeRange?: number | string | undefined;
  onGlobalPeriodChange?: (period: Period) => void;
  onGlobalTimeRangeChange?: (range: number | string) => void;
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  tradeDate?: string; // YYYYMMDD格式的交易日期
  onTradeDateChange?: (date: string) => void;
  userChangedTradeDate?: boolean; // 用户是否手动选择过日期
};

const KLineDataDisplay: React.FC<Props> = ({ globalIsSnapMode = true, onSnapModeChange, globalIndicator = 'none', onGlobalIndicatorChange, globalMainOverlays = [], onGlobalMainOverlaysChange, globalPeriod = 'daily', globalTimeRange = 60, onGlobalPeriodChange, onGlobalTimeRangeChange, theme = 'dark', tradeDate, onTradeDateChange, userChangedTradeDate = false }) => {
  const [displayData, setDisplayData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const thsUsername = getThsUsername();
  const hasAnyLoggedInAccount = useAppStore(state => state.hasAnyLoggedInAccount);
  const dashboardLayout = useAppStore(state => state.dashboardLayout);
  const [stockStats, setStockStats] = useState<StockStats | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const getInputThemeStyle = useMemo(() => {
    const isDark = theme !== 'light';
    return {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#d9d9d9',
      color: isDark ? '#ffffff' : '#000000',
    } as React.CSSProperties;
  }, [theme]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);

  const [sortType, setSortType] = useState<string>('hot_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dataType, setDataType] = useState<'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites'>('stock');

  const [favorites, setFavorites] = useState<{[groupName: string]: { stocks: string[]; convertible_bonds: string[]; concepts: string[]; industries: string[]; }}>({});
  
  const [currentFavoriteGroup, setCurrentFavoriteGroup] = useState<string>('');
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [editingNewName, setEditingNewName] = useState('');

  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(-1);
  const focusedCardIndexRef = useRef(focusedCardIndex);
  const displayDataRef = useRef(displayData);
  const favoritesInflightRef = useRef<boolean>(false);

  useEffect(() => { focusedCardIndexRef.current = focusedCardIndex; }, [focusedCardIndex]);
  useEffect(() => { displayDataRef.current = displayData; }, [displayData]);

  const resolveEffectiveType = (
    tsCode: string,
    itemType?: string
  ): 'stock' | 'convertible_bond' | 'concept' | 'industry' => {
    let t: any = itemType;
    if (!t && dataType === 'favorites') {
      const found = displayDataRef.current.find((it: any) => it.ts_code === tsCode);
      if (found && found.type) t = found.type;
    }
    if (t === 'convertible_bond' || t === 'concept' || t === 'industry' || t === 'stock') return t;
    return 'stock';
  };

  const updateFavoritesLocal = (
    groupName: string,
    tsCode: string,
    effectiveType: 'stock' | 'convertible_bond' | 'concept' | 'industry',
    action: 'add' | 'remove'
  ) => {
    setFavorites((prev) => {
      const next = { ...(prev || {}) } as any;
      const group = next[groupName] || { stocks: [], convertible_bonds: [], concepts: [], industries: [] };
      next[groupName] = group;
      const addUnique = (arr: string[], code: string) => (arr.includes(code) ? arr : [...arr, code]);
      const removeFrom = (arr: string[], code: string) => arr.filter((c) => c !== code);
      if (action === 'add') {
        if (effectiveType === 'convertible_bond') group.convertible_bonds = addUnique(group.convertible_bonds, tsCode);
        else if (effectiveType === 'concept') group.concepts = addUnique(group.concepts, tsCode);
        else if (effectiveType === 'industry') group.industries = addUnique(group.industries, tsCode);
        else group.stocks = addUnique(group.stocks, tsCode);
      } else {
        if (effectiveType === 'convertible_bond') group.convertible_bonds = removeFrom(group.convertible_bonds, tsCode);
        else if (effectiveType === 'concept') group.concepts = removeFrom(group.concepts, tsCode);
        else if (effectiveType === 'industry') group.industries = removeFrom(group.industries, tsCode);
        else group.stocks = removeFrom(group.stocks, tsCode);
      }
      return { ...next };
    });
  };

  const handleGlobalClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const isCard = !!target.closest('.ant-card');
    const isInteractive = !!(target.closest('.ant-select') || target.closest('.ant-dropdown') || target.closest('.ant-modal') || target.closest('.ant-tooltip') || target.closest('.ant-popover') || target.closest('button') || target.closest('input') || target.closest('textarea') || target.tagName === 'A');
    if (!isCard && !isInteractive && focusedCardIndex !== -1) setFocusedCardIndex(-1);
  }, [focusedCardIndex]);

  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (event.key === 'Escape') {
        const anyFullscreen = document.querySelector('.fullscreen-card') !== null;
        if (anyFullscreen) {
          event.preventDefault();
          const evt = new CustomEvent('switchFullscreenToIndex', { detail: { index: -1 } });
          window.dispatchEvent(evt);
          return;
        }
      }
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.getAttribute('contenteditable') === 'true' || activeElement.classList.contains('ant-slider-handle') || activeElement.closest('.ant-slider') || activeElement.classList.contains('ant-select-selector') || activeElement.closest('.ant-select') || activeElement.closest('.ant-pagination') || activeElement.tagName === 'BUTTON' || activeElement.tagName === 'SELECT')) return;
      if (focusedCardIndex === -1) return;

      const totalCards = displayData.length;
      if (totalCards === 0) return;

      const gridElement = document.querySelector('.stock-grid') as HTMLElement;
      if (!gridElement) return;
      const gridTemplateColumns = window.getComputedStyle(gridElement).gridTemplateColumns;
      let cols = 1;
      if (gridTemplateColumns && gridTemplateColumns !== 'none') {
        if (gridTemplateColumns.includes('repeat')) {
          const cards = gridElement.children;
          if (cards.length > 0) {
            const firstCardRect = (cards[0] as HTMLElement).getBoundingClientRect();
            let firstRowCards = 0;
            for (let i = 0; i < cards.length; i++) {
              const cardRect = (cards[i] as HTMLElement).getBoundingClientRect();
              if (Math.abs(cardRect.top - firstCardRect.top) < 10) firstRowCards++; else break;
            }
            cols = Math.max(1, firstRowCards);
          }
        } else {
          cols = gridTemplateColumns.split(' ').length;
        }
      }

      let newIndex = focusedCardIndex;
      switch (event.key) {
        case 'ArrowLeft': event.preventDefault(); newIndex = focusedCardIndex > 0 ? focusedCardIndex - 1 : totalCards - 1; break;
        case 'ArrowRight': event.preventDefault(); newIndex = focusedCardIndex < totalCards - 1 ? focusedCardIndex + 1 : 0; break;
        case 'ArrowUp': {
          event.preventDefault();
          const currentRow = Math.floor(focusedCardIndex / cols);
          const currentCol = focusedCardIndex % cols;
          if (currentRow > 0) newIndex = (currentRow - 1) * cols + currentCol; else { const lastRow = Math.floor((totalCards - 1) / cols); const targetIndex = lastRow * cols + currentCol; newIndex = Math.min(targetIndex, totalCards - 1); }
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          const currentRowDown = Math.floor(focusedCardIndex / cols);
          const currentColDown = focusedCardIndex % cols;
          const nextRowIndex = (currentRowDown + 1) * cols + currentColDown;
          if (nextRowIndex < totalCards) newIndex = nextRowIndex; else newIndex = Math.min(currentColDown, totalCards - 1);
          break;
        }
        case 'Enter': {
          const anyFullscreen = document.querySelector('.fullscreen-card') !== null;
          if (!anyFullscreen && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const evt = new CustomEvent('switchFullscreenToIndex', { detail: { index: focusedCardIndex } });
            window.dispatchEvent(evt);
            return;
          }
          break;
        }
        default: return;
      }
      setFocusedCardIndex(newIndex);
      const anyFullscreen = document.querySelector('.fullscreen-card') !== null;
      if (anyFullscreen) {
        const evt = new CustomEvent('switchFullscreenToIndex', { detail: { index: newIndex } });
        window.dispatchEvent(evt);
      }
      setTimeout(() => {
        const cards = document.querySelectorAll('.stock-grid > div');
        const targetCard = cards[newIndex] as HTMLElement;
        if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }, 0);
    };
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => document.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [focusedCardIndex, displayData.length]);

  const [filterIndustry, setFilterIndustry] = useState<string[]>([]);
  const [filterConcepts, setFilterConcepts] = useState<string[]>([]);
  const [availableConcepts, setAvailableConcepts] = useState<string[]>([]);
  const [availableIndustries, setAvailableIndustries] = useState<string[]>([]);

  // 策略参数（前端控件）
  const [strategy, setStrategy] = useState<string>('');
  const [strategyWindowN, setStrategyWindowN] = useState<number>(30);
  const [strategyWindowM, setStrategyWindowM] = useState<number>(30);
  const [strategyALines, setStrategyALines] = useState<Set<number>>(new Set([5, 10, 20]));
  const [strategySlopeLines, setStrategySlopeLines] = useState<Set<number>>(new Set([20, 60]));
  const [strategyXCombo, setStrategyXCombo] = useState<string[]>(['a1','a2','a3','a4']);
  const [strategyPriceType, setStrategyPriceType] = useState<string>('close');
  const [showStrategyModal, setShowStrategyModal] = useState<boolean>(false);
  
  // 按数据类型维护独立的策略结果状态（内部再按 tradeDate 细分，模式B）
  const [strategyResults, setStrategyResults] = useState<Record<string, any>>({});
  
  // 活动筛选状态：存储当前应用的历史结果筛选，独立于日期
  const [activeHistoryFilter, setActiveHistoryFilter] = useState<{
    ts_codes: string[];
    targetDate: string;  // 应用时的目标日期
  } | null>(null);
  
  // 按数据类型保存策略配置
  const [savedConfigs, setSavedConfigs] = useState<Record<string, any>>({});

  // 获取当前数据类型 + 当前交易日期 对应的策略结果与哈希（模式B：结果与日期绑定）
  const getCurrentStrategyResult = () => {
    const currentDataType = dataType === 'favorites' ? 'stock' : dataType;
    const dateKey = tradeDate || '__latest__';
    const typeMap = strategyResults[currentDataType] || {};
    return typeMap[dateKey];
  };

  const getCurrentCustomCodes = (): string[] | undefined => {
    // 优先检查活动历史筛选（与日期无关）
    if (activeHistoryFilter && activeHistoryFilter.ts_codes.length > 0) {
      return activeHistoryFilter.ts_codes;
    }
    
    const strategyResult = getCurrentStrategyResult();
    // 其次使用custom_codes，最后使用策略执行结果的codes
    if (strategyResult?.custom_codes && strategyResult.custom_codes.length > 0) {
      return strategyResult.custom_codes;
    }
    if (strategyResult?.ts_codes && strategyResult.ts_codes.length > 0) {
      return strategyResult.ts_codes;
    }
    if (strategyResult?.codes && strategyResult.codes.length > 0) {
      return strategyResult.codes;
    }
    return undefined;
  };

  const getCurrentStrategyParams = () => {
    const customCodes = getCurrentCustomCodes();
    if (customCodes && customCodes.length > 0) {
      return { custom_codes: customCodes };
    }
    return undefined;
  };

  const loadFavorites = () => {
    if (favoritesInflightRef.current) return;
    favoritesInflightRef.current = true;
    (async () => {
      try {
        const resp = await authFetch('/api/favorites/ths/groups', {
          headers: addThsAccountHeaders({
            'X-THS-User-Key': thsUsername,
          }),
        });
        if (!resp.ok) throw new Error('Failed to fetch THS favorite groups');
        const result = await resp.json();
        if (result && result.success === false) {
          throw new Error(result.message || '获取同花顺自选分组失败');
        }
        const groups = (result?.data || []) as any[];

        const base: any = {};
        const groupNames: string[] = [];

        (groups || []).forEach((g: any) => {
          const name = g.group_name || g.name;
          if (!name) return;
          groupNames.push(name);
          base[name] = {
            stocks: [],
            convertible_bonds: [],
            concepts: [],
            industries: [],
          };
        });

        setFavorites(base);
        if (groupNames.length > 0) {
          setCurrentFavoriteGroup((prev) => (prev && base[prev] ? prev : groupNames[0]));
        }

        return;
      } catch (error: any) {
        console.error('Failed to load THS favorite groups', error);
        message.error(error?.message || '获取同花顺自选分组失败');
        setFavorites({});
      }
    })().finally(() => { favoritesInflightRef.current = false; });
  };

  // 添加到自选（乐观更新）
  const addToFavorites = (itemCode: string, groupName: string = currentFavoriteGroup, itemType?: string) => {
    const targetGroup = groupName || currentFavoriteGroup;
    if (!targetGroup) {
      message.error('请选择自选分组');
      return;
    }

    const tsCode = itemCode;
    const effectiveType = resolveEffectiveType(tsCode, itemType);
    
    // 乐观更新：立即更新本地状态
    updateFavoritesLocal(targetGroup, tsCode, effectiveType, 'add');

    authFetch(`/api/favorites/ths/groups/${encodeURIComponent(targetGroup)}/items`, {
      method: 'POST',
      headers: addThsAccountHeaders({
        'X-THS-User-Key': thsUsername,
      }),
      body: JSON.stringify({ ts_code: tsCode }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('添加到同花顺分组失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '添加到同花顺分组失败');
        }
        // 成功时静默处理
        if (dataType === 'favorites') {
          setTimeout(() => fetchFavoritesData(currentPage), 0);
        }
      })
      .catch((error) => {
        console.error('Failed to add to THS favorite group', error);
        // 失败时回滚
        updateFavoritesLocal(targetGroup, tsCode, effectiveType, 'remove');
        message.error(error?.message || '添加到同花顺分组失败');
      });
  };

  // 从自选移除（乐观更新）
  const removeFromFavorites = (itemCode: string, groupName: string = currentFavoriteGroup, itemType?: string) => {
    const targetGroup = groupName || currentFavoriteGroup;
    if (!targetGroup) {
      message.error('请选择自选分组');
      return;
    }

    const tsCode = itemCode;
    const effectiveType = resolveEffectiveType(tsCode, itemType);
    
    // 乐观更新：立即更新本地状态
    updateFavoritesLocal(targetGroup, tsCode, effectiveType, 'remove');

    authFetch(`/api/favorites/ths/groups/${encodeURIComponent(targetGroup)}/items/${encodeURIComponent(tsCode)}`, {
      method: 'DELETE',
      headers: addThsAccountHeaders({
        'X-THS-User-Key': thsUsername,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('从同花顺分组删除失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '从同花顺分组删除失败');
        }
        // 成功时静默处理
        if (dataType === 'favorites') {
          setTimeout(() => fetchFavoritesData(currentPage), 0);
        }
      })
      .catch((error) => {
        console.error('Failed to remove from THS favorite group', error);
        // 失败时回滚
        updateFavoritesLocal(targetGroup, tsCode, effectiveType, 'add');
        message.error(error?.message || '从同花顺分组删除失败');
      });
  };

  const createFavoriteGroup = (groupName: string) => {
    if (!groupName || !groupName.trim()) {
      message.error('分组名称不能为空');
      return;
    }

    authFetch(`/api/favorites/ths/groups`, {
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
        // 刷新分组列表
        loadFavorites();
      })
      .catch((error) => {
        console.error('Failed to create THS favorite group', error);
        message.error(error?.message || '创建同花顺分组失败');
      });
  };

  const deleteFavoriteGroup = (groupName: string) => {
    if (!groupName) {
      message.error('请选择要删除的分组');
      return;
    }

    authFetch(`/api/favorites/ths/groups/${encodeURIComponent(groupName)}`, {
      method: 'DELETE',
      headers: addThsAccountHeaders({
        'X-THS-User-Key': thsUsername,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('删除同花顺分组失败');
        const resJson = await resp.json();
        if (resJson && resJson.success === false) {
          throw new Error(resJson.message || '删除同花顺分组失败');
        }
        // 刷新分组列表
        loadFavorites();
        // 如果删除的是当前选中的分组，切换到第一个分组
        if (currentFavoriteGroup === groupName) {
          setCurrentFavoriteGroup('');
        }
      })
      .catch((error) => {
        console.error('Failed to delete THS favorite group', error);
        message.error(error?.message || '删除同花顺分组失败');
      });
  };

  const renameFavoriteGroup = (oldName: string, newName: string) => {
    message.error('当前暂不支持在系统内重命名自选分组，请在同花顺客户端中操作');
  };

  // 批量推送当前显示结果到同花顺分组（使用共享 hook）
  const { pushLoading: pushToThsLoading, batchPushToThsGroup: pushToThsGroupCore } = useThsPush(loadFavorites);
  
  // 包装推送函数，自动传入当前筛选参数
  const batchPushToThsGroup = useCallback((groupName: string, pushCount: number = 50) => {
    const customCodes = getCurrentCustomCodes();
    const params: PushParams = {
      dataType: dataType as 'stock' | 'convertible_bond' | 'concept' | 'industry',
      searchKeyword,
      tradeDate,
      userChangedTradeDate,
      sortBy: sortType || 'hot_score',
      sortOrder,
      sortPeriod: globalPeriod,
      tsCodes: customCodes,
      filterIndustry,
      filterConcepts,
    };
    pushToThsGroupCore(groupName, pushCount, params);
  }, [dataType, searchKeyword, tradeDate, userChangedTradeDate, sortType, sortOrder, globalPeriod, filterIndustry, filterConcepts, pushToThsGroupCore]);

  const isInFavorites = (itemCode: string, groupName?: string, itemType?: string) => {
    // 推导有效的 itemType（特别是自选tab下）
    let effectiveType = itemType;
    if (!effectiveType && dataType === 'favorites') {
      const foundItem = displayData.find(item => item.ts_code === itemCode);
      if (foundItem && foundItem.type) effectiveType = foundItem.type;
    }

    // 在自选tab下，当前分组展示的所有卡片都视为在当前分组中
    if (dataType === 'favorites' && groupName === currentFavoriteGroup) {
      return true;
    }

    if (groupName) {
      const group = favorites[groupName];
      if (!group) return false;
      const t = effectiveType || dataType;
      switch (t) {
        case 'convertible_bond': return group.convertible_bonds.includes(itemCode);
        case 'concept': return group.concepts.includes(itemCode);
        case 'industry': return group.industries.includes(itemCode);
        default: return group.stocks.includes(itemCode);
      }
    }

    // 未指定分组时，判断是否存在于任一分组
    const tAny = effectiveType || dataType;
    const result = Object.values(favorites).some(group => {
      switch (tAny) {
        case 'convertible_bond': return group.convertible_bonds.includes(itemCode);
        case 'concept': return group.concepts.includes(itemCode);
        case 'industry': return group.industries.includes(itemCode);
        default: return group.stocks.includes(itemCode);
      }
    });
    return result;
  };

  // 自选数据获取函数：完全依赖后端 /api/favorites/resolve + THS 自选机制
  const fetchFavoritesData = useCallback(async (page: number = 1) => {
    if (!currentFavoriteGroup) return; // 仅在选择了分组后才解析
    // 请求去重：按关键参数生成签名
    const favSignature = JSON.stringify({
      page,
      pageSize,
      tradeDate: tradeDate || '',
      group: currentFavoriteGroup || '',
      search: searchKeyword || '',
      sortType,
      sortOrder,
    });
    if (favoritesResolveInflightRef.current && lastFavoritesSignatureRef.current === favSignature) {
      await favoritesResolveInflightRef.current;
      return;
    }
    lastFavoritesSignatureRef.current = favSignature;

    setLoading(true);

    try {
      // 仅传递可选的交易日期，代码列表完全由后端（同花顺自选）决定
      const payload: any = {};
      if (tradeDate) {
        payload.trade_date = tradeDate;
      }
      if (currentFavoriteGroup) {
        payload.group_name = currentFavoriteGroup;
      }
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
      if (!resp.ok) throw new Error('Failed to resolve favorites');

      const resolved = await resp.json();
      let items = (resolved?.data || []) as any[];

      // 用当前分组的解析结果更新本地 favorites 映射，保证当前分组的收藏状态准确
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
        setFavorites(prev => ({
          ...(prev || {}),
          [currentFavoriteGroup]: { stocks, convertible_bonds, concepts, industries }
        }));
      } catch (_) { /* noop */ }
      
      // 应用搜索和排序
      if (searchKeyword) {
        items = items.filter((item: any) => {
          const name = item.name || item.bond_short_name || item.concept_name || item.industry_name;
          const code = item.ts_code || item.concept_code || item.industry_code;
          return name?.toLowerCase().includes(searchKeyword.toLowerCase()) || 
                 code?.toLowerCase().includes(searchKeyword.toLowerCase());
        });
      }
      
      if (sortType && sortType !== 'none') {
        items.sort((a: any, b: any) => {
          let aVal = a[sortType]; 
          let bVal = b[sortType];
          if (typeof aVal === 'string') aVal = parseFloat(aVal) || 0;
          if (typeof bVal === 'string') bVal = parseFloat(bVal) || 0;
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
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
          return {
            ...it,
            ts_code: it.concept_code,
            name: it.concept_name,
            type: 'concept',
            underlying_stock: null,
            kline: null, // K线数据由KLineChart组件自己获取
          };
        }
        if (t === 'industry') {
          return {
            ...it,
            ts_code: it.industry_code,
            name: it.industry_name,
            type: 'industry',
            underlying_stock: null,
            kline: null, // K线数据由KLineChart组件自己获取
          };
        }
        if (t === 'convertible_bond') {
          return {
            ...it,
            type: 'convertible_bond',
            underlying_stock: { ts_code: it.stk_code, name: it.stk_short_name },
            name: it.bond_short_name,
            latest_price: it.latest_price || null,
            concepts: it.concepts || [],
            industries: it.industries || [],
            call_records: it.call_records || [],
            kline: null, // K线数据由KLineChart组件自己获取
          };
        }
        return {
          ...it,
          type: 'stock',
          underlying_stock: null,
          kline: null, // K线数据由KLineChart组件自己获取
        };
      });
      
      setDisplayData(normalizedItems);
      setTotal(totalCount);
      
    } catch (error) {
      // Failed to fetch favorites data
      setDisplayData([]);
      setTotal(0);
    } finally {
      setLoading(false);
      favoritesResolveInflightRef.current = null;
    }
  }, [searchKeyword, sortType, sortOrder, pageSize, tradeDate, currentFavoriteGroup]);

  // 移除全局的loadFavorites调用，改为仅在自选tab激活时调用
  // useEffect(() => { loadFavorites(); }, []);


  useEffect(() => {
    const handler = () => setShowFavoriteModal(true);
    window.addEventListener('openFavoriteModal', handler as any);
    
    // 监听账号加载完成事件，延迟加载自选分组（避免阻塞首页渲染）
    const handleAccountsLoaded = () => {
      // 延迟500ms后执行，让首页先完成渲染
      setTimeout(() => {
        if (!favoritesInflightRef.current) {
          loadFavorites();
        }
      }, 500);
    };
    window.addEventListener('thsAccountsLoaded', handleAccountsLoaded as any);
    
    return () => {
      window.removeEventListener('openFavoriteModal', handler as any);
      window.removeEventListener('thsAccountsLoaded', handleAccountsLoaded as any);
    };
  }, []);

  const getSelectWidth = (items: string[], options: { min?: number; max?: number; charPx?: number; padding?: number; } = {}) => {
    const { min = 120, max = 260, charPx = 14, padding = 48 } = options;
    if (!items?.length) return min;
    const avgLength = items.map(s => (s || '').replace(/^🔥\s*/, '').length).filter(n => n > 0).reduce((sum, len, _, arr) => sum + len / arr.length, 0) || 6;
    return Math.max(min, Math.min(max, Math.round(avgLength * charPx + padding)));
  };

  const industrySelectWidth = useMemo(() => getSelectWidth(availableIndustries), [availableIndustries]);
  const conceptSelectWidth = useMemo(() => getSelectWidth(availableConcepts, { min: 160, max: 280, padding: 56 }), [availableConcepts]);
  const favoriteGroupNames = useMemo(() => Object.keys(favorites || {}), [favorites]);
  const favoriteGroupSelectWidth = useMemo(() => getSelectWidth(favoriteGroupNames, { min: 160, max: 320, padding: 56 }), [favoriteGroupNames]);

  const conceptsCacheRef = useRef<any[] | null>(null);
  const industriesCacheRef = useRef<any[] | null>(null);
  const filtersInflightRef = useRef<boolean>(false);
  const [filterRefreshKey, setFilterRefreshKey] = useState(0);

  // 辅助函数：根据名称查找概念代码
  const getConceptCodeByName = useCallback((name: string) => {
    if (!conceptsCacheRef.current) return null;
    const cleanName = name.replace(/^🔥\s*/, ''); // 移除火苗符号
    const concept = conceptsCacheRef.current.find((item: any) => item.concept_name === cleanName);
    return concept?.concept_code || null;
  }, []);

  // 辅助函数：根据名称查找行业代码
  const getIndustryCodeByName = useCallback((name: string) => {
    if (!industriesCacheRef.current) return null;
    const cleanName = name.replace(/^🔥\s*/, ''); // 移除火苗符号
    const industry = industriesCacheRef.current.find((item: any) => item.industry_name === cleanName);
    return industry?.industry_code || null;
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      if (filtersInflightRef.current) return;
      filtersInflightRef.current = true;
      
      // 如果是强制刷新（filterRefreshKey > 0），清除缓存以确保获取最新数据
      if (filterRefreshKey > 0) {
        conceptsCacheRef.current = null;
        industriesCacheRef.current = null;
      }
      
      // 热度、名称等基础指标不按日变化，使用当前数据即可
      if (!conceptsCacheRef.current) {
        const conceptsResponse = await authFetch('/api/concepts/options?hot_sort=true');
        if (conceptsResponse.ok) {
          const conceptsResult = await conceptsResponse.json();
          if (conceptsResult.success) {
            // 保存完整的选项数据（包含名称和代码）
            conceptsCacheRef.current = conceptsResult.data;
            // 为下拉框显示名称（带火苗符号）
            let conceptNames = conceptsResult.data.map((item: any) => (item.is_hot === true) ? `🔥 ${item.concept_name}` : item.concept_name).filter((v: any) => typeof v === 'string' && v.trim().length > 0);
            setAvailableConcepts(conceptNames);
          }
        }
      } else {
        // 从缓存中提取名称用于下拉框显示
        let conceptNames = conceptsCacheRef.current.map((item: any) => (item.is_hot === true) ? `🔥 ${item.concept_name}` : item.concept_name).filter((v: any) => typeof v === 'string' && v.trim().length > 0);
        setAvailableConcepts(conceptNames);
      }
      if (dataType === 'stock' || dataType === 'convertible_bond') {
        if (!industriesCacheRef.current) {
          const industriesResponse = await authFetch('/api/industries/options?hot_sort=true');
          if (industriesResponse.ok) {
            const industriesResult = await industriesResponse.json();
            if (industriesResult.success) {
              // 保存完整的选项数据（包含名称和代码）
              industriesCacheRef.current = industriesResult.data;
              // 为下拉框显示名称（带火苗符号）
              let industryNames = industriesResult.data.map((industry: any) => (industry.is_hot === true) ? `🔥 ${industry.industry_name}` : industry.industry_name);
              setAvailableIndustries(industryNames);
            }
          }
        } else {
          // 从缓存中提取名称用于下拉框显示
          let industryNames = industriesCacheRef.current.map((industry: any) => (industry.is_hot === true) ? `🔥 ${industry.industry_name}` : industry.industry_name);
          setAvailableIndustries(industryNames);
        }
      }
    } finally {
      filtersInflightRef.current = false;
    }
  }, [dataType, filterRefreshKey]);

  const didInitFiltersRef = useRef(false);
  
  // 页面刷新时清除概念/行业缓存
  useEffect(() => {
    // 检测是否为页面刷新（performance.navigation.type === 1）
    if (performance.navigation && performance.navigation.type === 1) {
      setFilterRefreshKey(prev => prev + 1);
    }
  }, []);

  // 监听粘贴事件，检测JSON格式并应用筛选
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // 如果焦点在输入框中，不处理
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }
      
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;
      
      // 尝试解析JSON格式：{"type":"stock","codes":["000001.SZ"],"label":"xxx","base_date":"20260120"}
      try {
        const data = JSON.parse(text);
        if (!data.codes || !Array.isArray(data.codes) || data.codes.length === 0) return;
        
        e.preventDefault();
        
        // 根据type切换到正确的tab
        const targetType = data.type || 'stock';
        if (targetType !== dataType) {
          setDataType(targetType);
        }
        
        // 如果包含基准日期，切换全局日期
        const targetDate = data.base_date || tradeDate || '';
        if (data.base_date && onTradeDateChange) {
          onTradeDateChange(data.base_date);
        }
        
        // 设置活动历史筛选
        setActiveHistoryFilter({
          ts_codes: data.codes,
          targetDate,
        });
        
        // 重新获取数据（使用基准日期）
        fetchData(1, undefined, undefined, undefined, undefined, undefined, undefined, { custom_codes: data.codes }, data.base_date);
        const dateInfo = data.base_date ? ` (${data.base_date.slice(0, 4)}-${data.base_date.slice(4, 6)}-${data.base_date.slice(6, 8)})` : '';
        message.success(`已应用筛选: ${data.label || `${data.codes.length}个标的`}${dateInfo}`);
      } catch {
        // 非JSON格式，忽略
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [tradeDate, dataType, onTradeDateChange]);
  // 切换dataType或pageSize时重置分页，并获取筛选选项
  useEffect(() => {
    if (!didInitFiltersRef.current) didInitFiltersRef.current = true;
    
    // 切换tab时立即重置分页信息，避免显示上一个tab的数据
    setTotal(0);
    setDisplayData([]);
    setCurrentPage(1);
    if (dataType === 'stock' || dataType === 'convertible_bond') fetchFilterOptions();
  }, [dataType, pageSize]);
  
  // searchKeyword变化时只重置分页，不重新获取筛选选项
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword]);
  
  // 记录上一次的tradeDate，用于检测变化
  const prevTradeDateForFetchRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    
    const prev = prevDepsRef.current;
    // 仅在分页或数据类型变化时触发；自选分组变更在非自选tab下不会触发重复请求
    const onlyGroupChanged =
      prev &&
      prev.currentPage === currentPage &&
      prev.dataType === dataType &&
      prev.currentFavoriteGroup !== currentFavoriteGroup;
    
    prevDepsRef.current = { currentPage, dataType, currentFavoriteGroup } as any;
    
    // 检测日期是否变化
    const tradeDateChanged = prevTradeDateForFetchRef.current !== undefined && 
                             prevTradeDateForFetchRef.current !== tradeDate;
    prevTradeDateForFetchRef.current = tradeDate;
    
    if (dataType === 'favorites') {
      if (currentFavoriteGroup) {
        fetchFavoritesData(currentPage);
      }
    } else {
      // 如果仅自选分组变化且当前不在自选tab，跳过股票数据重复获取
      if (onlyGroupChanged) return;
      
      // 日期变化时的处理
      let strategyParams: any = undefined;
      if (tradeDateChanged) {
        // 检查是否是历史应用触发的日期变化（目标日期匹配）
        if (activeHistoryFilter && activeHistoryFilter.targetDate === tradeDate) {
          // 历史应用触发，使用活动筛选
          strategyParams = { custom_codes: activeHistoryFilter.ts_codes };
        } else {
          // 用户手动改变日期，清除活动筛选和策略结果
          setActiveHistoryFilter(null);
          setStrategyResults((prev) => ({ ...prev, [dataType]: {} }));
          setCurrentPage(1);
        }
      } else {
        strategyParams = getCurrentStrategyParams();
      }
      
      // 分页或数据类型变化时，根据当前选择的 tradeDate 重新获取数据
      fetchData(
        tradeDateChanged ? 1 : currentPage,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // customStrategy 占位
        strategyParams,
      );
    }
  }, [currentPage, pageSize, dataType, currentFavoriteGroup, tradeDate]);

  useEffect(() => {
    if (dataType === 'favorites') {
      setCurrentPage(1); setDisplayData([]); setTotal(0);
    }
  }, [currentFavoriteGroup]);


  // 切换到自选tab时清除策略状态并检查Cookie状态
  useEffect(() => {
    if (dataType === 'favorites') {
      setStrategy('');
      resetStrategyParams();
      // 清除已保存的策略结果
      setStrategyResults((prev) => ({ ...prev, favorites: {} }));
    }
  }, [dataType]);

  // 切换周期时，重置排序选项为默认值，并清除策略结果（策略结果与周期绑定）
  const prevPeriodRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // 只在周期实际变化时重置（跳过初始化）
    if (prevPeriodRef.current !== undefined && prevPeriodRef.current !== globalPeriod) {
      setSortType('hot_score');
      setSortOrder('desc');
      // 清除所有策略结果，因为策略结果与周期绑定
      setStrategyResults({});
    }
    prevPeriodRef.current = globalPeriod;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPeriod]);

  // 移除未使用的老式inflight引用，改用Map去重
  const favoritesResolveInflightRef = useRef<Promise<any> | null>(null);
  const lastFavoritesSignatureRef = useRef<string | null>(null);
  const prevDepsRef = useRef<{ currentPage: number; dataType: string; currentFavoriteGroup: string } | null>(null);
  const inflightStocksMapRef = useRef<Map<string, Promise<void>>>(new Map());
  const fetchData = useCallback(async (
    page: number = 1,
    customIndustries?: string[],
    customConcepts?: string[],
    customSearch?: string,
    customSortType?: string,
    customSortOrder?: string,
    customStrategy?: string,
    customStrategyParams?: {
      window_n?: number;
      window_m?: number;
      a_lines_spread?: number[];
      slope_lines?: number[];
      x_combo?: string[];
      price_type?: string;
      custom_codes?: string[];  // 自定义代码列表（对比结果/历史结果应用）
    },
    customTradeDate?: string  // 添加交易日期参数 YYYYMMDD格式
  ) => {
    if (dataType === 'favorites') return;
    const currentIndustries = customIndustries !== undefined ? customIndustries : filterIndustry;
    const currentConcepts = customConcepts !== undefined ? customConcepts : filterConcepts;
    const currentSearch = customSearch !== undefined ? customSearch : searchKeyword;
    const currentSortType = customSortType !== undefined ? customSortType : sortType;
    const currentSortOrder = (customSortOrder !== undefined ? customSortOrder : sortOrder) as 'asc' | 'desc';
    const currentStrategy = customStrategy !== undefined ? customStrategy : strategy;
    // 如果显式传入customTradeDate则优先使用，否则仅当用户手动选择过日期时才携带 trade_date
    const currentTradeDate = customTradeDate !== undefined ? customTradeDate : (userChangedTradeDate ? (tradeDate || '') : '');
    const fetchSignature = JSON.stringify({
      t: dataType,
      page,
      pageSize,
      industries: currentIndustries,
      concepts: currentConcepts,
      search: currentSearch,
      sortType: currentSortType,
      sortOrder: currentSortOrder,
      // 将策略及其参数纳入签名，确保修改后不会复用旧请求
      strategy: currentStrategy || '',
      strategyWindowN: (customStrategyParams?.window_n ?? strategyWindowN) || null,
      strategyWindowM: (customStrategyParams?.window_m ?? strategyWindowM) || null,
      strategyALines: (customStrategyParams?.a_lines_spread ?? Array.from(strategyALines || new Set())),
      strategySlopeLines: (customStrategyParams?.slope_lines ?? Array.from(strategySlopeLines || new Set())),
      strategyXCombo: (customStrategyParams?.x_combo ?? strategyXCombo),
      tradeDate: currentTradeDate,
    });
    const existing = inflightStocksMapRef.current.get(fetchSignature);
    if (existing) { await existing; return; }
    
    const p: Promise<void> = (async () => {
      setLoading(true);
      try {
        let items: any[] = []; let totalCount = 0;
        if (dataType === 'stock') {
          // 构建请求体
          const requestBody: any = {
            page,
            page_size: pageSize,
            industries: currentIndustries.length > 0 ? currentIndustries : undefined,
            concepts: currentConcepts.length > 0 ? currentConcepts : undefined,
            search: currentSearch || undefined,
            trade_date: currentTradeDate || undefined,
          };

          // 自定义代码列表（对比结果/历史结果应用）
          if (customStrategyParams?.custom_codes && customStrategyParams.custom_codes.length > 0) {
            requestBody.ts_codes = customStrategyParams.custom_codes;
          }

          // 排序参数
          if (currentSortType === 'hot_score' || currentSortType === 'default') {
            requestBody.hot_sort = true;
            requestBody.sort_by = 'hot_score';
            requestBody.sort_order = currentSortOrder;
          } else if (currentSortType === 'pct_chg') {
            requestBody.sort_by = 'pct_chg';
            requestBody.sort_order = currentSortOrder;
            requestBody.sort_period = globalPeriod; // 添加周期参数
          } else if (currentSortType === 'intraperiod_pct_chg') {
            requestBody.sort_by = 'intraperiod_pct_chg';
            requestBody.sort_order = currentSortOrder;
            requestBody.sort_period = globalPeriod; // 添加周期参数
          } else if (currentSortType === 'volatility') {
            requestBody.sort_by = 'volatility';
            requestBody.sort_order = currentSortOrder;
            requestBody.sort_period = globalPeriod; // 添加周期参数
          } else if (currentSortType === 'call_countdown') {
            requestBody.sort_by = 'call_countdown';
            requestBody.sort_order = currentSortOrder;
          } else if (currentSortType === 'issue_date') {
            requestBody.sort_by = 'list_date';
            requestBody.sort_order = currentSortOrder;
          } else {
            requestBody.sort_by = currentSortType;
            requestBody.sort_order = currentSortOrder;
            // 对于需要周期的字段，添加周期参数（vol, amount 等）
            if (['vol', 'amount', 'pct_chg', 'intraperiod_pct_chg'].includes(currentSortType)) {
              requestBody.sort_period = globalPeriod;
            } else if (currentSortType.startsWith('auction_')) {
              // 竞价字段固定使用日线
              requestBody.sort_period = 'daily';
            }
          }

          const response = await authFetch('/api/stocks', {
            method: 'POST',
            body: JSON.stringify(requestBody),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) { 
              items = Array.isArray(result.data) ? result.data : []; 
              totalCount = result.pagination?.total || items.length;
            }
            else { items = Array.isArray(result) ? result : []; totalCount = items.length; }
          }
          items = (items as any[]).map(it => ({ ...it, __isHot__: it.is_hot === true }));
        } else if (dataType === 'concept') {
          const requestBody: any = {
            page,
            page_size: pageSize,
            search: currentSearch || undefined,
            trade_date: currentTradeDate || undefined,
          };
          // 自定义代码列表（对比结果/历史结果应用）
          if (customStrategyParams?.custom_codes && customStrategyParams.custom_codes.length > 0) {
            requestBody.ts_codes = customStrategyParams.custom_codes;
          }
          if (currentSortType === 'hot_score' || currentSortType === 'default') { requestBody.hot_sort = true; requestBody.sort_by = 'hot_score'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'pct_chg') { requestBody.sort_by = 'pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'intraperiod_pct_chg') { requestBody.sort_by = 'intraperiod_pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'volatility') { requestBody.sort_by = 'volatility'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'concept_name') { requestBody.sort_by = 'concept_name'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'list_date') { requestBody.sort_by = 'list_date'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType) { 
            requestBody.sort_by = currentSortType; 
            requestBody.sort_order = currentSortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'intraperiod_pct_chg'].includes(currentSortType)) {
              requestBody.sort_period = globalPeriod;
            } else if (currentSortType === 'total_mv' || currentSortType === 'turnover_rate') {
              requestBody.sort_period = 'daily'; // 市值和换手率固定使用日线
            }
          }
          const response = await authFetch('/api/concepts', { method: 'POST', body: JSON.stringify(requestBody) });
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) { items = Array.isArray(result.data) ? result.data.map((it: any) => ({ ...it, type: 'concept' })) : []; totalCount = result.pagination?.total || items.length; }
          }
          items = (items as any[]).map(it => ({ ...it, __isHot__: it.is_hot === true }));
        } else if (dataType === 'industry') {
          const requestBody: any = {
            page,
            page_size: pageSize,
            search: currentSearch || undefined,
            trade_date: currentTradeDate || undefined,
          };
          // 自定义代码列表（对比结果/历史结果应用）
          if (customStrategyParams?.custom_codes && customStrategyParams.custom_codes.length > 0) {
            requestBody.ts_codes = customStrategyParams.custom_codes;
          }
          if (currentSortType === 'hot_score' || currentSortType === 'default') { requestBody.hot_sort = true; requestBody.sort_by = 'hot_score'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'pct_chg') { requestBody.sort_by = 'pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'intraperiod_pct_chg') { requestBody.sort_by = 'intraperiod_pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'volatility') { requestBody.sort_by = 'volatility'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'industry_name') { requestBody.sort_by = 'industry_name'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'list_date') { requestBody.sort_by = 'list_date'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType) { 
            requestBody.sort_by = currentSortType; 
            requestBody.sort_order = currentSortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'intraperiod_pct_chg'].includes(currentSortType)) {
              requestBody.sort_period = globalPeriod;
            } else if (currentSortType === 'total_mv' || currentSortType === 'turnover_rate') {
              requestBody.sort_period = 'daily'; // 市值和换手率固定使用日线
            }
          }
          const response = await authFetch('/api/industries', { method: 'POST', body: JSON.stringify(requestBody) });
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) { items = Array.isArray(result.data) ? result.data.map((it: any) => ({ ...it, type: 'industry' })) : []; totalCount = result.pagination?.total || items.length; }
          }
          items = (items as any[]).map(it => ({ ...it, __isHot__: it.is_hot === true }));
        } else {
          const requestBody: any = {
            page,
            page_size: pageSize,
            industries: currentIndustries.length > 0 ? currentIndustries : undefined,
            concepts: currentConcepts.length > 0 ? currentConcepts : undefined,
            search: currentSearch || undefined,
            trade_date: currentTradeDate || undefined,
          };
          // 自定义代码列表（对比结果/历史结果应用）
          if (customStrategyParams?.custom_codes && customStrategyParams.custom_codes.length > 0) {
            requestBody.ts_codes = customStrategyParams.custom_codes;
          }
          if (currentSortType === 'hot_score' || currentSortType === 'default') { requestBody.hot_sort = true; requestBody.sort_by = 'hot_score'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'pct_chg') { requestBody.sort_by = 'pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'intraperiod_pct_chg') { requestBody.sort_by = 'intraperiod_pct_chg'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'volatility') { requestBody.sort_by = 'volatility'; requestBody.sort_order = currentSortOrder; requestBody.sort_period = globalPeriod; }
          else if (currentSortType === 'call_countdown') { requestBody.sort_by = 'call_countdown'; requestBody.sort_order = currentSortOrder; }
          else if (currentSortType === 'issue_date') { requestBody.sort_by = 'list_date'; requestBody.sort_order = currentSortOrder; }
          else { 
            requestBody.sort_by = currentSortType; 
            requestBody.sort_order = currentSortOrder;
            // 对于需要周期的字段，添加周期参数
            if (['vol', 'amount', 'intraperiod_pct_chg'].includes(currentSortType)) {
              requestBody.sort_period = globalPeriod;
            }
          }
          const response = await authFetch('/api/convertible-bonds', { method: 'POST', body: JSON.stringify(requestBody) });
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) { items = Array.isArray(result.data) ? result.data : []; totalCount = result.pagination?.total || items.length; }
            else { items = Array.isArray(result) ? result : []; totalCount = items.length; }
          }
          items = (items as any[]).map(it => ({ ...it, __isHot__: it.is_hot === true }));
        }
        const itemsWithKlines = items.map((item: any) => {
          if (dataType === 'convertible_bond') {
            return {
              ...item,
              kline: null,
              type: 'convertible_bond',
              underlying_stock: { ts_code: item.stk_code, name: item.stk_short_name },
              name: item.bond_short_name,
              latest_price: item.latest_price || null,
              concepts: item.concepts || [],
              industries: item.industries || [],
              call_records: item.call_records || [],
              is_hot: (item as any).__isHot__ === true || item.is_hot === true,
              hot_score: undefined
            };
          }
          if (dataType === 'concept') {
            return {
              ...item,
              ts_code: item.concept_code, // 供K线接口使用
              kline: null,
              type: 'concept',
              underlying_stock: null,
              name: item.concept_name,
              is_hot: (item as any).__isHot__ === true || item.is_hot === true,
              hot_score: undefined
            };
          }
          if (dataType === 'industry') {
            return {
              ...item,
              ts_code: item.industry_code, // 供K线接口使用
              kline: null,
              type: 'industry',
              underlying_stock: null,
              name: item.industry_name,
              is_hot: (item as any).__isHot__ === true || item.is_hot === true,
              hot_score: undefined
            };
          }
          const isHot = (item as any).__isHot__ === true;
          return {
            ...item,
            kline: null,
            type: 'stock',
            underlying_stock: null,
            is_hot: isHot,
            hot_score: undefined
          };
        });
        setDisplayData(itemsWithKlines);
        setTotal(totalCount);
        setCurrentPage(page);
      } catch { setDisplayData([]); setTotal(0); } finally { setLoading(false); }
    })();
    inflightStocksMapRef.current.set(fetchSignature, p);
    await p.finally(() => { inflightStocksMapRef.current.delete(fetchSignature); });
  }, [dataType, filterIndustry, filterConcepts, searchKeyword, sortType, sortOrder, strategy, strategyWindowN, strategyWindowM, strategyALines, strategySlopeLines, strategyXCombo, tradeDate, pageSize, currentFavoriteGroup, favorites, strategyResults]);

  const handleSearchInput = (value: string) => { 
    setSearchInput(value); 
    if (value.trim() === '') { 
      setSearchKeyword(''); 
      setCurrentPage(1);
      // 清空搜索时重新加载数据
      fetchData(1, filterIndustry, filterConcepts, '', undefined, undefined, undefined, getCurrentStrategyParams());
    } 
  };
  const handleSearchSubmit = (value: string) => { 
    setSearchKeyword(value); 
    setCurrentPage(1); 
    fetchData(1, filterIndustry, filterConcepts, value, undefined, undefined, undefined, getCurrentStrategyParams()); 
  };
  const applyFilters = async (industries?: string[], concepts?: string[]) => {
    const cleanIndustries = industries?.map(industry => removeFireEmoji(industry));
    const cleanConcepts = concepts?.map(concept => removeFireEmoji(concept));
    fetchData(1, cleanIndustries, cleanConcepts, searchKeyword, undefined, undefined, undefined, getCurrentStrategyParams());
  };
  const clearFilters = () => { 
    setFilterIndustry([]); 
    setFilterConcepts([]);
    // 清除活动历史筛选
    setActiveHistoryFilter(null);
    fetchData(1, [], [], searchKeyword, undefined, undefined, undefined, undefined); 
  };
  
  const handleSortChange = (newSortType: string, newSortOrder: 'asc' | 'desc') => {
    setSortType(newSortType); 
    setSortOrder(newSortOrder); 
    setCurrentPage(1); 
    fetchData(1, filterIndustry, filterConcepts, searchKeyword, newSortType, newSortOrder, undefined, getCurrentStrategyParams()); 
  };
  
  const handleIndustryChange = (value: string | null) => { 
    const newIndustries = value ? [value] : []; 
    setFilterIndustry(newIndustries); 
    if (newIndustries.length === 0 && filterConcepts.length === 0) clearFilters(); 
    else applyFilters(newIndustries, filterConcepts); 
  };
  const handleConceptsChange = (values: string[]) => { 
    const newConcepts = values || []; 
    setFilterConcepts(newConcepts); 
    if (newConcepts.length === 0 && filterIndustry.length === 0) clearFilters(); 
    else applyFilters(filterIndustry, newConcepts); 
  };
  const fetchEntityStats = useCallback(async () => {
    if (dataType !== 'stock' && dataType !== 'convertible_bond' && dataType !== 'concept' && dataType !== 'industry') return;
    setStatsLoading(true);
    try {
      const currentIndustries = filterIndustry;
      const currentConcepts = filterConcepts;
      const currentSearch = searchKeyword;
      const currentTradeDate = tradeDate || '';
      const strategyParams = getCurrentStrategyParams();

      const requestBody: any = {
        page: 1,
        page_size: pageSize,
        search: currentSearch || undefined,
        trade_date: currentTradeDate || undefined,
        sort_period: globalPeriod,
      };

      if (dataType === 'stock' || dataType === 'convertible_bond') {
        requestBody.industries = currentIndustries.length > 0 ? currentIndustries : undefined;
        requestBody.concepts = currentConcepts.length > 0 ? currentConcepts : undefined;
      }

      if (strategyParams?.custom_codes && strategyParams.custom_codes.length > 0) {
        requestBody.ts_codes = strategyParams.custom_codes;
      }

      let url = '/api/stocks/stats';
      if (dataType === 'convertible_bond') url = '/api/convertible-bonds/stats';
      else if (dataType === 'concept') url = '/api/concepts/stats';
      else if (dataType === 'industry') url = '/api/industries/stats';

      const resp = await authFetch(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        throw new Error('获取统计数据失败');
      }

      const json = await resp.json();
      if (!json || json.success === false || !json.data) {
        throw new Error(json?.message || '获取统计数据失败');
      }

      setStockStats(json.data as StockStats);
    } catch (err: any) {
      const msg = err?.message || '获取统计数据失败';
      message.error(msg);
    } finally {
      setStatsLoading(false);
    }
  }, [dataType, filterIndustry, filterConcepts, searchKeyword, tradeDate, pageSize, strategyResults, strategy, globalPeriod, activeHistoryFilter]);

  const handleOpenStatsModal = () => {
    if (dataType !== 'stock' && dataType !== 'convertible_bond' && dataType !== 'concept' && dataType !== 'industry') return;
    setStatsVisible(true);
    // 每次打开时重新获取统计数据，确保使用最新的筛选条件
    if (!statsLoading) {
      fetchEntityStats();
    }
  };

  const handleCloseStatsModal = () => {
    setStatsVisible(false);
  };

  useEffect(() => {
    setStockStats(null);
    setStatsVisible(false);
  }, [dataType, filterIndustry, filterConcepts, searchKeyword, tradeDate, globalPeriod, strategyResults, strategy, activeHistoryFilter]);


  useEffect(() => {
    const cleanupAccountListener = onThsAccountChanged((account) => {
      // 账号切换时重新加载自选股数据
      if (dataType === 'favorites') {
        setFavorites({});
        setCurrentFavoriteGroup('');
        loadFavorites();
      }
    });

    return cleanupAccountListener;
  }, [dataType]);

  // 重置策略参数到默认值
  const resetStrategyParams = () => {
    setStrategyWindowN(30);
    setStrategyWindowM(30);
    setStrategyALines(new Set([5, 10, 20]));
    setStrategySlopeLines(new Set([20, 60]));
    setStrategyXCombo(['a1','a2','a3','a4']);
  };
  const handleDataTypeChange = (type: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites') => { 
    setDataType(type); 
    setSearchKeyword(''); 
    setSearchInput(''); 
    setCurrentPage(1);
    // 切换数据类型时清除活动历史筛选，避免跨类型携带ts_codes
    setActiveHistoryFilter(null);
    // 切换数据类型时，重置排序选项为默认值，避免不同类型有不同的排序项导致混淆
    if (type !== 'favorites') {
      setSortType('hot_score');
      setSortOrder('desc');
    }
    // 如果切换到非股票类型且当前指标是开盘竞价，自动切换为"无"
    if (type !== 'stock' && globalIndicator === 'auction' && onGlobalIndicatorChange) {
      onGlobalIndicatorChange('none');
    }
    // 竞价策略仅适用于股票，切换到非股票类型时清空策略选择
    if (type !== 'stock') {
      setStrategy('');
    }
  };
  const handlePageChange = (page: number, size?: number) => { setCurrentPage(page); if (size) setPageSize(size); };
  const handlePageSizeChange = (_: number, size: number) => { const clamped = Math.max(1, Math.min(Number(size) || 1, 48)); setCurrentPage(1); setPageSize(clamped); };

  return (
    <div className={`dashboard-theme ${theme}`} onMouseDown={handleGlobalClick}>
      <DashboardToolbar
        theme={theme}
        dataType={dataType}
        onDataTypeChange={handleDataTypeChange}
        searchInput={searchInput}
        onSearchInputChange={handleSearchInput}
        onSearchSubmit={handleSearchSubmit}
        inputStyle={getInputThemeStyle}
        sortType={sortType}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        period={globalPeriod}
        favorites={favorites}
        currentFavoriteGroup={currentFavoriteGroup}
        onFavoriteGroupChange={setCurrentFavoriteGroup}
        onOpenFavoriteModal={() => setShowFavoriteModal(true)}
        favoriteGroupSelectWidth={favoriteGroupSelectWidth}
        filterIndustry={filterIndustry}
        filterConcepts={filterConcepts}
        availableIndustries={availableIndustries}
        availableConcepts={availableConcepts}
        conceptsCacheData={conceptsCacheRef.current || []}
        industriesCacheData={industriesCacheRef.current || []}
        industrySelectWidth={industrySelectWidth}
        conceptSelectWidth={conceptSelectWidth}
        onIndustryChange={handleIndustryChange}
        onConceptsChange={handleConceptsChange}
        onFetchFilterOptions={fetchFilterOptions}
        hasValidThsAccount={hasAnyLoggedInAccount()}
      />

      <GlobalControls
        theme={theme}
        period={globalPeriod}
        onPeriodChange={(period: string) => {
          if (onGlobalPeriodChange && (period === 'daily' || period === 'weekly' || period === 'monthly')) {
            onGlobalPeriodChange(period as Period);
          }
        }}
        timeRange={globalTimeRange}
        onTimeRangeChange={onGlobalTimeRangeChange || (() => {})}
        indicator={globalIndicator}
        onIndicatorChange={onGlobalIndicatorChange || (() => {})}
        mainOverlays={globalMainOverlays}
        onMainOverlaysChange={onGlobalMainOverlaysChange || (() => {})}
        strategy={strategy}
        onStrategyChange={(val) => { 
          setStrategy(val); 
          if (!val) { 
                resetStrategyParams();
            // 清除已保存的策略结果和历史筛选，后续请求不再带 hash
            const key = dataType === 'favorites' ? 'stock' : dataType;
            setStrategyResults(prev => ({ ...prev, [key]: undefined }));
            setActiveHistoryFilter(null);
            // 立即刷新一次不带 hash 的列表
            setTimeout(() => fetchData(1, undefined, undefined, undefined, undefined, undefined, undefined, undefined), 0);
          }
        }}
        onOpenStrategyConfig={() => setShowStrategyModal(true)}
        dataType={dataType}
        tradeDate={tradeDate}
        onTradeDateChange={onTradeDateChange}
      />

      {/* 策略选择与参数（放在周期、范围、指标后面）*/}
      {/* 策略选择已经移入 GlobalControls，一行展示 */}

      <StrategyConfigModal
        open={showStrategyModal}
        onCancel={() => setShowStrategyModal(false)}
        strategy={strategy || 'auction_volume'}
        dataType={dataType === 'favorites' ? 'stock' : dataType}
        globalPeriod={globalPeriod}
        tradeDate={tradeDate}
        initialWindowN={strategyWindowN}
        initialWindowM={strategyWindowM}
        initialALines={Array.from(strategyALines)}
        initialSlopeLines={Array.from(strategySlopeLines)}
        initialXCombo={strategyXCombo}
        initialPriceType={strategyPriceType}
        strategyResult={getCurrentStrategyResult()}
        savedConfig={savedConfigs[dataType === 'favorites' ? 'stock' : dataType]}
        onStrategyResultUpdate={(result) => {
          const currentDataType = dataType === 'favorites' ? 'stock' : dataType;
          const dateKey = tradeDate || '__latest__';
          setStrategyResults(prev => ({
            ...prev,
            [currentDataType]: {
              ...(prev[currentDataType] || {}),
              [dateKey]: result,
            },
          }));
        }}
        onSaveConfig={(config) => {
          const currentDataType = dataType === 'favorites' ? 'stock' : dataType;
          setSavedConfigs(prev => ({
            ...prev,
            [currentDataType]: config
          }));
        }}
        onSubmit={(vals) => {
          setStrategyWindowN(vals.window_n);
          setStrategyWindowM(vals.window_m);
          setStrategyALines(new Set(vals.a_lines_spread));
          setStrategySlopeLines(new Set(vals.slope_lines));
          setStrategyXCombo(vals.x_combo || ['a1','a2','a3','a4']);
          setStrategyPriceType(vals.price_type || 'close');
          setShowStrategyModal(false);
          setCurrentPage(1);
          // 立即使用最新参数发起请求，避免闭包读取到旧值
          setTimeout(() => fetchData(1, undefined, undefined, undefined, undefined, undefined, undefined, {
            window_n: vals.window_n,
            window_m: vals.window_m,
            a_lines_spread: vals.a_lines_spread,
            slope_lines: vals.slope_lines,
            x_combo: vals.x_combo || ['a1','a2','a3','a4'],
            price_type: vals.price_type
          }), 0);
        }}
        onApplyStrategyFilter={(result) => {
          // 应用策略筛选，刷新数据
          setCurrentPage(1);

          const currentDataType = dataType === 'favorites' ? 'stock' : dataType;
          const dateKey = tradeDate || '__latest__';

          // 对比结果应用：使用自定义代码列表
          if (result.custom_codes && result.custom_codes.length > 0) {
            // 清除历史筛选，确保使用对比结果
            setActiveHistoryFilter(null);
            
            // 保存自定义代码到策略结果
            setStrategyResults(prev => ({
              ...prev,
              [currentDataType]: {
                ...(prev[currentDataType] || {}),
                [dateKey]: {
                  custom_codes: result.custom_codes,
                  custom_label: result.custom_label,
                },
              },
            }));

            // 传递自定义代码列表进行筛选
            setTimeout(() => fetchData(1, undefined, undefined, undefined, undefined, undefined, undefined, {
              custom_codes: result.custom_codes,
            }), 0);
            return;
          }

          // 历史结果应用：使用ts_codes列表
          if (result.ts_codes && result.ts_codes.length > 0) {
            // 确保日期为YYYYMMDD格式
            let historyTradeDate = result.base_date || '';
            if (historyTradeDate.includes('-')) {
              historyTradeDate = historyTradeDate.replace(/-/g, '');
            }
            
            const targetDate = historyTradeDate || tradeDate || '';
            
            // 清除对比结果，确保使用历史筛选
            setStrategyResults(prev => ({
              ...prev,
              [currentDataType]: {
                ...(prev[currentDataType] || {}),
                [dateKey]: undefined,
              },
            }));
            
            // 设置活动历史筛选（在日期变化前设置，确保useEffect能识别）
            setActiveHistoryFilter({
              ts_codes: result.ts_codes,
              targetDate: targetDate,
            });
            
            // 如果日期需要变化，更新全局日期（useEffect会检测到并使用活动筛选）
            if (historyTradeDate && result.from_history && historyTradeDate !== tradeDate) {
              onTradeDateChange?.(historyTradeDate);
            } else {
              // 日期相同，直接获取数据
              fetchData(1, undefined, undefined, undefined, undefined, undefined, undefined, {
                custom_codes: result.ts_codes,
              });
            }
            return;
          }

        }}
        theme={theme}
      />

      <PaginationPanel
        dataType={dataType}
        searchKeyword={searchKeyword}
        total={total}
        currentPage={currentPage}
        pageSize={pageSize}
        loading={loading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        showStatsButton={
          dataType === 'stock' ||
          dataType === 'convertible_bond' ||
          dataType === 'concept' ||
          dataType === 'industry'
        }
        onClickStats={handleOpenStatsModal}
        statsLoading={statsLoading}
        showPushButton={hasAnyLoggedInAccount() && dataType !== 'favorites'}
        thsGroups={Object.keys(favorites)}
        onPushToGroup={batchPushToThsGroup}
        pushLoading={pushToThsLoading}
        onLoadGroups={loadFavorites}
      />

      <div className={`stock-grid ${dashboardLayout && dashboardLayout === 'compact' ? 'compact-mode' : ''}`}>
        {loading && (
          <DesktopListSkeleton theme={theme} count={pageSize} compact={dashboardLayout === 'compact'} />
        )}
        {!loading && displayData.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <EmptyState
              type={searchKeyword ? 'search' : (dataType === 'favorites' ? 'favorites' : 'empty')}
              searchKeyword={searchKeyword}
              theme={theme === 'light' ? 'light' : 'dark'}
            />
          </div>
        )}
        {!loading && displayData.length > 0 && displayData.map((item, index) => (
          <KLineCard
            key={item.ts_code}
            item={item}
            dataType={getKlineDataTypeFromItem(item)}
            onConceptFilter={(concept) => { 
              const conceptCode = getConceptCodeByName(concept);
              if (conceptCode) {
                setFilterConcepts([conceptCode]); 
                applyFilters(filterIndustry, [conceptCode]); 
              }
            }}
            onIndustryFilter={(industry) => { 
              const industryCode = getIndustryCodeByName(industry);
              if (industryCode) {
                setFilterIndustry([industryCode]); 
                applyFilters([industryCode], filterConcepts); 
              }
            }}
            globalIsSnapMode={globalIsSnapMode}
            onSnapModeChange={onSnapModeChange}
            globalIndicator={globalIndicator}
            globalMainOverlays={globalMainOverlays}
            globalPeriod={globalPeriod}
            globalTimeRange={globalTimeRange}
            onGlobalPeriodChange={(period: string) => {
              if (onGlobalPeriodChange && (period === 'daily' || period === 'weekly' || period === 'monthly')) {
                onGlobalPeriodChange(period as Period);
              }
            }}
            onGlobalTimeRangeChange={onGlobalTimeRangeChange}
            onGlobalIndicatorChange={onGlobalIndicatorChange}
            onGlobalMainOverlaysChange={onGlobalMainOverlaysChange}
            theme={theme}
            onAddToFavorites={addToFavorites}
            onRemoveFromFavorites={removeFromFavorites}
            isInFavorites={isInFavorites}
            favoriteGroups={Object.keys(favorites)}
            isInFavoritesMode={dataType === 'favorites'}
            cardIndex={index}
            focusedCardIndex={focusedCardIndex}
            onCardFocus={setFocusedCardIndex}
            tradeDate={tradeDate}
          />
        ))}
      </div>

      <FavoriteGroupsModal
        open={showFavoriteModal}
        onCancel={() => { setShowFavoriteModal(false); setNewGroupName(''); setEditingGroupName(null); setEditingNewName(''); }}
        favorites={favorites}
        currentFavoriteGroup={currentFavoriteGroup}
        newGroupName={newGroupName}
        editingGroupName={editingGroupName}
        editingNewName={editingNewName}
        setNewGroupName={setNewGroupName}
        setEditingGroupName={setEditingGroupName}
        setEditingNewName={setEditingNewName}
        createFavoriteGroup={createFavoriteGroup}
        renameFavoriteGroup={renameFavoriteGroup}
        deleteFavoriteGroup={deleteFavoriteGroup}
      />
      <StockStatsModal
        open={statsVisible}
        onClose={handleCloseStatsModal}
        stats={stockStats}
        loading={statsLoading}
        entityType={
          dataType === 'convertible_bond'
            ? 'convertible_bond'
            : dataType === 'concept'
              ? 'concept'
              : dataType === 'industry'
                ? 'industry'
                : 'stock'
        }
        theme={theme}
        tradeDate={tradeDate}
        period={globalPeriod}
        industries={filterIndustry?.length ? filterIndustry : undefined}
        concepts={filterConcepts?.length ? filterConcepts : undefined}
        search={searchKeyword || undefined}
        tsCodes={getCurrentCustomCodes()}
      />
    </div>
  );
};

export default KLineDataDisplay;


