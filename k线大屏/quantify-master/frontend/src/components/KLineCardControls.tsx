import React from 'react';
import { Select } from 'antd';
import { INDICATOR_OPTIONS, IndicatorType } from './mobile/constants.ts';

interface Props {
  localPeriod: string | null;
  localTimeRange: number | string | null;
  localIndicator: string | null;
  localMainOverlays: string[] | null;
  globalPeriod: string;
  globalTimeRange: number | string | undefined;
  globalIndicator: string;
  globalMainOverlays: string[];
  onLocalPeriodChange: (value: string) => void;
  onLocalTimeRangeChange: (value: number | string) => void;
  onLocalIndicatorChange: (value: string) => void;
  onLocalMainOverlaysChange: (value: string[]) => void;
  stockContentRef: React.RefObject<HTMLDivElement>;
  cardRef: React.RefObject<HTMLDivElement>;
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
}

const KLineCardControls: React.FC<Props> = ({
  localPeriod,
  localTimeRange,
  localIndicator,
  localMainOverlays,
  globalPeriod,
  globalTimeRange,
  globalIndicator,
  globalMainOverlays,
  onLocalPeriodChange,
  onLocalTimeRangeChange,
  onLocalIndicatorChange,
  onLocalMainOverlaysChange,
  stockContentRef,
  cardRef,
  dataType = 'stock',
}) => {
  // 获取选择器显示值的工具函数
  const getSelectorDisplayValue = <T,>(localValue: T | null, globalValue: T): T => {
    return localValue !== null ? localValue : globalValue;
  };

  // 获取有效的指标值（确保值在选项列表中，并考虑数据类型限制）
  const getValidIndicatorValue = (value: string | null): string => {
    const validValues = INDICATOR_OPTIONS.map(option => option.key) as IndicatorType[];
    const currentValue = (value !== null ? value : globalIndicator) as IndicatorType;
    // 如果当前指标是开盘竞价，但数据类型不是股票，自动切换为"无"
    if (currentValue === 'auction' && dataType !== 'stock') {
      return 'none';
    }
    return validValues.includes(currentValue) ? currentValue : 'none';
  };

  const effectiveMainOverlays = (localMainOverlays !== null ? localMainOverlays : globalMainOverlays) || [];

  const currentIndicatorValue = getValidIndicatorValue(localIndicator);

  const overlayKeys = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const subIndicatorKeys = new Set(['auction', 'macd', 'rsi', 'kdj', 'cci', 'wr', 'dmi', 'obv', 'vol']);

  const activeIndicators: string[] = [];
  if (currentIndicatorValue && currentIndicatorValue !== 'none' && subIndicatorKeys.has(currentIndicatorValue)) {
    activeIndicators.push(currentIndicatorValue);
  }
  if (Array.isArray(effectiveMainOverlays)) {
    effectiveMainOverlays.forEach((key) => {
      if (overlayKeys.has(key)) {
        activeIndicators.push(key);
      }
    });
  }

  // 下拉展示用的值：如果没有任何指标选中，则选中一个“none”占位，展示为"无"
  const displayIndicators = activeIndicators.length > 0 ? activeIndicators : ['none'];

  const handleIndicatorSelect = (value: string) => {
    if (value === 'none') {
      onLocalIndicatorChange('none');
      onLocalMainOverlaysChange([]);
      return;
    }

    if (overlayKeys.has(value)) {
      const base = Array.isArray(effectiveMainOverlays) ? effectiveMainOverlays : [];
      if (!base.includes(value)) {
        const next = [...base, value];
        onLocalMainOverlaysChange(next);
      }
      return;
    }

    if (subIndicatorKeys.has(value)) {
      onLocalIndicatorChange(value);
    }
  };

  const handleIndicatorDeselect = (value: string) => {
    if (value === 'none') {
      return;
    }

    if (overlayKeys.has(value)) {
      const base = Array.isArray(effectiveMainOverlays) ? effectiveMainOverlays : [];
      const next = base.filter((key) => key !== value);
      onLocalMainOverlaysChange(next);
      return;
    }

    if (subIndicatorKeys.has(value)) {
      if (value === currentIndicatorValue) {
        onLocalIndicatorChange('none');
      }
    }
  };

  return (
    <div className="stock-controls">
      {/* 单行布局：周期 + 指标 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        justifyContent: 'center',
        height: '100%',
        minHeight: '18px'
      }}>
        {/* 周期选择 - 简化版 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '100%'
        }}>
          <span className="control-label">周期</span>
          <Select
            value={getSelectorDisplayValue(localPeriod, globalPeriod)}
            onChange={onLocalPeriodChange}
            size="small"
            className="kline-card-select"
            style={{
              width: 56,
              fontSize: '14px'
            }}
            getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
          >
            <Select.Option value="daily">日</Select.Option>
            <Select.Option value="weekly">周</Select.Option>
            <Select.Option value="monthly">月</Select.Option>
          </Select>
        </div>

        {/* 时间范围 - 简化版 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '100%'
        }}>
          <span className="control-label">范围</span>
          <Select
            value={getSelectorDisplayValue(localTimeRange, globalTimeRange)}
            onChange={onLocalTimeRangeChange}
            size="small"
            className="kline-card-select"
            style={{
              width: 80,
              fontSize: '14px'
            }}
            getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
          >
            <Select.Option value={30}>30天</Select.Option>
            <Select.Option value={60}>60天</Select.Option>
            <Select.Option value={90}>90天</Select.Option>
            <Select.Option value={180}>180天</Select.Option>
            <Select.Option value={360}>360天</Select.Option>
            <Select.Option value="all">全部</Select.Option>
          </Select>
        </div>

        {/* 指标选择 - 简化版 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '100%'
        }}>
          <span className="control-label">指标</span>
          <Select
            mode="multiple"
            value={displayIndicators}
            onSelect={handleIndicatorSelect}
            onDeselect={handleIndicatorDeselect}
            size="small"
            className="kline-card-select"
            style={{
              width: 90,
              fontSize: '14px'
            }}
            showSearch={false}
            maxTagCount={0}
            maxTagPlaceholder={(omittedValues) => {
              const count = Array.isArray(omittedValues) ? omittedValues.length : 0;
              if (count === 0) return '无';
              const labels = omittedValues.map((opt: any) => {
                if (opt && typeof opt.label === 'string') return opt.label;
                if (opt && typeof opt.value === 'string') return opt.value;
                return '';
              }).filter(Boolean);
              if (labels.length === 1) {
                return labels[0] || '无';
              }
              return `指标×${labels.length}`;
            }}
            menuItemSelectedIcon={null}
            getPopupContainer={() => stockContentRef?.current || cardRef?.current || document.body}
          >
            <Select.Option value="none">无</Select.Option>
            {/* 开盘竞价指标仅在股票类型时显示 */}
            {dataType === 'stock' && <Select.Option value="auction">开盘竞价</Select.Option>}
            <Select.Option value="ma">MA</Select.Option>
            <Select.Option value="expma">EXPMA</Select.Option>
            <Select.Option value="macd">MACD</Select.Option>
            <Select.Option value="rsi">RSI</Select.Option>
            <Select.Option value="kdj">KDJ</Select.Option>
            <Select.Option value="boll">BOLL</Select.Option>
            <Select.Option value="cci">CCI</Select.Option>
            <Select.Option value="wr">WR</Select.Option>
            <Select.Option value="dmi">DMI</Select.Option>
            <Select.Option value="sar">SAR</Select.Option>
            <Select.Option value="obv">OBV</Select.Option>
            <Select.Option value="vol">VOL</Select.Option>
            <Select.Option value="td">神奇九转</Select.Option>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default KLineCardControls;

