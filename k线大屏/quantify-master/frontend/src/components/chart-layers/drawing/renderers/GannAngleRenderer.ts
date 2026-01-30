/**
 * 江恩角度箱渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export class GannAngleRenderer extends BaseRenderer {
  getRequiredPoints(): number {
    return 2;
  }

  getDefaultConfig(): Drawing['config'] {
    return {};
  }

  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void {
    if (drawing.points.length < 2 || drawing.dataPoints.length < 2) {
      return;
    }

    const startPoint = drawing.points[0];
    const point1x1 = drawing.points[1];
    const bounds = config.klineBounds;

    const dx = point1x1.x - startPoint.x;
    const dy = point1x1.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) {
      return;
    }

    const angle1x1 = Math.atan2(dy, dx);
    const isPointAbove = point1x1.y < startPoint.y;
    
    const boxLeft = startPoint.x;
    const boxRight = bounds.right;
    const boxTop = isPointAbove ? bounds.top : startPoint.y;
    const boxBottom = isPointAbove ? startPoint.y : bounds.bottom;

    const gannLines: Array<{ ratio: string; timeRatio: number; priceRatio: number }> = [
      { ratio: '水平', timeRatio: 1, priceRatio: 0 },
      { ratio: '8:1', timeRatio: 8, priceRatio: 1 },
      { ratio: '4:1', timeRatio: 4, priceRatio: 1 },
      { ratio: '3:1', timeRatio: 3, priceRatio: 1 },
      { ratio: '2:1', timeRatio: 2, priceRatio: 1 },
      { ratio: '1:1', timeRatio: 1, priceRatio: 1 },
      { ratio: '1:2', timeRatio: 1, priceRatio: 2 },
      { ratio: '1:3', timeRatio: 1, priceRatio: 3 },
      { ratio: '1:4', timeRatio: 1, priceRatio: 4 },
      { ratio: '1:8', timeRatio: 1, priceRatio: 8 },
      { ratio: '竖直', timeRatio: 0, priceRatio: 1 },
    ];

    const lineColors = [
      '#999999', '#9370DB', '#4169E1', '#00CED1', '#32CD32',
      '#FFD700', '#FFA500', '#FF6347', '#FF4500', '#FF0000', '#999999',
    ];

    for (let i = 0; i < gannLines.length; i++) {
      const line = gannLines[i];
      let angleRadians: number;

      if (line.ratio === '水平') {
        angleRadians = 0;
      } else if (line.ratio === '竖直') {
        angleRadians = Math.PI / 2;
      } else {
        const standard1x1Angle = Math.PI / 4;
        const angleDiff = angle1x1 - standard1x1Angle;
        const standardLineAngle = Math.atan2(line.priceRatio, line.timeRatio);
        angleRadians = standardLineAngle + angleDiff;
        
        if (!Number.isFinite(angleRadians)) {
          angleRadians = angle1x1;
        }
      }

      let endX: number;
      let endY: number;

      if (line.ratio === '水平') {
        endX = boxRight;
        endY = startPoint.y;
      } else if (line.ratio === '竖直') {
        endX = startPoint.x;
        endY = isPointAbove ? boxTop : boxBottom;
      } else {
        const tanAngle = Math.tan(angleRadians);
        
        if (!Number.isFinite(tanAngle)) {
          endX = startPoint.x;
          endY = isPointAbove ? boxTop : boxBottom;
        } else {
          const intersectRightX = boxRight;
          const intersectRightY = startPoint.y + tanAngle * (boxRight - startPoint.x);
          
          const verticalBound = isPointAbove ? boxTop : boxBottom;
          const intersectVerticalY = verticalBound;
          const intersectVerticalX = startPoint.x + (verticalBound - startPoint.y) / tanAngle;
          
          const rightInBox = intersectRightY >= boxTop && 
                            intersectRightY <= boxBottom && 
                            intersectRightX >= boxLeft &&
                            intersectRightX <= boxRight;
          
          const verticalInBox = intersectVerticalX >= boxLeft && 
                               intersectVerticalX <= boxRight && 
                               intersectVerticalY >= boxTop &&
                               intersectVerticalY <= boxBottom;
          
          if (rightInBox) {
            endX = intersectRightX;
            endY = Math.max(boxTop, Math.min(boxBottom, intersectRightY));
          } else if (verticalInBox) {
            endX = Math.max(boxLeft, Math.min(boxRight, intersectVerticalX));
            endY = intersectVerticalY;
          } else {
            endX = boxRight;
            endY = Math.max(boxTop, Math.min(boxBottom, intersectRightY));
          }
        }
      }

      const clampedEndX = Math.max(bounds.left, Math.min(bounds.right, endX));
      const clampedEndY = Math.max(bounds.top, Math.min(bounds.bottom, endY));

      const lineColor = line.ratio === '1:1' ? drawing.color : lineColors[i] || drawing.color;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = line.ratio === '1:1' ? drawing.lineWidth + 0.5 : drawing.lineWidth;

      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(clampedEndX, clampedEndY);
      ctx.stroke();

      // 不显示竖直和水平线的标签
      if (line.ratio !== '水平' && line.ratio !== '竖直') {
        const midRatio = 0.35;
        const midX = startPoint.x + (clampedEndX - startPoint.x) * midRatio + i * 10;
        const midY = startPoint.y + (clampedEndY - startPoint.y) * midRatio;

        const clampedLabelX = Math.max(bounds.left + 5, Math.min(bounds.right - 5, midX));
        const clampedLabelY = Math.max(bounds.top + 10, Math.min(bounds.bottom - 10, midY));

        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelText = line.ratio;

        const textMetrics = ctx.measureText(labelText);
        const labelWidth = textMetrics.width;
        const labelHeight = 14;
        const padding = 3;
        // 降低标签背景透明度，避免遮挡K线
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(
          clampedLabelX - labelWidth / 2 - padding,
          clampedLabelY - labelHeight / 2,
          labelWidth + padding * 2,
          labelHeight
        );

        // 降低标签文字透明度
        ctx.fillStyle = lineColor;
        ctx.globalAlpha = 0.7;
        ctx.fillText(labelText, clampedLabelX, clampedLabelY);
        ctx.globalAlpha = 1; // 恢复透明度
      }

      ctx.lineWidth = drawing.lineWidth;
    }

    // 绘制端点标记（自动处理画线模式）
    this.drawPointMarker(ctx, startPoint, config);
    if (drawing.points.length >= 2) {
      this.drawPointMarker(ctx, drawing.points[1], config);
    }
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.points.length < 2) {
      return false;
    }

    const startPoint = drawing.points[0];
    const point1x1 = drawing.points[1];
    const dx = point1x1.x - startPoint.x;
    const dy = point1x1.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) {
      return false;
    }

    const angle1x1 = Math.atan2(dy, dx);
    const isPointAbove = point1x1.y < startPoint.y;
    
    const boxLeft = startPoint.x;
    const boxRight = bounds.right;
    const boxTop = isPointAbove ? bounds.top : startPoint.y;
    const boxBottom = isPointAbove ? startPoint.y : bounds.bottom;

    const gannLines = [
      { ratio: '水平', timeRatio: 1, priceRatio: 0 },
      { ratio: '8:1', timeRatio: 8, priceRatio: 1 },
      { ratio: '4:1', timeRatio: 4, priceRatio: 1 },
      { ratio: '3:1', timeRatio: 3, priceRatio: 1 },
      { ratio: '2:1', timeRatio: 2, priceRatio: 1 },
      { ratio: '1:1', timeRatio: 1, priceRatio: 1 },
      { ratio: '1:2', timeRatio: 1, priceRatio: 2 },
      { ratio: '1:3', timeRatio: 1, priceRatio: 3 },
      { ratio: '1:4', timeRatio: 1, priceRatio: 4 },
      { ratio: '1:8', timeRatio: 1, priceRatio: 8 },
      { ratio: '竖直', timeRatio: 0, priceRatio: 1 },
    ];

    for (const line of gannLines) {
      let angleRadians: number;

      if (line.ratio === '水平') {
        angleRadians = 0;
      } else if (line.ratio === '竖直') {
        angleRadians = Math.PI / 2;
      } else {
        const standard1x1Angle = Math.PI / 4;
        const angleDiff = angle1x1 - standard1x1Angle;
        const standardLineAngle = Math.atan2(line.priceRatio, line.timeRatio);
        angleRadians = standardLineAngle + angleDiff;
        
        if (!Number.isFinite(angleRadians)) {
          angleRadians = angle1x1;
        }
      }

      let endX: number;
      let endY: number;

      if (line.ratio === '水平') {
        endX = boxRight;
        endY = startPoint.y;
      } else if (line.ratio === '竖直') {
        endX = startPoint.x;
        endY = isPointAbove ? boxTop : boxBottom;
      } else {
        const tanAngle = Math.tan(angleRadians);
        
        if (!Number.isFinite(tanAngle)) {
          endX = startPoint.x;
          endY = isPointAbove ? boxTop : boxBottom;
        } else {
          const intersectRightY = startPoint.y + tanAngle * (boxRight - startPoint.x);
          const verticalBound = isPointAbove ? boxTop : boxBottom;
          const intersectVerticalX = startPoint.x + (verticalBound - startPoint.y) / tanAngle;
          
          const rightInBox = intersectRightY >= boxTop && intersectRightY <= boxBottom;
          const verticalInBox = intersectVerticalX >= boxLeft && intersectVerticalX <= boxRight;
          
          if (rightInBox) {
            endX = boxRight;
            endY = Math.max(boxTop, Math.min(boxBottom, intersectRightY));
          } else if (verticalInBox) {
            endX = Math.max(boxLeft, Math.min(boxRight, intersectVerticalX));
            endY = verticalBound;
          } else {
            endX = boxRight;
            endY = Math.max(boxTop, Math.min(boxBottom, intersectRightY));
          }
        }
      }

      const endPoint: PixelPoint = { x: endX, y: endY };

      if (this.isPointNearLine(point, startPoint, endPoint, threshold)) {
        return true;
      }
    }

    return false;
  }
}

