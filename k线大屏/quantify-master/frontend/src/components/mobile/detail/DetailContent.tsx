/**
 * 移动端详情页 - 主内容组件
 * 包含价格信息、K线图、控制按钮等
 */

import React from 'react';
import KLineChart, { KLineChartRef } from '../../KLineChart.tsx';
import { calculateIntraperiodPctChg, calculateVolatility, getIntraperiodLabel } from '../../../utils/klineCalculations.ts';
import { ToolbarButton } from '../ToolbarButton.tsx';
import {
  INDICATOR_OPTIONS,
  OVERLAY_INDICATOR_OPTIONS,
  PERIOD_OPTIONS,
  TIME_RANGE_OPTIONS,
  type Period,
} from '../constants.ts';
import { DetailHeader } from './DetailHeader.tsx';
import type { DetailDrawerContentProps } from './types.ts';
import { convertDateForPeriod } from '../../../utils/dateUtils.ts';

export const DetailContent: React.FC<DetailDrawerContentProps> = ({
  theme,
  currentTheme,
  selectedStock,
  detailCurrentTsCode,
  detailCurrentName,
  detailDataType,
  dataType,
  originalSelectedStock,
  isShowingUnderlying,
  isShowingBond,
  currentKlineData,
  miniKlines,
  getPeriodForCode,
  getTimeRangeForCode,
  getIndicatorForCode,
  getMainOverlaysForCode,
  setDetailCurrentTsCode,
  setDetailCurrentName,
  setDetailDataType,
  setIsShowingUnderlying,
  setIsShowingBond,
  setTagsModalVisible,
  setCallRecordsModalVisible,
  setHotInfoModalVisible,
  setDetailPeriodDrawerVisible,
  setDetailTimeRangeDrawerVisible,
  setDetailIndicatorDrawerVisible,
  handleDetailClose,
  globalIsSnapMode,
  setGlobalIsSnapMode,
  tradeDate,
  handleKlineDataUpdate,
  favoriteGroups,
  isInFavorites,
  onFavoriteClick,
}) => {
  const klineChartRef = React.useRef<KLineChartRef | null>(null);

  if (!selectedStock) {
    return null;
  }

  const effectiveTradeDate = convertDateForPeriod(tradeDate, getPeriodForCode(detailCurrentTsCode));

  // 数据源优先级：十字线 > K线 > 原始数据
  const data = currentKlineData || (miniKlines[detailCurrentTsCode] && miniKlines[detailCurrentTsCode][miniKlines[detailCurrentTsCode].length - 1]) || selectedStock;

  const close = Number(data?.close ?? data?.latest_price ?? 0);
  const open = Number(data?.open ?? 0);
  const high = Number(data?.high ?? 0);
  const low = Number(data?.low ?? 0);
  const pct = Number(data?.pct_chg ?? data?.change ?? 0);

  // 使用共用函数计算周期内涨跌幅和波动率
  const changePct = calculateIntraperiodPctChg(data);
  const volatility = calculateVolatility(data);

  // 涨跌状态
  const isUp = (pct ?? 0) > 0;
  const isDown = (pct ?? 0) < 0;
  const statusColor = isUp ? currentTheme.positive : isDown ? currentTheme.negative : currentTheme.text;

  // 判断是否有有效的热度概念和上榜原因（与桌面端逻辑一致）
  const hasValidConcept = selectedStock?.hot_concept && typeof selectedStock.hot_concept === 'string' && selectedStock.hot_concept.trim().length > 0;
  const hasValidReason = selectedStock?.hot_rank_reason && typeof selectedStock.hot_rank_reason === 'string' && selectedStock.hot_rank_reason.trim().length > 0;

  // 判断是否显示火苗图标（只有is_hot为true时才显示）
  const isHot = selectedStock?.is_hot === true;

  // 火苗颜色：两个数据都缺少用橙色，否则用红色（与桌面端逻辑一致）
  const flameColor = (!hasValidConcept && !hasValidReason) ? "#ff9800" : "#ff4d4f";

  // 只有当至少有一个有效数据时才允许点击
  const canOpenModal = hasValidConcept || hasValidReason;

  const handleHotIconClick = (e: React.MouseEvent) => {
    if (!canOpenModal) {
      return; // 如果没有有效数据，不打开弹窗
    }
    e.preventDefault();
    e.stopPropagation();
    // 与列表页保持一致：点击火苗打开热度信息弹窗
    setHotInfoModalVisible(true);
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: currentTheme.bg,
      overflow: 'hidden'
    }}>
      {/* 详情页头部 */}
      <div style={{ 
        padding: '20px 16px 8px',
        background: currentTheme.bg,
        flexShrink: 0,
        position: 'relative',
        zIndex: 2001
      }}>
        <DetailHeader
          currentTheme={currentTheme}
          selectedStock={selectedStock}
          detailCurrentTsCode={detailCurrentTsCode}
          detailCurrentName={detailCurrentName}
          detailDataType={detailDataType}
          dataType={dataType}
          originalSelectedStock={originalSelectedStock}
          isShowingUnderlying={isShowingUnderlying}
          isShowingBond={isShowingBond}
          setDetailCurrentTsCode={setDetailCurrentTsCode}
          setDetailCurrentName={setDetailCurrentName}
          setDetailDataType={setDetailDataType}
          setIsShowingUnderlying={setIsShowingUnderlying}
          setIsShowingBond={setIsShowingBond}
          setTagsModalVisible={setTagsModalVisible}
          setCallRecordsModalVisible={setCallRecordsModalVisible}
          handleDetailClose={handleDetailClose}
          isHot={isHot}
          flameColor={flameColor}
          canOpenModal={canOpenModal}
          handleHotIconClick={handleHotIconClick}
          favoriteGroups={favoriteGroups}
          isInFavorites={isInFavorites}
          onFavoriteClick={onFavoriteClick}
        />
      </div>
      
      {/* 价格信息区域 */}
      <div style={{ 
        padding: '0px 16px 8px',
        background: currentTheme.bg,
        flexShrink: 0,
        position: 'relative',
        zIndex: 2001
      }}>
        {/* 价格信息和开高低波动率 - 统一容器 */}
        <div
          style={{
            padding: '10px',
            borderRadius: 12,
            background: theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)',
            marginBottom: 2,
          }}
        >
          {/* 价格信息行：收 / 涨跌% / 波动% */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 10,
            }}
          >
            {/* 收盘价 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: currentTheme.textSecondary,
                  fontWeight: 500,
                }}
              >
                收
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: statusColor,
                }}
              >
                {isFinite(close) ? close.toFixed(2) : '--'}
              </span>
            </div>

            {/* 涨跌幅 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: currentTheme.textSecondary,
                  fontWeight: 500,
                }}
              >
                涨跌
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: statusColor,
                }}
              >
                {isFinite(Number(pct))
                  ? `${(pct ?? 0) >= 0 ? '+' : ''}${Number(pct ?? 0).toFixed(2)}%`
                  : '--'}
              </span>
            </div>

            {/* 波动率 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: currentTheme.textSecondary,
                  fontWeight: 500,
                }}
              >
                波动
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color:
                    volatility !== null && isFinite(volatility)
                      ? volatility > 0
                        ? currentTheme.positive
                        : volatility < 0
                          ? currentTheme.negative
                          : currentTheme.text
                      : currentTheme.textSecondary,
                }}
              >
                {volatility !== null && isFinite(volatility)
                  ? `${volatility >= 0 ? '+' : ''}${volatility.toFixed(2)}%`
                  : '--'}
              </span>
            </div>
          </div>

          {/* 开/高/低/日涨 行 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1.2fr', // 最后一列稍宽，防止"周内"换行
              gap: 3, // 减小间距，留出更多空间
            }}
          >
            {(() => {
              const period = getPeriodForCode(detailCurrentTsCode) as Period;
              const intraperiodLabel = getIntraperiodLabel(period);

              return ([ 
                { key: 'open', label: '开', value: open, isPercent: false },
                { key: 'high', label: '高', value: high, isPercent: false },
                { key: 'low', label: '低', value: low, isPercent: false },
                { key: 'intraperiod', label: intraperiodLabel, value: changePct, isPercent: true },
              ] as const).map((item) => {
              // 计算颜色：开盘、最高、最低与收盘价比较，日涨根据正负
              let itemColor = currentTheme.text;
              if (item.key === 'open' && item.value !== null && isFinite(item.value) && isFinite(close)) {
                itemColor = item.value > close ? currentTheme.positive : item.value < close ? currentTheme.negative : currentTheme.text;
              } else if (item.key === 'high' && item.value !== null && isFinite(item.value) && isFinite(close)) {
                itemColor = item.value > close ? currentTheme.positive : currentTheme.text;
              } else if (item.key === 'low' && item.value !== null && isFinite(item.value) && isFinite(close)) {
                itemColor = item.value < close ? currentTheme.negative : currentTheme.text;
              } else if (item.key === 'intraperiod' && item.value !== null && isFinite(item.value)) {
                itemColor = item.value > 0 ? currentTheme.positive : item.value < 0 ? currentTheme.negative : currentTheme.text;
              }

              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3, // 标签和数值间距也减小
                    justifyContent: 'center',
                    whiteSpace: 'nowrap', // 防止换行
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: currentTheme.textSecondary,
                      fontWeight: 500,
                      flexShrink: 0, // 标签不压缩
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: itemColor,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.value !== null && isFinite(item.value)
                      ? item.isPercent
                        ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%`
                        : item.value.toFixed(2)
                      : '--'}
                  </span>
                </div>
              );
            });
            })()}
          </div>
        </div>
      </div>

      {/* K线图区域 */}
      <div style={{ 
        flex: 1, 
        padding: '0px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        zIndex: 1
      }}>
        {/* 控制tab行 - 使用tab+半屏方式 */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginBottom: 4,
          overflowX: 'auto',
          paddingBottom: 4
        }} className="hide-scrollbar">
          {/* 周期选择 */}
          <ToolbarButton
            theme={theme}
            onClick={() => setDetailPeriodDrawerVisible(true)}
          >
            {(() => {
              const currentPeriod = getPeriodForCode(detailCurrentTsCode);
              const current = PERIOD_OPTIONS.find(opt => opt.value === currentPeriod) || PERIOD_OPTIONS[0];
              return `${current.icon} ${current.label}`;
            })()}
          </ToolbarButton>

          {/* 范围选择 */}
          <ToolbarButton
            theme={theme}
            onClick={() => setDetailTimeRangeDrawerVisible(true)}
          >
            {(() => {
              const currentTimeRange = getTimeRangeForCode(detailCurrentTsCode);
              const current = TIME_RANGE_OPTIONS.find(opt => opt.value === currentTimeRange);
              return current ? `${current.label}` : '范围';
            })()}
          </ToolbarButton>

          {/* 指标选择 */}
          <ToolbarButton
            theme={theme}
            onClick={() => setDetailIndicatorDrawerVisible(true)}
            active={(() => {
              const subIndicator = getIndicatorForCode(detailCurrentTsCode);
              const overlays = getMainOverlaysForCode?.(detailCurrentTsCode) || [];
              return subIndicator !== 'none' || overlays.length > 0;
            })()}
            activeColor={currentTheme.text}
          >
            {(() => {
              const subIndicator = getIndicatorForCode(detailCurrentTsCode);
              const overlays = getMainOverlaysForCode?.(detailCurrentTsCode) || [];

              const labels: string[] = [];

              if (subIndicator && subIndicator !== 'none') {
                const subOpt = INDICATOR_OPTIONS.find(opt => opt.key === subIndicator);
                if (subOpt?.label) {
                  labels.push(subOpt.label);
                }
              }

              overlays.forEach((key) => {
                const overlayOpt = OVERLAY_INDICATOR_OPTIONS.find(opt => opt.key === key);
                if (overlayOpt?.label) {
                  labels.push(overlayOpt.label);
                }
              });

              if (labels.length === 0) return '指标';
              if (labels.length === 1) return labels[0] || '指标';
              return `指标×${labels.length}`;
            })()}
          </ToolbarButton>

          {/* 画线入口 */}
          <ToolbarButton
            theme={theme}
            onClick={() => {
              klineChartRef.current?.toggleDrawingMode?.();
            }}
          >
            画线
          </ToolbarButton>
        </div>

        {/* 大K线图 */}
        <div style={{ 
          flex: 1,
          minHeight: 400,
          background: theme === 'light' 
            ? 'linear-gradient(to bottom, rgba(0,0,0,0.01), rgba(0,0,0,0.02))'
            : 'linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
          borderRadius: 8,
          border: `1px solid ${currentTheme.border}`,
          borderTop: 'none',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <KLineChart
            ref={klineChartRef}
            key={`${detailCurrentTsCode}-${detailDataType}-${getPeriodForCode(detailCurrentTsCode)}-${getTimeRangeForCode(detailCurrentTsCode)}-${getIndicatorForCode(detailCurrentTsCode)}-${(getMainOverlaysForCode?.(detailCurrentTsCode) || []).join(',')}`}
            ts_code={detailCurrentTsCode}
            theme={theme}
            period={getPeriodForCode(detailCurrentTsCode)}
            indicator={getIndicatorForCode(detailCurrentTsCode)}
            mainIndicators={getMainOverlaysForCode?.(detailCurrentTsCode) || []}
            dataType={detailDataType}
            initialCount={(() => {
              // 将时间范围转换为initialCount
              const currentTimeRange = getTimeRangeForCode(detailCurrentTsCode);
              if (currentTimeRange === 'all') {
                return 1095; // 全部数据
              }
              if (typeof currentTimeRange === 'number') {
                return currentTimeRange; // 直接使用天数作为K线根数
              }
              return 60; // 默认60根
            })()}
            width="100%"
            height="100%"
            isFullscreen={true}
            refreshKey={0}
            globalIsSnapMode={globalIsSnapMode}
            onSnapModeChange={setGlobalIsSnapMode}
            onLatestDataUpdate={handleKlineDataUpdate}
            isMobile={true}
            showYAxis={true}
            showInfoBar={true}
            showIndicatorLabels={true}
            enableCrosshair={true}
            colorScheme="red-up-green-down"
            tradeDate={effectiveTradeDate}
            timeRange={getTimeRangeForCode(detailCurrentTsCode)}
          />
        </div>
      </div>
    </div>
  );
};
