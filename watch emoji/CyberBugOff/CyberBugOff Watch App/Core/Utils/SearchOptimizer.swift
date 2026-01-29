//
//  SearchOptimizer.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation
import UIKit

/// 统一的高效查找接口
struct SearchOptimizer {
    
    // MARK: - Search Protocols
    
    /// 通用查找协议
    protocol Searchable {
        associatedtype IDType: Hashable
        associatedtype ItemType
        
        func findByID(_ id: IDType) -> ItemType?
        func findByName(_ name: String) -> ItemType?
        func getAllIDs() -> [IDType]
        func getAllNames() -> [String]
    }
    
    // MARK: - Optimized Search Methods
    
    /// 高效的音效查找
    struct SoundSearch {
        private let soundManager: SoundManager
        
        init(soundManager: SoundManager) {
            self.soundManager = soundManager
        }
        
        /// 通过显示名称查找音效配置（优化版）
        func findConfig(byDisplayName name: String) -> SoundConfig? {
            return PerformanceMonitor.measure(label: "SoundID Lookup") {
                // 先检查缓存
                if let cached = CacheManager.shared.getSoundConfig(for: name) {
                    // Cache hit logged
                    return cached
                }
                // Cache miss logged
                
                // 执行ID-based查找
                guard let soundID = soundManager.displayNameManager.getSoundID(for: name) else {
                        return nil
                }
                
                let config = soundManager.getSoundConfig(byID: soundID)
                
                // 缓存结果
                if let config = config {
                    CacheManager.shared.setSoundConfig(config, for: name)
                }
                
                return config
            }
        }
        
        /// 通过SoundID查找音效配置（优化版）
        func findConfig(byID soundID: SoundID) -> SoundConfig? {
            return PerformanceMonitor.measure(label: "SoundID Lookup") {
                // 先检查缓存
                let displayName = soundManager.displayNameManager.getDisplayName(for: soundID)
                if let cached = CacheManager.shared.getSoundConfig(for: displayName) {
                    // Cache hit logged
                    return cached
                }
                // Cache miss logged
                
                // 执行查找
                let config = soundManager.getSoundConfig(byID: soundID)
                
                // 缓存结果
                if let config = config {
                    CacheManager.shared.setSoundConfig(config, for: displayName)
                }
                
                return config
            }
        }
        
        /// 批量查找音效配置
        func findConfigs(byDisplayNames names: [String]) -> [String: SoundConfig] {
            return PerformanceMonitor.measure(label: "批量音效查找") {
                var results: [String: SoundConfig] = [:]
                
                for name in names {
                    if let config = findConfig(byDisplayName: name) {
                        results[name] = config
                    }
                }
                
                return results
            }
        }
        
        /// 模糊匹配查找
        func fuzzySearch(query: String, limit: Int = 10) -> [String] {
            return PerformanceMonitor.measure(label: "模糊音效搜索") {
                let allNames = soundManager.getAllSoundDisplayNames()
                let lowercaseQuery = query.lowercased()
                
                // 精确匹配优先
                var exactMatches: [String] = []
                var prefixMatches: [String] = []
                var containsMatches: [String] = []
                
                for name in allNames {
                    let lowercaseName = name.lowercased()
                    
                    if lowercaseName == lowercaseQuery {
                        exactMatches.append(name)
                    } else if lowercaseName.hasPrefix(lowercaseQuery) {
                        prefixMatches.append(name)
                    } else if lowercaseName.contains(lowercaseQuery) {
                        containsMatches.append(name)
                    }
                }
                
                // 合并结果，精确匹配优先
                var results = exactMatches + prefixMatches + containsMatches
                if results.count > limit {
                    results = Array(results.prefix(limit))
                }
                
                return results
            }
        }
    }
    
    /// 高效的图片查找
    struct ImageSearch {
        private let imageManager: ImageManager
        
        init(imageManager: ImageManager) {
            self.imageManager = imageManager
        }
        
        /// 通过名称查找图片（优化版）
        func findImage(byName name: String) -> UIImage? {
            return PerformanceMonitor.measure(label: "ImageID Lookup") {
                // 先检查缓存
                if let cached = CacheManager.shared.getDisplayImage(for: name) {
                    // Cache hit logged
                    return cached
                }
                // Cache miss logged
                
                // 执行查找
                let image = imageManager.getDisplayImage(for: name)
                
                // 缓存结果
                if let image = image {
                    CacheManager.shared.setDisplayImage(image, for: name)
                }
                
                return image
            }
        }
        
        /// 批量预加载图片
        func preloadImages(_ names: [String]) {
            DispatchQueue.global(qos: .utility).async {
                PerformanceMonitor.measure(label: "批量图片预加载") {
                    for name in names.prefix(5) { // 限制预加载数量
                        _ = self.findImage(byName: name)
                    }
                }
            }
        }
        
        /// 模糊匹配查找图片
        func fuzzySearch(query: String, limit: Int = 10) -> [String] {
            return PerformanceMonitor.measure(label: "模糊图片搜索") {
                let allNames = imageManager.getImageNames()
                let lowercaseQuery = query.lowercased()
                
                var exactMatches: [String] = []
                var prefixMatches: [String] = []
                var containsMatches: [String] = []
                
                for name in allNames {
                    let lowercaseName = name.lowercased()
                    
                    if lowercaseName == lowercaseQuery {
                        exactMatches.append(name)
                    } else if lowercaseName.hasPrefix(lowercaseQuery) {
                        prefixMatches.append(name)
                    } else if lowercaseName.contains(lowercaseQuery) {
                        containsMatches.append(name)
                    }
                }
                
                var results = exactMatches + prefixMatches + containsMatches
                if results.count > limit {
                    results = Array(results.prefix(limit))
                }
                
                return results
            }
        }
    }
    
    // MARK: - Performance Optimization
    
    /// 搜索性能统计
    static func logSearchPerformance() {
        #if DEBUG
        Logger.debug("=== 搜索性能统计 ===", category: .performance)
        CacheManager.shared.logCacheStatistics()
        #endif
    }
    
    /// 清除搜索缓存
    static func clearSearchCaches() {
        CacheManager.shared.clearAllCaches()

    }
    
    /// 优化搜索性能
    static func optimizeSearchPerformance() {
        // 清理低效的缓存项
    }
}

// MARK: - Extensions

extension SearchOptimizer {
    
    /// 创建音效搜索器
    static func soundSearch(with soundManager: SoundManager) -> SoundSearch {
        return SoundSearch(soundManager: soundManager)
    }
    
    /// 创建图片搜索器
    static func imageSearch(with imageManager: ImageManager) -> ImageSearch {
        return ImageSearch(imageManager: imageManager)
    }
}