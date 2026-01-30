/**
 * 黄金分割渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export class FibonacciRenderer extends BaseRenderer {
  getRequiredPoints(): number {
    return 2;
  }

  getDefaultConfig(): Drawing['config'] {
    return {
      fibonacciLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    };
  }

  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void {
    if (drawing.dataPoints.length < 2) {
      return;
    }

    const p1 = drawing.dataPoints[0];
    const p2 = drawing.dataPoints[1];
    const priceRange = p2.value - p1.value;
    const levels = drawing.config?.fibonacciLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const bounds = config.klineBounds;

    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = drawing.color;

    const startPixelX = drawing.points.length > 0 ? drawing.points[0].x : bounds.left;
    const endPixelX = drawing.points.length > 1 ? drawing.points[1].x : bounds.right;

    for (const level of levels) {
      const price = p1.value + priceRange * level;
      let pixelY: number;
      try {
        pixelY = this.coordinateSystem.dataToPixel({ 
          index: p1.index,
          value: price 
        }, 0).y;
      } catch (e) {
        const priceRangePixel = Math.abs(p2.value - p1.value);
        const priceRangeInBounds = bounds.bottom - bounds.top;
        const pricePixelRatio = priceRangeInBounds / priceRangePixel;
        const priceOffset = (price - p1.value) * pricePixelRatio;
        pixelY = drawing.points[0].y - priceOffset;
      }

      const lineStartX = Math.min(startPixelX, endPixelX);
      const lineEndX = Math.max(startPixelX, endPixelX);
      ctx.beginPath();
      ctx.moveTo(lineStartX, pixelY);
      ctx.lineTo(lineEndX, pixelY);
      ctx.stroke();

      const levelPercent = (level * 100).toFixed(1);
      const labelText = `${levelPercent}%`;
      const textMetrics = ctx.measureText(labelText);
      const labelWidth = textMetrics.width;
      const labelHeight = 12;
      
      const labelX = lineEndX + 5;
      const labelY = pixelY;
      
      // 降低标签背景透明度，避免遮挡K线
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(labelX - 2, labelY - labelHeight / 2, labelWidth + 4, labelHeight);
      
      // 降低标签文字透明度
      ctx.fillStyle = drawing.color;
      ctx.globalAlpha = 0.7;
      ctx.textAlign = 'left';
      ctx.fillText(labelText, labelX, labelY);
      ctx.globalAlpha = 1; // 恢复透明度
      
      ctx.textAlign = 'right';
    }

    // 绘制端点标记（自动处理画线模式）
    if (drawing.points.length >= 2) {
      this.drawPointMarker(ctx, drawing.points[0], config);
      this.drawPointMarker(ctx, drawing.points[1], config);
    }
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.dataPoints.length < 2) {
      return false;
    }

    const p1 = drawing.dataPoints[0];
    const p2 = drawing.dataPoints[1];
    const priceRange = p2.value - p1.value;
    const levels = drawing.config?.fibonacciLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

    const startPixelX = drawing.points.length > 0 ? drawing.points[0].x : bounds.left;
    const endPixelX = drawing.points.length > 1 ? drawing.points[1].x : bounds.right;
    const lineStartX = Math.min(startPixelX, endPixelX);
    const lineEndX = Math.max(startPixelX, endPixelX);

    for (const level of levels) {
      const price = p1.value + priceRange * level;
      let pixelY: number;
      try {
        pixelY = coordinateSystem.dataToPixel({ 
          index: p1.index,
          value: price 
        }, 0).y;
      } catch (e) {
        const priceRangePixel = Math.abs(p2.value - p1.value);
        const priceRangeInBounds = bounds.bottom - bounds.top;
        const pricePixelRatio = priceRangeInBounds / priceRangePixel;
        const priceOffset = (price - p1.value) * pricePixelRatio;
        pixelY = drawing.points[0].y - priceOffset;
      }

      const dist = Math.abs(point.y - pixelY);
      if (dist < threshold && point.x >= lineStartX && point.x <= lineEndX) {
        return true;
      }
    }

    return false;
  }
}

