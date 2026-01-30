/**
 * 十字线层
 * 支持多十字线、固定、拖动、x/y轴标签显示
 */
import { BaseLayer } from './BaseLayer.ts';
import { ChartEvent, DataPoint, PixelPoint } from './types.ts';
import { CoordinateSystem } from './CoordinateSystem.ts';
import { KLineData } from '../../utils/indicators';
import Hammer from 'hammerjs';
import { useAppStore } from '../../stores/useAppStore.ts';
import { formatLargeNumber } from '../mobile/utils.ts';

export type CrosshairMode = 0 | 1 | 2 | 3; // 0=无, 1=自由, 2=吸附, 3=双十字线

// 常量定义
const CONSTANTS = {
  // 触摸阈值
  TOUCH_MOVE_THRESHOLD: 8, // px - 移动距离阈值，超过此值认为是拖动
  TOUCH_TIME_THRESHOLD: 200, // ms - 触摸时间阈值，超过此值认为不是单击
  CROSSHAIR_DRAG_RADIUS: 50, // px - 十字线拖动检测半径
  CROSSHAIR_CLICK_RADIUS: 10, // px - 十字线单击检测半径
  
  // 模式切换锁
  MODE_SWITCH_LOCK_DURATION: 200, // ms - 模式切换锁持续时间
  
  // 十字线颜色（默认值，实际会根据主题动态调整）
  FREE_CROSSHAIR_COLOR: '#ffffff',
  SNAP_CROSSHAIR_COLOR: '#ff6b6b',
  LOCKED_CROSSHAIR_COLOR: '#52c41a',
  DEFAULT_FREE_COLOR: '#999',
  // Light主题下的十字线颜色
  FREE_CROSSHAIR_COLOR_LIGHT: '#666666',
  DEFAULT_FREE_COLOR_LIGHT: '#999999',
} as const;

/**
 * 标签样式配置
 */
interface LabelStyle {
  fontSize: number;
  padding: number;
  labelHeight: number;
  borderRadius: number;
  spacing: number; // Y轴标签与坐标轴的间距
}

/**
 * 获取标签样式配置
 */
function getLabelStyle(isMobile: boolean | undefined, isFullscreen: boolean | undefined): LabelStyle {
  // 移动端列表页：最小标签
  if (isMobile && !isFullscreen) {
    return {
      fontSize: 9,
      padding: 2,
      labelHeight: 14,
      borderRadius: 2,
      spacing: 4,
    };
  }
  
  // 移动端详情页：稍大标签
  if (isMobile && isFullscreen) {
    return {
      fontSize: 11,
      padding: 3,
      labelHeight: 16,
      borderRadius: 2,
      spacing: 6,
    };
  }
  
  // 桌面端：标准标签
  return {
    fontSize: 11,
    padding: 4,
    labelHeight: 18,
    borderRadius: 3,
    spacing: 8,
  };
}

export interface CrosshairLayerConfig {
  klineData: KLineData[];
  klineBounds: { left: number; right: number; top: number; bottom: number } | null;
  volumeBounds: { left: number; right: number; top: number; bottom: number } | null;
  theme: string;
  onDataUpdate?: (data: KLineData | null) => void;
  crosshairMode?: CrosshairMode; // 初始模式（可选，实际模式从全局store获取）
  isMobile?: boolean; // 是否为移动端，移动端强制使用自由模式（模式1）
  isFullscreen?: boolean; // 是否为全屏模式（移动端详情页）
  onCrosshairStateChange?: (hasCrosshair: boolean) => void; // 十字线状态变化回调
  onCrosshairPositionChange?: (tradeDate: string | null) => void; // 十字线位置变化回调（用于联动，传递交易日期）
  lazyInteraction?: boolean; // 延迟启用交互：true时需要首次触摸才启用交互
}

interface Crosshair {
  id: string;
  type: 'free' | 'snap' | 'fixed';
  position: PixelPoint;
  dataPoint: DataPoint | null;
  locked: boolean;
  color: string;
}

export class CrosshairLayer extends BaseLayer {
  readonly zIndex = 200;
  private config: CrosshairLayerConfig;
  private container: HTMLElement; // 保存容器引用，用于事件边界检查
  private crosshairs: Crosshair[] = [];
  private activeCrosshairIndex: number = -1;
  private draggingCrosshairId: string | null = null;
  private dragStartPosition: PixelPoint | null = null;
  private interactionEnabled: boolean = true; // 交互是否启用
  
  // 日期索引缓存（用于快速查找，O(1)复杂度）
  private tradeDateIndexMap: Map<string, number> = new Map();
  
  // Hammer.js 实例：用于区分点击和拖动
  private hammer: HammerManager | null = null;
  private isDragging: boolean = false; // 是否正在拖动
  
  // 临时模式（用于画线模式等场景，临时覆盖全局模式）
  private tempMode: CrosshairMode | null = null;
  
  // 十字线激活状态（移动端单击切换）
  private isCrosshairActive: boolean = false;
  // 单击节流时间戳，防止一次触摸触发多次点击处理
  private lastClickTime: number = 0;
  private lastTapTime: number = 0;
  
  // 触摸开始位置和时间（用于检测单击）
  private touchStartTime: number = 0;
  private touchStartPos: PixelPoint | null = null;
  private touchStartThreshold: number = CONSTANTS.TOUCH_MOVE_THRESHOLD;
  private touchStartTimeThreshold: number = CONSTANTS.TOUCH_TIME_THRESHOLD;
  
  // 拖动检测标志
  private hasDragged: boolean = false; // 是否发生了拖动行为
  
  // 触摸事件处理器引用（用于销毁时清理）
  private touchStartHandler: ((e: TouchEvent) => void) | null = null;
  private touchMoveHandler: ((e: TouchEvent) => void) | null = null;
  private touchEndHandler: ((e: TouchEvent) => void) | null = null;
  
  /**
   * 根据主题获取自由十字线颜色
   */
  private getFreeCrosshairColor(): string {
    return this.config.theme === 'light' 
      ? CONSTANTS.FREE_CROSSHAIR_COLOR_LIGHT 
      : CONSTANTS.FREE_CROSSHAIR_COLOR;
  }

  /**
   * 根据主题获取默认自由十字线颜色
   */
  private getDefaultFreeColor(): string {
    return this.config.theme === 'light'
      ? CONSTANTS.DEFAULT_FREE_COLOR_LIGHT
      : CONSTANTS.DEFAULT_FREE_COLOR;
  }
  
  /**
   * 获取当前十字线模式
   * 优先使用临时模式，然后从全局store获取，确保所有卡片同步
   * 移动端也使用全局模式，不再强制使用模式1
   */
  private get mode(): CrosshairMode {
    // 如果有临时模式，优先使用临时模式
    if (this.tempMode !== null) {
      return this.tempMode;
    }
    const storeMode = useAppStore.getState().crosshairMode;
    if (storeMode >= 0 && storeMode <= 3) {
      return storeMode as CrosshairMode;
    }
    return (this.config.crosshairMode ?? 1) as CrosshairMode; // 移动端默认模式1
  }
  
  /**
   * 设置临时模式（用于画线模式等场景）
   * @param mode 临时模式，null表示清除临时模式
   */
  setTempMode(mode: CrosshairMode | null): void {
    this.tempMode = mode;
    this.applyMode(); // 重新应用模式
  }
  
  
  // 双十字线ID引用
  private freeCrosshairId: string | null = null; // 自由十字线（跟随鼠标）
  private snapCrosshairId: string | null = null; // 吸附十字线（吸附到关键点）

  constructor(
    container: HTMLElement,
    coordinateSystem: CoordinateSystem,
    config: CrosshairLayerConfig
  ) {
    super(container, coordinateSystem, container.clientWidth, container.clientHeight);
    this.config = config;
    this.container = container;
    
    // 🔧 延迟交互：非全屏移动端默认禁用交互，需要首次触摸启用
    this.interactionEnabled = !(config.lazyInteraction && config.isMobile && !config.isFullscreen);
    
    
    // Canvas 默认不拦截事件，事件由容器 / ECharts 处理
    // this.canvas.style.cursor = 'crosshair'; // 不在canvas上设置cursor，避免覆盖
    
    // 初始化zIndex
    this.initZIndex();
    
    // 移动端：在容器上监听触摸事件，默认不拦截，让 ECharts 处理双指缩放
    if (config.isMobile) {
      // 初始状态：pointerEvents 维持 BaseLayer 默认值 'none'
      // 当进入十字线模式时，再通过 updateCanvasPointerEvents 暂时打开
      this.setupMobileTouchListeners();
    }
    
    // 初始化 Hammer.js 用于区分点击和拖动
    this.initHammer(this.container);
    
    // 初始化日期索引映射（用于联动时的快速查找）
    this.rebuildTradeDateIndexMap();
    
    // 初始化时通知一次状态（确保初始状态正确）
    // 延迟执行，确保chartInstance已经初始化完成
    setTimeout(() => {
      this.notifyCrosshairStateChange();
    }, 0);
    
    // 监听全局十字线类型切换事件，切换时退出十字线模式
    this.setupCrosshairModeChangeListener();
  }
  
  /**
   * 设置十字线模式切换监听器
   */
  private setupCrosshairModeChangeListener(): void {
    const handleModeChange = () => {
      // 重新应用模式，清除现有十字线，下次创建时使用新模式
      this.applyMode();
    };
    
    // 监听自定义事件：十字线类型切换
    window.addEventListener('crosshairModeChanged', handleModeChange);
    
    // 保存处理器引用，以便销毁时移除
    (this as any)._modeChangeHandler = handleModeChange;
  }
  
  /**
   * 处理触摸开始事件
   */
  private handleTouchStart(e: TouchEvent): void {
    // 多指手势（双指缩放等）全部交给 ECharts 处理，这里不拦截
    if (e.touches.length > 1 || e.changedTouches.length > 1) {
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;
    
    // 延迟交互：首次触摸启用交互
    if (!this.interactionEnabled && this.config.lazyInteraction) {
      this.interactionEnabled = true;
    }
    
    const { canvasX, canvasY } = this.getTouchCoordinates(touch);
    
    // 记录触摸开始信息
    this.touchStartTime = Date.now();
    this.touchStartPos = { x: canvasX, y: canvasY };
    this.hasDragged = false; // 重置拖动标志
    
    // 🔧 延迟交互检查：如果交互未启用，跳过十字线交互处理
    if (!this.interactionEnabled) {
      return;
    }
    
    // 检查触摸位置和模式
    const isInValidArea = this.isPointInValidArea(canvasX, canvasY);
    if (!isInValidArea || this.mode === 0) {
      // 无效区域或模式0：只有十字线存在时才阻止默认行为
      // 移动端非全屏模式下，减少preventDefault的使用，避免干扰页面交互
      const shouldPrevent = this.hasCrosshair() && !(this.config.isMobile && !this.config.isFullscreen);
      if (shouldPrevent) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    
    const hasCrosshair = this.hasCrosshair();
    if (!hasCrosshair) {
      // 没有十字线：允许ECharts处理事件，等待touchend判断是否为单击
      return;
    }
    
    // 有十字线：检查是否点击在十字线附近
    const touchPos: PixelPoint = { x: canvasX, y: canvasY };
    const nearest = this.findNearestCrosshair(touchPos);
    
    if (nearest) {
      // 十字线附近：记录拖动起始位置
      this.dragStartPosition = touchPos;
      // 移动端卡片列表（非全屏）不阻止事件，保持页面流畅
      if (this.config.isMobile && this.config.isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
      }
    } else {
      // 有十字线但未命中：移动端卡片列表不拦截
      const shouldPrevent = !(this.config.isMobile && !this.config.isFullscreen);
      if (shouldPrevent) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  
  /**
   * 获取触摸点相对于canvas的坐标
   */
  private getTouchCoordinates(touch: Touch): { canvasX: number; canvasY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = touch.clientX - rect.left;
    const canvasY = touch.clientY - rect.top;
    return { canvasX, canvasY };
  }
  
  /**
   * 处理触摸移动事件
   */
  private handleTouchMove(e: TouchEvent): void {
    // 多指手势（缩放）直接交给 ECharts，不处理
    if (e.touches.length > 1 || e.changedTouches.length > 1) {
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;
    
    const { canvasX, canvasY } = this.getTouchCoordinates(touch);
    this.updateDragState(canvasX, canvasY);
    
    // 没有十字线时不拦截事件
    if (!this.hasCrosshair()) {
      return;
    }
    
    if (this.draggingCrosshairId) {
      // 拖动十字线
      this.handleCrosshairDrag(e, canvasX, canvasY);
    } else {
      // 有十字线但当前不是拖动状态
      // 移动端卡片列表（非全屏）不阻止事件，保持页面流畅
      const shouldPrevent = this.config.isMobile 
        ? this.config.isFullscreen  // 移动端全屏时才阻止
        : true;  // 桌面端始终阻止
      if (shouldPrevent) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  
  /**
   * 更新拖动状态
   */
  private updateDragState(canvasX: number, canvasY: number): void {
    if (!this.touchStartPos) return;
    
    const moveDistance = Math.sqrt(
      Math.pow(canvasX - this.touchStartPos.x, 2) +
      Math.pow(canvasY - this.touchStartPos.y, 2)
    );
    
    if (moveDistance > this.touchStartThreshold) {
      // 确认拖动：标记为已拖动
      this.hasDragged = true;
      
      // 启动十字线拖动（如果条件满足）
      if (this.hasCrosshair() && this.dragStartPosition && !this.draggingCrosshairId) {
        const nearest = this.findNearestCrosshair(this.dragStartPosition);
        if (nearest) {
          this.draggingCrosshairId = nearest.crosshair.id;
          this.activeCrosshairIndex = this.crosshairs.indexOf(nearest.crosshair);
        }
      }
      this.touchStartPos = null; // 清除位置，标记为拖动
    }
  }
  
  /**
   * 处理十字线拖动
   */
  private handleCrosshairDrag(e: TouchEvent, canvasX: number, canvasY: number): void {
    // 十字线拖动时：始终阻止默认行为，避免触发K线 dataZoom 的拖动/缩放
    e.preventDefault();
    
    const crosshair = this.crosshairs.find(c => c.id === this.draggingCrosshairId);
    if (!crosshair || crosshair.locked) {
      this.draggingCrosshairId = null;
      this.dragStartPosition = null;
      return;
    }
    
    const clamped = this.clampToValidArea(canvasX, canvasY);
    if (clamped) {
      crosshair.position = clamped;
      crosshair.dataPoint = this.pixelToData(clamped);
      
      // 更新吸附十字线位置（如果需要）
      this.updateSnapCrosshairOnDrag(crosshair, clamped);
      
      this.render();
      this.updateData(crosshair.dataPoint);
    }
    
    e.stopPropagation();
  }
  
  /**
   * 处理触摸结束事件
   */
  private handleTouchEnd(e: TouchEvent): void {
    // 多指结束事件：交给 ECharts 处理，同时清理内部拖动状态
    if (e.touches.length > 1 || e.changedTouches.length > 1) {
      this.clearDragState();
      return;
    }

    // 如果有拖动行为，不触发单击事件
    if (this.hasDragged || this.draggingCrosshairId) {
      this.clearDragState();
      return;
    }
    
    const isClick = this.checkIsClick();
    if (isClick) {
      const now = Date.now();
      if (this.config.isMobile) {
        // 移动端：在触摸结束时手动识别双击，两次轻触间隔在阈值内视为double-tap
        const DOUBLE_TAP_INTERVAL = 260;
        if (now - this.lastTapTime < DOUBLE_TAP_INTERVAL) {
          this.handleClick(e);
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
        }
      } else {
        this.handleClick(e);
      }
    }
    
    // 清除所有拖动状态
    this.clearDragState();
  }
  
  /**
   * 处理点击事件
   */
  private handleClick(e: TouchEvent): void {
    const touch = e.changedTouches[0];
    if (!touch) return;
    
    const { canvasX, canvasY } = this.getTouchCoordinates(touch);
    const isInValidArea = this.isPointInValidArea(canvasX, canvasY);

    if (!isInValidArea || this.mode === 0) {
      return;
    }
    
    // 简单节流：防止一次触摸被识别为多次点击
    const now = Date.now();
    if (now - this.lastClickTime < 150) {
      return;
    }
    this.lastClickTime = now;

    e.stopPropagation();

    if (this.hasCrosshair()) {
      this.exitCrosshairMode();
    } else {
      this.enterCrosshairMode(canvasX, canvasY);
    }
  }
  
  /**
   * 清除拖动相关状态
   */
  private clearDragState(): void {
    this.draggingCrosshairId = null;
    this.dragStartPosition = null;
    this.touchStartPos = null;
    this.hasDragged = false;
  }
  
  /**
   * 设置移动端触摸事件监听
   */
  private setupMobileTouchListeners(): void {
    // 移动端卡片列表（非全屏）使用passive模式，提升滚动性能
    const isCardList = this.config.isMobile && !this.config.isFullscreen;
    
    // 保存事件处理器引用，以便销毁时清理
    this.touchStartHandler = (e: TouchEvent) => {
      this.handleTouchStart(e);
    };
    this.touchMoveHandler = (e: TouchEvent) => {
      this.handleTouchMove(e);
    };
    this.touchEndHandler = (e: TouchEvent) => {
      this.handleTouchEnd(e);
    };

    // 触摸开始处理器 - 卡片列表使用passive提升性能
    this.container.addEventListener('touchstart', this.touchStartHandler, { passive: isCardList });
    
    // 触摸移动处理器 - 卡片列表使用passive提升性能
    this.container.addEventListener('touchmove', this.touchMoveHandler, { passive: isCardList });
    
    // 触摸结束处理器
    this.container.addEventListener('touchend', this.touchEndHandler);
  }
  
  /**
   * 切换十字线模式（移动端：1→2→3→1循环，跳过模式0）
   */
  private switchCrosshairMode(): void {
    const currentMode = this.mode;
    let nextMode: CrosshairMode;
    
    // 移动端：1→2→3→1循环（跳过模式0）
    if (this.config.isMobile) {
      if (currentMode === 1) {
        nextMode = 2; // 自由 → 吸附
      } else if (currentMode === 2) {
        nextMode = 3; // 吸附 → 双十字线
      } else {
        nextMode = 1; // 双十字线 → 自由
      }
    } else {
      // 桌面端：使用原有的切换逻辑（0→1→2→3→0）
      nextMode = this.getNextMode(currentMode);
    }
    
    // 更新全局store
    const store = useAppStore.getState();
    store.setCrosshairMode(nextMode);
    
    // 同步本地config
    this.config.crosshairMode = nextMode;
    
    // 如果当前有十字线，需要在新模式中重新创建
    if (this.hasCrosshair()) {
      const currentPos = this.crosshairs[0]?.position;
      if (currentPos) {
        // 清除现有十字线
        this.clearAllCrosshairs();
        
        // 根据新模式创建十字线
        this.createCrosshairsByMode(currentPos);
        
        // 确保状态通知（createCrosshairsByMode 中的 createCrosshair 会触发，但这里确保一下）
        this.notifyCrosshairStateChange();
        
        this.render();
        
        // 更新数据
        const activeCrosshair = this.crosshairs[this.activeCrosshairIndex];
        if (activeCrosshair?.dataPoint) {
          this.updateData(activeCrosshair.dataPoint);
        }
      }
    } else {
      // 如果没有十字线，确保状态正确（可能从有十字线切换到无十字线模式）
      this.notifyCrosshairStateChange();
    }
    // 如果没有十字线，只更新模式，不创建十字线（等待用户单击进入）
  }
  
  /**
   * 检查是否为单击（触摸时间短且移动距离小）
   */
  private checkIsClick(): boolean {
    if (!this.touchStartPos) return false;
    const timeDiff = Date.now() - this.touchStartTime;
    return timeDiff < this.touchStartTimeThreshold && !this.hasDragged;
  }

  /**
   * 拖动时更新吸附十字线位置
   */
  private updateSnapCrosshairOnDrag(crosshair: Crosshair, clamped: PixelPoint): void {
    const currentMode = this.mode;
    if (currentMode !== 2 && currentMode !== 3) {
      return;
    }

    if (crosshair.type === 'free' && currentMode === 3) {
      // 双十字线模式：拖动自由十字线时，同时更新吸附十字线
      const snappedPos = this.findSnappedPosition(clamped);
      if (snappedPos && this.snapCrosshairId) {
        const snapCrosshair = this.crosshairs.find(c => c.id === this.snapCrosshairId);
        if (snapCrosshair && !snapCrosshair.locked) {
          snapCrosshair.position = snappedPos;
          snapCrosshair.dataPoint = this.pixelToData(snappedPos);
        }
      }
    } else if (crosshair.type === 'snap') {
      // 拖动吸附十字线时，重新计算吸附位置
      const snappedPos = this.findSnappedPosition(clamped);
      if (snappedPos) {
        crosshair.position = snappedPos;
        crosshair.dataPoint = this.pixelToData(snappedPos);
      }
    }
  }

  /**
   * 计算两点之间的距离
   */
  private calculateDistance(p1: PixelPoint, p2: PixelPoint): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * 查找最近的十字线
   * @param position 目标位置
   * @param maxDistance 最大搜索距离，默认50px
   * @returns 最近的十字线，如果不存在则返回null
   */
  private findNearestCrosshair(
    position: PixelPoint,
    maxDistance: number = CONSTANTS.CROSSHAIR_DRAG_RADIUS
  ): { crosshair: Crosshair; distance: number } | null {
    let nearestCrosshair: Crosshair | null = null;
    let minDistance = Infinity;

    for (const crosshair of this.crosshairs) {
      if (crosshair.locked) continue;
      const distance = this.calculateDistance(position, crosshair.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCrosshair = crosshair;
      }
    }

    if (nearestCrosshair && minDistance < maxDistance) {
      return { crosshair: nearestCrosshair, distance: minDistance };
    }

    return null;
  }

  /**
   * 检查位置是否在十字线附近
   */
  private isNearCrosshair(position: PixelPoint, radius: number = CONSTANTS.CROSSHAIR_CLICK_RADIUS): boolean {
    return this.findNearestCrosshair(position, radius) !== null;
  }
  
  /**
   * 清除所有十字线状态（内部使用）
   */
  private clearAllCrosshairs(): void {
    this.crosshairs = [];
    this.freeCrosshairId = null;
    this.snapCrosshairId = null;
    this.activeCrosshairIndex = -1;
    this.draggingCrosshairId = null;
    this.dragStartPosition = null;
  }

  /**
   * 公共方法：清除十字线（用于鼠标快速移出时）
   */
  clearCrosshair(): void {
    if (this.crosshairs.length === 0) return;
    
    const hadCrosshair = this.hasCrosshair();
    this.clearAllCrosshairs();
    
    if (hadCrosshair) {
      this.notifyCrosshairStateChange();
      // 广播十字线消失（用于联动同步）
      this.updateData(null);
    }
    this.render();
  }

  /**
   * 根据模式创建十字线
   */
  private createCrosshairsByMode(position: PixelPoint): void {
    const currentMode = this.mode;
    
    switch (currentMode) {
      case 1: // 自由模式
        this.freeCrosshairId = this.createCrosshair('free', position);
        break;
      case 2: // 吸附模式
        const snappedPos2 = this.findSnappedPosition(position) || position;
        this.snapCrosshairId = this.createCrosshair('snap', snappedPos2);
        break;
      case 3: // 双十字线模式
        this.freeCrosshairId = this.createCrosshair('free', position);
        const snappedPos3 = this.findSnappedPosition(position) || position;
        this.snapCrosshairId = this.createCrosshair('snap', snappedPos3);
        break;
    }
  }

  /**
   * 进入十字线模式
   * @param x 点击位置X坐标
   * @param y 点击位置Y坐标
   */
  private enterCrosshairMode(x: number, y: number): void {
    const clamped = this.clampToValidArea(x, y);
    if (!clamped) {
      return;
    }
    
    // 清除所有现有十字线
    this.clearAllCrosshairs();
    
    // 根据当前模式创建十字线
    this.createCrosshairsByMode(clamped);
    
    // 更新十字线数据
    const activeCrosshair = this.crosshairs[this.activeCrosshairIndex];
    if (activeCrosshair?.dataPoint) {
      this.render();
      this.updateData(activeCrosshair.dataPoint);
    }
    
    // 设置激活状态
    this.isCrosshairActive = true;
    
    // 移动端：如果用户还在按住屏幕，启动拖动模式
    if (this.config.isMobile && this.touchStartPos) {
      const nearest = this.findNearestCrosshair(clamped);
      if (nearest) {
        this.dragStartPosition = clamped;
        this.draggingCrosshairId = nearest.crosshair.id;
        this.activeCrosshairIndex = this.crosshairs.indexOf(nearest.crosshair);
      }
    }
    
    // 通知状态变化（锁定K线区域）
    this.notifyCrosshairStateChange();
  }
  
  /**
   * 退出十字线模式
   */
  private exitCrosshairMode(): void {
    // 清除所有十字线
    this.clearAllCrosshairs();
    
    // 设置未激活状态
    this.isCrosshairActive = false;
    
    // 通知状态变化（解锁K线区域）
    this.notifyCrosshairStateChange();
    
    // 广播十字线消失（用于联动同步）
    this.updateData(null);
    
    // 重新渲染（清除画布）
    this.render();
  }
  
  /**
   * 初始化 Hammer.js 手势识别
   */
  private initHammer(container: HTMLElement): void {
    this.hammer = new Hammer(container, {
      recognizers: [
        // 拖动识别器（优先级高于点击）
        [Hammer.Pan, { threshold: 5, direction: Hammer.DIRECTION_ALL }],
        // 双击识别器（用于桌面端切换十字线模式）
        [Hammer.Tap, { event: 'doubletap', taps: 2, interval: 300, time: 300 }]
      ]
    });
    
    // 设置识别器优先级：拖动优先于双击
    // doubletap 只有在 pan 失败时才会触发（即没有拖动时）
    this.hammer.get('doubletap').requireFailure('pan');
    
    // 拖动开始
    this.hammer.on('panstart', () => {
      this.isDragging = true;
    });
    
    // 拖动结束
    this.hammer.on('panend', () => {
      this.isDragging = false;
    });
    
    // 拖动取消
    this.hammer.on('pancancel', () => {
      this.isDragging = false;
    });
    
    // 监听双击事件（Hammer.js识别，能正确区分与拖动）
    this.hammer.on('doubletap', (e: HammerInput) => {
      // 桌面端使用 Hammer 的 doubletap 切换模式；移动端的双击由触摸结束事件自行识别
      if (!this.config.isMobile) {
        this.handleSingleTap(e);
      }
    });
  }
  
  /**
   * 处理双击事件（Hammer.js识别的 doubletap）
   * 桌面端：切换十字线模式（全局）
   * 移动端：进入/退出十字线模式
   * 
   * 交互优先级：
   * 1. 双击在绘图/端点上 → 不切换模式/不进入十字线（由DrawingLayer处理）
   * 2. 双击在十字线上 → 不切换模式/不额外处理（允许拖动）
   * 3. 双击空白区域 → 桌面端切换十字线模式；移动端进入/退出十字线
   */
  private handleSingleTap(e: HammerInput): void {
    if (!this.config.klineBounds || !this.config.volumeBounds) {
      return;
    }

    // 检查事件目标是否在当前容器的范围内
    const containerRect = this.container.getBoundingClientRect();
    const tapX = e.center.x;
    const tapY = e.center.y;

    // 如果点击不在当前容器的范围内，不处理（避免影响其他卡片）
    if (
      tapX < containerRect.left ||
      tapX > containerRect.right ||
      tapY < containerRect.top ||
      tapY > containerRect.bottom
    ) {
      return;
    }

    // 获取点击位置（相对于canvas）
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = tapX - rect.left;
    const canvasY = tapY - rect.top;

    // 检查是否在有效区域内
    const isInValidArea = this.isPointInValidArea(canvasX, canvasY);
    if (!isInValidArea) {
      return;
    }

    // 检查是否在画线模式（DrawingLayer是否激活了工具）
    // 如果DrawingLayer处于画线模式，则不触发十字线操作
    const isDrawingMode = this.isDrawingModeActive();
    if (isDrawingMode) {
      return; // 画线模式下，不触发十字线操作
    }

    // 右侧 15% 留给“跳转最新”的 doubletap（在 setupChartEvents 中处理）
    const isRightEdge = canvasX >= rect.width * 0.85;
    if (isRightEdge) {
      return;
    }

    // 检查是否点击在十字线附近，如果是则不额外处理（允许拖动）
    const touchPos: PixelPoint = { x: canvasX, y: canvasY };
    if (this.isNearCrosshair(touchPos, CONSTANTS.CROSSHAIR_CLICK_RADIUS)) {
      return;
    }

    if (this.config.isMobile) {
      // 移动端：doubletap 进入/退出十字线模式
      if (this.hasCrosshair()) {
        this.exitCrosshairMode();
      } else {
        this.enterCrosshairMode(canvasX, canvasY);
      }
    } else {
      // 桌面端：doubletap 切换十字线模式（全局）
      this.switchMode();
    }
  }

  /**
   * 检查是否处于画线模式
   * 通过检查DrawingLayer的canvas是否启用了事件处理（pointerEvents = 'auto'）
   * 
   * 画线模式：DrawingLayer的canvas的pointerEvents为'auto'
   * 非画线模式：DrawingLayer的canvas的pointerEvents为'none'
   */
  private isDrawingModeActive(): boolean {
    if (!this.container) {
      return false;
    }
    
    // 查找所有DrawingLayer的canvas（zIndex = 150）
    const allCanvases = this.container.querySelectorAll('canvas');
    for (const canvas of allCanvases) {
      // 跳过自己的canvas
      if (canvas === this.canvas) {
        continue;
      }
      
      // 检查是否是DrawingLayer的canvas（通过zIndex判断）
      const canvasStyle = window.getComputedStyle(canvas);
      const zIndex = parseInt(canvasStyle.zIndex || '0', 10);
      
      // DrawingLayer的zIndex是150
      if (zIndex === 150) {
        // 检查canvas的pointerEvents属性
        // 如果为'auto'，说明处于画线模式
        const pointerEvents = canvasStyle.pointerEvents;
        if (pointerEvents === 'auto') {
          return true; // 画线模式激活
        }
      }
    }
    
    return false; // 非画线模式
  }

  /**
   * 更新所有自由十字线的颜色以匹配当前主题
   */
  private updateCrosshairColors(): void {
    this.crosshairs.forEach(crosshair => {
      if (crosshair.type === 'free') {
        crosshair.color = this.getFreeCrosshairColor();
      }
      // snap 类型的颜色是固定的，不需要更新
    });
  }

  /**
   * 更新配置
   * 仅在模式真正变化且不在切换过程中时重新应用模式
   */
  updateConfig(config: Partial<CrosshairLayerConfig>): void {
    const oldMode = this.config.crosshairMode;
    const oldTheme = this.config.theme;
    this.config = { ...this.config, ...config };
    
    // 模式变化且不在切换过程中，重新应用
    if (
      config.crosshairMode !== undefined &&
      config.crosshairMode !== oldMode &&
      !CrosshairLayer.globalSwitchLock
    ) {
      this.applyMode();
    }
    
    // 主题变化时，更新所有十字线的颜色并重新渲染
    if (config.theme !== undefined && config.theme !== oldTheme) {
      this.updateCrosshairColors();
      this.render();
    }
    
    // 数据更新时重新渲染
    if (config.klineData) {
      this.render();
    }
  }
  
  destroy(): void {
    // 清空所有十字线
    this.crosshairs = [];
    this.freeCrosshairId = null;
    this.snapCrosshairId = null;
    
    // 重置拖动状态
    this.draggingCrosshairId = null;
    this.dragStartPosition = null;
    this.hasDragged = false;
    this.touchStartPos = null;
    this.touchStartTime = 0;
    
    // 清理 Hammer.js 实例
    if (this.hammer) {
      this.hammer.destroy();
      this.hammer = null;
    }
    
    // 移除全局十字线模式切换监听器
    if ((this as any)._modeChangeHandler) {
      window.removeEventListener('crosshairModeChanged', (this as any)._modeChangeHandler);
      (this as any)._modeChangeHandler = null;
    }
    
    // 移动端：清理触摸事件监听器，防止事件泄漏
    if (this.touchStartHandler) {
      this.container.removeEventListener('touchstart', this.touchStartHandler);
      this.touchStartHandler = null;
    }
    if (this.touchMoveHandler) {
      this.container.removeEventListener('touchmove', this.touchMoveHandler);
      this.touchMoveHandler = null;
    }
    if (this.touchEndHandler) {
      this.container.removeEventListener('touchend', this.touchEndHandler);
      this.touchEndHandler = null;
    }
    
    // 清空canvas
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
    
    super.destroy();
  }

// ...
  createCrosshair(type: 'free' | 'snap' = 'free', position?: PixelPoint): string {
    const id = `crosshair-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const pixelPos = position || this.getDefaultPosition();
    
    // 移除同类型的旧实例，确保同一类型最多只有一根十字线
    if (type === 'free' && this.freeCrosshairId) {
      this.crosshairs = this.crosshairs.filter(c => c.id !== this.freeCrosshairId);
      this.freeCrosshairId = null;
    }
    if (type === 'snap' && this.snapCrosshairId) {
      this.crosshairs = this.crosshairs.filter(c => c.id !== this.snapCrosshairId);
      this.snapCrosshairId = null;
    }

    const crosshair: Crosshair = {
      id,
      type,
      position: pixelPos,
      dataPoint: this.pixelToData(pixelPos),
      locked: false,
      color: type === 'free' ? this.getFreeCrosshairColor() : CONSTANTS.SNAP_CROSSHAIR_COLOR
    };

    this.crosshairs.push(crosshair);
    this.activeCrosshairIndex = this.crosshairs.length - 1;
    
    // 保存ID引用
    if (type === 'free') {
      this.freeCrosshairId = id;
    } else if (type === 'snap') {
      this.snapCrosshairId = id;
    }
    
    // 通知十字线状态变化
    this.notifyCrosshairStateChange();
    
    // 立即渲染
    this.render();
    
    return id;
  }

  private getDefaultPosition(): PixelPoint {
    if (this.config.klineBounds) {
      return {
        x: (this.config.klineBounds.left + this.config.klineBounds.right) / 2,
        y: (this.config.klineBounds.top + this.config.klineBounds.bottom) / 2
      };
    }
    return { x: this.canvas.width / 2, y: this.canvas.height / 2 };
  }

  removeCrosshair(id: string): void {
    const index = this.crosshairs.findIndex(c => c.id === id);
    if (index > -1) {
      this.crosshairs.splice(index, 1);
      if (this.activeCrosshairIndex >= this.crosshairs.length) {
        this.activeCrosshairIndex = this.crosshairs.length - 1;
      }
      
      // 清理ID引用
      if (this.freeCrosshairId === id) {
        this.freeCrosshairId = null;
      }
      if (this.snapCrosshairId === id) {
        this.snapCrosshairId = null;
      }
      
      // 通知十字线状态变化
      this.notifyCrosshairStateChange();
      
      this.render();
    }
  }

  toggleLock(id: string): void {
    const crosshair = this.crosshairs.find(c => c.id === id);
    if (crosshair) {
      crosshair.locked = !crosshair.locked;
      crosshair.color = crosshair.locked
        ? CONSTANTS.LOCKED_CROSSHAIR_COLOR
        : crosshair.type === 'free'
        ? this.getDefaultFreeColor()
        : CONSTANTS.SNAP_CROSSHAIR_COLOR;
      this.render();
    }
  }

  switchActive(index: number): void {
    if (index >= 0 && index < this.crosshairs.length) {
      this.activeCrosshairIndex = index;
      this.render();
    }
  }

  // 全局切换锁（类级别，所有实例共享，防止并发切换）
  private static globalSwitchLock: boolean = false;
  private static switchLockTimer: number | null = null;
  private static readonly LOCK_DURATION = CONSTANTS.MODE_SWITCH_LOCK_DURATION;

  /**
   * 切换十字线模式（全局切换）
   * 模式：0=无, 1=自由, 2=吸附, 3=双十字线
   * 循环顺序：0 → 1 → 2 → 3 → 0
   * 
   * 使用全局锁确保多个卡片实例中只有一个执行切换操作
   * 移动端禁用模式切换，始终返回自由模式（模式1）
   */
  switchMode(): CrosshairMode {
    // 移动端禁用模式切换，始终返回自由模式（模式1）
    if (this.config.isMobile) {
      return 1;
    }
    
    // 检查全局锁，防止并发切换
    if (CrosshairLayer.globalSwitchLock) {
      return this.mode;
    }
    
    // 设置全局锁
    CrosshairLayer.globalSwitchLock = true;
    
    // 清除之前的定时器
    if (CrosshairLayer.switchLockTimer !== null) {
      clearTimeout(CrosshairLayer.switchLockTimer);
    }
    
    try {
      const store = useAppStore.getState();
      const currentMode = store.crosshairMode;
      
      // 验证并修复无效模式
      if (!this.isValidMode(currentMode)) {
        this.resetMode(store, 0);
        return 0;
      }
      
      // 计算下一个模式
      const newMode = this.getNextMode(currentMode);
      
      // 更新全局store
      store.setCrosshairMode(newMode);
      
      // 同步本地config
      this.config.crosshairMode = newMode;
      
      // 应用新模式
      this.applyMode();
      
      return newMode;
    } finally {
      // 延迟释放锁，确保所有useEffect完成更新
      CrosshairLayer.switchLockTimer = window.setTimeout(() => {
        CrosshairLayer.globalSwitchLock = false;
        CrosshairLayer.switchLockTimer = null;
      }, CrosshairLayer.LOCK_DURATION);
    }
  }

  /**
   * 验证模式是否有效
   */
  private isValidMode(mode: number): boolean {
    return Number.isInteger(mode) && mode >= 0 && mode <= 3;
  }

  /**
   * 计算下一个模式（循环）
   */
  private getNextMode(currentMode: CrosshairMode): CrosshairMode {
    return ((currentMode + 1) % 4) as CrosshairMode;
  }

  /**
   * 重置模式到指定值
   */
  private resetMode(store: ReturnType<typeof useAppStore.getState>, mode: CrosshairMode): void {
    // Invalid mode detected, resetting
    store.setCrosshairMode(mode);
    this.config.crosshairMode = mode;
    this.applyMode();
  }


  /**
   * 获取当前模式
   */
  getMode(): CrosshairMode {
    return this.mode;
  }

  /**
   * 检查是否有十字线
   */
  hasCrosshair(): boolean {
    return this.isCrosshairActive || this.crosshairs.length > 0;
  }

  /**
   * 通知十字线状态变化
   */
  private notifyCrosshairStateChange(): void {
    const hasCrosshair = this.hasCrosshair();
    
    // 移动端：根据十字线状态调整canvas事件策略
    if (this.config.isMobile) {
      this.updateCanvasPointerEvents(hasCrosshair);
    }
    
    // 通知外部组件状态变化
    this.config.onCrosshairStateChange?.(hasCrosshair);
  }
  
  /**
   * 更新canvas的pointerEvents设置
   */
  private updateCanvasPointerEvents(hasCrosshair: boolean): void {
    // 移动端列表页（非全屏）：始终保持 'none'，不影响工具栏按钮点击
    // 移动端全屏模式：根据十字线状态调整
    if (this.config.isMobile) {
      // 移动端非全屏模式：始终不拦截事件，让工具栏按钮能正常点击
      if (!this.config.isFullscreen) {
        this.canvas.style.pointerEvents = 'none';
        return;
      }
      // 移动端全屏模式：根据十字线状态调整
      const newValue = hasCrosshair ? 'auto' : 'none';
      this.canvas.style.pointerEvents = newValue;
      return;
    }

    // 桌面端：根据十字线是否存在决定是否拦截事件
    // 有十字线：拦截事件，锁定K线区域
    // 无十字线：事件穿透，允许ECharts缩放拖动
    const newValue = hasCrosshair ? 'auto' : 'none';
    this.canvas.style.pointerEvents = newValue;
  }

  /**
   * 应用当前模式
   * 清除所有十字线，新模式下的十字线将在鼠标移动时自动创建
   */
  private applyMode(): void {
    // 清除所有十字线状态
    this.crosshairs = [];
    this.freeCrosshairId = null;
    this.snapCrosshairId = null;
    this.activeCrosshairIndex = -1;
    this.draggingCrosshairId = null;
    this.isCrosshairActive = false; // 清除激活状态
    
    // 通知十字线状态变化
    this.notifyCrosshairStateChange();
    
    // 广播十字线消失（用于联动同步）
    this.updateData(null);
    
    // 重新渲染（清除画布）
    this.render();
  }

  render(): void {
    this.clear();

    if (!this.config.klineBounds || !this.config.volumeBounds || this.crosshairs.length === 0) {
      return;
    }

    const ctx = this.ctx;

    // 计算合并的有效区域（K线区+量能区）
    const validLeft = Math.min(this.config.klineBounds.left, this.config.volumeBounds.left);
    const validRight = Math.max(this.config.klineBounds.right, this.config.volumeBounds.right);
    const validTop = this.config.klineBounds.top;
    const validBottom = this.config.volumeBounds.bottom;

    // 启用高质量渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 根据模式过滤要显示的十字线
    let filteredCrosshairs = [...this.crosshairs];
    if (this.mode === 1) {
      // 自由模式：只显示自由十字线
      filteredCrosshairs = filteredCrosshairs.filter(c => c.type === 'free');
    } else if (this.mode === 2) {
      // 吸附模式：只显示吸附十字线
      filteredCrosshairs = filteredCrosshairs.filter(c => c.type === 'snap');
    } else if (this.mode === 3) {
      // 双十字线模式：显示所有十字线
      // 保持不变
    } else {
      // 模式0（无）：不显示任何十字线
      filteredCrosshairs = [];
    }

    if (filteredCrosshairs.length === 0) {
      return;
    }

    // 先绘制吸附十字线（在下），再绘制自由十字线（在上）
    // 按类型排序：snap在前（先绘制），free在后（后绘制，显示在上层）
    const sortedCrosshairs = filteredCrosshairs.sort((a, b) => {
      if (a.type === 'snap' && b.type === 'free') return -1;
      if (a.type === 'free' && b.type === 'snap') return 1;
      return 0;
    });

    // 第一阶段：绘制所有十字线
    sortedCrosshairs.forEach((crosshair, index) => {
      const isActive = index === this.activeCrosshairIndex;
      // 自由十字线和吸附十字线使用相同的线宽
      const isSnap = crosshair.type === 'snap';
      const lineWidth = 1.5; // 自由十字线和吸附线线宽一致
      const opacity = isSnap ? 0.8 : (isActive ? 0.9 : 0.7);

      ctx.strokeStyle = crosshair.color;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = opacity;
      ctx.lineCap = 'round'; // 圆角端点，更平滑
      ctx.lineJoin = 'round'; // 圆角连接，更平滑
      
      // 自由十字线和吸附十字线都使用实线
      ctx.setLineDash([]);

      // 绘制垂直线（只在有效区域内）
      if (crosshair.position.x >= validLeft && crosshair.position.x <= validRight) {
        ctx.beginPath();
        ctx.moveTo(crosshair.position.x, validTop);
        ctx.lineTo(crosshair.position.x, validBottom);
        ctx.stroke();
      }

      // 绘制水平线（跨越整个图表）
      if (crosshair.position.y >= validTop && crosshair.position.y <= validBottom) {
        ctx.beginPath();
        ctx.moveTo(validLeft, crosshair.position.y);
        ctx.lineTo(validRight, crosshair.position.y);
        ctx.stroke();
      }
    });

    // 重置渲染状态
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // 第二阶段：绘制所有标签（在所有十字线之上）
    sortedCrosshairs.forEach((crosshair) => {
      // 绘制x轴标签（日期）- 所有十字线类型都显示日期标签
      if (crosshair.dataPoint && this.config.klineBounds && this.config.volumeBounds) {
        const dateStr = this.formatDate(crosshair.dataPoint);
        if (dateStr) {
          // 获取标签样式配置（提前获取以计算labelHeight）
          const labelStyle = getLabelStyle(this.config.isMobile, this.config.isFullscreen);
          
          // 日期标签应该显示在K线区域和成交量区域之间的X轴刻度行上
          // 计算X轴刻度行的中心位置，并将标签垂直居中
          const xAxisAreaTop = this.config.klineBounds.bottom;
          const xAxisAreaBottom = this.config.volumeBounds.top;
          const xAxisAreaCenter = (xAxisAreaTop + xAxisAreaBottom) / 2;
          // labelY是标签背景的顶部位置，需要让标签在X轴区域垂直居中
          const labelY = xAxisAreaCenter - labelStyle.labelHeight / 2;
          
          // 测量文字宽度以确定背景宽度 - 尽可能小
          ctx.font = `${labelStyle.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
          ctx.textAlign = 'center';
          const textMetrics = ctx.measureText(dateStr);
          const labelWidth = textMetrics.width + labelStyle.padding * 2;
          
          // 获取容器边界，确保标签不超出容器
          const containerRect = this.container.getBoundingClientRect();
          const canvasRect = this.canvas.getBoundingClientRect();
          const containerLeft = containerRect.left - canvasRect.left;
          const containerRight = containerRect.right - canvasRect.left;
          
          // 计算标签位置：使用K线中心的X坐标，而不是十字线的实际X位置
          // 这样日期标签始终对齐到对应K线的中心
          const klineCenterPixel = this.coordinateSystem?.dataToPixel({
            index: crosshair.dataPoint.index,
            value: 0
          }, 0);
          let labelCenterX = klineCenterPixel?.x ?? crosshair.position.x;
          let labelLeftX = labelCenterX - labelWidth / 2;
          let labelRightX = labelCenterX + labelWidth / 2;
          
          // 如果标签左侧超出容器，向右调整
          if (labelLeftX < containerLeft) {
            labelLeftX = containerLeft;
            labelCenterX = labelLeftX + labelWidth / 2;
            labelRightX = labelLeftX + labelWidth;
          }
          
          // 如果标签右侧超出容器，向左调整
          if (labelRightX > containerRight) {
            labelRightX = containerRight;
            labelCenterX = labelRightX - labelWidth / 2;
            labelLeftX = labelRightX - labelWidth;
          }
          
          // 确保标签至少完全可见（如果标签宽度大于容器宽度，则居中显示）
          if (labelWidth > (containerRight - containerLeft)) {
            labelCenterX = (containerLeft + containerRight) / 2;
            labelLeftX = labelCenterX - labelWidth / 2;
            labelRightX = labelCenterX + labelWidth / 2;
          }
          
          // 背景 - 使用半透明深色背景，更现代
          ctx.fillStyle = 'rgba(106, 121, 133, 0.95)';
          this.drawRoundedRect(ctx, labelLeftX, labelY, labelWidth, labelStyle.labelHeight, labelStyle.borderRadius);
          ctx.fill();
          
          // 边框 - 更细的边框
          ctx.strokeStyle = 'rgba(106, 121, 133, 1)';
          ctx.lineWidth = 0.5;
          this.drawRoundedRect(ctx, labelLeftX, labelY, labelWidth, labelStyle.labelHeight, labelStyle.borderRadius);
          ctx.stroke();
          
          // 文字 - 优化字体和颜色
          ctx.fillStyle = '#ffffff';
          ctx.font = `${labelStyle.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dateStr, labelCenterX, labelY + labelStyle.labelHeight / 2);
        }
      }

      // 绘制y轴标签（价格/数值）- 根据y坐标所在区域显示对应的数值
      if (crosshair.position.x >= validLeft && crosshair.position.x <= validRight && this.config.klineBounds) {
        const labelY = crosshair.position.y;
        
        // 判断y坐标在哪个区域，获取对应区域的数值
        let valueStr = '';
        
        if (labelY >= this.config.klineBounds.top && labelY <= this.config.klineBounds.bottom) {
          // 在K线区域，显示价格
          const klineDataPoint = this.coordinateSystem?.pixelToData(crosshair.position, 0);
          if (klineDataPoint) {
            valueStr = this.formatValue(klineDataPoint.value);
          }
        } else if (this.config.volumeBounds && labelY >= this.config.volumeBounds.top && labelY <= this.config.volumeBounds.bottom) {
          // 在量能区域，显示量能数值
          const volumeDataPoint = this.coordinateSystem?.pixelToData(crosshair.position, 1);
          if (volumeDataPoint) {
            valueStr = this.formatValue(volumeDataPoint.value);
          }
        }
        
        // 如果没有获取到有效数值，跳过标签绘制
        if (!valueStr) {
          return;
        }
        
        // 获取标签样式配置
        const labelStyle = getLabelStyle(this.config.isMobile, this.config.isFullscreen);
        
        // 测量文字宽度以确定背景宽度 - 尽可能小
        ctx.font = `${labelStyle.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'right';
        const textMetrics = ctx.measureText(valueStr);
        const labelWidth = textMetrics.width + labelStyle.padding * 2; // 移除最小宽度限制，仅根据文字宽度
        
        // 标签显示在坐标轴内侧（右侧）
        // validLeft 是坐标轴的右边界，标签应该在右侧（图表区域内）
        const spacing = labelStyle.spacing;
        let labelRightX = validLeft + spacing; // 标签右边缘位置（在坐标轴内侧）
        let labelLeftX = labelRightX - labelWidth; // 标签左边缘位置
        
        // 获取容器边界，确保标签不被截断
        const containerRect = this.container.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerLeft = containerRect.left - canvasRect.left;
        const containerTop = containerRect.top - canvasRect.top;
        const containerRight = containerRect.right - canvasRect.left;
        const containerBottom = containerRect.bottom - canvasRect.top;
        
        // 检查标签是否会被容器边界截断
        // 如果标签左边缘超出容器左边界，调整标签位置
        if (labelLeftX < containerLeft) {
          labelLeftX = containerLeft + 2; // 留2px边距
          labelRightX = labelLeftX + labelWidth;
        }
        
        // 检查标签是否会被容器上下边界截断
        const labelTop = labelY - labelStyle.labelHeight / 2;
        const labelBottom = labelY + labelStyle.labelHeight / 2;
        
        // 如果标签超出容器边界，不绘制标签（避免被截断）
        if (labelTop < containerTop || labelBottom > containerBottom) {
          // 标签超出容器边界，跳过绘制
          return;
        }
        
        // 确保标签完全在可见区域内
        if (labelLeftX < containerLeft || labelRightX > containerRight) {
          // 标签超出容器边界，跳过绘制
          return;
        }
        
        // 背景 - 使用半透明深色背景，更现代
        ctx.fillStyle = 'rgba(106, 121, 133, 0.95)';
        this.drawRoundedRect(ctx, labelLeftX, labelY - labelStyle.labelHeight / 2, labelWidth, labelStyle.labelHeight, labelStyle.borderRadius);
        ctx.fill();
        
        // 边框 - 更细的边框
        ctx.strokeStyle = 'rgba(106, 121, 133, 1)';
        ctx.lineWidth = 0.5;
        this.drawRoundedRect(ctx, labelLeftX, labelY - labelStyle.labelHeight / 2, labelWidth, labelStyle.labelHeight, labelStyle.borderRadius);
        ctx.stroke();
        
        // 文字 - 优化字体和颜色
        ctx.fillStyle = '#ffffff';
        ctx.font = `${labelStyle.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(valueStr, labelRightX - labelStyle.padding, labelY);
      }
    });
  }

  handleEvent(event: ChartEvent): boolean {
    // 移动端：完全忽略 mouse 事件，只处理 touch 事件（在 setupMobileTouchListeners 中）
    // 避免触摸后浏览器自动合成的 mousemove 事件干扰十字线状态
    if (this.config.isMobile && (event.type === 'mousemove' || event.type === 'mousedown' || event.type === 'mouseup')) {
      return false;
    }
    
    // 如果没有bounds，不处理事件
    if (!this.config.klineBounds || !this.config.volumeBounds) {
      return false;
    }

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // 只处理在有效区域内的事件
    const isInValidArea = this.isPointInValidArea(canvasX, canvasY);
    
    if (!isInValidArea && event.type !== 'mouseup' && event.type !== 'touchend') {
      // 如果鼠标移出有效区域，隐藏十字线（桌面端）
      if (event.type === 'mousemove' && this.crosshairs.length > 0) {
        const activeCrosshair = this.crosshairs[this.activeCrosshairIndex];
        if (activeCrosshair && !activeCrosshair.locked) {
          const hadCrosshair = this.hasCrosshair();
          this.crosshairs = []; // 清除所有十字线
          this.activeCrosshairIndex = -1;
          this.freeCrosshairId = null;
          this.snapCrosshairId = null;
          // 通知十字线状态变化
          if (hadCrosshair) {
            this.notifyCrosshairStateChange();
            // 广播十字线消失（用于联动同步）
            this.updateData(null);
          }
          this.render();
        }
      }
        return false; // 不阻止ECharts交互
    }

    // 注意：移动端触摸事件已在 canvas 上直接监听（setupMobileTouchListeners），这里只处理桌面端事件

    // 桌面端鼠标按下：检查是否点击在十字线上
    if (event.type === 'mousedown') {
      if (this.mode === 0) {
        return false;
      }

      const clickedCrosshair = this.crosshairs.find((c) => {
        const distance = Math.sqrt(
          Math.pow(canvasX - c.position.x, 2) + Math.pow(canvasY - c.position.y, 2)
        );
        return distance < 10; // 10px点击区域
      });

      if (clickedCrosshair && !clickedCrosshair.locked) {
        this.draggingCrosshairId = clickedCrosshair.id;
        this.dragStartPosition = { x: canvasX, y: canvasY };
        this.activeCrosshairIndex = this.crosshairs.indexOf(clickedCrosshair);
        return false; // 桌面端不阻止默认行为
      }
      
      return false;
    } else if ((event.type === 'mousemove') && this.draggingCrosshairId) {
      // 桌面端拖动十字线
      const crosshair = this.crosshairs.find(c => c.id === this.draggingCrosshairId);
      if (crosshair && !crosshair.locked) {
        const clamped = this.clampToValidArea(canvasX, canvasY);
        if (clamped) {
          crosshair.position = clamped;
          crosshair.dataPoint = this.pixelToData(clamped);
          this.render();
          this.updateData(crosshair.dataPoint);
        }
        return false; // 桌面端不阻止默认行为，允许拖动缩放
      } else {
        // 如果找不到十字线或被锁定，清除拖动状态
      this.draggingCrosshairId = null;
      this.dragStartPosition = null;
      return false;
      }
    } else if (event.type === 'mouseup') {
      // 移动端 touchend 已在 canvas 上直接处理
      this.draggingCrosshairId = null;
      this.dragStartPosition = null;
    } else if (event.type === 'mousemove') {
      // 桌面端鼠标移动：处理非拖动状态的鼠标移动
      if (this.draggingCrosshairId) {
        return false; // 拖动中，已在上面的分支处理
      }
      
      // 如果模式为0（无），清除所有十字线并返回
      if (this.mode === 0) {
        if (this.crosshairs.length > 0) {
          this.removeTemporaryCrosshairs();
        }
        return false;
      }

      const clamped = this.clampToValidArea(canvasX, canvasY);
      
      if (clamped) {
        // 桌面端根据模式处理
        if (this.mode === 1) {
          // 自由模式：只显示自由十字线
          this.updateOrCreateFreeCrosshair(clamped);
        } else if (this.mode === 2) {
          // 吸附模式：只显示吸附十字线
          this.updateOrCreateSnapCrosshair(clamped);
        } else if (this.mode === 3) {
          // 双十字线模式：同时更新自由十字线和吸附十字线
          this.updateOrCreateFreeCrosshair(clamped);
          this.updateOrCreateSnapCrosshair(clamped);
        }
        
        this.render();
        
        // 使用吸附十字线的数据更新（优先），如果没有则使用自由十字线
        const snapCrosshair = this.snapCrosshairId ? this.crosshairs.find(c => c.id === this.snapCrosshairId) : null;
        if (snapCrosshair && snapCrosshair.dataPoint) {
          this.updateData(snapCrosshair.dataPoint);
        } else {
          const freeCrosshair = this.freeCrosshairId ? this.crosshairs.find(c => c.id === this.freeCrosshairId) : null;
          if (freeCrosshair && freeCrosshair.dataPoint) {
            this.updateData(freeCrosshair.dataPoint);
          }
        }
        
        return false; // 不阻止默认行为，允许ECharts交互
      } else {
        // 移出有效区域，清除临时十字线（但保留固定的）
        this.removeTemporaryCrosshairs();
      }
      return false; // 始终不阻止默认行为，让ECharts可以缩放
    }

    return false;
  }

  private isPointInValidArea(x: number, y: number): boolean {
    if (!this.config.klineBounds || !this.config.volumeBounds) return false;

    return (
      (x >= this.config.klineBounds.left && x <= this.config.klineBounds.right &&
       y >= this.config.klineBounds.top && y <= this.config.klineBounds.bottom) ||
      (x >= this.config.volumeBounds.left && x <= this.config.volumeBounds.right &&
       y >= this.config.volumeBounds.top && y <= this.config.volumeBounds.bottom)
    );
  }

  private clampToValidArea(x: number, y: number): PixelPoint | null {
    if (!this.config.klineBounds || !this.config.volumeBounds) return null;

    // 检查K线区域
    if (
      x >= this.config.klineBounds.left &&
      x <= this.config.klineBounds.right &&
      y >= this.config.klineBounds.top &&
      y <= this.config.klineBounds.bottom
    ) {
      return {
        x: Math.max(this.config.klineBounds.left, Math.min(x, this.config.klineBounds.right)),
        y: Math.max(this.config.klineBounds.top, Math.min(y, this.config.klineBounds.bottom))
      };
    }

    // 检查量能区域
    if (
      x >= this.config.volumeBounds.left &&
      x <= this.config.volumeBounds.right &&
      y >= this.config.volumeBounds.top &&
      y <= this.config.volumeBounds.bottom
    ) {
      return {
        x: Math.max(this.config.volumeBounds.left, Math.min(x, this.config.volumeBounds.right)),
        y: Math.max(this.config.volumeBounds.top, Math.min(y, this.config.volumeBounds.bottom))
      };
    }

    return null;
  }

  private pixelToData(pixel: PixelPoint): DataPoint | null {
    if (!this.coordinateSystem || !this.config.klineData.length) {
      return null;
    }

    // 尝试K线区域
    let dataPoint = this.coordinateSystem.pixelToData(pixel, 0);
    if (dataPoint && dataPoint.index >= 0 && dataPoint.index < this.config.klineData.length) {
      return dataPoint;
    }

    // 尝试量能区域
    dataPoint = this.coordinateSystem.pixelToData(pixel, 1);
    if (dataPoint && dataPoint.index >= 0 && dataPoint.index < this.config.klineData.length) {
      return dataPoint;
    }

    return null;
  }

  /**
   * 更新或创建自由十字线（跟随鼠标）
   */
  private updateOrCreateFreeCrosshair(position: PixelPoint): void {
    // 清理孤儿自由十字线，保留当前有效的实例
    this.crosshairs = this.crosshairs.filter(c => 
      c.type !== 'free' || c.id === this.freeCrosshairId
    );
    
    if (this.freeCrosshairId) {
      const freeCrosshair = this.crosshairs.find(c => c.id === this.freeCrosshairId);
      if (freeCrosshair && !freeCrosshair.locked) {
        freeCrosshair.position = position;
        freeCrosshair.dataPoint = this.pixelToData(position);
        return;
      }
    }
    
    // 创建新的自由十字线
    this.freeCrosshairId = this.createCrosshair('free', position);
  }

  /**
   * 更新或创建吸附十字线（吸附到K线关键点）
   */
  private updateOrCreateSnapCrosshair(position: PixelPoint): void {
    if (!this.config.klineBounds || !this.config.klineData.length) return;
    
    // 清理孤儿吸附十字线，保留当前有效的实例
    this.crosshairs = this.crosshairs.filter(c => 
      c.type !== 'snap' || c.id === this.snapCrosshairId
    );
    
    // 计算吸附位置（吸附到最近的K线OHLC关键点）
    const snappedPosition = this.findSnappedPosition(position);
    if (!snappedPosition) return;
    
    if (this.snapCrosshairId) {
      const snapCrosshair = this.crosshairs.find(c => c.id === this.snapCrosshairId);
      if (snapCrosshair && !snapCrosshair.locked) {
        snapCrosshair.position = snappedPosition;
        snapCrosshair.dataPoint = this.pixelToData(snappedPosition);
        return;
      }
    }
    
    // 创建新的吸附十字线
    this.snapCrosshairId = this.createCrosshair('snap', snappedPosition);
  }

  /**
   * 智能吸附算法：吸附到K线OHLC关键点
   * 基于鼠标X坐标确定K线，然后找到距离鼠标Y最近的OHLC价格点
   */
  private findSnappedPosition(position: PixelPoint): PixelPoint | null {
    if (!this.config.klineBounds || !this.config.klineData.length || !this.coordinateSystem) {
      return null;
    }

    // 根据鼠标X坐标确定对应的K线索引
    const targetKlineIndex = this.getKlineIndexFromX(position.x);
    if (targetKlineIndex === -1) return null;
    
    const klineItem = this.config.klineData[targetKlineIndex];
    if (!klineItem) return null;

    // 获取所有OHLC价格点
    const ohlcPoints = [
      { price: klineItem.high, type: 'high' },
      { price: klineItem.low, type: 'low' },
      { price: klineItem.open, type: 'open' },
      { price: klineItem.close, type: 'close' }
    ].filter(item => typeof item.price === 'number' && !isNaN(item.price));

    if (ohlcPoints.length === 0) return null;

    // 找到距离鼠标Y坐标最近的OHLC价格点
    let bestPoint: PixelPoint | null = null;
    let minDistance = Infinity;

    for (const { price } of ohlcPoints) {
      const pixelPos = this.coordinateSystem.dataToPixel({
        index: targetKlineIndex,
        value: price
      }, 0);
      
      if (pixelPos) {
        const distY = Math.abs(position.y - pixelPos.y);
        if (distY < minDistance) {
          minDistance = distY;
          bestPoint = pixelPos;
        }
      }
    }

    return bestPoint;
  }

  /**
   * 根据鼠标X坐标获取对应的K线索引
   */
  private getKlineIndexFromX(mouseX: number): number {
    if (!this.config.klineData.length) return -1;
    
    // 通过坐标转换获取数据索引
    const dataPoint = this.pixelToData({ x: mouseX, y: 0 });
    if (!dataPoint) return -1;
    
    // 取整获取K线柱索引
    const index = Math.round(dataPoint.index);
    
    // 确保索引在有效范围内
    if (index < 0 || index >= this.config.klineData.length) return -1;
    
    return index;
  }

  /**
   * 移除临时十字线（自由和吸附），保留固定的
   */
  private removeTemporaryCrosshairs(): void {
    const hadCrosshair = this.hasCrosshair();
    let removed = false;
    
    // 移除自由十字线（如果不是固定的）
    if (this.freeCrosshairId) {
      const freeCrosshair = this.crosshairs.find(c => c.id === this.freeCrosshairId);
      if (freeCrosshair && !freeCrosshair.locked) {
        const index = this.crosshairs.findIndex(c => c.id === this.freeCrosshairId);
        if (index > -1) {
          this.crosshairs.splice(index, 1);
          removed = true;
        }
        if (this.activeCrosshairIndex >= this.crosshairs.length) {
          this.activeCrosshairIndex = this.crosshairs.length - 1;
        }
        this.freeCrosshairId = null;
      }
    }
    
    // 移除吸附十字线（如果不是固定的）
    if (this.snapCrosshairId) {
      const snapCrosshair = this.crosshairs.find(c => c.id === this.snapCrosshairId);
      if (snapCrosshair && !snapCrosshair.locked) {
        const index = this.crosshairs.findIndex(c => c.id === this.snapCrosshairId);
        if (index > -1) {
          this.crosshairs.splice(index, 1);
          removed = true;
        }
        if (this.activeCrosshairIndex >= this.crosshairs.length) {
          this.activeCrosshairIndex = this.crosshairs.length - 1;
        }
        this.snapCrosshairId = null;
      }
    }
    
    // 如果状态发生变化，通知外部
    if (removed && hadCrosshair !== this.hasCrosshair()) {
      this.notifyCrosshairStateChange();
      // 广播十字线消失（用于联动同步）
      if (!this.hasCrosshair()) {
        this.updateData(null);
      }
    }
    
    if (removed) {
      this.render();
    }
  }

  private formatDate(dataPoint: DataPoint): string | null {
    if (!dataPoint.date && this.config.klineData[dataPoint.index]) {
      const klineItem = this.config.klineData[dataPoint.index];
      const date = klineItem.trade_date || '';
      if (date.length >= 8) {
        // 参考ECharts原本格式：yyyy/mm/dd
        const year = date.substring(0, 4);
        const month = date.substring(4, 6);
        const day = date.substring(6, 8);
        return `${year}/${month}/${day}`;
      }
      return date;
    }
    return dataPoint.date || null;
  }

  /**
   * 绘制圆角矩形
   */
  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private formatValue(value: number): string {
    // 使用统一的格式化函数
    if (Math.abs(value) >= 10000) {
      return formatLargeNumber(value, 1);
    }
    const rounded = Math.round(value * 100) / 100;
    if (rounded % 1 === 0) {
      return rounded.toString();
    }
    return rounded.toFixed(2);
  }

  private updateData(dataPoint: DataPoint | null): void {
    const klineItem = dataPoint ? this.config.klineData[dataPoint.index] : null;
    if (klineItem && this.config.onDataUpdate) {
      this.config.onDataUpdate(klineItem);
    }
    // 十字线位置变化回调（用于联动，传递交易日期）
    if (this.config.onCrosshairPositionChange) {
      this.config.onCrosshairPositionChange(klineItem?.trade_date ?? null);
    }
  }

  update(data: { klineData?: KLineData[] }) {
    if (data.klineData) {
      this.config.klineData = data.klineData;
      this.rebuildTradeDateIndexMap();
    }
    this.render();
  }
  
  /**
   * 重建日期索引映射（O(n)构建，O(1)查找）
   */
  private rebuildTradeDateIndexMap(): void {
    this.tradeDateIndexMap.clear();
    const klineData = this.config.klineData;
    for (let i = 0; i < klineData.length; i++) {
      this.tradeDateIndexMap.set(klineData[i].trade_date, i);
    }
  }

  /**
   * 从外部设置十字线位置（用于联动同步）
   * @param tradeDate 交易日期，null表示清除十字线
   */
  setPositionByDate(tradeDate: string | null): void {
    // 清除十字线
    if (tradeDate === null) {
      if (this.crosshairs.length > 0 || this.isCrosshairActive) {
        this.clearAllCrosshairs();
        this.isCrosshairActive = false; // 重置激活状态，解锁K线拖动/缩放
        this.render();
        this.notifyCrosshairStateChange();
      }
      return;
    }

    // 同步全局十字线模式
    const globalMode = useAppStore.getState().crosshairMode;
    if (this.mode !== globalMode) {
      this.config.crosshairMode = globalMode;
    }

    // 根据日期查找对应的数据索引（使用缓存Map，O(1)复杂度）
    const dataIndex = this.tradeDateIndexMap.get(tradeDate) ?? -1;
    if (dataIndex < 0) {
      // 找不到对应日期，清除十字线
      if (this.crosshairs.length > 0) {
        this.clearAllCrosshairs();
        this.render();
      }
      return;
    }

    // 获取该索引对应的像素位置
    const pixelPos = this.dataIndexToPixel(dataIndex);
    if (!pixelPos) return;

    // 清除并重建十字线
    this.clearAllCrosshairs();
    this.createCrosshairsByMode(pixelPos);
    this.render();

    // 更新显示数据（不触发位置回调，避免循环）
    if (this.config.onDataUpdate) {
      this.config.onDataUpdate(this.config.klineData[dataIndex] || null);
    }
  }

  /**
   * 将数据索引转换为像素位置（使用ECharts坐标系统，正确处理dataZoom）
   */
  private dataIndexToPixel(dataIndex: number): PixelPoint | null {
    if (!this.coordinateSystem || !this.config.klineBounds) return null;
    if (dataIndex < 0 || dataIndex >= this.config.klineData.length) return null;

    // 使用ECharts坐标系统转换，正确处理dataZoom状态
    const klineItem = this.config.klineData[dataIndex];
    if (!klineItem) return null;

    // 获取该K线的收盘价作为Y值参考
    const pixelPos = this.coordinateSystem.dataToPixel({
      index: dataIndex,
      value: klineItem.close
    }, 0);

    if (!pixelPos) return null;

    // 检查X坐标是否在可见区域内
    const { left, right } = this.config.klineBounds;
    if (pixelPos.x < left || pixelPos.x > right) {
      // 该日期不在当前可见区域内
      return null;
    }

    return pixelPos;
  }
}

