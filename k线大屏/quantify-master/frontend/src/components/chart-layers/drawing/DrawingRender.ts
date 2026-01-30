/**
 * 绘图渲染控制器
 */
import { Drawing, RenderConfig } from './types.ts';
import { PixelPoint, Bounds } from '../types.ts';
import { CoordinateSystem } from '../CoordinateSystem.ts';
import { createRenderer } from './renderers/index.ts';
import { IDrawingRenderer } from './renderers/BaseRenderer.ts';
import { DrawingConfig, getEffectiveEndpointRadius, getEffectiveEndpointBorderWidth } from './DrawingConfig.ts';

export class DrawingRender {
  private renderers: Map<string, IDrawingRenderer> = new Map();
  private isMobile: boolean = false;

  constructor(
    private coordinateSystem: CoordinateSystem,
    private klineBounds: Bounds | null,
    isMobile?: boolean
  ) {
    this.isMobile = isMobile || false;
  }

  /**
   * 获取或创建渲染器
   */
  private getRenderer(
    type: Drawing['type'],
    options?: {
      isEditing?: boolean;
      editingDrawingId?: string | null;
      editingPointIndex?: number;
      selectedDrawingId?: string | null;
    }
  ): IDrawingRenderer {
    const key = `${type}_${options?.editingDrawingId || ''}_${options?.selectedDrawingId || ''}`;
    if (!this.renderers.has(key)) {
      const renderer = createRenderer(type, this.coordinateSystem, options);
      this.renderers.set(key, renderer);
    }
    return this.renderers.get(key)!;
  }

  /**
   * 绘制单个绘图
   */
  drawDrawing(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    config: RenderConfig,
    options?: {
      isTemporary?: boolean;
      isSelected?: boolean;
      isHovered?: boolean;
      isEditing?: boolean;
      editingDrawingId?: string | null;
      editingPointIndex?: number;
    }
  ): void {
    if (!config.klineBounds || drawing.points.length === 0) {
      return;
    }

    ctx.save();
    
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 选中的绘图使用更粗的线条和半透明背景
    if (options?.isSelected) {
      ctx.lineWidth = drawing.lineWidth + DrawingConfig.selectedLineWidthIncrease;
      ctx.globalAlpha = DrawingConfig.selectedBackgroundAlpha;
      ctx.strokeStyle = drawing.color;
      ctx.setLineDash([]);
      
      const renderer = this.getRenderer(drawing.type, {
        isEditing: options.isEditing,
        editingDrawingId: options.editingDrawingId,
        editingPointIndex: options.editingPointIndex,
        selectedDrawingId: options.isSelected ? drawing.id : null,
      });
      renderer.draw(ctx, drawing, config);
      
      ctx.globalAlpha = 1;
      ctx.lineWidth = drawing.lineWidth;
    }
    
    // 如果是临时绘图或悬停的绘图，使用虚线
    if (options?.isTemporary || options?.isHovered) {
      ctx.setLineDash(DrawingConfig.dashedLinePattern);
    } else {
      ctx.setLineDash([]);
    }

    const renderer = this.getRenderer(drawing.type, {
      isEditing: options?.isEditing,
      editingDrawingId: options?.editingDrawingId,
      editingPointIndex: options?.editingPointIndex,
      selectedDrawingId: options?.isSelected ? drawing.id : null,
    });
    renderer.draw(ctx, drawing, config);

    ctx.restore();
  }

  /**
   * 绘制端点
   * @param isDrawingMode 是否在画线模式下，如果为false，端点半径将为0（不显示）
   */
  drawEndpoints(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    isHighlighted: boolean,
    isDrawingMode: boolean = true
  ): void {
    if (drawing.points.length === 0) {
      return;
    }

    ctx.save();
    
    for (let i = 0; i < drawing.points.length; i++) {
      const point = drawing.points[i];
      
      // 价格通道线的第三个控制点使用特殊样式（已经在renderer中绘制）
      if (drawing.type === 'price-channel' && i === 2) {
        // 第三个控制点已经在renderer中绘制，这里跳过
        continue;
      }
      
      // 如果不在画线模式，端点半径为0（不显示）
      if (!isDrawingMode) {
        continue;
      }
      
      // 绘制端点：先填充，再绘制半透明边框
      // 使用全局配置函数获取有效的半径和边框宽度（自动处理画线模式）
      const radius = getEffectiveEndpointRadius(isDrawingMode, isHighlighted, false);
      const borderWidth = getEffectiveEndpointBorderWidth(isDrawingMode, isHighlighted);
      
      // 如果半径为0，不绘制
      if (radius <= 0) {
        continue;
      }
      
      // 填充端点（半透明）
      ctx.fillStyle = drawing.color;
      ctx.globalAlpha = DrawingConfig.endpointFillAlpha;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // 绘制半透明边框
      ctx.strokeStyle = isHighlighted ? '#FFFFFF' : drawing.color;
      ctx.lineWidth = borderWidth;
      ctx.globalAlpha = DrawingConfig.endpointBorderAlpha;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1; // 恢复透明度
    }
    
    ctx.restore();
  }

  /**
   * 绘制放大镜
   */
  drawMagnifier(
    ctx: CanvasRenderingContext2D,
    centerPoint: PixelPoint,
    echartsCanvas?: HTMLCanvasElement,
    drawingCanvas?: HTMLCanvasElement
  ): void {
    if (!this.klineBounds) {
      return;
    }

    const magnifierSize = DrawingConfig.magnifierSize;
    const zoom = DrawingConfig.magnifierZoom;
    const halfSize = magnifierSize / 2;

    // 移动端：放大镜显示在手指上方，避免被手指遮挡
    // 桌面端：放大镜直接显示在端点位置
    let magnifierX = centerPoint.x;
    let magnifierY = centerPoint.y;
    
    if (this.isMobile) {
      // 移动端：向上偏移，避免被手指遮挡
      // 偏移量 = 放大镜半径 + 安全距离（约40px，考虑手指宽度）
      const offsetY = -(halfSize + 40);
      magnifierY = centerPoint.y + offsetY;
    }

    // 确保放大镜不超出边界
    const clampedX = Math.max(
      this.klineBounds.left + halfSize,
      Math.min(this.klineBounds.right - halfSize, magnifierX)
    );
    const clampedY = Math.max(
      this.klineBounds.top + halfSize,
      Math.min(this.klineBounds.bottom - halfSize, magnifierY)
    );

    if (echartsCanvas) {
      // 计算源区域大小（放大前的区域）
      const sourceSize = magnifierSize / zoom;
      const sourceHalfSize = sourceSize / 2;
      
      // 获取 ECharts canvas 的设备像素比和实际尺寸
      const dpr = window.devicePixelRatio || 1;
      const echartsCssWidth = echartsCanvas.clientWidth || echartsCanvas.offsetWidth || (echartsCanvas.width / dpr);
      const echartsDpr = echartsCanvas.width / echartsCssWidth;
      
      // 源区域在逻辑坐标中的位置（相对于 canvas 的 CSS 尺寸）
      const sourceX = centerPoint.x - sourceHalfSize;
      const sourceY = centerPoint.y - sourceHalfSize;
      
      // 转换为 ECharts canvas 的实际像素坐标（考虑设备像素比）
      const actualSourceX = sourceX * echartsDpr;
      const actualSourceY = sourceY * echartsDpr;
      const actualSourceSize = sourceSize * echartsDpr;

      // 创建临时 canvas 用于放大镜内容
      // 使用更高分辨率临时 canvas 以提高清晰度（使用更高的缩放因子）
      const tempDpr = window.devicePixelRatio || 1;
      const qualityMultiplier = 2; // 额外的质量倍数，提高清晰度
      const tempCanvas = document.createElement('canvas');
      // 临时canvas尺寸 = 放大镜尺寸 * 设备像素比 * 质量倍数（用于提高清晰度）
      const tempCanvasSize = magnifierSize * tempDpr * qualityMultiplier;
      // 目标绘制尺寸（逻辑尺寸，会被缩放到tempCanvasSize）
      const targetSize = magnifierSize * tempDpr * qualityMultiplier;
      tempCanvas.width = tempCanvasSize;
      tempCanvas.height = tempCanvasSize;
      const tempCtx = tempCanvas.getContext('2d', { alpha: true, willReadFrequently: false });
      
      if (tempCtx) {
        // 启用最高质量渲染
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        
        // 先绘制背景（ECharts canvas - K线图）
        // 从源canvas提取小区域，绘制到临时canvas的更大区域（实现放大效果）
        tempCtx.drawImage(
          echartsCanvas,
          actualSourceX,  // 源区域X（实际像素坐标）
          actualSourceY,  // 源区域Y（实际像素坐标）
          actualSourceSize,  // 源区域宽度（实际像素尺寸，小区域）
          actualSourceSize,  // 源区域高度（实际像素尺寸，小区域）
          0,  // 目标X
          0,  // 目标Y
          targetSize,  // 目标宽度（大区域，实现放大）
          targetSize   // 目标高度（大区域，实现放大）
        );
        
        // 再叠加绘制画线内容（drawing canvas），确保K线在下方可见
        if (drawingCanvas) {
          const drawingCssWidth = drawingCanvas.clientWidth || drawingCanvas.offsetWidth || (drawingCanvas.width / dpr);
          const drawingDpr = drawingCanvas.width / drawingCssWidth;
          const drawingSourceX = sourceX * drawingDpr;
          const drawingSourceY = sourceY * drawingDpr;
          const drawingSourceSize = sourceSize * drawingDpr;
          
          // 使用 source-over 模式，确保画线内容叠加在K线图上
          tempCtx.globalCompositeOperation = 'source-over';
          tempCtx.drawImage(
            drawingCanvas,
            drawingSourceX,  // 源区域X
            drawingSourceY,  // 源区域Y
            drawingSourceSize,  // 源区域宽度（小区域）
            drawingSourceSize,  // 源区域高度（小区域）
            0,  // 目标X
            0,  // 目标Y
            targetSize,  // 目标宽度（大区域，实现放大）
            targetSize   // 目标高度（大区域，实现放大）
          );
        }
        
        // 绘制放大镜圆形区域
        ctx.save();
        
        // 启用主 canvas 的最高质量渲染
        const originalImageSmoothingEnabled = ctx.imageSmoothingEnabled;
        const originalImageSmoothingQuality = ctx.imageSmoothingQuality;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.beginPath();
        ctx.arc(clampedX, clampedY, halfSize, 0, Math.PI * 2);
        ctx.clip();
        
        // 绘制放大后的内容（使用高分辨率临时 canvas）
        ctx.drawImage(
          tempCanvas,
          clampedX - halfSize,
          clampedY - halfSize,
          magnifierSize,
          magnifierSize
        );
        
        // 恢复主 canvas 的图像平滑设置
        ctx.imageSmoothingEnabled = originalImageSmoothingEnabled;
        ctx.imageSmoothingQuality = originalImageSmoothingQuality;
        
        ctx.restore();
      }

      // 绘制放大镜边框
      ctx.strokeStyle = DrawingConfig.magnifierBorderColor;
      ctx.lineWidth = DrawingConfig.magnifierBorderWidth;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, halfSize, 0, Math.PI * 2);
      ctx.stroke();

      // 绘制中心点（指示端点位置，使用极小的点）
      // 注意：这个点是在放大镜canvas上直接绘制的，不会被放大效果影响
      // 所以可以使用很小的尺寸，只作为位置标记
      ctx.fillStyle = DrawingConfig.magnifierCrosshairColor;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, DrawingConfig.magnifierCenterPointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * 检查点是否靠近绘图
   */
  isPointNearDrawing(
    point: PixelPoint,
    drawing: Drawing,
    threshold: number
  ): boolean {
    if (!this.klineBounds) {
      return false;
    }

    const renderer = this.getRenderer(drawing.type);
    return renderer.isPointNear(point, drawing, threshold, this.klineBounds, this.coordinateSystem);
  }

  /**
   * 更新配置
   */
  updateConfig(klineBounds: Bounds | null): void {
    this.klineBounds = klineBounds;
    this.renderers.clear(); // 清除缓存，强制重新创建
  }
}


