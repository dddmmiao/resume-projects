// 公共工具：获取最近一个开市日（若今天为非交易日，则为上一个开市日）
// 返回值格式：YYYYMMDD；如果获取失败则返回 null

import authFetch from './authFetch.ts';

export async function fetchLatestOpenTradingDate(): Promise<string | null> {
  try {
    const resp = await authFetch('/api/trade-calendar/trading-days?months=2');
    if (!resp.ok) return null;

    const data = await resp.json();
    const days = (data?.data?.trading_days || []) as Array<{
      trade_date?: string;
      cal_date?: string;
      is_open?: boolean;
    }>;
    if (!Array.isArray(days) || days.length === 0) return null;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;

    // 只保留开市日
    const openDays = days.filter((d) => {
      const dateStr = (d?.trade_date || d?.cal_date) as string | undefined;
      return Boolean(dateStr) && d?.is_open === true;
    });
    if (!openDays.length) return null;

    // 按日期降序排序，找到 <= 今天的最近一个开市日
    const sorted = openDays
      .map((d) => (d.trade_date || d.cal_date) as string)
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : -1));

    const pick = sorted.find((d) => d <= todayStr) || sorted[0];
    if (!pick) return null;

    // 转为 YYYYMMDD
    return pick.replace(/-/g, '');
  } catch {
    return null;
  }
}
