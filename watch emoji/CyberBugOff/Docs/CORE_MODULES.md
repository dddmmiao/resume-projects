# 🧠 Core 层核心模块详解

本文档详细解释 CyberBugOff 项目的核心业务层（Core）架构设计和实现细节。

---

## 📁 目录结构

```
Core/
├── Config/
│   └── AppConfig.swift          # 全局配置常量
├── Models/
│   ├── BugOffModel.swift        # 中央状态管理器 ⭐
│   ├── DataModels.swift         # 数据结构定义 ⭐
│   ├── ImageManager.swift       # 图片资源管理
│   ├── SoundManager.swift       # 音效资源管理
│   └── TriggerManager.swift     # 触发反馈逻辑
├── Services/
│   ├── AudioService.swift       # 音频播放引擎
│   ├── DataService.swift        # 数据持久化
│   ├── DataStoreActor.swift     # 数据存储 Actor
│   └── PhotoSelectionService.swift # 照片选择服务
├── Sound/
│   └── SoundDisplayNameManager.swift # 音效显示名称管理
└── Utils/
    ├── CacheManager.swift       # 缓存管理
    ├── Logger.swift             # 日志系统
    ├── ThumbnailGenerator.swift # 缩略图生成
    ├── PerformanceMonitor.swift # 性能监控
    ├── ErrorHandler.swift       # 错误处理
    └── ...                      # 其他工具类
```

---

## 🎯 核心模型层 (Models)

### 1. BugOffModel.swift - 中央状态管理器

**文件路径**: `Core/Models/BugOffModel.swift`  
**代码行数**: ~1160 行  
**核心职责**: 作为应用的**状态枢纽**，协调各个 Manager，对外提供统一 API

#### 设计模式：Facade（外观模式）

```swift
class BugOffModel: NSObject, ObservableObject {
    // MARK: - Manager 依赖
    // 三个核心 Manager，职责分离
    let imageManager = ImageManager()   // 图片资源管理
    let soundManager = SoundManager()   // 音效资源管理
    let triggerManager = TriggerManager() // 触发反馈逻辑
    
    // MARK: - 向后兼容属性
    // 通过计算属性委托给对应的 Manager
    var currentImageName: String {
        get { imageManager.currentImageName }
        set { imageManager.currentImageName = newValue }
    }
    
    // 发布到 UI 的状态
    @Published var defaultSounds: [String] = []
    @Published var imageMultiSoundIDs: [String: [SoundID]] = [:]
}
```

#### 核心功能模块

| 模块 | 功能 | 关键方法 |
|------|------|----------|
| **图片管理** | 图片增删改查 | `addImage()`, `deleteImage()`, `getDisplayImage()` |
| **音效管理** | 音效配置、播放 | `playSound()`, `playMultiSounds()`, `getSoundConfig()` |
| **触发管理** | 触发显示配置 | `getCustomTriggerDisplay()`, `getTriggerMode()` |
| **内存管理** | 内存监控与清理 | `performMemoryCleanup()`, `startMemoryMonitoring()` |
| **数据迁移** | 版本升级兼容 | `performOptimizationInitialization()` |

#### 初始化流程

```swift
override init() {
    super.init()
    loadImageOrder()  // 加载图片顺序
    
    // 延迟更新音效列表，确保 SoundManager 初始化完成
    DispatchQueue.main.async { [weak self] in
        self?.updateDefaultSounds()
    }
    
    // 监听显示名称管理器变化（Combine 订阅）
    soundManager.displayNameManager.objectWillChange
        .receive(on: DispatchQueue.main)
        .sink { [weak self] _ in
            self?.updateDefaultSounds()
        }
        .store(in: &cancellables)
    
    // 设置 TriggerManager 的 ImageManager 引用
    triggerManager.setImageManager(imageManager)
    
    // 执行优化初始化
    performOptimizationInitialization()
}
```

#### 临时配置分层机制

```swift
// MARK: - 临时音效配置分层（Mode范围）
// 用于音效编辑界面，避免频繁磁盘 I/O

/// 临时缓存：每个图片的音效配置（仅会话内使用）
private var modeScopedTempSoundConfigs: [String: [SoundID: SoundConfig]] = [:]

/// 将音效配置写入临时缓存（不落盘）
func stageTempSoundConfig(config: SoundConfig, for imageName: String) {
    if modeScopedTempSoundConfigs[imageName] == nil {
        modeScopedTempSoundConfigs[imageName] = [:]
    }
    modeScopedTempSoundConfigs[imageName]?[config.id] = config
    
    // 发送通知，用于 UI 更新
    NotificationCenter.default.post(...)
}

/// 读取并清空临时配置（用于父层统一保存）
func drainTempSoundConfigs(for imageName: String) -> [SoundID: SoundConfig] {
    let staged = modeScopedTempSoundConfigs[imageName] ?? [:]
    modeScopedTempSoundConfigs[imageName] = [:]
    return staged
}
```

**设计亮点**：
- 避免音效设置界面频繁保存导致的卡顿
- 父层关闭时统一合并持久化
- 支持取消操作（清除临时配置）

---

### 2. DataModels.swift - 数据结构定义

**文件路径**: `Core/Models/DataModels.swift`  
**代码行数**: ~536 行  
**核心职责**: 定义应用中所有核心数据结构，采用 **Codable 协议** 支持序列化

#### ID 类型定义

```swift
// MARK: - ID Types
typealias SoundID = String  // UUID格式，音效的唯一标识
typealias ImageID = String  // UUID格式，图片的唯一标识
```

**设计理由**：使用 UUID 作为唯一标识符，解耦显示名称与内部标识，支持重命名操作

#### 核心枚举类型

```swift
// MARK: - 触发模式
public enum ImageTriggerMode: String, CaseIterable, Identifiable, Codable {
    case tap = "点击触发"      // 点击屏幕触发
    case shake = "摇晃触发"    // 抖动手腕触发（CoreMotion）
    case crown = "表冠触发"    // 旋转 Digital Crown 触发
    case auto = "自动播放"     // 定时自动触发
    
    var icon: String { ... }   // SF Symbol 图标
}

// MARK: - 音效播放模式
public enum SoundPlayMode: String, CaseIterable, Identifiable, Codable {
    case sequential = "顺序"   // 按顺序播放
    case random = "随机"       // 随机播放
    
    var description: String { ... }
}

// MARK: - 触发动画样式
public enum TriggerAnimationStyle: String, CaseIterable, Codable {
    case bounce = "弹跳"
    case scale = "缩放"
    case slide = "滑动"
    case fade = "渐显"
    case rotate = "旋转"
    case heart = "心跳"
    case flip = "翻转"      // 高级动画
    case wave = "波浪"
    case pulse = "脉冲"
    case sparkle = "闪烁"
    case spiral = "螺旋"
    case shake = "摇摆"
}
```

#### 核心结构体

##### SoundConfig - 音效配置

```swift
struct SoundConfig: Codable, Equatable {
    let id: SoundID               // 永不改变的唯一标识符
    let baseSoundName: String     // 基础音频文件名（用于播放）
    
    var playbackRate: Double = 1.0    // 播放速率 (0.5x - 2.0x)
    var volume: Double = 1.0          // 音量 (0% - 200%)
    var startTime: TimeInterval = 0.0 // 裁剪起始时间
    var endTime: TimeInterval? = nil  // 裁剪结束时间（nil = 到结尾）
    var backtrackDuration: TimeInterval? = nil // 回溯时长
    
    /// 是否为自定义配置（用于判断是否需要保存）
    var isCustomized: Bool {
        return playbackRate != 1.0 || volume != 1.0 || 
               startTime != 0.0 || endTime != nil
    }
}
```

##### ImageSettings - 图片设置

```swift
struct ImageSettings: Codable {
    // 基础设置
    var triggerMode: ImageTriggerMode = .tap
    var showClickCount: Bool = false
    var clickCount: Int = 0
    var scale: CGFloat = 1.0
    var offset: CGSize = .zero
    
    // 自定义触发显示
    var customTriggerDisplay: CustomTriggerDisplay = CustomTriggerDisplay()
    var displayName: String = ""
    
    // 音效配置（每个图片独立）
    var soundConfigs: [SoundID: SoundConfig] = [:]
    var soundPlayMode: SoundPlayMode = .sequential
    
    // 回溯功能
    var enableBacktrack: Bool = false
    var backtrackDuration: TimeInterval? = nil
    
    // 触发参数
    var autoTriggerInterval: Double = 2.0      // 自动触发间隔
    var shakeThreshold: Double = 1.5           // 摇晃灵敏度
    var crownRotationThreshold: Double = 0.1   // 表冠旋转阈值
    
    // 随机提示
    var randomHintEnabled: Bool = false
    
    // Mode 上下文支持（配置隔离）
    var modeContext: ModeContext?
    var configVersion: Int = 3
}
```

##### ModeContext - 模式上下文

```swift
struct ModeContext: Codable, Hashable {
    let modeId: String      // 模式ID
    let modeType: String    // 模式类型："image", "sound", "combo"
    
    /// 默认上下文（向后兼容）
    static let `default` = ModeContext(modeId: "default", modeType: "image")
    
    /// 生成配置存储键值
    func configKey(for imageName: String) -> String {
        return "mode_\(modeId)_image_\(imageName)"
    }
}
```

**设计亮点**：
- 支持"另存为"功能，每个副本有独立配置
- 配置隔离，不同模式互不影响

##### CustomTriggerDisplay - 自定义触发显示

```swift
struct CustomTriggerDisplay: Codable, Equatable {
    var isEnabled: Bool = true
    var displayMode: CustomDisplayMode = .text  // 文字 or 图片
    var customText: String = ""
    var incrementValue: Int = 1             // 增量值 (+1 或 -1)
    var displayColor: String = "white"
    var emoji: String = "🍀"
    var animationStyle: TriggerAnimationStyle = .bounce
    var showIncrement: Bool = true
    var fontSize: Double = 24.0
    
    // 图片模式配置
    var imageContentMode: ImageToastContentMode = .fit
    var imageSize: CGFloat = 60.0
    var imageOpacity: Double = 1.0
    var imageAnimationStyle: TriggerAnimationStyle = .scale
    
    // 圈选裁剪配置
    var circleSelectionData: CircleSelectionData? = nil
    
    /// 获取显示文本（包含增量）
    func getDisplayText(currentCount: Int) -> String {
        if showIncrement {
            let normalized = normalizedIncrementUnit()
            return normalized < 0 ? "\(customText)\(normalized)" : "\(customText)+\(normalized)"
        }
        return customText
    }
}
```

---

### 3. ImageManager.swift - 图片资源管理

**文件路径**: `Core/Models/ImageManager.swift`  
**代码行数**: ~760 行  
**核心职责**: 管理图片资源的加载、存储、裁剪和设置

#### 核心属性

```swift
class ImageManager: ObservableObject {
    // 发布属性（UI 响应）
    @Published var currentImageName: String = "bug1"
    @Published var selectedDefaultImageName: String = "bug1"
    @Published var customImageURLs: [String: URL] = [:]      // 自定义图片URL
    @Published var userAddedImages: [String: URL] = [:]      // 用户添加的图片
    @Published var imageScales: [String: CGFloat] = [:]      // 图片缩放
    @Published var imageOffsets: [String: CGSize] = [:]      // 图片偏移
    @Published var imageSettings: [String: ImageSettings] = [:] // 图片设置
    
    // Mode 上下文支持
    @Published var currentModeContext: ModeContext = ModeContext.default
    private var modeImageSettings: [String: [String: ImageSettings]] = [:]
    
    // 服务依赖
    private let dataService = DataService.shared
}
```

#### 关键方法

##### 图片加载（下采样优化）

```swift
/// 使用下采样加载图片，避免全分辨率解码导致内存峰值
/// - 技术：CGImageSource + kCGImageSourceThumbnailMaxPixelSize
/// - 效果：内存占用降低 82%，加载速度提升 50%
private func loadImageWithDownsampling(from url: URL, maxSize: CGFloat) -> UIImage? {
    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        return nil
    }
    
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: maxSize,      // 限制最大像素
        kCGImageSourceCreateThumbnailWithTransform: true,  // 应用 EXIF 方向
        kCGImageSourceShouldCacheImmediately: true         // 立即缓存
    ]
    
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
        return nil
    }
    
    return UIImage(cgImage: cgImage)
}
```

##### 获取显示图片

```swift
/// 获取用于显示的图片（统一缓存 + 下采样）
public func getDisplayImage(for imageName: String) -> UIImage? {
    // 1. 先查统一缓存
    if let cached = CacheManager.shared.getDisplayImage(for: imageName) {
        return cached
    }
    
    // 2. 获取图片设置，确定实际图片名称
    let settings = getImageSettings(for: imageName)
    let finalImageName = settings.currentDisplayImageName
    
    // 3. 尝试从用户图片加载（下采样）
    if let url = userAddedImages[finalImageName] {
        if let image = loadImageWithDownsampling(from: url, maxSize: 512) {
            CacheManager.shared.setDisplayImage(image, for: imageName)
            return image
        }
    }
    
    // 4. 尝试从 Bundle 加载
    if let image = UIImage(named: finalImageName) {
        CacheManager.shared.setDisplayImage(image, for: imageName)
        return image
    }
    
    return nil
}
```

##### Mode 上下文管理

```swift
/// 设置当前活跃的 mode 上下文（用于"另存为"功能）
public func setCurrentModeContext(_ modeContext: ModeContext) {
    currentModeContext = modeContext
    
    // 如果是新的 mode，预加载其配置
    if modeImageSettings[modeContext.modeId] == nil {
        loadModeSettings(for: modeContext)
    }
}

/// 复制配置到新 mode（"另存为"核心逻辑）
public func copySettingsToMode(from sourceModeContext: ModeContext, 
                                to targetModeContext: ModeContext, 
                                for imageNames: [String]? = nil) {
    let sourceSettings = getAllImageSettings(in: sourceModeContext)
    let imagesToCopy = imageNames ?? Array(sourceSettings.keys)
    
    for imageName in imagesToCopy {
        var newSettings = getImageSettings(for: imageName, in: sourceModeContext)
        newSettings.modeContext = targetModeContext
        updateImageSettings(for: imageName, in: targetModeContext, settings: newSettings)
    }
}
```

---

### 4. SoundManager.swift - 音效资源管理

**文件路径**: `Core/Models/SoundManager.swift`  
**代码行数**: ~772 行  
**核心职责**: 管理音效资源的配置、播放模式和 AudioService 交互

#### 核心架构

```swift
class SoundManager: ObservableObject {
    // 显示名称管理（解耦显示名称与内部ID）
    @Published var displayNameManager = SoundDisplayNameManager()
    
    // 核心数据（使用 SoundID 作为键）
    @Published var soundConfigs: [SoundID: SoundConfig] = [:]
    
    // 兼容性属性
    @Published var soundPlayMode: SoundPlayMode = .sequential
    @Published var imageMultiSounds: [String: [String]] = [:]  // 图片 -> 音效列表
    
    // 服务依赖
    private let dataService = DataService.shared
    let audioService = AudioService()  // 音频播放引擎
}
```

#### 关键方法

##### 创建新音效

```swift
/// 创建新音效（生成唯一 ID）
func createSound(displayName: String, baseSoundName: String) -> SoundID {
    let soundID = displayNameManager.generateNewSoundID()  // UUID
    let config = SoundConfig(id: soundID, baseSoundName: baseSoundName)
    
    soundConfigs[soundID] = config
    displayNameManager.setDisplayName(for: soundID, name: displayName)
    
    dataService.saveSoundConfig(config, for: baseSoundName)
    return soundID
}
```

##### 播放多音效（支持图片独立配置）

```swift
/// 为指定图片播放多个音效（核心播放逻辑）
func playMultiSounds(names: [String], for imageName: String, imageManager: ImageManager) {
    // 1. 解析音效 URL
    var validBaseSoundNames: [String] = []
    var validURLs: [URL] = []
    for n in names {
        if let u = getURL(for: n) {
            if let config = getSoundConfig(byDisplayName: n) {
                validBaseSoundNames.append(config.baseSoundName)
            }
            validURLs.append(u)
        }
    }
    
    // 2. 获取图片独立配置
    let imageSettings = imageManager.getImageSettings(for: imageName)
    
    // 3. 构建配置字典
    var finalSoundConfigs: [String: SoundConfig] = [:]
    for (index, baseSoundName) in validBaseSoundNames.enumerated() {
        var config = imageSettings.soundConfigs[displayName] ?? soundConfigs[soundID]
        
        // 应用回溯设置
        if imageSettings.enableBacktrack {
            config.backtrackDuration = imageSettings.backtrackDuration
        }
        finalSoundConfigs[baseSoundName] = config
    }
    
    // 4. 调用 AudioService 播放
    audioService.playSounds(
        names: validBaseSoundNames,
        urls: validURLs,
        playMode: imageSettings.soundPlayMode,  // 使用图片独立的播放模式
        soundConfigs: finalSoundConfigs
    )
}
```

##### 音效克隆

```swift
/// 克隆音效配置（用于创建副本）
@discardableResult
func cloneSoundConfig(from originalName: String) -> String {
    guard let soundID = displayNameManager.getSoundID(for: originalName) else {
        return originalName
    }
    let originalConfig = soundConfigs[soundID]
    
    // 生成新唯一名称
    let newDisplayName = "\(originalName)_\(UUID().uuidString.prefix(4))"
    
    // 创建新音效并复制配置
    let newSoundID = createSound(displayName: newDisplayName, baseSoundName: originalConfig.baseSoundName)
    
    if var newConfig = soundConfigs[newSoundID] {
        newConfig.playbackRate = originalConfig.playbackRate
        newConfig.volume = originalConfig.volume
        newConfig.startTime = originalConfig.startTime
        newConfig.endTime = originalConfig.endTime
        soundConfigs[newSoundID] = newConfig
    }
    
    return newDisplayName
}
```

---

## ⚙️ 服务层 (Services)

### AudioService.swift - 音频播放引擎

**核心职责**: 封装 AVFoundation，提供高性能音频播放能力

**关键特性**：
- 音频栈预热（避免首次播放延迟）
- 多音效队列播放
- 回溯功能实现
- 内存压力响应

### DataService.swift - 数据持久化

**核心职责**: 封装 UserDefaults 和 FileManager，提供统一的数据读写接口

**关键特性**：
- Codable 自动序列化
- 异步保存选项
- 批量加载优化

---

## 🛠️ 工具层 (Utils)

### CacheManager.swift - 统一缓存管理

```swift
class CacheManager {
    static let shared = CacheManager()
    
    // 分类缓存
    private let displayImageCache: NSCache<NSString, UIImage>    // 20MB
    private let thumbnailCache: NSCache<NSString, UIImage>       // 10MB
    private let originalImageCache: NSCache<NSString, UIImage>   // 30MB
    private let toastCache: NSCache<NSString, UIImage>           // 5MB
    
    // 统一的 get/set 接口
    func getDisplayImage(for key: String) -> UIImage?
    func setDisplayImage(_ image: UIImage, for key: String)
    
    // 内存警告处理
    func handleMemoryWarning() {
        displayImageCache.removeAllObjects()
        thumbnailCache.removeAllObjects()
        // 保留原图缓存的一部分
        originalImageCache.countLimit = originalImageCache.countLimit / 2
    }
}
```

### PerformanceMonitor.swift - 性能监控

```swift
class PerformanceMonitor {
    /// 获取当前内存使用情况
    static func getMemoryUsage() -> (used: UInt64, total: UInt64)
    
    /// 获取内存使用百分比
    static func getMemoryUsagePercentage() -> Double
    
    /// 记录内存使用日志
    static func logMemoryUsage(context: String)
}
```

---

## 📊 数据流总结

```
┌─────────────────────────────────────────────────────────────┐
│                         View 层                              │
│  (ImageModeView, SettingsView, SoundListView, etc.)         │
└────────────────────────────┬────────────────────────────────┘
                             │ @ObservedObject / @EnvironmentObject
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      BugOffModel                            │
│                    (中央状态枢纽)                            │
│  ┌───────────────┬───────────────┬───────────────┐         │
│  │ ImageManager  │ SoundManager  │TriggerManager │         │
│  └───────────────┴───────────────┴───────────────┘         │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   AudioService   │ │ DataService  │ │   CacheManager   │
│   (音频播放)      │ │ (数据持久化)  │ │   (缓存管理)     │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

---

**文档版本**: 1.0  
**更新日期**: 2026-01-29
