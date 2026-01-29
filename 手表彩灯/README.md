# ⌚ WatchRGB - Apple Watch 专业彩色显示应用

![Platform](https://img.shields.io/badge/Platform-watchOS-blue)
![Swift](https://img.shields.io/badge/Swift-5.0+-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## 💡 项目简介

WatchRGB 是专为 Apple Watch 设计的专业视觉显示应用，将你的手表变成独特的 RGB 彩色屏幕。提供丰富的颜色选择和炫酷的呼吸动效，支持多种交互方式和精确的颜色调节，让你的手表成为个性化的彩色显示工具。

## ✨ 核心功能

### 🎨 显示模式

| 模式 | 说明 |
|------|------|
| **单色模式** | 纯净的单色显示，简约而优雅 |
| **呼吸效果** | 多种精美主题，颜色渐变过渡，如极光之焰、深海幻境、彩虹显示等 |

### 🌈 呼吸模式主题

- **暖色系** - 红、橙、黄、金色温暖渐变
- **冷色系** - 蓝、青、紫色清凉过渡
- **彩虹色系** - 红橙黄绿蓝紫全谱循环
- **森林色系** - 多层次绿色自然呼吸
- **海洋色系** - 蓝色系深邃海洋效果
- **日落色系** - 橙红金粉浪漫渐变
- **霓虹色系** - 荧光色彩赛博朋克风
- **粉彩色系** - 柔和马卡龙色调
- **单色渐变** - 黑白灰经典过渡
- **星际之梦** - 深空紫神秘星云
- **紫薇星宫** - 紫蓝玫瑰梦幻组合
- **翡翠秘境** - 翡翠祖母绿自然感
- **白金传说** - 银灰珍珠高级质感
- **幻影迷雾** - 暗灰幽紫神秘氛围
- **极光幻舞** - 北极光多彩变幻
- **水晶圣殿** - 宝石色彩璀璨夺目
- **自定义色系** - 用户自定义颜色序列

### 🎛️ 颜色选择器

| 选择器 | 功能 |
|--------|------|
| **专业色轮** | 精确调节色相、饱和度和亮度 |
| **RGB 调色器** | 数字化精准颜色控制，支持RGB/HEX格式 |
| **表情选择器** | 有趣的颜色表情符号快速选择 |

### 🔧 实用工具

- **坏点检测** - 专业屏幕检测功能，确保显示质量

## 🎮 智能交互

| 手势/操作 | 功能 |
|-----------|------|
| **数字表冠** | 旋转调节显示亮度/饱和度 |
| **左右滑动** | 切换显示颜色 |
| **摇晃手表** | 随机选择颜色 |
| **双击屏幕** | 打开颜色编辑器 |
| **长按屏幕** | 切换显示模式 |
| **单击空白处** | 显示/隐藏控制按钮 |

## 💎 高级功能（会员专享）

- 多种呼吸效果主题
- 自定义呼吸颜色序列
- RGB/HEX 颜色格式显示
- 摇晃灵敏度调节
- 呼吸速度调节
- 无限制颜色创作

## ⚙️ 技术栈

| 技术 | 用途 |
|------|------|
| Swift 5+ | 核心开发语言 |
| SwiftUI | 声明式UI框架 |
| WatchKit | Apple Watch 原生框架 |
| CoreMotion | 摇晃手势检测 |
| StoreKit 2 | 应用内购买 |
| Combine | 响应式编程 |

## 📁 项目结构

```
watchRGB Watch App/
├── Application/
│   └── watchRGBApp.swift          # 应用入口
├── Config/
│   └── GlobalConfig.swift         # 全局配置（颜色、间距、动画等）
├── Handlers/
│   ├── CrownRotationHandler.swift # 数字表冠处理
│   ├── GestureHandlers.swift      # 手势处理
│   ├── InteractionHandlers.swift  # 交互处理
│   ├── NotificationHandlers.swift # 通知处理
│   ├── ShakeGestureHandler.swift  # 摇晃手势
│   └── ShakeHandler.swift         # 摇晃检测
├── Managers/
│   ├── BatteryMonitor.swift       # 电量监控
│   ├── BreathingTimeLimitManager.swift # 呼吸模式时间限制
│   ├── BrightnessManager.swift    # 亮度管理
│   ├── DisplayModeManager.swift   # 显示模式管理
│   ├── MembershipManager.swift    # 会员管理
│   ├── StoreKitManager.swift      # 内购管理
│   └── TutorialManager.swift      # 引导管理
├── Models/
│   ├── ColorModels.swift          # 颜色模型
│   ├── ColorSelectorMode.swift    # 选择器模式
│   └── DisplayModes.swift         # 显示模式（17种呼吸主题）
├── Utils/
│   ├── ColorFormatter.swift       # 颜色格式化
│   └── ColorUtilities.swift       # 颜色工具
├── Views/
│   ├── ColorSelectors/
│   │   ├── ColorSelectorContainerView.swift # 选择器容器
│   │   ├── ColorWheel.swift       # 色轮视图
│   │   ├── EmojiColorSelector.swift # 表情选择器
│   │   └── RGBInputView.swift     # RGB输入视图
│   ├── Components/
│   │   ├── ButtonViews.swift      # 按钮组件
│   │   └── CapsuleToast.swift     # 胶囊提示
│   ├── Main/
│   │   └── ContentView.swift      # 主视图（1800+行）
│   └── Settings/
│       ├── OptimalSettingsGuideView.swift # 最佳设置引导
│       ├── SettingsView.swift     # 设置视图
│       └── TutorialReplayView.swift # 教程重播
└── Resources/
    └── Localizable.strings        # 多语言支持
```

## 🌍 多语言支持

- 🇨🇳 中文（简体）
- 🇺🇸 English
- 🇯🇵 日本語
- 🇩🇪 Deutsch
- 🇪🇸 Español
- 🇫🇷 Français
- 🇰🇷 한국어

## 🛡️ 安全特性

- **光敏性癫痫保护** - 高速呼吸模式警告提示
- **智能硬件保护** - 电量监控，低电量自动提醒
- **流畅动画优化** - 专为 Apple Watch 优化，低功耗设计

## 🎯 技术亮点

1. **模块化架构** - Handler/Manager/View 分层设计，职责清晰
2. **响应式状态管理** - 使用 @StateObject、@EnvironmentObject 实现状态共享
3. **手势系统** - 支持滑动、点击、双击、长按、摇晃等多种交互
4. **数字表冠集成** - 精确的表冠旋转控制，支持触觉反馈
5. **StoreKit 2 集成** - 现代化的应用内购买实现
6. **多设备适配** - 自动适配不同尺寸的 Apple Watch
7. **国际化支持** - 7种语言本地化

## 📊 代码规模

- **Swift 文件**: 30+
- **主视图代码**: 1800+ 行
- **呼吸主题**: 17 种预设
- **预设颜色**: 16 种

## 📱 系统要求

- watchOS 10.0+
- Apple Watch Series 4 及以上

## 📄 许可证

MIT License
