# 🎭 CyberBugOff

<p align="center">
  <img src="CyberBugOff Watch App/Assets.xcassets/AppIcon.appiconset/appicon.png" width="180" alt="CyberBugOff App Icon"/>
</p>

<p align="center">
  <strong>手腕上的互动音效 Emoji</strong><br/>
  点击 · 摇晃 · 旋转表冠 — 释放专属于你的视听反馈
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-watchOS%2010.0+-blue.svg" alt="Platform"/>
  <img src="https://img.shields.io/badge/Swift-5.9+-orange.svg" alt="Swift"/>
  <img src="https://img.shields.io/badge/License-Personal%20Use-green.svg" alt="License"/>
</p>

---

## 🌟 产品愿景

**CyberBugOff** 不是一个简单的"敲木鱼"应用。

它是一个 **高度可定制的图音合成玩具**，让你在 Apple Watch 上创造个性化的互动体验。每一次点击、每一次摇晃、每一次表冠旋转，都会触发你精心配置的视觉与听觉反馈——就像在手腕上养了一只会回应你的 Emoji 宠物。

无论是解压放松、趣味社交，还是创意表达，CyberBugOff 都能满足你的需求。

---

## ✨ 核心特色

### 🎯 三种触发方式
| 触发方式 | 描述 | 适用场景 |
|---------|------|---------|
| **点击 (Tap)** | 轻触屏幕触发 | 精准控制，适合安静环境 |
| **摇晃 (Shake)** | 抖动手腕触发（可调灵敏度） | 解压发泄，运动中使用 |
| **表冠 (Crown)** | 旋转 Digital Crown 触发 | 低调操作，会议中摸鱼 |

### 🎨 图音合成系统
- **自定义图片**：从相册导入你喜欢的图片/Emoji
- **专属音效配置**：为每张图片绑定独立的音效序列
- **智能播放模式**：顺序播放、随机播放、单曲循环、回溯播放

### 💬 趣味反馈引擎
- **累计计数**：记录每张图片的总点击次数（功德 +1！）
- **随机提示**：100+ 条趣味文案随机触发
- **自定义显示**：设置专属文字、Emoji 或图片作为反馈

### ⚡ 极致性能优化
- 针对 watchOS 深度优化，冷启动 < 1 秒
- 智能内存管理，长时间使用不卡顿
- 后台音效预热，触发响应毫秒级

---

## 🎬 使用指南

### 第一步：选择你的 Emoji/图片

启动应用后，你会看到图片网格视图。可以选择：
- **预设图片**：内置精选图片（如可爱黑猫 `blackcat`）
- **自定义图片**：点击右上角 `+` 从相册导入

### 第二步：配置专属音效

点击图片缩略图的设置图标，进入音效配置：

| 配置项 | 说明 |
|-------|------|
| **单选音效** | 指定一个固定音效 |
| **多选音效** | 配置音效序列（支持多种播放模式） |
| **音量/速率** | 调整播放音量和速度 |
| **内置音效库** | 50+ 精选音效，从经典木鱼到网络热梗 |

### 第三步：选择触发方式

在图片设置中配置触发模式：

```
┌─────────────────────────────────────┐
│  触发方式设置                        │
├─────────────────────────────────────┤
│  ○ 点击触发                          │
│  ○ 摇晃触发 ───────── 灵敏度: ■■■□□  │
│  ○ 表冠触发 ───────── 间隔: 0.2s     │
│  ○ 自动触发 ───────── 频率: 1.0s     │
└─────────────────────────────────────┘
```

### 第四步：享受互动体验

点击图片进入全屏互动模式：
- 根据你设置的触发方式操作
- 观看动画反馈和累计计数
- 享受你专属的图音合成体验！

---

## 📱 内置音效库

CyberBugOff 内置 **50+ 精选音效**，涵盖多种风格：

| 分类 | 示例音效 |
|-----|---------|
| **经典国风** | 木鱼敲击、佛珠转动、古筝拨弦 |
| **趣味音效** | 气泡爆破、弹簧弹跳、卡通音效 |
| **网络热梗** | 奥利给、芜湖起飞、666 |
| **自然声音** | 雨滴、海浪、鸟鸣 |
| **电子音效** | 合成器音色、8-bit 游戏音 |
| **自定义** | 支持从音乐库导入、录音添加 |

---

## 🛠️ 高级功能

### 图片裁剪与缩放
- 支持传统矩形裁剪和自由圈选裁剪
- 独立调整图片缩放比例和显示偏移
- 实时预览裁剪效果

### 自定义反馈显示
```
┌─────────────────────────────────────┐
│  触发反馈设置                        │
├─────────────────────────────────────┤
│  显示类型:  ○ 文字  ○ Emoji  ○ 图片  │
│  自定义内容: [功德 +1____________]   │
│  显示颜色:  🔴 🟢 🔵 ⚪ 随机颜色      │
│  动画效果:  缩放 / 弹跳 / 渐隐        │
└─────────────────────────────────────┘
```

### 多模式管理
- 为同一张图片创建多个配置"模式"
- 一键切换不同的音效/触发组合
- 支持模式复制、重命名、删除

### 音效编辑
- 调整音量（0% - 200%）
- 调整播放速率（0.5x - 2.0x）
- 设置播放起止时间
- 批量管理音效列表

---

## 🎖️ 技术亮点（面试展示）

> 本项目展示了 watchOS 开发中的多项核心技术能力

### 📊 性能优化

| 优化项 | 技术方案 | 效果 |
|-------|---------|------|
| **图片内存优化** | `CGImageSourceCreateThumbnailAtIndex` 下采样 | 内存占用降低 82% |
| **启动速度优化** | 异步配置加载 + 音效懒加载预热 | 冷启动 < 1s |
| **视图切换优化** | ZStack + opacity 替代条件渲染 | 无重建延迟，丝滑切换 |
| **内存监控** | PerformanceMonitor + 阈值自动清理 | 防止 OOM 崩溃 |

### 🏛️ 架构设计

```
┌─────────────────────────────────────────────────────┐
│                   Presentation Layer                │
│   ImageModeView · SoundListView · SettingsView      │
└────────────────────────┬────────────────────────────┘
                         │ @EnvironmentObject
┌────────────────────────▼────────────────────────────┐
│               BugOffModel (Facade)                  │
│  协调 ImageManager / SoundManager / TriggerManager  │
└────────────────────────┬────────────────────────────┘
                         │ Delegation
┌────────────────────────▼────────────────────────────┐
│                   Service Layer                     │
│   AudioService · DataService · CacheManager         │
└─────────────────────────────────────────────────────┘
```

**设计模式应用**：
- **Facade Pattern**：BugOffModel 统一暴露接口，隐藏子系统复杂度
- **Manager Pattern**：功能职责分离，ImageManager / SoundManager / TriggerManager
- **ID-based Architecture**：SoundID/ImageID (UUID) 与显示名称解耦，支持重命名

### 🔧 核心技术栈

| 技术 | 应用场景 |
|-----|---------|
| **SwiftUI + Combine** | 响应式 UI + 状态管理 |
| **CoreMotion** | 摇晃触发检测（加速度阈值算法） |
| **AVFoundation** | 音效播放引擎、音频裁剪 |
| **ImageIO** | 高性能图片下采样 |
| **FileManager + UserDefaults** | 混合持久化策略 |
| **Swift Concurrency** | async/await 异步加载 |

### 💡 亮点功能实现

1. **音效回溯播放**：支持从上次暂停位置回退 N 秒继续播放
2. **自由圈选裁剪**：手指画圈选取图片区域，非矩形裁剪
3. **Mode Context 配置隔离**："另存为"功能，副本配置互不影响
4. **Digital Crown 集成**：表冠旋转触发 + 滚动控制

---

## 📐 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **watchOS** | 10.0+ | 11.0+ |
| **设备** | Apple Watch Series 4 | Series 7+ |
| **存储空间** | 50 MB | 100 MB |
| **配套 iOS** | iOS 17.0+ | iOS 18.0+ |

---

## 🏗️ 技术架构

### 项目结构

```
CyberBugOff/
├── CyberBugOff iOS/                    # iOS 配套应用（引导页）
│   ├── CyberBugOffApp.swift           # iOS 入口
│   ├── ContentView.swift              # 引导界面
│   └── Assets.xcassets/               # iOS 资源
│
├── CyberBugOff Watch App/              # watchOS 主应用
│   ├── CyberBugOffApp.swift           # watchOS 入口
│   │
│   ├── Core/                          # 核心业务层
│   │   ├── Config/
│   │   │   └── AppConfig.swift        # 全局配置常量
│   │   │
│   │   ├── Models/                    # 数据模型
│   │   │   ├── BugOffModel.swift      # 中央状态管理器
│   │   │   ├── ImageManager.swift     # 图片资源管理
│   │   │   ├── SoundManager.swift     # 音效序列管理
│   │   │   ├── TriggerManager.swift   # 触发反馈逻辑
│   │   │   └── DataModels.swift       # 数据结构定义
│   │   │
│   │   ├── Services/                  # 服务层
│   │   │   ├── AudioService.swift     # 音频播放引擎
│   │   │   ├── DataService.swift      # 数据持久化
│   │   │   └── PhotoSelectionService.swift
│   │   │
│   │   └── Utils/                     # 工具类
│   │       ├── CacheManager.swift     # 缓存管理
│   │       ├── ThumbnailGenerator.swift
│   │       └── Logger.swift           # 日志系统
│   │
│   ├── Features/                      # 功能模块
│   │   ├── ImageMode/                 # 图片网格与全屏视图
│   │   ├── Settings/                  # 图片/音效设置
│   │   ├── SoundList/                 # 音效选择列表
│   │   └── SoundEdit/                 # 音效编辑
│   │
│   ├── Shared/                        # 共享 UI 组件
│   │   └── Components/                # 可复用组件库
│   │
│   ├── Theme/                         # 主题系统
│   │   └── AppTheme.swift             # 颜色、字体、尺寸
│   │
│   ├── Resources/                     # 内置资源
│   │   ├── Sounds/                    # 50+ 内置音效
│   │   └── Images/                    # 预设图片
│   │
│   └── Assets.xcassets/               # 资源目录
│
├── CyberBugOff Watch AppTests/         # 单元测试
└── CyberBugOff Watch AppUITests/       # UI 测试
```

### 核心设计模式

#### 状态管理
```swift
// BugOffModel: 中央状态 Hub
class BugOffModel: ObservableObject {
    let imageManager = ImageManager()      // 图片管理
    let soundManager = SoundManager()      // 音效管理
    let triggerManager = TriggerManager()  // 触发管理
    
    @Published var currentImageName: String
    @Published var defaultImages: [String]
    // ...
}
```

#### Manager 分层架构
| Manager | 职责 |
|---------|-----|
| `ImageManager` | 图片文件管理、设置存取、裁剪处理 |
| `SoundManager` | 音效配置、播放序列、模式管理 |
| `TriggerManager` | 触发检测、反馈显示、计数统计 |

#### 性能优化策略
- **懒加载**：音效按需预热，避免启动卡顿
- **内存监控**：自动检测并清理超阈值缓存
- **视图优化**：ZStack + opacity 切换，避免视图重建
- **批量写入**：防抖合并 I/O 操作

---

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/yourusername/CyberBugOff.git
cd CyberBugOff
```

### 2. 打开 Xcode
```bash
open CyberBugOff.xcodeproj
```

### 3. 选择运行目标
- **Scheme**: `CyberBugOff Watch App`
- **Device**: Apple Watch 模拟器或真机

### 4. 运行
```bash
Cmd + R
```

---

## 📦 构建与发布

### 本地调试
```bash
# 使用 Watch Scheme 运行
xcodebuild -scheme "CyberBugOff Watch App" -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm)' build
```

### App Store 发布

1. **选择 iOS Scheme**（用于配对分发）
   ```
   Scheme: CyberBugOff
   Destination: Any iOS Device
   ```

2. **Archive**
   ```
   Product → Archive
   ```

3. **上传**
   ```
   Organizer → Distribute App → App Store Connect
   ```

> ⚠️ **注意**：watchOS App 需通过 iOS 配套应用一起提交到 App Store。

---

## 🔐 隐私权限

| 权限 | 用途 | Info.plist Key |
|-----|------|---------------|
| 照片库 | 导入自定义图片 | `NSPhotoLibraryUsageDescription` |
| 麦克风 | 录制自定义音效 | `NSMicrophoneUsageDescription` |
| 媒体库 | 从音乐库导入音效 | `NSAppleMusicUsageDescription` |

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发规范
- 新功能请添加到对应的 Manager 中
- UI 组件优先复用 `Shared/Components` 中的通用组件
- 配置常量统一放在 `AppConfig.swift`
- 遵循 Swift 命名规范

### 代码风格
- 使用 SwiftLint 进行代码检查
- 注释使用中文，代码使用英文命名
- 复杂逻辑添加 MARK 注释分区

---

## 📄 许可证

本项目仅供学习和个人使用。

---

## 🙏 致谢

- 感谢所有参与测试的朋友们
- 内置音效来源于开源音效库
- UI 设计灵感来自 Apple Human Interface Guidelines

---

<p align="center">
  <strong>Made with ❤️ for Apple Watch</strong><br/>
  <sub>让每一次互动都充满乐趣</sub>
</p>

<p align="center">
  <a href="https://apps.apple.com/app/cyberbugoff">
    <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" height="40" alt="Download on the App Store"/>
  </a>
</p>
