// 统计摘要类型（桌面端和移动端共用）

export interface StockStatsSummary {
  total: number;
  up: number;
  down: number;
  flat: number;
  intraday_up: number;
  intraday_down: number;
  intraday_flat: number;
  with_kline?: number;
  no_kline?: number;
}

export interface StockStatsItem {
  code: string;
  name: string;
  open?: number; // 开盘价
  close: number;
  pct_chg: number;
  intraday_pct: number;
  amount: number;
  circ_mv?: number; // 流通市值(万元)，用于气泡图大小
}

export interface StockStats {
  summary: StockStatsSummary;
  items: StockStatsItem[];
}

// 分布桶类型
export interface RangeBucket {
  range: string;
  count: number;
  intraday_count?: number;
  items?: StockStatsItem[];
}

// 对比统计类型
export interface CompareStatsSummary {
  total: number;
  up: number;
  down: number;
  flat: number;
  avg_pct_chg: number;
  median_pct_chg: number;
  with_kline?: number;
  no_kline?: number;
}

export interface CompareStatsItem {
  code: string;
  name: string;
  open?: number;  // A日开盘价
  close: number;
  pct_chg: number;
  max_pct?: number;  // 区间最大涨幅
  min_pct?: number;  // 区间最大回撤
  high_price?: number;  // 区间最高价
  low_price?: number;  // 区间最低价
  amount: number;
  circ_mv?: number;  // 流通市值（股票/概念/行业有，可转债无）
}

export interface CompareStats {
  base_date: string;
  compare_date: string;
  summary: CompareStatsSummary;
  items: CompareStatsItem[];
  distribution?: { range: string; count: number }[];
}

// 主题类型（通用）
export type ThemeMode = 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';

// 实体类型
export type EntityType = 'stock' | 'convertible_bond' | 'concept' | 'industry';

// 图表类型
export type ChartType = 'bar' | 'pie';

// 数据模式（支持三态：收盘、日内、两者）
export type DataMode = 'close' | 'intraday' | 'both';

// 统计模式
export type StatsMode = 'daily' | 'compare';
