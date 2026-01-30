// 默认断点配置（精细版，9.9%作为涨停/跌停边界）
export const DEFAULT_BREAKPOINTS = [-9.9, -7, -5, -3, -1, 0, 1, 3, 5, 7, 9.9];

// 图表颜色配置
export const NEG_COLORS = ['#135200', '#237804', '#389e0d', '#52c41a', '#73d13d', '#95de64'];
export const POS_COLORS = ['#ffd6d6', '#ffccc7', '#ff7875', '#f5222d', '#cf1322', '#820014'];
export const UP_COLOR = '#ff4d4f';
export const DOWN_COLOR = '#52c41a';

// 根据涨跌幅获取渐变颜色（深浅表示幅度大小）
// 使用与柱状图一致的 NEG_COLORS/POS_COLORS 色系
export const getColorByPctChg = (pctChg: number): string => {
  const absPct = Math.abs(pctChg);
  if (pctChg >= 0) {
    // 涨：使用 POS_COLORS 色系（浅红→深红）
    if (absPct >= 9.9) return '#820014';      // 涨停 - 深红
    if (absPct >= 7) return '#cf1322';
    if (absPct >= 5) return '#f5222d';
    if (absPct >= 3) return '#ff7875';
    if (absPct >= 1) return '#ffccc7';
    return '#ffd6d6';                          // 微涨 - 浅红
  } else {
    // 跌：使用 NEG_COLORS 色系（浅绿→深绿）
    if (absPct >= 9.9) return '#135200';      // 跌停 - 深绿
    if (absPct >= 7) return '#237804';
    if (absPct >= 5) return '#389e0d';
    if (absPct >= 3) return '#52c41a';
    if (absPct >= 1) return '#73d13d';
    return '#95de64';                          // 微跌 - 浅绿
  }
};

// 根据区间标签判断区间类型：'positive' | 'negative' | 'zero' | 'mixed'
export const getRangeType = (rangeLabel: string): 'positive' | 'negative' | 'zero' | 'mixed' => {
  if (rangeLabel === '=0') return 'zero';
  
  // 解析区间的上下界
  let lower: number | null = null;
  let upper: number | null = null;
  
  if (rangeLabel.startsWith('<=')) {
    upper = parseFloat(rangeLabel.slice(2));
    lower = -Infinity;
  } else if (rangeLabel.startsWith('>=')) {
    lower = parseFloat(rangeLabel.slice(2));
    upper = Infinity;
  } else if (rangeLabel.includes('~')) {
    const parts = rangeLabel.split('~');
    lower = parseFloat(parts[0]);
    upper = parseFloat(parts[1]);
  }
  
  if (lower === null || upper === null) return 'mixed';
  
  // 判断区间类型
  if (upper <= 0 && lower < 0) return 'negative';
  if (lower >= 0 && upper > 0) return 'positive';
  if (lower < 0 && upper > 0) return 'mixed';
  
  return 'mixed';
};

// 根据断点生成区间标签
export const generateRangeLabels = (breakpoints: number[]): string[] => {
  const sorted = [...breakpoints].sort((a, b) => a - b);
  const labels: string[] = [];
  
  // 第一个区间：<= 最小断点
  labels.push(`<=${sorted[0]}`);
  
  // 中间区间
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (left === 0) {
      labels.push('=0');
      if (right !== 0) labels.push(`0~${right}`);
    } else if (right === 0) {
      labels.push(`${left}~0`);
    } else {
      labels.push(`${left}~${right}`);
    }
  }
  
  // 如果0在断点中但不是最后一个，需要处理=0
  if (sorted.includes(0) && sorted[sorted.length - 1] !== 0) {
    // 已在循环中处理
  } else if (!sorted.includes(0)) {
    // 0不在断点中，不需要=0区间
  }
  
  // 最后一个区间：>= 最大断点
  labels.push(`>=${sorted[sorted.length - 1]}`);
  
  return labels;
};

// 根据断点动态计算分桶索引
export const getBucketIndexDynamic = (pct: number, breakpoints: number[]): number => {
  const sorted = [...breakpoints].sort((a, b) => a - b);
  
  // <= 最小断点
  if (pct <= sorted[0]) return 0;
  
  let idx = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    
    if (left === 0) {
      // =0 区间
      if (pct === 0) return idx;
      idx++;
      // 0~right 区间
      if (pct > 0 && pct <= right) return idx;
      idx++;
    } else if (right === 0) {
      // left~0 区间
      if (pct > left && pct < 0) return idx;
      idx++;
    } else {
      // 普通区间 left~right
      if (pct > left && pct <= right) return idx;
      idx++;
    }
  }
  
  // >= 最大断点
  return idx;
};

// 计算基础涨跌统计
export const computeBaseSummary = <T extends { pct_chg: number }>(items: T[]) => ({
  total: items.length,
  up: items.filter(i => i.pct_chg > 0).length,
  down: items.filter(i => i.pct_chg < 0).length,
  flat: items.filter(i => i.pct_chg === 0 || i.pct_chg === null || i.pct_chg === undefined).length,
});

// 按范围筛选 items（通用函数）
export const filterItemsByRange = <T>(
  items: T[],
  range: [number, number],
  getField: (item: T) => number
): T[] => {
  const [min, max] = range;
  if (min === -Infinity && max === Infinity) return items;
  return items.filter(item => {
    const val = getField(item) ?? 0;
    if (min === 0 && max === 0) return val === 0;
    return val >= min && val <= max;
  });
};

// 计算分布桶数据（简单版，不保存items）
export const computeDistributionBuckets = <T>(
  items: T[],
  getField: (item: T) => number,
  breakpoints: number[] = DEFAULT_BREAKPOINTS
): { range: string; count: number }[] => {
  const rangeLabels = generateRangeLabels(breakpoints);
  const buckets = rangeLabels.map(range => ({ range, count: 0 }));
  
  items.forEach(item => {
    const val = getField(item) ?? 0;
    const idx = getBucketIndexDynamic(val, breakpoints);
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].count++;
    }
  });
  
  return buckets;
};

// 分布桶类型（保存items用于后续筛选）
export interface DistributionBucket<T> {
  range: string;
  count: number;
  intraday_count: number;
  items: T[];
}

// 计算分布桶（保存items，用于范围筛选优化）
export const computePctBucketsWithItems = <T extends { pct_chg: number; intraday_pct: number }>(
  items: T[],
  breakpoints: number[] = DEFAULT_BREAKPOINTS
): DistributionBucket<T>[] => {
  const rangeLabels = generateRangeLabels(breakpoints);
  const buckets: DistributionBucket<T>[] = rangeLabels.map(range => ({
    range, count: 0, intraday_count: 0, items: []
  }));

  items.forEach(item => {
    const closeIdx = getBucketIndexDynamic(item.pct_chg ?? 0, breakpoints);
    const intradayIdx = getBucketIndexDynamic(item.intraday_pct ?? 0, breakpoints);
    if (closeIdx >= 0 && closeIdx < buckets.length) {
      buckets[closeIdx].count++;
      buckets[closeIdx].items.push(item);
    }
    if (intradayIdx >= 0 && intradayIdx < buckets.length) {
      buckets[intradayIdx].intraday_count++;
    }
  });

  return buckets;
};

// 从桶内items筛选计算收盘分布
export const computeFilteredDistribution = <T extends { pct_chg: number }>(
  buckets: DistributionBucket<T>[],
  range: [number, number]
): { range: string; count: number }[] => {
  const [min, max] = range;
  if (min === -Infinity && max === Infinity) {
    return buckets.map(b => ({ range: b.range, count: b.count }));
  }
  return buckets.map(b => {
    const filteredCount = b.items.filter(item => {
      const pct = item.pct_chg ?? 0;
      if (min === 0 && max === 0) return pct === 0;
      return pct >= min && pct <= max;
    }).length;
    return { range: b.range, count: filteredCount };
  });
};

// 从所有items筛选后按intraday_pct重新分桶
export const computeSecondaryDistribution = <T extends { intraday_pct: number }>(
  buckets: DistributionBucket<T>[],
  range: [number, number],
  breakpoints: number[] = DEFAULT_BREAKPOINTS
): { range: string; count: number }[] => {
  const [min, max] = range;
  const rangeLabels = generateRangeLabels(breakpoints);
  
  if (min === -Infinity && max === Infinity) {
    return buckets.map(b => ({ range: b.range, count: b.intraday_count }));
  }
  
  // 收集所有items
  const allItems: T[] = [];
  buckets.forEach(b => b.items.forEach(item => allItems.push(item)));
  
  // 按 intraday_pct 范围筛选
  const filteredItems = allItems.filter(item => {
    const pct = item.intraday_pct ?? 0;
    if (min === 0 && max === 0) return pct === 0;
    return pct >= min && pct <= max;
  });
  
  // 按 intraday_pct 重新分桶
  const newBuckets = rangeLabels.map(range => ({ range, count: 0 }));
  filteredItems.forEach(item => {
    const idx = getBucketIndexDynamic(item.intraday_pct ?? 0, breakpoints);
    if (idx >= 0 && idx < newBuckets.length) {
      newBuckets[idx].count++;
    }
  });
  
  return newBuckets;
};

// 转换十六进制颜色为RGBA
export const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 计算默认的对比日期（下一个交易日）
export const computeDefaultCompareDate = (baseDt: string, tradingDays: string[]): string => {
  if (!baseDt || tradingDays.length === 0) return baseDt;
  const baseDtStr = `${baseDt.slice(0,4)}-${baseDt.slice(4,6)}-${baseDt.slice(6,8)}`;
  const idx = tradingDays.indexOf(baseDtStr);
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  
  if (idx >= 0 && idx < tradingDays.length - 1) {
    const nextTradingDay = tradingDays[idx + 1].replace(/-/g, '');
    // 如果下一个交易日是未来日期，则取baseDate
    return nextTradingDay > todayStr ? baseDt : nextTradingDay;
  }
  return baseDt;
};


// 日期格式化工具函数
export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr || dateStr.length !== 8) return '';
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
};

export const formatDateShort = (dateStr: string): string => {
  if (!dateStr || dateStr.length !== 8) return '';
  return `${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}`;
};

// 解析YYYYMMDD为Date
export const parseYYYYMMDD = (str: string): Date | null => {
  if (!str || str.length !== 8) return null;
  const y = parseInt(str.substring(0, 4));
  const m = parseInt(str.substring(4, 6)) - 1;
  const d = parseInt(str.substring(6, 8));
  return new Date(y, m, d);
};

// 格式化Date为YYYYMMDD
export const formatYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

// ==================== 日历验证相关函数（桌面端和移动端共享） ====================

// 日期验证结果类型
export interface DateValidationResult {
  valid: boolean;
  message?: string;
}

// 检查日期是否应该被禁用（统一逻辑，以桌面端为准）
export const shouldDisableDate = (
  date: Date,
  options: {
    disableFuture?: boolean;
    disableBefore?: string; // YYYYMMDD - 禁用此日期之前的日期（不包含该日期）
    disableAfter?: string;  // YYYYMMDD - 禁用此日期及之后的日期
    tradingDays?: string[]; // YYYY-MM-DD format array
  }
): boolean => {
  const { disableFuture = true, disableBefore, disableAfter, tradingDays } = options;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  // 禁用未来日期
  if (disableFuture && checkDate > today) return true;
  
  // 禁用指定日期之前的日期（不包含该日期）
  if (disableBefore) {
    const beforeDt = parseYYYYMMDD(disableBefore);
    if (beforeDt) {
      beforeDt.setHours(0, 0, 0, 0);
      if (checkDate < beforeDt) return true;
    }
  }
  
  // 禁用指定日期之后的日期（允许等于，支持日内统计）
  if (disableAfter) {
    const afterDt = parseYYYYMMDD(disableAfter);
    if (afterDt) {
      afterDt.setHours(0, 0, 0, 0);
      if (checkDate > afterDt) return true;
    }
  }
  
  // 如果有交易日数据，非交易日也禁用
  if (tradingDays && tradingDays.length > 0) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (!tradingDays.includes(dateStr)) return true;
  }
  
  return false;
};

// 验证选择的日期（用于点击时的验证）
export const validateSelectedDate = (
  date: Date,
  options: {
    disableBefore?: string;
    disableAfter?: string;
    tradingDays?: string[];
  }
): DateValidationResult => {
  const { disableBefore, disableAfter, tradingDays } = options;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  // 检查是否是未来日期
  if (checkDate > today) {
    return { valid: false, message: '不能选择未来日期' };
  }
  
  // 检查是否小于最小日期
  if (disableBefore) {
    const beforeDt = parseYYYYMMDD(disableBefore);
    if (beforeDt) {
      beforeDt.setHours(0, 0, 0, 0);
      if (checkDate < beforeDt) {
        return { valid: false, message: '结束日期不能早于开始日期' };
      }
    }
  }
  
  // 检查是否大于最大日期（允许等于，支持日内统计）
  if (disableAfter) {
    const afterDt = parseYYYYMMDD(disableAfter);
    if (afterDt) {
      afterDt.setHours(0, 0, 0, 0);
      if (checkDate > afterDt) {
        return { valid: false, message: '开始日期不能晚于结束日期' };
      }
    }
  }
  
  // 检查是否是交易日
  if (tradingDays && tradingDays.length > 0) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (!tradingDays.includes(dateStr)) {
      return { valid: false, message: '请选择交易日' };
    }
  }
  
  return { valid: true };
};

// ============ 统计计算共享函数 ============

// 涨跌停阈值
export const LIMIT_UP_THRESHOLD = 9.9;
export const LIMIT_DOWN_THRESHOLD = -9.9;

// 当日统计摘要类型
export interface DailySummary {
  total: number;
  up: number;
  down: number;
  flat: number;
  intraday_up: number;
  intraday_down: number;
  intraday_flat: number;
  limit_up: number;
  limit_down: number;
  intraday_limit_up: number;
  intraday_limit_down: number;
}

// 日期对比统计摘要类型
export interface CompareSummary {
  total: number;
  up: number;
  down: number;
  flat: number;
  avg_pct_chg: number;
  median_pct_chg: number;
  win_rate: number;
  max_gain: number;
  max_loss: number;
  limit_up: number;
  limit_down: number;
}

// 计算当日统计摘要
export const computeDailySummary = <T extends { pct_chg: number; intraday_pct: number }>(
  items: T[],
  range: [number, number]
): DailySummary => {
  const defaultSummary: DailySummary = {
    total: 0, up: 0, down: 0, flat: 0,
    intraday_up: 0, intraday_down: 0, intraday_flat: 0,
    limit_up: 0, limit_down: 0,
    intraday_limit_up: 0, intraday_limit_down: 0,
  };
  
  if (!items || items.length === 0) return defaultSummary;
  
  const filteredItems = filterItemsByRange(items, range, (i) => i.pct_chg);
  const base = computeBaseSummary(filteredItems);
  
  return {
    ...base,
    intraday_up: filteredItems.filter(i => i.intraday_pct > 0).length,
    intraday_down: filteredItems.filter(i => i.intraday_pct < 0).length,
    intraday_flat: filteredItems.filter(i => i.intraday_pct === 0 || i.intraday_pct === null || i.intraday_pct === undefined).length,
    limit_up: filteredItems.filter(i => i.pct_chg >= LIMIT_UP_THRESHOLD).length,
    limit_down: filteredItems.filter(i => i.pct_chg <= LIMIT_DOWN_THRESHOLD).length,
    intraday_limit_up: filteredItems.filter(i => i.intraday_pct >= LIMIT_UP_THRESHOLD).length,
    intraday_limit_down: filteredItems.filter(i => i.intraday_pct <= LIMIT_DOWN_THRESHOLD).length,
  };
};

// 计算日期对比统计摘要
export const computeCompareSummary = <T extends { pct_chg: number }>(
  items: T[],
  range: [number, number]
): CompareSummary => {
  const defaultSummary: CompareSummary = {
    total: 0, up: 0, down: 0, flat: 0,
    avg_pct_chg: 0, median_pct_chg: 0,
    win_rate: 0, max_gain: 0, max_loss: 0,
    limit_up: 0, limit_down: 0,
  };
  
  if (!items || items.length === 0) return defaultSummary;
  
  const filteredItems = filterItemsByRange(items, range, (i) => i.pct_chg);
  const base = computeBaseSummary(filteredItems);
  const pctChanges = filteredItems.map(i => i.pct_chg).filter(p => p !== null && p !== undefined);
  
  if (pctChanges.length === 0) return { ...defaultSummary, ...base };
  
  // 平均值
  const avg = pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length;
  
  // 中位数
  const sorted = [...pctChanges].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  
  // 其他统计
  const winRate = base.total > 0 ? (base.up / base.total) * 100 : 0;
  const maxGain = Math.max(...pctChanges);
  const maxLoss = Math.min(...pctChanges);
  const limitUp = pctChanges.filter(p => p >= LIMIT_UP_THRESHOLD).length;
  const limitDown = pctChanges.filter(p => p <= LIMIT_DOWN_THRESHOLD).length;
  
  return {
    ...base,
    avg_pct_chg: Math.round(avg * 100) / 100,
    median_pct_chg: Math.round(median * 100) / 100,
    win_rate: winRate,
    max_gain: maxGain,
    max_loss: maxLoss,
    limit_up: limitUp,
    limit_down: limitDown,
  };
};

// 对称对数变换 (symlog) - 用于气泡图X轴
// 在线性阈值内保持线性，阈值外使用对数压缩
export const SYMLOG_THRESHOLD = 10; // 线性阈值：±10%内线性

export const symlogTransform = (x: number, linThresh: number = SYMLOG_THRESHOLD): number => {
  if (Math.abs(x) <= linThresh) {
    return x;
  }
  const sign = x >= 0 ? 1 : -1;
  return sign * (linThresh + Math.log10(1 + Math.abs(x) - linThresh));
};

export const symlogInverse = (tx: number, linThresh: number = SYMLOG_THRESHOLD): number => {
  if (Math.abs(tx) <= linThresh) {
    return tx;
  }
  const sign = tx >= 0 ? 1 : -1;
  return sign * (linThresh + Math.pow(10, Math.abs(tx) - linThresh) - 1);
};

// ==================== 图表相关配置 ====================
// 扩展的图表类型
export type ExtendedChartType = 'bar' | 'pie' | 'distribution' | 'bubble' | 'treemap';

// 筛选维度类型
export type FilterDimension = 'pct_chg' | 'circ_mv' | 'amount' | 'close';

// 维度预设值类型
export interface DimensionPreset {
  label: string;
  value: [number, number];
}

// 对数刻度转换工具函数
// 真实值 -> 滑块值（对数）
export const valueToLog = (value: number, minVal: number = 0.1): number => {
  if (value <= 0) return 0;
  const safeMin = Math.max(minVal, 0.01);
  return Math.log10(Math.max(value, safeMin));
};

// 滑块值（对数） -> 真实值
export const logToValue = (logValue: number): number => {
  return Math.pow(10, logValue);
};

// 筛选维度配置
export const FILTER_DIMENSION_CONFIG: Record<FilterDimension, {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  useLog: boolean; // 是否使用对数刻度
  formatValue: (v: number) => string;
  presets: DimensionPreset[];
}> = {
  pct_chg: {
    label: '涨跌幅',
    unit: '%',
    min: -15,
    max: 15,
    step: 1,
    useLog: false,
    formatValue: (v) => v === -Infinity ? '≤-15' : v === Infinity ? '≥15' : `${v}`,
    presets: [
      { label: '全部', value: [-Infinity, Infinity] },
      { label: '涨停', value: [LIMIT_UP_THRESHOLD, Infinity] },
      { label: '涨', value: [0.01, Infinity] },
      { label: '平', value: [0, 0] },
      { label: '跌', value: [-Infinity, -0.01] },
      { label: '跌停', value: [-Infinity, LIMIT_DOWN_THRESHOLD] },
    ],
  },
  circ_mv: {
    label: '流通市值',
    unit: '亿',
    min: 0,
    max: 10000, // 1万亿
    step: 100,
    useLog: true,
    formatValue: (v) => {
      if (v === 0) return '0';
      if (v === Infinity) return '不限';
      if (v >= 10000) return `${(v / 10000).toFixed(1)}万亿`;
      if (v >= 1) return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}亿`;
      // 小于1亿时显示万
      const wan = v * 10000;
      return wan >= 1000 ? `${(wan / 1000).toFixed(0)}千万` : `${wan.toFixed(0)}万`;
    },
    presets: [
      { label: '全部', value: [0, Infinity] },
      { label: '大盘', value: [1000, Infinity] },  // >1000亿
      { label: '中盘', value: [100, 1000] },       // 100-1000亿
      { label: '小盘', value: [0, 100] },          // <100亿
    ],
  },
  amount: {
    label: '成交额',
    unit: '亿',
    min: 0,
    max: 100, // 100亿
    step: 1,
    useLog: true,
    formatValue: (v) => {
      if (v === 0) return '0';
      if (v === Infinity) return '不限';
      if (v >= 1) return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}亿`;
      // 小于1亿时显示万
      const wan = v * 10000;
      return wan >= 1000 ? `${(wan / 1000).toFixed(0)}千万` : `${wan.toFixed(0)}万`;
    },
    presets: [
      { label: '全部', value: [0, Infinity] },
      { label: '活跃', value: [10, Infinity] },    // >10亿
      { label: '一般', value: [1, 10] },           // 1-10亿
      { label: '冷门', value: [0, 1] },            // <1亿
    ],
  },
  close: {
    label: '收盘价',
    unit: '元',
    min: 0,
    max: 500,
    step: 10,
    useLog: true,
    formatValue: (v) => {
      if (v === 0) return '0';
      if (v === Infinity) return '不限';
      return v >= 10 ? `${v.toFixed(0)}元` : `${v.toFixed(1)}元`;
    },
    presets: [
      { label: '全部', value: [0, Infinity] },
      { label: '高价', value: [100, Infinity] },   // >100元
      { label: '中价', value: [20, 100] },         // 20-100元
      { label: '低价', value: [0, 20] },           // <20元
    ],
  },
};

// 涨跌幅范围预设配置（向后兼容）
export const RANGE_PRESETS = FILTER_DIMENSION_CONFIG.pct_chg.presets;

// ==================== 动态预设计算 ====================

/**
 * 计算数组的分位数
 * @param sortedValues 已排序的数值数组
 * @param percentile 分位数 (0-1)
 * @returns 分位数值
 */
const getPercentile = (sortedValues: number[], percentile: number): number => {
  if (sortedValues.length === 0) return 0;
  const index = Math.floor(sortedValues.length * percentile);
  return sortedValues[Math.min(index, sortedValues.length - 1)];
};

// 各维度的预设标签和分位数配置
const DIMENSION_PRESET_CONFIG: Record<FilterDimension, {
  labels: string[];           // 从大到小的标签
  percentiles: number[];      // 分位数边界 (从高到低)
}> = {
  pct_chg: {
    labels: [],               // 涨跌幅使用静态预设
    percentiles: [],
  },
  circ_mv: {
    labels: ['大盘', '微盘'],
    percentiles: [0.95, 0.10],  // 前5%大盘, 后10%微盘
  },
  amount: {
    labels: ['超活跃', '超冷门'],
    percentiles: [0.95, 0.10],  // 前5%超活跃, 后10%超冷门
  },
  close: {
    labels: ['超高', '超低'],
    percentiles: [0.95, 0.05],  // 前5%超高, 后5%超低
  },
};

/**
 * 基于数据分位数计算动态预设
 * @param values 维度数值数组（正数）
 * @param dimension 维度类型
 * @returns 动态预设数组
 */
export const computeDynamicPresets = (
  values: number[],
  dimension: FilterDimension
): DimensionPreset[] => {
  // 涨跌幅维度始终使用静态预设
  if (dimension === 'pct_chg') {
    return FILTER_DIMENSION_CONFIG.pct_chg.presets;
  }
  
  // 过滤并排序正数值
  const positiveValues = values.filter(v => v > 0).sort((a, b) => a - b);
  
  // 数据量不足时返回静态预设
  if (positiveValues.length < 10) {
    return FILTER_DIMENSION_CONFIG[dimension].presets;
  }
  
  const presetConfig = DIMENSION_PRESET_CONFIG[dimension];
  const { labels, percentiles } = presetConfig;
  
  // 计算分位数边界值
  const boundaries = percentiles.map(p => getPercentile(positiveValues, p));
  
  // 生成动态预设
  const presets: DimensionPreset[] = [{ label: '全部', value: [0, Infinity] }];
  
  // 极端值模式：只有2个标签（高+低），跳过中间区间
  if (labels.length === 2 && boundaries.length === 2) {
    // 高端：≥高分位数
    presets.push({
      label: labels[0],
      value: [boundaries[0], Infinity],
    });
    // 低端：≤低分位数
    presets.push({
      label: labels[1],
      value: [0, boundaries[1]],
    });
    return presets;
  }
  
  // 多区间模式：覆盖全部范围
  // 第一个区间：最高分位数到无穷
  presets.push({
    label: labels[0],
    value: [boundaries[0], Infinity],
  });
  
  // 中间区间
  for (let i = 0; i < boundaries.length - 1; i++) {
    presets.push({
      label: labels[i + 1],
      value: [boundaries[i + 1], boundaries[i]],
    });
  }
  
  // 最后一个区间：0到最低分位数
  presets.push({
    label: labels[labels.length - 1],
    value: [0, boundaries[boundaries.length - 1]],
  });
  
  return presets;
};

// 图表类型标签
export const CHART_TYPE_LABELS: Record<ExtendedChartType, string> = {
  bar: '柱状图',
  pie: '饼图',
  distribution: '分布图',
  bubble: '气泡图',
  treemap: '树图',
};

// ==================== 周期文案映射 ====================
export const PERIOD_LABELS = {
  daily: { current: '当日', intra: '日内', close: '收盘', compare: '开→收' },
  weekly: { current: '当周', intra: '周内', close: '周收', compare: '开→收' },
  monthly: { current: '当月', intra: '月内', close: '月收', compare: '开→收' },
} as const;

export type PeriodType = keyof typeof PERIOD_LABELS;

// ==================== 日期对比统计请求 ====================
export type EntityType = 'stock' | 'convertible_bond' | 'concept' | 'industry';

/** 获取日期对比统计的API URL */
export const getCompareStatsApiUrl = (entityType: EntityType): string => {
  switch (entityType) {
    case 'convertible_bond': return '/api/convertible-bonds/stats/compare';
    case 'concept': return '/api/concepts/stats/compare';
    case 'industry': return '/api/industries/stats/compare';
    default: return '/api/stocks/stats/compare';
  }
};

/** 构建日期对比统计请求体 */
export const buildCompareStatsRequestBody = (params: {
  baseDate: string;
  compareDate: string;
  entityType: EntityType;
  period?: PeriodType;
  industries?: string[];
  concepts?: string[];
  search?: string;
  tsCodes?: string[];
}): Record<string, any> => {
  const requestBody: Record<string, any> = {
    base_date: params.baseDate,
    compare_date: params.compareDate,
    sort_period: params.period || 'daily',
    search: params.search || undefined,
    ts_codes: params.tsCodes?.length ? params.tsCodes : undefined,
  };

  // 股票和可转债支持行业/概念筛选
  if (params.entityType === 'stock' || params.entityType === 'convertible_bond') {
    requestBody.industries = params.industries?.length ? params.industries : undefined;
    requestBody.concepts = params.concepts?.length ? params.concepts : undefined;
  }

  return requestBody;
};
