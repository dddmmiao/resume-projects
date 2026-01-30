// 股票卡片组件

import React from 'react';
import KLineChart from '../KLineChart.tsx';
import { convertDateForPeriod } from '../../utils/dateUtils.ts';
import HotFlameIcon from '../HotFlameIcon.tsx';
import { Theme, getThemeColors, getCardBackgroundGradient } from './theme.ts';
import { getValueColor, stripCodeSuffix, resolveKlineDataType } from './utils.ts';
import { DataType, Layout, IndicatorType } from './constants.ts';

interface StockCardProps {
  item: any;
  dataType: DataType;
  layout: Layout;
  theme: Theme;
  period: string | ((code: string) => string);
  timeRange: number | string | ((code: string) => number | string);
  indicator: IndicatorType | ((code: string) => IndicatorType);
  mainOverlays?: Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'> | ((code: string) => Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'>);
  onCardClick: (item: any) => void;
  cardKlineData?: Record<string, any>;
  miniKlines?: Record<string, any[]>;
  onKlineDataUpdate?: (code: string) => (data: any) => void;
  onHotIconClick?: (item: any) => void;
  tradeDate?: string; // 交易日期，K线数据只显示到该日期
}

const StockCardComponent: React.FC<StockCardProps> = ({
  item,
  dataType,
  layout,
  theme,
  period,
  timeRange,
  indicator,
  mainOverlays = [],
  onCardClick,
  cardKlineData = {},
  miniKlines = {},
  onKlineDataUpdate,
  onHotIconClick,
  tradeDate
}) => {
  const currentTheme = getThemeColors(theme);
  
  const baseName = item.name || item.bond_short_name || item.concept_name || item.industry_name || item.ts_name || item.ts_code;
  
  // 判断是否有有效的热度概念和上榜原因（与桌面端逻辑一致）
  const hasValidConcept = item?.hot_concept && typeof item.hot_concept === 'string' && item.hot_concept.trim().length > 0;
  const hasValidReason = item?.hot_rank_reason && typeof item.hot_rank_reason === 'string' && item.hot_rank_reason.trim().length > 0;
  
  // 判断是否显示火苗图标（只有is_hot为true时才显示）
  const isHot = item?.is_hot === true;
  
  // 火苗颜色：两个数据都缺少用橙色，否则用红色（与桌面端逻辑一致）
  const flameColor = (!hasValidConcept && !hasValidReason) ? "#ff9800" : "#ff4d4f";
  
  const code = dataType === 'concept' ? item.concept_code : 
              dataType === 'industry' ? item.industry_code : 
              (item.ts_code || item.code || item.symbol);
  
  // 获取当前周期
  const currentPeriod = typeof period === 'function' ? period(code) : period;
  
  // 获取当前时间范围
  const currentTimeRange = typeof timeRange === 'function' ? timeRange(code) : timeRange;
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

  const effectiveTradeDate = convertDateForPeriod(tradeDate, currentPeriod);
  
  // KLineChart dataType转换：使用工具函数统一处理
  const klineDataType = resolveKlineDataType(dataType, item);
  
  // 优先使用十字线数据，其次使用K线数据，最后使用原始数据
  const crosshairData = cardKlineData[code];
  const last = (miniKlines[code] && miniKlines[code][miniKlines[code].length - 1]) || null;
  const data = crosshairData || last || item;
  
  // 优先使用K线数据（miniKlines），如果没有则显示占位符
  const hasKlineData = last !== null; // last来自miniKlines
  
  const pct = hasKlineData ? Number(data?.pct_chg ?? 0) : null;
  const close = hasKlineData ? Number(data?.close ?? 0) : null;
  const preClose = hasKlineData ? Number(data?.pre_close ?? 0) : null;
  const changeAbs = hasKlineData && close !== null && preClose !== null ? close - preClose : null;
  
  // 获取当前指标
  const getCurrentIndicator = (code: string): IndicatorType => {
    return typeof indicator === 'function' ? indicator(code) : indicator;
  };
  
  // 获取当前主图叠加指标
  const getCurrentMainOverlays = (code: string): Array<'ma' | 'expma' | 'boll' | 'sar' | 'td'> => {
    return typeof mainOverlays === 'function' ? mainOverlays(code) : mainOverlays;
  };

  const handleClick = () => {
    onCardClick(item);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: currentTheme.card,
        borderRadius: layout === 'large' ? 12 : 10,
        padding: layout === 'large' ? '8px' : (layout === 'grid' ? '6px' : '8px'), // 更紧凑布局：large 8px, grid 6px, small 8px
        border: `1px solid ${currentTheme.border}`,
        boxShadow: theme === 'light' 
          ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' 
          : '0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)',
        maxWidth: '100vw',
        overflowX: 'hidden',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        position: 'relative',
        backgroundImage: getCardBackgroundGradient(theme),
      }}
    >
      {/* 标题布局：根据layout模式调整 */}
      {layout === 'large' ? (
        /* 大卡布局：一行显示所有信息 */
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 4, // 更紧凑布局：从6px改为4px
          gap: 6
        }}>
          {/* 左侧：名称 + code（同一行） */}
          <div style={{ 
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            {/* 火苗图标 */}
            {isHot && (
              <span 
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  cursor: onHotIconClick ? 'pointer' : 'default'
                }}
                onClick={(e) => {
                  if (onHotIconClick) {
                    e.stopPropagation();
                    onHotIconClick(item);
                  }
                }}
                onTouchStart={(e) => {
                  if (onHotIconClick) {
                    e.stopPropagation();
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onTouchEnd={(e) => {
                  if (onHotIconClick) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <HotFlameIcon color={flameColor} size={14} />
              </span>
            )}
            <div style={{ 
              fontSize: 16, 
              fontWeight: 700, 
              color: currentTheme.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3
            }}>{baseName}</div>
            <div style={{
              fontSize: 11,
              color: currentTheme.textSecondary,
              fontFamily: 'monospace',
              opacity: 0.7,
              flexShrink: 0
            }}>{stripCodeSuffix(code)}</div>
          </div>
          
          {/* 右侧：涨跌幅 + 收盘价 + 涨跌值 */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0
          }}>
            <div style={{ 
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: (pct ?? 0) > 0 ? currentTheme.positive : (pct ?? 0) < 0 ? currentTheme.negative : currentTheme.text
            }}>{pct !== null && isFinite(pct) ? ((pct >= 0 ? '+' : '') + pct.toFixed(2) + '%') : '--'}</div>
            <div style={{ 
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: close !== null && preClose !== null ? getValueColor(close, preClose, currentTheme) : currentTheme.text,
            }}>{close !== null && isFinite(close) ? close.toFixed(2) : '--'}</div>
            <div style={{ 
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: pct !== null ? (pct > 0 ? currentTheme.positive : pct < 0 ? currentTheme.negative : currentTheme.text) : currentTheme.text,
            }}>{changeAbs !== null && isFinite(changeAbs) ? ((changeAbs >= 0 ? '+' : '') + changeAbs.toFixed(2)) : '--'}</div>
          </div>
        </div>
      ) : (
        /* 网格布局：两行显示 */
        <div style={{ marginBottom: 2 }}> {/* 更紧凑布局：从4px改为2px */}
          {/* 第一行：名称 + code（紧挨着） */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            marginBottom: 3,
            gap: 4
          }}>
            {/* 火苗图标 */}
            {isHot && (
              <span 
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  cursor: onHotIconClick ? 'pointer' : 'default'
                }}
                onClick={(e) => {
                  if (onHotIconClick) {
                    e.stopPropagation();
                    onHotIconClick(item);
                  }
                }}
                onTouchStart={(e) => {
                  if (onHotIconClick) {
                    e.stopPropagation();
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onTouchEnd={(e) => {
                  if (onHotIconClick) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <HotFlameIcon color={flameColor} size={12} />
              </span>
            )}
            <div style={{ 
              fontSize: 14, 
              fontWeight: 700, 
              color: currentTheme.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              lineHeight: 1.3
            }}>{baseName}</div>
            <div style={{
              fontSize: 10,
              color: currentTheme.textSecondary,
              fontFamily: 'monospace',
              opacity: 0.7,
              flexShrink: 0
            }}>{stripCodeSuffix(code)}</div>
          </div>
          
          {/* 第二行：涨跌幅 + 收盘价 + 涨跌值（平均分布） */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between', // 平均分布
            gap: 4
          }}>
            {/* 涨跌幅放到最前方 */}
            <div style={{ 
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: pct !== null ? (pct > 0 ? currentTheme.positive : pct < 0 ? currentTheme.negative : currentTheme.text) : currentTheme.text,
              flex: 1,
              textAlign: 'left'
            }}>{pct !== null && isFinite(pct) ? ((pct >= 0 ? '+' : '') + pct.toFixed(2) + '%') : '--'}</div>
            <div style={{ 
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: close !== null && preClose !== null ? getValueColor(close, preClose, currentTheme) : currentTheme.text,
              flex: 1,
              textAlign: 'center'
            }}>{close !== null && isFinite(close) ? close.toFixed(2) : '--'}</div>
            <div style={{ 
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: pct !== null ? (pct > 0 ? currentTheme.positive : pct < 0 ? currentTheme.negative : currentTheme.text) : currentTheme.text,
              flex: 1,
              textAlign: 'right'
            }}>{changeAbs !== null && isFinite(changeAbs) ? ((changeAbs >= 0 ? '+' : '') + changeAbs.toFixed(2)) : '--'}</div>
          </div>
        </div>
      )}
      
      {/* K线图 */}
      {(layout === 'large' || layout === 'grid') && (
        <div
          style={{
            // 允许垂直滚动页面，水平方向由K线图处理
            touchAction: 'pan-y',
          }}
          onClick={(e) => {
            // 阻止点击事件冒泡，避免触发卡片的跳转
            e.stopPropagation();
          }}
        >
          <KLineChart
            key={`${code}-${layout}-${currentTimeRange}`}
            ts_code={code}
            dataType={klineDataType}
            theme={theme}
            width="100%"
            period={currentPeriod}
            indicator={getCurrentIndicator(code) as any}
            mainIndicators={getCurrentMainOverlays(code)}
            height={layout === 'large' ? 180 : 120}
            initialCount={initialCount}
            refreshKey={0}
            globalIsSnapMode={false}
            onLatestDataUpdate={onKlineDataUpdate?.(code)}
            isMobile={true}
            showYAxis={false}
            showInfoBar={false}
            showIndicatorLabels={layout !== 'grid'}
            enableCrosshair={true}
            showDoubleClickHint={false}
            colorScheme="red-up-green-down"
            tradeDate={effectiveTradeDate}
            timeRange={currentTimeRange}
          />
        </div>
      )}
    </div>
  );
};

export const StockCard = StockCardComponent;

export default StockCard;
