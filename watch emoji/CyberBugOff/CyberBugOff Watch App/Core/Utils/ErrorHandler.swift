//
//  ErrorHandler.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation
import SwiftUI

/// 统一的错误处理工具
struct ErrorHandler {
    
    // MARK: - Error Types
    
    enum AppError: LocalizedError, Equatable {
        case imageLoadFailed(String)
        case imageProcessingFailed(String)
        case imageSaveFailed(String)
        case soundLoadFailed(String)
        case soundPlayFailed(String)
        case dataCorrupted(String)
        case settingsLoadFailed(String)
        case settingsSaveFailed(String)
        case networkError(String)
        case fileSystemError(String)
        case invalidConfiguration(String)
        case migrationFailed(String)
        case cacheError(String)
        case unknown(String)
        
        var errorDescription: String? {
            switch self {
            case .imageLoadFailed(let details):
                return "图片加载失败: \(details)"
            case .imageProcessingFailed(let details):
                return "图片处理失败: \(details)"
            case .imageSaveFailed(let details):
                return "图片保存失败: \(details)"
            case .soundLoadFailed(let details):
                return "音效加载失败: \(details)"
            case .soundPlayFailed(let details):
                return "音效播放失败: \(details)"
            case .dataCorrupted(let details):
                return "数据损坏: \(details)"
            case .settingsLoadFailed(let details):
                return "设置加载失败: \(details)"
            case .settingsSaveFailed(let details):
                return "设置保存失败: \(details)"
            case .networkError(let details):
                return "网络错误: \(details)"
            case .fileSystemError(let details):
                return "文件系统错误: \(details)"
            case .invalidConfiguration(let details):
                return "配置无效: \(details)"
            case .migrationFailed(let details):
                return "数据迁移失败: \(details)"
            case .cacheError(let details):
                return "缓存错误: \(details)"
            case .unknown(let details):
                return "未知错误: \(details)"
            }
        }
        
        var category: Logger.Category {
            switch self {
            case .imageLoadFailed, .imageProcessingFailed, .imageSaveFailed:
                return .imageManager
            case .soundLoadFailed, .soundPlayFailed:
                return .soundManager
            case .dataCorrupted, .settingsLoadFailed, .settingsSaveFailed:
                return .dataService
            case .migrationFailed:
                return .migration
            case .cacheError:
                return .cache
            default:
                return .error
            }
        }
        
        var severity: ErrorSeverity {
            switch self {
            case .dataCorrupted, .migrationFailed:
                return .critical
            case .settingsLoadFailed, .settingsSaveFailed, .fileSystemError:
                return .high
            case .imageLoadFailed, .soundLoadFailed, .networkError:
                return .medium
            case .imageProcessingFailed, .soundPlayFailed, .cacheError:
                return .low
            default:
                return .medium
            }
        }
    }
    
    enum ErrorSeverity: String, CaseIterable {
        case low = "低"
        case medium = "中"
        case high = "高"
        case critical = "严重"
        
        var emoji: String {
            switch self {
            case .low: return "⚠️"
            case .medium: return "🔶"
            case .high: return "🔴"
            case .critical: return "💥"
            }
        }
    }
    
    // MARK: - Error Handling
    
    /// 处理错误
    static func handle(_ error: Error, context: String = "", file: String = #file, function: String = #function, line: Int = #line) {
        let appError: AppError
        
        if let existingAppError = error as? AppError {
            appError = existingAppError
        } else {
            appError = .unknown(error.localizedDescription)
        }
        
        let contextInfo = context.isEmpty ? "" : " (\(context))"
        let message = "\(appError.severity.emoji) \(appError.localizedDescription)\(contextInfo)"
        
        Logger.error(message, category: appError.category, file: file, function: function, line: line)
        
        // 对于严重错误，记录更多信息
        if appError.severity == .critical {
            PerformanceMonitor.logMemoryUsage(context: "Critical Error Memory Usage")
            CacheManager.shared.logCacheStatistics()
        }
        
        // 记录错误统计
        recordErrorStatistics(appError)
    }
    
    /// 处理并返回结果
    static func handleWithResult<T>(_ error: Error, context: String = "", defaultValue: T, file: String = #file, function: String = #function, line: Int = #line) -> T {
        handle(error, context: context, file: file, function: function, line: line)
        return defaultValue
    }
    
    /// 安全执行操作
    static func safeExecute<T>(_ operation: () throws -> T, context: String = "", defaultValue: T, file: String = #file, function: String = #function, line: Int = #line) -> T {
        do {
            return try operation()
        } catch {
            return handleWithResult(error, context: context, defaultValue: defaultValue, file: file, function: function, line: line)
        }
    }
    
    /// 安全执行异步操作
    static func safeExecuteAsync<T>(_ operation: () async throws -> T, context: String = "", defaultValue: T, file: String = #file, function: String = #function, line: Int = #line) async -> T {
        do {
            return try await operation()
        } catch {
            return handleWithResult(error, context: context, defaultValue: defaultValue, file: file, function: function, line: line)
        }
    }
    
    // MARK: - Error Statistics
    
    private static var errorStats: [String: Int] = [:]
    private static let statsQueue = DispatchQueue(label: "com.cyberbugoff.error-stats", attributes: .concurrent)
    
    /// 记录错误统计
    private static func recordErrorStatistics(_ error: AppError) {
        let errorType = String(describing: error).components(separatedBy: "(").first ?? "unknown"
        
        statsQueue.async(flags: .barrier) {
            errorStats[errorType, default: 0] += 1
        }
    }
    
    /// 获取错误统计
    static func getErrorStatistics() -> [String: Int] {
        return statsQueue.sync {
            return errorStats
        }
    }
    
    /// 记录错误统计日志
    static func logErrorStatistics() {
        let stats = getErrorStatistics()
        if stats.isEmpty {
            Logger.info("无错误统计记录", category: .error)
        } else {
            Logger.info("错误统计:", category: .error)
            for (errorType, count) in stats.sorted(by: { $0.value > $1.value }) {
                Logger.info("  \(errorType): \(count) 次", category: .error)
            }
        }
    }
    
    /// 清除错误统计
    static func clearErrorStatistics() {
        statsQueue.async(flags: .barrier) {
            errorStats.removeAll()
        }
        Logger.info("错误统计已清除", category: .error)
    }
    
    // MARK: - Recovery Strategies
    
    /// 尝试恢复操作
    static func attemptRecovery<T>(
        operation: () throws -> T,
        recovery: () -> T,
        context: String = "",
        maxRetries: Int = 3,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) -> T {
        var lastError: Error?
        
        for attempt in 1...maxRetries {
            do {
                return try operation()
            } catch {
                lastError = error
                Logger.warning("操作失败，尝试 \(attempt)/\(maxRetries): \(error.localizedDescription)", category: .error, file: file, function: function, line: line)
                
                if attempt < maxRetries {
                    // 短暂延迟后重试
                    Thread.sleep(forTimeInterval: 0.1 * Double(attempt))
                }
            }
        }
        
        // 所有重试都失败，执行恢复策略
        if let error = lastError {
            handle(error, context: "\(context) (所有重试失败)", file: file, function: function, line: line)
        }
        
        Logger.info("执行恢复策略: \(context)", category: .error, file: file, function: function, line: line)
        return recovery()
    }
    
    /// 异步尝试恢复操作
    static func attemptRecoveryAsync<T>(
        operation: () async throws -> T,
        recovery: () async -> T,
        context: String = "",
        maxRetries: Int = 3,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) async -> T {
        var lastError: Error?
        
        for attempt in 1...maxRetries {
            do {
                return try await operation()
            } catch {
                lastError = error
                Logger.warning("异步操作失败，尝试 \(attempt)/\(maxRetries): \(error.localizedDescription)", category: .error, file: file, function: function, line: line)
                
                if attempt < maxRetries {
                    // 短暂延迟后重试
                    try? await Task.sleep(nanoseconds: UInt64(0.1 * Double(attempt) * 1_000_000_000))
                }
            }
        }
        
        // 所有重试都失败，执行恢复策略
        if let error = lastError {
            handle(error, context: "\(context) (所有异步重试失败)", file: file, function: function, line: line)
        }
        
        Logger.info("执行异步恢复策略: \(context)", category: .error, file: file, function: function, line: line)
        return await recovery()
    }
}

// MARK: - Convenience Extensions

extension ErrorHandler {
    
    /// 图片相关错误处理
    struct ImageErrors {
        static func loadFailed(_ imageName: String, error: Error) -> AppError {
            return .imageLoadFailed("图片名称: \(imageName), 错误: \(error.localizedDescription)")
        }
        
        static func processingFailed(_ details: String) -> AppError {
            return .imageProcessingFailed(details)
        }
        
        static func saveFailed(_ imageName: String, error: Error) -> AppError {
            return .imageSaveFailed("图片名称: \(imageName), 错误: \(error.localizedDescription)")
        }
    }
    
    /// 音效相关错误处理
    struct SoundErrors {
        static func loadFailed(_ soundName: String, error: Error) -> AppError {
            return .soundLoadFailed("音效名称: \(soundName), 错误: \(error.localizedDescription)")
        }
        
        static func playFailed(_ soundName: String, error: Error) -> AppError {
            return .soundPlayFailed("音效名称: \(soundName), 错误: \(error.localizedDescription)")
        }
    }
    
    /// 数据相关错误处理
    struct DataErrors {
        static func loadFailed(_ key: String, error: Error) -> AppError {
            return .settingsLoadFailed("键: \(key), 错误: \(error.localizedDescription)")
        }
        
        static func saveFailed(_ key: String, error: Error) -> AppError {
            return .settingsSaveFailed("键: \(key), 错误: \(error.localizedDescription)")
        }
        
        static func corrupted(_ details: String) -> AppError {
            return .dataCorrupted(details)
        }
        
        static func migrationFailed(_ details: String) -> AppError {
            return .migrationFailed(details)
        }
    }
}
