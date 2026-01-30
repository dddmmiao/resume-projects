# 前端架构总览

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
| React | 18.x | UI框架 |
| TypeScript | 5.x | 类型系统 |
| Ant Design | 5.x | UI组件库 |
| lightweight-charts | 4.x | K线图表 |
| React Router | 6.x | 路由 |
| CSS Modules | - | 样式隔离 |

---

## 2. 目录结构

```
frontend/src/
├── App.tsx                 # 应用入口，路由配置
├── index.tsx               # React DOM渲染
├── index.css               # 全局样式
│
├── pages/                  # 页面组件 (9个)
├── components/             # UI组件 (45+ + 子目录)
├── hooks/                  # 自定义Hooks (19个)
├── stores/                 # 状态管理
├── strategies/             # 策略配置UI
├── types/                  # TypeScript类型
├── utils/                  # 工具函数
├── services/               # API服务封装
└── shared/                 # 共享资源
```

---

## 3. 核心模块说明

### 3.1 页面组件 (`pages/`)

| 文件 | 功能 |
|------|------|
| `Dashboard.tsx` | PC端主看板页面 |
| `MobileDashboard.tsx` | 移动端主看板 |
| `AdminPanel.tsx` | 管理后台 |
| `Login.tsx` | 登录/注册页 |
| `Relogin.tsx` | 同花顺重登录 |
| `NotFound.tsx` | 404页面 |

### 3.2 UI组件 (`components/`)

#### 核心组件
| 组件 | 功能 | 代码行数 |
|------|------|----------|
| `KLineChart.tsx` | K线图表核心 | ~32000 |
| `KLineDataDisplay.tsx` | 数据展示列表 | ~77000 |
| `StrategyConfigModal.tsx` | 策略配置弹窗 | ~38000 |
| `StockStatsModal.tsx` | 股票统计弹窗 | ~53000 |

#### 卡片组件
| 组件 | 功能 |
|------|------|
| `KLineCard.tsx` | K线卡片容器 |
| `KLineCardHeader.tsx` | 卡片头部 |
| `KLineCardActions.tsx` | 卡片操作按钮 |
| `KLineCardControls.tsx` | 卡片控制栏 |
| `FullscreenKLineCard.tsx` | 全屏K线卡片 |

#### 功能组件
| 组件 | 功能 |
|------|------|
| `GlobalControls.tsx` | 全局控制栏 |
| `TradingCalendar.tsx` | 交易日历 |
| `UserMenu.tsx` | 用户菜单 |
| `SearchSelect.tsx` | 搜索选择 |
| `FavoriteGroupsModal.tsx` | 收藏分组管理 |

#### 子目录
| 目录 | 组件数 | 功能 |
|------|--------|------|
| `admin/` | 7 | 管理组件 |
| `mobile/` | 57 | 移动端组件 |
| `chart-layers/` | 24 | 图表图层 |
| `StockStatsModal/` | 9 | 统计弹窗子组件 |

### 3.3 自定义Hooks (`hooks/`)

| Hook | 功能 |
|------|------|
| `useChartInstance.ts` | 图表实例管理 |
| `useKLineData.ts` | K线数据获取 |
| `useTaskProgress.ts` | 任务进度监听 |
| `useSchedulerTasks.ts` | 调度器任务 |
| `useMobileDetection.ts` | 移动端检测 |
| `useThsPush.ts` | 同花顺推送 |
| `useSyncStatus.ts` | 同步状态 |
| `useSystemMonitor.ts` | 系统监控 |
| `usePerCodeConfig.ts` | 单个代码配置 |
| `useMiniKlinesCache.ts` | 迷你K线缓存 |
| `useBodyScrollLock.ts` | 滚动锁定 |
| `useDetailPanelState.ts` | 详情面板状态 |
| `useThemeHotkey.ts` | 主题快捷键 |
| `useToastExtractor.ts` | Toast提取 |

### 3.4 策略配置 (`strategies/`)

| 文件 | 功能 |
|------|------|
| `AuctionVolumeConfig.tsx` | 量价趋势策略配置UI |
| `useStrategiesMeta.ts` | 策略元数据Hook |

### 3.5 工具函数 (`utils/`)

| 文件 | 功能 |
|------|------|
| `authFetch.ts` | 认证请求封装 |
| `formatters.ts` | 数据格式化 |
| `dateUtils.ts` | 日期工具 |
| `chartUtils.ts` | 图表工具 |
| `colorUtils.ts` | 颜色工具 |

### 3.6 类型定义 (`types/`)

| 文件 | 功能 |
|------|------|
| `stock.ts` | 股票类型 |
| `kline.ts` | K线类型 |
| `strategy.ts` | 策略类型 |
| `common.ts` | 通用类型 |

---

## 4. 文件清单

### 4.1 入口文件

| 文件 | 功能 |
|------|------|
| `index.tsx` | React DOM渲染，Provider配置 |
| `App.tsx` | 路由配置，布局 |

### 4.2 样式文件

| 文件 | 功能 |
|------|------|
| `index.css` | 全局样式，CSS变量 |
| `App.css` | App级样式 |
| `Dashboard.css` | 看板样式 |
| `TradingCalendar.css` | 日历样式 |
| `FavoriteDropdown.css` | 收藏下拉样式 |
| `KLineCardChart.css` | K线卡片样式 |

### 4.3 配置文件

| 文件 | 功能 |
|------|------|
| `package.json` | NPM配置，依赖 |
| `tsconfig.json` | TypeScript配置 |
| `.eslintrc.js` | ESLint配置 |

---

## 相关文档

- [**架构深度解析**](FRONTEND_ARCHITECTURE.md) - 设计模式、K线实现、面试问答 ⭐
- [组件文档](COMPONENTS_GUIDE.md) - 组件详细说明
- [页面文档](PAGES_GUIDE.md) - 页面结构和路由
- [Hooks文档](HOOKS_GUIDE.md) - 自定义Hooks详解

[← 返回开发者指南](../../DEVELOPER_GUIDE.md)
