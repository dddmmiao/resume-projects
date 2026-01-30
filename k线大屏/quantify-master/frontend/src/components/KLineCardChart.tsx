import React from 'react';
import KLineChart from './KLineChart.tsx';

interface Props {
  theme: string;
  currentTsCode: string;
  currentPeriod: string;
  currentName: string;
  item: any;
  originalItem: any;
  isShowingUnderlying: boolean;
  isShowingBond: boolean;
  dataType: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'concept' | 'industry';
  currentTimeRange: number | string | undefined;
  currentIndicator: string;
  currentMainOverlays: string[];
  refreshKey: number;
  globalIsSnapMode: boolean;
  onLatestDataUpdate: (data: any) => void;
  onSnapModeChange?: (isSnapMode: boolean) => void;
  onFullscreenRequest?: () => void; // 请求全屏回调
  isMobile?: boolean; // 是否为移动端
  tradeDate?: string; // 交易日期，K线数据只显示到该日期
}

interface KLineCardChartProps extends Props {
  style?: React.CSSProperties;
}

const KLineCardChart: React.FC<KLineCardChartProps> = ({
  theme,
  currentTsCode,
  currentPeriod,
  currentName,
  item,
  originalItem,
  isShowingUnderlying,
  isShowingBond,
  dataType,
  currentTimeRange,
  currentIndicator,
  currentMainOverlays,
  refreshKey,
  globalIsSnapMode,
  onLatestDataUpdate,
  onSnapModeChange,
  onFullscreenRequest,
  isMobile,
  tradeDate,
  style,
}) => {
  // 动态确定数据类型
  const getChartDataType = () => {
    // - 原始可转债切换到正股 → 'stock'
    // - 原始可转债未切换 → 'convertible_bond'
    // - 原始股票切换到可转债 → 'convertible_bond'
    // - 原始股票未切换 → 'stock'
    // - 其他情况保持原始类型
    if (item.type === 'convertible_bond' && isShowingUnderlying) {
      return 'stock';
    } else if (item.type === 'convertible_bond' && !isShowingUnderlying) {
      return 'convertible_bond';
    } else if (originalItem.type === 'stock' && isShowingBond) {
      return 'convertible_bond';
    } else if (originalItem.type === 'stock' && !isShowingBond) {
      return 'stock';
    } else if (dataType === 'concept') {
      return 'concept';
    } else if (dataType === 'industry') {
      return 'industry';
    }
    return dataType;
  };




  // 将timeRange转换为initialCount
  const getInitialCount = (range: number | string | undefined): number => {
    if (range === 'all') {
      return 1095; // 全部数据
    }
    if (typeof range === 'number') {
      return range; // 直接使用天数作为K线根数
    }
    return 200; // 默认200根
  };
  const initialCount = getInitialCount(currentTimeRange);

  return (
    <div className="kline-chart-container" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', ...style }}>
      <KLineChart
        key={`${currentTsCode}-${currentPeriod}-${currentTimeRange}-${currentIndicator}`}
        ts_code={currentTsCode}
        dataType={getChartDataType()}
        width="100%"
        height="100%"
        initialCount={initialCount}
        period={currentPeriod}
        indicator={currentIndicator}
        mainIndicators={currentMainOverlays}
        isFullscreen={false}
        refreshKey={refreshKey}
        onLatestDataUpdate={onLatestDataUpdate}
        globalIsSnapMode={globalIsSnapMode}
        onSnapModeChange={onSnapModeChange}
        onFullscreenRequest={onFullscreenRequest}
        theme={theme}
        isMobile={isMobile}
        tradeDate={tradeDate}
        timeRange={currentTimeRange}
      />
    </div>
  );
};

export default KLineCardChart;
