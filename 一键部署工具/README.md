# DevOps Pipeline Helper (JustGo)

> DevOps平台增强插件 - 提供快速部署、分支收藏、项目直达、终端模拟等功能

## 项目简介

这是一个功能丰富的Tampermonkey油猴脚本，为DevOps平台提供多项增强功能。从一键部署到终端模拟，从分支收藏到项目直达，全方位提升DevOps使用效率。

## 功能特性

### 核心功能
- **快速部署**：一键执行流水线，无需繁琐的表单填写
- **批量部署**：支持添加多个部署任务到计划，按顺序自动执行
- **分支收藏**：收藏常用分支，快速切换，提升效率
- **项目直达**：卡片悬浮显示Apollo、Cat、Umelog、Dubbo等快捷链接
- **终端模拟**：基于WebSocket连接到K8s Pod，实现远程终端操作
- **项目管理**：支持项目卡片拖拽排序、隐藏不常用项目

### 辅助功能
- **智能缓存**：分支、流水线、任务数据本地缓存，加速加载
- **自动刷新**：部署后自动刷新页面状态
- **超时处理**：任务执行超时自动提醒

## 技术栈

| 技术 | 用途 |
|------|------|
| JavaScript (ES6+) | 核心逻辑实现 |
| Tampermonkey API | 油猴脚本框架 |
| jQuery 2.0 | DOM操作和UI交互 |
| jQuery UI | 拖拽和缩放功能 |
| xterm.js | 终端模拟器 |
| xterm-addon-fit | 终端自适应尺寸 |
| WebSocket | 终端实时通信 |
| localStorage | 本地数据持久化 |

## 实现逻辑

### 1. 架构设计

```
DevOps Pipeline Helper
├── 工作模式判断（pipline页/project页）
├── 快速部署模块
│   ├── 弹窗创建
│   ├── 下拉列表（项目/分支/commit/流水线/任务）
│   └── 部署执行
├── 批量部署模块
│   ├── 计划任务管理
│   ├── 顺序执行控制
│   └── 状态监控
├── 分支收藏模块
│   ├── FavoriteApps类
│   └── 标签管理
├── 项目直达模块
│   └── 快捷链接菜单
├── 终端模拟模块
│   ├── WebSocket连接
│   └── xterm渲染
└── 项目管理模块
    ├── 拖拽隐藏
    └── 顺序调整
```

### 2. 批量部署实现

```javascript
async function batchDeployHandler(targetSchedule) {
    for (const task of targetSchedule.deployTaskList) {
        // 检查当前任务状态
        const status = await checkJobStatus(task.configure_id);
        
        if (status === 'running') {
            // 等待当前任务完成
            await waitForCompletion(task);
        }
        
        // 执行下一个任务
        await deploy(task);
        
        // 从列表中移除已完成任务
        removeFromSchedule(task);
    }
}
```

### 3. 终端模拟实现

```javascript
function initTerminal(podName, wssUrl) {
    // 创建xterm终端实例
    const term = new Terminal({
        rendererType: 'canvas',
        rows: 30,
        cols: 80,
        theme: { foreground: '#FFFFFF', background: '#222222' }
    });
    
    // 建立WebSocket连接
    const socket = new WebSocket(wssUrl);
    
    // 接收服务器输出
    socket.onmessage = (event) => {
        term.write(event.data);
    };
    
    // 发送用户输入
    term.onData((data) => {
        socket.send(data);
    });
}
```

### 4. 智能缓存机制

```javascript
// 缓存配置
const branchCacheDuration = 20 * 60 * 1000;    // 分支：20分钟
const pipelineCacheDuration = 2 * 3600 * 1000; // 流水线：2小时
const projectsCacheDuration = 24 * 3600 * 1000; // 项目：24小时

function loadWithCache(cacheKey, fetchFn, duration) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < duration) {
            return Promise.resolve(data);
        }
    }
    return fetchFn().then(data => {
        localStorage.setItem(cacheKey, JSON.stringify({
            data, timestamp: Date.now()
        }));
        return data;
    });
}
```

### 5. 项目卡片拖拽

```javascript
// 拖拽到隐藏区域
element.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/html', element.outerHTML);
    element.classList.add('dragging');
});

element.addEventListener('drop', (e) => {
    const project = getProjectFromElement(e.target);
    project.hidden = true;
    saveToCache(project);
    element.style.display = 'none';
});
```

## 使用方法

1. 安装Tampermonkey浏览器扩展
2. 创建新脚本，粘贴`devops-pipeline-helper.user.js`内容
3. 访问DevOps平台
4. 点击右上角"Just Go!"按钮打开快速部署弹窗

## 项目结构

```
justgo/
├── devops-pipeline-helper.user.js  # 主脚本文件（约3000行）
└── README.md                        # 项目说明文档
```

## 直达链接配置

| 服务 | 说明 |
|------|------|
| Apollo | 配置中心 |
| Cat | 调用链监控 |
| Umelog | 日志平台 |
| Dubbo | 服务治理 |

支持的URL占位符：
- `{appName}` - 项目名称
- `{startTimestamp}` - 开始时间戳
- `{endTimestamp}` - 结束时间戳

## 技术亮点

1. **双工作模式**：自动识别页面类型，适配不同功能
2. **批量部署**：支持多任务顺序执行，自动等待和错误处理
3. **终端模拟**：完整的终端体验，支持拖拽、缩放
4. **智能缓存**：分级缓存策略，平衡实时性和性能
5. **项目管理**：拖拽隐藏、顺序调整，个性化工作区

## 代码规模

- 总代码量：约3000行
- 函数数量：50+
- 类定义：FavoriteApps

## 作者

lvhaifeng
