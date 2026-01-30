"""
周期数据计算服务
基于日线数据计算周线和月线数据
"""

from typing import List, Dict, Any

import pandas as pd
from loguru import logger


class PeriodCalculator:
    """周期数据计算器"""

    @staticmethod
    def calculate_weekly_from_daily(
            daily_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        从日线数据计算周线数据

        Args:
            daily_data: 日线数据列表

        Returns:
            周线数据列表
        """
        if not daily_data:
            return []

        try:
            # 转换为DataFrame
            df = pd.DataFrame(daily_data)
            df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d")
            df = df.sort_values("trade_date")

            # 设置trade_date为索引
            df.set_index("trade_date", inplace=True)

            # 自定义稳健聚合：忽略无效(<=0或NaN)价格，避免得到0值开收盘
            def _aggregate_group(g: pd.DataFrame) -> Dict[str, Any]:
                g = g.sort_index()
                row: Dict[str, Any] = {}

                # open: 第一个有效open
                if "open" in g.columns:
                    opens = g["open"].dropna()
                    opens = opens[opens > 0]
                    row["open"] = float(opens.iloc[0]) if not opens.empty else None

                # close: 最后一个有效close
                if "close" in g.columns:
                    closes = g["close"].dropna()
                    closes = closes[closes > 0]
                    row["close"] = float(closes.iloc[-1]) if not closes.empty else None

                # high: 有效最大
                if "high" in g.columns:
                    highs = g["high"].dropna()
                    highs = highs[highs > 0]
                    row["high"] = float(highs.max()) if not highs.empty else None

                # low: 有效最小
                if "low" in g.columns:
                    lows = g["low"].dropna()
                    lows = lows[lows > 0]
                    row["low"] = float(lows.min()) if not lows.empty else None

                # vol/amount 累加（NaN按0）
                if "vol" in g.columns:
                    try:
                        row["vol"] = int(g["vol"].fillna(0).sum())
                    except Exception:
                        row["vol"] = 0
                if "amount" in g.columns:
                    try:
                        row["amount"] = float(g["amount"].fillna(0).sum())
                    except Exception:
                        row["amount"] = 0.0

                # circ_mv/total_mv: 取最后一个有效值（周期末的市值）
                if "circ_mv" in g.columns:
                    circ_mvs = g["circ_mv"].dropna()
                    circ_mvs = circ_mvs[circ_mvs > 0]
                    row["circ_mv"] = float(circ_mvs.iloc[-1]) if not circ_mvs.empty else None
                if "total_mv" in g.columns:
                    total_mvs = g["total_mv"].dropna()
                    total_mvs = total_mvs[total_mvs > 0]
                    row["total_mv"] = float(total_mvs.iloc[-1]) if not total_mvs.empty else None
                # float_mv: 概念/行业使用的流通市值字段
                if "float_mv" in g.columns:
                    float_mvs = g["float_mv"].dropna()
                    float_mvs = float_mvs[float_mvs > 0]
                    row["float_mv"] = float(float_mvs.iloc[-1]) if not float_mvs.empty else None

                return row

            # 周聚合：以周五为截止，符合A股交易口径
            weekly_df = (
                df.groupby(pd.Grouper(freq="W-FRI"))
                .apply(_aggregate_group)
                .apply(pd.Series)
            )

            # 丢弃开收任一为空的周期，避免写入无效K线
            weekly_df = weekly_df.dropna(subset=[c for c in ["open", "close"] if c in weekly_df.columns])

            # 获取ts_code（从原始数据中取第一个）
            ts_code = daily_data[0].get("ts_code", "") if daily_data else ""

            # 计算涨跌幅等衍生指标
            weekly_df["pre_close"] = weekly_df["close"].shift(1)
            weekly_df["change"] = weekly_df["close"] - weekly_df["pre_close"]
            # 避免除零错误，当pre_close为0时设置pct_chg为None
            weekly_df["pct_chg"] = weekly_df.apply(
                lambda row: (row["change"] / row["pre_close"] * 100).round(4)
                if pd.notna(row["pre_close"]) and row["pre_close"] != 0
                else None, axis=1
            )

            # 计算波动率: (high - low) / close * 100，根据收盘价与开盘价决定正负
            weekly_df["volatility"] = weekly_df.apply(
                lambda row: (
                    ((row["high"] - row["low"]) / row["close"] * 100)
                    if row["close"] >= row["open"]
                    else -((row["high"] - row["low"]) / row["close"] * 100)
                ) if (
                        pd.notna(row["high"]) and pd.notna(row["low"]) and
                        pd.notna(row["close"]) and pd.notna(row["open"]) and
                        row["close"] != 0
                ) else None, axis=1
            )

            # 转换回字典列表
            result = []
            for date, row in weekly_df.iterrows():
                if pd.notna(row["open"]) and pd.notna(row["close"]):
                    result.append(
                        {
                            "ts_code": ts_code,
                            "trade_date": date.strftime("%Y%m%d"),
                            "period": "weekly",
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "pre_close": (
                                float(row["pre_close"])
                                if pd.notna(row["pre_close"])
                                else None
                            ),
                            "change": (
                                float(row["change"])
                                if pd.notna(row["change"])
                                else None
                            ),
                            "pct_chg": (
                                float(row["pct_chg"])
                                if pd.notna(row["pct_chg"])
                                else None
                            ),
                            "volatility": (
                                float(row["volatility"])
                                if pd.notna(row["volatility"])
                                else None
                            ),
                            "vol": int(row["vol"]) if pd.notna(row["vol"]) else 0,
                            "amount": (
                                float(row["amount"]) if pd.notna(row["amount"]) else 0.0
                            ),
                            "circ_mv": (
                                float(row["circ_mv"]) if "circ_mv" in row and pd.notna(row.get("circ_mv")) else None
                            ),
                            "total_mv": (
                                float(row["total_mv"]) if "total_mv" in row and pd.notna(row.get("total_mv")) else None
                            ),
                            "float_mv": (
                                float(row["float_mv"]) if "float_mv" in row and pd.notna(row.get("float_mv")) else None
                            ),
                        }
                    )

            logger.debug(
                f"计算周线完成 | 日线: {len(daily_data)} -> 周线: {len(result)}"
            )
            return result

        except Exception as e:
            logger.error(f"计算周线数据失败: {e}")
            return []

    @staticmethod
    def calculate_monthly_from_daily(
            daily_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        从日线数据计算月线数据

        Args:
            daily_data: 日线数据列表

        Returns:
            月线数据列表
        """
        if not daily_data:
            return []

        try:
            # 转换为DataFrame
            df = pd.DataFrame(daily_data)
            df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d")
            df = df.sort_values("trade_date")

            # 设置trade_date为索引
            df.set_index("trade_date", inplace=True)

            def _aggregate_group(g: pd.DataFrame) -> Dict[str, Any]:
                g = g.sort_index()
                row: Dict[str, Any] = {}

                if "open" in g.columns:
                    opens = g["open"].dropna()
                    opens = opens[opens > 0]
                    row["open"] = float(opens.iloc[0]) if not opens.empty else None
                if "close" in g.columns:
                    closes = g["close"].dropna()
                    closes = closes[closes > 0]
                    row["close"] = float(closes.iloc[-1]) if not closes.empty else None
                if "high" in g.columns:
                    highs = g["high"].dropna()
                    highs = highs[highs > 0]
                    row["high"] = float(highs.max()) if not highs.empty else None
                if "low" in g.columns:
                    lows = g["low"].dropna()
                    lows = lows[lows > 0]
                    row["low"] = float(lows.min()) if not lows.empty else None
                if "vol" in g.columns:
                    try:
                        row["vol"] = int(g["vol"].fillna(0).sum())
                    except Exception:
                        row["vol"] = 0
                if "amount" in g.columns:
                    try:
                        row["amount"] = float(g["amount"].fillna(0).sum())
                    except Exception:
                        row["amount"] = 0.0

                # circ_mv/total_mv: 取最后一个有效值（周期末的市值）
                if "circ_mv" in g.columns:
                    circ_mvs = g["circ_mv"].dropna()
                    circ_mvs = circ_mvs[circ_mvs > 0]
                    row["circ_mv"] = float(circ_mvs.iloc[-1]) if not circ_mvs.empty else None
                if "total_mv" in g.columns:
                    total_mvs = g["total_mv"].dropna()
                    total_mvs = total_mvs[total_mvs > 0]
                    row["total_mv"] = float(total_mvs.iloc[-1]) if not total_mvs.empty else None
                # float_mv: 概念/行业使用的流通市值字段
                if "float_mv" in g.columns:
                    float_mvs = g["float_mv"].dropna()
                    float_mvs = float_mvs[float_mvs > 0]
                    row["float_mv"] = float(float_mvs.iloc[-1]) if not float_mvs.empty else None

                return row

            # 月聚合：自然月末（ME），使用稳健聚合
            monthly_df = (
                df.groupby(pd.Grouper(freq="ME"))
                .apply(_aggregate_group)
                .apply(pd.Series)
            )

            monthly_df = monthly_df.dropna(subset=[c for c in ["open", "close"] if c in monthly_df.columns])

            # 获取ts_code（从原始数据中取第一个）
            ts_code = daily_data[0].get("ts_code", "") if daily_data else ""

            # 计算涨跌幅等衍生指标
            monthly_df["pre_close"] = monthly_df["close"].shift(1)
            monthly_df["change"] = monthly_df["close"] - monthly_df["pre_close"]
            # 避免除零错误，当pre_close为0时设置pct_chg为None
            monthly_df["pct_chg"] = monthly_df.apply(
                lambda row: (row["change"] / row["pre_close"] * 100).round(4)
                if pd.notna(row["pre_close"]) and row["pre_close"] != 0
                else None, axis=1
            )

            # 计算波动率: (high - low) / close * 100，根据收盘价与开盘价决定正负
            monthly_df["volatility"] = monthly_df.apply(
                lambda row: (
                    ((row["high"] - row["low"]) / row["close"] * 100)
                    if row["close"] >= row["open"]
                    else -((row["high"] - row["low"]) / row["close"] * 100)
                ) if (
                        pd.notna(row["high"]) and pd.notna(row["low"]) and
                        pd.notna(row["close"]) and pd.notna(row["open"]) and
                        row["close"] != 0
                ) else None, axis=1
            )

            # 转换回字典列表
            result = []
            for date, row in monthly_df.iterrows():
                if pd.notna(row["open"]) and pd.notna(row["close"]):
                    result.append(
                        {
                            "ts_code": ts_code,
                            "trade_date": date.strftime("%Y%m%d"),
                            "period": "monthly",
                            "open": float(row["open"]),
                            "high": float(row["high"]),
                            "low": float(row["low"]),
                            "close": float(row["close"]),
                            "pre_close": (
                                float(row["pre_close"])
                                if pd.notna(row["pre_close"])
                                else None
                            ),
                            "change": (
                                float(row["change"])
                                if pd.notna(row["change"])
                                else None
                            ),
                            "pct_chg": (
                                float(row["pct_chg"])
                                if pd.notna(row["pct_chg"])
                                else None
                            ),
                            "volatility": (
                                float(row["volatility"])
                                if pd.notna(row["volatility"])
                                else None
                            ),
                            "vol": int(row["vol"]) if pd.notna(row["vol"]) else 0,
                            "amount": (
                                float(row["amount"]) if pd.notna(row["amount"]) else 0.0
                            ),
                            "circ_mv": (
                                float(row["circ_mv"]) if "circ_mv" in row and pd.notna(row.get("circ_mv")) else None
                            ),
                            "total_mv": (
                                float(row["total_mv"]) if "total_mv" in row and pd.notna(row.get("total_mv")) else None
                            ),
                            "float_mv": (
                                float(row["float_mv"]) if "float_mv" in row and pd.notna(row.get("float_mv")) else None
                            ),
                        }
                    )

            logger.debug(
                f"计算月线完成 | 日线: {len(daily_data)} -> 月线: {len(result)}"
            )
            return result

        except Exception as e:
            logger.error(f"计算月线数据失败: {e}")
            return []
