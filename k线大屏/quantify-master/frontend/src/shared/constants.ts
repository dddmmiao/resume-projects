// 通用常量配置 - 桌面端和移动端共用

// ===== 类型定义 =====
export type DataType = 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';
export type Period = 'daily' | 'weekly' | 'monthly';

export interface SortOption {
  key: string;
  label: string;
  children?: SortOption[]; // 支持二级菜单（如竞价字段）
}

// ===== 周期配置 =====
export const PERIOD_CONFIG = {
  daily: { value: 'daily' as const, label: '日', shortLabel: '日', icon: '' },
  weekly: { value: 'weekly' as const, label: '周', shortLabel: '周', icon: '' },
  monthly: { value: 'monthly' as const, label: '月', shortLabel: '月', icon: '' }
} as const;

export const PERIOD_OPTIONS = Object.values(PERIOD_CONFIG);

// ===== 数据类型配置 =====
export const DATA_TYPE_CONFIG = {
  stock: { key: 'stock' as const, value: 'stock' as const, label: '股票', icon: '' },
  convertible_bond: { key: 'convertible_bond' as const, value: 'convertible_bond' as const, label: '可转债', icon: '' },
  concept: { key: 'concept' as const, value: 'concept' as const, label: '概念', icon: '' },
  industry: { key: 'industry' as const, value: 'industry' as const, label: '行业', icon: '' },
  favorites: { key: 'favorites' as const, value: 'favorites' as const, label: '自选', icon: '' }
} as const;

export const DATA_TYPE_OPTIONS = Object.values(DATA_TYPE_CONFIG);

// ===== 字段配置 =====
export interface FieldConfig {
  key: string;
  label: string | ((period: Period) => string); // 支持动态标签
  backendField: string; // 后端字段名
  isKlineField: boolean; // 是否为K线字段
  supportsPeriod: boolean; // 是否支持周期
  forcePeriod?: Period; // 强制使用特定周期
  defaultOrder: 'asc' | 'desc'; // 默认排序方向
  dataTypes: DataType[]; // 支持的数据类型
}

// ===== 通用字段配置 =====
export const SORT_FIELDS: Record<string, FieldConfig> = {
  // 基础字段
  hot_score: {
    key: 'hot_score',
    label: '🔥 热度',
    backendField: 'hot_score',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },

  // 名称字段
  name: {
    key: 'name',
    label: '📝 名称',
    backendField: 'name',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['stock']
  },
  bond_short_name: {
    key: 'bond_short_name',
    label: '📝 名称',
    backendField: 'bond_short_name',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['convertible_bond']
  },
  concept_name: {
    key: 'concept_name',
    label: '📝 名称',
    backendField: 'concept_name',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['concept']
  },
  industry_name: {
    key: 'industry_name',
    label: '📝 名称',
    backendField: 'industry_name',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['industry']
  },

  // 日期字段
  list_date: {
    key: 'list_date',
    label: '📅 上市日期',
    backendField: 'list_date',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['stock', 'concept', 'industry']
  },
  issue_date: {
    key: 'issue_date',
    label: '📅 发行日期',
    backendField: 'issue_date',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['convertible_bond']
  },

  // 动态周期K线字段
  pct_chg: {
    key: 'pct_chg',
    label: (period: Period) => `📈 涨跌幅(${PERIOD_CONFIG[period].shortLabel})`,
    backendField: 'pct_chg',
    isKlineField: true,
    supportsPeriod: true,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },
  intraperiod_pct_chg: {
    key: 'intraperiod_pct_chg',
    label: (period: Period) => {
      const suffix = period === 'weekly' ? '周内' : period === 'monthly' ? '月内' : '日内';
      return `📈 涨跌幅(${suffix})`;
    },
    backendField: 'intraperiod_pct_chg',
    isKlineField: true,
    supportsPeriod: true,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },
  volatility: {
    key: 'volatility',
    label: (period: Period) => `📊 波动率(${PERIOD_CONFIG[period].shortLabel})`,
    backendField: 'volatility',
    isKlineField: true,
    supportsPeriod: true,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },
  vol: {
    key: 'vol',
    label: (period: Period) => `💹 成交量(${PERIOD_CONFIG[period].shortLabel})`,
    backendField: 'vol',
    isKlineField: true,
    supportsPeriod: true,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },
  amount: {
    key: 'amount',
    label: (period: Period) => `💰 成交额(${PERIOD_CONFIG[period].shortLabel})`,
    backendField: 'amount',
    isKlineField: true,
    supportsPeriod: true,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond', 'concept', 'industry']
  },

  // 固定周期字段（概念/行业）
  total_mv: {
    key: 'total_mv',
    label: '💎 市值(日)',
    backendField: 'total_mv',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['concept', 'industry']
  },
  turnover_rate: {
    key: 'turnover_rate',
    label: '🔄 换手率(日)',
    backendField: 'turnover_rate',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['concept', 'industry']
  },

  // 竞价字段（股票专用）
  auction_vol: {
    key: 'auction_vol',
    label: '竞价量',
    backendField: 'auction_vol',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['stock']
  },
  auction_amount: {
    key: 'auction_amount',
    label: '竞价额',
    backendField: 'auction_amount',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['stock']
  },
  auction_turnover_rate: {
    key: 'auction_turnover_rate',
    label: '竞价换手率',
    backendField: 'auction_turnover_rate',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['stock']
  },
  auction_volume_ratio: {
    key: 'auction_volume_ratio',
    label: '竞价量比',
    backendField: 'auction_volume_ratio',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['stock']
  },
  auction_pct_chg: {
    key: 'auction_pct_chg',
    label: '竞价涨跌幅',
    backendField: 'auction_pct_chg',
    isKlineField: true,
    supportsPeriod: false,
    forcePeriod: 'daily',
    defaultOrder: 'desc',
    dataTypes: ['stock']
  },

  // 特殊计算字段
  call_countdown: {
    key: 'call_countdown',
    label: '⏰ 强赎倒计时',
    backendField: 'call_countdown',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'asc',
    dataTypes: ['convertible_bond']
  },

  // 概念/行业热度排序（基于所属概念/行业的最大热度）
  max_concept_heat: {
    key: 'max_concept_heat',
    label: '🔥 概念热度',
    backendField: 'max_concept_heat',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond']
  },
  max_industry_heat: {
    key: 'max_industry_heat',
    label: '🔥 行业热度',
    backendField: 'max_industry_heat',
    isKlineField: false,
    supportsPeriod: false,
    defaultOrder: 'desc',
    dataTypes: ['stock', 'convertible_bond']
  }
};

// ===== 工具函数 =====
/**
 * 获取字段的显示标签
 */
export const getFieldLabel = (fieldKey: string, period: Period = 'daily'): string => {
  const field = SORT_FIELDS[fieldKey];
  if (!field) return fieldKey;

  if (typeof field.label === 'function') {
    return field.label(period);
  }
  return field.label;
};

/**
 * 获取字段的后端字段名
 */
export const getBackendField = (fieldKey: string): string => {
  return SORT_FIELDS[fieldKey]?.backendField || fieldKey;
};

/**
 * 获取字段的默认排序方向
 */
export const getDefaultOrder = (fieldKey: string): 'asc' | 'desc' => {
  return SORT_FIELDS[fieldKey]?.defaultOrder || 'desc';
};

/**
 * 判断字段是否支持周期
 */
export const supportsPeriod = (fieldKey: string): boolean => {
  return SORT_FIELDS[fieldKey]?.supportsPeriod || false;
};

/**
 * 获取字段的实际查询周期
 */
export const getQueryPeriod = (fieldKey: string, requestedPeriod: Period): Period => {
  const field = SORT_FIELDS[fieldKey];
  if (!field) return requestedPeriod;

  // 如果有强制周期，使用强制周期
  if (field.forcePeriod) return field.forcePeriod;

  // 如果支持周期，使用请求的周期
  if (field.supportsPeriod) return requestedPeriod;

  // 默认使用daily
  return 'daily';
};

/**
 * 根据数据类型和周期获取排序选项
 */
export const getSortOptions = (dataType: DataType, period: Period = 'daily'): SortOption[] => {
  const options: SortOption[] = [];
  const addedKeys = new Set<string>();

  // 自选分组使用stock的排序选项（自选分组可能包含多种类型，以股票为主）
  const effectiveDataType = dataType === 'favorites' ? 'stock' : dataType;

  // 按优先级添加字段（竞价字段将单独作为二级菜单处理）
  const fieldOrder = [
    'hot_score', // 热度
    'max_concept_heat', 'max_industry_heat', // 概念/行业热度（仅股票和可转债）
    'name', 'bond_short_name', 'concept_name', 'industry_name', // 名称
    'list_date', 'issue_date', // 日期
    'call_countdown', // 特殊字段
    'pct_chg', 'intraperiod_pct_chg', 'volatility', 'vol', 'amount', // 动态周期字段
    'total_mv', 'turnover_rate' // 固定周期字段
    // 注意：竞价字段不在这里添加，会在后面作为二级菜单统一处理
  ];

  // 基础字段
  fieldOrder.forEach(fieldKey => {
    const field = SORT_FIELDS[fieldKey];
    if (field && field.dataTypes.includes(effectiveDataType) && !addedKeys.has(fieldKey)) {
      // 检查是否需要根据周期过滤
      if (field.forcePeriod === 'daily' && period !== 'daily') {
        return; // 固定日线字段在非日线周期下不显示
      }

      options.push({
        key: fieldKey,
        label: getFieldLabel(fieldKey, period)
      });
      addedKeys.add(fieldKey);
    }
  });

  // 股票的竞价字段作为二级菜单（仅在日线显示，自选分组也显示）
  if (effectiveDataType === 'stock' && period === 'daily') {
    const auctionFields = ['auction_vol', 'auction_amount', 'auction_turnover_rate', 'auction_volume_ratio', 'auction_pct_chg'];
    const auctionOptions = auctionFields
      .filter(key => SORT_FIELDS[key])
      .map(key => ({
        key,
        label: SORT_FIELDS[key].label as string
      }));

    if (auctionOptions.length > 0) {
      options.push({
        key: 'auction',
        label: '🔔 开盘竞价(日)',
        children: auctionOptions
      });
    }
  }

  return options;
};

/**
 * 生成字段映射表（兼容旧的sortFieldMap格式）
 */
export const generateSortFieldMap = (): Record<string, string> => {
  const map: Record<string, string> = {};

  Object.keys(SORT_FIELDS).forEach(key => {
    map[key] = SORT_FIELDS[key].backendField;
  });

  // 添加一些兼容性映射
  map['price'] = 'close';
  map['change_val'] = 'change';
  map['turnover'] = 'turnover_rate';
  map['market_cap'] = 'total_mv';
  map['volume'] = 'vol';

  return map;
};
