# 🎨 UI 组件层详解

本文档详细解释 CyberBugOff 项目的 UI 组件架构、设计模式和实现细节。

---

## 📁 目录结构

```
Features/
├── ImageMode/
│   ├── Views/
│   │   ├── ImageModeView.swift          # 主入口视图 ⭐
│   │   ├── ImageGridManageView.swift    # 图片网格管理
│   │   ├── FullScreenImageView.swift    # 全屏图片显示
│   │   └── ...
│   └── ViewModels/                       # 视图模型
├── Settings/
│   └── Views/
│       └── AppSettingsView.swift        # 应用设置
├── SoundEdit/
│   └── Views/
│       └── SoundEditView.swift          # 音效编辑
└── SoundList/
    └── Views/
        └── SoundListView.swift          # 音效列表

Shared/
├── Components/
│   ├── TriggerCountToast.swift          # 触发动画组件 ⭐
│   ├── CrownRotationModifier.swift      # 表冠旋转监控
│   ├── ShakeMotionManager.swift         # 摇晃检测管理
│   ├── WaveformView.swift               # 音频波形显示
│   └── ...
└── Extensions/
    ├── View+Extensions.swift            # View 扩展
    └── Color+Extensions.swift           # Color 扩展

Theme/
└── AppTheme.swift                       # 主题系统
```

---

## 🖼️ Features 层 - 功能视图

### ImageModeView.swift - 主入口视图

**文件路径**: `Features/ImageMode/Views/ImageModeView.swift`  
**核心职责**: 应用主界面，提供网格视图/音效列表双模式切换

#### 视图模式定义

```swift
/// ViewMode 表示界面的两种显示模式
enum ViewMode {
    case grid      // 网格视图 - 显示所有图片模式
    case sounds    // 音效列表 - 管理所有音效
}
```

#### 核心架构

```swift
struct ImageModeView: View {
    // MARK: - 依赖注入
    @ObservedObject var model: BugOffModel
    
    // MARK: - UI 状态
    @State private var viewMode: ViewMode = .grid
    @State private var showingFullScreenImage = false
    @State private var showingSettings = false
    
    // MARK: - Digital Crown 焦点管理
    @FocusState private var isGridFocused: Bool
    @FocusState private var isSoundFocused: Bool
    
    // MARK: - 视图预加载状态（性能优化）
    @State private var isGridViewLoaded: Bool = false
    @State private var isSoundViewLoaded: Bool = false
}
```

#### 性能优化：ZStack + Opacity 切换

```swift
var body: some View {
    NavigationStack {
        // 核心性能优化：使用 ZStack + opacity 避免视图重建
        // 保持两个视图都在内存中，切换时秒切无延迟
        ZStack {
            gridView
                .opacity(viewMode == .grid ? 1 : 0)
                .allowsHitTesting(viewMode == .grid)
                .focusable(viewMode == .grid)
                .focused($isGridFocused)
            
            soundView
                .opacity(viewMode == .sounds ? 1 : 0)
                .allowsHitTesting(viewMode == .sounds)
                .focusable(viewMode == .sounds)
                .focused($isSoundFocused)
        }
        .animation(.none, value: viewMode)  // 禁用切换动画，避免闪烁
    }
}
```

**设计亮点**：
- 使用 `opacity` 切换而非 `if-else` 条件渲染，避免视图销毁重建
- `allowsHitTesting` 禁用非活跃视图的交互，防止误触
- `@FocusState` 管理 Digital Crown 焦点，保证滚动体验

#### 焦点自动切换

```swift
.onChange(of: viewMode) { _, newMode in
    // 视图切换时自动设置焦点，确保 Digital Crown 立即可用
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        switch newMode {
        case .grid:
            isGridFocused = true
            isSoundFocused = false
        case .sounds:
            isSoundFocused = true
            isGridFocused = false
        }
    }
}
```

#### 视图预加载机制

```swift
/// 预加载视图组件（延迟加载策略）
@ViewBuilder
private var gridView: some View {
    if isGridViewLoaded {
        ImageGridManageView(...)
            .environmentObject(model.imageManager)
            .environmentObject(model.soundManager)
    } else {
        Color.clear  // 占位，等待加载
    }
}

/// 预加载所有视图
private func preloadAllViews() {
    preloadGridView()
    preloadSoundView()
}

private func preloadGridView() {
    if !isGridViewLoaded {
        isGridViewLoaded = true
        
        // 预加载缩略图，减少闪烁
        ThumbnailGenerator.preloadThumbnails(
            for: model.defaultImages,
            size: thumbnailSize,
            model: model
        )
    }
}
```

---

## 🔔 Shared 层 - 共享组件

### TriggerCountToast.swift - 触发动画组件

**文件路径**: `Shared/Components/TriggerCountToast.swift`  
**代码行数**: ~884 行  
**核心职责**: 管理触发反馈的 Toast 动画效果

#### 动画管理器

```swift
/// 触发次数显示管理器
class TriggerCountToastManager: ObservableObject {
    // MARK: - 发布属性（驱动 UI 更新）
    @Published var isVisible = false          // 是否显示
    @Published var count = 0                  // 显示的次数
    @Published var offsetY: CGFloat = 0       // Y 轴偏移
    @Published var offsetX: CGFloat = 0       // X 轴偏移
    @Published var opacity: Double = 1.0      // 透明度
    @Published var scale: CGFloat = 1.0       // 缩放比例
    @Published var rotation: Double = 0.0     // 旋转角度
    @Published var currentColor: Color = .white // 当前颜色
    
    // MARK: - 点击位置跟踪
    @Published var clickPosition: CGPoint = .zero
    @Published var lastDisplayPosition: CGPoint = CGPoint(x: 98, y: 120)
    
    // MARK: - 配置与颜色
    @Published var customConfig: CustomTriggerDisplay? = nil
    @Published var colorList: [Color] = [.white]
    private var currentColorIndex = 0
    
    // MARK: - 计时器
    private var timer: Timer?
}
```

#### 动画效果实现

```swift
/// 执行不同的动画效果（12 种动画样式）
private func executeAnimation(style: TriggerAnimationStyle) {
    guard let params = AppTheme.toastAnimationConfigs[style] else { return }
    
    switch style {
    case .bounce:
        // 弹跳动画 - 从点击位置开始向上移动
        withAnimation(.interpolatingSpring(stiffness: 300, damping: 10)) {
            offsetY = params.primaryOffsetY
        }
        // 延迟消失
        withAnimation(.easeOut(duration: duration).delay(delay)) {
            opacity = 0.0
            offsetY = finalY
        }
        
    case .scale:
        // 缩放动画 - 放大后缩小消失
        withAnimation(.easeOut(duration: duration)) {
            scale = primaryScale
            offsetY = offsetY
        }
        
    case .heart:
        // 心跳动画 - 多阶段动画
        // 第一次心跳
        withAnimation(.easeOut(duration: duration)) {
            scale = 1.3
        }
        // 回弹
        withAnimation(.easeOut(duration: midDuration).delay(delay)) {
            scale = 1.0
        }
        // 第二次心跳（稍小）
        withAnimation(.easeOut(duration: duration).delay(secondBeatDelay)) {
            scale = 1.2
        }
        // 消失
        withAnimation(.easeOut(duration: finalDuration).delay(finalDelay)) {
            scale = 0.5
            opacity = 0.0
        }
        
    case .spiral:
        // 螺旋动画 - 旋转并螺旋向上消失
        withAnimation(.easeOut(duration: duration)) {
            rotation = 720  // 两圈
            offsetX = sin(rotation * .pi / 180) * 20
            offsetY = -50
            scale = 0.3
            opacity = 0.0
        }
        
    // ... 更多动画样式
    }
}
```

#### 防抖与重置机制

```swift
/// 显示自定义触发提示
func showCustomTrigger(count: Int, config: CustomTriggerDisplay, colors: [Color], at position: CGPoint?) {
    // 1. 取消之前的计时器
    timer?.invalidate()
    
    // 2. 如果当前已经显示 Toast，强制立即隐藏
    if isVisible {
        isVisible = false
    }
    
    // 3. 设置点击位置（或使用屏幕中央）
    if let position = position {
        self.clickPosition = position
        self.lastDisplayPosition = position  // 记录位置，用于回溯
    } else {
        self.clickPosition = CGPoint(x: 98, y: 120)
    }
    
    // 4. 强制重置所有动画状态，确保没有累积效果
    forceResetAnimationState()
    
    // 5. 更新配置和颜色
    // ...
    
    // 6. 显示提示
    withAnimation(.easeOut(duration: 0.1)) {
        isVisible = true
    }
    
    // 7. 延迟执行动画
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
        self.executeAnimation(style: config.getCurrentAnimationStyle())
    }
    
    // 8. 设置清理计时器
    timer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
        self?.isVisible = false
    }
}

/// 强制重置动画状态（用于快速点击时防止累积效果）
private func forceResetAnimationState() {
    withAnimation(.linear(duration: 0)) {
        offsetY = 0
        offsetX = 0
        opacity = 1.0
        scale = 1.0
        rotation = 0.0
    }
}
```

#### Toast 视图组件

```swift
/// 自定义触发次数显示视图
struct CustomTriggerToast: View {
    @ObservedObject var manager: TriggerCountToastManager
    let config: CustomTriggerDisplay
    let currentCount: Int
    let useClickPosition: Bool
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                if manager.isVisible {
                    let displayConfig = manager.customConfig ?? config
                    Text(displayConfig.getDisplayText(currentCount: currentCount))
                        .font(.system(size: AppTheme.adaptiveSize(displayConfig.fontSize), weight: .bold))
                        .foregroundColor(getDisplayColor())
                        .opacity(manager.opacity)
                        .scaleEffect(manager.scale)
                        .rotationEffect(.degrees(manager.rotation))
                        .position(
                            x: useClickPosition ? (manager.clickPosition.x + manager.offsetX) : (geometry.size.width / 2 + manager.offsetX),
                            y: useClickPosition ? (manager.clickPosition.y + manager.offsetY) : (geometry.size.height / 2 + manager.offsetY)
                        )
                        .allowsHitTesting(false)  // 不阻断触摸事件
                }
            }
        }
        .allowsHitTesting(false)
    }
}
```

---

### 可点击 Toast 容器

```swift
/// 自定义可点击的 Toast 容器视图
/// 设计用途：捕获点击位置并在该位置显示 Toast 动画
struct CustomClickableToastView<Content: View>: View {
    @ObservedObject var toastManager: TriggerCountToastManager
    let config: CustomTriggerDisplay
    let currentCount: Int
    let content: Content
    let onTap: (CGPoint) -> Void
    
    // 图片显示支持
    private let imageManager: ImageManager?
    private let imageName: String?
    private let triggerManager: TriggerManager?
    
    // 缓存 Toast 图片，避免动画期间重复获取
    @State private var cachedToastImage: UIImage? = nil
    
    var body: some View {
        content
            .contentShape(Rectangle())  // 扩大点击区域
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        // 仅当拖拽距离很小时（< 10px）才认为是点击
                        let dragDistance = sqrt(pow(value.translation.width, 2) + pow(value.translation.height, 2))
                        if dragDistance < 10 {
                            let location = value.location
                            DispatchQueue.main.async {
                                onTap(location)
                            }
                        }
                    }
            )
            .overlay(
                // Toast 覆盖层
                GeometryReader { _ in
                    if config.isEnabled && toastManager.isVisible {
                        let displayConfig = toastManager.customConfig ?? config
                        if displayConfig.displayMode == .image {
                            imageToastView  // 图片模式
                        } else {
                            textToastView   // 文字模式
                        }
                    }
                }
            )
    }
}
```

---

## 🎨 Theme 层 - 主题系统

### AppTheme.swift - 全局主题配置

```swift
struct AppTheme {
    // MARK: - 颜色系统
    static let primaryColor = Color.blue
    static let secondaryColor = Color.gray
    static let accentColor = Color.orange
    static let backgroundColor = Color.black
    
    // MARK: - 尺寸适配
    /// 根据屏幕宽度自适应尺寸
    static func adaptiveSize(_ baseSize: CGFloat) -> CGFloat {
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        let scale = screenWidth / 198.0  // 以 Apple Watch Series 8 (45mm) 为基准
        return baseSize * scale
    }
    
    // MARK: - 图标尺寸
    static let smallIconSize: CGFloat = 14
    static let mediumIconSize: CGFloat = 18
    static let largeIconSize: CGFloat = 24
    
    // MARK: - 圆角与间距
    static let cornerRadius: CGFloat = 8
    static let smallPadding: CGFloat = 4
    static let mediumPadding: CGFloat = 8
    static let largePadding: CGFloat = 16
    
    // MARK: - Toast 动画配置
    static let toastDisplayDuration: TimeInterval = 0.8
    
    /// 各动画样式的参数配置
    static let toastAnimationConfigs: [TriggerAnimationStyle: ToastAnimationParams] = [
        .bounce: ToastAnimationParams(
            primaryOffsetY: -30,
            primaryDuration: 0.15,
            finalOffsetY: -50,
            finalDuration: 0.5
        ),
        .scale: ToastAnimationParams(
            primaryOffsetY: -10,
            primaryDuration: 0.1,
            primaryScale: 1.5,
            finalScale: 0.5,
            finalOffsetY: -40,
            finalDuration: 0.5
        ),
        // ...
    ]
}
```

---

## 🔄 组件通信模式

### 1. EnvironmentObject 传递

```swift
// 父级注入
.environmentObject(model.imageManager)
.environmentObject(model.soundManager)
.environmentObject(model.triggerManager)

// 子级使用
struct ChildView: View {
    @EnvironmentObject var imageManager: ImageManager
    @EnvironmentObject var soundManager: SoundManager
}
```

### 2. Binding 双向绑定

```swift
struct SettingsSheet: View {
    @Binding var isPresented: Bool
    @Binding var selectedConfig: SoundConfig
}
```

### 3. 回调闭包

```swift
ImageGridManageView(
    model: model,
    onAddTap: { showingPhotosPicker = true },
    onOpenSettings: { showingSettings = true }
)
```

---

## 📊 UI 性能优化策略

| 策略 | 实现方式 | 效果 |
|------|----------|------|
| **视图预加载** | `@State + LazyVStack` | 避免首次显示卡顿 |
| **ZStack 切换** | `opacity + allowsHitTesting` | 秒切无延迟 |
| **缩略图缓存** | `ThumbnailGenerator` | 减少图片加载时间 |
| **焦点管理** | `@FocusState` | Digital Crown 即时响应 |
| **防抖机制** | `DispatchQueue.asyncAfter` | 避免重复触发 |
| **动画重置** | `forceResetAnimationState()` | 快速点击无累积 |

---

## 📐 设计模式总结

```
┌─────────────────────────────────────────────────────────────┐
│                         App 入口                            │
│                    CyberBugOffApp.swift                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      ImageModeView                          │
│                    （主导航容器）                             │
│  ┌────────────────────────┬────────────────────────┐       │
│  │    ImageGridView       │     SoundListView      │       │
│  │   （网格模式视图）        │    （音效列表视图）     │       │
│  └────────────────────────┴────────────────────────┘       │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ FullScreenImage │ │  SoundEditView  │ │ AppSettingsView │
│   （全屏展示）    │ │  （音效编辑）    │ │   （设置界面）   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

**文档版本**: 1.0  
**更新日期**: 2026-01-29
