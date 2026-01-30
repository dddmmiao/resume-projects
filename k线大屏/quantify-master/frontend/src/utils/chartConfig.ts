/**
 * 图表配置工具
 */
import * as echarts from 'echarts';
import { KLineData } from './indicators.ts';
import {
  calculateEXPMA,
  calculateBOLL,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateMA,
  calculateCCI,
  calculateWR,
  calculateDMI,
  calculateSAR,
  calculateOBV,
  calculateTDSequential
} from './indicators.ts';

// 指标数据缓存接口
export interface IndicatorDataCache {
  expmaData?: ReturnType<typeof calculateEXPMA> | null;
  bollData?: ReturnType<typeof calculateBOLL> | null;
  macdData?: ReturnType<typeof calculateMACD> | null;
  rsiData?: ReturnType<typeof calculateRSI> | null;
  kdjData?: ReturnType<typeof calculateKDJ> | null;
  maData?: ReturnType<typeof calculateMA> | null;
  cciData?: ReturnType<typeof calculateCCI> | null;
  wrData?: ReturnType<typeof calculateWR> | null;
  dmiData?: ReturnType<typeof calculateDMI> | null;
  obvData?: ReturnType<typeof calculateOBV> | null;
  sarData?: ReturnType<typeof calculateSAR> | null;
  tdData?: ReturnType<typeof calculateTDSequential> | null;
}

// 指标线显示设置
export interface IndicatorLineSettings {
  expma: number[];  // EXPMA线: [5, 10, 20, 60, 250]
  ma: number[];     // MA线: [5, 10, 20, 60, 250]
  boll: string[];   // BOLL线: ['upper', 'mid', 'lower']
  kdj: string[];    // KDJ线: ['k', 'd', 'j']
  macd: string[];   // MACD线: ['dif', 'dea', 'macd']
  dmi: string[];    // DMI线: ['pdi', 'mdi', 'adx', 'adxr']
}

export interface ChartConfigOptions {
  klineData: KLineData[];
  allKlineData: KLineData[];
  indicator: string;
  // 主图叠加指标（MA / EXPMA / BOLL / SAR / TD 等），支持多选
  mainIndicators?: string[];
  isFullscreen: boolean;
  initialCount: number;
  loading: boolean;
  hasPlayedInitialAnimation: boolean;
  theme: string;
  // 移动端优化参数
  isMobile?: boolean;
  showYAxis?: boolean;
  colorScheme?: 'red-up-green-down' | 'green-up-red-down';
  showIndicatorLabels?: boolean;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';
  // 可选的已计算指标数据（用于缓存，避免重复计算）
  cachedIndicators?: IndicatorDataCache;
  // 指标线显示设置
  indicatorLineSettings?: IndicatorLineSettings;
}

// 获取基于主题的刻度线颜色
export const getSplitLineColor = (theme: string) => {
  switch (theme) {
    case 'light':
      return 'rgba(0,0,0,0.15)'; // 白色主题使用黑色刻度线
    case 'blue':
      return 'rgba(23,125,220,0.3)';
    case 'purple':
      return 'rgba(114,46,209,0.3)';
    case 'green':
      return 'rgba(54,179,126,0.3)';
    case 'orange':
      return 'rgba(250,140,22,0.3)';
    case 'cyan':
      return 'rgba(0,170,170,0.3)';
    case 'red':
      return 'rgba(255,77,79,0.3)';
    case 'gold':
      return 'rgba(250,212,20,0.3)';
    default: // dark
      return 'rgba(255,255,255,0.1)';
  }
};

/**
 * 获取指标线颜色配置（根据主题自适应）
 * 白色主题使用深色，暗色主题使用亮色
 */
export const getIndicatorColors = (theme: string) => {
  const isLight = theme === 'light';
  
  return {
    // MA/EXPMA 指标线颜色
    ma5:  isLight ? '#1890ff' : '#ffffff',   // 白色主题蓝色，暗色主题白色
    ma10: isLight ? '#faad14' : '#ffff00',   // 白色主题橙色，暗色主题黄色
    ma20: isLight ? '#722ed1' : '#ff00ff',   // 白色主题紫色，暗色主题亮紫色
    ma60: isLight ? '#13c2c2' : '#00ffff',   // 白色主题青色，暗色主题亮青色
    ma250: isLight ? '#eb2f96' : '#ff69b4',  // 白色主题深粉色，暗色主题亮粉色（年线）
    
    // BOLL 指标线颜色
    bollUp:  isLight ? '#d48806' : '#fadb14',   // 白色主题深黄色，暗色主题亮黄色
    bollMid: isLight ? '#1890ff' : '#ffffff',   // 白色主题蓝色，暗色主题白色
    bollLow: isLight ? '#389e0d' : '#52c41a',   // 白色主题深绿色，暗色主题亮绿色
    
    // MACD 指标线颜色
    macdDif: isLight ? '#cf1322' : '#ff4d4f',   // 白色主题深红色，暗色主题亮红色
    macdDea: isLight ? '#096dd9' : '#1890ff',   // 白色主题深蓝色，暗色主题亮蓝色
    
    // RSI 指标线颜色
    rsi6:  isLight ? '#cf1322' : '#ff4d4f',
    rsi12: isLight ? '#096dd9' : '#1890ff',
    rsi24: isLight ? '#531dab' : '#722ed1',
    
    // KDJ 指标线颜色
    kdjK: isLight ? '#cf1322' : '#ff4d4f',
    kdjD: isLight ? '#096dd9' : '#1890ff',
    kdjJ: isLight ? '#531dab' : '#722ed1',
    
    // CCI/WR 指标线颜色
    cci: isLight ? '#096dd9' : '#1890ff',
    wr:  isLight ? '#cf1322' : '#ff4d4f',
    
    // DMI 指标线颜色
    dmiPdi: isLight ? '#cf1322' : '#ff4d4f',
    dmiMdi: isLight ? '#389e0d' : '#52c41a',
    dmiAdx: isLight ? '#096dd9' : '#1890ff',
    dmiAdxr: isLight ? '#d48806' : '#faad14',
    
    // OBV 指标线颜色
    obv: isLight ? '#096dd9' : '#1890ff',
    
    // TD 标签颜色
    tdLabel: isLight ? '#000000' : '#ffffff',
  };
};

// 安全的数值处理函数
export const safeNumber = (value: any, defaultValue: number = 0) => {
  if (value === null || value === undefined || isNaN(value)) return defaultValue;
  return Number(value);
};

/**
 * 格式化Y轴刻度值（与Y轴axisLabel.formatter保持一致）
 */
export const formatYAxisValue = (value: number): string => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  // 大数以万为单位保留1位小数
  if (value >= 10000) {
    const v = (value / 10000);
    return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + '万';
  }
  // 小数自适应：整数不带小数；否则最多两位，去掉末尾0
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

/**
 * 计算Y轴刻度标签的最大字符宽度
 * 根据K线数据的价格范围，估算Y轴刻度值格式化后的最大字符数
 */
export const calculateYAxisLabelWidth = (klineData: KLineData[]): number => {
  if (!klineData || klineData.length === 0) return 4; // 默认4个字符宽度
  
  // 获取价格范围
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  
  for (const item of klineData) {
    const low = safeNumber(item.low);
    const high = safeNumber(item.high);
    if (low > 0 && low < minPrice) minPrice = low;
    if (high > maxPrice) maxPrice = high;
  }
  
  if (minPrice === Infinity || maxPrice === -Infinity) return 4;
  
  // 格式化最大值和最小值，取较长的那个
  const maxLabel = formatYAxisValue(maxPrice);
  const minLabel = formatYAxisValue(minPrice);
  
  // 返回最大字符数
  return Math.max(maxLabel.length, minLabel.length);
};

/**
 * 根据Y轴刻度值字符宽度动态计算边距
 * @param klineData K线数据
 * @param isMobile 是否移动端
 * @param isFullscreen 是否全屏
 * @param showYAxis 是否显示Y轴
 */
export const getDynamicMargins = (
  klineData: KLineData[],
  isMobile: boolean,
  isFullscreen: boolean,
  showYAxis: boolean
): { left: string; right: string } => {
  // 如果不显示Y轴标签，左边距应该很小
  if (!showYAxis) {
    return { left: '5%', right: '5%' };
  }
  
  const labelCharWidth = calculateYAxisLabelWidth(klineData);
  
  // 根据字符宽度动态计算左边距
  const calculateDynamicLeft = (basePercent: number, charWidthFactor: number, minPercent: number, maxPercent: number): string => {
    const baseCharCount = 4; // 以4个字符为基准（如 "10.5"）
    const charDiff = labelCharWidth - baseCharCount;
    const dynamicPercent = basePercent + charDiff * charWidthFactor;
    const clampedPercent = Math.min(maxPercent, Math.max(minPercent, dynamicPercent));
    return `${clampedPercent}%`;
  };
  
  if (isMobile && isFullscreen) {
    // 移动端详情页：基础9%，每多一个字符增加1.5%，范围9%-18%
    return { left: calculateDynamicLeft(9, 1.5, 9, 18), right: '3%' };
  } else if (isMobile && !isFullscreen) {
    // 移动端列表页：紧凑布局，不显示Y轴，固定5%
    return { left: '5%', right: '5%' };
  } else if (!isMobile && isFullscreen) {
    // 网页端全屏模式：基础3%，每多一个字符增加0.8%，范围3%-10%
    return { left: calculateDynamicLeft(3, 0.8, 3, 10), right: '3%' };
  } else {
    // 网页端普通模式：基础6%，每多一个字符增加1%，范围6%-14%
    return { left: calculateDynamicLeft(6, 1, 6, 14), right: '3%' };
  }
};

// 构建图表配置
export const buildChartOption = (options: ChartConfigOptions): echarts.EChartsOption => {
  const {
    klineData,
    allKlineData,
    indicator,
    mainIndicators = [],
    isFullscreen,
    initialCount,
    loading,
    hasPlayedInitialAnimation,
    theme,
    // 移动端优化参数
    isMobile = false,
    showYAxis = true,
    colorScheme = 'red-up-green-down',
    showIndicatorLabels = true,
    dataType = 'stock'
  } = options;

  // 获取主题感知的指标颜色配置
  const indicatorColors = getIndicatorColors(theme);

  // ========== 开盘竞价横线绘制配置 ==========
  const AUCTION_HALF_WIDTH_RATIO = 0.3; // 横线半宽占一个x步长的比例（总宽约0.7）
  // 开盘竞价均价线样式：白色主题下使用更深的金色和更粗的线条以增强对比度
  const AUCTION_LINE_STYLE = {
    stroke: theme === 'light' ? '#096dd9' : '#ffd700',
    lineWidth: theme === 'light' ? 2 : 1.5,
    opacity: 1,
  } as const;
  const createAuctionLineSeries = (
    name: string,
    points: Array<[number, number]>,
    xAxisIndex: number,
    yAxisIndex: number
  ): any => ({
    name,
    type: 'custom' as const,
    xAxisIndex,
    yAxisIndex,
    z: 100,
    silent: true,
    animation: false,
    data: points,
    renderItem: (_params: any, api: any) => {
      const idx = api.value(0) as number;
      const val = api.value(1) as number;
      const p = api.coord([idx, val]);
      const half = (api.size([1, 0])[0] || 0) * AUCTION_HALF_WIDTH_RATIO;
      return {
        type: 'line',
        shape: { x1: p[0] - half, y1: p[1], x2: p[0] + half, y2: p[1] },
        style: AUCTION_LINE_STYLE
      } as any;
    },
    encode: { x: 0, y: 1 }
  });

  // 创建带颜色的开盘竞价成交量柱状图（根据涨跌显示红绿色，更易看出波动）
  // 使用与默认成交量柱状图相同的方式，通过itemStyle函数动态设置颜色
  const createAuctionVolumeBarSeries = (
    name: string,
    chartData: any[],
    auctionVolumes: (number | null)[],
    upColor: string,
    downColor: string,
    xAxisIndex: number,
    yAxisIndex: number
  ): any => ({
    name,
    type: 'bar' as const,
    xAxisIndex,
    yAxisIndex,
    z: 5, // z-index设置为5，确保在量能图区域可见
    silent: true, // 不响应鼠标事件，避免干扰
    animation: false,
    barWidth: '60%', // 柱状图宽度，与K线柱宽度保持一致
    // 保持data数组长度与chartData一致
    // 注意：对于没有数据的位置，ECharts的bar类型可以使用null或0，但使用数字数组更稳定
    data: auctionVolumes.map((vol) => {
      // 返回实际值，没有数据的位置返回0（但会被itemStyle函数隐藏）
      return (vol !== null && vol !== undefined && !isNaN(vol) && vol > 0) ? vol : 0;
    }),
    itemStyle: {
      color: function(params: any) {
        const dataIndex = params.dataIndex;
        if (dataIndex < 0 || dataIndex >= auctionVolumes.length) {
          return 'transparent'; // 索引越界，返回透明
        }
        
        const vol = auctionVolumes[dataIndex];
        
        // 如果没有数据或值为0，返回透明色（不显示柱状图）
        if (vol === null || vol === undefined || isNaN(vol) || vol <= 0) {
          return 'transparent';
        }
        
        // 判断涨跌：开盘竞价价格与前一天的收盘价比较
        if (dataIndex > 0 && chartData[dataIndex] && chartData[dataIndex - 1]) {
          const currentAuctionPrice = safeNumber(chartData[dataIndex].auction_price);
          const prevClose = safeNumber(chartData[dataIndex - 1].close);
          if (currentAuctionPrice > 0 && prevClose > 0) {
            // 开盘竞价价格高于前一天收盘价为涨，否则为跌
            return currentAuctionPrice >= prevClose ? upColor : downColor;
          }
        } else if (dataIndex === 0) {
          // 第一条数据，使用红色作为默认
          return upColor;
        }
        
        // 默认灰色
        return '#999';
      }
    },
    // 设置emphasis，确保鼠标悬停时也能正常显示
    emphasis: {
      itemStyle: {
        opacity: 1
      }
    }
  });

  if (!klineData.length) {
    return {
      backgroundColor: 'transparent',
      title: {
        text: loading ? '正在加载K线数据...' : '暂无K线数据',
        textStyle: {
          color: 'rgba(255,255,255,0.6)',
          fontSize: 14
        },
        left: 'center',
        top: 'middle'
      }
    };
  }

  // 使用allKlineData进行图表渲染，允许用户拖动查看全部数据
  // klineData用于计算初始可见范围（截断到tradeDate）
  const chartData = allKlineData.length > 0 ? allKlineData : klineData;
  
  // 处理数据
  const dates = chartData.map(item => {
    // 格式化日期显示
    const date = item.trade_date || '00000000';
    if (date.length >= 8) {
      return `${date.slice(4,6)}-${date.slice(6,8)}`;
    }
    return date;
  });

  // 检测停牌日并特殊处理K线数据
  const klineValues = chartData.map(item => {
    const open = safeNumber(item.open);
    const close = safeNumber(item.close);
    const low = safeNumber(item.low);
    const high = safeNumber(item.high);
    
    // 如果最高价和最低价都为0，认为是停牌日
    if (high === 0 && low === 0) {
      // 停牌日：开盘价和收盘价相同，最高价和最低价也相同，形成一条横线
      const suspendedPrice = open || close || 0; // 使用开盘价或收盘价，如果都为0则使用0
      return [suspendedPrice, suspendedPrice, suspendedPrice, suspendedPrice];
    }
    
    return [open, close, low, high];
  });
  

  // 成交量转换为万手，安全处理
  const volumes = chartData.map(item => {
    const vol = safeNumber(item.vol);
    // 停牌日成交量通常为0，特殊处理
    if (item.high === 0 && item.low === 0) {
      return 0; // 停牌日成交量显示为0
    }
    return Math.round(vol / 100) / 100;
  });

  // 开盘竞价数据：成交均价和成交量
  const auctionPrices = chartData.map(item => {
    const price = safeNumber(item.auction_price);
    return price > 0 ? price : null;
  });
  
  const auctionVolumes = chartData.map(item => {
    const vol = safeNumber(item.auction_vol);
    // 开盘竞价成交量转换为万手（股转手：1手=100股）
    return vol > 0 ? Math.round(vol / 10000) / 100 : null;
  });

  // 开盘竞价指标：当选择开盘竞价指标时显示（仅股票类型）
  const showAuctionIndicator = indicator === 'auction' && dataType === 'stock';

  // 注意：不再固定设置Y轴min/max范围
  // 让ECharts根据当前可视范围的数据自动计算Y轴范围（scale: true）
  // 这样当用户拖动/缩放图表时，Y轴会动态调整，避免爆量日压扁其他日的柱子

  // 按需计算技术指标（只计算当前显示的指标，提升性能）
  // 优先使用缓存的指标数据，如果没有缓存则重新计算
  const cached = options.cachedIndicators;
  
  // 初始化所有指标变量为 null，避免未定义错误
  let expmaData: ReturnType<typeof calculateEXPMA> | null = null;
  let bollData: ReturnType<typeof calculateBOLL> | null = null;
  let macdData: ReturnType<typeof calculateMACD> | null = null;
  let rsiData: ReturnType<typeof calculateRSI> | null = null;
  let kdjData: ReturnType<typeof calculateKDJ> | null = null;
  let maData: ReturnType<typeof calculateMA> | null = null;
  let cciData: ReturnType<typeof calculateCCI> | null = null;
  let wrData: ReturnType<typeof calculateWR> | null = null;
  let dmiData: ReturnType<typeof calculateDMI> | null = null;
  let obvData: ReturnType<typeof calculateOBV> | null = null;
  let sarData: ReturnType<typeof calculateSAR> | null = null;
  let tdData: ReturnType<typeof calculateTDSequential> | null = null;

  // 如果有缓存，直接解构所有已缓存指标
  if (cached) {
    expmaData = cached.expmaData ?? null;
    bollData = cached.bollData ?? null;
    macdData = cached.macdData ?? null;
    rsiData = cached.rsiData ?? null;
    kdjData = cached.kdjData ?? null;
    maData = cached.maData ?? null;
    cciData = cached.cciData ?? null;
    wrData = cached.wrData ?? null;
    dmiData = cached.dmiData ?? null;
    obvData = cached.obvData ?? null;
    sarData = cached.sarData ?? null;
    tdData = cached.tdData ?? null;
  }

  // 需要的指标集合 = 所有主图叠加 + 当前副图指标（兼容旧用法：indicator 本身也可能是主图指标）
  const overlayKeys = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const overlayIndicators = new Set<string>((mainIndicators || []).filter(Boolean));
  // 移动端兼容旧用法：当 isMobile=true 且 indicator 本身是主图指标时，将其视为主图叠加。
  // 桌面端则完全由 mainIndicators 控制主图叠加，避免出现"某个叠加始终无法关闭"的情况。
  if (isMobile && overlayKeys.has(indicator)) {
    overlayIndicators.add(indicator);
  }

  const requiredIndicators = new Set<string>();
  overlayIndicators.forEach(key => requiredIndicators.add(key));
  if (indicator && indicator !== 'none') {
    requiredIndicators.add(indicator);
  }

  const needCalculate = !cached || Array.from(requiredIndicators).some(key => {
    switch (key) {
      case 'expma': return !expmaData;
      case 'boll': return !bollData;
      case 'macd': return !macdData;
      case 'rsi': return rsiData === null;
      case 'kdj': return !kdjData;
      case 'ma': return !maData;
      case 'cci': return cciData === null;
      case 'wr': return wrData === null;
      case 'dmi': return !dmiData;
      case 'obv': return obvData === null;
      case 'sar': return !sarData;
      case 'td': return !tdData;
      case 'none':
      case 'vol':
      case 'auction':
        return false;
      default:
        return false;
    }
  });

  if (needCalculate) {
    for (const key of requiredIndicators) {
      switch (key) {
        case 'expma':
          if (!expmaData) expmaData = calculateEXPMA(chartData);
          break;
        case 'boll':
          if (!bollData) bollData = calculateBOLL(chartData);
          break;
        case 'macd':
          if (!macdData) macdData = calculateMACD(chartData);
          break;
        case 'rsi':
          if (rsiData === null) rsiData = calculateRSI(chartData);
          break;
        case 'kdj':
          if (!kdjData) kdjData = calculateKDJ(chartData);
          break;
        case 'ma':
          if (!maData) maData = calculateMA(chartData);
          break;
        case 'cci':
          if (cciData === null) cciData = calculateCCI(chartData);
          break;
        case 'wr':
          if (wrData === null) wrData = calculateWR(chartData);
          break;
        case 'dmi':
          if (!dmiData) dmiData = calculateDMI(chartData);
          break;
        case 'obv':
          if (obvData === null) obvData = calculateOBV(chartData);
          break;
        case 'sar':
          if (!sarData) sarData = calculateSAR(chartData);
          break;
        case 'td':
          if (!tdData) tdData = calculateTDSequential(chartData);
          break;
        case 'none':
        case 'vol':
        case 'auction':
          // 这些指标不需要计算技术指标
          break;
        default:
          break;
      }
    }
  }

  // 指标直接完整展示
  const makeRevealedData = (arr: number[]) => arr;

  // 使用共享函数计算动态边距
  const margins = getDynamicMargins(chartData, isMobile, isFullscreen, showYAxis);
  const leftMargin = margins.left;
  const rightMargin = margins.right;
  const isOscillator = indicator === 'macd' || indicator === 'rsi' || indicator === 'kdj' ||
                       indicator === 'cci' || indicator === 'wr' || indicator === 'dmi' ||
                       indicator === 'obv' || indicator === 'vol';
  // 移动端列表小图：保留拖动缩放和十字线，但避免 ECharts 的 item 高亮逻辑
  const isSmallMobile = isMobile && !isFullscreen;

  // 验证数据完整性
  if (chartData.length === 0 || klineValues.length === 0 || dates.length === 0) {
    return {
      backgroundColor: 'transparent',
      title: {
        text: '数据异常',
        textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
        left: 'center',
        top: 'middle'
      }
    };
  }

  // 动画配置 - 仅在首次绘制时播放K线动画
  const shouldPlayKlineAnimation = !hasPlayedInitialAnimation;

  // 根据颜色方案设置K线颜色
  const upColor = colorScheme === 'red-up-green-down' ? '#ff4d4f' : '#52c41a';
  const downColor = colorScheme === 'red-up-green-down' ? '#52c41a' : '#ff4d4f';

  // 指标线显示设置（从options获取，默认显示全部）
  const expmaLines = options.indicatorLineSettings?.expma || [5, 10, 20, 60, 250];
  const maLines = options.indicatorLineSettings?.ma || [5, 10, 20, 60, 250];
  const bollLines = options.indicatorLineSettings?.boll || ['upper', 'mid', 'lower'];
  const kdjLines = options.indicatorLineSettings?.kdj || ['k', 'd', 'j'];
  const macdLines = options.indicatorLineSettings?.macd || ['dif', 'dea', 'macd'];
  const dmiLines = options.indicatorLineSettings?.dmi || ['pdi', 'mdi', 'adx', 'adxr'];

  // 图表配置
  // 构建图例数据：包含所有主图叠加线 + 当前副图指标
  // 同时按“指标类型”分组，用于在图例中一行展示一种类型
  const overlayIndicatorSet = new Set<string>(overlayIndicators);
  const legendData: string[] = [];
  const legendGroupsMap = new Map<string, string[]>();

  const pushLegendItems = (groupKey: string, names: string[]) => {
    let group = legendGroupsMap.get(groupKey);
    if (!group) {
      group = [];
      legendGroupsMap.set(groupKey, group);
    }
    group.push(...names);
    legendData.push(...names);
  };

  const addLegendGroup = (key: string) => {
    switch (key) {
      // 主图叠加类型
      case 'expma':
        pushLegendItems('expma', ['EXPMA5', 'EXPMA10', 'EXPMA20', 'EXPMA60', 'EXPMA250']);
        break;
      case 'ma':
        pushLegendItems('ma', ['MA5', 'MA10', 'MA20', 'MA60']);
        break;
      case 'boll':
        pushLegendItems('boll', ['BOLL-UP', 'BOLL-MID', 'BOLL-LOW']);
        break;
      case 'sar':
        pushLegendItems('sar', ['SAR']);
        break;
      case 'td':
        pushLegendItems('td', ['TD买入', 'TD卖出']);
        break;

      // 副图指标类型
      case 'macd':
        pushLegendItems('macd', ['MACD-DIF', 'MACD-DEA', 'MACD-BAR']);
        break;
      case 'kdj':
        pushLegendItems('kdj', ['K', 'D', 'J']);
        break;
      case 'rsi':
        pushLegendItems('rsi', ['RSI']);
        break;
      case 'cci':
        pushLegendItems('cci', ['CCI']);
        break;
      case 'wr':
        pushLegendItems('wr', ['WR']);
        break;
      case 'dmi':
        pushLegendItems('dmi', ['PDI', 'MDI', 'ADX']);
        break;
      case 'obv':
        pushLegendItems('obv', ['OBV']);
        break;
      case 'vol':
        pushLegendItems('volume', ['成交量']);
        break;
      default:
        // 其他类型（如 auction）暂不在图例中展示
        break;
    }
  };

  // 图例行顺序：
  // 1. 副图指标（如果有）
  // 2. 主图叠加指标，按 mainIndicators 的顺序
  const overlayKeysForLegend = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const subIndicatorKeysForLegend = new Set(['macd', 'rsi', 'kdj', 'cci', 'wr', 'dmi', 'obv', 'vol']);

  const legendTypeOrder: string[] = [];

  // 副图指标优先
  if (indicator && indicator !== 'none' && subIndicatorKeysForLegend.has(indicator)) {
    legendTypeOrder.push(indicator);
  }

  // 主图叠加按 mainIndicators 顺序
  if (Array.isArray(mainIndicators)) {
    mainIndicators.forEach((key) => {
      if (overlayKeysForLegend.has(key) && !legendTypeOrder.includes(key)) {
        legendTypeOrder.push(key);
      }
    });
  }

  // 兼容移动端：当 indicator 也是主图类型时，会被加入 overlayIndicators
  // 确保 overlayIndicatorSet 中的类型也被覆盖到 legendTypeOrder 中
  overlayIndicatorSet.forEach((key) => {
    if ((overlayKeysForLegend.has(key) || subIndicatorKeysForLegend.has(key)) && !legendTypeOrder.includes(key)) {
      legendTypeOrder.push(key);
    }
  });

  // 按照确定好的顺序构建图例分组
  legendTypeOrder.forEach(addLegendGroup);

  // Grid布局配置：支持移动端/网页端 × 全屏/非全屏四种组合
  // 1. 移动端 + 全屏 (移动端详情页)
  // 2. 移动端 + 非全屏 (移动端列表页)
  // 3. 网页端 + 全屏 (网页端全屏模式)
  // 4. 网页端 + 非全屏 (网页端普通模式)
  const getGridConfig = () => {
    if (isMobile && isFullscreen) {
      // 移动端 + 全屏：详情页布局，更宽松
      return {
        klineTop: '4%',
        klineHeight: '76%',
        volumeTop: '85%',
        volumeHeight: '15%'
      };
    } else if (isMobile && !isFullscreen) {
      // 移动端 + 非全屏：列表页布局，紧凑
      return {
        klineTop: '4%',
        klineHeight: '68%',
        volumeTop: '83%',
        volumeHeight: '15%'
      };
    } else if (!isMobile && isFullscreen) {
      // 网页端 + 全屏：全屏模式，宽松
      return {
        klineTop: '4%',
        klineHeight: '68%',
        volumeTop: '78%',
        volumeHeight: '15%'
      };
    } else {
      // 网页端 + 非全屏：普通模式
      return {
        klineTop: '4%',
        klineHeight: '66%',
        volumeTop: '82%',
        volumeHeight: '15%'
      };
    }
  };
  
  const gridConfig = getGridConfig();

  // 图例布局：每种指标类型占一行
  const legendLeft = (() => {
    const marginValue = parseFloat(leftMargin);
    if (showYAxis) {
      // 在y轴右侧，添加1%的偏移确保不重叠
      return `${marginValue + 1}%`;
    } else {
      // 不显示Y轴时，使用较小的左边距
      return '8';
    }
  })();

  const commonLegendConfig = {
    show: showIndicatorLabels,
    left: legendLeft,
    itemWidth: isFullscreen ? 14 : 12,
    itemHeight: isFullscreen ? 5 : 4,
    textStyle: {
      color: theme === 'light' ? '#000' : 'rgba(255,255,255,0.85)',
      fontSize: isFullscreen ? 11 : 10
    }
  };

  let legend: any = undefined;
  const legendGroups = Array.from(legendGroupsMap.values());
  if (legendGroups.length === 1) {
    legend = {
      ...commonLegendConfig,
      top: isFullscreen ? 5 : 2,
      data: legendGroups[0]
    };
  } else if (legendGroups.length > 1) {
    const baseTop = isFullscreen ? 5 : 2;
    const rowHeight = 16;
    const rowGap = 4;
    legend = legendGroups.map((items, index) => ({
      ...commonLegendConfig,
      top: baseTop + index * (rowHeight + rowGap),
      data: items
    }));
  }

  return {
    backgroundColor: 'transparent',
    legend,
    // 动画配置：只在初次加载时播放，避免在指标显现阶段重复播放
    animation: shouldPlayKlineAnimation,
    animationDuration: shouldPlayKlineAnimation ? 2000 : 0, // K线绘制动画时长2秒
    animationEasing: 'cubicOut' as const, // 缓动函数，先快后慢
    animationDelay: 0,
    animationDurationUpdate: 300, // 数据更新动画时长缩短
    animationEasingUpdate: 'cubicOut' as const,
    grid: [
      {
        left: leftMargin,
        right: rightMargin,
        top: gridConfig.klineTop,
        height: gridConfig.klineHeight
      },
      {
        left: leftMargin,
        right: rightMargin,
        top: gridConfig.volumeTop,
        height: gridConfig.volumeHeight
      }
    ],
    xAxis: [
      {
        type: 'category' as const,
        data: dates,
        boundaryGap: true,
        axisLine: { onZero: false, lineStyle: { color: '#666' } },
        splitLine: { show: false },
        axisLabel: {
          show: true,
          color: '#999',
          fontSize: isFullscreen ? 12 : 10,
          // 简化：使用ECharts默认的自动间隔，根据图表宽度自动调整标签数量
          // 移动端和桌面端都使用相同的自动行为
          interval: 'auto'
        },
        axisTick: { show: true, alignWithLabel: true as const, lineStyle: { color: '#666' } },
        axisPointer: {
          show: false // 禁用ECharts的axisPointer，使用自定义实现
        }
      },
      {
        type: 'category' as const,
        gridIndex: 1,
        data: dates,
        boundaryGap: true,
        axisLine: { onZero: false, lineStyle: { color: '#666' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          show: false
        },
        axisPointer: {
          show: false // 禁用ECharts的axisPointer，使用自定义实现
        }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitNumber: 5,
        axisLine: { lineStyle: { color: '#666' } },
        splitLine: {
          lineStyle: {
            color: getSplitLineColor(theme),
            type: 'dashed' as const
          }
        },
        axisLabel: {
          show: showYAxis, // 移动端可配置隐藏Y轴标签
          color: '#999',
          fontSize: isFullscreen ? 12 : 10,
          inside: false,
          // margin控制标签与Y轴线的距离，减小此值可以让标签更靠近左侧（更靠近横向虚线）
          margin: (isMobile && isFullscreen) ? 12 : (isFullscreen ? 10 : 8),
          formatter: function(value: any) {
            if (value === null || value === undefined || isNaN(value)) return '0';
            const numValue = Number(value);
            // 大数以万为单位保留1位小数
            if (numValue >= 10000) {
              const v = (numValue / 10000);
              // 避免 10000 -> 1.0万 的小数冗余
              return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + '万';
            }
            // 小数自适应：整数不带小数；否则最多两位，去掉末尾0
            if (Number.isInteger(numValue)) {
              return numValue.toString();
            }
            return numValue.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
          }
        },
        axisPointer: {
          show: false // 禁用ECharts的axisPointer，使用自定义实现
        }
      },
      {
        scale: true,  // 关键：让ECharts根据可视范围自动计算Y轴范围
        gridIndex: 1,
        splitNumber: 2,
        axisLine: { lineStyle: { color: '#666' } },
        splitLine: { show: false },
        axisLabel: {
          show: false  // 隐藏成交量Y轴刻度
        }
        // 不再固定设置min/max，让scale:true根据当前可视数据动态调整Y轴
        // 这样切换显示范围时，柱子高度会自动适应，避免爆量日压扁其他日
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        // 初始显示范围：end基于klineData长度（截断位置），start基于initialCount
        // 当klineData.length < allKlineData.length时，说明有截断，end应该在截断位置
        end: allKlineData.length > 0 ? (klineData.length / allKlineData.length) * 100 : 100,
        start: Math.max(0, (allKlineData.length > 0 ? (klineData.length / allKlineData.length) * 100 : 100) - (initialCount / chartData.length) * 100),
        zoomOnMouseWheel: true,
        // 🔧 修复移动端小图拖动抖动：小图的pan由Hammer.js处理，禁用ECharts的触摸拖动
        moveOnMouseMove: !isSmallMobile,  // 禁用触摸/鼠标拖动平移（避免与Hammer.js冲突）
        moveOnMouseWheel: !isSmallMobile,  // 禁用滚轮移动
        minSpan: Math.max(1, (7 / chartData.length) * 100), // 最小显示7天，基于全部数据计算
        // 允许用户缩放到全部数据范围
        startValue: undefined, // 不限制起始值
        endValue: undefined    // 不限制结束值
      }
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: klineValues,
        // 保证影线在柱体中居中
        barMinWidth: 3,
        barMaxWidth: 20,
        barWidth: '60%',
        // K线动画配置 - 从左到右逐根绘制，只在初次加载时播放
        animation: shouldPlayKlineAnimation,
        animationDuration: shouldPlayKlineAnimation ? 2000 : 0, // 总动画时长2秒
        animationEasing: 'cubicOut' as const,
        animationDelay: shouldPlayKlineAnimation ? ((idx: number) => idx * 15) : 0, // 每根K线延迟15ms，形成波浪式绘制效果
        animationDurationUpdate: 300, // 数据更新动画缩短
        animationEasingUpdate: 'cubicOut' as const,
        itemStyle: {
          color: upColor,      // 阳线颜色（根据colorScheme）
          color0: downColor,   // 阴线颜色（根据colorScheme）
          borderColor: upColor,
          borderColor0: downColor
        },
        emphasis: isSmallMobile
          ? { disabled: true }
          : {
              itemStyle: {
                color: '#ff6b6b',
                color0: '#69c0ff',
                borderColor: '#ff6b6b',
                borderColor0: '#69c0ff'
              }
            }
      },
      // 使用 custom 系列绘制开盘竞价横线（价格）- 精准对齐柱子中心
      ...(showAuctionIndicator && auctionPrices.some(p => p !== null) ? [
        createAuctionLineSeries(
          '竞价均价线',
          auctionPrices
            .map((price, index) => (price !== null && price > 0 ? [index, price] as [number, number] : null))
            .filter((v): v is [number, number] => Array.isArray(v)),
          0,
          0
        )
      ] : []),
      // EXPMA指标线 - 根据indicatorLineSettings过滤显示
      ...(overlayIndicatorSet.has('expma') && expmaData ? [
        ...(expmaLines.includes(5) ? [{
          name: 'EXPMA5',
          type: 'line' as const,
          data: makeRevealedData(expmaData.expma5),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma5, width: 1 },
          symbol: 'none'
        }] : []),
        ...(expmaLines.includes(10) ? [{
          name: 'EXPMA10',
          type: 'line' as const,
          data: makeRevealedData(expmaData.expma10),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma10, width: 1 },
          symbol: 'none'
        }] : []),
        ...(expmaLines.includes(20) ? [{
          name: 'EXPMA20',
          type: 'line' as const,
          data: makeRevealedData(expmaData.expma20),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma20, width: 1 },
          symbol: 'none'
        }] : []),
        ...(expmaLines.includes(60) ? [{
          name: 'EXPMA60',
          type: 'line' as const,
          data: makeRevealedData(expmaData.expma60),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma60, width: 1 },
          symbol: 'none'
        }] : []),
        ...(expmaLines.includes(250) ? [{
          name: 'EXPMA250',
          type: 'line' as const,
          data: makeRevealedData(expmaData.expma250),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma250, width: 1 },
          symbol: 'none'
        }] : [])
      ] : []),
      // BOLL指标线 - 根据indicatorLineSettings过滤显示
      ...(overlayIndicatorSet.has('boll') && bollData ? [
        ...(bollLines.includes('upper') ? [{
          name: 'BOLL-UP',
          type: 'line' as const,
          data: bollData.upper,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.bollUp, width: 1 },
          symbol: 'none'
        }] : []),
        ...(bollLines.includes('mid') ? [{
          name: 'BOLL-MID',
          type: 'line' as const,
          data: bollData.middle,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.bollMid, width: 1 },
          symbol: 'none'
        }] : []),
        ...(bollLines.includes('lower') ? [{
          name: 'BOLL-LOW',
          type: 'line' as const,
          data: bollData.lower,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.bollLow, width: 1 },
          symbol: 'none'
        }] : [])
      ] : []),
      // MA指标线 - 根据indicatorLineSettings过滤显示
      ...(overlayIndicatorSet.has('ma') && maData ? [
        ...(maLines.includes(5) ? [{
          name: 'MA5',
          type: 'line' as const,
          data: makeRevealedData(maData.ma5),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma5, width: 1 },
          symbol: 'none'
        }] : []),
        ...(maLines.includes(10) ? [{
          name: 'MA10',
          type: 'line' as const,
          data: makeRevealedData(maData.ma10),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma10, width: 1 },
          symbol: 'none'
        }] : []),
        ...(maLines.includes(20) ? [{
          name: 'MA20',
          type: 'line' as const,
          data: makeRevealedData(maData.ma20),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma20, width: 1 },
          symbol: 'none'
        }] : []),
        ...(maLines.includes(60) ? [{
          name: 'MA60',
          type: 'line' as const,
          data: makeRevealedData(maData.ma60),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma60, width: 1 },
          symbol: 'none'
        }] : []),
        ...(maLines.includes(250) ? [{
          name: 'MA250',
          type: 'line' as const,
          data: makeRevealedData(maData.ma250),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.ma250, width: 1 },
          symbol: 'none'
        }] : [])
      ] : []),
      // SAR指标（支持作为主图叠加）
      ...(overlayIndicatorSet.has('sar') && sarData ? [
        {
          name: 'SAR',
          type: 'scatter' as const,
          data: makeRevealedData(sarData.values).map((value, index) => {
            if (value === null) return null;
            // 根据趋势返回不同颜色的数据点 [x, y, trend]
            return [index, value, sarData.trends[index] ? 1 : 0];
          }).filter(item => item !== null),
          animation: false,
          symbolSize: 3,
          itemStyle: {
            color: function(params: any) {
              // params.data[2] 是趋势标志：1为上升趋势(红色)，0为下降趋势(绿色)
              return params.data[2] ? '#ff4d4f' : '#52c41a';
            }
          }
        }
      ] : []),
      // 神奇九转指标（支持作为主图叠加）
      ...(overlayIndicatorSet.has('td') && tdData ? [
        {
          name: 'TD买入',
          type: 'scatter' as const,
          data: tdData.buySignals.map((signal, index) => {
            if (signal !== null) {
              return [index, chartData[index].low * 0.995, signal]; // 在K线下方显示
            }
            return null;
          }).filter(item => item !== null),
          animation: false,
          symbolSize: 8, // 缩小圆点大小
          itemStyle: { color: '#ff4d4f' }, // 买入信号红色
            label: {
              show: showIndicatorLabels,
              position: 'bottom' as const,
              formatter: function(params: any) {
                return params.data[2].toString();
              },
              color: indicatorColors.tdLabel,
              fontSize: 10,
              fontWeight: 'bold' as const
            }
        },
        {
          name: 'TD卖出',
          type: 'scatter' as const,
          data: tdData.sellSignals.map((signal, index) => {
            if (signal !== null) {
              return [index, chartData[index].high * 1.005, signal]; // 在K线上方显示
            }
            return null;
          }).filter(item => item !== null),
          animation: false,
          symbolSize: 8, // 缩小圆点大小
          itemStyle: { color: '#52c41a' }, // 卖出信号绿色
            label: {
              show: showIndicatorLabels,
              position: 'top' as const,
              formatter: function(params: any) {
                return params.data[2].toString();
              },
              color: indicatorColors.tdLabel,
              fontSize: 10,
              fontWeight: 'bold' as const
            }
        }
      ] : []),
      // MACD指标 - 根据indicatorLineSettings过滤显示
      ...(indicator === 'macd' && macdData ? [
        ...(macdLines.includes('dif') ? [{
          name: 'MACD-DIF',
          type: 'line' as const,
          data: macdData.dif,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.macdDif, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(macdLines.includes('dea') ? [{
          name: 'MACD-DEA',
          type: 'line' as const,
          data: macdData.dea,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.macdDea, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(macdLines.includes('macd') ? [{
          name: 'MACD-BAR',
          type: 'bar' as const,
          data: macdData.bar,
          itemStyle: {
            color: (params: any) => (params.value >= 0 ? '#ff7875' : '#73d13d')
          },
          emphasis: isSmallMobile ? { disabled: true } : undefined,
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : [])
      ] : []),
      // RSI指标
      ...(indicator === 'rsi' && rsiData !== null ? [
        {
          name: 'RSI',
          type: 'line' as const,
          data: rsiData,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.rsi6, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }
      ] : []),
      // KDJ指标 - 根据indicatorLineSettings过滤显示
      ...(indicator === 'kdj' && kdjData ? [
        ...(kdjLines.includes('k') ? [{
          name: 'K',
          type: 'line' as const,
          data: kdjData.k,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.kdjK, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(kdjLines.includes('d') ? [{
          name: 'D',
          type: 'line' as const,
          data: kdjData.d,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.kdjD, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(kdjLines.includes('j') ? [{
          name: 'J',
          type: 'line' as const,
          data: kdjData.j,
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.kdjJ, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : [])
      ] : []),
      // CCI指标
      ...(indicator === 'cci' && cciData !== null ? [
        {
          name: 'CCI',
          type: 'line' as const,
          data: makeRevealedData(cciData),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.cci, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }
      ] : []),
      // WR指标
      ...(indicator === 'wr' && wrData !== null ? [
        {
          name: 'WR',
          type: 'line' as const,
          data: makeRevealedData(wrData),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.wr, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }
      ] : []),
      // DMI指标 - 根据indicatorLineSettings过滤显示
      ...(indicator === 'dmi' && dmiData ? [
        ...(dmiLines.includes('pdi') ? [{
          name: 'PDI',
          type: 'line' as const,
          data: makeRevealedData(dmiData.pdi),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.dmiPdi, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(dmiLines.includes('mdi') ? [{
          name: 'MDI',
          type: 'line' as const,
          data: makeRevealedData(dmiData.mdi),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.dmiMdi, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(dmiLines.includes('adx') ? [{
          name: 'ADX',
          type: 'line' as const,
          data: makeRevealedData(dmiData.adx),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.dmiAdx, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : []),
        ...(dmiLines.includes('adxr') && dmiData.adxr ? [{
          name: 'ADXR',
          type: 'line' as const,
          data: makeRevealedData(dmiData.adxr),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.dmiAdxr || '#9254de', width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }] : [])
      ] : []),
      // OBV指标
      ...(indicator === 'obv' && obvData !== null ? [
        {
          name: 'OBV',
          type: 'line' as const,
          data: makeRevealedData(obvData),
          smooth: true,
          animation: false,
          lineStyle: { color: indicatorColors.obv, width: 1 },
          symbol: 'none',
          yAxisIndex: 1,
          xAxisIndex: 1
        }
      ] : []),
      // VOL指标（成交量）
      ...(indicator === 'vol' ? [
        {
          name: '成交量',
          type: 'bar' as const,
          data: volumes,
          animation: false,
          itemStyle: {
            color: function(params: any) {
              const index = params.dataIndex;
              if (index === 0) return '#ff4d4f';
              const current = chartData[index];
              const prev = chartData[index - 1];
              return current.close >= prev.close ? '#ff4d4f' : '#52c41a';
            }
          },
          emphasis: isSmallMobile ? { disabled: true } : undefined,
          yAxisIndex: 1,
          xAxisIndex: 1
        }
      ] : []),
      // 默认成交量（选择开盘竞价指标时不显示，只显示开盘竞价成交量横线）
      ...(!isOscillator && indicator !== 'auction' ? [{
        name: '成交量',
        type: 'bar' as const,
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        // 成交量柱状图动画配置，只在初次加载时播放
        animation: shouldPlayKlineAnimation,
        animationDuration: shouldPlayKlineAnimation ? 2000 : 0, // 与K线同步
        animationEasing: 'cubicOut' as const,
        animationDelay: shouldPlayKlineAnimation ? ((idx: number) => idx * 15) : 0, // 与K线同步的延迟
        animationDurationUpdate: 300,
        animationEasingUpdate: 'cubicOut' as const,
        itemStyle: {
          color: function(params: any) {
            const dataIndex = params.dataIndex;
            if (dataIndex === 0 || !klineValues[dataIndex] || !klineValues[dataIndex - 1]) {
              return '#999';
            }
            const current = klineValues[dataIndex];
            const prev = klineValues[dataIndex - 1];
            // 安全比较收盘价
            const currentClose = safeNumber(current[1]);
            const prevClose = safeNumber(prev[1]);
            // 根据colorScheme设置颜色
            return currentClose > prevClose ? upColor : downColor;
          }
        },
        emphasis: isSmallMobile ? { disabled: true } : undefined
      }] : []),
      // 使用柱状图显示开盘竞价成交量（根据涨跌显示红绿色，波动更明显）
      ...(showAuctionIndicator && !isOscillator && auctionVolumes.some(v => v !== null) ? [
        createAuctionVolumeBarSeries('竞价成交量', chartData, auctionVolumes, upColor, downColor, 1, 1)
      ] : [])
    ],
    // 禁用ECharts本身的十字线，使用自定义实现
    axisPointer: {
      show: false // 完全禁用ECharts的axisPointer
    },
    tooltip: {
      show: false, // 禁用tooltip，使用自定义十字线
      trigger: 'none' as const,
      backgroundColor: 'rgba(0,0,0,0.1)',  // 最大透明度
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderRadius: 6,
      textStyle: {
        color: '#fff',
        fontSize: isFullscreen ? 12 : 10,
        textShadowColor: 'rgba(0,0,0,1)',
        textShadowBlur: 4,
        textShadowOffsetX: 2,
        textShadowOffsetY: 2,
        fontWeight: 700 as any
      },
      // 解决tooltip被卡片遮挡的问题
      appendToBody: true,  // 将tooltip添加到body而不是图表容器
      confine: false,      // 不限制tooltip在图表区域内
      position: function (point: any, _params: any, _dom: any, _rect: any, size: any) {
        // 智能定位，避免被遮挡
        const [mouseX, mouseY] = point;
        const { contentSize, viewSize } = size;
        const [tooltipWidth, tooltipHeight] = contentSize;
        const [chartWidth, chartHeight] = viewSize;

        let x = mouseX + 10; // 默认在鼠标右侧
        let y = mouseY - tooltipHeight / 2; // 垂直居中

        // 如果右侧空间不够，显示在左侧
        if (x + tooltipWidth > chartWidth) {
          x = mouseX - tooltipWidth - 10;
        }

        // 如果上方空间不够，向下调整
        if (y < 0) {
          y = 10;
        }

        // 如果下方空间不够，向上调整
        if (y + tooltipHeight > chartHeight) {
          y = chartHeight - tooltipHeight - 10;
        }

        return [x, y];
      },
      // 设置高z-index确保tooltip不被遮挡，移除模糊效果让底部K线清晰可见
      extraCssText: 'z-index: 10002; box-shadow: none;',
      formatter: function (params: any) {
        // 获取当前十字线位置的数据索引
        const klineParam = params[0];
        if (!klineParam || klineParam.dataIndex === undefined) return '';

        const dataIndex = klineParam.dataIndex;
        if (dataIndex < 0 || dataIndex >= klineData.length) return '';

        const originalData = klineData[dataIndex];
        if (!originalData) return '';

        // 安全的数值格式化函数
        const safeToFixed = (value: any, digits: number = 2) => {
          if (value === null || value === undefined || isNaN(value)) return '0.00';
          return Number(value).toFixed(digits);
        };

        // 格式化日期显示
        const formatDate = (dateStr: string) => {
          if (!dateStr || dateStr.length < 8) return dateStr;
          return `${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`;
        };

        // 构建tooltip内容
        let content = `
          <div style="font-size: 11px; line-height: 1.4;">
            <div style="font-weight: bold; margin-bottom: 4px;">${formatDate(originalData.trade_date)}</div>
        `;

        // 可按需在此处添加吸附点的特殊标识
        content += `
            <div>开盘: <span style="color: #fff;">${safeToFixed(originalData.open)}</span></div>
            <div>收盘: <span style="color: #fff;">${safeToFixed(originalData.close)}</span></div>
            <div>最高: <span style="color: #fff;">${safeToFixed(originalData.high)}</span></div>
            <div>最低: <span style="color: #fff;">${safeToFixed(originalData.low)}</span></div>
            <div>涨跌: <span style="color: ${originalData.pct_chg >= 0 ? '#ff4d4f' : '#52c41a'};">${safeToFixed(originalData.pct_chg)}%</span></div>
            <div>成交量: <span style="color: #fff;">${safeToFixed(originalData.vol / 10000, 1)}万手</span></div>
          </div>
        `;

        return content;
      }
    }
  };
};

// 导出标签数据获取函数（供Canvas层使用）
export interface LabelData {
  klineLabels: Array<{ name: string; color: string }>;
  volumeLabels: Array<{ name: string; color: string }>;
}

export const getLabelData = (indicator: string, mainIndicators: string[] = []): LabelData => {
  const klineLabels: Array<{ name: string; color: string }> = [];
  const volumeLabels: Array<{ name: string; color: string }> = [];

  // 主图叠加标签：来自 mainIndicators + 兼容旧用法（indicator 本身为主图类型时）
  const overlayKeys = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const overlaySet = new Set<string>((mainIndicators || []).filter(Boolean));
  if (overlayKeys.has(indicator)) {
    overlaySet.add(indicator);
  }

  const addOverlayLabel = (key: string) => {
    switch (key) {
      case 'expma':
        klineLabels.push(
          { name: 'EXPMA5', color: '#ffffff' },
          { name: 'EXPMA10', color: '#ffff00' },
          { name: 'EXPMA20', color: '#ff00ff' },
          { name: 'EXPMA60', color: '#00ffff' }
        );
        break;
      case 'ma':
        klineLabels.push(
          { name: 'MA5', color: '#ffffff' },
          { name: 'MA10', color: '#ffff00' },
          { name: 'MA20', color: '#ff00ff' },
          { name: 'MA60', color: '#00ffff' }
        );
        break;
      case 'boll':
        klineLabels.push(
          { name: 'BOLL-UP', color: '#fadb14' },
          { name: 'BOLL-MID', color: '#ffffff' },
          { name: 'BOLL-LOW', color: '#52c41a' }
        );
        break;
      case 'sar':
        klineLabels.push({ name: 'SAR', color: '#ff4d4f' });
        break;
      case 'td':
        klineLabels.push(
          { name: 'TD买入', color: '#ff4d4f' },
          { name: 'TD卖出', color: '#52c41a' }
        );
        break;
      default:
        break;
    }
  };

  overlaySet.forEach(addOverlayLabel);

  // 副图指标标签逻辑保持不变
  switch (indicator) {
    case 'macd':
      volumeLabels.push(
        { name: 'MACD-DIF', color: '#ff4d4f' },
        { name: 'MACD-DEA', color: '#1890ff' },
        { name: 'MACD-BAR', color: '#ff7875' }
      );
      break;
    case 'kdj':
      volumeLabels.push(
        { name: 'K', color: '#69c0ff' },
        { name: 'D', color: '#ff85c0' },
        { name: 'J', color: '#b7eb8f' }
      );
      break;
    case 'rsi':
      volumeLabels.push({ name: 'RSI', color: '#ffd666' });
      break;
    case 'cci':
      volumeLabels.push({ name: 'CCI', color: '#ff4d4f' });
      break;
    case 'wr':
      volumeLabels.push({ name: 'WR', color: '#52c41a' });
      break;
    case 'dmi':
      volumeLabels.push(
        { name: 'PDI', color: '#ff4d4f' },
        { name: 'MDI', color: '#52c41a' },
        { name: 'ADX', color: '#fadb14' }
      );
      break;
    case 'obv':
      volumeLabels.push({ name: 'OBV', color: '#722ed1' });
      break;
  }

  // 如果没有选择指标或选择了无，只显示成交量标签
  // 选择开盘竞价指标时不显示成交量标签，因为量能柱已隐藏，只显示开盘竞价成交量横线
  if ((indicator === 'none' || (klineLabels.length === 0 && volumeLabels.length === 0)) && indicator !== 'auction') {
    volumeLabels.push({ name: '成交量', color: '#ff4d4f' });
  }
  // 开盘竞价指标时，添加开盘竞价成交量标签（只在股票类型时显示，但这里只检查indicator即可，因为非股票类型不会显示开盘竞价选项）
  if (indicator === 'auction') {
    volumeLabels.push({ name: '竞价成交量', color: '#ffd700' });
  }

  return { klineLabels, volumeLabels };
};
