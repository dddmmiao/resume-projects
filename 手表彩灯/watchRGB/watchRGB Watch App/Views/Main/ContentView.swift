import SwiftUI
import WatchKit
import ObjectiveC
import CoreMotion

/**
 * ContentView.swift - 应用程序主视图
 *
 * 代码结构:
 * - 属性和状态变量
 * - 视图主体和布局
 * - 表冠旋转处理
 * - 颜色选择器模式切换
 * - 通知和辅助方法
 */

// 用于通知观察者的类
class ObserverTarget: NSObject {}

// MARK: - 主视图
struct ContentView: View {
    // 通知观察者键
    static public var observerKey: UInt8 = 0
    // MARK: - 常量
    // 预设颜色列表的初始值
    public let initialColorList: [ColorInfo] = [
        ColorInfo(name: "红色", red: 255, green: 0, blue: 0),
        ColorInfo(name: "绿色", red: 0, green: 255, blue: 0),
        ColorInfo(name: "蓝色", red: 0, green: 0, blue: 255),
        ColorInfo(name: "黄色", red: 255, green: 255, blue: 0),
        ColorInfo(name: "紫色", red: 128, green: 0, blue: 128),
        ColorInfo(name: "青色", red: 0, green: 255, blue: 255),
        ColorInfo(name: "淡黄色", red: 249, green: 244, blue: 220),  // #f9f4dc
        ColorInfo(name: "亮橙色", red: 255, green: 153, blue: 0),    // #ff9900
        ColorInfo(name: "鲜红色", red: 237, green: 51, blue: 33),    // #ed3321
        ColorInfo(name: "玫瑰粉", red: 237, green: 47, blue: 106),   // #ed2f6a
        ColorInfo(name: "深紫色", red: 126, green: 22, blue: 113),   // #7e1671
        ColorInfo(name: "宝蓝色", red: 22, green: 97, blue: 171),    // #1661ab
        ColorInfo(name: "天青色", red: 81, green: 196, blue: 211),   // #51c4d3
        ColorInfo(name: "鲜绿色", red: 65, green: 179, blue: 73),    // #41b349
        ColorInfo(name: "深棕色", red: 92, green: 55, blue: 25),     // #5c3719
        ColorInfo(name: "中性灰", red: 134, green: 126, blue: 118)   // #867e76
    ]
    // 色轮配置
    public let config = ColorWheelConfig()
    // MARK: - 状态变量
    // 显示模式管理器
    @StateObject public var displayModeManager = DisplayModeManager()
    // 颜色相关状态
    @State public var currentColorIndex: Int = 0
    @State public var isCustomColor: Bool = false
    @State public var isRandomColor: Bool = false  // 标记当前颜色是否来自随机生成
    @State public var customColor: Color = .red
    @State public var customHue: Double = 0
    @State public var customSaturation: Double = 1
    @State public var customBrightness: Double = 1
    @State public var colorList: [ColorInfo] = []  // 动态颜色列表
    @State public var initialViewColor: Color = .red
    @State public var initialViewHue: Double = 0
    @State public var initialViewSaturation: Double = 1
    @State public var initialViewBrightness: Double = 1
    // UI状态
    @State public var gestureActive: Bool = false
    @State public var showColorWheel: Bool = false
    @State public var selectedPosition: CGPoint = .zero
    @State public var colorWheelResetCounter: Int = 0
    @State public var addColorMode: AddColorMode = .none  // 颜色新增模式
    @State public var buttonAnimationsEnabled: Bool = true // 控制按钮是否执行过渡动画
    @State public var showBreathingControls: Bool = false // 控制呼吸模式速度调节按钮的显示
    @State public var breathingControlsTimer: Timer? = nil // 自动隐藏按钮的计时器
    @State private var showEpilepsyWarning: Bool = false // 控制癫痫警告弹窗的显示
    @State private var epilepsyWarningShown: Bool = false // 记录是否已显示过癫痫警告
    @State public var showSettingsButton: Bool = false // 控制设置按钮的显示
    @State public var settingsButtonTimer: Timer? = nil // 自动隐藏设置按钮的计时器
    @State public var showSettingsView: Bool = false // 控制设置视图的显示
    // 摇晃状态
    @State public var isShaking: Bool = false // 是否正在摇晃
    // 交互控制状态
    @State public var crownValue: Double = 1.0  // 表冠状态 - 用于控制亮度或饱和度
    @State public var isTouching: Bool = false  // 是否正在触摸屏幕
    @State public var ignoreTableCrownUpdates: Bool = false  // 是否忽略表冠更新
    @State public var lastTapTime: Date = Date()  // 最后一次点击时间
    @State public var isRGBPickerActive: Bool = false  // RGB选择器是否激活，用于隔离表冠控制
    @State public var userInteractionState: UserInteractionState = .none  // 用户交互状态
    // 颜色选择器状态
    @State public var currentSelectorMode: ColorSelectorMode = .colorWheel
    @EnvironmentObject var brightnessManager: BrightnessManager
    // 防重复变量
    @State public var lastSyncedValue: Double? = nil // 用于记录上次同步的值，防止重复同步
    @State public var isSynchronizing: Bool = false // 防止并发同步
    @State public var lastSyncTime: Date = Date() // 记录上次同步时间
    @State public var isClosingColorWheel: Bool = false // 记录是否正在关闭色轮
    // 状态变量
    @State private var showUI: Bool = true
    @State private var showSettings: Bool = false
    @State private var isColorSelectorPresented: Bool = false
    @State private var motionManager = CMMotionManager()
    @State private var canDetectShake: Bool = true
    @State private var isShowingMembershipCenter: Bool = false
    @State internal var isMembershipCenterActive: Bool = false // 新增：跟踪会员中心是否正在显示
    @State private var preMembershipButtonState: (shouldShowRestore: Bool, shouldShowAdd: Bool)? = nil // 新增：保存会员中心打开前的按钮状态
    @StateObject private var tutorialManager = TutorialManager.shared // 新增：引导管理器
    @State private var showFirstLaunchTutorial: Bool = false // 新增：控制初次安装引导显示
    @State private var showOptimalSettingsGuide: Bool = false // 新增：控制最佳设置引导显示
    @State private var shouldSuppressColorToast: Bool = false
    @State public var previousColorIndexForRandom: Int? = nil // 随机颜色前的颜色索引

    // MARK: - 计算属性
    public var currentColor: Color {
        // 如果是自定义颜色，返回自定义颜色
        if isCustomColor {
            return customColor
        }
        
        // 确保colorList不为空且索引有效
        if colorList.isEmpty {
            return .white // 默认返回白色
        }
        
        // 确保索引在有效范围内
        let safeIndex = min(currentColorIndex, colorList.count - 1)
        return colorList[safeIndex].color
    }
    public var currentColorInfo: ColorInfo {
        // 如果是自定义颜色，返回自定义颜色信息
        if isCustomColor {
            return ColorInfo.fromColor(customColor)
        }
        
        // 确保colorList不为空且索引有效
        if colorList.isEmpty {
            return ColorInfo(name: "红色", red: 255, green: 0, blue: 0) // 默认返回红色
        }
        
        // 确保索引在有效范围内
        let safeIndex = min(currentColorIndex, colorList.count - 1)
        return colorList[safeIndex]
    }
    // 计算是否显示添加按钮（如果是新颜色且不在列表中）
    public var shouldShowAddButton: Bool {
        // 如果会员中心刚刚关闭，使用保存的状态
        if let savedState = preMembershipButtonState {
            return savedState.shouldShowAdd
        }

        // 如果处于新增颜色模式，始终显示添加按钮
        if addColorMode != .none {
            return true
        }

        // 如果是随机颜色，也应该显示添加按钮
        if isRandomColor {
            return true
        }

        // 如果颜色列表为空，不显示添加按钮
        if colorList.isEmpty {
            return false
        }
        
        // 默认情况下，检查颜色是否已存在
        return !isColorExistInList()
    }
    // 计算是否显示恢复按钮（如果当前颜色与视图初始颜色不同）
    public var shouldShowRestoreButton: Bool {
        // 如果处于新增颜色模式，不应显示恢复按钮
        if addColorMode != .none {
            return false
        }
        
        // 如果颜色列表为空，不显示恢复按钮
        if colorList.isEmpty {
            return false
        }
        
        // 如果会员中心刚刚关闭，使用保存的状态
        if let savedState = preMembershipButtonState {
            return savedState.shouldShowRestore
        }
        
        // 在呼吸模式下，如果正在编辑颜色，则应用特殊逻辑
        if displayModeManager.isEditingBreathingColors {
            // 定义颜色差异阈值
            let threshold: CGFloat = 0.01
            
            // 获取当前正在编辑的颜色
            let editingColor = displayModeManager.getCurrentEditingColor()
            
            // 获取当前自定义颜色和初始颜色的RGB值
            let currentRGB = ColorInfo.fromColor(customColor)
            let initialRGB = ColorInfo.fromColor(editingColor)
            
            // 计算RGB差异
            let redDiff = abs(currentRGB.red - initialRGB.red)
            let greenDiff = abs(currentRGB.green - initialRGB.green)
            let blueDiff = abs(currentRGB.blue - initialRGB.blue)
            
            // 只要有明显差异，就显示恢复按钮
            return redDiff > threshold || greenDiff > threshold || blueDiff > threshold
        }
        
        // 如果不是自定义颜色模式，不显示恢复按钮
        if !isCustomColor {
            return false
        }
        
        // 如果是随机生成的颜色，不显示恢复按钮，因为没有"原始值"可以恢复
        if isRandomColor {
            return false
        }
        
        // 检查当前颜色是否在列表中且索引匹配（即刚刚新增的颜色）
        // 如果是刚刚新增的颜色，不显示恢复按钮，因为没有"原始值"可以恢复
        if let existingIndex = findExistingColorIndex(), existingIndex == currentColorIndex {
            return false
        }
        
        // 定义颜色差异阈值，小于此阈值的差异忽略不计
        let threshold: CGFloat = 0.01
        
        // 获取当前颜色和初始颜色的RGB值
        let currentRGB = ColorInfo.fromColor(customColor)
        let initialRGB = ColorInfo.fromColor(initialViewColor)
        
        // 计算RGB差异
        let redDiff = abs(currentRGB.red - initialRGB.red)
        let greenDiff = abs(currentRGB.green - initialRGB.green)
        let blueDiff = abs(currentRGB.blue - initialRGB.blue)
        
        // 判断是否有明显差异
        return redDiff > threshold || greenDiff > threshold || blueDiff > threshold
    }
    // MARK: - 视图主体
    var body: some View {
        NavigationStack {
            ZStack(alignment: .topLeading) {
                // 背景颜色层
                backgroundLayer
                
                // 亮度控制层
                brightnessLayer
                
                // 色轮视图层
                if showColorWheel {
                    colorWheelLayer
                }
                
                // 呼吸模式频率控制层
                if displayModeManager.currentMode == .breathing && !displayModeManager.isEditingBreathingColors && !showColorWheel && showBreathingControls {
                    breathingControlLayer
                }
            }
            .focusable(true)
            .digitalCrownRotation(
                $crownValue,
                from: 0.0,
                through: 1.0,
                by: 0.01,
                sensitivity: .medium,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )
            .onChange(of: crownValue) { oldValue, newValue in
                handleCrownRotation(oldValue: oldValue, newValue: newValue)
            }
            .animation(.easeInOut(duration: 0.3), value: showColorWheel)
            .id("mainView_\(colorWheelResetCounter)") // 强制刷新表冠控制
            .onAppear {
                setupOnAppear()
                setupShakeDetection() // 设置摇晃检测
            }
            .onDisappear {
                handleOnDisappear()
                stopShakeDetection() // 停止摇晃检测
                
                // 取消呼吸控制按钮计时器
                breathingControlsTimer?.invalidate()
                breathingControlsTimer = nil
                
                // 取消设置按钮计时器
                settingsButtonTimer?.invalidate()
                settingsButtonTimer = nil
                
                // 移除重置观察者
                NotificationCenter.default.removeObserver(self, name: .resetAllSettingsNotification, object: nil)
            }
            .onChange(of: displayModeManager.isEditingBreathingColors) { wasEditing, isEditing in
                handleBreathingEditChange(wasEditing: wasEditing, isEditing: isEditing)
            }
            .onChange(of: displayModeManager.currentMode) { oldMode, newMode in
                // 当模式改变时，隐藏呼吸控制按钮
                if oldMode != newMode {
                    showBreathingControls = false
                    breathingControlsTimer?.invalidate()
                }
            }
        }
        .overlay(
            // 设置按钮 - 固定在左上角，最高层级
            HStack {
                if showSettingsButton {
                    Button(action: {
                        // 打开设置
                        openSettings()
                    }) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(Color.black.opacity(0.3))
                            .clipShape(Circle())
                    }
                    .buttonStyle(BouncyButtonStyle())
                    .transition(.scale.combined(with: .opacity))
                }
                Spacer()
            }
            .padding(.top, 8)
            .padding(.leading, 8)
            .animation(.easeInOut(duration: 0.3), value: showSettingsButton)
            .ignoresSafeArea()
            .allowsHitTesting(showSettingsButton)
            , alignment: .topLeading
        )
        .overlay(
            // 提示层
            CapsuleToast()
                .allowsHitTesting(false)
        )
        .sheet(isPresented: $showSettingsView) {
            SettingsView(displayModeManager: displayModeManager)
                .environmentObject(brightnessManager)
                .background(Color.black.opacity(0.8))
        }
        .sheet(isPresented: $isShowingMembershipCenter, onDismiss: {
            // 会员中心关闭时重置激活状态，但添加延迟保护
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isMembershipCenterActive = false
                // 在下一个渲染周期清除保存的按钮状态，确保按钮状态能正常更新
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    preMembershipButtonState = nil
                }
            }
        }) {
            MembershipCenterView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .sheet(isPresented: $showFirstLaunchTutorial) {
            TutorialReplayView(
                isFirstLaunch: true,
                onTutorialCompleted: {
                    // 标记引导已完成
                    tutorialManager.markTutorialAsCompleted()
                    // 显示欢迎提示
                    ToastManager.shared.show(primaryText: NSLocalizedString("toast.tutorial.completed", comment: ""))
                    // 延迟显示最佳设置引导 - 已禁用
                    // DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    //     showOptimalSettingsGuide = true
                    // }
                }
            )
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .sheet(isPresented: $showOptimalSettingsGuide) {
            OptimalSettingsGuideView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .alert("epilepsy.warning.title", isPresented: $showEpilepsyWarning) {
            Button("epilepsy.warning.cancel", role: .cancel) {
                // 用户取消，不增加速度
            }
            Button("epilepsy.warning.continue") {
                // 用户确认，继续增加速度
                epilepsyWarningShown = true
                actuallyIncreaseBreathingSpeed()
            }
        } message: {
            Text("epilepsy.warning.message")
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // 打开设置
    func openSettings() {
        // 隐藏设置按钮
        showSettingsButton = false
        settingsButtonTimer?.invalidate()
        
        // 显示设置视图
        showSettingsView = true
    }
    
    // 重置所有设置
    func resetAllSettings() {
        // 关闭所有打开的视图
        showColorWheel = false
        showSettingsView = false
        isShowingMembershipCenter = false
        showFirstLaunchTutorial = false
        showOptimalSettingsGuide = false
        
        // 重置所有状态
        addColorMode = .none
        isCustomColor = false
        isRandomColor = false
        shouldSuppressColorToast = false
        isMembershipCenterActive = false
        preMembershipButtonState = nil
        
        // 重置颜色列表为初始列表
        colorList = initialColorList
        saveColorList()
        
        // 重置当前颜色索引
        currentColorIndex = 0
        saveCurrentColorIndex()
        
        // 恢复初始视图颜色
        saveInitialViewColor()
        
        // 刷新UI
        customColor = initialViewColor
        
        // 重置表冠值
        crownValue = brightnessManager.brightness
        
        // 显示重置成功提示
        ToastManager.shared.show(primaryText: NSLocalizedString("toast.settings.resetted", comment: "Reset successful"))
    }
}

// MARK: - 视图层组件
extension ContentView {
    // 背景颜色层
    private var backgroundLayer: some View {
        ZStack {
            Group {
                if displayModeManager.isEditingBreathingColors {
                    customColor
                } else if displayModeManager.currentMode == .breathing && displayModeManager.isAnimating {
                    displayModeManager.currentBreathingColor
                } else {
                    currentColor
                }
            }
            
            // 大加号按钮显示逻辑（非随机颜色模式）
            if !showColorWheel && !isRandomColor {
                // 新增颜色模式下显示大加号按钮
                if addColorMode != .none {
                    Button(action: {
                        // 打开色轮
                        if displayModeManager.isEditingBreathingColors {
                            // 呼吸模式颜色编辑下的新增颜色
                            initializeColorWheelForNewBreathingColor()
                            // 打开色轮
                            withAnimation(GlobalConfig.Animation.spring) {
                                showColorWheel = true
                            }
                        } else {
                            // 单色模式下的新增颜色
                            saveInitialViewColor()
                            initializeColorWheel()
                            withAnimation(GlobalConfig.Animation.spring) {
                                showColorWheel = true
                            }
                        }
                    }) {
                        // 使用共享的加号按钮样式
                        largeAddButtonStyle()
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                // 空列表状态下显示大加号（仅在非新增颜色模式时）
                else if colorList.isEmpty {
                    Button(action: {
                        // 打开色轮新增颜色（空列表情况下设置为尾部新增）
                        addColorMode = .tail
                        isCustomColor = true
                        // 保留当前颜色，不重置为白色
                        // customColor = .white
                        saveInitialViewColor()
                        initializeColorWheel()
                        withAnimation(GlobalConfig.Animation.spring) {
                            showColorWheel = true
                        }
                    }) {
                        // 使用共享的加号按钮样式
                        largeAddButtonStyle()
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .ignoresSafeArea()
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    handleBackgroundDragGesture(value: value)
                }
        )
        // 单击手势，处理点击空白处的情况
        .gesture(
            TapGesture()
                .onEnded {
                    handleBackgroundTapGesture()
                }
        )
        // 双击手势提高优先级
        .simultaneousGesture(
            TapGesture(count: 2)
                .onEnded {
                    handleBackgroundDoubleTapGesture()
                }
        )
        .gesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in
                    handleBackgroundLongPressGesture()
                }
        )
        .animation(.easeIn(duration: 0.3), value: gestureActive)
    }
    
    // 亮度控制层
    private var brightnessLayer: some View {
        Color.black
            .opacity(1 - brightnessManager.brightness)
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.2), value: brightnessManager.brightness)
            .allowsHitTesting(false)
    }
    
    // 色轮视图层
    private var colorWheelLayer: some View {
        // 背景遮罩 - 用于关闭色轮
        ZStack {
            Color.black.opacity(0.01)
                .ignoresSafeArea()
                .onTapGesture { closeColorWheel() }
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .onEnded { value in
                            handleColorWheelDragGesture(value: value)
                        }
                )
                .zIndex(0)
            
            // 内容区域 - 结构优化
            VStack(spacing: 0) {
                // 顶部预留空间，确保不被toast覆盖，减小高度让色轮上移
                Spacer()
                    .frame(height: WKInterfaceDevice.current().screenBounds.width * 0.3)
                
                // 根据模式选择显示的选择器
                ZStack {
                    colorSelectorView
                }
                .frame(height: min(WKInterfaceDevice.current().screenBounds.width - 80, 180))
                .padding(.horizontal, 10)
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .onEnded { value in
                            handleColorWheelDragGesture(value: value)
                        }
                )
                
                Spacer()
                    .frame(height: 8)
                
                // 按钮容器
                buildButtonsView()
                .animation(GlobalConfig.Animation.spring, value: displayModeManager.isEditingBreathingColors)
                    .animation(GlobalConfig.Animation.spring, value: addColorMode)
                    .animation(GlobalConfig.Animation.spring, value: shouldShowRestoreButton)
                    .animation(GlobalConfig.Animation.spring, value: shouldShowAddButton)
                    .animation(GlobalConfig.Animation.spring, value: isRandomColor)
                    .frame(height: config.spacing(40))
                    .padding(.bottom, config.spacing(10))
                    .background(Color.clear)
                    .contentShape(Rectangle())
                
                Spacer()
                    .frame(height: config.spacing(10))
            }
            .zIndex(1)
            .onAppear {
                isTouching = false
                crownValue = customSaturation
                setupNotificationObservers()
            }
            .onDisappear {
                isTouching = false
                DispatchQueue.main.async {
                    crownValue = brightnessManager.brightness
                }
                removeNotificationObservers()
            }
        }
    }
    
    // 呼吸模式频率控制层
    private var breathingControlLayer: some View {
        VStack {
            Spacer()
            
            HStack(spacing: GlobalConfig.shared.spacing(10)) {
                // 减速按钮
                Button(action: {
                    decreaseBreathingSpeed()
                    resetBreathingControlsTimer() // 重置计时器
                }) {
                    Image(systemName: "minus.circle.fill")
                        .font(.system(size: GlobalConfig.shared.fontSize(32)))
                        .foregroundColor(GlobalConfig.Colors.primaryText)
                        .padding(GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(BouncyButtonStyle())
                
                // 恢复默认按钮
                Button(action: {
                    resetBreathingSpeed()
                    resetBreathingControlsTimer() // 重置计时器
                }) {
                    Image(systemName: "arrow.counterclockwise.circle.fill")
                        .font(.system(size: GlobalConfig.shared.fontSize(32)))
                        .foregroundColor(GlobalConfig.Colors.primaryText)
                        .padding(GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(BouncyButtonStyle())
                
                // 加速按钮
                Button(action: {
                    increaseBreathingSpeed()
                    resetBreathingControlsTimer() // 重置计时器
                }) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: GlobalConfig.shared.fontSize(32)))
                        .foregroundColor(GlobalConfig.Colors.primaryText)
                        .padding(GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(BouncyButtonStyle())
            }
            .padding(.horizontal, GlobalConfig.shared.spacing(16))
            .padding(.bottom, GlobalConfig.shared.spacing(10))
            .contentShape(Rectangle())
            .opacity(showBreathingControls ? 1.0 : 0.0)
            .offset(y: showBreathingControls ? 0 : 50) // 添加位移动画，从下方滑入
            .animation(GlobalConfig.Animation.spring, value: showBreathingControls)
        }
        .ignoresSafeArea(edges: .bottom)
        .zIndex(10)
    }
    
    // 颜色选择器视图
    private var colorSelectorView: some View {
        ColorSelectorContainerView(
            currentMode: $currentSelectorMode,
            isPresented: $showColorWheel,
            selectedColor: $customColor,
            hue: $customHue,
            saturation: $customSaturation,
            brightness: $customBrightness,
            selectedPosition: $selectedPosition,
            isMembershipCenterActive: $isMembershipCenterActive,
            onColorChanged: { newColor in
                handleColorChanged(newColor: newColor)
            },
            onPositionChanged: {
                handlePositionChanged()
            },
            onTouchingChanged: { isTouching in
                handleTouchingChanged(isTouching: isTouching)
            },
            onBrightnessControlChange: { isInBrightnessMode in
                handleBrightnessControlChange(isInBrightnessMode: isInBrightnessMode)
            },
            onModeChanged: { newMode in
                handleSelectorModeChanged(newMode: newMode)
            },
            onColorDragged: { draggedColor in
                handleColorDragged(draggedColor: draggedColor)
            }
        )
        .id("colorSelector_\(colorWheelResetCounter)")
        .allowsHitTesting(true)
        .environmentObject(displayModeManager)
    }
    
    // 构建按钮视图
    @ViewBuilder
    private func buildButtonsView() -> some View {
        ButtonViews.buildButtonsView(
            config: GlobalConfig.shared,
            addColorMode: addColorMode,
            displayModeManager: displayModeManager,
            isCustomColor: isCustomColor,
            isRandomColor: isRandomColor,
            customColor: customColor,
            shouldShowAddButton: shouldShowAddButton,
            shouldShowRestoreButton: shouldShowRestoreButton,
            currentSelectorMode: currentSelectorMode,
            buttonAnimationsEnabled: buttonAnimationsEnabled,
            
            onAddNewBreathingColor: addNewBreathingColorToList,
            onAddNewColor: addNewColorToList,
            onToggleColorSelector: toggleColorSelector,
            onUpdateBreathingColor: updateBreathingColor,
            onRestoreBreathingColor: restoreBreathingColor,
            onRemoveBreathingColor: removeBreathingColor,
            onConfirmColorChange: confirmColorChange,
            onRestoreInitialColor: restoreInitialColor,
            onRemoveColor: removeColorFromList
        )
    }
}

// MARK: - 呼吸模式相关方法
extension ContentView {
    // 处理呼吸模式编辑状态变化
    func handleBreathingEditChange(wasEditing: Bool, isEditing: Bool) {
        // 如果会员中心正在显示，不执行任何状态修改操作
        if isMembershipCenterActive {
            return
        }
        
        if isEditing {
            // 进入编辑状态，初始化色轮并显示
            initializeColorWheelForBreathingEdit()
            withAnimation(GlobalConfig.Animation.spring) {
                showColorWheel = true
            }
        } else if wasEditing {
            // 退出编辑状态，关闭色轮
            withAnimation(.easeOut(duration: 0.2)) {
                showColorWheel = false
            }
            
            // 显示当前呼吸模式的名称
            ToastManager.shared.show(primaryText: displayModeManager.currentBreathingMode.name)
            
            // 重置自定义颜色状态，防止在切换到单色模式时保留未确认的颜色
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self.isCustomColor = false
                self.customColor = self.colorList.isEmpty ? .white : self.colorList[0].color
            }
        }
    }
    
    // 呼吸模式速度控制
    func decreaseBreathingSpeed() {
        MembershipManager.shared.executeIfPremium {
            ToastManager.shared.show(primaryText: NSLocalizedString("toast.breathing.speed.slower", comment: ""))
            self.displayModeManager.decreaseSpeed()
            WKInterfaceDevice.current().play(.click)
        }
    }
    
    func resetBreathingSpeed() {
        MembershipManager.shared.executeIfPremium {
            self.displayModeManager.resetSpeed()
            WKInterfaceDevice.current().play(.click)
            ToastManager.shared.show(primaryText: NSLocalizedString("toast.breathing.speed.default", comment: ""))
        }
    }
    
    func increaseBreathingSpeed() {
        MembershipManager.shared.executeIfPremium {
            // 检查是否需要显示癫痫警告
            // 当速度超过一定阈值且用户未确认过警告时显示
            let currentSpeed = self.displayModeManager.breathingSpeed
            let speedThreshold: Double = 10 // 降低速度阈值，更早显示警告

            if currentSpeed >= speedThreshold && !epilepsyWarningShown {
                // 显示癫痫警告
                showEpilepsyWarning = true
            } else {
                // 直接增加速度
                actuallyIncreaseBreathingSpeed()
            }
        }
    }

    // 实际增加呼吸速度的函数
    private func actuallyIncreaseBreathingSpeed() {
        ToastManager.shared.show(primaryText: NSLocalizedString("toast.breathing.speed.faster", comment: ""))
        displayModeManager.increaseSpeed()
        WKInterfaceDevice.current().play(.click)
    }
}

// MARK: - 颜色操作方法
extension ContentView {
    // 添加新的呼吸模式颜色到列表
    func addNewBreathingColorToList() {
        MembershipManager.shared.executeIfPremium {
            // 暂存当前的添加模式
            let currentAddMode = self.addColorMode
            
            // 根据不同的新增模式决定添加位置
            if currentAddMode == .head {
                // 头部新增 - 插入到列表开头
                self.displayModeManager.addColorAtHead(self.customColor)
                // 手动隐藏当前显示的 toast
                ToastManager.shared.hide()
            } else {
                // 尾部新增 - 添加到列表末尾
                self.displayModeManager.addColorAtTail(self.customColor)
                // 手动隐藏当前显示的 toast
                ToastManager.shared.hide()
            }
            
            // 重置新增状态，但不关闭色轮
            self.addColorMode = .none
            
            // 更新编辑索引到新添加的颜色
            if currentAddMode == .head {
                self.displayModeManager.editingColorIndex = 0
            } else {
                self.displayModeManager.editingColorIndex = self.displayModeManager.customBreathingColors.count - 1
            }
            
            // 更新颜色选择器以显示新添加的颜色
            self.updateColorWheelForEditingBreathingColor()
            
            // 保存初始视图颜色（用于恢复逻辑）
            self.saveInitialViewColor()
        }
    }
    
    // 将新颜色添加到列表（单色模式）
    func addNewColorToList() {
        let hexValue = ColorUtilities.colorToHexString(customColor)
        let newColor = ColorInfo.fromColor(customColor, name: hexValue)
        var mutableList = colorList
        
        // 根据不同的新增模式决定添加位置
        if addColorMode == .head {
            // 头部新增 - 插入到列表开头
            mutableList.insert(newColor, at: 0)
            colorList = mutableList
            currentColorIndex = 0
            saveCurrentColorIndex()
            isRandomColor = false  // 重置随机颜色标志
            
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
        } else {
            // 尾部新增 - 添加到列表末尾
            mutableList.append(newColor)
            colorList = mutableList
            currentColorIndex = colorList.count - 1
            saveCurrentColorIndex()
            isRandomColor = false  // 重置随机颜色标志
            
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
        }
        
        // 显示新增成功提示
        ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.added.success", comment: ""))
        
        // 设置抑制toast，避免在颜色切换时显示新颜色的toast
        shouldSuppressColorToast = true
        
        // 保存颜色列表
        saveColorList()
        
        // 保存初始视图颜色，确保后续恢复按钮正确
        saveInitialViewColor()
        
        // 关闭色轮并重置新增状态
        addColorMode = .none
        closeColorWheel()
        
        // 延迟重置抑制状态，确保颜色切换完成
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.shouldSuppressColorToast = false
        }
    }
    
    // 更新呼吸颜色
    func updateBreathingColor() {
        MembershipManager.shared.executeIfPremium {
            // 更新当前正在编辑的呼吸颜色
            self.displayModeManager.updateCurrentEditingColor(self.customColor)
            
            // 如果当前正在新增颜色模式
            if self.addColorMode != .none {
                // 添加新的呼吸模式颜色，但不关闭色轮
                self.addNewBreathingColorToList()
            } else {
                // 显示确认提示
                ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.updated", comment: ""))
                
                // 不再结束编辑模式，也不关闭色轮，允许用户继续编辑其他颜色
                // 保存初始视图颜色（用于恢复逻辑）
                self.saveInitialViewColor()
            }
        }
    }
    
    // 恢复呼吸颜色
    func restoreBreathingColor() {
        // 获取当前正在编辑的原始颜色
        let originalColor = displayModeManager.getCurrentEditingColor()
        
        // 播放触觉反馈
        WKInterfaceDevice.current().play(.click)
        
        // 恢复颜色
        customColor = originalColor
        
        // 同步HSB值
        syncHSBFromColor(originalColor)
        
        // 重置表冠值
        resetCrownToCurrentSaturation()
    }
    
    // 移除呼吸颜色
    func removeBreathingColor() {
        MembershipManager.shared.executeIfPremium {
            // 检查是否只剩两个颜色
            if self.displayModeManager.customBreathingColors.count <= 2 {
                // 如果只有两个颜色，显示提示但不删除
                ToastManager.shared.show(primaryText: NSLocalizedString("toast.breathing.min.colors", comment: ""))
            } else {
                // 删除当前颜色
                self.displayModeManager.removeCurrentEditingColor()
                // 更新色轮
                self.updateColorWheelForEditingBreathingColor()
            }
        }
    }
    
    // 确认颜色修改
    func confirmColorChange() {
        if isCustomColor {
            // 检查是否在呼吸模式颜色编辑状态
            if displayModeManager.isEditingBreathingColors {
                MembershipManager.shared.executeIfPremium {
                    self.updateBreathingColor()
                }
            } else {
                // 单色模式下的颜色编辑
                if isRandomColor {
                    // 随机颜色的处理逻辑
                    if shouldShowAddButton {
                        // 颜色不在列表中，添加到列表
                        addRandomColorToList()
                    } else {
                        // 颜色在列表中，从列表删除
                        removeRandomColorFromList()
                    }
                } else if !colorList.isEmpty && colorList.indices.contains(currentColorIndex) {
                    // 普通颜色编辑 - 直接更新当前颜色
                    var mutableList = colorList
                    let colorInfo = ColorInfo.fromColor(customColor, name: ColorUtilities.colorToHexString(customColor))
                    mutableList[currentColorIndex] = colorInfo
                    colorList = mutableList
                    
                    // 不重置isCustomColor，保持当前的自定义颜色状态，确保显示修改后的颜色
                    // isCustomColor = false 
                    isRandomColor = false  // 重置随机颜色标志
                    saveColorList()
                    saveInitialViewColor()
                    
                    // 显示确认提示
                    ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.updated", comment: ""))
                    
                    // 设置抑制toast，避免在颜色切换时显示新颜色的toast
                    shouldSuppressColorToast = true
                    
                    // 延迟重置抑制状态，确保颜色切换完成
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                        self.shouldSuppressColorToast = false
                    }
                }
                
                // 关闭色轮
                closeColorWheel()
            }
        }
    }
    
    // 将随机颜色添加到列表
    func addRandomColorToList() {
        let hexValue = ColorUtilities.colorToHexString(customColor)
        let newColor = ColorInfo.fromColor(customColor, name: hexValue)
        var mutableList = colorList
        
        // 添加到列表末尾
        mutableList.append(newColor)
        colorList = mutableList
        
        // 切换到新添加的颜色
        currentColorIndex = colorList.count - 1
        saveCurrentColorIndex()
        isCustomColor = false  // 现在是列表中的颜色，不再是自定义颜色
        isRandomColor = false  // 重置随机颜色标志
        
        // 显示新增成功提示
        ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.added.success", comment: ""))
        
        // 设置抑制toast，避免在颜色切换时显示新颜色的toast
        shouldSuppressColorToast = true
        
        // 保存颜色列表
        saveColorList()
        
        // 保存初始视图颜色，确保后续恢复按钮正确
        saveInitialViewColor()
        
        // 关闭色轮
        closeColorWheel()
        
        // 延迟重置抑制状态，确保颜色切换完成
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.shouldSuppressColorToast = false
        }
    }
    
    // 从列表中删除随机颜色
    func removeRandomColorFromList() {
        // 找到颜色在列表中的索引
        if let existingIndex = findExistingColorIndex() {
            var mutableList = colorList
            
            // 从列表中移除颜色
            mutableList.remove(at: existingIndex)
            colorList = mutableList
            
            // 保存更新后的颜色列表
            saveColorList()
            
            // 显示颜色已删除的提示
            ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.deleted", comment: ""))
            
            // 设置抑制toast，避免在颜色切换时显示新颜色的toast
            shouldSuppressColorToast = true
            
            // 调整当前颜色索引
            if colorList.isEmpty {
                // 如果列表为空，则进入新增模式
                isCustomColor = true
                customColor = .white
                addColorMode = .none // 重置为无特定新增模式
            } else {
                // 如果列表不为空，则更新索引
                if existingIndex >= colorList.count {
                    currentColorIndex = colorList.count - 1
                }
                // 切换到列表中的颜色
                isCustomColor = false
                isRandomColor = false
            }
            
            // 关闭色轮
            closeColorWheel()
            
            // 延迟重置抑制状态，确保颜色切换完成
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.shouldSuppressColorToast = false
            }
        }
    }
    
    // 恢复初始颜色
    func restoreInitialColor() {
        // 保存当前状态
        let isInRGBMode = currentSelectorMode == .rgbInput
        let wasIgnoringCrown = ignoreTableCrownUpdates
        
        // 临时激活保护窗口，防止背景闪烁
        ignoreTableCrownUpdates = true
        
        // 根据当前模式执行不同的恢复逻辑
        if isInRGBMode {
            // RGB模式下：直接设置颜色值，但不重置表冠
            // 同步HSB值但不立即更新表冠
            syncHSBFromColor(initialViewColor)
            
            // 直接设置为恢复的颜色，避免使用中间颜色导致闪烁
            customColor = initialViewColor
            
            // 显示颜色的表情符号和RGB值
            showColorToast(for: initialViewColor)
            
            // 强制刷新视图计数器，但不会影响背景颜色
            DispatchQueue.main.async {
                // 如果在RGB模式下，增加计数器强制刷新
                if currentSelectorMode == .rgbInput {
                    colorWheelResetCounter += 1
                }
                
                // 恢复之前的保护窗口状态，但确保有足够时间完成操作
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    ignoreTableCrownUpdates = wasIgnoringCrown
                }
            }
        } else {
            // 色轮模式下：恢复HSB值并重置表冠
            customHue = initialViewHue
            customSaturation = initialViewSaturation
            customBrightness = initialViewBrightness
            customColor = initialViewColor
            resetCrownToCurrentSaturation()
            
            // 显示颜色的表情符号和RGB值
            showColorToast(for: initialViewColor)
        }
        
        // 标记为自定义颜色
        isCustomColor = true
    }

    // 从列表中删除颜色
    func removeColorFromList() {
        // 如果颜色列表为空，则不执行
        guard !colorList.isEmpty else { return }
        
        var mutableList = colorList
        let removedIndex = currentColorIndex
        
        // 从列表中移除当前颜色
        mutableList.remove(at: removedIndex)
        colorList = mutableList
        
        // 保存更新后的颜色列表
        saveColorList()
        
        // 关闭颜色编辑视图
        closeColorWheel()
        
        // 调整当前颜色索引并刷新视图
        if colorList.isEmpty {
            // 颜色列表为空，进入空列表状态
            currentColorIndex = 0
            saveCurrentColorIndex()
            isCustomColor = true
            isRandomColor = false
            customColor = .white
            // 同步HSB值，确保下次打开编辑器颜色一致
            let hsb = ColorInfo.fromColor(customColor).getHSB()
            customHue = hsb.hue
            customSaturation = hsb.saturation
            customBrightness = hsb.brightness
            addColorMode = .none
        } else {
            // 根据删除位置调整索引
            if removedIndex >= colorList.count {
                currentColorIndex = colorList.count - 1
            } else {
                currentColorIndex = removedIndex
            }
            saveCurrentColorIndex()
            isCustomColor = false
            isRandomColor = false
            customColor = colorList[currentColorIndex].color
            // 同步HSB值到新颜色
            let hsb = ColorInfo.fromColor(customColor).getHSB()
            customHue = hsb.hue
            customSaturation = hsb.saturation
            customBrightness = hsb.brightness
        }
        
        // 保存新的初始颜色，用于后续恢复逻辑
        saveInitialViewColor()
        
        // 显示颜色已删除的提示
        ToastManager.shared.show(primaryText: NSLocalizedString("toast.color.deleted", comment: ""))
        
        // 抑制随后颜色切换的toast
        shouldSuppressColorToast = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.shouldSuppressColorToast = false
        }
    }
}

// MARK: - 颜色存在性检查
extension ContentView {
    // 检查当前自定义颜色是否已存在于列表中
    func isColorExistInList() -> Bool {
        if !isCustomColor {
            // 如果是预设颜色，直接返回true（存在）
            return true
        }
        
        // 确保颜色列表不为空
        if colorList.isEmpty {
            return false
        }
        
        // 获取当前自定义颜色的RGB值进行比较
        let currentRGB = ColorInfo.fromColor(customColor)
        
        // 检查是否与列表中的任何颜色匹配
        return colorList.contains { colorInfo in
            // 允许一点误差（考虑浮点数精度）
            let redDiff = abs(colorInfo.red - currentRGB.red)
            let greenDiff = abs(colorInfo.green - currentRGB.green)
            let blueDiff = abs(colorInfo.blue - currentRGB.blue)
            
            // 如果RGB差异都小于某个阈值，认为是同一颜色
            return redDiff < 1.0 && greenDiff < 1.0 && blueDiff < 1.0
        }
    }
    
    // 查找颜色是否存在于列表中，如果存在返回索引
    func findExistingColorIndex() -> Int? {
        if !isCustomColor {
            return currentColorIndex
        }
        
        // 获取当前自定义颜色的RGB值进行比较
        let currentRGB = ColorInfo.fromColor(customColor)
        
        // 检查是否与列表中的任何颜色匹配
        for (index, colorInfo) in colorList.enumerated() {
            let redDiff = abs(colorInfo.red - currentRGB.red)
            let greenDiff = abs(colorInfo.green - currentRGB.green)
            let blueDiff = abs(colorInfo.blue - currentRGB.blue)
        
            // 如果RGB差异都小于某个阈值，认为是同一颜色
            if redDiff < 1.0 && greenDiff < 1.0 && blueDiff < 1.0 {
                return index
            }
        }
        
        return nil
    }
}

// MARK: - 通知处理与生命周期
extension ContentView {
    // 设置通知观察者
    func setupNotificationObservers() {
        let observerTarget = ObserverTarget()
        objc_setAssociatedObject(self, &ContentView.observerKey, observerTarget, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        
        NotificationHandler.setupNotificationObservers(
            for: observerTarget,
            onCrownRotation: { oldValue, newValue in
                self.handleCrownRotation(oldValue: oldValue, newValue: newValue)
            },
            onColorWheelTouchBegan: {
                self.userInteractionState = .wheelTapped(Date())
                self.ignoreTableCrownUpdates = true
            },
            onColorWheelTouchEnded: {
                self.ignoreTableCrownUpdates = false
            },
            onRGBPickerActive: {
                self.isRGBPickerActive = true
            },
            onRGBPickerInactive: {
                self.isRGBPickerActive = false
            },
            onSaturationUpdated: { saturationValue in
                if self.userInteractionState.isWheelRecentlyTapped { return }
                
                let now = Date()
                if now.timeIntervalSince(self.lastSyncTime) < 0.3 { return }
                
                if let lastValue = self.lastSyncedValue, abs(lastValue - saturationValue) < 0.001 { return }
                
                if self.isSynchronizing { return }
                
                self.isSynchronizing = true
                self.userInteractionState = .rgbClosed(Date())
                self.lastSyncTime = now
                self.lastSyncedValue = saturationValue
                
                self.ignoreTableCrownUpdates = true
                self.crownValue = saturationValue
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.ignoreTableCrownUpdates = false
                    self.isSynchronizing = false
                    self.userInteractionState = .none
                }
            },
            onResetCrownToBrightness: {
                self.ignoreTableCrownUpdates = true
                self.crownValue = self.brightnessManager.brightness
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    self.ignoreTableCrownUpdates = false
                }
            }
        )
        
        // 添加重置所有设置的观察者
        NotificationCenter.default.addObserver(forName: .resetAllSettingsNotification, object: nil, queue: .main) { _ in
            self.resetAllSettings()
        }

        // 会员中心通知
        NotificationCenter.default.addObserver(forName: .showMembershipCenterNotification, object: nil, queue: .main) { _ in
            self.presentMembershipCenter()
        }
    }
    
    // 移除通知观察者
    func removeNotificationObservers() {
        if let observerTarget = objc_getAssociatedObject(self, &ContentView.observerKey) as? ObserverTarget {
            NotificationHandler.removeNotificationObservers(for: observerTarget)
        }
    }
        
    // 初始化设置
    func setupOnAppear() {
        // 如果会员中心正在显示，不执行任何状态重置操作
        if isMembershipCenterActive {
            return
        }
        
        loadColorList()
        if colorList.isEmpty {
            colorList = initialColorList
        }
        
        // 加载保存的颜色索引，确保显示上次关闭时的颜色视图
        loadCurrentColorIndex()
        
        saveInitialViewColor()
        setupNotificationObservers()
        
        // 检查会员状态，非会员时确保颜色选择器为色轮模式
        if !MembershipManager.shared.hasPremiumAccess {
            currentSelectorMode = .colorWheel
        }        

        // 注册重置通知
        NotificationCenter.default.addObserver(forName: .resetAllSettingsNotification, object: nil, queue: .main) { _ in
            self.resetAllSettings()
        }

        // 注册会员中心通知
        NotificationCenter.default.addObserver(forName: .showMembershipCenterNotification, object: nil, queue: .main) { _ in
            self.presentMembershipCenter()
        }



        // 电池保护机制静默工作，不显示提示

        NotificationCenter.default.addObserver(forName: NSNotification.Name("BreathingModeCooldown"), object: nil, queue: .main) { notification in
            if let userInfo = notification.userInfo,
               let message = userInfo["message"] as? String {
                ToastManager.shared.show(primaryText: message)
            }
        }
        
        // 初始化 StoreKit 管理器
        Task {
            await StoreKitManager.shared.loadProducts()
        }
        
        // 检查是否需要显示初次安装引导
        if tutorialManager.isFirstLaunch {
            // 延迟显示引导，确保界面完全加载
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                self.showFirstLaunchTutorial = true
            }
        }
    }
        
    // 处理视图消失
    func handleOnDisappear() {
        isTouching = false
        DispatchQueue.main.async {
            self.crownValue = self.brightnessManager.brightness
        }
        removeNotificationObservers()
        breathingControlsTimer?.invalidate()
        breathingControlsTimer = nil
        displayModeManager.stopAnimation()
        
        // 确保移除观察者
        NotificationCenter.default.removeObserver(self, name: .resetAllSettingsNotification, object: nil)
        // 移除会员中心通知观察者
        NotificationCenter.default.removeObserver(self, name: .showMembershipCenterNotification, object: nil)
        // 移除呼吸模式限制通知观察者
        NotificationCenter.default.removeObserver(self, name: NSNotification.Name("BreathingModeCooldown"), object: nil)

    }
        
    // 保存初始视图颜色
    func saveInitialViewColor() {
        initialViewColor = currentColor
        let hsb = currentColorInfo.getHSB()
        initialViewHue = hsb.hue
        initialViewSaturation = hsb.saturation
        initialViewBrightness = hsb.brightness
    }
}

// MARK: - 根据当前颜色格式显示Toast
extension ContentView {
    func showColorToast(for color: Color) {
        // 如果设置了抑制toast，则不显示
        if shouldSuppressColorToast {
            return
        }
        
        let formattedColor = ColorFormatter.shared.format(color)
        ToastManager.shared.show(primaryText: formattedColor)
    }
}

// MARK: - 会员中心跳转
extension ContentView {
    func presentMembershipCenter() {
        // 保存会员中心打开前的按钮状态
        preMembershipButtonState = (shouldShowRestoreButton, shouldShowAddButton)
        isMembershipCenterActive = true // 设置会员中心激活状态
        isShowingMembershipCenter = true
    }
}

// 选择器模式切换
extension ContentView {
    // 切换颜色选择器模式
     func toggleColorSelector() {
        let nextMode = currentSelectorMode.next()
        let isPremiumFeature = nextMode == .rgbInput || nextMode == .emojiSelector

        let switchAction = {
            // 播放触觉反馈
            WKInterfaceDevice.current().play(.click)
                            
            // 在模式切换前先处理模式特定的准备逻辑
            if nextMode == .colorWheel {
                // 提前处理色轮模式的准备工作
                self.syncHSBFromColor(self.customColor)
            }
            
            // 直接切换模式，不使用动画
            self.currentSelectorMode = nextMode

            // 处理模式特定的后续逻辑
            if nextMode == .colorWheel {
                self.handleSwitchToColorWheelMode()
            } else if nextMode == .rgbInput || nextMode == .emojiSelector {
                self.handleSwitchToRGBMode()
            }
        }

        if isPremiumFeature {
            // 对于高级功能，检查会员权限
            if MembershipManager.shared.hasPremiumAccess {
                // 如果是会员，直接执行切换操作
                switchAction()
        } else {
                // 如果不是会员，只显示会员中心，不执行任何会修改颜色的代码
                NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            }
        } else {
            // 非高级功能，直接执行
            switchAction()
        }
    }
    // 处理切换到色轮模式
     func handleSwitchToColorWheelMode() {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 从RGB选择器切换回色轮时，需要手动同步颜色和更新位置
        syncHSBFromColor(customColor)
        
        // 强制刷新色轮视图
        colorWheelResetCounter += 1
        
        // 同步表冠值到饱和度
        crownValue = customSaturation
        
        // 在呼吸模式颜色编辑时不显示表情符号
        if displayModeManager.isEditingBreathingColors {
            // 显示颜色序列索引提示
        ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
        } else {
            // 显示当前颜色的Toast提示
            showColorToast(for: customColor)
        }
        
        // 添加保护窗口，防止惯性滚动
        ignoreTableCrownUpdates = true
        
        // 延迟关闭保护窗口
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.ignoreTableCrownUpdates = false
        }
    }
    // 处理切换到RGB模式
     func handleSwitchToRGBMode() {
        // 在呼吸模式颜色编辑时仅显示序列索引，否则按用户设置的颜色提示格式显示
        if displayModeManager.isEditingBreathingColors {
            ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
        } else {
            // 直接使用当前格式化工具，避免先显示表情格式再切换
            self.showColorToast(for: self.customColor)
        }
        
        // 在RGB模式下也设置保护窗口，防止初始惯性滚动
        ignoreTableCrownUpdates = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.ignoreTableCrownUpdates = false
        }
    }
}

// MARK: - 色轮初始化和控制
extension ContentView {
    // 初始化色轮
     func initializeColorWheel() {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 立即激活保护窗口
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        
        if addColorMode != .none {
            // 在新增颜色模式下，使用当前选择的颜色，而不是重置为白色
            // 只有在颜色列表为空且之前没有选择过颜色时才使用白色
            if colorList.isEmpty && customColor == .white {
                // 保持白色，只需同步HSB值
                let hsb = ColorInfo.fromColor(customColor).getHSB()
                customHue = hsb.hue
                customSaturation = hsb.saturation
                customBrightness = hsb.brightness
            } else {
                // 使用当前的自定义颜色，保持用户选择的颜色不变
                let hsb = ColorInfo.fromColor(customColor).getHSB()
                customHue = hsb.hue
                customSaturation = hsb.saturation
                customBrightness = hsb.brightness
            }
        } else if isCustomColor {
            // 编辑自定义颜色（包括随机颜色）或从列表进入编辑模式
            // 此时 customColor 和 isRandomColor 的状态都是正确的
            // HSB值也无需变动，所以此分支无需任何操作
        } else {
            // 从非自定义颜色状态进入，通常是编辑列表中的颜色
        // 1. 获取当前颜色的HSB值
        let hsb = currentColorInfo.getHSB()
        
        // 2. 设置HSB值
        customHue = hsb.hue
        customSaturation = hsb.saturation
        customBrightness = hsb.brightness
        
        // 3. 更新颜色
        customColor = Color(
            hue: customHue,
            saturation: customSaturation,
            brightness: customBrightness
        )
        
            // 4. 这是编辑列表中的颜色，不是随机颜色
            isRandomColor = false
        }
        
        // 在新增模式下或者从列表中的颜色开始编辑时，需要保存其初始状态。
        // 仅当当前为"非自定义颜色"状态（即列表颜色）时才保存，
        // 避免在已有未确认修改的情况下覆盖 initialViewColor。
        if addColorMode != .none {
            // 新增模式下，初始颜色状态已在进入模式时设置，无需处理。
        } else if !isCustomColor {
            // 仅当当前颜色来源于列表且没有自定义修改时，才更新初始状态。
            saveInitialViewColor()
        }
        
        // 6. 增加计数器以强制重建视图
        colorWheelResetCounter += 1
        
        // 7. 立即同步表冠值
        crownValue = customSaturation
        
        // 9. 延迟关闭保护窗口
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.ignoreTableCrownUpdates = false
        }
    }
    
    // 同步HSB值
     func syncHSBFromColor(_ color: Color) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        let uiColor = UIColor(color)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        // 更新HSB值 - 使用ContentView中的状态变量
        customHue = Double(h)
        customSaturation = Double(s)
        customBrightness = Double(b)
    }
    
    // 关闭色轮
     func closeColorWheel() {
        // 禁用按钮动画，避免状态变化时的过渡效果
        buttonAnimationsEnabled = false
        
        // 1. 设置保护状态
        isClosingColorWheel = true
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        
        // 判断是否在新增模式，如果是则保留当前模式和颜色
        let inAddColorMode = addColorMode != .none
        
        // 呼吸模式下的特殊处理逻辑
        if displayModeManager.currentMode == .breathing {
            if displayModeManager.isEditingBreathingColors {
                if inAddColorMode {
                    // 在呼吸模式下的加号视图点击空白处，直接返回呼吸模式，取消新增
                    addColorMode = .none
                    displayModeManager.cancelEditingBreathingColors()
                    
                    // 重置自定义颜色状态，防止在切换到单色模式时保留未确认的颜色
                    isCustomColor = false
                    isRandomColor = false  // 重置随机颜色标志
                    customColor = colorList.isEmpty ? .white : colorList[0].color
                } else {
                    // 点击空白处关闭颜色选择器时，保存所有颜色的修改并返回呼吸模式
                    displayModeManager.finishEditingBreathingColors()
                    // 先隐藏可能的颜色值提示，再显示模式名称
                    ToastManager.shared.hide()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        ToastManager.shared.show(primaryText: self.displayModeManager.currentBreathingMode.name)
                    }
                    
                    // 重置自定义颜色状态，防止在切换到单色模式时保留未确认的颜色
                    isCustomColor = false
                    isRandomColor = false  // 重置随机颜色标志
                    customColor = colorList.isEmpty ? .white : colorList[0].color
                }
            }
        } else if !displayModeManager.isEditingBreathingColors && !inAddColorMode && colorList.count > 0 {
            // 单色模式下且不是新增模式，且颜色列表不为空
            // 注意：不再重置自定义颜色状态，保持用户编辑的颜色
            // isCustomColor = false
            // isRandomColor = false
            
            // 只清除随机颜色标志，不重置自定义颜色状态
            isRandomColor = false
        }
        // 注意：当颜色列表为空时，我们保留自定义颜色状态，不重置
        
        // 在单色模式下的新增模式，保持当前颜色和状态不变
        
        // 2. 立即同步表冠值，但不触发任何其他UI更新
        crownValue = brightnessManager.brightness
        
        // 3. 使用更温和的动画参数关闭色轮
        withAnimation(.easeOut(duration: 0.2)) {
            showColorWheel = false
        }
        
        // 4. 延迟重置状态，确保动画完成
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            // 增加计数器强制刷新表冠控件
            self.colorWheelResetCounter += 1
            
            // 重置表冠值和保护状态
            self.crownValue = self.brightnessManager.brightness
            self.ignoreTableCrownUpdates = false
            
            // 延迟重置关闭状态
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self.isClosingColorWheel = false
                // 恢复按钮动画
                self.buttonAnimationsEnabled = true
            }
        }
    }
    
    // 初始化色轮（用于呼吸颜色编辑）
     func initializeColorWheelForBreathingEdit() {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 立即激活保护窗口
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        
        // 获取当前编辑的颜色
        let editingColor = displayModeManager.getCurrentEditingColor()
        
        // 将编辑颜色设置为自定义颜色
        customColor = editingColor
        // 设置为自定义颜色，使按钮逻辑一致
            isCustomColor = true
        
        // 获取HSB值
        let uiColor = UIColor(editingColor)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        // 设置HSB值
        customHue = Double(h)
        customSaturation = Double(s)
        customBrightness = Double(b)
        
        // 增加计数器以强制重建视图
        colorWheelResetCounter += 1
        
        // 立即同步表冠值
        crownValue = customSaturation
        
        // 只显示颜色序列索引提示
        ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
        
        // 确保背景颜色与当前编辑颜色同步
        DispatchQueue.main.async {
            // 在下一个渲染周期确保颜色同步
            self.customColor = editingColor
        }
        
        // 延迟关闭保护窗口
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.ignoreTableCrownUpdates = false
        }
    }
    
    // 初始化色轮（用于呼吸颜色编辑新增颜色）
     func initializeColorWheelForNewBreathingColor() {
        // 立即激活保护窗口
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        
        // 设置默认颜色为白色
        customColor = .white
        // 设置为自定义颜色，使按钮逻辑一致
        isCustomColor = true
        
        // 获取HSB值
        let uiColor = UIColor(customColor)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        // 设置HSB值
        customHue = Double(h)
        customSaturation = Double(s)
        customBrightness = Double(b)
        
        // 增加计数器以强制重建视图
                    colorWheelResetCounter += 1
        
        // 立即同步表冠值
        crownValue = customSaturation
        
        // 延迟关闭保护窗口
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.ignoreTableCrownUpdates = false
        }
    }
    
    // 更新颜色选择器（用于呼吸颜色编辑）
     func updateColorWheelForEditingBreathingColor() {
        // 立即激活保护窗口
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        
        // 获取当前编辑的颜色
        let editingColor = displayModeManager.getCurrentEditingColor()
        
        // 将编辑颜色设置为自定义颜色 - 立即更新背景颜色
        withAnimation(.easeInOut(duration: 0.2)) {
            customColor = editingColor
            // 设置为自定义颜色，使按钮逻辑一致
        isCustomColor = true
    }
        // 获取HSB值
        let uiColor = UIColor(editingColor)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        // 设置HSB值
        customHue = Double(h)
        customSaturation = Double(s)
        customBrightness = Double(b)
        
        // 增加计数器以强制重建视图
        colorWheelResetCounter += 1
        
        // 立即同步表冠值
        crownValue = customSaturation
        
        // 播放触觉反馈
        WKInterfaceDevice.current().play(.click)
        
        // 只显示颜色序列索引提示
        if displayModeManager.customBreathingColors.count > 0 {
            ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
        }
        
        // 确保背景颜色与当前编辑颜色同步
        DispatchQueue.main.async {
            // 在下一个渲染周期确保颜色同步
            self.customColor = editingColor
        }
        
        // 延迟关闭保护窗口
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.ignoreTableCrownUpdates = false
        }
    }
}

// MARK: - 预览
#Preview {
    ContentView()
        .environmentObject(BrightnessManager())
}

// 共享的大加号按钮样式
@ViewBuilder
private func largeAddButtonStyle() -> some View {
    Image(systemName: "plus.circle.fill")
        .font(.system(size: GlobalConfig.ButtonStyle.extraLargeSize))
        .foregroundColor(.white)
        .padding(GlobalConfig.shared.spacing(8))
        .background(Color.black.opacity(0.3))
        .clipShape(Circle())
        // 限制点击范围仅在圆形内部，避免过大可点击区域
        .contentShape(Circle())
}
