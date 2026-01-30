import React from 'react';
import { ExtendedChartType, RANGE_PRESETS, CHART_TYPE_LABELS } from './constants.ts';

// 重新导出供外部使用
export type { ExtendedChartType };
export { RANGE_PRESETS, CHART_TYPE_LABELS };

interface StatsButtonProps {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  isDarkTheme: boolean;
  textColor: string;
}

export const StatsButton: React.FC<StatsButtonProps> = ({
  label,
  isActive = false,
  onClick,
  isDarkTheme,
  textColor,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      fontSize: 12,
      padding: '4px 12px',
      borderRadius: 4,
      border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
      background: isActive
        ? (isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
        : (isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
      color: textColor,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }}
  >
    {label}
  </button>
);

// 数据维度类型
export type DataMetricType = 'pct_chg' | 'max_pct' | 'min_pct';

interface ChartControlsProps {
  // 图表类型（必填）
  chartType: ExtendedChartType;
  setChartType: React.Dispatch<React.SetStateAction<ExtendedChartType>>;
  availableChartTypes?: ExtendedChartType[];
  // 对数/线性切换（柱状图、散点图可用）
  useLogScale: boolean;
  setUseLogScale: React.Dispatch<React.SetStateAction<boolean>>;
  // 数据类型切换（支持三态：收盘、日内、两者）
  pieDataType?: 'close' | 'intraday' | 'both';
  setPieDataType?: React.Dispatch<React.SetStateAction<'close' | 'intraday' | 'both'>>;
  showPieDataTypeToggle?: boolean;
  // 数据维度切换（日期对比模式：区间涨跌/最大涨幅/最大回撤）
  dataMetric?: DataMetricType;
  setDataMetric?: React.Dispatch<React.SetStateAction<DataMetricType>>;
  showDataMetricToggle?: boolean;
  // 搜索
  searchKeyword?: string;
  setSearchKeyword?: React.Dispatch<React.SetStateAction<string>>;
  // 主题
  isDarkTheme: boolean;
  textColor: string;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  chartType,
  setChartType,
  availableChartTypes = ['bar', 'pie', 'distribution', 'bubble', 'treemap'],
  useLogScale,
  setUseLogScale,
  pieDataType,
  setPieDataType,
  showPieDataTypeToggle = false,
  dataMetric,
  setDataMetric,
  showDataMetricToggle = false,
  searchKeyword,
  setSearchKeyword,
  isDarkTheme,
  textColor,
}) => {
  // 判断当前图表类型的特性
  const supportsLogScale = chartType === 'bar' || chartType === 'bubble';
  const supportsSearch = chartType === 'treemap' || chartType === 'bubble';
  const supportsDataTypeToggle = ['bar', 'pie', 'bubble', 'distribution', 'treemap'].includes(chartType);
  // 柱状图和分布图支持三态（收盘/日内/两者），其他图表只支持两态（收盘/日内）
  const supportsThreeState = chartType === 'bar' || chartType === 'distribution';
  
  
  return (
    <>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        fontSize: 12,
        marginBottom: 8,
        color: textColor,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 图表类型切换 */}
        {availableChartTypes.map(type => (
          <StatsButton
            key={type}
            label={CHART_TYPE_LABELS[type]}
            isActive={chartType === type}
            onClick={() => setChartType(type)}
            isDarkTheme={isDarkTheme}
            textColor={textColor}
          />
        ))}
        {/* 数据类型切换已移至 CompareChart 组件内部 */}
      </div>
      
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* 搜索框：仅在树图/词云/气泡图时显示，样式与按钮一致 */}
        {supportsSearch && setSearchKeyword && (
          <input
            type="text"
            placeholder="搜索代码/名称"
            value={searchKeyword || ''}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{
              fontSize: 12,
              padding: '4px 12px',
              height: 28,
              boxSizing: 'border-box',
              borderRadius: 4,
              border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`,
              background: isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
              color: textColor,
              outline: 'none',
              width: 120,
            }}
          />
        )}
                {/* 功能按钮：对数/线性 */}
        {supportsLogScale && (
          <StatsButton
            label={useLogScale ? '线性' : '对数'}
            isActive={useLogScale}
            onClick={() => setUseLogScale(prev => !prev)}
            isDarkTheme={isDarkTheme}
            textColor={textColor}
          />
        )}
        {/* 收盘/日内切换（柱状图和分布图支持三态，其他图表两态） */}
        {supportsDataTypeToggle && setPieDataType && (
          <StatsButton
            label={pieDataType === 'both' ? '收盘+日内' : pieDataType === 'intraday' ? '日内' : '收盘'}
            isActive={pieDataType !== 'close'}
            onClick={() => {
              if (supportsThreeState) {
                // 三态切换：收盘 -> 日内 -> 两者 -> 收盘
                if (pieDataType === 'close') setPieDataType('intraday');
                else if (pieDataType === 'intraday') setPieDataType('both');
                else setPieDataType('close');
              } else {
                // 两态切换：收盘 <-> 日内
                setPieDataType(pieDataType === 'close' ? 'intraday' : 'close');
              }
            }}
            isDarkTheme={isDarkTheme}
            textColor={textColor}
          />
        )}
        {/* 数据维度切换（日期对比模式：区间涨跌/最大涨幅/最大回撤） */}
        {showDataMetricToggle && setDataMetric && (
          <StatsButton
            label={dataMetric === 'max_pct' ? '最大涨幅' : dataMetric === 'min_pct' ? '最大回撤' : '区间涨跌'}
            isActive={dataMetric !== 'pct_chg'}
            onClick={() => {
              // 三态切换：区间涨跌 -> 最大涨幅 -> 最大回撤 -> 区间涨跌
              if (dataMetric === 'pct_chg') setDataMetric('max_pct');
              else if (dataMetric === 'max_pct') setDataMetric('min_pct');
              else setDataMetric('pct_chg');
            }}
            isDarkTheme={isDarkTheme}
            textColor={textColor}
          />
        )}
      </div>
    </div>
        </>
  );
};

export default ChartControls;
