import React, { useCallback } from 'react';
import { Drawer, Button } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import KLineChart from '../KLineChart.tsx';
import { convertDateForPeriod } from '../../utils/dateUtils.ts';
import { SelectionDrawer } from './SelectionDrawer.tsx';
import { type IndicatorType, type Period } from './constants.ts';
import { formatVolume } from './utils.ts';

interface MobileDetailModalProps {
  // 基础状态
  visible: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  currentTheme: any;
  
  // 股票数据
  selectedStock: any;
  detailCurrentTsCode: string;
  detailCurrentName: string;
  detailDataType: string;
  
  // K线数据
  currentKlineData: any;
  
  // 设置状态
  cardPeriods: any;
  cardIndicators: any;
  cardMainOverlays: any;
  globalIsSnapMode: boolean;
  period: Period;
  indicator: IndicatorType;
  mainOverlays: Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>;
  tradeDate: string;
  
  // Drawer状态
  detailPeriodDrawerVisible: boolean;
  detailTimeRangeDrawerVisible: boolean;
  detailIndicatorDrawerVisible: boolean;
  
  // 事件处理
  onKlineDataUpdate: (data: any) => void;
  onSnapModeChange: (mode: boolean) => void;
  onDetailPeriodDrawerVisibleChange: (visible: boolean) => void;
  onDetailTimeRangeDrawerVisibleChange: (visible: boolean) => void;
  onDetailIndicatorDrawerVisibleChange: (visible: boolean) => void;
  onHotInfoModalVisibleChange: (visible: boolean) => void;
  
  // 工具函数
  getTimeRangeForCode: (code: string) => number | string;
  getMainOverlaysForCode: (code: string) => Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>;
  setPeriodForCode: (code: string, period: Period) => void;
  setTimeRangeForCode: (code: string, range: number | string) => void;
  setIndicatorForCode: (code: string, indicator: IndicatorType) => void;
  setMainOverlaysForCode: (code: string, overlays: Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>) => void;
  
  // 常量
  PERIOD_OPTIONS: readonly any[];
  TIME_RANGE_OPTIONS: readonly any[];
  INDICATOR_OPTIONS: readonly any[];
  
  // 其他配置
  afterOpenChange: (open: boolean) => void;
  
  // 收藏功能
  favoriteGroups?: string[];
  isInFavorites?: (ts_code: string, groupName: string, itemType?: string) => boolean;
  onFavoriteClick?: () => void;
}

export const MobileDetailModal: React.FC<MobileDetailModalProps> = ({
  visible,
  onClose,
  theme,
  currentTheme,
  selectedStock,
  detailCurrentTsCode,
  detailCurrentName,
  detailDataType,
  currentKlineData,
  period,
  indicator,
  mainOverlays,
  globalIsSnapMode,
  tradeDate,
  cardPeriods,
  cardIndicators,
  cardMainOverlays,
  detailPeriodDrawerVisible,
  detailTimeRangeDrawerVisible,
  detailIndicatorDrawerVisible,
  onKlineDataUpdate,
  onSnapModeChange,
  onDetailPeriodDrawerVisibleChange,
  onDetailTimeRangeDrawerVisibleChange,
  onDetailIndicatorDrawerVisibleChange,
  onHotInfoModalVisibleChange,
  getTimeRangeForCode,
  getMainOverlaysForCode,
  setPeriodForCode,
  setTimeRangeForCode,
  setIndicatorForCode,
  setMainOverlaysForCode,
  PERIOD_OPTIONS,
  TIME_RANGE_OPTIONS,
  INDICATOR_OPTIONS,
  afterOpenChange,
  favoriteGroups = [],
  isInFavorites,
  onFavoriteClick,
}) => {
  // 关闭事件处理器
  const handleClose = useCallback(() => {
    // 通知对应代码的列表卡片刷新画线
    if (detailCurrentTsCode) {
      window.dispatchEvent(new CustomEvent('refreshDrawings', {
        detail: { ts_code: detailCurrentTsCode }
      }));
    }
    onClose();
  }, [onClose, detailCurrentTsCode]);

  // 渲染详情页头部
  const renderDetailHeader = () => {
    if (!selectedStock) return null;

    const { pct, high, low, close, open } = currentKlineData || {};
    const volatility = (() => {
      if (!high || !low || !close) {
        return null;
      }
      if (!isFinite(open)) {
        return (high - low) / close * 100;
      }
      const volatilityAbs = (high - low) / close * 100;
      return close >= open ? volatilityAbs : -volatilityAbs;
    })();

    const isUp = (pct ?? 0) > 0;
    const isDown = (pct ?? 0) < 0;
    const statusColor = isUp ? currentTheme.positive : isDown ? currentTheme.negative : currentTheme.text;

    const hasValidConcept = selectedStock?.hot_concept && typeof selectedStock.hot_concept === 'string' && selectedStock.hot_concept.trim().length > 0;
    const hasValidReason = selectedStock?.hot_rank_reason && typeof selectedStock.hot_rank_reason === 'string' && selectedStock.hot_rank_reason.trim().length > 0;
    const isHot = selectedStock?.is_hot === true;
    const flameColor = (!hasValidConcept && !hasValidReason) ? "#ff9800" : "#ff4d4f";
    const canOpenModal = hasValidConcept || hasValidReason;

    const handleHotIconClick = (e: React.MouseEvent) => {
      if (!canOpenModal) return;
      e.preventDefault();
      e.stopPropagation();
      onHotInfoModalVisibleChange(true);
    };

    return (
      <>
        {/* 第一行：名称 + code + 关闭按钮 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between', 
          alignItems: 'flex-end',
          marginBottom: 10,
          gap: 8
        }}>
          <div style={{ 
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            flex: 1,
            minWidth: 0
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: currentTheme.text,
              lineHeight: '24px'
            }}>
              {detailCurrentName}
            </div>
            
            {/* 热度火苗图标 */}
            {isHot && (
              <div 
                onClick={handleHotIconClick}
                style={{
                  cursor: canOpenModal ? 'pointer' : 'default',
                  opacity: canOpenModal ? 1 : 0.6,
                  fontSize: 16,
                  color: flameColor,
                  marginBottom: 1,
                  transition: 'all 0.2s',
                  transform: canOpenModal ? 'none' : 'scale(0.9)'
                }}
              >
                🔥
              </div>
            )}
            
            <span style={{
              fontSize: 12,
              color: currentTheme.textSecondary,
              fontFamily: 'monospace',
              fontWeight: 600,
              marginBottom: 2
            }}>
              {detailCurrentTsCode}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* 收藏按钮 */}
            {onFavoriteClick && (
              <Button 
                type="text" 
                onClick={(e) => {
                  e.stopPropagation();
                  onFavoriteClick();
                }}
                style={{ 
                  color: favoriteGroups.length > 0 && isInFavorites && favoriteGroups.some(g => isInFavorites(detailCurrentTsCode, g, detailDataType))
                    ? '#faad14' 
                    : currentTheme.textSecondary,
                  padding: 4,
                  minWidth: 'auto',
                  fontSize: 20,
                }}
                icon={
                  favoriteGroups.length > 0 && isInFavorites && favoriteGroups.some(g => isInFavorites(detailCurrentTsCode, g, detailDataType))
                    ? <StarFilled />
                    : <StarOutlined />
                }
              />
            )}
            {/* 关闭按钮 */}
            <Button 
              type="text" 
              onClick={handleClose}
              className="detail-close-button"
              style={{ 
                color: currentTheme.textSecondary,
                padding: 4,
                minWidth: 'auto',
              }}
              icon={<span style={{ fontSize: 22 }}>✕</span>}
            />
          </div>
        </div>

        {/* 第二行：价格信息 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            {/* 最新价 */}
            <div style={{
              fontSize: 28,
              fontWeight: 700,
              color: statusColor,
              fontFamily: 'monospace',
              lineHeight: 1
            }}>
              {currentKlineData?.close ? 
                (detailDataType === 'convertible_bond' ? 
                  `${currentKlineData.close.toFixed(2)}` : 
                  `${currentKlineData.close.toFixed(2)}`
                ) : 
                '--'
              }
            </div>

            {/* 涨跌幅 */}
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: statusColor,
              marginLeft: 4
            }}>
              {pct !== undefined ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
            </div>
          </div>

          {/* 详细数据行 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 16px',
            fontSize: 12,
            color: currentTheme.textSecondary
          }}>
            {[
              { label: '开盘', value: currentKlineData?.open?.toFixed(2) || '--', color: currentTheme.text },
              { label: '最高', value: currentKlineData?.high?.toFixed(2) || '--', color: currentTheme.positive },
              { label: '最低', value: currentKlineData?.low?.toFixed(2) || '--', color: currentTheme.negative },
              { label: '成交量', value: formatVolume(currentKlineData?.volume), color: currentTheme.text },
              volatility !== null ? { label: '振幅', value: `${volatility.toFixed(2)}%`, color: volatility >= 0 ? currentTheme.positive : currentTheme.negative } : null
            ].filter(Boolean).map((item: any) => (
              <div key={item.label} style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span>{item.label}</span>
                <span style={{ 
                  color: item.color,
                  fontWeight: 500,
                  fontFamily: 'monospace'
                }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {/* 主要详情页Drawer */}
      <Drawer
        className={theme === 'dark' ? 'mobile-drawer-dark' : 'mobile-drawer-light'}
        title={null}
        placement="bottom"
        onClose={handleClose}
        open={visible}
        height="100vh"
        afterOpenChange={afterOpenChange}
        destroyOnHidden={false}
        styles={{
          body: { background: currentTheme.bg, color: currentTheme.text, padding: 0 },
          mask: { background: 'rgba(0, 0, 0, 0.45)' }
        }}
        maskClosable={true}
        keyboard={true}
      >
        <div style={{ 
          padding: '20px 16px 8px',
          background: 'transparent'
        }}>
          {renderDetailHeader()}
          
          <div style={{ marginBottom: 16 }}>
            {(() => {
              const currentPeriod = cardPeriods[detailCurrentTsCode] || period;
              const effectiveTradeDate = convertDateForPeriod(tradeDate, currentPeriod);
              return (
            <KLineChart
              key={`detail-${detailCurrentTsCode}`}
              ts_code={detailCurrentTsCode}
              dataType={selectedStock?.data_type || detailDataType}
              width="100%"
              height="400px"
              period={currentPeriod}
              indicator={cardIndicators[detailCurrentTsCode] || indicator}
              mainIndicators={cardMainOverlays[detailCurrentTsCode] || mainOverlays}
              refreshKey={0}
              onLatestDataUpdate={onKlineDataUpdate}
              globalIsSnapMode={globalIsSnapMode}
              onSnapModeChange={onSnapModeChange}
              theme={currentTheme.name}
              isMobile={true}
              showYAxis={true}
              showInfoBar={true}
              showIndicatorLabels={true}
              enableCrosshair={true}
              colorScheme="red-up-green-down"
              tradeDate={effectiveTradeDate}
              timeRange={getTimeRangeForCode(detailCurrentTsCode)}
            />
              );
            })()}
          </div>
        </div>
      </Drawer>

      {/* 详情页专用Drawer - 周期选择 */}
      <SelectionDrawer
        theme={theme}
        title="选择周期"
        open={detailPeriodDrawerVisible}
        onClose={() => onDetailPeriodDrawerVisibleChange(false)}
        options={PERIOD_OPTIONS.map(item => ({
          key: item.value,
          label: item.label,
          value: item.value
        }))}
        selectedValue={cardPeriods[detailCurrentTsCode] || period}
        valueKey="value"
        onSelect={(option) => {
          setPeriodForCode(detailCurrentTsCode, option.value as Period);
        }}
      />

      {/* 详情页专用Drawer - 指标选择 */}
      <SelectionDrawer
        theme={theme}
        title="选择指标"
        open={detailIndicatorDrawerVisible}
        onClose={() => onDetailIndicatorDrawerVisibleChange(false)}
        options={INDICATOR_OPTIONS.map(item => ({
          key: item.key,
          label: item.label,
          value: item.key
        }))}
        selectedValue={cardIndicators[detailCurrentTsCode] || indicator}
        valueKey="value"
        onSelect={(option) => {
          setIndicatorForCode(detailCurrentTsCode, option.value as IndicatorType);
        }}
      />

      {/* 详情页专用Drawer - 范围选择 */}
      <SelectionDrawer
        theme={theme}
        title="选择范围"
        open={detailTimeRangeDrawerVisible}
        onClose={() => onDetailTimeRangeDrawerVisibleChange(false)}
        options={TIME_RANGE_OPTIONS.map(item => ({
          key: String(item.value),
          label: item.label,
          value: item.value
        }))}
        selectedValue={String(getTimeRangeForCode(detailCurrentTsCode))}
        valueKey="value"
        onSelect={(option) => {
          setTimeRangeForCode(detailCurrentTsCode, option.value as number | string);
        }}
      />
    </>
  );
};

export default MobileDetailModal;
