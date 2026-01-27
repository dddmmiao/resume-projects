# 周报助手

> 智能周报生成工具，一键汇总日报内容

## 项目简介

这是一个Tampermonkey油猴脚本，用于自动收集日报内容并智能生成周报。支持AI汇总功能，可以自动合并去重相似任务，让周报编写效率提升数倍。

## 功能特性

- **自动采集**：一键获取本周所有日报内容
- **AI汇总**：集成智谱AI，智能合并去重相似任务
- **流式输出**：支持打字机效果的流式响应，实时显示生成进度
- **Thinking模式**：可视化展示AI的思考过程
- **灵活配置**：支持自定义API地址、模型和系统提示词
- **工作项同步**：自动复制关联的工作项到周报

## 技术栈

| 技术 | 用途 |
|------|------|
| JavaScript (ES6+) | 核心逻辑实现 |
| Tampermonkey API | 油猴脚本框架 |
| 智谱AI API | AI内容汇总 |
| Server-Sent Events | 流式响应处理 |
| Notyf | 轻量级通知库 |
| localStorage | 配置持久化 |

## 实现逻辑

### 1. 数据采集流程

```
获取当前周信息 → 遍历本周日期 → 请求每日日报API → 提取【今日总结】内容 → 汇总整理
```

### 2. AI汇总实现

#### 流式响应处理
```javascript
async function aiSummarizeReports(dailySummaries, useStream = true) {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'glm-4.5-Flash',
            messages: [...],
            stream: true  // 启用流式响应
        })
    });
    
    // 使用SSE处理流式数据
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // 解析并显示增量内容
        appendContent(parseSSEData(value));
    }
}
```

#### Thinking模式
```javascript
// 智谱AI的thinking模式可以展示推理过程
requestBody.extra_body = {
    thinking: {
        type: "enabled",
        budget_tokens: 2000
    }
};
```

### 3. 内容提取算法

```javascript
function extractSectionContent(content, sectionTitle) {
    // 使用正则匹配章节标题
    const titlePattern = new RegExp(`<p>\\s*${sectionTitle}\\s*</p>`, 'g');
    const match = titlePattern.exec(content);
    
    if (!match) return null;
    
    // 提取到下一个章节或结尾
    const startIndex = match.index + match[0].length;
    const nextSection = content.indexOf('<p>【', startIndex);
    const endIndex = nextSection === -1 ? content.length : nextSection;
    
    return content.substring(startIndex, endIndex);
}
```

### 4. 打字机效果实现

```javascript
function typeWriter(text, element, speed = 30) {
    let index = 0;
    const timer = setInterval(() => {
        if (index < text.length) {
            element.innerHTML += text.charAt(index);
            index++;
        } else {
            clearInterval(timer);
        }
    }, speed);
}
```

## 使用方法

1. 安装Tampermonkey浏览器扩展
2. 创建新脚本，粘贴`weekly-report-helper.user.js`内容
3. 访问日报页面，点击"我的周报"标签
4. 点击编辑按钮，会出现"填充"、"AI汇总"、"AI配置"按钮
5. 点击"填充"开始自动收集日报并生成周报

## 项目结构

```
周报助手/
├── weekly-report-helper.user.js  # 主脚本文件
├── 周报助手.gif                   # 功能演示动图
└── README.md                      # 项目说明文档
```

## AI配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API地址 | AI服务接口地址 | 智谱AI官方接口 |
| API密钥 | 认证密钥 | 需用户配置 |
| 模型 | 使用的AI模型 | glm-4.5-Flash |
| 流式响应 | 是否使用流式输出 | 开启 |
| Thinking模式 | 展示AI思考过程 | 开启 |
| 系统提示词 | AI行为指导 | 内置优化提示词 |

## 技术亮点

1. **流式响应**：使用SSE实现打字机效果，提升用户体验
2. **智能去重**：AI自动识别相似任务并合并，避免重复内容
3. **HTML保持**：汇总结果保持原有HTML格式，无需二次编辑
4. **错误恢复**：API失败时自动降级为简单拼接模式

## 系统提示词优化

```
将日报汇总为周报。规则：
1. 保留所有内容，不省略
2. 使用原HTML格式
3. 按任务合并同标题内容
4. 相同任务去重，只保留最新进度
5. 直接输出HTML，无说明文字
```

## 作者

lvhaifeng
