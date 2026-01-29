//
//  CacheManager.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation
import UIKit

/// 统一的缓存管理器
class CacheManager {
    
    // MARK: - Singleton
    
    static let shared = CacheManager()
    private init() {}
    
    // MARK: - Image Caches
    
    /// 显示图片缓存（watchOS 优化）
    private let displayImageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 30  // 减少到 30 张
        cache.totalCostLimit = 20 * 1024 * 1024 // 20MB（从 100MB 减少）
        cache.evictsObjectsWithDiscardedContent = true
        return cache
    }()
    
    /// 缩略图缓存（watchOS 优化）
    private let thumbnailCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 50  // 减少到 50 张
        cache.totalCostLimit = 10 * 1024 * 1024 // 10MB（从 50MB 减少）
        cache.evictsObjectsWithDiscardedContent = true
        return cache
    }()
    
    /// 原始图片缓存（用于圈选裁剪，watchOS 优化）
    private let originalImageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 10  // 减少到 10 张
        cache.totalCostLimit = 30 * 1024 * 1024 // 30MB（从 200MB 大幅减少）
        cache.evictsObjectsWithDiscardedContent = true
        return cache
    }()
    
    /// Toast 图片缓存（watchOS 优化）
    private let toastCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 30  // 30 张 Toast 图片
        cache.totalCostLimit = 5 * 1024 * 1024 // 5MB
        cache.evictsObjectsWithDiscardedContent = true
        return cache
    }()
    
    // MARK: - Settings Caches
    
    /// 图片设置缓存
    private var imageSettingsCache: [String: ImageSettings] = [:]
    private let settingsCacheQueue = DispatchQueue(label: "com.cyberbugoff.settings-cache", attributes: .concurrent)
    
    /// 音效配置缓存
    private var soundConfigCache: [String: SoundConfig] = [:]
    private let soundCacheQueue = DispatchQueue(label: "com.cyberbugoff.sound-cache", attributes: .concurrent)
    
    // MARK: - Image Cache Methods
    
    /// 获取显示图片
    func getDisplayImage(for key: String) -> UIImage? {
        let result = displayImageCache.object(forKey: key as NSString)

        return result
    }
    
    /// 设置显示图片
    func setDisplayImage(_ image: UIImage, for key: String) {
        let cost = Int(image.size.width * image.size.height * 4)
        displayImageCache.setObject(image, forKey: key as NSString, cost: cost)
    }
    
    /// 获取缩略图
    func getThumbnail(for key: String) -> UIImage? {
        let result = thumbnailCache.object(forKey: key as NSString)

        return result
    }
    
    /// 设置缩略图
    func setThumbnail(_ image: UIImage, for key: String) {
        let cost = Int(image.size.width * image.size.height * 4)
        thumbnailCache.setObject(image, forKey: key as NSString, cost: cost)
    }
    
    /// 获取原始图片
    func getOriginalImage(for key: String) -> UIImage? {
        let result = originalImageCache.object(forKey: key as NSString)

        return result
    }
    
    /// 设置原始图片
    func setOriginalImage(_ image: UIImage, for key: String) {
        let cost = Int(image.size.width * image.size.height * 4)
        originalImageCache.setObject(image, forKey: key as NSString, cost: cost)
    }
    
    /// 获取 Toast 图片
    func getToastImage(for key: String) -> UIImage? {
        return toastCache.object(forKey: key as NSString)
    }
    
    /// 设置 Toast 图片
    func setToastImage(_ image: UIImage, for key: String, cost: Int = 0) {
        if cost > 0 {
            toastCache.setObject(image, forKey: key as NSString, cost: cost)
        } else {
            let estimatedCost = Int(image.size.width * image.size.height * 4)
            toastCache.setObject(image, forKey: key as NSString, cost: estimatedCost)
        }
    }
    
    // MARK: - Settings Cache Methods
    
    /// 获取图片设置
    func getImageSettings(for key: String) -> ImageSettings? {
        return settingsCacheQueue.sync {
            let result = imageSettingsCache[key]
            if result != nil {
                // Cache hit logged
            } else {
                // Cache miss logged
            }
            return result
        }
    }
    
    /// 设置图片设置
    func setImageSettings(_ settings: ImageSettings, for key: String) {
        settingsCacheQueue.async(flags: .barrier) { [weak self] in
            self?.imageSettingsCache[key] = settings
        }
    }
    
    /// 获取音效配置
    func getSoundConfig(for key: String) -> SoundConfig? {
        return soundCacheQueue.sync {
            let result = soundConfigCache[key]
            if result != nil {
                // Cache hit logged
            } else {
                // Cache miss logged
            }
            return result
        }
    }
    
    /// 设置音效配置
    func setSoundConfig(_ config: SoundConfig, for key: String) {
        soundCacheQueue.async(flags: .barrier) { [weak self] in
            self?.soundConfigCache[key] = config
        }
    }
    
    // MARK: - Cache Management
    
    /// 清除所有图片缓存
    func clearImageCaches() {
        displayImageCache.removeAllObjects()
        thumbnailCache.removeAllObjects()
        originalImageCache.removeAllObjects()
        toastCache.removeAllObjects()
        Logger.info("已清除所有图片缓存（含Toast）", category: .cache)
    }
    
    /// 清除Toast图片缓存
    func clearToastCache() {
        toastCache.removeAllObjects()
        Logger.info("已清除Toast图片缓存", category: .cache)
    }
    
    /// 清除设置缓存
    func clearSettingsCaches() {
        settingsCacheQueue.async(flags: .barrier) { [weak self] in
            self?.imageSettingsCache.removeAll()
        }
        soundCacheQueue.async(flags: .barrier) { [weak self] in
            self?.soundConfigCache.removeAll()
        }
        Logger.info("已清除所有设置缓存", category: .cache)
    }
    
    /// 清除所有缓存
    func clearAllCaches() {
        clearImageCaches()
        clearSettingsCaches()
        Logger.info("已清除所有缓存", category: .cache)
    }
    
    /// 清除特定图片的所有相关缓存
    func clearCaches(for imageName: String) {
        displayImageCache.removeObject(forKey: imageName as NSString)
        thumbnailCache.removeObject(forKey: imageName as NSString)
        originalImageCache.removeObject(forKey: imageName as NSString)
        
        settingsCacheQueue.async(flags: .barrier) { [weak self] in
            self?.imageSettingsCache.removeValue(forKey: imageName)
        }
    }
    
    // MARK: - Cache Statistics
    
    /// 获取缓存统计信息
    func getCacheStatistics() -> CacheStatistics {
        let displayCount = displayImageCache.countLimit
        let thumbnailCount = thumbnailCache.countLimit
        let originalCount = originalImageCache.countLimit
        let toastCount = toastCache.countLimit
        
        let settingsCount = settingsCacheQueue.sync { imageSettingsCache.count }
        let soundCount = soundCacheQueue.sync { soundConfigCache.count }
        
        return CacheStatistics(
            displayImageCount: displayCount,
            thumbnailCount: thumbnailCount,
            originalImageCount: originalCount,
            toastImageCount: toastCount,
            imageSettingsCount: settingsCount,
            soundConfigCount: soundCount
        )
    }
    
    /// 记录缓存统计（仅DEBUG模式下输出）
    func logCacheStatistics() {
        #if DEBUG
        let stats = getCacheStatistics()
        Logger.debug("缓存统计 - 显示图片: \(stats.displayImageCount), 缩略图: \(stats.thumbnailCount), 原始图片: \(stats.originalImageCount), 图片设置: \(stats.imageSettingsCount), 音效配置: \(stats.soundConfigCount)", category: .cache)
        #endif
    }
    
    // MARK: - Memory Management
    
    /// 内存警告时的清理
    func handleMemoryWarning() {
        Logger.warning("收到内存警告，开始清理缓存", category: .cache)
        
        // 清理一半的图片缓存
        displayImageCache.countLimit = displayImageCache.countLimit / 2
        thumbnailCache.countLimit = thumbnailCache.countLimit / 2
        originalImageCache.countLimit = originalImageCache.countLimit / 2
        toastCache.countLimit = toastCache.countLimit / 2
        
        // 清理设置缓存中的一些项目
        settingsCacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }
            if self.imageSettingsCache.count > 20 {
                let keysToRemove = Array(self.imageSettingsCache.keys.prefix(self.imageSettingsCache.count / 2))
                for key in keysToRemove {
                    self.imageSettingsCache.removeValue(forKey: key)
                }
            }
        }
        
    }
    
    /// 恢复正常缓存限制（watchOS 优化后的限制）
    func restoreNormalCacheLimits() {
        thumbnailCache.countLimit = 50
        originalImageCache.countLimit = 10
        toastCache.countLimit = 30
    }
}

// MARK: - Supporting Types

/// 缓存统计信息
struct CacheStatistics {
    let displayImageCount: Int
    let thumbnailCount: Int
    let originalImageCount: Int
    let toastImageCount: Int
    let imageSettingsCount: Int
    let soundConfigCount: Int
}

// MARK: - Extensions

extension CacheManager {
    
    /// 预加载常用图片
    func preloadCommonImages(_ imageNames: [String], imageManager: ImageManager) {
        DispatchQueue.global(qos: .utility).async {
            for imageName in imageNames.prefix(10) { // 只预加载前10个
                if self.getDisplayImage(for: imageName) == nil {
                    if let image = imageManager.getDisplayImage(for: imageName) {
                        self.setDisplayImage(image, for: imageName)
                    }
                }
            }
            Logger.info("预加载常用图片完成", category: .cache)
        }
    }
}
