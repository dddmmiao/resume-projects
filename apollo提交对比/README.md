# Apollo Config Diff

> Apollo配置中心提交对比增强插件

## 项目简介

这是一个Tampermonkey油猴脚本，用于增强Apollo配置中心的配置提交体验。在提交配置修改时，原生界面只显示简单的变更信息，难以直观地看出具体修改了什么。本插件提供了详细的Diff对比功能，让配置变更一目了然。

## 功能特性

- **可视化Diff对比**：使用diff-match-patch库实现字符级别的差异对比
- **颜色高亮显示**：新增内容绿色高亮，删除内容红色标记
- **JSON格式化支持**：可选择在对比前将JSON格式化，便于查看结构化差异
- **一键对比**：在发布确认弹窗中添加对比按钮，一次性对比所有变更项
- **偏好记忆**：使用localStorage保存JSON格式化开关状态

## 技术栈

| 技术 | 用途 |
|------|------|
| JavaScript (ES6+) | 核心逻辑实现 |
| Tampermonkey API | 油猴脚本框架 |
| diff-match-patch | Google开源的文本差异对比库 |
| waitForKeyElements | DOM元素加载监听 |
| CSS3 | 差异高亮样式 |

## 实现逻辑

### 1. 核心Diff算法

使用Google的diff-match-patch库进行文本差异计算：

```javascript
// 创建diff实例
const dmp = new diff_match_patch();
// 计算差异
const diffs = dmp.diff_main(oldText, newText);
// 优化差异结果，提高可读性
dmp.diff_cleanupSemantic(diffs);
```

### 2. 差异类型处理

```javascript
diffs.forEach(([operation, text]) => {
    switch(operation) {
        case 0:  // 相同内容
            html += `<span>${escapeHtml(text)}</span>`;
            break;
        case -1: // 删除内容（红色背景）
            html += `<span class="diff-delete">${escapeHtml(text)}</span>`;
            break;
        case 1:  // 新增内容（绿色背景）
            html += `<span class="diff-insert">${escapeHtml(text)}</span>`;
            break;
    }
});
```

### 3. 页面集成流程

```
页面加载 → waitForKeyElements监听#releaseModal → 弹窗出现 → 注入"对比"按钮和JSON格式化开关
```

## 使用方法

1. 安装Tampermonkey浏览器扩展
2. 创建新脚本，粘贴`apollo-config-diff.user.js`内容
3. 在Apollo中修改配置并点击提交
4. 在发布确认弹窗中，勾选JSON格式化开关（可选）
5. 点击"对比"按钮，查看所有配置变更的差异高亮

## 项目结构

```
apollo提交对比/
├── apollo-config-diff.user.js  # 主脚本文件
├── apollo提交对比.gif           # 功能演示动图
└── README.md                    # 项目说明文档
```

## 技术亮点

1. **字符级Diff**：不同于行级对比，可以精确到字符级别的差异
2. **JSON智能格式化**：自动识别JSON内容，格式化后再对比，更易发现细微差异
3. **偏好持久化**：用户的JSON格式化开关状态自动保存
4. **原地渲染**：直接在配置表格中渲染差异，无需额外弹窗

## Diff效果示例

- 删除内容：<span style="background:#ffcccc">红色背景</span>
- 新增内容：<span style="background:#ccffcc">绿色背景</span>
- 相同内容：正常显示

## 作者

lvhaifeng
