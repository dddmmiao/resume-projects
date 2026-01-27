# DevOps值班提醒插件

> 智能值班提醒工具，确保不错过任何值班安排

## 项目简介

这是一个Tampermonkey油猴脚本，用于在DevOps平台自动检测并提醒用户即将到来的值班安排。通过多种提醒方式和智能的数据刷新机制，确保用户不会错过任何值班任务。

## 功能特性

- **多时间段提醒**：支持提前1天、当天等多种提醒时机
- **多提醒模式**：弹窗强提醒 + 快捷查看方式，双重保障
- **智能刷新**：缓存值班信息，过期自动更新，进入日报页面强刷新数据
- **可配置化**：支持自定义提醒时间、启用/禁用各种提醒方式
- **持久化存储**：使用localStorage保存用户设置和提醒状态

## 技术栈

| 技术 | 用途 |
|------|------|
| JavaScript (ES6+) | 核心逻辑实现 |
| Tampermonkey API | 油猴脚本框架(GM_setValue/GM_getValue等) |
| localStorage | 本地数据持久化 |
| CSS3动画 | slideIn/slideUp动画提升用户体验 |

## 实现逻辑

### 1. 架构设计

采用配置对象+工具函数的模块化设计：

```
DutyReminderPlugin
├── CONFIG              # 配置对象（提醒类型、存储键名、API配置）
├── Utils               # 工具函数（日期处理、工作日判断）
├── DutyDataManager     # 值班数据管理（API调用、缓存管理）
├── ReminderManager     # 提醒管理（触发条件、弹窗显示）
└── SettingsPanel       # 设置面板（用户配置界面）
```

### 2. 智能缓存机制

每日（按自然日0:00-0:00计算）最多调用一次API：

```javascript
// 检查两个时间戳是否在不同的自然日
isDifferentDay(timestamp1, timestamp2) {
    if (!timestamp1 || !timestamp2) return true;
    const dateStr1 = this.getLocalDateString(new Date(timestamp1));
    const dateStr2 = this.getLocalDateString(new Date(timestamp2));
    return dateStr1 !== dateStr2;
}
```

### 3. 提醒模式

支持两种提醒模式：

```javascript
REMINDER_TYPES: {
    DAILY: 'daily',      // 每日提醒：在值班日之前的每一天都会提醒
    WORKDAY: 'workday'   // 上一个工作日提醒：只在值班日前的最后一个工作日提醒
}
```

### 4. 日期格式化

将值班日期格式化为易读格式：

```javascript
// 显示为"今天"、"明天"、"后天"、"周x"、"下周x"等
// 按周一到周日计算一周
```

## 使用方法

1. 安装Tampermonkey浏览器扩展
2. 创建新脚本，粘贴`duty-reminder.user.js`内容
3. 访问DevOps平台，插件自动开始工作
4. 点击右下角设置按钮可自定义提醒选项

## 项目结构

```
值班提醒/
├── duty-reminder.user.js  # 主脚本文件
├── 值班提醒.gif            # 功能演示动图
└── README.md               # 项目说明文档
```

## 配置选项

| 配置项 | 说明 |
|--------|------|
| 提醒模式 | 每日提醒 / 上一个工作日提醒 |

## 技术亮点

1. **智能缓存**：每日最多调用一次API，避免频繁请求
2. **防重复提醒**：每日只显示一次提醒弹窗
3. **特定页面豁免**：访问/devops/daily/页面时无视日期限制，强制检查
4. **易读日期**：将值班日期格式化为“今天”、“明天”、“周x”等
5. **工作日计算**：自动识别周末，支持“上一个工作日”提醒模式

## 作者

lvhaifeng
