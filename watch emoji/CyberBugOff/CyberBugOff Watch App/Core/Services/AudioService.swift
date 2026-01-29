import Foundation
import AVFoundation
import Combine

// MARK: - Audio Service
class AudioService: NSObject, ObservableObject {
    // MARK: - Properties
    private var audioPlayer: AVAudioPlayer?
    private var multiAudioPlayers: [AVAudioPlayer] = []
    private var audioPlayers: [AVAudioPlayer] = []
    // 当前正在播放的音效名称
    private var currentSoundName: String?
    // 上一次触发回溯后定位到的锚点时间
    private var lastAnchorTime: TimeInterval = 0
    // 本次回溯窗口的上界（第一次触发回溯时的当前位置）
    private var lastUpperBound: TimeInterval = 0
    // 当前播放（主播放器）的结束时间（nil 表示播放到文件结尾）
    private var currentEndTime: TimeInterval?
    private var currentPlayingURLs: [URL]?
    // 用于取消顺序播放队列
    private var sequenceToken = UUID()
    // 用于管理定时器
    private var activeTimers: [Timer] = []
    // 新：Task 计时器列表（useTaskTimer 时使用）
    private var activeTasks: [Task<Void, Never>] = []
    // 用于管理主播放器的停止任务
    private var mainPlayerStopTask: DispatchWorkItem?
    
    // 顺序播放模式下的当前索引（用于记录下一个要播放的音效）
    private var currentSequentialIndex: [String: Int] = [:]
    
    // 保存播放器与音效名称的映射关系，用于回溯逻辑
    private var playerNameMap: [AVAudioPlayer: String] = [:]
    private var namePlayerMap: [String: AVAudioPlayer] = [:]
    
    // 最近一次播放的信息（用于回溯后重播）
    private var lastPlayedNames: [String] = []
    private var lastPlayedURLs: [URL] = []
    private var lastPlayMode: SoundPlayMode = .sequential
    private var lastSoundConfigs: [String: SoundConfig] = [:]
    
    // 随机模式下，记录最后一次真正播放的音效
    private var lastRandomName: String?
    private var lastRandomURL: URL?
    
    // MARK: - 音频数据缓存
    /// 通过缓存减少磁盘IO，使用 NSCache 确保线程安全
    private let soundDataCache = NSCache<NSString, NSData>()

    // 预热标记，避免重复预热
    private var didWarmUpAudioStack: Bool = false

    override init() {
        super.init()
        // 配置缓存限制，避免内存占用过高
        soundDataCache.countLimit = AppConfig.soundDataCacheCountLimit
        soundDataCache.totalCostLimit = AppConfig.soundDataCacheTotalCostLimitBytes

        // 在watchOS中，我们使用定时器来监控内存而不是系统通知
        // 因为UIApplication在watchOS中不可用
    }

    deinit {
        stopAllAudio()
        clearSoundDataCache()
    }

    /// 手动触发内存清理（由BugOffModel的内存监控调用）
    public func handleMemoryPressure() {
        Logger.warning("AudioService执行内存清理", category: .soundManager)

        // 停止所有播放
        stopAllAudio()

        // 清理音频缓存
        clearSoundDataCache()

        // 记录内存使用情况
        PerformanceMonitor.logMemoryUsage(context: "AudioService内存清理后")
    }
    
    /// 后台队列用于预热音频缓存
    private static let cacheQueue = DispatchQueue(label: "com.cyberbugoff.audioservice.cache", qos: .utility)
    
    // 回溯窗口跟踪：每个音效独立记录锚点与窗口上界
    private var lastAnchorMap: [String: TimeInterval] = [:]
    private var lastUpperBoundMap: [String: TimeInterval] = [:]
    
    // MARK: - Public Methods
    
    /// Get URL for sound file
    private func getURL(for soundName: String) -> URL? {
        let fileManager = FileManager.default

        // 1. Documents 目录（用户导入或裁剪后的自定义音效）
        if let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            // 支持多种音频格式
            let supportedExtensions = ["mp3", "m4a", "wav", "aac"]
            for fileExtension in supportedExtensions {
                let customSoundURL = documentsDirectory.appendingPathComponent("\(soundName).\(fileExtension)")
                if fileManager.fileExists(atPath: customSoundURL.path) {
                    return customSoundURL
                }
            }
        }

        // 2. App Bundle 默认音效
        if let bundleURL = Bundle.main.url(forResource: soundName, withExtension: "mp3") {
            return bundleURL
        }

        Logger.warning("音效文件 '\(soundName)' 在Documents目录或主Bundle中均未找到", category: .soundManager)
        return nil
    }
    
    /// 获取音频Data，若开启缓存则优先返回内存数据（watchOS 优化）
    private func getSoundData(for soundName: String) -> Data? {
        // 检查内存使用百分比
        let memoryPercentage = PerformanceMonitor.getMemoryUsagePercentage()

        // 如果内存使用超过70%，只缓存小于500KB的音频
        if memoryPercentage > 70.0 {
            guard let url = getURL(for: soundName) else { return nil }
            // 检查文件大小
            if let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
               let fileSize = attributes[.size] as? Int64 {
                if fileSize > 500 * 1024 {
                    // 大文件直接从磁盘读取
                    Logger.warning("内存使用过高(\(String(format: "%.1f", memoryPercentage))%)，大文件不缓存: \(soundName)", category: .soundManager)
                    return try? Data(contentsOf: url)
                }
            }
        }

        // 检查缓存
        let key = soundName as NSString
        if let cached = soundDataCache.object(forKey: key) {
            return cached as Data
        }
        
        guard let url = getURL(for: soundName) else { return nil }

        // 避免主线程阻塞：主线程直接触发后台加载并返回 nil（回退到 URL 播放），下次命中缓存
        if Thread.isMainThread && AppConfig.useAsyncSoundLoad {
            AudioService.cacheQueue.async { [weak self] in
                guard let self = self else { return }
                if let data = try? Data(contentsOf: url) {
                    self.soundDataCache.setObject(data as NSData, forKey: key, cost: data.count)
                }
            }

            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            soundDataCache.setObject(data as NSData, forKey: key, cost: data.count)
            return data
        } catch {
            #if DEBUG
            Logger.error("读取音频失败: \(soundName), error: \(error)", category: .soundManager)
            #endif
            return nil
        }
    }
    
    /// 预热常用音效，建议在 App 启动或进入音效页面时调用
    public func prewarm(sounds: [String]) {
        guard AppConfig.enableSoundDataCache else { return }
        AudioService.cacheQueue.async { [weak self] in
            guard let self = self else { return }
            for name in sounds {
                _ = self.getSoundData(for: name)
            }
        }
    }

    /// 异步预热音效，返回完成状态
    public func prewarmAsync(sounds: [String]) async {
        guard AppConfig.enableSoundDataCache else { return }
        await withTaskGroup(of: Void.self) { group in
            for name in sounds {
                group.addTask { [weak self] in
                    guard let self = self else { return }
                    _ = self.getSoundData(for: name)
                }
            }
        }
    }

    /// 清除音频数据缓存
    public func clearSoundDataCache() {
        soundDataCache.removeAllObjects()
    }

    /// 预热音频栈：在后台初始化一次 AVAudioPlayer，避免首次播放引发的主线程阻塞
    public func warmUpAudioStack() {
        guard !didWarmUpAudioStack else { return }
        didWarmUpAudioStack = true
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            // 选择一个可用的默认音频进行初始化
            let candidate = AppConfig.defaultSounds.first ?? "2004年老电脑关机音"
            guard let url = self.getURL(for: candidate) else { return }
            do {
                let player = try AVAudioPlayer(contentsOf: url)
                player.prepareToPlay()
                // 不持有引用，不播放，仅触发底层初始化
            } catch {
                Logger.warning("预热音频栈失败: \(error.localizedDescription)", category: .soundManager)
            }
        }
    }
    
    /// Play single sound with configuration（支持回溯触发）
    public func playSound(soundName: String, config: SoundConfig) {
        // 如果正在播放同一音效，则尝试回溯逻辑
        if let player = audioPlayer,
           player.isPlaying,
           currentSoundName == soundName {

            // 取消之前的停止任务，重新计算停止时间
            mainPlayerStopTask?.cancel()

            // nil 表示回溯到开头
            guard let backtrack = config.backtrackDuration else {
                player.currentTime = config.startTime
                lastAnchorTime = config.startTime
                lastUpperBound = player.currentTime

                // 重新设置停止任务（从开头播放到结束）
                if let endTime = config.endTime {
                    let duration = endTime - config.startTime
                    let adjustedDuration = duration / config.playbackRate
                    let stopTask = DispatchWorkItem { [weak self] in
                        self?.audioPlayer?.stop()
                    }
                    mainPlayerStopTask = stopTask
                    DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration, execute: stopTask)
                }
                return
            }

            let now = player.currentTime

            // 未超过上次回溯窗口上界，仍在同一窗口内，直接回到锚点
            if now < lastUpperBound {
                player.currentTime = lastAnchorTime
                player.play()

                // 重新计算停止时间（从锚点播放到结束）
                if let endTime = config.endTime {
                    let remainingDuration = (endTime - lastAnchorTime) / config.playbackRate
                    let stopTask = DispatchWorkItem { [weak self] in
                        self?.audioPlayer?.stop()
                    }
                    mainPlayerStopTask = stopTask
                    DispatchQueue.main.asyncAfter(deadline: .now() + remainingDuration, execute: stopTask)
                }
                return
            }

            // 计算新的回溯锚点
            let anchor = max(now - backtrack, config.startTime)
            lastAnchorTime = anchor
            lastUpperBound = now

            player.currentTime = anchor
            player.play()

            // 重新计算停止时间（从新锚点播放到结束）
            if let endTime = config.endTime {
                let remainingDuration = (endTime - anchor) / config.playbackRate
                let stopTask = DispatchWorkItem { [weak self] in
                    self?.audioPlayer?.stop()
                }
                mainPlayerStopTask = stopTask
                DispatchQueue.main.asyncAfter(deadline: .now() + remainingDuration, execute: stopTask)
            }
            return
        }

        // 否则按常规逻辑全新播放（停止逻辑已在播放器就绪后、主线程执行，避免与UI竞争）
        guard let url = getURL(for: soundName) else {
            Logger.warning("无法找到音频文件: \(soundName)", category: .soundManager)
            return
        }

        // 在后台队列创建播放器和读取音频数据，避免阻塞主线程
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let player: AVAudioPlayer
                if AppConfig.enableSoundDataCache, let data = self.getSoundData(for: soundName) {
                    player = try AVAudioPlayer(data: data)
                } else {
                    player = try AVAudioPlayer(contentsOf: url)
                }
                player.delegate = self
                player.enableRate = true

                // 切回主线程完成状态绑定与播放（轻量操作）
                DispatchQueue.main.async {
                    // 播放前保持环境干净
                    self.stopAllAudio()

                    self.audioPlayer = player
                    // Apply configuration
                    self.audioPlayer?.volume = Float(config.volume)
                    self.audioPlayer?.rate = Float(config.playbackRate)

                    // 记录结束时间，用于回溯后重新计算停止时机
                    self.currentEndTime = config.endTime

                    // Handle trimming / 起始位置
                    if config.startTime > 0 {
                        self.audioPlayer?.currentTime = config.startTime
                    }

                    // 记录状态
                    self.currentSoundName = soundName
                    self.lastAnchorTime = config.startTime
                    self.lastUpperBound = config.startTime

                    self.audioPlayer?.play()

                    // Handle end time trimming
                    if let endTime = config.endTime {
                        let duration = endTime - config.startTime
                        let adjustedDuration = duration / config.playbackRate // 考虑播放速度
                        let stopTask = DispatchWorkItem { [weak self] in
                            self?.audioPlayer?.stop()
                        }
                        self.mainPlayerStopTask = stopTask
                        DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration, execute: stopTask)
                    }

                    // 保存最近播放信息
                    self.lastPlayedNames = [soundName]
                    self.lastPlayedURLs = [url]
                    self.lastPlayMode = .sequential
                    self.lastSoundConfigs = [soundName: config]
                }
            } catch {
                Logger.error("播放音频失败: \(error)", category: .soundManager)
            }
        }
    }
    
    /// Play single sound with configuration and completion
    public func playSound(soundName: String, config: SoundConfig, completion: @escaping () -> Void) {
        guard let url = getURL(for: soundName) else {
            Logger.warning("无法找到音频文件: \(soundName)", category: .soundManager)
            completion()
            return
        }

        // 后台创建播放器与读取数据，避免阻塞主线程（与无回调版本保持一致）
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let player: AVAudioPlayer
                if AppConfig.enableSoundDataCache, let data = self.getSoundData(for: soundName) {
                    player = try AVAudioPlayer(data: data)
                } else {
                    player = try AVAudioPlayer(contentsOf: url)
                }
                player.delegate = self
                player.enableRate = true

                DispatchQueue.main.async {
                    // 绑定状态并开始播放（轻量）
                    self.audioPlayer = player
                    self.audioPlayer?.volume = Float(config.volume)
                    self.audioPlayer?.rate = Float(config.playbackRate)
                    self.currentEndTime = config.endTime
                    if config.startTime > 0 { self.audioPlayer?.currentTime = config.startTime }
                    self.audioPlayer?.play()

                    let totalDuration = (config.endTime ?? (self.audioPlayer?.duration ?? 0)) - config.startTime
                    let adjusted = totalDuration / config.playbackRate

                    if config.endTime != nil {
                        self.scheduleDelay(adjusted) { [weak self] in
                            self?.audioPlayer?.stop()
                            completion()
                        }
                    } else {
                        if AppConfig.useTaskTimer {
                            self.scheduleTask(after: adjusted) { completion() }
                        } else {
                            self.scheduleDelay(adjusted) { completion() }
                        }
                    }

                    // 保存最近播放信息
                    self.lastPlayedNames = [soundName]
                    self.lastPlayedURLs = [url]
                    self.lastPlayMode = .sequential
                    self.lastSoundConfigs = [soundName: config]
                }
            } catch {
                Logger.error("播放音频失败: \(error)", category: .soundManager)
                DispatchQueue.main.async { completion() }
            }
        }
    }
    

    
    /// Stop all audio playback - 优化版本，减少UI卡顿
    public func stopAllAudio() {
        // 立即停止关键播放器，确保音频立即停止
        audioPlayer?.stop()
        audioPlayer = nil

        // 立即取消主播放器的停止任务
        mainPlayerStopTask?.cancel()
        mainPlayerStopTask = nil

        // 立即使所有排队的顺序播放任务失效
        sequenceToken = UUID()

        // 立即重置关键状态
        currentPlayingURLs = nil
        currentSoundName = nil
        currentEndTime = nil

        // 立即停止多播放器（这些需要立即停止以确保音频停止）
        multiAudioPlayers.forEach { $0.stop() }
        audioPlayers.forEach { $0.stop() }

        // 异步处理清理操作，避免阻塞UI
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }

            // 清理播放器数组
            self.multiAudioPlayers.removeAll()
            self.audioPlayers.removeAll()

            // 取消所有定时器
            self.activeTimers.forEach { $0.invalidate() }
            self.activeTimers.removeAll()

            // 取消 Task 型计时器
            self.activeTasks.forEach { $0.cancel() }
            self.activeTasks.removeAll()

            // 重置回溯状态
            self.lastAnchorTime = 0
            self.lastUpperBound = 0

            // 清理播放器映射关系
            self.playerNameMap.removeAll()
            self.namePlayerMap.removeAll()

            // 强制垃圾回收（在内存紧张时）
            if ProcessInfo.processInfo.environment["MEMORY_PRESSURE"] != nil {
                // 在内存压力下，清理更多资源
                self.lastPlayedNames.removeAll()
                self.lastPlayedURLs.removeAll()
                self.lastSoundConfigs.removeAll()
                self.lastAnchorMap.removeAll()
                self.lastUpperBoundMap.removeAll()
            }
        }

        // 注意：不要重置 currentSequentialIndex，以保持顺序播放的连续性
    }
    
    /// Check if audio is currently playing
    public func isPlaying() -> Bool {
        return audioPlayer?.isPlaying == true ||
               multiAudioPlayers.contains { $0.isPlaying } ||
               audioPlayers.contains { $0.isPlaying }
    }

    /// 获取音效的总时长
    public func getSoundDuration(for soundName: String) -> TimeInterval {
        guard let url = Bundle.main.url(forResource: soundName, withExtension: "mp3") else {
            return 1.0 // 默认时长
        }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            return player.duration
        } catch {
            Logger.error("无法获取音效时长: \(soundName), 错误: \(error)", category: .soundManager)
            return 1.0 // 默认时长
        }
    }
    
    /// 回溯当前播放的音效，不触发音效切换
    /// 此方法会对所有正在播放的音效应用回溯逻辑
    public func backtrackCurrentSound() {
        // 同时播放模式也应按各自配置回溯，不再整体重播
        var hasAppliedBacktrack = false
        
        // 处理主播放器
        if let player = audioPlayer, player.isPlaying, let soundName = currentSoundName {
            applyBacktrackToPlayer(player, soundName: soundName)
            hasAppliedBacktrack = true
        }
        
        // 处理多播放器模式下的所有播放器
        for player in multiAudioPlayers where player.isPlaying {
            if let soundName = playerNameMap[player] {
                applyBacktrackToPlayer(player, soundName: soundName)
                hasAppliedBacktrack = true
            }
        }
        
        // 如果没有应用任何回溯，打印调试信息
        if !hasAppliedBacktrack {
            Logger.warning("没有找到可回溯的音效播放器", category: .soundManager)
        }
    }
    
    /// 对指定播放器应用回溯逻辑
    /// - Parameters:
    ///   - player: 要应用回溯的音频播放器
    ///   - soundName: 音效名称，用于日志记录
    private func applyBacktrackToPlayer(_ player: AVAudioPlayer, soundName: String) {
        // 取每个音效独立配置的回溯时长
        let cfg = lastSoundConfigs[soundName]
        let backtrack = cfg?.backtrackDuration // nil = 回溯到开头；0 = 不回溯

        // 若配置指定 0，表示保持当前，不做回溯
        if backtrack == 0 { return }

        // 起始裁剪位置（若有）
        let startTime: TimeInterval = cfg?.startTime ?? 0.0

        // 目标锚点
        let now = player.currentTime
        let anchor: TimeInterval = {
            if let b = backtrack { return max(now - b, startTime) }
            // backtrack == nil → 回到开头
            return startTime
        }()

        // --- 主播放器（单音效）使用锚点/窗口机制 ---
        if player === audioPlayer {
            // 选择正确锚点：窗口内重复点击保持上次锚点
            let anchorToUse: TimeInterval = {
                if now < lastUpperBound { return lastAnchorTime } else { return anchor }
            }()

            // 若进入新窗口，更新记录
            if now >= lastUpperBound {
                lastAnchorTime = anchorToUse
                lastUpperBound = now
            }

            // 取消旧停止任务，重新计算剩余时长
            mainPlayerStopTask?.cancel()

            // 计算新的剩余时长
            let endTime = currentEndTime ?? player.duration
            if endTime > anchorToUse {
                let remainingDuration = (endTime - anchorToUse) / Double(player.rate)
                let stopTask = DispatchWorkItem { [weak self] in
                    self?.audioPlayer?.stop()
                }
                mainPlayerStopTask = stopTask
                DispatchQueue.main.asyncAfter(deadline: .now() + remainingDuration, execute: stopTask)
            }

            // 应用回溯
            player.currentTime = anchorToUse
            if !player.isPlaying { player.play() }
            return
        }

        // --- 多播放器场景：使用独立配置的 backtrackDuration + 窗口防抖 ---
        let lastUpper = lastUpperBoundMap[soundName] ?? 0
        if now >= lastUpper {
            // 新窗口，记录
            lastAnchorMap[soundName] = anchor
            lastUpperBoundMap[soundName] = now
        } else {
            // 仍在窗口内，使用已有锚点，避免叠加
            if let prevAnchor = lastAnchorMap[soundName] {
                player.currentTime = prevAnchor
                if !player.isPlaying { player.play() }
                return
            }
        }

        player.currentTime = anchor
        if !player.isPlaying { player.play() }
    }
    

    
    // MARK: - New API: 支持实例化音效名
    /// Play multiple sounds with explicit instance names to匹配配置
    public func playSounds(names: [String], urls: [URL], playMode: SoundPlayMode, soundConfigs: [String: SoundConfig]) {
        // 如果只有一个音效，直接使用单音效播放逻辑，以支持回溯
        if names.count == 1 {
            let name = names[0]
            let config = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            playSound(soundName: name, config: config)
            return
        }

        guard names.count == urls.count else {
            Logger.error("playSounds 参数数量不匹配", category: .soundManager)
            return
        }

        currentPlayingURLs = urls

        // 播放前停止所有之前的音效
        stopAllAudio()
        
        // 通用：保存最近播放信息
        lastPlayedNames = names
        lastPlayedURLs = urls
        lastPlayMode = playMode
        lastSoundConfigs = soundConfigs
        
        // 为每个图片/场景创建一个唯一键，用于跟踪顺序播放的索引
        let contextKey = names.joined()
        
        switch playMode {
        case .sequential:
            // 顺序播放模式：每次只播放一个音效
            sequenceToken = UUID()
            
            // 获取当前要播放的索引
            let currentIndex = currentSequentialIndex[contextKey] ?? 0
            
            // 确保索引在有效范围内
            let validIndex = currentIndex % names.count
            
            // 播放当前索引的音效
            let name = names[validIndex]
            let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            
            // 使用配置中的 baseSoundName 获取正确的 URL
            guard let actualURL = getURL(for: cfg.baseSoundName) else {
                Logger.warning("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
                return
            }
            
            do {
                let player = try AVAudioPlayer(contentsOf: actualURL)
                player.delegate = self
                player.enableRate = true
                player.volume = Float(cfg.volume)
                player.rate = Float(cfg.playbackRate)
                if cfg.startTime > 0 { player.currentTime = cfg.startTime }
                audioPlayer = player
                // 更新回溯相关状态
                currentSoundName = name
                lastAnchorTime = cfg.startTime
                lastUpperBound = cfg.startTime
                currentEndTime = cfg.endTime
                player.play()

                // 设置结束时间定时器
                if let endTime = cfg.endTime {
                    let duration = endTime - cfg.startTime
                    let adjustedDuration = duration / cfg.playbackRate
                    let stopTask = DispatchWorkItem { [weak self] in
                        self?.audioPlayer?.stop()
                    }
                    mainPlayerStopTask = stopTask
                    DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration, execute: stopTask)
                }
                
                // 更新下一个要播放的索引
                currentSequentialIndex[contextKey] = (validIndex + 1) % names.count
            } catch {
                Logger.error("顺序播放音频失败: \(error)", category: .soundManager)
            }
            
        case .random:
            playRandomly(names: names, urls: urls, soundConfigs: soundConfigs)
        }
    }
    
    /// Play multiple sounds with explicit instance names and completion callback
    public func playSounds(names: [String], urls: [URL], playMode: SoundPlayMode, soundConfigs: [String: SoundConfig], completion: @escaping () -> Void) {
        // 如果只有一个音效，直接使用单音效播放逻辑，以支持回溯
        if names.count == 1 {
            let name = names[0]
            let config = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            playSound(soundName: name, config: config) {
                completion()
            }
            return
        }
        
        guard names.count == urls.count else {
            Logger.error("playSounds 参数数量不匹配", category: .soundManager)
            completion()
            return
        }

        currentPlayingURLs = urls

        // 播放前停止所有之前的音效
        stopAllAudio()

        // 通用：保存最近播放信息
        lastPlayedNames = names
        lastPlayedURLs = urls
        lastPlayMode = playMode
        lastSoundConfigs = soundConfigs
        
        // 为每个图片/场景创建一个唯一键，用于跟踪顺序播放的索引
        let contextKey = names.joined()
        
        switch playMode {
        case .sequential:
            // 顺序播放模式：每次只播放一个音效
            sequenceToken = UUID()
            
            // 获取当前要播放的索引
            let currentIndex = currentSequentialIndex[contextKey] ?? 0
            
            // 确保索引在有效范围内
            let validIndex = currentIndex % names.count
            
            // 播放当前索引的音效
            let name = names[validIndex]
            let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            
            // 使用配置中的 baseSoundName 获取正确的 URL
            guard let actualURL = getURL(for: cfg.baseSoundName) else {
                Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
                completion()
                return
            }
            
            do {
                let player = try AVAudioPlayer(contentsOf: actualURL)
                player.delegate = self
                player.enableRate = true
                player.volume = Float(cfg.volume)
                player.rate = Float(cfg.playbackRate)
                if cfg.startTime > 0 { player.currentTime = cfg.startTime }
                audioPlayer = player
                // 更新回溯相关状态
                currentSoundName = name
                lastAnchorTime = cfg.startTime
                lastUpperBound = cfg.startTime
                currentEndTime = cfg.endTime
                player.play()

                let totalDuration = (cfg.endTime ?? (audioPlayer?.duration ?? 0)) - cfg.startTime

                if cfg.endTime != nil {
                    let adjusted = totalDuration / cfg.playbackRate
                    scheduleDelay(adjusted) { [weak self] in
                        self?.audioPlayer?.stop()
                        completion()
                    }
                } else {
                    let adjusted = totalDuration / cfg.playbackRate
                    if AppConfig.useTaskTimer {
                        scheduleTask(after: adjusted) {
                            completion()
                        }
                    } else {
                        scheduleDelay(adjusted) {
                            completion()
                        }
                    }
                }
                
                // 更新下一个要播放的索引
                currentSequentialIndex[contextKey] = (validIndex + 1) % names.count
            } catch {
                Logger.error("顺序播放音频失败: \(error)", category: .soundManager)
                completion()
            }
            
        case .random:
            playRandomly(names: names, urls: urls, soundConfigs: soundConfigs, completion: completion)
        }
    }
    
    // MARK: - Helper for new API
    private func playSingle(name: String, url: URL, soundConfigs: [String: SoundConfig]) {
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            return
        }

        // 全新播放前，停止所有音频，确保环境干净
        stopAllAudio()
        
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: actualURL)
            audioPlayer?.delegate = self
            audioPlayer?.enableRate = true
            audioPlayer?.volume = Float(cfg.volume)
            audioPlayer?.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 {
                audioPlayer?.currentTime = cfg.startTime
            }
            audioPlayer?.play()

            // 统一计算播放时长，后续分支共用
            let baseDuration: TimeInterval = (cfg.endTime ?? audioPlayer?.duration ?? 0) - cfg.startTime
            let adjustedDuration = baseDuration / cfg.playbackRate
            
            if let _ = cfg.endTime {
                // 指定结束时间，计时后停止
                scheduleDelay(adjustedDuration) { [weak self] in
                    self?.audioPlayer?.stop()
                }
            }
            // 若未指定结束时间，则完整播放直至自然结束，无需额外计时器
        } catch {
            Logger.error("播放音频失败: \(error)", category: .soundManager)
        }
    }
    
    private func playSingle(name: String, url: URL, soundConfigs: [String: SoundConfig], completion: @escaping () -> Void) {
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            completion()
            return
        }

        // 全新播放前，停止所有音频，确保环境干净
        stopAllAudio()

        do {
            audioPlayer = try AVAudioPlayer(contentsOf: actualURL)
            audioPlayer?.delegate = self
            audioPlayer?.enableRate = true
            audioPlayer?.volume = Float(cfg.volume)
            audioPlayer?.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 {
                audioPlayer?.currentTime = cfg.startTime
            }
            audioPlayer?.play()

            // 统一计算播放时长，后续分支共用
            let baseDuration: TimeInterval = (cfg.endTime ?? audioPlayer?.duration ?? 0) - cfg.startTime
            let adjustedDuration = baseDuration / cfg.playbackRate
            
            if let _ = cfg.endTime {
                // 指定结束时间，计时后停止
                scheduleDelay(adjustedDuration) { [weak self] in
                    self?.audioPlayer?.stop()
                    completion()
                }
            }
            // 若未指定结束时间，则完整播放直至自然结束，无需额外计时器
        } catch {
            Logger.error("播放音频失败: \(error)", category: .soundManager)
            completion()
        }
    }

    private func playSequentially(names: [String], urls: [URL], index: Int, soundConfigs: [String: SoundConfig], token: UUID) {
        // 如果 token 不匹配，说明已被取消
        guard token == sequenceToken else { return }
        guard index < urls.count else { return }
        
        let name = names[index]
        _ = urls[index]
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)

        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: actualURL)
            player.delegate = self
            player.enableRate = true
            player.volume = Float(cfg.volume)
            player.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 { player.currentTime = cfg.startTime }
            audioPlayers.append(player)
            player.play()

            let duration = cfg.endTime.map { $0 - cfg.startTime } ?? (player.duration - cfg.startTime)
            let adjustedDuration = duration / cfg.playbackRate // 考虑播放速度
            if AppConfig.useTaskTimer {
                scheduleTask(after: adjustedDuration) { [weak self, weak player] in
                    player?.stop()
                    guard let self else { return }
                    self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token)
                }
            } else {
                scheduleDelay(adjustedDuration) { [weak self, weak player] in
                    player?.stop()
                    guard let self else { return }
                    self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token)
                }
            }
        } catch {
            Logger.error("播放音频失败: \(error)", category: .soundManager)
        }
    }

    // MARK: - Random Playback Methods

    private func playRandomly(names: [String], urls: [URL], soundConfigs: [String: SoundConfig]) {
        guard !names.isEmpty, !urls.isEmpty else { return }
        
        // 如果当前有音效在播放，并且是随机选择的音效之一，应用回溯逻辑
        if let player = audioPlayer, player.isPlaying, let currentName = currentSoundName, names.contains(currentName) {
            let cfg = soundConfigs[currentName] ?? SoundConfig(id: UUID().uuidString, baseSoundName: currentName)
            
            // 应用回溯逻辑
            if let backtrack = cfg.backtrackDuration {
                // 取消之前的停止任务
                mainPlayerStopTask?.cancel()
                
                let now = player.currentTime
                // 计算新的回溯锚点
                let anchor = max(now - backtrack, cfg.startTime)
                lastAnchorTime = anchor
                lastUpperBound = now
                
                player.currentTime = anchor
                player.play()
                
                // 重新计算停止时间（从新锚点播放到结束）
                if let endTime = cfg.endTime {
                    let baseDuration = endTime - cfg.startTime
                    let adjustedDuration = baseDuration / cfg.playbackRate
                    let stopTask = DispatchWorkItem { [weak self, weak player] in
                        guard let player = player, player.isPlaying else { return }
                        player.stop()
                        self?.currentSoundName = nil
                    }
                    mainPlayerStopTask = stopTask
                    scheduleDelay(adjustedDuration) { stopTask.perform() }
                }
            } else {
                // 回溯到开头
                // 取消之前的停止任务
                mainPlayerStopTask?.cancel()
                
                player.currentTime = cfg.startTime
                lastAnchorTime = cfg.startTime
                lastUpperBound = player.currentTime
                
                player.play()
                
                // 重新计算停止时间（从开头播放到结束）
                if let endTime = cfg.endTime {
                    let baseDuration = endTime - cfg.startTime
                    let adjustedDuration = baseDuration / cfg.playbackRate
                    let stopTask = DispatchWorkItem { [weak self, weak player] in
                        guard let player = player, player.isPlaying else { return }
                        player.stop()
                        self?.currentSoundName = nil
                    }
                    mainPlayerStopTask = stopTask
                    scheduleDelay(adjustedDuration) { stopTask.perform() }
                }
            }
            
            return
        }
        
        // 如果没有正在播放的音效，或者正在播放的不是随机选择的音效之一，随机选择一个新的音效播放
        let randomIndex = Int.random(in: 0..<names.count)
        let name = names[randomIndex]
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)

        // 记录最后一次随机播放的音效
        lastRandomName = name
        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            return
        }
        lastRandomURL = actualURL

        do {
            let player = try AVAudioPlayer(contentsOf: actualURL)
            player.delegate = self
            player.enableRate = true
            player.volume = Float(cfg.volume)
            player.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 { player.currentTime = cfg.startTime }
            
            // 停止当前播放的音效
            audioPlayer?.stop()
            audioPlayer = player
            
            // 记录当前播放的音效名称，用于回溯逻辑
            currentSoundName = name
            lastAnchorTime = cfg.startTime
            lastUpperBound = cfg.startTime
            
            player.play()

            let totalDuration = (cfg.endTime ?? (player.duration - cfg.startTime))
            let adjustedDuration = totalDuration / cfg.playbackRate
            
            if cfg.endTime != nil {
                let stopTask = DispatchWorkItem { [weak self, weak player] in
                    guard let player = player, player.isPlaying else { return }
                    player.stop()
                    self?.currentSoundName = nil
                }
                mainPlayerStopTask = stopTask
                scheduleDelay(adjustedDuration) { stopTask.perform() }
            }
        } catch {
            Logger.error("随机播放音频失败: \(error)", category: .soundManager)
        }
    }

    private func playRandomly(names: [String], urls: [URL], soundConfigs: [String: SoundConfig], completion: @escaping () -> Void) {
        guard !names.isEmpty, !urls.isEmpty else {
            completion()
            return
        }

        // 如果当前有音效在播放，并且是随机选择的音效之一，应用回溯逻辑
        if let player = audioPlayer, player.isPlaying, let currentName = currentSoundName, names.contains(currentName) {
            let cfg = soundConfigs[currentName] ?? SoundConfig(id: UUID().uuidString, baseSoundName: currentName)
            
            // 应用回溯逻辑
            if let backtrack = cfg.backtrackDuration {
                // 取消之前的定时器
                activeTimers.forEach { $0.invalidate() }
                activeTimers.removeAll()
                
                let now = player.currentTime
                // 计算新的回溯锚点
                let anchor = max(now - backtrack, cfg.startTime)
                lastAnchorTime = anchor
                lastUpperBound = now
                
                player.currentTime = anchor
                player.play()
                
                // 重新计算停止时间（从新锚点播放到结束）
                if let endTime = cfg.endTime {
                    let remainingDuration = (endTime - anchor) / cfg.playbackRate
                    let playerRef = player // 创建强引用
                    scheduleDelay(remainingDuration) { [weak self] in
                        guard self?.audioPlayer === playerRef, playerRef.isPlaying else { return }
                        playerRef.stop()
                        self?.currentSoundName = nil
                    }
                } else {
                    // 如果没有设置结束时间，等待音频自然播放完成
                    let adjustedDuration = (player.duration - anchor) / cfg.playbackRate
                    scheduleDelay(adjustedDuration) {
                        completion()
                    }
                }
            } else {
                // 回溯到开头
                // 取消之前的定时器
                activeTimers.forEach { $0.invalidate() }
                activeTimers.removeAll()
                
                player.currentTime = cfg.startTime
                lastAnchorTime = cfg.startTime
                lastUpperBound = player.currentTime
                
                player.play()
                
                // 重新计算停止时间（从开头播放到结束）
                if let endTime = cfg.endTime {
                    let duration = endTime - cfg.startTime
                    let adjustedDuration = duration / cfg.playbackRate
                    let playerRef = player // 创建强引用
                    scheduleDelay(adjustedDuration) { [weak self] in
                        guard self?.audioPlayer === playerRef, playerRef.isPlaying else { return }
                        playerRef.stop()
                        self?.currentSoundName = nil
                    }
                } else {
                    // 如果没有设置结束时间，等待音频自然播放完成
                    let adjustedDuration = (player.duration - cfg.startTime) / cfg.playbackRate
                    scheduleDelay(adjustedDuration) {
                        completion()
                    }
                }
            }
            
            return
        }
        
        // 如果没有正在播放的音效，或者正在播放的不是随机选择的音效之一，随机选择一个新的音效播放
        let randomIndex = Int.random(in: 0..<names.count)
        let name = names[randomIndex]
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)

        // 记录最后一次随机播放的音效
        lastRandomName = name
        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            completion()
            return
        }
        lastRandomURL = actualURL

        do {
            let player = try AVAudioPlayer(contentsOf: actualURL)
            player.delegate = self
            player.enableRate = true
            player.volume = Float(cfg.volume)
            player.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 { player.currentTime = cfg.startTime }
            
            // 停止当前播放的音效
            audioPlayer?.stop()
            audioPlayer = player
            
            // 记录当前播放的音效名称，用于回溯逻辑
            currentSoundName = name
            lastAnchorTime = cfg.startTime
            lastUpperBound = cfg.startTime
            
            player.play()

            let totalDuration = (cfg.endTime ?? (player.duration - cfg.startTime))
            let adjustedDuration = totalDuration / cfg.playbackRate
            
            if cfg.endTime != nil {
                let stopTask = DispatchWorkItem { [weak self, weak player] in
                    guard let player = player, player.isPlaying else { return }
                    player.stop()
                    self?.currentSoundName = nil
                }
                mainPlayerStopTask = stopTask
                scheduleDelay(adjustedDuration) { stopTask.perform() }
            }
        } catch {
            Logger.error("随机播放音频失败: \(error)", category: .soundManager)
            completion()
        }
    }

    private func playSequentially(names: [String], urls: [URL], index: Int, soundConfigs: [String: SoundConfig], token: UUID, completion: @escaping () -> Void) {
        // 如果 token 不匹配，说明已被取消
        guard token == sequenceToken else { 
            completion()
            return 
        }
        guard index < urls.count else { 
            completion()
            return 
        }
        
        let name = names[index]
        _ = urls[index]
        let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)

        // 如果当前有音效在播放，并且是当前要播放的音效，应用回溯逻辑
        if let player = audioPlayer, player.isPlaying, currentSoundName == name {
            // 应用回溯逻辑
            if let backtrack = cfg.backtrackDuration {
                // 取消之前的定时器
                activeTimers.forEach { $0.invalidate() }
                activeTimers.removeAll()
                
                let now = player.currentTime
                // 计算新的回溯锚点
                let anchor = max(now - backtrack, cfg.startTime)
                lastAnchorTime = anchor
                lastUpperBound = now
                
                player.currentTime = anchor
                player.play()
                
                // 重新计算停止时间（从新锚点播放到结束）
                if let endTime = cfg.endTime {
                    let remainingDuration = (endTime - anchor) / cfg.playbackRate
                    let timer = Timer.scheduledTimer(withTimeInterval: remainingDuration, repeats: false) { [weak self, weak player] _ in
                        // 在播放完有效区间后停止当前音轨
                        player?.stop()
                        guard let self else { 
                            completion()
                            return 
                        }
                        self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token, completion: completion)
                    }
                    activeTimers.append(timer)
                } else {
                    // 如果没有设置结束时间，等待音频自然播放完成
                    let adjustedDuration = (player.duration - anchor) / cfg.playbackRate
                    let timer = Timer.scheduledTimer(withTimeInterval: adjustedDuration, repeats: false) { [weak self] _ in
                        guard let self else { 
                            completion()
                            return 
                        }
                        self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token, completion: completion)
                    }
                    activeTimers.append(timer)
                }
                
                return
            } else {
                // 回溯到开头
                // 取消之前的定时器
                activeTimers.forEach { $0.invalidate() }
                activeTimers.removeAll()
                
                player.currentTime = cfg.startTime
                lastAnchorTime = cfg.startTime
                lastUpperBound = player.currentTime
                
                player.play()
                
                // 重新计算停止时间（从开头播放到结束）
                if let endTime = cfg.endTime {
                    let duration = endTime - cfg.startTime
                    let adjustedDuration = duration / cfg.playbackRate
                    let timer = Timer.scheduledTimer(withTimeInterval: adjustedDuration, repeats: false) { [weak self, weak player] _ in
                        // 在播放完有效区间后停止当前音轨
                        player?.stop()
                        guard let self else { 
                            completion()
                            return 
                        }
                        self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token, completion: completion)
                    }
                    activeTimers.append(timer)
                } else {
                    // 如果没有设置结束时间，等待音频自然播放完成
                    let adjustedDuration = (player.duration - cfg.startTime) / cfg.playbackRate
                    let timer = Timer.scheduledTimer(withTimeInterval: adjustedDuration, repeats: false) { [weak self] _ in
                        guard let self else { 
                            completion()
                            return 
                        }
                        self.playSequentially(names: names, urls: urls, index: index + 1, soundConfigs: soundConfigs, token: token, completion: completion)
                    }
                    activeTimers.append(timer)
                }
                
                return
            }
        }

        // 使用配置中的 baseSoundName 获取正确的 URL
        guard let actualURL = getURL(for: cfg.baseSoundName) else {
            Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
            completion()
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: actualURL)
            player.delegate = self
            player.enableRate = true
            player.volume = Float(cfg.volume)
            player.rate = Float(cfg.playbackRate)
            if cfg.startTime > 0 { player.currentTime = cfg.startTime }
            
            // 停止当前播放的音效
            audioPlayer?.stop()
            audioPlayer = player
            audioPlayers.append(player)
            
            // 记录当前播放的音效名称，用于回溯逻辑
            currentSoundName = name
            lastAnchorTime = cfg.startTime
            lastUpperBound = cfg.startTime
            
            player.play()

            let totalDuration = (cfg.endTime ?? (player.duration - cfg.startTime))
            let adjustedDuration = totalDuration / cfg.playbackRate
            
            if cfg.endTime != nil {
                let stopTask = DispatchWorkItem { [weak self, weak player] in
                    guard let player = player, player.isPlaying else { return }
                    player.stop()
                    self?.currentSoundName = nil
                }
                mainPlayerStopTask = stopTask
                scheduleDelay(adjustedDuration) { stopTask.perform() }
            }
        } catch {
            Logger.error("播放音频失败: \(error)", category: .soundManager)
            completion()
        }
    }

    @preconcurrency private func playSimultaneously(names: [String], urls: [URL], soundConfigs: [String: SoundConfig]) {
        // 清理旧的播放器
        multiAudioPlayers.forEach { $0.stop() }
        multiAudioPlayers.removeAll()
        
        // 清理映射关系
        playerNameMap.removeAll()
        namePlayerMap.removeAll()
        
        // 检查是否有正在播放的相同音效，应用回溯逻辑
        for (idx, _) in urls.enumerated() {
            let name = names[idx]
            let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            
            // 如果已经有相同音效正在播放，应用回溯逻辑
            if let existingPlayer = namePlayerMap[name], existingPlayer.isPlaying {
                // 应用回溯逻辑
                if let backtrack = cfg.backtrackDuration {
                    let now = existingPlayer.currentTime
                    // 计算新的回溯锚点
                    let anchor = max(now - backtrack, cfg.startTime)
                    existingPlayer.currentTime = anchor
                    existingPlayer.play()
                    
                    // 重新计算停止时间（从新锚点播放到结束）
                    if let endTime = cfg.endTime {
                        let remainingDuration = (endTime - anchor) / cfg.playbackRate
                        let player = existingPlayer // 创建强引用
                        DispatchQueue.main.asyncAfter(deadline: .now() + remainingDuration) { [weak self] in
                            guard self?.multiAudioPlayers.contains(player) == true else { return }
                            player.stop()
                        }
                    }
                } else {
                    // 回溯到开头
                    existingPlayer.currentTime = cfg.startTime
                    existingPlayer.play()
                    
                    // 重新计算停止时间（从开头播放到结束）
                    if let endTime = cfg.endTime {
                        let duration = endTime - cfg.startTime
                        let adjustedDuration = duration / cfg.playbackRate
                        let player = existingPlayer // 创建强引用
                        DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration) { [weak self] in
                            guard self?.multiAudioPlayers.contains(player) == true else { return }
                            player.stop()
                        }
                    }
                }
            } else {
                // 创建新的播放器
                // 使用配置中的 baseSoundName 获取正确的 URL
                guard let actualURL = getURL(for: cfg.baseSoundName) else {
                    Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager)
                    continue
                }
                
                do {
                    let player = try AVAudioPlayer(contentsOf: actualURL)
                    player.delegate = self
                    player.enableRate = true
                    player.volume = Float(cfg.volume)
                    player.rate = Float(cfg.playbackRate)
                    if cfg.startTime > 0 { player.currentTime = cfg.startTime }
                    multiAudioPlayers.append(player)
                    player.play()
                    
                    // 保存播放器与音效名称的映射关系
                    playerNameMap[player] = name
                    namePlayerMap[name] = player
                    
                    if let endTime = cfg.endTime {
                        let duration = endTime - cfg.startTime
                        let adjustedDuration = duration / cfg.playbackRate // 考虑播放速度
                        let playerRef = player // 创建强引用
                        DispatchQueue.main.asyncAfter(deadline: .now() + adjustedDuration) { [weak self] in
                            guard self?.multiAudioPlayers.contains(playerRef) == true else { return }
                            playerRef.stop()
                        }
                    }
                } catch {
                    Logger.error("播放音频失败: \(error)", category: .soundManager)
                }
            }
        }
    }
    
    @preconcurrency private func playSimultaneously(names: [String], urls: [URL], soundConfigs: [String: SoundConfig], completion: @escaping () -> Void) {
        var didSchedule = false
        let group = DispatchGroup()

        for (idx, _) in urls.enumerated() {
            let name = names[idx]
            let cfg = soundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)

            // 已有播放器：应用回溯或保持播放
            if let existingPlayer = namePlayerMap[name], existingPlayer.isPlaying {
                didSchedule = true
                group.enter()

                // 计算应回溯到的位置
                if let back = cfg.backtrackDuration {
                    let anchor = max(existingPlayer.currentTime - back, cfg.startTime)
                    existingPlayer.currentTime = anchor
                } else {
                    existingPlayer.currentTime = cfg.startTime
                }
                existingPlayer.play()

                // 预计剩余时长
                let remaining: TimeInterval = {
                    if let end = cfg.endTime {
                        return (end - existingPlayer.currentTime) / cfg.playbackRate
                    } else {
                        return (existingPlayer.duration - existingPlayer.currentTime) / cfg.playbackRate
                    }
                }()

                let playerRef = existingPlayer
                scheduleDelay(remaining) { [weak self] in
                    guard self?.multiAudioPlayers.contains(playerRef) == true else { group.leave(); return }
                    playerRef.stop();
                    group.leave()
                }
                continue
            }

            // 新建播放器
            guard let actualURL = getURL(for: cfg.baseSoundName) else { Logger.error("无法找到音频文件: \(cfg.baseSoundName)", category: .soundManager); continue }
            do {
                let player = try AVAudioPlayer(contentsOf: actualURL)
                player.delegate = self
                player.enableRate = true
                player.volume = Float(cfg.volume)
                player.rate = Float(cfg.playbackRate)
                if cfg.startTime > 0 { player.currentTime = cfg.startTime }
                multiAudioPlayers.append(player)
                playerNameMap[player] = name
                namePlayerMap[name] = player
                player.play()

                didSchedule = true
                group.enter()

                let duration: TimeInterval
                if let end = cfg.endTime {
                    duration = (end - cfg.startTime) / cfg.playbackRate
                } else {
                    duration = (player.duration - cfg.startTime) / cfg.playbackRate
                }

                let playerRef = player
                scheduleDelay(duration) { [weak self] in
                    guard self?.multiAudioPlayers.contains(playerRef) == true else { group.leave(); return }
                    playerRef.stop(); group.leave()
                }
            } catch {
                Logger.error("播放音频失败: \(error)", category: .soundManager)
            }
        }

        if !didSchedule {
            completion();
            return
        }

        group.notify(queue: .main) {
            completion()
        }
    }
    
    // MARK: - Private Methods
    

    
    private func getSoundName(from url: URL) -> String {
        return url.lastPathComponent.replacingOccurrences(of: ".mp3", with: "")
    }

    /// 重新播放最近一次的音效集合
    public func replayLastSounds() {
        guard !lastPlayedNames.isEmpty else { return }
        if lastPlayMode == .random, let rn = lastRandomName {
            let cfg = lastSoundConfigs[rn] ?? SoundConfig(id: UUID().uuidString, baseSoundName: rn)
            playSound(soundName: rn, config: cfg)
            return
        }
        if lastPlayedNames.count == 1 {
            let name = lastPlayedNames[0]
            let cfg = lastSoundConfigs[name] ?? SoundConfig(id: UUID().uuidString, baseSoundName: name)
            playSound(soundName: name, config: cfg)
        } else {
            // 如果是顺序播放模式，回退索引以重播刚结束的音效
            if lastPlayMode == .sequential {
                let contextKey = lastPlayedNames.joined()
                if let cur = currentSequentialIndex[contextKey] {
                    let newIndex = (cur - 1 + lastPlayedNames.count) % lastPlayedNames.count
                    currentSequentialIndex[contextKey] = newIndex
                } else {
                    // 如果没有现有索引，回退至最后一个音效
                    currentSequentialIndex[contextKey] = lastPlayedNames.isEmpty ? 0 : (lastPlayedNames.count - 1)
                }
            }
            playSounds(names: lastPlayedNames, urls: lastPlayedURLs, playMode: lastPlayMode, soundConfigs: lastSoundConfigs)
        }
    }

    // MARK: - Task Timer Helper
    @discardableResult
    private func scheduleTask(after seconds: Double, _ action: @escaping @Sendable () -> Void) -> Task<Void, Never> {
        let task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            action()
        }
        activeTasks.append(task)
        return task
    }

    /// 在 `useTaskTimer` 打开时使用 `Task.sleep`，否则退回 `Timer`。返回值可忽略。
    @discardableResult
    private func scheduleDelay(_ seconds: Double, _ action: @escaping @Sendable () -> Void) -> Any {
        if AppConfig.useTaskTimer {
            return scheduleTask(after: seconds, action)
        } else {
            let timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { _ in action() }
            activeTimers.append(timer)
            return timer
        }
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        // Remove finished players from arrays
        if let index = multiAudioPlayers.firstIndex(of: player) {
            multiAudioPlayers.remove(at: index)
        }
        if let index = audioPlayers.firstIndex(of: player) {
            audioPlayers.remove(at: index)
        }

        // 如果是主播放器，重置回溯状态
        if player == audioPlayer {
            currentSoundName = nil
            lastAnchorTime = 0
            lastUpperBound = 0
            currentEndTime = nil
        }
    }
} 

