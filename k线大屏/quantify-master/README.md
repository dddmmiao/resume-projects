# Quantify - 量化交易分析系统

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.9+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/Ant%20Design-5.x-1890FF.svg" alt="Ant Design">
</p>

## 📋 项目简介

**Quantify** 是一个功能完整的量化交易分析系统，提供股票、可转债、概念板块、行业板块等金融数据的同步、分析和可视化功能。系统采用前后端分离架构，支持多维度数据筛选、策略推送、实时K线图表等功能。

### 核心特性

| 特性 | 描述 |
|------|------|
| 🎯 **多标的支持** | 股票、可转债、概念板块、行业板块全覆盖 |
| 📊 **专业K线图表** | 基于lightweight-charts，支持EXPMA、MACD等技术指标 |
| 🔍 **智能策略筛选** | 量价趋势策略，支持多条件组合筛选 |
| 📱 **响应式设计** | 完美适配PC端和移动端 |
| 🔄 **自动数据同步** | 定时任务自动同步Tushare数据 |
| 👥 **多用户支持** | 用户认证、权限管理、收藏功能 |
| 📤 **同花顺推送** | 支持将筛选结果推送至同花顺自选股 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户端                                   │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   PC Web端       │    │   移动端          │                  │
│  │  (React + Antd)  │    │  (响应式适配)     │                  │
│  └────────┬─────────┘    └────────┬─────────┘                   │
└───────────┼───────────────────────┼─────────────────────────────┘
            │                       │
            ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI 后端服务                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  API路由层   │  │  服务层     │  │  策略引擎   │              │
│  │ (15个模块)  │  │ (80+服务)   │  │ (条件组合)  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │              数据访问层 (DAO)                    │            │
│  │    SQLAlchemy ORM + 查询优化 + 缓存机制          │            │
│  └─────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
            │                       │
            ▼                       ▼
┌─────────────────────┐    ┌─────────────────────┐
│    SQLite/PostgreSQL │    │    Redis 缓存       │
│    (持久化存储)       │    │   (会话/任务状态)   │
└─────────────────────┘    └─────────────────────┘
            │
            ▼
┌─────────────────────┐
│    Tushare API      │
│   (金融数据源)       │
└─────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Ant Design 5 + lightweight-charts |
| **后端** | Python 3.9 + FastAPI + SQLAlchemy + Pydantic |
| **数据库** | SQLite (开发) / PostgreSQL (生产) |
| **缓存** | Redis (可选) |
| **数据源** | Tushare Pro API |
| **认证** | JWT Token |

---

## 🚀 快速开始

### 环境要求
- Python 3.9+
- Node.js 16+
- Redis (可选，用于缓存和任务管理)

### 1. 克隆项目
```bash
git clone https://github.com/yourusername/quantify.git
cd quantify
```

### 2. 启动后端
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # 编辑配置
python main.py
```

### 3. 启动前端
```bash
cd frontend
npm install
npm start
```

### 4. 访问应用
- **前端界面**: http://localhost:3000
- **API文档**: http://localhost:8000/docs
- **管理后台**: http://localhost:3000/admin

---

## 📖 功能详解

### 面向普通用户

#### 1. 数据看板 (Dashboard)
- **股票/可转债/概念/行业** 四大数据类型切换
- **实时排序**: 按涨跌幅、成交量、换手率等排序
- **筛选过滤**: 按板块、市值、ST状态等筛选
- **收藏功能**: 自定义收藏分组

#### 2. K线图表
- **专业图表**: 支持日线/周线/月线切换
- **技术指标**: EXPMA、MACD、成交量
- **绘图工具**: 趋势线、水平线等
- **全屏模式**: 沉浸式分析体验

#### 3. 策略筛选
- **量条件**: 竞价量、高开量、首爆量等多数据源
- **价条件**: 振幅筛选、涨停筛选
- **趋势条件**: 均线多头/空头、EXPMA偏离、趋势收敛

#### 4. 回放日历
- **历史回放**: 选择历史日期查看当日数据
- **交易日标记**: 自动标记交易日/非交易日

### 面向管理员

#### 1. 数据同步管理
- **Tushare同步**: 股票、可转债、概念、行业数据
- **K线同步**: 日线、周线、月线历史数据
- **增量/全量**: 支持增量同步和全量重建

#### 2. 定时任务
- **Cron调度**: 灵活的定时任务配置
- **任务监控**: 实时查看任务状态和进度
- **取消机制**: 支持取消运行中的任务

#### 3. 用户管理
- **邀请码**: 通过邀请码注册新用户
- **权限控制**: 管理员/普通用户角色区分

#### 4. 策略推送
- **同花顺推送**: 将筛选结果推送至同花顺自选股
- **排序策略**: 按概念热度、行业热度等排序

---

## 📁 项目结构

```
quantify/
├── README.md                 # 项目说明（本文件）
├── ARCHITECTURE.md           # 系统架构详解
├── USER_GUIDE.md             # 用户使用指南
├── DEVELOPER_GUIDE.md        # 开发者指南
│
├── backend/                  # 后端服务
│   ├── main.py               # 应用入口
│   ├── app/
│   │   ├── api/              # API路由 (15个模块)
│   │   ├── services/         # 业务逻辑 (80+服务)
│   │   ├── dao/              # 数据访问 (32个模块)
│   │   ├── models/           # 数据模型 (26个)
│   │   ├── strategies/       # 策略引擎
│   │   └── utils/            # 工具函数
│   └── docs/                 # 后端文档
│
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── pages/            # 页面组件 (9个)
│   │   ├── components/       # UI组件 (45+)
│   │   ├── hooks/            # 自定义Hooks (19个)
│   │   ├── stores/           # 状态管理
│   │   └── utils/            # 工具函数
│   └── docs/                 # 前端文档
│
└── scripts/                  # 运维脚本
    ├── restart_project.sh    # 重启脚本
    └── stop_project.sh       # 停止脚本
```

---

## 📚 文档目录

| 文档 | 描述 |
|------|------|
| [系统架构](ARCHITECTURE.md) | 技术架构、设计模式、核心流程 |
| [用户指南](USER_GUIDE.md) | 功能使用说明（普通用户+管理员） |
| [开发者指南](DEVELOPER_GUIDE.md) | 开发环境、代码规范、贡献指南 |
| [后端文档](backend/docs/) | API参考、数据库设计、服务层 |
| [前端文档](frontend/docs/) | 组件文档、页面结构、Hooks |

---

## 🔧 配置说明

### 环境变量 (.env)

```env
# Tushare配置
TUSHARE_TOKEN=your_tushare_token_here

# 数据库配置
DATABASE_URL=sqlite:///./quantify.db

# Redis配置（可选）
REDIS_URL=redis://localhost:6379/0

# JWT密钥
JWT_SECRET_KEY=your_secret_key_here

# 同花顺配置（可选）
THS_COOKIE=your_ths_cookie
```

---

## 🎯 技术亮点

### 1. 策略条件组合引擎
- 支持任意条件组合（AND/OR）
- 独立的条件模块注册机制
- 条件结果缓存优化

### 2. 异步任务处理
- Redis任务队列管理
- 实时进度推送
- 优雅的取消机制

### 3. 响应式设计
- 移动端专属组件
- 触摸手势支持
- 自适应布局

### 4. 高性能K线渲染
- lightweight-charts图表库
- 增量数据更新
- 自定义图层扩展

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

---

## 📞 联系方式

- **问题反馈**: 通过GitHub Issues提交
- **功能建议**: 通过GitHub Discussions讨论

---

**最后更新**: 2026-01-30  
**版本**: v2.0.0
