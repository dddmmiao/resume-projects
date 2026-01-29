import SwiftUI
import WatchKit
import CoreMotion

// 摇晃处理扩展
extension ContentView {
    // 处理摇晃手势
    func handleShakeGesture() {
        // 播放震动反馈
        WKInterfaceDevice.current().play(.notification)
        
        // 根据当前模式处理颜色随机选择
        if displayModeManager.currentMode == .breathing {
            // 呼吸模式 - 检查会员权限
            if !MembershipManager.shared.hasPremiumAccess {
                // 没有会员权限，显示提示
                ToastManager.shared.show(primaryText: NSLocalizedString("toast.premium.required", comment: ""))
                return
            }
            
            // 呼吸模式 - 随机选择呼吸模式
            handleRandomBreathingMode()
        } else {
            // 单色模式 - 随机选择颜色列表中的颜色
            handleRandomSolidColor()
        }
    }
    
    // 处理单色模式下的随机颜色选择
    private func handleRandomSolidColor() {
        // 从整个RGB颜色空间随机生成一个颜色
        let randomRed = Double.random(in: 0...1)
        let randomGreen = Double.random(in: 0...1)
        let randomBlue = Double.random(in: 0...1)
        
        let randomColor = Color(red: randomRed, green: randomGreen, blue: randomBlue)
        
        // 保存当前颜色索引，便于退出随机模式时恢复
        previousColorIndexForRandom = colorList.isEmpty ? nil : currentColorIndex
        
        // 重置UI状态，确保进入随机颜色视图
        addColorMode = .none // 清除加号模式
        customColor = randomColor
        isCustomColor = true
        isRandomColor = true  // 标记为随机生成的颜色
        
        // 同步HSB值，确保颜色编辑器使用正确的颜色
        syncHSBFromColor(randomColor)
        
        // 显示颜色提示
        showColorToast(for: randomColor)
    }
    
    // 处理呼吸模式下的随机模式选择
    private func handleRandomBreathingMode() {
        // 获取所有可用的呼吸模式
        let availableModes = BreathingMode.allCases
        
        // 过滤掉当前模式，确保不会随机到同一个模式
        let otherModes = availableModes.filter { $0 != displayModeManager.currentBreathingMode }
        
        // 如果有其他模式，随机选择一个
        if let newMode = otherModes.randomElement() {
            // 切换到新的呼吸模式
            displayModeManager.currentBreathingMode = newMode
            
            // 重置呼吸动画以应用新模式（这会自动加载新模式的颜色）
            displayModeManager.resetBreathingAnimation()
            
            // 显示提示
            ToastManager.shared.show(primaryText: newMode.name)
        }
    }
    
    // 设置摇晃检测
    func setupShakeDetection() {
        // 配置摇晃检测回调
        ShakeGestureHandler.shared.onShakeDetected = {
            // 如果色轮打开或正在呼吸模式编辑，不响应摇晃
            if self.showColorWheel || 
               self.displayModeManager.isEditingBreathingColors {
                return
            }
            
            // 处理摇晃手势
            self.handleShakeGesture()
        }
        
        // 开始监测摇晃
        ShakeGestureHandler.shared.startMonitoring()
    }
    
    // 停止摇晃检测
    func stopShakeDetection() {
        ShakeGestureHandler.shared.stopMonitoring()
    }
} 
