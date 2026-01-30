import React from 'react';
import { formatVolume, formatAmount, formatMarketValue } from './mobile/utils.ts';
import type { Period } from '../shared/constants.ts';
import { calculateIntraperiodPctChg, getPctChgColorType, getIntraperiodLabel } from '../utils/klineCalculations.ts';

type Variant = 'compact' | 'normal' | 'large';
type FieldKey =
  | 'close'
  | 'pct_chg'
  | 'change_abs'
  | 'volatility'
  | 'open'
  | 'high'
  | 'low'
  | 'vol'
  | 'amount'
  | 'turnover_rate'
  | 'volume_ratio'
  | 'total_mv'
  | 'circ_mv'
  | 'trade_date'
;

type FieldItem = FieldKey | { key: FieldKey; colSpan?: number; strong?: boolean; badge?: boolean };

export interface HeaderMetricsProps {
  data?: any;
  dailyBasic?: any;
  isStockView?: boolean;
  columns?: number;
  variant?: Variant;
  align?: 'left' | 'right';
  // 渲染顺序与内容（支持对象以控制 colSpan/强调/徽标样式）
  fields?: Array<FieldItem>;
  // 主题参数
  theme?: 'dark' | 'light' | 'blue' | 'purple' | 'green' | 'orange' | 'cyan' | 'red' | 'gold';
  // 最新交易日（优先显示系统最新交易日而不是K线数据日期）
  // 是否为全屏模式（控制波动率显示位置）
  isFullscreen?: boolean;
  // 当前K线周期，用于动态文案（如 日内/周内/月内涨跌）
  period?: Period;
  // 数据类型，用于区分成交额单位（概念/行业是元，股票/可转债是千元）
  dataType?: 'stock' | 'convertible_bond' | 'concept' | 'industry';
}

const HeaderMetrics: React.FC<HeaderMetricsProps> = ({
  data,
  dailyBasic,
  isStockView = true,
  columns = 3,
  variant = 'normal',
  align = 'right',
  fields,
  theme = 'dark',
  isFullscreen = false,
  period,
  dataType = 'stock',
}) => {


  const priceColor = (pct: number | undefined) => {
    if (pct === undefined || pct === null) {
      return theme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
    }
    if (pct > 0) {
      return '#ff4d4f';
    }
    if (pct < 0) {
      return '#52c41a';
    }
    return theme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
  };

  // 根据与前一日收盘价的比较来判断颜色
  const compareWithPreClose = (currentPrice: number | undefined, preClose: number | undefined) => {
    if (currentPrice === undefined || currentPrice === null || preClose === undefined || preClose === null) {
      return 'neutral';
    }
    if (currentPrice > preClose) {
      return 'red';
    }
    if (currentPrice < preClose) {
      return 'green';
    }
    return 'neutral';
  };

  // 根据颜色类型获取CSS类名
  const getColorClassName = (colorType: 'red' | 'green' | 'neutral') => {
    switch (colorType) {
      case 'red': return 'hm-red';
      case 'green': return 'hm-green';
      default: return '';
    }
  };



  const formatPrice = (n: any) => (n === undefined || n === null ? '--' : Number(n).toFixed(2));
  const formatPercent = (n: any) => (n === undefined || n === null ? '--' : `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}%`);

  const defaultFields: HeaderMetricsProps['fields'] = [
    { key: 'close', strong: true },
    { key: 'pct_chg', strong: true, badge: true },
    'open', 'high', 'low', 'vol',
    ...(isStockView ? ([] as const) : (['turnover_rate', 'volume_ratio', 'total_mv', 'circ_mv'] as const)),
  ];

  const items = (fields && fields.length > 0 ? fields : defaultFields).map((field) => {
    const f: { key: FieldKey; colSpan?: number; strong?: boolean; badge?: boolean } =
      typeof field === 'string' ? { key: field } : field;
    switch (f.key) {
      case 'close':
        return {
          key: f.key,
          label: '收',
          value: formatPrice(data?.close),
          color: priceColor(data?.pct_chg),
          strong: f.strong ?? true,
          colSpan: f.colSpan,
          badge: f.badge,
        };
      case 'volatility':
        const volatilityColorType = data?.volatility > 0 ? 'red' : data?.volatility < 0 ? 'green' : 'neutral';
        return {
          key: f.key,
          label: '波动',
          value: formatPercent(data?.volatility),
          color: volatilityColorType === 'neutral' 
            ? (theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)')
            : undefined,
          colorType: volatilityColorType,
          strong: f.strong ?? variant !== 'compact',
          colSpan: f.colSpan,
          badge: f.badge ?? true,
        };
      case 'pct_chg':
        return {
          key: f.key,
          label: '涨跌',
          value: formatPercent(data?.pct_chg),
          color: priceColor(data?.pct_chg),
          strong: f.strong ?? variant !== 'compact',
          colSpan: f.colSpan,
          badge: f.badge,
        };
      case 'change_abs': {
        // 使用共用函数计算周期内涨跌幅（优先后端字段，null时前端兜底）
        const changePct = calculateIntraperiodPctChg(data);
        const changeColorType = getPctChgColorType(changePct);

        return {
          key: f.key,
          label: getIntraperiodLabel(period),
          value:
            changePct === null
              ? '--'
              : `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
          colorType: changeColorType,
          color: theme === 'light' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)',
          strong: f.strong ?? variant !== 'compact',
          colSpan: f.colSpan,
          badge: f.badge,
        } as any;
      }
      case 'open':
        return { 
          key: f.key, 
          label: '开', 
          value: formatPrice(data?.open), 
          color: theme === 'light' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)', 
          colorType: compareWithPreClose(data?.open, data?.pre_close),
          colSpan: f.colSpan 
        } as any;
      case 'high':
        return { 
          key: f.key, 
          label: '高', 
          value: formatPrice(data?.high), 
          color: '#ff4d4f', 
          colorType: compareWithPreClose(data?.high, data?.pre_close),
          colSpan: f.colSpan 
        } as any;
      case 'low':
        return { 
          key: f.key, 
          label: '低', 
          value: formatPrice(data?.low), 
          color: '#52c41a', 
          colorType: compareWithPreClose(data?.low, data?.pre_close),
          colSpan: f.colSpan 
        } as any;
      case 'vol':
        return { key: f.key, label: '量', value: formatVolume(data?.vol), color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
      case 'amount':
        // 所有标的类型 amount 单位统一为千元
        const amountValue = formatAmount(data?.amount);
        return { key: f.key, label: '额', value: amountValue, color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
      case 'turnover_rate':
        return { key: f.key, label: '换', value: dailyBasic?.turnover_rate !== undefined && dailyBasic?.turnover_rate !== null ? `${Number(dailyBasic.turnover_rate).toFixed(2)}%` : '--', color: theme === 'light' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)', colSpan: f.colSpan } as any;
      case 'volume_ratio':
        return { key: f.key, label: '量比', value: dailyBasic?.volume_ratio !== undefined && dailyBasic?.volume_ratio !== null ? Number(dailyBasic.volume_ratio).toFixed(2) : '--', color: theme === 'light' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)', colSpan: f.colSpan } as any;
      case 'total_mv':
        return { key: f.key, label: '总市', value: formatMarketValue(dailyBasic?.total_mv), color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
      case 'circ_mv':
        return { key: f.key, label: '流通', value: formatMarketValue(dailyBasic?.circ_mv), color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
      case 'trade_date':
        // 优先显示系统最新交易日，如果没有则显示K线数据日期
        const displayDate = data?.trade_date || '--';
        return { key: f.key, label: '日期', value: displayDate, color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
      default:
        return { key: (f.key as string), label: f.key, value: '--', color: theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', colSpan: f.colSpan } as any;
    }
  });

  if (!data) {
    return (
      <div style={{ textAlign: align }}>
        <div style={{ color: theme === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: variant === 'large' ? 14 : 12 }}>暂无数据</div>
      </div>
    );
  }


  const valueSize = variant === 'large' ? 14 : variant === 'compact' ? 11 : 12;
  const gap = variant === 'compact' ? 6 : variant === 'large' ? 10 : 8;

  // 将"收/波动率/涨跌幅"作为头部主行，其余信息作为"标签行"自由换行
  const closeItem = items.find((i) => i.key === 'close');
  const volatilityItem = items.find((i) => i.key === 'volatility');
  const pctItem = items.find((i) => i.key === 'pct_chg');
  const restItems = items.filter(
    (i) =>
      i.key !== 'close' &&
      i.key !== 'volatility' &&
      i.key !== 'pct_chg' &&
      i.key !== 'amount'
  );

  return (
    <div className="header-metrics-wrapper" style={{ textAlign: align }}>
      {/* 头部主行：收盘价 + 涨跌幅徽标 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          gap: gap + 4,
          marginBottom: gap - 2,
        }}
      >
        {closeItem && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: theme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: valueSize - 2 }}>{closeItem.label}:</span>
            <span
              className={data?.pct_chg > 0 ? 'hm-red' : data?.pct_chg < 0 ? 'hm-green' : ''}
              style={{
                fontSize: variant === 'large' ? 34 : (variant === 'compact' ? 18 : 22),
                fontWeight: 900,
                lineHeight: 1,
                textShadow: theme === 'light' ? 'none' : '0 1px 2px rgba(0,0,0,0.35)',
                color: data?.pct_chg === 0 || data?.pct_chg === undefined || data?.pct_chg === null 
                  ? (theme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)')
                  : undefined // 让CSS类控制红绿色
              }}
            >
              {closeItem.value}
            </span>
          </div>
        )}

        {volatilityItem && isFullscreen && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: theme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: valueSize - 2 }}>波动:</span>
            <span
              className={data?.volatility > 0 ? 'hm-red' : data?.volatility < 0 ? 'hm-green' : ''}
              style={{
                fontSize: variant === 'large' ? 22 : 14,
                fontWeight: 800,
                lineHeight: 1.1,
                color: data?.volatility === 0 || data?.volatility === undefined || data?.volatility === null 
                  ? (theme === 'light' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)')
                  : undefined // 让CSS类控制红绿色
              }}
            >
              {volatilityItem.value}
            </span>
          </div>
        )}

        {pctItem && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: theme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: valueSize - 2 }}>涨跌:</span>
            <span
              className={data?.pct_chg > 0 ? 'hm-red' : data?.pct_chg < 0 ? 'hm-green' : ''}
              style={{
                fontSize: variant === 'large' ? 22 : 14,
                fontWeight: 800,
                lineHeight: 1.1,
                color: data?.pct_chg === 0 || data?.pct_chg === undefined || data?.pct_chg === null 
                  ? (theme === 'light' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)')
                  : undefined // 让CSS类控制红绿色
              }}
            >
              {pctItem.value}
            </span>
          </div>
        )}
      </div>

      {/* 标签行：明确两行分组：1) 开/高/低/日涨  2) 量/换手/量比（无边框，简单对齐） */}
      {(() => {
        const isKey = (k: any, s: string) => k === s;
        const row1 = restItems.filter(
          it =>
            isKey(it.key, 'open') ||
            isKey(it.key, 'high') ||
            isKey(it.key, 'low') ||
            isKey(it.key, 'change_abs')
        );
        const row2 = restItems.filter(it => isKey(it.key, 'vol'));

        const Row = ({ items }: { items: any[] }) => {
          if (!items || items.length === 0) return null;
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                gap,
                marginBottom: gap - 2,
              }}
            >
              {items.map(it => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ color: theme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: valueSize - 2 }}>{it.label}:</span>
                  <span 
                    className={getColorClassName(it.colorType || 'neutral')}
                    style={{ 
                      fontSize: valueSize, 
                      fontWeight: 700, 
                      lineHeight: 1.1,
                      color: it.colorType && it.colorType !== 'neutral' ? undefined : it.color // 让CSS类控制动态颜色
                    }}
                  >
                    {it.value}
                  </span>
                </div>
              ))}
            </div>
          );
        };

        return (
          <>
            <Row items={row1} />
            <Row items={row2} />
          </>
        );
      })()}
    </div>
  );
};

export default HeaderMetrics;

