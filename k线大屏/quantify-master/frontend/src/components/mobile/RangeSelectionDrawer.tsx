// 范围选择抽屉组件 - 基于通用 BottomDrawer
import React from 'react';
import { Slider } from 'antd';
import { BottomDrawer } from './BottomDrawer.tsx';
import { getThemeColors, Theme } from './theme.ts';

interface RangePreset {
  label: string;
  value: [number, number];
}

interface RangeSelectionDrawerProps {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  rangeValue: [number, number];
  onRangeChange: (value: [number, number]) => void;
  presets: RangePreset[];
  title?: string;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  /** 禁用滚动锁定（嵌套在其他Drawer内时使用） */
  disableScrollLock?: boolean;
}

export const RangeSelectionDrawer: React.FC<RangeSelectionDrawerProps> = ({
  theme,
  open,
  onClose,
  rangeValue,
  onRangeChange,
  presets,
  title = '选择范围',
  sliderMin = -15,
  sliderMax = 15,
  sliderStep = 0.5,
  disableScrollLock = false,
}) => {
  const currentTheme = getThemeColors(theme);

  const formatValue = (val: number, isMin: boolean) => {
    if (isMin && val === -Infinity) return `≤${sliderMin}`;
    if (!isMin && val === Infinity) return `≥${sliderMax}`;
    return String(val);
  };

  const handleSliderChange = (value: number[]) => {
    const [min, max] = value;
    onRangeChange([
      min <= sliderMin ? -Infinity : min,
      max >= sliderMax ? Infinity : max
    ]);
  };

  const sliderValue: [number, number] = [
    rangeValue[0] === -Infinity ? sliderMin : Math.max(sliderMin, rangeValue[0]),
    rangeValue[1] === Infinity ? sliderMax : Math.min(sliderMax, rangeValue[1])
  ];

  return (
    <BottomDrawer
      title={title}
      theme={theme}
      maxHeight="50vh"
      onClose={onClose}
      open={open}
      zIndex={2100}
      disableScrollLock={disableScrollLock}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 预设按钮 - 样式参考指标半屏 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {presets.map((preset) => {
            const isActive = rangeValue[0] === preset.value[0] && rangeValue[1] === preset.value[1];
            const activeColor = '#1677ff'; // 主题蓝色
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onRangeChange(preset.value)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: `1.5px solid ${isActive ? activeColor : currentTheme.border}`,
                  background: isActive 
                    ? `${activeColor}18`
                    : theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  color: isActive ? activeColor : currentTheme.text,
                  fontSize: 15,
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
        
        {/* 滑块调整 */}
        <div style={{ padding: '0 4px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: 12,
            fontSize: 13,
            color: currentTheme.textSecondary 
          }}>
            <span>{formatValue(rangeValue[0], true)}%</span>
            <span>{formatValue(rangeValue[1], false)}%</span>
          </div>
          <Slider
            range
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={sliderValue}
            onChange={handleSliderChange}
            styles={{
              track: { background: theme === 'dark' ? '#4096ff' : '#1677ff' },
              rail: { background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
            }}
          />
        </div>
      </div>
    </BottomDrawer>
  );
};
