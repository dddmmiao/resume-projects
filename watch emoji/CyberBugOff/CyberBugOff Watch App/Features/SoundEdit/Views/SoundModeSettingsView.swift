import SwiftUI
import AVFoundation
import UniformTypeIdentifiers
import WatchKit

/// 音效Mode设置视图 - 用于配置音效与mode的关联设置，也支持独立音效编辑
struct SoundModeSettingsView: View {
    @ObservedObject var model: BugOffModel
    let soundName: String
    let imageName: String? // 可选参数，nil表示独立编辑模式（如音效合成）
    @Binding var isPresented: Bool

    // MARK: - State Properties

    // Config object to hold all settings
    @State var config: SoundConfig
    // 保存原始配置用于取消时恢复
    @State private var originalConfig: SoundConfig
    // 跟踪用户是否明确保存了设置
    @State var hasExplicitlySaved: Bool = false

    // Trimming properties
    @State  var totalDuration: TimeInterval = 0.0

    // Audio engine for previews
    @State  var audioPlayer: AVAudioPlayer?
    @State  var previewTimer: Timer?
    @State  var statusCheckTask: Task<Void, Never>? = nil

    // UI State
    @State  var isPlaying = false
    @State  var showingPlaybackRateControl = false
    @State  var showingVolumeControl = false
    @State  var showingTrimmingInterface = false
    @State  var waveformData: [Float] = []
    @State  var isGeneratingWaveform = false

    // 首次进入时预激活音频会话，减少首次播放卡顿
    @State private var didInitAudioSession: Bool = false
    // 预构建的播放器，确保点击时立即可用
    @State private var prebuiltPlayer: AVAudioPlayer?


    // 表冠裁剪控制
    enum ActiveTrimPoint {
        case start, end
    }
    @State  var activeTrimPoint: ActiveTrimPoint? = nil

    // Trimming state
    @State  var isDragging = false
    @State  var dragOffset: CGFloat = 0
    @State  var dragStartTime: TimeInterval = 0
    @State  var dragEndTime: TimeInterval = 0

    // Sound picker state
    @State  var showingSoundPicker = false
    @State  var selectedBaseSoundName: String = ""

    // Toast state
    @State private var showErrorToast: Bool = false
    @State private var errorMessage: String = ""

    // MARK: - Initialization

    init(model: BugOffModel, soundName: String, imageName: String?, isPresented: Binding<Bool>) {
        self.model = model
        self.soundName = soundName
        self.imageName = imageName
        self._isPresented = isPresented
        // 延迟配置加载，避免在视图初始化时修改@Published属性
        // 临时使用默认配置，在onAppear中异步加载真实配置
        let tempConfig = SoundConfig(id: UUID().uuidString, baseSoundName: soundName)
        self._config = State(initialValue: tempConfig)
        self._originalConfig = State(initialValue: tempConfig)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.mediumPadding) {
                previewSection
                previewPlaybackButton
                trimmingSection
                playbackControlsSection
                actionsSection
            }
            .padding(.top, AppTheme.smallPadding)
        }
        .navigationTitle("音效设置")
        .navigationBarTitleDisplayMode(.inline)

        .onAppear {
            // 使用异步调度避免在视图更新中修改状态
            DispatchQueue.main.async {
                // 异步加载真实配置，避免在视图更新中修改@Published属性
                loadRealConfiguration()

                // 异步预激活音频会话与预热数据，减轻首次播放开销
                if !didInitAudioSession {
                    didInitAudioSession = true
                    DispatchQueue.global(qos: .userInitiated).async {
                        // 轻量激活会话（忽略错误）
                        let session = AVAudioSession.sharedInstance()
                        _ = try? session.setCategory(.playback, mode: .default)
                        _ = try? session.setActive(true, options: [.notifyOthersOnDeactivation])
                        // 预热该音效的数据缓存（若开启）
                        model.soundManager.audioService.prewarm(sounds: [soundName])
                    }
                }

                // 只在页面首次出现时停止其他音频，不影响当前播放状态
                if !isPlaying {
                    model.stopSound()
                }

                setupAudio()
            }
        }
        .onDisappear {
            stopPreview()

            // 页面关闭时的处理逻辑：临时编辑模式
            if !hasExplicitlySaved {
                Logger.debug("音效设置层取消设置 - \(soundName)", category: .ui)
            }
        }
        .toast(message: errorMessage, isVisible: $showErrorToast)
    }

    /// 异步加载真实配置，避免在视图初始化时修改@Published属性
    private func loadRealConfiguration() {
        let currentConfig: SoundConfig
        // 统一：获取特定mode的音效配置；若无imageName，则回退到全局配置（使用默认配置）
        if let imageName = imageName {
            currentConfig = model.getSoundConfig(for: soundName, imageName: imageName)
        } else if let soundID = model.soundManager.displayNameManager.getSoundID(for: soundName), let cfg = model.soundManager.getSoundConfig(byID: soundID) {
            currentConfig = cfg
        } else if let cfg = model.soundManager.getSoundConfig(byDisplayName: soundName) {
            currentConfig = cfg
        } else {
            // 创建一个默认配置
            let sid = model.soundManager.displayNameManager.getSoundID(for: soundName) ?? model.soundManager.createSound(displayName: soundName, baseSoundName: soundName)
            currentConfig = SoundConfig(id: sid, baseSoundName: soundName)
        }

        // 确保配置的ID和baseSoundName是正确的
        var correctedConfig: SoundConfig

        // 确保有正确的SoundID
        if let soundID = model.soundManager.displayNameManager.getSoundID(for: soundName) {
            // 创建新的配置实例，使用正确的ID和baseSoundName
            correctedConfig = SoundConfig(id: soundID, baseSoundName: soundName)
        } else {
            // 如果没有找到SoundID，创建一个新的
            let newSoundID = model.soundManager.createSound(displayName: soundName, baseSoundName: soundName)
            correctedConfig = SoundConfig(id: newSoundID, baseSoundName: soundName)
        }

        // 复制其他配置属性
        correctedConfig.volume = currentConfig.volume
        correctedConfig.playbackRate = currentConfig.playbackRate
        correctedConfig.startTime = currentConfig.startTime
        correctedConfig.endTime = currentConfig.endTime

        // 更新状态
        config = correctedConfig
        originalConfig = correctedConfig

        // 在setupAudio之前记录初始配置状态（因为setupAudio会修改endTime）
        let isDefault = (config.volume == 1.0 && config.playbackRate == 1.0 && config.startTime == 0.0 && config.endTime == nil)
        Logger.debug("音效设置层进入设置 - \(soundName) (\(isDefault ? "默认配置" : "自定义配置"))", category: .ui)
        Logger.debug("音效设置层配置ID: \(config.id), baseSoundName: \(config.baseSoundName)", category: .ui)
    }

    private func timeToIndex(_ time: TimeInterval) -> Int {
        let ratio = time / totalDuration
        return Int(ratio * Double(waveformData.count - 1))
    }

    private func indexToTime(_ index: Int) -> TimeInterval {
        let ratio = Double(index) / Double(waveformData.count - 1)
        return ratio * totalDuration
    }

    private func clampTime(_ time: TimeInterval) -> TimeInterval {
        return max(0, min(time, totalDuration))
    }

    func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        let milliseconds = Int((time.truncatingRemainder(dividingBy: 1)) * 10)

        if minutes > 0 {
            return String(format: "%d:%02d.%d", minutes, seconds, milliseconds)
        } else {
            return String(format: "%d.%ds", seconds, milliseconds)
        }
    }


    // 已移除旧的playPreview方法，统一使用togglePreview逻辑



    // MARK: - Audio Logic Methods

    func setupAudio() {
        // 后台预构建播放器与读取数据，避免点击时卡顿
        DispatchQueue.global(qos: .userInitiated).async {
            guard let soundURL = model.getURL(for: config.baseSoundName) else {
                Logger.error("无法找到音效文件: \(config.baseSoundName)", category: .soundManager)
                return
            }
            do {
                let player = try AVAudioPlayer(contentsOf: soundURL)
                player.prepareToPlay()
                player.enableRate = true
                let duration = player.duration

                // 回主线程设置：本地播放器、总时长、预构建状态
                DispatchQueue.main.async {
                    self.audioPlayer = player
                    self.prebuiltPlayer = player
                    self.totalDuration = duration
                    if self.config.endTime == nil { self.config.endTime = duration }
                }
            } catch {
                Logger.error("设置AVAudioPlayer时出错: \(error.localizedDescription)", category: .soundManager)
                DispatchQueue.main.async {
                    self.audioPlayer = nil
                }
            }
        }
    }



    func generateWaveformData(from url: URL) {
        isGeneratingWaveform = true

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let audioFile = try AVAudioFile(forReading: url)
                let format = audioFile.processingFormat
                let frameCount = UInt32(audioFile.length)

                guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
                    DispatchQueue.main.async {
                        self.isGeneratingWaveform = false
                    }
                    return
                }

                try audioFile.read(into: buffer)

                guard let floatChannelData = buffer.floatChannelData else {
                    DispatchQueue.main.async {
                        self.isGeneratingWaveform = false
                    }
                    return
                }

                let channelData = floatChannelData[0]
                let channelDataCount = Int(buffer.frameLength)

                // 采样数据以生成波形
                let sampleCount = 100 // 生成100个采样点
                let samplesPerPoint = channelDataCount / sampleCount

                var waveform: [Float] = []

                for i in 0..<sampleCount {
                    let startIndex = i * samplesPerPoint
                    let endIndex = min(startIndex + samplesPerPoint, channelDataCount)

                    var maxAmplitude: Float = 0
                    for j in startIndex..<endIndex {
                        maxAmplitude = max(maxAmplitude, abs(channelData[j]))
                    }

                    waveform.append(maxAmplitude)
                }

                DispatchQueue.main.async {
                    self.waveformData = waveform
                    self.isGeneratingWaveform = false
                }

            } catch {
                Logger.error("生成波形数据时出错: \(error.localizedDescription)", category: .soundManager)
                DispatchQueue.main.async {
                    self.isGeneratingWaveform = false
                }
            }
        }
    }

    // 播放按钮：专注于播放和停止
    func togglePreview() {
        if isPlaying {
            // 停止预览
            stopPreview()
        } else {
            // 开始播放
            startPreview()
        }
    }

    // 开始播放（恢复正确逻辑：根据配置播放完整时长）
    private func startPreview() {
        // UI 立即切换
        isPlaying = true

        // 使用预构建播放器，应用当前配置
        if let player = prebuiltPlayer {
            // 后台应用配置并播放
            DispatchQueue.global(qos: .userInitiated).async {
                player.stop()
                player.volume = Float(config.volume)
                player.rate = Float(config.playbackRate)
                player.currentTime = config.startTime
                player.play()

                // 计算播放时长（根据配置）
                let endTime = config.endTime ?? player.duration
                let playDuration = max(0, endTime - config.startTime)
                let adjustedDuration = playDuration / config.playbackRate

                // 播放完成后复位UI
                DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration) {
                    isPlaying = false
                }
            }
        } else {
            // 回退到系统播放
            model.playSound(soundName: soundName) {
                DispatchQueue.main.async {
                    isPlaying = false
                }
            }
        }
    }

    // 停止播放并清理定时器
    private func stopPreview() {
        // 先重置UI状态，避免按钮卡顿
        isPlaying = false

        // 下一帧再停止音频，避免阻塞UI
        DispatchQueue.main.async {
            model.stopSound()
            // 停止本地音频播放器
            audioPlayer?.stop()

            // 清理定时器
            statusCheckTask?.cancel()
            statusCheckTask = nil
            previewTimer?.invalidate()
            previewTimer = nil
        }
    }

    // 启动状态检查定时器（简化版）
    private func startStatusCheck() {
        statusCheckTask?.cancel()
        statusCheckTask = Task { [weak model] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000) // 0.3s
                await MainActor.run {
                    guard let model = model else { return }
                    // 用户刚刚手动点击后的短时间内，不让后台状态覆盖UI（避免“声音先出现，按钮后切换”感受）


                    let audioIsPlaying = model.soundManager.isPlaying()
                    if self.isPlaying != audioIsPlaying {
                        self.isPlaying = audioIsPlaying
                        if !audioIsPlaying {
                            // 退出循环
                            return
                        }
                    }
                }
            }
        }
    }





    @discardableResult
    func saveChanges() -> Bool {
        if let imageName = imageName {
            // Mode 关联：仅写入临时层，遵循分层临时保存原则
            // 由父层 ImageSettingsView 在关闭时统一保存到持久化存储
            model.stageTempSoundConfig(config: config, for: imageName)

            Logger.success("音效设置层临时配置保存 - \(soundName) → \(imageName)", category: .ui)
            Logger.debug("   音量=\(config.volume), 速率=\(config.playbackRate), 裁剪=\(config.startTime)-\(config.endTime ?? 0)", category: .ui)
            Logger.debug("   配置已暂存，将由父层统一保存到持久化存储", category: .ui)
        } else {
            // 无图片上下文：直接更新全局SoundManager配置
            model.soundManager.updateSoundConfig(config: config)
            Logger.success("音效设置层配置保存(全局) - \(soundName) (音量=\(config.volume), 速率=\(config.playbackRate))", category: .ui)
        }
        hasExplicitlySaved = true
        return true
    }



    // MARK: - Performance Optimization Methods

    /// 临时编辑模式：配置变化时不保存，只在内存中修改
    /// 这样可以完全避免频繁I/O操作导致的hang问题
    private func updateConfigurationInMemoryOnly() {
        // 在临时编辑模式下，配置变化只影响当前视图的 @State config
        // 不触发任何保存操作，避免hang问题
        // 移除冗余日志，减少日志噪音
    }

    func resetSettings() {
        Logger.debug("重置设置为默认状态（临时操作，需点击完成按钮才保存）...", category: .ui)

        // 如果正在播放，先停止
        let wasPlaying = isPlaying
        if wasPlaying {
            stopPreview()
        }

        // 创建默认配置（仅在内存中修改，不保存）
        let defaultConfig = SoundConfig(
            id: config.id, // 保持ID不变
            baseSoundName: config.baseSoundName // 保持基础音效不变
        )
        // 其他属性会自动使用默认值

        config = defaultConfig

        // 重新设置音频
        setupAudio()

        // 如果之前在播放，重新开始播放（使用新的配置）
        if wasPlaying {
            startPreview()
        }
    }

    private func handleDragStart() {
        isDragging = true
        dragStartTime = config.startTime
        dragEndTime = config.endTime ?? totalDuration
    }

    private func handleDragEnd() {
        isDragging = false
    }

    /// 预览播放按钮：与音效合成视图保持一致的样式
    var previewPlaybackButton: some View {
        Button(action: togglePreview) {
            HStack(alignment: .center) {
                // 左侧图标和文本组
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "waveform")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text(isPlaying ? "停止预览" : "预览播放")
                        .font(.appBody)
                        .foregroundColor(isPlaying ? AppTheme.warningColor : Color.textPrimary)
                }

                Spacer()
            }
            .previewRowStyle(isActive: isPlaying)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Preview
struct SoundModeSettingsView_Previews: PreviewProvider {
    static var previews: some View {
        // Mock BugOffModel that can return a URL for preview
        let mockModel = BugOffModel()
        // Ensure you have a sound file named "sound1.mp3" in your test bundle

        NavigationStack {
            SoundModeSettingsView(
                model: mockModel,
                soundName: "2004年老电脑关机音", // Use a real sound name from your bundle for preview
                imageName: "bug1", // Use a real image name for preview
                isPresented: .constant(true)
            )
        }
        .environmentObject(mockModel.soundManager)
        .environmentObject(mockModel.imageManager)
    }
}

