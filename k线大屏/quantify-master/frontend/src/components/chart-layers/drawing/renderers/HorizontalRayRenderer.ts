/**
 * 水平射线渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export class HorizontalRayRenderer extends BaseRenderer {
  getRequiredPoints(): number {
    return 1;
  }

  getDefaultConfig(): Drawing['config'] {
    return {};
  }

  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void {
    if (drawing.points.length < 1) {
      return;
    }

    const y = drawing.points[0].y;
    const bounds = config.klineBounds;
    
    ctx.beginPath();
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.right, y);
    ctx.stroke();

    // 绘制起点标记（自动处理画线模式）
    this.drawPointMarker(ctx, drawing.points[0], config);
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.points.length < 1) {
      return false;
    }

    const y = drawing.points[0].y;
    const dist = Math.abs(point.y - y);
    return dist < threshold && point.x >= bounds.left && point.x <= bounds.right;
  }
}

