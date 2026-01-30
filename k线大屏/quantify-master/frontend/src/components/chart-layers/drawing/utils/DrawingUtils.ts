/**
 * 绘图工具函数
 */
import { Drawing, DrawingToolType } from '../types.ts';

// 类型切换顺序列表（按所需控制点数分组，只在同组内循环切换）
// 1个点组
export const TYPE_CYCLE_1_POINT: DrawingToolType[] = [
  'horizontal-ray'
];

// 2个点组
export const TYPE_CYCLE_2_POINTS: DrawingToolType[] = [
  'ray',
  'segment',
  'price-channel',
  'fibonacci',
  'gann-angle'
];

/**
 * 根据点数获取对应的类型循环列表
 */
export function getTypeCycleByPoints(pointCount: number): DrawingToolType[] {
  if (pointCount === 1) {
    return TYPE_CYCLE_1_POINT;
  } else if (pointCount === 2) {
    return TYPE_CYCLE_2_POINTS;
  }
  return []; // 未知点数，返回空数组
}

/**
 * 获取绘图所需的点数
 */
export function getRequiredPoints(type: DrawingToolType): number {
  switch (type) {
    case 'ray':
    case 'segment':
    case 'gann-angle':
      return 2; // 甘氏线需要2个点：第一个点定端点，第二个点定1:1线上的点
    case 'horizontal-ray':
      return 1; // 水平射线只需要1个点（Y坐标）
    case 'price-channel':
      return 2; // 基础两点，通道宽度可以通过编辑第三个端点调整（第三个点可选）
    case 'fibonacci':
      return 2;
    default:
      return 2;
  }
}

/**
 * 获取默认配置
 */
export function getDefaultConfig(type: DrawingToolType): Drawing['config'] {
  switch (type) {
    case 'fibonacci':
      return {
        fibonacciLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
      };
    case 'gann-angle':
      return {}; // 甘氏线角度由两个点确定，不需要配置
    case 'price-channel':
      return {
        channelWidth: 50,
      };
    default:
      return {};
  }
}

/**
 * 生成唯一的绘图ID
 */
export function generateDrawingId(): string {
  return `drawing-${Date.now()}-${Math.random()}`;
}

