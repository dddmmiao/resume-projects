import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import { NEG_COLORS, POS_COLORS, UP_COLOR, DOWN_COLOR, getRangeType, getColorByPctChg, symlogTransform, symlogInverse, SYMLOG_THRESHOLD } from './constants.ts';
import type { ExtendedChartType } from './ChartControls.tsx';
import { formatAmount } from '../mobile/utils.ts';

// 树图筛选配置：只用 topN 200
const TREEMAP_TOP_N = 200;

// 树图筛选：只保留 Top N 有意义的数据点
const filterTreemapItems = <T extends { pct_chg: number; amount: number }>(
  items: T[]
): T[] => {
  if (!items || items.length <= TREEMAP_TOP_N) return items;
  
  const result = new Set<T>();
  
  // 1. 涨跌停股必须保留（绝对值≥9.9%）
  items.filter(item => Math.abs(item.pct_chg) >= 9.9).forEach(item => result.add(item));
  
  // 2. 成交额 Top N
  const sortedByAmount = [...items].sort((a, b) => b.amount - a.amount);
  sortedByAmount.slice(0, TREEMAP_TOP_N).forEach(item => result.add(item));
  
  // 3. 涨幅 Top N
  const sortedByPctDesc = [...items].sort((a, b) => b.pct_chg - a.pct_chg);
  sortedByPctDesc.slice(0, TREEMAP_TOP_N).forEach(item => result.add(item));
  
  // 4. 跌幅 Top N
  sortedByPctDesc.slice(-TREEMAP_TOP_N).forEach(item => result.add(item));
  
  return Array.from(result);
};

// 辅助函数：将 HEX 颜色转换为 RGBA
const hexToRgba = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// 单个对比项数据
export interface CompareItemData {
  code: string;
  name: string;
  pct_chg: number;
  open?: number; // A日开盘价
  close: number;
  amount: number;
  intraday_pct?: number; // 日内振幅
  circ_mv?: number; // 流通市值(万元)，用于气泡图大小
  max_pct?: number; // 区间最大涨幅
  min_pct?: number; // 区间最大回撤
  high_price?: number; // 区间最高价
  low_price?: number; // 区间最低价
}

export interface CompareChartProps {
  /** 分布数据（主数据，如收盘） */
  distribution: { range: string; count: number }[];
  /** 次要分布数据（如日内），用于双柱状图 */
  secondaryDistribution?: { range: string; count: number }[];
  /** 原始items数据（用于气泡图） */
  items?: CompareItemData[];
  /** 全量items数据（用于气泡图坐标轴范围计算，搜索时不缩放坐标轴） */
  allItems?: CompareItemData[];
  /** 是否深色主题 */
  isDarkTheme: boolean;
  /** 文字颜色 */
  textColor: string;
  /** 边框颜色 */
  borderColor?: string;
  /** 图表类型 */
  chartType: ExtendedChartType;
  /** 是否使用对数坐标 */
  useLogScale: boolean;
  /** 数据类型：收盘、日内或两者 */
  pieDataType?: 'close' | 'intraday' | 'both';
  /** 图表点击回调 */
  onChartClick?: (rangeLabel: string, dataIndex: number) => void;
  /** 图表高度 */
  height?: number | string;
  /** 柱状图grid配置 */
  gridConfig?: {
    left?: number | string;
    right?: number | string;
    top?: number | string;
    bottom?: number | string;
  };
  /** x轴标签旋转角度 */
  xAxisLabelRotate?: number;
  /** 饼图半径配置 */
  pieRadius?: [string, string];
  /** 饼图中心位置 */
  pieCenter?: [string, string];
  /** 断点数组（用于气泡图x轴范围） */
  breakpoints?: number[];
  /** 主数据标签 */
  primaryLabel?: string;
  /** 次要数据标签 */
  secondaryLabel?: string;
  /** 饼图图例位置 */
  pieLegendPosition?: 'right' | 'top';
  /** 隐藏收盘/日内切换按钮 */
  hideDataModeToggle?: boolean;
  /** 数据维度：区间涨跌/最大涨幅/最大回撤（日期对比模式） */
  dataMetric?: 'pct_chg' | 'max_pct' | 'min_pct';
}


const CompareChart: React.FC<CompareChartProps> = React.memo(({
  distribution,
  secondaryDistribution,
  items = [],
  allItems,
  isDarkTheme,
  textColor,
  borderColor,
  chartType,
  useLogScale,
  pieDataType = 'close',
  onChartClick,
  height = '100%',
  gridConfig,
  xAxisLabelRotate = 0,
  pieRadius = ['35%', '70%'],
  pieCenter = ['45%', '50%'],
  breakpoints = [-10, -7, -5, -3, 0, 3, 5, 7, 10],
  primaryLabel = '收盘',
  secondaryLabel = '日内',
  pieLegendPosition = 'right',
  hideDataModeToggle = false,
  dataMetric = 'pct_chg',
}) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  // 用于在容器尺寸无效时触发延迟重试（如 Modal 动画期间）
  const [retryCount, setRetryCount] = useState(0);

  const defaultBorderColor = isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  const border = borderColor || defaultBorderColor;

  // 只对树图应用筛选，气泡图渲染全部数据
  const filteredItems = useMemo(() => {
    if (chartType === 'treemap') {
      return filterTreemapItems(items);
    }
    return items;
  }, [items, chartType]);

  useEffect(() => {
    // 检查 DOM 是否已准备好
    if (!chartRef.current) return;
    
    // 对于需要items的图表类型，检查items是否有效
    const needsItems = chartType === 'treemap' || chartType === 'bubble' || chartType === 'distribution';
    if (needsItems && (!items || items.length === 0)) return;
    
    // 对于需要distribution的图表类型，检查distribution是否有效
    const needsDistribution = chartType === 'bar' || chartType === 'pie';
    if (needsDistribution && (!distribution || distribution.length === 0)) return;
    
    // 检查容器是否有有效尺寸
    const rect = chartRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // 容器尺寸无效，延迟重试
      const timer = setTimeout(() => {
        setRetryCount((c: number) => c + 1); // 触发重新渲染，重新执行 useEffect
      }, 100);
      return () => clearTimeout(timer);
    }

    // 初始化图表实例
    if (!chartInstanceRef.current || chartInstanceRef.current.isDisposed()) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    chart.clear();

    // 根据 pieDataType 选择数据源
    const useSecondaryAsMain = pieDataType === 'intraday' && secondaryDistribution && secondaryDistribution.length > 0;
    const mainDistribution = useSecondaryAsMain ? secondaryDistribution : distribution;
    const categories = mainDistribution.map(b => b.range);
    const values = mainDistribution.map(b => b.count || 0);

    // 使用共享颜色常量
    const negColors = NEG_COLORS;
    const posColors = POS_COLORS;
    const upColor = UP_COLOR;
    const downColor = DOWN_COLOR;

    // 预计算每个区间的类型和在组内的位置
    const rangeTypes = categories.map(c => getRangeType(c));
    const negIndices = rangeTypes.map((t, i) => t === 'negative' ? i : -1).filter(i => i >= 0);
    const posIndices = rangeTypes.map((t, i) => t === 'positive' ? i : -1).filter(i => i >= 0);

    // 根据区间在组内的相对位置获取渐变颜色
    const getColorByRangeAndIndex = (idx: number) => {
      const rangeType = rangeTypes[idx];
      if (rangeType === 'negative') {
        const posInGroup = negIndices.indexOf(idx);
        const total = negIndices.length;
        const colorIdx = Math.floor((posInGroup / Math.max(total - 1, 1)) * (negColors.length - 1));
        return negColors[colorIdx] || downColor;
      } else if (rangeType === 'zero') {
        return isDarkTheme ? '#8c8c8c' : '#bfbfbf';
      } else if (rangeType === 'positive') {
        const posInGroup = posIndices.indexOf(idx);
        const total = posIndices.length;
        const colorIdx = Math.floor((posInGroup / Math.max(total - 1, 1)) * (posColors.length - 1));
        return posColors[colorIdx] || upColor;
      }
      return isDarkTheme ? '#8c8c8c' : '#bfbfbf';
    };

    let chartOption: echarts.EChartsOption;

    if (chartType === 'bar') {
      // 柱状图模式
      const defaultGrid = { left: 40, right: 24, top: 30, bottom: 45 };
      const grid = gridConfig ? { ...defaultGrid, ...gridConfig } : defaultGrid;
      // 仅当 pieDataType === 'both' 时显示双柱，否则显示单柱
      const hasDualSeries = pieDataType === 'both' && secondaryDistribution && secondaryDistribution.length > 0;
      const secondaryValues = hasDualSeries ? secondaryDistribution.map(b => b.count || 0) : [];

      // 双柱状图的 tooltip
      const tooltipFormatter = hasDualSeries 
        ? (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            const first = arr[0];
            const dataIndex = first?.dataIndex ?? 0;
            const label = categories[dataIndex] ?? '';
            const primaryVal = values[dataIndex] ?? 0;
            const secondaryVal = secondaryValues[dataIndex] ?? 0;
            return `${label}<br/>${primaryLabel}: ${primaryVal}<br/>${secondaryLabel}: ${secondaryVal}`;
          }
        : undefined;

      // 构建 series
      const series: echarts.SeriesOption[] = hasDualSeries
        ? [
            {
              name: primaryLabel,
              type: 'bar',
              data: values.map((v, idx) => ({
                value: v === 0 && secondaryValues[idx] === 0 ? null : v,
                itemStyle: { color: getColorByRangeAndIndex(idx) },
              })),
              barWidth: '40%',
              barGap: '0%',
              barMinHeight: 3,
            },
            {
              name: secondaryLabel,
              type: 'bar',
              data: secondaryValues.map((v, idx) => ({
                value: values[idx] === 0 && v === 0 ? null : v,
                itemStyle: { color: hexToRgba(getColorByRangeAndIndex(idx), 0.6) },
              })),
              barWidth: '40%',
              barGap: '0%',
              barMinHeight: 3,
            },
          ]
        : [
            {
              data: values.map((v, idx) => ({
                value: v === 0 ? null : v,
                itemStyle: { color: getColorByRangeAndIndex(idx) },
              })),
              type: 'bar',
              barWidth: '60%',
            },
          ];

      chartOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          borderColor: border,
          textStyle: { color: textColor },
          confine: true,
          ...(tooltipFormatter ? { formatter: tooltipFormatter } : {}),
        },
        grid,
        xAxis: {
          type: 'category',
          data: categories,
          name: pieDataType === 'intraday' ? '日内振幅(%)' : (pieDataType === 'both' ? '涨跌幅/振幅(%)' : '涨跌幅(%)'),
          nameLocation: 'middle',
          nameGap: 25,
          axisTick: { alignWithLabel: true },
          axisLabel: { 
            color: textColor, 
            interval: 0, 
            rotate: xAxisLabelRotate,
            formatter: (value: string) => {
              // 将范围标签简化为单值，如 "0~1" -> "1"，"-1~0" -> "0"
              const match = value.match(/~(-?\d+)/);
              if (match) return match[1];
              // 处理特殊情况如 "<-10" -> "<-10", ">10" -> ">10"
              return value;
            }
          },
          axisLine: { lineStyle: { color: textColor } },
        },
        yAxis: {
          type: useLogScale ? 'log' : 'value',
          name: '数量',
          minInterval: useLogScale ? undefined : 1,
          ...(useLogScale ? { logBase: 10, min: 1 } : {}),
          axisLabel: { 
            color: textColor,
            formatter: (value: number) => {
              if (useLogScale) {
                if (value === 0) return '0';
                if (value === 1) return '1';
                if (value === 10) return '10';
                if (value === 100) return '100';
                if (value === 1000) return '1k';
                if (value === 10000) return '10k';
                return value.toString();
              }
              return value.toString();
            }
          },
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', type: 'dashed' } },
        },
        // 图例已移至控制栏切换按钮，图表内不再显示
        series,
      };
    } else if (chartType === 'pie') {
      // 饼图模式：根据 pieDataType 选择数据源（'both' 默认使用收盘数据）
      const pieData = pieDataType === 'intraday' && secondaryDistribution && secondaryDistribution.length > 0
        ? secondaryDistribution
        : distribution;
      const pieValues = pieData.map(b => b.count || 0);

      chartOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          borderColor: border,
          textStyle: { color: textColor },
          confine: true,
          formatter: '{b}: {c} ({d}%)',
        },
        legend: pieLegendPosition === 'top' ? {
          orient: 'horizontal',
          top: 8,
          left: 'center',
          textStyle: { color: textColor, fontSize: 10 },
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 8,
        } : {
          orient: 'vertical',
          right: 0,
          top: 'middle',
          textStyle: { color: textColor },
        },
        series: [{
          name: '家数',
          type: 'pie',
          radius: pieRadius,
          center: pieCenter,
          avoidLabelOverlap: true,
          data: pieData.map((b, idx) => {
            const value = pieValues[idx] || 0;
            return {
              value: value,
              name: `${b.range} (${value})`,
              itemStyle: { color: getColorByRangeAndIndex(idx) },
            };
          }).filter(item => item.value > 0),
          // 移动端顶部图例时，隐藏标签指示线，仅保留图例
          label: pieLegendPosition === 'top' 
            ? { show: false } 
            : { show: true, color: textColor },
          labelLine: pieLegendPosition === 'top' ? { show: false } : { show: true },
          minAngle: 2,
        }],
      };
    } else if (chartType === 'distribution') {
      // 分布曲线图：显示涨跌幅的分布密度
      // 计算 KDE 的辅助函数
      const computeKDE = (values: number[]) => {
        const validValues = values.filter(v => v !== undefined && v !== null && !isNaN(v));
        if (validValues.length === 0) return { kdePoints: [] as [number, number][], minVal: 0, maxVal: 0 };
        const sortedValues = [...validValues].sort((a, b) => a - b);
        const minVal = Math.min(...sortedValues);
        const maxVal = Math.max(...sortedValues);
        const rangeVal = maxVal - minVal || 1;
        const bandwidth = rangeVal / 10;
        const kdePoints: [number, number][] = [];
        const step = rangeVal / 100 || 0.01;
        for (let x = minVal; x <= maxVal; x += step) {
          let density = 0;
          sortedValues.forEach(v => {
            const u = (x - v) / bandwidth;
            density += Math.exp(-0.5 * u * u) / (bandwidth * Math.sqrt(2 * Math.PI));
          });
          density /= sortedValues.length;
          kdePoints.push([x, density]);
        }
        return { kdePoints, minVal, maxVal };
      };

      // 根据dataMetric获取数据的函数
      const getMetricValue = (item: CompareItemData): number => {
        if (dataMetric === 'max_pct' && item.max_pct !== undefined) return item.max_pct;
        if (dataMetric === 'min_pct' && item.min_pct !== undefined) return item.min_pct;
        return item.pct_chg ?? 0;
      };

      // X轴标签
      const distributionXLabel = dataMetric === 'max_pct' ? '最大涨幅(%)' 
        : dataMetric === 'min_pct' ? '最大回撤(%)' 
        : pieDataType === 'intraday' ? '日内振幅(%)' 
        : pieDataType === 'both' ? '涨跌幅/振幅(%)' : '涨跌幅(%)';

      // 根据 pieDataType 决定显示单曲线还是双曲线
      const showBoth = pieDataType === 'both' && dataMetric === 'pct_chg';
      const metricPctValues = filteredItems.map(i => getMetricValue(i));
      const intradayPctValues = filteredItems.map(i => i.intraday_pct ?? i.pct_chg);
      
      const mainKDE = computeKDE(metricPctValues);
      const intradayKDE = showBoth ? computeKDE(intradayPctValues) : null;

      // 使用allItems计算x轴范围（筛选时不缩放坐标轴）
      const axisItems = allItems && allItems.length > 0 ? allItems : filteredItems;
      const axisMetricValues = axisItems.map(i => getMetricValue(i));
      const axisIntradayPctValues = axisItems.map(i => i.intraday_pct ?? i.pct_chg);
      const axisMainKDE = computeKDE(axisMetricValues);
      const axisIntradayKDE = showBoth ? computeKDE(axisIntradayPctValues) : null;
      
      // 计算 x 轴范围（使用全量数据）
      const xMin = showBoth ? Math.min(axisMainKDE.minVal, axisIntradayKDE!.minVal) : axisMainKDE.minVal;
      const xMax = showBoth ? Math.max(axisMainKDE.maxVal, axisIntradayKDE!.maxVal) : axisMainKDE.maxVal;

      // 构建 series
      const distributionSeries: echarts.SeriesOption[] = showBoth
        ? [
            {
              name: primaryLabel,
              type: 'line',
              data: mainKDE.kdePoints,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: '#5470c6' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(84, 112, 198, 0.4)' },
                  { offset: 1, color: 'rgba(84, 112, 198, 0.05)' },
                ]),
              },
            },
            {
              name: secondaryLabel,
              type: 'line',
              data: intradayKDE!.kdePoints,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: '#91cc75' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(145, 204, 117, 0.4)' },
                  { offset: 1, color: 'rgba(145, 204, 117, 0.05)' },
                ]),
              },
            },
          ]
        : [
            {
              type: 'line',
              data: mainKDE.kdePoints,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: '#5470c6' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(84, 112, 198, 0.5)' },
                  { offset: 1, color: 'rgba(84, 112, 198, 0.1)' },
                ]),
              },
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', type: 'dashed' },
                data: [{ xAxis: 0, label: { show: false } }],
              },
            },
          ];

      chartOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          borderColor: border,
          textStyle: { color: textColor },
          formatter: showBoth
            ? (params: any) => {
                const arr = Array.isArray(params) ? params : [params];
                let result = '';
                arr.forEach((item: any) => {
                  if (item && item.value) {
                    result += `${item.seriesName}: ${item.value[0].toFixed(2)}% (密度: ${item.value[1].toFixed(4)})<br/>`;
                  }
                });
                return result;
              }
            : (params: any) => {
                const data = params[0];
                if (!data) return '';
                return `${distributionXLabel.replace('(%)', '')}: ${data.value[0].toFixed(2)}%<br/>密度: ${data.value[1].toFixed(4)}`;
              },
        },
        grid: gridConfig ? { left: 40, right: 24, top: 30, bottom: 45, ...gridConfig } : { left: 40, right: 24, top: 30, bottom: 45 },
        xAxis: {
          type: 'value',
          name: distributionXLabel,
          nameLocation: 'middle',
          nameGap: 25,
          min: xMin,
          max: xMax,
          axisLabel: { color: textColor },
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', type: 'dashed' } },
        },
        yAxis: {
          type: 'value',
          name: '密度',
          axisLabel: { color: textColor, formatter: (v: number) => v.toFixed(2) },
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', type: 'dashed' } },
        },
        series: distributionSeries,
        dataZoom: [{
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
        }],
      };
    } else if (chartType === 'bubble') {
      // 气泡图：X=涨跌幅/日内振幅/最大涨幅/最大回撤，Y=成交额，大小=流通市值
      // useLogScale 同时控制 X轴(symlog) 和 Y轴(log) 的显示方式
      const useIntradayPct = pieDataType === 'intraday';
      const transformX = useLogScale 
        ? (x: number) => symlogTransform(x, SYMLOG_THRESHOLD)
        : (x: number) => x;  // 线性模式直接返回原值
      const inverseTransformX = useLogScale
        ? (tx: number) => symlogInverse(tx, SYMLOG_THRESHOLD)
        : (tx: number) => tx;  // 线性模式直接返回原值

      // 根据dataMetric获取X轴数据的函数
      const getXValue = (item: CompareItemData): number => {
        if (dataMetric === 'max_pct' && item.max_pct !== undefined) {
          return item.max_pct;
        } else if (dataMetric === 'min_pct' && item.min_pct !== undefined) {
          return item.min_pct;
        } else if (useIntradayPct) {
          return item.intraday_pct ?? item.pct_chg ?? 0;
        }
        return item.pct_chg ?? 0;
      };

      // X轴标签
      const xAxisLabel = dataMetric === 'max_pct' ? '最大涨幅(%)' 
        : dataMetric === 'min_pct' ? '最大回撤(%)' 
        : useIntradayPct ? '日内振幅(%)' : '涨跌幅(%)';

      // 使用allItems计算坐标轴范围（搜索时不缩放），使用filteredItems渲染气泡
      const axisItems = allItems && allItems.length > 0 ? allItems : filteredItems;
      
      // 计算流通市值范围用于气泡大小映射（使用对数映射避免极端差异）
      const circMvValues = axisItems.map((item) => item.circ_mv ?? 0).filter(v => v > 0);
      const hasCircMvData = circMvValues.length > 0;
      const minCircMv = hasCircMvData ? Math.min(...circMvValues) : 1;
      const maxCircMv = hasCircMvData ? Math.max(...circMvValues) : 1000000;
      // 使用对数映射：log10(市值)
      const logMinCircMv = Math.log10(minCircMv || 1);
      const logMaxCircMv = Math.log10(maxCircMv || 1);
      const logCircMvDiff = logMaxCircMv - logMinCircMv || 1;

      // 计算成交额范围，用于动态设置坐标轴范围（使用全量数据）
      const amountValues = axisItems.map((item) => item.amount ?? 0).filter(v => v > 0);
      const minAmount = amountValues.length > 0 ? Math.min(...amountValues) : 10000;
      const maxAmount = amountValues.length > 0 ? Math.max(...amountValues) : 1000000;
      // 向下取整到最近的10的幂次（用于对数坐标最小值）
      const logMinAmount = Math.pow(10, Math.floor(Math.log10(minAmount)));
      // 向上取整到最近的10的幂次（用于对数坐标最大值）
      const logMaxAmount = Math.pow(10, Math.ceil(Math.log10(maxAmount)));

      const bubbleData = filteredItems.map((item) => {
        const xValue = getXValue(item);
        const amount = item.amount ?? 0;
        const close = item.close ?? 0;
        const circMv = item.circ_mv ?? 0;
        // 简单的涨跌颜色（基于X轴值）
        let color = isDarkTheme ? '#8c8c8c' : '#bfbfbf';
        if (xValue > 0) color = upColor;
        else if (xValue < 0) color = downColor;
        // 气泡大小：基于流通市值对数映射，4-16像素（减小尺寸避免重叠）
        // 如果没有市值数据或市值为0，使用固定大小
        let size = 8; // 默认固定大小
        if (hasCircMvData && circMv > 0) {
          const logCircMv = Math.log10(circMv);
          const sizeRatio = (logCircMv - logMinCircMv) / logCircMvDiff;
          size = 8 + Math.max(0, Math.min(1, sizeRatio)) * 18;
        }
        return {
          value: [transformX(xValue), amount, close, circMv],  // X轴使用 symlog 变换后的值
          realPct: xValue,  // 保存原始值用于 tooltip
          pct_chg: item.pct_chg,
          open: item.open,  // A日开盘价
          max_pct: item.max_pct,
          min_pct: item.min_pct,
          high_price: item.high_price,
          low_price: item.low_price,
          circMv: circMv,
          name: item.name,
          code: item.code,
          symbolSize: size,
          itemStyle: { color },
        };
      });

      // 计算x轴范围（使用全量数据，搜索时不缩放）
      const dataXValues = axisItems.map((item) => getXValue(item));
      const dataMin = dataXValues.length > 0 ? Math.min(...dataXValues) : -10;
      const dataMax = dataXValues.length > 0 ? Math.max(...dataXValues) : 10;
      // 添加少量边距
      const xPadding = Math.max(1, (dataMax - dataMin) * 0.05);
      const xMin = transformX(dataMin - xPadding);
      const xMax = transformX(dataMax + xPadding);

      // 根据实际数据范围动态调整断点（日期对比模式可能范围很大）
      const dataRange = dataMax - dataMin;
      let effectiveBreakpoints = breakpoints;
      if (dataRange > 50) {
        // 大范围时使用动态断点：基于数据范围均匀分布
        const step = Math.ceil(dataRange / 8);
        const roundedStep = step >= 50 ? Math.ceil(step / 50) * 50 : step >= 10 ? Math.ceil(step / 10) * 10 : step;
        effectiveBreakpoints = [];
        for (let i = Math.ceil(dataMin / roundedStep) * roundedStep; i <= dataMax; i += roundedStep) {
          effectiveBreakpoints.push(i);
        }
        // 确保包含0
        if (!effectiveBreakpoints.includes(0) && dataMin < 0 && dataMax > 0) {
          effectiveBreakpoints.push(0);
          effectiveBreakpoints.sort((a, b) => a - b);
        }
      }
      
      // 断点参考线（垂直虚线）- 使用 symlog 变换后的值
      const markLines = effectiveBreakpoints.map(bp => ({
        xAxis: transformX(bp),
        lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)', type: 'dashed' as const, width: 1 },
        label: { show: false },
      }));

      chartOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          borderColor: border,
          textStyle: { color: textColor },
          confine: true,
          formatter: (params: any) => {
            const data = params.data;
            if (!data) return '';
            const realPct = data.realPct ?? inverseTransformX(data.value[0]);
            const circMv = data.circMv ?? data.value[3] ?? 0;
            const pctColor = realPct >= 0 ? upColor : downColor;
            const sign = realPct >= 0 ? '+' : '';
            const circMvFormatted = circMv <= 0 ? '-' : formatAmount(circMv * 10);
            const amountVal = data.value[1] ?? 0;
            const amountFormatted = formatAmount(amountVal);
            const closeVal = data.value[2] ?? 0;
            const closeFormatted = closeVal > 0 ? `${closeVal.toFixed(2)}元` : '-';
            
            // 构建tooltip内容
            let html = `<div style="font-weight:600">${data.name}</div>`;
            html += `<div style="color:${pctColor}">${sign}${realPct.toFixed(2)}%</div>`;
            
            // 显示极端值（如果有）- 分行布局
            if (data.max_pct !== undefined && data.min_pct !== undefined) {
              const maxSign = data.max_pct >= 0 ? '+' : '';
              const minSign = data.min_pct >= 0 ? '+' : '';
              const highPriceStr = data.high_price ? `${data.high_price.toFixed(2)}元` : '-';
              const lowPriceStr = data.low_price ? `${data.low_price.toFixed(2)}元` : '-';
              html += `<div style="font-size:11px;margin-top:2px">`;
              html += `最高价: ${highPriceStr} <span style="color:${upColor}">(${maxSign}${data.max_pct.toFixed(1)}%)</span>`;
              html += `</div>`;
              html += `<div style="font-size:11px">`;
              html += `最低价: ${lowPriceStr} <span style="color:${downColor}">(${minSign}${data.min_pct.toFixed(1)}%)</span>`;
              html += `</div>`;
            }
            
            // 开盘价（如果有）
            const openVal = data.open ?? 0;
            const openFormatted = openVal > 0 ? `${openVal.toFixed(2)}元` : '-';
            html += `<div>开盘价: ${openFormatted}</div>`;
            html += `<div>收盘价: ${closeFormatted}</div>`;
            html += `<div>流通市值: ${circMvFormatted}</div>`;
            html += `<div>成交额: ${amountFormatted}</div>`;
            return html;
          },
        },
        // 使用内置缩放（滚轮+拖动）替代滑块
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
          },
          {
            type: 'inside',
            yAxisIndex: 0,
            filterMode: 'none',
          },
        ],
        grid: gridConfig ? { left: 40, right: 24, top: 30, bottom: 45, ...gridConfig } : { left: 40, right: 24, top: 30, bottom: 45 },
        xAxis: {
          type: 'value',
          name: xAxisLabel,
          nameLocation: 'middle',
          nameGap: 25,
          min: xMin,
          max: xMax,
          axisLabel: { 
            color: textColor,
            formatter: (v: number) => {
              // 逆变换得到原始涨跌幅，限制最多2位小数，整数时不显示小数
              const original = inverseTransformX(v);
              const fixed = original.toFixed(2);
              return fixed.endsWith('.00') ? original.toFixed(0) : fixed.replace(/\.?0+$/, '');
            },
          },
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', type: 'dashed' } },
        },
        yAxis: {
          type: useLogScale ? 'log' : 'value',
          name: '成交额',
          nameLocation: 'end',
          min: useLogScale ? logMinAmount : 0,
          max: useLogScale ? logMaxAmount : maxAmount * 1.05,
          ...(useLogScale ? { logBase: 10 } : {}),
          axisLabel: { 
            show: true,
            color: textColor,
            formatter: (v: number) => formatAmount(v, 0),  // 使用统一的成交额格式化方法
          },
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { lineStyle: { color: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', type: 'dashed' } },
        },
        animation: false,
        progressive: 0,
        series: [{
          type: 'scatter',
          data: bubbleData,
          progressive: 0,
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: markLines,
            animation: false,
          },
        }],
      };
    } else if (chartType === 'treemap') {
      // 树图：显示个股成交额占比，颜色深浅表示涨跌幅/最大涨幅/最大回撤大小
      const useIntradayPct = pieDataType === 'intraday';
      
      // 根据dataMetric获取显示值
      const getTreemapDisplayPct = (item: CompareItemData): number => {
        if (dataMetric === 'max_pct' && item.max_pct !== undefined) return item.max_pct;
        if (dataMetric === 'min_pct' && item.min_pct !== undefined) return item.min_pct;
        if (useIntradayPct) return item.intraday_pct ?? item.pct_chg;
        return item.pct_chg;
      };
      
      const treeData = filteredItems.map(item => {
        const displayPct = getTreemapDisplayPct(item);
        return {
          name: item.name,
          value: item.amount,
          code: item.code,
          pct_chg: item.pct_chg,
          open: item.open,  // A日开盘价
          max_pct: item.max_pct,
          min_pct: item.min_pct,
          high_price: item.high_price,  // 区间最高价
          low_price: item.low_price,  // 区间最低价
          display_pct: displayPct,
          close: item.close,
          circ_mv: item.circ_mv,
          intraday_pct: item.intraday_pct,
          itemStyle: {
            color: getColorByPctChg(displayPct), // 根据选择的数据维度着色
          },
        };
      });

      // 计算动态最大缩放倍数
      const totalAmount = treeData.reduce((sum, d) => sum + (d.value || 0), 0);
      const minAmount = Math.min(...treeData.map(d => d.value || 0).filter(v => v > 0));
      const minRatio = minAmount / totalAmount;
      const dynamicMaxZoom = Math.max(10, Math.min(50, Math.ceil(0.1 / Math.sqrt(minRatio))));

      chartOption = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          borderColor: border,
          textStyle: { color: textColor },
          formatter: (params: any) => {
            const data = params.data;
            if (!data || data.display_pct === undefined) return '';
            const pctColor = data.display_pct >= 0 ? upColor : downColor;
            const sign = data.display_pct >= 0 ? '+' : '';
            const amountVal = data.value ?? 0;
            const amountFormatted = formatAmount(amountVal);
            const circMv = data.circ_mv ?? 0;
            const circMvFormatted = circMv <= 0 ? '-' : formatAmount(circMv * 10);
            const closeVal = data.close ?? 0;
            const closeFormatted = closeVal > 0 ? `${closeVal.toFixed(2)}元` : '-';
            
            let html = `<div style="font-weight:600">${data.name}</div>`;
            html += `<div style="color:${pctColor}">${sign}${data.display_pct.toFixed(2)}%</div>`;
            
            // 显示极端值（如果有）- 分行布局
            if (data.max_pct !== undefined && data.min_pct !== undefined) {
              const maxSign = data.max_pct >= 0 ? '+' : '';
              const minSign = data.min_pct >= 0 ? '+' : '';
              const highPriceStr = data.high_price ? `${data.high_price.toFixed(2)}元` : '-';
              const lowPriceStr = data.low_price ? `${data.low_price.toFixed(2)}元` : '-';
              html += `<div style="font-size:11px;margin-top:2px">`;
              html += `最高价: ${highPriceStr} <span style="color:${upColor}">(${maxSign}${data.max_pct.toFixed(1)}%)</span>`;
              html += `</div>`;
              html += `<div style="font-size:11px">`;
              html += `最低价: ${lowPriceStr} <span style="color:${downColor}">(${minSign}${data.min_pct.toFixed(1)}%)</span>`;
              html += `</div>`;
            }
            
            // 开盘价
            const openVal = data.open ?? 0;
            const openFormatted = openVal > 0 ? `${openVal.toFixed(2)}元` : '-';
            html += `<div>开盘价: ${openFormatted}</div>`;
            html += `<div>收盘价: ${closeFormatted}</div>`;
            html += `<div>流通市值: ${circMvFormatted}</div>`;
            html += `<div>成交额: ${amountFormatted}</div>`;
            return html;
          },
        },
        animation: false,
        progressive: 200,
        progressiveThreshold: 1000,
        series: [{
          type: 'treemap',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          roam: true,
          scaleLimit: { min: 1, max: dynamicMaxZoom },
          nodeClick: false,
          breadcrumb: { show: false },
          animation: false,
          progressive: 200,
          label: {
            show: true,
            formatter: (params: any) => {
              const data = params.data;
              if (!data || data.display_pct === undefined) return '';
              const sign = data.display_pct >= 0 ? '+' : '';
              return `${data.name}\n${sign}${data.display_pct.toFixed(2)}%`;
            },
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 14,
            overflow: 'truncate',
            ellipsis: '',
          },
          itemStyle: {
            borderColor: isDarkTheme ? '#1f1f1f' : '#fff',
            borderWidth: 0.2,
            gapWidth: 0.2,
          },
          data: treeData,
        }],
      };
    } else {
      // 默认空图表
      chartOption = {};
    }

    chart.setOption(chartOption, true);
    chart.resize();

    // 添加点击事件
    chart.off('click');
    if (onChartClick) {
      chart.on('click', (params: any) => {
        const dataIndex = params.dataIndex;
        if (dataIndex !== undefined && distribution[dataIndex]) {
          onChartClick(distribution[dataIndex].range, dataIndex);
        }
      });
    }

    return () => {
      // 不在这里销毁，保持实例
    };
  }, [distribution, secondaryDistribution, items, allItems, filteredItems, isDarkTheme, textColor, border, chartType, useLogScale, pieDataType, onChartClick, gridConfig, xAxisLabelRotate, pieRadius, pieCenter, breakpoints, primaryLabel, secondaryLabel, pieLegendPosition, hideDataModeToggle, dataMetric, retryCount]);

  // 窗口resize处理
  useEffect(() => {
    const handleResize = () => chartInstanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 组件卸载时销毁实例
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {/* 收盘/日内切换按钮已移至 ChartControls 组件 */}
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
});

export default CompareChart;
