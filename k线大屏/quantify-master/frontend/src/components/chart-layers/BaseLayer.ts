/**
 * 基础图层类
 * 所有图层的基类，提供通用功能
 */
import { IChartLayer, ChartEvent } from './types.ts';
import { CoordinateSystem } from './CoordinateSystem.ts';

export abstract class BaseLayer implements IChartLayer {
  public canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected coordinateSystem: CoordinateSystem;

  abstract readonly zIndex: number;

  constructor(
    container: HTMLElement,
    coordinateSystem: CoordinateSystem,
    width: number,
    height: number
  ) {
    this.coordinateSystem = coordinateSystem;
    
    // 创建canvas元素
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none'; // 默认不拦截事件，让ECharts可以正常交互
    // zIndex 将在子类初始化完成后通过 initZIndex 方法设置
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    this.ctx = ctx;

    // 设置Canvas尺寸（考虑设备像素比以获得清晰的渲染）
    this.setupCanvasSize(width, height);

    // 添加到容器
    container.appendChild(this.canvas);

    // 监听尺寸变化
    this.setupResizeObserver(container);
  }

  /**
   * 设置Canvas尺寸，考虑设备像素比以获得高DPI屏幕的清晰渲染
   */
  private setupCanvasSize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    
    // 设置CSS尺寸（显示尺寸）
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // 设置实际绘制尺寸（乘以设备像素比）
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    // 缩放context以匹配设备像素比
    this.ctx.scale(dpr, dpr);
    
    // 启用高质量渲染
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    
    // 设置文字渲染质量
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'left';
  }
  
  /**
   * 初始化zIndex（由子类在构造函数中调用）
   */
  protected initZIndex(): void {
    if (this.zIndex !== undefined) {
      this.canvas.style.zIndex = String(this.zIndex);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 设置canvas尺寸（考虑设备像素比）
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    
    // 设置CSS尺寸（显示尺寸）
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // 设置实际绘制尺寸（乘以设备像素比）
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    // 重置transform并重新缩放context以匹配设备像素比
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置transform
    this.ctx.scale(dpr, dpr);
    
    // 启用高质量渲染
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    
    // 重新渲染
    this.render();
  }

  /**
   * 监听容器尺寸变化
   */
  private setupResizeObserver(container: HTMLElement): void {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.resize(Math.floor(width), Math.floor(height));
      }
    });

    observer.observe(container);
  }

  /**
   * 清空canvas（考虑设备像素比）
   */
  protected clear(): void {
    const dpr = window.devicePixelRatio || 1;
    // 清空实际绘制区域（已考虑dpr）
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
  }

  /**
   * 子类必须实现的方法
   */
  abstract render(): void;

  /**
   * 子类可选择实现的方法
   */
  handleEvent?(event: ChartEvent): boolean;
  
  update?(data: any): void;

  /**
   * 销毁图层
   */
  destroy(): void {
    this.canvas.remove();
  }
}

