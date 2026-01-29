import SwiftUI

extension ContentView {
    // 处理颜色变化
     func handleColorChanged(newColor: Color) {
        // 更新自定义颜色状态，确保按钮状态能正确更新
        customColor = newColor
        
        // 标记为自定义颜色，确保按钮状态计算正确
        isCustomColor = true
        
        // 在呼吸模式颜色编辑时不显示表情符号
        if !displayModeManager.isEditingBreathingColors {
            // 显示颜色的表情符号和RGB值
            showColorToast(for: newColor)
        }
    }
    
    // 处理位置变化
     func handlePositionChanged() {
        resetCrownToCurrentSaturation()
        
        // 在呼吸模式颜色编辑时不显示表情符号
        if !displayModeManager.isEditingBreathingColors {
            // 显示颜色的表情符号和RGB值
            showColorToast(for: customColor)
        }
    }
    
    // 处理触摸状态变化
     func handleTouchingChanged(isTouching: Bool) {
        self.isTouching = isTouching
        if isTouching {
            // 设置用户交互状态，阻断任何可能的自动同步
            self.userInteractionState = .wheelTapped(Date())
            
            withAnimation(.easeInOut(duration: 0.25)) {
                isCustomColor = true
            }
        }
    }
    
    // 处理亮度控制变化
     func handleBrightnessControlChange(isInBrightnessMode: Bool) {
        // 当进入或离开亮度控制模式时，更新表冠控制模式
        if isInBrightnessMode {
            // 进入亮度模式，表冠控制亮度
            crownValue = customBrightness
        } else {
            // 退出亮度模式，表冠控制饱和度
            crownValue = customSaturation
        }
    }
    
    // 处理选择器模式变化
     func handleSelectorModeChanged(newMode: ColorSelectorMode) {
        // 处理模式切换

        // 从RGB选择器切换回色轮时，同步颜色值和表冠值
        if newMode == .colorWheel {
            handleSwitchToColorWheelMode()
        } else if newMode == .rgbInput || newMode == .emojiSelector {
            handleSwitchToRGBMode()
        }
    }
    
    // 处理颜色拖拽
     func handleColorDragged(draggedColor: Color) {
        // 拖拽过程中实时更新颜色
        if displayModeManager.isEditingBreathingColors {
            // 立即更新自定义颜色（不等待onColorChanged回调）
            customColor = draggedColor
        }
    }
} 