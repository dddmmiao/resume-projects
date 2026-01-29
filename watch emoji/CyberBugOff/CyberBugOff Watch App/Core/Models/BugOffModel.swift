import Foundation
import SwiftUI
import AVFoundation
import CoreMotion
import Combine
#if os(watchOS)
import WatchKit
#endif

// ImageTriggerMode has been moved to DataModels.swift

// All data models have been moved to DataModels.swift

// MARK: - Main Bug Off Model
/// BugOffModel - 中央状态管理器
/// 
/// 设计模式: Facade Pattern + ObservableObject
/// 职责: 作为应用的状态枢纽，协调 ImageManager、SoundManager、TriggerManager
/// 对 UI 层提供统一的数据访问接口，内部将具体逻辑委托给对应的 Manager
class BugOffModel: NSObject, ObservableObject {
    
    // MARK: - Manager Dependencies
    let imageManager = ImageManager()
    let soundManager = SoundManager()
    let triggerManager = TriggerManager()
    
    // MARK: - Backward Compatibility Properties
    // These properties maintain compatibility with existing views
    
    // Image-related properties (delegated to ImageManager)
    var currentImageName: String {
        get { imageManager.currentImageName }
        set { imageManager.currentImageName = newValue }
    }
    
    var defaultImages: [String] = AppConfig.defaultImages {
        didSet {
            DispatchQueue.main.async { self.objectWillChange.send() }
        }
    }
    
    var selectedDefaultImageName: String {
        get { imageManager.selectedDefaultImageName }
        set { imageManager.selectedDefaultImageName = newValue }
    }
    
    var customImageURLs: [String: URL] {
        get { imageManager.customImageURLs }
        set { imageManager.customImageURLs = newValue }
    }
    
    var userAddedImages: [String: URL] {
        get { imageManager.userAddedImages }
        set { imageManager.userAddedImages = newValue }
    }
    
    var imageScales: [String: CGFloat] {
        get { imageManager.imageScales }
        set { imageManager.imageScales = newValue }
    }
    
    var imageOffsets: [String: CGSize] {
        get { imageManager.imageOffsets }
        set { imageManager.imageOffsets = newValue }
    }
    
    // Sound-related properties (delegated to SoundManager)
    var selectedSound: String {
        get { soundManager.selectedSound }
        set { soundManager.selectedSound = newValue }
    }
    
    @Published var defaultSounds: [String] = []
    
    var soundVolume: Double {
        get { soundManager.soundVolume }
        set { soundManager.soundVolume = newValue }
    }
    
    var soundConfigs: [String: SoundConfig] {
        get { soundManager.soundConfigs }
        set { soundManager.soundConfigs = newValue }
    }
    
    var soundPlayMode: SoundPlayMode {
        get { soundManager.soundPlayMode }
        set { soundManager.soundPlayMode = newValue }
    }
    
    var sequentialSoundOrder: [String: Int] {
        get { soundManager.sequentialSoundOrder }
        set { soundManager.sequentialSoundOrder = newValue }
    }
    
    var nextSequenceNumber: Int {
        get { soundManager.nextSequenceNumber }
        set { soundManager.nextSequenceNumber = newValue }
    }
    
    var selectedSoundsOrder: [String] {
        get { soundManager.selectedSoundsOrder }
        set { soundManager.selectedSoundsOrder = newValue }
    }
    
    var imageSounds: [String: URL] {
        get { soundManager.imageSounds }
        set { soundManager.imageSounds = newValue }
    }
    
    var imageMultiSounds: [String: [String]] {
        get { soundManager.imageMultiSounds }
        set { soundManager.imageMultiSounds = newValue }
    }

    // MARK: - 新的基于SoundID的属性和方法

    /// 图片到音效ID列表的映射（新架构）
    @Published var imageMultiSoundIDs: [String: [SoundID]] = [:]

    /// 选择的音效ID顺序（新架构）
    @Published var selectedSoundIDsOrder: [SoundID] = []
    
    var isBackgroundPlayEnabled: Bool {
        get { soundManager.isBackgroundPlayEnabled }
        set { soundManager.isBackgroundPlayEnabled = newValue }
    }
    
    // Trigger-related properties (delegated to TriggerManager)
    var customTriggerDisplays: [String: CustomTriggerDisplay] {
        get { triggerManager.customTriggerDisplays }
        set { triggerManager.customTriggerDisplays = newValue }
    }
    
    // Computed properties for backward compatibility
    var imageTriggerModes: [String: ImageTriggerMode] {
        get {
            var modes: [String: ImageTriggerMode] = [:]
            for imageName in imageManager.getImageNames() {
                modes[imageName] = imageManager.getImageSettings(for: imageName).triggerMode
            }
            return modes
        }
        set {
            for (imageName, mode) in newValue {
                var settings = imageManager.getImageSettings(for: imageName)
                settings.triggerMode = mode
                imageManager.updateImageSettings(for: imageName, settings: settings)
            }
        }
    }
    
    var imageShowClickCount: [String: Bool] {
        get {
            var showCounts: [String: Bool] = [:]
            for imageName in imageManager.getImageNames() {
                showCounts[imageName] = imageManager.getImageSettings(for: imageName).showClickCount
            }
            return showCounts
        }
        set {
            for (imageName, show) in newValue {
                var settings = imageManager.getImageSettings(for: imageName)
                settings.showClickCount = show
                imageManager.updateImageSettings(for: imageName, settings: settings)
            }
        }
    }
    
    var imageClickCounts: [String: Int] {
        get {
            var counts: [String: Int] = [:]
            for imageName in imageManager.getImageNames() {
                counts[imageName] = imageManager.getImageSettings(for: imageName).clickCount
            }
            return counts
        }
        set {
            for (imageName, count) in newValue {
                var settings = imageManager.getImageSettings(for: imageName)
                settings.clickCount = count
                imageManager.updateImageSettings(for: imageName, settings: settings)
            }
        }
    }
    
    // MARK: - Legacy Audio Properties (for compatibility)
    var audioPlayer: AVAudioPlayer?
    var multiAudioPlayers: [AVAudioPlayer] = []
    
    // MARK: - Initialization
    override init() {
        super.init()
        loadImageOrder()

        // 确保 SoundManager 完全初始化后再更新音效列表
        DispatchQueue.main.async { [weak self] in
            self?.updateDefaultSounds()
        }

        // 监听显示名称管理器的变化
        soundManager.displayNameManager.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateDefaultSounds()
            }
            .store(in: &cancellables)

        // 改为按需加载配置

        // 设置TriggerManager的ImageManager引用
        triggerManager.setImageManager(imageManager)

        // 执行优化初始化
        performOptimizationInitialization()
    }

    // 存储订阅
    private var cancellables = Set<AnyCancellable>()

    /// 执行优化相关的初始化
    private func performOptimizationInitialization() {
        // 1. 检查并执行ID-based迁移
        if DataMigrationHelper.needsIDBasedMigration() {
            Logger.info("检测到需要ID-based迁移，开始执行", category: .migration)
            let result = DataMigrationHelper.performCompleteIDBasedMigration(
                soundManager: soundManager,
                imageManager: imageManager
            )

            if result.totalErrors == 0 {
                Logger.success("ID-based迁移成功完成 - 迁移项目: \(result.totalMigrated)", category: .migration)
            } else {
                Logger.warning("ID-based迁移完成但有错误 - 错误: \(result.totalErrors)", category: .migration)
            }
        }

        // 2. 执行TriggerManager数据迁移
        // 数据迁移已完成，无需再次迁移

        // 3. 预加载常用资源
        CacheManager.shared.preloadCommonImages(Array(defaultImages.prefix(5)), imageManager: imageManager)

        // 3.1 激进：预热音频栈，避免首次播放/首次滑动触发 AVAudio 初始化
        soundManager.audioService.warmUpAudioStack()

        // 4. 初始化性能监控
        PerformanceMonitor.logMemoryUsage(context: "应用启动后内存使用")

        // 5. 启动定期内存检查
        startMemoryMonitoring()

        // 6. 设置 blackcat 默认配置（延迟执行，确保 ImageManager 完成初始化）
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.setupBlackcatDefaultSettings()
        }

        Logger.success("优化初始化完成", category: .performance)
    }

    /// 设置 blackcat 图片的默认配置
    private func setupBlackcatDefaultSettings() {
        let imageName = "blackcat"
        let defaultsKey = "blackcat_defaults_configured_v1"
        
        // 检查是否已经配置过
        guard !UserDefaults.standard.bool(forKey: defaultsKey) else {
            return
        }
        
        Logger.info("首次运行，配置 blackcat 默认设置", category: .bugOffModel)
        
        // 获取当前设置
        let modeContext = imageManager.getCurrentModeContext()
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        
        // 1. 触发方式：点击
        settings.triggerMode = .tap
        
        // 2. 播放模式：随机
        settings.soundPlayMode = .random
        
        // 3. 开启随机提示
        settings.randomHintEnabled = true
        
        // 保存设置并强制更新缓存
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)
        imageManager.forceUpdateCache(for: imageName, in: modeContext, settings: settings)
        DataService.shared.saveImageSettingsSync(settings, for: imageName, in: modeContext)
        
        // 4. 随机选择 3-5 个音效
        setupBlackcatDefaultSounds(imageName: imageName)
        
        // 标记已配置
        UserDefaults.standard.set(true, forKey: defaultsKey)
        Logger.success("blackcat 默认设置配置完成", category: .bugOffModel)
    }
    
    /// 为 blackcat 设置默认随机音效
    private func setupBlackcatDefaultSounds(imageName: String) {
        // 获取所有可用音效
        let allSounds = soundManager.displayNameManager.getAllDisplayNames()
        guard !allSounds.isEmpty else { return }
        
        // 随机选择 3-5 个音效
        let soundCount = min(Int.random(in: 3...5), allSounds.count)
        let selectedSounds = Array(allSounds.shuffled().prefix(soundCount))
        
        // 设置音效
        soundManager.setMultiSoundNames(for: imageName, soundNames: selectedSounds)
        
        // 更新选择顺序
        soundManager.selectedSoundsOrder = selectedSounds
        
        Logger.info("为 blackcat 设置默认音效: \(selectedSounds)", category: .bugOffModel)
    }

    /// 更新音效显示名称列表
    private func updateDefaultSounds() {
        defaultSounds = soundManager.displayNameManager.getAllDisplayNames()
    }

    // MARK: - Memory Management

    /// 启动内存监控
    private func startMemoryMonitoring() {
        // 每30秒检查一次内存使用情况
        Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            let (used, _) = PerformanceMonitor.getMemoryUsage()
            let usedMB = Double(used) / 1024.0 / 1024.0
            let percentage = PerformanceMonitor.getMemoryUsagePercentage()

            // 如果内存使用超过阈值，记录警告并清理
            if percentage > AppConfig.memoryWarningThreshold {
                Logger.warning("⚠️ 内存使用过高 - 使用: \(String(format: "%.1f", usedMB))MB (\(String(format: "%.1f", percentage))%)", category: .performance)

                // 触发内存清理
                self.performMemoryCleanup()
            }
        }
    }

    /// 执行内存清理
    private func performMemoryCleanup() {

        // 清理音频服务
        soundManager.audioService.handleMemoryPressure()

        // 清理缓存管理器
        CacheManager.shared.handleMemoryWarning()

        // 记录清理后的内存使用
        PerformanceMonitor.logMemoryUsage(context: "内存清理后")
    }

    /// 公开方法：强制更新音效显示名称列表
    func refreshDefaultSounds() {
        // 防止重复调用，如果数据已经存在且正确则跳过
        let currentCount = defaultSounds.count
        let expectedSounds = soundManager.displayNameManager.getAllDisplayNames()
        let expectedCount = expectedSounds.count

        // 检查数据是否已经正确且完整
        if currentCount == expectedCount && currentCount > 0 && Set(defaultSounds) == Set(expectedSounds) {
            return
        }

        // 如果在主线程，立即更新；否则延迟执行
        if Thread.isMainThread {
            updateDefaultSounds()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.updateDefaultSounds()
            }
        }
    }
    
    // MARK: - 按需配置加载

    /// 按需加载指定mode的配置数据
    func loadModeConfigurationAsync(for imageName: String) async -> Bool {
        // 优化：这个操作实际上是同步的，不需要后台线程
        // 只是从内存字典中获取配置数据，包括默认配置
        _ = triggerManager.getCustomTriggerDisplay(for: imageName)
        
        // 确保图片设置也已加载（如果需要）
        _ = imageManager.getImageSettings(for: imageName)
        
        // 确保音效配置也已加载（如果需要）
        _ = soundManager.getSoundNames(for: imageName)

        Logger.success("Mode配置加载完成: \(imageName)", category: .bugOffModel)
        return true
    }

    /// 检查mode配置是否已缓存
    func isModeConfigurationCached(for imageName: String) -> Bool {
        return triggerManager.isConfigurationCached(for: imageName)
    }

    /// 获取所有图片名称（仅用于缩略图显示）
    private func getAllImageNames() -> [String] {
        var allImages: [String] = []

        // 添加默认图片
        allImages.append(contentsOf: defaultImages)

        // 添加用户自定义图片
        allImages.append(contentsOf: Array(customImageURLs.keys))
        allImages.append(contentsOf: Array(userAddedImages.keys))

        return Array(Set(allImages)) // 去重
    }

    // MARK: - Backward Compatibility Methods
    
    // Image Management Methods
    func getImageScale(for imageName: String) -> CGFloat {
        return imageManager.getImageScale(for: imageName)
    }
    
    func setImageScale(for imageName: String, scale: CGFloat) {
        imageManager.setImageScale(for: imageName, scale: scale)
    }
    
    func getImageOffset(for imageName: String) -> CGSize {
        return imageManager.getImageOffset(for: imageName)
    }
    
    func setImageOffset(for imageName: String, offset: CGSize) {
        imageManager.setImageOffset(for: imageName, offset: offset)
    }
    
    func updateCroppedImage(for imageName: String, croppedImageURL: URL) {
        imageManager.updateCroppedImage(for: imageName, croppedImageURL: croppedImageURL)
    }
    
    func addImage(image: UIImage, name: String) -> String {
        let newName = imageManager.addImage(image: image, name: name)
        if !newName.isEmpty {
            defaultImages.append(newName)
            saveImageOrder()
        }
        return newName
    }
    
    func deleteImage(_ imageName: String) {
        imageManager.deleteImage(imageName)
    }
    
    func getImageNames() -> [String] {
        return imageManager.getImageNames()
    }

    func getDisplayImage(for imageName: String) -> UIImage? {
        return imageManager.getDisplayImage(for: imageName)
    }
    
    func resetImageSettings(for imageName: String) {
        imageManager.resetImageSettings(for: imageName)
        triggerManager.resetTriggerCount(for: imageName, imageManager: imageManager)
    }
    
    // MARK: - 新的基于SoundID的音效管理方法

    /// 为图片设置音效ID列表
    func setMultiSoundIDs(for imageName: String, soundIDs: [SoundID]) {
        imageMultiSoundIDs[imageName] = soundIDs
    }

    /// 获取图片的音效ID列表
    func getMultiSoundIDs(for imageName: String) -> [SoundID] {
        return imageMultiSoundIDs[imageName] ?? []
    }

    /// 获取图片的音效显示名称列表（用于UI显示）
    func getMultiSoundDisplayNames(for imageName: String) -> [String] {
        let soundIDs = getMultiSoundIDs(for: imageName)
        return soundIDs.compactMap { soundID in
            soundManager.displayNameManager.getDisplayName(for: soundID)
        }
    }

    /// 添加音效到图片
    func addSoundToImage(_ soundID: SoundID, imageName: String) {
        var currentSounds = imageMultiSoundIDs[imageName] ?? []
        if !currentSounds.contains(soundID) {
            currentSounds.append(soundID)
            imageMultiSoundIDs[imageName] = currentSounds
        }
    }

    /// 从图片移除音效
    func removeSoundFromImage(_ soundID: SoundID, imageName: String) {
        imageMultiSoundIDs[imageName]?.removeAll { $0 == soundID }
    }

    /// 通过SoundID获取音效配置
    func getSoundConfig(byID soundID: SoundID) -> SoundConfig? {
        return soundManager.getSoundConfig(byID: soundID)
    }

    /// 通过SoundID获取指定图片的音效配置
    func getSoundConfig(byID soundID: SoundID, imageName: String) -> SoundConfig? {
        let modeContext = imageManager.currentModeContext
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)

        if let config = settings.getSoundConfig(for: soundID) {
            return config
        } else {
            // 如果没有图片特定的配置，从全局配置中获取
            if let globalConfig = soundManager.getSoundConfig(byID: soundID) {
                settings.addSound(soundID, config: globalConfig)
                imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)
                return globalConfig
            }
        }
        return nil
    }

    /// 更新指定图片的音效配置（使用SoundID）
    func updateSoundConfig(byID soundID: SoundID, config: SoundConfig, for imageName: String) {
        let modeContext = imageManager.currentModeContext
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.updateSoundConfig(config)
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)
        DataService.shared.saveImageSettingsSync(settings, for: imageName, in: modeContext)
    }

    // MARK: - 兼容性音效管理方法






    
    /// 获取指定图片的音效配置（新方法，支持独立性）
    func getSoundConfig(for soundName: String, imageName: String) -> SoundConfig {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        // 重新获取最新的设置，确保获取到最新保存的配置
        let settings = imageManager.getImageSettings(for: imageName, in: modeContext)

        if let soundID = soundManager.displayNameManager.getSoundID(for: soundName),
           let staged = modeScopedTempSoundConfigs[imageName]?[soundID] {
            return staged
        }

        if let soundID = soundManager.displayNameManager.getSoundID(for: soundName) {
            if let config = settings.soundConfigs[soundID] {
                return config
            }
        }



        if let soundID = soundManager.displayNameManager.getSoundID(for: soundName),
           let globalConfig = soundManager.getSoundConfig(byID: soundID) {
            return globalConfig
        }

        let soundID = soundManager.displayNameManager.getSoundID(for: soundName) ?? soundManager.createSound(displayName: soundName, baseSoundName: soundName)
        return SoundConfig(id: soundID, baseSoundName: soundName)
    }
    
    func updateSoundConfig(config: SoundConfig) {
        soundManager.updateSoundConfig(config: config)
    }


    
    /// 更新指定图片的音效配置（新方法，支持独立性）
    func updateSoundConfig(config: SoundConfig, for imageName: String, saveImmediately: Bool = true) {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.soundConfigs[config.id] = config
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)

        // 只有在明确要求保存时才执行磁盘I/O操作
        // 这避免了音效设置界面频繁保存导致的hang问题
        if saveImmediately {
            // 优化：使用异步保存避免阻塞主线程
            if AppConfig.useAsyncSave {
                DispatchQueue.global(qos: .utility).async {
                    DataService.shared.saveImageSettingsSync(settings, for: imageName, in: modeContext)
                }
            } else {
                DataService.shared.saveImageSettingsSync(settings, for: imageName, in: modeContext)
            }
        }

    }

    // MARK: - 临时音效配置分层（Mode范围）
    /// 临时缓存：每个图片的音效配置（仅会话内使用），父层关闭时统一合并持久化
    private var modeScopedTempSoundConfigs: [String: [SoundID: SoundConfig]] = [:]

    /// 将音效配置写入临时缓存（不落盘）
    func stageTempSoundConfig(config: SoundConfig, for imageName: String) {
        if modeScopedTempSoundConfigs[imageName] == nil {
            modeScopedTempSoundConfigs[imageName] = [:]
        }
        modeScopedTempSoundConfigs[imageName]?[config.id] = config
        let displayName = soundManager.displayNameManager.getDisplayName(for: config.id)

        // 发送音效配置变化通知，用于重置回溯时长等相关设置
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: NSNotification.Name("SoundConfigChanged"),
                object: nil,
                userInfo: [
                    "imageName": imageName,
                    "soundName": displayName,
                    "config": config
                ]
            )
        }
    }

    /// 读取某图片的临时音效配置（不清空，用于检查是否有临时配置）
    func getTempSoundConfigs(for imageName: String) -> [SoundID: SoundConfig] {
        return modeScopedTempSoundConfigs[imageName] ?? [:]
    }

    /// 读取并清空某图片的临时音效配置（用于父层统一保存时合并）
    func drainTempSoundConfigs(for imageName: String) -> [SoundID: SoundConfig] {
        let staged = modeScopedTempSoundConfigs[imageName] ?? [:]
        modeScopedTempSoundConfigs[imageName] = [:]
        return staged
    }

    /// 清除特定音效的临时配置（用于用户未选择该音效时清理）
    func clearTempSoundConfig(for soundName: String, imageName: String) {
        if let soundID = soundManager.displayNameManager.getSoundID(for: soundName) {
            modeScopedTempSoundConfigs[imageName]?.removeValue(forKey: soundID)
        }
    }

    /// 清除某图片的所有临时音效配置（用于重置或取消操作）
    func clearAllTempSoundConfigs(for imageName: String) {
        modeScopedTempSoundConfigs[imageName] = [:]
    }
    
    func renameSoundConfig(from oldName: String, to newName: String) {
        soundManager.renameSoundConfig(from: oldName, to: newName)
    }
    
    func deleteSoundConfig(for soundName: String) {
        soundManager.deleteSoundConfig(for: soundName)
    }
    
    func getURL(for soundName: String) -> URL? {
        return soundManager.getURL(for: soundName)
    }
    
    func playSound(soundName: String) {
        soundManager.playSound(soundName: soundName)
    }
    
    func playSound(soundName: String, completion: @escaping () -> Void) {
        soundManager.playSound(soundName: soundName, completion: completion)
    }
    
    /// Play single sound for specific image（新方法，支持独立性）
    func playSound(soundName: String, for imageName: String) {
        let config = getSoundConfig(for: soundName, imageName: imageName)
        soundManager.playSound(soundName: soundName, config: config)
    }
    
    /// Play single sound for specific image with completion（新方法，支持独立性）
    func playSound(soundName: String, for imageName: String, completion: @escaping () -> Void) {
        let config = getSoundConfig(for: soundName, imageName: imageName)
        soundManager.playSound(soundName: soundName, config: config, completion: completion)
    }
    
    func playCustomSound(url: URL) {
        soundManager.playCustomSound(url: url)
    }
    
    func playMultiSounds(urls: [URL]) {
        soundManager.playMultiSounds(urls: urls)
    }
    
    func playMultiSounds(names: [String]) {
        soundManager.playMultiSounds(names: names)
    }
    
    /// Play multiple sounds for specific image（新方法，支持独立性）
    func playMultiSounds(names: [String], for imageName: String) {
        // 确保使用最新的音效配置
        playMultiSoundsWithLatestConfig(names: names, for: imageName)
    }

    /// Play multiple sounds for specific image with completion callback
    func playMultiSounds(names: [String], for imageName: String, completion: @escaping () -> Void) {
        // 确保使用最新的音效配置
        playMultiSoundsWithLatestConfig(names: names, for: imageName, completion: completion)
    }

    /// 使用最新配置播放多个音效的内部方法
    private func playMultiSoundsWithLatestConfig(names: [String], for imageName: String, completion: (() -> Void)? = nil) {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        // 获取最新的图片设置
        var imageSettings = imageManager.getImageSettings(for: imageName, in: modeContext)

        // 为每个音效获取最新的配置
        for soundName in names {
            let latestConfig = getSoundConfig(for: soundName, imageName: imageName)
            if let soundID = soundManager.displayNameManager.getSoundID(for: soundName) {
                imageSettings.soundConfigs[soundID] = latestConfig
            }
            // 兼容性：也使用显示名称作为键
            imageSettings.soundConfigs[soundName] = latestConfig
        }

        // 临时更新ImageManager中的设置，确保SoundManager能获取到最新配置
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: imageSettings)

        // 调用SoundManager播放音效
        if let completion = completion {
            soundManager.playMultiSounds(names: names, for: imageName, imageManager: imageManager, completion: completion)
        } else {
            soundManager.playMultiSounds(names: names, for: imageName, imageManager: imageManager)
        }
    }
    
    func stopSound() {
        soundManager.stopSound()
    }
    
    /// 回溯当前播放的音效，不触发其他逻辑
    func backtrackCurrentSound() {
        soundManager.backtrackCurrentSound()
    }
    
    func updateSoundOrder(_ orderedSounds: [String]) {
        soundManager.updateSoundOrder(orderedSounds)
    }
    
    func resetSequentialOrder() {
        soundManager.resetSequentialOrder()
    }
    
    func toggleSoundPlayMode() {
        soundManager.toggleSoundPlayMode()
    }
    
    func resetSoundsToDefaultOrder() {
        soundManager.resetSoundsToDefaultOrder()
    }
    
    // Trigger Management Methods
    func getCustomTriggerDisplay(for imageName: String) -> CustomTriggerDisplay {
        return triggerManager.getCustomTriggerDisplay(for: imageName)
    }

    func setCustomTriggerDisplay(for imageName: String, config: CustomTriggerDisplay) {
        triggerManager.setCustomTriggerDisplay(for: imageName, config: config)
    }

    // 分层临时：颜色选择透传到 TriggerManager 暂存
    func stageSelectedColors(_ colors: Set<String>, for imageName: String) {
        triggerManager.stageSelectedColors(colors, for: imageName)
    }

    func drainStagedSelectedColors(for imageName: String) -> Set<String>? {
        return triggerManager.drainStagedSelectedColors(for: imageName)
    }
    
    func isCustomTriggerDisplayEnabled(for imageName: String) -> Bool {
        return triggerManager.isCustomTriggerDisplayEnabled(for: imageName)
    }
    
    func getCustomTriggerText(for imageName: String) -> String {
        let currentCount = getCurrentTriggerCount(for: imageName)
        return triggerManager.getCustomTriggerText(for: imageName, currentCount: currentCount)
    }
    
    func getCustomTriggerColor(for imageName: String) -> Color {
        return triggerManager.getCustomTriggerColor(for: imageName)
    }
    
    func getTriggerMode(for imageName: String) -> ImageTriggerMode {
        return triggerManager.getTriggerMode(for: imageName, imageManager: imageManager)
    }
    
    func setTriggerMode(for imageName: String, mode: ImageTriggerMode) {
        triggerManager.setTriggerMode(for: imageName, mode: mode, imageManager: imageManager)
    }
    
    func getShowClickCount(for imageName: String) -> Bool {
        return triggerManager.shouldShowClickCount(for: imageName, imageManager: imageManager)
    }
    
    func setShowClickCount(for imageName: String, show: Bool) {
        triggerManager.setShowClickCount(for: imageName, show: show, imageManager: imageManager)
    }
    
    func getClickCount(for imageName: String) -> Int {
        return triggerManager.getCurrentTriggerCount(for: imageName, imageManager: imageManager)
    }
    
    func incrementClickCount(for imageName: String) {
        triggerManager.triggerImage(for: imageName, imageManager: imageManager, soundManager: soundManager)
    }
    
    func triggerImage(for imageName: String) {
        triggerManager.triggerImage(for: imageName, imageManager: imageManager, soundManager: soundManager, bugOffModel: self)

        // 多图片模式：检查是否需要自动切换到下一张
        let settings = imageManager.getImageSettings(for: imageName)
        if settings.isMultiImageMode && settings.navigationMode == .autoNext {
            DispatchQueue.main.asyncAfter(deadline: .now() + settings.autoSwitchInterval) {
                _ = self.imageManager.nextImageInSequence(for: imageName)
            }
        }
    }

    func getCurrentTriggerCount(for imageName: String) -> Int {
        return triggerManager.getCurrentTriggerCount(for: imageName, imageManager: imageManager)
    }

    // MARK: - Multi-Image Mode Support

    /// 创建多图片模式
    func createMultiImageMode(name: String, imageNames: [String], displayName: String = "") -> String? {
        let configName = imageManager.createMultiImageMode(name: name, imageNames: imageNames, displayName: displayName)
        guard !configName.isEmpty else { return nil }

        // 添加到图片列表
        defaultImages.append(configName)
        saveImageOrder()

        return configName
    }

    /// 检查是否为多图片模式
    func isMultiImageMode(for imageName: String) -> Bool {
        return imageManager.isMultiImageMode(for: imageName)
    }

    /// 获取当前显示的图片（多图片模式下返回序列中的当前图片）
    func getCurrentDisplayImageName(for imageName: String) -> String {
        let settings = imageManager.getImageSettings(for: imageName)
        return settings.currentDisplayImageName.isEmpty ? imageName : settings.currentDisplayImageName
    }

    /// 切换到下一张图片
    func nextImageInSequence(for imageName: String) -> Bool {
        return imageManager.nextImageInSequence(for: imageName)
    }

    /// 切换到上一张图片
    func previousImageInSequence(for imageName: String) -> Bool {
        return imageManager.previousImageInSequence(for: imageName)
    }

    /// 跳转到指定图片
    func jumpToImageInSequence(for imageName: String, at index: Int) -> Bool {
        return imageManager.jumpToImageInSequence(for: imageName, at: index)
    }

    /// 获取图片序列信息
    func getImageSequenceInfo(for imageName: String) -> (current: Int, total: Int, images: [String]) {
        return imageManager.getImageSequenceInfo(for: imageName)
    }

    /// 设置序列导航模式
    func setSequenceNavigationMode(for imageName: String, mode: SequenceNavigationMode) {
        var settings = imageManager.getImageSettings(for: imageName)
        settings.navigationMode = mode
        imageManager.updateImageSettings(for: imageName, settings: settings)
    }

    /// 设置自动切换间隔
    func setAutoSwitchInterval(for imageName: String, interval: Double) {
        var settings = imageManager.getImageSettings(for: imageName)
        settings.autoSwitchInterval = max(0.5, interval) // 最小0.5秒
        imageManager.updateImageSettings(for: imageName, settings: settings)
    }

    /// 将现有单图片转换为多图片模式
    func convertToMultiImageMode(for imageName: String, additionalImages: [String]) -> Bool {
        var settings = imageManager.getImageSettings(for: imageName)
        guard settings.modeType == .single else { return false }

        // 转换为多图片模式
        settings.setImageSequence([imageName] + additionalImages)

        imageManager.updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 将多图片模式转换回单图片模式
    func convertToSingleImageMode(for imageName: String, keepImageIndex: Int = 0) -> Bool {
        var settings = imageManager.getImageSettings(for: imageName)
        guard settings.modeType == .sequence && !settings.imageSequence.isEmpty else { return false }

        // 选择要保留的图片
        let keepIndex = max(0, min(keepImageIndex, settings.imageSequence.count - 1))
        let keepImageName = settings.imageSequence[keepIndex]

        // 转换为单图片模式
        settings.setSingleImage(keepImageName)

        imageManager.updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 获取图片模式类型
    func getImageModeType(for imageName: String) -> ImageModeType {
        return imageManager.getImageSettings(for: imageName).modeType
    }

    // MARK: - Mode Context Management

    /// 设置当前活跃的mode上下文
    func setCurrentModeContext(_ modeContext: ModeContext) {
        imageManager.setCurrentModeContext(modeContext)
    }

    /// 获取当前活跃的mode上下文
    func getCurrentModeContext() -> ModeContext {
        return imageManager.getCurrentModeContext()
    }

    /// 获取指定图片在指定mode下的设置
    func getImageSettings(for imageName: String, in modeContext: ModeContext) -> ImageSettings {
        return imageManager.getImageSettings(for: imageName, in: modeContext)
    }

    /// 更新指定图片在指定mode下的设置
    func updateImageSettings(for imageName: String, in modeContext: ModeContext, settings: ImageSettings) {
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)
    }

    /// 复制配置到新mode
    func copySettingsToMode(from sourceModeContext: ModeContext, to targetModeContext: ModeContext, for imageNames: [String]? = nil) {
        imageManager.copySettingsToMode(from: sourceModeContext, to: targetModeContext, for: imageNames)
    }

    /// 删除指定mode的所有配置
    func deleteAllSettings(in modeContext: ModeContext) {
        imageManager.deleteAllSettings(in: modeContext)
    }

    /// 检查mode是否有自定义配置
    func hasModeSettings(for modeContext: ModeContext) -> Bool {
        return imageManager.hasModeSettings(for: modeContext)
    }

    /// 获取指定mode的所有配置
    func getAllImageSettings(in modeContext: ModeContext) -> [String: ImageSettings] {
        return imageManager.getAllImageSettings(in: modeContext)
    }

    // MARK: - Mode-Aware Image Operations

    /// 在指定mode下触发图片
    func triggerImage(for imageName: String, in modeContext: ModeContext) {
        // 临时切换到指定mode
        let originalContext = getCurrentModeContext()
        setCurrentModeContext(modeContext)

        // 执行触发
        triggerImage(for: imageName)

        // 恢复原来的mode
        setCurrentModeContext(originalContext)
    }

    /// 在指定mode下获取触发模式
    func getTriggerMode(for imageName: String, in modeContext: ModeContext) -> ImageTriggerMode {
        return getImageSettings(for: imageName, in: modeContext).triggerMode
    }

    /// 在指定mode下设置触发模式
    func setTriggerMode(for imageName: String, in modeContext: ModeContext, mode: ImageTriggerMode) {
        var settings = getImageSettings(for: imageName, in: modeContext)
        settings.triggerMode = mode
        updateImageSettings(for: imageName, in: modeContext, settings: settings)
    }

    /// 在指定mode下获取点击次数
    func getClickCount(for imageName: String, in modeContext: ModeContext) -> Int {
        return getImageSettings(for: imageName, in: modeContext).clickCount
    }

    /// 在指定mode下重置点击次数
    func resetClickCount(for imageName: String, in modeContext: ModeContext) {
        var settings = getImageSettings(for: imageName, in: modeContext)
        settings.clickCount = 0
        updateImageSettings(for: imageName, in: modeContext, settings: settings)
    }
    
    func resetClickCount(for imageName: String) {
        triggerManager.resetTriggerCount(for: imageName, imageManager: imageManager)
    }
    
    // Color Management Methods
    func getAndIncrementColorIndex(for imageName: String) -> Int {
        // This method is now handled internally by TriggerManager
        return 0
    }
    
    func resetColorIndex(for imageName: String) {
        // This method is now handled internally by TriggerManager
    }
    
    // MARK: - Image Order Management
    
    /// 另存为Mode及其所有配置，实现配置隔离
    func cloneModeWithIsolation(_ imageName: String) -> String? {
        guard let sourceIndex = defaultImages.firstIndex(of: imageName) else {
            Logger.error("找不到源mode: \(imageName)", category: .bugOffModel)
            return nil
        }

        let timestamp = Int(Date().timeIntervalSince1970)
        let newModeName = "\(imageName)_copy_\(timestamp)"

        let originalModeContext = ModeContext(modeId: imageName)
        let newModeContext = ModeContext(modeId: newModeName)

        // 3. 复制原mode所有图片的配置到新mode
        copySettingsToMode(from: originalModeContext, to: newModeContext)
        Logger.success("配置复制完成", category: .bugOffModel)

        // 4. 如果原mode没有独立图片（单图模式），仍需为新modeName自身创建设置以保存 displayName
        var rootSettings = imageManager.getImageSettings(for: imageName, in: originalModeContext)
        rootSettings.modeContext = newModeContext
        rootSettings.displayName = (rootSettings.displayName.isEmpty ? imageName : rootSettings.displayName) + " 副本"
        // 重置次数为 0
        rootSettings.clickCount = 0

        // 确保复制的mode有正确的图片序列设置
        if rootSettings.imageSequence.isEmpty {
            // 如果原mode没有图片序列，设置为指向原始图片
            rootSettings.imageSequence = [imageName]
            rootSettings.modeType = .single
        }
        // 如果原mode有图片序列，已经在copySettingsToMode中复制了

        imageManager.updateImageSettings(for: newModeName, in: newModeContext, settings: rootSettings)
        Logger.success("根设置更新完成", category: .bugOffModel)


        // 复制裁剪/位移缩放效果
        let originalScale = imageManager.getImageScale(for: imageName)
        let originalOffset = imageManager.getImageOffset(for: imageName)
        imageManager.setImageScale(for: newModeName, scale: originalScale)
        imageManager.setImageOffset(for: newModeName, offset: originalOffset)
        Logger.success("缩放和偏移复制完成", category: .bugOffModel)

        // 5. 复制音效配置（mode级别隔离）并持久化
        if let originalSounds = soundManager.imageMultiSounds[imageName] {
            soundManager.setMultiSoundNames(for: newModeName, soundNames: originalSounds)
        }

        // 6. 复制其他管理器中的关联数据
        if let triggerDisplay = triggerManager.customTriggerDisplays[imageName] {
            triggerManager.setCustomTriggerDisplay(for: newModeName, config: triggerDisplay)
        }

        // 7. 添加到图片列表
        defaultImages.insert(newModeName, at: sourceIndex + 1)
        saveImageOrder()

        // 8. 刷新缩略图缓存，确保新mode能正确显示缩略图
        DispatchQueue.main.async {
            // 通知ImageManager数据已更改，触发缩略图重新生成
            self.imageManager.objectWillChange.send()
        }

        return newModeName
    }

    /// 复制图片及其所有配置（音效、触发器等）- 保持向后兼容
    func cloneImage(_ imageName: String) -> String? {
        // 为了向后兼容，调用新的mode隔离复制方法
        return cloneModeWithIsolation(imageName)
    }

    /// 切换到下一个mode（不循环）
    func nextMode(from currentModeName: String) -> String? {
        guard let currentIndex = defaultImages.firstIndex(of: currentModeName) else { return nil }
        let nextIndex = currentIndex + 1
        guard nextIndex < defaultImages.count else { return nil }
        return defaultImages[nextIndex]
    }

    /// 切换到上一个mode（不循环）
    func previousMode(from currentModeName: String) -> String? {
        guard let currentIndex = defaultImages.firstIndex(of: currentModeName) else { return nil }
        let previousIndex = currentIndex - 1
        guard previousIndex >= 0 else { return nil }
        return defaultImages[previousIndex]
    }

    /// Save current image order to persistent storage
    func saveImageOrder() {
        // 保存当前图片顺序到 UserDefaults
        UserDefaults.standard.set(defaultImages, forKey: "defaultImagesOrder")
    }
    
    /// Load saved image order from persistent storage
    func loadImageOrder() {
        if let savedOrder = UserDefaults.standard.array(forKey: "defaultImagesOrder") as? [String] {
            // 过滤掉已经被删除的图片
            let availableImages = imageManager.getImageNames()
            var ordered = savedOrder.filter { availableImages.contains($0) }
            // 把遗漏的新图片追加到末尾
            let missing = availableImages.filter { !ordered.contains($0) }
            ordered.append(contentsOf: missing)
            defaultImages = ordered
        } else {
            defaultImages = imageManager.getImageNames()
        }
    }
    
    // MARK: - Geometry Helpers
    
    /// 根据偏移量计算额外放大比例，确保裁剪后图片仍能覆盖方形容器
    func fillScale(for offset: CGSize) -> CGFloat {
        let width = WKInterfaceDevice.current().screenBounds.width
        return 1 + (2 * max(abs(offset.width), abs(offset.height))) / width
    }
    
    /// 返回最终生效的缩放比例 = 用户缩放 × fillScale
    func getEffectiveScale(for imageName: String) -> CGFloat {
        let baseScale = getImageScale(for: imageName)
        let offset = getImageOffset(for: imageName)
        return baseScale * fillScale(for: offset)
    }

    // MARK: - 自定义显示相关方法
    
    /// 应用圈选裁剪到图片（便捷方法）
    func applyCircleSelectionToImage(_ image: UIImage, selectionData: CircleSelectionData, scale: CGFloat, offset: CGSize) -> UIImage? {
        return triggerManager.applyCircleSelectionToFullscreen(image, selectionData: selectionData, scale: scale, offset: offset)
    }
    
    // MARK: - 音效播放相关方法
} 
