//
//  PerformanceMonitor.swift
//  CyberBugOff Watch App
//
//  Created by Augment Agent on 2025-08-13.
//

import Foundation
import UIKit
import WatchKit

/// 性能监控工具
class PerformanceMonitor {
    static let shared = PerformanceMonitor()
    
    private init() {
        setupMemoryMonitoring()
    }
    
    // MARK: - Memory Monitoring
    
    private var memoryMonitoringTimer: Timer?
    private let memoryCheckInterval: TimeInterval = 30.0 // 每30秒检查一次内存
    
    /// 设置内存监控
    private func setupMemoryMonitoring() {
        // 启动定时内存监控
        memoryMonitoringTimer = Timer.scheduledTimer(withTimeInterval: memoryCheckInterval, repeats: true) { _ in
            self.checkMemoryUsage()
        }
        
        // 在watchOS中，我们使用定时检查来替代内存警告监听
        // 因为WKApplication.didReceiveMemoryWarningNotification在watchOS中不可用
    }
    
    /// 检查内存使用情况
    private func checkMemoryUsage() {
        let percentage = Self.getMemoryUsagePercentage()
        
        if percentage > AppConfig.memoryWarningThreshold {
            Logger.warning("内存使用较高: \(String(format: "%.1f", percentage))%，开始预防性清理", category: .performance)
            Self.forceMemoryCleanup()
        } else {
            Self.logMemoryUsage(context: "定时检查")
        }
    }
    
    /// 处理内存警告
    private func handleMemoryWarning() {
        Logger.error("收到系统内存警告，立即清理缓存", category: .performance)
        Self.forceMemoryCleanup()
    }
    
    /// 停止内存监控
    func stopMemoryMonitoring() {
        memoryMonitoringTimer?.invalidate()
        memoryMonitoringTimer = nil
    }
    
    // MARK: - Static Methods
    
    /// 获取当前内存使用情况
    static func getMemoryUsage() -> (used: UInt64, total: UInt64) {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_,
                         task_flavor_t(MACH_TASK_BASIC_INFO),
                         $0,
                         &count)
            }
        }
        
        if kerr == KERN_SUCCESS {
            let usedMemory = UInt64(info.resident_size)
            let totalMemory = ProcessInfo.processInfo.physicalMemory
            return (used: usedMemory, total: totalMemory)
        } else {
            return (used: 0, total: 0)
        }
    }
    
    /// 获取内存使用百分比
    static func getMemoryUsagePercentage() -> Double {
        let (used, total) = getMemoryUsage()
        guard total > 0 else { return 0.0 }
        return Double(used) / Double(total) * 100.0
    }
    
    /// 检查内存使用是否过高
    static func isMemoryUsageHigh() -> Bool {
        let percentage = getMemoryUsagePercentage()
        return percentage > AppConfig.memoryHighThreshold
    }
    
    /// 记录内存使用情况（仅在内存使用超过警告阈值时才输出日志）
    static func logMemoryUsage(context: String = "") {
        let percentage = getMemoryUsagePercentage()
        
        // 只在内存使用超过警告阈值时才输出日志，避免刷屏
        if percentage > AppConfig.memoryWarningThreshold {
            let (used, total) = getMemoryUsage()
            let usedMB = Double(used) / 1024.0 / 1024.0
            let totalMB = Double(total) / 1024.0 / 1024.0
            
            if percentage > AppConfig.memoryHighThreshold {
                Logger.warning("内存使用过高\(context.isEmpty ? "" : " (\(context))"): \(String(format: "%.1f", usedMB))MB / \(String(format: "%.1f", totalMB))MB (\(String(format: "%.1f", percentage))%)", category: .performance)
            } else {
                    Logger.debug("内存使用较高\(context.isEmpty ? "" : " (\(context))"): \(String(format: "%.1f", usedMB))MB (\(String(format: "%.1f", percentage))%)", category: .performance)
            }
        }
    }
    
    /// 强制内存清理
    static func forceMemoryCleanup() {
        
        // 清理各种缓存
        ImageManager.handleMemoryWarning()
        ThumbnailGenerator.handleMemoryWarning()
        TriggerManager.clearToastImageCache()
        
        // 强制垃圾回收
        autoreleasepool {
            // 这里可以添加额外的内存清理逻辑
        }
        
        logMemoryUsage(context: "清理后")
    }
    
    // MARK: - Performance Measurement
    
    /// 测量代码块执行时间（仅在DEBUG模式下输出日志，且只输出超过阈值的耗时操作）
    @discardableResult
    static func measure<T>(label: String, threshold: Double = 10.0, operation: () throws -> T) rethrows -> T {
        #if DEBUG
        let startTime = CFAbsoluteTimeGetCurrent()
        let result = try operation()
        let timeElapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        
        // 只记录超过阈值(默认10ms)的操作
        // 只记录超过阈值(默认10ms)的操作 - 已禁用日志输出
        // if timeElapsed > threshold {
        //     Logger.debug("⏱️ \(label): \(String(format: "%.3f", timeElapsed))ms", category: .performance)
        // }
        _ = timeElapsed // 避免未使用警告
        
        return result
        #else
        return try operation()
        #endif
    }
    
    /// 异步测量代码块执行时间（仅在DEBUG模式下输出日志，且只输出超过阈值的耗时操作）
    @discardableResult
    static func measureAsync<T>(label: String, threshold: Double = 10.0, operation: () async throws -> T) async rethrows -> T {
        #if DEBUG
        let startTime = CFAbsoluteTimeGetCurrent()
        let result = try await operation()
        let timeElapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        
        // 只记录超过阈值(默认10ms)的操作 - 已禁用日志输出
        // if timeElapsed > threshold {
        //     Logger.debug("⏱️ \(label): \(String(format: "%.3f", timeElapsed))ms", category: .performance)
        // }
        _ = timeElapsed // 避免未使用警告
        
        return result
        #else
        return try await operation()
        #endif
    }
}

// MARK: - Supporting Types

/// 内存使用情况
struct MemoryUsage {
    let resident: UInt64  // 物理内存使用量（字节）
    let virtual: UInt64   // 虚拟内存使用量（字节）
}
