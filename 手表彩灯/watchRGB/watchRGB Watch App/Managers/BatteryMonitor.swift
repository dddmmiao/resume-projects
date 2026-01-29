import SwiftUI
import WatchKit
import Foundation

// MARK: - 电池监控管理器
class BatteryMonitor: ObservableObject {
    static let shared = BatteryMonitor()
    
    @Published var batteryLevel: Float = 1.0

    private var batteryTimer: Timer?
    private var lastBatteryLevel: Float = 1.0
    
    private init() {
        updateBatteryLevel()
    }
    
    // 开始监控电池
    func startMonitoring() {
        // 立即更新一次
        updateBatteryLevel()
        
        // 每360秒检查一次电池电量
        batteryTimer = Timer.scheduledTimer(withTimeInterval: 360, repeats: true) { _ in
            self.updateBatteryLevel()
        }
    }
    
    // 停止监控
    func stopMonitoring() {
        batteryTimer?.invalidate()
        batteryTimer = nil
    }
    
    // 更新电池电量
    private func updateBatteryLevel() {
        let currentLevel = WKInterfaceDevice.current().batteryLevel

        // 在模拟器中，batteryLevel可能返回-1，我们设置为1.0（满电）
        let validLevel: Float = currentLevel >= 0 ? currentLevel : 1.0

        // 只有在电量有显著变化时才更新UI
        if abs(validLevel - lastBatteryLevel) > 0.01 {
            DispatchQueue.main.async {
                self.batteryLevel = validLevel
                self.lastBatteryLevel = validLevel
            }
        }
    }
    
    // 获取当前电量允许的最大呼吸速度
    func getMaxAllowedSpeed() -> Double {
        switch batteryLevel {
        case 0.3...1.0:
            return 50          // 电量充足，无限制
        case 0.2..<0.3:
            return 20          // 电量中等，中度限制
        case 0.1..<0.2:
            return 10          // 电量较低，严格限制
        default:
            return 5           // 电量极低，呼吸模式
        }
    }
    
    // 检查是否可以增加呼吸速度
    func canIncreaseSpeed(currentSpeed: Double) -> Bool {
        let maxSpeed = getMaxAllowedSpeed()
        return currentSpeed < maxSpeed
    }
}
