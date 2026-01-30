"""
IndicatorService: 指标注册与向量化计算

当前包含：
- MA/EMA/EXPMA
- MACD
- RSI
- KDJ (9,3,3)
- BOLL (20, 2σ)
- CCI(14)
- WR(14)
- DMI(14)/ADX/ADXR
- SAR (step 0.02, max 0.2)
- OBV

说明：返回 Python 原生 list，便于序列化；输入为 Python list。
"""
from typing import Dict, List, Optional

import numpy as np


class IndicatorService:
    def __init__(self) -> None:
        pass

    # ============== 基础均线 ==============
    @staticmethod
    def compute_ma_series(values: List[float], periods: List[int]) -> Dict[int, List[Optional[float]]]:
        if not values:
            return {p: [] for p in periods}
        arr = np.asarray(values, dtype=float)
        n = arr.size
        result: Dict[int, List[Optional[float]]] = {}
        cs = np.cumsum(arr, dtype=float)
        for p in periods:
            if p <= 1:
                result[p] = arr.tolist()
                continue
            out = [None] * n
            for i in range(n):
                if i < p - 1:
                    out[i] = None
                else:
                    start = i - p + 1
                    s = cs[i] - (cs[start - 1] if start > 0 else 0.0)
                    out[i] = s / float(p)
            result[p] = out
        return result


    @staticmethod
    def compute_expma_series(close: List[float], periods: List[int]) -> Dict[int, List[float]]:
        if not close:
            return {p: [] for p in periods}
        arr = np.asarray(close, dtype=float)
        results: Dict[int, List[float]] = {}
        for p in periods:
            if p <= 1:
                results[p] = arr.tolist()
                continue
            alpha = 2.0 / (p + 1)
            out = np.empty_like(arr)
            out[0] = arr[0]
            for i in range(1, arr.shape[0]):
                out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1]
            results[p] = out.tolist()
        return results

    # ============== MACD ==============
    @staticmethod
    def compute_macd(
            close: List[float], 
            fast: int = 12, 
            slow: int = 26, 
            signal: int = 9,
            expma_fast: Optional[List[float]] = None,
            expma_slow: Optional[List[float]] = None
    ) -> Dict[str, List[Optional[float]]]:
        """
        计算MACD指标
        
        Args:
            close: 收盘价列表
            fast: 快线周期，默认12
            slow: 慢线周期，默认26
            signal: 信号线周期，默认9
            expma_fast: 可选的EXPMA12数据，如果提供则复用
            expma_slow: 可选的EXPMA26数据，如果提供则复用
        """
        if not close:
            return {"dif": [], "dea": [], "hist": []}
        arr = np.asarray(close, dtype=float)
        
        # 如果提供了EXPMA12和EXPMA26，直接使用；否则计算
        if expma_fast is not None and expma_slow is not None and len(expma_fast) == len(close) and len(expma_slow) == len(close):
            ema_fast = np.asarray(expma_fast, dtype=float)
            ema_slow = np.asarray(expma_slow, dtype=float)
        else:
            ema_fast_result = IndicatorService.compute_expma_series(arr.tolist(), [fast])
            ema_slow_result = IndicatorService.compute_expma_series(arr.tolist(), [slow])
            ema_fast = np.asarray(ema_fast_result.get(fast, []), dtype=float)
            ema_slow = np.asarray(ema_slow_result.get(slow, []), dtype=float)
        
        dif = ema_fast - ema_slow
        dea_result = IndicatorService.compute_expma_series(dif.tolist(), [signal])
        dea = np.asarray(dea_result.get(signal, []), dtype=float)
        n = arr.size
        if dif.size != n:
            dif = np.resize(dif, n)
        if dea.size != n:
            dea = np.resize(dea, n)
        hist = dif - dea
        # 严格模式：MACD 仅在 slow+signal-2 之后给值
        warm = slow + signal - 2
        dif_l: List[Optional[float]] = [None] * n
        dea_l: List[Optional[float]] = [None] * n
        hist_l: List[Optional[float]] = [None] * n
        for i in range(n):
            if i >= warm:
                dif_l[i] = float(dif[i])
                dea_l[i] = float(dea[i])
                hist_l[i] = float(hist[i])
        return {"dif": dif_l, "dea": dea_l, "hist": hist_l}

    # ============== RSI ==============
    @staticmethod
    def compute_rsi(close: List[float], periods: List[int]) -> Dict[int, List[Optional[float]]]:
        if not close:
            return {p: [] for p in periods}
        arr = np.asarray(close, dtype=float)
        diff = np.diff(arr, prepend=arr[0])
        gains = np.where(diff > 0, diff, 0.0)
        losses = np.where(diff < 0, -diff, 0.0)
        result: Dict[int, List[Optional[float]]] = {}
        for p in periods:
            if p <= 0:
                result[p] = [None] * arr.size
                continue
            avg_gain = np.empty(arr.size)
            avg_loss = np.empty(arr.size)
            avg_gain[:p] = gains[:p].mean() if p <= arr.size else gains.mean()
            avg_loss[:p] = losses[:p].mean() if p <= arr.size else losses.mean()
            for i in range(p, arr.size):
                avg_gain[i] = (avg_gain[i - 1] * (p - 1) + gains[i]) / p
                avg_loss[i] = (avg_loss[i - 1] * (p - 1) + losses[i]) / p
            rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
            rsi = 100.0 - (100.0 / (1.0 + rs))
            out = [None] * arr.size
            for i in range(arr.size):
                if i >= p - 1:
                    out[i] = float(rsi[i])
            result[p] = out
        return result

    # ============== KDJ ==============
    @staticmethod
    def compute_kdj(high: List[float], low: List[float], close: List[float], n: int = 9, k: int = 3, d: int = 3) -> \
            Dict[str, List[Optional[float]]]:
        if not close:
            return {"k": [], "d": [], "j": []}
        hh = np.asarray(high, dtype=float)
        ll = np.asarray(low, dtype=float)
        cc = np.asarray(close, dtype=float)
        size = cc.size
        k_arr = np.zeros(size)
        d_arr = np.zeros(size)
        rsv = np.zeros(size)
        for i in range(size):
            start = max(0, i - n + 1)
            hh_n = np.max(hh[start: i + 1])
            ll_n = np.min(ll[start: i + 1])
            denom = hh_n - ll_n
            rsv[i] = 0.0 if denom == 0 else (cc[i] - ll_n) / denom * 100.0
            if i == 0:
                k_arr[i] = rsv[i]
                d_arr[i] = rsv[i]
            else:
                k_arr[i] = (k_arr[i - 1] * (k - 1) + rsv[i]) / k
                d_arr[i] = (d_arr[i - 1] * (d - 1) + k_arr[i]) / d
        j_arr = 3 * k_arr - 2 * d_arr
        out_k: List[Optional[float]] = [None] * size
        out_d: List[Optional[float]] = [None] * size
        out_j: List[Optional[float]] = [None] * size
        for i in range(size):
            if i >= n - 1:
                out_k[i] = float(k_arr[i])
                out_d[i] = float(d_arr[i])
                out_j[i] = float(j_arr[i])
        return {"k": out_k, "d": out_d, "j": out_j}

    # ============== BOLL ==============
    @staticmethod
    def compute_boll(close: List[float], n: int = 20, k: float = 2.0, ma20: Optional[List[Optional[float]]] = None) -> Dict[str, List[Optional[float]]]:
        """
        计算布林带指标
        
        Args:
            close: 收盘价列表
            n: 周期，默认20
            k: 标准差倍数，默认2.0
            ma20: 可选的MA20数据，如果提供则复用，避免重复计算
        """
        if not close:
            return {"upper": [], "middle": [], "lower": []}
        arr = np.asarray(close, dtype=float)
        
        # 如果提供了MA20，直接使用；否则计算
        if ma20 is not None and len(ma20) == len(close):
            ma = np.asarray([float(m) if m is not None else np.nan for m in ma20], dtype=float)
        else:
            ma_result = IndicatorService.compute_ma_series(arr.tolist(), [n])
            ma = np.asarray(ma_result.get(n, []), dtype=object)
        
        out_u: List[Optional[float]] = [None] * arr.size
        out_m: List[Optional[float]] = [None] * arr.size
        out_l: List[Optional[float]] = [None] * arr.size
        for i in range(arr.size):
            if i >= n - 1:
                start = i - n + 1
                std = float(np.std(arr[start: i + 1]))
                m = float(ma[i]) if not np.isnan(ma[i]) else float(np.mean(arr[start: i + 1]))
                out_u[i] = m + k * std
                out_m[i] = m
                out_l[i] = m - k * std
        return {"upper": out_u, "middle": out_m, "lower": out_l}

    # ============== CCI ==============
    @staticmethod
    def compute_cci(high: List[float], low: List[float], close: List[float], n: int = 14) -> List[Optional[float]]:
        if not close:
            return []
        hh = np.asarray(high, dtype=float)
        ll = np.asarray(low, dtype=float)
        cc = np.asarray(close, dtype=float)
        tp = (hh + ll + cc) / 3.0
        out: List[Optional[float]] = [None] * cc.size
        for i in range(cc.size):
            if i >= n - 1:
                start = i - n + 1
                ma_tp = float(np.mean(tp[start: i + 1]))
                md = float(np.mean(np.abs(tp[start: i + 1] - ma_tp)))
                out[i] = 0.0 if md == 0 else (tp[i] - ma_tp) / (0.015 * md)
        return out

    # ============== WR ==============
    @staticmethod
    def compute_wr(high: List[float], low: List[float], close: List[float], n: int = 14) -> List[Optional[float]]:
        if not close:
            return []
        hh = np.asarray(high, dtype=float)
        ll = np.asarray(low, dtype=float)
        cc = np.asarray(close, dtype=float)
        out: List[Optional[float]] = [None] * cc.size
        for i in range(cc.size):
            if i >= n - 1:
                start = i - n + 1
                hh_n = float(np.max(hh[start: i + 1]))
                ll_n = float(np.min(ll[start: i + 1]))
                denom = hh_n - ll_n
                out[i] = 0.0 if denom == 0 else (hh_n - cc[i]) / denom * 100.0
        return out

    # ============== DMI / ADX / ADXR ==============
    @staticmethod
    def compute_dmi(high: List[float], low: List[float], close: List[float], n: int = 14) -> Dict[
        str, List[Optional[float]]]:
        if not close:
            empty: List[Optional[float]] = []
            return {"pdi": empty, "mdi": empty, "adx": empty, "adxr": empty}
        hh = np.asarray(high, dtype=float)
        ll = np.asarray(low, dtype=float)
        cc = np.asarray(close, dtype=float)
        size = cc.size
        tr = np.zeros(size)
        pdm = np.zeros(size)
        mdm = np.zeros(size)
        for i in range(1, size):
            tr[i] = max(hh[i] - ll[i], abs(hh[i] - cc[i - 1]), abs(ll[i] - cc[i - 1]))
            up_move = hh[i] - hh[i - 1]
            down_move = ll[i - 1] - ll[i]
            pdm[i] = up_move if (up_move > down_move and up_move > 0) else 0.0
            mdm[i] = down_move if (down_move > up_move and down_move > 0) else 0.0

        def wilder_smooth(x: np.ndarray, period: int) -> np.ndarray:
            out = np.zeros_like(x)
            if x.size == 0:
                return out
            out[period - 1] = x[:period].sum()
            for i in range(period, x.size):
                out[i] = out[i - 1] - (out[i - 1] / period) + x[i]
            return out

        tr_s = wilder_smooth(tr, n)
        pdm_s = wilder_smooth(pdm, n)
        mdm_s = wilder_smooth(mdm, n)
        pdi_raw = np.divide(pdm_s, tr_s, out=np.zeros_like(pdm_s), where=tr_s != 0) * 100.0
        mdi_raw = np.divide(mdm_s, tr_s, out=np.zeros_like(mdm_s), where=tr_s != 0) * 100.0
        dx = np.divide(np.abs(pdi_raw - mdi_raw), (pdi_raw + mdi_raw), out=np.zeros_like(pdi_raw),
                       where=(pdi_raw + mdi_raw) != 0) * 100.0
        # ADX Wilder 平滑
        adx_expma_result = IndicatorService.compute_expma_series(dx.tolist(), [n])
        adx_series = adx_expma_result.get(n, [])
        # ADXR = (当前ADX + n期前ADX)/2
        adx_arr = np.asarray(adx_series)
        adxr_arr = np.empty_like(adx_arr)
        adxr_arr[:] = np.nan
        for i in range(adx_arr.size):
            if i >= 2 * n - 2 and i - n + 1 >= 0:
                adxr_arr[i] = (adx_arr[i] + adx_arr[i - n + 1]) / 2.0
        # 严格输出：pdi/mdi 从 n-1 起有值；adx 从 2n-2 起；adxr 从 2n-2 起
        pdi: List[Optional[float]] = [None] * size
        mdi: List[Optional[float]] = [None] * size
        adx: List[Optional[float]] = [None] * size
        adxr: List[Optional[float]] = [None] * size
        for i in range(size):
            if i >= n - 1:
                pdi[i] = float(pdi_raw[i])
                mdi[i] = float(mdi_raw[i])
            if i >= 2 * n - 2 and not np.isnan(adx_arr[i]):
                adx[i] = float(adx_arr[i])
            if i >= 2 * n - 2 and not np.isnan(adxr_arr[i]):
                adxr[i] = float(adxr_arr[i])
        return {"pdi": pdi, "mdi": mdi, "adx": adx, "adxr": adxr}

    # ============== SAR ==============
    @staticmethod
    def compute_sar(high: List[float], low: List[float], step: float = 0.02, max_step: float = 0.2) -> List[
        Optional[float]]:
        if not high:
            return []
        hh = np.asarray(high, dtype=float)
        ll = np.asarray(low, dtype=float)
        size = len(hh)
        sar = np.zeros(size)
        bull = True
        af = step
        ep = hh[0]
        sar[0] = ll[0]
        for i in range(1, size):
            sar[i] = sar[i - 1] + af * (ep - sar[i - 1])
            if bull:
                sar[i] = min(sar[i], ll[i - 1], ll[i])
                if hh[i] > ep:
                    ep = hh[i]
                    af = min(af + step, max_step)
                if ll[i] < sar[i]:
                    bull = False
                    sar[i] = ep
                    ep = ll[i]
                    af = step
            else:
                sar[i] = max(sar[i], hh[i - 1], hh[i])
                if ll[i] < ep:
                    ep = ll[i]
                    af = min(af + step, max_step)
                if hh[i] > sar[i]:
                    bull = True
                    sar[i] = ep
                    ep = hh[i]
                    af = step
        out: List[Optional[float]] = [None] * size
        # SAR 从第2根起给值
        for i in range(1, size):
            out[i] = float(sar[i])
        return out

    # ============== OBV ==============
    @staticmethod
    def compute_obv(close: List[float], volume: List[float]) -> List[float]:
        if not close or not volume or len(close) != len(volume):
            return [0.0] * len(close)
        cc = np.asarray(close, dtype=float)
        vv = np.asarray(volume, dtype=float)
        out = np.zeros(cc.size)
        for i in range(1, cc.size):
            if cc[i] > cc[i - 1]:
                out[i] = out[i - 1] + vv[i]
            elif cc[i] < cc[i - 1]:
                out[i] = out[i - 1] - vv[i]
            else:
                out[i] = out[i - 1]
        return out.tolist()

    # ============== TD 简化实现 ==============
    @staticmethod
    def compute_td_setup_and_count(close: List[float], lookback: int = 4) -> Dict[str, List[Optional[int]]]:
        if not close:
            return {"setup": [], "count": []}
        cc = np.asarray(close, dtype=float)
        size = cc.size
        setup: List[Optional[int]] = [None] * size
        count: List[Optional[int]] = [None] * size
        for i in range(size):
            if i < lookback:
                continue
            if cc[i] > cc[i - lookback]:
                setup[i] = max(1, (setup[i - 1] or 0) + 1 if (setup[i - 1] or 0) > 0 else 1)
            elif cc[i] < cc[i - lookback]:
                setup[i] = min(-1, (setup[i - 1] or 0) - 1 if (setup[i - 1] or 0) < 0 else -1)
            else:
                setup[i] = 0
            count[i] = (count[i - 1] or 0) + (1 if setup[i] else 0)
        return {"setup": setup, "count": count}


# 全局实例
indicator_service = IndicatorService()
