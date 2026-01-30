# 自定义Hooks文档

[← 返回前端总览](FRONTEND_OVERVIEW.md)

## Hooks清单

| Hook | 功能 | 返回值 |
|------|------|--------|
| `useChartInstance` | 图表实例管理 | chart实例, 控制方法 |
| `useKLineData` | K线数据获取 | data, loading, error |
| `useTaskProgress` | 任务进度监听 | progress, status |
| `useSchedulerTasks` | 调度器任务 | tasks, refresh |
| `useMobileDetection` | 移动端检测 | isMobile |
| `useThsPush` | 同花顺推送 | push, status |
| `useSyncStatus` | 同步状态 | status, lastSync |
| `usePerCodeConfig` | 单个代码配置 | config, setConfig |

---

## 核心Hooks详解

### 1. useChartInstance

管理 `lightweight-charts` 图表实例。

```typescript
const { 
  chartRef, 
  candleSeries, 
  volumeSeries,
  setChartData,
  resetChart 
} = useChartInstance(containerRef);

// 使用
setChartData(klineData);
```

**功能**:
- 创建/销毁图表实例
- 管理数据系列
- 处理resize
- 图层管理

### 2. useKLineData

获取K线数据。

```typescript
const { data, loading, error, refetch } = useKLineData({
  tsCode: '000001.SZ',
  period: 'daily',
  limit: 100,
  endDate: '20240101'
});
```

**功能**:
- 自动获取数据
- 缓存管理
- 错误处理
- 刷新机制

### 3. useTaskProgress

监听任务进度。

```typescript
const { progress, status, message } = useTaskProgress(taskId);

// progress: 0-100
// status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
// message: 当前状态描述
```

**实现**:
使用轮询或WebSocket监听任务状态更新。

### 4. useSchedulerTasks

管理调度器任务。

```typescript
const { tasks, loading, refresh, toggleTask, runTask } = useSchedulerTasks();

// 启用/禁用任务
toggleTask(taskId, enabled);

// 手动执行
runTask(taskId);
```

### 5. useMobileDetection

检测移动端设备。

```typescript
const { isMobile, isTablet, isDesktop } = useMobileDetection();

// 根据设备类型渲染
if (isMobile) {
  return <MobileDashboard />;
}
return <Dashboard />;
```

**判断依据**:
- 屏幕宽度
- User-Agent
- 触摸支持

### 6. useThsPush

同花顺推送功能。

```typescript
const { push, pushing, error } = useThsPush();

// 推送股票
await push({
  accountId: 'xxx',
  codes: ['000001.SZ', '000002.SZ'],
  groupName: '策略选股'
});
```

### 7. useSyncStatus

数据同步状态。

```typescript
const { status, lastSync, refresh } = useSyncStatus();

// status: 各类型数据的同步状态
// lastSync: 最后同步时间
```

### 8. usePerCodeConfig

单个代码的配置管理。

```typescript
const { config, setConfig } = usePerCodeConfig(tsCode);

// config: { showExpma: true, showMacd: false, ... }
// 配置保存在localStorage
```

---

## 其他Hooks

### useBodyScrollLock
锁定body滚动（用于Modal/Drawer）。

```typescript
useBodyScrollLock(isOpen);
```

### useDetailPanelState
详情面板展开状态。

```typescript
const { isOpen, open, close, toggle, selectedCode } = useDetailPanelState();
```

### useThemeHotkey
主题快捷键绑定。

```typescript
useThemeHotkey('Ctrl+D', toggleDarkMode);
```

### useMiniKlinesCache
迷你K线图缓存。

```typescript
const { getCache, setCache, clearCache } = useMiniKlinesCache();
```

### useToastExtractor
从API响应提取Toast消息。

```typescript
const { extractAndShow } = useToastExtractor();
extractAndShow(response);
```

---

## Hooks使用规范

### 1. 命名规范
- 以 `use` 开头
- 采用 camelCase

### 2. 返回值规范
```typescript
// 对象形式
return { data, loading, error, refetch };

// 数组形式（少用）
return [value, setValue];
```

### 3. 依赖管理
```typescript
useEffect(() => {
  // 副作用
}, [dep1, dep2]); // 显式声明依赖
```

### 4. 清理函数
```typescript
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe();
}, []);
```

---

[← 返回前端总览](FRONTEND_OVERVIEW.md)
