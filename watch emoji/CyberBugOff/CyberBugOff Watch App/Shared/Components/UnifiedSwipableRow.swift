import SwiftUI
import Foundation

// MARK: - UnifiedSwipableRow
/// 统一的可滑动行组件，同时支持音效合成视图和音效列表视图的需求
struct UnifiedSwipableRow: View {
    // 必填基本参数
    let sound: String
    @ObservedObject var model: BugOffModel
    @EnvironmentObject private var soundManager: SoundManager
    let imageName: String?
    @Binding var playingSounds: Set<String>
    
    // 编辑相关参数
    @Binding var soundToEdit: String?
    @Binding var isShowingEditSheet: Bool
    let onEnterEditMode: (() -> Void)?
    
    // 列表模式相关参数
    let mode: SoundListMode?
    let updateImageSounds: (() -> Void)?
    var onSoundsUpdated: (() -> Void)?

    // 选择状态（仅在 modeSettings 下使用）
    let isSelected: Bool?
    let selectionIndex: Int?
    let onToggleSelection: (() -> Void)?

    // 动作处理
    let duplicateSound: (() -> Void)?
    let deleteSound: ((String) -> Void)
    let onStartIndividualPlayback: (() -> Void)?

    // 侧滑提示
    let shouldShowHint: Bool
    let swipeHintManager: AppTheme.SwipeHintManager?
    let hintStyle: AppTheme.SwipeHintStyle



    // 全局动画停止回调
    let onStopAllAnimations: (() -> Void)?

    // PERF: 移除静态字典，简化状态管理

    // 内部状态
    @State private var animationOffset: CGFloat = 0


    // MARK: - 计算属性优化




    private var isSequentialMode: Bool {
        soundManager.soundPlayMode == .sequential
    }

    private var isPlaying: Bool {
        playingSounds.contains(sound)
    }
    

    
    
    /// 音效列表中使用的初始化器
    init(sound: String,
         model: BugOffModel,
         playingSounds: Binding<Set<String>>,
         soundToEdit: Binding<String?>,
         isShowingEditSheet: Binding<Bool>,
         updateImageSounds: @escaping () -> Void,
         onSoundsUpdated: (() -> Void)?,
         deleteSound: @escaping (String) -> Void,
         imageName: String?,
         shouldShowHint: Bool,
         swipeHintManager: AppTheme.SwipeHintManager?,
         hintStyle: AppTheme.SwipeHintStyle,
         mode: SoundListMode,
         isSelected: Bool? = nil,
         selectionIndex: Int? = nil,
         onToggleSelection: (() -> Void)? = nil,
          onStopAllAnimations: (() -> Void)? = nil) {
        
        self.sound = sound
        self.model = model
        self.imageName = imageName
        self._playingSounds = playingSounds
        self._soundToEdit = soundToEdit
        self._isShowingEditSheet = isShowingEditSheet
        self.deleteSound = deleteSound
        self.shouldShowHint = shouldShowHint
        self.swipeHintManager = swipeHintManager
        self.hintStyle = hintStyle

        // 音效列表特有参数
        self.mode = mode
        self.updateImageSounds = updateImageSounds
        self.onSoundsUpdated = onSoundsUpdated
        self.isSelected = isSelected
        self.selectionIndex = selectionIndex
        self.onToggleSelection = onToggleSelection
        self.onStopAllAnimations = onStopAllAnimations

        // 非合成上下文：不提供复制功能
        self.duplicateSound = nil
        self.onEnterEditMode = nil
        self.onStartIndividualPlayback = nil
    }
    
    var body: some View {
        rowCore
    }

    // 将核心行视图与 swipeActions 解耦，便于条件启用
    @ViewBuilder
    private var rowCore: some View {
        coreRow
            // 已废除左滑编辑按钮功能，现在直接点击音效行进入编辑
            // .swipeActions(edge: .leading) {
            //     if mode == .edit {
            //         editButton
            //     }
            // }
            .swipeActions(edge: .trailing) {
                if mode == .modeSettings {
                    EmptyView()
                } else {
                    Button(role: .destructive) {
                        forceStopAnimation()
                        deleteSound(sound)
                    } label: {
                        VStack(spacing: 2) {
                            Image(systemName: "trash")
                                .font(.system(size: AppTheme.smallIconSize, weight: .medium))
                        }
                        .foregroundColor(.white)
                    }
                }
            }
    }

    // 核心行（不包含 swipeActions）
    private var coreRow: some View {
        HStack(spacing: AppTheme.smallPadding) {
            // 选择按钮（仅在 modeSettings 下显示）
            if mode == .modeSettings {
                Button(action: { onToggleSelection?() }) {
                    let selected = isSelected ?? false
                    ZStack {
                        if selected {
                            Circle()
                                .fill(AppTheme.primaryColor)
                                .frame(width: 24, height: 24)
                                .overlay(
                                    Text(selectionIndex != nil ? "\(selectionIndex!)" : "✓")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.white)
                                )
                        } else {
                            Circle()
                                .stroke(Color.gray, lineWidth: 1.5)
                                .frame(width: 24, height: 24)
                        }
                    }
                    .contentShape(Circle())
                }
                .buttonStyle(PlainButtonStyle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .padding(.vertical, 2)
            }

            // 名称显示区域
            Text(getDisplayName()) // 通过SoundDisplayNameManager获取最新显示名称
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    // 立即强制停止动画并重置偏移
                    forceStopAnimation()

                    // 根据模式处理不同的点击逻辑
                    if mode == .modeSettings {
                        // modeSettings模式：点击音效名称直接进入设置
                        handleEnterSettings()
                    } else if mode == .edit {
                        // 首页编辑模式：点击音效名称进入编辑
                        handleEnterSettings()
                    }
                }

            // 播放按钮
            Button(action: togglePlayback) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
            }
            .buttonStyle(PlayPauseButtonStyle(isPlaying: isPlaying))
        }
        .frame(height: AppTheme.rowHeight)
        .padding(.vertical, mode == .modeSettings ? AppTheme.tinyPadding : AppTheme.smallPadding)
        .padding(.horizontal, mode == .modeSettings ? AppTheme.tinyPadding : 0)
        .offset(x: animationOffset)
        .onAppear {
            initializeHintAnimationIfNeeded()
        }
        .onTapGesture {
            // 用户点击时立即强制停止动画
            forceStopAnimation()
        }
        .gesture(
            // 简化拖拽手势检测，提高响应性能
            DragGesture(minimumDistance: 8)
                .onChanged { _ in
                    forceStopAnimation()
                }
        )
        .onDisappear {
            animationOffset = 0
        }
    }
    
    // MARK: - 子视图
    // 已废除左滑编辑按钮功能，现在直接点击音效行进入编辑
    // private var editButton: some View {
    //     Button {
    //         // 立即强制停止动画
    //         forceStopAnimation()
    //
    //         // 停止所有音效
    //         model.stopSound()
    //         playingSounds.removeAll()
    //
    //         // 通知重置播放状态
    //         onEnterEditMode?()
    //
    //         // 设置编辑目标
    //         soundToEdit = sound
    //         model.selectedSound = sound
    //
    //         // 尝试设置isShowingEditSheet为true
    //         // 如果传入的是.constant(false)，这个设置不会生效，从而支持navigationDestination模式
    //         isShowingEditSheet = true
    //     } label: {
    //         VStack(spacing: 2) {
    //             let isModeSettings = (mode == .some(.modeSettings))
    //             let iconName = isModeSettings ? "gearshape" : "pencil"
    //             Image(systemName: iconName)
    //                 .font(.system(size: AppTheme.smallIconSize, weight: .medium))
    //         }
    //         .foregroundColor(.white)
    //     }
    //     .tint(AppTheme.primaryColor)
    // }
    
    private var duplicateButton: some View {
        Button(action: {
            // 立即强制停止动画
            forceStopAnimation()
            duplicateSound?()
        }) {
            VStack(spacing: 2) {
                Image(systemName: "plus.square.on.square")
                    .font(.system(size: AppTheme.smallIconSize, weight: .medium))
            }
            .foregroundColor(.white)
        }
        .tint(AppTheme.successColor)
    }
    
    // MARK: - 辅助方法

    /// 获取音效的显示名称
    private func getDisplayName() -> String {
        // 现在sound参数已经是最新的显示名称，直接返回即可
        // 这是因为SoundListView现在使用currentSoundDisplayNames来提供最新的显示名称
        return sound
    }

    // MARK: - 动画控制

    /// 根据实际的侧滑按钮配置智能确定动画样式
    private var intelligentHintStyle: AppTheme.SwipeHintStyle {
        let hasLeadingActions = hasLeadingSwipeActions
        let hasTrailingActions = hasTrailingSwipeActions

        if hasLeadingActions && hasTrailingActions {
            // 两边都有按钮：使用双向动画，从右开始（因为右滑更常用）
            return .bidirectional(.right)
        } else if hasLeadingActions {
            // 只有左滑按钮：使用单向右滑动画（提示左滑操作）
            return .single(.right)
        } else if hasTrailingActions {
            // 只有右滑按钮：使用单向左滑动画（提示右滑操作）
            return .single(.left)
        } else {
            // 没有侧滑按钮：使用摆动动画作为通用提示
            return .wiggle
        }
    }

    /// 检查是否有左滑按钮
    private var hasLeadingSwipeActions: Bool {
        // 已废除左滑编辑按钮功能
        return false
    }

    /// 检查是否有右滑按钮
    private var hasTrailingSwipeActions: Bool {
        // mode设置模式：右滑显示设置按钮；其他模式始终显示删除按钮
        if mode == .modeSettings { return true }
        return true
    }

    private func stopHintAnimationIfNeeded() {
        if let manager = swipeHintManager, manager.isCurrentlyAnimating {
            let offsetBinding = Binding<CGFloat>(
                get: { animationOffset },
                set: { newValue in
                    // 确保在主线程上更新动画偏移
                    DispatchQueue.main.async {
                        self.animationOffset = newValue
                    }
                }
            )
            manager.stopCurrentAnimation(offset: offsetBinding)
        } else if animationOffset != 0 {
            // 如果没有动画管理器但偏移不为0，直接重置（使用更快的动画）
            withAnimation(.easeOut(duration: 0.15)) {
                animationOffset = 0
            }
        }
    }

    // 强制停止动画，用于用户交互时立即响应
    private func forceStopAnimation() {

        animationOffset = 0

        // 调用全局停止动画回调
        onStopAllAnimations?()

        // 停止本地动画管理器
        if let manager = swipeHintManager {
            let offsetBinding = Binding<CGFloat>(
                get: { animationOffset },
                set: { newValue in
                    DispatchQueue.main.async {
                        self.animationOffset = newValue
                    }
                }
            )
            manager.stopCurrentAnimationImmediately(offset: offsetBinding)
        }
    }

    // MARK: - 辅助方法

    /// 初始化提示动画
    private func initializeHintAnimationIfNeeded() {
        guard shouldShowHint, let manager = swipeHintManager else { return }

        let offsetBinding = Binding<CGFloat>(
            get: { animationOffset },
            set: { animationOffset = $0 }
        )

        // 延迟执行动画，避免与视图创建冲突
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            manager.performHint(
                for: sound,
                offset: offsetBinding,
                style: hintStyle // 使用传入的hintStyle参数而不是intelligentHintStyle
            )
        }
    }

    // MARK: - 动作
    private func togglePlayback() {
        // 立即强制停止动画
        forceStopAnimation()

        if playingSounds.contains(sound) {
            model.stopSound()
            playingSounds.remove(sound)
        } else {
            model.stopSound()
            playingSounds.removeAll()
            
            // 通知重置播放状态
            onStartIndividualPlayback?()
            
            // 播放音效
            if let imageName = imageName {
                // Mode相关预览：使用mode特定配置
                model.playSound(soundName: sound, for: imageName) {
                    playingSounds.remove(sound)
                }
            } else {
                // 首页soundlist视图等其他模式：使用全局默认配置
                model.playSound(soundName: sound) {
                    playingSounds.remove(sound)
                }
            }
            playingSounds.insert(sound)
        }
    }
    
    // 处理编辑点击（modeSettings模式）
    private func handleEditTap() {
        // 立即强制停止动画
        forceStopAnimation()

        // 停止所有音效
        model.stopSound()
        playingSounds.removeAll()

        // 通知重置播放状态
        onEnterEditMode?()

        // 设置编辑目标
        soundToEdit = sound
        model.selectedSound = sound

        // 尝试设置isShowingEditSheet为true
        // 如果传入的是.constant(false)，这个设置不会生效，从而支持navigationDestination模式
        isShowingEditSheet = true

        Logger.debug("点击音效行进入编辑模式: \(sound)", category: .ui)
    }



    // 处理进入设置的点击逻辑（modeSettings模式下点击音效名称）
    private func handleEnterSettings() {
        // 立即强制停止动画
        forceStopAnimation()

        // 停止所有音效
        model.stopSound()
        playingSounds.removeAll()

        // 通知重置播放状态
        onEnterEditMode?()

        // 设置编辑目标并进入设置视图
        soundToEdit = sound
        model.selectedSound = sound
        isShowingEditSheet = true

        // 移除重复的进入设置日志，在 SoundModeSettingsView 中已有更详细的日志
    }


}
