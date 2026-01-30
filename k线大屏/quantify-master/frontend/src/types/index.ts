export interface Stock {
  ts_code: string;
  symbol: string;
  name: string;
  area?: string;
  industry?: string;
  market?: string;
  list_date?: string;
}

export interface StockGridItem extends Stock {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  klineData?: any[];
  lastPrice?: number;
  changePercent?: number;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface ToolbarState {
  period: PeriodType;
  gridSize: 'small' | 'medium' | 'large';
  autoRefresh: boolean;
  refreshInterval: number;
  selectedStocks: string[];
}

export type DashboardTheme = 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
export type MobileTheme = 'dark' | 'light';
export type MobileLayout = 'grid' | 'large';

export interface AppState {
  toolbar: ToolbarState;
  stocks: Stock[];
  gridItems: StockGridItem[];
  loading: boolean;
  error?: string;
  crosshairMode: 0 | 1 | 2 | 3; // 全局十字线模式：0=无, 1=自由, 2=吸附, 3=双十字线
  indicatorSource: 'frontend' | 'db';

  dashboardTheme: DashboardTheme;
  mobileTheme: MobileTheme;
  mobileLayout: MobileLayout;
  thsUsername: string; // 同花顺真实用户名
  dashboardLayout: 'normal' | 'compact'; // 桌面端布局模式
  userInfo: import('./user.ts').UserInfo | null; // 用户信息
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface KlineStatistics {
  avg_price: number;
  avg_volume: number;
  max_price: number;
  min_price: number;
  total_change: number;
  total_pct_change: number;
}


export interface SearchParams {
  keyword?: string;
  limit?: number;
  offset?: number;
}


export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}
