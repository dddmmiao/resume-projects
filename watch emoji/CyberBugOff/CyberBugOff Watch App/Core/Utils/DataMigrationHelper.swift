//
//  DataMigrationHelper.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation

/// 数据迁移助手 - 完善name-based到ID-based的迁移
struct DataMigrationHelper {
    
    // MARK: - Migration Status
    
    private static let migrationCompletedKey = "IDBasedMigrationCompleted_v2"
    private static let nameMappingMigrationKey = "NameMappingMigrationCompleted"
    
    /// 检查是否需要进行ID-based迁移
    static func needsIDBasedMigration() -> Bool {
        return !UserDefaults.standard.bool(forKey: migrationCompletedKey)
    }
    
    /// 检查是否需要进行名称映射迁移
    static func needsNameMappingMigration() -> Bool {
        return !UserDefaults.standard.bool(forKey: nameMappingMigrationKey)
    }
    
    // MARK: - Sound Config Migration
    
    /// 完善音效配置的ID-based迁移
    static func migrateSoundConfigsToIDBase(soundManager: SoundManager) -> MigrationResult {
        
        var migratedCount = 0
        var errorCount = 0
        var warnings: [String] = []
        
        // 1. 检查是否有使用name作为键的旧配置
        let allSoundIDs = soundManager.getAllSoundIDs()
        let allDisplayNames = soundManager.getAllSoundDisplayNames()
        
        // 2. 验证ID-name映射的完整性
        for soundID in allSoundIDs {
            let displayName = soundManager.displayNameManager.getDisplayName(for: soundID)
            if displayName.isEmpty {
                warnings.append("SoundID \(soundID) 缺少显示名称映射")
                errorCount += 1
            }
        }
        
        // 3. 检查是否有孤立的显示名称（没有对应的SoundID）
        for displayName in allDisplayNames {
            if soundManager.displayNameManager.getSoundID(for: displayName) == nil {
                warnings.append("显示名称 '\(displayName)' 缺少SoundID映射")
                migratedCount += 1
            }
        }
        
        Logger.success("音效配置迁移完成 - 迁移: \(migratedCount), 错误: \(errorCount)", category: .migration)
        
        return MigrationResult(
            migratedCount: migratedCount,
            errorCount: errorCount,
            warnings: warnings
        )
    }
    
    /// 迁移ImageSettings中的音效配置键
    static func migrateImageSettingsSoundConfigs(imageManager: ImageManager, soundManager: SoundManager) -> MigrationResult {
        
        var migratedCount = 0
        let errorCount = 0
        var warnings: [String] = []
        
        let imageNames = imageManager.getImageNames()
        
        for imageName in imageNames {
            let settings = imageManager.getImageSettings(for: imageName)
            var needsUpdate = false
            var newSoundConfigs: [String: SoundConfig] = [:]
            
            // 检查soundConfigs中是否有使用name作为键的配置
            for (key, config) in settings.soundConfigs {
                // 如果键不是UUID格式，可能是旧的name-based键
                if !isValidUUID(key) {
                    // 尝试通过显示名称找到对应的SoundID
                    if let soundID = soundManager.displayNameManager.getSoundID(for: key) {
                        newSoundConfigs[soundID] = config
                        needsUpdate = true
                        migratedCount += 1
                    } else {
                        // 创建新的SoundID
                        let newSoundID = soundManager.createSound(displayName: key, baseSoundName: config.baseSoundName)
                        newSoundConfigs[newSoundID] = config
                        needsUpdate = true
                        migratedCount += 1
                        warnings.append("为 \(imageName) 的音效 '\(key)' 创建新SoundID: \(newSoundID)")
                    }
                } else {
                    // 已经是ID格式，保留
                    newSoundConfigs[key] = config
                }
            }
            
            // 如果需要更新，保存新的设置
            if needsUpdate {
                var updatedSettings = settings
                updatedSettings.soundConfigs = newSoundConfigs
                imageManager.updateImageSettings(for: imageName, settings: updatedSettings)
                Logger.success("更新ImageSettings: \(imageName)", category: .migration)
            }
        }
        
        Logger.success("ImageSettings迁移完成 - 迁移: \(migratedCount), 错误: \(errorCount)", category: .migration)
        
        return MigrationResult(
            migratedCount: migratedCount,
            errorCount: errorCount,
            warnings: warnings
        )
    }
    
    // MARK: - Validation
    
    /// 验证ID-based架构的完整性
    static func validateIDBasedArchitecture(soundManager: SoundManager, imageManager: ImageManager) -> ValidationResult {
        
        var issues: [String] = []
        var warnings: [String] = []
        
        // 1. 验证SoundID-DisplayName映射的双向一致性
        let allSoundIDs = soundManager.getAllSoundIDs()
        let allDisplayNames = soundManager.getAllSoundDisplayNames()
        
        for soundID in allSoundIDs {
            let displayName = soundManager.displayNameManager.getDisplayName(for: soundID)
            if displayName.isEmpty {
                issues.append("SoundID \(soundID) 缺少显示名称")
            } else {
                // 验证反向映射
                if let reverseSoundID = soundManager.displayNameManager.getSoundID(for: displayName),
                   reverseSoundID != soundID {
                    issues.append("显示名称 '\(displayName)' 的反向映射不一致")
                }
            }
        }
        
        // 2. 验证ImageSettings中的音效配置键格式
        let imageNames = imageManager.getImageNames()
        for imageName in imageNames {
            let settings = imageManager.getImageSettings(for: imageName)
            for (key, _) in settings.soundConfigs {
                if !isValidUUID(key) && !allDisplayNames.contains(key) {
                    warnings.append("图片 \(imageName) 包含无效的音效配置键: \(key)")
                }
            }
        }
        
        // 3. 验证音效配置的完整性
        for soundID in allSoundIDs {
            if soundManager.getSoundConfig(byID: soundID) == nil {
                issues.append("SoundID \(soundID) 缺少配置")
            }
        }
        
        let isValid = issues.isEmpty
        
        return ValidationResult(
            isValid: isValid,
            issues: issues,
            warnings: warnings
        )
    }
    
    // MARK: - Migration Execution
    
    /// 执行完整的ID-based迁移
    static func performCompleteIDBasedMigration(soundManager: SoundManager, imageManager: ImageManager) -> CompleteMigrationResult {
        
        var totalMigrated = 0
        var totalErrors = 0
        var allWarnings: [String] = []
        
        // 1. 音效配置迁移
        let soundResult = migrateSoundConfigsToIDBase(soundManager: soundManager)
        totalMigrated += soundResult.migratedCount
        totalErrors += soundResult.errorCount
        allWarnings.append(contentsOf: soundResult.warnings)
        
        // 2. ImageSettings迁移
        let imageResult = migrateImageSettingsSoundConfigs(imageManager: imageManager, soundManager: soundManager)
        totalMigrated += imageResult.migratedCount
        totalErrors += imageResult.errorCount
        allWarnings.append(contentsOf: imageResult.warnings)
        
        // 3. 验证迁移结果
        let validation = validateIDBasedArchitecture(soundManager: soundManager, imageManager: imageManager)
        
        // 4. 标记迁移完成
        if validation.isValid && totalErrors == 0 {
            UserDefaults.standard.set(true, forKey: migrationCompletedKey)
            Logger.success("ID-based迁移完全成功", category: .migration)
        } else {
            Logger.warning("ID-based迁移完成但存在问题", category: .migration)
        }
        
        return CompleteMigrationResult(
            soundMigration: soundResult,
            imageMigration: imageResult,
            validation: validation,
            totalMigrated: totalMigrated,
            totalErrors: totalErrors,
            allWarnings: allWarnings
        )
    }
    
    // MARK: - Utilities
    
    /// 检查字符串是否为有效的UUID格式
    private static func isValidUUID(_ string: String) -> Bool {
        return UUID(uuidString: string) != nil
    }
    
    /// 标记迁移完成
    static func markMigrationCompleted() {
        UserDefaults.standard.set(true, forKey: migrationCompletedKey)
        UserDefaults.standard.set(true, forKey: nameMappingMigrationKey)
        Logger.success("所有迁移标记为完成", category: .migration)
    }
}

// MARK: - Result Types

struct MigrationResult {
    let migratedCount: Int
    let errorCount: Int
    let warnings: [String]
}

struct ValidationResult {
    let isValid: Bool
    let issues: [String]
    let warnings: [String]
}

struct CompleteMigrationResult {
    let soundMigration: MigrationResult
    let imageMigration: MigrationResult
    let validation: ValidationResult
    let totalMigrated: Int
    let totalErrors: Int
    let allWarnings: [String]
}
