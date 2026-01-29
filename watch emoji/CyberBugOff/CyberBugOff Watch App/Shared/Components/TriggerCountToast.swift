import SwiftUI

/// 触发次数显示管理器
class TriggerCountToastManager: ObservableObject {
    /// 是否显示提示
    @Published var isVisible = false
    
    /// 显示的次数
    @Published var count = 0
    
    /// 动画偏移量
    @Published var offsetY: CGFloat = 0
    @Published var offsetX: CGFloat = 0
    
    /// 点击位置（用于定位Toast显示位置）
    @Published var clickPosition: CGPoint = CGPoint(x: 0, y: 0)

    /// 上一次显示的位置（用于回溯触发）
    @Published var lastDisplayPosition: CGPoint = CGPoint(x: 98, y: 120) // 默认屏幕中央

    /// 动画透明度
    @Published var opacity: Double = 1.0
    
    /// 动画缩放
    @Published var scale: CGFloat = 1.0
    
    /// 动画旋转
    @Published var rotation: Double = 0.0
    
    /// 当前颜色
    @Published var currentColor: Color = .white
    
    /// 颜色列表
    @Published var colorList: [Color] = [.white]
    
    /// 当前颜色索引
    private var currentColorIndex = 0

    /// 自定义配置
    @Published var customConfig: CustomTriggerDisplay? = nil

    /// 计时器
    private var timer: Timer?
    
    /// 显示触发次数提示（传统模式）
    func showTriggerCount(_ count: Int) {
        showCustomTrigger(count: count, text: "+\(count)", color: .white, animationStyle: .bounce)
    }
    
    /// 显示触发次数提示（传统模式，带点击位置）
    func showTriggerCount(_ count: Int, at position: CGPoint) {
        showCustomTrigger(count: count, text: "+\(count)", color: .white, animationStyle: .bounce, at: position)
    }
    
    /// 显示自定义触发提示（单色版本 - 向后兼容）
    func showCustomTrigger(count: Int, text: String, color: Color, animationStyle: TriggerAnimationStyle) {
        showCustomTrigger(count: count, text: text, colors: [color], animationStyle: animationStyle)
    }
    
    /// 显示自定义触发提示（单色版本，带点击位置）
    func showCustomTrigger(count: Int, text: String, color: Color, animationStyle: TriggerAnimationStyle, at position: CGPoint) {
        showCustomTrigger(count: count, text: text, colors: [color], animationStyle: animationStyle, at: position)
    }
    
    /// 显示自定义触发提示（多色版本）
    func showCustomTrigger(count: Int, text: String, colors: [Color], animationStyle: TriggerAnimationStyle) {
        showCustomTrigger(count: count, text: text, colors: colors, animationStyle: animationStyle, at: nil)
    }

    /// 显示回溯触发提示（使用上一次显示的位置）
    func showBacktrackTrigger(count: Int, text: String, colors: [Color], animationStyle: TriggerAnimationStyle) {
        showCustomTrigger(count: count, text: text, colors: colors, animationStyle: animationStyle, at: lastDisplayPosition)
    }

    /// 显示自定义触发提示（完整配置版本）
    func showCustomTrigger(count: Int, config: CustomTriggerDisplay, colors: [Color]) {
        showCustomTrigger(count: count, config: config, colors: colors, at: nil)
    }

    /// 显示自定义触发提示（完整配置版本，带点击位置）
    func showCustomTrigger(count: Int, config: CustomTriggerDisplay, colors: [Color], at position: CGPoint?) {
        // 取消之前的计时器
        timer?.invalidate()

        // 如果当前已经显示Toast，强制立即隐藏以防止动画冲突
        if isVisible {
            isVisible = false
        }

        // 如果提供了点击位置，则设置点击位置；否则使用屏幕中央
        if let position = position {
            self.clickPosition = position
            // 记录这次显示的位置，用于回溯触发
            self.lastDisplayPosition = position
        } else {
            // 自动触发时使用屏幕中央位置（Watch屏幕大小约为 196x240）
            self.clickPosition = CGPoint(x: 98, y: 120)
            // 记录这次显示的位置，用于回溯触发
            self.lastDisplayPosition = CGPoint(x: 98, y: 120)
        }

        // 强制重置所有动画状态，确保没有累积效果
        forceResetAnimationState()

        // 更新次数和配置
        self.count = count
        self.customConfig = config  // 保存完整配置


        // 保存颜色列表
        self.colorList = colors.isEmpty ? [.white] : colors

        // 选择当前颜色并递增索引以便下次使用
        if colorList.count > 1 {
            if currentColorIndex >= colorList.count {
                currentColorIndex = 0
            }
            self.currentColor = colorList[currentColorIndex]
            self.currentColorIndex = (currentColorIndex + 1) % colorList.count
        } else {
            self.currentColor = colorList[0]
        }

        // 显示提示
        withAnimation(.easeOut(duration: 0.1)) {
            isVisible = true
        }

        // 延迟开始动画，让用户看到Toast首先出现在点击位置
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.executeAnimation(style: config.getCurrentAnimationStyle())
        }

        // 设置清理计时器
        timer = Timer.scheduledTimer(withTimeInterval: AppTheme.toastDisplayDuration + 0.1, repeats: false) { [weak self] _ in
            self?.isVisible = false
        }
    }

    /// 显示回溯触发提示（完整配置版本）
    func showBacktrackTrigger(count: Int, config: CustomTriggerDisplay, colors: [Color]) {
        showCustomTrigger(count: count, config: config, colors: colors, at: lastDisplayPosition)
    }

    /// 清除自定义配置缓存（用于模式切换时）
    func clearCustomConfig() {
        self.customConfig = nil
    }
    
    /// 显示自定义触发提示（多色版本，带点击位置）
    func showCustomTrigger(count: Int, text: String, colors: [Color], animationStyle: TriggerAnimationStyle, at position: CGPoint?) {
        // 取消之前的计时器
        timer?.invalidate()
        
        // 如果当前已经显示Toast，强制立即隐藏以防止动画冲突
        if isVisible {
            isVisible = false
        }

        // 如果提供了点击位置，则设置点击位置；否则使用屏幕中央
        if let position = position {
            self.clickPosition = position
            // 记录这次显示的位置，用于回溯触发
            self.lastDisplayPosition = position
        } else {
            // 自动触发时使用屏幕中央位置（Watch屏幕大小约为 196x240）
            self.clickPosition = CGPoint(x: 98, y: 120)
            // 记录这次显示的位置，用于回溯触发
            self.lastDisplayPosition = CGPoint(x: 98, y: 120)
        }
        
        // 强制重置所有动画状态，确保没有累积效果
        forceResetAnimationState()
        
        // 更新次数和显示文本
        self.count = count
        
        // 保存颜色列表
        self.colorList = colors.isEmpty ? [.white] : colors
        
        // 选择当前颜色并递增索引以便下次使用
        if colorList.count > 1 {
            if currentColorIndex >= colorList.count {
                currentColorIndex = 0
            }
            self.currentColor = colorList[currentColorIndex]
            self.currentColorIndex = (currentColorIndex + 1) % colorList.count
        } else {
            self.currentColor = colorList[0]
        }
        
        // 显示提示
        withAnimation(.easeOut(duration: 0.1)) {
            isVisible = true
        }
        
        // 延迟开始动画，让用户看到Toast首先出现在点击位置
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.executeAnimation(style: animationStyle)
        }
        
        // 设置清理计时器
        timer = Timer.scheduledTimer(withTimeInterval: AppTheme.toastDisplayDuration + 0.1, repeats: false) { [weak self] _ in
            self?.isVisible = false
        }
    }
    
    /// 重置动画状态
    private func resetAnimationState() {
        offsetY = 0
        offsetX = 0
        opacity = 1.0
        scale = 1.0
        rotation = 0.0
    }
    
    /// 强制重置动画状态（用于快速点击时防止累积效果）
    private func forceResetAnimationState() {
        // 立即移除所有正在进行的动画并重置状态
        withAnimation(.linear(duration: 0)) {
            offsetY = 0
            offsetX = 0
            opacity = 1.0
            scale = 1.0
            rotation = 0.0
        }
    }
    
    /// 执行不同的动画效果
    private func executeAnimation(style: TriggerAnimationStyle) {
        guard let params = AppTheme.toastAnimationConfigs[style] else { return }
        
        switch style {
        case .bounce:
            // 弹跳动画 - 从点击位置开始向上移动
            withAnimation(.interpolatingSpring(stiffness: 300, damping: 10)) {
                offsetY = params.primaryOffsetY
            }
            if let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(params.primaryDuration)) {
                    opacity = 0.0
                    offsetY = finalY
                }
            }
            
        case .scale:
            // 缩放动画 - 从点击位置开始
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration)) {
                    scale = primaryScale
                    offsetY = params.primaryOffsetY
                }
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(params.primaryDuration)) {
                    scale = finalScale
                    opacity = 0.0
                    offsetY = finalY
                }
            }
            
        case .slide:
            // 滑动动画 - 从点击位置开始
            withAnimation(.easeOut(duration: params.primaryDuration)) {
                if let finalX = params.finalOffsetX {
                    offsetX = finalX
                }
                offsetY = params.primaryOffsetY
                opacity = 0.0
            }
            
        case .fade:
            // 渐显动画 - 从点击位置开始
            withAnimation(.easeInOut(duration: params.primaryDuration)) {
                opacity = 0.0
                offsetY = params.primaryOffsetY
            }
            
        case .rotate:
            // 旋转动画 - 从点击位置开始
            withAnimation(.easeOut(duration: params.primaryDuration)) {
                if let rotation = params.primaryRotation {
                    self.rotation = rotation
                }
                offsetY = params.primaryOffsetY
                opacity = 0.0
            }
            
        case .heart:
            // 心跳动画 - 多阶段动画，从点击位置开始
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration)) {
                    scale = primaryScale
                    offsetY = params.primaryOffsetY
                }
            }
            
            if let midScale = params.midScale, let midDuration = params.midDuration {
                withAnimation(.easeOut(duration: midDuration).delay(params.primaryDuration)) {
                    scale = midScale
                    offsetY = 0  // 改为0，基于点击位置
                }
            }
            
            // 第二次心跳
            let secondBeatDelay = params.primaryDuration + (params.midDuration ?? 0)
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration).delay(secondBeatDelay)) {
                    scale = primaryScale * 0.9  // 稍微小一点的第二次心跳
                    offsetY = params.primaryOffsetY
                }
            }
            
            // 最终消失
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                let finalDelay = secondBeatDelay + params.primaryDuration
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(finalDelay)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
            
        case .flip:
            // 翻转动画 - Y轴翻转效果
            if let rotation = params.primaryRotation {
                withAnimation(.easeInOut(duration: params.primaryDuration)) {
                    self.rotation = rotation
                    offsetY = params.primaryOffsetY
                }
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(params.primaryDuration)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
            
        case .wave:
            // 波浪动画 - 上下波动效果
            if let primaryScale = params.primaryScale {
                withAnimation(.easeInOut(duration: params.primaryDuration / 4).repeatCount(3, autoreverses: true)) {
                    offsetY = params.primaryOffsetY
                    scale = primaryScale
                }
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(params.primaryDuration)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
            
        case .pulse:
            // 脉冲动画 - 快速缩放脉冲
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration)) {
                    scale = primaryScale
                    offsetY = params.primaryOffsetY
                }
            }
            if let midScale = params.midScale, let midDuration = params.midDuration {
                withAnimation(.easeInOut(duration: midDuration).delay(params.primaryDuration)) {
                    scale = midScale
                }
            }
            // 第二次脉冲
            let secondPulseDelay = params.primaryDuration + (params.midDuration ?? 0)
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration).delay(secondPulseDelay)) {
                    scale = primaryScale * 0.8
                }
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                let finalDelay = secondPulseDelay + params.primaryDuration
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(finalDelay)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
            
        case .sparkle:
            // 闪烁动画 - 快速变化的缩放和透明度
            if let primaryScale = params.primaryScale {
                withAnimation(.easeOut(duration: params.primaryDuration)) {
                    scale = primaryScale
                    offsetY = params.primaryOffsetY
                    opacity = 0.3
                }
            }
            if let midScale = params.midScale, let midDuration = params.midDuration {
                withAnimation(.easeInOut(duration: midDuration).delay(params.primaryDuration)) {
                    scale = midScale
                    opacity = 1.0
                }
            }
            // 多次闪烁
            let sparkleDelay = params.primaryDuration + (params.midDuration ?? 0)
            for i in 0..<3 {
                let delay = sparkleDelay + Double(i) * 0.1
                withAnimation(.linear(duration: 0.05).delay(delay)) {
                    opacity = i % 2 == 0 ? 0.2 : 1.0
                }
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(sparkleDelay + 0.3)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
            
        case .spiral:
            // 螺旋动画 - 旋转并螺旋向上
            if let rotation = params.primaryRotation, let finalX = params.finalOffsetX, let finalScale = params.finalScale, let finalY = params.finalOffsetY {
                withAnimation(.easeOut(duration: params.primaryDuration)) {
                    self.rotation = rotation
                    offsetX = finalX * sin(rotation * .pi / 180)
                    offsetY = finalY
                    scale = finalScale
                    opacity = 0.0
                }
            }
            
        case .shake:
            // 摇摆动画 - 左右摇摆
            let shakeAmount: CGFloat = 8
            for i in 0..<6 {
                let delay = Double(i) * 0.1
                let direction: CGFloat = i % 2 == 0 ? shakeAmount : -shakeAmount
                withAnimation(.linear(duration: 0.1).delay(delay)) {
                    offsetX = direction
                }
            }
            withAnimation(.easeInOut(duration: 0.1).delay(0.6)) {
                offsetX = 0
                offsetY = params.primaryOffsetY
            }
            if let finalScale = params.finalScale, let finalY = params.finalOffsetY, let finalDuration = params.finalDuration {
                withAnimation(.easeOut(duration: AppTheme.toastDisplayDuration * finalDuration).delay(params.primaryDuration)) {
                    scale = finalScale
                    offsetY = finalY
                    opacity = 0.0
                }
            }
        }
    }
    
    deinit {
        timer?.invalidate()
    }
}

/// 触发次数显示视图
struct TriggerCountToast: View {
    @Binding var isVisible: Bool
    @Binding var offsetY: CGFloat
    @Binding var offsetX: CGFloat
    @Binding var opacity: Double
    @Binding var scale: CGFloat
    @Binding var rotation: Double
    @Binding var clickPosition: CGPoint
    let count: Int
    let text: String
    let color: Color
    let useClickPosition: Bool
    
    // 简化的初始化器（向后兼容）
    init(isVisible: Binding<Bool>, offsetY: Binding<CGFloat>, opacity: Binding<Double>, count: Int) {
        self._isVisible = isVisible
        self._offsetY = offsetY
        self._offsetX = .constant(0)
        self._opacity = opacity
        self._scale = .constant(1.0)
        self._rotation = .constant(0.0)
        self._clickPosition = .constant(CGPoint.zero)
        self.count = count
        self.text = "+\(count)"
        self.color = .white
        self.useClickPosition = false
    }
    
    // 完整的初始化器
    init(isVisible: Binding<Bool>, offsetY: Binding<CGFloat>, offsetX: Binding<CGFloat>, opacity: Binding<Double>, scale: Binding<CGFloat>, rotation: Binding<Double>, count: Int, text: String, color: Color) {
        self._isVisible = isVisible
        self._offsetY = offsetY
        self._offsetX = offsetX
        self._opacity = opacity
        self._scale = scale
        self._rotation = rotation
        self._clickPosition = .constant(CGPoint.zero)
        self.count = count
        self.text = text
        self.color = color
        self.useClickPosition = false
    }
    
    // 支持点击位置的初始化器
    init(isVisible: Binding<Bool>, offsetY: Binding<CGFloat>, offsetX: Binding<CGFloat>, opacity: Binding<Double>, scale: Binding<CGFloat>, rotation: Binding<Double>, clickPosition: Binding<CGPoint>, count: Int, text: String, color: Color, useClickPosition: Bool = true) {
        self._isVisible = isVisible
        self._offsetY = offsetY
        self._offsetX = offsetX
        self._opacity = opacity
        self._scale = scale
        self._rotation = rotation
        self._clickPosition = clickPosition
        self.count = count
        self.text = text
        self.color = color
        self.useClickPosition = useClickPosition
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                if isVisible {
                    Text(text)
                        .font(.system(size: AppTheme.adaptiveSize(22), weight: .bold))
                        .foregroundColor(color)
                        .opacity(opacity)
                        .scaleEffect(scale)
                        .rotationEffect(.degrees(rotation))
                        .position(
                            x: useClickPosition ? (clickPosition.x + offsetX) : (geometry.size.width / 2 + offsetX),
                            y: useClickPosition ? (clickPosition.y + offsetY) : (geometry.size.height / 2 + offsetY)
                        )
                        .allowsHitTesting(false)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// 自定义触发次数显示视图
struct CustomTriggerToast: View {
    @ObservedObject var manager: TriggerCountToastManager
    let config: CustomTriggerDisplay
    let currentCount: Int
    let useClickPosition: Bool
    
    // 默认初始化器（向后兼容）
    init(manager: TriggerCountToastManager, config: CustomTriggerDisplay, currentCount: Int) {
        self.manager = manager
        self.config = config
        self.currentCount = currentCount
        self.useClickPosition = false
    }
    
    // 支持点击位置的初始化器
    init(manager: TriggerCountToastManager, config: CustomTriggerDisplay, currentCount: Int, useClickPosition: Bool) {
        self.manager = manager
        self.config = config
        self.currentCount = currentCount
        self.useClickPosition = useClickPosition
    }
    
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
                        .allowsHitTesting(false)
                }
            }
        }
        .allowsHitTesting(false)
    }
    
    // 安全获取显示颜色
    private func getDisplayColor() -> Color {
        // 确保颜色列表不为空
        guard !manager.colorList.isEmpty else {
            return config.getColor() // 使用配置中的颜色作为后备
        }
        
        // 多色模式
        if manager.colorList.count > 1 {
            return manager.currentColor
        }
        
        // 单色模式
        return manager.colorList[0]
    }
}

/// 图片触发动画管理器
class ImageTriggerAnimationManager: ObservableObject {
    /// 缩放比例
    @Published var scale: CGFloat = 1.0
    
    /// 防止快速触发的标记
    private var isAnimating = false
    
    /// 执行触发动画
    func triggerAnimation() {
        // 防止快速点击导致动画冲突
        guard !isAnimating else { return }
        
        isAnimating = true
        
        // 强制重置到初始状态
        withAnimation(.linear(duration: 0)) {
            scale = 1.0
        }
        
        // 延迟一帧确保重置完成
        DispatchQueue.main.async {
            // 阶段1：轻微放大（模拟按压瞬间）
            withAnimation(.easeOut(duration: 0.08)) {
                self.scale = 1.02  // 轻微放大
            }
            
            // 阶段2：平滑恢复（自然回弹）
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                withAnimation(.easeOut(duration: 0.15)) {
                    self.scale = 1.0
                }
                
                // 动画完成后重置标记
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    self.isAnimating = false
                }
            }
        }
    }
}

/// 可点击的Toast容器视图 - 捕获点击位置并显示Toast
struct ClickableToastView<Content: View>: View {
    @ObservedObject var toastManager: TriggerCountToastManager
    let content: Content
    let onTap: (CGPoint) -> Void
    
    init(toastManager: TriggerCountToastManager, onTap: @escaping (CGPoint) -> Void, @ViewBuilder content: () -> Content) {
        self.toastManager = toastManager
        self.onTap = onTap
        self.content = content()
    }
    
    var body: some View {
        content
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        // 只有当拖拽距离很小时才认为是点击（避免滑动时触发）
                        let dragDistance = sqrt(pow(value.translation.width, 2) + pow(value.translation.height, 2))
                        if dragDistance < 10 { // 10像素以内认为是点击
                            let location = value.location
                            
                            // 添加防抖机制，避免快速重复点击
                            DispatchQueue.main.async {
                                onTap(location)
                            }
                        }
                    }
            )
            .overlay(
                GeometryReader { _ in
                    // Toast 覆盖层 - 直接使用点击位置，不再叠加额外偏移
                    if toastManager.isVisible {
                        Text("+\(toastManager.count)")
                            .font(.system(size: AppTheme.adaptiveSize(22), weight: .bold))
                            .foregroundColor(toastManager.currentColor)
                            .opacity(toastManager.opacity)
                            .scaleEffect(toastManager.scale)
                            .rotationEffect(.degrees(toastManager.rotation))
                            .position(
                                x: toastManager.clickPosition.x + toastManager.offsetX,
                                y: toastManager.clickPosition.y + toastManager.offsetY
                            )
                            .allowsHitTesting(false)
                    }
                }
            )
    }
}

/// 自定义可点击的Toast容器视图
struct CustomClickableToastView<Content: View>: View {
    @ObservedObject var toastManager: TriggerCountToastManager
    let config: CustomTriggerDisplay
    let currentCount: Int
    let content: Content
    let onTap: (CGPoint) -> Void
    
    // 添加对图片显示的支持
    private let imageManager: ImageManager?
    private let imageName: String?
    private let triggerManager: TriggerManager?
    private let isDebugMode: Bool
    
    // 缓存Toast图片，避免动画期间重复获取
    @State private var cachedToastImage: UIImage? = nil

    init(toastManager: TriggerCountToastManager, config: CustomTriggerDisplay, currentCount: Int, imageManager: ImageManager? = nil, imageName: String? = nil, triggerManager: TriggerManager? = nil, isDebugMode: Bool = false, onTap: @escaping (CGPoint) -> Void, @ViewBuilder content: () -> Content) {
        self.toastManager = toastManager
        self.config = config
        self.currentCount = currentCount
        self.imageManager = imageManager
        self.imageName = imageName
        self.triggerManager = triggerManager
        self.isDebugMode = isDebugMode
        self.onTap = onTap
        self.content = content()
    }
    
    var body: some View {
        content
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        // 只有当拖拽距离很小时才认为是点击（避免滑动时触发）
                        let dragDistance = sqrt(pow(value.translation.width, 2) + pow(value.translation.height, 2))
                        if dragDistance < 10 { // 10像素以内认为是点击
                            let location = value.location
                            
                            // 添加防抖机制，避免快速重复点击
                            DispatchQueue.main.async {
                                onTap(location)
                            }
                        }
                    }
            )
            .overlay(
                GeometryReader { _ in
                    // Toast 覆盖层 - 只有在触发提示开启且toast可见时才显示
                    if config.isEnabled && toastManager.isVisible {
                        let displayConfig = toastManager.customConfig ?? config
                        if displayConfig.displayMode == .image {
                            // 显示图片
                            imageToastView
                        } else {
                            // 显示文字
                            textToastView
                        }
                    }
                }
            )
            .onAppear {
                // 初始化时获取Toast图片
                loadToastImage()
            }
            .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("ToastImageCacheCleared"))) { _ in
                // 当Toast图片缓存被清除时，重新加载图片
                loadToastImage()
            }
            .onChange(of: isDebugMode) { _, _ in
                // 调试模式切换时重新获取图片
                loadToastImage()
            }
            .onChange(of: imageName) { _, _ in
                // 图片名称变化时重新获取图片
                loadToastImage()
            }
            .onChange(of: config.circleSelectionData) { _, _ in
                // 圈选数据变化时重新获取图片
                loadToastImage()
            }
            .onChange(of: config.customImageScale) { _, _ in
                // 图片缩放变化时重新获取图片
                loadToastImage()
            }
            .onChange(of: config.customImageOffset) { _, _ in
                // 图片偏移变化时重新获取图片
                loadToastImage()
            }
            .onChange(of: config.imageSize) { _, _ in
                // 图片大小变化时重新获取图片
                loadToastImage()
            }
    }
    
    /// 加载Toast图片到缓存
    private func loadToastImage() {
        guard let triggerManager = triggerManager,
              let imageName = imageName else {
            cachedToastImage = nil
            return
        }
        
        // 根据调试模式选择图片获取方法
        if isDebugMode {
            cachedToastImage = triggerManager.getCustomDisplayImageWithoutCache(for: imageName)
        } else {
            cachedToastImage = triggerManager.getCustomDisplayImage(for: imageName)
        }
    }
    
    // 文字Toast视图
    @ViewBuilder
    private var textToastView: some View {
        let displayConfig = toastManager.customConfig ?? config
        Text(displayConfig.getDisplayText(currentCount: currentCount))
            .font(.system(size: AppTheme.adaptiveSize(displayConfig.fontSize), weight: .bold))
            .foregroundColor(getDisplayColor())
            .opacity(toastManager.opacity)
            .scaleEffect(toastManager.scale)
            .rotationEffect(.degrees(toastManager.rotation))
            .position(
                x: toastManager.clickPosition.x + toastManager.offsetX,
                y: toastManager.clickPosition.y + toastManager.offsetY
            )
            .allowsHitTesting(false)
    }
    
    // 图片Toast视图
    @ViewBuilder
    private var imageToastView: some View {
        if let cachedToastImage = cachedToastImage {
            Image(uiImage: cachedToastImage)
                .resizable()
                .applyImageContentMode(config.imageContentMode)
                .frame(width: config.imageSize, height: config.imageSize)
                .opacity(toastManager.opacity)
                .scaleEffect(toastManager.scale)
                .rotationEffect(.degrees(toastManager.rotation))
                .position(
                    x: toastManager.clickPosition.x + toastManager.offsetX,
                    y: toastManager.clickPosition.y + toastManager.offsetY
                )
                .allowsHitTesting(false)
        } else {
            // 图片加载失败或未加载时的占位符
            Image(systemName: "photo")
                .font(.system(size: AppTheme.adaptiveSize(config.imageSize * 0.6)))
                .foregroundColor(.gray)
                .opacity(toastManager.opacity)
                .scaleEffect(toastManager.scale)
                .rotationEffect(.degrees(toastManager.rotation))
                .position(
                    x: toastManager.clickPosition.x + toastManager.offsetX,
                    y: toastManager.clickPosition.y + toastManager.offsetY
                )
                .allowsHitTesting(false)
        }
    }
    
    // 安全获取显示颜色
    private func getDisplayColor() -> Color {
        // 确保颜色列表不为空
        guard !toastManager.colorList.isEmpty else {
            return config.getColor() // 使用配置中的颜色作为后备
        }
        
        // 多色模式
        if toastManager.colorList.count > 1 {
            return toastManager.currentColor
        }
        
        // 单色模式
        return toastManager.colorList[0]
    }
}

/// 预览
#Preview {
    ZStack {
        Color.black.edgesIgnoringSafeArea(.all)
        
        TriggerCountToast(
            isVisible: .constant(true),
            offsetY: .constant(0),
            opacity: .constant(1.0),
            count: 5
        )
    }
} 
