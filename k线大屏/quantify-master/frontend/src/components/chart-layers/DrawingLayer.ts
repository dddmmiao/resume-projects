/**
 * 画线层
 * 支持多种技术分析绘图工具
 * 
 * 重构后版本：使用模块化架构
 */
import { BaseLayer } from './BaseLayer.ts';
import { PixelPoint, DataPoint } from './types.ts';
import { CoordinateSystem } from './CoordinateSystem.ts';
import {
  DrawingToolType,
  Drawing,
  DrawingLayerConfig
} from './drawing/types.ts';
import { DrawingState } from './drawing/DrawingState.ts';
import { DrawingHistory } from './drawing/DrawingHistory.ts';
import { DrawingSnap } from './drawing/DrawingSnap.ts';
import { DrawingRender } from './drawing/DrawingRender.ts';
import { DrawingConfig } from './drawing/DrawingConfig.ts';
import {
  getTypeCycleByPoints,
  getRequiredPoints,
  getDefaultConfig,
  generateDrawingId
} from './drawing/utils/DrawingUtils.ts';

export class DrawingLayer extends BaseLayer {
  readonly zIndex = 150; // 在十字线层之上

  private config: DrawingLayerConfig;
  
  // 使用模块化的状态管理和服务
  private state: DrawingState;
  private history: DrawingHistory;
  private snap: DrawingSnap;
  private renderer: DrawingRender;
  
  // 当前鼠标位置（用于放大镜）
  private currentMousePoint: PixelPoint | null = null;
  
  // 画线模式状态（独立于activeTool，用于控制事件处理）
  private isDrawingMode: boolean = false;

  // 使用箭头函数绑定事件处理，避免 this 上下文问题
  private handleMouseDownBound = (e: MouseEvent | TouchEvent) => this.handleMouseDown(e);
  private handleMouseMoveBound = (e: MouseEvent | TouchEvent) => this.handleMouseMove(e);
  private handleMouseUpBound = (e: MouseEvent | TouchEvent) => this.handleMouseUp(e);
  private handleClickBound = (e: MouseEvent) => this.handleClick(e);
  private handleDoubleClickBound = (e: MouseEvent) => this.handleDoubleClick(e);
  private handleKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e);

  constructor(
    container: HTMLElement,
    coordinateSystem: CoordinateSystem,
    config: DrawingLayerConfig
  ) {
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;
    super(container, coordinateSystem, width, height);
    this.config = {
      enableDrawing: true,
      defaultColor: DrawingConfig.defaultColor,
      defaultLineWidth: DrawingConfig.defaultLineWidth,
      ...config,
    };
    
    // 初始化模块化服务
    this.state = new DrawingState();
    this.history = new DrawingHistory();
    this.snap = new DrawingSnap(
      coordinateSystem,
      config.klineData || [],
      config.klineBounds
    );
    this.renderer = new DrawingRender(
      coordinateSystem,
      config.klineBounds,
      config.isMobile
    );
    
    // 画线模式：启用事件处理（由 isDrawingMode 和 activeTool 共同控制）
    // 非画线模式：禁用事件处理，让十字线层 / ECharts 处理
    // 移动端：只有在真正进入画线模式时才打开 pointerEvents，避免影响 header / 其他按钮
    const initialPointerEvents = this.isDrawingMode ? 'auto' : 'none';
    this.canvas.style.pointerEvents = initialPointerEvents;
    this.canvas.style.cursor = 'default';
    
    this.initZIndex();
    this.setupEventListeners();
    this.setupKeyboardListeners();
    
    // 初始化历史记录（保存初始空状态）
    this.saveToHistory();
  }

  /**
   * 设置事件监听（支持鼠标和触摸事件）
   */
  private setupEventListeners(): void {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.handleMouseDownBound);
    this.canvas.addEventListener('mousemove', this.handleMouseMoveBound);
    this.canvas.addEventListener('mouseup', this.handleMouseUpBound);
    this.canvas.addEventListener('click', this.handleClickBound);
    this.canvas.addEventListener('dblclick', this.handleDoubleClickBound);
    
    // 触摸事件（移动端支持）
    this.canvas.addEventListener('touchstart', this.handleMouseDownBound, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleMouseMoveBound, { passive: false });
    this.canvas.addEventListener('touchend', this.handleMouseUpBound, { passive: false });
  }

  /**
   * 设置键盘事件监听
   */
  private setupKeyboardListeners(): void {
    // 监听全局键盘事件（绑定到document，确保在canvas失去焦点时也能响应）
    document.addEventListener('keydown', this.handleKeyDownBound);
  }

  /**
   * 设置画线模式（启用/禁用画线功能）
   * 在画线模式下，即使没有选择具体工具，也可以编辑已有线
   */
  setDrawingMode(enabled: boolean): void {
    const wasEnabled = this.isDrawingMode;
    this.isDrawingMode = enabled;
    
    // 更新事件处理状态
    // 移动端 / 桌面端统一：只有在画线模式时 pointerEvents 才为 'auto'
    const value = enabled ? 'auto' : 'none';
    this.canvas.style.pointerEvents = value;
    this.canvas.style.cursor = enabled ? 'default' : 'default';
    
    // 通知画线模式变化（用于控制十字线）
    // 进入画线模式时，即使没有选择工具，也通知关闭十字线
    // 退出画线模式时，通知恢复十字线
    if (enabled && !wasEnabled) {
      // 进入画线模式：通知关闭十字线（传入一个工具值表示进入画线模式）
      // 如果当前没有工具，传入一个默认工具值，稍后如果用户不选择工具，再传null
      const currentTool = this.state.getActiveTool();
      // 传入当前工具，如果为null则传入'segment'作为标记（表示进入画线模式但未选择工具）
      this.config.onToolChange?.(currentTool || 'segment' as any);
    } else if (!enabled && wasEnabled) {
      // 退出画线模式：通知恢复十字线
      this.config.onToolChange?.(null);
    }
    
    if (!enabled) {
      // 退出画线模式时，清除所有状态
      this.exitEditMode();
      this.state.clearSelection();
      this.state.setActiveTool(null);
    }
    
    this.render();
  }

  /**
   * 设置当前激活的工具
   * 
   * 画线模式（tool不为null）：
   * - 可以绘制、编辑、选择绘图
   * - 阻止十字线相关操作
   * 
   * 非画线模式（tool为null）：
   * - 不触发画线相关操作
   * - 允许十字线相关操作
   */
  setActiveTool(tool: DrawingToolType | null): void {
    this.state.setActiveTool(tool);
    
    // 更新光标样式
    this.canvas.style.cursor = tool ? 'crosshair' : 'default';
    
    // 切换工具时，退出编辑端点状态（但保持在画线模式）
    if (tool) {
      this.exitEditMode();
      // 选择了工具：通知关闭十字线（如果还没关闭）
      this.config.onToolChange?.(tool);
    } else {
      // 清除工具时，只退出编辑状态，不清除选择（因为可能还在画线模式下）
      this.exitEditMode();
      // 取消工具选择但仍在画线模式：通知保持十字线关闭
      // 传入一个标记值表示仍在画线模式（使用'segment'作为标记）
      if (this.isDrawingMode) {
        this.config.onToolChange?.(('segment' as any));
      } else {
        // 如果不在画线模式，通知恢复十字线
        this.config.onToolChange?.(null);
      }
    }
    
    this.render();
  }
  
  /**
   * 获取画线模式状态
   */
  getDrawingMode(): boolean {
    return this.isDrawingMode;
  }

  /**
   * 获取当前激活的工具
   */
  getActiveTool(): DrawingToolType | null {
    return this.state.getActiveTool();
  }

  /**
   * 清除所有绘图
   */
  clearAll(): void {
    this.saveToHistory(); // 保存清除前的状态
    this.state.setDrawings([]);
    this.state.clearSelection();
    this.saveToHistory(); // 保存清除后的状态
    this.render();
    this.config.onDrawingUpdate?.(this.state.getDrawings());
  }

  /**
   * 删除指定绘图
   */
  removeDrawing(id: string): void {
    // 先保存当前状态到历史（删除前的状态）
    this.saveToHistory();
    // 然后删除
    const drawings = this.state.getDrawings().filter(d => d.id !== id);
    this.state.setDrawings(drawings);
    if (this.state.getSelectedDrawingId() === id) {
      this.state.setSelectedDrawingId(null);
    }
    // 保存删除后的状态到历史
    this.saveToHistory();
    this.render();
    this.config.onDrawingUpdate?.(this.state.getDrawings());
  }

  /**
   * 删除当前选中的绘图
   */
  removeSelectedDrawing(): void {
    const selectedId = this.state.getSelectedDrawingId();
    if (selectedId) {
      this.removeDrawing(selectedId);
    }
  }

  /**
   * 切换当前选中绘图的类型（Tab键效果）
   */
  switchSelectedDrawingType(): void {
    const selectedId = this.state.getSelectedDrawingId();
    if (selectedId) {
      this.changeDrawingType(selectedId);
    }
  }

  /**
   * 获取当前选中的绘图ID
   */
  getSelectedDrawingId(): string | null {
    return this.state.getSelectedDrawingId();
  }

  /**
   * 保存当前状态到历史记录
   */
  private saveToHistory(): void {
    this.history.save(this.state.getDrawings());
  }

  /**
   * 撤销操作
   */
  undo(): void {
    const previousState = this.history.undo();
    if (previousState) {
      this.state.setDrawings(previousState);
      this.render();
      this.config.onDrawingUpdate?.(this.state.getDrawings());
    }
  }

  /**
   * 重做操作
   */
  redo(): void {
    const nextState = this.history.redo();
    if (nextState) {
      this.state.setDrawings(nextState);
      this.render();
      this.config.onDrawingUpdate?.(this.state.getDrawings());
    }
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.history.canUndo();
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.history.canRedo();
  }

  /**
   * 获取所有绘图
   */
  getDrawings(): Drawing[] {
    return [...this.state.getDrawings()];
  }

  /**
   * 加载画线数据（从localStorage或API）
   */
  loadDrawings(drawings: Drawing[]): void {
    // 先清空现有数据，避免重复
    const loadedDrawings = drawings.map(d => ({
      ...d,
      // 确保所有必需字段都存在
      points: d.points || [],
      dataPoints: d.dataPoints || [],
      visible: d.visible !== undefined ? d.visible : true,
      locked: d.locked !== undefined ? d.locked : false,
      // 如果颜色不存在，使用当前主题的默认颜色
      color: d.color || this.config.defaultColor || DrawingConfig.defaultColor,
    }));
    
    this.state.setDrawings(loadedDrawings);
    
    // 重新计算像素坐标（因为坐标系统可能已变化）
    this.recalculatePixelPoints();
    
    // 保存到历史记录
    this.saveToHistory();
    
    this.render();
  }


  /**
   * 鼠标/触摸按下事件
   * 注意：只有在画线模式时才会被调用（canvas的pointerEvents为'auto'）
   * 在画线模式下，即使没有选择具体工具（activeTool为null），也允许编辑已存在的线
   */
  private handleMouseDown(e: MouseEvent | TouchEvent): void {
    // 触摸事件时阻止默认行为，避免页面滚动
    if ('touches' in e) {
      // 多指手势（双指缩放等）直接交给 ECharts 处理，不在画线层处理
      if (e.touches.length > 1 || e.changedTouches.length > 1) {
        return;
      }
      e.preventDefault();
    }
    if (!this.config.enableDrawing || !this.config.klineBounds || !this.isDrawingMode) {
      return;
    }
    
    // 如果没有选择工具，只允许编辑已存在的线，不允许画新线
    const hasActiveTool = !!this.state.getActiveTool();

    const point = this.getCanvasPoint(e);
    if (!this.isPointInKlineArea(point)) {
      return;
    }
    
    // 首先清除任何异常的绘制状态
    if (!this.state.getIsDrawing() && this.state.getCurrentDrawing()) {
      this.state.setCurrentDrawing(null);
    }

    // 画线模式下：检查是否点击在端点附近（进入编辑端点状态）
    const endpointInfo = this.findEndpointAtPoint(point);
    if (endpointInfo) {
      // 进入编辑端点状态（仍在画线模式下）
      this.state.enterEditMode(endpointInfo.drawingId, endpointInfo.pointIndex);
      this.state.setSelectedDrawingId(endpointInfo.drawingId);
      // 确保清除任何绘制状态
      this.state.setIsDrawing(false);
      this.state.setCurrentDrawing(null);
      e.preventDefault();
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      this.render();
      return;
    }

    // 画线模式下：检查是否点击在已画的线上（选中，不画新线）
    const clickedDrawingId = this.findDrawingAtPoint(point);
    if (clickedDrawingId) {
      // 点击在已画的线上，只选中，不触发画新线
      this.state.setSelectedDrawingId(clickedDrawingId);
      // 确保清除任何绘制状态
      this.state.setIsDrawing(false);
      this.state.setCurrentDrawing(null);
      this.render();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 画线模式：开始绘制新图（点击空白处）
    // 只有选择了具体工具时，才能画新线
    // 如果没有选择工具，点击空白处不执行任何操作（但可以编辑已存在的线）
    if (!hasActiveTool) {
      // 如果没有激活工具，不允许开始新线绘制（但可以编辑已存在的线）
      // 点击空白处时，不执行任何操作，只阻止事件传播
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // 对起始端点进行吸附
    const snappedPoint = this.snap.snapToKeyPoint(point);
    const dataPoint = this.coordinateSystem.pixelToData(snappedPoint, 0);
    if (!dataPoint) {
      return;
    }

    this.state.setIsDrawing(true);
    this.state.setCurrentDrawing({
      id: generateDrawingId(),
      type: this.state.getActiveTool()!,
      points: [snappedPoint], // 使用吸附后的点
      dataPoints: [dataPoint],
      color: this.config.defaultColor || DrawingConfig.defaultColor,
      lineWidth: this.config.defaultLineWidth || DrawingConfig.defaultLineWidth,
      visible: true,
      locked: false,
      config: getDefaultConfig(this.state.getActiveTool()!),
    });
    e.preventDefault();
    e.stopPropagation(); // 阻止传播，避免触发十字线操作
    this.render(); // 立即渲染，显示吸附后的起始点
  }

  /**
   * 鼠标/触摸移动事件
   * 注意：只有在画线模式时才会被调用（canvas的pointerEvents为'auto'）
   * 在画线模式下，即使没有选择具体工具（activeTool为null），也允许编辑已存在的线
   */
  private handleMouseMove(e: MouseEvent | TouchEvent): void {
    // 多指手势（缩放）直接交给 ECharts 处理
    if ('touches' in e && (e.touches.length > 1 || e.changedTouches.length > 1)) {
      return;
    }
    if (!this.isDrawingMode || !this.config.enableDrawing || !this.config.klineBounds) {
      return;
    }
    
    const point = this.getCanvasPoint(e);
    
    // 更新鼠标位置（用于放大镜）
    this.currentMousePoint = point;
    
    // 正在编辑（拖动端点）
    if (this.state.getIsEditing() && this.state.getEditingDrawingId() && this.state.getEditingPointIndex() >= 0) {
      const drawings = this.state.getDrawings();
      const drawing = drawings.find(d => d.id === this.state.getEditingDrawingId());
      if (drawing && drawing.points[this.state.getEditingPointIndex()]) {
        // 江恩角度箱的第二个点：可以在箱体内任意移动，但只能在第一第四象限（起点右侧）
        if (drawing.type === 'gann-angle' && this.state.getEditingPointIndex() === 1) {
          const startPoint = drawing.points[0];
          // 第二个点可以自由移动，但必须约束在起点右侧（第一第四象限）
          let snappedPoint = this.snap.snapToKeyPoint(point);
          
          // 约束x坐标必须在起点右侧（第一第四象限）
          if (snappedPoint.x < startPoint.x) {
            snappedPoint = {
              x: startPoint.x,
              y: snappedPoint.y
            };
          }
          
          const dataPoint = this.coordinateSystem.pixelToData(snappedPoint, 0);
          
          if (dataPoint) {
            drawing.points[this.state.getEditingPointIndex()] = snappedPoint;
            drawing.dataPoints[this.state.getEditingPointIndex()] = dataPoint;
            // 更新状态
            this.state.setDrawings([...drawings]);
            // 重新计算其他点的像素坐标
            this.recalculatePixelPoints();
            this.render();
          }
          if ('touches' in e) {
            e.preventDefault();
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 通道线的第三个点：特殊处理，确保它沿着边线移动
        if (drawing.type === 'price-channel' && this.state.getEditingPointIndex() === 2) {
          // 不吸附到关键点，而是计算到中线的距离
          const p1 = drawing.points[0];
          const p2 = drawing.points[1];
          
          // 计算中线的方向向量
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          
          if (length > 0) {
            // 计算垂直于中线的单位向量
            const perpX = -dy / length;
            const perpY = dx / length;
            
            // 计算第三个点相对于起点p1的向量
            const vx = point.x - p1.x;
            const vy = point.y - p1.y;
            
            // 计算第三个点到中线的垂直距离（使用点积）
            const distanceToMid = vx * perpX + vy * perpY;
            
            // 计算中线的中点
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            // 将第三个点约束在边线上（使用当前距离）
            const constrainedPoint: PixelPoint = {
              x: midX + perpX * distanceToMid,
              y: midY + perpY * distanceToMid,
            };
            
            // 更新端点
            drawing.points[this.state.getEditingPointIndex()] = constrainedPoint;
            const dataPoint = this.coordinateSystem.pixelToData(constrainedPoint, 0);
            if (dataPoint) {
              drawing.dataPoints[this.state.getEditingPointIndex()] = dataPoint;
            }
            
            // 更新状态
            this.state.setDrawings([...drawings]);
            // 重新计算其他点的像素坐标
            this.recalculatePixelPoints();
            this.render();
          }
        } else {
          // 其他端点：正常吸附到关键点
          const snappedPoint = this.snap.snapToKeyPoint(point);
          const dataPoint = this.coordinateSystem.pixelToData(snappedPoint, 0);
          
          if (dataPoint) {
            // 更新端点（需要重新计算所有像素点）
            drawing.dataPoints[this.state.getEditingPointIndex()] = dataPoint;
            drawing.points[this.state.getEditingPointIndex()] = snappedPoint;
            
            // 如果是江恩角度箱的第一个点，需要确保第二个点仍在第一第四象限
            if (drawing.type === 'gann-angle' && this.state.getEditingPointIndex() === 0 && drawing.points.length >= 2) {
              const newStartPoint = drawing.points[0];
              const secondPoint = drawing.points[1];
              
              // 如果第二个点在起点左侧，调整到起点右侧
              if (secondPoint.x < newStartPoint.x) {
                const adjustedSecondPoint: PixelPoint = {
                  x: newStartPoint.x,
                  y: secondPoint.y
                };
                const adjustedDataPoint = this.coordinateSystem.pixelToData(adjustedSecondPoint, 0);
                if (adjustedDataPoint) {
                  drawing.points[1] = adjustedSecondPoint;
                  drawing.dataPoints[1] = adjustedDataPoint;
                }
              }
            }
            
            // 更新状态
            this.state.setDrawings([...drawings]);
            // 重新计算其他点的像素坐标（因为坐标系统可能变化）
            this.recalculatePixelPoints();
            this.render();
          }
        }
      }
      if ('touches' in e) {
        e.preventDefault();
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // 触摸事件时阻止默认行为
    if ('touches' in e && this.state.getIsDrawing()) {
      e.preventDefault();
    }
    
    // 编辑模式下，鼠标移动时也要更新放大镜（即使没有拖动端点）
    if (this.state.getIsEditing() && this.state.getEditingDrawingId() && this.state.getEditingPointIndex() >= 0) {
      this.render();
    }
    
    // 检查是否悬停在绘图或端点上（只在非编辑和非绘制状态下更新hover状态）
    if (!this.state.getIsDrawing() && !this.state.getIsEditing()) {
      const endpointInfo = this.findEndpointAtPoint(point);
      const hoveredId = endpointInfo ? endpointInfo.drawingId : this.findDrawingAtPoint(point);
      
      if (hoveredId !== this.state.getHoveredDrawingId() || endpointInfo !== null) {
        this.state.setHoveredDrawingId(hoveredId);
        this.render();
      }
      // 如果不在编辑模式，清除鼠标位置（避免放大镜残留）
      this.currentMousePoint = null;
    }

    // 正在绘制新线（但不在编辑模式下）
    // 注意：只有选择了工具时才能绘制新线，否则清除绘制状态
    if (this.state.getIsDrawing() && this.state.getCurrentDrawing() && !this.state.getIsEditing()) {
      if (!this.state.getActiveTool()) {
        // 如果没有工具，不应该在绘制状态，清除它
        this.state.setIsDrawing(false);
        this.state.setCurrentDrawing(null);
        return;
      }
      
      // 尝试吸附到关键点
      const snappedPoint = this.snap.snapToKeyPoint(point);
      const dataPoint = this.coordinateSystem.pixelToData(snappedPoint, 0);
      if (dataPoint && this.config.klineBounds) {
        // 根据工具类型更新点
        this.updateCurrentDrawing(snappedPoint, dataPoint);
        this.render();
      }
      if ('touches' in e) {
        e.preventDefault();
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    } else if (this.state.getIsDrawing() && this.state.getIsEditing()) {
      // 编辑模式下不应该有绘制状态，清除它
      this.state.setIsDrawing(false);
      this.state.setCurrentDrawing(null);
    } else if (this.state.getCurrentDrawing() && !this.state.getIsDrawing() && !this.state.getIsEditing()) {
      // 如果不在绘制状态但仍有currentDrawing，清除它（防止异常状态）
      this.state.setCurrentDrawing(null);
      this.render();
    }

    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * 鼠标/触摸抬起事件
   * 注意：只有在画线模式时才会被调用（canvas的pointerEvents为'auto'）
   * 在画线模式下，即使没有选择具体工具（activeTool为null），也允许编辑已存在的线
   */
  private handleMouseUp(e: MouseEvent | TouchEvent): void {
    // 多指结束事件：交给 ECharts 处理
    if ('touches' in e && (e.touches.length > 1 || e.changedTouches.length > 1)) {
      return;
    }

    if (!this.isDrawingMode || !this.config.enableDrawing) {
      return;
    }
    
    // 触摸事件时阻止默认行为
    if ('touches' in e) {
      e.preventDefault();
    }
    
    // 结束编辑模式
    if (this.state.getIsEditing()) {
      this.saveToHistory(); // 保存编辑后的状态
      this.exitEditMode();
      // 清除鼠标位置，确保放大镜关闭
      this.currentMousePoint = null;
      this.config.onDrawingUpdate?.(this.state.getDrawings());
      this.render(); // 立即渲染，清除放大镜
      e.preventDefault();
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      return;
    }
    
      const currentDrawing = this.state.getCurrentDrawing();
      if (this.state.getIsDrawing() && currentDrawing) {
        // 完成绘图
        const requiredPoints = getRequiredPoints(currentDrawing.type);
        // 水平射线只需要1个点即可完成
        if (currentDrawing.type === 'horizontal-ray' && currentDrawing.points.length >= 1) {
          this.saveToHistory(); // 保存到历史
          const drawings = [...this.state.getDrawings(), currentDrawing];
          this.state.setDrawings(drawings);
          // 自动选中刚完成的画线
          this.state.setSelectedDrawingId(currentDrawing.id);
          this.config.onDrawingUpdate?.(drawings);
        } else if (currentDrawing.points.length >= requiredPoints) {
          // 通道线：自动添加第三个控制点到边线上
          if (currentDrawing.type === 'price-channel' && currentDrawing.points.length === 2) {
            this.addChannelWidthControlPoint(currentDrawing);
          }
          this.saveToHistory(); // 保存到历史
          const drawings = [...this.state.getDrawings(), currentDrawing];
          this.state.setDrawings(drawings);
          // 自动选中刚完成的画线
          this.state.setSelectedDrawingId(currentDrawing.id);
          this.config.onDrawingUpdate?.(drawings);
        }
        this.state.setIsDrawing(false);
        this.state.setCurrentDrawing(null);
        this.render();
      }

    e.preventDefault();
    e.stopPropagation(); // 阻止传播，避免触发十字线操作
  }

  /**
   * 点击事件（选择绘图）
   * 注意：只有在画线模式时才会被调用（canvas的pointerEvents为'auto'）
   * 画线模式下：所有点击都阻止传播，避免触发十字线操作
   */
  private handleClick(e: MouseEvent): void {
    // 如果不在画线模式，不处理
    if (!this.isDrawingMode) {
      return;
    }
    
    // 如果正在编辑或绘制，不处理点击（编辑和绘制在handleMouseDown中处理）
    if (this.state.getIsEditing() || this.state.getIsDrawing()) {
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      return;
    }
    
    // 如果没有选择工具，只允许编辑，不允许选择（选择在handleMouseDown中处理）
    if (!this.state.getActiveTool()) {
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      return;
    }
    
    const point = this.getCanvasPoint(e);
    const endpointInfo = this.findEndpointAtPoint(point);
    
    if (endpointInfo) {
      // 点击在端点上，选中该绘图
      this.state.setSelectedDrawingId(endpointInfo.drawingId);
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      this.render();
      return;
    }
    
    // 点击在绘图上
    const clickedId = this.findDrawingAtPoint(point);
    if (clickedId) {
      this.state.setSelectedDrawingId(clickedId);
      e.stopPropagation(); // 阻止传播，避免触发十字线操作
      this.render();
      return;
    }
    
    // 点击空白处，取消选择
    // 画线模式下：也阻止传播，避免触发十字线操作
    this.state.setSelectedDrawingId(null);
    e.stopPropagation(); // 阻止传播，避免触发十字线操作
    this.render();
  }

  /**
   * 退出编辑模式
   */
  private exitEditMode(): void {
    this.state.exitEditMode();
    // 清除鼠标位置，确保放大镜关闭
    this.currentMousePoint = null;
    // 确保退出编辑模式时，清除绘制状态（防止编辑模式下意外触发绘制）
    if (this.state.getIsDrawing()) {
      this.state.setIsDrawing(false);
      this.state.setCurrentDrawing(null);
    }
  }

  /**
   * 双击事件（删除绘图）
   */
  private handleDoubleClick(e: MouseEvent): void {
    const point = this.getCanvasPoint(e);
    const clickedId = this.findDrawingAtPoint(point);
    if (clickedId) {
      this.removeDrawing(clickedId);
    }
  }

  /**
   * 获取Canvas坐标点（支持鼠标和触摸事件）
   */
  private getCanvasPoint(e: MouseEvent | TouchEvent): PixelPoint {
    const rect = this.canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    
    if ('touches' in e) {
      // 触摸事件
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) {
        return { x: 0, y: 0 };
      }
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      // 鼠标事件
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  /**
   * 检查点是否在K线区域内
   */
  private isPointInKlineArea(point: PixelPoint): boolean {
    if (!this.config.klineBounds) {
      return false;
    }
    return (
      point.x >= this.config.klineBounds.left &&
      point.x <= this.config.klineBounds.right &&
      point.y >= this.config.klineBounds.top &&
      point.y <= this.config.klineBounds.bottom
    );
  }

  /**
   * 查找指定点的绘图
   */
  private findDrawingAtPoint(point: PixelPoint): string | null {
    const threshold = 5; // 5px点击区域
    for (const drawing of this.state.getDrawings()) {
      if (this.renderer.isPointNearDrawing(point, drawing, threshold)) {
        return drawing.id;
      }
    }
    return null;
  }

  /**
   * 切换已选中的绘图的类型
   * 按Tab键时调用，只在同类型（相同初始控制点数）中循环切换类型
   */
  private changeDrawingType(drawingId: string): void {
    const drawings = this.state.getDrawings();
    const drawing = drawings.find(d => d.id === drawingId);
    if (!drawing) {
      return;
    }

    // 获取当前绘图需要的控制点数
    const requiredPoints = getRequiredPoints(drawing.type);
    
    // 根据点数获取对应的类型循环列表
    const typeCycle = getTypeCycleByPoints(requiredPoints);
    if (typeCycle.length === 0) {
      return; // 未知点数，不处理
    }

    // 如果该组只有一种类型，无需切换
    if (typeCycle.length === 1) {
      return;
    }

    // 找到当前类型在循环列表中的位置
    const currentIndex = typeCycle.indexOf(drawing.type);
    if (currentIndex === -1) {
      return; // 当前类型不在循环列表中，不处理
    }

    // 获取下一个类型（循环）
    const nextIndex = (currentIndex + 1) % typeCycle.length;
    const newType = typeCycle[nextIndex];

    // 保存历史记录
    this.saveToHistory();

    // 更新类型
    drawing.type = newType;

    // 由于只在同组内切换，点数应该相同，但需要处理特殊情况
    // 价格通道线有第三个控制点，其他类型只需要2个点
    if (newType !== 'price-channel' && drawing.points.length > 2) {
      // 切换到非价格通道线的类型时，移除第三个控制点（价格通道线的特殊控制点）
      drawing.points = drawing.points.slice(0, 2);
      drawing.dataPoints = drawing.dataPoints.slice(0, 2);
    }

    // 更新配置
    drawing.config = getDefaultConfig(newType);

    // 特殊处理：价格通道线需要添加第三个控制点
    if (newType === 'price-channel' && drawing.points.length === 2) {
      this.addChannelWidthControlPoint(drawing);
    }

    // 更新状态
    this.state.setDrawings([...drawings]);
    
    // 保存到历史记录
    this.saveToHistory();
    
    // 触发更新回调
    this.config.onDrawingUpdate?.(this.state.getDrawings());
    
    // 重新渲染
    this.render();
  }

  /**
   * 计算端点点击检测的阈值
   * 考虑端点半径、边框宽度和点击便利性，确保用户容易点击到端点
   */
  private getEndpointClickThreshold(): number {
    // 使用最大的端点半径（考虑编辑模式）加上边框宽度，再增加一些容差
    const maxEndpointRadius = Math.max(
      DrawingConfig.endpointRadius,
      DrawingConfig.endpointRadiusHighlighted,
      DrawingConfig.endpointRadiusEditing
    );
    const maxBorderWidth = Math.max(
      DrawingConfig.endpointBorderWidth,
      DrawingConfig.endpointBorderWidthHighlighted
    );
    // 额外5像素容差，提高点击便利性
    return maxEndpointRadius + maxBorderWidth + 5;
  }

  /**
   * 查找指定点附近的端点
   * @returns { drawingId: string, pointIndex: number } | null
   */
  private findEndpointAtPoint(point: PixelPoint): { drawingId: string; pointIndex: number } | null {
    const threshold = this.getEndpointClickThreshold();
    
    for (const drawing of this.state.getDrawings()) {
      if (!drawing.visible) {
        continue;
      }
      
      for (let i = 0; i < drawing.points.length; i++) {
        const endpoint = drawing.points[i];
        const dx = point.x - endpoint.x;
        const dy = point.y - endpoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < threshold) {
          return { drawingId: drawing.id, pointIndex: i };
        }
      }
    }
    return null;
  }


  /**
   * 键盘事件处理
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // 只在canvas可见且启用绘图时响应
    if (!this.config.enableDrawing) {
      return;
    }

    // Tab键切换选中绘图的类型（只在有选中绘图时生效）
    if (e.key === 'Tab' && this.state.getSelectedDrawingId()) {
      e.preventDefault(); // 阻止Tab键的默认行为（切换焦点）
      this.changeDrawingType(this.state.getSelectedDrawingId()!);
      return;
    }

    // Delete键删除选中的绘图
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.state.getSelectedDrawingId()) {
        e.preventDefault();
        this.removeDrawing(this.state.getSelectedDrawingId()!);
      }
      return;
    }

    // Ctrl+Z 撤销（Windows/Linux）或 Cmd+Z（Mac）
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
  }


  /**
   * 更新当前绘图
   */
  private updateCurrentDrawing(point: PixelPoint, dataPoint: DataPoint): void {
    const currentDrawing = this.state.getCurrentDrawing();
    if (!currentDrawing) {
      return;
    }

    // 特殊处理：水平射线和甘氏线只需要1个点
    if (currentDrawing.type === 'horizontal-ray') {
      // 水平射线：只需要第一个点的Y坐标，X坐标跟随鼠标用于预览
      if (currentDrawing.points.length === 0) {
        // 第一个点：使用吸附后的点
        currentDrawing.points.push(point);
        currentDrawing.dataPoints.push(dataPoint);
      } else {
        // 后续移动：只更新X坐标用于预览，Y坐标保持第一个点的Y坐标
        currentDrawing.points[0].x = point.x;
        currentDrawing.dataPoints[0].index = dataPoint.index;
      }
      this.state.setCurrentDrawing({ ...currentDrawing });
      return;
    }

    if (currentDrawing.type === 'gann-angle') {
      // 江恩角度箱：第一个点定端点，第二个点可以在箱体内任意移动（确定1:1线的方向）
      const requiredPoints = getRequiredPoints(currentDrawing.type);
      if (currentDrawing.points.length < requiredPoints) {
        if (currentDrawing.points.length === 0) {
          // 第一个点：直接添加
          currentDrawing.points.push(point);
          currentDrawing.dataPoints.push(dataPoint);
        } else {
          // 第二个点：约束在第一第四象限（起点右侧）
          const startPoint = currentDrawing.points[0];
          const constrainedPoint: PixelPoint = {
            x: Math.max(startPoint.x, point.x), // 确保x >= startPoint.x
            y: point.y
          };
          const constrainedDataPoint = this.coordinateSystem.pixelToData(constrainedPoint, 0) || dataPoint;
          currentDrawing.points.push(constrainedPoint);
          currentDrawing.dataPoints.push(constrainedDataPoint);
        }
      } else {
        // 更新第二个点：可以在箱体内任意移动，但必须在第一第四象限（起点右侧）
        const startPoint = currentDrawing.points[0];
        const constrainedPoint: PixelPoint = {
          x: Math.max(startPoint.x, point.x), // 确保x >= startPoint.x
          y: point.y
        };
        const constrainedDataPoint = this.coordinateSystem.pixelToData(constrainedPoint, 0) || dataPoint;
        currentDrawing.points[currentDrawing.points.length - 1] = constrainedPoint;
        currentDrawing.dataPoints[currentDrawing.dataPoints.length - 1] = constrainedDataPoint;
      }
      this.state.setCurrentDrawing({ ...currentDrawing });
      return;
    }

    // 根据工具类型更新点数
    const requiredPoints = getRequiredPoints(currentDrawing.type);
    if (currentDrawing.points.length < requiredPoints) {
      currentDrawing.points.push(point);
      currentDrawing.dataPoints.push(dataPoint);
    } else {
      // 更新最后一个点
      currentDrawing.points[currentDrawing.points.length - 1] = point;
      currentDrawing.dataPoints[currentDrawing.dataPoints.length - 1] = dataPoint;
    }
    this.state.setCurrentDrawing({ ...currentDrawing });
  }

  /**
   * 渲染所有绘图
   */
  render(): void {
    this.clear();

    if (!this.config.klineBounds) {
      return;
    }

    const ctx = this.ctx;
    const drawings = this.state.getDrawings();
    
    // 渲染所有已完成的绘图
    for (const drawing of drawings) {
      if (!drawing.visible) {
        continue;
      }
      // 选中的绘图使用高亮样式
      const isSelected = drawing.id === this.state.getSelectedDrawingId();
      const isHovered = drawing.id === this.state.getHoveredDrawingId();
      this.renderer.drawDrawing(ctx, drawing, {
        klineBounds: this.config.klineBounds!,
        coordinateSystem: this.coordinateSystem,
        isEditing: this.state.getIsEditing() && this.state.getEditingDrawingId() === drawing.id,
        editingDrawingId: this.state.getEditingDrawingId(),
        editingPointIndex: this.state.getEditingPointIndex(),
        selectedDrawingId: this.state.getSelectedDrawingId(),
        hoveredDrawingId: this.state.getHoveredDrawingId(),
        drawPointMarker: () => {}, // 占位，实际由renderer处理
        isDrawingMode: this.isDrawingMode, // 传递画线模式状态
      }, {
        isTemporary: false,
        isSelected,
        isHovered,
        isEditing: this.state.getIsEditing() && this.state.getEditingDrawingId() === drawing.id,
        editingDrawingId: this.state.getEditingDrawingId(),
        editingPointIndex: this.state.getEditingPointIndex(),
      });
    }

    // 渲染当前正在绘制的绘图（只在非编辑模式下，且确实在绘制）
    const currentDrawing = this.state.getCurrentDrawing();
    if (this.state.getIsDrawing() && currentDrawing && !this.state.getIsEditing()) {
      this.renderer.drawDrawing(ctx, currentDrawing, {
        klineBounds: this.config.klineBounds!,
        coordinateSystem: this.coordinateSystem,
        isEditing: false,
        editingDrawingId: null,
        editingPointIndex: -1,
        selectedDrawingId: null,
        hoveredDrawingId: null,
        drawPointMarker: () => {},
        isDrawingMode: this.isDrawingMode, // 传递画线模式状态
      }, {
        isTemporary: true,
        isSelected: false,
        isHovered: false,
      });
    } else if (currentDrawing && (!this.state.getIsDrawing() || this.state.getIsEditing())) {
      // 如果有currentDrawing但不在绘制状态或处于编辑模式，清除它
      this.state.setCurrentDrawing(null);
      this.state.setIsDrawing(false);
    }

    // 绘制端点（画线模式下显示所有端点，即使没有选择工具）
    if (this.isDrawingMode) {
      this.renderEndpoints(ctx, drawings, currentDrawing);
    }

    // 绘制放大镜效果（编辑模式下，在鼠标移动时也要显示）
    if (this.state.getIsEditing() && this.state.getEditingDrawingId() && this.state.getEditingPointIndex() >= 0 && this.currentMousePoint) {
      const drawings = this.state.getDrawings();
      const drawing = drawings.find(d => d.id === this.state.getEditingDrawingId());
      
      if (drawing && drawing.points[this.state.getEditingPointIndex()]) {
        // 获取正在编辑的端点位置，放大镜直接显示在端点位置
        const editingEndpoint = drawing.points[this.state.getEditingPointIndex()];
        
        // 尝试获取ECharts canvas用于放大镜（始终显示背景）
        const container = this.canvas.parentElement;
        const echartsCanvas = container?.querySelector('canvas:not([data-drawing-layer])') as HTMLCanvasElement;
        
        // 放大镜显示在端点位置
        this.renderer.drawMagnifier(ctx, editingEndpoint, echartsCanvas, this.canvas);
      }
    }
  }

  /**
   * 渲染端点（画线模式下）
   * 包括正在编辑的端点、所有已绘制图形的端点、以及当前绘制中的端点
   */
  private renderEndpoints(
    ctx: CanvasRenderingContext2D,
    drawings: Drawing[],
    currentDrawing: Drawing | null
  ): void {
    const isEditing = this.state.getIsEditing();
    const editingDrawingId = this.state.getEditingDrawingId();
    const isDrawingMode = this.isDrawingMode; // 传递画线模式状态
    
    // 如果正在编辑某个端点，先显示正在编辑的绘图的端点（高亮）
    if (isEditing && editingDrawingId) {
      const editingDrawing = drawings.find(d => d.id === editingDrawingId);
      if (editingDrawing && editingDrawing.visible) {
        this.renderer.drawEndpoints(ctx, editingDrawing, true, isDrawingMode);
      }
    }
    
    // 显示所有已绘制图形的端点
    for (const drawing of drawings) {
      if (!drawing.visible) {
        continue;
      }
      // 如果是正在编辑的绘图，跳过（已在上面绘制）
      if (isEditing && drawing.id === editingDrawingId) {
        continue;
      }
      const isSelected = drawing.id === this.state.getSelectedDrawingId();
      const isHovered = drawing.id === this.state.getHoveredDrawingId();
      // 传递画线模式状态，如果不在画线模式，端点半径将为0
      this.renderer.drawEndpoints(ctx, drawing, isSelected || isHovered, isDrawingMode);
    }
    
    // 绘制当前绘制中的端点（只在非编辑端点状态下）
    if (this.state.getIsDrawing() && currentDrawing && !isEditing) {
      this.renderer.drawEndpoints(ctx, currentDrawing, false, isDrawingMode);
    }
  }

  /**
   * 为通道线添加宽度控制点（第三个点）
   * 控制点显示在上边线或下边线的中点
   */
  private addChannelWidthControlPoint(drawing: Drawing): void {
    if (drawing.points.length < 2 || drawing.dataPoints.length < 2) {
      return;
    }

    const p1 = drawing.points[0];
    const p2 = drawing.points[1];
    const channelWidth = drawing.config?.channelWidth || 50;
    const verticalOffset = channelWidth / 2;

    // 计算中线的方向向量
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      return;
    }

    // 计算垂直于中线的单位向量
    const perpX = -dy / length;
    const perpY = dx / length;

    // 第三个点显示在上边线的中点（也可以选择下边线）
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const controlPoint: PixelPoint = {
      x: midX + perpX * verticalOffset,
      y: midY + perpY * verticalOffset,
    };

    // 计算控制点的数据坐标
    const controlDataPoint = this.coordinateSystem.pixelToData(controlPoint, 0);
    if (controlDataPoint) {
      drawing.points.push(controlPoint);
      drawing.dataPoints.push(controlDataPoint);
    }
  }


  /**
   * 更新配置
   */
  updateConfig(config: Partial<DrawingLayerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 更新模块化服务的配置
    if (config.klineData || config.klineBounds) {
      this.snap = new DrawingSnap(
        this.coordinateSystem,
        config.klineData || this.config.klineData || [],
        config.klineBounds || this.config.klineBounds
      );
    }
    
    if (config.klineBounds) {
      this.renderer.updateConfig(config.klineBounds);
      // 如果klineBounds变化，重新计算所有绘图的像素坐标
      this.recalculatePixelPoints();
    }
    
    this.render();
  }

  /**
   * 根据数据坐标重新计算所有绘图的像素坐标
   * 当dataZoom变化时调用此方法
   */
  recalculatePixelPoints(): void {
    const drawings = this.state.getDrawings();
    if (!this.config.klineBounds || drawings.length === 0) {
      // 如果没有绘图或bounds，只渲染当前正在绘制的
      const currentDrawing = this.state.getCurrentDrawing();
      if (this.state.getIsDrawing() && currentDrawing) {
        currentDrawing.points = currentDrawing.dataPoints.map(dp => 
          this.coordinateSystem.dataToPixel(dp, 0)
        );
        this.state.setCurrentDrawing({ ...currentDrawing });
        this.render();
      }
      return;
    }

    // 重新计算所有已完成的绘图
    for (const drawing of drawings) {
      if (drawing.dataPoints && drawing.dataPoints.length > 0) {
        drawing.points = drawing.dataPoints.map(dp => 
          this.coordinateSystem.dataToPixel(dp, 0)
        );
      }
    }
    this.state.setDrawings([...drawings]);

    // 重新计算当前正在绘制的绘图
    const currentDrawing = this.state.getCurrentDrawing();
    if (this.state.getIsDrawing() && currentDrawing && currentDrawing.dataPoints.length > 0) {
      currentDrawing.points = currentDrawing.dataPoints.map(dp => 
        this.coordinateSystem.dataToPixel(dp, 0)
      );
      this.state.setCurrentDrawing({ ...currentDrawing });
    }

    this.render();
  }

  /**
   * 通知坐标系统更新（dataZoom变化时调用）
   */
  notifyCoordinateUpdate(): void {
    this.recalculatePixelPoints();
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 移除鼠标事件
    this.canvas.removeEventListener('mousedown', this.handleMouseDownBound);
    this.canvas.removeEventListener('mousemove', this.handleMouseMoveBound);
    this.canvas.removeEventListener('mouseup', this.handleMouseUpBound);
    this.canvas.removeEventListener('click', this.handleClickBound);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClickBound);
    
    // 移除触摸事件
    this.canvas.removeEventListener('touchstart', this.handleMouseDownBound);
    this.canvas.removeEventListener('touchmove', this.handleMouseMoveBound);
    this.canvas.removeEventListener('touchend', this.handleMouseUpBound);
    
    // 移除键盘事件
    document.removeEventListener('keydown', this.handleKeyDownBound);
    
    super.destroy();
  }
}

