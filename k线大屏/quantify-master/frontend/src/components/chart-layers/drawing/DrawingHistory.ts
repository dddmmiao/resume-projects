/**
 * 绘图历史记录管理
 * 支持撤销/重做功能
 */
import { Drawing } from './types.ts';
import { DrawingConfig } from './DrawingConfig.ts';

export class DrawingHistory {
  private history: Drawing[][] = [];
  private historyIndex: number = -1;
  private readonly maxHistorySize: number = DrawingConfig.maxHistorySize;

  /**
   * 保存当前状态到历史记录
   */
  save(state: Drawing[]): void {
    // 深拷贝当前绘图数组
    const snapshot = state.map(d => ({
      ...d,
      points: [...d.points],
      dataPoints: [...d.dataPoints],
      config: d.config ? { ...d.config } : undefined,
    }));

    // 如果当前不在历史记录末尾，删除后面的记录
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // 添加新快照
    this.history.push(snapshot);
    this.historyIndex++;

    // 限制历史记录数量
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  /**
   * 撤销操作
   */
  undo(): Drawing[] | null {
    if (this.canUndo()) {
      this.historyIndex--;
      return this.getCurrentState();
    }
    return null;
  }

  /**
   * 重做操作
   */
  redo(): Drawing[] | null {
    if (this.canRedo()) {
      this.historyIndex++;
      return this.getCurrentState();
    }
    return null;
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /**
   * 获取当前历史索引
   */
  getHistoryIndex(): number {
    return this.historyIndex;
  }

  /**
   * 获取当前状态（深拷贝）
   */
  private getCurrentState(): Drawing[] {
    if (this.historyIndex < 0 || this.historyIndex >= this.history.length) {
      return [];
    }
    const state = this.history[this.historyIndex];
    return state.map(d => ({
      ...d,
      points: [...d.points],
      dataPoints: [...d.dataPoints],
      config: d.config ? { ...d.config } : undefined,
    }));
  }
}

