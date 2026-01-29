/**
 * DisplayModeManager.swift - 显示模式状态管理器 ⭐ 核心文件
 * 
 * 📌 核心功能:
 *   - 单色/呼吸模式切换
 *   - 呼吸动画引擎 (Timer 50Hz + 颜色插值)
 *   - 自定义呼吸颜色编辑
 *   - 速度控制 + 电池保护
 * 
 * 💡 设计模式: ObservableObject (响应式状态)
 * 📖 详细文档: 见 TECHNICAL_GUIDE.md
 */

import SwiftUI

// MARK: - 显示模式管理器
class DisplayModeManager: ObservableObject {
    @Published var currentMode: DisplayMode = .solidColor
    @Published var isAnimating: Bool = false
    @Published var currentBreathingMode: BreathingMode = .warm
    @Published var currentBreathingColor: Color = .red
    
    // 呼吸模式参数
    @Published var breathingSpeed: Double = 10 {
        didSet {
            // 保存设置
            saveBreathingSettings()
            
            // 如果正在动画，重置动画以应用新速度
            if isAnimating && currentMode == .breathing {
                _resetBreathingAnimation()
            }
        }
    }
    
    // 颜色渐变控制
    @Published var transitionProgress: Double = 0.0
    @Published var fromColor: Color = .red
    @Published var toColor: Color = .blue
    
    // 颜色编辑控制
    @Published var isEditingBreathingColors: Bool = false
    @Published var editingColorIndex: Int = 0
    @Published var customBreathingColors: [Color] = [.red, .green, .blue]
    
    // 动画计时器
    private var breathingTimer: Timer?
    public var colorIndex: Int = 0
    public var nextColorIndex: Int = 1

    // 硬件保护管理器
    private let timeLimitManager = BreathingTimeLimitManager.shared
    private let batteryMonitor = BatteryMonitor.shared
    
    // 彩虹模式参数
    @Published var rainbowSpeed: Double = 1.0
    
    // 闪烁模式参数
    @Published var strobeSpeed: Double = 1.0
    @Published var strobeOnDuration: Double = 0.5
    @Published var strobeOffDuration: Double = 0.5
    
    // 构造函数
    init() {
        // 重置当前模式和呼吸模式
        currentMode = .solidColor
        currentBreathingMode = .warm
        
        // 一次性修复：强制清除所有错误的自定义颜色数据（仅执行一次）
        // clearAllCustomColors()
        
        // 加载呼吸速度设置
        loadBreathingSettings()
        
        // 加载当前呼吸模式的自定义颜色（会自动回退到默认颜色）
        loadCustomBreathingColors()
        
        // 重置闪烁模式参数
        strobeSpeed = 1.0
        strobeOnDuration = 0.5
        strobeOffDuration = 0.5

        // 启动电池监控
        batteryMonitor.startMonitoring()

        // 应用电池限制到初始速度
        applyBatteryLimitToCurrentSpeed()
    }
    
    // 强制清除所有自定义颜色数据
    private func clearAllCustomColors() {
        for mode in BreathingMode.allCases {
            let key = "breathingColors_\(mode.rawValue)"
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
    
    // 切换到下一个模式
    func toggleToNextMode() {
        // 获取下一个模式
        let nextMode = currentMode.next()
        
        // 如果当前是呼吸模式，先停止动画
        if currentMode == .breathing {
            stopAnimation()
        }
        
        // 切换到新模式
        currentMode = nextMode
        
        // 如果新模式是呼吸模式，开始动画
        if nextMode == .breathing {
            isAnimating = true
            startBreathingAnimation()
        }
    }
    
    // 切换到下一个呼吸模式
    func nextBreathingMode() {
        MembershipManager.shared.executeIfPremium {
            let allModes = BreathingMode.allCases
            if let currentIndex = allModes.firstIndex(of: self.currentBreathingMode) {
                let nextIndex = (currentIndex + 1) % allModes.count
                self.currentBreathingMode = allModes[nextIndex]
                
                // 加载新模式的自定义颜色
                self.loadCustomBreathingColors()
                
                // 重置并重新启动动画以应用新的颜色
                self.resetBreathingAnimation()
                
                ToastManager.shared.show(primaryText: "\(self.currentBreathingMode.name)")
            }
        }
    }
    
    // 切换到上一个呼吸模式
    func previousBreathingMode() {
        MembershipManager.shared.executeIfPremium {
            let allModes = BreathingMode.allCases
            if let currentIndex = allModes.firstIndex(of: self.currentBreathingMode) {
                let previousIndex = (currentIndex - 1 + allModes.count) % allModes.count
                self.currentBreathingMode = allModes[previousIndex]
                
                // 加载新模式的自定义颜色
                self.loadCustomBreathingColors()
                
                // 重置并重新启动动画以应用新的颜色
                self.resetBreathingAnimation()
                
                ToastManager.shared.show(primaryText: "\(self.currentBreathingMode.name)")
            }
        }
    }
    
    // 开始动画
    func startAnimation() {
        isAnimating = true
        // 根据不同模式启动相应的动画
        switch currentMode {
        case .solidColor:
            stopAnimation()
        case .breathing:
            startBreathingAnimation()
        }
    }
    
    // 停止动画
    func stopAnimation() {
        isAnimating = false
        breathingTimer?.invalidate()
        breathingTimer = nil

        // 停止时间限制计时器
        timeLimitManager.stopTimer()
    }
    
    // 重置呼吸动画 - 公开方法供外部调用
    func resetBreathingAnimation() {
        // 调用内部实现
        _resetBreathingAnimation()
    }
    
    // 重置呼吸动画的内部实现
    private func _resetBreathingAnimation() {
        // 保存当前动画状态
        let wasAnimating = isAnimating
        
        // 停止当前动画
        stopAnimation()
        
        // 重新加载当前模式的自定义颜色
        loadCustomBreathingColors()
        
        // 重置状态
        colorIndex = 0
        nextColorIndex = 1
        transitionProgress = 0.0
        
        // 获取颜色列表（使用最新加载的颜色）
        let colors = customBreathingColors.isEmpty ? currentBreathingMode.defaultColors : customBreathingColors
        
        // 确保颜色列表至少有两种颜色
        if colors.count > 1 {
            fromColor = colors[colorIndex]
            toColor = colors[nextColorIndex]
        } else if colors.count == 1 {
            fromColor = colors[0]
            toColor = colors[0]
        } else {
            // 预防空列表
            fromColor = .red
            toColor = .blue
        }
        
        // 更新当前显示颜色
        currentBreathingColor = fromColor
        
        // 如果之前在动画，则重新启动动画
        if wasAnimating {
            isAnimating = true
            startBreathingAnimation()
        }
    }
    
    // 加载指定模式的自定义颜色
    func loadCustomBreathingColors(forMode mode: BreathingMode) {
        // 暂存当前模式
        let originalMode = currentBreathingMode
        
        // 临时切换到目标模式
        currentBreathingMode = mode
        
        // 加载该模式的自定义颜色
        loadCustomBreathingColors()
        
        // 如果是当前模式，不需要恢复
        if originalMode != mode {
            // 恢复原始模式
            currentBreathingMode = originalMode
        }
    }
    
    // 呼吸动画 - 颜色渐变版本
    func startBreathingAnimation() {
        // 低电量时也允许呼吸模式，只是限制速度

        // 确保动画计时器被清理
        breathingTimer?.invalidate()

        // 启动时间限制
        timeLimitManager.startTimer(
            for: breathingSpeed,
            onTimeout: { [weak self] in
                self?.handleBreathingTimeout()
            }
        )

        // 获取颜色列表（优先使用customBreathingColors）
        let colors = customBreathingColors.isEmpty ? currentBreathingMode.defaultColors : customBreathingColors

        // 确保至少有两种颜色
        guard colors.count > 1 else {
            // 如果只有一种颜色，就固定显示它
            if colors.count == 1 {
                currentBreathingColor = colors[0]
            }
            return
        }
        
        // 初始化颜色索引
        colorIndex = 0
        nextColorIndex = 1
        
        // 设置初始颜色
        fromColor = colors[colorIndex]
        toColor = colors[nextColorIndex]
        
        // 初始化过渡进度
        transitionProgress = 0.0
        
        // 确保isAnimating状态为true
        isAnimating = true
        
        // 创建动画计时器
        breathingTimer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            // 获取最新的颜色列表
            let currentColors = self.customBreathingColors.isEmpty ? self.currentBreathingMode.defaultColors : self.customBreathingColors
            
            // 更新过渡进度
            self.transitionProgress += 0.005 * self.breathingSpeed
            
            // 检查是否完成一次过渡
            if self.transitionProgress >= 1.0 {
                // 完成过渡，切换到下一对颜色
                self.colorIndex = self.nextColorIndex
                self.nextColorIndex = (self.nextColorIndex + 1) % currentColors.count
                
                // 重置颜色和进度
                self.fromColor = currentColors[self.colorIndex]
                self.toColor = currentColors[self.nextColorIndex]
                self.transitionProgress = 0.0
            }
            
            // 计算当前颜色 - 使用平滑的过渡函数
            let progress = self.smoothStep(self.transitionProgress)
            self.currentBreathingColor = self.interpolateColor(from: self.fromColor, to: self.toColor, progress: progress)
        }
    }
    
    // 平滑过渡函数 - 使颜色过渡更自然
    private func smoothStep(_ x: Double) -> Double {
        // 三次平滑函数: 3x^2 - 2x^3
        return x * x * (3 - 2 * x)
    }
    
    // 颜色插值函数 - 计算两个颜色之间的中间颜色
    private func interpolateColor(from: Color, to: Color, progress: Double) -> Color {
        // 将Color转换为UIColor以访问RGB分量
        let fromUIColor = UIColor(from)
        let toUIColor = UIColor(to)
        
        // 提取RGB分量
        var fromR: CGFloat = 0, fromG: CGFloat = 0, fromB: CGFloat = 0, fromA: CGFloat = 0
        var toR: CGFloat = 0, toG: CGFloat = 0, toB: CGFloat = 0, toA: CGFloat = 0
        
        fromUIColor.getRed(&fromR, green: &fromG, blue: &fromB, alpha: &fromA)
        toUIColor.getRed(&toR, green: &toG, blue: &toB, alpha: &toA)
        
        // 线性插值每个分量
        let r = fromR + (toR - fromR) * CGFloat(progress)
        let g = fromG + (toG - fromG) * CGFloat(progress)
        let b = fromB + (toB - fromB) * CGFloat(progress)
        let a = fromA + (toA - fromA) * CGFloat(progress)
        
        // 创建新颜色
        return Color(red: Double(r), green: Double(g), blue: Double(b), opacity: Double(a))
    }
    
    // MARK: - 呼吸颜色编辑功能
    
    // 开始编辑呼吸颜色
    func startEditingBreathingColors() {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        // 记录当前动画状态
        let wasAnimating = isAnimating
        
        // 如果正在动画，暂停动画
        if wasAnimating {
            stopAnimation()
        }
        
        // 设置编辑状态
        isEditingBreathingColors = true
        editingColorIndex = 0
        
        // 加载当前模式的自定义颜色
        loadCustomBreathingColors()
        
        // 如果没有加载到自定义颜色，使用默认颜色
        if customBreathingColors.isEmpty {
            customBreathingColors = currentBreathingMode.defaultColors
        }
        
        // 保存动画状态，以便退出编辑后恢复
        if wasAnimating {
            // 在属性中记录状态
            self.isAnimating = wasAnimating
        }
    }
    
    // 完成编辑呼吸颜色
    func finishEditingBreathingColors() {
        // 保存自定义颜色
        saveCustomBreathingColors()
        
        // 不再切换到自定义模式，保持当前呼吸模式不变
        // currentBreathingMode = .custom
        
        // 重置编辑状态
        isEditingBreathingColors = false
        
        // 重置动画
        resetBreathingAnimation()
        
        // 如果之前在动画，重新启动动画
        if isAnimating {
            startBreathingAnimation()
        }
    }
    
    // 取消编辑呼吸颜色
    func cancelEditingBreathingColors() {
        // 重置编辑状态
        isEditingBreathingColors = false
        
        // 重置动画
        resetBreathingAnimation()
        
        // 如果之前在动画，重新启动动画
        if isAnimating {
            startBreathingAnimation()
        }
    }
    
    // 更新当前编辑的颜色
    func updateCurrentEditingColor(_ color: Color) {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        if editingColorIndex >= 0 && editingColorIndex < customBreathingColors.count {
            customBreathingColors[editingColorIndex] = color
        }
    }
    
    // 切换到下一个编辑颜色
    func nextEditingColor() {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        if customBreathingColors.count > 1 {
            editingColorIndex = (editingColorIndex + 1) % customBreathingColors.count
            // 移除Toast显示，由ContentView控制
        }
    }
    
    // 切换到上一个编辑颜色
    func previousEditingColor() {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        if customBreathingColors.count > 1 {
            editingColorIndex = (editingColorIndex - 1 + customBreathingColors.count) % customBreathingColors.count
            // 移除Toast显示，由ContentView控制
        }
    }
    
    // 获取当前编辑的颜色
    func getCurrentEditingColor() -> Color {
        if editingColorIndex >= 0 && editingColorIndex < customBreathingColors.count {
            return customBreathingColors[editingColorIndex]
        }
        return .red // 默认返回红色
    }
    
    // 添加新的颜色到序列
    func addColorToSequence(_ color: Color) {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        customBreathingColors.append(color)
        editingColorIndex = customBreathingColors.count - 1
    }
    
    // 从序列中删除当前颜色
    func removeCurrentColorFromSequence() {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        // 确保颜色数组不为空
        if customBreathingColors.count > 0 {
            // 检查是否是最后两个颜色
            if customBreathingColors.count <= 2 {
                // 不允许删除，至少需要保留两个颜色
                ToastManager.shared.show(primaryText: NSLocalizedString("toast.breathing.min.colors", comment: ""))
                return
            }
            
            // 删除当前颜色
            customBreathingColors.remove(at: editingColorIndex)
            
            // 调整索引
            if editingColorIndex >= customBreathingColors.count && customBreathingColors.count > 0 {
                editingColorIndex = customBreathingColors.count - 1
            }
            
            // 保存更改
            saveCustomBreathingColors()
            
            // 显示提示
            ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.deleted", comment: ""))
        }
    }
    
    // 删除当前编辑的颜色
    func removeCurrentEditingColor() {
        // 调用已有的方法删除当前颜色
        removeCurrentColorFromSequence()
    }
    
    // 在颜色序列头部添加颜色
    func addColorAtHead(_ color: Color) {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        // 在序列开头插入新颜色
        customBreathingColors.insert(color, at: 0)
        // 更新编辑索引为第一个颜色
        editingColorIndex = 0
        // 保存更改
        saveCustomBreathingColors()
    }
    
    // 在颜色序列尾部添加颜色
    func addColorAtTail(_ color: Color) {
        // 如果不是高级会员，则显示提示
        if !MembershipManager.shared.isPremium {
            // 这里需要通过通知或其他方式跳转到会员中心
            // 由于这个方法在Manager中，需要通过回调或通知
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        // 在序列末尾添加新颜色
        customBreathingColors.append(color)
        // 更新编辑索引为最后一个颜色
        editingColorIndex = customBreathingColors.count - 1
        // 保存更改
        saveCustomBreathingColors()
    }
    
    // 保存自定义呼吸颜色
    private func saveCustomBreathingColors() {
        // 将Color转换为可存储的格式
        let colorDataArray = customBreathingColors.map { color -> [CGFloat] in
            let uiColor = UIColor(color)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
            return [r, g, b, a]
        }
        
        // 将数据编码为Data
        if let colorData = try? JSONEncoder().encode(colorDataArray) {
            // 使用模式名称作为键，保存到UserDefaults
            let key = "breathingColors_\(currentBreathingMode.rawValue)"
            UserDefaults.standard.set(colorData, forKey: key)
        }
    }
    
    // 加载自定义呼吸颜色
    private func loadCustomBreathingColors() {
        // 使用模式名称作为键，从UserDefaults加载数据
        let key = "breathingColors_\(currentBreathingMode.rawValue)"
        if let colorData = UserDefaults.standard.data(forKey: key),
           let colorDataArray = try? JSONDecoder().decode([[CGFloat]].self, from: colorData) {
            
            // 将数据转换回Color
            let colors = colorDataArray.map { components -> Color in
                if components.count >= 4 {
                    return Color(red: Double(components[0]), 
                                green: Double(components[1]), 
                                blue: Double(components[2]), 
                                opacity: Double(components[3]))
                }
                return .red // 默认返回红色
            }
            
            // 确保至少有两种颜色
            if colors.count >= 2 {
                customBreathingColors = colors
                return
            }
        }
        
        // 如果没有找到自定义颜色，使用当前模式的默认颜色
        customBreathingColors = currentBreathingMode.defaultColors
    }
    
    // 保存呼吸速度设置
    private func saveBreathingSettings() {
        UserDefaults.standard.set(breathingSpeed, forKey: "breathingSpeed")
    }
    
    // 加载呼吸速度设置
    private func loadBreathingSettings() {
        if let savedSpeed = UserDefaults.standard.object(forKey: "breathingSpeed") as? Double {
            breathingSpeed = savedSpeed
        }
    }
} 

// MARK: - 重置设置
extension DisplayModeManager {
    // 重置到默认设置
    func resetToDefaults() {
        // 重置呼吸速度（考虑电池限制）
        let defaultSpeed: Double = 10
        let batteryMaxSpeed = batteryMonitor.getMaxAllowedSpeed()
        let deviceMaxSpeed: Double = 50
        let actualMaxSpeed = min(deviceMaxSpeed, batteryMaxSpeed)

        breathingSpeed = min(defaultSpeed, actualMaxSpeed)
        saveBreathingSettings()
        
        // 重置所有呼吸模式的自定义颜色
        for mode in BreathingMode.allCases {
            let key = "breathingColors_\(mode.rawValue)"
            UserDefaults.standard.removeObject(forKey: key)
        }
        
        // 重置彩虹模式速度
        rainbowSpeed = 1.0
        
        // 重置闪烁模式参数
        strobeSpeed = 1.0
        strobeOnDuration = 0.5
        strobeOffDuration = 0.5
        
        // 重置呼吸模式
        currentBreathingMode = .warm
        
        // 重置当前模式
        currentMode = .solidColor
        
        // 重置当前颜色
        currentBreathingColor = .red
        
        // 重置动画
        isAnimating = false
        
        // 重新加载当前模式的默认颜色（移除硬编码）
        loadCustomBreathingColors()
        
        // 触发UI更新
        objectWillChange.send()
    }
}

// MARK: - 速度控制
extension DisplayModeManager {
    // 减慢呼吸速度
    func decreaseSpeed() {
        let currentSpeed = breathingSpeed
        let decreaseAmount: Double
        
        if currentSpeed <= 10 {
            decreaseAmount = 1
        } else if currentSpeed <= 50 {
            decreaseAmount = 5
        } else if currentSpeed <= 100 {
            decreaseAmount = 10
        } else {
            decreaseAmount = 20
        }
        
        breathingSpeed = max(0, currentSpeed - decreaseAmount)
    }
    
    // 恢复默认呼吸速度
    func resetSpeed() {
        let defaultSpeed: Double = 10
        let batteryMaxSpeed = batteryMonitor.getMaxAllowedSpeed()
        let deviceMaxSpeed: Double = 50
        let actualMaxSpeed = min(deviceMaxSpeed, batteryMaxSpeed)

        breathingSpeed = min(defaultSpeed, actualMaxSpeed)
    }

    // 应用电池限制到当前速度
    private func applyBatteryLimitToCurrentSpeed() {
        let batteryMaxSpeed = batteryMonitor.getMaxAllowedSpeed()
        let deviceMaxSpeed: Double = 50
        let actualMaxSpeed = min(deviceMaxSpeed, batteryMaxSpeed)

        if breathingSpeed > actualMaxSpeed {
            breathingSpeed = actualMaxSpeed
        }
    }
    
    // 加快呼吸速度
    func increaseSpeed() {
        let currentSpeed = breathingSpeed

        // 检查电池限制（静默）
        if !batteryMonitor.canIncreaseSpeed(currentSpeed: currentSpeed) {
            return
        }

        let increaseAmount: Double

        // 更平缓的速度增长，避免过快跳跃
        if currentSpeed < 5 {
            increaseAmount = 1
        } else if currentSpeed < 15 {
            increaseAmount = 2
        } else if currentSpeed < 25 {
            increaseAmount = 3
        } else {
            increaseAmount = 5
        }

        // 同时考虑设备限制和电池限制
        let deviceMaxSpeed: Double = 50
        let batteryMaxSpeed = batteryMonitor.getMaxAllowedSpeed()
        let actualMaxSpeed = min(deviceMaxSpeed, batteryMaxSpeed)

        breathingSpeed = min(actualMaxSpeed, currentSpeed + increaseAmount)
    }

    // MARK: - 时间限制处理
    // 处理呼吸模式超时
    private func handleBreathingTimeout() {
        // 自动切换到单色模式
        currentMode = .solidColor
        stopAnimation()
    }
}

// MARK: - Color Extension for HEX
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
