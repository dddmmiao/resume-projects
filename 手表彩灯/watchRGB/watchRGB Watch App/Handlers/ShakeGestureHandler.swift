import SwiftUI
import CoreMotion
import WatchKit

// 摇晃手势处理类
class ShakeGestureHandler: NSObject, ObservableObject {
    // 单例模式
    static let shared = ShakeGestureHandler()
    
    // 运动管理器
    private let motionManager = CMMotionManager()
    
    // 状态变量
    @Published var isShaking = false
    private var lastShakeTime = Date()
    
    // 用户设置键
    private let shakeThresholdKey = "shakeThreshold"
    
    // 摇晃阈值，从UserDefaults读取，如果没有则使用默认值
    var shakeThreshold: Double {
        get {
            let storedValue = UserDefaults.standard.double(forKey: shakeThresholdKey)
            let result = storedValue.isZero ? GlobalConfig.Shake.defaultThreshold : storedValue
            return result
        }
        set {
            UserDefaults.standard.set(newValue, forKey: shakeThresholdKey)
        }
    }
    
    private let shakeCooldown: TimeInterval = GlobalConfig.Shake.defaultCooldown
    
    // 回调闭包
    var onShakeDetected: (() -> Void)?
    
    private override init() {
        super.init()
    }
    
    // 开始监测摇晃
    func startMonitoring() {
        guard motionManager.isAccelerometerAvailable else {
            return
        }
        
        motionManager.accelerometerUpdateInterval = 0.05 // 提高采样频率
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] (data, error) in
            guard let self = self, let data = data else { return }
            
            // 检测摇晃
            self.detectShake(data: data)
        }
    }
    
    // 停止监测摇晃
    func stopMonitoring() {
        motionManager.stopAccelerometerUpdates()
    }
    
    // 检测摇晃
    private func detectShake(data: CMAccelerometerData) {
        // 计算加速度向量的大小
        let acceleration = data.acceleration
        let accelerationValue = sqrt(pow(acceleration.x, 2) + pow(acceleration.y, 2) + pow(acceleration.z, 2))
        
        // 检查是否超过摇晃阈值
        if accelerationValue > shakeThreshold {
            let currentTime = Date()
            // 检查是否已过冷却时间
            if currentTime.timeIntervalSince(lastShakeTime) > shakeCooldown {
                lastShakeTime = currentTime
                handleShakeDetected()
            }
        }
    }
    
    // 处理摇晃检测
    private func handleShakeDetected() {
        // 设置摇晃状态
        isShaking = true
        
        // 移除这里的震动反馈，避免与 ContentView 中的重复
        // WKInterfaceDevice.current().play(.notification)
        
        // 调用回调
        onShakeDetected?()
        
        // 延迟重置摇晃状态
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { // 减少状态重置时间
            self.isShaking = false
        }
    }
    
    // 设置摇晃阈值
    func setShakeThreshold(_ value: Double) {
        // 确保阈值在有效范围内
        let validThreshold = min(max(value, GlobalConfig.Shake.minThreshold), GlobalConfig.Shake.maxThreshold)
        shakeThreshold = validThreshold
    }
    
    // 重置为默认阈值
    func resetShakeThreshold() {
        shakeThreshold = GlobalConfig.Shake.defaultThreshold
    }
} 
