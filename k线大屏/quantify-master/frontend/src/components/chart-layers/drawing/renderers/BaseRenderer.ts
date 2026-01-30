/**
 * 渲染器基类
 */
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';
import { getEffectivePointMarkerRadius } from '../DrawingConfig.ts';

export interface IDrawingRenderer {
  /**
   * 绘制绘图
   */
  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void;

  /**
   * 检查点是否靠近绘图
   */
  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean;

  /**
   * 获取所需的点数
   */
  getRequiredPoints(): number;

  /**
   * 获取默认配置
   */
  getDefaultConfig(): Drawing['config'];
}

export abstract class BaseRenderer implements IDrawingRenderer {
  protected coordinateSystem: CoordinateSystem;

  constructor(coordinateSystem: CoordinateSystem) {
    this.coordinateSystem = coordinateSystem;
  }

  abstract draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void;
  abstract isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean;
  abstract getRequiredPoints(): number;
  abstract getDefaultConfig(): Drawing['config'];

  /**
   * 绘制点标记
   * 根据画线模式自动处理：不在画线模式时不绘制
   */
  protected drawPointMarker(
    ctx: CanvasRenderingContext2D, 
    point: PixelPoint, 
    config?: RenderConfig
  ): void {
    // 如果提供了config，检查画线模式；否则默认绘制（向后兼容）
    const isDrawingMode = config?.isDrawingMode !== false;
    const radius = getEffectivePointMarkerRadius(isDrawingMode);
    
    // 如果半径为0，不绘制
    if (radius <= 0) {
      return;
    }
    
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 检查点是否靠近线段
   */
  protected isPointNearLine(
    point: PixelPoint,
    p1: PixelPoint,
    p2: PixelPoint,
    threshold: number
  ): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) {
      // 如果线段长度为0，检查点是否在端点附近
      const dist = Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
      return dist < threshold;
    }

    // 计算点到线段的距离
    const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (length * length)));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);

    return dist < threshold;
  }
}

