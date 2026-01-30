/**
 * K线图组件 - 重构版本
 */
import * as React from 'react';

import './KLineCardChart.css';
import { KLineData } from '../utils/indicators.ts';
import { useKLineData } from '../hooks/useKLineData.ts';
import { useChartInstance } from '../hooks/useChartInstance.ts';
import DrawingToolbar from './DrawingToolbar.tsx';
import { DrawingToolType } from '../components/chart-layers/drawing/types.ts';
import { DrawingConfig } from '../components/chart-layers/drawing/DrawingConfig.ts';
import { Button } from 'antd';
import { formatVolume, formatAmount, formatLargeNumber } from './mobile/utils.ts';

const { useEffect, useRef, forwardRef, useImperativeHandle } = React;

interface KLineChartProps {
  ts_code: string;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry'; // 数据类型，默认为stock
  width?: number | string;
  height?: number | string;
  initialCount?: number;  // 初始显示的K线根数
  period?: string;        // K线周期：daily, weekly, monthly
  indicator?: string;     // 技术指标：none, expma, macd, rsi, kdj, boll
  // 主图叠加指标（仅桌面端使用，多选叠加 MA / EXPMA / BOLL / SAR / TD 等）
  mainIndicators?: string[];
  isFullscreen?: boolean; // 是否为全屏模式
  refreshKey?: number;    // 刷新键，变化时重新获取数据
  onLatestDataUpdate?: (latestData: KLineData | null) => void; // 最新数据更新回调
  globalIsSnapMode?: boolean; // 全局十字线模式状态
  onSnapModeChange?: (isSnapMode: boolean) => void; // 十字线模式变化回调
  enableAnimation?: boolean; // 是否启用K线和指标绘制动画，默认true
  theme?: string; // 主题：'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold'
  onDisplayedDataChange?: (data: any) => void; // 当前显示数据变化回调
  onFullscreenRequest?: () => void; // 请求全屏回调（移动端点击画线时触发）
  tradeDate?: string; // 交易日期，K线数据只显示到该日期 YYYYMMDD格式
  timeRange?: number | string; // 时间范围（天数），用于动态计算limit
  // 移动端优化配置
  isMobile?: boolean; // 是否为移动端模式，默认false
  showYAxis?: boolean; // 是否显示Y轴坐标，默认true
  showInfoBar?: boolean; // 是否显示底部信息条，默认true
  enableCrosshair?: boolean; // 是否启用十字线，默认true（移动端可能需要与拖动冲突）
  colorScheme?: 'red-up-green-down' | 'green-up-red-down'; // 颜色方案：红涨绿跌 | 绿涨红跌，默认红涨绿跌
  showIndicatorLabels?: boolean; // 是否显示指标标签，默认true
  showDoubleClickHint?: boolean; // 是否显示右侧双击提示区域，默认true（小卡片可禁用）
}

export interface KLineChartRef {
  scrollToLatest: () => void;
  enterDrawingMode?: () => void;
  exitDrawingMode?: () => void;
  toggleDrawingMode?: () => void;
}

const KLineChartInner: React.ForwardRefRenderFunction<KLineChartRef, KLineChartProps> = ({
  ts_code,
  dataType = 'stock',
  width = '100%',
  height = '100%',
  initialCount = 60,
  period = 'daily',
  indicator = 'none',
  mainIndicators = [],
  isFullscreen = false,
  refreshKey = 0,
  onLatestDataUpdate,
  globalIsSnapMode = true,
  onSnapModeChange,
  theme = 'dark',
  onDisplayedDataChange,
  onFullscreenRequest,
  tradeDate,
  timeRange,
  // 移动端优化参数
  isMobile = false,
  showYAxis = true,
  showInfoBar = true,
  enableCrosshair = true,
  colorScheme = 'red-up-green-down',
  showIndicatorLabels = true,
  showDoubleClickHint = true,
}, ref) => {
  // 使用全局十字线模式状态
  const isSnapMode = globalIsSnapMode;
  
  // 光条容器引用
  const hintBarRef = useRef<HTMLDivElement>(null);

  // 使用K线数据Hook
  const { loading, allKlineData, klineData, fetchKLineData } = useKLineData({
    ts_code,
    period,
    dataType,
    refreshKey,
    onLatestDataUpdate,
    tradeDate,
    timeRange
  });

  // 使用图表实例Hook
  const { chartRef, chartInstance, scrollToLatest, isAtLatest, displayedData, drawingLayer } = useChartInstance({
    ts_code,
    klineData,
    allKlineData,
    loading,
    indicator,
    mainIndicators,
    isFullscreen,
    period,
    initialCount,
    isSnapMode,
    theme,
    onLatestDataUpdate,
    onSnapModeChange,
    onDisplayedDataChange,
    // 移动端优化参数
    isMobile,
    showYAxis,
    showInfoBar,
    enableCrosshair,
    colorScheme,
    showIndicatorLabels,
    dataType
  });

  // 画线工具栏状态
  const [activeDrawingTool, setActiveDrawingTool] = React.useState<DrawingToolType | null>(null);
  const [isDrawingMode, setIsDrawingMode] = React.useState<boolean>(false);
  const [hasSelectedDrawing, setHasSelectedDrawing] = React.useState<boolean>(false);
  const [canUndo, setCanUndo] = React.useState<boolean>(false);
  const [isToolbarOpening, setIsToolbarOpening] = React.useState<boolean>(false); // 工具栏正在打开状态

  // 同步画线模式和工具到DrawingLayer
  useEffect(() => {
    const layer = drawingLayer?.current;
    if (layer) {
      // 未展开或不在画线模式时，禁用画线功能（但保留显示已画的线）
      // 移动端详情页全屏时启用画线功能（需要enableCrosshair=true）
      // 桌面端需要enableCrosshair=true && isFullscreen && isDrawingMode
      const shouldEnableDrawing = enableCrosshair && (
        (isMobile && isFullscreen) || (isFullscreen && isDrawingMode)
      );
      if (shouldEnableDrawing && isDrawingMode) {
        // 先启用画线模式（允许事件处理）
        layer.setDrawingMode(true);
        // 然后设置工具（如果有选择工具）
        layer.setActiveTool(activeDrawingTool);
      } else {
        // 退出画线模式
        layer.setDrawingMode(false);
      }

      // 定期检查是否有选中的绘图（用于更新工具栏按钮状态）
      // 使用更频繁的检查（50ms）以确保画线完成后立即更新按钮状态
      if (isDrawingMode && shouldEnableDrawing) {
        const checkSelectedDrawing = () => {
          const selectedId = layer.getSelectedDrawingId();
          setHasSelectedDrawing(!!selectedId);
          // 检查是否可以撤销
          setCanUndo(layer.canUndo());
        };
        
        // 立即检查一次
        checkSelectedDrawing();
        
        // 更频繁的检查（50ms），确保画线完成后立即更新按钮状态
        const interval = setInterval(checkSelectedDrawing, 50);
        return () => clearInterval(interval);
      } else {
        setHasSelectedDrawing(false);
        setCanUndo(false);
      }
    }
  }, [activeDrawingTool, isFullscreen, isDrawingMode, drawingLayer, isMobile, enableCrosshair]);
  
  
  // 进入画线模式
  const handleEnterDrawingMode = (e?: React.MouseEvent) => {
    // 阻止事件冒泡和默认行为，防止触发工具栏按钮点击
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // 移动端：如果未全屏，先触发全屏
    if (isMobile && !isFullscreen && onFullscreenRequest) {
      onFullscreenRequest();
      // 延迟设置画线模式，等待全屏动画完成
      setTimeout(() => {
        setIsToolbarOpening(true);
        setIsDrawingMode(true);
        // 移动端：工具栏展开后，短暂延迟再允许点击，防止误触
        setTimeout(() => {
          setIsToolbarOpening(false);
        }, 300);
      }, 300);
    } else {
      // 移动端：添加短暂延迟，确保画线按钮完全移除后再显示工具栏
      if (isMobile) {
        setIsToolbarOpening(true);
        setTimeout(() => {
          setIsDrawingMode(true);
          // 工具栏展开后，短暂延迟再允许点击，防止误触
          setTimeout(() => {
            setIsToolbarOpening(false);
          }, 300);
        }, 50);
      } else {
        setIsDrawingMode(true);
      }
    }
  };
  
  // 退出画线模式
  const handleExitDrawingMode = () => {
    setIsDrawingMode(false);
    setActiveDrawingTool(null); // 清除选中的工具
  };
  
  // 当退出全屏时，也退出画线模式
  useEffect(() => {
    if (!isFullscreen) {
      setIsDrawingMode(false);
      setActiveDrawingTool(null);
    }
  }, [isFullscreen]);

  // 监听画线数据刷新事件（当关闭展开卡片时触发）
  useEffect(() => {
    // 只有在启用画线功能时才监听刷新事件
    const shouldListen = enableCrosshair;
    if (!ts_code || !shouldListen) return;

    const handleRefreshDrawings = (event: CustomEvent) => {
      const refreshTsCode = event.detail?.ts_code;
      // 如果事件是针对当前卡片的，刷新画线数据
      if (refreshTsCode === ts_code && !isFullscreen && drawingLayer?.current) {
        try {
          const key = `drawings_${ts_code}`;
          const saved = localStorage.getItem(key);
          if (saved) {
            const drawings = JSON.parse(saved);
            if (Array.isArray(drawings)) {
              // 根据当前主题设置颜色
              const currentColor = DrawingConfig.getColorByTheme(theme);
              const drawingsWithColor = drawings.map(drawing => ({
                ...drawing,
                color: currentColor, // 使用当前主题的颜色
              }));
              drawingLayer.current.loadDrawings(drawingsWithColor);
            }
          }
        } catch (error) {
          // Failed to refresh drawings
        }
      }
    };

    window.addEventListener('refreshDrawings', handleRefreshDrawings as EventListener);
    return () => {
      window.removeEventListener('refreshDrawings', handleRefreshDrawings as EventListener);
    };
  }, [ts_code, enableCrosshair, isFullscreen, drawingLayer, theme, isMobile]);

  // 处理清除所有绘图
  const handleClearDrawings = () => {
    if (drawingLayer?.current) {
      drawingLayer.current.clearAll();
    }
  };

  // 处理删除选中的绘图
  const handleDeleteSelectedDrawing = () => {
    if (drawingLayer?.current) {
      drawingLayer.current.removeSelectedDrawing();
    }
  };

  // 处理切换选中绘图的类型
  const handleSwitchSelectedDrawingType = () => {
    if (drawingLayer?.current) {
      drawingLayer.current.switchSelectedDrawingType();
    }
  };

  // 处理撤销操作
  const handleUndo = () => {
    if (drawingLayer?.current) {
      drawingLayer.current.undo();
    }
  };

  // 暴露到父组件：快速滚动到最新位置 + 画线模式控制
  useImperativeHandle(
    ref,
    () => ({
      scrollToLatest,
      enterDrawingMode: () => handleEnterDrawingMode(),
      exitDrawingMode: handleExitDrawingMode,
      toggleDrawingMode: () => {
        if (isDrawingMode) {
          handleExitDrawingMode();
        } else {
          handleEnterDrawingMode();
        }
      },
    }),
    [scrollToLatest, isDrawingMode]
  );

  // 光条双击事件处理（支持桌面端双击和移动端双击）
  useEffect(() => {
    const hintBar = hintBarRef.current;
    if (!hintBar || !showDoubleClickHint) return;

    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTapTime = 0; // 用于移动端双击检测
    
    const handleClick = (e: MouseEvent) => {
      e.stopPropagation(); // 阻止事件冒泡
      
      // 清除之前的单击计时器
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      
      // 设置单击延迟，等待可能的双击
      clickTimer = setTimeout(() => {
        // 如果不是双击，这里可以处理单击（如果需要）
        clickTimer = null;
      }, 250);
    };

    const handleDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 清除单击计时器
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      
      // 执行跳转
      scrollToLatest();
    };

    // 移动端触摸事件处理（双击检测）
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      
      if (tapLength < 300 && tapLength > 0) {
        // 双击检测成功，执行跳转
        scrollToLatest();
        lastTapTime = 0; // 重置
      } else {
        // 记录第一次点击时间
        lastTapTime = currentTime;
      }
    };

    hintBar.addEventListener('click', handleClick);
    hintBar.addEventListener('dblclick', handleDoubleClick);
    hintBar.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      hintBar.removeEventListener('click', handleClick);
      hintBar.removeEventListener('dblclick', handleDoubleClick);
      hintBar.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scrollToLatest, showDoubleClickHint]);

  // 监听尺寸变化，触发图表resize
  useEffect(() => {
    if (chartInstance.current) {
      // 使用 setTimeout 确保 DOM 已更新
      const timer = setTimeout(() => {
        chartInstance.current?.resize();
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 组件挂载时获取数据，或当fetchKLineData变化时重新获取
  useEffect(() => {
    fetchKLineData();
  }, [fetchKLineData]);

  if (!klineData.length && !loading) {
    // 判断是否为可转债
    const isConvertibleBond = ts_code && (ts_code.startsWith('11') || ts_code.startsWith('12'));

    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.2)',
          borderRadius: '8px',
          color: theme === 'light' ? '#666' : '#999',
          fontSize: '12px',
          padding: '20px',
          textAlign: 'center'
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          {isConvertibleBond ? '📊 暂无可转债K线数据' : '📊 暂无K线数据'}
        </div>
      </div>
    );
  }

  // 计算信息条高度（如果显示的话）
  const infoBarHeight = showInfoBar && displayedData ? 28 : 0;
  const drawingToolbarHeight = enableCrosshair && isMobile && isFullscreen && isDrawingMode ? 36 : 0;
  const chartHeight =
    typeof height === 'number'
      ? height - infoBarHeight - drawingToolbarHeight
      : `calc(${height} - ${infoBarHeight + drawingToolbarHeight}px)`;

  return (
    <div style={{ 
      width, 
      height,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      maxWidth: '100%',
      maxHeight: '100%',
    }}>
      {enableCrosshair && isMobile && isFullscreen && isDrawingMode && (
        <div
          style={{
            flexShrink: 0,
            padding: '4px 8px 0',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            height: drawingToolbarHeight,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              pointerEvents: isToolbarOpening ? 'none' : 'auto',
            }}
            className="drawing-toolbar-scroll-container"
          >
            <DrawingToolbar
              activeTool={activeDrawingTool}
              onToolSelect={setActiveDrawingTool}
              onClearAll={handleClearDrawings}
              onExit={handleExitDrawingMode}
              onDelete={handleDeleteSelectedDrawing}
              onSwitch={handleSwitchSelectedDrawingType}
              onUndo={handleUndo}
              hasSelectedDrawing={hasSelectedDrawing}
              canUndo={canUndo}
              theme={theme as 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold'}
            />
          </div>
        </div>
      )}
      {/* K线图容器 */}
      <div style={{
        position: 'relative',
        flex: showInfoBar && displayedData ? `0 0 ${chartHeight}` : '1',
        width: '100%',
        overflow: 'hidden',
        // 只保留顶部圆角，与信息条无缝连接
        borderRadius: showInfoBar && displayedData ? '8px 8px 0 0' : '8px'
      }}>
        {/* 画线按钮：仅在启用画线功能且全屏时显示（移动端详情页或桌面端全屏） */}
        {enableCrosshair && isFullscreen && !isMobile && !isDrawingMode && (
          <div 
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 1000,
              maxWidth: 'calc(100% - 16px)',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              padding: '2px 4px',
            }}
            className="drawing-toolbar-scroll-container"
          >
            <Button
              type="primary"
              size="small"
              onClick={handleEnterDrawingMode}
              style={{
                background: theme === 'light' ? '#ffffff' : '#FFFFFF',
                borderColor: theme === 'light' ? 'rgba(0,0,0,0.15)' : '#FFFFFF',
                color: theme === 'light' ? 'rgba(0,0,0,0.85)' : '#000000',
                borderRadius: '4px',
                fontSize: '12px',
                height: '28px',
                minWidth: '32px',
                padding: '0 8px',
                fontWeight: 500,
                boxShadow: theme === 'light' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                flexShrink: 0,
              }}
            >
              画线
            </Button>
          </div>
        )}
        
        {/* 画线工具栏：仅在启用画线功能且全屏且画线模式时显示 */}
        {enableCrosshair && isFullscreen && !isMobile && isDrawingMode && (
          <div 
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 1000,
              maxWidth: 'calc(100% - 16px)',
              overflowX: 'auto',
              overflowY: 'hidden',
              // 隐藏滚动条，但保持滚动功能
              scrollbarWidth: 'none', // Firefox
              msOverflowStyle: 'none', // IE/Edge
              WebkitOverflowScrolling: 'touch', // iOS平滑滚动
              // 移动端：工具栏刚展开时，短暂禁用点击，防止误触
              pointerEvents: isMobile && isToolbarOpening ? 'none' : 'auto',
            }}
            className="drawing-toolbar-scroll-container"
          >
            <DrawingToolbar
              activeTool={activeDrawingTool}
              onToolSelect={setActiveDrawingTool}
              onClearAll={handleClearDrawings}
              onExit={handleExitDrawingMode}
              onDelete={handleDeleteSelectedDrawing}
              onSwitch={handleSwitchSelectedDrawingType}
              onUndo={handleUndo}
              hasSelectedDrawing={hasSelectedDrawing}
              canUndo={canUndo}
              theme={theme as 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold'}
            />
          </div>
        )}

        <div
          ref={chartRef}
          className="kline-chart-container"
          data-kline-chart="true"
          style={{
            width: '100%',
            height: '100%',
            // 移除独立的边框和圆角 - 让它融入整体
            borderRadius: 'inherit',
            overflow: 'hidden',
            minWidth: 0,
            minHeight: 0,
            cursor: enableCrosshair ? 'crosshair' : 'default',
            userSelect: 'none',
            // 透明背景，让整体背景透出来
            background: 'transparent',
            position: 'relative'
          }}
        >
          {/* 在loading时显示加载提示，但不销毁图表容器 */}
          {loading && !klineData.length && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.2)',
                color: theme === 'light' ? '#666' : '#999',
                fontSize: '14px',
                zIndex: 10
              }}
            >
              正在加载K线数据...
            </div>
          )}
        </div>

        {/* 右边缘双击提示区域（仅未到最新时显示，带淡入淡出，可选择性禁用） */}
        {showDoubleClickHint && (() => {
          // 根据 isFullscreen 调整光条尺寸
          // 全屏模式：更大更明显
          // 非全屏模式：更小更精致
          const barWidth = isFullscreen ? '6px' : '4px';
          const barHeight = isFullscreen ? '200px' : '150px';
          const barRight = isFullscreen ? '0px' : '0px';
          
          return (
            <div
              ref={hintBarRef}
              className="kline-scroll-hint-bar"
              style={{
                position: 'absolute',
                top: '50%',
                right: barRight,
                transform: 'translateY(-50%)',
                width: barWidth,
                height: barHeight,
                background: 'linear-gradient(to bottom, transparent, rgba(24, 144, 255, 0.4), transparent)',
                borderRadius: '2px',
                opacity: isAtLatest ? 0 : 0.8,
                transition: 'opacity 0.3s ease',
                pointerEvents: isAtLatest ? 'none' : 'auto', // 可点击（仅在显示时）
                zIndex: 10, // 提高层级，确保可点击
                cursor: isAtLatest ? 'default' : 'pointer'
              }}
              title="双击快速跳转到最新数据"
            />
          );
        })()}
      </div>
      
      {/* 底部信息条 - 与canvas完全融合的一体化设计 */}
      {showInfoBar && displayedData && (
        <div
          className={`chart-info-bar chart-info-bar-${theme === 'light' ? 'light' : 'dark'}`}
          style={{
            height: infoBarHeight,
            padding: '6px 12px',
            // 透明背景，让整体背景渐变透出来，实现完全融合
            backgroundColor: 'transparent',
            // 移除边框，完全无缝连接
            border: 'none',
            // 只保留底部圆角，与canvas上方无缝衔接
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            // 细微的内阴影，增强层次感但不破坏一体性
            boxShadow: theme === 'light'
              ? 'inset 0 1px 0 rgba(0, 0, 0, 0.03)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
          }}
        >
          {(() => {
            const getValueClass = (num?: number | null) => {
              if (num === undefined || num === null) return 'info-value-neutral';
              return num > 0 ? 'info-value-red' : num < 0 ? 'info-value-green' : 'info-value-neutral';
            };

            const vol = formatVolume(displayedData.vol);
            // 所有标的类型 amount 单位统一为千元
            const amount = formatAmount(displayedData.amount);

            if (dataType === 'convertible_bond') {
              // 可转债显示：量、额、溢价、流通市值
              const cbOverRate = displayedData.cb_over_rate;

              return (
                <>
                  <span>
                    <span className="info-label">量 </span>
                    <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>{vol}</span>
                    <span className="info-label" style={{ marginLeft: '8px' }}>额 </span>
                    <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>{amount}</span>
                  </span>
                  <span>
                    <span className="info-label">溢价 </span>
                    <span className={getValueClass(cbOverRate)} style={{ fontWeight: 600 }}>
                      {cbOverRate !== undefined && cbOverRate !== null ? Number(cbOverRate).toFixed(2) + '%' : '--'}
                    </span>
                  </span>
                  {(displayedData.circ_mv !== undefined && displayedData.circ_mv !== null) && (
                    <span>
                      <span className="info-label">流通 </span>
                      <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>
                        {formatLargeNumber(Number(displayedData.circ_mv) * 10000, 2)}
                      </span>
                    </span>
                  )}
                </>
              );
            } else {
              // 股票/指数显示：量、额、换手、总市值、流通市值
              // 当选择开盘竞价指标时，如果有开盘竞价数据，显示开盘竞价数据
              const hasAuctionData = displayedData.auction_vol !== undefined && displayedData.auction_vol !== null;
              const showAuctionData = indicator === 'auction' && hasAuctionData && dataType === 'stock';
              
              if (showAuctionData) {
                // 显示开盘竞价数据
                const auctionVol = formatVolume(displayedData.auction_vol ? displayedData.auction_vol / 100 : 0); // 股转手
                // auction_amount 单位是元，不是千元，所以直接使用 formatLargeNumber 格式化
                const auctionAmount = displayedData.auction_amount !== null && displayedData.auction_amount !== undefined
                  ? formatLargeNumber(displayedData.auction_amount, 1)
                  : '--';
                const auctionTurnoverRate = displayedData.auction_turnover_rate;
                const auctionVolumeRatio = displayedData.auction_volume_ratio;
                
                return (
                  <>
                    <span>
                      <span className="info-label">量 </span>
                      <span className={getValueClass(displayedData.auction_pct_chg)} style={{ fontWeight: 600 }}>{auctionVol}</span>
                      <span className="info-label" style={{ marginLeft: '8px' }}>额 </span>
                      <span className={getValueClass(displayedData.auction_pct_chg)} style={{ fontWeight: 600 }}>{auctionAmount}</span>
                    </span>
                    {auctionTurnoverRate !== undefined && auctionTurnoverRate !== null && (
                      <span>
                        <span className="info-label">换手率 </span>
                        <span className={getValueClass(displayedData.auction_pct_chg)} style={{ fontWeight: 600 }}>
                          {Number(auctionTurnoverRate).toFixed(2)}%
                        </span>
                      </span>
                    )}
                    {auctionVolumeRatio !== undefined && auctionVolumeRatio !== null && (
                      <span>
                        <span className="info-label">量比 </span>
                        <span className={getValueClass(displayedData.auction_pct_chg)} style={{ fontWeight: 600 }}>
                          {Number(auctionVolumeRatio).toFixed(2)}
                        </span>
                      </span>
                    )}
                  </>
                );
              } else {
                // 显示正常交易数据
                return (
                  <>
                    <span>
                      <span className="info-label">量 </span>
                      <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>{vol}</span>
                      <span className="info-label" style={{ marginLeft: '8px' }}>额 </span>
                      <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>{amount}</span>
                    </span>
                    {displayedData.turnover_rate !== undefined && displayedData.turnover_rate !== null && (
                      <span>
                        <span className="info-label">换手率 </span>
                        <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>
                          {Number(displayedData.turnover_rate).toFixed(2)}%
                        </span>
                      </span>
                    )}
                    {/* 流通市值：股票用circ_mv(万元)，概念/行业用float_mv(千万元) */}
                    {(displayedData.circ_mv !== undefined && displayedData.circ_mv !== null) && (
                      <span>
                        <span className="info-label">流通 </span>
                        <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>
                          {formatLargeNumber(Number(displayedData.circ_mv) * 10000, 2)}
                        </span>
                      </span>
                    )}
                    {(displayedData.float_mv !== undefined && displayedData.float_mv !== null) && (
                      <span>
                        <span className="info-label">流通 </span>
                        <span className={getValueClass(displayedData.pct_chg)} style={{ fontWeight: 600 }}>
                          {formatLargeNumber(Number(displayedData.float_mv) * 10000000, 2)}
                        </span>
                      </span>
                    )}
                  </>
                );
              }
            }
          })()}
        </div>
      )}
    </div>
  );
};

const KLineChart = React.memo(
  forwardRef<KLineChartRef, KLineChartProps>(KLineChartInner),
  (prevProps, nextProps) => {
    // 自定义比较函数，只有关键props变化时才重新渲染
    return (
      prevProps.ts_code === nextProps.ts_code &&
      prevProps.period === nextProps.period &&
      prevProps.refreshKey === nextProps.refreshKey &&
      prevProps.indicator === nextProps.indicator &&
      JSON.stringify(prevProps.mainIndicators || []) === JSON.stringify(nextProps.mainIndicators || []) &&
      prevProps.globalIsSnapMode === nextProps.globalIsSnapMode &&
      prevProps.onSnapModeChange === nextProps.onSnapModeChange &&
      prevProps.theme === nextProps.theme &&
      prevProps.tradeDate === nextProps.tradeDate &&
      prevProps.enableCrosshair === nextProps.enableCrosshair && // 🔧 修复：监听enableCrosshair变化
      prevProps.showIndicatorLabels === nextProps.showIndicatorLabels // 🔧 关键：当控制显示指标标签时需要重新渲染
    );
  }
);

export default KLineChart;