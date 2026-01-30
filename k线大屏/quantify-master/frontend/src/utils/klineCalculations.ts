/**
 * K线数据计算工具函数
 * 提供K线相关的计算逻辑，避免重复代码
 */

import type { Period } from '../shared/constants.ts';

/**
 * 计算周期内涨跌幅
 * 优先使用后端字段，为 null 时前端计算兜底
 * 
 * @param data - K线数据对象
 * @returns 周期内涨跌幅百分比，失败返回 null
 */
export function calculateIntraperiodPctChg(data: {
  intraperiod_pct_chg?: number | null;
  close?: number | null;
  open?: number | null;
}): number | null {
  // 优先使用后端计算的字段
  if (data?.intraperiod_pct_chg !== undefined && data?.intraperiod_pct_chg !== null) {
    return Number(data.intraperiod_pct_chg);
  }

  // 前端计算兜底
  if (data?.close !== undefined && data?.close !== null &&
      data?.open !== undefined && data?.open !== null) {
    const close = Number(data.close);
    const open = Number(data.open);
    
    if (open !== 0 && isFinite(open) && isFinite(close)) {
      return ((close - open) / open) * 100;
    }
  }

  return null;
}

/**
 * 计算波动率
 * 公式: (high - low) / close * 100
 * 根据收盘价与开盘价决定正负
 * 
 * @param data - K线数据对象
 * @returns 波动率百分比，失败返回 null
 */
export function calculateVolatility(data: {
  high?: number | null;
  low?: number | null;
  close?: number | null;
  open?: number | null;
}): number | null {
  const high = Number(data?.high ?? 0);
  const low = Number(data?.low ?? 0);
  const close = Number(data?.close ?? 0);
  const open = Number(data?.open ?? 0);

  // 验证必需字段
  if (!isFinite(high) || !isFinite(low) || !isFinite(close) || close === 0) {
    return null;
  }

  const volatilityAbs = (high - low) / close * 100;

  // 无开盘价信息时默认为正
  if (!isFinite(open)) {
    return volatilityAbs;
  }

  // 根据收盘价与开盘价决定波动率正负：收盘价>=开盘价为正，否则为负
  return close >= open ? volatilityAbs : -volatilityAbs;
}

/**
 * 计算涨跌幅颜色类型
 * 
 * @param value - 涨跌幅数值
 * @returns 颜色类型：'red' | 'green' | 'neutral'
 */
export function getPctChgColorType(value: number | null): 'red' | 'green' | 'neutral' {
  if (value === null) return 'neutral';
  if (value > 0) return 'red';
  if (value < 0) return 'green';
  return 'neutral';
}

/**
 * 获取周期内涨跌的中文标签
 * 
 * @param period - K线周期类型
 * @returns 中文标签：'日内' | '周内' | '月内'
 */
export function getIntraperiodLabel(period: Period | undefined): string {
  if (period === 'weekly') return '周内';
  if (period === 'monthly') return '月内';
  return '日内';
}
