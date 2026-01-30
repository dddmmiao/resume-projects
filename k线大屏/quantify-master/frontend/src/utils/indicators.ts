/**
 * 技术指标计算工具
 */

export interface KLineData {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close?: number;
  change?: number;
  pct_chg: number;
  vol: number;
  amount?: number;
  turnover_rate?: number;
  total_mv?: number;
  float_mv?: number;
  circ_mv?: number;  // 流通市值(万元) - 股票/可转债专用
  volume_ratio?: number;
  // 可转债专用字段
  bond_over_rate?: number;  // 纯债溢价率(%)
  cb_value?: number;        // 转股价值
  cb_over_rate?: number;    // 转股溢价率(%)
  // 开盘竞价字段
  auction_vol?: number;           // 集合竞价成交量(股)
  auction_price?: number;         // 集合竞价成交均价(元)
  auction_amount?: number;        // 集合竞价成交金额(元)
  auction_turnover_rate?: number; // 集合竞价换手率(%)
  auction_volume_ratio?: number;  // 集合竞价量比
  auction_pct_chg?: number;       // 集合竞价涨跌幅(%)

  expma_5?: number;
  expma_10?: number;
  expma_20?: number;
  expma_60?: number;
  expma_250?: number;
}

// 计算EXPMA指标 - 同花顺标准5条线配置（含年线250）
export const calculateEXPMA = (data: KLineData[]) => {
  if (data.length === 0) return { expma5: [], expma10: [], expma20: [], expma60: [], expma250: [] };

  const periods = [5, 10, 20, 60, 250];
  const alphas = periods.map(period => 2 / (period + 1));
  const expmaLines = periods.map(() => [] as number[]);

  for (let i = 0; i < data.length; i++) {
    const close = data[i].close;

    if (i === 0) {
      // 第一个数据点，所有EXPMA值都等于收盘价
      expmaLines.forEach(line => line.push(close));
    } else {
      // 计算每条EXPMA线
      expmaLines.forEach((line, index) => {
        const alpha = alphas[index];
        const prevExpma = line[i - 1];
        const newExpma = alpha * close + (1 - alpha) * prevExpma;
        line.push(newExpma);
      });
    }
  }

  return {
    expma5: expmaLines[0],
    expma10: expmaLines[1],
    expma20: expmaLines[2],
    expma60: expmaLines[3],
    expma250: expmaLines[4]
  };
};

// 计算BOLL指标（默认N=20，K=2）
export const calculateBOLL = (data: KLineData[], period = 20, k = 2) => {
  const closes = data.map(d => Number(d.close) || 0);
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) {
      middle.push(closes[i]);
      upper.push(null as unknown as number);
      lower.push(null as unknown as number);
      continue;
    }
    const slice = closes.slice(i + 1 - period, i + 1);
    const ma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - ma, 2), 0) / period;
    const sd = Math.sqrt(variance);
    middle.push(ma);
    upper.push(ma + k * sd);
    lower.push(ma - k * sd);
  }
  return { middle, upper, lower };
};

// 计算MACD（12,26,9）
export const calculateMACD = (data: KLineData[], fast = 12, slow = 26, signal = 9) => {
  const closes = data.map(d => Number(d.close) || 0);
  const ema = (period: number) => {
    const alpha = 2 / (period + 1);
    const arr: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i === 0) arr.push(closes[i]);
      else arr.push(alpha * closes[i] + (1 - alpha) * arr[i - 1]);
    }
    return arr;
  };
  const emaFast = ema(fast);
  const emaSlow = ema(slow);
  const dif = emaFast.map((v, i) => v - emaSlow[i]);
  // signal line is EMA of DIF
  const alphaSig = 2 / (signal + 1);
  const dea: number[] = [];
  for (let i = 0; i < dif.length; i++) {
    if (i === 0) dea.push(dif[i]);
    else dea.push(alphaSig * dif[i] + (1 - alphaSig) * dea[i - 1]);
  }
  const bar = dif.map((v, i) => 2 * (v - dea[i]));
  return { dif, dea, bar };
};

// 计算RSI（默认14）
export const calculateRSI = (data: KLineData[], period = 14) => {
  const closes = data.map(d => Number(d.close) || 0);
  const rsi: number[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= period) {
      gain += up;
      loss += down;
      rsi.push(null as unknown as number);
      continue;
    }
    if (i === period + 1) {
      let avgGain = gain / period;
      let avgLoss = loss / period;
      const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    } else {
      // Wilder's smoothing
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + down) / period;
      const rs = loss === 0 ? 0 : gain / loss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  // pad first value
  rsi.unshift(null as unknown as number);
  return rsi;
};

// 计算KDJ（9,3,3）
export const calculateKDJ = (data: KLineData[], n = 9, kPeriod = 3, dPeriod = 3) => {
  const kArr: number[] = [];
  const dArr: number[] = [];
  const jArr: number[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - n + 1);
    const window = data.slice(start, i + 1);
    const lowN = Math.min(...window.map(v => Number(v.low) || 0));
    const highN = Math.max(...window.map(v => Number(v.high) || 0));
    const close = Number(data[i].close) || 0;
    const rsv = highN === lowN ? 50 : ((close - lowN) / (highN - lowN)) * 100;
    const k = (prevK * (kPeriod - 1) + rsv) / kPeriod;
    const d = (prevD * (dPeriod - 1) + k) / dPeriod;
    const j = 3 * k - 2 * d;
    kArr.push(k);
    dArr.push(d);
    jArr.push(j);
    prevK = k;
    prevD = d;
  }
  return { k: kArr, d: dArr, j: jArr };
};

// 计算MA指标（移动平均线）- 同花顺标准5条线配置（含年线250）
export const calculateMA = (data: KLineData[], periods = [5, 10, 20, 60, 250]) => {
  const closes = data.map(d => Number(d.close) || 0);
  const maLines = periods.map(() => [] as number[]);

  for (let i = 0; i < closes.length; i++) {
    periods.forEach((period, index) => {
      if (i + 1 < period) {
        maLines[index].push(null as unknown as number);
      } else {
        const sum = closes.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0);
        maLines[index].push(sum / period);
      }
    });
  }

  return {
    ma5: maLines[0],
    ma10: maLines[1],
    ma20: maLines[2],
    ma60: maLines[3],
    ma250: maLines[4]
  };
};


// 计算CCI指标（顺势指标）
export const calculateCCI = (data: KLineData[], period = 14) => {
  const cci: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i + 1 < period) {
      cci.push(null as unknown as number);
    } else {
      const slice = data.slice(i + 1 - period, i + 1);
      const tps = slice.map(d => (Number(d.high) + Number(d.low) + Number(d.close)) / 3);
      const sma = tps.reduce((a, b) => a + b, 0) / period;
      const md = tps.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
      const currentTp = (Number(data[i].high) + Number(data[i].low) + Number(data[i].close)) / 3;
      cci.push((currentTp - sma) / (0.015 * md));
    }
  }

  return cci;
};

// 计算WR指标（威廉指标）
export const calculateWR = (data: KLineData[], period = 14) => {
  const wr: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i + 1 < period) {
      wr.push(null as unknown as number);
    } else {
      const slice = data.slice(i + 1 - period, i + 1);
      const highest = Math.max(...slice.map(d => Number(d.high)));
      const lowest = Math.min(...slice.map(d => Number(d.low)));
      const close = Number(data[i].close);
      wr.push(-100 * (highest - close) / (highest - lowest));
    }
  }

  return wr;
};

// 计算DMI指标（趋向指标）
export const calculateDMI = (data: KLineData[], period = 14) => {
  const pdi: number[] = [];
  const mdi: number[] = [];
  const adx: number[] = [];

  let trSum = 0;
  let dmPlusSum = 0;
  let dmMinusSum = 0;
  let dxSum = 0;

  for (let i = 1; i < data.length; i++) {
    const high = Number(data[i].high);
    const low = Number(data[i].low);
    const prevHigh = Number(data[i-1].high);
    const prevLow = Number(data[i-1].low);
    const prevClose = Number(data[i-1].close);

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    const dmPlus = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const dmMinus = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;

    if (i < period) {
      trSum += tr;
      dmPlusSum += dmPlus;
      dmMinusSum += dmMinus;
      pdi.push(null as unknown as number);
      mdi.push(null as unknown as number);
      adx.push(null as unknown as number);
    } else {
      if (i === period) {
        trSum += tr;
        dmPlusSum += dmPlus;
        dmMinusSum += dmMinus;
      } else {
        trSum = trSum - trSum / period + tr;
        dmPlusSum = dmPlusSum - dmPlusSum / period + dmPlus;
        dmMinusSum = dmMinusSum - dmMinusSum / period + dmMinus;
      }

      const pdiValue = (dmPlusSum / trSum) * 100;
      const mdiValue = (dmMinusSum / trSum) * 100;
      const dx = Math.abs(pdiValue - mdiValue) / (pdiValue + mdiValue) * 100;

      pdi.push(pdiValue);
      mdi.push(mdiValue);

      if (i < period * 2 - 1) {
        dxSum += dx;
        adx.push(null as unknown as number);
      } else if (i === period * 2 - 1) {
        dxSum += dx;
        adx.push(dxSum / period);
      } else {
        const prevAdx = adx[adx.length - 1];
        adx.push((prevAdx * (period - 1) + dx) / period);
      }
    }
  }

  pdi.unshift(null as unknown as number);
  mdi.unshift(null as unknown as number);
  adx.unshift(null as unknown as number);

  return { pdi, mdi, adx };
};

// 计算SAR指标（抛物线转向）
export const calculateSAR = (data: KLineData[], step = 0.02, maxStep = 0.2) => {
  const sarValues: number[] = [];
  const sarTrends: boolean[] = []; // true表示上升趋势(绿色)，false表示下降趋势(红色)
  if (data.length < 2) return { values: sarValues, trends: sarTrends };

  let isUpTrend = Number(data[1].close) > Number(data[0].close);
  let ep = isUpTrend ? Number(data[1].high) : Number(data[1].low);
  let af = step;
  let sarValue = Number(data[0].close);

  sarValues.push(sarValue);
  sarTrends.push(isUpTrend);

  for (let i = 1; i < data.length; i++) {
    const high = Number(data[i].high);
    const low = Number(data[i].low);

    sarValue = sarValue + af * (ep - sarValue);

    if (isUpTrend) {
      if (low <= sarValue) {
        isUpTrend = false;
        sarValue = ep;
        ep = low;
        af = step;
      } else {
        if (high > ep) {
          ep = high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (high >= sarValue) {
        isUpTrend = true;
        sarValue = ep;
        ep = high;
        af = step;
      } else {
        if (low < ep) {
          ep = low;
          af = Math.min(af + step, maxStep);
        }
      }
    }

    sarValues.push(sarValue);
    sarTrends.push(isUpTrend);
  }

  return { values: sarValues, trends: sarTrends };
};

// 计算OBV指标（能量潮）
export const calculateOBV = (data: KLineData[]) => {
  const obv: number[] = [];
  let obvValue = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      obvValue = Number(data[i].vol) || 0;
    } else {
      const currentClose = Number(data[i].close);
      const prevClose = Number(data[i-1].close);
      const volume = Number(data[i].vol) || 0;

      if (currentClose > prevClose) {
        obvValue += volume;
      } else if (currentClose < prevClose) {
        obvValue -= volume;
      }
      // 如果价格相等，OBV不变
    }
    obv.push(obvValue);
  }

  return obv;
};

// 计算神奇九转指标（TD Sequential）
export const calculateTDSequential = (data: KLineData[]) => {
  const buySignals: (number | null)[] = [];
  const sellSignals: (number | null)[] = [];

  let buyCount = 0;
  let sellCount = 0;
  let buyStartIndex = -1; // 记录买入序列开始位置
  let sellStartIndex = -1; // 记录卖出序列开始位置

  for (let i = 0; i < data.length; i++) {
    buySignals.push(null);
    sellSignals.push(null);

    if (i < 4) continue; // 需要至少4个数据点进行比较

    const currentClose = Number(data[i].close);
    const fourDaysAgoClose = Number(data[i - 4].close);

    // 买入信号逻辑：当前收盘价低于4天前收盘价
    if (currentClose < fourDaysAgoClose) {
      if (sellCount > 0) {
        // 清除未完成的卖出序列
        for (let j = sellStartIndex; j <= i; j++) {
          if (sellSignals[j] !== null) {
            sellSignals[j] = null;
          }
        }
        sellCount = 0;
        sellStartIndex = -1;
      }

      if (buyCount === 0) {
        buyStartIndex = i; // 记录买入序列开始位置
      }

      buyCount++;

      if (buyCount >= 1 && buyCount <= 9) {
        buySignals[i] = buyCount;
      }

      if (buyCount === 9) {
        // 完成9转，保留整个序列
        buyCount = 0;
        buyStartIndex = -1;
      }
    }
    // 卖出信号逻辑：当前收盘价高于4天前收盘价
    else if (currentClose > fourDaysAgoClose) {
      if (buyCount > 0) {
        // 清除未完成的买入序列
        for (let j = buyStartIndex; j <= i; j++) {
          if (buySignals[j] !== null) {
            buySignals[j] = null;
          }
        }
        buyCount = 0;
        buyStartIndex = -1;
      }

      if (sellCount === 0) {
        sellStartIndex = i; // 记录卖出序列开始位置
      }

      sellCount++;

      if (sellCount >= 1 && sellCount <= 9) {
        sellSignals[i] = sellCount;
      }

      if (sellCount === 9) {
        // 完成9转，保留整个序列
        sellCount = 0;
        sellStartIndex = -1;
      }
    }
    // 价格相等时，清除未完成的序列
    else {
      if (buyCount > 0) {
        // 清除未完成的买入序列
        for (let j = buyStartIndex; j <= i; j++) {
          if (buySignals[j] !== null) {
            buySignals[j] = null;
          }
        }
        buyCount = 0;
        buyStartIndex = -1;
      }
      if (sellCount > 0) {
        // 清除未完成的卖出序列
        for (let j = sellStartIndex; j <= i; j++) {
          if (sellSignals[j] !== null) {
            sellSignals[j] = null;
          }
        }
        sellCount = 0;
        sellStartIndex = -1;
      }
    }
  }

  // 清除最后未完成的序列
  if (buyCount > 0 && buyCount < 9) {
    for (let j = buyStartIndex; j < data.length; j++) {
      if (buySignals[j] !== null) {
        buySignals[j] = null;
      }
    }
  }
  if (sellCount > 0 && sellCount < 9) {
    for (let j = sellStartIndex; j < data.length; j++) {
      if (sellSignals[j] !== null) {
        sellSignals[j] = null;
      }
    }
  }

  return { buySignals, sellSignals };
};


