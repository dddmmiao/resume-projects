/**
 * 图表图层管理器
 * 统一管理所有图层的生命周期和渲染
 */
import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { IChartLayer, ChartEvent } from './types.ts';
import { CoordinateSystem } from './CoordinateSystem.ts';

export interface ChartLayerManagerProps {
  container: HTMLElement | null;
  echartsInstance: echarts.ECharts | null;
  width?: number;
  height?: number;
}

export interface ChartLayerManagerRef {
  addLayer(layer: IChartLayer): void;
  removeLayer(layer: IChartLayer): void;
  render(): void;
  handleEvent(event: ChartEvent): void;
  destroy(): void;
}

export class ChartLayerManager {
  private layers: IChartLayer[] = [];
  private coordinateSystem: CoordinateSystem;
  private container: HTMLElement | null = null;
  private renderRequestId: number | null = null;

  constructor(echartsInstance: echarts.ECharts | null) {
    this.coordinateSystem = new CoordinateSystem(echartsInstance);
  }

  setContainer(container: HTMLElement | null) {
    this.container = container;
  }

  updateEChartsInstance(instance: echarts.ECharts | null) {
    this.coordinateSystem.updateInstance(instance);
    
    // 更新所有图层
    this.layers.forEach(layer => {
      if (layer.update) {
        layer.update({ echartsInstance: instance });
      }
    });
  }

  addLayer(layer: IChartLayer) {
    this.layers.push(layer);
    // 按z-index排序
    this.layers.sort((a, b) => a.zIndex - b.zIndex);
    this.render();
  }

  removeLayer(layer: IChartLayer) {
    const index = this.layers.indexOf(layer);
    if (index > -1) {
      this.layers.splice(index, 1);
      layer.destroy();
      this.render();
    }
  }

  /**
   * 统一渲染所有图层
   */
  render() {
    if (this.renderRequestId !== null) {
      cancelAnimationFrame(this.renderRequestId);
    }

    this.renderRequestId = requestAnimationFrame(() => {
      this.layers.forEach(layer => {
        try {
          layer.render();
        } catch (e) {
          // Layer render error
        }
      });
      this.renderRequestId = null;
    });
  }

  /**
   * 事件处理：从顶层到底层传递
   */
  handleEvent(event: ChartEvent): boolean {
    // 从z-index高的层开始处理
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.handleEvent) {
        const handled = layer.handleEvent(event);
        if (handled) {
          return true; // 事件已被处理，停止传递
        }
      }
    }
    return false; // 事件未被任何层处理
  }

  /**
   * 获取坐标系统（供图层使用）
   */
  getCoordinateSystem(): CoordinateSystem {
    return this.coordinateSystem;
  }

  /**
   * 销毁所有图层
   */
  destroy() {
    if (this.renderRequestId !== null) {
      cancelAnimationFrame(this.renderRequestId);
      this.renderRequestId = null;
    }

    this.layers.forEach(layer => layer.destroy());
    this.layers = [];
  }
}

/**
 * React Hook封装
 */
export function useChartLayerManager(
  container: HTMLElement | null,
  echartsInstance: echarts.ECharts | null
) {
  const managerRef = useRef<ChartLayerManager | null>(null);

  useEffect(() => {
    if (!container) return;

    const manager = new ChartLayerManager(echartsInstance);
    manager.setContainer(container);
    managerRef.current = manager;

    return () => {
      manager.destroy();
    };
  }, [container, echartsInstance]);

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateEChartsInstance(echartsInstance);
    }
  }, [echartsInstance]);

  return managerRef.current;
}

