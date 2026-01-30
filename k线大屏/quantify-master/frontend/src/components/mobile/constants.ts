// 移动端常量定义 - 使用统一配置

import { 
  getSortOptions as getUnifiedSortOptions,
  DataType,
  Period,
  SortOption,
  DATA_TYPE_OPTIONS as UNIFIED_DATA_TYPE_OPTIONS,
  PERIOD_OPTIONS as UNIFIED_PERIOD_OPTIONS
} from '../../shared/constants.ts';

// 重新导出统一类型
export type { DataType, Period, SortOption };

export type IndicatorType = 'auction' | 'none' | 'ma' | 'expma' | 'macd' | 'rsi' | 'kdj' | 'boll' | 'cci' | 'wr' | 'dmi' | 'sar' | 'obv' | 'vol' | 'td';
export type Layout = 'grid' | 'large';

// 主图叠加指标（可多选，叠加在K线主图上）
export const OVERLAY_INDICATOR_KEYS = new Set(['ma', 'expma', 'boll', 'sar', 'td']);

// 副图指标（单选，显示在副图区域）
export const SUB_INDICATOR_KEYS = new Set(['auction', 'macd', 'rsi', 'kdj', 'cci', 'wr', 'dmi', 'obv', 'vol']);

// 主图叠加指标配置（可多选）
export const OVERLAY_INDICATOR_OPTIONS = [
  { key: 'ma', label: 'MA', color: '#722ed1' },
  { key: 'expma', label: 'EXPMA', color: '#722ed1' },
  { key: 'boll', label: 'BOLL', color: '#eb2f96' },
  { key: 'sar', label: 'SAR', color: '#faad14' },
  { key: 'td', label: '神奇九转', color: '#ff4d4f' }
] as const;

// 副图指标配置（单选）
export const SUB_INDICATOR_OPTIONS = [
  { key: 'none', label: '无', color: '#8c8c8c' },
  { key: 'auction', label: '开盘竞价', color: '#ffd700' },
  { key: 'macd', label: 'MACD', color: '#1890ff' },
  { key: 'rsi', label: 'RSI', color: '#52c41a' },
  { key: 'kdj', label: 'KDJ', color: '#fa8c16' },
  { key: 'cci', label: 'CCI', color: '#13c2c2' },
  { key: 'wr', label: 'WR', color: '#2f54eb' },
  { key: 'dmi', label: 'DMI', color: '#f5222d' },
  { key: 'obv', label: 'OBV', color: '#52c41a' },
  { key: 'vol', label: 'VOL', color: '#1890ff' }
] as const;

// 全部指标配置常量（保持向后兼容）
export const INDICATOR_OPTIONS = [
  { key: 'none', label: '无', color: '#8c8c8c' },
  { key: 'auction', label: '开盘竞价', color: '#ffd700' },
  { key: 'ma', label: 'MA', color: '#722ed1' },
  { key: 'expma', label: 'EXPMA', color: '#722ed1' },
  { key: 'macd', label: 'MACD', color: '#1890ff' },
  { key: 'rsi', label: 'RSI', color: '#52c41a' },
  { key: 'kdj', label: 'KDJ', color: '#fa8c16' },
  { key: 'boll', label: 'BOLL', color: '#eb2f96' },
  { key: 'cci', label: 'CCI', color: '#13c2c2' },
  { key: 'wr', label: 'WR', color: '#2f54eb' },
  { key: 'dmi', label: 'DMI', color: '#f5222d' },
  { key: 'sar', label: 'SAR', color: '#faad14' },
  { key: 'obv', label: 'OBV', color: '#52c41a' },
  { key: 'vol', label: 'VOL', color: '#1890ff' },
  { key: 'td', label: '神奇九转', color: '#ff4d4f' }
] as const;

// 重新导出统一配置
export const DATA_TYPE_OPTIONS = UNIFIED_DATA_TYPE_OPTIONS;
export const PERIOD_OPTIONS = UNIFIED_PERIOD_OPTIONS;

// 时间范围配置
export const TIME_RANGE_OPTIONS = [
  { value: 10, label: '10天' },
  { value: 30, label: '30天' },
  { value: 60, label: '60天' },
  { value: 90, label: '90天' },
  { value: 180, label: '180天' },
  { value: 360, label: '360天' },
  { value: 'all', label: '全部' }
] as const;

// 使用统一的排序选项
export const getSortOptions = getUnifiedSortOptions;

