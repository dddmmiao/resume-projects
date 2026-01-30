/**
 * 图表分层架构 - 类型定义
 */

// 数据点
export interface DataPoint {
  index: number;
  value: number;
  date?: string;
}

// 像素点
export interface PixelPoint {
  x: number;
  y: number;
}

// 边界
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// 图表事件
export interface ChartEvent {
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'click' | 'touchstart' | 'touchmove' | 'touchend';
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

// 标签配置
export interface LabelConfig {
  id: string;
  name: string;
  value?: number;
  color: string;
  position: PixelPoint;
  onClick?: () => void;
  showValue?: boolean;
}

// 十字线类型
export type CrosshairType = 'free' | 'snap' | 'fixed';

// 十字线配置
export interface CrosshairConfig {
  id: string;
  type: CrosshairType;
  position: PixelPoint;
  dataPoint?: DataPoint;
  locked: boolean;
  onUpdate?: (position: PixelPoint) => void;
}

// 绘图工具类型
export type DrawingToolType = 'fibonacci' | 'trendline' | 'horizontal' | 'vertical' | 'rectangle' | 'text';

// 绘图工具配置
export interface DrawingToolConfig {
  id: string;
  type: DrawingToolType;
  points: DataPoint[];
  config?: Record<string, any>;
}

// 坐标系统接口
export interface ICoordinateSystem {
  dataToPixel(dataPoint: DataPoint, gridIndex: number): PixelPoint;
  pixelToData(pixel: PixelPoint, gridIndex: number): DataPoint | null;
  getGridBounds(gridIndex: number): Bounds | null;
}

// 图表层接口
export interface IChartLayer {
  readonly zIndex: number;
  readonly canvas: HTMLCanvasElement;
  render(): void;
  handleEvent?(event: ChartEvent): boolean;
  destroy(): void;
  update?(data: any): void;
}

