import SwiftUI
import WatchKit
import MediaPlayer
import AVFoundation

// 导入共享定义
import Foundation

// 导入共享定义
import Foundation

// MARK: - 管理按钮阶段定义
enum ManageMode {
    case none
    case editDelete
    case reorder
}

// MARK: - 音效列表的不同操作模式
public enum SoundListMode {
    case multiSelect   // 多选模式，选择多个声音
    case edit          // 编辑模式，编辑声音基础属性
    case modeSettings  // Mode设置模式，配置音效与mode的关联效果
    case modeSelection // Mode音效选择模式，选择音效但不进入设置
}


// MARK: - 简化的按钮样式（移除动画以避免渲染问题）
struct CircleButtonStyleWithColor: ButtonStyle {
    var color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: AppTheme.smallIconSize))
            .foregroundColor(Color.textPrimary)
            .frame(width: Sizes.smallButtonHeight, height: Sizes.smallButtonHeight)
            .background(color)
            .clipShape(Circle())
            // 移除动画以避免Metal渲染问题
            // .opacity(configuration.isPressed ? 0.8 : 1.0)
            // .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            // .animation(AppTheme.standardAnimation(), value: configuration.isPressed)
    }
}

// MARK: - 主视图
struct SoundListView: View {
    @ObservedObject var model: BugOffModel
    let mode: SoundListMode
    // 父视图传入的“是否当前页面处于激活显示状态”（用于首切换时延后启用重UI）
    let isActive: Bool
    @Binding var selectedSound: String?
    @Binding var selectedSounds: Set<String>
    var onSoundSelected: ((String) -> Void)?
    var onSoundsUpdated: (() -> Void)?
    // 新增：临时选择变化回调（用于父视图无缝更新UI快照）
    var onTempSelectionChanged: ((Set<String>) -> Void)?
    var imageName: String?
    @Environment(\.presentationMode) var presentationMode

    // 状态变量
    @State private var showingSoundEditor = false
    @State private var soundToEdit: String = ""
    @State private var playingSounds: Set<String> = []
    @State private var testSelectedItems: [String] = []
    @State private var isPreviewPlaying: Bool = false
    @State private var currentPreviewIndex: Int = 0
    @State private var previewTimer: Timer? = nil


    // 移除缓存机制，直接使用响应式的 model.defaultSounds

    // 新增状态变量
    @State private var isPlaying: Bool = false
    @State private var isLooping: Bool = false
    @State private var playbackSpeed: Double = 1.0

    // 临时选择状态（仅在modeSettings模式下使用）
    @State private var tempSelectedSounds: Set<String> = []
    @State private var tempSelectedItems: [String] = []


    @State private var pitch: Double = 0.0
    @State private var newSoundNameInput: String = ""

    // 添加更多音效参数
    @State private var startPosition: Double = 0.0
    @State private var endPosition: Double = 1.0
    @State private var echo: Double = 0.0
    @State private var reverb: Double = 0.0

    // 统一删除弹窗
    @State private var soundToDelete: String? = nil

    // 侧滑提示动画状态管理
    @StateObject private var swipeHintManager = AppTheme.SwipeHintManager(pageType: "soundlist")

    // 强制停止所有侧滑动画的方法
    private func forceStopAllSwipeAnimations() {
        swipeHintManager.stopAllAnimations()
    }

    // 初始化方法，针对不同模式进行优化
    init(model: BugOffModel, mode: SoundListMode, selectedSound: Binding<String?>, selectedSounds: Binding<Set<String>>, onSoundSelected: ((String) -> Void)? = nil, onSoundsUpdated: (() -> Void)? = nil, imageName: String? = nil, onTempSelectionChanged: ((Set<String>) -> Void)? = nil, isActive: Bool = true) {
        self.model = model
        self.mode = mode
        self.isActive = isActive
        self._selectedSound = selectedSound
        self._selectedSounds = selectedSounds
        self.onSoundSelected = onSoundSelected
        self.onSoundsUpdated = onSoundsUpdated
        self.onTempSelectionChanged = onTempSelectionChanged
        self.imageName = imageName



        // 根据模式初始化testSelectedItems
        self._testSelectedItems = State(initialValue: Self.getInitialSelectedItems(
            mode: mode,
            model: model,
            selectedSounds: selectedSounds.wrappedValue,
            imageName: imageName
        ))
    }

    // MARK: - 静态辅助方法

    /// 根据模式获取初始选中的音效列表
    private static func getInitialSelectedItems(
        mode: SoundListMode,
        model: BugOffModel,
        selectedSounds: Set<String>,
        imageName: String?
    ) -> [String] {
        switch mode {
        case .modeSettings:
            // modeSettings模式：从当前选中的音效开始，保持状态一致性
            guard let imageName = imageName else {
                Logger.warning("modeSettings模式缺少imageName，使用selectedSounds", category: .ui)
                return Array(selectedSounds)
            }
            // 从imageMultiSounds获取正确的顺序，确保与父视图状态一致
            let imageMultiSounds = model.imageMultiSounds[imageName] ?? []
            // 降噪：仅在 Debug 输出初始化日志
            #if DEBUG
            Logger.debug("modeSettings初始化: imageName=\(imageName), imageMultiSounds=\(imageMultiSounds), selectedSounds=\(selectedSounds)", category: .ui)
            #endif
            return imageMultiSounds.filter { selectedSounds.contains($0) }

        case .modeSelection:
            // modeSelection模式：从imageMultiSounds获取正确的顺序
            guard let imageName = imageName else {
                Logger.warning("modeSelection模式缺少imageName，使用空数组", category: .ui)
                return []
            }
            return model.imageMultiSounds[imageName] ?? []

        default:
            // 其他模式：使用当前选中的音效（转换为数组）
            return Array(selectedSounds)
        }
    }

    // MARK: - 计算属性
    private var effectiveTestSelectedItems: Binding<[String]> {
        mode == .modeSettings ? $tempSelectedItems : $testSelectedItems
    }

    private var effectiveSelectedSounds: Binding<Set<String>> {
        mode == .modeSettings ? $tempSelectedSounds : $selectedSounds
    }

    private var soundItemListView: some View {
        SoundItemListView(
            model: model,
            testSelectedItems: effectiveTestSelectedItems,
            playingSounds: $playingSounds,
            selectedSounds: effectiveSelectedSounds,
            soundToEdit: $soundToEdit,
            showingSoundEditor: $showingSoundEditor,
            onSoundsUpdated: onSoundsUpdated,
            updateImageSounds: updateImageSounds,
            imageName: imageName,
            mode: mode,
            currentSoundDisplayNames: currentSoundDisplayNames,
            forceStopAllSwipeAnimations: forceStopAllSwipeAnimations
        )
    }

    var body: some View {
        VStack(spacing: 4) {
            soundItemListView
        }
        .navigationTitle(getNavigationTitle())
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // 在 modeSettings 模式下，初始化临时状态
            if mode == .modeSettings {
                tempSelectedSounds = selectedSounds
                // 使用已记录的选中顺序恢复序号，避免Set导致的顺序抖动
                let orderedFromHistory = model.selectedSoundsOrder.filter { tempSelectedSounds.contains($0) }
                if orderedFromHistory.count == tempSelectedSounds.count {
                    tempSelectedItems = orderedFromHistory
                } else {
                    // 将缺失的项按当前列表展示顺序追加，保证稳定且直观
                    let remaining = tempSelectedSounds.subtracting(Set(orderedFromHistory))
                    let byDisplayOrder = currentSoundDisplayNames.filter { remaining.contains($0) }
                    tempSelectedItems = orderedFromHistory + byDisplayOrder
                }
                // 确保临时Set与数组一致（过滤掉首页已删除的音效）
                tempSelectedSounds = Set(tempSelectedItems)
                #if DEBUG
                Logger.debug("音效选择层SoundListView初始化临时状态(保序): \(tempSelectedItems)", category: .ui)
                #endif
                // 立即通知父视图更新UI快照，避免返回时从无到有
                onTempSelectionChanged?(tempSelectedSounds)
            }
        }

        .onDisappear {
            // 在 modeSettings 模式下，当 SoundListView 消失时保存临时选择状态
            if mode == .modeSettings {
                Logger.debug("音效选择层返回Mode设置，保存临时音效选择（未落盘）", category: .ui)
                saveTempSelectionToModeSettings()
            }
        }
        // 监听临时选择变化，实时回调给父视图用于UI快照更新
        .onChange(of: tempSelectedSounds) { _, newValue in
            if mode == .modeSettings {
                onTempSelectionChanged?(newValue)
            }
        }
        .sheet(isPresented: $showingSoundEditor) {
            // 根据编辑模式显示不同的编辑视图
            if mode == .edit {
                // 基础编辑模式：编辑音效基础属性
                NavigationStack {
                    if let soundID = model.soundManager.displayNameManager.getSoundID(for: soundToEdit) {
                        SoundBasicEditView(
                            model: model,
                            soundID: soundID,
                            isPresented: $showingSoundEditor
                        )
                    } else {
                        // 如果找不到SoundID，创建一个临时的SoundID
                        let tempSoundID = soundToEdit
                        SoundBasicEditView(
                            model: model,
                            soundID: tempSoundID,
                            isPresented: $showingSoundEditor
                        )
                    }
                }
                .environmentObject(model.soundManager)
                .environmentObject(model.imageManager)
            } else {
                // Mode设置模式：配置音效与mode的关联效果
                NavigationStack {
                    SoundModeSettingsView(
                        model: model,
                        soundName: soundToEdit,
                        imageName: imageName, // 传递可选的imageName
                        isPresented: $showingSoundEditor
                    )
                }
                .environmentObject(model.soundManager)
                .environmentObject(model.imageManager)
            }
        }

        .onAppear {
            // 使用延迟执行避免阻塞视图初始化
            DispatchQueue.main.async {
                performViewAppearTasks()
            }
        }
        .onDisappear {
            model.stopSound()
            playingSounds.removeAll()
            stopPreviewPlayback()
        }
    }

    // MARK: - 计算属性
    private var title: String {
        return mode == .multiSelect ? "选择" : "编辑"
    }

    // 根据模式返回合适的导航标题
    private func getNavigationTitle() -> String {
        return mode == .edit ? "" : "选择音效"
    }

    // 保存临时选择状态到Mode设置（仅在modeSettings模式下调用）
    private func saveTempSelectionToModeSettings() {
        Logger.debug("音效选择层保存临时音效选择（未落盘）: \(tempSelectedItems.count) 个", category: .ui)

        // 清理未选择音效的临时配置
        if let imageName = imageName {
            let tempConfigs = model.getTempSoundConfigs(for: imageName)
            for (soundID, _) in tempConfigs {
                let displayName = model.soundManager.displayNameManager.getDisplayName(for: soundID)
                if !tempSelectedSounds.contains(displayName) {
                    // 用户没有选择这个音效，清除其临时配置
                    model.clearTempSoundConfig(for: displayName, imageName: imageName)
                    Logger.debug("音效选择层清除未选中音效的临时配置: \(displayName)", category: .ui)
                }
            }
        }

        // 仅同步到父视图的临时状态绑定，不触达持久层
        selectedSounds = tempSelectedSounds
        testSelectedItems = tempSelectedItems

        // 将选择顺序同步到 model.selectedSoundsOrder，供顺序模式使用
        // 先移除旧的记录
        model.selectedSoundsOrder = model.selectedSoundsOrder.filter { !tempSelectedItems.contains($0) }
        // 按用户当前选择顺序追加至前部
        model.selectedSoundsOrder = tempSelectedItems + model.selectedSoundsOrder

        Logger.success("音效选择层临时选择已返回给父视图: \(tempSelectedItems)", category: .ui)

        // 通知Mode设置视图更新（父视图可选择在关闭时统一落盘）
        onSoundsUpdated?()
    }

    // 清除指定音效的设置（恢复为默认设置）
    private func clearSoundSettings(for soundName: String, imageName: String) {
        // 在 modeSettings 模式下，仅更新临时选择与序列，不做持久化，交由父层统一落盘
        if mode == .modeSettings {
            if let idx = testSelectedItems.firstIndex(of: soundName) { testSelectedItems.remove(at: idx) }
            selectedSounds.remove(soundName)
            if let orderIdx = model.selectedSoundsOrder.firstIndex(of: soundName) { model.selectedSoundsOrder.remove(at: orderIdx) }
            Logger.debug("音效选择层临时清除音效设置（未落盘）: \(soundName)", category: .ui)
            onSoundsUpdated?()
            return
        }

        // 其他模式：保留即时写盘行为
        let modeContext: ModeContext = imageName.contains("_copy_") ? ModeContext(modeId: imageName) : model.imageManager.getCurrentModeContext()
        var settings = model.imageManager.getImageSettings(for: imageName, in: modeContext)
        if let soundID = model.soundManager.displayNameManager.getSoundID(for: soundName) {
            settings.soundConfigs.removeValue(forKey: soundID)
        }
        settings.soundConfigs.removeValue(forKey: soundName)
        model.imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)
        DataService.shared.saveImageSettingsSync(settings, for: imageName, in: modeContext)
    }

    /// 获取当前的音效显示名称列表（响应式版本）
    private var currentSoundDisplayNames: [String] {
        // 直接返回 model.defaultSounds，因为它现在是 @Published 属性
        // 这样可以确保视图在数据变化时立即更新
        return model.defaultSounds
    }

    // 移除缓存更新方法，不再需要




    // MARK: - 预览播放功能
    private func togglePreviewPlayback() {
        // 立即停止所有侧滑动画
        forceStopAllSwipeAnimations()
        if isPreviewPlaying {
            stopPreviewPlayback()
        } else {
            startPreviewPlayback()
        }
    }

    private func startPreviewPlayback() {
        // 停止所有当前播放的音效
        model.stopSound()

        // 设置为播放状态
        isPreviewPlaying = true

        // 仅剩顺序/随机两种模式：
        // - 顺序：依次播放每个音效
        // - 随机：每次播放一个随机音效（预览这里用顺序预览更直观）
        currentPreviewIndex = 0

        let orderedSounds = getOrderedSounds()
        if !orderedSounds.isEmpty {
            playNextSound(orderedSounds: orderedSounds)
        } else {
            isPreviewPlaying = false
        }
    }

    // 播放下一个音效
    private func playNextSound(orderedSounds: [String]) {
        guard currentPreviewIndex < orderedSounds.count else {
            // 所有音效播放完毕
            isPreviewPlaying = false
            return
        }

        // 播放当前音效，并设置完成回调
        let targetImage = imageName ?? model.selectedDefaultImageName
        model.playSound(soundName: orderedSounds[currentPreviewIndex], for: targetImage) {
            // 音效播放完成后，播放下一个
            self.currentPreviewIndex += 1
            self.playNextSound(orderedSounds: orderedSounds)
        }
    }

    // 停止预览播放
    private func stopPreviewPlayback() {
        previewTimer?.invalidate()
        previewTimer = nil
        model.stopSound()
        isPreviewPlaying = false
    }

    // MARK: - 辅助方法

    /// 执行视图出现时的任务
    private func performViewAppearTasks() {
        // 1. 移除缓存更新，直接使用响应式的 model.defaultSounds
        // 立即执行数据同步
        syncTestSelectedItems()
    }

    // 同步testSelectedItems的顺序（针对不同模式优化）
    private func syncTestSelectedItems() {

        let selectedSet = selectedSounds

        // 在 modeSettings 模式下，不需要在这里处理
        // 临时状态将在 SoundItemListView 中管理
        if mode == .modeSettings {
            Logger.debug("音效选择层modeSettings模式，使用临时状态管理", category: .ui)
            return
        }

        // 如果选中的音效没有变化，直接返回
        guard selectedSet != Set(testSelectedItems) else {
            return
        }

        let newItems = getSyncedSelectedItems(
            mode: mode,
            currentItems: testSelectedItems,
            selectedSet: selectedSet,
            model: model
        )

        testSelectedItems = newItems
    }

    /// 根据模式获取同步后的选中音效列表
    private func getSyncedSelectedItems(
        mode: SoundListMode,
        currentItems: [String],
        selectedSet: Set<String>,
        model: BugOffModel
    ) -> [String] {
        switch mode {
        case .modeSettings:
            // modeSettings模式：保持与selectedSounds绑定一致的状态
            return preserveUserSelectionOrder(
                currentItems: currentItems,
                selectedSet: selectedSet
            )

        case .modeSelection:
            // modeSelection模式：保持用户选择的顺序
            return preserveUserSelectionOrder(
                currentItems: currentItems,
                selectedSet: selectedSet
            )

        default:
            // 其他模式：按照系统顺序重新排列
            return reorderBySystemPriority(
                selectedSet: selectedSet,
                model: model
            )
        }
    }

    /// 保持用户选择的顺序（用于modeSelection模式）
    private func preserveUserSelectionOrder(
        currentItems: [String],
        selectedSet: Set<String>
    ) -> [String] {
        var newItems: [String] = []

        // 保持现有音效的顺序
        for sound in currentItems {
            if selectedSet.contains(sound) {
                newItems.append(sound)
            }
        }

        // 添加新选中的音效
        for sound in selectedSet {
            if !newItems.contains(sound) {
                newItems.append(sound)
            }
        }

        return newItems
    }

    /// 按照系统优先级重新排序（用于其他模式）
    private func reorderBySystemPriority(
        selectedSet: Set<String>,
        model: BugOffModel
    ) -> [String] {
        var newItems: [String] = []

        // 1. 按照selectedSoundsOrder的顺序添加
        for sound in model.selectedSoundsOrder {
            if selectedSet.contains(sound) {
                newItems.append(sound)
            }
        }

        // 2. 按照defaultSounds的顺序添加剩余音效
        for sound in model.defaultSounds {
            if selectedSet.contains(sound) && !newItems.contains(sound) {
                newItems.append(sound)
            }
        }

        // 3. 添加其他音效
        for sound in selectedSet {
            if !newItems.contains(sound) {
                newItems.append(sound)
            }
        }

        return newItems
    }

    // 获取按顺序排列的音效列表
    private func getOrderedSounds() -> [String] {
        // 顺序/随机两种模式：
        // - 顺序：按顺序号排序
        // - 随机：预览使用当前顺序即可
        if model.soundPlayMode == .sequential {
            var soundsWithOrder: [(sound: String, order: Int)] = []
            for sound in testSelectedItems {
                let order = model.sequentialSoundOrder[sound] ?? Int.max
                soundsWithOrder.append((sound, order))
            }
            soundsWithOrder.sort { $0.order < $1.order }
            return soundsWithOrder.map { $0.sound }
        } else {
            return testSelectedItems
        }
    }

    // 将已选中的音效转换为顺序播放模式
    private func convertSelectedSoundsToSequential() {
        model.sequentialSoundOrder.removeAll()
        model.nextSequenceNumber = 1

        // 按照testSelectedItems的当前顺序分配序号（保持用户选择的顺序）
        for sound in testSelectedItems {
                model.sequentialSoundOrder[sound] = model.nextSequenceNumber
                model.nextSequenceNumber += 1
            }

        // 将testSelectedItems的顺序同步到model.selectedSoundsOrder
        // 先清除旧的记录，只保留当前选中的音效
        model.selectedSoundsOrder = model.selectedSoundsOrder.filter { !testSelectedItems.contains($0) }

        // 将testSelectedItems的音效添加到selectedSoundsOrder的开头，保持顺序
        model.selectedSoundsOrder = testSelectedItems + model.selectedSoundsOrder
    }

    // 更新图片关联的音效
    private func updateImageSounds() {
        guard let imageName = imageName else { return }

        // 在 modeSettings 模式下，这只是更新临时选择状态
        // 实际保存会在返回Mode设置视图时进行
        if mode == .modeSettings {
            Logger.debug("音效选择层更新临时选择状态: \(Array(selectedSounds))", category: .ui)
            return
        }

        // 其他模式：立即保存
        if selectedSounds.isEmpty {
            model.soundManager.removeSound(from: imageName)
        } else {
            let ordered = model.selectedSoundsOrder.filter { selectedSounds.contains($0) }
            model.soundManager.setMultiSoundNames(for: imageName, soundNames: ordered)
        }
        Logger.debug("音效选择层立即保存音效选择: \(Array(selectedSounds))", category: .ui)
    }



    // MARK: - 排序操作 (移至 SoundItemActionsView)
}

// MARK: - 音效列表视图
struct SoundItemListView: View {
    @ObservedObject var model: BugOffModel
    @Binding var testSelectedItems: [String]
    @Binding var playingSounds: Set<String>
    @Binding var selectedSounds: Set<String>
    @Binding var soundToEdit: String
    @Binding var showingSoundEditor: Bool
    var onSoundsUpdated: (() -> Void)?
    let updateImageSounds: () -> Void
    let imageName: String?
    let mode: SoundListMode
    let currentSoundDisplayNames: [String]
    let forceStopAllSwipeAnimations: () -> Void



    // 统一删除弹窗
    @State private var soundToDelete: String? = nil

    // 侧滑提示动画状态管理
    @StateObject private var swipeHintManager = AppTheme.SwipeHintManager(pageType: "soundlist")

    // 使用传入的强制停止所有侧滑动画的方法
    // 注意：这里使用传入的方法，而不是本地的 swipeHintManager

    // 已移除音效合成相关状态

    // 音频文件选择相关状态
    @State private var showingMusicPicker = false
    @State private var selectedMusicItem: Any?

    // 录音相关状态
    @State private var showingRecorder = false

    // 更新临时选择状态（仅在modeSettings模式下使用）
    private func updateTempImageSounds() {
        // 临时状态更新，不需要频繁日志
    }


    // MARK: - 计算属性
    private var visibleNames: [String] {
        currentSoundDisplayNames
    }



    // MARK: - 子视图组件
    private var listView: some View {
        List {
            if mode == .edit {
                addButton
            }
            // PERF: 使用简化的 ForEach，避免复杂的枚举
            ForEach(visibleNames, id: \.self) { sound in
                createSoundRow(sound: sound, index: 0)
                    .id("stable-row-\(sound)") // 稳定行ID，避免重建
            }
            .onMove { indices, destination in
                // 只在首页编辑模式下允许拖动排序
                guard mode == .edit else { return }

                // PERF: 延迟执行，避免在视图更新中修改 @Published 属性
                DispatchQueue.main.async {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        model.defaultSounds.move(fromOffsets: indices, toOffset: destination)
                        model.updateSoundOrder(model.defaultSounds)
                    }
                }
            }
            .moveDisabled(mode != .edit) // 只在首页编辑模式下启用拖动排序
        }
        .listStyle(.plain)
        .listRowInsets(EdgeInsets(
            top: AppTheme.tinyPadding,
            leading: mode == .modeSettings ? AppTheme.tinyPadding : AppTheme.smallPadding,
            bottom: AppTheme.tinyPadding,
            trailing: mode == .modeSettings ? AppTheme.tinyPadding : AppTheme.smallPadding
        ))
        // 将预热内容放入 overlay，避免占据 List 的可见行空间
        .overlay(SwipePrewarmOverlay { SwipePrewarmRow(model: model, context: .soundList(imageName: imageName)) })
        .onAppear {
            // 延迟预读音频数据，避免与视图切换动画冲突导致 Core Audio 过载
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak model] in
                guard let model = model else { return }
                let warm = Array(visibleNames.prefix(4))
                model.soundManager.audioService.prewarm(sounds: warm)
            }
        }
    }

    private var scrollView: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if mode == .edit {
                    addButton
                }
                soundRowsForEach()
            }
        }
        .id("soundList-scroll")
    }

    private func soundRowsForEach() -> some View {
        ForEach(Array(visibleNames.enumerated()), id: \.element) { index, sound in
            createSoundRow(sound: sound, index: index)
        }
    }

    private func createSoundRow(sound: String, index: Int) -> some View {
        UnifiedSwipableRow(
            sound: sound,
            model: model,
            playingSounds: $playingSounds,
            soundToEdit: Binding<String?>(
                get: { soundToEdit },
                set: { if let val = $0 { soundToEdit = val } }
            ),
            isShowingEditSheet: $showingSoundEditor,
            updateImageSounds: mode == .modeSettings ? updateTempImageSounds : updateImageSounds,
            onSoundsUpdated: onSoundsUpdated,
            deleteSound: mode == .modeSettings ? { _ in } : { s in soundToDelete = s },
            imageName: imageName,
            shouldShowHint: shouldShowHintForSound(sound, at: index),
            swipeHintManager: mode == .modeSettings ? nil : swipeHintManager,
            hintStyle: .single(.left), // 只提示右滑删除操作
            mode: mode,
            isSelected: (mode == .modeSettings ? selectedSounds.contains(sound) : nil),
            selectionIndex: (mode == .modeSettings ? (testSelectedItems.firstIndex(of: sound).map { $0 + 1 }) : nil),
            onToggleSelection: (mode == .modeSettings ? { toggleSelection(for: sound) } : nil),
            onStopAllAnimations: forceStopAllSwipeAnimations
        )
        .listRowBackground(
            RoundedRectangle(cornerRadius: mode == .modeSettings ? AppTheme.smallCornerRadius : 8)
                .fill(Color.gray.opacity(mode == .modeSettings ? 0.15 : 0.2))
                .padding(.horizontal, mode == .modeSettings ? AppTheme.tinyPadding : 0)
        )
    }

    // 切换选中状态（仅在 modeSettings 下使用）
    @MainActor
    private func toggleSelection(for sound: String) {
        guard mode == .modeSettings else { return }
        if selectedSounds.contains(sound) {
            selectedSounds.remove(sound)
            // 从有序数组中移除，保持顺序一致
            if let idx = testSelectedItems.firstIndex(of: sound) {
                testSelectedItems.remove(at: idx)
            }
        } else {
            selectedSounds.insert(sound)
            // 追加到有序数组末尾，保持用户当前操作顺序
            testSelectedItems.append(sound)
        }
        // 轻量回调，供父层即时刷新UI快照
        onSoundsUpdated?()
        updateImageSounds()
    }

    var body: some View {
        listView
            .id("soundItemList-stable")
        .sheet(isPresented: $showingMusicPicker) {
            MusicPickerView(
                isPresented: $showingMusicPicker,
                selectedItem: $selectedMusicItem,
                onMusicSelected: handleSelectedMusic,
                onMethodSelected: handleMethodSelection,
                onRecordingComplete: handleRecordingComplete
            )
        }
        .sheet(isPresented: $showingRecorder) {
            SoundRecorderView(
                isPresented: $showingRecorder,
                onRecordingComplete: handleRecordingComplete
            )
        }
        .alert("确认删除音效 \"\(soundToDelete ?? "")\"?", isPresented: Binding(
            get: { soundToDelete != nil },
            set: { if !$0 { soundToDelete = nil } }
        )) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) {
                // 立即停止所有侧滑动画
                forceStopAllSwipeAnimations()
                if let sound = soundToDelete {
                    performDelete(sound: sound)
                }
                soundToDelete = nil
            }
        }
    }

    // MARK: 添加按钮
    private var addButton: some View {
        Button(action: {
            // 立即停止所有侧滑动画
            forceStopAllSwipeAnimations()
            WKInterfaceDevice.current().play(.click)
            showingMusicPicker = true
        }) {
            HStack {
                Spacer()
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(AppTheme.primaryColor)
                Spacer()
            }
            .frame(height: AppTheme.rowHeight)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [4]))
                    .foregroundColor(.gray.opacity(0.5)))
        }
        .buttonStyle(PlainButtonStyle())
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }

    // 已移除音效合成按钮

    private func performDelete(sound: String) {
        // PERF: 延迟执行，避免在视图更新中修改 @Published 属性
        DispatchQueue.main.async {
            // 使用简化的动画，避免复杂的弹性效果
            withAnimation(.easeInOut(duration: 0.25)) {
                if let index = self.model.defaultSounds.firstIndex(of: sound) {
                    self.model.defaultSounds.remove(at: index)
                }
                if self.selectedSounds.contains(sound) {
                    self.selectedSounds.remove(sound)
                }
                if let index = self.model.selectedSoundsOrder.firstIndex(of: sound) {
                    self.model.selectedSoundsOrder.remove(at: index)
                }
                self.model.sequentialSoundOrder.removeValue(forKey: sound)
                if let idx = self.testSelectedItems.firstIndex(of: sound) {
                    self.testSelectedItems.remove(at: idx)
                }
                // 如果被删除的音效正在播放，立即停止
                if self.playingSounds.contains(sound) {
                    self.model.stopSound()
                    self.playingSounds.remove(sound)
                }

                // 更新所有mode配置，删除与该音效的关联
                self.updateAllModeConfigurationsAfterSoundDeletion(deletedSound: sound)

                self.updateImageSounds()
                self.onSoundsUpdated?()
            }
        }
    }

    /// 删除音效后更新所有mode配置
    private func updateAllModeConfigurationsAfterSoundDeletion(deletedSound: String) {
        // 遍历所有mode（图片）
        for imageName in model.defaultImages {
            // 更新mode的音效关联
            if var sounds = model.imageMultiSounds[imageName] {
                if sounds.contains(deletedSound) {
                    sounds.removeAll { $0 == deletedSound }
                    if sounds.isEmpty {
                        model.imageMultiSounds.removeValue(forKey: imageName)
                    } else {
                        model.imageMultiSounds[imageName] = sounds
                    }
                }
            }

            // 更新mode的音效配置（包括回溯配置）
            var settings = model.imageManager.getImageSettings(for: imageName)
            var needsUpdate = false

            // 删除该音效的配置
            if settings.soundConfigs.removeValue(forKey: deletedSound) != nil {
                needsUpdate = true
            }

            // 如果需要更新，保存设置
            if needsUpdate {
                model.imageManager.updateImageSettings(for: imageName, settings: settings)
            }
        }

        // 删除全局音效配置
        model.soundManager.deleteSoundConfig(for: deletedSound)

        Logger.info("已清理音效 \(deletedSound) 在所有mode中的关联和配置", category: .soundManager)
    }

    // 已移除音效合成相关的删除处理逻辑



    // MARK: - 音乐选择处理
    private func handleSelectedMusic(_ item: Any?) {
        // 保留原有逻辑，用于兼容
        selectedMusicItem = nil
    }

    // MARK: - 方法选择处理
    private func handleMethodSelection(_ method: SoundAddMethod) {
        switch method {
        case .record:
            // 显示录音界面
            showingRecorder = true

        case .syncFromiPhone:
            // 显示iPhone同步提示
            showSyncFromiPhoneAlert()
        }
    }

    private func showSyncFromiPhoneAlert() {
        // 这里暂时显示一个提示，后续实现具体逻辑
        WKInterfaceDevice.current().play(.click)
        Logger.info("iPhone同步功能将在后续版本中实现", category: .general)

        // TODO: 实现iPhone同步逻辑
        // 可能的实现方式：
        // 1. 使用WatchConnectivity与iPhone应用通信
        // 2. 通过CloudKit同步音效数据
        // 3. 显示同步状态和进度
    }

    /// 判断是否应该为指定音效显示侧滑提示
    private func shouldShowHintForSound(_ sound: String, at index: Int) -> Bool {
        // 在 modeSettings 模式下不显示侧滑提示，因为已经改为点击操作
        if mode == .modeSettings {
            return false
        }
        return swipeHintManager.shouldShowHint(for: sound, at: index)
    }



    // MARK: - 录音完成处理
    private func handleRecordingComplete(_ recordingURL: URL, _ soundName: String) {
        // 使用录制器传递的soundName作为文件名
        let finalSoundName = soundName.isEmpty ? "record1" : soundName

        // 移动录音文件到最终位置
        let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let finalURL = documentsDirectory.appendingPathComponent("\(finalSoundName).m4a")

        do {
            // 如果目标文件已存在，先删除
            if FileManager.default.fileExists(atPath: finalURL.path) {
                try FileManager.default.removeItem(at: finalURL)
            }

            // 移动文件
            try FileManager.default.moveItem(at: recordingURL, to: finalURL)

            // 验证音频文件兼容性
            let (isValid, issues) = AudioFormatHandler.validateAudioFile(finalURL)
            if !isValid {
                Logger.warning("录音文件存在兼容性问题: \(issues.joined(separator: ", "))", category: .soundManager)
                // 可以选择继续处理或显示警告，这里选择继续但记录警告
            }

            // 获取音频信息用于日志
            if let audioInfo = AudioFormatHandler.getAudioInfo(finalURL) {
                Logger.debug("录音文件信息: 时长=\(String(format: "%.1f", audioInfo.duration))s, 大小=\(AudioFormatHandler.formatFileSize(audioInfo.fileSize)), 格式=\(audioInfo.format ?? "未知")", category: .soundManager)
            }

            // 创建音效配置
            let soundID = model.soundManager.createSound(displayName: finalSoundName, baseSoundName: finalSoundName)
            var config = SoundConfig(id: soundID, baseSoundName: finalSoundName)
            config.volume = 1.0
            config.playbackRate = 1.0

            // 保存配置到SoundManager
            model.soundManager.updateSoundConfig(config: config)

            // PERF: 延迟添加到音效列表，避免在视图更新中修改 @Published 属性
            DispatchQueue.main.async {
                model.defaultSounds.append(finalSoundName)
                model.updateSoundOrder(model.defaultSounds)
            }

            // 播放成功反馈
            WKInterfaceDevice.current().play(.success)

            // 通知更新
            onSoundsUpdated?()

            Logger.success("录音音效添加成功: \(finalSoundName)", category: .soundManager)

        } catch {
            Logger.error("录音文件处理失败: \(error)", category: .soundManager)
            WKInterfaceDevice.current().play(.failure)
        }
    }


}

// MARK: - 音效项操作视图
struct SoundItemActionsView: View {
    let sound: String
    @ObservedObject var model: BugOffModel
    @Binding var playingSounds: Set<String>
    let imageName: String?

    var body: some View {
        Button(action: {
            // 切换播放状态
            if playingSounds.contains(sound) {
                model.stopSound()
                playingSounds.remove(sound)
            } else {
                model.stopSound()
                playingSounds.removeAll()
                // 使用基于图片的音效配置播放
                if let imageName = imageName {
                    model.playSound(soundName: sound, for: imageName) {
                        playingSounds.remove(sound)
                    }
                } else {
                    model.playSound(soundName: sound) {
                        playingSounds.remove(sound)
                    }
                }
                playingSounds.insert(sound)
            }
        }) {
            Image(systemName: playingSounds.contains(sound) ? "pause.fill" : "play.fill")
        }
        .buttonStyle(PlayPauseButtonStyle(isPlaying: playingSounds.contains(sound)))
    }
}

// MARK: - SwipableSoundRow组件
// 已移至 Components/SwipableSoundRow.swift

// MARK: - 骨架屏组件
struct SkeletonRowView: View {
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 12) {
            // 左侧圆形占位符（模拟播放按钮）
            Circle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 24, height: 24)

            // 中间文本占位符
            VStack(alignment: .leading, spacing: 4) {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 12)
                    .frame(maxWidth: .infinity)

                Rectangle()
                    .fill(Color.gray.opacity(0.2))
                    .frame(height: 8)
                    .frame(maxWidth: 80)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .opacity(isAnimating ? 0.5 : 1.0)
        .animation(
            Animation.easeInOut(duration: 1.0).repeatForever(autoreverses: true),
            value: isAnimating
        )
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - 预览
#Preview {
    let model = BugOffModel()

    return SoundListView(
        model: model,
        mode: .multiSelect,
        selectedSound: .constant(nil),
        selectedSounds: .constant(Set<String>())
    )
    .environmentObject(model.soundManager)
    .environmentObject(model.imageManager)
    .environmentObject(model.triggerManager)
}

