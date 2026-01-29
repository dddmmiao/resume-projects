import SwiftUI
import AVFoundation
import WatchKit


/// 录音状态
enum RecordingState {
    case idle       // 空闲状态
    case recording  // 录音中
    case finished   // 录音完成
    case playing    // 播放中
}

/// 音效录制视图
struct SoundRecorderView: View {
    @Binding var isPresented: Bool
    let onRecordingComplete: (URL, String) -> Void
    
    @State private var recordingState: RecordingState = .idle
    @State private var audioRecorder: AVAudioRecorder?
    @State private var audioPlayer: AVAudioPlayer?
    @State private var recordingURL: URL?
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?
    // 波形相关状态变量
    @State private var waveformBars: [CGFloat] = []  // 波形条数组
    @State private var waveformTimer: Timer?  // 波形更新定时器
    @State private var playbackCurrentTime: TimeInterval = 0  // 播放当前时间
    @State private var waveformPhase: Double = 0  // 波形相位，用于生成更自然的波形
    @State private var baseAmplitude: CGFloat = 12  // 基础振幅
    @State private var amplitudeVariation: CGFloat = 8  // 振幅变化范围
    
    var body: some View {
        ZStack {
            AppTheme.RecorderStyle.backgroundColor.ignoresSafeArea(.all)

            // 统一的录音界面（确保按钮位置完全一致）
            unifiedRecordingView
        }
        .navigationBarHidden(false) // 始终显示导航栏
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            setupAudioSession()
        }
        .onDisappear {
            // 如果正在录音，先停止录音
            if recordingState == .recording {
                stopRecording()
            }
            cleanup()
        }

    }
    
    // MARK: - 子视图

    // 统一的录音界面（确保按钮位置完全一致）
    private var unifiedRecordingView: some View {
        VStack(spacing: 0) {
            // 顶部空间
            Spacer()
                .frame(minHeight: 30) // 最小30px的顶部空间

            // 时间显示（调整位置更居中，接近限制时显示警告色）
            Text(displayTime)
                .font(AppTheme.RecorderStyle.timeFont)
                .foregroundColor(isNearTimeLimit ? AppTheme.RecorderStyle.warningColor : AppTheme.RecorderStyle.timeColor)
                .padding(.top, 20) // 增加顶部间距
                .padding(.bottom, AppTheme.RecorderStyle.timeSpacing)
                .animation(.easeInOut(duration: 0.3), value: isNearTimeLimit)

            // 录音按钮和波形区域（固定布局）
            ZStack {
                // 动态波形指示器（仅在录音时显示）
                if recordingState == .recording {
                    movingWaveformView
                        .ignoresSafeArea(.all)
                }

                // 录音/停止按钮（位置完全固定）
                recordingButton
            }
            .frame(height: 80) // 固定高度确保按钮位置不变

            // 中间空间
            Spacer()
                .frame(minHeight: 0) // 最小20px的中间空间

            // 底部内容区域
            VStack(spacing: 20) {
                // 提示文字（仅在idle状态显示）
                if recordingState == .idle {
                    Text("轻点录音")
                        .hintTextStyle()
                }

                // 控制按钮（录音完成后显示）
                if recordingState == .finished || recordingState == .playing {
                    bottomControlsView
                }
            }
            .frame(height: 80) // 固定高度确保布局稳定

            // 底部空间
            Spacer()
                .frame(minHeight: 20) // 最小20px的底部空间
        }
    }



    // 录音按钮组件
    private var recordingButton: some View {
        Button(action: recordingState == .recording ? stopRecording : startRecording) {
            ZStack {
                // 黑色背景（遮住波形）
                Circle()
                    .fill(AppTheme.RecorderStyle.buttonBackgroundColor)
                    .frame(width: AppTheme.RecorderStyle.buttonBackgroundSize, height: AppTheme.RecorderStyle.buttonBackgroundSize)

                // 白色边框
                Circle()
                    .stroke(AppTheme.RecorderStyle.borderColor, lineWidth: AppTheme.RecorderStyle.buttonBorderWidth)
                    .frame(width: AppTheme.RecorderStyle.buttonSize, height: AppTheme.RecorderStyle.buttonSize)

                // 录音状态内容：红色圆形 <-> 红色方形
                Group {
                    if recordingState == .recording {
                        RoundedRectangle(cornerRadius: AppTheme.RecorderStyle.stopSquareCornerRadius)
                            .fill(AppTheme.RecorderStyle.primaryColor)
                            .frame(width: AppTheme.RecorderStyle.stopSquareSize, height: AppTheme.RecorderStyle.stopSquareSize)
                    } else {
                        Circle()
                            .fill(AppTheme.RecorderStyle.primaryColor)
                            .frame(width: AppTheme.RecorderStyle.recordCircleSize, height: AppTheme.RecorderStyle.recordCircleSize)
                    }
                }
                .animation(AppTheme.RecorderStyle.transitionAnimation, value: recordingState)
            }
        }
        .buttonStyle(.plain)
    }

    // 从右向左移动的波形视图
    private var movingWaveformView: some View {
        GeometryReader { geometry in
            // 获取真正的屏幕宽度（包括安全区域外的部分）
            let fullScreenWidth = WKInterfaceDevice.current().screenBounds.width
            let centerX = geometry.size.width / 2

            // 显示所有波形条，从屏幕右边缘开始
            ForEach(Array(waveformBars.enumerated()), id: \.offset) { index, height in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color.red)
                    .frame(width: 2.5, height: height)
                    .position(
                        x: centerX + (fullScreenWidth / 2) - CGFloat(index) * 3.5, // 从真正的右边缘开始，增加间距
                        y: geometry.size.height / 2
                    )
                    .opacity(1.0) // 波形条透明度一致
            }
        }
        .frame(height: 100)
    }



    // 添加新的波形条 - 使用更自然的算法
    private func addWaveformBar() {
        // 更新相位，创建连续的波形变化
        waveformPhase += Double.random(in: 0.1...0.3)

        // 使用多个正弦波叠加，模拟真实音频的复杂性
        let primaryWave = sin(waveformPhase) * Double(baseAmplitude)
        let secondaryWave = sin(waveformPhase * 1.7) * Double(amplitudeVariation * 0.6)
        let tertiaryWave = sin(waveformPhase * 2.3) * Double(amplitudeVariation * 0.3)
        let noiseComponent = Double.random(in: -2...2) // 添加少量随机噪声

        // 合成最终高度
        let combinedHeight = abs(primaryWave + secondaryWave + tertiaryWave + noiseComponent)
        let finalHeight = max(4, min(32, CGFloat(combinedHeight)))

        waveformBars.insert(finalHeight, at: 0) // 在开头插入新条

        // 动态调整振幅，模拟音量变化
        adjustAmplitudeNaturally()

        // 限制波形条数量，确保可以覆盖整个屏幕宽度
        // Apple Watch屏幕宽度约为184-196像素，每个波形条间距3.5像素
        if waveformBars.count > 70 { // 足够覆盖整个屏幕宽度
            waveformBars.removeLast()
        }
    }

    // 自然地调整振幅，模拟真实录音的音量变化
    private func adjustAmplitudeNaturally() {
        // 随机调整基础振幅，但变化要平滑
        let targetAmplitude = CGFloat.random(in: 8...16)
        let amplitudeDifference = targetAmplitude - baseAmplitude
        baseAmplitude += amplitudeDifference * 0.1 // 平滑过渡

        // 调整变化范围
        let targetVariation = CGFloat.random(in: 4...12)
        let variationDifference = targetVariation - amplitudeVariation
        amplitudeVariation += variationDifference * 0.15 // 平滑过渡
    }



    // 底部控制按钮区域（录音完成后显示）
    private var bottomControlsView: some View {
        HStack(spacing: AppTheme.RecorderStyle.controlButtonSpacing) {
            // 播放按钮 - 蓝色表示主要操作
            controlButton(
                icon: recordingState == .playing ? "pause.fill" : "play.fill",
                text: recordingState == .playing ? "暂停" : "播放",
                color: AppTheme.primaryColor,
                action: togglePlayback
            )

            // 重新录制按钮 - 橙色表示重置操作
            controlButton(
                icon: "arrow.clockwise.circle.fill",
                text: "重录",
                color: AppTheme.warningColor,
                action: resetRecording
            )

            // 保存按钮 - 绿色表示确认操作
            controlButton(
                icon: "checkmark.circle.fill",
                text: "保存",
                color: AppTheme.successColor,
                action: saveRecording
            )
        }
    }

    // 与全局样式一致的控制按钮组件 - 使用fill图标，简洁美观，优化尺寸
    private func controlButton(icon: String, text: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: AppTheme.RecorderStyle.controlIconSize, weight: .medium))
                .foregroundColor(color)
                .frame(width: AppTheme.RecorderStyle.controlButtonSize, height: AppTheme.RecorderStyle.controlButtonSize)
                .background(Color.clear)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    // MARK: - 计算属性

    // 显示时间（录音时显示剩余时间倒计时，播放时显示正计时）
    private var displayTime: String {
        switch recordingState {
        case .recording:
            // 录音时显示剩余时间倒计时（向上取整，确保显示准确的秒数）
            let remainingTime = AppTheme.RecorderStyle.maxRecordingDuration - recordingDuration
            let remainingSeconds = max(0, ceil(remainingTime))
            return formatDuration(remainingSeconds)
        case .playing:
            // 播放时显示当前播放时间（正计时）
            return formatDuration(playbackCurrentTime)
        default:
            // 其他状态显示录音总时长
            return formatDuration(recordingDuration)
        }
    }

    // 剩余录音时间（向上取整的秒数）
    private var remainingRecordingTime: TimeInterval {
        let remainingTime = AppTheme.RecorderStyle.maxRecordingDuration - recordingDuration
        return max(0, ceil(remainingTime))
    }

    // 是否接近时间限制（最后5秒）
    private var isNearTimeLimit: Bool {
        return recordingState == .recording && remainingRecordingTime <= 5.0
    }

    // MARK: - 交互处理
    
    // MARK: - 录音功能
    
    private func setupAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .default)
            try audioSession.setActive(true)
        } catch {
            Logger.error("音频会话设置失败: \(error)", category: .soundManager)
        }
    }
    
    private func startRecording() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let timestamp = Int(Date().timeIntervalSince1970)
        recordingURL = documentsPath.appendingPathComponent("recording_\(timestamp).m4a")

        let settings = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: recordingURL!, settings: settings)
            audioRecorder?.record()

            recordingState = .recording
            recordingDuration = 0
            waveformBars = []  // 重置波形条数组
            waveformPhase = 0  // 重置波形相位
            baseAmplitude = 12  // 重置基础振幅
            amplitudeVariation = 8  // 重置振幅变化范围

            // 开始计时（包含时长检查和警告提醒）
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                recordingDuration += 0.1

                // 检查是否达到最大录音时长
                if recordingDuration >= AppTheme.RecorderStyle.maxRecordingDuration {
                    stopRecording()
                    return
                }

                // 在最后5秒时给出触觉反馈提醒
                let remainingTime = AppTheme.RecorderStyle.maxRecordingDuration - recordingDuration
                if remainingTime <= 5.0 && Int(remainingTime * 10) % 10 == 0 {
                    // 每秒震动一次提醒
                    WKInterfaceDevice.current().play(.notification)
                }
            }

            // 开始波形更新定时器（优化更新频率以获得更流畅的效果）
            waveformTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in
                addWaveformBar()
            }
        } catch {
            Logger.error("录音开始失败: \(error)", category: .soundManager)
            WKInterfaceDevice.current().play(.failure)
        }
    }
    
    private func stopRecording() {
        audioRecorder?.stop()
        timer?.invalidate()
        timer = nil
        waveformTimer?.invalidate()
        waveformTimer = nil
        waveformBars = []  // 清空波形条

        if recordingDuration >= AppTheme.RecorderStyle.minRecordingDuration {
            recordingState = .finished
            // 触觉反馈 - 录音完成
            WKInterfaceDevice.current().play(.stop)
        } else {
            recordingState = .idle
            // 触觉反馈 - 录音失败
            WKInterfaceDevice.current().play(.failure)
        }
    }
    
    private func togglePlayback() {
        guard let url = recordingURL else { return }

        if recordingState == .playing {
            // 暂停播放
            audioPlayer?.pause()
            timer?.invalidate()
            timer = nil
            recordingState = .finished
        } else {
            // 开始播放
            do {
                audioPlayer = try AVAudioPlayer(contentsOf: url)
                audioPlayer?.play()
                recordingState = .playing
                playbackCurrentTime = 0

                // 开始播放倒计时
                timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                    playbackCurrentTime += 0.1

                    // 播放完成
                    if playbackCurrentTime >= recordingDuration {
                        timer?.invalidate()
                        timer = nil
                        recordingState = .finished
                        playbackCurrentTime = 0
                    }
                }
            } catch {
                Logger.error("播放失败: \(error)", category: .soundManager)
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }
    
    private func resetRecording() {
        audioPlayer?.stop()
        recordingState = .idle
        recordingDuration = 0
        recordingURL = nil
        waveformBars = []  // 清空波形条
        // 触觉反馈 - 重置
        WKInterfaceDevice.current().play(.click)
    }
    
    private func saveRecording() {
        guard let url = recordingURL else {
            WKInterfaceDevice.current().play(.failure)
            return
        }

        // 自动生成音效名称：sound + 数字
        let soundName = generateUniqueSoundName()

        onRecordingComplete(url, soundName)
        WKInterfaceDevice.current().play(.success)
        isPresented = false
    }

    // 生成唯一的音效名称
    private func generateUniqueSoundName() -> String {
        let fileManager = FileManager.default
        guard let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return "record1"
        }

        var counter = 1
        var soundName = "record\(counter)"

        // 检查文件是否已存在，如果存在则递增数字
        while fileManager.fileExists(atPath: documentsDirectory.appendingPathComponent("\(soundName).mp3").path) ||
              fileManager.fileExists(atPath: documentsDirectory.appendingPathComponent("\(soundName).m4a").path) {
            counter += 1
            soundName = "record\(counter)"
        }

        return soundName
    }
    
    private func cleanup() {
        audioRecorder?.stop()
        audioPlayer?.stop()
        timer?.invalidate()
        timer = nil
        waveformTimer?.invalidate()
        waveformTimer = nil
        waveformBars = []
    }
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

#Preview {
    SoundRecorderView(
        isPresented: .constant(true),
        onRecordingComplete: { url, name in
            Logger.success("Recording completed: \(name) at \(url)", category: .soundManager)
        }
    )
}
