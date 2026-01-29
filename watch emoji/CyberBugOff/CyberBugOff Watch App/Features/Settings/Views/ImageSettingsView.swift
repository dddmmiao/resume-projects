import SwiftUI
import WatchKit
import Foundation
import AVFoundation
import PhotosUI

/// 图片设置视图 - 提供图片裁剪、音效选择和播放模式配置功能
struct ImageSettingsView: View {
    // MARK: - Properties
    @ObservedObject var model: BugOffModel
    let imageName: String
    @Binding var isPresented: Bool
    @State private var showingSoundSelector = false
    @State private var pushSoundSelector = false
    @State private var selectedSounds: Set<String> = Set<String>()
    // UI无闪烁：用于功能区显隐的选择集快照
    @State private var uiSelectedSoundsSnapshot: Set<String> = Set<String>()
    @State private var showingImageEditor = false
    @State private var showingImageSizeEditor = false
    @State private var showingImageProportionEditor = false
    @State private var triggerMode: ImageTriggerMode
    @State private var currentImageName: String
    @State private var showingCustomTriggerConfig = false
    @State private var showingCustomImageTriggerConfig = false
    @State private var showResetConfirmation = false

    // 当前使用的mode上下文
    private let currentModeContext: ModeContext
    @State private var enableBacktrack: Bool // 添加回溯功能开关状态
    @State private var backtrackDuration: TimeInterval? // 音效回溯时长
    @State private var showingBacktrackControl: Bool = false // 回溯控制展开状态

    // 新增：mode管理相关状态
    @State private var showingDeleteConfirmation: Bool = false
    @State private var showingCopyConfirmation: Bool = false

    // 第三步：Mode设置的完全临时配置状态
    @State private var tempTriggerMode: ImageTriggerMode
    @State private var tempSoundPlayMode: SoundPlayMode = .sequential
    @State private var tempEnableBacktrack: Bool = false
    @State private var tempBacktrackDuration: Double? = nil
    @State private var tempAutoTriggerInterval: Double = 2.0
    @State private var tempShakeThreshold: Double = AppConfig.defaultShakeThreshold
    @State private var tempCrownRotationThreshold: Double = AppConfig.defaultCrownRotationThreshold
    @State private var tempRandomHintEnabled: Bool = false


    
    // 添加缺失的状态变量
    @State private var isCropping: Bool = false
    // 暂存的裁剪结果
    @State private var tempCroppedImage: UIImage?
    @State private var tempScale: CGFloat = 1.0
    @State private var tempOffset: CGSize = .zero
    @State private var tempFileURL: URL?
    @State private var hasPendingChanges = false
    
    // 动画状态
    @State private var isAnimating = false
    
    // 动态颜色预览状态
    @State private var previewColors: [Color] = []
    @State private var currentColorIndex: Int = 0
    @State private var colorChangeTimer: Timer?
    
    // 累计次数状态 - 用于强制界面更新
    @State private var currentTriggerCount: Int = 0
    // 自动触发时间间隔状态
    @State private var autoTriggerInterval: Double = 2.0
    // 摇晃触发阈值状态
    @State private var shakeThreshold: Double = AppConfig.defaultShakeThreshold
    // 表冠旋转触发阈值状态
    @State private var crownRotationThreshold: Double = AppConfig.defaultCrownRotationThreshold

    // 表冠旋转灵敏度的反向映射值（用于UI显示）
    private var crownRotationSensitivity: Binding<Double> {
        Binding(
            get: {
                // 反向映射：阈值越大，灵敏度越低
                // 将阈值范围 [0.1, 500.0] 映射到灵敏度范围 [0.1, 500.0]，但方向相反
                let thresholdRange = AppConfig.maxCrownRotationThreshold - AppConfig.minCrownRotationThreshold
                let normalizedThreshold = (crownRotationThreshold - AppConfig.minCrownRotationThreshold) / thresholdRange
                let reversedNormalized = 1.0 - normalizedThreshold
                return AppConfig.minCrownRotationThreshold + (reversedNormalized * thresholdRange)
            },
            set: { newSensitivity in
                // 反向映射：灵敏度越高，阈值越低
                let sensitivityRange = AppConfig.maxCrownRotationThreshold - AppConfig.minCrownRotationThreshold
                let normalizedSensitivity = (newSensitivity - AppConfig.minCrownRotationThreshold) / sensitivityRange
                let reversedNormalized = 1.0 - normalizedSensitivity
                crownRotationThreshold = AppConfig.minCrownRotationThreshold + (reversedNormalized * sensitivityRange)
            }
        )
    }


    @State private var soundPlayMode: SoundPlayMode
    
    // 强制UI刷新的状态变量
    @State private var configUpdateTrigger: Bool = false

    // 自定义显示区域展开状态
    @State private var customDisplayExpanded: Bool = false

    // 触发模式相关设置的展开状态
    @State private var autoTriggerExpanded: Bool = false
    @State private var shakeThresholdExpanded: Bool = false
    @State private var crownRotationExpanded: Bool = false

    // 性能优化：缓存配置以减少频繁获取
    @State private var cachedCustomTriggerDisplay: CustomTriggerDisplay?

    // 触发提示开关状态
    @State private var triggerHintEnabled: Bool = true

    // 随机提示开关状态
    @State private var randomHintEnabled: Bool = false

    // 新增：图片模式显示名称

    // 渐进式UI加载状态
    @State private var uiLoadingPhase: Int = 0
    // 返回时避免重置UI快照导致闪动
    @State private var hasInitializedUI: Bool = false

    // UI无闪烁：主图圈选存在性的快照，用于控制"图片占比"功能行显隐
    @State private var uiHasCircleSelection: Bool = false

    // 图片选择相关状态
    @State private var showingImagePicker: Bool = false
    @StateObject private var photoService = PhotoSelectionService()
    
    // 标志位：标识是否有待处理的图片更换操作
    @State private var hasPendingImageReplacement = false
    
    // MARK: - Initialization
    init(model: BugOffModel, imageName: String, isPresented: Binding<Bool>) {
        self.model = model
        self.imageName = imageName
        self._isPresented = isPresented
        self._currentImageName = State(initialValue: imageName)

        // 确定正确的mode上下文
        if imageName.contains("_copy_") {
            // 复制的mode，使用其自己的上下文
            self.currentModeContext = ModeContext(modeId: imageName)
            #if DEBUG
            Logger.debug("Mode设置层复制mode上下文: \(imageName)", category: .ui)
            #endif
        } else {
            // 原始mode，使用当前上下文
            self.currentModeContext = model.imageManager.getCurrentModeContext()
        }

        // 优化：从 imageManager 加载已保存的设置，而不是使用默认值
        let defaultSettings = model.imageManager.getImageSettings(for: imageName, in: self.currentModeContext)

        // 同步加载音效状态，避免UI元素从无到有的闪烁
        let initialSounds = Set(model.imageMultiSounds[imageName] ?? [])
        let initialTriggerMode = model.triggerManager.getTriggerMode(for: imageName, imageManager: model.imageManager)

        self._triggerMode = State(initialValue: initialTriggerMode) // 使用实际值
        self._selectedSounds = State(initialValue: initialSounds) // 使用实际音效
        self._soundPlayMode = State(initialValue: defaultSettings.soundPlayMode)
        self._enableBacktrack = State(initialValue: defaultSettings.enableBacktrack)
        self._backtrackDuration = State(initialValue: defaultSettings.backtrackDuration)
        self._autoTriggerInterval = State(initialValue: defaultSettings.autoTriggerInterval)
        self._shakeThreshold = State(initialValue: defaultSettings.shakeThreshold)
        self._crownRotationThreshold = State(initialValue: defaultSettings.crownRotationThreshold)
        self._randomHintEnabled = State(initialValue: defaultSettings.randomHintEnabled)

        // 第三步：初始化临时配置状态（从当前配置复制）
        self._tempTriggerMode = State(initialValue: initialTriggerMode)
        self._tempSoundPlayMode = State(initialValue: defaultSettings.soundPlayMode)
        self._tempEnableBacktrack = State(initialValue: defaultSettings.enableBacktrack)
        self._tempBacktrackDuration = State(initialValue: defaultSettings.backtrackDuration)
        self._tempAutoTriggerInterval = State(initialValue: defaultSettings.autoTriggerInterval)
        self._tempShakeThreshold = State(initialValue: defaultSettings.shakeThreshold)
        self._tempCrownRotationThreshold = State(initialValue: defaultSettings.crownRotationThreshold)
        self._tempRandomHintEnabled = State(initialValue: defaultSettings.randomHintEnabled)

        // 优化：使用默认值初始化，避免同步配置加载
        self._currentTriggerCount = State(initialValue: 0) // 默认值，稍后异步更新
        self._triggerHintEnabled = State(initialValue: true) // 默认开启，稍后异步更新

    }

    // MARK: - Computed Properties

    /// 判断当前mode image是否为圈选图片
    private var isCircleSelectionImage: Bool {
        let config = model.getCustomTriggerDisplay(for: currentImageName)
        return config.mainCircleSelectionData != nil &&
               !(config.mainCircleSelectionData?.pathPoints.isEmpty ?? true)
    }

    // MARK: - Body
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.mediumPadding) {
                    // 图片选择功能行（第一行）
                    imageSelectionSection

                    cropSection

                    // 触发方式功能行移动到图片裁剪下方
                    triggerModeSection

                    // 累计次数行紧跟触发方式下方
                    clickCountDetailsSection

                    // 图片占比功能行（仅当mode image为圈选图片时显示）
                    if uiHasCircleSelection {
                        imageProportionSection
                    }

                    // 音效导航入口（优化响应性能）
                    Button(action: {
                        // 使用延迟执行避免阻塞UI
                        DispatchQueue.main.async {
                            // 保证顺序
                            let existingOrder = model.selectedSoundsOrder
                            for sound in selectedSounds {
                                if !existingOrder.contains(sound) {
                                    model.selectedSoundsOrder.append(sound)
                                }
                            }
                            pushSoundSelector = true
                        }
                    }) {
                        soundSection
                    }
                    .buttonStyle(PlainButtonStyle())

                    // 播放模式功能行（在音效选择下方，选择大于1个音效时显示）
                    if uiSelectedSoundsSnapshot.count > 1 {
                        playModeSection
                    }

                    // 回溯功能开关（选择1个音效且触发模式为点击触发时显示）
                    if uiSelectedSoundsSnapshot.count == 1 && triggerMode == .tap {
                        backtrackSection

                        // 音效回溯功能行（当回溯开关开启时显示）
                        if enableBacktrack {
                            backtrackDurationSection
                        }
                    }



                    // 触发提示开关功能行
                    triggerHintSection

                    // 随机提示功能行（当触发提示开关开启时显示）
                    if triggerHintEnabled {
                        randomHintSection
                    }

                    // 自定义显示功能行（当触发提示开关开启且随机提示关闭时显示）
                    if triggerHintEnabled && !randomHintEnabled {
                        customDisplaySection
                    }

                    // Mode管理功能区域
                    copyModeSection

                    resetButtonSection

                    // 删除功能（最危险操作放在最底部）
                    deleteModeSection
                }
            }
            .navigationTitle("图片设置")
            .navigationBarTitleDisplayMode(.inline)

            .onAppear {
                // 首次进入才初始化，返回时不重置快照，避免闪动
                if !hasInitializedUI {
                    // 立即设置UI加载完成状态，避免渐进式加载导致的闪烁
                    uiLoadingPhase = 4

                    // 同步加载关键配置（避免异步加载阶段出现默认值闪回）
                    let initialSettings = model.imageManager.getImageSettings(for: currentImageName, in: currentModeContext)
                    // 在同步阶段一次性设置关键字段，确保后续 temp* 同步前已有正确基线
                    soundPlayMode = initialSettings.soundPlayMode
                    enableBacktrack = initialSettings.enableBacktrack
                    backtrackDuration = initialSettings.backtrackDuration
                    autoTriggerInterval = initialSettings.autoTriggerInterval
                    shakeThreshold = initialSettings.shakeThreshold
                    crownRotationThreshold = initialSettings.crownRotationThreshold
                    randomHintEnabled = initialSettings.randomHintEnabled
                    // 加载累计次数
                    currentTriggerCount = model.triggerManager.getCurrentTriggerCount(for: currentImageName, imageManager: model.imageManager)
                    #if DEBUG
                    Logger.debug("Mode设置层首次载入关键配置 - randomHintEnabled: \(initialSettings.randomHintEnabled), currentTriggerCount: \(currentTriggerCount)", category: .ui)
                    #endif

                    // 第三步：同步当前配置到临时状态
                    syncCurrentConfigToTempState()

                    // 异步加载非关键配置（不影响UI结构的配置）
                    loadNonCriticalConfigurationAsync()

                    #if DEBUG
                    Logger.debug("Mode设置层初始化临时配置状态", category: .ui)
                    #endif

                    // 初始化快照，避免初次进入时功能区抖动
                    uiSelectedSoundsSnapshot = selectedSounds
                    // 初始化圈选快照（与当前配置对齐）
                    let config = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
                    uiHasCircleSelection = !(config.mainCircleSelectionData?.pathPoints.isEmpty ?? true)

                    // 初始化时检查回溯功能状态
                    validateBacktrackState()

                    hasInitializedUI = true
                } else {
                    #if DEBUG
                    Logger.debug("Mode设置层返回显示，保留功能区快照", category: .ui)

                    // 调试：返回时检查圈选状态
                    let config = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
                    let hasCircleSelection = !(config.mainCircleSelectionData?.pathPoints.isEmpty ?? true)
                    Logger.debug("🔄 返回时检查圈选状态:", category: .ui)
                    Logger.debug("   当前UI状态: \(uiHasCircleSelection)", category: .ui)
                    Logger.debug("   实际数据状态: \(hasCircleSelection)", category: .ui)
                    if let selectionData = config.mainCircleSelectionData {
                        Logger.debug("   路径点数量: \(selectionData.pathPoints.count)", category: .ui)
                        Logger.debug("   边界矩形: \(selectionData.boundingRect)", category: .ui)
                    } else {
                        Logger.debug("   无圈选数据", category: .ui)
                    }
                    #endif
                }
            }
            .onChange(of: selectedSounds) { oldSounds, newSounds in
                #if DEBUG
                Logger.info("音效选择变化 - 旧: \(oldSounds), 新: \(newSounds)", category: .ui)
                #endif
                // 同步快照用于UI显隐控制，避免短暂空状态导致的闪烁
                uiSelectedSoundsSnapshot = newSounds

                // 当音效选择发生变化时，处理回溯相关状态
                if newSounds.count == 1 {
                    // 选择单个音效：重置功能行展开状态，并将回溯时长重置为默认（显示为总时长）
                    showingBacktrackControl = false
                    backtrackDuration = nil
                    let newSoundName = newSounds.first!
                    let newSoundDuration = model.soundManager.getSoundDuration(for: newSoundName)
                    #if DEBUG
                    Logger.debug("切换单音效，回溯时长重置为默认（\(String(format: "%.3fs", newSoundDuration))）", category: .ui)
                    #endif
                    saveBacktrackDuration()

                    // 验证回溯功能状态（考虑触发模式）
                    validateBacktrackState()
                } else {
                    // 选择了多个音效或没有音效，UI上隐藏/关闭回溯控制，但不改动临时持久化值
                    showingBacktrackControl = false
                    enableBacktrack = false
                    backtrackDuration = nil
                    #if DEBUG
                    Logger.debug("多音效模式，已关闭回溯功能（UI临时）", category: .ui)
                    #endif

                    // 同步预览：多音效时回溯按钮应隐藏
                    NotificationCenter.default.post(name: NSNotification.Name("BacktrackTogglePreview"), object: nil, userInfo: [
                        "imageName": currentImageName,
                        "enabled": false
                    ])
                }

                // 设置页内预览：通知全屏无动画刷新回溯按钮
                NotificationCenter.default.post(name: NSNotification.Name("SelectedSoundsPreview"), object: nil, userInfo: [
                    "imageName": currentImageName,
                    "selectedSounds": Array(newSounds)
                ])
            }
            .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("SoundConfigChanged"))) { notification in
                // 监听音效配置变化通知，重置回溯时长
                if let userInfo = notification.userInfo,
                   let imageName = userInfo["imageName"] as? String,
                   let soundName = userInfo["soundName"] as? String,
                   imageName == currentImageName,
                   selectedSounds.contains(soundName) {

                    Logger.debug("收到音效配置变化通知，重置回溯时长: \(imageName)/\(soundName)", category: .ui)

                    // 重置回溯时长为新的默认值（新的实际总时长）
                    backtrackDuration = nil

                    Logger.debug("回溯时长已重置为默认值（新的实际总时长）", category: .ui)
                }
            }
            .onDisappear {
                // 视图关闭时自动保存设置
                saveSettingsOnClose()
            }
            .onChange(of: model.defaultSounds) { _, newList in
                // 当首页音效列表发生删除/变更时，过滤当前选择和UI快照，保持一致
                let available = Set(newList)
                DispatchQueue.main.async {
                    let filteredSelected = selectedSounds.intersection(available)
                    if filteredSelected != selectedSounds {
                        selectedSounds = filteredSelected
                    }
                    let filteredSnapshot = uiSelectedSoundsSnapshot.intersection(available)
                    if filteredSnapshot != uiSelectedSoundsSnapshot {
                        uiSelectedSoundsSnapshot = filteredSnapshot
                    }
                }
            }
            .navigationDestination(isPresented: $pushSoundSelector) {
                SoundListView(
                    model: model,
                    mode: .modeSettings,  // 使用mode设置模式，点击音效行直接选择/取消选择并进入设置
                    selectedSound: .constant(nil),
                    selectedSounds: $selectedSounds,
                    onSoundSelected: nil,
                    onSoundsUpdated: {
                        updateImageSounds()
                    },
                    imageName: currentImageName,
                    onTempSelectionChanged: { temp in
                        // 实时同步快照，确保返回瞬间功能区就是目标状态
                        uiSelectedSoundsSnapshot = temp
                    }
                )
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .animation(.easeInOut(duration: 0.25), value: pushSoundSelector)
            }
            .onChange(of: pushSoundSelector) { oldValue, newValue in
                // 当从音效选择视图返回时（pushSoundSelector从true变为false）
                if oldValue == true && newValue == false {
                    Logger.debug("从音效选择视图返回（等待回调应用临时音效选择）", category: .ui)
                    // 不主动写状态，等待 SoundListView.onDisappear -> onSoundsUpdated 回调
                }
            }


        }
        .sheet(isPresented: $showingImageEditor) {
            ImageSizeEditorView.createDirectSaveEditor(
                model: model,
                imageName: currentImageName
            )
        }
        // ModeEditView已移除，直接在设置视图中编辑
        .alert("确认复制该Mode?", isPresented: $showingCopyConfirmation) {
            Button("取消", role: .cancel) { }
            Button("复制") {
                copyModeWithIsolation()
            }
        } message: {
            Text("将创建一个包含所有配置的Mode副本")
        }
        .alert("确认删除该Mode?", isPresented: $showingDeleteConfirmation) {
            Button("取消", role: .cancel) { }
            Button("删除", role: .destructive) {
                deleteModeAndClose()
            }
        } message: {
            Text("此操作不可撤销，将删除Mode及其所有配置")
        }
        .sheet(isPresented: $showingImageSizeEditor, onDismiss: {
            // 从图片裁剪返回时刷新音效选择状态
            let sounds = Set(model.imageMultiSounds[currentImageName] ?? [])
            selectedSounds = sounds
            
            // 刷新其他状态
            cachedCustomTriggerDisplay = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
            currentTriggerCount = model.triggerManager.getCurrentTriggerCount(for: currentImageName, imageManager: model.imageManager)
            // 同步圈选快照，避免功能行从无到有闪烁
            let display = cachedCustomTriggerDisplay ?? model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
            uiHasCircleSelection = !(display.mainCircleSelectionData?.pathPoints.isEmpty ?? true)
        }) {
            // 自定义编辑器：同时支持传统裁剪和圈选裁剪
            ImageSizeEditorView(
                model: model,
                imageName: currentImageName,
                saveMode: .callback, // 使用回调模式
                cropTarget: .modeImage, // mode设置视图中裁剪mode图片
                onCropCompleted: { image, scale, offset, url in
                    // 传统裁剪回调 - 保存裁剪后的图片作为mode图片
                    self.model.imageManager.updateCroppedImage(for: self.currentImageName, croppedImageURL: url)
                    self.model.imageScales[self.currentImageName] = scale
                    self.model.imageOffsets[self.currentImageName] = offset

                    // 从圈选切换为传统裁剪，显式清除主图圈选数据，避免全屏仍使用圈选裁剪
                    self.model.triggerManager.clearMainCircleSelection(for: self.currentImageName)
                    self.uiHasCircleSelection = false

                    // 清理Toast图片缓存，确保下次获取时使用最新的裁剪结果
                    self.model.triggerManager.refreshToastImageCache(for: self.currentImageName)
                    
                    // 使缩略图缓存失效，确保首页缩略图也能显示裁剪效果
                    ThumbnailGenerator.invalidateAll()
                    
                    // 发送通知，通知全屏视图更新圈选裁剪缓存
                    NotificationCenter.default.post(
                        name: NSNotification.Name("CircleSelectionUpdated"),
                        object: nil,
                        userInfo: ["imageName": self.currentImageName]
                    )
                    
                    // 关闭编辑器
                    self.showingImageSizeEditor = false
                },
                onConfigCompleted: nil,
                onCircleSelectionCompleted: { pathPoints, cropRect, scale, offset in
                    // 圈选裁剪回调 - 保存圈选数据

                    #if DEBUG
                    Logger.debug("🔍 圈选完成回调被调用:", category: .ui)
                    Logger.debug("   路径点数量: \(pathPoints.count)", category: .ui)
                    Logger.debug("   路径点内容: \(pathPoints.prefix(5))", category: .ui)
                    Logger.debug("   裁剪区域: \(cropRect)", category: .ui)
                    Logger.debug("   缩放: \(scale)", category: .ui)
                    Logger.debug("   偏移: \(offset)", category: .ui)
                    #endif

                    // 圈选裁剪完成后，重置偏移量为零，确保圈选结果居中显示
                    self.model.imageScales[self.currentImageName] = 1.0  // 重置缩放为1倍
                    self.model.imageOffsets[self.currentImageName] = .zero  // 重置偏移为零
                    
                    // 保存圈选数据到缓存中的 ImageSettings（用于全屏图片显示），由父层统一落盘
                    var settings = self.model.imageManager.getImageSettings(for: self.currentImageName)
                    settings.scale = 1.0
                    settings.offset = .zero
                    self.model.imageManager.forceUpdateCache(for: self.currentImageName, in: self.currentModeContext, settings: settings)
                    
                    // 使用专用方法保存mode图片圈选数据，避免影响displayMode
                    let circleData = CircleSelectionData(
                        pathPoints: pathPoints,
                        boundingRect: cropRect
                    )
                    self.model.triggerManager.updateModeImageCircleSelection(
                        for: self.currentImageName,
                        data: circleData,
                        scale: scale,
                        offset: offset
                    )

                    // 立即更新UI快照，确保返回时功能行已就绪
                    self.uiHasCircleSelection = !pathPoints.isEmpty

                    // 如果用户清空圈选（没有路径点），显式清理圈选配置
                    if pathPoints.isEmpty {
                        self.model.triggerManager.clearMainCircleSelection(for: self.currentImageName)
                        NotificationCenter.default.post(
                            name: NSNotification.Name("CircleSelectionUpdated"),
                            object: nil,
                            userInfo: ["imageName": self.currentImageName]
                        )
                    }

                    #if DEBUG
                    Logger.debug("Mode设置中的圈选结果已保存:", category: .ui)
                    Logger.debug("   路径点数量: \(pathPoints.count)", category: .ui)
                    Logger.debug("   裁剪区域: \(cropRect)", category: .ui)
                    Logger.debug("   缩放: \(scale)", category: .ui)
                    Logger.debug("   偏移: \(offset)", category: .ui)
                    #endif

                    // 验证保存结果
                    let savedConfig = self.model.triggerManager.getCustomTriggerDisplay(for: self.currentImageName)
                    #if DEBUG
                    Logger.debug("验证保存结果:", category: .ui)
                    let circleInfo: String
                    if savedConfig.mainCircleSelectionData != nil {
                        circleInfo = "存在(\\(savedConfig.mainCircleSelectionData?.pathPoints.count ?? 0)点)"
                    } else {
                        circleInfo = "nil"
                    }
                    Logger.debug("   mainCircleSelectionData: \(circleInfo)", category: .ui)
                    Logger.debug("   mainImageScale: \(savedConfig.mainImageScale)", category: .ui)
                    Logger.debug("   mainImageOffset: \(savedConfig.mainImageOffset)", category: .ui)
                    #endif
                    
                    // 清理Toast图片缓存，确保下次获取时使用最新的裁剪结果
                    self.model.triggerManager.refreshToastImageCache(for: self.currentImageName)
                    
                    // 使缩略图缓存失效，确保首页缩略图也能显示圈选裁剪效果
                    ThumbnailGenerator.invalidateAll()
                    
                    // 发送通知，通知全屏视图更新圈选裁剪缓存
                    NotificationCenter.default.post(
                        name: NSNotification.Name("CircleSelectionUpdated"),
                        object: nil,
                        userInfo: ["imageName": self.currentImageName]
                    )

                    // 关闭编辑器
                    self.showingImageSizeEditor = false
                },
                useCustomImage: false // mode设置不使用自定义图片
            )
        }
        .sheet(isPresented: $showingCustomTriggerConfig, onDismiss: {
            // 从文字自定义设置返回时异步刷新UI和缓存
            DispatchQueue.global(qos: .userInitiated).async {
                let config = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
                DispatchQueue.main.async {
                    cachedCustomTriggerDisplay = config
                    configUpdateTrigger.toggle()
                    startColorAnimation()
                }
            }
        }) {
            CustomTriggerConfigView(
                model: model,
                imageName: currentImageName,
                isPresented: $showingCustomTriggerConfig
            )
        }
        .sheet(isPresented: $showingCustomImageTriggerConfig, onDismiss: {
            // 从图片自定义设置返回时异步刷新UI和缓存
            DispatchQueue.global(qos: .userInitiated).async {
                let config = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
                DispatchQueue.main.async {
                    cachedCustomTriggerDisplay = config
                    configUpdateTrigger.toggle()
                    startColorAnimation()
                }
            }
        }) {
            CustomImageTriggerConfigView(
                model: model,
                imageName: currentImageName,
                isPresented: $showingCustomImageTriggerConfig
            )
        }
        .sheet(isPresented: $showingImageProportionEditor) {
            ImageProportionEditorView(
                model: model,
                imageName: currentImageName,
                onSave: { scale, offset in
                    // 保存图片占比设置（仅缓存，父层统一落盘）
                    var settings = model.imageManager.getImageSettings(for: currentImageName)
                    settings.scale = scale
                    settings.offset = offset
                    model.imageManager.forceUpdateCache(for: currentImageName, in: currentModeContext, settings: settings)
                    
                    // 更新模型中的缩放和偏移
                    model.imageScales[currentImageName] = scale
                    model.imageOffsets[currentImageName] = offset
                    
                    // 发送通知，通知全屏视图更新显示
                    NotificationCenter.default.post(
                        name: NSNotification.Name("ImageSizeUpdated"),
                        object: nil,
                        userInfo: ["imageName": currentImageName, "scale": scale]
                    )
                    
                    Logger.debug("图片占比设置已保存: scale=\(scale), offset=\(offset)", category: .ui)
                }
            )
        }
        .onDisappear(perform: stopColorAnimation)
        .photosPicker(
            isPresented: $showingImagePicker,
            selection: Binding<PhotosPickerItem?>(
                get: { nil },
                set: { newItem in
                    if let item = newItem {
                        handleImageSelection(item)
                    }
                }
            ),
            matching: .images
        )
    }
    
    // MARK: - View Sections
    
    /// 图片选择功能行
    private var imageSelectionSection: some View {
        Button(action: { showingImagePicker = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("更换图片")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }
                Spacer()

                if photoService.isProcessing {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(photoService.isProcessing)
    }
    
    private var cropSection: some View {
        Button(action: { showingImageSizeEditor = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "crop")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("图片裁剪")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.appSmall)
                    .foregroundColor(Color.gray)
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private var imageProportionSection: some View {
        Button(action: { showingImageProportionEditor = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "aspectratio")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("图片占比")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.appSmall)
                    .foregroundColor(Color.gray)
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }
    

    
    private var soundSection: some View {
        // 音效标题行 - 整行可点击
        HStack(alignment: .center) {
            // 左侧图标和文本组
            HStack(spacing: AppTheme.smallPadding) {
                Image(systemName: "speaker.wave.2")
                    .foregroundColor(AppTheme.primaryColor)
                    .font(.system(size: AppTheme.smallIconSize))
                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                
                Text("触发音效")
                    .font(.appBody)
                    .foregroundColor(Color.textPrimary)
            }
            
            Spacer()
            
            // 右侧状态和箭头
            HStack(spacing: 4) {
                // 显示已选音效数量或提示添加（使用快照，返回瞬间即为目标状态）
                if uiSelectedSoundsSnapshot.isEmpty {
                    Text("选择")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                } else {
                    Text("\(uiSelectedSoundsSnapshot.count) 个")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }

                Image(systemName: "chevron.right")
                    .font(.appSmall)
                    .foregroundColor(Color.gray)
            }
        }
        .standardRowStyle()
    }
    

    
    private var triggerModeSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            // 触发方式设置
            Button(action: {
                // 计算新的触发模式
                let newTriggerMode: ImageTriggerMode
                switch triggerMode {
                case .tap:
                    newTriggerMode = .shake
                case .shake:
                    newTriggerMode = .crown
                case .crown:
                    newTriggerMode = .auto
                case .auto:
                    newTriggerMode = .tap
                }

                // 延迟UI更新优化：解决首次点击触发模式卡顿问题
                if AppConfig.useDelayedUIUpdate {
                    // 立即返回，避免阻塞用户操作
                    Logger.debug("延迟UI更新：触发模式切换为 \(newTriggerMode)", category: .ui)
                    DispatchQueue.main.asyncAfter(deadline: .now() + AppConfig.uiUpdateDelay) {
                        self.triggerMode = newTriggerMode
                        Logger.success("UI更新完成：\(newTriggerMode)", category: .ui)

                        // 延迟数据保存，确保UI更新完成后再保存
                        DispatchQueue.main.asyncAfter(deadline: .now() + AppConfig.dataSaveDelay) {
                            self.performDataSave(for: newTriggerMode)
                        }
                    }
                } else {
                    // 原始同步逻辑（可能导致卡顿）
                    triggerMode = newTriggerMode

                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        withAnimation(Animation.safeAnimation(duration: AppConfig.defaultAnimationDuration)) {
                            isAnimating = true
                        }
                    }
                }


            }) {
                HStack(alignment: .center) {
                    HStack(spacing: AppTheme.smallPadding) {
                        Image(systemName: getTriggerModeIcon())
                            .foregroundColor(AppTheme.primaryColor)
                            .font(.system(size: AppTheme.smallIconSize))
                            .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                        Text("触发方式")
                            .font(.appBody)
                            .foregroundColor(Color.textPrimary)
                    }

                    Spacer()

                    // 右侧状态
                    Text(getTriggerModeText())
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())
            // 同步临时状态（不落盘）
            .onChange(of: triggerMode) { _, newValue in
                tempTriggerMode = newValue
                Logger.debug("Mode设置层触发模式（临时）: \(currentImageName) -> \(newValue)", category: .ui)

                // 处理音效回溯功能的生效和失效
                handleBacktrackOnTriggerModeChange(newValue)
            }

            // 自动触发时间间隔滑块（仅在自动模式时显示）
            if triggerMode == .auto {
                PerformantExpandableSection(
                    isExpanded: $autoTriggerExpanded,
                    header: {
                        HStack {
                            HStack(spacing: AppTheme.smallPadding) {
                                Image(systemName: "timer")
                                    .foregroundColor(AppTheme.primaryColor)
                                    .font(.system(size: AppTheme.smallIconSize))
                                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                                Text("触发速度")
                                    .font(.appBody)
                                    .foregroundColor(Color.textPrimary)
                            }
                            Spacer()
                            Image(systemName: autoTriggerExpanded ? "chevron.up" : "chevron.down")
                                .font(.appSmall)
                                .foregroundColor(Color.gray)
                        }
                        .standardRowStyle()
                    },
                    content: {
                        autoTriggerIntervalContent
                    },
                    skeleton: {
                        SettingsSliderSkeleton(title: "触发速度", leftLabel: "慢", rightLabel: "快")
                    }
                )
            }

            // 摇晃触发阈值滑块（仅在摇晃模式时显示）
            if triggerMode == .shake {
                PerformantExpandableSection(
                    isExpanded: $shakeThresholdExpanded,
                    header: {
                        HStack {
                            HStack(spacing: AppTheme.smallPadding) {
                                Image(systemName: "hand.raised")
                                    .foregroundColor(AppTheme.primaryColor)
                                    .font(.system(size: AppTheme.smallIconSize))
                                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                                Text("灵敏度调整")
                                    .font(.appBody)
                                    .foregroundColor(Color.textPrimary)
                            }
                            Spacer()
                            Image(systemName: shakeThresholdExpanded ? "chevron.up" : "chevron.down")
                                .font(.appSmall)
                                .foregroundColor(Color.gray)
                        }
                        .standardRowStyle()
                    },
                    content: {
                        shakeThresholdContent
                    },
                    skeleton: {
                        SettingsSliderSkeleton(title: "灵敏度", leftLabel: "低", rightLabel: "高")
                    }
                )
            }

            // 表冠旋转触发阈值滑块（仅在表冠旋转模式时显示）
            if triggerMode == .crown {
                PerformantExpandableSection(
                    isExpanded: $crownRotationExpanded,
                    header: {
                        HStack {
                            HStack(spacing: AppTheme.smallPadding) {
                                Image(systemName: "digitalcrown.horizontal.arrow.clockwise")
                                    .foregroundColor(AppTheme.primaryColor)
                                    .font(.system(size: AppTheme.smallIconSize))
                                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                                Text("灵敏度调整")
                                    .font(.appBody)
                                    .foregroundColor(Color.textPrimary)
                            }
                            Spacer()
                            Image(systemName: crownRotationExpanded ? "chevron.up" : "chevron.down")
                                .font(.appSmall)
                                .foregroundColor(Color.gray)
                        }
                        .standardRowStyle()
                    },
                    content: {
                        crownRotationThresholdContent
                    },
                    skeleton: {
                        SettingsSliderSkeleton(title: "灵敏度", leftLabel: "低", rightLabel: "高")
                    }
                )
            }
        }
    }
    

    
    private var clickCountDetailsSection: some View {
        HStack(alignment: .center) {
            Text("累计次数:")
                .font(.appSmall)
                .foregroundColor(Color.gray)

            AutoScrollingView {
                Text("\(currentTriggerCount)")
                    .font(.appSmall)
                    .foregroundColor(Color.gray)
            }
            
            Spacer()
            
            Button(action: {
                // 显示确认弹窗
                showResetConfirmation = true
            }) {
                Text("重置")
                    .font(.appSmall)
                    .foregroundColor(AppTheme.secondaryColor)
                    .fixedSize()
            }
            .buttonStyle(PlainButtonStyle())
            .confirmationDialog(
                "确认重置",
                isPresented: $showResetConfirmation,
                titleVisibility: .visible
            ) {
                Button("重置", role: .destructive) {
                    // 重置模型中的触发次数
                    model.triggerManager.resetTriggerCount(for: currentImageName, imageManager: model.imageManager)
                    // 立即更新界面状态
                    currentTriggerCount = 0
                }
                Button("取消", role: .cancel) {
                    // 取消操作，什么都不做
                }
            } message: {
                Text("累计次数将重置为0，此操作无法撤销。")
            }
        }
        .padding(.horizontal, AppTheme.largePadding)
        .padding(.top, -Sizes.tinyPadding)
    }

    /// 触发提示开关功能行
    private var triggerHintSection: some View {
        Button(action: {
            // 切换开关状态
            triggerHintEnabled.toggle()
        }) {
            HStack(alignment: .center) {
                // 左侧图标和文本组
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "bubble.fill")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("触发提示")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }

                Spacer()

                // 右侧开关
                Toggle("", isOn: $triggerHintEnabled)
                    .labelsHidden()
                    .allowsHitTesting(false) // 禁用Toggle的点击，让Button处理
            }
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
        .onChange(of: triggerHintEnabled) { _, newValue in
            // 更新自定义显示配置的启用状态
            var config = cachedCustomTriggerDisplay ?? model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
            config.isEnabled = newValue
            model.triggerManager.setCustomTriggerDisplay(for: currentImageName, config: config)
            // 更新缓存
            cachedCustomTriggerDisplay = config

            // 如果关闭了触发提示，同时关闭自定义显示展开状态
            if !newValue {
                customDisplayExpanded = false
            }
        }
    }

    /// 随机提示开关功能行
    private var randomHintSection: some View {
        Button(action: {
            // 切换随机提示状态
            randomHintEnabled.toggle()
        }) {
            HStack(alignment: .center) {
                // 左侧图标和文本组
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "dice.fill")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("随机提示")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }

                Spacer()

                // 右侧开关
                Toggle("", isOn: $randomHintEnabled)
                    .labelsHidden()
                    .allowsHitTesting(false) // 禁用Toggle的点击，让Button处理
            }
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
        .onChange(of: randomHintEnabled) { _, newValue in
            // 仅更新临时状态，统一由父层保存
            tempRandomHintEnabled = newValue
            Logger.debug("Mode设置层随机提示开关（临时）: \(currentImageName) -> \(newValue)", category: .ui)

            // 如果开启随机提示，关闭自定义显示的展开状态
            if newValue {
                customDisplayExpanded = false
            }
        }
    }

    private var customDisplaySection: some View {

        // 用于立即无动画切换 displayMode 的小工具方法，避免重复
        func setDisplayModeImmediately(_ mode: CustomDisplayMode) {
            customDisplayExpanded = true
            var updated = cachedCustomTriggerDisplay ?? model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
            updated.isEnabled = true
            updated.displayMode = mode
            var tx = Transaction(); tx.disablesAnimations = true
            withTransaction(tx) {
                cachedCustomTriggerDisplay = updated
            }
            // 后台持久化，避免阻塞UI
            DispatchQueue.global(qos: .userInitiated).async {
                model.triggerManager.setCustomTriggerDisplay(for: currentImageName, config: updated)
            }
        }

        // 性能优化：确保配置已缓存，避免首次渲染时的延迟
        let config = cachedCustomTriggerDisplay ?? CustomTriggerDisplay()

        return CustomDisplayRow(
            config: config,
            previewColors: previewColors,
            currentColorIndex: currentColorIndex,
            onTextCustomization: {
                setDisplayModeImmediately(.text)
                showingCustomTriggerConfig = true
            },
            onImageCustomization: {
                setDisplayModeImmediately(.image)
                showingCustomImageTriggerConfig = true
            },
            isExpanded: $customDisplayExpanded
        )
    }
    

    
    // 已移除"停止上次播放"功能，因为与回溯功能冲突

    /// 另存为Mode功能区域
    private var copyModeSection: some View {
        Button(action: { showingCopyConfirmation = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "doc.on.doc")
                        .foregroundColor(.green)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("另存为")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }
                Spacer()
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var resetButtonSection: some View {
        // 重置按钮 - 重置当前图片的所有设置为默认值
        Button {
            withAnimation(.easeInOut(duration: 0.3)) {
                // 关闭所有打开的下拉功能行
                customDisplayExpanded = false

                // 重置模型中的设置
                model.imageManager.resetImageSettings(for: currentImageName)

                // 重置自定义显示配置为默认状态
                let defaultConfig = CustomTriggerDisplay()
                model.triggerManager.setCustomTriggerDisplay(for: currentImageName, config: defaultConfig)

                // 重置音效配置
                model.imageMultiSounds.removeValue(forKey: currentImageName)

                // 重置音效播放模式和回溯设置，使用正确的上下文
                var settings = model.imageManager.getImageSettings(for: currentImageName, in: currentModeContext)
                settings.soundPlayMode = .sequential
                settings.enableBacktrack = false
                settings.backtrackDuration = nil
                settings.autoTriggerInterval = 2.0
                settings.shakeThreshold = AppConfig.defaultShakeThreshold
                settings.crownRotationThreshold = AppConfig.defaultCrownRotationThreshold
                settings.randomHintEnabled = false  // 重置随机提示
                settings.triggerMode = .tap  // 重置触发模式
                model.imageManager.updateImageSettings(for: currentImageName, in: currentModeContext, settings: settings)

                // 同步更新本地状态
                triggerMode = .tap
                selectedSounds.removeAll()
                soundPlayMode = .sequential
                enableBacktrack = false
                backtrackDuration = nil
                showingBacktrackControl = false
                autoTriggerInterval = 2.0
                shakeThreshold = AppConfig.defaultShakeThreshold
                crownRotationThreshold = AppConfig.defaultCrownRotationThreshold
                randomHintEnabled = false  // 同步重置随机提示状态
                triggerHintEnabled = true  // 重置触发提示开关（默认开启）

                // 注意：不重置触发次数，因为有单独的重置按钮
                // currentTriggerCount 保持当前值不变

                // 清空暂存状态
                tempCroppedImage = nil
                tempScale = 1.0
                tempOffset = .zero
                tempFileURL = nil
                
                // 重置 UI 快照状态
                uiSelectedSoundsSnapshot.removeAll()

                // 清除UserDefaults中保存的颜色选择
                UserDefaults.standard.removeObject(forKey: "selectedColors_\(currentImageName)")
                UserDefaults.standard.removeObject(forKey: "colorIndex_\(currentImageName)")
            }
        } label: {
            HStack(alignment: .center) {
                // 左侧图标和文本组
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "arrow.counterclockwise")
                        .foregroundColor(.orange)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("重置")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }

                Spacer()
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }

    /// 删除Mode功能区域（危险操作，放在最底部）
    private var deleteModeSection: some View {
        Button(action: { showingDeleteConfirmation = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("删除")
                        .font(.appBody)
                        .foregroundColor(.red)
                }
                Spacer()
            }
            .actionRowStyle(.danger)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    // MARK: - Private Methods

    /// 视图关闭时自动保存设置
    private func saveSettingsOnClose() {
        // 统一保存所有临时配置（包括音效选择）
        saveAllTempConfigToPersistentStorage()

        // 刷新Toast图片缓存，确保使用最新的设置
        model.triggerManager.refreshToastImageCache(for: currentImageName)

        Logger.info("图片设置已自动保存: \(currentImageName)", category: .ui)
    }



    /// 另存为Mode（带配置隔离）
    private func copyModeWithIsolation() {
        Logger.info("开始另存为Mode操作: \(currentImageName)", category: .ui)

        // 直接从当前视图状态构建配置，不依赖已保存的配置
        let currentViewSettings = buildCurrentViewSettings()
        Logger.debug("当前视图配置 - enableBacktrack: \(currentViewSettings.enableBacktrack), soundPlayMode: \(currentViewSettings.soundPlayMode), randomHintEnabled: \(currentViewSettings.randomHintEnabled)", category: .ui)
        Logger.debug("当前视图音效: \(selectedSounds)", category: .ui)

        // 使用自定义的复制方法，直接传递当前视图配置
        if let newModeName = cloneModeWithCurrentViewSettings(currentViewSettings) {
            // 验证复制后的新mode配置（使用正确的modeContext）
            let newModeContext = ModeContext(modeId: newModeName)
            let newSettings = model.imageManager.getImageSettings(for: newModeName, in: newModeContext)
            Logger.debug("新mode配置验证 - enableBacktrack: \(newSettings.enableBacktrack), soundPlayMode: \(newSettings.soundPlayMode), randomHintEnabled: \(newSettings.randomHintEnabled)", category: .ui)
            let newSounds = model.soundManager.imageMultiSounds[newModeName] ?? []
            Logger.debug("新mode音效列表: \(newSounds)", category: .ui)

            // 播放成功反馈
            WKInterfaceDevice.current().play(.success)
            Logger.success("Mode已复制: \(currentImageName) → \(newModeName)", category: .ui)
        } else {
            // 复制失败，播放错误反馈
            WKInterfaceDevice.current().play(.failure)
            Logger.error("Mode复制失败: \(currentImageName)", category: .ui)
        }
    }

    /// 从当前视图状态构建ImageSettings配置
    private func buildCurrentViewSettings() -> ImageSettings {
        Logger.debug("构建当前视图配置", category: .ui)

        // 获取基础配置作为模板，使用正确的上下文
        var settings = model.imageManager.getImageSettings(for: currentImageName, in: currentModeContext)

        // 应用当前视图中的所有状态
        settings.triggerMode = triggerMode
        settings.soundPlayMode = soundPlayMode
        settings.enableBacktrack = enableBacktrack
        settings.backtrackDuration = backtrackDuration
        settings.autoTriggerInterval = autoTriggerInterval
        settings.shakeThreshold = shakeThreshold
        settings.randomHintEnabled = randomHintEnabled

        // 应用自定义触发显示配置
        if let cachedConfig = cachedCustomTriggerDisplay {
            settings.customTriggerDisplay = cachedConfig
        }

        Logger.success("当前视图配置构建完成", category: .ui)
        return settings
    }

    /// 使用当前视图配置复制Mode
    private func cloneModeWithCurrentViewSettings(_ currentSettings: ImageSettings) -> String? {
        guard let sourceIndex = model.defaultImages.firstIndex(of: currentImageName) else { return nil }

        // 生成新的唯一mode名称
        let timestamp = Int(Date().timeIntervalSince1970)
        let newModeName = "\(currentImageName)_copy_\(timestamp)"
        Logger.debug("生成新mode名称: \(newModeName)", category: .ui)

        // 创建新的mode上下文
        let newModeContext = ModeContext(modeId: newModeName)

        // 直接使用当前视图配置创建新mode配置
        var newSettings = currentSettings
        newSettings.modeContext = newModeContext
        newSettings.displayName = (newSettings.displayName.isEmpty ? currentImageName : newSettings.displayName) + " 副本"
        newSettings.clickCount = 0 // 重置累计次数
        newSettings.currentImageIndex = 0 // 重置图片索引，从第一张开始

        // 确保图片序列设置正确
        if newSettings.imageSequence.isEmpty {
            newSettings.imageSequence = [currentImageName]
            newSettings.modeType = .single
        }

        Logger.debug("准备保存配置 - enableBacktrack: \(newSettings.enableBacktrack), randomHintEnabled: \(newSettings.randomHintEnabled)", category: .ui)
        Logger.debug("图片序列配置 - imageSequence: \(newSettings.imageSequence), modeType: \(newSettings.modeType)", category: .ui)
        Logger.debug("显示名称配置 - displayName: '\(newSettings.displayName)', clickCount: \(newSettings.clickCount)", category: .ui)
        Logger.debug("多图片配置 - navigationMode: \(newSettings.navigationMode), autoSwitchInterval: \(newSettings.autoSwitchInterval), currentImageIndex: \(newSettings.currentImageIndex)", category: .ui)
        Logger.debug("触发配置 - triggerMode: \(newSettings.triggerMode), showClickCount: \(newSettings.showClickCount)", category: .ui)
        Logger.debug("音效配置 - soundPlayMode: \(newSettings.soundPlayMode), soundConfigs数量: \(newSettings.soundConfigs.count)", category: .ui)

        // 先复制音效配置（在保存主配置之前）
        model.soundManager.setMultiSoundNames(for: newModeName, soundNames: Array(selectedSounds))
        Logger.debug("音效配置已设置: \(Array(selectedSounds))", category: .ui)

        // 复制每个音效的详细配置（音量、播放速率等）
        Logger.debug("开始复制音效详细配置...", category: .ui)
        for soundName in selectedSounds {
            if let soundConfig = currentSettings.soundConfigs[soundName] {
                // 复制音效配置到新mode
                newSettings.soundConfigs[soundName] = soundConfig
                Logger.debug("复制音效配置: \(soundName) - 音量: \(soundConfig.volume), 播放速率: \(soundConfig.playbackRate)", category: .ui)
            } else {
                Logger.debug("音效 \(soundName) 没有找到详细配置，将使用默认配置", category: .ui)
            }
        }
        Logger.debug("音效详细配置复制完成", category: .ui)

        // 复制自定义触发显示配置（在保存主配置之前）
        if let cachedConfig = cachedCustomTriggerDisplay {
            model.triggerManager.setCustomTriggerDisplay(for: newModeName, config: cachedConfig)
            Logger.debug("自定义触发显示配置已设置", category: .ui)
        }

        // 最后保存主配置，使用同步保存确保立即写入
        model.imageManager.updateImageSettings(for: newModeName, in: newModeContext, settings: newSettings)
        // 强制同步保存，确保配置立即写入存储
        DataService.shared.saveImageSettingsSync(newSettings, for: newModeName, in: newModeContext)
        Logger.debug("主配置已同步保存", category: .ui)

        // 强制更新缓存，确保后续读取能获取到正确的配置
        model.imageManager.forceUpdateCache(for: newModeName, in: newModeContext, settings: newSettings)
        Logger.debug("缓存已强制更新", category: .ui)

        // 复制缩放和偏移
        let originalScale = model.imageManager.getImageScale(for: currentImageName)
        let originalOffset = model.imageManager.getImageOffset(for: currentImageName)
        model.imageManager.setImageScale(for: newModeName, scale: originalScale)
        model.imageManager.setImageOffset(for: newModeName, offset: originalOffset)
        Logger.debug("缩放和偏移已复制", category: .ui)

        // 添加到图片列表
        model.defaultImages.insert(newModeName, at: sourceIndex + 1)
        model.saveImageOrder()

        // 刷新缓存
        DispatchQueue.main.async {
            self.model.imageManager.objectWillChange.send()
        }

        Logger.success("Mode复制完成: \(newModeName)", category: .ui)
        return newModeName
    }



    /// 删除Mode并关闭设置视图
    private func deleteModeAndClose() {
        guard let index = model.defaultImages.firstIndex(of: currentImageName) else { return }

        // 删除关联数据
        model.imageManager.deleteImage(currentImageName)
        model.soundManager.removeSoundsForImage(currentImageName)
        model.triggerManager.removeTriggerSettings(for: currentImageName)

        // 从列表中移除
        model.defaultImages.remove(at: index)

        // 如果删除当前选中图片，切换到第一张
        if model.selectedDefaultImageName == currentImageName {
            model.selectedDefaultImageName = model.defaultImages.first ?? ""
        }

        // 保存顺序
        model.saveImageOrder()

        // 播放反馈
        WKInterfaceDevice.current().play(.success)

        Logger.info("Mode已删除: \(currentImageName)", category: .ui)

        // 关闭设置视图
        isPresented = false
    }

    private func updateImageSounds() {
        if selectedSounds.isEmpty {
            // 临时操作：不立即修改持久化状态，留待统一保存点处理
            Logger.debug("Mode设置层音效选择为空（临时状态）: \(currentImageName)", category: .ui)
        } else {
            // 根据用户选择顺序计算音效数组，但不立即持久化
            let orderedFromSelection = model.selectedSoundsOrder.filter { selectedSounds.contains($0) }
            let remainingSelected = selectedSounds.filter { !model.selectedSoundsOrder.contains($0) }
            let finalOrdered = orderedFromSelection + Array(remainingSelected)

            Logger.debug("Mode设置层音效选择更新（临时状态）: \(currentImageName) -> \(finalOrdered)", category: .ui)
        }
    }
    
    private func getSortedSounds() -> [String] {
        // 如果是顺序播放模式，按照selectedSoundsOrder的顺序排列
        if model.soundPlayMode == .sequential {
            // 过滤出已选择的音效，并按照顺序排列
            return model.selectedSoundsOrder.filter { selectedSounds.contains($0) }
        } else {
            // 同时播放模式，按照字母顺序排列
            return Array(selectedSounds).sorted()
        }
    }
    

    
    // 将已选中的音效转换为顺序播放模式 - 与音频列表视图保持一致
    private func convertSelectedSoundsToSequential() {
        model.sequentialSoundOrder.removeAll()
        model.nextSequenceNumber = 1
        
        // 获取当前选中音效的顺序（基于现有的selectedSoundsOrder）
        var currentOrder: [String] = []
        
        // 首先添加已经在selectedSoundsOrder中的音效
        for sound in model.selectedSoundsOrder {
            if selectedSounds.contains(sound) {
                currentOrder.append(sound)
            }
        }
        
        // 添加不在selectedSoundsOrder中的新音效
        for sound in selectedSounds {
            if !currentOrder.contains(sound) {
                currentOrder.append(sound)
            }
        }
        
        // 按照当前顺序分配序号
        for sound in currentOrder {
                model.sequentialSoundOrder[sound] = model.nextSequenceNumber
                model.nextSequenceNumber += 1
            }
        
        // 将当前顺序同步到model.selectedSoundsOrder
        // 先移除旧的记录
        model.selectedSoundsOrder = model.selectedSoundsOrder.filter { !selectedSounds.contains($0) }
        // 添加新的顺序
        model.selectedSoundsOrder = currentOrder + model.selectedSoundsOrder
        
        // 更新图片关联的音效以保持正确顺序
        updateImageSounds()
    }

    // MARK: - Backtrack Helper Methods

    /// 获取当前选中音效的总时长
    private func getSoundTotalDuration() -> TimeInterval {
        guard selectedSounds.count == 1,
              let soundName = selectedSounds.first else {
            Logger.debug("getSoundTotalDuration: 非单音效模式，返回默认时长 1.0s", category: .ui)
            return 1.0 // 默认时长
        }

        // 获取原始时长
        let originalDuration = model.soundManager.getSoundDuration(for: soundName)

        // 获取音效配置以获取播放速度和裁剪设置
        let soundConfig = model.getSoundConfig(for: soundName, imageName: currentImageName)
        let playbackRate = soundConfig.playbackRate
        let startTime = soundConfig.startTime
        let endTime = soundConfig.endTime ?? originalDuration // 如果endTime为nil，表示到结尾

        // 计算裁剪后的时长
        let trimmedDuration = max(0, endTime - startTime)

        // 计算考虑播放速度和裁剪后的最终实际时长
        let finalDuration = trimmedDuration / playbackRate

        Logger.debug("getSoundTotalDuration: \(soundName)", category: .ui)
        Logger.debug("  原始时长: \(originalDuration)s", category: .ui)
        Logger.debug("  裁剪范围: \(startTime)s - \(endTime)s = \(trimmedDuration)s", category: .ui)
        Logger.debug("  播放速度: \(playbackRate)x", category: .ui)
        Logger.debug("  最终时长: \(trimmedDuration)s / \(playbackRate)x = \(finalDuration)s", category: .ui)

        return finalDuration
    }

    /// 显示当前回溯时长的文本（默认显示为整段总时长，考虑播放速度）
    private func backtrackDisplayText() -> String {
        let totalDuration = getSoundTotalDuration()
        let duration = backtrackDuration ?? totalDuration
        return String(format: "%.1fs", duration)
    }

    /// 根据音效总时长计算滑杆步长（20档左右）
    private func backtrackStep() -> Double {
        let totalDuration = getSoundTotalDuration()
        let step = totalDuration / 20
        return min(1.5, max(0.1, step))
    }

    /// 保存回溯时长（仅临时），由父层统一落盘
    private func saveBacktrackDuration() {
        tempBacktrackDuration = backtrackDuration
        let displaySeconds = backtrackDuration ?? getSoundTotalDuration()
        let display = String(format: "%.3fs", displaySeconds)
        Logger.debug("Mode设置层回溯时长（临时）: \(currentImageName) -> \(display)", category: .ui)
    }
    
    // 获取触发模式文本
    private func getTriggerModeText() -> String {
        switch triggerMode {
        case .tap:
            return "点击"
        case .shake:
            return "摇晃"
        case .crown:
            return "表冠"
        case .auto:
            return "自动"
        }
    }

    // 获取触发模式图标
    private func getTriggerModeIcon() -> String {
        switch triggerMode {
        case .tap:
            return "hand.tap.fill"
        case .shake:
            return "iphone.radiowaves.left.and.right"
        case .crown:
            return "digitalcrown.arrow.clockwise"
        case .auto:
            return "a"
        }
    }

    /// 处理触发模式切换时音效回溯功能的生效和失效
    private func handleBacktrackOnTriggerModeChange(_ newTriggerMode: ImageTriggerMode) {
        // 只有在选择了1个音效的情况下才处理回溯功能
        guard uiSelectedSoundsSnapshot.count == 1 else { return }

        switch newTriggerMode {
        case .tap:
            // 切换到点击触发：回溯功能可用，保持当前状态
            Logger.debug("切换到点击触发，回溯功能可用", category: .ui)

        case .shake, .crown, .auto:
            // 切换到其他触发模式：回溯功能不可用，自动关闭并重置回溯时长
            if enableBacktrack {
                enableBacktrack = false
                tempEnableBacktrack = false

                // 重置回溯时长为默认值（nil表示使用音效总时长）
                backtrackDuration = nil
                tempBacktrackDuration = nil

                // 关闭回溯控制展开状态
                showingBacktrackControl = false

                Logger.debug("切换到\(getTriggerModeText())触发，自动关闭回溯功能并重置回溯时长", category: .ui)
            }
        }
    }

    /// 验证回溯功能状态，确保只在合适的条件下启用
    private func validateBacktrackState() {
        // 检查回溯功能是否应该可用
        let shouldAllowBacktrack = (uiSelectedSoundsSnapshot.count == 1 && triggerMode == .tap)

        // 如果当前条件不允许回溯功能，但回溯功能是开启的，则自动关闭并重置
        if !shouldAllowBacktrack && enableBacktrack {
            enableBacktrack = false
            tempEnableBacktrack = false

            // 重置回溯时长为默认值
            backtrackDuration = nil
            tempBacktrackDuration = nil

            // 关闭回溯控制展开状态
            showingBacktrackControl = false

            Logger.debug("初始化时自动关闭回溯功能并重置回溯时长：音效数量=\(uiSelectedSoundsSnapshot.count), 触发模式=\(getTriggerModeText())", category: .ui)
        }
    }

    // 裁剪框大小
    private var cropFrameSize: CGSize {
        // 获取屏幕宽度
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        // 使用整个屏幕作为裁剪区域
        return CGSize(width: screenWidth, height: screenWidth)
    }
    
    // 裁剪图片
    private func cropImage() {
        // 设置裁剪状态
        isCropping = true
        
        // 延迟执行以显示加载指示器
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // 创建裁剪视图包装器
            let wrapper = SimpleImageEditorViewWrapper()
            
            // 执行裁剪
            _ = wrapper.cropImage(
                imageName: self.imageName,
                cropSize: self.cropFrameSize
            )
            
            // 结束裁剪状态
            self.isCropping = false
        }
    }
    
    // 加载和启动颜色动画 - 优化版本，避免主线程hang
    private func loadPreviewColors() {
        // 先尝试从UserDefaults加载颜色配置
        if let colorData = UserDefaults.standard.data(forKey: "selectedColors_\(currentImageName)"),
           let selectedColors = try? JSONDecoder().decode([String].self, from: colorData),
           !selectedColors.isEmpty {

            if selectedColors.contains("rainbow") {
                self.previewColors = [.red, .orange, .yellow, .green, .blue, .purple, .pink, .cyan, .mint]
            } else {
                self.previewColors = selectedColors.map { AppTheme.getColor(fromName: $0) }
            }
        } else {
            // 使用缓存的配置或默认颜色，避免同步数据加载
            if let cachedConfig = cachedCustomTriggerDisplay {
                self.previewColors = [cachedConfig.getColor()]
            } else {
                // 使用默认白色，避免触发数据加载
                self.previewColors = [.white]

                // 在后台异步加载真实配置
                DispatchQueue.global(qos: .userInitiated).async {
                    let config = model.triggerManager.getCustomTriggerDisplay(for: currentImageName)
                    DispatchQueue.main.async {
                        self.cachedCustomTriggerDisplay = config
                        self.previewColors = [config.getColor()]
                    }
                }
            }
        }
    }
    
    private func startColorAnimation() {
        // 如果启用渲染优化，延迟启动颜色动画避免Metal渲染冲突
        if AppConfig.useProgressiveInitialization {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.startColorAnimationInternal()
            }
        } else {
            startColorAnimationInternal()
        }
    }

    private func startColorAnimationInternal() {
        // 先停止旧的定时器，防止内存泄漏
        colorChangeTimer?.invalidate()

        // 重新加载颜色配置
        loadPreviewColors()

        // 只有当颜色多于一种时，才启动动画
        if previewColors.count > 1 {
            colorChangeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                // 使用安全动画避免Metal渲染问题
                if AppConfig.useProgressiveInitialization {
                    // 简化动画或无动画
                    self.currentColorIndex = (self.currentColorIndex + 1) % self.previewColors.count
                } else {
                    withAnimation(.easeInOut) {
                        // 安全地更新索引
                        self.currentColorIndex = (self.currentColorIndex + 1) % self.previewColors.count
                    }
                }
            }
        } else {
            // 如果只有一种或没有颜色，将索引重置为0，并停止定时器
            currentColorIndex = 0
            colorChangeTimer?.invalidate()
        }
    }
    
    private func stopColorAnimation() {
        colorChangeTimer?.invalidate()
        colorChangeTimer = nil
    }

    // MARK: - Image Selection Methods

    /// 处理图片选择
    private func handleImageSelection(_ item: PhotosPickerItem) {
            Task {
            Logger.info("开始处理图片选择，当前mode: \(currentImageName)", category: .ui)

            // 使用PhotoSelectionService处理选中的图片
            if let result = await photoService.handleSelectedPhoto(item, saveType: .modeImage) {
                await MainActor.run {
                    // 直接替换当前mode的图片，而不是创建新mode
                    replaceCurrentModeImage(with: result.originalImage)

                    Logger.success("图片更换完成，当前mode: \(currentImageName)", category: .ui)
                }
            } else {
                Logger.error("图片处理失败", category: .ui)
            }
        }
    }

    /// 替换当前mode的图片
    private func replaceCurrentModeImage(with newImage: UIImage) {
        Logger.info("开始替换当前mode图片: \(currentImageName)", category: .ui)

        // 1. 直接替换ImageManager中的图片数据
        model.imageManager.replaceImage(named: currentImageName, with: newImage)

        // 2. 强制刷新全屏视图和其他相关视图
        model.imageManager.objectWillChange.send()

        // 3. 更新当前状态以反映变化
        syncCurrentConfigToTempState()

        // 4. 设置标志位，避免在视图关闭时重复刷新缓存
        hasPendingImageReplacement = true

        Logger.success("图片替换完成: \(currentImageName)", category: .ui)
    }
}

// MARK: - Extensions
extension ImageSettingsView {
    var playModeSection: some View {
        Button(action: cycleSoundPlayMode) {
            HStack {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: AppTheme.smallIconSize))
                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    .foregroundColor(AppTheme.primaryColor)
                Text("播放模式")
                    .font(AppTheme.bodyFont)
                    .foregroundColor(Color.textPrimary)
                Spacer()
                Text(soundPlayMode.rawValue)
                    .font(AppTheme.smallFont)
                    .foregroundColor(AppTheme.tertiaryTextColor)
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }

    var backtrackSection: some View {
        Button(action: { enableBacktrack.toggle() }) {
            HStack {
                    Image(systemName: "arrow.trianglehead.counterclockwise")
                        .foregroundColor(AppTheme.primaryColor)
                    Text("音效回溯")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                Spacer()
                Toggle("", isOn: $enableBacktrack)
                    .labelsHidden()
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
    }

    var backtrackDurationSection: some View {
        VStack {
            Text("回溯时长设置")
                            .font(.appBody)
            Slider(
                value: Binding(
                    get: { backtrackDuration ?? 1.0 },
                    set: { backtrackDuration = $0 }
                ),
                in: 0...10
            )
        }
        .padding()
    }
    
    var autoTriggerIntervalContent: some View {
        VStack {
            Text("自动触发间隔")
                .font(.appBody)
            Slider(value: $autoTriggerInterval, in: 0.5...30)
        }
        .padding()
    }
    
    var shakeThresholdContent: some View {
        VStack {
            Text("摇晃阈值")
                .font(.appBody)
            Slider(value: $shakeThreshold, in: 0.1...10)
        }
        .padding()
    }
    
    var crownRotationThresholdContent: some View {
        VStack {
            Text("表冠旋转阈值")
                .font(.appBody)
            Slider(value: $crownRotationThreshold, in: 0.1...500)
        }
        .padding()
    }
    
    func cycleSoundPlayMode() {
        switch soundPlayMode {
        case .sequential: soundPlayMode = .random
        case .random: soundPlayMode = .sequential
        }
    }
    
    func syncCurrentConfigToTempState() {
        tempTriggerMode = triggerMode
        tempSoundPlayMode = soundPlayMode
        tempEnableBacktrack = enableBacktrack
        tempBacktrackDuration = backtrackDuration
        tempAutoTriggerInterval = autoTriggerInterval
        tempShakeThreshold = shakeThreshold
        tempCrownRotationThreshold = crownRotationThreshold
        tempRandomHintEnabled = randomHintEnabled
    }
    
    func loadNonCriticalConfigurationAsync() {
        // 简化实现
    }
    
    func saveAllTempConfigToPersistentStorage() {
        Logger.debug("开始保存所有临时配置到持久层: \(currentImageName)", category: .ui)
        
        // 1. 获取当前配置
        var settings = model.imageManager.getImageSettings(for: currentImageName, in: currentModeContext)
        
        // 2. 应用当前视图中的所有临时状态
        settings.triggerMode = triggerMode
        settings.soundPlayMode = soundPlayMode
        settings.enableBacktrack = enableBacktrack
        settings.backtrackDuration = backtrackDuration
        settings.autoTriggerInterval = autoTriggerInterval
        settings.shakeThreshold = shakeThreshold
        settings.crownRotationThreshold = crownRotationThreshold
        settings.randomHintEnabled = randomHintEnabled
        
        // 3. 应用自定义触发显示配置
        if let cachedConfig = cachedCustomTriggerDisplay {
            settings.customTriggerDisplay = cachedConfig
        }
        
        // 4. 更新缓存和持久化存储
        model.imageManager.updateImageSettings(for: currentImageName, in: currentModeContext, settings: settings)
        DataService.shared.saveImageSettingsSync(settings, for: currentImageName, in: currentModeContext)
        
        // 5. 保存音效选择
        let orderedFromSelection = model.selectedSoundsOrder.filter { selectedSounds.contains($0) }
        let remainingSelected = selectedSounds.filter { !model.selectedSoundsOrder.contains($0) }
        let finalOrdered = orderedFromSelection + Array(remainingSelected)
        model.soundManager.setMultiSoundNames(for: currentImageName, soundNames: finalOrdered)
        
        Logger.success("所有配置已保存: \(currentImageName)", category: .ui)
    }
    
    func performDataSave(for triggerMode: ImageTriggerMode) {
        // 简化实现
    }
}

#Preview {
    ImageSettingsView(model: BugOffModel(), imageName: "bug5", isPresented: .constant(true))
} 
