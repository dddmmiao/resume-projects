/**
 * 日期工具函数
 */

/**
 * 根据周期对 tradeDate 进行对齐：
 * - weekly: 转换为本周周五（与后端 trade_date 一致）
 * - monthly: 转换为本月月底（自然日，可能是未来日期）
 * - 其他: 保持原值
 * 
 * @param dateStr YYYYMMDD 格式的日期字符串
 * @param period 周期类型：'daily' | 'weekly' | 'monthly'
 * @returns 对齐后的 YYYYMMDD 格式日期字符串
 */
export function convertDateForPeriod(dateStr?: string, period?: string): string | undefined {
  if (!dateStr || dateStr.length !== 8) return dateStr;

  if (period === 'weekly') {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 5=周五, 6=周六
    
    // 找本周周五（与后端 pd.Grouper(freq="W-FRI") 一致）
    // 周一到周五：往后找本周五
    // 周六、周日：往前找本周五
    let daysToFriday: number;
    if (dayOfWeek === 0) { // 周日
      daysToFriday = -2;
    } else if (dayOfWeek === 6) { // 周六
      daysToFriday = -1;
    } else { // 周一到周五
      daysToFriday = 5 - dayOfWeek;
    }
    
    const friday = new Date(date);
    friday.setDate(date.getDate() + daysToFriday);
    
    // 如果周五跨月了（比如12-31转为01-03），则往前一周，保持在原月内
    // 这样 周→月→周 切换时不会跳到下一个月
    if (friday.getMonth() !== date.getMonth()) {
      friday.setDate(friday.getDate() - 7);
    }
    
    const y = friday.getFullYear();
    const m = String(friday.getMonth() + 1).padStart(2, '0');
    const d = String(friday.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  if (period === 'monthly') {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const lastDay = new Date(year, month, 0); // 当月最后一天
    const y = lastDay.getFullYear();
    const m = String(lastDay.getMonth() + 1).padStart(2, '0');
    const d = String(lastDay.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  return dateStr;
}
