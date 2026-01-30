/**
 * 绘图模块类型定义
 */
import { DataPoint, PixelPoint, Bounds } from '../types.ts';

// 画线工具类型
export type DrawingToolType =
  | 'ray'              // 射线
  | 'horizontal-ray'   // 水平射线
  | 'segment'          // 线段
  | 'price-channel'    // 价格通道线
  | 'fibonacci'        // 黄金分割线
  | 'gann-angle';      // 江恩角度箱

// 绘图对象接口
export interface Drawing {
  id: string;
  type: DrawingToolType;
  points: PixelPoint[];           // 像素坐标点
  dataPoints: DataPoint[];         // 数据坐标点
  color: string;
  lineWidth: number;
  visible: boolean;
  locked: boolean;
  config?: {
    // 黄金分割线配置
    fibonacciLevels?: number[];    // 如 [0.236, 0.382, 0.5, 0.618, 0.786]
    // 江恩角度箱配置（甘氏箱）
    // 价格通道线配置
    channelWidth?: number;         // 通道宽度（像素）
  };
}

export interface DrawingLayerConfig {
  klineData: any[];
  klineBounds: Bounds | null;
  theme: string;
  enableDrawing?: boolean;         // 是否启用画线
  defaultColor?: string;
  defaultLineWidth?: number;
  onDrawingUpdate?: (drawings: Drawing[]) => void;
  onToolChange?: (tool: DrawingToolType | null) => void; // 工具变化回调
  isMobile?: boolean; // 是否为移动端
}

// 渲染配置
export interface RenderConfig {
  klineBounds: Bounds;
  coordinateSystem: import('../CoordinateSystem.ts').CoordinateSystem;
  isEditing?: boolean;
  editingDrawingId?: string | null;
  editingPointIndex?: number;
  selectedDrawingId?: string | null;
  hoveredDrawingId?: string | null;
  drawPointMarker?: (ctx: CanvasRenderingContext2D, point: PixelPoint) => void;
  isDrawingMode?: boolean; // 是否在画线模式下，控制控制点是否显示
}

