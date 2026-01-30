/**
 * 绘图模块全局配置
 * 统一管理所有绘图相关的配置项，方便整体调整
 */
export const DrawingConfig = {
  // ========== 线条配置 ==========
  /** 默认线条颜色 */
  defaultColor: '#FFFFFF',
  
  /** 默认线条宽度 */
  defaultLineWidth: 1,
  
  /** 涨跌颜色方案：'red-up-green-down' 红涨绿跌 | 'green-up-red-down' 绿涨红跌 */
  colorScheme: 'red-up-green-down' as 'red-up-green-down' | 'green-up-red-down',
  
  /**
   * 根据主题获取对应的线条颜色
   * @param theme 主题名称
   * @returns 对应的线条颜色（白色主题下是黑色，其他主题都是白色）
   */
  getColorByTheme: (theme: string): string => {
    return theme === 'light' ? '#000000' : '#FFFFFF';
  },
  
  /** 选中线条的宽度增加值（相对于基础线宽） */
  selectedLineWidthIncrease: 1, // 从 3 减少到 1
  
  /** 选中线条的背景透明度 */
  selectedBackgroundAlpha: 0.3,
  
  /** 悬停/临时线条的虚线样式 */
  dashedLinePattern: [5, 5],
  
  // ========== 端点配置 ==========
  /** 基础端点半径（像素）- 端点圆的大小（中心到边缘的距离） */
  endpointRadius: 0,
  
  /** 高亮端点半径（像素）- 选中/悬停时的端点圆大小 */
  endpointRadiusHighlighted: 2.5,
  
  /** 编辑模式端点半径（像素）- 正在编辑时的端点圆大小 */
  endpointRadiusEditing: 3,
  
  /** 端点标记半径（用于drawPointMarker）- 小标记点的大小 */
  pointMarkerRadius: 1.5,
  
  /** 端点边框宽度（像素）- 端点圆边框的线宽 */
  endpointBorderWidth: 1.5,
  
  /** 高亮端点边框宽度（像素）- 选中/悬停时的端点边框线宽 */
  endpointBorderWidthHighlighted: 2,
  
  /** 端点边框透明度（0-1）- 端点边框到边缘部分的透明度 */
  endpointBorderAlpha: 0.5,
  
  /** 端点填充透明度（0-1）- 端点填充部分的透明度，小于1时填充为半透明 */
  endpointFillAlpha: 0.3,
  
  // ========== 放大镜配置 ==========
  /** 放大镜尺寸（像素） */
  magnifierSize: 120,
  
  /** 放大镜放大倍数 */
  magnifierZoom: 2.5,
  
  /** 放大镜相对于鼠标的X偏移（像素） */
  magnifierOffsetX: 100,
  
  /** 放大镜相对于鼠标的Y偏移（像素） */
  magnifierOffsetY: -100,
  
  /** 放大镜边框宽度 */
  magnifierBorderWidth: 1.5,
  
  /** 放大镜边框颜色 */
  magnifierBorderColor: '#FFFFFF',
  
  /** 放大镜中心点颜色 */
  magnifierCrosshairColor: '#FF0000',
  
  /** 放大镜中心点半径（像素） */
  magnifierCenterPointRadius: 1,
  
  /** 放大镜中心十字线长度（已废弃，改为使用中心点） */
  magnifierCrosshairLength: 3,
  
  /** 放大镜源区域指示圆颜色 */
  magnifierSourceCircleColor: 'rgba(255, 0, 0, 0.5)',
  
  /** 放大镜源区域指示圆虚线样式 */
  magnifierSourceCircleDash: [3, 3],
  
  // ========== 吸附配置 ==========
  /** 吸附到关键点的距离阈值（像素） */
  snapThreshold: 20,
  
  // ========== 交互配置 ==========
  /** 点击检测的阈值（像素） */
  clickThreshold: 5,
  
  /** 悬停检测的阈值（像素） */
  hoverThreshold: 5,
  
  // ========== 历史记录配置 ==========
  /** 历史记录最大数量 */
  maxHistorySize: 50,
} as const;

/**
 * 获取配置值（支持类型安全）
 */
export function getDrawingConfig<T extends keyof typeof DrawingConfig>(
  key: T
): typeof DrawingConfig[T] {
  return DrawingConfig[key];
}

/**
 * 更新配置值（运行时动态修改）
 */
export function updateDrawingConfig<T extends keyof typeof DrawingConfig>(
  key: T,
  value: typeof DrawingConfig[T]
): void {
  (DrawingConfig as any)[key] = value;
}

/**
 * 获取有效的端点半径
 * 根据画线模式自动处理：不在画线模式时返回0
 * @param isDrawingMode 是否在画线模式下
 * @param isHighlighted 是否高亮（选中/悬停）
 * @param isEditing 是否正在编辑
 * @returns 有效的端点半径，如果不在画线模式则返回0
 */
export function getEffectiveEndpointRadius(
  isDrawingMode: boolean,
  isHighlighted: boolean = false,
  isEditing: boolean = false
): number {
  // 如果不在画线模式，半径始终为0
  if (!isDrawingMode) {
    return 0;
  }
  
  // 在画线模式下，根据状态返回对应的半径
  if (isEditing) {
    return DrawingConfig.endpointRadiusEditing;
  }
  if (isHighlighted) {
    return DrawingConfig.endpointRadiusHighlighted;
  }
  
  // 基础半径，如果为0则使用高亮半径作为最小可见半径
  return DrawingConfig.endpointRadius > 0 
    ? DrawingConfig.endpointRadius 
    : DrawingConfig.endpointRadiusHighlighted;
}

/**
 * 获取有效的端点边框宽度
 * @param isDrawingMode 是否在画线模式下
 * @param isHighlighted 是否高亮
 * @returns 有效的端点边框宽度
 */
export function getEffectiveEndpointBorderWidth(
  isDrawingMode: boolean,
  isHighlighted: boolean = false
): number {
  // 如果不在画线模式，边框宽度为0
  if (!isDrawingMode) {
    return 0;
  }
  
  if (isHighlighted) {
    return DrawingConfig.endpointBorderWidthHighlighted;
  }
  
  // 基础边框宽度，如果为0则使用高亮边框宽度
  return DrawingConfig.endpointBorderWidth > 0
    ? DrawingConfig.endpointBorderWidth
    : DrawingConfig.endpointBorderWidthHighlighted;
}

/**
 * 获取有效的点标记半径（用于drawPointMarker）
 * @param isDrawingMode 是否在画线模式下
 * @returns 有效的点标记半径，如果不在画线模式则返回0
 */
export function getEffectivePointMarkerRadius(isDrawingMode: boolean): number {
  return isDrawingMode ? DrawingConfig.pointMarkerRadius : 0;
}
