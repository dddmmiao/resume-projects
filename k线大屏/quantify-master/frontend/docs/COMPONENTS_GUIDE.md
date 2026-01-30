# 组件文档

[← 返回前端总览](FRONTEND_OVERVIEW.md)

## 1. 核心组件

### 1.1 KLineChart - K线图表

**路径**: `components/KLineChart.tsx`

基于 `lightweight-charts` 的专业K线图表组件。

**Props**:
```typescript
interface KLineChartProps {
  tsCode: string;              // 股票/债券代码
  entityType: string;          // 实体类型
  period: 'daily' | 'weekly' | 'monthly';
  onDataLoaded?: (data: KLineData[]) => void;
  showExpma?: boolean;
  showMacd?: boolean;
  showVolume?: boolean;
}
```

**功能**:
- K线主图层
- 技术指标叠加 (EXPMA, MACD)
- 成交量柱状图
- 十字线交互
- 缩放和拖拽

### 1.2 KLineDataDisplay - 数据展示

**路径**: `components/KLineDataDisplay.tsx`

K线卡片网格展示组件，支持分页和排序。

**Props**:
```typescript
interface KLineDataDisplayProps {
  entityType: string;
  period: string;
  tradeDate: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  pageSize: number;
  filterConcept?: string;
  filterIndustry?: string;
}
```

### 1.3 StrategyConfigModal - 策略配置

**路径**: `components/StrategyConfigModal.tsx`  
**路径**: `strategies/AuctionVolumeConfig.tsx`

策略参数配置弹窗，包含三个Tab：
1. **参数配置** - 策略参数输入
2. **预设管理** - 保存/加载预设
3. **执行历史** - 查看历史结果

---

## 2. 卡片组件

### 2.1 KLineCard

**路径**: `components/KLineCard.tsx`

单个K线卡片容器。

```tsx
<KLineCard
  tsCode="000001.SZ"
  name="平安银行"
  period="daily"
  entityType="stock"
  onFavorite={handleFavorite}
  onFullscreen={handleFullscreen}
/>
```

### 2.2 KLineCardHeader

**路径**: `components/KLineCardHeader.tsx`

卡片头部，显示代码、名称、涨跌幅。

### 2.3 KLineCardActions

**路径**: `components/KLineCardActions.tsx`

卡片操作按钮：收藏、全屏、绘图等。

### 2.4 FullscreenKLineCard

**路径**: `components/FullscreenKLineCard.tsx`

全屏K线展示组件。

---

## 3. 功能组件

### 3.1 GlobalControls

**路径**: `components/GlobalControls.tsx`

全局控制栏，包含：
- 数据类型切换
- 排序选项
- 筛选按钮
- 日期选择

### 3.2 TradingCalendar

**路径**: `components/TradingCalendar.tsx`

交易日历组件，支持：
- 交易日/非交易日标记
- 日期选择回调
- 月份导航

### 3.3 UserMenu

**路径**: `components/UserMenu.tsx`

用户菜单下拉，包含：
- 用户信息
- 收藏管理
- 设置
- 登出

### 3.4 SearchSelect

**路径**: `components/SearchSelect.tsx`

带搜索的下拉选择组件。

---

## 4. 管理组件 (`components/admin/`)

### 4.1 DataSyncPanel

数据同步面板，触发Tushare数据同步。

### 4.2 SchedulerPanel

调度器面板，管理定时任务。

### 4.3 StrategyPushConfig

策略推送配置，设置同花顺推送参数。

### 4.4 UserManagement

用户管理，邀请码生成。

---

## 5. 移动端组件 (`components/mobile/`)

### 5.1 BottomDrawer

底部抽屉组件，用于移动端详情展示。

### 5.2 SwipeableList

滑动列表，支持左右滑动手势。

### 5.3 MobileKLineCard

移动端K线卡片，优化触摸体验。

### 5.4 MobileControls

移动端控制栏。

---

## 6. 图表图层 (`components/chart-layers/`)

### 6.1 ExpmaLayer

EXPMA均线图层，支持8条均线 (A1-A4, B1-B4)。

### 6.2 MacdLayer

MACD指标图层，显示DIF、DEA、柱状图。

### 6.3 VolumeLayer

成交量图层，红涨绿跌。

### 6.4 DrawingLayer

绘图工具图层：
- 趋势线
- 水平线
- 垂直线

### 6.5 CrosshairLayer

十字线图层，显示当前价格信息。

---

## 7. 组件间通信

### 7.1 Props传递
父子组件通过Props传递数据和回调。

### 7.2 Context
全局状态通过React Context共享。

### 7.3 自定义事件
复杂交互通过自定义事件系统。

---

[← 返回前端总览](FRONTEND_OVERVIEW.md)
