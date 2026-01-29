import SwiftUI
import WatchKit

/// 优化的WatchOS色轮选择器
struct ColorWheel: View {
    // MARK: - 绑定属性
    @Binding var isPresented: Bool
    @Binding var selectedColor: Color
    @Binding var selectedPosition: CGPoint
    @Binding var hue: Double
    @Binding var saturation: Double
    @Binding var brightness: Double  // 亮度绑定
    @Binding var isMembershipCenterActive: Bool // 新增：会员中心激活状态
    
    // MARK: - 回调函数
    var onPositionChanged: (() -> Void)? = nil
    var onTouchingChanged: ((Bool) -> Void)? = nil
    var onBrightnessControlChange: ((Bool) -> Void)? = nil
    var onColorChanged: ((Color) -> Void)? = nil
    var onLongPress: (() -> Void)? = nil  // 新增长按回调
    var onTap: ((CGPoint) -> Void)? = nil  // 新增点击回调
    
    // MARK: - 静态缓存
    private static let cachedHueColors: [Color] = {
        var colors: [Color] = []
        let steps = 12 // 进一步减少步数，提高性能
        
        for i in 0...steps {
            let hue = Double(i) / Double(steps)
            colors.append(Color(hue: hue, saturation: 1.0, brightness: 1.0))
        }
        
        return colors
    }()
    
    // MARK: - 内部状态
    @State private var isDragging: Bool = false
    @State private var isInBrightnessRing: Bool = false // 是否在亮度环中
    @State private var selectedIndicatorSize: CGFloat = 18 // 选择器大小
    @State private var lastHapticFeedbackTime: Date = Date() // 上次触觉反馈时间
    @State private var hasMoved: Bool = false
    @State private var previousSaturation: Double = 0
    @State private var previousBrightness: Double = 0
    @State private var lastPosition: CGPoint = .zero // 记录上次位置
    @State private var lastFeedbackHue: Double = -1 // 记录上次反馈时的色相值
    
    // 新增：缓存亮度环渐变颜色，避免每次重算
    @State private var brightnessGradientColors: [Color] = []
    // 新增：记录上次量化后的hue/saturation，减小渐变重算频率
    @State private var lastQuantizedHue: Double = -1
    @State private var lastQuantizedSaturation: Double = -1
    
    // MARK: - 常量
    private let brightnessRingRatio: CGFloat = 0.2 // 亮度环宽度占总半径的比例
    private let feedbackThreshold: CGFloat = 5 // 反馈阈值
    private let hapticFeedbackCooldown: TimeInterval = 0.1 // 降低触觉反馈冷却时间，使反馈更频繁
    private let brightnessRingTolerance: CGFloat = 15 // 亮度环容差范围，使操作更平滑
    private let hueFeedbackSegments: Int = 12 // 将色相环分为12段，每段提供一次触觉反馈
    
    // MARK: - 环境对象
    @EnvironmentObject var toastManager: ToastManager
    @EnvironmentObject var displayModeManager: DisplayModeManager
    
    // MARK: - 视图构建
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // 获取基于比例的亮度环宽度
                let radius = min(geometry.size.width, geometry.size.height) / 2
                let brightnessRingWidth = radius * brightnessRingRatio
                
                // 色轮主体 - 色相和饱和度渐变
                ZStack {
                    // 亮度环 - 外环
                    buildBrightnessRing(geometry)
                    
                    // 色相环 - 内环
                    buildHueWheel(geometry)
                        .frame(width: geometry.size.width - brightnessRingWidth * 2, 
                              height: geometry.size.height - brightnessRingWidth * 2)
                        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
                }
                
                // 选择指示器
                ZStack {
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 3)
                        .frame(width: selectedIndicatorSize, height: selectedIndicatorSize)
                        .shadow(color: Color.black.opacity(0.3), radius: 2, x: 0, y: 1)
                    
                    // 选中的颜色预览
                    Circle()
                        .fill(selectedColor)
                        .frame(width: 12, height: 12)
                }
                .position(selectedPosition)
                
                // 整体触摸区域
                Circle()
                    .fill(Color.clear)
                    .contentShape(Circle())
                    // 先添加长按手势，给予高优先级
                    .highPriorityGesture(
                        LongPressGesture(minimumDuration: 1.0)
                            .onEnded { _ in
                                playHapticFeedback(.click)
                                onLongPress?()
                            }
                    )
                    // 再添加拖动手势
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                handleDragChange(value, geometry: geometry)
                            }
                            .onEnded { value in
                                handleDragEnd(value, geometry: geometry)
                                
                                // 拖动结束后触发点击回调
                                let distance = sqrt(
                                    pow(value.startLocation.x - value.location.x, 2) +
                                    pow(value.startLocation.y - value.location.y, 2)
                                ) 
                                
                                if distance < 5 { // 如果起始位置和结束位置很接近，视为点击
                                    onTap?(value.location)
                                    }
                            }
                    )
            }
            .onAppear {
                previousSaturation = saturation
                previousBrightness = brightness
                updatePositionFromHSB(geometry: geometry)
                // 仅首次出现时生成亮度渐变缓存
                brightnessGradientColors = generateBrightnessGradientColors()
                lastQuantizedHue = quantize(value: hue, precision: 0.05)
                lastQuantizedSaturation = quantize(value: saturation, precision: 0.05)
            }
            .onChange(of: hue) { oldValue, newValue in
                let qHue = quantize(value: newValue, precision: 0.05) // 20段
                if qHue != lastQuantizedHue {
                    lastQuantizedHue = qHue
                    brightnessGradientColors = generateBrightnessGradientColors()
                }
            }
            .onChange(of: saturation) { oldValue, newValue in
                if !isDragging && abs(previousSaturation - newValue) > 0.01 {
                    previousSaturation = newValue
                    updatePositionFromHSB(geometry: geometry)
                }
                let qSat = quantize(value: newValue, precision: 0.05)
                if qSat != lastQuantizedSaturation {
                    lastQuantizedSaturation = qSat
                    brightnessGradientColors = generateBrightnessGradientColors()
                }
            }
            .onChange(of: brightness) { oldValue, newValue in
                if !isDragging && isInBrightnessRing && abs(previousBrightness - newValue) > 0.01 {
                    previousBrightness = newValue
                    updatePositionFromBrightness(geometry: geometry)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
    
    // MARK: - 视图构建辅助方法
    
    // 构建亮度环
    private func buildBrightnessRing(_ geometry: GeometryProxy) -> some View {
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let radius = min(geometry.size.width, geometry.size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        
        return ZStack {
            // 使用当前色相和饱和度，但亮度不同的渐变
            Circle()
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: brightnessGradientColors),
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360)
                    ),
                    lineWidth: brightnessRingWidth
                )
                .frame(width: geometry.size.width - brightnessRingWidth, 
                      height: geometry.size.height - brightnessRingWidth)
                .position(center)
        }
    }
    
    // 构建色相-饱和度轮
    private func buildHueWheel(_ geometry: GeometryProxy) -> some View {
        let radius = min(geometry.size.width, geometry.size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        
        return ZStack {
            // 色相环
            AngularGradient(
                gradient: Gradient(colors: generateHueGradientColors()),
                center: .center,
                startAngle: .degrees(0),
                endAngle: .degrees(360)
            )
            
            // 饱和度
            RadialGradient(
                gradient: Gradient(colors: [.white, .clear]),
                center: .center,
                startRadius: 0,
                endRadius: min(geometry.size.width, geometry.size.height) / 2 - brightnessRingWidth
            )
            .blendMode(.screen)
        }
        .clipShape(Circle())
    }
    
    // MARK: - 事件处理方法
    
    // 处理拖动变化
    private func handleDragChange(_ value: DragGesture.Value, geometry: GeometryProxy) {
        // 标记正在拖动
        if !isDragging {
            isDragging = true
            onTouchingChanged?(true)
            
            // 发送触摸开始通知
            NotificationCenter.default.post(name: Notification.Name("colorWheelTouchBegan"), object: nil)
            
            // 初始点击时判断是在色轮还是亮度环中，并锁定到该区域
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let radius = min(geometry.size.width, geometry.size.height) / 2
            let brightnessRingWidth = radius * brightnessRingRatio
            let innerRadius = radius - brightnessRingWidth
            
            let dx = value.location.x - center.x
            let dy = value.location.y - center.y
            let distance = sqrt(dx*dx + dy*dy)
            
            // 初次判断是否在亮度环中
            if distance > innerRadius - brightnessRingTolerance/2 && distance < radius + brightnessRingTolerance/2 {
                // 进入亮度环
                isInBrightnessRing = true
                onBrightnessControlChange?(true)
                playHapticFeedback(.click)
                NotificationCenter.default.post(name: Notification.Name("brightnessControlActivated"), object: nil)
                selectedIndicatorSize = 20 // 亮度环中使用更大的选择器
            } else {
                // 在色轮内部
                isInBrightnessRing = false
                onBrightnessControlChange?(false)
                NotificationCenter.default.post(name: Notification.Name("brightnessControlDeactivated"), object: nil)
                selectedIndicatorSize = 18 // 色轮中使用标准大小的选择器
            }
        }
        
        // 获取中心点和半径
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let radius = min(geometry.size.width, geometry.size.height) / 2
        
        // 根据初始区域锁定，更新位置和值
        if isInBrightnessRing {
            // 在亮度环中，保持在亮度环上
            let adjustedPosition = adjustPositionToBrightnessRing(position: value.location, center: center, radius: radius)
            updateBrightnessFromPosition(adjustedPosition, in: geometry.size)
        } else {
            // 在色轮中，保持在色轮内
            updateColorFromPosition(value.location, in: geometry.size)
        }
    }
    
    // 处理拖动结束
    private func handleDragEnd(_ value: DragGesture.Value, geometry: GeometryProxy) {
        // 获取中心点和半径
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let radius = min(geometry.size.width, geometry.size.height) / 2
        
        // 最终更新位置和颜色
        if isInBrightnessRing {
            // 在亮度环中，使用调整后的位置更新亮度
            let adjustedPosition = adjustPositionToBrightnessRing(position: value.location, center: center, radius: radius)
            updateBrightnessFromPosition(adjustedPosition, in: geometry.size)
        } else {
            updateColorFromPosition(value.location, in: geometry.size)
        }
        
        // 标记拖动结束
        isDragging = false
        onTouchingChanged?(false)
        
        // 通知父视图有触摸结束
        onPositionChanged?()
        
        // 发送触摸结束通知
        NotificationCenter.default.post(name: Notification.Name("colorWheelTouchEnded"), object: nil)
    }
    
    // 将位置调整到亮度环上，使控制更精确
    private func adjustPositionToBrightnessRing(position: CGPoint, center: CGPoint, radius: CGFloat) -> CGPoint {
        let dx = position.x - center.x
        let dy = position.y - center.y
        
        // 计算角度
        var angle = atan2(dy, dx)
        if angle < 0 {
            angle += 2 * .pi
        }
        
        // 基于比例计算亮度环宽度
        let brightnessRingWidth = radius * brightnessRingRatio
        
        // 调整距离到亮度环中心
        let targetRadius = radius - brightnessRingWidth/2
        
        // 返回亮度环上对应角度的位置
        return CGPoint(
            x: center.x + cos(angle) * targetRadius,
            y: center.y + sin(angle) * targetRadius
        )
    }
    
    // MARK: - 位置和颜色计算
    
    /// 根据位置更新色相和饱和度
    private func updateColorFromPosition(_ position: CGPoint, in size: CGSize) {
        // 获取中心点和有效半径
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let radius = min(size.width, size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        let hueRadius = radius - brightnessRingWidth
        
        // 计算距离和角度
        let dx = position.x - center.x
        let dy = position.y - center.y
        let distance = sqrt(dx*dx + dy*dy)
        
        // 计算角度
        var angle = atan2(dy, dx)
        if angle < 0 {
            angle += 2 * .pi // 确保角度在0到2π之间
        }
        
        // 限制距离在色轮内部，确保不会超出色轮范围
        let clampedDistance = min(hueRadius, distance)
        
        // 计算最终位置，限制在色轮内部
        let finalPosition = CGPoint(
            x: center.x + cos(angle) * clampedDistance,
            y: center.y + sin(angle) * clampedDistance
        )
        
        // 计算HSB值
        var newHue = angle / (2 * .pi)
        newHue = newHue.truncatingRemainder(dividingBy: 1.0)
        
        // 饱和度为到中心的归一化距离，确保值在0-1范围内
        // 将饱和度舍入到0.01（表冠精度）的倍数
        var newSaturation = min(1.0, max(0.0, clampedDistance / hueRadius))
        newSaturation = round(newSaturation * 100) / 100 // 舍入到0.01的倍数
        
        // 检查是否有变化，避免不必要的更新
        let hasChanged = hue != newHue || saturation != newSaturation
        
        // 计算当前在哪个色相段
        let currentHueSegment = Int(newHue * Double(hueFeedbackSegments))
        let previousHueSegment = Int(hue * Double(hueFeedbackSegments))
        
        // 计算与上次位置的距离
        let positionDelta = sqrt(
            pow(finalPosition.x - lastPosition.x, 2) +
            pow(finalPosition.y - lastPosition.y, 2)
        )
        
        // 在以下情况提供触觉反馈：
        // 1. 跨越色相段界限时
        // 2. 饱和度变化明显时(>0.1)
        // 3. 位置变化足够大时(>5pt)
        if isDragging && (
            (currentHueSegment != previousHueSegment && lastFeedbackHue != Double(currentHueSegment)) ||
            abs(newSaturation - saturation) > 0.1 ||
            positionDelta > 5
        ) {
            playHapticFeedback(.click)
            lastFeedbackHue = Double(currentHueSegment)
        }
        
        // 更新最后位置
        lastPosition = finalPosition
        
        // 更新状态值 - 无动画更新，避免抖动
        withAnimation(.none) {
            // 更新颜色属性
            hue = newHue
            saturation = newSaturation
            let newColor = Color(hue: newHue, saturation: newSaturation, brightness: brightness)
            selectedColor = newColor
            
            // 更新位置 - 直接设置，不使用动画
            selectedPosition = finalPosition
            
            // 仅在颜色有变化时通知
            if hasChanged {
                onColorChanged?(newColor)
            }
        }
    }
    
    /// 根据位置更新亮度
    private func updateBrightnessFromPosition(_ position: CGPoint, in size: CGSize) {
        // 获取中心点
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let radius = min(size.width, size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        
        // 计算与中心的向量
        let dx = position.x - center.x
        let dy = position.y - center.y
        
        // 计算角度（0-2π）
        var angle = atan2(dy, dx)
        if angle < 0 {
            angle += 2 * .pi
        }
        
        // 简化亮度计算
        let normalizedAngle = angle / (2 * .pi) // 归一化到0-1
        
        // 使用查找表优化亮度计算 - 预定义四个区域
        let newBrightness: Double
        
        switch normalizedAngle {
        case 0..<0.25: // 0-90度，亮度从0.5降到0.05
            newBrightness = 0.5 - 0.45 * (normalizedAngle * 4)
        case 0.25..<0.5: // 90-180度，亮度从0.05升到0.5
            newBrightness = 0.05 + 0.45 * ((normalizedAngle - 0.25) * 4)
        case 0.5..<0.75: // 180-270度，亮度从0.5升到1.0
            newBrightness = 0.5 + 0.5 * ((normalizedAngle - 0.5) * 4)
        default: // 270-360度，亮度从1.0降到0.5
            newBrightness = 1.0 - 0.5 * ((normalizedAngle - 0.75) * 4)
        }
        
        // 确保亮度在有效范围内
        let clampedBrightness = max(0.05, min(1.0, newBrightness))
        let brightnessDifference = abs(brightness - clampedBrightness)
        
        // 简化的关键点检测
        let isNearMinBrightness = abs(normalizedAngle - 0.25) < 0.01 // 约3.6°范围
        let isNearMaxBrightness = abs(normalizedAngle - 0.75) < 0.01 // 约3.6°范围
        
        // 在关键点附近提供触觉反馈（仅当亮度变化显著时）
        if (isNearMinBrightness || isNearMaxBrightness) && brightnessDifference > 0.005 && isDragging {
            playHapticFeedback(.click)
        }
        
        // 更新选择器大小以提供视觉反馈
        withAnimation(.easeInOut(duration: 0.1)) {
            selectedIndicatorSize = (isNearMinBrightness || isNearMaxBrightness) ? 22 : 20
        }
        
        // 仅当亮度变化超过阈值或者这是拖动结束时更新
        if brightnessDifference > 0.01 || !isDragging {
            // 计算亮度环上的位置
            let finalPosition = CGPoint(
                x: center.x + cos(angle) * (radius - brightnessRingWidth/2),
                y: center.y + sin(angle) * (radius - brightnessRingWidth/2)
            )
            
            // 更新状态值
            withAnimation(.none) {
                brightness = clampedBrightness
                let newColor = Color(hue: hue, saturation: saturation, brightness: clampedBrightness)
                selectedColor = newColor
                selectedPosition = finalPosition
                
                // 仅在亮度有变化时通知
                if brightnessDifference > 0.001 {
                    onColorChanged?(newColor)
                }
            }
        }
    }
    
    /// 根据HSB值更新位置
    private func updatePositionFromHSB(geometry: GeometryProxy) {
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let radius = min(geometry.size.width, geometry.size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        let hueRadius = radius - brightnessRingWidth
        
        // 禁用动画以避免过渡时的跳跃
        withAnimation(.none) {
            // 通过传入的hue和saturation计算位置
            let angle = 2 * .pi * hue
            let distance = saturation * hueRadius
            
            // 更新指示器位置
            selectedPosition = CGPoint(
                x: center.x + cos(angle) * distance,
                y: center.y + sin(angle) * distance
            )
            
            // 确保颜色与位置同步
            selectedColor = Color(hue: hue, saturation: saturation, brightness: brightness)
        }
    }
    
    /// 根据亮度值更新位置
    private func updatePositionFromBrightness(geometry: GeometryProxy) {
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let radius = min(geometry.size.width, geometry.size.height) / 2
        let brightnessRingWidth = radius * brightnessRingRatio // 基于比例计算宽度
        
        withAnimation(.none) {
            // 将亮度映射回角度
            let angle: Double
            if brightness <= 0.5 {
                // 亮度从0.5到0映射到0到90度
                angle = asin(1 - 2 * brightness)
            } else {
                // 亮度从0.5到1映射到270到360度
                angle = .pi + asin(2 * brightness - 1)
            }
            
            // 计算亮度环上的位置
            selectedPosition = CGPoint(
                x: center.x + cos(angle) * (radius - brightnessRingWidth/2),
                y: center.y + sin(angle) * (radius - brightnessRingWidth/2)
            )
            
            // 确保颜色与亮度同步
            selectedColor = Color(hue: hue, saturation: saturation, brightness: brightness)
        }
    }
    
    // MARK: - 辅助方法
    
    /// 生成色相渐变颜色数组
    private func generateHueGradientColors() -> [Color] {
        return ColorWheel.cachedHueColors
    }
    
    /// 生成亮度渐变颜色数组
    private func generateBrightnessGradientColors() -> [Color] {
        let steps = 24 // 将步数进一步减少到24，提高性能
        
        var colors: [Color] = []
        for i in 0...steps {
            let angle = Double(i) * .pi * 2 / Double(steps)
            
            // 简化亮度计算，使用线性插值
            let normalizedAngle = angle / (2 * .pi) // 归一化到0-1
            let brightnessFactor: Double
            
            if normalizedAngle < 0.25 {
                // 0-90度，亮度从0.5降到0.05
                brightnessFactor = 0.5 - 0.45 * (normalizedAngle * 4)
            } else if normalizedAngle < 0.5 {
                // 90-180度，亮度从0.05升到0.5
                brightnessFactor = 0.05 + 0.45 * ((normalizedAngle - 0.25) * 4)
            } else if normalizedAngle < 0.75 {
                // 180-270度，亮度从0.5升到1.0
                brightnessFactor = 0.5 + 0.5 * ((normalizedAngle - 0.5) * 4)
            } else {
                // 270-360度，亮度从1.0降到0.5
                brightnessFactor = 1.0 - 0.5 * ((normalizedAngle - 0.75) * 4)
            }
            
            // 保持当前色相和饱和度，仅改变亮度
            colors.append(Color(hue: hue, saturation: saturation, brightness: brightnessFactor))
        }
        
        return colors
    }
    
    // MARK: - 触觉反馈
    private func playHapticFeedback(_ type: WKHapticType) {
        let now = Date()
        // 检查是否已经过了冷却时间
        if now.timeIntervalSince(lastHapticFeedbackTime) >= hapticFeedbackCooldown {
            WKInterfaceDevice.current().play(type)
            lastHapticFeedbackTime = now
        }
    }
    
    // 新增：量化工具函数，按给定精度舍入
    private func quantize(value: Double, precision: Double) -> Double {
        return (value / precision).rounded() * precision
    }
}

// MARK: - 预览
#Preview {
            ColorWheel(
                isPresented: .constant(true),
                selectedColor: .constant(.red),
        selectedPosition: .constant(.zero),
                hue: .constant(0.0),
                saturation: .constant(1.0),
        brightness: .constant(1.0),
        isMembershipCenterActive: .constant(false)
            )
            .frame(width: 180, height: 180)
}

// 纯SwiftUI实现的色轮，适用于watchOS
struct ColorWheelGradientView: View {
    var body: some View {
        ZStack {
            // 使用角度渐变控制色相
            AngularGradient(
                gradient: Gradient(colors: [
                    .red, .yellow, .green, .cyan,
                    .blue, .purple, .pink, .red
                ]),
                center: .center,
                startAngle: .degrees(0),
                endAngle: .degrees(360)
            )
            
            // 使用径向渐变来控制饱和度
            RadialGradient(
                gradient: Gradient(colors: [.white, .clear]),
                center: .center,
                startRadius: 0,
                endRadius: 200
            )
            .blendMode(.screen)
        }
        .mask(Circle())
    }
}

// 用于定位的扩展
extension CGRect {
    var mid: CGPoint {
        return CGPoint(x: midX, y: midY)
    }
}
