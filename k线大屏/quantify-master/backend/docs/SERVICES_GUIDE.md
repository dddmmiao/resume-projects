# 服务层指南

[← 返回后端总览](BACKEND_OVERVIEW.md)

## 服务层架构

服务层是业务逻辑的核心实现层，位于 API 层和 DAO 层之间。

```
API Layer  →  Service Layer  →  DAO Layer  →  Database
                   ↓
            External Services (Tushare, THS)
```

---

## 1. 核心服务 (`app/services/core/`)

### 1.1 Redis任务管理 (`redis_task_manager.py`)

管理异步任务的状态和进度。

```python
from app.services.core.redis_task_manager import redis_task_manager

# 创建任务
task_id = redis_task_manager.create_task("sync_stocks")

# 更新进度
redis_task_manager.update_task_progress(task_id, 50, "处理中...")

# 检查取消
if redis_task_manager.is_task_cancelled(task_id):
    raise CancellationException("任务已取消")
```

**任务状态**:
- `PENDING` - 等待执行
- `RUNNING` - 执行中
- `COMPLETED` - 完成
- `FAILED` - 失败
- `CANCELLED` - 已取消

### 1.2 数据库连接 (`database.py`)

```python
from app.core.database import get_db

with get_db() as db:
    result = db.query(Stock).all()
```

---

## 2. 数据服务 (`app/services/data/`)

### 2.1 股票服务 (`stock_service.py`)

```python
from app.services.data.stock_service import stock_service

# 获取所有股票代码
codes = stock_service.get_all_ts_codes_cached()

# 按流通市值筛选
codes = stock_service.get_ts_codes_by_circ_mv_range(
    min_cap=50,   # 50亿以上
    max_cap=200,  # 200亿以下
    trade_date="20240101"
)

# 获取ST股票
st_codes = stock_service.get_st_stock_codes()
```

### 2.2 K线服务 (`stock_kline_service.py`)

```python
from app.services.data.stock_kline_service import stock_kline_service

# 批量获取K线数据
klines = stock_kline_service.batch_get_stock_indicators_cached(
    ts_codes=["000001.SZ", "000002.SZ"],
    period="daily",
    limit=20,
    end_date="20240101"
)
```

### 2.3 概念服务 (`concept_service.py`)

```python
from app.services.data.concept_service import concept_service

# 获取概念成分股
codes = concept_service.get_ts_codes_by_concept_codes(["BK0001", "BK0002"])

# 获取股票所属概念
concepts = concept_service.get_concepts_by_ts_code("000001.SZ")
```

### 2.4 指标计算服务 (`indicator_service.py`)

```python
from app.services.data.indicator_service import indicator_service

# 计算EXPMA
expma = indicator_service.calculate_expma(close_prices, period=12)

# 计算MACD
dif, dea, macd = indicator_service.calculate_macd(close_prices)
```

---

## 3. 外部服务 (`app/services/external/`)

### 3.1 Tushare同步 (`tushare/`)

```python
from app.services.external.tushare.stock_sync import sync_stock_basic

# 同步股票基础数据
await sync_stock_basic()

# 同步K线数据
await sync_stock_daily_kline(start_date="20240101")
```

### 3.2 同花顺服务 (`ths/`)

```python
from app.services.external.ths.ths_service import ths_service

# 获取登录二维码
qr_data = await ths_service.get_login_qr()

# 推送自选股
await ths_service.push_stocks(account_id, codes, group_name)
```

---

## 4. 管理服务 (`app/services/management/`)

### 4.1 策略注册中心 (`strategy_registry.py`)

策略执行的核心入口。

```python
from app.services.management.strategy_registry import strategy_registry

# 执行策略
result = await strategy_registry.execute_strategy_async(
    task_id="xxx",
    strategy_name="auction_volume",
    context={
        "entity_type": "stock",
        "enable_volume": True,
        "window_n": 5,
        ...
    }
)
```

**核心方法**:
- `execute_strategy_async()` - 异步执行策略
- `_get_candidate_codes()` - 获取候选代码
- `_apply_data_filters()` - 应用数据筛选

### 4.2 策略历史服务 (`strategy_history_service.py`)

```python
from app.services.management.strategy_history_service import strategy_history_service

# 创建历史记录
strategy_history_service.create_history(
    task_id=task_id,
    user_id=user_id,
    strategy_name="auction_volume",
    context=context,
    ...
)

# 更新状态
strategy_history_service.update_history_status(
    task_id=task_id,
    status="success",
    selected_codes=codes
)
```

---

## 5. 调度服务 (`app/services/scheduler/`)

### 5.1 Cron调度器 (`scheduler.py`)

```python
from app.services.scheduler.scheduler import scheduler

# 添加定时任务
scheduler.add_job(
    job_id="daily_sync",
    cron_expr="0 18 * * 1-5",
    func=sync_daily_data
)

# 启动/停止
scheduler.start()
scheduler.stop()
```

---

## 6. 服务设计原则

### 6.1 单例模式
所有服务使用模块级单例：
```python
class StockService:
    pass

stock_service = StockService()  # 模块级单例
```

### 6.2 缓存策略
使用 `functools.lru_cache` 或 Redis 缓存：
```python
@lru_cache(maxsize=1000)
def get_stock_info(ts_code: str) -> dict:
    pass
```

### 6.3 日志规范
使用 loguru 记录日志：
```python
from loguru import logger

logger.info(f"获取数据: {len(codes)} 条")
logger.warning(f"数据为空: {ts_code}")
logger.error(f"查询失败: {e}")
```

---

[← 返回后端总览](BACKEND_OVERVIEW.md)
