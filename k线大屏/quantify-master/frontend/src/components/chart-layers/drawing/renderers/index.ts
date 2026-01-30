/**
 * 渲染器注册表
 */
import { DrawingToolType } from '../types.ts';
import { IDrawingRenderer } from './BaseRenderer.ts';
import { RayRenderer } from './RayRenderer.ts';
import { HorizontalRayRenderer } from './HorizontalRayRenderer.ts';
import { SegmentRenderer } from './SegmentRenderer.ts';
import { PriceChannelRenderer } from './PriceChannelRenderer.ts';
import { FibonacciRenderer } from './FibonacciRenderer.ts';
import { GannAngleRenderer } from './GannAngleRenderer.ts';
import { CoordinateSystem } from '../../CoordinateSystem.ts';

export function createRenderer(
  type: DrawingToolType,
  coordinateSystem: CoordinateSystem,
  options?: {
    isEditing?: boolean;
    editingDrawingId?: string | null;
    editingPointIndex?: number;
    selectedDrawingId?: string | null;
  }
): IDrawingRenderer {
  switch (type) {
    case 'ray':
      return new RayRenderer(coordinateSystem);
    case 'horizontal-ray':
      return new HorizontalRayRenderer(coordinateSystem);
    case 'segment':
      return new SegmentRenderer(coordinateSystem);
    case 'price-channel':
      return new PriceChannelRenderer(
        coordinateSystem,
        options?.isEditing,
        options?.editingDrawingId,
        options?.editingPointIndex,
        options?.selectedDrawingId
      );
    case 'fibonacci':
      return new FibonacciRenderer(coordinateSystem);
    case 'gann-angle':
      return new GannAngleRenderer(coordinateSystem);
    default:
      return new SegmentRenderer(coordinateSystem);
  }
}

