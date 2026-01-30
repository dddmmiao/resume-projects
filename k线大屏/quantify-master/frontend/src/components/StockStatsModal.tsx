/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Modal, Spin, message, Button } from 'antd';
import { authFetch } from '../utils/authFetch.ts';
import { useAppStore } from '../stores/useAppStore.ts';
import {
  DEFAULT_BREAKPOINTS,
  generateRangeLabels,
  getBucketIndexDynamic,
  parseYYYYMMDD,
  computePctBucketsWithItems,
  computeFilteredDistribution,
  computeSecondaryDistribution,
  computeDefaultCompareDate,
  computeDailySummary,
  computeCompareSummary as computeCompareSummaryFn,
  getCompareStatsApiUrl,
  buildCompareStatsRequestBody,
  PERIOD_LABELS,
  FilterDimension,
  FILTER_DIMENSION_CONFIG,
  valueToLog,
  logToValue,
  computeDynamicPresets,
} from './StockStatsModal/constants.ts';
import {
  StockStatsSummary,
  StockStatsItem,
  StockStats,
  CompareStatsItem,
  CompareStats,
} from './StockStatsModal/types.ts';
import ChartControls, { ExtendedChartType } from './StockStatsModal/ChartControls.tsx';
import { Slider } from 'antd';
import TradingCalendarModal from './StockStatsModal/TradingCalendarModal.tsx';
import StatsSummaryCard from './StockStatsModal/StatsSummaryCard.tsx';
import CompareChart from './StockStatsModal/CompareChart.tsx';
import { getDimensionValue, filterItemsByDimension } from './StockStatsModal/filterUtils.ts';
import { amountToYi, marketValueToYi } from './mobile/utils.ts';
import StatsSkeleton from './StockStatsModal/StatsSkeleton.tsx';
// Re-export types for external use
export type { StockStatsSummary, StockStatsItem, StockStats };

export interface StockStatsModalProps {
  open: boolean;
  onClose: () => void;
  stats: StockStats | null;
  loading: boolean;
  theme: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  entityType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  tradeDate?: string;
  period?: 'daily' | 'weekly' | 'monthly';
  industries?: string[];
  concepts?: string[];
  search?: string;
  tsCodes?: string[];
}

const StockStatsModal: React.FC<StockStatsModalProps> = ({ 
  open, onClose, stats, loading, theme, entityType,
  tradeDate, period = 'daily', industries, concepts, search, tsCodes
}) => {
  // 获取当前周期的文案
  const periodLabels = PERIOD_LABELS[period];
  const isDarkTheme = theme !== 'light';
  const textColor = isDarkTheme ? '#ddd' : '#000';
  const modalThemeClass = isDarkTheme ? 'dark' : 'light';
  const [chartReady, setChartReady] = useState(false);
  // 新的多图表类型支持
  const [chartType, setChartType] = useState<ExtendedChartType>('bar');
  const [pieDataType, setPieDataType] = useState<'close' | 'intraday' | 'both'>('both'); // 数据类型：收盘/日内/两者
  const [useLogScale, setUseLogScale] = useState(false); // 是否使用对数坐标（仅柱状图/散点图）
  const [pctRange, setPctRange] = useState<[number, number]>([-Infinity, Infinity]); // 涨跌幅范围筛选（默认全部）
  const [showRangeToolbar, setShowRangeToolbar] = useState(false); // 全局范围工具栏显示状态
  const [searchKeyword, setSearchKeyword] = useState<string>(''); // 搜索关键词
  const [filterDimension, setFilterDimension] = useState<FilterDimension>('pct_chg'); // 筛选维度
  // 各维度独立的筛选范围状态（当日统计和日期对比分开维护）
  const defaultRanges: Record<FilterDimension, [number, number]> = {
    pct_chg: [-Infinity, Infinity],
    circ_mv: [0, Infinity],
    amount: [0, Infinity],
    close: [0, Infinity],
  };
  const [dailyDimensionRanges, setDailyDimensionRanges] = useState<Record<FilterDimension, [number, number]>>(defaultRanges);
  const [compareDimensionRanges, setCompareDimensionRanges] = useState<Record<FilterDimension, [number, number]>>(defaultRanges);
  const [dailyPctRange, setDailyPctRange] = useState<[number, number]>([-Infinity, Infinity]);
  const [comparePctRange, setComparePctRange] = useState<[number, number]>([-Infinity, Infinity]);

  // 重置函数在 dynamicDimensionBounds 之后定义

  // 日期对比相关状态（需要在dimensionQuantiles之前定义）
  const [statsMode, setStatsMode] = useState<'daily' | 'compare'>('daily');
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null);
  // 数据维度切换（日期对比模式）
  const [dataMetric, setDataMetric] = useState<'pct_chg' | 'max_pct' | 'min_pct'>('pct_chg');

  // 当图表类型改变时，如果新类型不支持'both'，自动调整为'close'
  // 只有bar和distribution支持三态（收盘/日内/两者），其他图表只支持两态
  useEffect(() => {
    const supportsThreeState = chartType === 'bar' || chartType === 'distribution';
    if (!supportsThreeState && pieDataType === 'both') {
      setPieDataType('close');
    }
  }, [chartType, pieDataType]);

  // 根据当前模式选择对应的维度范围状态
  const dimensionRanges = statsMode === 'compare' ? compareDimensionRanges : dailyDimensionRanges;
  const setDimensionRanges = statsMode === 'compare' ? setCompareDimensionRanges : setDailyDimensionRanges;
  // 当前维度的筛选范围
  const filterRange = dimensionRanges[filterDimension];
  const setFilterRange = useCallback((range: [number, number]) => {
    setDimensionRanges(prev => ({
      ...prev,
      [filterDimension]: range,
    }));
    // 同步更新 pctRange（用于柱状图等）
    if (filterDimension === 'pct_chg') {
      if (statsMode === 'compare') {
        setComparePctRange(range);
      } else {
        setDailyPctRange(range);
      }
      setPctRange(range);
    }
  }, [filterDimension, statsMode, setDimensionRanges]);

  // 动态计算各维度的边界值和分位数（基于实际数据，根据当前模式切换数据源）
  const dimensionQuantiles = useMemo(() => {
    // 根据当前模式选择数据源
    const items = statsMode === 'compare' ? (compareStats?.items || []) : (stats?.items || []);
    
    // 计算分位数的辅助函数
    const computeQuantiles = (values: number[], numBuckets: number = 100): number[] => {
      if (values.length === 0) return [];
      const sorted = [...values].sort((a, b) => a - b);
      const quantiles: number[] = [];
      for (let i = 0; i <= numBuckets; i++) {
        const idx = Math.floor((i / numBuckets) * (sorted.length - 1));
        quantiles.push(sorted[idx]);
      }
      return quantiles;
    };
    
    // 计算各维度的值数组
    const pctValues = items.map(i => i.pct_chg ?? 0);
    const circMvValues = items.map(i => marketValueToYi(i.circ_mv)).filter(v => v > 0);
    const amountValues = items.map(i => amountToYi(i.amount)).filter(v => v > 0);
    const closeValues = items.map(i => i.close ?? 0).filter(v => v > 0);
    
    return {
      pct_chg: computeQuantiles(pctValues),
      circ_mv: computeQuantiles(circMvValues),
      amount: computeQuantiles(amountValues),
      close: computeQuantiles(closeValues),
    };
  }, [stats?.items, compareStats?.items, statsMode]);

  // 动态计算各维度的边界值
  const dynamicDimensionBounds = useMemo(() => {
    const quantiles = dimensionQuantiles;
    
    // 取整函数：min 向下取整，max 向上取整到合适精度
    const getBounds = (q: number[], precision: number = 1): { min: number; max: number } => {
      if (q.length === 0) return { min: 0, max: 100 };
      const factor = Math.pow(10, precision);
      return { 
        min: Math.floor(q[0] * factor) / factor,
        max: Math.ceil(q[q.length - 1] * factor) / factor
      };
    };
    
    return {
      pct_chg: quantiles.pct_chg.length > 0 
        ? getBounds(quantiles.pct_chg, 1) // 涨跌幅保留1位小数
        : { min: -15, max: 15 },
      circ_mv: quantiles.circ_mv.length > 0 
        ? getBounds(quantiles.circ_mv, 1) // 流通市值保留1位小数
        : { min: 0, max: 10000 },
      amount: quantiles.amount.length > 0 
        ? getBounds(quantiles.amount, 1) // 成交额保留1位小数
        : { min: 0, max: 100 },
      close: quantiles.close.length > 0 
        ? getBounds(quantiles.close, 1) // 收盘价保留1位小数
        : { min: 0, max: 500 },
    };
  }, [dimensionQuantiles]);

  // 重置单个维度范围（使用动态边界，根据当前模式更新对应状态）
  const resetDimensionRange = useCallback((dim: FilterDimension) => {
    const bounds = dynamicDimensionBounds[dim];
    const defaultRange: [number, number] = [bounds.min, bounds.max];
    setDimensionRanges(prev => ({
      ...prev,
      [dim]: defaultRange,
    }));
    if (dim === 'pct_chg') {
      setPctRange(defaultRange);
      if (statsMode === 'compare') {
        setComparePctRange(defaultRange);
      } else {
        setDailyPctRange(defaultRange);
      }
    }
  }, [dynamicDimensionBounds, statsMode, setDimensionRanges]);

  // 重置所有维度范围（使用动态边界，根据当前模式更新对应状态）
  const resetAllRanges = useCallback(() => {
    const newRanges = {
      pct_chg: [dynamicDimensionBounds.pct_chg.min, dynamicDimensionBounds.pct_chg.max] as [number, number],
      circ_mv: [dynamicDimensionBounds.circ_mv.min, dynamicDimensionBounds.circ_mv.max] as [number, number],
      amount: [dynamicDimensionBounds.amount.min, dynamicDimensionBounds.amount.max] as [number, number],
      close: [dynamicDimensionBounds.close.min, dynamicDimensionBounds.close.max] as [number, number],
    };
    setDimensionRanges(newRanges);
    const pctDefault: [number, number] = [dynamicDimensionBounds.pct_chg.min, dynamicDimensionBounds.pct_chg.max];
    setPctRange(pctDefault);
    if (statsMode === 'compare') {
      setComparePctRange(pctDefault);
    } else {
      setDailyPctRange(pctDefault);
    }
  }, [dynamicDimensionBounds, statsMode, setDimensionRanges]);

  // 日期对比相关状态（续）
  const [baseDate, setBaseDate] = useState<string>(tradeDate || ''); // 开始日期，默认当前日期
  const [compareDate, setCompareDate] = useState<string>('');
  const [baseCalendarOpen, setBaseCalendarOpen] = useState(false); // 开始日期日历
  const [calendarOpen, setCalendarOpen] = useState(false); // 结束日期日历
  // 使用全局交易日历
  const tradingDays = useAppStore(state => state.tradingDays);
  const loadTradingDays = useAppStore(state => state.loadTradingDays);
  const [compareLoading, setCompareLoading] = useState(false);
  // 记录上次请求的参数，避免重复请求
  const lastCompareParamsRef = useRef<string>('');
  // 对比图表的独立控制状态
  const [compareChartType, setCompareChartType] = useState<ExtendedChartType>('bar');
  const [compareUseLogScale, setCompareUseLogScale] = useState(false);
  // 日期对比模式固定使用收盘涨跌幅，不需要切换
  const comparePieDataType = 'close' as const;

  // 动态预设：基于当前数据分位数计算（当日/对比模式自动切换数据源）
  const dynamicPresets = useMemo(() => {
    // 选择数据源：对比模式使用 compareStats，否则使用 stats
    const items = statsMode === 'compare' ? compareStats?.items : stats?.items;
    if (!items || items.length === 0) {
      return {
        pct_chg: FILTER_DIMENSION_CONFIG.pct_chg.presets,
        circ_mv: FILTER_DIMENSION_CONFIG.circ_mv.presets,
        amount: FILTER_DIMENSION_CONFIG.amount.presets,
        close: FILTER_DIMENSION_CONFIG.close.presets,
      };
    }
    
    // 提取各维度数值
    const circMvValues = items.map(i => marketValueToYi(i.circ_mv));
    const amountValues = items.map(i => amountToYi(i.amount));
    const closeValues = items.map(i => i.close ?? 0);
    
    return {
      pct_chg: FILTER_DIMENSION_CONFIG.pct_chg.presets, // 涨跌幅使用静态预设
      circ_mv: computeDynamicPresets(circMvValues, 'circ_mv'),
      amount: computeDynamicPresets(amountValues, 'amount'),
      close: computeDynamicPresets(closeValues, 'close'),
    };
  }, [stats?.items, compareStats?.items, statsMode]);
  
  // 对比图表由 CompareChart 组件管理，不需要单独的 ref

  // 断点状态（使用默认精细配置，不可编辑）
  const [breakpoints] = useState<number[]>(DEFAULT_BREAKPOINTS);
  const currentRangeLabels = useMemo(() => generateRangeLabels(breakpoints), [breakpoints]);

  // 获取日期对比统计
  const fetchCompareStats = async (baseDt: string, compareDt: string) => {
    if (!baseDt || !compareDt) return;
    
    setCompareLoading(true);
    try {
      const requestBody = buildCompareStatsRequestBody({
        baseDate: baseDt,
        compareDate: compareDt,
        entityType,
        period,
        industries,
        concepts,
        search,
        tsCodes,
      });

      const url = getCompareStatsApiUrl(entityType);

      const resp = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) throw new Error('获取对比统计失败');
      
      const json = await resp.json();
      if (!json || json.success === false || !json.data) {
        throw new Error(json?.message || '获取对比统计失败');
      }
      
      setCompareStats(json.data);
    } catch (err: any) {
      message.error(err?.message || '获取对比统计失败');
      setCompareStats(null);
    } finally {
      setCompareLoading(false);
    }
  };

  // 当tradeDate变化时，同步更新baseDate和compareDate
  useEffect(() => {
    if (tradeDate) {
      setBaseDate(tradeDate);
      setCompareDate(computeDefaultCompareDate(tradeDate, tradingDays));
    }
  }, [tradeDate]);

  // 当tradingDays加载完成后，如果compareDate还没设置，则计算默认值
  useEffect(() => {
    if (baseDate && tradingDays.length > 0 && !compareDate) {
      setCompareDate(computeDefaultCompareDate(baseDate, tradingDays));
    }
  }, [tradingDays]);

  // 筛选条件变化时，清空对比数据缓存（与stats接口行为一致）
  useEffect(() => {
    setCompareStats(null);
    lastCompareParamsRef.current = '';
  }, [industries, concepts, search, tsCodes]);

  // modal打开时预加载compare数据（与stats接口调用时机一致）
  useEffect(() => {
    if (open && baseDate && compareDate && !compareStats && !compareLoading) {
      fetchCompareStats(baseDate, compareDate);
    }
  }, [open]);

  // 日期变化或标的类型变化时请求新数据
  useEffect(() => {
    // 先清空旧数据，避免切换标的类型时显示旧数据
    setCompareStats(null);
    if (open && baseDate && compareDate) {
      fetchCompareStats(baseDate, compareDate);
    }
  }, [baseDate, compareDate, entityType]);

  // 打开日历或组件初始化时加载交易日（使用全局store）
  useEffect(() => {
    if ((calendarOpen || baseCalendarOpen || baseDate) && tradingDays.length === 0) {
      loadTradingDays();
    }
  }, [calendarOpen, baseCalendarOpen, baseDate, tradingDays.length, loadTradingDays]);

  // 开始日期验证
  const validateBaseDate = useCallback((selectedDate: Date) => {
    if (compareDate) {
      const compareDt = parseYYYYMMDD(compareDate);
      if (compareDt && selectedDate > compareDt) {
        return { valid: false, message: '开始日期不能晚于结束日期' };
      }
    }
    return { valid: true };
  }, [compareDate]);

  // 结束日期验证
  const validateCompareDate = useCallback((selectedDate: Date) => {
    if (baseDate) {
      const baseDt = parseYYYYMMDD(baseDate);
      if (baseDt && selectedDate < baseDt) {
        return { valid: false, message: '结束日期不能早于开始日期' };
      }
    }
    return { valid: true };
  }, [baseDate]);

  // 切换模式时销毁图表实例，确保重新初始化时使用正确的DOM
  useEffect(() => {
    if (statsMode === 'compare') {
      // 切换到对比模式，CompareChart 组件内部处理图表切换
    }
  }, [statsMode]);

  // 对比统计的客户端分桶计算（用于图表分布显示）- 支持dataMetric切换
  const computedCompareBuckets = useMemo(() => {
    interface CompareBucket {
      range: string;
      count: number;
      items: CompareStatsItem[];
    }
    
    const buckets: CompareBucket[] = currentRangeLabels.map(range => ({
      range, count: 0, items: []
    }));

    if (!compareStats || !compareStats.items || !Array.isArray(compareStats.items)) {
      return buckets;
    }

    // 根据dataMetric选择分桶依据的值
    const getMetricValue = (item: CompareStatsItem): number => {
      if (dataMetric === 'max_pct' && item.max_pct !== undefined) return item.max_pct;
      if (dataMetric === 'min_pct' && item.min_pct !== undefined) return item.min_pct;
      return item.pct_chg;
    };

    compareStats.items.forEach((item: CompareStatsItem) => {
      const metricValue = getMetricValue(item);
      const idx = getBucketIndexDynamic(metricValue, breakpoints);
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].count++;
        buckets[idx].items.push(item);
      }
    });

    return buckets;
  }, [compareStats, currentRangeLabels, breakpoints, dataMetric]);

  
  // computedSummary 和 computedCompareSummary 移至 memoizedChartItems 之后定义

  // 获取item在指定维度的值（用于筛选）- 使用共享函数
  const getItemDimensionValue = useCallback((item: StockStatsItem, dim: FilterDimension): number => {
    return getDimensionValue(item, dim);
  }, []);

  // 根据items计算分布（使用共享函数），先应用多维度筛选
  const computedPctBuckets = useMemo(() => {
    if (!stats || !stats.items || !Array.isArray(stats.items)) {
      return currentRangeLabels.map(range => ({
        range, count: 0, intraday_count: 0, items: [] as StockStatsItem[]
      }));
    }
    
    // 先应用多维度筛选（非涨跌幅维度时）
    let filteredItems = stats.items;
    if (filterDimension !== 'pct_chg') {
      const dynamicBounds = dynamicDimensionBounds[filterDimension];
      const dimMinVal = filterRange[0];
      const dimMaxVal = filterRange[1];
      // 使用动态边界判断是否为默认范围
      const isDefaultRange = dimMinVal <= dynamicBounds.min && (dimMaxVal === Infinity || dimMaxVal >= dynamicBounds.max);
      
      if (!isDefaultRange) {
        filteredItems = stats.items.filter(item => {
          const dimValue = getItemDimensionValue(item, filterDimension);
          return dimValue >= dimMinVal && (dimMaxVal === Infinity || dimValue <= dimMaxVal);
        });
      }
    }
    
    return computePctBucketsWithItems(filteredItems, breakpoints);
  }, [stats, currentRangeLabels, breakpoints, filterDimension, filterRange, getItemDimensionValue]);

  // 缓存气泡图所需的 items 数据 - 使用共享筛选函数
  const memoizedChartItems = useMemo(() => {
    const allItems = stats?.items?.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg,
      open: item.open,  // 开盘价
      close: item.close,
      amount: item.amount,
      intraday_pct: item.intraday_pct, // 日内振幅，用于分布图
      circ_mv: item.circ_mv, // 流通市值，用于气泡图大小
    })) || [];
    
    return filterItemsByDimension(allItems, {
      pctRange,
      filterDimension,
      filterRange,
      dynamicBounds: dynamicDimensionBounds[filterDimension],
      searchKeyword,
      allDimensionRanges: dimensionRanges,
      allDynamicBounds: dynamicDimensionBounds,
    });
  }, [stats?.items, pctRange, filterDimension, filterRange, searchKeyword, dynamicDimensionBounds, dimensionRanges]);

  // 全量原始数据（不经过任何筛选，用于坐标轴范围计算）
  const memoizedAllChartItems = useMemo(() => {
    return stats?.items?.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg,
      open: item.open,  // 开盘价
      close: item.close,
      amount: item.amount,
      intraday_pct: item.intraday_pct,
      circ_mv: item.circ_mv,
    })) || [];
  }, [stats?.items]);

  // 缓存对比图表所需的 items 数据（应用多维度范围和搜索过滤）- 使用共享筛选函数
  const memoizedCompareItems = useMemo(() => {
    const allItems = compareStats?.items?.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg,
      open: item.open,  // A日开盘价
      close: item.close,
      amount: item.amount,  // 累计成交额 (A→B区间)
      circ_mv: item.circ_mv ?? 0,  // B日流通市值
      max_pct: item.max_pct,  // 区间最大涨幅
      min_pct: item.min_pct,  // 区间最大回撤
      high_price: item.high_price,  // 区间最高价
      low_price: item.low_price,  // 区间最低价
    })) || [];
    
    return filterItemsByDimension(allItems, {
      pctRange,
      filterDimension,
      filterRange,
      dynamicBounds: dynamicDimensionBounds[filterDimension],
      searchKeyword,
      allDimensionRanges: dimensionRanges,
      allDynamicBounds: dynamicDimensionBounds,
    });
  }, [compareStats?.items, pctRange, filterDimension, filterRange, searchKeyword, dynamicDimensionBounds, dimensionRanges]);

  // 对比图表全量原始数据（不经过任何筛选，用于坐标轴范围计算）
  const memoizedAllCompareItems = useMemo(() => {
    return compareStats?.items?.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg,
      open: item.open,  // A日开盘价
      close: item.close,
      amount: item.amount,
      circ_mv: item.circ_mv ?? 0,
      max_pct: item.max_pct,
      min_pct: item.min_pct,
      high_price: item.high_price,
      low_price: item.low_price,
    })) || [];
  }, [compareStats?.items]);

  // 从已筛选的items计算summary（跟随所有维度筛选变化）
  const computedSummary = useMemo(() => {
    // 使用已筛选的 memoizedChartItems，传入全范围避免重复过滤
    const items = memoizedChartItems.map(item => ({
      ...item,
      intraday_pct: (item as any).intraday_pct ?? 0,
    })) as StockStatsItem[];
    return computeDailySummary(items, [-Infinity, Infinity]);
  }, [memoizedChartItems]);

  // 从已筛选的compareItems计算compare summary（跟随所有维度筛选变化）
  const computedCompareSummary = useMemo(() => 
    computeCompareSummaryFn(memoizedCompareItems, [-Infinity, Infinity]),
  [memoizedCompareItems]);

  // 缓存 distribution 数据（使用共享函数）
  const memoizedDistribution = useMemo(() => {
    return computeFilteredDistribution(computedPctBuckets, pctRange);
  }, [computedPctBuckets, pctRange]);

  // 缓存 secondaryDistribution 数据（使用共享函数）
  const memoizedSecondaryDistribution = useMemo(() => {
    return computeSecondaryDistribution(computedPctBuckets, pctRange, breakpoints);
  }, [computedPctBuckets, pctRange, breakpoints]);

  // 缓存对比模式的 distribution 数据，先过滤再计算 - 支持dataMetric
  const memoizedCompareDistribution = useMemo(() => {
    // 根据dataMetric选择筛选依据的值
    const getMetricValue = (item: CompareStatsItem): number => {
      if (dataMetric === 'max_pct' && item.max_pct !== undefined) return item.max_pct;
      if (dataMetric === 'min_pct' && item.min_pct !== undefined) return item.min_pct;
      return item.pct_chg;
    };

    // 如果范围是全部，直接返回原始分布
    if (pctRange[0] === -Infinity && pctRange[1] === Infinity) {
      return computedCompareBuckets.map(b => ({ range: b.range, count: b.count }));
    }
    
    const minVal = pctRange[0];
    const maxVal = pctRange[1];
    
    return computedCompareBuckets.map(b => {
      const filteredCount = b.items.filter(item => {
        const metricValue = getMetricValue(item);
        return metricValue >= minVal && metricValue <= maxVal;
      }).length;
      return { range: b.range, count: filteredCount };
    });
  }, [computedCompareBuckets, pctRange, dataMetric]);

  // 主图表点击回调（用于 CompareChart）
  // 收盘/日内切换已移至 ChartControls 组件
  const handleMainChartClick = useCallback((_rangeLabel: string, _dataIndex: number) => {
    // 柱状图点击不再触发筛选，使用范围滑块代替
  }, []);

  // 主图表现在由 CompareChart 组件渲染，原有的直接 ECharts 渲染代码已删除
  // CompareChart 内部统一处理柱状图、饼图、气泡图的渲染、交互和 resize

  // CompareChart 组件内部已处理 resize，这里仅保留空实现确保兼容性
  useEffect(() => {
    if (!chartReady) return;
    const timer = window.setTimeout(() => {
      // CompareChart 内部处理
    }, 200);
    return () => window.clearTimeout(timer);
  }, [chartReady]);


  
  return (
    <>
    <Modal
      title={
        <span>
          {entityType === 'stock'
            ? '股票统计概览'
            : entityType === 'convertible_bond'
              ? '可转债统计概览'
              : entityType === 'concept'
                ? '概念统计概览'
                : '行业统计概览'}
          <span style={{
            marginLeft: 8,
            fontSize: 12,
            padding: '2px 4px',
            borderRadius: 4,
            background: isDarkTheme ? 'rgba(24,144,255,0.2)' : 'rgba(24,144,255,0.1)',
            color: isDarkTheme ? '#69c0ff' : '#1890ff',
            fontWeight: 500,
            verticalAlign: 'middle',
          }}>
            {period === 'weekly' ? '周线' : period === 'monthly' ? '月线' : '日线'}
          </span>
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      zIndex={10210}
      wrapClassName={`stats-modal ${modalThemeClass}`}
      afterOpenChange={(visible) => {
        // chartReady控制图表初始化时机：Modal动画完成后才初始化
        setChartReady(visible);
        if (visible) {
          // Modal打开后，CompareChart 组件内部处理 resize
        }
      }}
    >
      {/* 图表视图 */}
      {loading && <StatsSkeleton isDarkTheme={isDarkTheme} />}
      {!loading && !stats && <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, opacity: 0.7, color: textColor }}>暂无统计数据</div>}
      {!loading && stats && (
        <div>
          {/* 统计模式切换 + 范围按钮 */}
          {(entityType === 'stock' || entityType === 'convertible_bond' || entityType === 'concept' || entityType === 'industry') && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              gap: 12, 
              marginBottom: 12,
              flexWrap: 'wrap',
            }}>
              {/* 左侧：模式切换 + 日期选择 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStatsMode('daily');
                      // 切换模式时同步pctRange到当日统计的值
                      setPctRange(dailyPctRange);
                    }}
                    style={{
                      fontSize: 12,
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
                      background: statsMode === 'daily'
                        ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                        : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
                      color: textColor,
                      cursor: 'pointer',
                    }}
                  >
                    {periodLabels.current}统计
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatsMode('compare');
                      // 切换模式时同步pctRange到日期对比的值
                      setPctRange(comparePctRange);
                    }}
                    style={{
                      fontSize: 12,
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
                      background: statsMode === 'compare'
                        ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                        : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
                      color: textColor,
                      cursor: 'pointer',
                    }}
                  >
                    日期对比
                  </button>
                </div>
                {statsMode === 'compare' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Button
                      size="small"
                      onClick={() => setBaseCalendarOpen(true)}
                      style={{
                        background: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                        color: textColor,
                        borderRadius: 4,
                      }}
                    >
                      {baseDate ? `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)}` : '选择开始日期'}
                    </Button>
                    <span style={{ fontSize: 12, color: isDarkTheme ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.45)' }}>→</span>
                    <Button
                      size="small"
                      onClick={() => setCalendarOpen(true)}
                      style={{
                        background: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                        color: textColor,
                        borderRadius: 4,
                      }}
                    >
                      {compareDate ? `${compareDate.slice(0, 4)}-${compareDate.slice(4, 6)}-${compareDate.slice(6, 8)}` : '选择结束日期'}
                    </Button>
                  </div>
                )}
              </div>
              {/* 范围按钮 - 始终靠右 */}
              <button
                type="button"
                onClick={() => setShowRangeToolbar(prev => !prev)}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
                  background: showRangeToolbar
                    ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                    : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
                  color: textColor,
                  cursor: 'pointer',
                }}
              >
                范围
              </button>
            </div>
          )}

          {/* 非统计类型：只显示范围按钮（已被上方条件覆盖，可删除此块） */}
          {false && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setShowRangeToolbar(prev => !prev)}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
                  background: showRangeToolbar
                    ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                    : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
                  color: textColor,
                  cursor: 'pointer',
                }}
              >
                范围
              </button>
            </div>
          )}

          {/* 全局范围工具栏 - 点击范围按钮后显示（单行设计） */}
          {showRangeToolbar && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: 8, 
              marginBottom: 12,
              padding: '8px 12px',
              background: isDarkTheme ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 6,
              border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              flexWrap: 'wrap',
            }}>
              {/* 维度选择器 */}
              <select
                value={filterDimension}
                onChange={(e) => {
                  const newDim = e.target.value as FilterDimension;
                  setFilterDimension(newDim);
                  // 切换维度时不重置范围，各维度独立保存状态
                  // 同步 pctRange（用于柱状图等）
                  if (newDim === 'pct_chg') {
                    setPctRange(dimensionRanges.pct_chg);
                  }
                }}
                style={{
                  fontSize: 11,
                  padding: '3px 6px',
                  borderRadius: 3,
                  border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}`,
                  background: isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  color: textColor,
                  minWidth: 70,
                }}
              >
                {(Object.keys(FILTER_DIMENSION_CONFIG) as FilterDimension[]).map(dim => (
                  <option key={dim} value={dim}>{FILTER_DIMENSION_CONFIG[dim].label}</option>
                ))}
              </select>
              {/* 当前维度的预设按钮 */}
              {(() => {
                const config = FILTER_DIMENSION_CONFIG[filterDimension];
                // 使用动态边界值
                const bounds = dynamicDimensionBounds[filterDimension];
                const sliderMin = bounds.min;
                const sliderMax = bounds.max;
                return (
                  <>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {dynamicPresets[filterDimension].map((preset) => {
                        const isActive = filterRange[0] === preset.value[0] && filterRange[1] === preset.value[1];
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setFilterRange(preset.value);
                              // pctRange 同步已在 setFilterRange 中处理
                            }}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 3,
                              border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}`,
                              background: isActive
                                ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                                : 'transparent',
                              color: textColor,
                              cursor: 'pointer',
                              opacity: isActive ? 1 : 0.7,
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* 滑块 - 对数刻度用于 circ_mv/amount，线性用于 pct_chg/close */}
                    {(() => {
                      const useLog = config.useLog;
                      // 对数刻度：将真实值转换为对数值用于滑块
                      const logMin = useLog ? valueToLog(Math.max(sliderMin, 0.01)) : sliderMin;
                      const logMax = useLog ? valueToLog(sliderMax) : sliderMax;
                      const logStep = useLog ? 0.05 : config.step; // 对数刻度使用更细的步长
                      
                      // 当前 filterRange 转换为滑块值
                      const sliderValue: [number, number] = useLog ? [
                        filterRange[0] <= 0 ? logMin : Math.max(logMin, valueToLog(filterRange[0])),
                        filterRange[1] === Infinity ? logMax : Math.min(logMax, valueToLog(filterRange[1]))
                      ] : [
                        filterRange[0] === -Infinity ? sliderMin : Math.max(sliderMin, filterRange[0]),
                        filterRange[1] === Infinity ? sliderMax : Math.min(sliderMax, filterRange[1])
                      ];
                      
                      // 计算显示的标签值：优先显示动态边界值
                      const displayMin = filterRange[0] <= 0 || filterRange[0] === -Infinity ? sliderMin : filterRange[0];
                      const displayMax = filterRange[1] === Infinity ? sliderMax : filterRange[1];
                      
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 120 }}>
                          <span style={{ fontSize: 10, color: textColor, opacity: 0.5, whiteSpace: 'nowrap' }}>
                            {config.formatValue(displayMin)}{filterDimension === 'pct_chg' ? '%' : ''}
                          </span>
                          <Slider
                            range
                            min={useLog ? logMin : sliderMin}
                            max={useLog ? logMax : sliderMax}
                            step={logStep}
                            value={sliderValue}
                            onChange={(values: number[]) => {
                              const [minVal, maxVal] = values;
                              let newRange: [number, number];
                              
                              if (useLog) {
                                // 对数刻度：将滑块值转换回真实值
                                const realMin = minVal <= logMin ? 0 : logToValue(minVal);
                                const realMax = maxVal >= logMax ? Infinity : logToValue(maxVal);
                                // 取整到合理的数值
                                newRange = [
                                  Math.round(realMin * 100) / 100,
                                  realMax === Infinity ? Infinity : Math.round(realMax * 100) / 100
                                ];
                              } else {
                                newRange = [
                                  minVal <= sliderMin ? (filterDimension === 'pct_chg' ? -Infinity : sliderMin) : minVal,
                                  maxVal >= sliderMax ? Infinity : maxVal
                                ];
                              }
                              
                              setFilterRange(newRange);
                              // pctRange 同步已在 setFilterRange 中处理
                            }}
                            style={{ flex: 1, margin: '0 4px' }}
                            tooltip={{ 
                              formatter: (val) => {
                                if (val === undefined) return '';
                                if (filterDimension === 'pct_chg') {
                                  return `${val}%`;
                                }
                                // 对数刻度：tooltip 显示真实值
                                const realVal = useLog ? logToValue(val) : val;
                                return config.formatValue(Math.round(realVal * 100) / 100);
                              }
                            }}
                          />
                          <span style={{ fontSize: 10, color: textColor, opacity: 0.5, whiteSpace: 'nowrap' }}>
                            {config.formatValue(displayMax)}{filterDimension === 'pct_chg' ? '%' : ''}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
              
              {/* 筛选状态栏 - 常驻显示所有维度的筛选条件 */}
              {(() => {
                const dims: FilterDimension[] = ['pct_chg', 'circ_mv', 'amount', 'close'];
                const allFilters: { dim: FilterDimension; label: string; isDefault: boolean }[] = [];
                
                for (const dim of dims) {
                  const range = dimensionRanges[dim];
                  const bounds = dynamicDimensionBounds[dim];
                  const isDefault = range[0] <= bounds.min && range[1] >= bounds.max;
                  const presets = dynamicPresets[dim];
                  const matchedPreset = presets.find(p => p.value[0] === range[0] && p.value[1] === range[1]);
                  const config = FILTER_DIMENSION_CONFIG[dim];
                  // 使用实际边界值替代Infinity
                  const displayMin = range[0] === -Infinity ? bounds.min : range[0];
                  const displayMax = range[1] === Infinity ? bounds.max : range[1];
                  const label = matchedPreset && !isDefault
                    ? `${config.label}=${matchedPreset.label}`
                    : `${config.label}=${config.formatValue(displayMin)}~${config.formatValue(displayMax)}`;
                  allFilters.push({ dim, label, isDefault });
                }
                
                const hasActiveFilter = allFilters.some(f => !f.isDefault);
                
                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    marginTop: 2,
                    paddingTop: 8,
                    borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 11, color: textColor, opacity: 0.6 }}>筛选:</span>
                    {allFilters.map(({ dim, label, isDefault }) => (
                      <span
                        key={dim}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 3,
                          background: isDefault 
                            ? (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
                            : (isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                          color: textColor,
                          opacity: isDefault ? 0.6 : 1,
                        }}
                      >
                        {label}
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => resetDimensionRange(dim)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 14,
                              height: 14,
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: textColor,
                              opacity: 0.5,
                              cursor: 'pointer',
                              fontSize: 12,
                              lineHeight: 1,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={resetAllRanges}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 3,
                          border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                          background: 'transparent',
                          color: textColor,
                          opacity: 0.7,
                          cursor: 'pointer',
                        }}
                      >
                        重置
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 日期对比模式 */}
          {statsMode === 'compare' ? (
            compareStats ? (
              <div>
                {/* 对比统计摘要 */}
                <StatsSummaryCard
                  title="日期对比"
                  total={computedCompareSummary.total}
                  up={computedCompareSummary.up}
                  down={computedCompareSummary.down}
                  flat={computedCompareSummary.flat}
                  isDarkTheme={isDarkTheme}
                  closeLabel={baseDate === compareDate ? periodLabels.intra : periodLabels.compare}
                  extendedStats={{
                    avgPctChg: computedCompareSummary.avg_pct_chg,
                    medianPctChg: computedCompareSummary.median_pct_chg,
                    winRate: computedCompareSummary.win_rate,
                    maxGain: computedCompareSummary.max_gain,
                    maxLoss: computedCompareSummary.max_loss,
                    limitUp: computedCompareSummary.limit_up,
                    limitDown: computedCompareSummary.limit_down,
                  }}
                />

                {/* 对比图表 */}
                <div style={{ marginTop: 8 }}>
                  <ChartControls
                    chartType={compareChartType}
                    setChartType={setCompareChartType}
                    availableChartTypes={['bar', 'pie', 'distribution', 'bubble', 'treemap']}
                    useLogScale={compareUseLogScale}
                    setUseLogScale={setCompareUseLogScale}
                    searchKeyword={searchKeyword}
                    setSearchKeyword={setSearchKeyword}
                    dataMetric={dataMetric}
                    setDataMetric={setDataMetric}
                    showDataMetricToggle={true}
                    isDarkTheme={isDarkTheme}
                    textColor={textColor}
                  />
                  <div style={{ position: 'relative', width: '100%', height: 320 }}>
                    <CompareChart
                      distribution={memoizedCompareDistribution}
                      items={memoizedCompareItems}
                      allItems={memoizedAllCompareItems}
                      isDarkTheme={isDarkTheme}
                      textColor={textColor}
                      chartType={compareChartType}
                      useLogScale={compareUseLogScale}
                      pieDataType={comparePieDataType}
                      dataMetric={dataMetric}
                      onChartClick={undefined}
                      height="100%"
                      breakpoints={breakpoints}
                      primaryLabel="涨跌幅"
                    />
                    {compareLoading && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: isDarkTheme ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
                      }}>
                        <Spin />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 60,
                color: isDarkTheme ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)',
              }}>
                请选择结束日期
              </div>
            )
          ) : (
          <>
          {/* 当日统计摘要 */}
          <StatsSummaryCard
            title="涨跌概况"
            total={computedSummary.total}
            up={computedSummary.up}
            down={computedSummary.down}
            flat={computedSummary.flat}
            isDarkTheme={isDarkTheme}
            closeLabel={periodLabels.close}
            intraLabel={periodLabels.intra}
            intradayStats={{
              up: computedSummary.intraday_up,
              down: computedSummary.intraday_down,
              flat: computedSummary.intraday_flat,
              limitUp: computedSummary.intraday_limit_up,
              limitDown: computedSummary.intraday_limit_down,
            }}
            extendedStats={{
              avgPctChg: 0,
              medianPctChg: 0,
              winRate: 0,
              maxGain: 0,
              maxLoss: 0,
              limitUp: computedSummary.limit_up,
              limitDown: computedSummary.limit_down,
            }}
          />
          <div style={{ marginTop: 8 }}>
            <ChartControls
              chartType={chartType}
              setChartType={setChartType}
              availableChartTypes={['bar', 'pie', 'distribution', 'bubble', 'treemap']}
              useLogScale={useLogScale}
              setUseLogScale={setUseLogScale}
              pieDataType={pieDataType}
              setPieDataType={setPieDataType}
              showPieDataTypeToggle={chartType === 'pie'}
              searchKeyword={searchKeyword}
              setSearchKeyword={setSearchKeyword}
              isDarkTheme={isDarkTheme}
              textColor={textColor}
            />
            
                        
            <div style={{ position: 'relative', width: '100%', height: 320 }}>
              <CompareChart
                distribution={memoizedDistribution}
                secondaryDistribution={memoizedSecondaryDistribution}
                items={memoizedChartItems}
                allItems={memoizedAllChartItems}
                isDarkTheme={isDarkTheme}
                textColor={textColor}
                chartType={chartType}
                useLogScale={useLogScale}
                pieDataType={pieDataType}
                onChartClick={handleMainChartClick}
                height="100%"
                breakpoints={breakpoints}
                primaryLabel={periodLabels.close}
                secondaryLabel={periodLabels.intra}
              />
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </Modal>

    {/* 开始日期日历选择弹窗 */}
    <TradingCalendarModal
      title="选择开始日期"
      open={baseCalendarOpen}
      onClose={() => setBaseCalendarOpen(false)}
      value={baseDate}
      onChange={setBaseDate}
      tradingDays={tradingDays}
      tradingDaysLoading={false}
      isDarkTheme={isDarkTheme}
      textColor={textColor}
      disableAfter={compareDate}
      validateDate={validateBaseDate}
      period={period}
    />

    {/* 结束日期日历选择弹窗 */}
    <TradingCalendarModal
      title="选择结束日期"
      open={calendarOpen}
      onClose={() => setCalendarOpen(false)}
      value={compareDate}
      onChange={setCompareDate}
      tradingDays={tradingDays}
      tradingDaysLoading={false}
      isDarkTheme={isDarkTheme}
      textColor={textColor}
      disableBefore={baseDate}
      validateDate={validateCompareDate}
      period={period}
    />
    
    </>
  );
};

export default StockStatsModal;
