/**
 * 射线渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export class RayRenderer extends BaseRenderer {
  getRequiredPoints(): number {
    return 2;
  }

  getDefaultConfig(): Drawing['config'] {
    return {};
  }

  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void {
    if (drawing.points.length < 2) {
      return;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    
    // 计算射线方向，延伸到边界
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      return;
    }

    const bounds = config.klineBounds;
    const extendLength = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * 2;
    
    const normalizedDx = dx / length;
    const normalizedDy = dy / length;
    
    const endX = p1.x + normalizedDx * extendLength;
    const endY = p1.y + normalizedDy * extendLength;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 绘制起点标记（自动处理画线模式）
    this.drawPointMarker(ctx, p1, config);
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.points.length < 2) {
      return false;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    
    // 计算射线方向
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      return false;
    }

    const extendLength = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * 2;
    const normalizedDx = dx / length;
    const normalizedDy = dy / length;
    const endX = p1.x + normalizedDx * extendLength;
    const endY = p1.y + normalizedDy * extendLength;

    return this.isPointNearLine(point, p1, { x: endX, y: endY }, threshold);
  }
}

