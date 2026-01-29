import Foundation
import SwiftUI
import AVFoundation
#if !os(watchOS)
import CoreMedia
#endif
import CryptoKit

// MARK: - Sound Manager
/// SoundManager - 音效资源管理器
///
/// 职责: 音效配置、播放模式、音量/速率调整
/// 设计: 使用 SoundID (UUID) 作为唯一标识符，与显示名称解耦
/// 依赖: AudioService 负责实际播放，SoundDisplayNameManager 管理显示名称
class SoundManager: ObservableObject {
    // MARK: - 显示名称管理
    @Published var displayNameManager = SoundDisplayNameManager()

    // MARK: - 核心数据（使用SoundID作为键）
    @Published var soundConfigs: [SoundID: SoundConfig] = [:]


    // MARK: - 兼容性属性（逐步迁移）
    @Published var selectedSound: String = "2004年老电脑关机音" // 显示名称
    @Published var soundVolume: Double = AppConfig.defaultSoundVolume
    @Published var soundPlayMode: SoundPlayMode = .sequential
    @Published var sequentialSoundOrder: [String: Int] = [:] // 将迁移为SoundID
    @Published var nextSequenceNumber: Int = 1
    @Published var selectedSoundsOrder: [String] = [] // 将迁移为SoundID
    @Published var imageSounds: [String: URL] = [:]
    @Published var imageMultiSounds: [String: [String]] = [:] // 将迁移为SoundID
    @Published var isBackgroundPlayEnabled: Bool = false
    
    // MARK: - Private Properties
    private let dataService = DataService.shared
     let audioService = AudioService()
    

    
    // MARK: - Initialization
    init() {
        // 检查是否在 preview 环境中
        if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" {
            // Preview 环境：使用简化的初始化
            setupPreviewData()
        } else {
            // 正常环境：完整初始化
            loadData()
            // 已移除配方加载
        }
    }

    // Preview 环境的简化初始化
    private func setupPreviewData() {
        // 设置一些基本的测试数据
        imageMultiSounds = [:]
        soundConfigs = [:]

        // 注意：defaultSounds 来自 AppConfig，不需要在这里设置
    }
    
    // MARK: - 新的基于SoundID的公共API

    /// 创建新音效
    func createSound(displayName: String, baseSoundName: String) -> SoundID {
        let soundID = displayNameManager.generateNewSoundID()
        let config = SoundConfig(id: soundID, baseSoundName: baseSoundName)

        // 如果在主线程，直接修改；否则异步修改
        if Thread.isMainThread {
            soundConfigs[soundID] = config
            displayNameManager.setDisplayName(for: soundID, name: displayName)
        } else {
            DispatchQueue.main.sync {
                self.soundConfigs[soundID] = config
                self.displayNameManager.setDisplayName(for: soundID, name: displayName)
            }
        }

        // 保存到数据服务（可以在后台线程）
        dataService.saveSoundConfig(config, for: baseSoundName)

        return soundID
    }

    /// 更新音效显示名称 - O(1)操作
    func updateSoundDisplayName(_ soundID: SoundID, to newName: String) {
        let oldName = displayNameManager.getDisplayName(for: soundID)
        displayNameManager.setDisplayName(for: soundID, name: newName)

        // 更新所有imageMultiSounds中的引用
        updateImageMultiSoundsAfterRename(oldName: oldName, newName: newName)

        saveData() // 保存显示名称映射
    }

    /// 更新imageMultiSounds中的音效名称引用
    private func updateImageMultiSoundsAfterRename(oldName: String, newName: String) {
        // 更新imageMultiSounds字典
        for (imageName, soundNames) in imageMultiSounds {
            var updatedSoundNames = soundNames
            var hasChanges = false

            for (index, soundName) in soundNames.enumerated() {
                if soundName == oldName {
                    updatedSoundNames[index] = newName
                    hasChanges = true
                }
            }

            if hasChanges {
                imageMultiSounds[imageName] = updatedSoundNames
            }
        }

        // 更新selectedSoundsOrder数组
        for (index, soundName) in selectedSoundsOrder.enumerated() {
            if soundName == oldName {
                selectedSoundsOrder[index] = newName
            }
        }

        // 更新sequentialSoundOrder字典
        if let order = sequentialSoundOrder[oldName] {
            sequentialSoundOrder.removeValue(forKey: oldName)
            sequentialSoundOrder[newName] = order
        }

        // 保存更新后的数据
        dataService.save(imageMultiSounds, forKey: "imageMultiSounds")
    }

    /// 通过显示名称获取音效配置
    func getSoundConfig(byDisplayName name: String) -> SoundConfig? {
        guard let soundID = displayNameManager.getSoundID(for: name) else {
            return nil
        }
        return soundConfigs[soundID]
    }

    /// 通过ID获取音效配置
    func getSoundConfig(byID soundID: SoundID) -> SoundConfig? {
        return soundConfigs[soundID]
    }

    /// 更新音效配置
    func updateSoundConfig(_ config: SoundConfig) {
        // 确保在主线程中修改 @Published 属性
        if Thread.isMainThread {
            soundConfigs[config.id] = config
        } else {
            DispatchQueue.main.sync {
                self.soundConfigs[config.id] = config
            }
        }
        // 数据持久化可以在后台线程
        dataService.saveSoundConfig(config, for: config.baseSoundName)
    }

    /// 删除音效（通过显示名称）
    func deleteSound(byDisplayName name: String) {
        guard let soundID = displayNameManager.getSoundID(for: name) else { return }
        deleteSound(byID: soundID)
    }

    /// 删除音效（通过ID）
    func deleteSound(byID soundID: SoundID) {
        soundConfigs.removeValue(forKey: soundID)
        displayNameManager.removeDisplayName(for: soundID)
        saveData()
    }

    /// 获取所有音效显示名称
    func getAllSoundDisplayNames() -> [String] {
        return displayNameManager.getAllDisplayNames()
    }

    /// 获取所有音效ID
    func getAllSoundIDs() -> [SoundID] {
        return Array(soundConfigs.keys)
    }



    /// Update sound configuration (兼容性方法)
    func updateSoundConfig(config: SoundConfig) {
        soundConfigs[config.id] = config
        dataService.saveSoundConfig(config, for: config.baseSoundName)
    }



    /// 获取音效的总时长
    func getSoundDuration(for soundName: String) -> TimeInterval {
        return audioService.getSoundDuration(for: soundName)
    }


    
    /// Rename sound configuration (兼容性方法)
    func renameSoundConfig(from oldName: String, to newName: String) {
        guard !newName.isEmpty, oldName != newName else { return }

        // 在新架构中，只需要更新显示名称映射
        if let soundID = displayNameManager.getSoundID(for: oldName) {
            updateSoundDisplayName(soundID, to: newName)
        }
    }
    
    /// Delete sound configuration (restore to default)
    func deleteSoundConfig(for soundName: String) {
        soundConfigs.removeValue(forKey: soundName)
        dataService.removeData(forKey: "\(AppConfig.UserDefaultsKeys.soundConfigs)_\(soundName)")
    }
    
    /// Get URL for sound file
    func getURL(for soundName: String) -> URL? {
        // 对于文件查找，我们只需要baseSoundName，不需要依赖可能被污染的配置
        let baseName: String

        // 对于默认音效，显示名称就是baseSoundName
        if AppConfig.defaultSounds.contains(soundName) {
            baseName = soundName
        } else if let soundID = displayNameManager.getSoundID(for: soundName) {
            let tempConfig = SoundConfig(id: soundID, baseSoundName: soundName)
            baseName = tempConfig.baseSoundName
        } else {
            baseName = soundName
        }

        let fileManager = FileManager.default

        // 1. Documents 目录（用户导入或裁剪后的自定义音效）
        if let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
            // 使用AudioFormatHandler支持的音频格式
            let supportedExtensions = ["mp3", "aac", "wav", "aiff", "m4a", "caf"]

            for fileExtension in supportedExtensions {
                let customSoundURL = documentsDirectory.appendingPathComponent("\(baseName).\(fileExtension)")
                if fileManager.fileExists(atPath: customSoundURL.path) {
                    return customSoundURL
                }
            }
        }

        // 2. App Bundle 默认音效
        if let bundleURL = Bundle.main.url(forResource: baseName, withExtension: "mp3") {
            return bundleURL
        }

        Logger.warning("音效文件 '\(baseName)' 未找到或存在兼容性问题", category: .soundManager)
        return nil
    }
    
    /// Play single sound
    public func playSound(soundName: String) {


        // 否则按单音效播放
        // 通过显示名称找到ID，然后获取配置
        guard let soundID = displayNameManager.getSoundID(for: soundName) else {
            Logger.warning("未找到音效: \(soundName)", category: .soundManager)
            return
        }
        let config = soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: soundName)
        let baseSoundName = config.baseSoundName
        audioService.playSound(soundName: baseSoundName, config: config)
    }
    
    /// Play single sound with completion handler
    public func playSound(soundName: String, completion: @escaping () -> Void) {


        // 通过显示名称找到ID，然后获取配置
        guard let soundID = displayNameManager.getSoundID(for: soundName) else {
            Logger.warning("未找到音效: \(soundName)", category: .soundManager)
            completion()
            return
        }
        let config = soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: soundName)
        // 获取baseSoundName用于实际播放
        let baseSoundName = config.baseSoundName
        // 使用AudioService的回调机制，而不是延迟执行
        audioService.playSound(soundName: baseSoundName, config: config, completion: completion)
    }
    
    /// Play single sound with specific config
    public func playSound(soundName: String, config: SoundConfig) {


        // URL 解析交给 AudioService 内部处理，避免在主线程做 I/O
        audioService.playSound(soundName: soundName, config: config)
    }
    
    /// Play single sound with specific config and completion
    public func playSound(soundName: String, config: SoundConfig, completion: @escaping () -> Void) {


        // 获取baseSoundName用于实际播放
        let baseSoundName = config.baseSoundName

        // 将URL解析与播放器创建交给 AudioService（内部已做优化与后台处理）
        audioService.playSound(soundName: baseSoundName, config: config, completion: completion)
    }
    
    /// Play custom sound from URL
    func playCustomSound(url: URL) {
        let soundName = url.lastPathComponent.replacingOccurrences(of: ".mp3", with: "")
        // 通过显示名称找到ID，然后获取配置
        guard let soundID = displayNameManager.getSoundID(for: soundName) else {
            Logger.warning("未找到音效: \(soundName)", category: .soundManager)
            return
        }
        let config = soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: soundName)
        audioService.playSound(soundName: soundName, config: config)
    }
    
    /// Play multiple sounds by instance names（推荐调用）
    func playMultiSounds(names: [String]) {
        var validNames: [String] = []
        var validURLs: [URL] = []
        for n in names {
            if let u = getURL(for: n) {
                // 获取baseSoundName用于AudioService
                if let config = getSoundConfig(byDisplayName: n) {
                    validNames.append(config.baseSoundName)
                } else {
                    validNames.append(n)
                }
                validURLs.append(u)
            }
        }
        guard !validNames.isEmpty else { return }
        audioService.playSounds(names: validNames, urls: validURLs, playMode: soundPlayMode, soundConfigs: soundConfigs)
    }
    
    /// Play multiple sounds by instance names for specific image（新方法，支持独立性）
    func playMultiSounds(names: [String], for imageName: String, imageManager: ImageManager) {
        var validBaseSoundNames: [String] = []
        var validDisplayNames: [String] = []
        var validURLs: [URL] = []

        for n in names {
            if let u = getURL(for: n) {
                // 获取baseSoundName用于AudioService，保留显示名称用于配置查找
                if let config = getSoundConfig(byDisplayName: n) {
                    validBaseSoundNames.append(config.baseSoundName)
                    validDisplayNames.append(n)
                } else {
                    validBaseSoundNames.append(n)
                    validDisplayNames.append(n)
                }
                validURLs.append(u)
            }
        }
        guard !validBaseSoundNames.isEmpty else { return }

        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        let imageSettings = imageManager.getImageSettings(for: imageName, in: modeContext)

        // 创建以baseSoundName为键的配置字典
        var finalSoundConfigs: [String: SoundConfig] = [:]

        for (index, baseSoundName) in validBaseSoundNames.enumerated() {
            let displayName = validDisplayNames[index]

            // 从imageSettings中获取配置（使用显示名称）
            // 通过显示名称找到ID，然后获取配置
            guard let soundID = displayNameManager.getSoundID(for: displayName) else {
                Logger.warning("未找到音效: \(displayName)", category: .soundManager)
                continue
            }
            var config = imageSettings.soundConfigs[displayName] ?? soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: displayName)

            if imageSettings.enableBacktrack {
                config.backtrackDuration = imageSettings.backtrackDuration
            }

            // 使用baseSoundName作为键存储配置
            finalSoundConfigs[baseSoundName] = config
        }

        // 使用图片独立的播放模式和更新后的配置
        audioService.playSounds(names: validBaseSoundNames, urls: validURLs, playMode: imageSettings.soundPlayMode, soundConfigs: finalSoundConfigs)
    }
    
    /// Play multiple sounds by instance names for specific image with completion callback
    func playMultiSounds(names: [String], for imageName: String, imageManager: ImageManager, completion: @escaping () -> Void) {
        var validBaseSoundNames: [String] = []
        var validDisplayNames: [String] = []
        var validURLs: [URL] = []

        for n in names {
            if let u = getURL(for: n) {
                // 获取baseSoundName用于AudioService，保留显示名称用于配置查找
                if let config = getSoundConfig(byDisplayName: n) {
                    validBaseSoundNames.append(config.baseSoundName)
                    validDisplayNames.append(n)
                } else {
                    validBaseSoundNames.append(n)
                    validDisplayNames.append(n)
                }
                validURLs.append(u)
            }
        }
        guard !validBaseSoundNames.isEmpty else {
            completion()
            return
        }

        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        let imageSettings = imageManager.getImageSettings(for: imageName, in: modeContext)

        // 创建以baseSoundName为键的配置字典
        var finalSoundConfigs: [String: SoundConfig] = [:]

        for (index, baseSoundName) in validBaseSoundNames.enumerated() {
            let displayName = validDisplayNames[index]

            // 从imageSettings中获取配置（使用显示名称）
            // 通过显示名称找到ID，然后获取配置
            guard let soundID = displayNameManager.getSoundID(for: displayName) else {
                Logger.warning("未找到音效: \(displayName)", category: .soundManager)
                continue
            }
            var config = imageSettings.soundConfigs[displayName] ?? soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: displayName)

            if imageSettings.enableBacktrack {
                config.backtrackDuration = imageSettings.backtrackDuration
            }

            // 使用baseSoundName作为键存储配置
            finalSoundConfigs[baseSoundName] = config
        }

        // 使用图片独立的播放模式和更新后的配置
        audioService.playSounds(names: validBaseSoundNames, urls: validURLs, playMode: imageSettings.soundPlayMode, soundConfigs: finalSoundConfigs, completion: completion)
    }
    
    /// 兼容旧代码：接受URL数组，将其映射为文件名（无法区分实例名），将使用默认配置
    func playMultiSounds(urls: [URL]) {
        let names = urls.map { url in url.lastPathComponent.replacingOccurrences(of: ".mp3", with: "") }
        audioService.playSounds(names: names, urls: urls, playMode: soundPlayMode, soundConfigs: soundConfigs)
    }
    
    /// Stop all sounds
    public func stopSound() {
        audioService.stopAllAudio()
    }
    
    /// Check if any sound is playing
    func isPlaying() -> Bool {
        return audioService.isPlaying()
    }
    
    /// 回溯当前播放的音效，不触发音效切换
    func backtrackCurrentSound() {
        if audioService.isPlaying() {
            // 正在播放：回溯当前音效
            audioService.backtrackCurrentSound()
        } else {
            // 已停止：重新播放最近播放的音效集合（携带原有配置）
            audioService.replayLastSounds()
        }
    }
    
    /// Update sound order
    func updateSoundOrder(_ orderedSounds: [String]) {
        var newOrder: [String: Int] = [:]
        for (index, sound) in orderedSounds.enumerated() {
            newOrder[sound] = index
        }
        sequentialSoundOrder = newOrder
    }
    
    /// Reset sequential order
    func resetSequentialOrder() {
        sequentialSoundOrder.removeAll()
        nextSequenceNumber = 1
    }
    
    /// Toggle sound play mode
    func toggleSoundPlayMode() {
        switch soundPlayMode {
        case .sequential:
            soundPlayMode = .random
        case .random:
            soundPlayMode = .sequential
        }

        if soundPlayMode != .sequential {
            resetSequentialOrder()
        }
    }
    
    /// Reset sounds to default order
    func resetSoundsToDefaultOrder() {
        // Clear order configuration
        sequentialSoundOrder.removeAll()
        nextSequenceNumber = 1
        
        // Reorganize selected sounds in default order
        let orderedSelectedSounds = AppConfig.defaultSounds.filter { selectedSoundsOrder.contains($0) }
        let otherSelectedSounds = selectedSoundsOrder.filter { !AppConfig.defaultSounds.contains($0) }
        selectedSoundsOrder = orderedSelectedSounds + otherSelectedSounds
        
        // Assign new sequence numbers
        for (index, sound) in selectedSoundsOrder.enumerated() {
            sequentialSoundOrder[sound] = index + 1
        }
        nextSequenceNumber = selectedSoundsOrder.count + 1
    }
    
    /// Set sound for image
    func setSound(for imageName: String, soundURL: URL) {
        imageSounds[imageName] = soundURL
        // 持久化
        dataService.save(imageSounds, forKey: "imageSounds")
    }
    
    /// Set multiple sounds for image by sound instance names
    func setMultiSoundNames(for imageName: String, soundNames: [String]) {
        imageMultiSounds[imageName] = soundNames
        // 持久化
        dataService.save(imageMultiSounds, forKey: "imageMultiSounds")
    }
    
    /// Get sound instance names for image
    func getSoundNames(for imageName: String) -> [String] {
        return imageMultiSounds[imageName] ?? []
    }
    
    /// Convenience: get URLs for image
    func getSoundURLs(for imageName: String) -> [URL] {
        return getSoundNames(for: imageName).compactMap { getURL(for: $0) }
    }
    
    /// Remove sound from image
    func removeSound(from imageName: String) {
        imageSounds.removeValue(forKey: imageName)
        imageMultiSounds.removeValue(forKey: imageName)
    }
    
    /// Remove all sounds associated with an image when the image is deleted
    func removeSoundsForImage(_ imageName: String) {
        // 删除单声音关联
        imageSounds.removeValue(forKey: imageName)
        
        // 删除多声音关联
        imageMultiSounds.removeValue(forKey: imageName)
        
        // 保存更改
        dataService.save(imageSounds, forKey: "imageSounds")
        dataService.save(imageMultiSounds, forKey: "imageMultiSounds")
    }
    
    /// Get all available sound names
    func getAvailableSounds() -> [String] {
        return AppConfig.defaultSounds
    }
    
    // MARK: - Sound Config Cloning

    /// 克隆指定音效配置，生成新的唯一名称并返回
    /// - Parameter originalName: 原始音效配置名称
    /// - Returns: 新生成的唯一配置名称，若克隆失败返回原始名称
    @discardableResult
    func cloneSoundConfig(from originalName: String) -> String {
        // 获取要克隆的配置，若不存在则创建默认配置
        // 通过显示名称找到ID，然后获取配置
        guard let soundID = displayNameManager.getSoundID(for: originalName) else {
            Logger.warning("未找到音效: \(originalName)", category: .soundManager)
            return originalName
        }
        let originalConfig = soundConfigs[soundID] ?? SoundConfig(id: soundID, baseSoundName: originalName)

        // 生成新唯一显示名称：<原始名>_<4位UUID>
        let uuidSuffix = String(UUID().uuidString.prefix(4))
        var newDisplayName = "\(originalName)_\(uuidSuffix)"

        // 确保显示名称唯一
        while displayNameManager.isDisplayNameExists(newDisplayName) {
            newDisplayName = "\(originalName)_\(String(UUID().uuidString.prefix(4)))"
        }

        // 创建新的音效配置
        let newSoundID = createSound(displayName: newDisplayName, baseSoundName: originalConfig.baseSoundName)

        // 复制原配置的属性到新配置
        if var newConfig = soundConfigs[newSoundID] {
            newConfig.playbackRate = originalConfig.playbackRate
            newConfig.volume = originalConfig.volume
            newConfig.startTime = originalConfig.startTime
            newConfig.endTime = originalConfig.endTime
            newConfig.backtrackDuration = originalConfig.backtrackDuration
            soundConfigs[newSoundID] = newConfig
            dataService.saveSoundConfig(newConfig, for: newConfig.baseSoundName)
        }

        Logger.success("已克隆音效配置: \(originalName) ➡️ \(newDisplayName)", category: .soundManager)
        return newDisplayName
    }
    

    
    // MARK: - Private Methods
    
    private func loadData() {
        // 灰度开关：异步或同步加载
        if AppConfig.useAsyncSoundLoad {
            Task {
                // 顺序 await（避免 async let 捕获限制）
                let decodedConfigs = await dataService.loadSoundConfigsAsync()

                let imgData = await DataStoreActor.shared.data(forKey: "imageSounds")
                let decodedImageSounds: [String: URL] = {
                    if let d = imgData {
                        return (try? JSONDecoder().decode([String: URL].self, from: d)) ?? [:]
                    }
                    return [:]
                }()

                let multiData = await DataStoreActor.shared.data(forKey: "imageMultiSounds")
                let decodedMulti: [String: [String]] = {
                    if let d = multiData {
                        return (try? JSONDecoder().decode([String: [String]].self, from: d)) ?? [:]
                    }
                    return [:]
                }()

                await MainActor.run { [weak self] in
                    guard let self = self else { return }

                    // 加载显示名称映射（异步路径）
                    // TODO: 实现异步加载显示名称映射

                    // 🔧 修复：只加载有效的配置，过滤掉可能被污染的数据
                    var cleanConfigs: [SoundID: SoundConfig] = [:]

                    // 首先处理默认音效，确保它们有干净的默认配置
                    for soundName in AppConfig.defaultSounds {
                        if let existingSoundID = self.displayNameManager.getSoundID(for: soundName) {
                            // 为默认音效创建干净的默认配置，不使用可能被污染的旧配置
                            cleanConfigs[existingSoundID] = SoundConfig(id: existingSoundID, baseSoundName: soundName)
                            Logger.debug("数据清理(异步): 为默认音效 '\(soundName)' 创建干净配置", category: .soundManager)
                        } else {
                            // 如果没有显示名称映射，创建新的音效
                            let newSoundID = self.createSound(displayName: soundName, baseSoundName: soundName)
                            cleanConfigs[newSoundID] = SoundConfig(id: newSoundID, baseSoundName: soundName)
                            Logger.debug("数据清理(异步): 为默认音效 '\(soundName)' 创建新映射和配置", category: .soundManager)
                        }
                    }

                    // 然后处理非默认音效（用户自定义音效），保留其配置
                    for (oldKey, config) in decodedConfigs {
                        // 检查是否是默认音效
                        if !AppConfig.defaultSounds.contains(config.baseSoundName) {
                            // 非默认音效，尝试迁移到新的数据结构
                            if let soundID = self.displayNameManager.getSoundID(for: oldKey) {
                                cleanConfigs[soundID] = config
                                Logger.debug("数据迁移(异步): 迁移非默认音效配置: '\(oldKey)' -> '\(soundID)'", category: .soundManager)
                            }
                        }
                    }

                    self.soundConfigs = cleanConfigs

                    self.imageSounds = decodedImageSounds

                    // 清除默认图片的预分配音效（优化：新安装app时不默认选中音效）
                    var cleanedMulti = decodedMulti
                    for defaultImage in AppConfig.defaultImages {
                        cleanedMulti[defaultImage] = []
                    }
                    self.imageMultiSounds = cleanedMulti
                }
            }
        } else {
            // 同步旧路径
            let loadedConfigs = dataService.loadSoundConfigs()

            // 加载显示名称映射
            if let savedDisplayNameManager: SoundDisplayNameManager = dataService.load(SoundDisplayNameManager.self, forKey: "soundDisplayNameManager") {
                displayNameManager = savedDisplayNameManager
            }

            // 🔧 修复：只加载有效的配置，过滤掉可能被污染的数据
            var cleanConfigs: [SoundID: SoundConfig] = [:]

            // 首先处理默认音效，确保它们有干净的默认配置
            for soundName in AppConfig.defaultSounds {
                if let existingSoundID = displayNameManager.getSoundID(for: soundName) {
                    // 为默认音效创建干净的默认配置，不使用可能被污染的旧配置
                    cleanConfigs[existingSoundID] = SoundConfig(id: existingSoundID, baseSoundName: soundName)
                    Logger.debug("数据清理: 为默认音效 '\(soundName)' 创建干净配置", category: .soundManager)
                } else {
                    // 如果没有显示名称映射，创建新的音效
                    let newSoundID = createSound(displayName: soundName, baseSoundName: soundName)
                    cleanConfigs[newSoundID] = SoundConfig(id: newSoundID, baseSoundName: soundName)
                    Logger.debug("数据清理: 为默认音效 '\(soundName)' 创建新映射和配置", category: .soundManager)
                }
            }

            // 然后处理非默认音效（用户自定义音效），保留其配置
            for (oldKey, config) in loadedConfigs {
                // 检查是否是默认音效
                if !AppConfig.defaultSounds.contains(config.baseSoundName) {
                    // 非默认音效，尝试迁移到新的数据结构
                    if let soundID = displayNameManager.getSoundID(for: oldKey) {
                        cleanConfigs[soundID] = config
                        Logger.debug("数据迁移: 迁移非默认音效配置: '\(oldKey)' -> '\(soundID)'", category: .soundManager)
                    }
                }
            }

            soundConfigs = cleanConfigs

            if let savedImageSounds: [String: URL] = dataService.load([String: URL].self, forKey: "imageSounds") {
                imageSounds = savedImageSounds
            }
            if let savedMulti: [String: [String]] = dataService.load([String: [String]].self, forKey: "imageMultiSounds") {
                // 清除默认图片的预分配音效（优化：新安装app时不默认选中音效）
                var cleanedMulti = savedMulti
                for defaultImage in AppConfig.defaultImages {
                    cleanedMulti[defaultImage] = []
                }
                imageMultiSounds = cleanedMulti
            }
        }
    }
    
    /// 计算按照配置裁剪后的实际时长
    private func effectiveDuration(for soundName: String, config: SoundConfig) -> TimeInterval {
        guard let url = getURL(for: soundName) else { return 1 }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            let total = player.duration
            let end = config.endTime ?? total
            let start = config.startTime
            let effective = max(0.1, end - start)
            return effective
        } catch {
            return 1
        }
    }
    
    // 加载配方
    // 已移除配方持久化

    /// 保存数据
    private func saveData() {
        // 保存音效配置
        dataService.save(soundConfigs, forKey: "soundConfigs")

        // 保存显示名称映射
        dataService.save(displayNameManager, forKey: "soundDisplayNameManager")

        // 保存其他数据
        dataService.save(imageSounds, forKey: "imageSounds")
        dataService.save(imageMultiSounds, forKey: "imageMultiSounds")
    }
}
