/**
 * 移动端 UI 状态管理 Hook
 * 管理各种 Drawer 和 Modal 的显示状态
 */

import { useState, useMemo } from 'react';
import { useAppStore } from '../../../stores/useAppStore.ts';
import type { 
  DataType, 
  Period, 
  IndicatorType, 
  LayoutType,
  SortByType,
  MainOverlayType,
} from '../types.ts';

export function useMobileUIState() {
  // 基础数据状态
  const [dataType, setDataType] = useState<DataType>('stock');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  // 布局设置 - 统一由 app-store 管理
  const layout = useAppStore(state => state.mobileLayout) as LayoutType;
  const setLayout = useAppStore(state => state.setMobileLayout);

  // 根据布局动态调整每页数量
  const pageSize = useMemo(() => layout === 'grid' ? 40 : 30, [layout]);

  // K线相关状态
  const [period, setPeriod] = useState<Period>('daily');
  const [timeRange, setTimeRange] = useState<number | string>(30);
  const [indicator, setIndicator] = useState<IndicatorType>('none');
  const [mainOverlays, setMainOverlays] = useState<MainOverlayType[]>([]);

  // 策略相关
  const [strategy, setStrategy] = useState<string>('');
  const [strategyParams, setStrategyParams] = useState<any>(null);

  // 排序相关
  const [sortBy, setSortBy] = useState<SortByType>('hot_score');
  const [sortCategory, setSortCategory] = useState<'main' | 'auction'>('main');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 交易日期
  const [tradeDate, setTradeDate] = useState<string>('');
  const [displayTradeDate, setDisplayTradeDate] = useState<string>('');

  // 自选分组
  const [currentFavoriteGroup, setCurrentFavoriteGroup] = useState<string>('');
  const [favoriteGroupNames, setFavoriteGroupNames] = useState<string[]>([]);

  // 筛选
  const [filterCategory, setFilterCategory] = useState<'industry' | 'concept' | null>(null);
  const [availableIndustries, setAvailableIndustries] = useState<any[]>([]);
  const [availableConcepts, setAvailableConcepts] = useState<any[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);

  // 统计
  const [statsVisible, setStatsVisible] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<any>(null);

  // 详情页相关
  const [tagsModalVisible, setTagsModalVisible] = useState(false);
  const [callRecordsModalVisible, setCallRecordsModalVisible] = useState(false);
  const [hotInfoModalVisible, setHotInfoModalVisible] = useState(false);
  const [hotInfoStock, setHotInfoStock] = useState<any>(null);
  const [detailPeriodDrawerVisible, setDetailPeriodDrawerVisible] = useState(false);
  const [detailIndicatorDrawerVisible, setDetailIndicatorDrawerVisible] = useState(false);
  const [detailTimeRangeDrawerVisible, setDetailTimeRangeDrawerVisible] = useState(false);

  // 十字线模式
  const [globalIsSnapMode, setGlobalIsSnapMode] = useState(false);
  const [cardKlineData, setCardKlineData] = useState<Record<string, any>>({});

  // Drawer 显示状态
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [strategyVisible, setStrategyVisible] = useState(false);
  const [strategyConfigVisible, setStrategyConfigVisible] = useState(false);
  const [timeRangeDrawerVisible, setTimeRangeDrawerVisible] = useState(false);
  const [tradeDateDrawerVisible, setTradeDateDrawerVisible] = useState(false);
  const [favoriteGroupDrawerVisible, setFavoriteGroupDrawerVisible] = useState(false);
  const [thsCookieDrawerVisible, setThsCookieDrawerVisible] = useState(false);
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [sortDrawerVisible, setSortDrawerVisible] = useState(false);
  const [periodDrawerVisible, setPeriodDrawerVisible] = useState(false);
  const [indicatorDrawerVisible, setIndicatorDrawerVisible] = useState(false);
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(false);
  const [dataTypeDrawerVisible, setDataTypeDrawerVisible] = useState(false);

  return {
    // 基础数据状态
    dataType, setDataType,
    searchKeyword, setSearchKeyword,
    currentPage, setCurrentPage,
    loading, setLoading,
    stockData, setStockData,
    total, setTotal,
    
    // 布局设置
    layout, setLayout,
    pageSize,
    
    // K线相关
    period, setPeriod,
    timeRange, setTimeRange,
    indicator, setIndicator,
    mainOverlays, setMainOverlays,
    
    // 策略相关
    strategy, setStrategy,
    strategyParams, setStrategyParams,
    
    // 排序相关
    sortBy, setSortBy,
    sortCategory, setSortCategory,
    sortOrder, setSortOrder,
    
    // 交易日期
    tradeDate, setTradeDate,
    displayTradeDate, setDisplayTradeDate,
    
    // 自选分组
    currentFavoriteGroup, setCurrentFavoriteGroup,
    favoriteGroupNames, setFavoriteGroupNames,
    
    // 筛选
    filterCategory, setFilterCategory,
    availableIndustries, setAvailableIndustries,
    availableConcepts, setAvailableConcepts,
    selectedIndustry, setSelectedIndustry,
    selectedConcept, setSelectedConcept,
    
    // 统计
    statsVisible, setStatsVisible,
    statsLoading, setStatsLoading,
    statsData, setStatsData,
    
    // 详情页相关
    tagsModalVisible, setTagsModalVisible,
    callRecordsModalVisible, setCallRecordsModalVisible,
    hotInfoModalVisible, setHotInfoModalVisible,
    hotInfoStock, setHotInfoStock,
    detailPeriodDrawerVisible, setDetailPeriodDrawerVisible,
    detailIndicatorDrawerVisible, setDetailIndicatorDrawerVisible,
    detailTimeRangeDrawerVisible, setDetailTimeRangeDrawerVisible,
    
    // 十字线模式
    globalIsSnapMode, setGlobalIsSnapMode,
    cardKlineData, setCardKlineData,
    
    // Drawer 显示状态
    settingsVisible, setSettingsVisible,
    strategyVisible, setStrategyVisible,
    strategyConfigVisible, setStrategyConfigVisible,
    timeRangeDrawerVisible, setTimeRangeDrawerVisible,
    tradeDateDrawerVisible, setTradeDateDrawerVisible,
    favoriteGroupDrawerVisible, setFavoriteGroupDrawerVisible,
    thsCookieDrawerVisible, setThsCookieDrawerVisible,
    filterDrawerVisible, setFilterDrawerVisible,
    sortDrawerVisible, setSortDrawerVisible,
    periodDrawerVisible, setPeriodDrawerVisible,
    indicatorDrawerVisible, setIndicatorDrawerVisible,
    moreOptionsVisible, setMoreOptionsVisible,
    dataTypeDrawerVisible, setDataTypeDrawerVisible,
  };
}
