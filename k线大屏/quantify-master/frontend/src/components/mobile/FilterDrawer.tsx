// 合并的筛选抽屉组件 - 维度选择 + 范围调整
import React from 'react';
import { Slider } from 'antd';
import { BottomDrawer } from './BottomDrawer.tsx';
import { getThemeColors, Theme } from './theme.ts';
import { FilterDimension, FILTER_DIMENSION_CONFIG } from '../StockStatsModal/constants.ts';

interface DimensionPreset {
  label: string;
  value: [number, number];
}

interface FilterDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  // 维度相关
  filterDimension: FilterDimension;
  onDimensionChange: (dim: FilterDimension) => void;
  // 范围相关
  filterRange: [number, number];
  onRangeChange: (range: [number, number]) => void;
  presets: DimensionPreset[];
  // 滑块参数
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  theme,
  open,
  onClose,
  filterDimension,
  onDimensionChange,
  filterRange,
  onRangeChange,
  presets,
  sliderMin,
  sliderMax,
  sliderStep,
}) => {
  const currentTheme = getThemeColors(theme);
  const dimensions: FilterDimension[] = ['pct_chg', 'circ_mv', 'amount', 'close'];
  const config = FILTER_DIMENSION_CONFIG[filterDimension];

  const formatValue = (val: number, isMin: boolean) => {
    if (isMin && val <= sliderMin) return config.formatValue(sliderMin);
    if (!isMin && val >= sliderMax) return config.formatValue(sliderMax);
    return config.formatValue(val);
  };

  const handleSliderChange = (value: number[]) => {
    const [min, max] = value;
    onRangeChange([
      min <= sliderMin ? (filterDimension === 'pct_chg' ? -Infinity : sliderMin) : min,
      max >= sliderMax ? Infinity : max
    ]);
  };

  const sliderValue: [number, number] = [
    filterRange[0] === -Infinity || filterRange[0] <= sliderMin ? sliderMin : Math.max(sliderMin, filterRange[0]),
    filterRange[1] === Infinity || filterRange[1] >= sliderMax ? sliderMax : Math.min(sliderMax, filterRange[1])
  ];

  return (
    <BottomDrawer
      open={open}
      onClose={onClose}
      height="auto"
      theme={theme}
      disableScrollLock={true}
      title="筛选设置"
    >
      <div style={{ padding: '12px 16px 20px' }}>
        {/* 维度选择区 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: currentTheme.text,
            marginBottom: 12,
          }}>
            筛选维度
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            {dimensions.map(dim => {
              const isSelected = filterDimension === dim;
              return (
                <button
                  key={dim}
                  type="button"
                  onClick={() => onDimensionChange(dim)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${isSelected ? '#1890ff' : currentTheme.border}`,
                    background: isSelected 
                      ? '#1890ff18'
                      : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    color: isSelected ? '#1890ff' : currentTheme.text,
                    fontSize: 14,
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {FILTER_DIMENSION_CONFIG[dim].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 快捷选择区 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: currentTheme.text,
            marginBottom: 12,
          }}>
            快捷选择
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            {presets.map(preset => {
              const isActive = filterRange[0] === preset.value[0] && filterRange[1] === preset.value[1];
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onRangeChange(preset.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${isActive ? '#52c41a' : currentTheme.border}`,
                    background: isActive 
                      ? '#52c41a18'
                      : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    color: isActive ? '#52c41a' : currentTheme.text,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 范围滑块区 */}
        <div>
          <div style={{
            fontSize: 12,
            color: currentTheme.textSecondary,
            marginBottom: 10,
          }}>
            自定义范围
          </div>
          <div style={{
            padding: '12px 16px',
            background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            borderRadius: 10,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              fontWeight: 500,
              color: currentTheme.text,
              marginBottom: 12,
            }}>
              <span>{formatValue(sliderValue[0], true)}</span>
              <span style={{ color: currentTheme.textSecondary, fontSize: 12 }}>—</span>
              <span>{formatValue(sliderValue[1], false)}</span>
            </div>
            <Slider
              range
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              value={sliderValue}
              onChange={handleSliderChange}
              tooltip={{ formatter: (val) => val !== undefined ? config.formatValue(val) : '' }}
            />
          </div>
        </div>
      </div>
    </BottomDrawer>
  );
};

export default FilterDrawer;
