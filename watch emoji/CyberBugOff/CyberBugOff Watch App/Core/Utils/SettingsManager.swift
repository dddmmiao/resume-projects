import Foundation
import WatchKit

/// 全局设置管理器
class SettingsManager: ObservableObject {
    static let shared = SettingsManager()
    
    // MARK: - UserDefaults Keys
    private enum Keys {
        static let hapticFeedbackEnabled = "hapticFeedbackEnabled"
        static let hasCompletedTutorial = "hasCompletedTutorial"
    }
    
    // MARK: - Published Properties
    
    /// 触觉反馈开关
    @Published var hapticFeedbackEnabled: Bool {
        didSet {
            UserDefaults.standard.set(hapticFeedbackEnabled, forKey: Keys.hapticFeedbackEnabled)
        }
    }
    
    /// 是否已完成教程
    @Published var hasCompletedTutorial: Bool {
        didSet {
            UserDefaults.standard.set(hasCompletedTutorial, forKey: Keys.hasCompletedTutorial)
        }
    }
    
    // MARK: - Initialization
    
    private init() {
        // 加载保存的设置，默认开启触觉反馈
        self.hapticFeedbackEnabled = UserDefaults.standard.object(forKey: Keys.hapticFeedbackEnabled) as? Bool ?? true
        self.hasCompletedTutorial = UserDefaults.standard.bool(forKey: Keys.hasCompletedTutorial)
    }
    
    // MARK: - Haptic Feedback
    
    /// 播放触觉反馈（如果启用）
    func playHaptic(_ type: WKHapticType) {
        guard hapticFeedbackEnabled else { return }
        WKInterfaceDevice.current().play(type)
    }
    
    /// 播放成功触觉反馈
    func playSuccessHaptic() {
        playHaptic(.success)
    }
    
    /// 播放点击触觉反馈
    func playClickHaptic() {
        playHaptic(.click)
    }
    
    // MARK: - Tutorial
    
    /// 标记教程已完成
    func markTutorialCompleted() {
        hasCompletedTutorial = true
    }
    
    /// 重置教程状态（用于重新播放教程）
    func resetTutorial() {
        hasCompletedTutorial = false
    }
    
    // MARK: - Storage Statistics
    
    /// 获取缓存占用空间（字节）
    func getCacheSize() -> Int64 {
        var totalSize: Int64 = 0
        
        // 计算Documents目录大小
        if let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            totalSize += getDirectorySize(at: documentsPath)
        }
        
        // 计算Caches目录大小
        if let cachesPath = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            totalSize += getDirectorySize(at: cachesPath)
        }
        
        return totalSize
    }
    
    /// 获取格式化的缓存大小字符串
    func getFormattedCacheSize() -> String {
        let size = getCacheSize()
        return formatBytes(size)
    }
    
    /// 获取目录大小
    private func getDirectorySize(at url: URL) -> Int64 {
        var size: Int64 = 0
        let fileManager = FileManager.default
        
        guard let enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) else {
            return 0
        }
        
        for case let fileURL as URL in enumerator {
            do {
                let resourceValues = try fileURL.resourceValues(forKeys: [.fileSizeKey])
                size += Int64(resourceValues.fileSize ?? 0)
            } catch {
                // 忽略错误，继续计算
            }
        }
        
        return size
    }
    
    /// 格式化字节数为可读字符串
    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
    
    // MARK: - Reset
    
    /// 重置所有设置到默认值
    func resetAllSettings() {
        hapticFeedbackEnabled = true
        // 不重置教程状态
    }
}
