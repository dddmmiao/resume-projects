"""
technical_indicator_updater: 计算并回填技术指标到分年K线表
- 全量：为给定 entity_type 与代码集合，重算 daily/weekly/monthly 指标
- 增量：为给定 entity_type/period/代码集合，仅对最近一段缺口与新数据进行更新

说明：
- 先实现 EXPMA（5/10/20/60）为示例，其余指标留有扩展位（接口不变，后续补齐）
- 使用 TableFactory 与 KlineQueryUtils 获取数据；用 SQLAlchemy session 批量 upsert
"""
from __future__ import annotations

import math
import os
from typing import List, Dict, Any, Optional, Callable

from loguru import logger
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import get_db, TableFactory
from ..data.concept_kline_service import ConceptKlineService
from ..data.convertible_bond_kline_service import ConvertibleBondKlineService
from ..data.indicator_service import indicator_service
from ..data.industry_kline_service import IndustryKlineService
# 🚀 性能优化：导入业务层K线服务，使用带缓存的方法
from ..data.stock_kline_service import StockKlineService
from ...constants.table_types import TableTypes


class TechnicalIndicatorUpdater:
    def __init__(self) -> None:
        self.expma_periods = [5, 10, 20, 60, 250]
        self.ma_periods = [5, 10, 20, 60, 250]
        # 按需计算指标配置：只计算策略实际使用的指标
        # 当前策略只使用EXPMA，其他指标暂不计算
        # 如果未来策略需要使用其他指标，可以在这里添加
        self.required_indicators = {
            'expma': True,  # EXPMA策略使用
            'ma': False,    # 暂不使用，但保留（BOLL需要MA20）
            'macd': False,  # 暂不使用
            'rsi': False,  # 暂不使用
            'kdj': False,  # 暂不使用
            'boll': False,  # 暂不使用
            'cci': False,  # 暂不使用
            'wr': False,  # 暂不使用
            'dmi': False,  # 暂不使用
            'sar': False,  # 暂不使用
            'obv': False,  # 暂不使用
            'td': False,  # 暂不使用
        }
        
        # 🚀 性能优化：初始化业务层K线服务实例，使用带缓存的方法
        self.stock_kline_service = StockKlineService()
        self.concept_kline_service = ConceptKlineService()
        self.industry_kline_service = IndustryKlineService()
        self.bond_kline_service = ConvertibleBondKlineService()
        
    def _get_kline_data_for_indicator(self, ts_code: str, period: str, table_type: str) -> List[Dict[str, Any]]:
        import time
        start_time = time.time()

        if table_type == TableTypes.STOCK:
            data = self.stock_kline_service._get_stock_kline_data_full(ts_code, period, use_cache=False)
            logger.debug(f"指标计算获取股票K线 | ts_code: {ts_code} | period: {period} | 数据量: {len(data)} | 耗时: {time.time() - start_time:.3f}s")
            return data
        elif table_type == TableTypes.CONCEPT:
            data = self.concept_kline_service._get_concept_kline_data_full(ts_code, period, use_cache=False)
            logger.debug(f"指标计算获取概念K线 | ts_code: {ts_code} | period: {period} | 数据量: {len(data)} | 耗时: {time.time() - start_time:.3f}s")
            return data
        elif table_type == TableTypes.INDUSTRY:
            data = self.industry_kline_service._get_industry_kline_data_full(ts_code, period, use_cache=False)
            logger.debug(f"指标计算获取行业K线 | ts_code: {ts_code} | period: {period} | 数据量: {len(data)} | 耗时: {time.time() - start_time:.3f}s")
            return data
        elif table_type == TableTypes.CONVERTIBLE_BOND:
            data = self.bond_kline_service._get_convertible_bond_kline_data_full(ts_code, period, use_cache=False)
            logger.debug(f"指标计算获取可转债K线 | ts_code: {ts_code} | period: {period} | 数据量: {len(data)} | 耗时: {time.time() - start_time:.3f}s")
            return data
        else:
            raise ValueError(f"不支持的table_type: {table_type}，请检查配置或添加支持")

    @staticmethod
    def _norm_list(seq: List[Any], n: int) -> List[Any]:
        m = len(seq)
        if m == n:
            return list(seq)
        if m > n:
            return list(seq)[-n:]
        # m < n, 左侧补齐
        return [None] * (n - m) + list(seq)

    @staticmethod
    def _norm_map(series_map: Dict[Any, List[Any]], n: int) -> Dict[Any, List[Any]]:
        return {k: TechnicalIndicatorUpdater._norm_list(v, n) for k, v in (series_map or {}).items()}

    @staticmethod
    def _sanitize_val(v: Any) -> Any:
        try:
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
        except Exception:
            pass
        return v

    def async_sync_indicators(self, *, entity_type: str, entity_codes: List[str], period: Optional[str] = None,
                              force_sync: bool = False,
                              on_complete: Optional[Callable[[str, str, List[str], bool, int], None]] = None) -> None:
        """
        异步更新技术指标（内部调用 sync_indicators）
        
        Args:
            entity_type: 实体类型
            entity_codes: 实体代码列表
            period: 周期（daily/weekly/monthly）
            force_sync: 是否强制同步
            on_complete: 完成回调函数，接收 (entity_type, period, entity_codes, success, updated_rows) 参数
        """
        if not entity_codes:
            return
        # 规范周期
        if period not in ("daily", "weekly", "monthly"):
            period = "daily"

        def _job():
            # 调用同步方法
            result = self.sync_indicators(
                entity_type=entity_type,
                entity_codes=entity_codes,
                period=period,
                force_sync=force_sync,
            )
            success = result.get("success", False)
            updated = result.get("updated_count", 0)
            
            # 调用完成回调（如果提供）
            if on_complete:
                try:
                    on_complete(entity_type, period, entity_codes, success, updated)
                except Exception as e:
                    logger.warning(f"执行指标更新完成回调失败: {e}")

        from app.utils.concurrent_utils import run_async
        run_async(_job, name=f"indicator_{entity_type}_{period}")

    def sync_indicators(self, *, entity_type: str, entity_codes: List[str], period: Optional[str] = None,
                        force_sync: bool = False) -> Dict[str, Any]:
        """
        同步更新技术指标（阻塞执行）
        
        Args:
            entity_type: 实体类型
            entity_codes: 实体代码列表
            period: 周期（daily/weekly/monthly）
            force_sync: 是否强制同步
            
        Returns:
            {"success": bool, "updated_count": int}
        """
        if not entity_codes:
            return {"success": True, "updated_count": 0}
        
        # 规范周期
        if period not in ("daily", "weekly", "monthly"):
            period = "daily"
        
        try:
            logger.info(f"开始同步指标更新: {entity_type}, {period}, codes={len(entity_codes)}")
            updated = self._update_indicators_for_period(
                entity_type=entity_type,
                entity_codes=entity_codes,
                period=period,
                force_sync=force_sync,
            )
            logger.info(f"同步指标更新完成: {entity_type}, {period}, 更新行数={updated}")
            return {"success": True, "updated_count": updated}
        except Exception as e:
            logger.error(f"同步指标更新失败: {entity_type}, {period}: {e}")
            return {"success": False, "updated_count": 0, "error": str(e)}

    def _build_indicator_updates_for_code(
        self,
        code: str,
        period: str,
        table_type: str,
        force_sync: bool,
    ) -> List[Dict[str, Any]]:
        """为单个代码构建需要写入的指标更新列表（增量尾部更新）。"""
        kline_dicts: List[Dict[str, Any]] = self._get_kline_data_for_indicator(
            ts_code=code,
            period=period,
            table_type=table_type,
        )
        if not kline_dicts:
            return []

        kline_sorted = kline_dicts
        n = len(kline_sorted)

        # 抽取基础序列
        try:
            close = [float(d.get("close")) for d in kline_sorted if d.get("close") is not None]
            high = [float(d.get("high")) for d in kline_sorted if d.get("high") is not None]
            low = [float(d.get("low")) for d in kline_sorted if d.get("low") is not None]
            vol = [float(d.get("vol")) if d.get("vol") is not None else 0.0 for d in kline_sorted]
        except Exception:
            return []

        if len(close) != n or len(high) != n or len(low) != n:
            return []

        # 计算指标（先检查是否已存在，避免重复计算；按需计算，只计算配置中需要的指标）
        try:
            # 按 required_indicators 控制是否计算各个指标
            skip_expma = not self.required_indicators.get('expma', False)
            skip_ma = not self.required_indicators.get('ma', False)
            skip_macd = not self.required_indicators.get('macd', False)
            skip_rsi = not self.required_indicators.get('rsi', False)
            skip_kdj = not self.required_indicators.get('kdj', False)
            skip_boll = not self.required_indicators.get('boll', False)
            skip_cci = not self.required_indicators.get('cci', False)
            skip_wr = not self.required_indicators.get('wr', False)
            skip_dmi = not self.required_indicators.get('dmi', False)
            skip_sar = not self.required_indicators.get('sar', False)
            skip_obv = not self.required_indicators.get('obv', False)
            skip_td = not self.required_indicators.get('td', False)

            # 只计算需要的指标
            if skip_expma:
                expma_map = {}
            else:
                expma_map = indicator_service.compute_expma_series(close, self.expma_periods)

            if skip_ma:
                ma_map = {}
            else:
                ma_map = indicator_service.compute_ma_series(close, self.ma_periods)

            if skip_macd:
                macd = {}
            else:
                # MACD复用已计算的EXPMA12和EXPMA26
                expma_12 = expma_map.get(12) if not skip_expma and 12 in expma_map else None
                expma_26 = expma_map.get(26) if not skip_expma and 26 in expma_map else None
                macd = indicator_service.compute_macd(
                    close,
                    expma_fast=expma_12,
                    expma_slow=expma_26
                )

            if skip_rsi:
                rsi_map = {}
            else:
                rsi_map = indicator_service.compute_rsi(close, [6, 12, 24])

            if skip_kdj:
                kdj = {}
            else:
                kdj = indicator_service.compute_kdj(high, low, close)

            if skip_boll:
                boll = {}
            else:
                # BOLL复用已计算的MA20
                ma_20 = ma_map.get(20) if not skip_ma and 20 in ma_map else None
                boll = indicator_service.compute_boll(close, ma20=ma_20)

            if skip_cci:
                cci = []
            else:
                cci = indicator_service.compute_cci(high, low, close)

            if skip_wr:
                wr = []
            else:
                wr = indicator_service.compute_wr(high, low, close)

            if skip_dmi:
                dmi = {}
            else:
                dmi = indicator_service.compute_dmi(high, low, close)

            if skip_sar:
                sar = []
            else:
                sar = indicator_service.compute_sar(high, low)

            if skip_obv:
                obv = []
            else:
                obv = indicator_service.compute_obv(close, vol)

            if skip_td:
                td = {}
            else:
                td = indicator_service.compute_td_setup_and_count(close)
        except Exception as e:
            logger.warning(f"计算{code}指标失败: {e}")
            return []

        # 统一归一化长度到 n（如果跳过计算，从数据库读取的数据已经是正确格式，不需要归一化）
        if not skip_expma:
            expma_map = self._norm_map(expma_map, n)
        if not skip_ma:
            ma_map = self._norm_map(ma_map, n)
        if not skip_macd:
            macd = {k: self._norm_list(v, n) for k, v in (macd or {}).items()}
        if not skip_rsi:
            rsi_map = self._norm_map(rsi_map, n)
        if not skip_kdj:
            kdj = {k: self._norm_list(v, n) for k, v in (kdj or {}).items()}
        if not skip_boll:
            boll = {k: self._norm_list(v, n) for k, v in (boll or {}).items()}
        if not skip_cci:
            cci = self._norm_list(cci or [], n)
        if not skip_wr:
            wr = self._norm_list(wr or [], n)
        if not skip_dmi:
            dmi = {k: self._norm_list(v, n) for k, v in (dmi or {}).items()}
        if not skip_sar:
            sar = self._norm_list(sar or [], n)
        if not skip_obv:
            obv = self._norm_list(obv or [], n)
        if not skip_td:
            td = {k: self._norm_list(v, n) for k, v in (td or {}).items()}

        # 🚀 代码重构：提取指标字段映射配置，消除重复更新逻辑
        def get_indicator_field_configs():
            """获取所有指标的字段映射配置"""
            configs = []

            # EXPMA配置
            if not skip_expma:
                for p in self.expma_periods:
                    configs.append({
                        'source': expma_map.get(p, [None] * n),
                        'field': f'expma_{p}',
                        'type': 'float'
                    })

            # MA配置
            if not skip_ma:
                for p in self.ma_periods:
                    configs.append({
                        'source': ma_map.get(p, [None] * n),
                        'field': f'ma_{p}',
                        'type': 'float'
                    })

            # MACD配置
            if not skip_macd:
                macd_mappings = [("dif", "macd_dif"), ("dea", "macd_dea"), ("hist", "macd_histogram")]
                for k, col in macd_mappings:
                    configs.append({
                        'source': macd.get(k) or [None] * n,
                        'field': col,
                        'type': 'float'
                    })

            # RSI配置
            if not skip_rsi:
                rsi_mappings = [(6, "rsi_6"), (12, "rsi_12"), (24, "rsi_24")]
                for p, col in rsi_mappings:
                    configs.append({
                        'source': rsi_map.get(p) or [None] * n,
                        'field': col,
                        'type': 'float'
                    })

            # KDJ配置
            if not skip_kdj:
                kdj_mappings = [("k", "kdj_k"), ("d", "kdj_d"), ("j", "kdj_j")]
                for k, col in kdj_mappings:
                    configs.append({
                        'source': kdj.get(k) or [None] * n,
                        'field': col,
                        'type': 'float'
                    })

            # BOLL配置
            if not skip_boll:
                boll_mappings = [("upper", "boll_upper"), ("middle", "boll_middle"), ("lower", "boll_lower")]
                for k, col in boll_mappings:
                    configs.append({
                        'source': boll.get(k) or [None] * n,
                        'field': col,
                        'type': 'float'
                    })

            # 单值指标配置
            single_indicators = [
                (not skip_cci, cci, "cci_14", 'float'),
                (not skip_wr, wr, "wr_14", 'float'),
                (not skip_sar, sar, "sar", 'float'),
                (not skip_obv, obv, "obv", 'float')
            ]

            for condition, source, field, type_name in single_indicators:
                if condition:
                    configs.append({
                        'source': source,
                        'field': field,
                        'type': type_name
                    })

            # DMI配置
            if not skip_dmi:
                dmi_mappings = [("pdi", "pdi_14"), ("mdi", "mdi_14"), ("adx", "adx_14"), ("adxr", "adxr_14")]
                for k, col in dmi_mappings:
                    configs.append({
                        'source': dmi.get(k) or [None] * n,
                        'field': col,
                        'type': 'float'
                    })

            # TD配置（特殊处理）
            if not skip_td:
                configs.extend([
                    {
                        'source': td.get("setup") or [None] * n,
                        'field': 'td_setup',
                        'type': 'int'
                    },
                    {
                        'source': td.get("count") or [None] * n,
                        'field': 'td_count',
                        'type': 'int'
                    }
                ])

            return configs

        # 获取所有指标配置
        field_configs = get_indicator_field_configs()

        # 🔧 为每个字段计算增量更新起始下标：仅在最后一次已有值之后开始写入
        field_start_indices: Dict[str, int] = {}
        if force_sync:
            for config in field_configs:
                field_start_indices[config['field']] = 0
        else:
            for config in field_configs:
                field_name = config['field']
                start_idx = 0
                for i in range(n - 1, -1, -1):
                    if kline_sorted[i].get(field_name) is not None:
                        start_idx = i + 1
                        break
                field_start_indices[field_name] = start_idx

        # 计算全局起始下标：小于该位置的行不会有任何字段需要更新，直接跳过
        global_start_idx = 0
        if field_start_indices and not force_sync:
            global_start_idx = min(field_start_indices.values())

        updates: List[Dict[str, Any]] = []

        # 批量更新指标字段（统一处理逻辑，仅更新尾部缺失或变化的数据）
        for idx in range(global_start_idx, n):
            row = kline_sorted[idx]
            update_fields: Dict[str, Any] = {}

            # 🚀 统一字段更新逻辑：遍历所有配置，统一处理
            for config in field_configs:
                source = config['source']
                field = config['field']
                type_name = config['type']

                # 增量更新：在该字段最后一次已有值之后才开始写入
                start_idx = field_start_indices.get(field, 0)
                if idx < start_idx:
                    continue

                val = self._sanitize_val(source[idx] if isinstance(source, list) else source)

                # 不再比较新旧值，处于增量范围内的字段统一写入新值
                if val is not None:
                    if type_name == 'float':
                        update_fields[field] = float(val)
                    elif type_name == 'int':
                        update_fields[field] = int(val)
                    else:
                        update_fields[field] = val
                else:
                    # 需要显式清空旧值
                    update_fields[field] = None

            if update_fields:
                trade_date_str = row.get("trade_date")
                if trade_date_str:
                    updates.append({
                        "ts_code": code,
                        "period": period,
                        "trade_date": trade_date_str,
                        "year": int(trade_date_str[:4]),
                        "fields": update_fields
                    })

        return updates

    def _update_indicators_for_period(self, entity_type: str, entity_codes: List[str], period: str,
                                      force_sync: bool) -> int:
        if not entity_codes:
            return 0
        from app.constants.table_types import TableTypes
        table_type = TableTypes.entity_type_to_table_type(entity_type)
        if not table_type:
            return 0

        from threading import Lock
        from app.utils.concurrent_utils import process_concurrently
        import time

        # 进度统计
        start_time = time.time()
        total_codes = len(entity_codes)
        completed_codes = 0
        completed_codes_lock = Lock()
        updated_rows = 0
        updated_rows_lock = Lock()
        
        logger.info(
            f"开始更新{entity_type} {period}指标 | "
            f"总代码数: {total_codes}"
        )

        def process_code_batch(code_batch: List[str]) -> int:
            nonlocal completed_codes  # 声明使用外层变量
            local_updated = 0
            # 🚀 性能优化：使用标准连接池
            db: Session = next(get_db())

            # 优化：累积所有code的更新，然后分批执行（控制单次内存占用）
            all_batch_updates = []
            MAX_UPDATES_PER_FLUSH = 1000

            try:
                for code in code_batch:
                    try:
                        updates_for_code = self._build_indicator_updates_for_code(
                            code=code,
                            period=period,
                            table_type=table_type,
                            force_sync=force_sync,
                        )
                        if not updates_for_code:
                            continue

                        for update in updates_for_code:
                            all_batch_updates.append(update)
                            # 控制单批次内存占用：到达阈值即刷写到数据库
                            if len(all_batch_updates) >= MAX_UPDATES_PER_FLUSH:
                                local_updated += self._batch_upsert_indicators(db, table_type, all_batch_updates)
                                all_batch_updates.clear()

                    except Exception as e:
                        logger.error(f"处理代码 {code} 失败: {e}")
                    finally:
                        # 更新进度计数（无论成功或失败）
                        with completed_codes_lock:
                            completed_codes += 1

                        # 每10个代码或最后一个输出进度
                        if completed_codes % 10 == 0 or completed_codes == total_codes:
                            elapsed = time.time() - start_time
                            progress_pct = (completed_codes / total_codes * 100)
                            avg_time = elapsed / completed_codes
                            remaining_codes = total_codes - completed_codes
                            remaining_time = avg_time * remaining_codes

                            logger.info(
                                f"进度: {completed_codes}/{total_codes} ({progress_pct:.1f}%) | "
                                f"已耗时: {elapsed:.1f}秒 | "
                                f"预计剩余: {remaining_time:.1f}秒"
                            )

                # 优化：执行剩余未刷新的更新（可能不足一个阈值）
                if all_batch_updates:
                    local_updated += self._batch_upsert_indicators(db, table_type, all_batch_updates)

                return local_updated

            finally:
                # 🔧 修复连接泄漏：确保连接始终被关闭
                try:
                    db.close()
                except Exception as close_error:
                    logger.error(f"关闭数据库连接失败: {close_error}")

        # 分批处理代码，适当减小批次规模以降低单批内存占用
        batch_size = 50
        code_batches = [entity_codes[i:i + batch_size] for i in range(0, len(entity_codes), batch_size)]

        # 使用并发工具类处理，限制并发线程数以降低峰值内存
        max_workers = min(4, len(code_batches), (os.cpu_count() or 4))

        def process_with_lock(batch):
            nonlocal updated_rows
            result = process_code_batch(batch)
            with updated_rows_lock:
                updated_rows += result
            return result

        process_concurrently(
            code_batches,
            process_with_lock,
            max_workers=max_workers,
            error_handler=lambda batch, e: 0
        )
        
        # 输出最终统计
        total_duration = time.time() - start_time
        logger.info(
            f"✅ {entity_type} {period}指标更新完成 | "
            f"总代码数: {total_codes} | "
            f"更新行数: {updated_rows} | "
            f"总耗时: {total_duration:.2f}秒 | "
            f"平均每代码: {total_duration/total_codes:.3f}秒"
        )

        return updated_rows

    @staticmethod
    def _batch_upsert_indicators(db: Session, table_type: str, batch_updates: List[Dict[str, Any]]) -> int:
        """批量更新指标字段 - 优化版本（合并多字段更新）"""
        if not batch_updates:
            return 0

        # 按年份分组
        year_groups = {}
        for update in batch_updates:
            year = update["year"]
            if year not in year_groups:
                year_groups[year] = []
            year_groups[year].append(update)

        total_updated = 0

        for year, updates in year_groups.items():
            # 获取表模型
            table_model = TableFactory.get_table_model(table_type, year)
            if not table_model:
                continue

            table_name = table_model.__tablename__

            # 按 (ts_code, period, trade_date) 分组，合并所有字段
            record_groups = {}
            for update in updates:
                key = (update["ts_code"], update["period"], update["trade_date"])
                if key not in record_groups:
                    record_groups[key] = {}
                record_groups[key].update(update["fields"])

            # 收集所有需要更新的字段名（包括 None 值，用于清除旧数据）
            # 优化：同时记录哪些字段有非 None 值，用于后续优化 SQL 语句构建
            all_fields = set()
            field_has_value = {}  # 记录每个字段是否有非 None 值
            
            for fields in record_groups.values():
                for field_name, value in fields.items():
                    all_fields.add(field_name)
                    if value is not None:
                        field_has_value[field_name] = True

            if not all_fields:
                continue

            # 注意：保留所有字段（包括全为 None 的字段），因为 None 值可能用于清除旧数据
            # 但我们可以根据字段是否有值来优化 SQL 语句构建
            effective_fields = list(all_fields)

            # 分块处理，每批300条，减小单次 SQL 体积，降低内存压力
            chunk_size = 300
            records_list = list(record_groups.items())
            
            # 优化：批量事务提交，减少 commit 次数
            # 将同一年的所有 chunk 放在一个事务中，最后统一 commit
            try:
                for i in range(0, len(records_list), chunk_size):
                    chunk = records_list[i:i + chunk_size]
                    
                    # 为每个字段构建 CASE WHEN 语句
                    # 优化：统一使用参数绑定处理所有值（包括 None），SQLAlchemy 会自动将 None 转换为 NULL
                    field_updates = {}
                    where_parts = []
                    params = {}
                    
                    for j, ((ts_code, period, trade_date), fields) in enumerate(chunk):
                        # 优化：预先构建条件字符串，避免在每个字段循环中重复构建
                        condition = f"ts_code = :ts_code_{j} AND period = :period_{j} AND trade_date = :trade_date_{j}"
                        
                        # WHERE 条件（带括号用于 OR 组合）
                        where_parts.append(f"({condition})")
                        params[f"ts_code_{j}"] = ts_code
                        params[f"period_{j}"] = period
                        params[f"trade_date_{j}"] = trade_date
                        
                        # 为每个有效字段添加 CASE WHEN（统一使用参数绑定，包括 None 值）
                        for field_name in effective_fields:
                            value = fields.get(field_name)
                            
                            # 统一处理：所有值都使用参数绑定（SQLAlchemy 会将 None 自动转换为 NULL）
                            if field_name not in field_updates:
                                field_updates[field_name] = []
                            field_updates[field_name].append(
                                f"WHEN {condition} THEN :{field_name}_{j}"
                            )
                            params[f"{field_name}_{j}"] = value  # 可以是 None，SQLAlchemy 会正确处理

                    # 构建完整的 UPDATE 语句（一次更新所有字段）
                    set_clauses = []
                    for field_name in effective_fields:
                        if field_updates.get(field_name):
                            case_when = " ".join(field_updates[field_name])
                            set_clauses.append(f"`{field_name}` = CASE {case_when} ELSE `{field_name}` END")

                    if not set_clauses:
                        continue

                    where_clause = " OR ".join(where_parts)
                    set_clause = ", ".join(set_clauses)

                    # 执行更新
                    sql = text(f"""
                        UPDATE `{table_name}`
                        SET {set_clause}
                        WHERE {where_clause}
                    """)

                    result = db.execute(sql, params)
                    affected_rows = result.rowcount
                    total_updated += affected_rows

                # 优化：所有 chunk 完成后统一 commit，减少事务提交次数
                db.commit()
            except Exception as e:
                logger.error(f"批量更新指标字段失败（年份 {year}）: {e}")
                db.rollback()
                continue

        return total_updated


indicator_updater = TechnicalIndicatorUpdater()
