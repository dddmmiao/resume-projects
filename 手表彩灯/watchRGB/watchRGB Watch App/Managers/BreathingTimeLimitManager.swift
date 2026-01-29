import SwiftUI
import Foundation

// MARK: - 呼吸模式时间限制管理器
class BreathingTimeLimitManager: ObservableObject {
    static let shared = BreathingTimeLimitManager()
    
    // 计时器
    private var breathingTimer: Timer?
    
    // 时间记录
    private var startTime: Date?
    private var currentSpeed: Double = 0
    @Published var remainingTime: TimeInterval = 0
    @Published var isActive: Bool = false
    
    private init() {}
    
    // 根据速度计算允许的时间（秒）
    func getAllowedTime(for speed: Double) -> TimeInterval {
        switch speed {
        case 0...5:
            return 10 * 60      // 10分钟 - 低速安全
        case 6...15:
            return 8 * 60       // 8分钟 - 中速
        case 16...25:
            return 5 * 60       // 5分钟 - 高速
        default:
            return 3 * 60       // 3分钟 - 极高速，最短时间
        }
    }
    
    // 开始计时
    func startTimer(for speed: Double, onTimeout: @escaping () -> Void) {
        stopTimer()

        let allowedTime = getAllowedTime(for: speed)
        startTime = Date()
        currentSpeed = speed
        remainingTime = allowedTime
        isActive = true

        // 设置主计时器
        breathingTimer = Timer.scheduledTimer(withTimeInterval: allowedTime, repeats: false) { _ in
            self.handleTimeout(onTimeout: onTimeout)
        }

        // 启动倒计时更新
        startCountdownUpdate()
    }
    
    // 停止计时
    func stopTimer() {
        breathingTimer?.invalidate()
        breathingTimer = nil

        startTime = nil
        currentSpeed = 0
        remainingTime = 0
        isActive = false
    }
    
    // 处理超时
    private func handleTimeout(onTimeout: @escaping () -> Void) {
        isActive = false
        remainingTime = 0
        onTimeout()
    }
    
    // 启动倒计时更新
    private func startCountdownUpdate() {
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            guard self.isActive, let startTime = self.startTime else {
                timer.invalidate()
                return
            }
            
            let elapsed = Date().timeIntervalSince(startTime)
            let allowedTime = self.getAllowedTime(for: self.currentSpeed)
            self.remainingTime = max(0, allowedTime - elapsed)
            
            if self.remainingTime <= 0 {
                timer.invalidate()
            }
        }
    }
}
