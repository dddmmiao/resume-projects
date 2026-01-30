/**
 * 绘图状态管理
 */
import { Drawing, DrawingToolType } from './types.ts';

export class DrawingState {
  private drawings: Drawing[] = [];
  private activeTool: DrawingToolType | null = null;
  private isDrawing: boolean = false;
  private currentDrawing: Drawing | null = null;
  private hoveredDrawingId: string | null = null;
  private selectedDrawingId: string | null = null;
  
  // 编辑模式相关
  private isEditing: boolean = false;
  private editingPointIndex: number = -1;
  private editingDrawingId: string | null = null;

  // Getters
  getDrawings(): Drawing[] {
    return this.drawings;
  }

  getActiveTool(): DrawingToolType | null {
    return this.activeTool;
  }

  getIsDrawing(): boolean {
    return this.isDrawing;
  }

  getCurrentDrawing(): Drawing | null {
    return this.currentDrawing;
  }

  getHoveredDrawingId(): string | null {
    return this.hoveredDrawingId;
  }

  getSelectedDrawingId(): string | null {
    return this.selectedDrawingId;
  }

  getIsEditing(): boolean {
    return this.isEditing;
  }

  getEditingPointIndex(): number {
    return this.editingPointIndex;
  }

  getEditingDrawingId(): string | null {
    return this.editingDrawingId;
  }

  // Setters
  setDrawings(drawings: Drawing[]): void {
    this.drawings = drawings;
  }

  setActiveTool(tool: DrawingToolType | null): void {
    this.activeTool = tool;
    if (!tool) {
      // 退出画线模式时，清除相关状态
      this.selectedDrawingId = null;
      this.hoveredDrawingId = null;
    }
  }

  setIsDrawing(value: boolean): void {
    this.isDrawing = value;
  }

  setCurrentDrawing(drawing: Drawing | null): void {
    this.currentDrawing = drawing;
  }

  setHoveredDrawingId(id: string | null): void {
    this.hoveredDrawingId = id;
  }

  setSelectedDrawingId(id: string | null): void {
    this.selectedDrawingId = id;
  }

  setIsEditing(value: boolean): void {
    this.isEditing = value;
  }

  setEditingPointIndex(index: number): void {
    this.editingPointIndex = index;
  }

  setEditingDrawingId(id: string | null): void {
    this.editingDrawingId = id;
  }

  /**
   * 退出编辑模式
   */
  exitEditMode(): void {
    this.isEditing = false;
    this.editingPointIndex = -1;
    this.editingDrawingId = null;
  }

  /**
   * 进入编辑模式
   */
  enterEditMode(drawingId: string, pointIndex: number): void {
    this.isEditing = true;
    this.editingDrawingId = drawingId;
    this.editingPointIndex = pointIndex;
  }

  /**
   * 清除选择状态
   */
  clearSelection(): void {
    this.selectedDrawingId = null;
    this.hoveredDrawingId = null;
  }
}

