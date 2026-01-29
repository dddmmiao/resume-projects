import SwiftUI
import WatchKit

// MARK: - 颜色选择器容器视图
struct ColorSelectorContainerView: View {
    // 当前选择器模式
    @Binding var currentMode: ColorSelectorMode
    @Binding var isPresented: Bool
    // 颜色相关绑定
    @Binding var selectedColor: Color
    @Binding var hue: Double
    @Binding var saturation: Double
    @Binding var brightness: Double
    @Binding var selectedPosition: CGPoint
    @Binding var isMembershipCenterActive: Bool // 新增：会员中心激活状态
    
    // 回调函数
    var onColorChanged: ((Color) -> Void)?
    var onPositionChanged: (() -> Void)?
    var onTouchingChanged: ((Bool) -> Void)?
    var onBrightnessControlChange: ((Bool) -> Void)?
    var onModeChanged: ((ColorSelectorMode) -> Void)?
    var onColorDragged: ((Color) -> Void)?  // 新增颜色拖拽回调，用于实时更新背景
    
    // 其他状态
    @State private var transitionID = UUID()
    
    var body: some View {
        ZStack {
            // 色轮视图
            if currentMode == .colorWheel {
                ColorWheel(
                    isPresented: $isPresented,
                    selectedColor: $selectedColor,
                    selectedPosition: $selectedPosition,
                    hue: $hue,
                    saturation: $saturation,
                    brightness: $brightness,
                    isMembershipCenterActive: $isMembershipCenterActive, // 新增：传递会员中心激活状态
                    onPositionChanged: {
                        onPositionChanged?()
                        // 实时更新背景颜色
                        onColorDragged?(selectedColor)
                    },
                    onTouchingChanged: { isTouching in
                        onTouchingChanged?(isTouching)
                    },
                    onBrightnessControlChange: { isInBrightnessMode in
                        onBrightnessControlChange?(isInBrightnessMode)
                    },
                    onColorChanged: { newColor in
                        onColorChanged?(newColor)
                        // 实时更新背景颜色
                        onColorDragged?(newColor)
                    },
                    onTap: { _ in
                        onColorChanged?(selectedColor)
                        // 实时更新背景颜色
                        onColorDragged?(selectedColor)
                    }
                )
                .id("colorWheel-\(transitionID)")
            }
            
            // RGB输入视图
            if currentMode == .rgbInput {
                let colorInfo = ColorInfo.fromColor(selectedColor)
                
                RGBInputView(
                    isPresented: $isPresented,
                    selectedColor: $selectedColor,
                    onColorSelected: { newColor in
                        onColorChanged?(newColor)
                        // 实时更新背景颜色
                        onColorDragged?(newColor)
                    },
                    initialRed: Int(colorInfo.red),
                    initialGreen: Int(colorInfo.green),
                    initialBlue: Int(colorInfo.blue)
                )
                .id("rgbInput-\(transitionID)")
            }
            
            // 表情符号颜色选择器
            if currentMode == .emojiSelector {
                let colorInfo = ColorInfo.fromColor(selectedColor)
                
                EmojiColorSelector(
                    isPresented: $isPresented,
                    selectedColor: $selectedColor,
                    onColorSelected: { newColor in
                        onColorChanged?(newColor)
                        // 实时更新背景颜色
                        onColorDragged?(newColor)
                    },
                    initialRed: Int(colorInfo.red),
                    initialGreen: Int(colorInfo.green),
                    initialBlue: Int(colorInfo.blue)
                )
                .id("emojiSelector-\(transitionID)")
            }
            
            // 这里可以添加未来的其他选择器类型
        }
        .onChange(of: selectedColor) { _, newColor in
            // 确保任何颜色变化都会触发回调
            onColorChanged?(newColor)
            // 实时更新背景颜色
            onColorDragged?(newColor)
        }
    }
    
    // 切换到下一个选择器模式
    func toggleToNextMode() {
        let nextMode = currentMode.next()
        transitionID = UUID() // 重新生成ID确保视图重建
        
        // 播放触觉反馈
        WKInterfaceDevice.current().play(.click)
        
        // 切换前先通知外部，以便进行准备工作
        onModeChanged?(nextMode)
        
        // 直接切换模式，不使用动画
        currentMode = nextMode
    }
}
