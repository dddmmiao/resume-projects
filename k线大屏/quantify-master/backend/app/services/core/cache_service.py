"""
缓存服务 - 用于优化K线数据同步性能
"""

import json
import os
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Dict, Any, List

import redis
from loguru import logger

from config.config import settings


class DateTimeEncoder(json.JSONEncoder):
    """自定义JSON编码器，处理datetime和Decimal类型"""

    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            # 将 Decimal 安全转换为浮点数（或使用 str(obj) 如需保持精度）
            try:
                return float(obj)
            except Exception:
                return str(obj)
        return super().default(obj)


class CacheService:
    """缓存服务类"""

    def __init__(self):
        """初始化Redis连接"""
        self.redis_client = None
        self._memory_cache = {}
        self._cache_enabled = self._is_cache_enabled()
        self._init_redis()

    def _is_cache_enabled(self) -> bool:
        """检查缓存是否启用"""
        # 支持环境变量和配置文件两种方式
        env_enabled = os.getenv('FEATURE_CACHE_ENABLED', '').lower()
        if env_enabled in ('true', '1', 'yes', 'on'):
            return True
        elif env_enabled in ('false', '0', 'no', 'off'):
            return False

        # 从配置文件读取
        return getattr(settings, 'FEATURE_CACHE_ENABLED', True)

    def is_cache_enabled(self) -> bool:
        """检查缓存是否启用"""
        return self._cache_enabled

    def enable_cache(self):
        """启用缓存"""
        self._cache_enabled = True
        logger.info("缓存已启用")

    def disable_cache(self):
        """禁用缓存"""
        self._cache_enabled = False
        logger.info("缓存已禁用")

    def _init_redis(self):
        """初始化Redis连接"""
        try:
            # 尝试连接Redis
            if hasattr(settings, "REDIS_URL") and settings.REDIS_URL:
                self.redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            else:
                self.redis_client = redis.Redis(
                    host=getattr(settings, "REDIS_HOST", "localhost"),
                    port=getattr(settings, "REDIS_PORT", 6379),
                    db=getattr(settings, "REDIS_DB", 0),
                    password=getattr(settings, "REDIS_PASSWORD", None),
                    decode_responses=True,
                )

            # 测试连接
            self.redis_client.ping()
            logger.info("Redis缓存服务初始化成功")

        except Exception as e:
            logger.warning(f"Redis连接失败，将使用内存缓存: {e}")
            self.redis_client = None
            # 使用内存缓存作为备选方案
            self._memory_cache = {}

    # ========== 通用 JSON 缓存读写（无 TTL） ==========
    def get_json(self, key: str) -> Optional[Any]:
        if not self._cache_enabled:
            return None

        try:
            if self.redis_client:
                raw = self.redis_client.get(key)
                result = json.loads(raw) if raw else None
                return result
            else:
                result = self._memory_cache.get(key)
                return result
        except Exception as e:
            logger.warning(f"get_json 失败 {key}: {e}")
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int = 86400) -> None:
        if not self._cache_enabled:
            return

        try:
            data = json.dumps(value, cls=DateTimeEncoder)
            if self.redis_client:
                if ttl_seconds > 0:
                    # 设置带TTL的键
                    self.redis_client.setex(key, ttl_seconds, data)
                else:
                    # TTL为0表示永不过期，使用set命令
                    self.redis_client.set(key, data)
            else:
                self._memory_cache[key] = value
        except Exception as e:
            logger.warning(f"set_json 失败 {key}: {e}")
            pass

    def exists(self, key: str) -> bool:
        """检查key是否存在"""
        if not self._cache_enabled:
            return False

        try:
            if self.redis_client:
                return bool(self.redis_client.exists(key))
            else:
                return key in self._memory_cache
        except Exception as e:
            logger.warning(f"exists 检查失败 {key}: {e}")
            return False

    def set_nx(self, key: str, value: Any, ttl_seconds: int = 86400) -> bool:
        """原子性地设置key（仅当key不存在时）
        
        使用Redis的SET NX EX原子命令，解决并发环境下的竞态条件问题。
        
        Args:
            key: 缓存键
            value: 缓存值
            ttl_seconds: 过期时间（秒）
            
        Returns:
            True: 设置成功（key之前不存在）
            False: 设置失败（key已存在或缓存禁用）
        """
        if not self._cache_enabled or not self.redis_client:
            return False

        try:
            data = json.dumps(value, cls=DateTimeEncoder)
            result = self.redis_client.set(key, data, nx=True, ex=ttl_seconds)
            return result is True
        except Exception as e:
            logger.warning(f"set_nx 失败 {key}: {e}")
            return False

    def delete(self, key: str) -> int:
        """删除单个 key，返回删除数量。"""
        if not self._cache_enabled:
            return 0

        try:
            if self.redis_client:
                # redis-py 在 key 不存在时返回 0
                deleted = self.redis_client.delete(key)
                return int(deleted or 0)
            else:
                existed = key in self._memory_cache
                self._memory_cache.pop(key, None)
                return 1 if existed else 0
        except Exception as e:
            logger.warning(f"delete 失败 {key}: {e}")
            return 0

    def delete_keys_by_patterns(self, patterns: List[str]) -> int:
        """按多个模式删除，返回删除 key 数量（Redis 下为估计值）。"""
        if not self._cache_enabled:
            return 0

        deleted = 0
        try:
            if self.redis_client:
                for pattern in patterns:
                    # 使用 SCAN + pipeline 分批删除，避免 KEYS 阻塞
                    cursor = 0
                    while True:
                        cursor, keys = self.redis_client.scan(cursor=cursor, match=pattern, count=1000)
                        if keys:
                            pipe = self.redis_client.pipeline()
                            for k in keys:
                                pipe.delete(k)
                            pipe.execute()
                            deleted += len(keys)
                        if cursor == 0:
                            break
            else:
                to_delete: List[str] = []
                for pattern in patterns:
                    frag = pattern.replace("*", "")
                    to_delete.extend([k for k in list(self._memory_cache.keys()) if frag in k])
                for k in set(to_delete):
                    self._memory_cache.pop(k, None)
                deleted = len(set(to_delete))

        except Exception as e:
            logger.warning(f"delete_keys_by_patterns 失败: {e}")
            pass
        return deleted

    # ========== 高层 Key 生成（CacheKeys）与失效 API ==========
    class Keys:
        NS = ""

        @classmethod
        def list_pattern(cls, entity: str) -> str:
            return f"{entity}:list*"

        @classmethod
        def detail(cls, entity: str, code: str) -> str:
            return f"{entity}:detail:{code}"

        @classmethod
        def detail_pattern(cls, entity: str) -> str:
            return f"{entity}:detail:*"

        @classmethod
        def members(cls, entity: str, owner: str) -> str:
            return f"{entity}:members:{owner}"

        @classmethod
        def members_pattern(cls, entity: str) -> str:
            return f"{entity}:members:*"

        @classmethod
        def all_ts_codes_key(cls) -> str:
            return "stocks:all_ts_codes:v1"

        @classmethod
        def all_bond_codes_key(cls) -> str:
            return "bonds:all_ts_codes:v1"

        @classmethod
        def all_concept_codes_key(cls) -> str:
            return "concepts:all_ts_codes:v1"

        @classmethod
        def all_industry_codes_key(cls) -> str:
            return "industries:all_ts_codes:v1"
        
        @classmethod
        def kline_latest_dates_key(cls, table_type: str, codes_hash: str, periods_hash: str) -> str:
            """K线最新日期缓存键"""
            return f"klines:latest_dates:{table_type}:{codes_hash}:{periods_hash}"
        
        @classmethod
        def kline_latest_dates_pattern(cls, table_type: str = "*") -> str:
            """K线最新日期缓存模式"""
            return f"klines:latest_dates:{table_type}:*"

    def invalidate_stock_cache(self) -> int:
        patterns = [
            self.Keys.list_pattern("stocks"),
            self.Keys.detail_pattern("stocks"),
        ]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_bond_cache(self) -> int:
        patterns = [
            self.Keys.list_pattern("bonds"),
            self.Keys.detail_pattern("bonds"),
            "bonds:mappings:*",  # 统一双向映射缓存（可转债-股票）
        ]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_concept_cache(self) -> int:
        patterns = [
            self.Keys.list_pattern("concepts"),
            self.Keys.detail_pattern("concepts"),
            self.Keys.members_pattern("concepts"),
            "concepts:members_of_stock:*",  # 逐条缓存：每个股票的概念列表
            "concepts:all_ts_codes:*",  # 全部概念代码缓存
        ]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_industry_cache(self) -> int:
        patterns = [
            self.Keys.list_pattern("industries"),
            self.Keys.detail_pattern("industries"),
            self.Keys.members_pattern("industries"),
            "industries:members_of_stock:*",  # 逐条缓存：每个股票的行业列表
            "industries:all_ts_codes:*",  # 全部行业代码缓存
        ]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_bond_call_cache(self) -> int:
        """粗粒度失效：按前缀清理可转债赎回信息缓存（列表与详情）。"""
        patterns = [
            self.Keys.list_pattern("bond_calls"),
            self.Keys.detail_pattern("bond_calls"),
        ]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_all_stock_codes(self) -> int:
        """删除候选股票集合缓存。"""
        return self.delete_keys_by_patterns([self.Keys.all_ts_codes_key()])

    def invalidate_all_bond_codes(self) -> int:
        """删除候选可转债集合缓存。"""
        return self.delete_keys_by_patterns([self.Keys.all_bond_codes_key()])

    def invalidate_all_concept_codes(self) -> int:
        """删除候选概念集合缓存。"""
        return self.delete_keys_by_patterns([self.Keys.all_concept_codes_key()])

    def invalidate_all_industry_codes(self) -> int:
        """删除候选行业集合缓存。"""
        return self.delete_keys_by_patterns([self.Keys.all_industry_codes_key()])

    # ========== K线缓存失效 ==========
    def _invalidate_klines_for_codes(self, entity_type: str, period: str, ts_codes: List[str]) -> int:
        """
        通用方法：按代码+周期删除K线缓存
        🚀 代码重构：消除重复代码，提高可维护性
        
        Args:
            entity_type: 实体类型 (stock/bond/concept/industry)
            period: 周期
            ts_codes: 代码列表
            
        Returns:
            删除的缓存键数量
        """
        codes = list(set(ts_codes or []))
        if not codes:
            return 0
        patterns = [f"klines:{entity_type}:{period}:{code}" for code in codes]
        return self.delete_keys_by_patterns(patterns)

    def invalidate_stock_klines_for_codes(self, period: str, ts_codes: List[str]) -> int:
        """精细化失效：按代码+周期删除股票K线缓存。"""
        return self._invalidate_klines_for_codes("stock", period, ts_codes)

    def invalidate_bond_klines_for_codes(self, period: str, ts_codes: List[str]) -> int:
        """精细化失效：按代码+周期删除可转债K线缓存。"""
        return self._invalidate_klines_for_codes("bond", period, ts_codes)

    def invalidate_concept_klines_for_codes(self, period: str, ts_codes: List[str]) -> int:
        """精细化失效：按代码+周期删除概念K线缓存。"""
        return self._invalidate_klines_for_codes("concept", period, ts_codes)

    def invalidate_industry_klines_for_codes(self, period: str, ts_codes: List[str]) -> int:
        """精细化失效：按代码+周期删除行业K线缓存。"""
        return self._invalidate_klines_for_codes("industry", period, ts_codes)
    
    def invalidate_kline_latest_dates(self, table_type: str = None) -> int:
        """失效K线最新日期缓存"""
        if table_type:
            patterns = [self.Keys.kline_latest_dates_pattern(table_type)]
        else:
            patterns = [self.Keys.kline_latest_dates_pattern()]
        return self.delete_keys_by_patterns(patterns)


# 全局缓存服务实例
cache_service = CacheService()

# ===== 服务层通用读穿透缓存装饰器（仅服务层使用） =====
from functools import wraps as _wraps
from typing import Callable as _Callable


def service_cached(prefix: str, key_fn: _Callable[..., str], ttl_seconds: int = 86400):
    """
    服务层读穿透缓存装饰器。

    Args:
        prefix: 缓存键前缀（例如 "stocks:detail"、"concepts:members_of_stock"）
        key_fn: 从函数参数生成子键的函数，返回字符串，如 ts_code/period 等
        ttl_seconds: 缓存 TTL，默认 86400 秒
    """

    def decorator(func):
        @_wraps(func)
        def wrapper(*args, **kwargs):
            # 缓存开关
            if not cache_service.is_cache_enabled():
                return func(*args, **kwargs)
            try:
                suffix = key_fn(*args, **kwargs)
                # 若返回空后缀，则视为不参与缓存（允许调用方通过返回空字符串来显式跳过缓存）
                if not suffix:
                    return func(*args, **kwargs)
                # 当 prefix 为空时不加冒号分隔符
                key = f"{prefix}:{suffix}" if prefix else suffix
                cached = cache_service.get_json(key)
                if cached is not None:
                    # 当缓存存在但为空集合/对象时，尝试回源一次以修复“空缓存卡死”问题
                    if (isinstance(cached, list) and len(cached) == 0) or (
                            isinstance(cached, dict) and len(cached) == 0):
                        refreshed = func(*args, **kwargs)
                        if refreshed is not None and not (isinstance(refreshed, (list, dict)) and len(refreshed) == 0):
                            cache_service.set_json(key, refreshed, ttl_seconds)
                            return refreshed
                        return cached
                    return cached
                result = func(*args, **kwargs)
                if result is not None:
                    cache_service.set_json(key, result, ttl_seconds)
                return result
            except Exception:
                # 任意异常直接回源
                return func(*args, **kwargs)

        return wrapper

    return decorator
