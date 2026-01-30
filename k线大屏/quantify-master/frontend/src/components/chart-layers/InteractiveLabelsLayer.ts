/**
 * 交互式标签层
 * 目前不渲染标签（标签由ECharts的legend在右上角显示）
 * 保留类结构以便未来扩展
 */
import { BaseLayer } from './BaseLayer.ts';
import { ChartEvent } from './types.ts';
import { CoordinateSystem } from './CoordinateSystem.ts';

export interface LabelLayerConfig {
  klineLabels: Array<{ name: string; color: string; value?: number }>;
  volumeLabels: Array<{ name: string; color: string; value?: number }>;
  theme: string;
  leftMargin: number; // 像素值
  klineBounds: { top: number; bottom: number } | null;
  volumeBounds: { top: number; bottom: number } | null;
  onLabelClick?: (label: { name: string; area: 'kline' | 'volume' }) => void;
}

export class InteractiveLabelsLayer extends BaseLayer {
  readonly zIndex = 100;
  private config: LabelLayerConfig;

  constructor(
    container: HTMLElement,
    coordinateSystem: CoordinateSystem,
    config: LabelLayerConfig
  ) {
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;
    super(container, coordinateSystem, width, height);
    this.config = config;
    this.initZIndex();
  }

  updateConfig(config: Partial<LabelLayerConfig>) {
    this.config = { ...this.config, ...config };
    this.render();
  }

  render(): void {
    // 不再绘制左上角标签，只清空画布
    // K线区域右上角的标签由ECharts的legend渲染
    this.clear();
  }

  handleEvent(event: ChartEvent): boolean {
    // 不再处理标签点击事件（标签已移除）
    return false;
  }

  updateValues(values: Record<string, number>) {
    // 更新标签数值（虽然标签不再显示，但保留方法以便未来扩展）
    this.config.klineLabels.forEach(label => {
      if (values[label.name] !== undefined) {
        label.value = values[label.name];
      }
    });
    this.config.volumeLabels.forEach(label => {
      if (values[label.name] !== undefined) {
        label.value = values[label.name];
      }
    });
  }
}

