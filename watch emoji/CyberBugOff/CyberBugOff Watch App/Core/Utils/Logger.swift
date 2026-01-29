//
//  Logger.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation
import os.log

/// 统一的日志记录工具
struct Logger {
    
    // MARK: - Log Categories
    
    enum Category: String, CaseIterable {
        case dataService = "DataService"
        case imageManager = "ImageManager"
        case triggerManager = "TriggerManager"
        case soundManager = "SoundManager"
        case bugOffModel = "BugOffModel"
        case ui = "UI"
        case general = "General"
        case performance = "Performance"
        case migration = "Migration"
        case cache = "Cache"
        case error = "Error"
        
        var emoji: String {
            switch self {
            case .dataService: return "💾"
            case .imageManager: return "🖼️"
            case .triggerManager: return "🎯"
            case .soundManager: return "🎵"
            case .bugOffModel: return "🏗️"
            case .ui: return "🎨"
            case .general: return "⚙️"
            case .performance: return "⚡"
            case .migration: return "🔄"
            case .cache: return "📦"
            case .error: return "❌"
            }
        }
    }
    
    // MARK: - Log Levels
    
    enum Level: String, CaseIterable {
        case debug = "DEBUG"
        case info = "INFO"
        case warning = "WARNING"
        case error = "ERROR"
        case success = "SUCCESS"
        
        var emoji: String {
            switch self {
            case .debug: return "🔍"
            case .info: return "ℹ️"
            case .warning: return "⚠️"
            case .error: return "❌"
            case .success: return "✅"
            }
        }
    }
    
    // MARK: - Configuration
    
    /// 是否启用日志记录
    static var isEnabled: Bool = true
    
    /// 最小日志级别
    static var minimumLevel: Level = .debug
    
    /// 是否在Release模式下启用日志
    static var enableInRelease: Bool = false
    
    // MARK: - Logging Methods
    
    /// 记录调试信息
    static func debug(_ message: String, category: Category = .ui, file: String = #file, function: String = #function, line: Int = #line) {
        log(message, level: .debug, category: category, file: file, function: function, line: line)
    }
    
    /// 记录一般信息
    static func info(_ message: String, category: Category = .ui, file: String = #file, function: String = #function, line: Int = #line) {
        log(message, level: .info, category: category, file: file, function: function, line: line)
    }
    
    /// 记录警告信息
    static func warning(_ message: String, category: Category = .ui, file: String = #file, function: String = #function, line: Int = #line) {
        log(message, level: .warning, category: category, file: file, function: function, line: line)
    }
    
    /// 记录错误信息
    static func error(_ message: String, category: Category = .error, file: String = #file, function: String = #function, line: Int = #line) {
        log(message, level: .error, category: category, file: file, function: function, line: line)
    }
    
    /// 记录成功信息
    static func success(_ message: String, category: Category = .ui, file: String = #file, function: String = #function, line: Int = #line) {
        log(message, level: .success, category: category, file: file, function: function, line: line)
    }
    
    // MARK: - Core Logging
    
    /// 核心日志记录方法
    private static func log(_ message: String, level: Level, category: Category, file: String, function: String, line: Int) {
        // 检查是否启用日志
        guard isEnabled else { return }
        
        // 检查构建配置
        #if DEBUG
        // Debug模式下总是记录
        #else
        guard enableInRelease else { return }
        #endif
        
        // 检查日志级别
        guard shouldLog(level: level) else { return }
        
        // 格式化消息
        let fileName = URL(fileURLWithPath: file).lastPathComponent
        let formattedMessage = formatMessage(message, level: level, category: category, fileName: fileName, function: function, line: line)
        
        // 输出日志
        print(formattedMessage)
        
        // 在错误级别时，也输出到系统日志
        if level == .error {
            os_log("%{public}@", log: OSLog.default, type: .error, formattedMessage)
        }
    }
    
    /// 检查是否应该记录指定级别的日志
    private static func shouldLog(level: Level) -> Bool {
        let levels: [Level] = [.debug, .info, .warning, .error, .success]
        guard let currentIndex = levels.firstIndex(of: minimumLevel),
              let levelIndex = levels.firstIndex(of: level) else {
            return true
        }
        return levelIndex >= currentIndex
    }
    
    /// 格式化日志消息
    private static func formatMessage(_ message: String, level: Level, category: Category, fileName: String, function: String, line: Int) -> String {
        let timestamp = DateFormatter.logFormatter.string(from: Date())
        return "\(level.emoji) [\(timestamp)] [\(category.rawValue)] \(category.emoji) \(message)"
    }
}

// MARK: - Extensions

extension DateFormatter {
    static let logFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter
    }()
}

// MARK: - Convenience Methods for Specific Categories

extension Logger {
    
    /// DataService相关日志
    struct DataService {
        static func info(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.info(message, category: .dataService, file: file, function: function, line: line)
        }
        
        static func success(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.success(message, category: .dataService, file: file, function: function, line: line)
        }
        
        static func error(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.error(message, category: .dataService, file: file, function: function, line: line)
        }
    }
    
    /// ImageManager相关日志
    struct ImageManager {
        static func info(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.info(message, category: .imageManager, file: file, function: function, line: line)
        }
        
        static func success(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.success(message, category: .imageManager, file: file, function: function, line: line)
        }
        
        static func error(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.error(message, category: .imageManager, file: file, function: function, line: line)
        }
    }
    
    /// TriggerManager相关日志
    struct TriggerManager {
        static func info(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.info(message, category: .triggerManager, file: file, function: function, line: line)
        }
        
        static func success(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.success(message, category: .triggerManager, file: file, function: function, line: line)
        }
        
        static func error(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.error(message, category: .triggerManager, file: file, function: function, line: line)
        }
    }
    
    /// Migration相关日志
    struct Migration {
        static func info(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.info(message, category: .migration, file: file, function: function, line: line)
        }
        
        static func success(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.success(message, category: .migration, file: file, function: function, line: line)
        }
        
        static func error(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
            Logger.error(message, category: .migration, file: file, function: function, line: line)
        }
    }
}
