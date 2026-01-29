import SwiftUI
import WatchKit

// 表冠旋转处理
extension ContentView {
    // 处理表冠旋转
     func handleCrownRotation(oldValue: Double, newValue: Double) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 避免在同一帧内多次更新
        guard abs(oldValue - newValue) > 0.0001 else { return }
        
        let roundedValue = round(newValue * 100) / 100
        
        // 保护窗口检查 - 提前返回，减少嵌套
        if ignoreTableCrownUpdates || isRGBPickerActive {
            if showColorWheel {
                // 区分RGB模式和色轮模式
                if currentSelectorMode == .rgbInput || currentSelectorMode == .emojiSelector {
                    // 在RGB/表情符号模式下不重置表冠值
                } else {
                    // 重置表冠值
                    DispatchQueue.main.async { [customSaturation] in
                        self.crownValue = customSaturation
                    }
                }
            }
            return
        }
        
        // 惯性检查
        let timeSinceLastTap = Date().timeIntervalSince(lastTapTime)
        if timeSinceLastTap < 0.1 && abs(oldValue - newValue) > 0.2 {
            DispatchQueue.main.async { [oldValue] in
                self.crownValue = oldValue
            }
            return
        }
        
        // 状态分支处理
        if isClosingColorWheel {
            return
        }
        
        if showColorWheel && !isTouching {
            // 区分RGB模式和色轮模式
            if currentSelectorMode == .rgbInput || currentSelectorMode == .emojiSelector {
                // RGB模式下只更新背景颜色，不重置表冠值
                handleRGBModeCrownRotation(newValue: roundedValue)
                        } else {
                // 色轮模式下正常处理
                handleColorWheelCrownRotation(oldValue: oldValue, newValue: roundedValue)
            }
            return
        }
        
        if !showColorWheel {
            handleBrightnessCrownRotation(newValue: roundedValue)
            return
        }
    }
    
    // 色轮模式下的表冠旋转处理
     func handleColorWheelCrownRotation(oldValue: Double, newValue: Double) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 检查是否处于饱和度平滑过渡模式
        let isSmoothing = NotificationCenter.default.observeHasSaturationSmoothing()
        
        withAnimation(.none) {
            if isSmoothing {
                // 在平滑过渡模式下，降低表冠敏感度（减少10倍）
                let delta = newValue - oldValue
                let smoothedValue = customSaturation + delta * 0.1
                let clampedValue = max(0.0, min(1.0, smoothedValue))
                updateColorWithSaturation(round(clampedValue * 100) / 100)
            } else {
                // 正常敏感度
                updateColorWithSaturation(newValue)
            }
        }
    }
    // RGB模式下的表冠旋转处理
     func handleRGBModeCrownRotation(newValue: Double) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // RGB模式下，表冠只控制亮度，不更新表冠值本身
        // 这样可以避免在RGB选择器中不必要地更新表冠值
        let newBrightness = max(config.minBrightness, min(1.0, newValue))
        
        // 调整RGB颜色的亮度
        withAnimation(.none) {
            // 保存当前颜色，用于检查是否与初始颜色相同
            let previousColor = customColor
            
            // 更新亮度
            customBrightness = newBrightness
            
            // 更新颜色 - 使用当前RGB值重新计算
            let uiColor = UIColor(customColor)
            
            // 更新颜色，保持原RGB比例但改变亮度
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
            
            // 获取RGB最大值，计算缩放因子
            let maxComponent = max(r, max(g, b))
            let scaleFactor = maxComponent > 0 ? CGFloat(newBrightness) / maxComponent : 1
            
            // 等比例调整RGB值，保持色调和饱和度
            let newColor = Color(
                red: max(0, min(1, r * scaleFactor)),
                green: max(0, min(1, g * scaleFactor)),
                blue: max(0, min(1, b * scaleFactor))
            )
            
            // 更新自定义颜色
            customColor = newColor
            
            // 只有当颜色实际发生变化时，才标记为自定义颜色
            if previousColor != newColor {
                isCustomColor = true
            }
            
            // 在呼吸模式颜色编辑时不显示表情符号
            if !displayModeManager.isEditingBreathingColors {
            // 显示新的RGB值和表情符号
            showColorToast(for: newColor)
            }
        }
    }
    // 亮度模式下的表冠旋转处理
     func handleBrightnessCrownRotation(newValue: Double) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 应用亮度并确保不低于最小值
        brightnessManager.brightness = max(config.minBrightness, newValue)
    }
    // 根据饱和度更新颜色和位置
     func updateColorWithSaturation(_ saturation: Double) {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 安全检查：如果在以下情况下不更新位置
        // 1. 保护窗口内
        if ignoreTableCrownUpdates { return }
        
        // 2. 正在触摸
        if isTouching { return }
        
        // 3. 变化太小（防止微小波动）
        if abs(customSaturation - saturation) < 0.005 { return }
        
        // 确保使用表冠精度的值
        let roundedSaturation = round(saturation * 100) / 100
        
        // 无动画更新状态，防止抖动
        withAnimation(.none) {
            // 更新饱和度
            customSaturation = roundedSaturation
            
            // 更新颜色
            customColor = Color(
                hue: customHue,
                saturation: customSaturation,
                brightness: customBrightness
            )
            
            // 标记为自定义颜色
                    isCustomColor = true
            
            // 在呼吸模式颜色编辑时不显示表情符号
            if !displayModeManager.isEditingBreathingColors {
                // 同时显示颜色的RGB值和表情符号
                let colorInfo = ColorInfo.fromColor(customColor)
                let emojiDisplay = EmojiMapper.formatRGBValue(Int(colorInfo.red), Int(colorInfo.green), Int(colorInfo.blue))
                ToastManager.shared.show(primaryText: emojiDisplay)
            }
        }
    }
    // 重置表冠值为当前饱和度，带时间窗口保护
     func resetCrownToCurrentSaturation() {
        // 如果会员中心正在显示，不执行任何颜色修改操作
        if isMembershipCenterActive {
            return
        }
        
        // 立即激活保护窗口
        ignoreTableCrownUpdates = true
        lastTapTime = Date()
        isTouching = false
        isCustomColor = true
        
        // 强制刷新表冠控件
        colorWheelResetCounter += 1

        // 立即同步表冠值，避免跳跃
        crownValue = customSaturation
        
        // 延长保护窗口时间，确保表冠惯性完全消失
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // 二次同步，确保值匹配
            self.crownValue = self.customSaturation
            
            // 关闭保护窗口
            self.ignoreTableCrownUpdates = false
        }
    }
}
