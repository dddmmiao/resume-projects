import React, { useMemo } from 'react';
import { Select, Switch, Tooltip, Popover, Checkbox, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useStrategiesMeta } from '../strategies/useStrategiesMeta.ts';
import TradingCalendar from './TradingCalendar.tsx';
import { useAppStore } from '../stores/useAppStore.ts';

interface Props {
  theme: string;
  period: string;
  onPeriodChange: (v: string) => void;
  timeRange: number | string;
  onTimeRangeChange: (v: number | string) => void;
  indicator: string;
  onIndicatorChange: (v: string) => void;
  // 全局交易日期（可选）
  tradeDate?: string;
  onTradeDateChange?: (date: string) => void;
  // 主图叠加指标（仅桌面端使用，多选叠加 MA / EXPMA / BOLL / SAR / TD 等）
  mainOverlays?: string[];
  onMainOverlaysChange?: (v: string[]) => void;
  // strategy controls
  strategy: string;
  onStrategyChange: (v: string) => void;
  onOpenStrategyConfig: () => void;
  // 数据类型，用于控制策略功能的显示
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry' | 'favorites';
}

const GlobalControls: React.FC<Props> = ({
  theme,
  period,
  onPeriodChange,
  timeRange,
  onTimeRangeChange,
  indicator,
  onIndicatorChange,
  mainOverlays = [],
  onMainOverlaysChange,
  strategy,
  onStrategyChange,
  onOpenStrategyConfig,
  dataType,
  tradeDate,
  onTradeDateChange,
}) => {
  const { strategies } = useStrategiesMeta();
  
  // 指标线显示设置
  const indicatorLineSettings = useAppStore(state => state.indicatorLineSettings);
  const setIndicatorLineSettings = useAppStore(state => state.setIndicatorLineSettings);

  const getSelectWidth = (items: string[], options: { min?: number; max?: number; charPx?: number; padding?: number; } = {}) => {
    const { min = 110, max = 320, charPx = 12, padding = 44 } = options;
    if (!items?.length) return min;
    const maxLen = items.map(s => (s || '').length).reduce((m, n) => Math.max(m, n), 0) || 4;
    return Math.max(min, Math.min(max, Math.round(maxLen * charPx + padding)));
  };

  const strategyOptions = useMemo(() => {
    const base = [{ value: '', label: '无' }];
    const available = strategies.filter(meta => {
      if (!dataType || dataType === 'favorites') return false;
      // convertible_bond在前端显示层使用，但策略元数据中使用bond
      const matchType = dataType === 'convertible_bond' ? 'bond' : dataType;
      return meta.supportedDataTypes.includes(matchType as any);
    });
    return base.concat(available.map(meta => ({ value: meta.key, label: meta.label })));
  }, [dataType, strategies]);
  const strategySelectWidth = useMemo(() => getSelectWidth(strategyOptions.map(o => o.label), { min: 130, charPx: 14 }), [strategyOptions]);

  const primaryColor = useMemo(() => {
    const map: Record<string, string> = {
      light: '#1677ff',
      dark: '#177ddc',
      blue: '#177ddc',
      purple: '#722ed1',
      green: '#52c41a',
      orange: '#fa8c16',
      cyan: '#13c2c2',
      red: '#f5222d',
      gold: '#faad14',
    };
    return map[theme] || '#177ddc';
  }, [theme]);

  // 获取有效的指标值（如果数据类型不是股票且指标是开盘竞价，显示"无")
  const validIndicator = indicator === 'auction' && dataType !== 'stock' ? 'none' : indicator;

  const overlayKeys = new Set(['ma', 'expma', 'boll', 'sar', 'td']);
  const subIndicatorKeys = new Set(['auction', 'macd', 'rsi', 'kdj', 'cci', 'wr', 'dmi', 'obv', 'vol']);

  const activeIndicators: string[] = [];
  const normalizedIndicator = validIndicator;
  if (normalizedIndicator && normalizedIndicator !== 'none' && subIndicatorKeys.has(normalizedIndicator)) {
    activeIndicators.push(normalizedIndicator);
  }
  if (Array.isArray(mainOverlays)) {
    mainOverlays.forEach((key) => {
      if (overlayKeys.has(key)) {
        activeIndicators.push(key);
      }
    });
  }

  // 下拉展示用的值：如果没有任何指标选中，则选中一个“none”占位，展示为"无"
  const displayIndicators = activeIndicators.length > 0 ? activeIndicators : ['none'];

  // 指标选择变更处理：统一多选入口，方案B：选择"无"时清空所有叠加
  const handleIndicatorSelect = (value: string) => {
    if (value === 'none') {
      if (onIndicatorChange) {
        onIndicatorChange('none');
      }
      if (onMainOverlaysChange) {
        onMainOverlaysChange([]);
      }
      return;
    }

    if (overlayKeys.has(value)) {
      const base = Array.isArray(mainOverlays) ? mainOverlays : [];
      if (!base.includes(value)) {
        const next = [...base, value];
        if (onMainOverlaysChange) {
          onMainOverlaysChange(next);
        }
      }
      return;
    }

    if (subIndicatorKeys.has(value)) {
      if (onIndicatorChange) {
        onIndicatorChange(value);
      }
    }
  };

  const handleIndicatorDeselect = (value: string) => {
    if (overlayKeys.has(value)) {
      const base = Array.isArray(mainOverlays) ? mainOverlays : [];
      const next = base.filter((key) => key !== value);
      if (onMainOverlaysChange) {
        onMainOverlaysChange(next);
      }
      return;
    }

    if (subIndicatorKeys.has(value)) {
      if (validIndicator === value && onIndicatorChange) {
        onIndicatorChange('none');
      }
    }
  };

  return (
    <div className="global-controls-container" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '12px',
      padding: '8px 12px',
      background: theme === 'light' ? '#ffffff' : 'rgba(255,255,255,0.06)',
      border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : 'none',
      boxShadow: 'none',
      borderRadius: 8,
      flexWrap: 'wrap'
    }}>
      {/* 全局日期控制（可选） */}
      {onTradeDateChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px', color: theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', minWidth: '28px' }}>日期:</span>
          <TradingCalendar
            theme={theme as any}
            selectedDate={tradeDate}
            onDateChange={onTradeDateChange}
            period={period as any}
          />
        </div>
      )}

      {/* 全局周期控制 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px', color: theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', minWidth: '28px' }}>周期:</span>
        <Select value={period} onChange={onPeriodChange} style={{ width: 70, fontSize: 14 }} size="small" placeholder="周期">
          <Select.Option value="daily">日线</Select.Option>
          <Select.Option value="weekly">周线</Select.Option>
          <Select.Option value="monthly">月线</Select.Option>
        </Select>
      </div>

      {/* 全局时间范围控制 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px', color: theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', minWidth: '28px' }}>范围:</span>
        <Select value={timeRange} onChange={onTimeRangeChange} style={{ width: 80, fontSize: 14 }} size="small" placeholder="范围">
          <Select.Option value={30}>30天</Select.Option>
          <Select.Option value={60}>60天</Select.Option>
          <Select.Option value={90}>90天</Select.Option>
          <Select.Option value={180}>180天</Select.Option>
          <Select.Option value={360}>360天</Select.Option>
          <Select.Option value="all">全部</Select.Option>
        </Select>
      </div>

      {/* 全局指标控制 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px', color: theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', minWidth: '28px' }}>指标:</span>
        <Select
          mode="multiple"
          value={displayIndicators}
          onSelect={handleIndicatorSelect}
          onDeselect={handleIndicatorDeselect}
          className="global-indicator-select"
          style={{ width: 110, fontSize: 14 }}
          size="small"
          placeholder="无"
          listHeight={200}
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
          styles={{
            popup: {
              root: {
                background: theme === 'light' ? '#ffffff' : 'rgba(0,0,0,0.85)',
                border: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.2)',
                boxShadow: theme === 'light' ? '0 4px 12px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.3)',
                maxHeight: '200px',
                overflow: 'hidden'
              }
            }
          }}
        >
          <Select.Option value="none">无</Select.Option>
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
        {/* 指标线设置按钮 - 仅当有可配置线的指标时显示 */}
        {(mainOverlays.includes('expma') || mainOverlays.includes('ma') || mainOverlays.includes('boll') ||
          displayIndicators.includes('expma') || displayIndicators.includes('ma') || displayIndicators.includes('boll') ||
          displayIndicators.includes('kdj') || displayIndicators.includes('macd') || displayIndicators.includes('dmi')) && (
        <Popover
          trigger="click"
          placement="bottomRight"
          content={
            <div style={{ minWidth: 150 }}>
                {(mainOverlays.includes('expma') || displayIndicators.includes('expma')) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>EXPMA线</div>
                    <Space size={[4, 4]} wrap>
                      {[5, 10, 20, 60, 250].map(period => (
                        <Checkbox
                          key={period}
                          checked={indicatorLineSettings.expma.includes(period)}
                          onChange={(e) => {
                            const newExpma = e.target.checked
                              ? [...indicatorLineSettings.expma, period].sort((a, b) => a - b)
                              : indicatorLineSettings.expma.filter(p => p !== period);
                            setIndicatorLineSettings({ expma: newExpma });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {period}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {(mainOverlays.includes('ma') || displayIndicators.includes('ma')) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>MA线</div>
                    <Space size={[4, 4]} wrap>
                      {[5, 10, 20, 60, 250].map(period => (
                        <Checkbox
                          key={period}
                          checked={indicatorLineSettings.ma.includes(period)}
                          onChange={(e) => {
                            const newMa = e.target.checked
                              ? [...indicatorLineSettings.ma, period].sort((a, b) => a - b)
                              : indicatorLineSettings.ma.filter(p => p !== period);
                            setIndicatorLineSettings({ ma: newMa });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {period}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {(mainOverlays.includes('boll') || displayIndicators.includes('boll')) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>BOLL线</div>
                    <Space size={[4, 4]} wrap>
                      {[{ key: 'upper', label: '上轨' }, { key: 'mid', label: '中轨' }, { key: 'lower', label: '下轨' }].map(({ key, label }) => (
                        <Checkbox
                          key={key}
                          checked={indicatorLineSettings.boll.includes(key)}
                          onChange={(e) => {
                            const newBoll = e.target.checked
                              ? [...indicatorLineSettings.boll, key]
                              : indicatorLineSettings.boll.filter(p => p !== key);
                            setIndicatorLineSettings({ boll: newBoll });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {label}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {displayIndicators.includes('kdj') && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>KDJ线</div>
                    <Space size={[4, 4]} wrap>
                      {[{ key: 'k', label: 'K' }, { key: 'd', label: 'D' }, { key: 'j', label: 'J' }].map(({ key, label }) => (
                        <Checkbox
                          key={key}
                          checked={indicatorLineSettings.kdj.includes(key)}
                          onChange={(e) => {
                            const newKdj = e.target.checked
                              ? [...indicatorLineSettings.kdj, key]
                              : indicatorLineSettings.kdj.filter(p => p !== key);
                            setIndicatorLineSettings({ kdj: newKdj });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {label}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {displayIndicators.includes('macd') && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>MACD线</div>
                    <Space size={[4, 4]} wrap>
                      {[{ key: 'dif', label: 'DIF' }, { key: 'dea', label: 'DEA' }, { key: 'macd', label: 'MACD柱' }].map(({ key, label }) => (
                        <Checkbox
                          key={key}
                          checked={indicatorLineSettings.macd.includes(key)}
                          onChange={(e) => {
                            const newMacd = e.target.checked
                              ? [...indicatorLineSettings.macd, key]
                              : indicatorLineSettings.macd.filter(p => p !== key);
                            setIndicatorLineSettings({ macd: newMacd });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {label}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {displayIndicators.includes('dmi') && (
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12 }}>DMI线</div>
                    <Space size={[4, 4]} wrap>
                      {[{ key: 'pdi', label: '+DI' }, { key: 'mdi', label: '-DI' }, { key: 'adx', label: 'ADX' }, { key: 'adxr', label: 'ADXR' }].map(({ key, label }) => (
                        <Checkbox
                          key={key}
                          checked={indicatorLineSettings.dmi.includes(key)}
                          onChange={(e) => {
                            const newDmi = e.target.checked
                              ? [...indicatorLineSettings.dmi, key]
                              : indicatorLineSettings.dmi.filter(p => p !== key);
                            setIndicatorLineSettings({ dmi: newDmi });
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {label}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
              </div>
            }
          >
          <Tooltip title="设置显示哪些指标线">
            <SettingOutlined style={{ fontSize: 14, cursor: 'pointer', color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }} />
          </Tooltip>
        </Popover>
        )}
      </div>

      {/* 策略控制（与周期/范围/指标同一行）- 自选tab下隐藏 */}
      {dataType !== 'favorites' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px', color: theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', minWidth: '28px' }}>策略:</span>
          <Select value={strategy} onChange={onStrategyChange} style={{ width: strategySelectWidth, fontSize: 14 }} size="small" placeholder="策略">
            {strategyOptions.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
            ))}
          </Select>
          {strategy && (
            <button
              onClick={onOpenStrategyConfig}
              style={{
                height: 24,
                padding: '0 8px',
                borderRadius: 6,
                border: 'none',
                background: primaryColor,
                color: '#fff',
                cursor: 'pointer'
              }}
            >配置</button>
          )}
        </div>
      )}

      {/* 图表联动开关 - 靠右显示 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <ChartSyncToggle theme={theme} />
      </div>
    </div>
  );
};

// 图表联动开关组件（与全局控制条风格一致）
const ChartSyncToggle: React.FC<{ theme: string }> = ({ theme }) => {
  const chartSyncEnabled = useAppStore(state => state.chartSyncEnabled);
  const setChartSyncEnabled = useAppStore(state => state.setChartSyncEnabled);
  
  const isLight = theme === 'light';
  const labelColor = isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
  
  return (
    <Tooltip title={chartSyncEnabled ? '图表联动已开启：修改任一卡片设置，所有卡片同步变化' : '图表联动已关闭'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px', color: labelColor, minWidth: '28px' }}>联动:</span>
        <Switch
          size="small"
          checked={chartSyncEnabled}
          onChange={setChartSyncEnabled}
        />
      </div>
    </Tooltip>
  );
};

export default GlobalControls;

