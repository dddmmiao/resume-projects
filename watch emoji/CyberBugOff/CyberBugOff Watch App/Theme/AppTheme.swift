import SwiftUI
import WatchKit

/// 全局主题样式
public enum AppTheme {
    // MARK: - 颜色
    
    /// 可选颜色结构体
    public struct ColorOption: Identifiable, Hashable {
        public var id: String { name }
        let name: String
        let color: Color
    }

    /// 所有可选颜色
    public static let colorOptions: [ColorOption] = [
        ColorOption(name: "rainbow", color: .clear), // 彩色选项
        ColorOption(name: "white", color: .white),
        ColorOption(name: "black", color: .black),
        ColorOption(name: "red", color: .red),
        ColorOption(name: "blue", color: .blue),
        ColorOption(name: "green", color: .green),
        ColorOption(name: "purple", color: .purple),
        ColorOption(name: "orange", color: .orange),
        ColorOption(name: "yellow", color: .yellow),
        ColorOption(name: "pink", color: .pink),
        ColorOption(name: "gold", color: Color(red: 1.0, green: 0.84, blue: 0.0)),
        ColorOption(name: "silver", color: Color(red: 0.75, green: 0.75, blue: 0.75)),
        ColorOption(name: "cyan", color: .cyan),
        ColorOption(name: "mint", color: Color(red: 0.0, green: 1.0, blue: 0.5)),
        ColorOption(name: "indigo", color: .indigo),
        ColorOption(name: "teal", color: .teal),
        ColorOption(name: "brown", color: .brown)
    ]

    /// 颜色名称到Color的映射
    public static let colorMap: [String: Color] = {
        var map = [String: Color]()
        for option in colorOptions {
            map[option.name] = option.color
        }
        return map
    }()

    /// 根据名称获取颜色
    public static func getColor(fromName name: String) -> Color {
        return colorMap[name] ?? .white // 默认返回白色
    }
    
    /// 字体大小配置
    public static let fontSizeOptions: [Double] = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]
    public static let defaultFontSize: Double = 24.0
    public static let minFontSize: Double = 12.0
    public static let maxFontSize: Double = 36.0
    public static let fontSizeStep: Double = 2.0
    public static let quickFontSizeStep: Double = 6.0
    
    /// 主色调
    public static let primaryColor = Color(red: 0.1, green: 0.6, blue: 0.9)
    
    /// 次要色调
    public static let secondaryColor = Color(red: 1.0, green: 0.6, blue: 0.0)
    
    /// 强调色
    public static let accentColor = Color(red: 0.9, green: 0.2, blue: 0.6)
    
    /// 警告色
    public static let warningColor = Color(red: 1.0, green: 0.3, blue: 0.2)
    
    /// 错误色
    public static let errorColor = Color(red: 0.9, green: 0.1, blue: 0.1)
    
    /// 成功色
    public static let successColor = Color(red: 0.2, green: 0.8, blue: 0.4)
    
    /// 禁用色
    public static let disabledColor = Color(red: 0.6, green: 0.6, blue: 0.6)
    
    /// 背景色
    public static let backgroundColor = Color.black
    
    /// 次要背景色
    public static let secondaryBackgroundColor = Color(red: 0.2, green: 0.2, blue: 0.2)
    
    /// 卡片背景色
    public static let cardBackgroundColor = Color(red: 0.15, green: 0.15, blue: 0.15)
    
    /// 文本主色
    public static let textColor = Color.white
    
    /// 文本次要色
    public static let secondaryTextColor = Color(white: 0.7)
    
    /// 文本三级色
    public static let tertiaryTextColor = Color(white: 0.5)
    
    /// 文本反色（深底浅字）
    public static let invertedTextColor = Color.black
    
    /// 边框色
    public static let borderColor = Color(white: 0.3)
    
    // MARK: - 尺寸
    
    /// 获取屏幕尺寸
    public static var screenSize: CGSize {
        return WKInterfaceDevice.current().screenBounds.size
    }
    
    /// 获取屏幕宽度
    public static var screenWidth: CGFloat {
        return screenSize.width
    }
    
    /// 获取屏幕高度
    public static var screenHeight: CGFloat {
        return screenSize.height
    }
    
    /// 根据屏幕尺寸自动调整大小
    public static func adaptiveSize(_ size: CGFloat) -> CGFloat {
        let baseScreenWidth: CGFloat = 184.0 // 44mm表盘的宽度
        let scaleFactor = screenWidth / baseScreenWidth
        return size * scaleFactor
    }
    
    /// 极小内边距
    public static var tinyPadding: CGFloat {
        return adaptiveSize(2)
    }
    
    /// 小内边距
    public static var smallPadding: CGFloat {
        return adaptiveSize(4)
    }
    
    /// 中等内边距
    public static var mediumPadding: CGFloat {
        return adaptiveSize(8)
    }
    
    /// 大内边距
    public static var largePadding: CGFloat {
        return adaptiveSize(16)
    }
    
    /// 特大内边距
    public static var extraLargePadding: CGFloat {
        return adaptiveSize(24)
    }
    
    /// 标准内边距
    public static var standardPadding: CGFloat {
        return adaptiveSize(12)
    }
    
    // MARK: - 字体
    
    /// 大标题字体
    public static var largeTitleFont: Font {
        return .system(size: adaptiveSize(22), weight: .bold)
    }
    
    /// 标题字体
    public static var titleFont: Font {
        return .system(size: adaptiveSize(18), weight: .semibold)
    }
    
    /// 副标题字体
    public static var subtitleFont: Font {
        return .system(size: adaptiveSize(16), weight: .medium)
    }
    
    /// 正文字体
    public static var bodyFont: Font {
        return .system(size: adaptiveSize(14))
    }
    
    /// 强调正文字体
    public static var bodyBoldFont: Font {
        return .system(size: adaptiveSize(14), weight: .semibold)
    }
    
    /// 小字体
    public static var smallFont: Font {
        return .system(size: adaptiveSize(12))
    }
    
    /// 迷你字体
    public static var miniFont: Font {
        return .system(size: adaptiveSize(10))
    }

    /// 标签字体（用于滑块标签等）
    public static var labelFont: Font {
        return .system(size: adaptiveSize(11))
    }
    
    // MARK: - 布局常量
    
    /// 标准圆角
    public static var cornerRadius: CGFloat {
        return adaptiveSize(10)
    }
    
    /// 小圆角
    public static var smallCornerRadius: CGFloat {
        return adaptiveSize(6)
    }
    
    /// 大圆角
    public static var largeCornerRadius: CGFloat {
        return adaptiveSize(16)
    }
    
    /// 标准行高
    public static var rowHeight: CGFloat {
        return adaptiveSize(44)
    }
    
    /// 小行高
    public static var smallRowHeight: CGFloat {
        return adaptiveSize(36)
    }
    
    /// 大行高
    public static var largeRowHeight: CGFloat {
        return adaptiveSize(52)
    }
    
    /// 图标尺寸
    public static var iconSize: CGFloat {
        return adaptiveSize(20)
    }
    
    /// 小图标尺寸
    public static var smallIconSize: CGFloat {
        return adaptiveSize(16)
    }
    
    /// 大图标尺寸
    public static var largeIconSize: CGFloat {
        return adaptiveSize(26)
    }
    
    /// 按钮高度
    public static var buttonHeight: CGFloat {
        return adaptiveSize(40)
    }
    
    /// 小按钮高度
    public static var smallButtonHeight: CGFloat {
        return adaptiveSize(32)
    }
    
    /// 大按钮高度
    public static var largeButtonHeight: CGFloat {
        return adaptiveSize(52)
    }
    
    /// 列表项间距
    public static var listItemSpacing: CGFloat {
        return adaptiveSize(8)
    }
    
    /// 标准阴影参数
    public static var standardShadowColor: Color {
        return Color.black.opacity(0.3)
    }
    
    public static var standardShadowRadius: CGFloat {
        return 4
    }
    
    public static var standardShadowX: CGFloat {
        return 0
    }
    
    public static var standardShadowY: CGFloat {
        return 2
    }
    
    /// 文本阴影参数
    public static var textShadowColor: Color {
        return Color.black.opacity(0.5)
    }
    
    public static var textShadowRadius: CGFloat {
        return 2
    }
    
    public static var textShadowX: CGFloat {
        return 0
    }
    
    public static var textShadowY: CGFloat {
        return 1
    }
    
    /// 标准边框宽度
    public static var borderWidth: CGFloat {
        return 1
    }
    
    /// 滑块高度
    public static var sliderHeight: CGFloat {
        return adaptiveSize(20)
    }
    
    /// 选择器高度
    public static var pickerHeight: CGFloat {
        return adaptiveSize(160)
    }
    
    /// 文本行高
    public static var textLineHeight: CGFloat {
        return adaptiveSize(20)
    }
    
    /// 极小圆角
    public static var tinyCornerRadius: CGFloat {
        return adaptiveSize(4)
    }

    // MARK: - 录音视图样式配置

    /// 录音视图样式配置
    public struct RecorderStyle {
        // 按钮样式 - 适配不同表盘尺寸
        public static var buttonSize: CGFloat {
            return AppTheme.adaptiveSize(70)
        }
        public static var buttonBackgroundSize: CGFloat {
            return AppTheme.adaptiveSize(70)
        }
        public static var buttonBorderWidth: CGFloat {
            return AppTheme.adaptiveSize(2)
        }
        public static let buttonBorderOpacity: Double = 0.3

        // 录音按钮内容 - 适配不同表盘尺寸
        public static var recordCircleSize: CGFloat {
            return AppTheme.adaptiveSize(50)
        }
        public static var stopSquareSize: CGFloat {
            return AppTheme.adaptiveSize(30)
        }
        public static var stopSquareCornerRadius: CGFloat {
            return AppTheme.adaptiveSize(8)
        }

        // 时间显示 - 适配不同表盘尺寸
        public static var timeFont: Font {
            return Font.system(size: AppTheme.adaptiveSize(20), weight: .medium, design: .monospaced)
        }
        public static let timeColor = Color.white
        public static var timeSpacing: CGFloat {
            return AppTheme.adaptiveSize(16)
        }

        // 控制按钮 - 优化间距和尺寸
        public static var controlButtonSpacing: CGFloat {
            return AppTheme.adaptiveSize(10)
        }
        public static var controlIconSize: CGFloat {
            return AppTheme.adaptiveSize(30)
        }
        public static var controlButtonSize: CGFloat {
            return AppTheme.adaptiveSize(44) // 增大按钮触摸区域
        }

        // 录音限制
        public static let maxRecordingDuration: TimeInterval = 30.0 // 最大录音时长30秒
        public static let minRecordingDuration: TimeInterval = 0.5  // 最小录音时长0.5秒

        // 动画
        public static let buttonAnimationDuration: Double = 0.25
        public static let transitionAnimation = Animation.easeInOut(duration: buttonAnimationDuration)

        // 颜色
        public static let backgroundColor = Color.black
        public static let primaryColor = Color.red
        public static let secondaryColor = Color.white
        public static let successColor = Color.green
        public static let warningColor = Color.orange
        public static let buttonBackgroundColor = Color.black
        public static var borderColor: Color {
            return Color.white.opacity(buttonBorderOpacity)
        }
    }
    
    // MARK: - 动画
    
    /// 标准动画持续时间
    public static let animationDuration: Double = 0.2
    
    /// 弹性动画（简化版本，避免复杂动画）
    public static func springAnimation(duration: Double = 0.3, dampingFraction: Double = 0.6) -> Animation {
        // 使用简化的easeInOut动画，避免复杂的弹性效果
        return .easeInOut(duration: duration * 0.8) // 稍微缩短动画时间
    }
    
    /// 标准动画
    public static func standardAnimation(duration: Double = 0.2) -> Animation {
        return .easeInOut(duration: duration)
    }
    
    /// 淡入动画
    public static func fadeAnimation(duration: Double = 0.15) -> Animation {
        return .easeIn(duration: duration)
    }
    
    /// 淡出动画
    public static func fadeOutAnimation(duration: Double = 0.15) -> Animation {
        return .easeOut(duration: duration)
    }

    // MARK: - Toast Animation
    
    /// Toast动画参数结构体
    public struct AnimationParams {
        let primaryOffsetY: CGFloat
        let finalOffsetY: CGFloat?
        let finalOffsetX: CGFloat?
        let primaryScale: CGFloat?
        let midScale: CGFloat?
        let finalScale: CGFloat?
        let primaryRotation: Double?
        let primaryDuration: TimeInterval
        let midDuration: TimeInterval?
        let finalDuration: TimeInterval?
        
        public init(
            primaryOffsetY: CGFloat,
            finalOffsetY: CGFloat? = nil,
            finalOffsetX: CGFloat? = nil,
            primaryScale: CGFloat? = nil,
            midScale: CGFloat? = nil,
            finalScale: CGFloat? = nil,
            primaryRotation: Double? = nil,
            primaryDuration: TimeInterval,
            midDuration: TimeInterval? = nil,
            finalDuration: TimeInterval? = nil
        ) {
            self.primaryOffsetY = primaryOffsetY
            self.finalOffsetY = finalOffsetY
            self.finalOffsetX = finalOffsetX
            self.primaryScale = primaryScale
            self.midScale = midScale
            self.finalScale = finalScale
            self.primaryRotation = primaryRotation
            self.primaryDuration = primaryDuration
            self.midDuration = midDuration
            self.finalDuration = finalDuration
        }
    }

    /// Toast基础配置
    public static let toastBaseOffsetY: CGFloat = -35
    public static let toastDisplayDuration: TimeInterval = 1.2

    /// Toast动画样式配置
    public static let toastAnimationConfigs: [TriggerAnimationStyle: AnimationParams] = [
        .bounce: AnimationParams(
            primaryOffsetY: -25,
            finalOffsetY: -35,
            primaryDuration: 0.3,
            finalDuration: 0.7
        ),
        .scale: AnimationParams(
            primaryOffsetY: -20,
            finalOffsetY: -30,
            primaryScale: 1.5,
            finalScale: 0.5,
            primaryDuration: 0.2,
            finalDuration: 0.8
        ),
        .slide: AnimationParams(
            primaryOffsetY: -25,
            finalOffsetX: 50,
            primaryDuration: 1.0
        ),
        .fade: AnimationParams(
            primaryOffsetY: -30,
            primaryDuration: 1.0
        ),
        .rotate: AnimationParams(
            primaryOffsetY: -35,
            primaryRotation: 360,
            primaryDuration: 1.0
        ),
        .heart: AnimationParams(
            primaryOffsetY: -20,
            finalOffsetY: -35,
            primaryScale: 1.3,
            midScale: 1.0,
            finalScale: 0.8,
            primaryDuration: 0.1,
            midDuration: 0.2,
            finalDuration: 0.6
        ),
        // 新增高级动画配置
        .flip: AnimationParams(
            primaryOffsetY: -30,
            finalOffsetY: -40,
            primaryScale: 1.0,
            finalScale: 0.1,
            primaryRotation: 180,
            primaryDuration: 0.4,
            finalDuration: 0.6
        ),
        .wave: AnimationParams(
            primaryOffsetY: -15,
            finalOffsetY: -45,
            primaryScale: 1.2,
            finalScale: 0.6,
            primaryDuration: 0.8,
            finalDuration: 0.4
        ),
        .pulse: AnimationParams(
            primaryOffsetY: -25,
            finalOffsetY: -35,
            primaryScale: 1.4,
            midScale: 0.8,
            finalScale: 1.1,
            primaryDuration: 0.15,
            midDuration: 0.15,
            finalDuration: 0.9
        ),
        .sparkle: AnimationParams(
            primaryOffsetY: -20,
            finalOffsetY: -50,
            primaryScale: 0.5,
            midScale: 1.8,
            finalScale: 0.3,
            primaryDuration: 0.1,
            midDuration: 0.2,
            finalDuration: 0.9
        ),
        .spiral: AnimationParams(
            primaryOffsetY: -30,
            finalOffsetY: -60,
            finalOffsetX: 30,
            primaryScale: 1.0,
            finalScale: 0.2,
            primaryRotation: 720,
            primaryDuration: 1.2
        ),
        .shake: AnimationParams(
            primaryOffsetY: -25,
            finalOffsetY: -35,
            finalOffsetX: 0,
            primaryScale: 1.1,
            finalScale: 0.8,
            primaryDuration: 0.6,
            finalDuration: 0.6
        )
    ]
}

// MARK: - Color扩展
extension Color {
    static let primary = AppTheme.primaryColor
    static let secondary = AppTheme.secondaryColor
    static let accent = AppTheme.accentColor
    static let warning = AppTheme.warningColor
    static let error = AppTheme.errorColor
    static let success = AppTheme.successColor
    static let disabled = AppTheme.disabledColor
    static let textPrimary = AppTheme.textColor
    static let textSecondary = AppTheme.secondaryTextColor
    static let textTertiary = AppTheme.tertiaryTextColor
    static let textInverted = AppTheme.invertedTextColor
    static let backgroundPrimary = AppTheme.backgroundColor
    static let backgroundSecondary = AppTheme.secondaryBackgroundColor
    static let cardBackground = AppTheme.cardBackgroundColor
    static let border = AppTheme.borderColor
}

// MARK: - Font扩展
extension Font {
    static let appLargeTitle = AppTheme.largeTitleFont
    static let appTitle = AppTheme.titleFont
    static let appSubtitle = AppTheme.subtitleFont
    static let appBody = AppTheme.bodyFont
    static let appBodyBold = AppTheme.bodyBoldFont
    static let appSmall = AppTheme.smallFont
    static let appMini = AppTheme.miniFont
    static let appLabel = AppTheme.labelFont
}

// MARK: - Animation扩展
extension Animation {
    static func standardAnimation(duration: Double = 0.2) -> Animation {
        return AppTheme.standardAnimation(duration: duration)
    }
    
    static func springAnimation(duration: Double = 0.3, dampingFraction: Double = 0.6) -> Animation {
        return AppTheme.springAnimation(duration: duration, dampingFraction: dampingFraction)
    }

    /// 安全的动画选择器（简化版本）
    static func safeAnimation(duration: Double = 0.2) -> Animation {
        // 统一使用简化的easeInOut动画
        return .easeInOut(duration: duration)
    }
    
    static func fadeAnimation(duration: Double = 0.15) -> Animation {
        return AppTheme.fadeAnimation(duration: duration)
    }
    
    static func fadeOutAnimation(duration: Double = 0.15) -> Animation {
        return AppTheme.fadeOutAnimation(duration: duration)
    }
}

// MARK: - 尺寸常量
struct Sizes {
    static let tinyPadding: CGFloat = AppTheme.tinyPadding
    static let smallPadding: CGFloat = AppTheme.smallPadding
    static let mediumPadding: CGFloat = AppTheme.mediumPadding
    static let largePadding: CGFloat = AppTheme.largePadding
    static let extraLargePadding: CGFloat = AppTheme.extraLargePadding
    static let cornerRadius: CGFloat = AppTheme.cornerRadius
    static let smallCornerRadius: CGFloat = AppTheme.smallCornerRadius
    static let largeCornerRadius: CGFloat = AppTheme.largeCornerRadius
    static let tinyCornerRadius: CGFloat = AppTheme.tinyCornerRadius
    static let rowHeight: CGFloat = AppTheme.rowHeight
    static let smallRowHeight: CGFloat = AppTheme.smallRowHeight
    static let largeRowHeight: CGFloat = AppTheme.largeRowHeight
    static let iconSize: CGFloat = AppTheme.iconSize
    static let smallIconSize: CGFloat = AppTheme.smallIconSize
    static let largeIconSize: CGFloat = AppTheme.largeIconSize
    static let buttonHeight: CGFloat = AppTheme.buttonHeight
    static let smallButtonHeight: CGFloat = AppTheme.smallButtonHeight
    static let largeButtonHeight: CGFloat = AppTheme.largeButtonHeight
    static let sliderHeight: CGFloat = AppTheme.sliderHeight
    static let pickerHeight: CGFloat = AppTheme.pickerHeight
    static let textLineHeight: CGFloat = AppTheme.textLineHeight
    static let listItemSpacing: CGFloat = AppTheme.listItemSpacing
    static let borderWidth: CGFloat = AppTheme.borderWidth
    
    // 阴影参数
    static let standardShadowColor: Color = AppTheme.standardShadowColor
    static let standardShadowRadius: CGFloat = AppTheme.standardShadowRadius
    static let standardShadowX: CGFloat = AppTheme.standardShadowX
    static let standardShadowY: CGFloat = AppTheme.standardShadowY
    
    static let textShadowColor: Color = AppTheme.textShadowColor
    static let textShadowRadius: CGFloat = AppTheme.textShadowRadius
    static let textShadowX: CGFloat = AppTheme.textShadowX
    static let textShadowY: CGFloat = AppTheme.textShadowY
    
    static let animationDuration: Double = AppTheme.animationDuration
    static let screenSize: CGSize = AppTheme.screenSize
    static let backgroundColor = AppTheme.backgroundColor
    static let textColor = AppTheme.textColor
    static let standardAnimation = AppTheme.standardAnimation
}

// MARK: - View扩展
extension View {
    /// 应用主按钮样式（无阴影版本）
    func primaryButtonStyle() -> some View {
        self
            .frame(maxWidth: .infinity)
            .frame(height: Sizes.buttonHeight)
            .background(Color.primary)
            .foregroundColor(Color.textPrimary)
            .cornerRadius(Sizes.cornerRadius)
    }
    
    /// 应用次要按钮样式（无阴影版本）
    func secondaryButtonStyle() -> some View {
        self
            .frame(maxWidth: .infinity)
            .frame(height: Sizes.buttonHeight)
            .background(Color.secondary)
            .foregroundColor(Color.textPrimary)
            .cornerRadius(Sizes.cornerRadius)
    }
    
    /// 应用强调按钮样式（无阴影版本）
    func accentButtonStyle() -> some View {
        self
            .frame(maxWidth: .infinity)
            .frame(height: Sizes.buttonHeight)
            .background(Color.accent)
            .foregroundColor(Color.textPrimary)
            .cornerRadius(Sizes.cornerRadius)
    }
    
    /// 应用成功按钮样式（无阴影版本）
    func successButtonStyle() -> some View {
        self
            .frame(maxWidth: .infinity)
            .frame(height: Sizes.buttonHeight)
            .background(Color.success)
            .foregroundColor(Color.textPrimary)
            .cornerRadius(Sizes.cornerRadius)
    }

    /// 应用警告按钮样式（无阴影版本）
    func warningButtonStyle() -> some View {
        self
            .frame(maxWidth: .infinity)
            .frame(height: Sizes.buttonHeight)
            .background(Color.warning)
            .foregroundColor(Color.textPrimary)
            .cornerRadius(Sizes.cornerRadius)
    }
    
    /// 应用标准卡片样式（无阴影版本）
    func cardStyle() -> some View {
        self
            .padding(Sizes.mediumPadding)
            .background(Color.cardBackground)
            .cornerRadius(Sizes.cornerRadius)
    }
    
    /// 应用图标样式
    func iconStyle(color: Color = .primary) -> some View {
        self
            .font(.system(size: Sizes.iconSize))
            .foregroundColor(color)
    }
    
    /// 应用小图标样式
    func smallIconStyle(color: Color = .primary) -> some View {
        self
            .font(.system(size: Sizes.smallIconSize))
            .foregroundColor(color)
    }
    
    /// 应用大图标样式
    func largeIconStyle(color: Color = .primary) -> some View {
        self
            .font(.system(size: Sizes.largeIconSize))
            .foregroundColor(color)
    }
    
    /// 应用标题文本样式
    func titleTextStyle() -> some View {
        self
            .font(.appTitle)
            .foregroundColor(.textPrimary)
    }
    
    /// 应用副标题文本样式
    func subtitleTextStyle() -> some View {
        self
            .font(.appSubtitle)
            .foregroundColor(.textPrimary)
    }
    
    /// 应用正文文本样式
    func bodyTextStyle() -> some View {
        self
            .font(.appBody)
            .foregroundColor(.textPrimary)
    }
    
    /// 应用次要文本样式
    func secondaryTextStyle() -> some View {
        self
            .font(.appBody)
            .foregroundColor(.textSecondary)
    }
    
    /// 应用小文本样式
    func smallTextStyle() -> some View {
        self
            .font(.appSmall)
            .foregroundColor(.textSecondary)
    }

    /// 应用提示文本样式
    func hintTextStyle() -> some View {
        self
            .font(.appLabel)
            .foregroundColor(.textSecondary)
    }

    /// 应用警告提示文本样式
    func warningHintTextStyle() -> some View {
        self
            .font(.appLabel)
            .foregroundColor(AppTheme.warningColor)
    }

    /// 应用说明文本样式
    func descriptionTextStyle() -> some View {
        self
            .font(.appLabel)
            .foregroundColor(.textTertiary)
    }
    
    /// 应用标准边框样式
    func standardBorder() -> some View {
        self.overlay(
            RoundedRectangle(cornerRadius: Sizes.cornerRadius)
                .stroke(Color.border, lineWidth: Sizes.borderWidth)
        )
    }
    
    // 阴影样式已移除以提升性能
    
    /// 应用图标按钮样式
    func iconButtonStyle(color: Color = .primary, backgroundColor: Color? = nil, size: CGFloat = Sizes.iconSize) -> some View {
        self.buttonStyle(IconButtonStyle(color: color, backgroundColor: backgroundColor, size: size))
    }

    ///支持指定特定角落的圆角
     func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCornerShape(radius: radius, corners: corners))
    }

    /// 应用主要胶囊按钮样式
    func primaryCapsuleStyle(height: CGFloat = Sizes.buttonHeight, isDisabled: Bool = false) -> some View {
        self.buttonStyle(CapsuleButtonStyle(color: AppTheme.primaryColor, height: height, isDisabled: isDisabled))
    }
    
    /// 应用次要胶囊按钮样式
    func secondaryCapsuleStyle(height: CGFloat = Sizes.buttonHeight, isDisabled: Bool = false) -> some View {
        self.buttonStyle(CapsuleButtonStyle(color: AppTheme.secondaryColor, height: height, isDisabled: isDisabled))
    }
    
    /// 应用强调胶囊按钮样式
    func accentCapsuleStyle(height: CGFloat = Sizes.buttonHeight, isDisabled: Bool = false) -> some View {
        self.buttonStyle(CapsuleButtonStyle(color: AppTheme.accentColor, height: height, isDisabled: isDisabled))
    }
    
    /// 应用警告胶囊按钮样式
    func warningCapsuleStyle(height: CGFloat = Sizes.buttonHeight, isDisabled: Bool = false) -> some View {
        self.buttonStyle(CapsuleButtonStyle(color: AppTheme.warningColor, height: height, isDisabled: isDisabled))
    }
    
    /// 应用成功胶囊按钮样式
    func successCapsuleStyle(height: CGFloat = Sizes.buttonHeight, isDisabled: Bool = false) -> some View {
        self.buttonStyle(CapsuleButtonStyle(color: AppTheme.successColor, height: height, isDisabled: isDisabled))
    }
    
    /// 应用浮动操作按钮样式
    func floatingActionButtonStyle(color: Color, size: CGFloat = Sizes.largeButtonHeight) -> some View {
        self.buttonStyle(FloatingActionButtonStyle(color: color, size: size))
    }
}

// MARK: - 按钮样式
/// 胶囊按钮样式
public struct CapsuleButtonStyle: ButtonStyle {
    var color: Color
    var foregroundColor: Color = .white
    var height: CGFloat
    var isDisabled: Bool
    
    public init(color: Color, foregroundColor: Color = .white, height: CGFloat = AppTheme.buttonHeight, isDisabled: Bool = false) {
        self.color = color
        self.foregroundColor = foregroundColor
        self.height = height
        self.isDisabled = isDisabled
    }
    
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.appBody)
            .foregroundColor(isDisabled ? .textTertiary : foregroundColor)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .padding(.horizontal, Sizes.mediumPadding)
            .background(
                Capsule()
                    .fill(isDisabled ? Color.disabled : color)
                    .opacity(configuration.isPressed && !isDisabled ? 0.8 : 1.0)
            )
            .scaleEffect(configuration.isPressed && !isDisabled ? 0.98 : 1.0)
            .animation(AppTheme.standardAnimation(), value: configuration.isPressed)
    }
}

/// 图标按钮样式
public struct IconButtonStyle: ButtonStyle {
    var color: Color
    var backgroundColor: Color?
    var size: CGFloat
    
    public init(color: Color, backgroundColor: Color? = nil, size: CGFloat = AppTheme.iconSize) {
        self.color = color
        self.backgroundColor = backgroundColor
        self.size = size
    }
    
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size))
            .foregroundColor(color.opacity(configuration.isPressed ? 0.7 : 1.0))
            .background(
                Group {
                    if let bgColor = backgroundColor {
                        Circle()
                            .fill(bgColor)
                            .frame(width: size * 2, height: size * 2)
                    }
                }
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(AppTheme.standardAnimation(), value: configuration.isPressed)
    }
}

/// 浮动操作按钮样式
public struct FloatingActionButtonStyle: ButtonStyle {
    var color: Color
    var size: CGFloat
    
    public init(color: Color, size: CGFloat = AppTheme.largeButtonHeight) {
        self.color = color
        self.size = size
    }
    
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .medium))
            .foregroundColor(color)
            .frame(width: size, height: size)
            .background(
                Circle()
                    .fill(Color.white)
                    .frame(width: size * 0.85, height: size * 0.85)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - 侧滑提示动画配置
extension AppTheme {
    /// 侧滑提示动画配置（性能优化版本）
    public struct SwipeHintConfig {
        /// 最大提示数量（只对第一个项目显示提示）
        public static let maxHintCount = 1

        /// 提示延迟时间（秒）- 缩短延迟
        public static let hintDelay: TimeInterval = 0.3

        /// 动画持续时间（秒）- 缩短动画时间
        public static let animationDuration: TimeInterval = 0.5

        /// 动画偏移量（像素）- 减小幅度
        public static let animationOffset: CGFloat = 20.0

        /// 动画缓动函数 - 使用更快的动画
        public static let animationEasing = Animation.easeInOut(duration: animationDuration)
    }

    /// 侧滑提示动画管理器
    public class SwipeHintManager: ObservableObject {
        private static let userDefaultsKeyPrefix = "SwipeHintShown_"
        private var pageType: String = ""

        // 动画控制相关
        private var currentAnimationTasks: [DispatchWorkItem] = []
        private var isAnimating: Bool = false
        private var currentAnimationIdentifier: String?

        // 活动偏移量引用，用于全局重置
        private var activeOffsets: [String: Binding<CGFloat>] = [:]

        /// 初始化管理器，指定页面类型
        public init(pageType: String = "") {
            self.pageType = pageType
        }

        /// 检查指定页面是否已显示过侧滑提示
        private var hasShownPageHint: Bool {
            get {
                let key = Self.userDefaultsKeyPrefix + pageType
                return UserDefaults.standard.bool(forKey: key)
            }
            set {
                let key = Self.userDefaultsKeyPrefix + pageType
                UserDefaults.standard.set(newValue, forKey: key)
            }
        }

        /// 判断是否应该为指定项目显示侧滑提示
        public func shouldShowHint(for identifier: String, at index: Int) -> Bool {
            return index < SwipeHintConfig.maxHintCount && !hasShownPageHint
        }

        /// 标记已显示提示（页面特定标记）
        public func markHintShown(for identifier: String) {
            hasShownPageHint = true
        }

        /// 停止当前动画并重置偏移（性能优化版本）
        public func stopCurrentAnimation(offset: Binding<CGFloat>) {
            // 取消所有待执行的动画任务
            currentAnimationTasks.forEach { $0.cancel() }
            currentAnimationTasks.removeAll()

            // 重置状态
            isAnimating = false
            let stoppedIdentifier = currentAnimationIdentifier
            currentAnimationIdentifier = nil

            // 使用更快的动画重置偏移到0
            withAnimation(.easeOut(duration: 0.15)) {
                offset.wrappedValue = 0
            }

            // 清理对应的偏移量引用
            if let identifier = stoppedIdentifier {
                activeOffsets.removeValue(forKey: identifier)
            }
        }

        /// 立即停止当前动画并跳到终点（用于全局停止）
        public func stopCurrentAnimationImmediately(offset: Binding<CGFloat>) {
            // 取消所有待执行的动画任务
            currentAnimationTasks.forEach { $0.cancel() }
            currentAnimationTasks.removeAll()

            // 重置状态
            isAnimating = false
            let stoppedIdentifier = currentAnimationIdentifier
            currentAnimationIdentifier = nil

            // 立即跳到终点，不使用动画过渡
            offset.wrappedValue = 0

            // 清理对应的偏移量引用
            if let identifier = stoppedIdentifier {
                activeOffsets.removeValue(forKey: identifier)
            }
        }

        /// 停止所有动画（用于全局停止）
        /// 立即将所有动画跳到终点（0位置），模拟动画完成的效果
        public func stopAllAnimations() {
            // 取消所有待执行的动画任务
            currentAnimationTasks.forEach { $0.cancel() }
            currentAnimationTasks.removeAll()

            // 立即将所有活动偏移量设置为终点（0），不使用动画过渡
            // 这样看起来像是动画立即完成了，而不是被中断
            for (_, offsetBinding) in activeOffsets {
                offsetBinding.wrappedValue = 0
            }

            // 重置状态
            isAnimating = false
            currentAnimationIdentifier = nil

            // 清理偏移量引用
            activeOffsets.removeAll()
        }

        /// 检查是否有动画正在执行
        public var isCurrentlyAnimating: Bool {
            return isAnimating
        }

        /// 执行侧滑提示动画（支持单向和双向）
        public func performHint(
            for identifier: String,
            offset: Binding<CGFloat>,
            style: SwipeHintStyle = .single(.right)
        ) {
            guard !hasShownPageHint else { return }

            // 如果已经有动画在执行，先停止
            if isAnimating {
                stopCurrentAnimation(offset: offset)
            }

            // 注册偏移量引用
            activeOffsets[identifier] = offset
            Logger.debug("SwipeHintManager: registered offset for \(identifier), activeOffsets count: \(activeOffsets.count)", category: .ui)

            // 设置当前动画状态
            isAnimating = true
            currentAnimationIdentifier = identifier

            switch style {
            case .single(let direction):
                SwipeHintManager.performSwipeHint(
                    offset: offset,
                    direction: direction,
                    identifier: identifier,
                    manager: self
                )
            case .bidirectional(let startDirection):
                SwipeHintManager.performBidirectionalSwipeHint(
                    offset: offset,
                    startDirection: startDirection,
                    identifier: identifier,
                    manager: self
                )
            case .wiggle:
                SwipeHintManager.performWiggleSwipeHint(
                    offset: offset,
                    identifier: identifier,
                    manager: self
                )
            }
        }

        /// 重置提示状态（用于开发测试，重置当前页面状态）
        public func resetHints() {
            hasShownPageHint = false
        }

        /// 静态方法：重置所有页面的提示状态（用于开发测试）
        public static func resetAllHintStates() {
            let defaults = UserDefaults.standard
            let keys = defaults.dictionaryRepresentation().keys
            for key in keys {
                if key.hasPrefix(userDefaultsKeyPrefix) {
                    defaults.removeObject(forKey: key)
                }
            }
        }

        /// 执行侧滑提示动画
        public static func performSwipeHint(
            offset: Binding<CGFloat>,
            direction: SwipeDirection = .left,
            identifier: String? = nil,
            manager: SwipeHintManager? = nil,
            completion: (() -> Void)? = nil
        ) {
            let targetOffset = direction == .left ? -SwipeHintConfig.animationOffset : SwipeHintConfig.animationOffset

            // 创建延迟启动任务
            let delayTask = DispatchWorkItem {
                // 检查动画是否被取消
                guard manager?.isAnimating == true else { return }

                // 标记为已显示（在动画开始时）
                if let identifier = identifier, let manager = manager {
                    manager.markHintShown(for: identifier)
                }

                withAnimation(SwipeHintConfig.animationEasing) {
                    offset.wrappedValue = targetOffset
                }

                // 创建回弹任务
                let bounceTask = DispatchWorkItem {
                    // 检查动画是否被取消
                    guard manager?.isAnimating == true else { return }

                    withAnimation(SwipeHintConfig.animationEasing) {
                        offset.wrappedValue = 0
                    }

                    // 动画完成，重置状态
                    manager?.isAnimating = false
                    if let identifier = identifier {
                        manager?.activeOffsets.removeValue(forKey: identifier)
                    }
                    manager?.currentAnimationIdentifier = nil
                    completion?()
                }

                // 添加到管理器的任务列表
                manager?.currentAnimationTasks.append(bounceTask)

                // 延迟执行回弹
                DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.animationDuration, execute: bounceTask)
            }

            // 添加到管理器的任务列表
            manager?.currentAnimationTasks.append(delayTask)

            // 延迟启动动画
            DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.hintDelay, execute: delayTask)
        }

        /// 执行双向侧滑提示动画（先左后右或先右后左）
        public static func performBidirectionalSwipeHint(
            offset: Binding<CGFloat>,
            startDirection: SwipeDirection = .right,
            identifier: String? = nil,
            manager: SwipeHintManager? = nil,
            completion: (() -> Void)? = nil
        ) {
            let firstOffset = startDirection == .left ? -SwipeHintConfig.animationOffset : SwipeHintConfig.animationOffset
            let secondOffset = startDirection == .left ? SwipeHintConfig.animationOffset : -SwipeHintConfig.animationOffset

            // 创建延迟启动任务
            let delayTask = DispatchWorkItem {
                guard manager?.isAnimating == true else { return }

                // 标记为已显示（在动画开始时）
                if let identifier = identifier, let manager = manager {
                    manager.markHintShown(for: identifier)
                }

                // 第一个方向的动画
                withAnimation(SwipeHintConfig.animationEasing) {
                    offset.wrappedValue = firstOffset
                }

                // 创建回到中心的任务
                let centerTask1 = DispatchWorkItem {
                    guard manager?.isAnimating == true else { return }

                    withAnimation(SwipeHintConfig.animationEasing) {
                        offset.wrappedValue = 0
                    }

                    // 创建第二个方向的任务
                    let secondDirectionTask = DispatchWorkItem {
                        guard manager?.isAnimating == true else { return }

                        withAnimation(SwipeHintConfig.animationEasing) {
                            offset.wrappedValue = secondOffset
                        }

                        // 创建最终回到中心的任务
                        let finalCenterTask = DispatchWorkItem {
                            guard manager?.isAnimating == true else { return }

                            withAnimation(SwipeHintConfig.animationEasing) {
                                offset.wrappedValue = 0
                            }

                            // 动画完成，重置状态
                            manager?.isAnimating = false
                            if let identifier = identifier {
                                manager?.activeOffsets.removeValue(forKey: identifier)
                            }
                            manager?.currentAnimationIdentifier = nil
                            completion?()
                        }

                        manager?.currentAnimationTasks.append(finalCenterTask)
                        DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.animationDuration, execute: finalCenterTask)
                    }

                    manager?.currentAnimationTasks.append(secondDirectionTask)
                    DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.animationDuration * 0.3, execute: secondDirectionTask)
                }

                manager?.currentAnimationTasks.append(centerTask1)
                DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.animationDuration, execute: centerTask1)
            }

            manager?.currentAnimationTasks.append(delayTask)
            DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.hintDelay, execute: delayTask)
        }

        /// 执行摆动式双向提示动画（左右摆动）
        public static func performWiggleSwipeHint(
            offset: Binding<CGFloat>,
            identifier: String? = nil,
            manager: SwipeHintManager? = nil,
            completion: (() -> Void)? = nil
        ) {
            let smallOffset = SwipeHintConfig.animationOffset * 0.6

            // 创建延迟启动任务
            let delayTask = DispatchWorkItem {
                guard manager?.isAnimating == true else { return }

                // 标记为已显示（在动画开始时）
                if let identifier = identifier, let manager = manager {
                    manager.markHintShown(for: identifier)
                }

                // 摆动动画序列：右 -> 左 -> 右 -> 中心
                let animationDuration = SwipeHintConfig.animationDuration * 0.4

                // 向右
                withAnimation(.easeInOut(duration: animationDuration)) {
                    offset.wrappedValue = smallOffset
                }

                // 创建向左的任务
                let leftTask = DispatchWorkItem {
                    guard manager?.isAnimating == true else { return }

                    withAnimation(.easeInOut(duration: animationDuration)) {
                        offset.wrappedValue = -smallOffset
                    }

                    // 创建再向右的任务
                    let rightTask = DispatchWorkItem {
                        guard manager?.isAnimating == true else { return }

                        withAnimation(.easeInOut(duration: animationDuration)) {
                            offset.wrappedValue = smallOffset
                        }

                        // 创建回到中心的任务
                        let centerTask = DispatchWorkItem {
                            guard manager?.isAnimating == true else { return }

                            withAnimation(.easeInOut(duration: animationDuration)) {
                                offset.wrappedValue = 0
                            }

                            // 动画完成，重置状态
                            manager?.isAnimating = false
                            if let identifier = identifier {
                                manager?.activeOffsets.removeValue(forKey: identifier)
                            }
                            manager?.currentAnimationIdentifier = nil
                            completion?()
                        }

                        manager?.currentAnimationTasks.append(centerTask)
                        DispatchQueue.main.asyncAfter(deadline: .now() + animationDuration, execute: centerTask)
                    }

                    manager?.currentAnimationTasks.append(rightTask)
                    DispatchQueue.main.asyncAfter(deadline: .now() + animationDuration, execute: rightTask)
                }

                manager?.currentAnimationTasks.append(leftTask)
                DispatchQueue.main.asyncAfter(deadline: .now() + animationDuration, execute: leftTask)
            }

            manager?.currentAnimationTasks.append(delayTask)
            DispatchQueue.main.asyncAfter(deadline: .now() + SwipeHintConfig.hintDelay, execute: delayTask)
        }
    }

    /// 侧滑方向
    public enum SwipeDirection {
        case left   // 向左滑动（提示右滑操作）
        case right  // 向右滑动（提示左滑操作）
    }

    /// 侧滑提示样式
    public enum SwipeHintStyle {
        case single(SwipeDirection)           // 单向提示
        case bidirectional(SwipeDirection)    // 双向提示（指定起始方向）
        case wiggle                          // 摆动提示
    }
}

// MARK: - 提示文本组件
extension AppTheme {
    /// 提示文本样式配置
    public struct HintTextStyle {
        public static let font = Font.appLabel
        public static let foregroundColor = Color.secondary
        public static let backgroundColor = Color.clear
        public static let cornerRadius: CGFloat = adaptiveSize(8)
        public static let padding: EdgeInsets = EdgeInsets(
            top: adaptiveSize(4),
            leading: adaptiveSize(8),
            bottom: adaptiveSize(4),
            trailing: adaptiveSize(8)
        )
        public static let textAlignment = TextAlignment.center
    }
}

/// 通用提示文本组件
public struct HintTextView: View {
    private let text: String
    private let style: AppTheme.HintTextStyle.Type

    public init(_ text: String, style: AppTheme.HintTextStyle.Type = AppTheme.HintTextStyle.self) {
        self.text = text
        self.style = style
    }

    public var body: some View {
        Text(text)
            .font(style.font)
            .foregroundColor(style.foregroundColor)
            .multilineTextAlignment(style.textAlignment)
            .padding(style.padding)
            .background(style.backgroundColor)
            .cornerRadius(style.cornerRadius)
    }
}

/// Section Footer 样式的提示文本组件
public struct SectionFooterHintTextView: View {
    private let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        HintTextView(text)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, AppTheme.mediumPadding)
    }
}

/// List 内嵌样式的提示文本组件
public struct ListHintTextView: View {
    private let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        HStack {
            Spacer()
            HintTextView(text)
            Spacer()
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
    }
}

// 自定义形状以支持特定角落的圆角
struct RoundedCornerShape: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect,
                               byRoundingCorners: corners,
                               cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}
