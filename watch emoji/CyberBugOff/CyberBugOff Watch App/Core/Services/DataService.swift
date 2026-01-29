import Foundation
import SwiftUI

// MARK: - Data Service
class DataService: ObservableObject {
    // MARK: - Private Properties
    private let userDefaults = UserDefaults.standard

    // 后台持久化队列，统一管理对 UserDefaults 的异步写入
    private static let persistenceQueue = DispatchQueue(label: "com.cyberbugoff.dataservice.persistence", qos: .utility)

    // 批量操作缓存，减少UserDefaults读写次数
    private var pendingWrites: [String: Any] = [:]
    private var batchWriteTimer: Timer?
    private let batchWriteInterval: TimeInterval = 0.5 // 500ms批量写入

    // MARK: - Singleton
    static let shared = DataService()
    
    private init() {}

    // MARK: - 批量写入优化

    /// 批量写入数据，减少UserDefaults操作次数
    private func batchWrite(_ key: String, value: Any) {
        pendingWrites[key] = value

        // 重置定时器
        batchWriteTimer?.invalidate()
        batchWriteTimer = Timer.scheduledTimer(withTimeInterval: batchWriteInterval, repeats: false) { [weak self] _ in
            self?.flushPendingWrites()
        }
    }

    /// 立即执行所有待写入的数据
    private func flushPendingWrites() {
        guard !pendingWrites.isEmpty else { return }

        let writesToFlush = pendingWrites
        pendingWrites.removeAll()

        DataService.persistenceQueue.async { [weak self] in
            guard let self = self else { return }
            for (key, value) in writesToFlush {
                self.userDefaults.set(value, forKey: key)
            }
        }
    }

    /// 强制立即写入所有待处理数据
    func forceBatchFlush() {
        batchWriteTimer?.invalidate()
        flushPendingWrites()
    }
    
    // MARK: - Image Settings Management

    /// Save image settings to UserDefaults (向后兼容版本)
    func saveImageSettings(_ settings: ImageSettings, for imageName: String) {
        saveImageSettings(settings, for: imageName, in: nil)
    }

    /// Save image settings to UserDefaults with mode context
    func saveImageSettings(_ settings: ImageSettings, for imageName: String, in modeContext: ModeContext?) {
        let key = generateConfigKey(for: imageName, in: modeContext)

        // 异步写入 UserDefaults 通过 Actor
        Task {
            var settingsWithContext = settings
            settingsWithContext.modeContext = modeContext
            do {
                let data = try JSONEncoder().encode(settingsWithContext)
                await DataStoreActor.shared.set(data, forKey: key)
            } catch {
                Logger.DataService.error("保存图片设置失败: \(error)")
            }
        }
    }

    /// 同步保存 ImageSettings，立即写入 UserDefaults（用于关键配置）
    func saveImageSettingsSync(_ settings: ImageSettings, for imageName: String, in modeContext: ModeContext?) {
        var s = settings
        s.modeContext = modeContext
        let key = generateConfigKey(for: imageName, in: modeContext)
        if let data = try? JSONEncoder().encode(s) {
            userDefaults.set(data, forKey: key)
        }
    }

    /// Load image settings from UserDefaults (向后兼容版本)
    func loadImageSettings(for imageName: String) -> ImageSettings {
        return loadImageSettings(for: imageName, in: nil)
    }

    /// Load image settings from UserDefaults with mode context
    func loadImageSettings(for imageName: String, in modeContext: ModeContext?) -> ImageSettings {
        let key = generateConfigKey(for: imageName, in: modeContext)

        // 首先尝试加载指定mode的配置
        if let data = userDefaults.data(forKey: key) {
            do {
                var settings = try JSONDecoder().decode(ImageSettings.self, from: data)
                settings.modeContext = modeContext
                return settings
            } catch {
                Logger.DataService.error("加载图片设置失败: \(error)")
            }
        }

        // 如果是非默认mode且没有找到配置，尝试继承默认mode的配置
        if let modeContext = modeContext, modeContext != ModeContext.default {
            let defaultKey = generateConfigKey(for: imageName, in: ModeContext.default)
            if let data = userDefaults.data(forKey: defaultKey) {
                do {
                    var settings = try JSONDecoder().decode(ImageSettings.self, from: data)
                    // 创建新的配置实例，继承默认配置但使用新的mode上下文
                    settings.modeContext = modeContext
                    settings.clickCount = 0 // 重置计数器
                    return settings
                } catch {
                    Logger.error("继承默认配置失败: \(error)", category: .dataService)
                }
            }
        }

        // 最后返回新的默认配置
        return ImageSettings(modeContext: modeContext)
    }
    
    /// Save all image settings (向后兼容版本)
    func saveAllImageSettings(_ settings: [String: ImageSettings]) {
        for (imageName, setting) in settings {
            saveImageSettings(setting, for: imageName)
        }
    }

    /// Save all image settings with mode context
    func saveAllImageSettings(_ settings: [String: ImageSettings], in modeContext: ModeContext?) {
        for (imageName, setting) in settings {
            saveImageSettings(setting, for: imageName, in: modeContext)
        }
    }

    /// Load all image settings for given image names (向后兼容版本)
    func loadAllImageSettings(for imageNames: [String]) -> [String: ImageSettings] {
        return loadAllImageSettings(for: imageNames, in: nil)
    }

    /// Load all image settings for given image names with mode context
    func loadAllImageSettings(for imageNames: [String], in modeContext: ModeContext?) -> [String: ImageSettings] {
        var settings: [String: ImageSettings] = [:]

        for imageName in imageNames {
            settings[imageName] = loadImageSettings(for: imageName, in: modeContext)
        }

        return settings
    }

    // MARK: - Mode Configuration Management

    /// 生成配置存储键值
    private func generateConfigKey(for imageName: String, in modeContext: ModeContext?) -> String {
        if let modeContext = modeContext {
            return modeContext.configKey(for: imageName)
        } else {
            // 向后兼容：使用旧的键值格式
            return AppConfig.UserDefaultsKeys.imageSettings + imageName
        }
    }

    /// 获取所有mode的配置键值
    func getAllConfigKeys() -> [String] {
        let allKeys = userDefaults.dictionaryRepresentation().keys
        return allKeys.filter { key in
            key.hasPrefix("mode_") || key.hasPrefix(AppConfig.UserDefaultsKeys.imageSettings)
        }
    }

    /// 获取指定mode的所有配置
    func getAllImageSettings(in modeContext: ModeContext) -> [String: ImageSettings] {
        var settings: [String: ImageSettings] = [:]
        let allKeys = getAllConfigKeys()

        for key in allKeys {
            if let (context, imageName) = ModeContext.fromConfigKey(key),
               context.modeId == modeContext.modeId {
                settings[imageName] = loadImageSettings(for: imageName, in: modeContext)
            }
        }

        return settings
    }

    /// 删除指定mode的所有配置
    func deleteAllImageSettings(in modeContext: ModeContext) {
        let allKeys = getAllConfigKeys()

        for key in allKeys {
            if let (context, _) = ModeContext.fromConfigKey(key),
               context.modeId == modeContext.modeId {
                userDefaults.removeObject(forKey: key)
            }
        }
    }


    
    // MARK: - Sound Configuration Management
    
    /// Save sound configurations to UserDefaults
    func saveSoundConfigs(_ configs: [String: SoundConfig]) {
        Task {
            do {
                let data = try JSONEncoder().encode(configs)
                await DataStoreActor.shared.set(data, forKey: AppConfig.UserDefaultsKeys.soundConfigs)
            } catch {
                Logger.error("保存音效配置失败: \(error)", category: .dataService)
            }
        }
    }
    
    /// Load sound configurations from UserDefaults
    func loadSoundConfigs() -> [String: SoundConfig] {
        guard let data = userDefaults.data(forKey: AppConfig.UserDefaultsKeys.soundConfigs) else {
            return [:]
        }
        
        do {
            return try JSONDecoder().decode([String: SoundConfig].self, from: data)
        } catch {
            Logger.error("加载音效配置失败: \(error)", category: .dataService)
            return [:]
        }
    }

    // Async version
    func loadSoundConfigsAsync() async -> [String: SoundConfig] {
        if let data = await DataStoreActor.shared.data(forKey: AppConfig.UserDefaultsKeys.soundConfigs) {
            if let decoded = try? JSONDecoder().decode([String: SoundConfig].self, from: data) {
                return decoded
            }
        }
        return [:]
    }
    
    /// Save individual sound config
    func saveSoundConfig(_ config: SoundConfig, for soundName: String) {
        var configs = loadSoundConfigs()
        configs[soundName] = config
        saveSoundConfigs(configs)
    }
    
    /// Get sound config for a specific sound
    func getSoundConfig(for soundName: String) -> SoundConfig {
        let configs = loadSoundConfigs()
        return configs[soundName] ?? SoundConfig(id: UUID().uuidString, baseSoundName: soundName)
    }
    
    // MARK: - Custom Trigger Display Management
    
    /// Save custom trigger displays to UserDefaults
    func saveCustomTriggerDisplays(_ displays: [String: CustomTriggerDisplay]) {
        let block = { [weak self] in
            guard let self = self else { return }
            do {
                let data = try JSONEncoder().encode(displays)
                self.userDefaults.set(data, forKey: AppConfig.UserDefaultsKeys.customTriggerDisplays)
            } catch {
                Logger.error("保存自定义触发显示失败: \(error)", category: .dataService)
            }
        }
        if AppConfig.useAsyncSave {
            DataService.persistenceQueue.async(execute: block)
        } else { block() }
    }
    
    /// Load custom trigger displays from UserDefaults
    func loadCustomTriggerDisplays() -> [String: CustomTriggerDisplay] {
        guard let data = userDefaults.data(forKey: AppConfig.UserDefaultsKeys.customTriggerDisplays) else {
            return [:]
        }
        
        do {
            return try JSONDecoder().decode([String: CustomTriggerDisplay].self, from: data)
        } catch {
            Logger.error("加载自定义触发显示失败: \(error)", category: .dataService)
            return [:]
        }
    }
    
    /// Save individual custom trigger display
    func saveCustomTriggerDisplay(_ display: CustomTriggerDisplay, for imageName: String) {
        var displays = loadCustomTriggerDisplays()
        displays[imageName] = display
        saveCustomTriggerDisplays(displays)
    }
    
    /// Get custom trigger display for a specific image
    /// 注意：这个方法会重新加载数据，建议使用TriggerManager的缓存版本
    func getCustomTriggerDisplay(for imageName: String) -> CustomTriggerDisplay {
        let displays = loadCustomTriggerDisplays()
        return displays[imageName] ?? CustomTriggerDisplay()
    }
    
    // MARK: - Selected Colors Management
    
    /// Save selected colors for image
    func saveSelectedColors(_ colors: Set<String>, for imageName: String) {
        let key = AppConfig.UserDefaultsKeys.selectedColors + imageName
        let colorArray = Array(colors)
        let block = { [weak self] in
            guard let self = self else { return }
            do {
                let data = try JSONEncoder().encode(colorArray)
                self.userDefaults.set(data, forKey: key)
            } catch {
                Logger.error("保存选中颜色失败: \(error)", category: .dataService)
            }
        }
        if AppConfig.useAsyncSave {
            DataService.persistenceQueue.async(execute: block)
        } else { block() }
    }
    
    /// Load selected colors for image
    func loadSelectedColors(for imageName: String) -> Set<String> {
        let key = AppConfig.UserDefaultsKeys.selectedColors + imageName
        
        guard let data = userDefaults.data(forKey: key) else {
            return Set(["white"]) // Default to white
        }
        
        do {
            let colorArray = try JSONDecoder().decode([String].self, from: data)
            return Set(colorArray)
        } catch {
            Logger.error("加载选中颜色失败: \(error)", category: .dataService)
            return Set(["white"])
        }
    }
    
    // MARK: - User Added Images Management

    /// Load user added images from UserDefaults
    func loadUserAddedImages() -> [String: URL]? {
        if let loaded: [String: String] = load([String: String].self, forKey: "userAddedImages") {
            let urlDict = loaded.reduce(into: [:]) { partial, pair in
                partial[pair.key] = URL(fileURLWithPath: pair.value)
            }
            return urlDict
        }
        return nil
    }

    // MARK: - Generic Data Management

    /// Save any Codable object to UserDefaults
    func save<T: Codable>(_ object: T, forKey key: String) {
        do {
            let data = try JSONEncoder().encode(object)
            userDefaults.set(data, forKey: key)
        } catch {
            Logger.error("保存数据失败 (key: \(key)): \(error)", category: .dataService)
        }
    }
    
    /// Load any Codable object from UserDefaults
    func load<T: Codable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = userDefaults.data(forKey: key) else {
            return nil
        }
        
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            Logger.error("加载数据失败 (key: \(key)): \(error)", category: .dataService)
            return nil
        }
    }
    
    /// Remove data for a specific key
    func removeData(forKey key: String) {
        userDefaults.removeObject(forKey: key)
    }
    
    /// Clear all app data
    func clearAllData() {
        let keys = [
            AppConfig.UserDefaultsKeys.soundConfigs,
            AppConfig.UserDefaultsKeys.customTriggerDisplays
        ]
        
        keys.forEach { key in
            userDefaults.removeObject(forKey: key)
        }
        
        // Clear image-specific data
        let imageNames = AppConfig.defaultImages
        imageNames.forEach { imageName in
            let imageSettingsKey = AppConfig.UserDefaultsKeys.imageSettings + imageName
            let selectedColorsKey = AppConfig.UserDefaultsKeys.selectedColors + imageName
            
            userDefaults.removeObject(forKey: imageSettingsKey)
            userDefaults.removeObject(forKey: selectedColorsKey)
        }
    }

    // MARK: - Async Loading
    /// Async load single ImageSettings
    func loadImageSettingsAsync(for imageName: String, in modeContext: ModeContext?) async -> ImageSettings {
        let key = generateConfigKey(for: imageName, in: modeContext)
        if let data = await DataStoreActor.shared.data(forKey: key) {
            do { var s = try JSONDecoder().decode(ImageSettings.self, from: data); s.modeContext = modeContext; return s } catch {}
        }
        return ImageSettings(modeContext: modeContext)
    }

    /// Async load multiple ImageSettings
    func loadAllImageSettingsAsync(for imageNames: [String], in modeContext: ModeContext?) async -> [String: ImageSettings] {
        var dict: [String: ImageSettings] = [:]
        for name in imageNames {
            dict[name] = await loadImageSettingsAsync(for: name, in: modeContext)
        }
        return dict
    }

} 