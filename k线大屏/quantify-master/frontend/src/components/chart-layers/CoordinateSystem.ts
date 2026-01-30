/**
 * 统一坐标系统
 * 负责所有坐标转换，统一各层的坐标计算
 */
import * as echarts from 'echarts';
import { ICoordinateSystem, DataPoint, PixelPoint, Bounds } from './types';

export class CoordinateSystem implements ICoordinateSystem {
  constructor(private echartsInstance: echarts.ECharts | null) {}

  updateInstance(instance: echarts.ECharts | null) {
    this.echartsInstance = instance;
  }

  /**
   * 数据坐标转换为像素坐标
   */
  dataToPixel(dataPoint: DataPoint, gridIndex: number): PixelPoint {
    if (!this.echartsInstance) {
      return { x: 0, y: 0 };
    }

    try {
      const pixel = this.echartsInstance.convertToPixel(
        { gridIndex },
        [dataPoint.index, dataPoint.value]
      );

      if (Array.isArray(pixel) && pixel.length >= 2) {
        return { x: pixel[0], y: pixel[1] };
      }
    } catch (e) {
      // Coordinate conversion failed
    }

    return { x: 0, y: 0 };
  }

  /**
   * 像素坐标转换为数据坐标
   */
  pixelToData(pixel: PixelPoint, gridIndex: number): DataPoint | null {
    if (!this.echartsInstance) {
      return null;
    }

    try {
      const data = this.echartsInstance.convertFromPixel(
        { gridIndex },
        [pixel.x, pixel.y]
      );

      if (Array.isArray(data) && data.length >= 2) {
        return {
          index: Math.round(data[0]),
          value: data[1]
        };
      }
    } catch (e) {
      // Coordinate conversion failed
    }

    return null;
  }

  /**
   * 获取grid边界
   * 通过转换坐标的方式计算边界
   */
  getGridBounds(gridIndex: number): Bounds | null {
    if (!this.echartsInstance) {
      return null;
    }

    try {
      // 方法1: 使用convertToPixel转换grid的四个角点
      // 获取grid的实际数据范围
      const option = this.echartsInstance.getOption();
      
      if (option && Array.isArray(option.grid) && option.grid[gridIndex]) {
        const gridOption = option.grid[gridIndex];
        const dom = this.echartsInstance.getDom();
        const containerWidth = dom.clientWidth;
        const containerHeight = dom.clientHeight;
        
        // 解析left, right, top, height百分比或像素值
        const parsePercent = (value: string | number, isWidth: boolean): number => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.endsWith('%')) {
              const percent = parseFloat(value) / 100;
              return percent * (isWidth ? containerWidth : containerHeight);
            }
            return parseFloat(value) || 0;
          }
          return 0;
        };

        const left = parsePercent(gridOption.left || '10%', true);
        const right = containerWidth - parsePercent(gridOption.right || '10%', true);
        const top = parsePercent(gridOption.top || '10%', false);
        const height = parsePercent(gridOption.height || '50%', false);
        
        const bounds = {
          left,
          right,
          top,
          bottom: top + height
        };

        // 验证bounds是否合理
        if (bounds.right > bounds.left && bounds.bottom > bounds.top && 
            bounds.left >= 0 && bounds.top >= 0 &&
            bounds.right <= containerWidth && bounds.bottom <= containerHeight) {
          return bounds;
        }
      }

      // 方法2: 尝试使用convertToPixel获取实际像素位置
      // 使用数据坐标的最小值和最大值来估算边界
      try {
        // 尝试转换数据坐标 (0, maxValue) 和 (dataLength, minValue) 来估算边界
        const pixel1 = this.echartsInstance.convertToPixel({ gridIndex }, [0, 0]);
        const pixel2 = this.echartsInstance.convertToPixel({ gridIndex }, [100, 100]);
        
        if (Array.isArray(pixel1) && Array.isArray(pixel2) && 
            pixel1.length >= 2 && pixel2.length >= 2) {
          return {
            left: Math.min(pixel1[0], pixel2[0]),
            right: Math.max(pixel1[0], pixel2[0]),
            top: Math.min(pixel1[1], pixel2[1]),
            bottom: Math.max(pixel1[1], pixel2[1])
          };
        }
      } catch (e) {
        // 忽略convertToPixel错误
      }
    } catch (e) {
      // Failed to get grid bounds
    }

    return null;
  }

  /**
   * 判断点是否在指定grid内
   */
  isPointInGrid(pixel: PixelPoint, gridIndex: number): boolean {
    const bounds = this.getGridBounds(gridIndex);
    if (!bounds) return false;

    return (
      pixel.x >= bounds.left &&
      pixel.x <= bounds.right &&
      pixel.y >= bounds.top &&
      pixel.y <= bounds.bottom
    );
  }
}

