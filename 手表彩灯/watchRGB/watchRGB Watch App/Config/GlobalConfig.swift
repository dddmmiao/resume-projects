/**
 * GlobalConfig.swift - 全局配置中心
 * 
 * 📌 核心功能:
 *   - 设备自适应 (scaleFactor/fontSize/spacing)
 *   - 颜色/间距/字体/动画配置
 *   - 自定义按钮样式和卡片样式
 * 
 * 💡 设计模式: 单例模式 (GlobalConfig.shared)
 * 📖 详细文档: 见 TECHNICAL_GUIDE.md
 */

import SwiftUI
import WatchKit

// MARK: - 全局配置管理器
class GlobalConfig: ObservableObject {
    static let shared = GlobalConfig()
    
    private init() {}
    
    // MARK: - 设备适配
    /// 基于设备尺寸的自适应比例因子
    func scaleFactor() -> CGFloat {
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        // 以44mm表盘（约184pt宽度）为基准
        let baseFactor: CGFloat = 1.0
        let scaleFactor = screenWidth / 184.0
        
        // 限制比例范围，避免过大或过小
        return min(max(scaleFactor * baseFactor, 0.8), 1.2)
    }
    
    /// 根据设备尺寸自适应字体大小
    func fontSize(_ size: CGFloat) -> CGFloat {
        return size * scaleFactor()
    }
    
    /// 根据设备尺寸自适应间距
    func spacing(_ space: CGFloat) -> CGFloat {
        return space * scaleFactor()
    }
    
    /// 获取自适应按钮尺寸
    func buttonSize(_ size: CGFloat) -> CGFloat {
        return size * scaleFactor()
    }
    
    // MARK: - 摇晃配置
    struct Shake {
        // 默认摇晃阈值
        static let defaultThreshold: Double = 6.0
        // 摇晃阈值范围
        static let minThreshold: Double = 2
        static let maxThreshold: Double = 20.0
        // 摇晃冷却时间
        static let defaultCooldown: TimeInterval = 1.0
    }
    
    // MARK: - 颜色配置
    struct Colors {
        // 主题颜色
        static let primary = Color.blue
        static let secondary = Color.gray
        static let accent = Color.yellow
        static let success = Color.green
        static let warning = Color.orange
        static let error = Color.red
        
        // 背景颜色
        static let background = Color.black
        static let cardBackground = Color.black.opacity(0.85)
        static let toastBackground = Color.black.opacity(0.85)
        
        // 文字颜色
        static let primaryText = Color.white
        static let secondaryText = Color.gray
        static let disabledText = Color.gray.opacity(0.5)
    }
    
    // MARK: - 间距配置
    struct Spacing {
        // 基础间距
        static let xs: CGFloat = 2
        static let sm: CGFloat = 4
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
        static let xxl: CGFloat = 20
        static let xxxl: CGFloat = 24
        
        // 特殊间距
        static let buttonPadding: CGFloat = 12
        static let cardPadding: CGFloat = 16
        static let listItemPadding: CGFloat = 8
        static let bottomSafeArea: CGFloat = 20
    }
    
    // MARK: - 字体配置
    struct Fonts {
        // 标题字体
        static let largeTitle = Font.system(size: 28, weight: .bold)
        static let title = Font.system(size: 24, weight: .bold)
        static let title2 = Font.system(size: 20, weight: .semibold)
        static let title3 = Font.system(size: 18, weight: .semibold)
        
        // 正文字体
        static let body = Font.system(size: 16, weight: .regular)
        static let bodyBold = Font.system(size: 16, weight: .medium)
        static let caption = Font.system(size: 14, weight: .regular)
        static let caption2 = Font.system(size: 12, weight: .regular)
        
        // 特殊字体
        static let emoji = Font.system(size: 22, weight: .regular)
        static let number = Font.system(size: 18, weight: .bold)
    }
    
    // MARK: - 动画配置
    struct Animation {
        // 动画时长
        static let fast: Double = 0.2
        static let normal: Double = 0.3
        static let slow: Double = 0.5
        
        // 动画曲线
        static let easeInOut = SwiftUI.Animation.easeInOut(duration: normal)
        static let spring = SwiftUI.Animation.spring(response: 0.3, dampingFraction: 0.7)
        static let bouncy = SwiftUI.Animation.spring(response: 0.5, dampingFraction: 0.8)
    }
    
    // MARK: - 按钮样式配置
    struct ButtonStyle {
        // 按钮尺寸
        static let smallSize: CGFloat = 32
        static let mediumSize: CGFloat = 44
        static let largeSize: CGFloat = 60
        static let extraLargeSize: CGFloat = 80
        
        // 按钮圆角
        static let cornerRadius: CGFloat = 8
        static let capsuleRadius: CGFloat = 20
        
        // 按钮阴影
        static let shadowRadius: CGFloat = 3
        static let shadowOpacity: Double = 0.3
        static let shadowOffset = CGSize(width: 0, height: 1)
    }
    
    // MARK: - Toast配置
    struct Toast {
        // 显示时长
        static let defaultDuration: TimeInterval = 1.5
        static let shortDuration: TimeInterval = 1.0
        static let longDuration: TimeInterval = 2.5
        
        // 样式
        static let cornerRadius: CGFloat = 20
        static let padding: CGFloat = 12
        static let topMargin: CGFloat = 10
    }
    
    // MARK: - 色轮配置
    struct ColorWheel {
        // 基础尺寸
        static let baseSize: CGFloat = 100
        static let brightnessRingRatio: CGFloat = 0.2
        static let indicatorSize: CGFloat = 18
        static let indicatorInnerSize: CGFloat = 12
        
        // 交互参数
        static let feedbackThreshold: CGFloat = 5
        static let hapticFeedbackCooldown: TimeInterval = 0.1
        static let brightnessRingTolerance: CGFloat = 15
        static let hueFeedbackSegments: Int = 12
    }
    
    // MARK: - 滚轮选择器配置
    struct Picker {
        // 基础尺寸
        static let baseWheelWidth: CGFloat = 50
        static let baseWheelHeight: CGFloat = 70
        static let horizontalSpacing: CGFloat = 4
        static let verticalSpacing: CGFloat = 8
        
        // 字体
        static let emojiFontSize: CGFloat = 22
        static let numberFontSize: CGFloat = 18
    }
    
    // MARK: - 列表配置
    struct List {
        // 列表项高度
        static let itemHeight: CGFloat = 44
        static let compactItemHeight: CGFloat = 36
        
        // 分隔线
        static let separatorColor = Color.gray.opacity(0.3)
        static let separatorHeight: CGFloat = 0.5
    }
    
    // MARK: - 卡片配置
    struct Card {
        // 圆角
        static let cornerRadius: CGFloat = 12
        
        // 阴影
        static let shadowRadius: CGFloat = 4
        static let shadowOpacity: Double = 0.2
        static let shadowOffset = CGSize(width: 0, height: 2)
        
        // 边框
        static let borderWidth: CGFloat = 1
        static let borderColor = Color.gray.opacity(0.3)
    }
    
    // MARK: - 导航配置
    struct Navigation {
        // 标题字体
        static let titleFont = Font.system(size: 18, weight: .semibold)
        
        // 按钮尺寸
        static let buttonSize: CGFloat = 32
        static let buttonIconSize: CGFloat = 16
    }
}

// MARK: - 预定义按钮样式
struct GlobalButtonStyle: ButtonStyle {
    let size: CGFloat
    let backgroundColor: Color
    let foregroundColor: Color
    
    init(size: CGFloat = GlobalConfig.ButtonStyle.mediumSize,
         backgroundColor: Color = GlobalConfig.Colors.primary,
         foregroundColor: Color = GlobalConfig.Colors.primaryText) {
        self.size = size
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
    }
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .medium))
            .foregroundColor(foregroundColor)
            .frame(width: size, height: size)
            .background(
                Circle()
                    .fill(backgroundColor)
                    .shadow(
                        color: Color.black.opacity(GlobalConfig.ButtonStyle.shadowOpacity),
                        radius: GlobalConfig.ButtonStyle.shadowRadius,
                        x: GlobalConfig.ButtonStyle.shadowOffset.width,
                        y: GlobalConfig.ButtonStyle.shadowOffset.height
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .animation(GlobalConfig.Animation.bouncy, value: configuration.isPressed)
    }
}

// MARK: - 胶囊按钮样式
struct CapsuleButtonStyle: ButtonStyle {
    let backgroundColor: Color
    let foregroundColor: Color
    
    init(backgroundColor: Color = GlobalConfig.Colors.primary,
         foregroundColor: Color = GlobalConfig.Colors.primaryText) {
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
    }
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .medium))
            .foregroundColor(foregroundColor)
            .padding(.horizontal, GlobalConfig.Spacing.lg)
            .padding(.vertical, GlobalConfig.Spacing.md)
            .background(
                Capsule()
                    .fill(backgroundColor)
                    .shadow(
                        color: Color.black.opacity(GlobalConfig.ButtonStyle.shadowOpacity),
                        radius: GlobalConfig.ButtonStyle.shadowRadius,
                        x: GlobalConfig.ButtonStyle.shadowOffset.width,
                        y: GlobalConfig.ButtonStyle.shadowOffset.height
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(GlobalConfig.Animation.bouncy, value: configuration.isPressed)
    }
}

// MARK: - 卡片样式
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(GlobalConfig.Spacing.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: GlobalConfig.Card.cornerRadius)
                    .fill(GlobalConfig.Colors.cardBackground)
                    .shadow(
                        color: Color.black.opacity(GlobalConfig.Card.shadowOpacity),
                        radius: GlobalConfig.Card.shadowRadius,
                        x: GlobalConfig.Card.shadowOffset.width,
                        y: GlobalConfig.Card.shadowOffset.height
                    )
            )
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}

// MARK: - 按钮样式
struct BouncyButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .opacity(0.9) // 提高按钮透明度，让按钮更清晰
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed) // 调整动画速度
    }
} 
