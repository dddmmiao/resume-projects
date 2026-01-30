/**
 * 线段渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export class SegmentRenderer extends BaseRenderer {
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

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // 绘制端点标记（自动处理画线模式）
    this.drawPointMarker(ctx, p1, config);
    this.drawPointMarker(ctx, p2, config);
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.points.length < 2) {
      return false;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    return this.isPointNearLine(point, p1, p2, threshold);
  }
}

