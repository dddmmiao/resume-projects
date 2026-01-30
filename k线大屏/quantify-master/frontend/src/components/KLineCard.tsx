/* eslint-disable react-hooks/exhaustive-deps */
/**
 * K线卡片组件（支持股票、可转债、概念、行业）
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Tag, Modal, Table } from 'antd';
import { INDICATOR_OPTIONS, IndicatorType } from './mobile/constants.ts';

import FullscreenOverlay from './FullscreenOverlay.tsx';
import FullscreenKLineCard from './FullscreenKLineCard.tsx';
import KLineCardHeader from './KLineCardHeader.tsx';
import KLineCardControls from './KLineCardControls.tsx';
import KLineCardChart from './KLineCardChart.tsx';
import KLineChart, { type KLineChartRef } from './KLineChart.tsx';
import { convertDateForPeriod } from '../utils/dateUtils.ts';
import { useAppStore } from '../stores/useAppStore.ts';
import HeaderMetrics from './HeaderMetrics.tsx';
import { getEastMoneyUrl as buildEastMoneyUrl } from './mobile/utils.ts';

type KLineCardProps = {
  item: any;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
  onConceptFilter?: (concept: string) => void;
  onIndustryFilter?: (industry: string) => void;
  globalIsSnapMode?: boolean;
  onSnapModeChange?: (isSnapMode: boolean) => void;
  globalIndicator?: string;
  // 全局主图叠加指标（仅桌面端使用，多选叠加 MA / EXPMA / BOLL / SAR / TD 等）
  globalMainOverlays?: string[];
  globalPeriod?: string;
  globalTimeRange?: number | string | undefined;
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  onAddToFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  onRemoveFromFavorites?: (itemCode: string, groupName?: string, itemType?: string) => void;
  isInFavorites?: (itemCode: string, groupName?: string, itemType?: string) => boolean;
  favoriteGroups?: string[];
  isInFavoritesMode?: boolean;
  cardIndex?: number;
  focusedCardIndex?: number;
  onCardFocus?: (index: number) => void;
  tradeDate?: string; // 交易日期，K线数据只显示到该日期
  // 全局控制回调（联动模式下使用）
  onGlobalPeriodChange?: (period: string) => void;
  onGlobalTimeRangeChange?: (range: number | string) => void;
  onGlobalIndicatorChange?: (indicator: string) => void;
  onGlobalMainOverlaysChange?: (overlays: string[]) => void;
};

const KLineCard: React.FC<KLineCardProps> = ({ 
  item, 
  dataType = 'stock', 
  onConceptFilter, 
  onIndustryFilter, 
  globalIsSnapMode = true, 
  onSnapModeChange, 
  globalIndicator = 'none', 
  globalMainOverlays = [],
  globalPeriod = 'daily', 
  globalTimeRange = 60, 
  theme = 'dark', 
  onAddToFavorites, 
  onRemoveFromFavorites, 
  isInFavorites, 
  favoriteGroups = [], 
  isInFavoritesMode = false, 
  cardIndex = 0, 
  focusedCardIndex = -1, 
  onCardFocus,
  tradeDate,
  onGlobalPeriodChange,
  onGlobalTimeRangeChange,
  onGlobalIndicatorChange,
  onGlobalMainOverlaysChange
}) => {
  // 获取联动状态和布局模式
  const chartSyncEnabled = useAppStore(state => state.chartSyncEnabled);
  const dashboardLayout = useAppStore(state => state.dashboardLayout);
  const isCompactMode = dashboardLayout && dashboardLayout === 'compact';
  // 卡片引用
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stockContentRef = useRef<HTMLDivElement | null>(null);

  // 观察header高度并把值写到卡片根元素的 CSS 变量 --header-h
  useEffect(() => {
    const root = stockContentRef.current?.closest('[data-card-root]') as HTMLElement | null;
    const header = stockContentRef.current?.querySelector('[data-header]') as HTMLElement | null;
    if (!root || !header) return;

    const update = () => {
      const h = header.getBoundingClientRect().height;
      root.style.setProperty('--header-h', `${Math.ceil(h + 6)}px`);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(header);

    return () => ro.disconnect();
  }, []);

  // 卡片是否获得焦点的状态
  const isCardFocused = focusedCardIndex === cardIndex;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // 监听全局全屏切换事件
  useEffect(() => {
    const handler = (e: any) => {
      const idx = e?.detail?.index;
      const shouldFullscreen = idx === cardIndex;
      setIsFullscreen(shouldFullscreen);
      if (shouldFullscreen) {
        if (cardRef.current) cardRef.current.focus();
        if (onCardFocus) onCardFocus(cardIndex);
      }
    };
    window.addEventListener('switchFullscreenToIndex', handler as any);
    return () => window.removeEventListener('switchFullscreenToIndex', handler as any);
  }, [cardIndex, onCardFocus]);

  // 判断是否点击在交互控件上
  const isInteractiveTarget = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return false;
    return !!el.closest(
      'button, a, input, select, textarea, [role="button"], .ant-dropdown, .ant-select, .ant-picker, .ant-btn, .anticon, .kline-chart-container, .kline-chart, [data-kline-chart]'
    );
  }, []);

  // 统一的卡片选中/取消切换处理
  const handleCardMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!onCardFocus) return;
      const target = e.target as HTMLElement;
      if (isInteractiveTarget(target)) return;

      if (isCardFocused) {
        onCardFocus(-1);
        if (cardRef.current) cardRef.current.blur();
      } else {
        if (cardRef.current) cardRef.current.focus();
        onCardFocus(cardIndex);
      }
    },
    [onCardFocus, isCardFocused, cardIndex, isInteractiveTarget]
  );

  // 快捷键处理函数
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isCardFocused) return;

    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.getAttribute('contenteditable') === 'true'
    )) {
      return;
    }

    if (event.key >= '1' && event.key <= '9' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();

      const groupIndex = parseInt(event.key) - 1;
      if (groupIndex < favoriteGroups.length && onAddToFavorites) {
        const groupName = favoriteGroups[groupIndex];
        const itemType = isInFavoritesMode ? item.type : undefined;

        if (isInFavorites && isInFavorites(item.ts_code, groupName, itemType)) {
          if (onRemoveFromFavorites) {
            onRemoveFromFavorites(item.ts_code, groupName, itemType);
          }
        } else {
          onAddToFavorites(item.ts_code, groupName, itemType);
        }
      }
    }
  }, [isCardFocused, favoriteGroups, onAddToFavorites, onRemoveFromFavorites, isInFavorites, item.ts_code, item.type, isInFavoritesMode]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const [isCardHovered, setIsCardHovered] = useState(false);

  // 本地控制状态
  const [localPeriod, setLocalPeriod] = useState<string | null>(null);
  const [localTimeRange, setLocalTimeRange] = useState<number | string | null>(null);
  const [localIndicator, setLocalIndicator] = useState<string | null>(null);
   // 本地主图叠加指标（null 表示跟随全局，[] 表示显式清空）
  const [localMainOverlays, setLocalMainOverlays] = useState<string[] | null>(null);

  // 监听全局变化，重置本地状态
  useEffect(() => {
    setLocalIndicator(null);
  }, [globalIndicator]);

  useEffect(() => {
    setLocalPeriod(null);
  }, [globalPeriod]);

  useEffect(() => {
    setLocalTimeRange(null);
  }, [globalTimeRange]);

  useEffect(() => {
    setLocalMainOverlays(null);
  }, [globalMainOverlays]);

  // 计算当前有效的设置
  const currentPeriod = localPeriod !== null ? localPeriod : globalPeriod;
  const currentTimeRange = localTimeRange !== null ? localTimeRange : globalTimeRange;
  const currentIndicator = localIndicator !== null ? localIndicator : globalIndicator;
  const currentMainOverlays = localMainOverlays !== null ? localMainOverlays : globalMainOverlays;

  // 获取有效的指标值
  const getValidIndicatorValue = (value: string | null): string => {
    const validValues = INDICATOR_OPTIONS.map(option => option.key) as IndicatorType[];
    const currentValue = (value !== null ? value : globalIndicator) as IndicatorType;
    // 如果当前指标是开盘竞价，但数据类型不是股票或周期不是日线，自动切换为"无"
    if (currentValue === 'auction' && (dataType !== 'stock' || currentPeriod !== 'daily')) {
      return 'none';
    }
    return validValues.includes(currentValue) ? currentValue : 'none';
  };

  const [currentTsCode, setCurrentTsCode] = useState(item.ts_code);
  const [currentName, setCurrentName] = useState(
    item.name || 
    item.bond_short_name || 
    item.concept_name || 
    item.industry_name
  );
  const [isShowingUnderlying, setIsShowingUnderlying] = useState(false);

  const [currentKlineData, setCurrentKlineData] = useState(item.kline);
  const [dailyBasic, setDailyBasic] = useState<any | null>(null);

  // 监听item.kline变化，更新currentKlineData
  useEffect(() => {
    setCurrentKlineData(item.kline);
  }, [item.kline]);

  const [refreshKey] = useState(0);
  const [relatedBonds, setRelatedBonds] = useState<any[]>([]);
  const [isLoadingBonds, setIsLoadingBonds] = useState(false);
  const [originalItem] = useState(item);
  const [isShowingBond, setIsShowingBond] = useState(false);

  const [concepts, setConcepts] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);

  // 赎回信息相关状态
  const [callInfo, setCallInfo] = useState<any[]>([]);
  const [showCallInfoModal, setShowCallInfoModal] = useState(false);

  // 生成东方财富链接
  const getEastMoneyUrl = buildEastMoneyUrl;


  // 当前卡片是否正展示"股票视图"
  const isStockView = React.useMemo(() => {
    if (item.type === 'stock') {
      return !isShowingBond;
    }
    if (item.type === 'convertible_bond') {
      return isShowingUnderlying;
    }
    return false;
  }, [item.type, isShowingBond, isShowingUnderlying]);

  // 获取正股数据
  const fetchUnderlyingStockData = async () => {
    if (item.type === 'convertible_bond' && item.underlying_stock && item.underlying_stock.ts_code) {
      try {
        if (item.concepts && Array.isArray(item.concepts)) {
          setConcepts(item.concepts);
        }
        if (item.industries && Array.isArray(item.industries)) {
          setIndustries(item.industries);
        }
      } catch (error) {
        // 即使出错也要设置基本数据结构，避免界面异常
      }
    }
  };

  // 不再从股票K线补充 daily_basic；行业/概念如携带则可透传
  useEffect(() => {
    if (!isStockView) {
      setDailyBasic(item?.dailyBasic || null);
      return;
    }
    setDailyBasic(null);
  }, [currentKlineData, isStockView, item?.dailyBasic]);

  // 组件加载时获取正股数据和关联可转债
  React.useEffect(() => {
    if (item.type === 'convertible_bond' && item.underlying_stock) {
      fetchUnderlyingStockData();
      if (item.concepts && Array.isArray(item.concepts)) {
        setConcepts(item.concepts);
      } else {
        setConcepts([]);
      }
      if (item.industries && Array.isArray(item.industries)) {
        setIndustries(item.industries);
      } else {
        setIndustries([]);
      }
    } else if (item.type === 'stock') {
      fetchRelatedBonds();
      if (item.concepts && Array.isArray(item.concepts)) {
        setConcepts(item.concepts);
      } else {
        setConcepts([]);
      }
      if (item.industries && Array.isArray(item.industries)) {
        setIndustries(item.industries);
      } else {
        setIndustries([]);
      }
    }
  }, [item.ts_code, item.concepts]);

  // 当item变化时，立即更新所有状态
  React.useEffect(() => {
    setCurrentTsCode(item.ts_code);
    setCurrentName(
      item.name || 
      item.bond_short_name || 
      item.concept_name || 
      item.industry_name
    );
    setCurrentKlineData(item.kline);

    if (item.type === 'stock') {
      if (item.concepts && Array.isArray(item.concepts)) {
        setConcepts(item.concepts);
      }
      if (item.industries && Array.isArray(item.industries)) {
        setIndustries(item.industries);
      }
    } else if (item.type === 'convertible_bond') {
      if (item.concepts && Array.isArray(item.concepts)) {
        setConcepts(item.concepts);
      }
      if (item.industries && Array.isArray(item.industries)) {
        setIndustries(item.industries);
      }
    } else if (item.type === 'concept' || item.type === 'industry') {
      setConcepts([]);
      setIndustries([]);
    }
  }, [item]);

  const handleFullscreen = () => {
    const wasFullscreen = isFullscreen;
    setIsFullscreen(!isFullscreen);
    
    // 关闭展开卡片时，触发刷新画线数据事件
    if (wasFullscreen && currentTsCode) {
      window.dispatchEvent(new CustomEvent('refreshDrawings', {
        detail: { ts_code: currentTsCode }
      }));
    }
  };

  // 切换到正股K线
  const handleSwitchToUnderlying = React.useCallback(() => {
    if (item.type === 'convertible_bond' && item.underlying_stock) {
      if (isShowingUnderlying) {
        React.startTransition(() => {
          setCurrentTsCode(item.ts_code);
          setCurrentName(item.bond_short_name);
          setCurrentKlineData(null);
          setIsShowingUnderlying(false);
        });
      } else {
        React.startTransition(() => {
          setCurrentTsCode(item.underlying_stock.ts_code);
          setCurrentName(item.underlying_stock.name);
          setCurrentKlineData(null);
          setIsShowingUnderlying(true);
        });
      }
    }
  }, [item, isShowingUnderlying]);

  // 查询股票关联的可转债
  const fetchRelatedBonds = async () => {
    if (item.type === 'convertible_bond') return;

    try {
      setIsLoadingBonds(true);

      if (item.convertible_bonds && Array.isArray(item.convertible_bonds)) {
        setRelatedBonds(item.convertible_bonds);
      } else {
        setRelatedBonds([]);
      }
    } catch (error) {
      setRelatedBonds([]);
    } finally {
      setIsLoadingBonds(false);
    }
  };

  // 切换到可转债
  const switchToConvertibleBond = React.useCallback(() => {
    if (relatedBonds.length > 0) {
      const bond = relatedBonds[0];
      React.startTransition(() => {
        setCurrentTsCode(bond.ts_code);
        setCurrentName(bond.bond_short_name);
        setCurrentKlineData(null);
        setIsShowingBond(true);
      });
    }
  }, [relatedBonds]);

  // 切换回原股票
  const switchBackToStock = React.useCallback(() => {
    React.startTransition(() => {
      setCurrentTsCode(originalItem.ts_code);
      setCurrentName(originalItem.name);
      setCurrentKlineData(null);
      setIsShowingBond(false);
    });
  }, [originalItem]);

  // 处理K线图表提供的最新数据更新
  const handleLatestDataUpdate = React.useCallback((latestData: any) => {
    if (latestData && latestData.close) {
      if (isShowingUnderlying) {
        setCurrentKlineData(latestData);
      } else {
        setCurrentKlineData(latestData);
        item.kline = latestData;
      }
    }
  }, [isShowingUnderlying, item]);

  const effectiveTradeDate = convertDateForPeriod(tradeDate, currentPeriod);

  // 处理本地周期变化（联动模式下同步到全局）
  const handleLocalPeriodChange = (period: string) => {
    if (chartSyncEnabled && onGlobalPeriodChange) {
      // 联动模式：更新全局，同时清除本地覆盖
      onGlobalPeriodChange(period);
      setLocalPeriod(null);
    } else {
      // 非联动模式：仅更新本地
      if (period === globalPeriod) {
        setLocalPeriod(null);
      } else {
        setLocalPeriod(period);
      }
    }
  };

  // 处理本地时间范围变化（联动模式下同步到全局）
  const handleLocalTimeRangeChange = (range: number | string) => {
    if (chartSyncEnabled && onGlobalTimeRangeChange) {
      onGlobalTimeRangeChange(range);
      setLocalTimeRange(null);
    } else {
      if (range === globalTimeRange) {
        setLocalTimeRange(null);
      } else {
        setLocalTimeRange(range);
      }
    }
  };

  // 处理本地指标变化（联动模式下同步到全局）
  const handleLocalIndicatorChange = (indicator: string) => {
    if (chartSyncEnabled && onGlobalIndicatorChange) {
      onGlobalIndicatorChange(indicator);
      setLocalIndicator(null);
    } else {
      if (indicator === globalIndicator) {
        setLocalIndicator(null);
      } else {
        setLocalIndicator(indicator);
      }
    }
  };

  // 处理本地主图叠加变化（联动模式下同步到全局）
  const handleLocalMainOverlaysChange = (next: string[]) => {
    const normalized = Array.from(new Set((next || []).filter(Boolean)));
    if (chartSyncEnabled && onGlobalMainOverlaysChange) {
      onGlobalMainOverlaysChange(normalized);
      setLocalMainOverlays(null);
    } else {
      const globalBase = Array.from(new Set((globalMainOverlays || []).filter(Boolean)));
      const sameLength = normalized.length === globalBase.length;
      const isSame = sameLength && normalized.every((v) => globalBase.includes(v));
      if (isSame) {
        setLocalMainOverlays(null);
      } else {
        setLocalMainOverlays(normalized);
      }
    }
  };

  // 处理显示赎回信息
  const handleShowCallInfo = (item: any) => {
    const callRecords = item.call_records || [];
    setCallInfo(callRecords);
    setShowCallInfoModal(true);
  };

  // 原卡片样式
  const cardStyle = {
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
    height: 'var(--card-height)',
    position: 'relative' as const,
    width: '100%',
    maxWidth: '100%',
    minWidth: 'var(--card-min)',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box' as const,
    overflow: 'visible' as const
  } as React.CSSProperties;

  return (
    <>
      {/* 全屏遮罩层 */}
      <FullscreenOverlay visible={isFullscreen} onClose={handleFullscreen} />
      
      {/* 独立的大屏卡片 */}
      <FullscreenKLineCard
        isVisible={isFullscreen}
        onClose={handleFullscreen}
        cardRef={cardRef}
        stockContentRef={stockContentRef}
        isCardFocused={isCardFocused}
        handleCardMouseDownCapture={handleCardMouseDownCapture}
        getEastMoneyUrl={getEastMoneyUrl}
        item={item}
        dataType={dataType as any}
        currentName={currentName}
        favoriteGroups={favoriteGroups}
        isInFavorites={isInFavorites as any}
        isInFavoritesMode={isInFavoritesMode}
        onAddToFavorites={onAddToFavorites as any}
        onRemoveFromFavorites={onRemoveFromFavorites as any}
        theme={theme}
        concepts={concepts}
        industries={industries}
        onConceptFilter={onConceptFilter}
        onIndustryFilter={(industry) => onIndustryFilter?.(industry)}
        HeaderMetrics={HeaderMetrics as any}
        currentKlineData={currentKlineData}
        dailyBasic={dailyBasic}
        isStockView={isStockView}
        handleSwitchToUnderlying={handleSwitchToUnderlying}
        isShowingUnderlying={isShowingUnderlying}
        originalItem={originalItem}
        relatedBonds={relatedBonds}
        isShowingBond={isShowingBond}
        isLoadingBonds={isLoadingBonds}
        switchToConvertibleBond={switchToConvertibleBond}
        switchBackToStock={switchBackToStock}
        isLoadingCallInfo={false}
        handleShowCallInfo={handleShowCallInfo}
        KLineChart={KLineChart as any}
        currentTsCode={currentTsCode}
        currentPeriod={currentPeriod}
        currentTimeRange={currentTimeRange}
        currentIndicator={currentIndicator}
        currentMainOverlays={currentMainOverlays}
        refreshKey={refreshKey}
        handleLatestDataUpdate={handleLatestDataUpdate}
        globalIsSnapMode={globalIsSnapMode}
        onSnapModeChange={onSnapModeChange}
        localPeriod={localPeriod}
        localTimeRange={localTimeRange}
        localIndicator={localIndicator}
        globalPeriod={globalPeriod}
        globalTimeRange={globalTimeRange}
        globalIndicator={globalIndicator}
        onLocalPeriodChange={handleLocalPeriodChange}
        onLocalTimeRangeChange={handleLocalTimeRangeChange}
        onLocalIndicatorChange={handleLocalIndicatorChange}
        getValidIndicatorValue={getValidIndicatorValue}
        tradeDate={effectiveTradeDate}
        onLocalMainOverlaysChange={handleLocalMainOverlaysChange}
      />

      {/* 普通卡片 */}
      <Card
        ref={cardRef}
        style={{
          ...cardStyle,
          outline: isCardFocused ? '2px solid #1890ff' : 'none',
          transition: 'outline 0.2s ease'
        }}
        styles={{ body: { padding: '6px', height: '100%', display: 'flex', flexDirection: 'column' } }}
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
        onMouseDownCapture={handleCardMouseDownCapture}
        onFocusCapture={() => {}}
        onBlur={() => {}}
        tabIndex={0}
      >
        <div ref={stockContentRef} className="stock-card-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }} data-card-root>
          {/* 顶部：股票信息区域 */}
          <KLineCardHeader
            theme={theme}
            item={item}
            dataType={dataType as any}
            currentName={currentName}
            concepts={concepts}
            industries={industries}
            currentKlineData={currentKlineData}
            dailyBasic={dailyBasic}
            isStockView={isStockView}
            isInFavoritesMode={isInFavoritesMode}
            isCardHovered={isCardHovered}
            isCardFocused={isCardFocused}
            favoriteGroups={favoriteGroups}
            isInFavorites={isInFavorites as any}
            onAddToFavorites={onAddToFavorites as any}
            onRemoveFromFavorites={onRemoveFromFavorites as any}
            onConceptFilter={onConceptFilter}
            onIndustryFilter={onIndustryFilter}
            getEastMoneyUrl={getEastMoneyUrl}
            originalItem={originalItem}
            isShowingUnderlying={isShowingUnderlying}
            isShowingBond={isShowingBond}
            isLoadingCallInfo={false}
            isLoadingBonds={isLoadingBonds}
            relatedBonds={relatedBonds}
            onSwitchToUnderlying={handleSwitchToUnderlying}
            onSwitchToConvertibleBond={switchToConvertibleBond}
            onSwitchBackToStock={switchBackToStock}
            onShowCallInfo={handleShowCallInfo}
            onFullscreen={handleFullscreen}
            isFullscreen={isFullscreen}
            period={currentPeriod as any}
          />
          
          {/* 简洁功能控制面板 - 紧凑模式隐藏 */}
          {!isCompactMode && (
            <KLineCardControls
              localPeriod={localPeriod}
              localTimeRange={localTimeRange}
              localIndicator={localIndicator}
              localMainOverlays={localMainOverlays}
              globalPeriod={globalPeriod}
              globalTimeRange={globalTimeRange}
              globalIndicator={globalIndicator}
              globalMainOverlays={globalMainOverlays}
              onLocalPeriodChange={handleLocalPeriodChange}
              onLocalTimeRangeChange={handleLocalTimeRangeChange}
              onLocalIndicatorChange={handleLocalIndicatorChange}
              onLocalMainOverlaysChange={handleLocalMainOverlaysChange}
              stockContentRef={stockContentRef}
              cardRef={cardRef}
              dataType={dataType}
            />
          )}

          {/* K线图区域 - 紧凑模式隐藏但仍渲染以加载数据 */}
          <KLineCardChart
            key={`chart-${currentTsCode}-${refreshKey}`}
            style={{ 
              visibility: isFullscreen ? 'hidden' : 'visible',
              display: isCompactMode ? 'none' : undefined,
            }}
            theme={theme}
            currentTsCode={currentTsCode}
            currentPeriod={currentPeriod}
            currentName={currentName}
            item={item}
            originalItem={originalItem}
            isShowingUnderlying={isShowingUnderlying}
            isShowingBond={isShowingBond}
            dataType={dataType}
            currentTimeRange={currentTimeRange}
            currentIndicator={currentIndicator}
            currentMainOverlays={currentMainOverlays}
            refreshKey={refreshKey}
            globalIsSnapMode={globalIsSnapMode}
            onLatestDataUpdate={handleLatestDataUpdate}
            onSnapModeChange={onSnapModeChange}
            onFullscreenRequest={handleFullscreen}
            isMobile={false}
            tradeDate={effectiveTradeDate}
          />
        </div>
      </Card>

      {/* 赎回信息Modal */}
      <Modal
        title={`${currentName} - 赎回信息`}
        open={showCallInfoModal}
        onCancel={() => setShowCallInfoModal(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
      >
        {callInfo.length > 0 ? (
          <Table
            dataSource={callInfo}
            rowKey={(record) => `${record.ts_code}_${record.ann_date}_${record.call_type}`}
            pagination={false}
            size="small"
            scroll={{ y: 400 }}
            columns={[
              {
                title: '公告日期',
                dataIndex: 'ann_date',
                key: 'ann_date',
                width: 100,
                render: (date: string) => date ? new Date(date).toLocaleDateString() : '-'
              },
              {
                title: '赎回状态',
                dataIndex: 'call_status',
                key: 'call_status',
                width: 140,
                render: (callStatus: any, record: any) => {
                  if (callStatus && callStatus.display_name) {
                    return (
                      <Tag
                        color={callStatus.color || 'default'}
                        title={callStatus.description}
                      >
                        {callStatus.display_name}
                      </Tag>
                    );
                  } else if (record.is_call) {
                    const getStatusColor = (status: string) => {
                      if (status.includes('公告实施强赎') || status.includes('公告到期赎回')) {
                        return 'red';
                      } else if (status.includes('已满足强赎条件')) {
                        return 'orange';
                      } else if (status.includes('公告提示强赎')) {
                        return 'yellow';
                      } else if (status.includes('公告不强赎')) {
                        return 'green';
                      }
                      return 'default';
                    };

                    return (
                      <Tag color={getStatusColor(record.is_call)}>
                        {record.is_call}
                      </Tag>
                    );
                  }
                  return '-';
                }
              },
              {
                title: '赎回价格',
                dataIndex: 'call_price',
                key: 'call_price',
                width: 90,
                render: (price: number) => price ? `¥${price.toFixed(4)}` : '-'
              },
              {
                title: '赎回日期',
                dataIndex: 'call_date',
                key: 'call_date',
                width: 100,
                render: (date: string) => date ? new Date(date).toLocaleDateString() : '-'
              }
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            暂无赎回信息
          </div>
        )}
      </Modal>
    </>
  );
};

export default KLineCard;
