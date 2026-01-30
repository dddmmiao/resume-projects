# 后端架构总览

[← 返回开发者指南](../../DEVELOPER_GUIDE.md)

## 目录
1. [技术栈](#1-技术栈)
2. [目录结构](#2-目录结构)
3. [核心模块说明](#3-核心模块说明)
4. [文件清单](#4-文件清单)

---

## 1. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.9+ | 运行时 |
| FastAPI | 0.100+ | Web框架 |
| SQLAlchemy | 2.0+ | ORM |
| Pydantic | 2.0+ | 数据校验 |
| Loguru | 0.7+ | 日志 |
| Redis | 6+ | 缓存/任务队列 |
| Tushare | 1.2+ | 金融数据源 |

---

## 2. 目录结构

```
backend/
├── main.py                 # 应用入口
├── requirements.txt        # Python依赖
├── .env                    # 环境配置
│
├── app/
│   ├── api/                # API路由层
│   ├── services/           # 服务层
│   ├── dao/                # 数据访问层
│   ├── models/             # 数据模型
│   ├── strategies/         # 策略引擎
│   ├── constants/          # 常量定义
│   └── utils/              # 工具函数
│
├── docs/                   # 文档
├── tests/                  # 测试
└── migrations/             # 数据库迁移
```

---

## 3. 核心模块说明

### 3.1 API层 (`app/api/`)

API路由层，负责HTTP请求处理、参数校验、响应封装。

| 模块 | 端点 | 功能 |
|------|------|------|
| `admin.py` | `/api/admin/*` | 数据同步、任务管理 |
| `stocks.py` | `/api/stocks/*` | 股票列表、详情、K线 |
| `convertible_bonds.py` | `/api/bonds/*` | 可转债数据 |
| `concepts.py` | `/api/concepts/*` | 概念板块 |
| `industries.py` | `/api/industries/*` | 行业板块 |
| `strategies.py` | `/api/strategies/*` | 策略执行、预设 |
| `strategy_history.py` | `/api/strategy-history/*` | 执行历史 |
| `favorites.py` | `/api/favorites/*` | 收藏功能 |
| `user.py` | `/api/user/*` | 用户认证 |
| `tasks.py` | `/api/tasks/*` | 任务状态 |
| `ths_login.py` | `/api/ths/*` | 同花顺登录 |
| `ths_accounts.py` | `/api/ths-accounts/*` | 同花顺账户 |
| `trade_calendar.py` | `/api/calendar/*` | 交易日历 |
| `statistics.py` | `/api/statistics/*` | 统计数据 |

### 3.2 服务层 (`app/services/`)

业务逻辑实现层，封装核心功能。

#### 3.2.1 核心服务 (`core/`)
| 模块 | 功能 |
|------|------|
| `redis_task_manager.py` | Redis任务队列管理 |
| `task_manager.py` | 任务状态管理 |
| `database.py` | 数据库连接池 |

#### 3.2.2 数据服务 (`data/`)
| 模块 | 功能 |
|------|------|
| `stock_service.py` | 股票基础数据服务 |
| `stock_kline_service.py` | 股票K线服务 |
| `convertible_bond_service.py` | 可转债服务 |
| `convertible_bond_kline_service.py` | 可转债K线服务 |
| `concept_service.py` | 概念板块服务 |
| `concept_kline_service.py` | 概念K线服务 |
| `industry_service.py` | 行业板块服务 |
| `industry_kline_service.py` | 行业K线服务 |
| `indicator_service.py` | 技术指标计算 |
| `trade_calendar_service.py` | 交易日历服务 |
| `hot_sync_service.py` | 热度数据同步 |
| `auction_data_processor.py` | 竞价数据处理 |
| `base_kline_service.py` | K线基类服务 |
| `kline_period_processor.py` | 周期转换 |
| `kline_query_service.py` | K线查询服务 |

#### 3.2.3 外部服务 (`external/`)
| 子目录 | 功能 |
|--------|------|
| `tushare/` | Tushare数据同步 |
| `ths/` | 同花顺接口集成 |

#### 3.2.4 管理服务 (`management/`)
| 模块 | 功能 |
|------|------|
| `strategy_registry.py` | 策略注册与执行 |
| `strategy_history_service.py` | 策略执行历史 |
| `strategy_preset_service.py` | 策略预设管理 |

#### 3.2.5 调度服务 (`scheduler/`)
| 模块 | 功能 |
|------|------|
| `scheduler.py` | Cron调度器 |
| `task_executor.py` | 任务执行器 |

#### 3.2.6 用户服务 (`user/`)
| 模块 | 功能 |
|------|------|
| `user_service.py` | 用户认证、权限 |

### 3.3 DAO层 (`app/dao/`)

数据访问对象层，封装数据库操作。

| 模块 | 功能 |
|------|------|
| `base_dao.py` | DAO基类 |
| `stock_dao.py` | 股票DAO |
| `stock_kline_dao.py` | 股票K线DAO |
| `convertible_bond_dao.py` | 可转债DAO |
| `convertible_bond_kline_dao.py` | 可转债K线DAO |
| `concept_dao.py` | 概念DAO |
| `concept_kline_dao.py` | 概念K线DAO |
| `industry_dao.py` | 行业DAO |
| `industry_kline_dao.py` | 行业K线DAO |
| `user_dao.py` | 用户DAO |
| `strategy_history_dao.py` | 策略历史DAO |
| `strategy_preset_dao.py` | 策略预设DAO |
| `ths_account_dao.py` | 同花顺账户DAO |
| `trade_calendar_dao.py` | 交易日历DAO |
| `invitation_code_dao.py` | 邀请码DAO |
| `query_utils.py` | 查询工具 |
| `kline_query_utils.py` | K线查询工具 |

### 3.4 模型层 (`app/models/`)

数据模型定义。

#### 3.4.1 实体模型 (`entities/`)
| 模型 | 对应表 |
|------|--------|
| `stock.py` | 股票基础信息 |
| `convertible_bond.py` | 可转债信息 |
| `concept.py` | 概念板块 |
| `industry.py` | 行业板块 |

#### 3.4.2 K线模型 (`klines/`)
| 模型 | 对应表 |
|------|--------|
| `stock_kline.py` | 股票K线 |
| `convertible_bond_kline.py` | 可转债K线 |
| `concept_kline.py` | 概念K线 |
| `industry_kline.py` | 行业K线 |

#### 3.4.3 管理模型 (`management/`)
| 模型 | 对应表 |
|------|--------|
| `user.py` | 用户信息 |
| `strategy_history.py` | 策略执行历史 |
| `strategy_preset.py` | 策略预设 |
| `ths_account.py` | 同花顺账户 |
| `invitation_code.py` | 邀请码 |

### 3.5 策略引擎 (`app/strategies/`)

策略筛选模块。

| 模块 | 功能 |
|------|------|
| `__init__.py` | 策略入口 |
| `auction_volume.py` | 量价趋势策略 |
| `expma_bury.py` | EXPMA策略 |
| `conditions/` | 条件模块目录 |
| `conditions/__init__.py` | 条件注册中心 |
| `conditions/volume.py` | 量条件 |
| `conditions/price.py` | 价条件 |
| `conditions/trend_m.py` | 趋势条件1 |
| `conditions/trend_cross.py` | 趋势条件2 |
| `conditions/trend_converge.py` | 趋势条件3 |

---

## 4. 文件清单

### 4.1 入口文件

| 文件 | 功能 |
|------|------|
| `main.py` | FastAPI应用入口，中间件配置，路由注册 |

### 4.2 配置文件

| 文件 | 功能 |
|------|------|
| `.env` | 当前环境配置 |
| `.env.example` | 配置示例 |
| `.env.development` | 开发环境配置 |
| `.env.production` | 生产环境配置 |
| `requirements.txt` | Python依赖 |
| `pytest.ini` | 测试配置 |

---

## 相关文档

- [**架构深度解析**](BACKEND_ARCHITECTURE.md) - 设计模式、核心实现、面试问答 ⭐
- [**外部服务集成**](INTEGRATIONS.md) - Tushare/同花顺/PushPlus集成详解 ⭐
- [API参考](API_REFERENCE.md) - 接口详细说明
- [数据库设计](DATABASE_DESIGN.md) - 表结构设计
- [服务层指南](SERVICES_GUIDE.md) - 服务实现详解
- [策略引擎](STRATEGIES_GUIDE.md) - 策略模块详解

[← 返回开发者指南](../../DEVELOPER_GUIDE.md)
