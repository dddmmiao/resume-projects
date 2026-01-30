import React from 'react';
import { UP_COLOR, DOWN_COLOR } from './constants.ts';

interface ProgressBarProps {
  up: number;
  down: number;
  flat: number;
  isDarkTheme: boolean;
  /** 自定义平盘颜色（移动端主题支持） */
  flatColor?: string;
  /** 自定义背景色 */
  bgColor?: string;
  /** 自定义高度 */
  height?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  up, 
  down, 
  flat, 
  isDarkTheme,
  flatColor,
  bgColor,
  height = 6,
}) => {
  const total = up + down + flat;
  const base = total > 0 ? total : 1;
  const upPct = (up / base) * 100;
  const downPct = (down / base) * 100;
  const flatPct = (flat / base) * 100;

  const defaultFlatColor = isDarkTheme ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)';
  const defaultBgColor = isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  return (
    <div
      style={{
        display: 'flex',
        height,
        borderRadius: 999,
        overflow: 'hidden',
        background: bgColor || defaultBgColor,
      }}
    >
      {upPct > 0 && (
        <div style={{ width: `${upPct}%`, background: UP_COLOR }} />
      )}
      {downPct > 0 && (
        <div style={{ width: `${downPct}%`, background: DOWN_COLOR }} />
      )}
      {flatPct > 0 && (
        <div style={{ width: `${flatPct}%`, background: flatColor || defaultFlatColor }} />
      )}
    </div>
  );
};

export default ProgressBar;
