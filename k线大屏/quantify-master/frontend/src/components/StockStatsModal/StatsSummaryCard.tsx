import React from 'react';
import ProgressBar from './ProgressBar.tsx';
import { formatDateShort } from './constants.ts';

interface StatsSummaryCardProps {
  /** 标题（如"涨跌概况"、"日期对比"） */
  title: string;
  /** 总数 */
  total: number;
  /** 上涨数 */
  up: number;
  /** 下跌数 */
  down: number;
  /** 平盘数 */
  flat: number;
  /** 是否深色主题 */
  isDarkTheme: boolean;
  /** 文字颜色 */
  textColor?: string;
  /** 次要文字颜色 */
  textSecondaryColor?: string;
  /** 卡片背景色 */
  cardBgColor?: string;
  /** 边框颜色 */
  borderColor?: string;
  /** 进度条背景色 */
  progressBgColor?: string;
  /** 平盘颜色 */
  flatColor?: string;
  /** 日内统计（可选，当日统计模式使用） */
  intradayStats?: {
    up: number;
    down: number;
    flat: number;
    limitUp?: number;
    limitDown?: number;
  };
  /** 收盘标签文本（可选，默认"收盘"） */
  closeLabel?: string;
  /** 日内标签文本（可选，默认"日内"） */
  intraLabel?: string;
  /** 对比统计额外信息（可选，日期对比模式使用） */
  compareInfo?: {
    baseDate: string;
    compareDate: string;
    avgPctChg: number;
    medianPctChg: number;
  };
  /** 扩展统计指标（可选） */
  extendedStats?: {
    avgPctChg: number;
    medianPctChg: number;
    winRate: number;
    maxGain: number;
    maxLoss: number;
    limitUp?: number;
    limitDown?: number;
  };
  /** 子内容（如额外的控制按钮） */
  children?: React.ReactNode;
}

const StatsSummaryCard: React.FC<StatsSummaryCardProps> = ({
  title,
  total,
  up,
  down,
  flat,
  isDarkTheme,
  textColor,
  textSecondaryColor,
  cardBgColor,
  borderColor,
  progressBgColor,
  flatColor,
  intradayStats,
  closeLabel = '收盘',
  intraLabel = '日内',
  compareInfo,
  extendedStats,
  children,
}) => {
  const defaultTextColor = isDarkTheme ? '#ddd' : '#000';
  const defaultTextSecondary = isDarkTheme ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.45)';
  const defaultCardBg = isDarkTheme ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const defaultBorder = isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  const text = textColor || defaultTextColor;
  const textSecondary = textSecondaryColor || defaultTextSecondary;
  const cardBg = cardBgColor || defaultCardBg;
  const border = borderColor || defaultBorder;

  return (
    <div
      style={{
        padding: 10,
        background: cardBg,
        borderRadius: 8,
        border: `1px solid ${border}`,
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, color: textSecondary }}>
          {compareInfo 
            ? `${title}（${formatDateShort(compareInfo.baseDate)} → ${formatDateShort(compareInfo.compareDate)}）`
            : title
          }
        </span>
        <span style={{ fontSize: 16, fontWeight: 600, color: text }}>
          共 {total}
        </span>
      </div>

      {/* 对比模式：平均/中位数涨跌幅 */}
      {compareInfo && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: textSecondary }}>
            平均涨跌:{' '}
            <span style={{ color: compareInfo.avgPctChg >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              {compareInfo.avgPctChg >= 0 ? '+' : ''}{compareInfo.avgPctChg.toFixed(2)}%
            </span>
          </span>
          <span style={{ fontSize: 12, color: textSecondary }}>
            中位数:{' '}
            <span style={{ color: compareInfo.medianPctChg >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              {compareInfo.medianPctChg >= 0 ? '+' : ''}{compareInfo.medianPctChg.toFixed(2)}%
            </span>
          </span>
        </div>
      )}

      {/* 收盘/主统计进度条 */}
      <div style={{ marginBottom: intradayStats ? 6 : 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 2,
          }}
        >
          {(intradayStats || title === '日期对比') && (
            <span style={{ fontSize: 12, color: textSecondary }}>{closeLabel}</span>
          )}
          <span style={{ fontSize: 12, color: textSecondary, marginLeft: (intradayStats || title === '日期对比') ? 0 : 'auto' }}>
            涨 {up}
            {extendedStats?.limitUp !== undefined && extendedStats.limitUp > 0 && (
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>(停{extendedStats.limitUp})</span>
            )}
            {' '}跌 {down}
            {extendedStats?.limitDown !== undefined && extendedStats.limitDown > 0 && (
              <span style={{ color: '#52c41a', fontWeight: 600 }}>(停{extendedStats.limitDown})</span>
            )}
            {' '}平 {flat}
          </span>
        </div>
        <ProgressBar
          up={up}
          down={down}
          flat={flat}
          isDarkTheme={isDarkTheme}
          bgColor={progressBgColor}
          flatColor={flatColor}
        />
      </div>

      {/* 日内统计进度条（可选） */}
      {intradayStats && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 12, color: textSecondary }}>{intraLabel}</span>
            <span style={{ fontSize: 12, color: textSecondary }}>
              涨 {intradayStats.up}
              {intradayStats.limitUp !== undefined && intradayStats.limitUp > 0 && (
                <span style={{ color: '#ff4d4f', fontWeight: 600 }}>(停{intradayStats.limitUp})</span>
              )}
              {' '}跌 {intradayStats.down}
              {intradayStats.limitDown !== undefined && intradayStats.limitDown > 0 && (
                <span style={{ color: '#52c41a', fontWeight: 600 }}>(停{intradayStats.limitDown})</span>
              )}
              {' '}平 {intradayStats.flat}
            </span>
          </div>
          <ProgressBar
            up={intradayStats.up}
            down={intradayStats.down}
            flat={intradayStats.flat}
            isDarkTheme={isDarkTheme}
            bgColor={progressBgColor}
            flatColor={flatColor}
          />
        </div>
      )}

      {/* 扩展统计指标 - 仅在日期对比模式有实际数据时显示 */}
      {extendedStats && (extendedStats.avgPctChg !== 0 || extendedStats.winRate !== 0) && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: '6px 12px', 
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${border}`,
        }}>
          <span style={{ fontSize: 12, color: textSecondary }}>
            平均:{' '}
            <span style={{ color: extendedStats.avgPctChg >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              {extendedStats.avgPctChg >= 0 ? '+' : ''}{extendedStats.avgPctChg.toFixed(2)}%
            </span>
          </span>
          <span style={{ fontSize: 12, color: textSecondary }}>
            中位:{' '}
            <span style={{ color: extendedStats.medianPctChg >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              {extendedStats.medianPctChg >= 0 ? '+' : ''}{extendedStats.medianPctChg.toFixed(2)}%
            </span>
          </span>
          <span style={{ fontSize: 12, color: textSecondary }}>
            胜率:{' '}
            <span style={{ color: extendedStats.winRate >= 50 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
              {extendedStats.winRate.toFixed(1)}%
            </span>
          </span>
                    <span style={{ fontSize: 12, color: textSecondary }}>
            最高:{' '}
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
              +{extendedStats.maxGain.toFixed(2)}%
            </span>
          </span>
          <span style={{ fontSize: 12, color: textSecondary }}>
            最低:{' '}
            <span style={{ color: '#52c41a', fontWeight: 600 }}>
              {extendedStats.maxLoss.toFixed(2)}%
            </span>
          </span>
        </div>
      )}

      {/* 额外内容 */}
      {children}
    </div>
  );
};

export default StatsSummaryCard;
