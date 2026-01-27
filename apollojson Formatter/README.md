# Apollo JSON Formatter

> Apollo配置中心JSON格式化增强插件

## 项目简介

这是一个Tampermonkey油猴脚本，用于增强Apollo配置中心的JSON配置编辑体验。在日常开发中，经常需要编辑Apollo中的JSON格式配置，但原生界面缺乏格式化功能，导致阅读和编辑困难。本插件解决了这一痛点。

## 功能特性

- **一键格式化**：将压缩的JSON配置转换为易读的缩进格式（4空格缩进）
- **一键压缩**：将格式化的JSON配置压缩为单行格式，节省存储空间
- **实时反馈**：使用Notyf库提供友好的操作结果提示
- **无缝集成**：自动在Apollo配置编辑弹窗中添加操作按钮

## 技术栈

| 技术 | 用途 |
|------|------|
| JavaScript (ES6+) | 核心逻辑实现 |
| Tampermonkey API | 油猴脚本框架 |
| waitForKeyElements | DOM元素加载监听 |
| Notyf | 轻量级通知库 |
| JSON API | 格式化和压缩处理 |

## 实现逻辑

### 1. 初始化流程

```
页面加载 → waitForKeyElements监听#itemModal → 弹窗出现 → 注入功能按钮
```

### 2. 核心功能实现

#### 格式化JSON
```javascript
// 解析JSON字符串
let jsonObject = JSON.parse(textArea.value);
// 使用4空格缩进格式化
textArea.value = JSON.stringify(jsonObject, null, 4);
// 触发input事件，确保Vue/Angular框架能检测到变化
dispatchInputEvent(textArea);
```

#### 压缩JSON
```javascript
// 解析JSON字符串
let jsonObject = JSON.parse(textArea.value);
// 压缩为单行（无缩进）
textArea.value = JSON.stringify(jsonObject);
```

### 3. 关键技术点

- **DOM监听**：使用`waitForKeyElements`库监听动态加载的弹窗元素
- **事件触发**：手动dispatch input事件，确保前端框架能检测到textarea值的变化
- **错误处理**：try-catch捕获JSON解析错误，提供友好的错误提示

## 使用方法

1. 安装Tampermonkey浏览器扩展
2. 创建新脚本，粘贴`apollo-json-formatter.user.js`内容
3. 访问Apollo配置中心，编辑配置项
4. 在编辑弹窗底部可看到"格式化"和"最小化"按钮

## 项目结构

```
apollojson verify/
├── apollo-json-formatter.user.js  # 主脚本文件
├── apollojson.gif                  # 功能演示动图
└── README.md                       # 项目说明文档
```

## 技术亮点

1. **轻量级实现**：仅150行代码实现完整功能
2. **无侵入式设计**：不修改原有页面逻辑，只添加增强功能
3. **框架兼容**：通过手动触发事件，兼容Vue/Angular等前端框架
4. **用户体验**：即时反馈操作结果，提升使用体验

## 作者

lvhaifeng
