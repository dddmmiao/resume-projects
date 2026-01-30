/**
 * 图表实例管理Hook
 */
import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import { buildChartOption, ChartConfigOptions, getLabelData, IndicatorDataCache, getDynamicMargins } from '../utils/chartConfig.ts';
import { setupChartEvents, setupGlobalScrollListener, setupKeyboardListener } from '../utils/chartEvents.ts';
import { KLineData } from '../utils/indicators';
import {
  calculateEXPMA,
  calculateBOLL,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateMA,
  calculateCCI,
  calculateWR,
  calculateDMI,
  calculateOBV,
  calculateSAR,
  calculateTDSequential
} from '../utils/indicators.ts';
import { ChartLayerManager } from '../components/chart-layers/ChartLayerManager.tsx';
import { InteractiveLabelsLayer } from '../components/chart-layers/InteractiveLabelsLayer.ts';
import { CrosshairLayer } from '../components/chart-layers/CrosshairLayer.ts';
import { DrawingLayer } from '../components/chart-layers/DrawingLayer.ts';
import { ChartEvent } from '../components/chart-layers/types.ts';
import { DrawingConfig } from '../components/chart-layers/drawing/DrawingConfig.ts';
import { useAppStore } from '../stores/useAppStore.ts';

export interface UseChartInstanceOptions {
  ts_code: string;
  klineData: KLineData[];
  allKlineData: KLineData[];
  loading: boolean;
  indicator: string;
  // 主图叠加指标（MA / EXPMA / BOLL / SAR / TD 等），支持多选
  mainIndicators?: string[];
  isFullscreen: boolean;
  period: string;
  initialCount: number;
  isSnapMode: boolean;
  theme: string;
  onLatestDataUpdate?: (latestData: KLineData | null) => void;
  onSnapModeChange?: (isSnapMode: boolean) => void;
  onDisplayedDataChange?: (data: any) => void;
  // 移动端优化参数
  isMobile?: boolean;
  showYAxis?: boolean;
  showInfoBar?: boolean;
  enableCrosshair?: boolean;
  colorScheme?: 'red-up-green-down' | 'green-up-red-down';
  showIndicatorLabels?: boolean;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';
}

export interface UseChartInstanceReturn {
  chartRef: React.RefObject<HTMLDivElement>;
  chartInstance: React.MutableRefObject<echarts.ECharts | null>;
  scrollToLatest: () => void;
  isAtLatest: boolean;
  displayedData: KLineData | null;
  drawingLayer: React.RefObject<DrawingLayer | null>;
}

export const useChartInstance = (options: UseChartInstanceOptions): UseChartInstanceReturn => {
  const {
    ts_code,
    klineData,
    allKlineData,
    loading,
    indicator,
    mainIndicators = [],
    isFullscreen,
    period,
    initialCount,
    isSnapMode,
    theme,
    onLatestDataUpdate,
    onSnapModeChange,
    // 移动端优化参数
    isMobile = false,
    showYAxis = true,
    // showInfoBar 在 KLineChart 组件中使用，这里不需要
    enableCrosshair = true,
    colorScheme = 'red-up-green-down',
    showIndicatorLabels = true,
    dataType = 'stock'
  } = options;

  const mainIndicatorsKey = (mainIndicators || []).join(',');

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [displayedData, setDisplayedData] = useState<KLineData | null>(null);
  
  // 图层管理器引用
  const layerManagerRef = useRef<ChartLayerManager | null>(null);
  const labelsLayerRef = useRef<InteractiveLabelsLayer | null>(null);
  const crosshairLayerRef = useRef<CrosshairLayer | null>(null);
  const drawingLayerRef = useRef<DrawingLayer | null>(null);
  
  // 全局十字线模式状态
  const globalCrosshairMode = useAppStore(state => state.crosshairMode);

  // 指标数据源：frontend=前端现算，db=使用K线数据中的指标字段（目前用于 EXPMA: expma_*）
  const indicatorSource = useAppStore(state => state.indicatorSource);
  
  // 指标线显示设置
  const indicatorLineSettings = useAppStore(state => state.indicatorLineSettings);
  
  // 用于更新事件处理器中的状态
  const updateSnapModeRef = useRef<((mode: boolean) => void) | null>(null);
  
  // 🔧 使用ref保存回调函数和数据，避免回调变化触发useEffect重新执行
  const onLatestDataUpdateRef = useRef(onLatestDataUpdate);
  const klineDataRef = useRef(klineData);
  const allKlineDataRef = useRef(allKlineData);
  
  // 同步更新回调ref
  useEffect(() => {
    onLatestDataUpdateRef.current = onLatestDataUpdate;
  }, [onLatestDataUpdate]);
  
  useEffect(() => {
    klineDataRef.current = klineData;
  }, [klineData]);
  
  useEffect(() => {
    allKlineDataRef.current = allKlineData;
  }, [allKlineData]);
  
  // 计算klineData的内容hash（用于依赖数组，检测数据内容变化）
  const klineDataHash = useMemo(() => {
    if (!klineData || klineData.length === 0) return '';
    const lastItem = klineData[klineData.length - 1];
    return `${klineData.length}-${lastItem?.trade_date || ''}`;
  }, [klineData]);
  
  // 使用ref保存最新状态，避免在主配置useEffect中添加依赖
  const currentSnapModeRef = useRef(isSnapMode);
  const currentIndicatorRef = useRef(indicator);
  const currentMainIndicatorsRef = useRef<string[]>(mainIndicators || []);
  const currentInitialCountRef = useRef(initialCount);
  const isInitialMountRef = useRef(true);
  
  // 指标数据缓存（只在数据或指标变化时重新计算）
  const indicatorCacheRef = useRef<IndicatorDataCache>({});
  const cachedDataHashRef = useRef<string>('');
  const cachedIndicatorsKeyRef = useRef<string>('');
  
  // 同步更新ref
  useEffect(() => {
    currentSnapModeRef.current = isSnapMode;
    currentIndicatorRef.current = indicator;
    currentMainIndicatorsRef.current = mainIndicators || [];
    currentInitialCountRef.current = initialCount;
  }, [isSnapMode, indicator, mainIndicators, initialCount]);
  
  // 计算数据hash（用于判断数据是否变化）
  const calculateDataHash = useCallback((data: KLineData[]) => {
    if (!data || data.length === 0) return '';
    // 使用数据长度和最后一条数据的trade_date作为hash
    const lastItem = data[data.length - 1];
    return `${data.length}-${lastItem?.trade_date || ''}`;
  }, []);
  
  // 计算并缓存指标数据（只在数据或指标集合变化时执行）
  const computeAndCacheIndicators = useCallback((chartData: KLineData[], activeIndicators: string[]): IndicatorDataCache => {
    const dataHash = calculateDataHash(chartData);
    // 唯一化并排序当前需要的指标集合，用于缓存key
    const uniqueIndicators = Array.from(new Set((activeIndicators || []).filter(Boolean)));
    const indicatorsKey = `${uniqueIndicators.sort().join('|')}|indicator_source:${indicatorSource}`;

    // 如果数据和指标集合都没变化，直接返回缓存
    if (dataHash === cachedDataHashRef.current && indicatorsKey === cachedIndicatorsKeyRef.current) {
      return indicatorCacheRef.current;
    }

    // 如果数据变化，清除所有缓存（因为数据变化意味着所有指标都需要重新计算）
    const cache: IndicatorDataCache = dataHash !== cachedDataHashRef.current ? {} : { ...indicatorCacheRef.current };

    // 根据需要的指标类型，只计算缺失的指标
    for (const ind of uniqueIndicators) {
      switch (ind) {
        case 'expma':
          if (!cache.expmaData) {
            if (indicatorSource === 'db') {
              // 从 DB 读取各周期 EXPMA 数据
              const dbExpma5 = chartData.map(d => (d.expma_5 ?? null) as unknown as number);
              const dbExpma10 = chartData.map(d => (d.expma_10 ?? null) as unknown as number);
              const dbExpma20 = chartData.map(d => (d.expma_20 ?? null) as unknown as number);
              const dbExpma60 = chartData.map(d => (d.expma_60 ?? null) as unknown as number);
              const dbExpma250 = chartData.map(d => (d.expma_250 ?? null) as unknown as number);
              
              // 检查哪些周期缺数据
              const has5 = dbExpma5.some(v => v !== null);
              const has10 = dbExpma10.some(v => v !== null);
              const has20 = dbExpma20.some(v => v !== null);
              const has60 = dbExpma60.some(v => v !== null);
              const has250 = dbExpma250.some(v => v !== null);
              
              // 兜底：只在有缺失时才前端现算
              const needFallback = !has5 || !has10 || !has20 || !has60 || !has250;
              const frontendCalc = needFallback ? calculateEXPMA(chartData) : null;
              
              cache.expmaData = {
                expma5: has5 ? dbExpma5 : frontendCalc!.expma5,
                expma10: has10 ? dbExpma10 : frontendCalc!.expma10,
                expma20: has20 ? dbExpma20 : frontendCalc!.expma20,
                expma60: has60 ? dbExpma60 : frontendCalc!.expma60,
                expma250: has250 ? dbExpma250 : frontendCalc!.expma250,
              };
            } else {
              cache.expmaData = calculateEXPMA(chartData);
            }
          }
          break;
        case 'boll':
          if (!cache.bollData) cache.bollData = calculateBOLL(chartData);
          break;
        case 'macd':
          if (!cache.macdData) cache.macdData = calculateMACD(chartData);
          break;
        case 'rsi':
          if (!cache.rsiData) cache.rsiData = calculateRSI(chartData);
          break;
        case 'kdj':
          if (!cache.kdjData) cache.kdjData = calculateKDJ(chartData);
          break;
        case 'ma':
          if (!cache.maData) cache.maData = calculateMA(chartData);
          break;
        case 'cci':
          if (!cache.cciData) cache.cciData = calculateCCI(chartData);
          break;
        case 'wr':
          if (!cache.wrData) cache.wrData = calculateWR(chartData);
          break;
        case 'dmi':
          if (!cache.dmiData) cache.dmiData = calculateDMI(chartData);
          break;
        case 'obv':
          if (!cache.obvData) cache.obvData = calculateOBV(chartData);
          break;
        case 'sar':
          if (!cache.sarData) cache.sarData = calculateSAR(chartData);
          break;
        case 'td':
          if (!cache.tdData) cache.tdData = calculateTDSequential(chartData);
          break;
        case 'none':
        case 'vol':
        case 'auction':
          // 这些指标不需要计算技术指标
          break;
        default:
          break;
      }
    }

    // 更新缓存引用
    indicatorCacheRef.current = cache;
    cachedDataHashRef.current = dataHash;
    cachedIndicatorsKeyRef.current = indicatorsKey;

    return cache;
  }, [calculateDataHash, indicatorSource]);
  
  // ========== DataZoom 状态管理 ==========
  const dataZoomStateRef = useRef<{ start: number; end: number } | null>(null);
  const isRestoringDataZoomRef = useRef(false);

  // 提取 dataZoom 保存和恢复的工具函数
  const saveCurrentDataZoom = useCallback((): { start: number; end: number } | null => {
    if (!chartInstance.current) return null;
    const currentOption: any = chartInstance.current.getOption();
    const currentDataZoom = currentOption?.dataZoom?.[0];
    if (currentDataZoom && typeof currentDataZoom.start === 'number' && typeof currentDataZoom.end === 'number') {
      const saved = { start: currentDataZoom.start, end: currentDataZoom.end };
      dataZoomStateRef.current = saved;
      return saved;
    }
    return null;
  }, []);

  const restoreDataZoom = useCallback((savedZoom: { start: number; end: number } | null) => {
    if (!savedZoom || !chartInstance.current) return;
    
    isRestoringDataZoomRef.current = true;
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      start: savedZoom.start,
      end: savedZoom.end,
      xAxisIndex: [0, 1]
    });
    
    setTimeout(() => {
      isRestoringDataZoomRef.current = false;
    }, 100);
  }, []);

  // 快速滚动到最新位置的函数
  const scrollToLatest = useCallback(() => {
    if (!chartInstance.current || allKlineData.length === 0) return;

    const totalDataPoints = allKlineData.length;
    const currentOption: any = chartInstance.current.getOption();
    const dataZoomOption = currentOption?.dataZoom?.[0];

    // 目标结束位置：真正的最新日期（100%）
    let newStart: number;
    const newEnd = 100;

    if (dataZoomOption && typeof dataZoomOption.start === 'number' && typeof dataZoomOption.end === 'number') {
      // 保持当前显示跨度，只移动到最新位置
      const currentSpan = dataZoomOption.end - dataZoomOption.start;
      newStart = Math.max(0, newEnd - currentSpan);
    } else {
      // 初始状态：显示最近的 initialCount 根K线
      newStart = Math.max(0, 100 - (initialCount / totalDataPoints) * 100);
    }
      
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      start: newStart,
      end: newEnd
    });
    
    // 更新保存的状态
    dataZoomStateRef.current = { start: newStart, end: newEnd };
    setIsAtLatest(true);
  }, [allKlineData.length, initialCount]);

  // 应用已保存的 dataZoom 范围（初始化时使用）
  const applySavedDataZoom = useCallback(() => {
    if (dataZoomStateRef.current) {
      restoreDataZoom(dataZoomStateRef.current);
    }
  }, [restoreDataZoom]);

  // 图表resize辅助函数（使用RAF确保DOM更新后再resize）
  const resizeChartWithDelay = useCallback((delay: number = 100, applyDataZoom: boolean = true) => {
    const timer = setTimeout(() => {
      if (!chartInstance.current || chartInstance.current.isDisposed()) return;
      
      // 使用双重RAF确保在DOM完全渲染后执行
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (chartInstance.current && !chartInstance.current.isDisposed()) {
            chartInstance.current.resize();
            if (applyDataZoom) {
              applySavedDataZoom();
            }
            // 标记初始化完成
            isInitialMountRef.current = false;
          }
        });
      });
    }, delay);
    
    return () => clearTimeout(timer);
  }, [applySavedDataZoom]);

  
  // 图表实例初始化
  useEffect(() => {
    if (klineData.length === 0 || !chartRef.current) {
      return;
    }

    if (!chartInstance.current || chartInstance.current.isDisposed()) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: 'canvas',
        useDirtyRect: false
      });

      // 设置 dataZoom 监听器（带节流优化）
      let lastDataZoomBroadcastTime = 0;
      let pendingDataZoomBroadcast: ReturnType<typeof setTimeout> | null = null;
      let lastDataZoomState: { start: number; end: number } | null = null;
      
      chartInstance.current.on('datazoom', () => {
        // 如果正在恢复dataZoom，不更新状态（避免覆盖恢复的值）
        if (isRestoringDataZoomRef.current) {
          return;
        }
        const opt: any = chartInstance.current?.getOption?.();
        const dz = opt?.dataZoom?.[0];
        if (dz && typeof dz.start === 'number' && typeof dz.end === 'number') {
          // 保存当前的dataZoom状态
          dataZoomStateRef.current = {
            start: dz.start,
            end: dz.end
          };
          // 计算目标结束位置（基于klineData在allKlineData中的位置）
          // 如果有截断，目标位置 < 100%；否则为100%
          const allLength = allKlineDataRef.current.length;
          const targetEnd = klineDataRef.current.length > 0 && allLength > 0
            ? (klineDataRef.current.length / allLength) * 100
            : 100;
          // 当用户滚动到目标位置附近（±0.5%）时，认为"到达目标"
          setIsAtLatest(dz.end >= targetEnd - 0.5);
          
          // 图表联动：广播dataZoom变化到全局store（带节流）
          const { chartSyncEnabled, setGlobalDataZoom } = useAppStore.getState();
          if (chartSyncEnabled) {
            // 检查值是否真正变化（避免重复广播）
            if (lastDataZoomState && 
                Math.abs(lastDataZoomState.start - dz.start) < 0.01 && 
                Math.abs(lastDataZoomState.end - dz.end) < 0.01) {
              return;
            }
            lastDataZoomState = { start: dz.start, end: dz.end };
            
            // 节流：16ms内只执行一次（≈60fps）
            const now = Date.now();
            const broadcast = () => {
              setGlobalDataZoom({
                start: lastDataZoomState!.start,
                end: lastDataZoomState!.end,
                sourceId: ts_code,
                timestamp: Date.now()
              });
            };
            
            if (now - lastDataZoomBroadcastTime >= 16) {
              lastDataZoomBroadcastTime = now;
              broadcast();
            } else if (!pendingDataZoomBroadcast) {
              // 确保最后一次更新不会丢失
              pendingDataZoomBroadcast = setTimeout(() => {
                pendingDataZoomBroadcast = null;
                lastDataZoomBroadcastTime = Date.now();
                broadcast();
              }, 16 - (now - lastDataZoomBroadcastTime));
            }
          }
        }

        // 更新图层管理器的坐标系统
        if (layerManagerRef.current) {
          layerManagerRef.current.updateEChartsInstance(chartInstance.current);
        }

        // 通知画线层重新计算坐标（延迟执行，确保ECharts已完成坐标转换）
        setTimeout(() => {
          if (drawingLayerRef.current) {
            drawingLayerRef.current.notifyCoordinateUpdate();
          }
        }, 0);
      });

      // 确保尺寸正确 - 延迟执行，确保容器已渲染
      return resizeChartWithDelay(100, true);
    } else {
      // 图表已存在，也需要resize确保尺寸正确
      return resizeChartWithDelay(100, true);
    }
  }, [klineData.length, resizeChartWithDelay, ts_code]);

  // 初始化图层系统
  useEffect(() => {
    if (!chartRef.current || !chartInstance.current) return;

    const container = chartRef.current;
    const instance = chartInstance.current;

    // 清理旧的图层管理器（如果存在）
    // 确保所有图层都被正确销毁，避免重复创建导致的渲染问题
    if (layerManagerRef.current) {
      // 先销毁各个图层的引用
      if (drawingLayerRef.current) {
        drawingLayerRef.current.destroy();
        drawingLayerRef.current = null;
      }
      if (crosshairLayerRef.current) {
        crosshairLayerRef.current.destroy();
        crosshairLayerRef.current = null;
      }
      if (labelsLayerRef.current) {
        labelsLayerRef.current.destroy();
        labelsLayerRef.current = null;
      }
      // 最后销毁管理器（会清理所有剩余的图层）
      layerManagerRef.current.destroy();
      layerManagerRef.current = null;
    }

    // 创建图层管理器
    const manager = new ChartLayerManager(instance);
    manager.setContainer(container);
    layerManagerRef.current = manager;

    // 获取标签数据（支持主图多指标叠加）
    const labelData = getLabelData(indicator, mainIndicators);
    
    // 使用动态边距计算（根据Y轴刻度值字符宽度）
    const margins = getDynamicMargins(klineDataRef.current, isMobile, isFullscreen, showYAxis);
    const leftMarginPercent = parseInt(margins.left.replace('%', ''));
    const leftMarginPx = (container.offsetWidth * leftMarginPercent) / 100;

    // 延迟获取grid边界，确保ECharts已经渲染完成
    const initLayers = () => {
      const klineBounds = manager.getCoordinateSystem().getGridBounds(0);
      const volumeBounds = manager.getCoordinateSystem().getGridBounds(1);
      
      // 创建交互式标签层
      if (showIndicatorLabels && enableCrosshair) {
        const labelsLayer = new InteractiveLabelsLayer(
          container,
          manager.getCoordinateSystem(),
          {
            klineLabels: labelData.klineLabels.map(l => ({ ...l, value: undefined })),
            volumeLabels: labelData.volumeLabels.map(l => ({ ...l, value: undefined })),
            theme,
            leftMargin: leftMarginPx,
            klineBounds: klineBounds ? { top: klineBounds.top, bottom: klineBounds.bottom } : null,
            volumeBounds: volumeBounds ? { top: volumeBounds.top, bottom: volumeBounds.bottom } : null,
            onLabelClick: (label) => {
              // 标签点击处理（后续可扩展）
            }
          }
        );
        manager.addLayer(labelsLayer);
        labelsLayerRef.current = labelsLayer;
      }

      // 创建十字线层（使用当前全局模式）
      if (enableCrosshair && klineBounds && volumeBounds) {
        // 销毁已存在的实例，避免事件监听器重复注册
        if (crosshairLayerRef.current) {
          try {
            crosshairLayerRef.current.destroy();
            manager.removeLayer(crosshairLayerRef.current);
          } catch (err) {
            // 静默处理销毁错误
          }
          crosshairLayerRef.current = null;
        }
        
        const currentMode = useAppStore.getState().crosshairMode;
        const crosshairLayer = new CrosshairLayer(
          container,
          manager.getCoordinateSystem(),
          {
            // 🔧 使用allKlineData（完整数据）以支持拖动到截断日期之后的数据
            klineData: allKlineDataRef.current,
            klineBounds,
            volumeBounds,
            theme,
            crosshairMode: currentMode,
            isMobile,
            isFullscreen,
            onDataUpdate: (data) => {
              if (data) setDisplayedData(data);
              // 使用ref访问最新的回调，避免闭包捕获旧值
              if (onLatestDataUpdateRef.current) onLatestDataUpdateRef.current(data);
            },
            onCrosshairPositionChange: (() => {
              // 去重：相同日期不重复广播
              let lastTradeDate: string | null = null;
              let pendingBroadcast: ReturnType<typeof setTimeout> | null = null;
              
              return (tradeDate: string | null) => {
                // 十字线联动：广播到全局store（排除全屏场景）
                if (isFullscreen) return;
                const { chartSyncEnabled, setGlobalCrosshairPosition } = useAppStore.getState();
                if (!chartSyncEnabled) return;
                
                // null（清除）始终立即执行，不受去重和节流影响
                if (tradeDate === null) {
                  if (pendingBroadcast) {
                    clearTimeout(pendingBroadcast);
                    pendingBroadcast = null;
                  }
                  lastTradeDate = null;
                  setGlobalCrosshairPosition(null);
                  return;
                }
                
                // 非null时：如果日期没变，跳过（去重已足够，无需额外节流）
                if (tradeDate === lastTradeDate) return;
                lastTradeDate = tradeDate;
                
                // 直接广播，不节流（去重已保证不会过度更新）
                setGlobalCrosshairPosition({ tradeDate, sourceId: ts_code, timestamp: Date.now() });
              };
            })(),
            onCrosshairStateChange: (hasCrosshair: boolean) => {
              // 十字线关闭时，将显示数据恢复为最新一根并回调给外部（用于卡片header数值）
              if (!hasCrosshair) {
                try {
                  // 使用ref访问最新的klineData，避免闭包捕获旧值
                  const currentKlineData = klineDataRef.current;
                  const latest = currentKlineData && currentKlineData.length > 0 ? currentKlineData[currentKlineData.length - 1] : null;
                  if (latest) {
                    setDisplayedData(latest);
                    if (onLatestDataUpdateRef.current) onLatestDataUpdateRef.current(latest);
                  }
                } catch (err) {
                  // ignore
                }
              }
              if (isMobile && chartInstance.current && !chartInstance.current.isDisposed()) {
                // 移动端：区分列表小图（isSmallMobile）和其它模式（例如详情页全屏）
                const isSmallMobile = isMobile && !isFullscreen;
                try {
                  requestAnimationFrame(() => {
                    if (!chartInstance.current || chartInstance.current.isDisposed()) return;
                    try {
                      const option: any = chartInstance.current.getOption();
                      if (option.dataZoom && option.dataZoom[0]) {
                        const dz = option.dataZoom[0];

                        if (isSmallMobile) {
                          // 🔧 移动端列表小图：dataZoom 的拖动/缩放完全由 Hammer.js 接管
                          // 这里避免修改 moveOnMouseMove / moveOnMouseWheel / zoomOnMouseWheel，
                          // 只通过 disabled 控制是否允许 Hammer 参与，防止与 ECharts 内置交互叠加导致抖动。
                          dz.disabled = hasCrosshair;
                        } else {
                          // 移动端非小图（如详情页全屏）：保留原有逻辑，十字线激活时关闭 dataZoom 的平移/缩放
                          dz.moveOnMouseMove = !hasCrosshair;
                          dz.zoomOnMouseWheel = !hasCrosshair;
                          dz.moveOnMouseWheel = !hasCrosshair;
                        }

                        chartInstance.current.setOption(option, { replaceMerge: ['dataZoom'] });
                      }
                    } catch (err) {
                      // 静默处理错误
                    }
                  });
                } catch (err) {
                  // 静默处理错误
                }
              }
            }
          }
        );
        manager.addLayer(crosshairLayer);
        crosshairLayerRef.current = crosshairLayer;
      }

      // 创建画线层
      // 移动端：仅在详情页全屏时启用（enableCrosshair=true）
      // 桌面端：enableCrosshair=true 时创建画线层，但只在全屏时启用交互
      // 列表页（enableCrosshair=false）不创建画线层
      // 未展开的卡片也创建画线层（用于显示已画的线），但禁用交互
      if (enableCrosshair && klineBounds) {
        // 保存进入画线模式前的十字线模式
        let previousCrosshairMode: number | null = null;
        
        const drawingLayer = new DrawingLayer(
          container,
          manager.getCoordinateSystem(),
          {
            klineData,
            klineBounds,
            theme,
            enableDrawing: isFullscreen, // 只在全屏时启用交互
            defaultColor: DrawingConfig.getColorByTheme(theme),
            defaultLineWidth: DrawingConfig.defaultLineWidth,
            isMobile, // 传递移动端标识
            onDrawingUpdate: (drawings) => {
              // 保存绘图数据到localStorage（按ts_code保存，支持跨卡片共享）
              // 注意：不保存颜色字段，颜色应该根据当前主题动态设置
              if (ts_code) {
                try {
                  const key = `drawings_${ts_code}`;
                  // 移除 color 字段后再保存
                  const drawingsWithoutColor = drawings.map(({ color, ...rest }) => rest);
                  localStorage.setItem(key, JSON.stringify(drawingsWithoutColor));
                } catch (error) {
                  // localStorage可能已满或不可用，静默失败
                  // Failed to save drawings to localStorage
                }
              }
            },
            onToolChange: (tool) => {
              // 进入画线模式时，关闭十字线（模式0）
              // 退出画线模式时，恢复之前的十字线模式
              if (tool) {
                // 有工具或进入画线模式：关闭十字线（模式0）
                if (previousCrosshairMode === null && crosshairLayerRef.current) {
                  previousCrosshairMode = crosshairLayerRef.current.getMode();
                  // 使用临时模式覆盖全局模式，设置为0（无十字线）
                  crosshairLayerRef.current.setTempMode(0);
                }
              } else {
                // 工具为null：退出画线模式
                // 检查 DrawingLayer 是否还在画线模式（可能是取消工具选择但仍在画线模式）
                const isStillInDrawingMode = drawingLayerRef.current?.getDrawingMode();
                if (!isStillInDrawingMode && previousCrosshairMode !== null && crosshairLayerRef.current) {
                  // 确实退出了画线模式，恢复十字线
                  crosshairLayerRef.current.setTempMode(null);
                  previousCrosshairMode = null;
                }
              }
            }
          }
        );
        manager.addLayer(drawingLayer);
        drawingLayerRef.current = drawingLayer;
        
        // 加载之前保存的绘图数据（如果存在）
        // 无论是否全屏，都加载画线数据（未展开的卡片也需要显示已画的线）
        if (drawingLayerRef.current && ts_code && drawingLayerRef.current === drawingLayer) {
          try {
            const key = `drawings_${ts_code}`;
            const saved = localStorage.getItem(key);
            if (saved) {
              const drawings = JSON.parse(saved);
              if (Array.isArray(drawings) && drawings.length > 0) {
                // 根据当前主题设置颜色
                const currentColor = DrawingConfig.getColorByTheme(theme);
                const drawingsWithColor = drawings.map(drawing => ({
                  ...drawing,
                  color: currentColor, // 使用当前主题的颜色
                }));
                drawingLayer.loadDrawings(drawingsWithColor);
              }
            }
          } catch (error) {
            // Failed to load drawings from localStorage
          }
        }
      }
    };

    // 延迟到下一帧初始化，确保ECharts已经完成布局
    let rafId: number | null = null;
    rafId = requestAnimationFrame(() => {
      initLayers();
    });

    return () => {
      // 先取消未完成的图层初始化，避免销毁后再创建新图层
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // 再清理各个图层的引用，确保不会继续使用
      if (drawingLayerRef.current) {
        drawingLayerRef.current.destroy();
        drawingLayerRef.current = null;
      }
      if (crosshairLayerRef.current) {
        crosshairLayerRef.current.destroy();
        crosshairLayerRef.current = null;
      }
      if (labelsLayerRef.current) {
        labelsLayerRef.current.destroy();
        labelsLayerRef.current = null;
      }
      // 最后销毁管理器（会清理所有图层）
      if (manager) {
        manager.destroy();
      }
      layerManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isFullscreen,
    // 🔧 移除 onLatestDataUpdate - 通过ref访问，避免回调变化触发重建
    loading,
    indicator,
    // 🔧 使用 mainIndicators 的稳定字符串形式，避免数组引用变化导致重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
    mainIndicators?.join(',') || '',
    // theme 不在这里，因为主题变化不应该重新创建图层系统，只需要更新配置
    showIndicatorLabels,
    // 🔧 enableCrosshair不在这里，由单独的useEffect处理动态创建
    isMobile,
    showYAxis,
    // 🔧 使用 allKlineData.length 作为依赖（数据量变化时重建）
    // tradeDate 变化导致的 klineData 截断由单独的 useEffect 处理 dataZoom 调整
    allKlineData.length,
    ts_code
  ]);
  
  // 监听全局十字线模式变化，同步更新所有卡片
  useEffect(() => {
    if (crosshairLayerRef.current) {
      const currentMode = crosshairLayerRef.current.getMode();
      // 仅在模式真正变化时更新，避免循环更新
      if (currentMode !== globalCrosshairMode) {
        crosshairLayerRef.current.updateConfig({ crosshairMode: globalCrosshairMode });
      }
    }
  }, [globalCrosshairMode]);

  // 监听主题变化，更新所有图层配置
  useEffect(() => {
    const newColor = DrawingConfig.getColorByTheme(theme);
    
    // 更新十字线层主题
    if (crosshairLayerRef.current) {
      crosshairLayerRef.current.updateConfig({ theme });
    }
    
    // 更新标签层主题
    if (labelsLayerRef.current) {
      labelsLayerRef.current.updateConfig({ theme });
    }
    
    // 更新画线层主题和颜色
    if (drawingLayerRef.current) {
      drawingLayerRef.current.updateConfig({ 
        defaultColor: newColor,
        theme 
      });
      
      // 更新所有已有线条的颜色以匹配新主题
      const drawings = drawingLayerRef.current.getDrawings();
      if (drawings.length > 0) {
        const updatedDrawings = drawings.map(drawing => ({
          ...drawing,
          color: newColor
        }));
        drawingLayerRef.current.loadDrawings(updatedDrawings);
      }
    }
  }, [theme]);


  // 更新图层数据
  useEffect(() => {
    if (!layerManagerRef.current) return;

    // 更新图层管理器的坐标系统
    layerManagerRef.current.updateEChartsInstance(chartInstance.current);

    // 更新十字线层数据（使用allKlineData以支持截断日期之后的数据）
    if (crosshairLayerRef.current) {
      crosshairLayerRef.current.update({ klineData: allKlineData });
      // 更新十字线层的bounds（当指标改变时，bounds可能会变化）
      const klineBounds = layerManagerRef.current.getCoordinateSystem().getGridBounds(0);
      const volumeBounds = layerManagerRef.current.getCoordinateSystem().getGridBounds(1);
      if (klineBounds && volumeBounds) {
        crosshairLayerRef.current.updateConfig({ klineBounds, volumeBounds });
      }
    }

    // 更新画线层的bounds和重新计算坐标
    if (drawingLayerRef.current) {
      const klineBounds = layerManagerRef.current.getCoordinateSystem().getGridBounds(0);
      if (klineBounds) {
        drawingLayerRef.current.updateConfig({ klineBounds });
        // 延迟重新计算，确保坐标系统已更新
        setTimeout(() => {
          if (drawingLayerRef.current) {
            drawingLayerRef.current.notifyCoordinateUpdate();
          }
        }, 0);
      }
    }
    if (labelsLayerRef.current && chartRef.current) {
      // 使用动态边距计算（根据Y轴刻度值字符宽度）
      const margins = getDynamicMargins(klineData, isMobile, isFullscreen, showYAxis);
      const leftMarginPercent = parseInt(margins.left.replace('%', ''));
      const leftMarginPx = (chartRef.current.offsetWidth * leftMarginPercent) / 100;
      
      const klineBounds = layerManagerRef.current?.getCoordinateSystem().getGridBounds(0);
      const volumeBounds = layerManagerRef.current?.getCoordinateSystem().getGridBounds(1);
      
      labelsLayerRef.current.updateConfig({
        leftMargin: leftMarginPx,
        klineBounds: klineBounds ? { top: klineBounds.top, bottom: klineBounds.bottom } : null,
        volumeBounds: volumeBounds ? { top: volumeBounds.top, bottom: volumeBounds.bottom } : null
      });
    }
  }, [klineData, allKlineData, showYAxis, isMobile, isFullscreen]);

  // 设置图表事件处理 - 将事件传递给图层管理器
  // 注意：当 indicator / mainIndicators / isFullscreen 等变化时，会重新创建图层管理器和十字线层
  // 因此这里需要在这些依赖变化时重新绑定事件监听器，避免事件仍然指向已销毁的旧 manager
  useEffect(() => {
    if (!chartInstance.current || !chartRef.current || !enableCrosshair || !layerManagerRef.current) return;

    const container = chartRef.current;
    const manager = layerManagerRef.current;

    // 包装最新数据更新回调：同步更新内部 displayedData 状态，并透传给外部
    const handleLatestDataUpdate = (latest: KLineData | null) => {
      if (latest) setDisplayedData(latest);
      if (onLatestDataUpdate) onLatestDataUpdate(latest);
    };

    // 创建事件转换函数
    const createChartEvent = (e: MouseEvent | TouchEvent): ChartEvent => {
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0 : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0 : e.clientY;
      return {
        type: e.type as ChartEvent['type'],
        clientX,
        clientY,
        target: e.target,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation()
      };
    };

    // 鼠标移动事件 - 传递给图层管理器（不阻止默认行为，允许ECharts交互）
    const handleMouseMove = (e: MouseEvent) => {
      const event = createChartEvent(e);
      manager.handleEvent(event);
      // 即使图层处理了事件，也不阻止默认行为，允许ECharts的dataZoom等工作
      // 只在特定情况下阻止（比如拖动十字线时）
    };

    // 鼠标按下事件
    const handleMouseDown = (e: MouseEvent) => {
      const event = createChartEvent(e);
      manager.handleEvent(event);
      // 如果图层处理了（比如点击在十字线上），可能需要阻止默认行为
      // 否则让ECharts处理（缩放、拖动等）
    };

    // 鼠标抬起事件
    const handleMouseUp = (e: MouseEvent) => {
      const event = createChartEvent(e);
      manager.handleEvent(event);
    };

    // 点击事件
    const handleClick = (e: MouseEvent) => {
      const event = createChartEvent(e);
      manager.handleEvent(event);
    };

    // 触摸事件（移动端需要阻止默认行为以支持拖动十字线）
    const handleTouchStart = (e: TouchEvent) => {
      const event = createChartEvent(e);
      const shouldPreventDefault = manager.handleEvent(event);
      if (shouldPreventDefault) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const event = createChartEvent(e);
      const shouldPreventDefault = manager.handleEvent(event);
      if (shouldPreventDefault) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const event = createChartEvent(e);
      manager.handleEvent(event);
    };

    // 鼠标离开容器事件 - 确保快速移出时也能清除十字线
    // 移动端跳过此逻辑，避免触摸其他卡片时触发合成的mouseleave事件导致十字线消失
    const handleMouseLeave = () => {
      if (isMobile) return;
      if (crosshairLayerRef.current) {
        crosshairLayerRef.current.clearCrosshair();
      }
    };

    // 绑定事件监听器（始终使用当前的 layerManager 实例）
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('click', handleClick);
    container.addEventListener('mouseleave', handleMouseLeave);
    // 移动端触摸事件需要设置 passive: false 以便可以阻止默认行为
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    // 保留其他事件处理（双击、键盘等）
    const result = setupChartEvents({
      chartInstance: chartInstance.current,
      isSnapMode: currentSnapModeRef.current,
      isMobile,
      isFullscreen,
      handlers: {
        onLatestDataUpdate: handleLatestDataUpdate,
        onSnapModeChange,
        scrollToLatest
      }
    });

    // 获取清理和更新函数
    const cleanupFn = typeof result === 'object' && result ? result.cleanup : (result as () => void);
    const updateSnapModeFn = typeof result === 'object' && result ? result.updateSnapMode : undefined;
    
    if (updateSnapModeFn) {
      updateSnapModeRef.current = updateSnapModeFn;
    }

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('mouseleave', handleMouseLeave);
      // 移除时需要匹配相同的选项
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      if (cleanupFn) cleanupFn();
    };
  }, [
    klineData,
    isMobile,
    onLatestDataUpdate,
    onSnapModeChange,
    scrollToLatest,
    loading,
    enableCrosshair,
    indicator,
    mainIndicators,
    isFullscreen,
    showYAxis,
  ]); // 移除 isSnapMode 依赖，改为依赖 indicator/mainIndicators/isFullscreen 等以在重建图层时重新绑定事件

  // 同步事件处理器中的十字线模式状态
  useEffect(() => {
    updateSnapModeRef.current?.(isSnapMode);
  }, [isSnapMode]);


  // 设置全局滚动监听器
  useEffect(() => {
    const cleanup = setupGlobalScrollListener(ts_code, scrollToLatest);
    return cleanup;
  }, [ts_code, scrollToLatest]);

  // 设置键盘监听器
  useEffect(() => {
    const cleanup = setupKeyboardListener(scrollToLatest);
    return cleanup;
  }, [scrollToLatest]);

  // ========== 指标计算和缓存（只在数据或指标集合变化时执行）==========
  useEffect(() => {
    if (klineData.length === 0) return;

    const chartData = allKlineData.length > 0 ? allKlineData : klineData;
    // 当前需要的指标集合 = 主图叠加指标 + 当前副图指标
    const activeIndicators: string[] = [
      ...(mainIndicators || []),
      indicator
    ].filter(Boolean);

    // 计算并缓存指标（只在数据或指标集合变化时执行）
    computeAndCacheIndicators(chartData, activeIndicators);
  }, [klineData, allKlineData, indicator, mainIndicators, loading, computeAndCacheIndicators]);

  // ========== 图表配置更新 ==========
  // 主要图表配置更新（配置变化时使用缓存的指标数据，不重新计算）
  useEffect(() => {
    if (!chartInstance.current || klineData.length === 0) {
      return;
    }
    
    const chartConfigOptions: ChartConfigOptions = {
      klineData,
      allKlineData,
      indicator: currentIndicatorRef.current,
      mainIndicators: currentMainIndicatorsRef.current,
      isFullscreen,
      initialCount,
      loading,
      theme,
      isMobile,
      showYAxis,
      colorScheme,
      showIndicatorLabels,
      hasPlayedInitialAnimation: true,
      dataType,
      // 传入缓存的指标数据，避免重复计算
      cachedIndicators: indicatorCacheRef.current,
      // 指标线显示设置
      indicatorLineSettings
    };

    const option = buildChartOption(chartConfigOptions);
    // 小图（移动端列表）完全禁用 ECharts series 交互，避免内部 data 命中逻辑
    if (isMobile && !isFullscreen && Array.isArray((option as any).series)) {
      (option as any).series = (option as any).series.map((s: any) => ({
        ...s,
        silent: true,
      }));
    }
    
    // 使用完全替换模式更新图表
    chartInstance.current.setOption(option, {
      notMerge: true,  // 完全替换而不是合并
      lazyUpdate: false,  // 立即更新
      silent: true
    });
  }, [
    klineData, 
    allKlineData, 
    isFullscreen, 
    period, 
    initialCount, 
    loading,
    theme, 
    isMobile, 
    showYAxis, 
    colorScheme, 
    showIndicatorLabels, 
    saveCurrentDataZoom, 
    dataType,
    mainIndicatorsKey,
    indicatorLineSettings,
  ]);
  
  // 监听 initialCount 变化，更新显示范围
  useEffect(() => {
    // 跳过初始化时的第一次渲染（此时图表配置巷经包含了正确的 initialCount）
    if (isInitialMountRef.current) return;
    
    if (!chartInstance.current || allKlineData.length === 0) return;
    
    // 清除保存的 dataZoom 状态，强制重新计算范围
    dataZoomStateRef.current = null;
    
    // 计算新的显示范围
    const totalDataPoints = allKlineData.length;
    const newStart = Math.max(0, 100 - (initialCount / totalDataPoints) * 100);
    const newEnd = 100;
    
    // 应用新的显示范围
    isRestoringDataZoomRef.current = true;
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      start: newStart,
      end: newEnd,
      xAxisIndex: [0, 1]
    });
    
    // 保存新的状态
    dataZoomStateRef.current = { start: newStart, end: newEnd };
    setIsAtLatest(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCount, allKlineData.length]);

  // 监听klineData内容变化（tradeDate截断），调整可见范围到截断位置
  const prevKlineDataHashRef = useRef<string>('');
  useEffect(() => {
    // 只有hash真正变化时才处理（初始化时prevKlineDataHashRef为空，会执行）
    if (prevKlineDataHashRef.current === klineDataHash) return;
    prevKlineDataHashRef.current = klineDataHash;
    
    if (klineData.length === 0 || allKlineData.length === 0) return;
    
    // 计算是否有截断
    const truncatedLength = klineData.length;
    const totalLength = allKlineData.length;
    const isTruncated = truncatedLength < totalLength;
    
    // 初始化时设置isAtLatest状态（不需要图表实例）
    setIsAtLatest(!isTruncated);
    
    // 只有图表实例存在时才调整dataZoom
    if (!chartInstance.current) return;
    
    // 计算klineData在allKlineData中的结束位置（百分比）
    // 图表使用allKlineData渲染，但可见范围应结束于klineData的末尾（tradeDate截断位置）
    const newEnd = (truncatedLength / totalLength) * 100;
    const visibleSpan = (initialCount / totalLength) * 100;
    const newStart = Math.max(0, newEnd - visibleSpan);
    
    isRestoringDataZoomRef.current = true;
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      start: newStart,
      end: newEnd,
      xAxisIndex: [0, 1]
    });
    
    dataZoomStateRef.current = { start: newStart, end: newEnd };
    
    setTimeout(() => {
      isRestoringDataZoomRef.current = false;
    }, 100);
  }, [klineDataHash, klineData.length, allKlineData.length, initialCount]);

  // 图表联动：监听全局dataZoom变化，应用到当前图表
  const globalDataZoom = useAppStore(state => state.globalDataZoom);
  const chartSyncEnabled = useAppStore(state => state.chartSyncEnabled);
  
  useEffect(() => {
    // 未开启联动或无全局状态时跳过
    if (!chartSyncEnabled || !globalDataZoom) return;
    // 如果是本图表触发的变化，跳过（避免循环）
    if (globalDataZoom.sourceId === ts_code) return;
    // 无图表实例时跳过
    if (!chartInstance.current) return;
    
    // 应用全局dataZoom到当前图表
    isRestoringDataZoomRef.current = true;
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      start: globalDataZoom.start,
      end: globalDataZoom.end,
      xAxisIndex: [0, 1]
    });
    
    dataZoomStateRef.current = { start: globalDataZoom.start, end: globalDataZoom.end };
    
    // 更新isAtLatest状态（用于显示双击快捷条）
    const allLength = allKlineDataRef.current.length;
    const targetEnd = klineDataRef.current.length > 0 && allLength > 0
      ? (klineDataRef.current.length / allLength) * 100
      : 100;
    setIsAtLatest(globalDataZoom.end >= targetEnd - 0.5);
    
    setTimeout(() => {
      isRestoringDataZoomRef.current = false;
    }, 100);
  }, [globalDataZoom, chartSyncEnabled, ts_code]);

  // 图表联动：监听全局十字线位置变化（直接订阅+同步处理，最小延迟）
  useEffect(() => {
    if (isFullscreen) return;
    
    type CrosshairPos = { tradeDate: string; sourceId: string; timestamp: number } | null;
    let lastPosition: CrosshairPos | undefined = undefined;
    
    // 直接订阅 store 变化，同步处理（无rAF延迟）
    const unsubscribe = useAppStore.subscribe((state) => {
      const position = state.globalCrosshairPosition;
      // 去重：只在位置变化时处理
      if (position === lastPosition) return;
      if (position && lastPosition && position.tradeDate === lastPosition.tradeDate && position.sourceId === lastPosition.sourceId) return;
      lastPosition = position;
      
      if (!crosshairLayerRef.current) return;
      const { chartSyncEnabled } = useAppStore.getState();
      if (!chartSyncEnabled) return;
      
      // 同步处理，无延迟
      if (position === null) {
        crosshairLayerRef.current.setPositionByDate(null);
      } else if (position.sourceId !== ts_code) {
        crosshairLayerRef.current.setPositionByDate(position.tradeDate);
      }
    });
    
    return () => unsubscribe();
  }, [ts_code, isFullscreen]);

  // 窗口大小变化时重新调整图表
  useEffect(() => {
    const handleResize = () => {
      // 🔧 检查图表实例是否已销毁
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.resize();
      }
    };

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    // 监听容器大小变化（用于栅格布局变化）- 简化处理
    let resizeObserver: ResizeObserver | null = null;
    const observedNode = chartRef.current;
    if (observedNode) {
      resizeObserver = new ResizeObserver((entries) => {
        // 检查元素是否可见（visibility: hidden 或 display: none 时不应resize）
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const computedStyle = window.getComputedStyle(target);
          if (computedStyle.visibility === 'hidden' || computedStyle.display === 'none') {
            return; // 元素不可见时，不触发resize
          }
        }
        // 简化resize处理，避免频繁调用
        if (chartInstance.current && !chartInstance.current.isDisposed()) {
          requestAnimationFrame(() => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
              chartInstance.current.resize();
            }
          });
        }
      });
      resizeObserver.observe(observedNode);
    }

    // 页面可见性变化（从隐藏到可见时尝试修复尺寸）
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          if (chartInstance.current && !chartInstance.current.isDisposed()) {
            chartInstance.current.resize();
          }
        }, 50);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      // 清理事件监听器在setupChartEvents的返回函数中处理
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, []);

  return {
    chartRef,
    chartInstance,
    scrollToLatest,
    isAtLatest,
    displayedData,
    drawingLayer: drawingLayerRef,
  };
};
