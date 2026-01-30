/**
 * 图表事件处理工具
 */
import * as echarts from 'echarts';
import Hammer from 'hammerjs';
import { KLineData } from './indicators.ts';

// 小图（移动端列表）拖动灵敏度：值越小拖动越慢，0.5为适中灵敏度
const SMALL_MOBILE_PAN_SPEED = 0.5;

export interface ChartEventHandlers {
  onLatestDataUpdate?: (latestData: KLineData | null) => void;
  onSnapModeChange?: (isSnapMode: boolean) => void;
  scrollToLatest: () => void;
}

export interface ChartEventOptions {
  chartInstance: echarts.ECharts | null;
  isSnapMode: boolean;
  isMobile?: boolean;
  isFullscreen?: boolean;
  handlers: ChartEventHandlers;
}

// 设置图表事件处理
export const setupChartEvents = (options: ChartEventOptions) => {
  const { chartInstance, isSnapMode, isMobile = false, isFullscreen = false, handlers } = options;
  
  // 使用 ref 保持最新的状态值（解决闭包问题）
  const isSnapModeRef = { current: isSnapMode };
  const { scrollToLatest } = handlers;

  if (!chartInstance) return () => {};

  const chartDom = chartInstance.getDom() as HTMLElement | null;
  if (!chartDom) return () => {};

  // 使用 Hammer.js 处理手势识别（更稳定的单击、双击、拖动检测）
  const hammer = new Hammer(chartDom, {
    recognizers: [
      // 双击识别器（优先于单击）
      [Hammer.Tap, { event: 'doubletap', taps: 2, interval: 300, threshold: 9 }],
      // 单击识别器
      [Hammer.Tap, { event: 'singletap', taps: 1, time: 250 }],
      // 拖动识别器（阈值调低，让轻微拖动更容易被识别为pan，从而抑制误判为tap）
      [Hammer.Pan, { threshold: 2, direction: Hammer.DIRECTION_ALL }]
    ]
  });

  // 禁用默认的双击识别（避免冲突）
  hammer.get('doubletap').recognizeWith('singletap');
  hammer.get('singletap').requireFailure('doubletap');
  // 拖动优先于单击：一旦识别为 pan，本次手势不再触发 singletap
  try {
    hammer.get('singletap').requireFailure('pan');
  } catch (err) {
    // 容错：某些环境下可能不存在 pan 识别器，忽略错误
  }

  let isDataZooming = false;
  let dataZoomEndTimer: ReturnType<typeof setTimeout> | null = null;
  // 记录最近一次 pan 事件时间，用于抑制拖动后的误触单击
  const PAN_RECENT_DELAY = 250;
  let lastPanEventTime = 0;
  const isSmallMobile = isMobile && !isFullscreen;

  const handlePanAny = (e: HammerInput) => {
    lastPanEventTime = Date.now();
  };

  hammer.on('panstart panmove panend pancancel', handlePanAny);

  // 使用原生 touch 事件记录一次触摸序列中的最大移动距离，进一步区分“真正点击”和“短距离拖动”
  const TAP_MOVE_THRESHOLD = 3; // px，超过该距离视为拖动，不触发单击切换十字线
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMaxMoveDistance = 0;

  const handleNativeTouchStart = (evt: TouchEvent) => {
    const t = evt.touches[0] || evt.changedTouches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchMaxMoveDistance = 0;
  };

  const handleNativeTouchMove = (evt: TouchEvent) => {
    const t = evt.touches[0] || evt.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > touchMaxMoveDistance) {
      touchMaxMoveDistance = dist;
    }
  };

  chartDom.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
  chartDom.addEventListener('touchmove', handleNativeTouchMove, { passive: true });

  // 工具函数：每次手势事件发生时实时获取图表容器的边界矩形
  const getChartRect = () => chartDom.getBoundingClientRect();
  
  // 单击事件处理（移动端：切换十字线模式，由新图层系统处理）
  hammer.on('singletap', (e: HammerInput) => {
    const now = Date.now();
    const hasRecentPan = now - lastPanEventTime < PAN_RECENT_DELAY;
    const isDragLikeTap = touchMaxMoveDistance > TAP_MOVE_THRESHOLD;
    if (isDataZooming || hasRecentPan || isDragLikeTap) {
      return;
    }

    // 使用原始触摸事件的坐标
    const srcEvent = e.srcEvent as TouchEvent;
    const touch = srcEvent.changedTouches?.[0] || srcEvent.touches?.[0];
    
    const rect = getChartRect();
    const clientX = touch ? touch.clientX : e.center.x;
    const x = clientX - rect.left;
    const isRightEdge = x >= rect.width * 0.85;
    
    if (isRightEdge) return; // 右边缘留给双击处理

    // 移动端十字线显隐由 CrosshairLayer 自己的触摸逻辑处理
    // 这里不再切换 snap 模式，避免与 CrosshairLayer 逻辑重复
  });

  // 双击：右边缘跳转最新
  hammer.on('doubletap', (e: HammerInput) => {
    if (!chartInstance) return;

    // 使用原始触摸事件的坐标
    const srcEvent = e.srcEvent as TouchEvent;
    const touch = srcEvent.changedTouches?.[0] || srcEvent.touches?.[0];
    const clientX = touch ? touch.clientX : e.center.x;
    const clientY = touch ? touch.clientY : e.center.y;

    // 检查是否点击在光条上（光条元素自己处理双击）
    const hintBar = chartDom.querySelector('.kline-scroll-hint-bar') as HTMLElement;
    if (hintBar) {
      const rect = hintBar.getBoundingClientRect();
      if (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom
      ) {
        return;
      }
    }

    // 右边缘双击：跳转最新
    const rect = getChartRect();
    const x = clientX - rect.left;
    const isRightEdge = x >= rect.width * 0.85;
    
    if (isRightEdge) {
      scrollToLatest();
    }
  });

  // 监听 datazoom 事件（检测用户拖动）
  const DATAZOOM_RESET_DELAY = 200;
  const handleDataZoom = () => {
    // 移动端十字线模式下不处理（已阻止拖动），网页端允许拖动
    if (!(isMobile && isSnapModeRef.current)) {
      isDataZooming = true;
      if (dataZoomEndTimer) clearTimeout(dataZoomEndTimer);
      dataZoomEndTimer = setTimeout(() => {
        isDataZooming = false;
      }, DATAZOOM_RESET_DELAY);
    }
  };
  chartInstance.on('datazoom', handleDataZoom);

  // ====== 自定义 pan → dataZoom（仅移动端列表小图：isMobile && !isFullscreen） ======
  if (isSmallMobile) {
    let panStartZoom: { start: number; end: number } | null = null;
    let pendingZoom: { start: number; end: number } | null = null;
    let rafId: number | null = null;

    const getCurrentZoom = () => {
      if (!chartInstance || chartInstance.isDisposed()) return null;
      const opt: any = chartInstance.getOption?.();
      const dz = opt?.dataZoom?.[0];
      // 当 dataZoom 被上层逻辑（如十字线）标记为 disabled 时，不再参与平移逻辑
      if (
        dz &&
        dz.disabled !== true &&
        typeof dz.start === 'number' &&
        typeof dz.end === 'number'
      ) {
        return { start: dz.start, end: dz.end };
      }
      return null;
    };

    hammer.on('panstart', (e: HammerInput) => {
      if (!chartInstance || chartInstance.isDisposed()) return;
      // 多指手势（缩放）交给 ECharts，忽略
      if (e.pointers && e.pointers.length > 1) return;
      panStartZoom = getCurrentZoom();
    });

    hammer.on('panmove', (e: HammerInput) => {
      if (!chartInstance || chartInstance.isDisposed()) return;
      if (!panStartZoom) return;
      if (e.pointers && e.pointers.length > 1) return;

      const rect = getChartRect();
      if (!rect || !rect.width) return;

      const dx = e.deltaX; // 水平位移（像素）
      let span = panStartZoom.end - panStartZoom.start;
      if (span <= 0) return;
      // 防御性处理：避免 span 过大导致边界计算异常
      if (span > 100) span = 100;

      // 将像素位移转换为百分比位移（负号使得向左拖动视窗向右移动更自然）
      // SMALL_MOBILE_PAN_SPEED < 1 让拖动更“慢”，同样位移只平移更小的窗口范围
      const speedFactor = SMALL_MOBILE_PAN_SPEED;
      const offsetPercent = -(dx / rect.width) * 100 * speedFactor;

      // 以 panStartZoom 为基准平移窗口，保持 span 不变
      let newStart = panStartZoom.start + offsetPercent;

      // 限制 start 范围，使得视窗始终在 [0, 100] 内，且宽度保持为 span
      const maxStart = Math.max(0, 100 - span);
      if (maxStart <= 0) {
        newStart = 0;
      } else {
        newStart = Math.max(0, Math.min(maxStart, newStart));
      }

      const newEnd = newStart + span;

      // 使用RAF节流，避免每帧多次重绘
      pendingZoom = { start: newStart, end: newEnd };
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingZoom && chartInstance && !chartInstance.isDisposed()) {
            try {
              chartInstance.dispatchAction({
                type: 'dataZoom',
                start: pendingZoom.start,
                end: pendingZoom.end,
                xAxisIndex: [0, 1],
              } as any);
            } catch {
              // 静默处理异常
            }
          }
          rafId = null;
        });
      }
    });

    hammer.on('panend pancancel', (e: HammerInput) => {
      panStartZoom = null;
    });
  }

  // 返回清理函数和更新函数
  const cleanup = () => {
    if (dataZoomEndTimer) {
      clearTimeout(dataZoomEndTimer);
      dataZoomEndTimer = null;
    }
    // 清理 Hammer.js 实例
    if (hammer) {
      hammer.destroy();
    }
    if (chartInstance) {
      chartInstance.off('datazoom', handleDataZoom);
    }
    // 移除原生 touch 监听
    chartDom.removeEventListener('touchstart', handleNativeTouchStart);
    chartDom.removeEventListener('touchmove', handleNativeTouchMove);
  };

  // 更新状态函数
  const updateSnapMode = (newSnapMode: boolean) => {
    isSnapModeRef.current = newSnapMode;
  };

  return { cleanup, updateSnapMode };
};


// 监听全局事件：快速滚动到最新
export const setupGlobalScrollListener = (
  ts_code: string,
  scrollToLatest: () => void
) => {
  const handler = (evt: CustomEvent<{ ts_code: string }>) => {
    const targetTs = evt.detail.ts_code;
    if (targetTs !== ts_code) return;
    scrollToLatest();
  };

  window.addEventListener('kline-scroll-latest', handler as EventListener);
  
  return () => {
    window.removeEventListener('kline-scroll-latest', handler as EventListener);
  };
};

// 键盘事件处理（End 键跳转到最新）
export const setupKeyboardListener = (scrollToLatest: () => void) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // 仅在当前图表容器获得焦点或全局处理时响应
    if (event.key === 'End' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      // 检查是否有输入框正在获得焦点，避免干扰用户输入
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      )) {
        return; // 有输入框获得焦点时不处理
      }
      
      event.preventDefault();
      scrollToLatest();
    }
  };

  // 添加全局键盘监听
  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
};
