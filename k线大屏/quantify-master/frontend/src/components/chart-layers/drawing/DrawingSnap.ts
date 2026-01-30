/**
 * 绘图吸附逻辑
 * 吸附到K线关键点（高、低、开、收）
 */
import { PixelPoint, DataPoint } from '../types.ts';
import { CoordinateSystem } from '../CoordinateSystem.ts';
import { Bounds } from '../types.ts';
import { DrawingConfig } from './DrawingConfig.ts';

export class DrawingSnap {
  constructor(
    private coordinateSystem: CoordinateSystem,
    private klineData: any[],
    private klineBounds: Bounds | null
  ) {}

  /**
   * 吸附到K线关键点（高、低、开、收）
   * 20像素吸附距离：距离关键点在20像素内才会吸附
   */
  snapToKeyPoint(point: PixelPoint): PixelPoint {
    if (!this.klineData || !this.klineBounds) {
      return point;
    }

    const dataPoint = this.coordinateSystem.pixelToData(point, 0);
    if (!dataPoint) {
      return point;
    }

    // 查找附近的K线数据点
    const nearbyIndex = Math.round(dataPoint.index);
    if (nearbyIndex < 0 || nearbyIndex >= this.klineData.length) {
      return point;
    }

    const kline = this.klineData[nearbyIndex];
    if (!kline) {
      return point;
    }

    // 获取关键价格点
    const keyPrices: { price: number }[] = [
      { price: kline.high },
      { price: kline.low },
      { price: kline.open },
      { price: kline.close },
    ];

    // 找到最近的关键点（使用配置的吸附距离限制）
    const snapThreshold = DrawingConfig.snapThreshold;
    let nearestPoint = point;
    let minDist = Infinity;

    for (const { price } of keyPrices) {
      const keyDataPoint: DataPoint = { index: nearbyIndex, value: price };
      const keyPixelPoint = this.coordinateSystem.dataToPixel(keyDataPoint, 0);
      
      if (keyPixelPoint) {
        const dist = Math.sqrt(
          (point.x - keyPixelPoint.x) ** 2 + (point.y - keyPixelPoint.y) ** 2
        );
        if (dist < minDist && dist <= snapThreshold) {
          minDist = dist;
          nearestPoint = keyPixelPoint;
        }
      }
    }

    // 如果找到了最近的关键点（在吸附距离内），返回吸附后的点
    // 否则返回原始点
    return minDist < Infinity && minDist <= snapThreshold ? nearestPoint : point;
  }
}

