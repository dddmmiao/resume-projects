import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Drawer, message } from 'antd';
import MobileCalendar from './MobileCalendar.tsx';
import { getThemeColors, type Theme } from './theme.ts';
import { authFetch } from '../../utils/authFetch.ts';
import { useAppStore } from '../../stores/useAppStore.ts';
import StatsSummaryCard from '../StockStatsModal/StatsSummaryCard.tsx';
import CompareChart from '../StockStatsModal/CompareChart.tsx';
import type { CompareStats, StockStatsItem, StockStats } from '../StockStatsModal/types.ts';
import { ExtendedChartType, CHART_TYPE_LABELS } from '../StockStatsModal/ChartControls.tsx';
import { ToolbarButton } from './ToolbarButton.tsx';
import { SelectionDrawer } from './SelectionDrawer.tsx';
import { FilterDrawer } from './FilterDrawer.tsx';
import { amountToYi, marketValueToYi } from './utils.ts';
import { 
  DEFAULT_BREAKPOINTS, 
  generateRangeLabels, 
  getBucketIndexDynamic,
  filterItemsByRange,
  computePctBucketsWithItems,
  computeFilteredDistribution,
  computeSecondaryDistribution,
  computeDefaultCompareDate,
  computeDailySummary,
  computeCompareSummary,
  getCompareStatsApiUrl,
  buildCompareStatsRequestBody,
  PERIOD_LABELS,
  FilterDimension,
  FILTER_DIMENSION_CONFIG,
  computeDynamicPresets,
} from '../StockStatsModal/constants.ts';
import { filterItemsByDimension } from '../StockStatsModal/filterUtils.ts';
import StatsSkeleton from '../StockStatsModal/StatsSkeleton.tsx';

// 图表类型配置（从 CHART_TYPE_LABELS 转换为数组格式）
const CHART_TYPES = (Object.entries(CHART_TYPE_LABELS) as [ExtendedChartType, string][]).map(
  ([value, label]) => ({ label, value })
);

interface StatsModalProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  stats: StockStats | null;
  loading: boolean;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  tradeDate?: string;  // 当前交易日期 YYYYMMDD
  period?: 'daily' | 'weekly' | 'monthly';  // 当前周期
  // 筛选条件（用于对比统计请求）
  industries?: string[];
  concepts?: string[];
  search?: string;
  tsCodes?: string[];
}

export const StatsModal: React.FC<StatsModalProps> = ({
  theme,
  open,
  onClose,
  stats,
  loading,
  dataType,
  tradeDate,
  period = 'daily',
  industries,
  concepts,
  search,
  tsCodes,
}) => {
  // 获取当前周期的文案
  const periodLabels = PERIOD_LABELS[period];
  const currentTheme = getThemeColors(theme);
  const [chartType, setChartType] = useState<ExtendedChartType>('bar');
  const [dataMode, setDataMode] = useState<'close' | 'intraday' | 'both'>('both');
  const [useLogScale, setUseLogScale] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState(''); // 搜索关键词（气泡图/树图）
  // 多维度筛选
  const [filterDimension, setFilterDimension] = useState<FilterDimension>('pct_chg');
  const [dimensionRanges, setDimensionRanges] = useState<Record<FilterDimension, [number, number]>>({
    pct_chg: [-Infinity, Infinity],
    circ_mv: [0, Infinity],
    amount: [0, Infinity],
    close: [0, Infinity],
  });
  // 兼容旧的 rangeFilter（涨跌幅范围，用于分布图）
  const rangeFilter = dimensionRanges.pct_chg;
  // 抽屉状态
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [chartTypeDrawerOpen, setChartTypeDrawerOpen] = useState(false);

  // 当图表类型改变时，如果新类型不支持'both'，自动调整为'close'
  // 只有bar支持三态（收盘/日内/两者），其他图表只支持两态
  useEffect(() => {
    const supportsThreeState = chartType === 'bar';
    if (!supportsThreeState && dataMode === 'both') {
      setDataMode('close');
    }
  }, [chartType, dataMode]);

  // 使用全局交易日历
  const tradingDays = useAppStore(state => state.tradingDays);
  const loadTradingDays = useAppStore(state => state.loadTradingDays);

  // 日期对比相关状态
  const [statsMode, setStatsMode] = useState<'daily' | 'compare'>('daily');
  const [baseDate, setBaseDate] = useState<string>(tradeDate || ''); // 开始日期，默认当前日期
  const [compareDate, setCompareDate] = useState<string>('');
  const [baseDateDrawerOpen, setBaseDateDrawerOpen] = useState(false); // 开始日期抽屉
  const [compareDateDrawerOpen, setCompareDateDrawerOpen] = useState(false); // 结束日期抽屉
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  // 对比图表的独立控制状态
  const [compareChartType, setCompareChartType] = useState<ExtendedChartType>('bar');
  const [compareUseLogScale, setCompareUseLogScale] = useState(false);
  // 数据维度切换（日期对比模式：区间涨跌/最大涨幅/最大回撤）
  const [dataMetric, setDataMetric] = useState<'pct_chg' | 'max_pct' | 'min_pct'>('pct_chg');

  const fullscreenClassName = open ? 'mobile-detail-fullscreen' : '';

  // 加载交易日历
  useEffect(() => {
    if (open && tradingDays.length === 0) {
      loadTradingDays();
    }
  }, [open, tradingDays.length, loadTradingDays]);

  // 当tradeDate变化时，同步更新baseDate和compareDate（与桌面端一致）
  useEffect(() => {
    if (tradeDate) {
      setBaseDate(tradeDate);
      setCompareDate(computeDefaultCompareDate(tradeDate, tradingDays));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeDate]);

  // 当tradingDays加载完成后，如果compareDate还没设置，则计算默认值
  useEffect(() => {
    if (baseDate && tradingDays.length > 0 && !compareDate) {
      setCompareDate(computeDefaultCompareDate(baseDate, tradingDays));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradingDays]);

  // 获取日期对比统计
  const fetchCompareStats = async (baseDt: string, compareDt: string) => {
    if (!baseDt || !compareDt) return;
    
    setCompareLoading(true);
    try {
      const requestBody = buildCompareStatsRequestBody({
        baseDate: baseDt,
        compareDate: compareDt,
        entityType: dataType,
        period,
        industries,
        concepts,
        search,
        tsCodes,
      });

      const url = getCompareStatsApiUrl(dataType);

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

  // 当对比日期、筛选条件或标的类型变化时，自动请求（只在modal打开时）
  useEffect(() => {
    // 先清空旧数据，避免切换标的类型时显示旧数据
    setCompareStats(null);
    if (open && baseDate && compareDate) {
      fetchCompareStats(baseDate, compareDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseDate, compareDate, industries, concepts, search, tsCodes, dataType]);

  // 动态计算各维度的边界值（基于实际数据）
  const dynamicDimensionBounds = useMemo(() => {
    const items = statsMode === 'compare' ? compareStats?.items : stats?.items;
    if (!items || items.length === 0) {
      return {
        pct_chg: { min: -15, max: 15 },
        circ_mv: { min: 0, max: 10000 },
        amount: { min: 0, max: 100 },
        close: { min: 0, max: 500 },
      };
    }
    
    const pctValues = items.map((i: any) => i.pct_chg ?? 0);
    const circMvValues = items.map((i: any) => marketValueToYi(i.circ_mv)).filter((v: number) => v > 0);
    const amountValues = items.map((i: any) => amountToYi(i.amount)).filter((v: number) => v > 0);
    const closeValues = items.map((i: any) => i.close ?? 0).filter((v: number) => v > 0);
    
    const getBounds = (values: number[], precision: number = 1) => {
      if (values.length === 0) return { min: 0, max: 100 };
      const sorted = [...values].sort((a, b) => a - b);
      const factor = Math.pow(10, precision);
      return {
        min: Math.floor(sorted[0] * factor) / factor,
        max: Math.ceil(sorted[sorted.length - 1] * factor) / factor,
      };
    };
    
    return {
      pct_chg: getBounds(pctValues, 1),
      circ_mv: circMvValues.length > 0 ? getBounds(circMvValues, 1) : { min: 0, max: 10000 },
      amount: amountValues.length > 0 ? getBounds(amountValues, 1) : { min: 0, max: 100 },
      close: closeValues.length > 0 ? getBounds(closeValues, 1) : { min: 0, max: 500 },
    };
  }, [stats?.items, compareStats?.items, statsMode]);

  // 动态预设（基于数据分位数）
  const dynamicPresets = useMemo(() => {
    const items = statsMode === 'compare' ? compareStats?.items : stats?.items;
    if (!items || items.length === 0) {
      return {
        pct_chg: FILTER_DIMENSION_CONFIG.pct_chg.presets,
        circ_mv: FILTER_DIMENSION_CONFIG.circ_mv.presets,
        amount: FILTER_DIMENSION_CONFIG.amount.presets,
        close: FILTER_DIMENSION_CONFIG.close.presets,
      };
    }
    
    const circMvValues = items.map((i: any) => marketValueToYi(i.circ_mv));
    const amountValues = items.map((i: any) => amountToYi(i.amount));
    const closeValues = items.map((i: any) => i.close ?? 0);
    
    return {
      pct_chg: FILTER_DIMENSION_CONFIG.pct_chg.presets,
      circ_mv: computeDynamicPresets(circMvValues, 'circ_mv'),
      amount: computeDynamicPresets(amountValues, 'amount'),
      close: computeDynamicPresets(closeValues, 'close'),
    };
  }, [stats?.items, compareStats?.items, statsMode]);

  // 重置单个维度范围
  const resetDimensionRange = useCallback((dim: FilterDimension) => {
    const bounds = dynamicDimensionBounds[dim];
    const defaultRange: [number, number] = [bounds.min, bounds.max];
    setDimensionRanges(prev => ({ ...prev, [dim]: defaultRange }));
  }, [dynamicDimensionBounds]);

  // 重置所有维度范围
  const resetAllRanges = useCallback(() => {
    setDimensionRanges({
      pct_chg: [dynamicDimensionBounds.pct_chg.min, dynamicDimensionBounds.pct_chg.max],
      circ_mv: [dynamicDimensionBounds.circ_mv.min, dynamicDimensionBounds.circ_mv.max],
      amount: [dynamicDimensionBounds.amount.min, dynamicDimensionBounds.amount.max],
      close: [dynamicDimensionBounds.close.min, dynamicDimensionBounds.close.max],
    });
  }, [dynamicDimensionBounds]);

  // 当前维度的筛选范围
  const filterRange = dimensionRanges[filterDimension];
  const setFilterDimensionRange = useCallback((range: [number, number]) => {
    setDimensionRanges(prev => ({ ...prev, [filterDimension]: range }));
  }, [filterDimension]);

  // 所有维度的筛选状态（常驻显示）
  const allFilters = useMemo(() => {
    const filters: { dim: FilterDimension; label: string; isDefault: boolean }[] = [];
    const dims: FilterDimension[] = ['pct_chg', 'circ_mv', 'amount', 'close'];
    
    for (const dim of dims) {
      const range = dimensionRanges[dim];
      const bounds = dynamicDimensionBounds[dim];
      const isDefault = range[0] <= bounds.min && range[1] >= bounds.max;
      const presets = dynamicPresets[dim];
      const matchedPreset = presets.find((p: any) => p.value[0] === range[0] && p.value[1] === range[1]);
      const config = FILTER_DIMENSION_CONFIG[dim];
      // 使用实际边界值替代Infinity
      const displayMin = range[0] === -Infinity ? bounds.min : range[0];
      const displayMax = range[1] === Infinity ? bounds.max : range[1];
      const label = matchedPreset && !isDefault
        ? `${config.label}=${matchedPreset.label}`
        : `${config.label}=${config.formatValue(displayMin)}~${config.formatValue(displayMax)}`;
      filters.push({ dim, label, isDefault });
    }
    return filters;
  }, [dimensionRanges, dynamicDimensionBounds, dynamicPresets]);

  // 判断是否有激活的筛选
  const hasActiveFilter = useMemo(() => allFilters.some(f => !f.isDefault), [allFilters]);

  // computedSummary 和 computedCompareSummary 移至 memoizedItems 之后定义

  // 计算分布桶（使用共享函数，保存items用于范围筛选优化）
  const computedPctBuckets = useMemo(() => {
    if (!stats?.items || stats.items.length === 0) {
      return generateRangeLabels(DEFAULT_BREAKPOINTS).map(range => ({
        range, count: 0, intraday_count: 0, items: [] as StockStatsItem[]
      }));
    }
    return computePctBucketsWithItems(stats.items, DEFAULT_BREAKPOINTS);
  }, [stats?.items]);

  // 收盘分布数据（使用共享函数）
  const memoizedDistribution = useMemo(() => {
    return computeFilteredDistribution(computedPctBuckets, rangeFilter);
  }, [computedPctBuckets, rangeFilter]);

  // 日内分布数据（使用共享函数）
  const memoizedSecondaryDistribution = useMemo(() => {
    return computeSecondaryDistribution(computedPctBuckets, rangeFilter, DEFAULT_BREAKPOINTS);
  }, [computedPctBuckets, rangeFilter]);

  // 从compareStats.items计算分布（应用范围筛选，与桌面端一致）- 支持dataMetric切换
  const computedCompareDistribution = useMemo(() => {
    const rangeLabels = generateRangeLabels(DEFAULT_BREAKPOINTS);
    if (!compareStats?.items || compareStats.items.length === 0) {
      return rangeLabels.map(range => ({ range, count: 0 }));
    }
    
    // 根据dataMetric选择分桶依据的值
    const getMetricValue = (item: any): number => {
      if (dataMetric === 'max_pct' && item.max_pct !== undefined) return item.max_pct;
      if (dataMetric === 'min_pct' && item.min_pct !== undefined) return item.min_pct;
      return item.pct_chg;
    };
    
    // 使用共享函数筛选
    const filteredItems = filterItemsByRange(compareStats.items, rangeFilter, getMetricValue);
    
    // 分桶计算
    const buckets = rangeLabels.map(range => ({ range, count: 0 }));
    filteredItems.forEach((item: any) => {
      const idx = getBucketIndexDynamic(getMetricValue(item) || 0, DEFAULT_BREAKPOINTS);
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].count++;
      }
    });
    
    return buckets;
  }, [compareStats?.items, rangeFilter, dataMetric]);

  // 为 CompareChart 准备 items 数据 - 使用共享多维度筛选函数
  const memoizedItems = useMemo(() => {
    if (!stats?.items || stats.items.length === 0) return [];
    const allItems = stats.items.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg ?? 0,
      open: item.open ?? 0,  // 开盘价
      close: item.close ?? 0,
      amount: item.amount ?? 0,
      intraday_pct: item.intraday_pct ?? 0,
      circ_mv: item.circ_mv ?? 0,
    }));
    
    return filterItemsByDimension(allItems, {
      pctRange: rangeFilter,
      filterDimension,
      filterRange,
      dynamicBounds: dynamicDimensionBounds[filterDimension],
      allDimensionRanges: dimensionRanges,
      allDynamicBounds: dynamicDimensionBounds,
      searchKeyword,
    });
  }, [stats?.items, rangeFilter, filterDimension, filterRange, dimensionRanges, dynamicDimensionBounds, searchKeyword]);

  // 全量原始数据（不经过任何筛选，用于坐标轴范围计算）
  const memoizedAllItems = useMemo(() => {
    if (!stats?.items || stats.items.length === 0) return [];
    return stats.items.map(item => ({
      code: item.code,
      name: item.name,
      pct_chg: item.pct_chg ?? 0,
      open: item.open ?? 0,  // 开盘价
      close: item.close ?? 0,
      amount: item.amount ?? 0,
      intraday_pct: item.intraday_pct ?? 0,
      circ_mv: item.circ_mv ?? 0,
    }));
  }, [stats?.items]);

  // 为对比图表准备 items 数据 - 使用共享多维度筛选函数
  const memoizedCompareItems = useMemo(() => {
    if (!compareStats?.items || compareStats.items.length === 0) return [];
    const allItems = compareStats.items.map((item: any) => ({
      code: item.code || item.ts_code || '',
      name: item.name || '',
      pct_chg: item.pct_chg ?? 0,
      open: item.open ?? 0,  // A日开盘价
      close: item.close ?? 0,
      amount: item.amount ?? 0,
      circ_mv: item.circ_mv ?? 0,
      max_pct: item.max_pct,
      min_pct: item.min_pct,
      high_price: item.high_price,  // 区间最高价
      low_price: item.low_price,  // 区间最低价
    }));
    
    return filterItemsByDimension(allItems, {
      pctRange: rangeFilter,
      filterDimension,
      filterRange,
      dynamicBounds: dynamicDimensionBounds[filterDimension],
      allDimensionRanges: dimensionRanges,
      allDynamicBounds: dynamicDimensionBounds,
      searchKeyword,
    });
  }, [compareStats?.items, rangeFilter, filterDimension, filterRange, dimensionRanges, dynamicDimensionBounds, searchKeyword]);

  // 对比图表全量原始数据（不经过任何筛选，用于坐标轴范围计算）
  const memoizedAllCompareItems = useMemo(() => {
    if (!compareStats?.items || compareStats.items.length === 0) return [];
    return compareStats.items.map((item: any) => ({
      code: item.code || item.ts_code || '',
      name: item.name || '',
      pct_chg: item.pct_chg ?? 0,
      open: item.open ?? 0,  // A日开盘价
      close: item.close ?? 0,
      amount: item.amount ?? 0,
      circ_mv: item.circ_mv ?? 0,
      max_pct: item.max_pct,
      min_pct: item.min_pct,
      high_price: item.high_price,  // 区间最高价
      low_price: item.low_price,  // 区间最低价
    }));
  }, [compareStats?.items]);

  // 从已筛选的items计算summary（跟随所有维度筛选变化）
  const computedSummary = useMemo(() => {
    const items = memoizedItems.map(item => ({
      ...item,
      intraday_pct: (item as any).intraday_pct ?? 0,
    })) as StockStatsItem[];
    return computeDailySummary(items, [-Infinity, Infinity]);
  }, [memoizedItems]);

  // 从已筛选的compareItems计算compare summary
  const computedCompareSummary = useMemo(() => 
    computeCompareSummary(memoizedCompareItems, [-Infinity, Infinity]),
  [memoizedCompareItems]);

  // CompareChart 组件内部管理图表实例，无需额外处理

  return (
    <Drawer
      title={null}
      placement="bottom"
      height="100vh"
      className={`${fullscreenClassName} ${theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}`}
      rootClassName={fullscreenClassName || undefined}
      open={open}
      onClose={onClose}
      closable={false}
      push={false}
      afterOpenChange={(visible) => {
        // 图表实例已持久化，无需特殊处理
      }}
      styles={{
        header: {
          display: 'none',
        },
        body: {
          background: currentTheme.bg,
          padding: '16px',
        },
      }}
    >
      {loading ? (
        <StatsSkeleton isDarkTheme={theme !== 'light'} isMobile />
      ) : stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0',
              marginBottom: -4,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: currentTheme.text,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              涨跌分布统计
              <span style={{
                fontSize: 12,
                padding: '2px 4px',
                borderRadius: 4,
                background: theme === 'light' ? 'rgba(24,144,255,0.1)' : 'rgba(24,144,255,0.2)',
                color: theme === 'light' ? '#1890ff' : '#69c0ff',
                fontWeight: 500,
              }}>
                {period === 'weekly' ? '周线' : period === 'monthly' ? '月线' : '日线'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: currentTheme.textSecondary,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* 统计模式切换 + 范围按钮 */}
          {(dataType === 'stock' || dataType === 'convertible_bond' || dataType === 'concept' || dataType === 'industry') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ToolbarButton
                  theme={theme}
                  onClick={() => setStatsMode(statsMode === 'daily' ? 'compare' : 'daily')}
                >
                  {statsMode === 'daily' ? `${periodLabels.current}统计` : '日期对比'}
                </ToolbarButton>
                {statsMode === 'compare' && (
                  <>
                    <ToolbarButton
                      theme={theme}
                      onClick={() => setBaseDateDrawerOpen(true)}
                    >
                      {baseDate ? `${baseDate.slice(4, 6)}/${baseDate.slice(6, 8)}` : '开始'}
                    </ToolbarButton>
                    <span style={{ fontSize: 12, color: currentTheme.textSecondary }}>→</span>
                    <ToolbarButton
                      theme={theme}
                      onClick={() => setCompareDateDrawerOpen(true)}
                    >
                      {compareDate ? `${compareDate.slice(4, 6)}/${compareDate.slice(6, 8)}` : '结束'}
                    </ToolbarButton>
                  </>
                )}
              </div>
              {/* 筛选按钮 - 显示筛选条件数量 */}
              <ToolbarButton
                theme={theme}
                onClick={() => setFilterDrawerOpen(true)}
              >
                {hasActiveFilter ? `筛选(${allFilters.filter(f => !f.isDefault).length})` : '筛选'}
              </ToolbarButton>
            </div>
          )}

          {/* 筛选状态栏 - 常驻显示所有维度的筛选条件 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0px 6px',
            background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 6,
            flexWrap: 'wrap',
            rowGap: 2,
          }}>
            <span style={{ fontSize: 11, color: currentTheme.textSecondary, flexShrink: 0 }}>筛选:</span>
            {allFilters.map(({ dim, label, isDefault }) => (
              <span
                key={dim}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 11,
                  padding: '0px 4px',
                  borderRadius: 3,
                  background: isDefault 
                    ? (theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
                    : (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                  color: currentTheme.text,
                  opacity: isDefault ? 0.6 : 1,
                  whiteSpace: 'nowrap',
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
                      width: 12,
                      height: 12,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: currentTheme.text,
                      opacity: 0.5,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
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
                  padding: '0px 6px',
                  borderRadius: 3,
                  border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                  background: 'transparent',
                  color: currentTheme.text,
                  opacity: 0.7,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                重置
              </button>
            )}
          </div>

          {/* 日期对比模式下的统计摘要 */}
          {statsMode === 'compare' ? (
            compareLoading ? (
              <StatsSkeleton isDarkTheme={theme !== 'light'} isMobile />
            ) : compareStats ? (
              <>
                <StatsSummaryCard
                  title="日期对比"
                  total={computedCompareSummary.total}
                  up={computedCompareSummary.up}
                  down={computedCompareSummary.down}
                  flat={computedCompareSummary.flat}
                  isDarkTheme={theme !== 'light'}
                  textColor={currentTheme.text}
                  textSecondaryColor={currentTheme.textSecondary}
                  cardBgColor={currentTheme.card}
                  borderColor={currentTheme.border}
                  progressBgColor={theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'}
                  flatColor={currentTheme.textSecondary}
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

                {/* 控制选项：与当日统计保持一致 */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                  flexWrap: 'wrap',
                }}>
                  <ToolbarButton
                    theme={theme}
                    onClick={() => setChartTypeDrawerOpen(true)}
                  >
                    {CHART_TYPES.find(t => t.value === compareChartType)?.label || '柱状'}
                  </ToolbarButton>
                  {(compareChartType === 'bar' || compareChartType === 'bubble') && (
                    <ToolbarButton theme={theme} onClick={() => setCompareUseLogScale(!compareUseLogScale)}>
                      {compareUseLogScale ? '对数' : '线性'}
                    </ToolbarButton>
                  )}
                  {/* 数据维度切换：区间涨跌/最大涨幅/最大回撤 */}
                  <ToolbarButton
                    theme={theme}
                    onClick={() => {
                      if (dataMetric === 'pct_chg') setDataMetric('max_pct');
                      else if (dataMetric === 'max_pct') setDataMetric('min_pct');
                      else setDataMetric('pct_chg');
                    }}
                  >
                    {dataMetric === 'max_pct' ? '最大涨幅' : dataMetric === 'min_pct' ? '最大回撤' : '区间涨跌'}
                  </ToolbarButton>
                </div>

                {/* 对比图表 */}
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  background: currentTheme.card,
                  borderRadius: 8,
                  border: `1px solid ${currentTheme.border}`,
                  position: 'relative',
                }}>
                  <CompareChart
                    key={`compare-${compareChartType}-${dataMetric}`}
                    distribution={computedCompareDistribution}
                    items={memoizedCompareItems}
                    allItems={memoizedAllCompareItems}
                    isDarkTheme={theme === 'dark'}
                    textColor={currentTheme.text}
                    borderColor={currentTheme.border}
                    chartType={compareChartType}
                    useLogScale={compareUseLogScale}
                    dataMetric={dataMetric}
                    height="100%"
                    gridConfig={{ left: '12%', right: '4%', top: '10%', bottom: '12%' }}
                    xAxisLabelRotate={0}
                    pieRadius={['30%', '60%']}
                    pieCenter={['50%', '55%']}
                    pieLegendPosition="top"
                  />
                </div>
              </>
            ) : (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 40,
                color: currentTheme.textSecondary,
              }}>
                请选择结束日期
              </div>
            )
          ) : (
            <>
          {/* 统计摘要：使用共享组件 */}
          <StatsSummaryCard
            title="涨跌概况"
            total={computedSummary.total}
            up={computedSummary.up}
            down={computedSummary.down}
            flat={computedSummary.flat}
            isDarkTheme={theme !== 'light'}
            textColor={currentTheme.text}
            textSecondaryColor={currentTheme.textSecondary}
            cardBgColor={currentTheme.card}
            borderColor={currentTheme.border}
            progressBgColor={theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'}
            flatColor={currentTheme.textSecondary}
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

          {/* 控制行：收盘/日内 + 图表类型 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}>
            {/* 日内/收盘切换（仅柱状图和饼图显示） */}
            {(chartType === 'bar' || chartType === 'pie') && (
              <ToolbarButton
                theme={theme}
                onClick={() => {
                  // 三态切换：两者 -> 收盘 -> 日内 -> 两者
                  if (dataMode === 'both') setDataMode('close');
                  else if (dataMode === 'close') setDataMode('intraday');
                  else setDataMode('both');
                }}
              >
                {dataMode === 'both' ? `${periodLabels.close}+${periodLabels.intra}` : dataMode === 'close' ? periodLabels.close : periodLabels.intra}
              </ToolbarButton>
            )}
            <ToolbarButton
              theme={theme}
              onClick={() => setChartTypeDrawerOpen(true)}
            >
              {CHART_TYPES.find(t => t.value === chartType)?.label || '柱状'}
            </ToolbarButton>
            {/* 对数切换（仅柱状图和气泡图显示） */}
            {(chartType === 'bar' || chartType === 'bubble') && (
              <ToolbarButton theme={theme} onClick={() => setUseLogScale(!useLogScale)}>
                {useLogScale ? '对数' : '线性'}
              </ToolbarButton>
            )}
            {/* 搜索框（仅气泡图和树图显示） */}
            {(chartType === 'bubble' || chartType === 'treemap') && (
              <input
                type="text"
                placeholder="搜索"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 6,
                  background: currentTheme.card,
                  border: `1px solid ${currentTheme.border}`,
                  color: currentTheme.text,
                  fontSize: 13,
                  fontWeight: 500,
                  width: 80,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            )}
          </div>

          {/* 图表 */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: currentTheme.card,
              borderRadius: 8,
              border: `1px solid ${currentTheme.border}`,
              position: 'relative',
            }}
          >
            <CompareChart
              key={`daily-${chartType}`}
              distribution={dataMode === 'intraday' 
                ? memoizedSecondaryDistribution
                : memoizedDistribution
              }
              secondaryDistribution={dataMode === 'both' 
                ? memoizedSecondaryDistribution
                : undefined
              }
              items={memoizedItems}
              allItems={memoizedAllItems}
              isDarkTheme={theme === 'dark'}
              textColor={currentTheme.text}
              borderColor={currentTheme.border}
              chartType={chartType}
              useLogScale={useLogScale}
              pieDataType={dataMode === 'both' ? 'close' : dataMode}
              height="100%"
              gridConfig={{ left: '13%', right: '4%', top: '12%', bottom: '14%' }}
              xAxisLabelRotate={0}
              pieRadius={['30%', '65%']}
              pieCenter={['50%', '55%']}
              pieLegendPosition="top"
              hideDataModeToggle={true}
            />
          </div>
          </>
          )}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: currentTheme.textSecondary,
        }}>
          暂无数据
        </div>
      )}

      {/* 对比日期选择抽屉 */}
      <Drawer
        title="选择结束日期"
        placement="bottom"
        height="70%"
        open={compareDateDrawerOpen}
        onClose={() => setCompareDateDrawerOpen(false)}
        className={theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}
        zIndex={10250}
        destroyOnClose={true}
        maskStyle={{ 
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)'
        }}
        styles={{
          body: {
            padding: '0',
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff'
          },
          header: {
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#d9d9d9'}`,
            color: theme === 'dark' ? '#ffffff' : '#000000'
          },
          wrapper: {
            borderRadius: '16px 16px 0 0',
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            overflow: 'hidden'
          }
        }}
      >
        <MobileCalendar
          theme={theme}
          selectedDate={compareDate}
          onDateChange={(date) => {
            setCompareDate(date);
            setCompareDateDrawerOpen(false);
          }}
          onClose={() => setCompareDateDrawerOpen(false)}
          minDate={baseDate}
          period={period}
          tradingDays={tradingDays}
        />
      </Drawer>

      {/* 开始日期选择抽屉 */}
      <Drawer
        title="选择开始日期"
        placement="bottom"
        height="70%"
        open={baseDateDrawerOpen}
        onClose={() => setBaseDateDrawerOpen(false)}
        className={theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}
        zIndex={10250}
        destroyOnClose={true}
        maskStyle={{ 
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)'
        }}
        styles={{
          body: {
            padding: '0',
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff'
          },
          header: {
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#d9d9d9'}`,
            color: theme === 'dark' ? '#ffffff' : '#000000'
          },
          wrapper: {
            borderRadius: '16px 16px 0 0',
            background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            overflow: 'hidden'
          }
        }}
      >
        <MobileCalendar
          theme={theme}
          selectedDate={baseDate}
          onDateChange={(date) => {
            setBaseDate(date);
            setBaseDateDrawerOpen(false);
            // 如果新的开始日期大于等于结束日期，重新计算结束日期
            if (compareDate && date >= compareDate) {
              setCompareDate(computeDefaultCompareDate(date, tradingDays));
            }
          }}
          onClose={() => setBaseDateDrawerOpen(false)}
          maxDate={compareDate}
          period={period}
          tradingDays={tradingDays}
        />
      </Drawer>

      {/* 合并的筛选抽屉 - 维度选择 + 范围调整 */}
      <FilterDrawer
        theme={theme}
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filterDimension={filterDimension}
        onDimensionChange={setFilterDimension}
        filterRange={filterRange}
        onRangeChange={setFilterDimensionRange}
        presets={dynamicPresets[filterDimension]}
        sliderMin={dynamicDimensionBounds[filterDimension].min}
        sliderMax={dynamicDimensionBounds[filterDimension].max}
        sliderStep={FILTER_DIMENSION_CONFIG[filterDimension].step}
      />

      {/* 图表类型选择抽屉 */}
      <SelectionDrawer
        theme={theme}
        title="选择图表类型"
        open={chartTypeDrawerOpen}
        onClose={() => setChartTypeDrawerOpen(false)}
        options={CHART_TYPES.map(item => ({
          key: item.value,
          label: item.label,
          value: item.value,
        }))}
        selectedValue={statsMode === 'compare' ? compareChartType : chartType}
        valueKey="key"
        disableScrollLock={true}
        onSelect={(option) => {
          if (statsMode === 'compare') {
            setCompareChartType(option.value as ExtendedChartType);
          } else {
            setChartType(option.value as ExtendedChartType);
          }
        }}
      />

    </Drawer>
  );
};

export default StatsModal;
