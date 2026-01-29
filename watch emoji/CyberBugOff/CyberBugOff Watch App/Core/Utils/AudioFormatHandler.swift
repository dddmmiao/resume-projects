import AVFoundation
import UniformTypeIdentifiers

/// 音效格式处理工具类 - 处理音频格式兼容性问题
class AudioFormatHandler {
    
    // MARK: - 支持的音频格式
    
    /// watchOS支持的音频格式
    static let supportedAudioTypes: [String] = [
        "public.aac-audio",     // AAC格式
        "public.mp3",           // MP3格式
        "com.microsoft.waveform-audio", // WAV格式
        "public.aiff-audio",    // AIFF格式
        "com.apple.m4a-audio",  // M4A格式
        "com.apple.coreaudio-format" // CAF格式
    ]

    /// 推荐的输出格式（AAC - Apple推荐，体积小，质量好）
    static let preferredOutputFormat: String = "public.aac-audio"
    
    // MARK: - 音频处理配置
    
    struct ProcessingConfig {
        /// 最大音频时长（秒）
        let maxDuration: TimeInterval
        /// 采样率（Hz）
        let sampleRate: Double
        /// 比特率（bps）
        let bitRate: Int
        /// 声道数
        let numberOfChannels: Int
        /// 最大文件大小（字节）
        let maxFileSize: Int
        /// 是否强制转换为AAC格式
        let forceConvertToAAC: Bool
        
        static let `default` = ProcessingConfig(
            maxDuration: 30.0,          // 延长到30秒
            sampleRate: 44100,          // 保持标准采样率
            bitRate: 256000,            // 提高到256kbps
            numberOfChannels: 2,        // 改为立体声
            maxFileSize: 5 * 1024 * 1024, // 提高到5MB
            forceConvertToAAC: true
        )

        static let highQuality = ProcessingConfig(
            maxDuration: 60.0,          // 延长到1分钟
            sampleRate: 48000,          // 提高采样率
            bitRate: 320000,            // 提高到320kbps
            numberOfChannels: 2,        // 立体声
            maxFileSize: 10 * 1024 * 1024, // 提高到10MB
            forceConvertToAAC: true
        )

        static let compact = ProcessingConfig(
            maxDuration: 15.0,          // 延长到15秒
            sampleRate: 44100,          // 提高采样率
            bitRate: 128000,            // 提高到128kbps
            numberOfChannels: 1,        // 保持单声道
            maxFileSize: 2 * 1024 * 1024, // 提高到2MB
            forceConvertToAAC: true
        )
    }
    
    // MARK: - 音频信息结构
    
    struct AudioInfo {
        let duration: TimeInterval
        let sampleRate: Double
        let numberOfChannels: Int
        let format: String?
        let fileSize: Int

        var isCompatible: Bool {
            return duration <= 60.0 && // 延长到1分钟
                   fileSize <= 10 * 1024 * 1024 && // 提高到10MB
                   (format.map { AudioFormatHandler.supportedAudioTypes.contains($0) } ?? false)
        }
    }
    
    // MARK: - 音频处理方法
    
    /// 检查音频格式是否受支持
    /// - Parameter url: 音频文件URL
    /// - Returns: 是否支持该格式
    static func isAudioFormatSupported(_ url: URL) -> Bool {
        let asset = AVAsset(url: url)

        // 使用同步方式检查是否可以播放（为了保持方法签名不变）
        // 在实际使用中，建议使用异步版本
        var isPlayable = false
        let semaphore = DispatchSemaphore(value: 0)

        Task {
            do {
                isPlayable = try await asset.load(.isPlayable)
            } catch {
                isPlayable = false
            }
            semaphore.signal()
        }

        semaphore.wait()

        guard isPlayable else {
            return false
        }

        // 检查格式类型
        if let formatType = getAudioFormat(url) {
            return supportedAudioTypes.contains(formatType)
        }

        return false
    }
    
    /// 获取音频文件信息
    /// - Parameter url: 音频文件URL
    /// - Returns: 音频信息
    static func getAudioInfo(_ url: URL) -> AudioInfo? {
        let asset = AVAsset(url: url)

        // 使用同步方式获取音频信息（为了保持方法签名不变）
        var audioTrack: AVAssetTrack?
        var duration: Double = 0
        var formatDescriptions: [Any] = []

        let semaphore = DispatchSemaphore(value: 0)

        Task {
            do {
                let tracks = try await asset.loadTracks(withMediaType: .audio)
                audioTrack = tracks.first
                duration = try await asset.load(.duration).seconds
                if let track = audioTrack {
                    formatDescriptions = try await track.load(.formatDescriptions)
                }
            } catch {
                // 处理错误
            }
            semaphore.signal()
        }

        semaphore.wait()

        guard audioTrack != nil else {
            return nil
        }

        var sampleRate: Double = 44100
        var numberOfChannels: Int = 1

        if let formatDescription = formatDescriptions.first {
            let audioStreamBasicDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription as! CMAudioFormatDescription)
            if let basicDescription = audioStreamBasicDescription {
                sampleRate = basicDescription.pointee.mSampleRate
                numberOfChannels = Int(basicDescription.pointee.mChannelsPerFrame)
            }
        }
        
        let format = getAudioFormat(url)
        let fileSize = getFileSize(url)
        
        return AudioInfo(
            duration: duration,
            sampleRate: sampleRate,
            numberOfChannels: numberOfChannels,
            format: format,
            fileSize: fileSize
        )
    }
    
    /// 验证音频文件是否符合要求
    /// - Parameters:
    ///   - url: 音频文件URL
    ///   - config: 处理配置
    /// - Returns: 验证结果和问题描述
    static func validateAudioFile(_ url: URL, config: ProcessingConfig = .default) -> (isValid: Bool, issues: [String]) {
        guard let audioInfo = getAudioInfo(url) else {
            return (false, ["无法读取音频文件信息"])
        }
        
        var issues: [String] = []
        
        // 检查时长
        if audioInfo.duration > config.maxDuration {
            issues.append("音频时长超过限制: \(String(format: "%.1f", audioInfo.duration))s > \(String(format: "%.1f", config.maxDuration))s")
        }
        
        // 检查文件大小
        if audioInfo.fileSize > config.maxFileSize {
            issues.append("文件大小超过限制: \(formatFileSize(audioInfo.fileSize)) > \(formatFileSize(config.maxFileSize))")
        }
        
        // 检查格式支持
        if let format = audioInfo.format {
            if !supportedAudioTypes.contains(format) {
                issues.append("不支持的音频格式: \(format)")
            }
        } else {
            issues.append("无法识别音频格式")
        }
        
        // 检查采样率
        if audioInfo.sampleRate > config.sampleRate * 1.5 {
            issues.append("采样率过高: \(Int(audioInfo.sampleRate))Hz")
        }

        // 性能监控：记录音频文件信息，便于后续优化
        let sizeInMB = Double(audioInfo.fileSize) / (1024 * 1024)
        if sizeInMB > 5.0 {
            Logger.warning("音频文件较大: \(String(format: "%.1f", sizeInMB))MB，如遇性能问题可考虑降低质量设置", category: .soundManager)
        }
        if audioInfo.duration > 30.0 {
            Logger.warning("音频时长较长: \(String(format: "%.1f", audioInfo.duration))s，如遇性能问题可考虑缩短时长", category: .soundManager)
        }

        return (issues.isEmpty, issues)
    }
    
    /// 获取推荐的处理配置
    /// - Parameter audioInfo: 音频信息
    /// - Returns: 推荐的配置
    static func getRecommendedConfig(for audioInfo: AudioInfo) -> ProcessingConfig {
        // 根据音频特性推荐配置，倾向于使用更高质量的配置
        if audioInfo.duration <= 15.0 && audioInfo.fileSize <= 2 * 1024 * 1024 {
            return .compact
        } else if audioInfo.numberOfChannels > 1 && audioInfo.fileSize <= 10 * 1024 * 1024 {
            return .highQuality
        } else {
            return .default
        }
    }
    
    // MARK: - 私有辅助方法
    
    /// 获取音频格式
    private static func getAudioFormat(_ url: URL) -> String? {
        let pathExtension = url.pathExtension.lowercased()

        switch pathExtension {
        case "aac":
            return "public.aac-audio"
        case "mp3":
            return "public.mp3"
        case "wav":
            return "com.microsoft.waveform-audio"
        case "aiff", "aif":
            return "public.aiff-audio"
        case "m4a":
            return "com.apple.m4a-audio"
        case "caf":
            return "com.apple.coreaudio-format"
        default:
            return nil
        }
    }
    
    /// 获取文件大小
    private static func getFileSize(_ url: URL) -> Int {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            return attributes[.size] as? Int ?? 0
        } catch {
            return 0
        }
    }
    
    /// 格式化文件大小显示
    static func formatFileSize(_ bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(bytes))
    }
}

// MARK: - 扩展方法

extension URL {
    /// 便捷方法：检查音频兼容性
    func checkAudioCompatibility(config: AudioFormatHandler.ProcessingConfig = .default) -> (isValid: Bool, issues: [String]) {
        return AudioFormatHandler.validateAudioFile(self, config: config)
    }
    
    /// 便捷方法：获取音频信息
    var audioInfo: AudioFormatHandler.AudioInfo? {
        return AudioFormatHandler.getAudioInfo(self)
    }
}
