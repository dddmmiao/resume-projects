# watchRGB 技术指南

> 📖 **本文档详细解读 watchRGB 项目的每个模块和文件，帮助理解代码结构和技术实现。**

---

## 目录

1. [Application 层](#1-application-层)
2. [Config 层](#2-config-层)
3. [Models 层](#3-models-层)
4. [Managers 层](#4-managers-层)
5. [Handlers 层](#5-handlers-层)
6. [Utils 层](#6-utils-层)
7. [Views 层](#7-views-层)

---

## 1. Application 层

### 📄 watchRGBApp.swift

**功能**: 应用程序入口点

**核心代码解读**:
```swift
@main  // Swift 5.3+ 入口标记
struct watchRGB_Watch_AppApp: App {
    @StateObject private var brightnessManager = BrightnessManager()
    @StateObject private var displayModeManager = DisplayModeManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(brightnessManager)
                .environmentObject(displayModeManager)
        }
    }
}
```

**关键概念**:
| 属性包装器 | 作用 |
|-----------|------|
| `@main` | 标记程序入口，替代传统的 `main.swift` |
| `@StateObject` | 创建并持有 ObservableObject，生命周期与 App 绑定 |
| `.environmentObject()` | 依赖注入，子视图通过 `@EnvironmentObject` 获取 |

---

## 2. Config 层

### 📄 GlobalConfig.swift

**功能**: 全局配置中心，采用单例模式

**主要内容**:

| 配置组 | 说明 | 示例 |
|--------|------|------|
| `scaleFactor()` | 设备自适应系数 | 基于 184pt (44mm表盘) 计算缩放比例 |
| `Shake` | 摇晃检测参数 | 阈值 2~20，冷却时间 1秒 |
| `Colors` | 主题颜色定义 | primary, secondary, accent 等 |
| `Spacing` | 间距系统 | xs(2) ~ xxxl(24) |
| `Fonts` | 字体配置 | largeTitle, body, caption 等 |
| `Animation` | 动画参数 | fast(0.2s), spring 弹性动画 |
| `ButtonStyle` | 按钮样式 | 尺寸、圆角、阴影 |
| `ColorWheel` | 色轮配置 | 尺寸比例、反馈阈值 |

**设备自适应算法**:
```swift
func scaleFactor() -> CGFloat {
    let screenWidth = WKInterfaceDevice.current().screenBounds.width
    let scaleFactor = screenWidth / 184.0  // 以44mm表盘为基准
    return min(max(scaleFactor, 0.8), 1.2)  // 限制范围0.8~1.2
}
```

**自定义按钮样式**:
- `GlobalButtonStyle`: 圆形按钮，带阴影和缩放动画
- `CapsuleButtonStyle`: 胶囊按钮
- `BouncyButtonStyle`: 弹性按压效果
- `CardStyle`: 卡片背景 ViewModifier

---

## 3. Models 层

### 📄 ColorModels.swift

**功能**: 颜色数据模型和持久化

**核心结构**:

```swift
struct ColorInfo: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let red: Double     // 0~255
    let green: Double   // 0~255
    let blue: Double    // 0~255
    
    var color: Color { ... }           // 计算属性，转换为SwiftUI Color
    static func fromColor(_ color: Color) -> ColorInfo  // 从Color创建
    func getHSB() -> (hue, saturation, brightness)      // RGB转HSB
}
```

**颜色持久化** (ContentView 扩展):
- `saveColorList()`: 颜色列表 → UserDefaults
- `loadColorList()`: UserDefaults → 颜色列表

**AddColorMode 枚举**:
| 值 | 含义 |
|----|------|
| `.none` | 普通模式 |
| `.head` | 在列表头部添加颜色 |
| `.tail` | 在列表尾部添加颜色 |

---

### 📄 ColorSelectorMode.swift

**功能**: 颜色选择器模式定义

```swift
enum ColorSelectorMode: String, CaseIterable {
    case colorWheel      // 色轮
    case rgbInput        // RGB数字输入
    case emojiSelector   // 表情符号选择器
    
    func next() -> ColorSelectorMode  // 循环切换到下一个模式
}
```

---

### 📄 DisplayModes.swift

**功能**: 显示模式和呼吸模式定义

**DisplayMode 枚举**:
```swift
enum DisplayMode: String, CaseIterable {
    case solidColor   // 单色模式
    case breathing    // 呼吸灯模式
}
```

**BreathingMode 枚举** (17种主题):
| 主题 | 颜色描述 |
|------|----------|
| `warm` | 红橙黄金 暖色系 |
| `cool` | 蓝青紫 冷色系 |
| `rainbow` | 彩虹六色 |
| `forest` | 森林绿色系 |
| `ocean` | 海洋蓝色系 |
| `neon` | 霓虹高饱和 |
| `aurora` | 极光渐变 |
| `custom` | 用户自定义 |
| ... | 共17种 |

**HEX颜色扩展**:
```swift
extension Color {
    init(hex: String) { ... }  // 支持 "#RRGGBB" 格式
}
```

---

## 4. Managers 层

### 📄 DisplayModeManager.swift ⭐ **核心文件**

**功能**: 显示模式状态管理，呼吸动画引擎

**关键属性**:
```swift
@Published var currentMode: DisplayMode = .solidColor
@Published var currentBreathingMode: BreathingMode = .warm
@Published var breathingSpeed: Double = 10  // 动画速度
@Published var currentBreathingColor: Color = .red
@Published var customBreathingColors: [Color] = []  // 自定义颜色序列
@Published var isEditingBreathingColors: Bool = false
```

**呼吸动画算法**:
```swift
// Timer 每 0.02秒 触发一次
transitionProgress += 0.005 * breathingSpeed

// 平滑过渡函数 (三次平滑)
func smoothStep(_ x: Double) -> Double {
    return x * x * (3 - 2 * x)
}

// 颜色插值
currentBreathingColor = interpolateColor(from, to, progress)
```

**颜色编辑功能**:
- `startEditingBreathingColors()`: 进入编辑模式
- `updateCurrentEditingColor()`: 更新当前编辑的颜色
- `addColorAtHead/Tail()`: 在头/尾添加颜色
- `removeCurrentEditingColor()`: 删除当前颜色

**硬件保护**:
- 集成 `BatteryMonitor` 限制高电量下的速度
- 集成 `BreathingTimeLimitManager` 控制使用时长

---

### 📄 StoreKitManager.swift

**功能**: StoreKit 2 内购管理

**核心流程**:
```swift
// 1. 加载产品
let products = try await Product.products(for: [productID])

// 2. 购买
let result = try await product.purchase()
switch result {
case .success(let verification):
    let transaction = try checkVerified(verification)
    await transaction.finish()
case .userCancelled, .pending: break
}

// 3. 恢复购买
try? await AppStore.sync()
```

**错误处理**:
```swift
enum StoreError: Error {
    case failedVerification  // 验证失败
    case timeout             // 超时
    case noProductsFound     // 未找到产品
}
```

---

### 📄 MembershipManager.swift

**功能**: 会员权限控制

**核心方法**:
```swift
// 条件执行包装器
func executeIfPremium(action: () -> Void) {
    if hasPremiumAccess {
        action()
    } else {
        NotificationCenter.default.post(name: .showMembershipCenterNotification)
    }
}
```

---

### 📄 BatteryMonitor.swift

**功能**: 电池监控，动态限速

**速度限制策略**:
| 电量 | 最大速度 |
|------|----------|
| 30%~100% | 50 (无限制) |
| 20%~30% | 20 |
| 10%~20% | 10 |
| <10% | 5 |

---

### 📄 BreathingTimeLimitManager.swift

**功能**: 呼吸模式使用时长限制

**时长策略**:
| 速度 | 允许时长 |
|------|----------|
| 0~5 | 10分钟 |
| 6~15 | 8分钟 |
| 16~25 | 5分钟 |
| >25 | 3分钟 |

---

### 📄 BrightnessManager.swift

**功能**: 亮度状态管理

```swift
class BrightnessManager: ObservableObject {
    @Published var brightness: Double = 1.0
    
    func setBrightness(_ value: Double) {
        brightness = max(0.2, min(1.0, value))  // 限制范围
    }
}
```

---

### 📄 TutorialManager.swift

**功能**: 新手引导管理

```swift
var shouldShowTutorial: Bool  // 是否显示引导
func markTutorialAsCompleted()  // 标记完成
```

---

## 5. Handlers 层

### 📄 GestureHandlers.swift ⭐ **核心文件**

**功能**: 手势处理 (ContentView 的扩展)

**处理的手势**:
| 方法 | 触发条件 | 功能 |
|------|----------|------|
| `handleBackgroundDragGesture()` | 背景拖动 | 左右滑动切换颜色/模式 |
| `handleBackgroundTapGesture()` | 单击 | 显示控制按钮 |
| `handleBackgroundDoubleTapGesture()` | 双击 | 打开颜色编辑器 |
| `handleBackgroundLongPressGesture()` | 长按 | 切换单色/呼吸模式 |

**颜色切换逻辑**:
- `changeToNextColor()`: 切换到下一个颜色，越界进入尾部新增模式
- `changeToPreviousColor()`: 切换到上一个颜色，越界进入头部新增模式

---

### 📄 CrownRotationHandler.swift ⭐ **watchOS 特色**

**功能**: 数字表冠旋转处理

**关键逻辑**:
```swift
func handleCrownRotation(oldValue, newValue) {
    // 保护窗口：防止触摸后的惯性误触发
    if ignoreTableCrownUpdates { return }
    
    // 惯性检测：短时间内大幅变化时忽略
    if timeSinceLastTap < 0.1 && change > 0.2 { return }
    
    // 根据当前模式处理
    if showColorWheel && !isTouching {
        if currentSelectorMode == .rgbInput {
            handleRGBModeCrownRotation()   // RGB模式：控制亮度
        } else {
            handleColorWheelCrownRotation()  // 色轮模式：控制饱和度
        }
    } else {
        handleBrightnessCrownRotation()  // 主屏幕：控制亮度
    }
}
```

---

### 📄 NotificationHandlers.swift

**功能**: 通知系统，组件间通信

**自定义通知**:
```swift
extension Notification.Name {
    static let didRotateCrown           // 表冠旋转
    static let colorWheelTouchBegan     // 色轮触摸开始
    static let colorWheelTouchEnded     // 色轮触摸结束
    static let rgbPickerActive          // RGB选择器激活
    static let saturationUpdated        // 饱和度更新
    static let showMembershipCenterNotification  // 显示会员中心
}
```

---

### 📄 ShakeGestureHandler.swift

**功能**: 摇晃手势检测 (CoreMotion)

**算法**:
```swift
let magnitude = sqrt(x² + y² + z²)
if magnitude > shakeThreshold && timeSinceLast > cooldown {
    onShakeDetected()
}
```

**配置**:
- 采样频率: 50ms (20Hz)
- 默认阈值: 6.0 (可调节 2~20)
- 冷却时间: 1秒

---

### 📄 ShakeHandler.swift

**功能**: 摇晃响应逻辑

- 单色模式: 随机生成 RGB 颜色
- 呼吸模式: 随机切换呼吸主题

---

## 6. Utils 层

### 📄 ColorFormatter.swift

**功能**: 颜色格式化 (策略模式)

```swift
func format(_ color: Color) -> String {
    switch ColorFormatManager.shared.currentFormat {
    case .rgb: return "R:255 G:128 B:0"
    case .hex: return "#FF8000"
    case .emoji: return "🔴🟢🔵"
    }
}
```

---

### 📄 ColorUtilities.swift

**功能**: 颜色转换工具

| 方法 | 功能 |
|------|------|
| `colorToHexString()` | Color → "#RRGGBB" |
| `colorToRGBString()` | Color → "RGB255,128,0" |
| `createColorFromRGB()` | (R,G,B) → Color |
| `colorsAreEqual()` | 颜色比较 (容差) |
| `syncHSBFromColor()` | Color → (H,S,B) |

---

## 7. Views 层

### 📄 ContentView.swift ⭐ **核心文件** (~1800行)

**功能**: 应用主视图

**状态变量分类**:
```swift
// 显示模式
@StateObject var displayModeManager
@EnvironmentObject var brightnessManager

// 颜色状态
@State var colorList: [ColorInfo]        // 颜色列表
@State var currentColorIndex: Int        // 当前索引
@State var customColor: Color            // 自定义颜色
@State var customHue/Saturation/Brightness  // HSB值

// 交互状态
@State var showColorWheel: Bool          // 色轮显示
@State var addColorMode: AddColorMode    // 新增模式
@State var isTouching: Bool              // 触摸状态
@State var crownValue: Double            // 表冠值
```

**视图层级**:
```
NavigationStack
└── ZStack
    ├── backgroundLayer (背景颜色)
    ├── brightnessLayer (亮度遮罩)
    ├── controlButtonsLayer (控制按钮)
    └── colorSelectorLayer (颜色选择器)
```

---

### 📄 ColorWheel.swift ⭐ **核心文件**

**功能**: HSB 色轮选择器

**极坐标颜色计算**:
```swift
// 触摸点 → 颜色
let angle = atan2(dy, dx)
let hue = (angle / (2 * .pi) + 0.5).truncatingRemainder(dividingBy: 1.0)
let saturation = min(distance / radius, 1.0)
```

**双区域设计**:
- 外圈亮度环: 控制亮度
- 内圈色轮: 控制色相和饱和度

---

### 📄 EmojiColorSelector.swift

**功能**: 表情符号颜色选择器

**创意设计**: 256个表情符号对应256个颜色值
```swift
static let redEmojis = ["😋","👂","🌞", ... ]  // 256个
static let greenEmojis = ["🍯","👨🏻‍🏫", ... ]  // 256个
static let blueEmojis = ["🪬","🐻", ... ]   // 256个

// RGB(128, 64, 200) → 对应表情符号组合
```

---

### 📄 SettingsView.swift

**功能**: 设置页面

**设置项**:
- 语言设置
- 引导重播
- 颜色格式 (RGB/HEX/Emoji)
- 摇晃灵敏度
- 会员中心
- 重置设置
- 关于页面

---

## 附录：关键设计决策

1. **为什么用 ContentView 扩展模式?**
   - 1800行代码拆分为多个文件更易维护
   - Handlers 独立文件便于单独测试

2. **为什么呼吸动画用 Timer 而非 SwiftUI Animation?**
   - 需要精确控制颜色插值
   - 需要动态修改速度
   - 需要在运行时切换颜色序列

3. **为什么有多种颜色选择器?**
   - 色轮: 直观，适合快速选择
   - RGB输入: 精确，适合指定颜色
   - 表情符号: 趣味性，差异化功能

---

*文档结束 - 用于项目理解和面试展示*
