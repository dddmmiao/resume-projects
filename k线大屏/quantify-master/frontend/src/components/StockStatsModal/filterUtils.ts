/**
 * 多维度筛选工具函数
 * 用于当日统计和日期对比模式的通用筛选逻辑
 */

import type { FilterDimension } from './constants';
import { amountToYi, marketValueToYi } from '../mobile/utils.ts';

// 基础数据项接口（当日和对比模式共用的字段）
interface BaseStatsItem {
  code: string;
  name: string;
  pct_chg: number;
  close: number;
  amount: number;
  circ_mv?: number;
}

/**
 * 获取数据项在指定维度的值（通用函数）
 * @param item 数据项
 * @param dim 筛选维度
 * @returns 该维度的数值（已转换单位）
 */
export const getDimensionValue = <T extends BaseStatsItem>(item: T, dim: FilterDimension): number => {
  switch (dim) {
    case 'pct_chg': return item.pct_chg ?? 0;
    case 'circ_mv': return marketValueToYi(item.circ_mv);
    case 'amount': return amountToYi(item.amount);
    case 'close': return item.close ?? 0;
    default: return 0;
  }
};

// 动态边界值类型
interface DimensionBounds {
  min: number;
  max: number;
}

/**
 * 通用多维度筛选函数（支持同时应用所有维度筛选）
 * @param items 待筛选的数据项
 * @param options 筛选选项
 * @returns 筛选后的数据项
 */
export const filterItemsByDimension = <T extends BaseStatsItem>(
  items: T[],
  options: {
    pctRange: [number, number];
    filterDimension: FilterDimension;
    filterRange: [number, number];
    dynamicBounds: DimensionBounds;
    searchKeyword?: string;
    // 新增：所有维度的范围（用于同时应用多维度筛选）
    allDimensionRanges?: Record<FilterDimension, [number, number]>;
    allDynamicBounds?: Record<FilterDimension, DimensionBounds>;
  }
): T[] => {
  const { pctRange, searchKeyword, allDimensionRanges, allDynamicBounds } = options;
  
  // 涨跌幅范围
  const pctMinVal = pctRange[0] === -Infinity ? -Infinity : pctRange[0];
  const pctMaxVal = pctRange[1] === Infinity ? Infinity : pctRange[1];
  
  // 搜索关键词
  const keyword = (searchKeyword || '').trim().toLowerCase();
  
  // 判断某维度是否为默认范围
  const isDefaultRange = (dim: FilterDimension, range: [number, number], bounds: DimensionBounds): boolean => {
    if (dim === 'pct_chg') {
      return range[0] === -Infinity && range[1] === Infinity;
    }
    return range[0] <= bounds.min && (range[1] === Infinity || range[1] >= bounds.max);
  };
  
  return items.filter(item => {
    // 涨跌幅范围过滤（始终应用）
    if (item.pct_chg < pctMinVal || item.pct_chg > pctMaxVal) return false;
    
    // 同时应用所有维度的筛选
    if (allDimensionRanges && allDynamicBounds) {
      const dimensions: FilterDimension[] = ['circ_mv', 'amount', 'close'];
      for (const dim of dimensions) {
        const range = allDimensionRanges[dim];
        const bounds = allDynamicBounds[dim];
        if (!isDefaultRange(dim, range, bounds)) {
          const dimValue = getDimensionValue(item, dim);
          if (dimValue < range[0] || (range[1] !== Infinity && dimValue > range[1])) {
            return false;
          }
        }
      }
    }
    
    // 搜索关键词过滤
    if (keyword && !item.code.toLowerCase().includes(keyword) && !item.name.toLowerCase().includes(keyword)) {
      return false;
    }
    
    return true;
  });
};
