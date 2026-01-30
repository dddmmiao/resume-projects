"""
开盘竞价数据处理器
负责开盘竞价数据的转换、验证和存储
"""
from typing import List, Dict, Any, Callable, Optional, Tuple

from loguru import logger


class AuctionDataProcessor:
    """开盘竞价数据处理器"""
    
    def __init__(self):
        """初始化处理器"""
        pass
    
    def process_auction_data(
        self,
        auction_dtos: List[Any],
        bulk_store_func: Callable,
        batch_size: int = 500,
        latest_daily_dates: Optional[Dict[str, str]] = None,
    ) -> Dict[str, int]:
        """
        处理开盘竞价数据
        
        Args:
            auction_dtos: 开盘竞价DTO列表（可以包含多个 ts_code 的数据，需至少包含 ts_code、trade_date、pre_close 等字段）
            bulk_store_func: 批量存储函数 (data, batch_size) -> result
            batch_size: 批量大小
            latest_daily_dates: 每个 ts_code 对应的最新日线日期映射 {ts_code: latest_date}，
                               latest_date 为 YYYYMMDD 字符串，用于区分新老记录
            
        Returns:
            {"inserted_count": int, "updated_count": int, "total": int}
        """
        import time
        
        if not auction_dtos:
            logger.warning("没有开盘竞价数据需要处理")
            return {"inserted_count": 0, "updated_count": 0, "total": 0}
        
        start_time = time.time()
        total_dtos = len(auction_dtos)
        
        logger.info(
            f"开始处理开盘竞价数据 | "
            f"总条数: {total_dtos}"
        )
        
        # 1. 转换为字典格式
        convert_start = time.time()
        auction_data = self._convert_dtos_to_dicts(auction_dtos)
        convert_duration = time.time() - convert_start
        logger.info(f"DTO转换完成 | 耗时: {convert_duration:.2f}秒")
        
        # 2. 准备K线数据格式
        prepare_start = time.time()
        kline_data = self._prepare_kline_data(auction_data, latest_daily_dates=latest_daily_dates)
        prepare_duration = time.time() - prepare_start
        
        if not kline_data:
            logger.warning("没有有效的开盘竞价数据需要更新")
            return {"inserted_count": 0, "updated_count": 0, "total": 0}
        
        logger.info(
            f"K线数据准备完成 | "
            f"有效数据: {len(kline_data)} 条 | "
            f"耗时: {prepare_duration:.2f}秒"
        )
        
        # 3. 批量存储
        store_start = time.time()
        result = bulk_store_func(kline_data, batch_size)
        store_duration = time.time() - store_start
        
        inserted = result.get("inserted_count", 0)
        updated = result.get("updated_count", 0)
        total_duration = time.time() - start_time
        
        logger.info(
            f"开盘竞价数据处理完成 | "
            f"插入: {inserted} | "
            f"更新: {updated} | "
            f"总耗时: {total_duration:.2f}秒 | "
            f"转换: {convert_duration:.2f}秒 | "
            f"准备: {prepare_duration:.2f}秒 | "
            f"存储: {store_duration:.2f}秒"
        )
        
        return {
            "inserted_count": inserted,
            "updated_count": updated,
            "total": inserted + updated
        }
    
    def _convert_dtos_to_dicts(self, auction_dtos: List[Any]) -> List[Dict[str, Any]]:
        """
        转换DTO为字典格式
        
        Args:
            auction_dtos: 开盘竞价DTO列表
            
        Returns:
            字典列表
        """
        from ..external.tushare import mappers as strict_mappers
        return strict_mappers.stock_auction_to_update_dicts(auction_dtos)
    
    def _prepare_kline_data(
        self,
        auction_data: List[Dict[str, Any]],
        latest_daily_dates: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        准备K线数据格式，统一字段结构（方案3：条件更新 SQL）
        
        核心思想：
        - 所有记录都包含相同的字段集合，统一字段结构
        - 新记录（交易日期 > 最新交易日期）：设置基础字段值
        - 旧记录（交易日期 <= 最新交易日期）：基础字段显式设置为 None
        - 在 DAO 层使用 IFNULL(VALUES(col), table.col) 条件更新，只在新值不为 NULL 时更新
        
        更新规则：
        - 如果最新交易日期不存在：跳过这条记录，不处理
        - 如果交易日期 > 最新交易日期：初始化基础字段（open, high, low, close）
        - 如果交易日期 <= 最新交易日期：基础字段设为 None，只更新竞价字段
        
        初始化规则（仅当交易日期 > 最新交易日期时）：
        - open = 昨收价（pre_close）
        - close = 竞价价格（auction_price）
        - high = max(昨收价, 竞价价格)
        - low = min(昨收价, 竞价价格)
        
        Args:
            auction_data: 开盘竞价字典列表（需包含 ts_code、trade_date、pre_close 等字段）
            latest_daily_dates: 每个 ts_code 的最新日线日期映射 {ts_code: latest_date}，
                               latest_date 为 YYYYMMDD 字符串，用于区分新老记录
            
        Returns:
            K线数据列表（所有记录都包含相同的字段集合）
        """
        if not auction_data:
            return []
        
        from datetime import datetime, date as _date
        
        # 1. 确定最新交易日期：直接使用传入的 latest_daily_dates，在循环中按 ts_code 查找
        # 注意：即使 latest_daily_dates 为空，也继续处理（新标的将使用默认的早期日期）
        if latest_daily_dates is None:
            latest_daily_dates = {}
        
        # 2. 准备K线数据，统一字段结构
        kline_data_list = []
        initialized_count = 0
        
        for auction in auction_data:
            ts_code = auction.get("ts_code")
            trade_date_str = auction.get("trade_date")
            auction_price = auction.get("auction_price")  # 竞价价格
            auction_vol = auction.get("auction_vol")
            auction_amount = auction.get("auction_amount")
            
            # 如果没有竞价价格，跳过这条记录
            if auction_price is None:
                logger.debug(f"跳过：{ts_code} {trade_date_str} 没有竞价价格")
                continue
            
            # 构建K线数据，统一字段结构
            # 所有记录都包含相同的字段集合，基础字段初始设置为 None
            # 新记录会在后面根据条件更新基础字段值，旧记录保持 None
            # 在 DAO 层使用 IFNULL(VALUES(col), table.col)，NULL 值不会覆盖原值
            kline_data = {
                "ts_code": ts_code,
                "trade_date": trade_date_str,  # 保持字符串格式（YYYYMMDD）
                "period": "daily",
                # 竞价字段
                "auction_vol": auction.get("auction_vol"),
                "auction_price": auction_price,
                "auction_amount": auction.get("auction_amount"),
                "auction_turnover_rate": auction.get("auction_turnover_rate"),
                "auction_volume_ratio": auction.get("auction_volume_ratio"),
                "auction_pct_chg": auction.get("auction_pct_chg"),
                # 日线基础字段
                "pre_close": auction.get("pre_close"),
                "change": None,
                "pct_chg": None,
                "vol": None,
                "amount": None,
                # 基础字段：初始设置为 None，新记录会在后面更新
                "open": None,
                "high": None,
                "low": None,
                "close": None,
                # 流通市值和流通股本：初始设为None，仅新记录会在下面更新
                "circ_mv": None,
                "float_share": None,
            }
            
            try:
                # 将交易日期字符串（YYYYMMDD格式）转换为date对象
                trade_date_obj = datetime.strptime(trade_date_str, "%Y%m%d").date()

                # 根据传入的 latest_daily_dates 获取该股票的最新交易日期
                latest_str: Optional[str] = latest_daily_dates.get(ts_code)
                
                # 新标的（没有最新日线日期记录）：所有数据都视为"新记录"，需要初始化基础字段
                if not latest_str:
                    # 新标的：将最新交易日期设为很早的日期，使所有数据都被视为新记录
                    latest_trade_date = _date(1990, 1, 1)
                    logger.debug(f"{ts_code} 是新标的，所有竞价数据将初始化基础字段")
                else:
                    try:
                        latest_trade_date = datetime.strptime(str(latest_str), "%Y%m%d").date()
                    except Exception:
                        logger.warning(f"解析最新交易日期失败: {ts_code}, latest_daily_date={latest_str}")
                        continue
                
                pre_close = auction.get("pre_close")

                def _init_suspension_day() -> None:
                    """使用昨收价初始化停牌日的基础字段和涨跌数据"""
                    kline_data["open"] = pre_close
                    kline_data["close"] = pre_close
                    kline_data["high"] = pre_close
                    kline_data["low"] = pre_close
                    kline_data["pre_close"] = pre_close
                    # 竞价价格也赋值为昨收价（系统特殊处理：0表示没有竞价，用pre_close填充）
                    kline_data["auction_price"] = pre_close
                    kline_data["vol"] = 0
                    kline_data["amount"] = 0.0
                    kline_data["change"] = 0.0
                    kline_data["pct_chg"] = 0.0
                
                # 方案3：新记录（交易日期 > 最新交易日期）更新基础字段值
                if trade_date_obj > latest_trade_date:
                    # 新记录：尝试初始化基础字段
                    if pre_close is not None and pre_close > 0:
                        if auction_price == 0:
                            _init_suspension_day()
                        else:
                            # 更新基础字段值
                            kline_data["open"] = pre_close
                            kline_data["close"] = auction_price
                            kline_data["high"] = max(pre_close, auction_price)
                            kline_data["low"] = min(pre_close, auction_price)

                            # 初始化日线成交与涨跌字段（仅在尚无该交易日K线时，由竞价先创建占位K线）
                            kline_data["vol"] = auction_vol
                            kline_data["amount"] = auction_amount
                            change_val = auction_price - pre_close
                            kline_data["change"] = change_val
                            try:
                                if pre_close:
                                    pct = (change_val / pre_close) * 100
                                    kline_data["pct_chg"] = round(pct, 4)
                            except Exception:
                                pass
                            
                            # 计算流通市值: circ_mv = float_share(万股) × auction_price(元) = 万元
                            float_share = auction.get("float_share")
                            if float_share and float_share > 0:
                                kline_data["float_share"] = float_share
                                kline_data["circ_mv"] = float(float_share) * float(auction_price)

                        initialized_count += 1
                    # 如果 pre_close 无效，基础字段保持 None（已在初始化时设置）
                else:
                    # 旧记录（交易日期 < 最新交易日期）
                    # 如果竞价价格为0，认为该天没有开盘交易（停牌），用昨收价初始化
                    if auction_price == 0 and pre_close is not None and pre_close > 0:
                        _init_suspension_day()
                        initialized_count += 1
            except (ValueError, TypeError) as e:
                logger.warning(f"解析交易日期失败: {ts_code}, trade_date={trade_date_str}, 错误: {e}")
                # 日期格式错误时跳过这条记录
                continue
            
            kline_data_list.append(kline_data)
        
        if initialized_count > 0:
            logger.debug(f"为 {initialized_count} 条新K线记录初始化了基础字段")
        
        logger.debug(f"准备了 {len(kline_data_list)} 条有效K线数据（统一字段结构）")
        return kline_data_list


# 创建全局实例
auction_data_processor = AuctionDataProcessor()

