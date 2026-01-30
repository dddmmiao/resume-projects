/**
 * 价格通道渲染器
 */
import { BaseRenderer } from './BaseRenderer.ts';
import { Drawing, RenderConfig } from '../types.ts';
import { PixelPoint, Bounds } from '../../types.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';
import { DrawingConfig, getEffectiveEndpointRadius, getEffectiveEndpointBorderWidth } from '../DrawingConfig.ts';

export class PriceChannelRenderer extends BaseRenderer {
  constructor(
    coordinateSystem: CoordinateSystem,
    private isEditing?: boolean,
    private editingDrawingId?: string | null,
    private editingPointIndex?: number,
    private selectedDrawingId?: string | null
  ) {
    super(coordinateSystem);
  }

  getRequiredPoints(): number {
    return 2;
  }

  getDefaultConfig(): Drawing['config'] {
    return {
      channelWidth: 50,
    };
  }

  draw(ctx: CanvasRenderingContext2D, drawing: Drawing, config: RenderConfig): void {
    if (drawing.points.length < 2) {
      return;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    
    // 计算通道宽度
    let channelWidth = drawing.config?.channelWidth || 50;
    if (drawing.points.length >= 3) {
      const p3 = drawing.points[2];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length > 0) {
        const perpX = -dy / length;
        const perpY = dx / length;
        const vx = p3.x - p1.x;
        const vy = p3.y - p1.y;
        const distanceToMid = vx * perpX + vy * perpY;
        channelWidth = Math.abs(distanceToMid) * 2;
        
        if (!drawing.config) {
          drawing.config = {};
        }
        drawing.config.channelWidth = channelWidth;
        
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const verticalOffset = channelWidth / 2;
        const targetOffset = distanceToMid >= 0 ? verticalOffset : -verticalOffset;
        drawing.points[2].x = midX + perpX * targetOffset;
        drawing.points[2].y = midY + perpY * targetOffset;
        
        const updatedDataPoint = this.coordinateSystem.pixelToData(drawing.points[2], 0);
        if (updatedDataPoint) {
          drawing.dataPoints[2] = updatedDataPoint;
        }
      }
    }

    const verticalOffset = channelWidth / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      return;
    }

    const perpX = -dy / length;
    const perpY = dx / length;

    // 绘制上中下三条线
    ctx.beginPath();
    ctx.moveTo(p1.x + perpX * verticalOffset, p1.y + perpY * verticalOffset);
    ctx.lineTo(p2.x + perpX * verticalOffset, p2.y + perpY * verticalOffset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p1.x - perpX * verticalOffset, p1.y - perpY * verticalOffset);
    ctx.lineTo(p2.x - perpX * verticalOffset, p2.y - perpY * verticalOffset);
    ctx.stroke();

    // 绘制控制点（使用全局配置函数自动处理画线模式）
    const isDrawingMode = config.isDrawingMode !== false;
    
    // 绘制前两个控制点
    this.drawPointMarker(ctx, p1, config);
    this.drawPointMarker(ctx, p2, config);
    
    // 绘制第三个控制点（特殊处理）
    if (drawing.points.length >= 3) {
      const p3 = drawing.points[2];
      const isEditing = this.isEditing && 
                       this.editingDrawingId === drawing.id && 
                       this.editingPointIndex === 2;
      const isSelected = this.selectedDrawingId === drawing.id;
      
      // 使用全局配置函数获取有效的半径和边框宽度
      const radius = getEffectiveEndpointRadius(isDrawingMode, isSelected, isEditing);
      const borderWidth = getEffectiveEndpointBorderWidth(isDrawingMode, isSelected);
      
      // 如果半径为0，不绘制
      if (radius > 0) {
        ctx.save();
        // 填充端点（半透明）
        ctx.fillStyle = isEditing ? '#FFD700' : drawing.color;
        ctx.globalAlpha = DrawingConfig.endpointFillAlpha;
        ctx.beginPath();
        ctx.arc(p3.x, p3.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制半透明边框
        ctx.strokeStyle = isEditing ? '#FFFFFF' : (isSelected ? '#FFFFFF' : drawing.color);
        ctx.lineWidth = borderWidth;
        ctx.globalAlpha = DrawingConfig.endpointBorderAlpha;
        ctx.beginPath();
        ctx.arc(p3.x, p3.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1; // 恢复透明度
        ctx.restore();
      }
    }
  }

  isPointNear(point: PixelPoint, drawing: Drawing, threshold: number, bounds: Bounds, coordinateSystem: CoordinateSystem): boolean {
    if (drawing.points.length < 2) {
      return false;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    const channelWidth = drawing.config?.channelWidth || 50;
    const verticalOffset = channelWidth / 2;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      return false;
    }

    const perpX = -dy / length;
    const perpY = dx / length;

    // 检查是否靠近上中下三条线
    const topLineP1 = { x: p1.x + perpX * verticalOffset, y: p1.y + perpY * verticalOffset };
    const topLineP2 = { x: p2.x + perpX * verticalOffset, y: p2.y + perpY * verticalOffset };
    const midLineP1 = p1;
    const midLineP2 = p2;
    const bottomLineP1 = { x: p1.x - perpX * verticalOffset, y: p1.y - perpY * verticalOffset };
    const bottomLineP2 = { x: p2.x - perpX * verticalOffset, y: p2.y - perpY * verticalOffset };

    return this.isPointNearLine(point, topLineP1, topLineP2, threshold) ||
           this.isPointNearLine(point, midLineP1, midLineP2, threshold) ||
           this.isPointNearLine(point, bottomLineP1, bottomLineP2, threshold);
  }
}

