import SwiftUI
import CoreMotion

struct FullScreenImageView: View {
    let defaultImageName: String
    @Binding var isPresented: Bool
    @EnvironmentObject private var imageManager: ImageManager
    @EnvironmentObject private var soundManager: SoundManager
    @EnvironmentObject private var triggerManager: TriggerManager

    // 兼容旧代码：保留 model 但弱引用，仅在开关关闭时使用
    var model: BugOffModel

    private var useDirect: Bool { AppConfig.useDirectManagerBinding }

    // 当前正在显示的 mode 名称，实时读取模型中的选中值
    private var currentImageName: String { model.selectedDefaultImageName }

    @State private var showingAddSoundSheet = false
    @State private var selectedSounds: Set<String> = Set<String>()
    @State private var showingSettings = false
    @State private var clickCount = 0
    @State private var selectedSoundForList: String? = nil
    
    // 控制回溯按钮的显示
    @State private var showBacktrackButton = false

    // 添加摇晃检测
    @State private var isShaking = false

    // 添加触发次数显示管理器
    @StateObject private var triggerCountManager = TriggerCountToastManager()

    // 添加图片触发动画管理器
    @StateObject var animationManager = ImageTriggerAnimationManager()

    // 调试状态
    @State private var isDebugMode = false
    
    // 预加载状态跟踪，防止重复预加载
    @State private var preloadedImages: Set<String> = []

    // 添加圈选裁剪图片缓存，避免每次点击都重新计算
    @State private var cachedCircleSelectionImage: UIImage? = nil
    @State private var lastCircleSelectionCacheKey: String = ""

    // 添加 CoreMotion 管理器
    private let motionManager = CMMotionManager()
    @State private var shakeThreshold: Double = AppConfig.defaultShakeThreshold // 摇晃阈值（动态获取）

    // 表冠旋转相关状态
    @State private var crownRotationAccumulator: Double = 0.0 // 累积的表冠旋转量
    @State private var crownRotationThreshold: Double = AppConfig.defaultCrownRotationThreshold // 表冠旋转阈值（动态获取）
    @State private var lastCrownTriggerTime: Date = Date.distantPast // 上次表冠触发时间
    @State private var totalRotationAmount: Double = 0.0 // 累积的总旋转量（绝对值）

    // 摇晃检测防抖动
    @State private var lastShakeTime: Date = Date.distantPast
    // 日志控制
    @State private var lastLogTime: Date = Date.distantPast
    @State private var lastAcceleration: Double = 1.0

    // 自动触发定时器
    @State private var autoTriggerTimer: Timer?

    // MARK: - Mode Navigation Support
    // 移除多图片相关状态，现在用于mode切换
    
    var body: some View {
        ZStack {
            // Layer 0: 黑色背景，防止圈选裁剪的透明区域透出底层Grid视图
            Color.black
                .edgesIgnoringSafeArea(.all)
            
            // Layer 1: Content Area (Image + Toast Container)
            // This ZStack contains the main interactive content.
            // 现在总是使用自定义Toast显示，不再依赖于"显示次数"开关
            CustomClickableToastView(
                toastManager: triggerCountManager,
                config: model.getCustomTriggerDisplay(for: currentImageName),
                currentCount: model.getClickCount(for: currentImageName),
                imageManager: imageManager,
                imageName: currentImageName,
                triggerManager: model.triggerManager,
                isDebugMode: isDebugMode,
                onTap: { location in
                    if model.getTriggerMode(for: currentImageName) == .tap {
                        handleTrigger(at: location)
                    }
                }
            ) {
                imageContent
            }
        }
        .edgesIgnoringSafeArea(.all) // Ensure the content ZStack fills the entire screen
        // 表冠旋转检测
        .focusable(model.getTriggerMode(for: currentImageName) == .crown)
        .digitalCrownRotation(
            $crownRotationAccumulator,
            from: -50.0,
            through: 50.0,
            by: 0.1,
            sensitivity: .medium,
            isContinuous: true,
            isHapticFeedbackEnabled: false
        )
        .onChange(of: crownRotationAccumulator) { oldValue, newValue in
            // 安全检查，防止NaN值
            guard !oldValue.isNaN && !newValue.isNaN && oldValue.isFinite && newValue.isFinite else {
                Logger.warning("表冠旋转值异常: oldValue=\(oldValue), newValue=\(newValue)", category: .ui)
                return
            }

            if abs(newValue) > 45.0 {
                crownRotationAccumulator = 0.0
                return
            }

            // 计算本次旋转的增量（绝对值）
            let delta = newValue - oldValue
            let rotationIncrement = abs(delta)

            // 只有在表冠旋转模式下才累积
            guard model.getTriggerMode(for: currentImageName) == .crown else { return }

            // 减少累积速度：只累积较大的旋转增量
            if rotationIncrement > 0.05 {
                // 按比例累积，减慢累积速度
                totalRotationAmount += rotationIncrement * 0.3

                // 检查是否需要触发
                handleCrownRotation()
            }
        }
        .overlay(alignment: .bottomTrailing) {
            // Layer 2: Settings Button - Beautified and Centered
            // Placed in an overlay to be independent of all other content.
            Button(action: {
                // 优先显示设置视图，避免首次点击卡顿
                showingSettings = true
                // 在下一帧停止所有音效和自动触发，防止阻塞UI
                DispatchQueue.main.async {
                    model.stopSound()
                    stopAutoTrigger()
                }
            }) {
                ZStack {
                    // Frosted glass background for a modern look
                    Circle()
                        .fill(.clear)
                        .frame(width: AppTheme.adaptiveSize(40), height: AppTheme.adaptiveSize(40))
                        .background(.ultraThinMaterial, in: Circle())

                    Image(systemName: "gearshape.fill")
                        .font(.system(size: AppTheme.adaptiveSize(26)))
                        .foregroundColor(.white)
                }
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.bottom, AppTheme.adaptiveSize(20))
            .padding(.trailing, AppTheme.adaptiveSize(15))
        }
        .overlay(alignment: .bottomLeading) {
            // 回溯按钮（始终挂载，避免插入/移除导致过渡与闪烁）
            Button(action: handleBacktrack) {
                ZStack {
                    Circle()
                        .fill(.clear)
                        .frame(width: AppTheme.adaptiveSize(40), height: AppTheme.adaptiveSize(40))
                        .background(.ultraThinMaterial, in: Circle())

                    Image(systemName: "arrow.trianglehead.counterclockwise")
                        .font(.system(size: AppTheme.adaptiveSize(22)))
                        .foregroundColor(.white)
                }
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.bottom, AppTheme.adaptiveSize(20))
            .padding(.leading, AppTheme.adaptiveSize(15))
            // 可见性由不带动画的透明度控制，彻底规避过渡动画
            .opacity(showBacktrackButton ? 1 : 0)
            .allowsHitTesting(showBacktrackButton)
            .animation(nil, value: showBacktrackButton)
        }
        // 移除多图片导航指示器，现在用于mode切换
        // 移除左右mode切换按钮，只保留滑动手势
        .sheet(isPresented: $showingSettings, onDismiss: {
            // 设置视图关闭后，更新圈选裁剪缓存
            // 注意：自动触发的重启由通知机制处理，这里不需要重复调用
            invalidateCircleSelectionCache()
            preloadCircleSelectionImage()

            // 安全兜底：关闭设置页时，清理预览覆盖并无动画刷新一次
            previewBacktrackEnabled = nil
            previewSelectedSounds = nil
            Task { @MainActor in
                await performBacktrackButtonUpdate(withAnimation: false)
            }
        }) {
            ImageSettingsView(
                model: model,
                imageName: currentImageName,
                isPresented: $showingSettings
            )
        }
        .highPriorityGesture(
            DragGesture(minimumDistance: 20)
                .onEnded { gesture in
                    // 垂直滑动：关闭视图
                    if abs(gesture.translation.height) > abs(gesture.translation.width) && gesture.translation.height > 50 {
                        isPresented = false
                    }
                    // 水平滑动：切换上一个、下一个mode
                    else if abs(gesture.translation.width) > abs(gesture.translation.height) {
                        if gesture.translation.width > 50 {
                            // 向右滑动：上一个mode
                            if let previousModeName = model.previousMode(from: currentImageName) {
                                // 设置mode切换标志，禁用回溯按钮动画
                                isModeChanging = true

                                // 立即停止当前播放的音效
                                model.stopSound()
                                model.selectedDefaultImageName = previousModeName
                                // 触发图片切换动画
                                animationManager.triggerAnimation()

                                // 立即无动画更新回溯按钮显示状态（mode切换时应立即生效）
                                Task { @MainActor in
                                    await performBacktrackButtonUpdate(withAnimation: false)
                                    // 延长延迟时间，确保所有相关更新都被抑制
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                        isModeChanging = false
                                    }
                                }
                            }
                        } else if gesture.translation.width < -50 {
                            // 向左滑动：下一个mode
                            if let nextModeName = model.nextMode(from: currentImageName) {
                                // 设置mode切换标志，禁用回溯按钮动画
                                isModeChanging = true

                                // 立即停止当前播放的音效
                                model.stopSound()
                                model.selectedDefaultImageName = nextModeName
                                // 触发图片切换动画
                                animationManager.triggerAnimation()

                                // 立即无动画更新回溯按钮显示状态（mode切换时应立即生效）
                                Task { @MainActor in
                                    await performBacktrackButtonUpdate(withAnimation: false)
                                    // 延长延迟时间，确保所有相关更新都被抑制
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                        isModeChanging = false
                                    }
                                }
                            }
                        }
                    }
                }
        )
        .onLongPressGesture(minimumDuration: 0.5) {
            isPresented = false
        }
        .onAppear {
            // 加载点击次数
            clickCount = model.getClickCount(for: currentImageName)

            // 加载触发相关阈值
            let settings = model.imageManager.getImageSettings(for: currentImageName)
            shakeThreshold = settings.shakeThreshold
            crownRotationThreshold = settings.crownRotationThreshold

            // 根据触发模式启动相应的检测
            let triggerMode = model.getTriggerMode(for: currentImageName)
            switch triggerMode {
            case .auto:
                startAutoTrigger()
            case .shake:
                startShakeDetection()
            case .crown:
                crownRotationAccumulator = 0.0
                totalRotationAmount = 0.0
            case .tap:
                break // 点击模式不需要特殊处理
            }

            // 检查是否有音效配置，决定是否显示回溯按钮
            updateBacktrackButtonVisibility()
            
            // 预加载当前图片的Toast版本以提升性能（避免重复）
            if !preloadedImages.contains(currentImageName) {
                model.triggerManager.preloadCustomDisplayImage(for: currentImageName)
                preloadedImages.insert(currentImageName)
            }
            
            // 预加载相邻图片的Toast版本（避免重复）
            if let nextImageName = model.nextMode(from: currentImageName),
               !preloadedImages.contains(nextImageName) {
                model.triggerManager.preloadCustomDisplayImage(for: nextImageName)
                preloadedImages.insert(nextImageName)
            }
            if let prevImageName = model.previousMode(from: currentImageName),
               !preloadedImages.contains(prevImageName) {
                model.triggerManager.preloadCustomDisplayImage(for: prevImageName)
                preloadedImages.insert(prevImageName)
            }
            
            // 预加载当前圈选裁剪图片到缓存
            preloadCircleSelectionImage()
        }
        .onChange(of: currentImageName) { _, newImageName in
            // 当切换图片时，清理旧的圈选裁剪缓存
            invalidateCircleSelectionCache()

            // 预加载新图片的圈选裁剪图片
            preloadCircleSelectionImage()

            // 更新其他状态
            clickCount = model.getClickCount(for: newImageName)
            updateBacktrackButtonVisibility()

            // 更新触发相关阈值
            let settings = model.imageManager.getImageSettings(for: newImageName)
            shakeThreshold = settings.shakeThreshold
            crownRotationThreshold = settings.crownRotationThreshold

            // 根据新图片的触发模式启动相应的检测
            let triggerMode = model.getTriggerMode(for: newImageName)

            // 先停止所有检测
            stopAutoTrigger()
            stopShakeDetection()

            // 根据模式启动相应检测
            switch triggerMode {
            case .auto:
                startAutoTrigger()
            case .shake:
                startShakeDetection()
            case .crown:
                crownRotationAccumulator = 0.0
                totalRotationAmount = 0.0
            case .tap:
                break // 点击模式不需要特殊处理
            }
        }
        .onChange(of: showingSettings) { _, isShowing in
            // 当设置视图关闭时，重新检查并应用触发模式
            if !isShowing {
                // 先停止当前的检测
                stopAutoTrigger()
                stopShakeDetection()

                // 强制刷新缓存并重新加载所有阈值设置
                // 使用延迟确保设置已经保存完成
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    let settings = model.imageManager.getImageSettings(for: currentImageName)
                    shakeThreshold = settings.shakeThreshold
                    crownRotationThreshold = settings.crownRotationThreshold

                    // 根据当前模式启动相应的检测
                    let currentMode = model.getTriggerMode(for: currentImageName)
                    switch currentMode {
                    case .auto:
                        startAutoTrigger()
                    case .shake:
                        startShakeDetection()
                    case .crown:
                        crownRotationAccumulator = 0.0
                        totalRotationAmount = 0.0
                    case .tap:
                        break // 点击模式不需要特殊处理
                    }
                }

                // 设置页关闭后再进行回溯按钮显隐更新，避免用户看到从无到有的过渡
                updateBacktrackButtonVisibility()
            }
        }
        .onChange(of: model.imageMultiSounds) {  _, _ in
            // 当音效配置改变时，立即更新回溯按钮显示状态
            // 如果正在mode切换，跳过以避免动画
            if !isModeChanging {
                updateBacktrackButtonVisibility()
            }
        }
        .onReceive(model.objectWillChange) { _ in
            // 当ImageManager中的设置发生变化时（包括enableBacktrack），立即更新回溯按钮显示状态
            // 如果正在mode切换，跳过以避免动画
            if !isModeChanging {
                updateBacktrackButtonVisibility()
            }
        }
        // 监听 imageManager 的变化（如 enableBacktrack 开关），实时更新回溯按钮
        .onReceive(imageManager.objectWillChange) { _ in
            // 如果正在mode切换，跳过以避免动画
            if !isModeChanging {
                updateBacktrackButtonVisibility()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("AutoTriggerIntervalChanged"))) { notification in
            // 监听自动触发时间间隔变化通知
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName,
               userInfo["interval"] is Double {

                if model.getTriggerMode(for: currentImageName) == .auto {
                    startAutoTrigger()
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("ModeSettingsSaved"))) { notification in
            // 设置页保存完成后，立即无动画刷新回溯按钮（避免看到显隐过渡）
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {
                // 清除预览覆盖，转回持久化数据
                previewBacktrackEnabled = nil
                previewSelectedSounds = nil
                Task { @MainActor in
                    await performBacktrackButtonUpdate(withAnimation: false)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("BacktrackTogglePreview"))) { notification in
            // 设置页内切换回溯开关时，直接无动画刷新按钮
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {
                if let enabled = userInfo["enabled"] as? Bool {
                    previewBacktrackEnabled = enabled
                }
                Task { @MainActor in
                    await performBacktrackButtonUpdate(withAnimation: false)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("SelectedSoundsPreview"))) { notification in
            // 设置页内音效选择变化时，直接无动画刷新按钮
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {
                if let sounds = userInfo["selectedSounds"] as? [String] {
                    previewSelectedSounds = sounds
                }
                Task { @MainActor in
                    await performBacktrackButtonUpdate(withAnimation: false)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("TriggerModeChanged"))) { notification in
            // 监听触发模式变化通知
            // 只有在设置视图未显示时才响应（避免在设置界面切换时触发）
            if !showingSettings,
               let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {

                // 先停止当前的自动触发定时器和摇晃检测
                stopAutoTrigger()
                stopShakeDetection()

                // 根据新模式启动相应的检测
                let newTriggerMode = model.getTriggerMode(for: currentImageName)
                if newTriggerMode == .auto {
                    startAutoTrigger()
                } else if newTriggerMode == .shake {
                    startShakeDetection()
                }
            }
        }

        .onChange(of: currentImageName) { oldValue, newValue in
            // 当切换到不同的图片/mode时，重新加载阈值和触发模式
            // 停止当前的触发检测
            stopAutoTrigger()
            stopShakeDetection()

            // 重新加载设置
            let settings = model.imageManager.getImageSettings(for: newValue)
            shakeThreshold = settings.shakeThreshold

            // 根据新的触发模式启动相应的检测
            let triggerMode = model.getTriggerMode(for: newValue)

            if triggerMode == .auto {
                startAutoTrigger()
            } else if triggerMode == .shake {
                startShakeDetection()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("ShakeThresholdChanged"))) { notification in
            // 监听摇晃阈值变化通知
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName,
               let threshold = userInfo["threshold"] as? Double {

                shakeThreshold = threshold

                if model.getTriggerMode(for: currentImageName) == .shake {
                    stopShakeDetection()
                    startShakeDetection()
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("CrownRotationThresholdChanged"))) { notification in
            // 监听表冠旋转阈值变化通知
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName,
               let threshold = userInfo["threshold"] as? Double {

                crownRotationThreshold = threshold

                if model.getTriggerMode(for: currentImageName) == .crown {
                    crownRotationAccumulator = 0.0
                    totalRotationAmount = 0.0
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("CircleSelectionUpdated"))) { notification in
            // 监听圈选裁剪数据更新通知
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {
                // 清理圈选裁剪缓存
                invalidateCircleSelectionCache()
                // 重新加载圈选裁剪图片
                preloadCircleSelectionImage()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("ImageSizeUpdated"))) { notification in
            // 监听图片大小调整通知
            if let userInfo = notification.userInfo,
               let imageName = userInfo["imageName"] as? String,
               imageName == currentImageName {
                // 触发视图刷新以应用新的缩放比例
                // 由于getCurrentImageScale()会读取最新的设置，这里只需要触发重新渲染
            }
        }
        .onDisappear {
            // 停止摇晃检测
            stopShakeDetection()
            // 停止自动触发定时器
            stopAutoTrigger()
            // 停止所有音效及计划音效
            model.stopSound()
        }
        .sheet(isPresented: $showingAddSoundSheet) {
            NavigationStack {
                SoundListView(
                    model: model,
                    mode: .multiSelect,
                    selectedSound: $selectedSoundForList,
                    selectedSounds: $selectedSounds,
                    imageName: currentImageName
                )
            }
        }
        // 移除定时器，回溯按钮现在根据音效配置直接显示/隐藏
    }
    
    // 防抖动状态
    @State private var backtrackUpdateTask: Task<Void, Never>?
    // 抑制一次性动画切换，避免设置关闭瞬间的显隐动画
    @State private var suppressNextAnimatedBacktrackUpdate: Bool = false
    // mode切换状态标志，用于禁用回溯按钮的过渡动画
    @State private var isModeChanging: Bool = false
    // 设置页内的回溯开关预览覆盖（未保存前用于无动画预览按钮显隐）
    @State private var previewBacktrackEnabled: Bool? = nil
    // 设置页内的临时音效选择预览（未保存前用于按钮显隐判定）
    @State private var previewSelectedSounds: [String]? = nil

    // 更新回溯按钮的显示状态（优化版本，添加防抖动和缓存）
    private func updateBacktrackButtonVisibility() {
        // 防抖动：取消之前的任务
        backtrackUpdateTask?.cancel()

        // 若设置页正在显示或mode正在切换：仍然更新，但禁用动画
        if showingSettings || isModeChanging {
            Task { @MainActor in
                await performBacktrackButtonUpdate(withAnimation: false)
            }
            // 设置关闭后的第一次更新也禁用动画，避免看到过渡
            suppressNextAnimatedBacktrackUpdate = true
            return
        }

        // 如果启用防抖动优化，延迟执行
        if AppConfig.useDebounceOptimization {
            backtrackUpdateTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(AppConfig.debounceDelay * 1_000_000_000))

                guard !Task.isCancelled else { return }
                let animate = suppressNextAnimatedBacktrackUpdate ? false : true
                await performBacktrackButtonUpdate(withAnimation: animate)
                suppressNextAnimatedBacktrackUpdate = false
            }
        } else {
            Task { @MainActor in
                let animate = suppressNextAnimatedBacktrackUpdate ? false : true
                await performBacktrackButtonUpdate(withAnimation: animate)
                suppressNextAnimatedBacktrackUpdate = false
            }
        }
    }

    // 执行实际的回溯按钮更新逻辑
    @MainActor
    private func performBacktrackButtonUpdate(withAnimation useAnimation: Bool = true) async {
        // 使用当前选中的mode名称
        let currentModeName = model.selectedDefaultImageName

        // 确定正确的上下文
        let modeContext: ModeContext
        if currentModeName.contains("_copy_") {
            modeContext = ModeContext(modeId: currentModeName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        // 获取图片设置：mode切换期间强制同步以避免闪烁
        let settings: ImageSettings
        if isModeChanging {
            settings = imageManager.getImageSettings(for: currentModeName, in: modeContext)
        } else if AppConfig.useAsyncConfigurationLoad {
            settings = await Task {
                return imageManager.getImageSettings(for: currentModeName, in: modeContext)
            }.value
        } else {
            settings = imageManager.getImageSettings(for: currentModeName, in: modeContext)
        }

        let isBacktrackEnabled = previewBacktrackEnabled ?? settings.enableBacktrack
        // 选择用于判定的音效列表：优先使用设置页内的预览选择
        let soundsToUse: [String] = {
            if let preview = previewSelectedSounds { return preview }
            return model.imageMultiSounds[currentModeName] ?? []
        }()
        let shouldShow: Bool = !soundsToUse.isEmpty && isBacktrackEnabled

        // 只有当状态真正改变时才使用动画
        if shouldShow != showBacktrackButton {
            if useAnimation {
                withAnimation(.easeInOut(duration: AppConfig.defaultAnimationDuration)) {
                    showBacktrackButton = shouldShow
                }
            } else {
                // 在禁用动画路径上也显式关闭事务动画，彻底杜绝隐式动画
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    showBacktrackButton = shouldShow
                }
            }
        }
    }
    
    // 统一的触发处理方法 - 只负责播放和重新播放
    private func handleTrigger(at location: CGPoint?) {
        // 如果正在显示设置界面，则禁用所有触发
        guard !showingSettings else {
            return
        }

        // 执行图片触发动画
        animationManager.triggerAnimation()

        // 停止当前播放的音效（如果有）
        model.stopSound()

        // 检查是否启用随机提示或自定义提示，使用正确的上下文
        let modeContext: ModeContext
        if currentImageName.contains("_copy_") {
            modeContext = ModeContext(modeId: currentImageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }
        let settings = imageManager.getImageSettings(for: currentImageName, in: modeContext)

        // 全局触发提示总开关：关闭时不展示任何提示（包含随机与自定义）
        let globalTriggerConfig = model.getCustomTriggerDisplay(for: currentImageName)
        if !globalTriggerConfig.isEnabled {
            triggerCountManager.clearCustomConfig()
            // 仍然执行计数与音效逻辑，但不展示Toast
            model.triggerImage(for: currentImageName)
            clickCount = model.getClickCount(for: currentImageName)
            DispatchQueue.main.async {
                updateBacktrackButtonVisibility()
            }
            return
        }

        // 如果当前不是随机提示模式，清除之前可能缓存的随机配置
        if !settings.randomHintEnabled {
            triggerCountManager.clearCustomConfig()
        }

        if settings.randomHintEnabled {
            let randomConfig = model.triggerManager.generateRandomTriggerDisplay()

            // 使用随机配置的增量值来更新触发次数
            model.triggerManager.triggerImageWithCustomIncrement(
                for: currentImageName,
                incrementValue: randomConfig.incrementValue,
                imageManager: imageManager,
                soundManager: model.soundManager,
                bugOffModel: model
            )

            let colorList = [AppTheme.getColor(fromName: randomConfig.displayColor)]

            let displayCount = randomConfig.incrementValue

            if let location = location {
                triggerCountManager.showCustomTrigger(
                    count: displayCount,
                    config: randomConfig,
                    colors: colorList,
                    at: location
                )
            } else {
                triggerCountManager.showCustomTrigger(
                    count: displayCount,
                    config: randomConfig,
                    colors: colorList
                )
            }
        } else {
            // 使用自定义提示（原有逻辑）
            model.triggerImage(for: currentImageName)

            let config = model.getCustomTriggerDisplay(for: currentImageName)

            if config.isEnabled {
                let colorList = getColorList(for: currentImageName, config: config)

                if let location = location {
                    triggerCountManager.showCustomTrigger(
                        count: clickCount,
                        config: config,
                        colors: colorList,
                        at: location
                    )
                } else {
                    triggerCountManager.showCustomTrigger(
                        count: clickCount,
                        config: config,
                        colors: colorList
                    )
                }
            } else {
                if let location = location {
                    triggerCountManager.showTriggerCount(clickCount, at: location)
                } else {
                    triggerCountManager.showTriggerCount(clickCount)
                }
            }
        }

        // 更新本地点击次数显示
        clickCount = model.getClickCount(for: currentImageName)
        
        // 更新回溯按钮显示状态（异步触发，避免在视图更新期间发布更改）
        DispatchQueue.main.async {
            updateBacktrackButtonVisibility()
        }
    }
    
    // 专门处理回溯逻辑的方法
    private func handleBacktrack() {
        // 使用当前选中的mode名称
        let currentModeName = model.selectedDefaultImageName

        // 检查当前mode是否有音效配置
        guard let sounds = model.imageMultiSounds[currentModeName], !sounds.isEmpty else {
            return
        }

        // 执行图片触发动画
        animationManager.triggerAnimation()

        // 音效处理：回溯或播放
        if soundManager.isPlaying() {
            // 只进行音效回溯，不触发其他逻辑
            soundManager.backtrackCurrentSound()
        } else {
            // 如果没有音效在播放，播放当前mode的音效
            model.playMultiSounds(names: sounds, for: currentModeName)
        }

        // 异步处理自定义显示，避免阻塞主线程
        DispatchQueue.main.async {
            handleBacktrackTriggerDisplay()
        }

        // 更新回溯按钮显示状态（异步触发，避免在视图更新期间发布更改）
        DispatchQueue.main.async {
            updateBacktrackButtonVisibility()
        }
    }

    // 处理回溯触发的自定义显示
    private func handleBacktrackTriggerDisplay() {
        // 检查是否启用随机提示或自定义提示
        let settings = imageManager.getImageSettings(for: currentImageName)

        // 全局触发提示总开关：关闭时不展示任何提示（包含随机与自定义）
        let globalTriggerConfig = model.getCustomTriggerDisplay(for: currentImageName)
        if !globalTriggerConfig.isEnabled {
            triggerCountManager.clearCustomConfig()
            return
        }

        // 如果当前不是随机提示模式，清除之前可能缓存的随机配置
        if !settings.randomHintEnabled {
            triggerCountManager.clearCustomConfig()
        }

        if settings.randomHintEnabled {
            // 使用随机提示 - 先生成随机配置
            let randomConfig = model.triggerManager.generateRandomTriggerDisplay()

            // 使用随机配置的增量值来更新触发次数
            model.triggerManager.triggerImageWithCustomIncrement(
                for: currentImageName,
                incrementValue: randomConfig.incrementValue,
                imageManager: imageManager,
                soundManager: model.soundManager,
                bugOffModel: model
            )

            let colorList = [AppTheme.getColor(fromName: randomConfig.displayColor)]

            // 对于随机提示，使用配置中的增量值作为显示计数
            let displayCount = randomConfig.incrementValue

            // 使用回溯专用方法显示Toast（在上一次显示的位置）
            triggerCountManager.showBacktrackTrigger(
                count: displayCount,
                config: randomConfig,
                colors: colorList
            )
        } else {
            // 使用自定义提示（原有逻辑）
            model.triggerImage(for: currentImageName)

            let config = model.getCustomTriggerDisplay(for: currentImageName)
            if config.isEnabled {
                let colorList = getColorList(for: currentImageName, config: config)

                // 使用回溯专用方法显示Toast（在上一次显示的位置）
                triggerCountManager.showBacktrackTrigger(
                    count: clickCount,
                    config: config,
                    colors: colorList
                )
            }
        }

        // 更新本地点击次数显示
        clickCount = model.getClickCount(for: currentImageName)
    }

    // 提取颜色列表获取逻辑，避免重复代码
    private func getColorList(for imageName: String, config: CustomTriggerDisplay) -> [Color] {
        var colorList: [Color] = [.white] // 默认至少有一个白色

        if let colorData = UserDefaults.standard.data(forKey: "selectedColors_\(imageName)") {
            if let selectedColors = try? JSONDecoder().decode([String].self, from: colorData) {
                if !selectedColors.isEmpty { // 确保选择的颜色列表不为空
                    // 如果是彩虹色模式
                    if selectedColors.contains("rainbow") {
                        colorList = [.red, .orange, .yellow, .green, .blue, .purple]
                    }
                    // 如果是多色模式
                    else if selectedColors.count > 1 {
                        colorList = selectedColors.map { AppTheme.getColor(fromName: $0) }
                    }
                    // 单色模式
                    else if selectedColors.count == 1 {
                        colorList = [AppTheme.getColor(fromName: selectedColors[0])]
                    }
                }
            }
        } else {
            // 默认使用配置中的颜色，确保至少有一个颜色
            let configColor = config.getColor()
            colorList = [configColor]
        }

        // 确保颜色列表不为空
        if colorList.isEmpty {
            colorList = [.white] // 保底使用白色
        }

        return colorList
    }

    private func playImageSounds() {
        let names = model.imageMultiSounds[currentImageName] ?? []
        if !names.isEmpty {
            model.playMultiSounds(names: names, for: currentImageName)
        } else {
            Logger.warning("FullScreenImageView: 没有找到音效配置: \(currentImageName)", category: .soundManager)
        }
    }
    
    private func loadSelectedSounds() {
        selectedSounds.removeAll()
        if let names = model.imageMultiSounds[currentImageName] {
            selectedSounds = Set(names)
        }
    }
    
    // 启动摇晃检测
    private func startShakeDetection() {
        guard motionManager.isAccelerometerAvailable else {
            return
        }

        // 先停止之前的检测
        if motionManager.isAccelerometerActive {
            motionManager.stopAccelerometerUpdates()
        }

        motionManager.accelerometerUpdateInterval = 0.05
        motionManager.startAccelerometerUpdates(to: .main) { data, error in
            guard let data = data, error == nil else {
                return
            }

            // 全新的简单摇晃检测：基于加速度变化
            let acceleration = sqrt(pow(data.acceleration.x, 2) +
                                   pow(data.acceleration.y, 2) +
                                   pow(data.acceleration.z, 2))

            // 计算加速度变化幅度（摇晃的本质是加速度快速变化）
            let accelerationChange = abs(acceleration - self.lastAcceleration)
            self.lastAcceleration = acceleration

            // 防抖动：确保距离上次摇晃至少0.5秒
            let now = Date()
            let timeSinceLastShake = now.timeIntervalSince(self.lastShakeTime)

            // 使用配置文件中的映射参数，反向映射让标签与效果一致
            // 左侧"低"灵敏度 -> 高阈值（难触发），右侧"高"灵敏度 -> 低阈值（易触发）
            let thresholdRange = AppConfig.maxShakeThreshold - AppConfig.minShakeThreshold // 200
            let changeRange = AppConfig.maxShakeChangeThreshold - AppConfig.minShakeChangeThreshold // 50-0.03
            let normalizedThreshold = self.shakeThreshold / thresholdRange // 0-1
            // 反向映射：阈值越大，实际检测阈值越小（越敏感）
            let reversedNormalizedThreshold = 1.0 - normalizedThreshold
            let mappedChange = AppConfig.minShakeChangeThreshold + (reversedNormalizedThreshold * changeRange)
            let changeThreshold = max(AppConfig.minShakeChangeThreshold, mappedChange)

            // 记录摇晃变化（帮助用户了解摇晃强度）
            if accelerationChange > 0.05 && now.timeIntervalSince(self.lastLogTime) > 1.0 {
                Logger.debug("摇晃变化: \(String(format: "%.2f", accelerationChange)) (阈值: \(String(format: "%.2f", changeThreshold)))", category: .ui)
                self.lastLogTime = now
            }

            // 检测是否超过摇晃阈值
            if accelerationChange > changeThreshold && timeSinceLastShake > 0.5 {
                let currentMode = self.model.getTriggerMode(for: self.currentImageName)

                // 只有在摇晃触发模式下且未显示设置界面时才响应摇晃
                if currentMode == .shake && !self.isShaking && !showingSettings {
                    self.isShaking = true
                    self.lastShakeTime = now

                    // 触发时记录变化幅度
                    Logger.debug("摇晃触发: 变化 \(String(format: "%.2f", accelerationChange))", category: .ui)

                    // 在主线程上执行UI更新
                    DispatchQueue.main.async {
                        self.handleTrigger(at: nil)

                        // 0.8秒后重置摇晃状态，避免连续触发
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                            self.isShaking = false
                        }
                    }
                }
            }
        }
    }
    
    private func stopShakeDetection() {
        if motionManager.isAccelerometerActive {
            motionManager.stopAccelerometerUpdates()
        }
        isShaking = false
        lastShakeTime = Date.distantPast
        lastLogTime = Date.distantPast
        lastAcceleration = 1.0  // 重置加速度基准值，确保切换mode时摇晃检测正常工作
    }



    // MARK: - Mode Navigation Methods
    // 多图片切换相关方法已移除，现在通过其他方式切换多图
}

extension FullScreenImageView {
    /// 承载图片本身的内容视图（包含裁剪/缩放等逻辑）
     var imageContent: some View {
        Group {
            // 显示当前mode的图片
            if let circleImage = getCircleSelectionImage() {
                // 圈选裁剪后的图片使用 scaledToFit 以确保完整显示，但仍然应用用户设置的图片大小和位置
                Image(uiImage: circleImage)
                    .resizable()
                    .scaledToFit()
                    // 应用用户设置的图片大小缩放和位置偏移
                    .scaleEffect(getCurrentImageScale())
                    .offset(getCurrentImageOffset())
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let uiImage = getCurrentDisplayImage() {
                // 普通图片使用 scaledToFill 以填充屏幕
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    // 应用缩放和偏移
                    .scaleEffect(getCurrentImageScale())
                    .offset(getCurrentImageOffset())
            } else {
                // 加载失败时占位
                Image(systemName: "photo")
                    .resizable()
                    .scaledToFit()
                    .foregroundColor(.gray)
            }
        }
        .frame(width: WKInterfaceDevice.current().screenBounds.width,
               height: WKInterfaceDevice.current().screenBounds.height)
        .clipped()
        .edgesIgnoringSafeArea(.all)
        .contentShape(Rectangle())
        .scaleEffect(animationManager.scale)
    }

    // MARK: - Image Helper Methods

    /// 获取应用了圈选裁剪的图片（如果有）
    private func getCircleSelectionImage() -> UIImage? {
        // 检查缓存
        if let cachedImage = cachedCircleSelectionImage, lastCircleSelectionCacheKey == currentImageName {
            return cachedImage
        }

        // 获取当前图片的自定义触发显示配置
        let config = model.getCustomTriggerDisplay(for: currentImageName)

        // 检查是否有主图圈选数据
        guard let selectionData = config.mainCircleSelectionData,
              !selectionData.pathPoints.isEmpty else {
            return nil
        }
        
        // 获取原始图片
        guard let originalImage = model.imageManager.getOriginalImage(for: currentImageName) else {
            return nil
        }

        // 应用圈选裁剪
        let renderedImage = model.applyCircleSelectionToImage(
            originalImage,
            selectionData: selectionData,
            scale: config.mainImageScale,
            offset: config.mainImageOffset
        )

        // 更新缓存
        cachedCircleSelectionImage = renderedImage
        lastCircleSelectionCacheKey = currentImageName

        return renderedImage
    }

    private func getCurrentDisplayImage() -> UIImage? {
        return imageManager.getDisplayImage(for: currentImageName)
    }

    private func getCurrentImageScale() -> CGFloat {
        // 确定正确的上下文
        let modeContext: ModeContext
        if currentImageName.contains("_copy_") {
            modeContext = ModeContext(modeId: currentImageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        let settings = imageManager.getImageSettings(for: currentImageName, in: modeContext)
        if settings.isMultiImageMode {
            let currentImageName = settings.currentDisplayImageName
            return model.getImageScale(for: currentImageName)
        }
        return model.getImageScale(for: currentImageName)
    }

    private func getCurrentImageOffset() -> CGSize {
        // 所有图片（包括圈选裁剪的图片）都应用用户设置的偏移量
        let settings = imageManager.getImageSettings(for: currentImageName)
        if settings.isMultiImageMode {
            let currentImageName = settings.currentDisplayImageName
            return model.getImageOffset(for: currentImageName)
        }
        return model.getImageOffset(for: currentImageName)
    }

    // MARK: - Auto Trigger Methods

    /// 启动自动触发定时器
    private func startAutoTrigger() {
        // 先停止现有定时器
        stopAutoTrigger()

        // 获取自动触发间隔
        let settings = model.imageManager.getImageSettings(for: currentImageName)
        let interval = settings.autoTriggerInterval

        // 如果间隔为0或负数，则不启动定时器（停止状态）
        guard interval > 0 else {
            return
        }

        Logger.debug("启动自动触发定时器，间隔: \(interval)秒", category: .ui)

        // 启动定时器进行循环触发（移除立即触发，避免重复触发）
        autoTriggerTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            handleTrigger(at: nil)
        }
    }

    /// 停止自动触发定时器
    private func stopAutoTrigger() {
        autoTriggerTimer?.invalidate()
        autoTriggerTimer = nil
    }

    // 预加载圈选裁剪图片到缓存
    private func preloadCircleSelectionImage() {
        // 获取当前图片的自定义触发显示配置
        let config = model.getCustomTriggerDisplay(for: currentImageName)
        
        // 检查是否有主图圈选数据
        guard let selectionData = config.mainCircleSelectionData,
              !selectionData.pathPoints.isEmpty else {
            // 如果没有圈选数据，则清除缓存
            cachedCircleSelectionImage = nil
            lastCircleSelectionCacheKey = ""
            return
        }
        
        // 获取原始图片
        guard let originalImage = model.imageManager.getOriginalImage(for: currentImageName) else {
            // 如果原始图片加载失败，则清除缓存
            cachedCircleSelectionImage = nil
            lastCircleSelectionCacheKey = ""
            return
        }
        
        // 应用圈选裁剪
        let renderedImage = model.applyCircleSelectionToImage(
            originalImage,
            selectionData: selectionData,
            scale: config.mainImageScale,
            offset: config.mainImageOffset
        )
        
        // 更新缓存
        cachedCircleSelectionImage = renderedImage
        lastCircleSelectionCacheKey = currentImageName
    }

    // 清理圈选裁剪图片缓存
    private func invalidateCircleSelectionCache() {
        cachedCircleSelectionImage = nil
        lastCircleSelectionCacheKey = ""
    }

    // MARK: - Crown Rotation Detection

    /// 处理表冠旋转触发检测
    private func handleCrownRotation() {
        // 只在表冠旋转触发模式下处理
        guard model.getTriggerMode(for: currentImageName) == .crown else { return }

        // 防止在设置界面显示时触发
        guard !showingSettings else { return }

        let now = Date()
        let timeSinceLastTrigger = now.timeIntervalSince(lastCrownTriggerTime)

        // 增强防抖动：至少间隔0.5秒才能再次触发
        guard timeSinceLastTrigger > 0.5 else { return }

        // 安全检查：确保阈值和累积旋转量都有效
        guard totalRotationAmount.isFinite && !totalRotationAmount.isNaN &&
              crownRotationThreshold.isFinite && !crownRotationThreshold.isNaN else {
            Logger.warning("表冠旋转计算值异常: total=\(totalRotationAmount), threshold=\(crownRotationThreshold)", category: .ui)
            return
        }

        // 检查累积旋转量是否达到阈值
        if totalRotationAmount >= crownRotationThreshold {
            lastCrownTriggerTime = now

            // 重置累积旋转量，准备下次检测
            totalRotationAmount = 0.0

            // 提供触觉反馈
            WKInterfaceDevice.current().play(.click)

            // 触发音效
            Logger.debug("表冠旋转触发: 累积旋转量达到阈值 \(crownRotationThreshold)", category: .ui)

            // 在主线程上执行触发
            DispatchQueue.main.async {
                self.handleTrigger(at: nil)
            }
        }
    }
}
