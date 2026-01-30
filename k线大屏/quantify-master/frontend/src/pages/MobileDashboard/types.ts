/**
 * MobileDashboard 类型定义
 */

import type { DataType, Period, IndicatorType, Layout as LayoutType } from '../../components/mobile/constants.ts';
import type { Theme } from '../../components/mobile/theme.ts';

export type SortByType = 
  | 'hot_score' 
  | 'pct_chg' 
  | 'intraperiod_pct_chg' 
  | 'volatility' 
  | 'call_countdown' 
  | 'issue_date' 
  | 'list_date' 
  | 'price' 
  | 'change_val' 
  | 'amount' 
  | 'turnover' 
  | 'amplitude' 
  | 'market_cap' 
  | 'volume' 
  | 'auction_vol' 
  | 'auction_amount' 
  | 'auction_turnover_rate' 
  | 'auction_volume_ratio' 
  | 'auction_pct_chg' 
  | 'name' 
  | 'bond_short_name' 
  | 'concept_name' 
  | 'industry_name' 
  | 'vol' 
  | 'total_mv' 
  | 'turnover_rate';

export type MainOverlayType = 'ma' | 'expma' | 'boll' | 'sar' | 'td';

export interface MobileDashboardProps {
  theme: Theme;
  onThemeChange: (theme: string) => void;
}

export type {
  DataType,
  Period,
  IndicatorType,
  LayoutType,
  Theme,
};
