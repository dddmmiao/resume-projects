// 移动端工具函数

import { ThemeColors } from './theme.ts';
import type { DataType } from './constants.ts';

import { generateSortFieldMap } from '../../shared/constants.ts';

/**
 * 🚀 从item.type获取K线数据类型
 * 直接根据item.type返回对应的类型，默认为'stock'
 * @param item 数据项，包含type字段
 * @returns K线数据类型
 */
export const getKlineDataTypeFromItem = (
  item: { type?: string } | null | undefined
): 'stock' | 'convertible_bond' | 'concept' | 'industry' => {
  switch (item?.type) {
    case 'concept': return 'concept';
    case 'industry': return 'industry';
    case 'convertible_bond': return 'convertible_bond';
    default: return 'stock';
  }
};

/**
 * 🚀 根据dataType和item.type确定实际的K线数据类型
 * 用于自选分组中不同类型标的的K线接口调用
 * @param dataType 当前数据类型（可能是'favorites'）
 * @param item 数据项，包含type字段
 * @returns 实际的K线数据类型
 */
export const resolveKlineDataType = (
  dataType: DataType,
  item: { type?: string } | null | undefined
): 'stock' | 'convertible_bond' | 'concept' | 'industry' => {
  // 自选模式根据item.type判断
  if (dataType === 'favorites') {
    return getKlineDataTypeFromItem(item);
  }
  // 非自选模式直接使用dataType（排除'favorites'）
  if (dataType === 'concept') return 'concept';
  if (dataType === 'industry') return 'industry';
  if (dataType === 'convertible_bond') return 'convertible_bond';
  return 'stock';
};

// 排序字段映射到后端（使用统一配置）
export const sortFieldMap = generateSortFieldMap();

// ========== 单位转换常量 ==========
// 数据库存储单位 -> 元 的转换系数
export const UNIT_TO_YUAN = {
  THOUSAND: 1000,           // 千元 -> 元（成交额）
  TEN_MILLION: 10000000,    // 千万元 -> 元（市值）
};

// 数据库存储单位 -> 亿元 的转换系数（用于滑块范围计算）
export const UNIT_TO_YI = {
  THOUSAND: 100000,         // 千元 -> 亿元（成交额：千元 / 100000 = 亿元）
  TEN_MILLION: 10000,       // 千万元 -> 亿元（市值：千万元 / 10000 = 亿元）
};

/**
 * 将成交额从千元转为亿元（用于滑块范围计算）
 * @param amountInThousand 成交额（千元）
 * @returns 成交额（亿元）
 */
export const amountToYi = (amountInThousand: number | null | undefined): number => {
  if (amountInThousand === null || amountInThousand === undefined) return 0;
  return amountInThousand / UNIT_TO_YI.THOUSAND;
};

/**
 * 将市值从千万元转为亿元（用于滑块范围计算）
 * @param mvInTenMillion 市值（千万元）
 * @returns 市值（亿元）
 */
export const marketValueToYi = (mvInTenMillion: number | null | undefined): number => {
  if (mvInTenMillion === null || mvInTenMillion === undefined) return 0;
  return mvInTenMillion / UNIT_TO_YI.TEN_MILLION;
};

/**
 * 格式化大数值：支持万、亿、万亿单位
 * @param value 数值
 * @param decimals 小数位数，默认1
 * @returns 格式化后的字符串，如 "1.5万亿"、"1234.5亿"、"1234.5万" 或 "9999"
 */
export const formatLargeNumber = (value: number, decimals: number = 1): string => {
  if (!isFinite(value)) return '--';
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000000000) {
    // 超过1万亿，显示为万亿
    return `${(value / 1000000000000).toFixed(decimals)}万亿`;
  } else if (absValue >= 100000000000) {
    // 超过1000亿，显示为千亿
    return `${(value / 100000000000).toFixed(decimals)}千亿`;
  } else if (absValue >= 100000000) {
    // 超过1亿，显示为亿
    return `${(value / 100000000).toFixed(decimals)}亿`;
  } else if (absValue >= 10000) {
    // 超过1万，显示为万
    return `${(value / 10000).toFixed(decimals)}万`;
  } else {
    // 小于1万，显示原值
    return value.toFixed(decimals);
  }
};

/**
 * 格式化成交额（单位：千元，用于股票/可转债）
 * @param amount 金额（千元）
 * @param decimals 小数位数，默认1
 * @returns 格式化后的字符串
 */
export const formatAmount = (amount: number | null | undefined, decimals: number = 1): string => {
  if (amount === null || amount === undefined || !isFinite(amount)) return '--';
  // 所有标的类型：数据库单位是千元，转换为元
  const amountInYuan = amount * UNIT_TO_YUAN.THOUSAND;
  return formatLargeNumber(amountInYuan, decimals);
};


/**
 * 格式化成交量
 * @param volume 成交量（手）
 * @param decimals 小数位数，默认1
 * @returns 格式化后的字符串
 */
export const formatVolume = (volume: number | null | undefined, decimals: number = 1): string => {
  if (volume === null || volume === undefined || !isFinite(volume)) return '--';
  return formatLargeNumber(volume, decimals);
};

/**
 * 格式化市值（单位：千万元）
 * 概念/行业的total_mv/float_mv存储单位是千万元（TuShare返回元÷10000000）
 * @param marketValue 市值（千万元）
 * @param decimals 小数位数，默认1
 * @returns 格式化后的字符串
 */
export const formatMarketValue = (marketValue: number | null | undefined, decimals: number = 1): string => {
  if (marketValue === null || marketValue === undefined || !isFinite(marketValue)) return '--';
  // 市值单位是千万元，转换为元再格式化
  const marketValueInYuan = marketValue * UNIT_TO_YUAN.TEN_MILLION;
  return formatLargeNumber(marketValueInYuan, decimals);
};

/**
 * 格式化流通市值（自动识别单位）
 * 股票/可转债的circ_mv存储单位是万元
 * 概念/行业的float_mv存储单位是千万元
 * @param circMv 流通市值（万元，股票/可转债）
 * @param floatMv 流通市值（千万元，概念/行业）
 * @param decimals 小数位数，默认1
 * @returns 格式化后的字符串
 */
export const formatCircMv = (circMv: number | null | undefined, floatMv: number | null | undefined, decimals: number = 1): string => {
  if (circMv != null && isFinite(circMv)) {
    return formatLargeNumber(circMv * 10000, decimals); // 万元 -> 元
  }
  if (floatMv != null && isFinite(floatMv)) {
    return formatLargeNumber(floatMv * UNIT_TO_YUAN.TEN_MILLION, decimals); // 千万元 -> 元
  }
  return '--';
};

// 根据与前收盘价的比较来判断颜色
export const getValueColor = (currentValue: number, preCloseValue: number, theme: ThemeColors): string => {
  if (!isFinite(currentValue) || !isFinite(preCloseValue) || preCloseValue === 0) {
    return theme.text;
  }
  if (currentValue > preCloseValue) {
    return theme.positive;
  }
  if (currentValue < preCloseValue) {
    return theme.negative;
  }
  return theme.text;
};

// 生成东方财富链接
export const getEastMoneyUrl = (item: any, type: string): string => {
  const baseUrl = 'https://quote.eastmoney.com';

  switch (type) {
    case 'stock':
      const stockCode = item.ts_code?.split('.')[0] || '';
      let market = 'sz'; // 默认深交所
      if (item.ts_code?.endsWith('.SH')) {
        market = 'sh';
      } else if (item.ts_code?.endsWith('.BJ')) {
        market = 'bj';
      }
      return `${baseUrl}/${market}${stockCode}.html`;

    case 'convertible_bond':
      const bondCode = item.ts_code?.split('.')[0] || '';
      let bondMarket = 'sz';
      if (item.ts_code?.endsWith('.SH')) {
        bondMarket = 'sh';
      } else if (item.ts_code?.endsWith('.BJ')) {
        bondMarket = 'bj';
      }
      return `${baseUrl}/${bondMarket}${bondCode}.html`;

    case 'concept':
      const conceptCode = (item.concept_code || '').split('.')[0] || '';
      return `https://q.10jqka.com.cn/thshy/detail/code/${conceptCode}/`;

    case 'industry':
      const industryCode = (item.industry_code || '').split('.')[0] || '';
      return `https://q.10jqka.com.cn/thshy/detail/code/${industryCode}/`;

    default:
      return baseUrl;
  }
};

// 获取表格列配置
export const getTableColumns = (dataType: string) => {
  switch (dataType) {
    case 'stock':
      return [
        { title: '最新', key: 'price', width: 90 },
        { title: '涨幅', key: 'change', width: 90 },
        { title: '涨跌', key: 'change_val', width: 90 },
        { title: '成交额', key: 'amount', width: 100 },
        { title: '换手', key: 'turnover', width: 90 },
        { title: '振幅', key: 'amplitude', width: 90 },
        { title: '总市值', key: 'market_cap', width: 100 },
        { title: '流通值', key: 'circ_mv', width: 100 }
      ];
    case 'convertible_bond':
      return [
        { title: '最新', key: 'price', width: 90 },
        { title: '涨幅', key: 'change', width: 90 },
        { title: '转股溢价', key: 'cb_over_rate', width: 100 },
        { title: '转股价值', key: 'cb_value', width: 100 },
        { title: '剩余规模', key: 'remain_scale', width: 100 },
        { title: '成交额', key: 'amount', width: 100 },
        { title: '换手', key: 'turnover', width: 90 }
      ];
    case 'concept':
    case 'industry':
      return [
        { title: '最新', key: 'price', width: 90 },
        { title: '涨幅', key: 'change', width: 90 },
        { title: '涨跌', key: 'change_val', width: 90 },
        { title: '成交额', key: 'amount', width: 100 },
        { title: '换手', key: 'turnover', width: 90 },
        { title: '振幅', key: 'amplitude', width: 90 },
        { title: '总市值', key: 'market_cap', width: 100 }
      ];
    default:
      return [
        { title: '最新', key: 'price', width: 90 },
        { title: '涨幅', key: 'change', width: 90 },
        { title: '涨跌', key: 'change_val', width: 90 }
      ];
  }
};

// 根据数据类型和列key获取数据值
export const getColumnValue = (item: any, col: any, dataType: string, miniKlines: Record<string, any[]>) => {
  const code = dataType === 'concept' ? item.concept_code : 
              dataType === 'industry' ? item.industry_code : 
              (item.ts_code || item.code || item.symbol);
  const last = (miniKlines[code] && miniKlines[code][miniKlines[code].length - 1]) || null;
  
  switch (col.key) {
    case 'price':
      return last ? last.close : (item.close ?? item.latest_price ?? 0);
    case 'change':
      return last ? last.pct_chg : (item.pct_chg ?? 0);
    case 'change_val':
      // 使用change字段（与详情页和列表页逻辑一致）
      // change_val是前端排序字段的key，实际数据字段是change
      return last
        ? Number(last.change ?? 0)
        : Number(item.change ?? 0);
    case 'amount':
      return item.amount ?? 0;
    case 'turnover':
      return item.turnover_rate ?? 0;
    case 'amplitude':
      return item.amplitude ?? ((last ? (last.high - last.low) / Math.max(1e-9, last.close) * 100 : 0));
    case 'market_cap':
      return item.total_mv ?? 0;
    case 'circ_mv':
      return item.circ_mv ?? 0;
    case 'cb_over_rate':
      return item.cb_over_rate ?? (last?.cb_over_rate ?? 0);
    case 'cb_value':
      return item.cb_value ?? (last?.cb_value ?? 0);
    case 'remain_scale':
      return item.remain_scale ?? 0;
    default:
      return 0;
  }
};

/**
 * 去掉代码后缀（如 .SZ/.SH/.TI/.SW 等）
 * @param code 原始代码，如 "000001.SZ" 或 "885760.TI"
 * @returns 去掉后缀的代码，如 "000001" 或 "885760"
 */
export const stripCodeSuffix = (code: string | undefined | null): string => {
  if (!code) return '';
  const dotIndex = code.indexOf('.');
  return dotIndex > 0 ? code.substring(0, dotIndex) : code;
};

// 格式化列值显示
// dataType: 数据类型，用于区分成交额单位（概念/行业是元，股票/可转债是千元）
export const formatColumnValue = (value: number, col: any, dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry'): string => {
  if (!isFinite(value)) return '--';
  
  switch (col.key) {
    case 'price':
    case 'cb_value':
      return value.toFixed(2);
    case 'change':
    case 'turnover':
    case 'amplitude':
    case 'cb_over_rate':
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    case 'change_val':
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    case 'amount':
      // 所有标的类型 amount 单位统一为千元
      return formatAmount(value, 1);
    case 'market_cap':
    case 'circ_mv':
      // 市值：单位是千万元，转换为元再格式化
      return formatMarketValue(value, 1);
    case 'remain_scale':
      // 剩余规模：单位是万元，需要转换为元再格式化
      return formatMarketValue(value, 1);
    case 'volume':
      // 成交量：单位是手
      return formatVolume(value, 1);
    default:
      return value.toFixed(2);
  }
};

