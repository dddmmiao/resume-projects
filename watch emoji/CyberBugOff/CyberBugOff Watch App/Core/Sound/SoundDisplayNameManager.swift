import SwiftUI
import Foundation

// MARK: - 音效显示名称管理器
class SoundDisplayNameManager: ObservableObject, Codable {
    @Published private var soundNames: [SoundID: String] = [:]
    
    // MARK: - Codable支持
    enum CodingKeys: String, CodingKey {
        case soundNames
    }
    
    init() {}
    
    required init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        soundNames = try container.decode([SoundID: String].self, forKey: .soundNames)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(soundNames, forKey: .soundNames)
    }
    
    // MARK: - 公共方法
    
    /// 获取显示名称
    func getDisplayName(for soundID: SoundID) -> String {
        return soundNames[soundID] ?? "未知音效"
    }
    
    /// 设置显示名称 - O(1)操作
    func setDisplayName(for soundID: SoundID, name: String) {
        soundNames[soundID] = name
    }
    
    /// 通过显示名称查找ID
    func getSoundID(for displayName: String) -> SoundID? {
        return soundNames.first { $0.value == displayName }?.key
    }
    
    /// 获取所有显示名称
    func getAllDisplayNames() -> [String] {
        return Array(soundNames.values).sorted()
    }
    
    /// 获取所有ID到名称的映射
    func getAllMappings() -> [SoundID: String] {
        return soundNames
    }
    
    /// 获取所有音效ID
    func getAllSoundIDs() -> [SoundID] {
        return Array(soundNames.keys)
    }
    
    /// 删除音效名称映射
    func removeDisplayName(for soundID: SoundID) {
        soundNames.removeValue(forKey: soundID)
    }
    
    /// 生成新的音效ID
    func generateNewSoundID() -> SoundID {
        return UUID().uuidString
    }
    
    /// 检查显示名称是否已存在
    func isDisplayNameExists(_ name: String) -> Bool {
        return soundNames.values.contains(name)
    }
    
    /// 生成唯一的显示名称
    func generateUniqueDisplayName(baseName: String) -> String {
        var uniqueName = baseName
        var counter = 1
        
        while isDisplayNameExists(uniqueName) {
            uniqueName = "\(baseName) \(counter)"
            counter += 1
        }
        
        return uniqueName
    }
    
    /// 批量设置显示名称
    func setDisplayNames(_ mappings: [SoundID: String]) {
        for (soundID, name) in mappings {
            soundNames[soundID] = name
        }
    }
    
    /// 清空所有映射
    func clearAll() {
        soundNames.removeAll()
    }
    
    /// 获取映射数量
    var count: Int {
        return soundNames.count
    }
    
    /// 检查是否为空
    var isEmpty: Bool {
        return soundNames.isEmpty
    }
}

// MARK: - 扩展：调试支持
extension SoundDisplayNameManager {
    /// 打印所有映射（调试用）
    func printAllMappings() {
        #if DEBUG
        Logger.debug("=== Sound Display Name Mappings ===", category: .soundManager)
        for (soundID, displayName) in soundNames.sorted(by: { $0.value < $1.value }) {
            Logger.debug("\(displayName) -> \(soundID)", category: .soundManager)
        }
        Logger.debug("Total: \(count) mappings", category: .soundManager)
        #endif
    }
    
    /// 验证数据完整性
    func validateIntegrity() -> Bool {
        // 检查是否有重复的显示名称
        let displayNames = Array(soundNames.values)
        let uniqueDisplayNames = Set(displayNames)
        
        if displayNames.count != uniqueDisplayNames.count {
            #if DEBUG
            Logger.warning("Warning: Duplicate display names found", category: .soundManager)
            #endif
            return false
        }
        
        // 检查是否有空的显示名称
        if soundNames.values.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            #if DEBUG
            Logger.warning("Warning: Empty display names found", category: .soundManager)
            #endif
            return false
        }
        
        return true
    }
}
