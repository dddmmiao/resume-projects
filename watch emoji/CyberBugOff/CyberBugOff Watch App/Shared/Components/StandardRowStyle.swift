import SwiftUI

/*
 功能行样式系统使用指南
 
 这个系统提供了统一的功能行样式，支持多种预设样式和全局主题配置。
 
 ## 基础用法
 
 ```swift
 // 标准功能行 - 用于普通设置项、导航项等
 HStack {
     Image(systemName: "speaker.wave.2")
     Text("音效")
     Spacer()
     Text("已选择 3 个")
 }
 .standardRowStyle()
 
 // 预览播放行 - 支持动态状态变化
 HStack {
     Image(systemName: isPlaying ? "stop.fill" : "play.fill")
     Text(isPlaying ? "停止预览" : "播放预览")
     Spacer()
 }
 .previewRowStyle(isActive: isPlaying)
 
 // 操作按钮行 - 用于确认、取消、删除等操作
 HStack {
     Image(systemName: "checkmark")
     Text("确认")
 }
 .actionRowStyle(.primary)  // 主要操作
 
 HStack {
     Image(systemName: "trash")
     Text("删除")
 }
 .actionRowStyle(.warning)  // 警告操作
 
 // 高亮强调行 - 用于重要信息展示
 HStack {
     Image(systemName: "star.fill")
     Text("重要提示")
 }
 .highlightedRowStyle()
 
 // 次要信息行 - 用于辅助信息、说明文本等
 HStack {
     Image(systemName: "info.circle")
     Text("帮助信息")
 }
 .secondaryRowStyle()
 ```
 
 ## 主题切换
 
 通过 FunctionRowThemeManager 可以全局切换主题：
 
 ```swift
 // 切换到自定义主题
 let customTheme = FunctionRowTheme(
     rowHeight: 50,
     cornerRadius: 12,
     // ... 其他配置
 )
 FunctionRowThemeManager.shared.updateTheme(customTheme)
 ```
 
 ## 样式类型说明
 
 - `.standard`: 标准样式，用于普通功能行
 - `.preview`: 预览样式，支持激活状态，用于播放控制
 - `.action`: 操作样式，分为 primary/warning/secondary 三种
 - `.highlighted`: 高亮样式，用于强调重要信息
 - `.secondary`: 次要样式，用于辅助信息
 */

// MARK: - 功能行样式枚举
enum FunctionRowStyle {
    case standard           // 标准功能行
    case preview           // 预览播放类（支持动态状态）
    case action            // 底部操作类（确认/取消等）
    case highlighted       // 高亮强调类
    case secondary         // 次要信息类
    case dropdown          // 下拉列表项
    case dropdownContainer // 下拉列表容器
}

// MARK: - 功能行内容样式配置
struct FunctionRowContentStyle {
    // 左侧内容样式
    let leftIconSize: CGFloat
    let leftIconColor: Color
    let leftTextFont: Font
    let leftTextColor: Color
    let leftSpacing: CGFloat

    // 右侧内容样式
    let rightTextFont: Font
    let rightTextColor: Color
    let rightIconFont: Font
    let rightIconColor: Color
    let rightSpacing: CGFloat

    // 默认样式
    static let `default` = FunctionRowContentStyle(
        leftIconSize: AppTheme.smallIconSize,
        leftIconColor: AppTheme.primaryColor,
        leftTextFont: .appBody,
        leftTextColor: Color.textPrimary,
        leftSpacing: AppTheme.smallPadding,

        rightTextFont: .appSmall,
        rightTextColor: Color.gray,
        rightIconFont: .appSmall,
        rightIconColor: Color.gray,
        rightSpacing: AppTheme.smallPadding
    )
}

// MARK: - 功能行主题配置
struct FunctionRowTheme {
    // 基础配置
    let rowHeight: CGFloat
    let cornerRadius: CGFloat
    let innerPadding: CGFloat
    let outerPadding: CGFloat

    // 内容样式
    let contentStyle: FunctionRowContentStyle

    // 标准样式
    let standardBackground: Color
    let standardBorder: Color
    
    // 预览样式
    let previewNormalBackground: Color
    let previewActiveBackground: Color
    let previewActiveBorder: Color
    
    // 操作样式
    let actionPrimaryBackground: Color
    let actionPrimaryBorder: Color
    let actionWarningBackground: Color
    let actionWarningBorder: Color
    let actionSecondaryBackground: Color
    let actionSecondaryBorder: Color

    // 新增：纯色操作样式
    let actionSuccessBackground: Color
    let actionSuccessBorder: Color
    let actionWarningFullBackground: Color
    let actionWarningFullBorder: Color
    let actionDangerBackground: Color
    let actionDangerBorder: Color
    
    // 高亮样式
    let highlightedBackground: Color
    let highlightedBorder: Color
    
    // 次要样式
    let secondaryBackground: Color
    
    // 下拉列表样式
    let dropdownItemBackground: Color
    let dropdownItemBorder: Color
    let dropdownContainerBackground: Color
    let dropdownContainerBorder: Color
    
    // 默认主题
    static let `default` = FunctionRowTheme(
        rowHeight: AppTheme.rowHeight,
        cornerRadius: AppTheme.cornerRadius,
        innerPadding: AppTheme.mediumPadding,
        outerPadding: AppTheme.mediumPadding,

        contentStyle: .default,

        standardBackground: AppTheme.secondaryBackgroundColor.opacity(0.5),
        standardBorder: Color.clear,
        
        previewNormalBackground: AppTheme.secondaryBackgroundColor.opacity(0.5),
        previewActiveBackground: AppTheme.warningColor.opacity(0.15),
        previewActiveBorder: AppTheme.warningColor.opacity(0.3),
        
        actionPrimaryBackground: AppTheme.primaryColor.opacity(0.2),
        actionPrimaryBorder: Color.clear,
        actionWarningBackground: AppTheme.warningColor.opacity(0.2),
        actionWarningBorder: Color.clear,
        actionSecondaryBackground: AppTheme.secondaryBackgroundColor.opacity(0.3),
        actionSecondaryBorder: Color.clear,

        // 新增：浅色操作样式配置
        actionSuccessBackground: Color.green.opacity(0.3),
        actionSuccessBorder: Color.clear,
        actionWarningFullBackground: Color.orange.opacity(0.3),
        actionWarningFullBorder: Color.clear,
        actionDangerBackground: Color.red.opacity(0.3),
        actionDangerBorder: Color.clear,

        highlightedBackground: AppTheme.accentColor.opacity(0.15),
        highlightedBorder: AppTheme.accentColor.opacity(0.3),
        
        secondaryBackground: AppTheme.secondaryBackgroundColor.opacity(0.3),
        
        dropdownItemBackground: AppTheme.secondaryBackgroundColor,
        dropdownItemBorder: Color.clear,
        dropdownContainerBackground: Color.clear,
        dropdownContainerBorder: Color.clear
    )
}

// MARK: - 全局主题管理器
class FunctionRowThemeManager: ObservableObject {
    @Published var currentTheme: FunctionRowTheme = .default
    
    static let shared = FunctionRowThemeManager()
    
    private init() {}
    
    func updateTheme(_ theme: FunctionRowTheme) {
        currentTheme = theme
    }
}

// MARK: - 功能行样式修饰器
struct FunctionRowStyleModifier: ViewModifier {
    let style: FunctionRowStyle
    let isActive: Bool
    let actionType: ActionType?
    var hasFixedHeight: Bool = true
    
    @StateObject private var themeManager = FunctionRowThemeManager.shared
    
    enum ActionType {
        case primary, warning, secondary
        case success, warningFull, danger  // 新增：纯色背景样式
    }
    
    func body(content: Content) -> some View {
        let theme = themeManager.currentTheme
        
        Group {
            if hasFixedHeight {
                content
                    .frame(height: theme.rowHeight)
                    .padding(.horizontal, theme.innerPadding)
                    .background(
                        RoundedRectangle(cornerRadius: theme.cornerRadius)
                            .fill(backgroundColor(for: style, theme: theme))
                    )
                    .overlay(borderOverlay(for: style, theme: theme))
                    .padding(.horizontal, theme.outerPadding)
                    .contentShape(Rectangle())
            } else {
                content
                    .padding(theme.innerPadding)
                    .background(
                        RoundedRectangle(cornerRadius: theme.cornerRadius)
                            .fill(backgroundColor(for: style, theme: theme))
                    )
                    .overlay(borderOverlay(for: style, theme: theme))
                    .padding(.horizontal, theme.outerPadding)
                    .contentShape(Rectangle())
            }
        }
    }
    
    private func backgroundColor(for style: FunctionRowStyle, theme: FunctionRowTheme) -> Color {
        switch style {
        case .standard:
            return theme.standardBackground
        case .preview:
            return isActive ? theme.previewActiveBackground : theme.previewNormalBackground
        case .action:
            switch actionType {
            case .primary: return theme.actionPrimaryBackground
            case .warning: return theme.actionWarningBackground
            case .secondary, .none: return theme.actionSecondaryBackground
            case .success: return theme.actionSuccessBackground
            case .warningFull: return theme.actionWarningFullBackground
            case .danger: return theme.actionDangerBackground
            }
        case .highlighted:
            return theme.highlightedBackground
        case .secondary:
            return theme.secondaryBackground
        case .dropdown:
            return theme.dropdownItemBackground
        case .dropdownContainer:
            return theme.dropdownContainerBackground
        }
    }
    
    private func borderOverlay(for style: FunctionRowStyle, theme: FunctionRowTheme) -> some View {
        Group {
            switch style {
            case .preview where isActive:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.previewActiveBorder, lineWidth: 1)
            case .action:
                switch actionType {
                case .primary where theme.actionPrimaryBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionPrimaryBorder, lineWidth: 1)
                case .warning where theme.actionWarningBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionWarningBorder, lineWidth: 1)
                case .secondary where theme.actionSecondaryBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionSecondaryBorder, lineWidth: 1)
                case .success where theme.actionSuccessBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionSuccessBorder, lineWidth: 1)
                case .warningFull where theme.actionWarningFullBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionWarningFullBorder, lineWidth: 1)
                case .danger where theme.actionDangerBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionDangerBorder, lineWidth: 1)
                default:
                    EmptyView()
                }
            case .highlighted:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.highlightedBorder, lineWidth: 1)
            case .dropdown:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.dropdownItemBorder, lineWidth: 1)
            case .dropdownContainer:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.dropdownContainerBorder, lineWidth: 1)
            default:
                EmptyView()
            }
        }
    }
}

// MARK: - 标准化功能行内容组件

/// 标准化的左侧内容（图标 + 文本）
struct StandardRowLeftContent: View {
    let icon: String
    let title: String
    let contentStyle: FunctionRowContentStyle

    init(icon: String, title: String, contentStyle: FunctionRowContentStyle = .default) {
        self.icon = icon
        self.title = title
        self.contentStyle = contentStyle
    }

    var body: some View {
        HStack(spacing: contentStyle.leftSpacing) {
            Image(systemName: icon)
                .foregroundColor(contentStyle.leftIconColor)
                .font(.system(size: contentStyle.leftIconSize))
                .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

            Text(title)
                .font(contentStyle.leftTextFont)
                .foregroundColor(contentStyle.leftTextColor)
                .fixedSize()
        }
    }
}

/// 标准化的右侧内容（文本 + 箭头）
struct StandardRowRightContent: View {
    let text: String?
    let showChevron: Bool
    let isExpanded: Bool
    let contentStyle: FunctionRowContentStyle

    init(text: String? = nil, showChevron: Bool = true, isExpanded: Bool = false, contentStyle: FunctionRowContentStyle = .default) {
        self.text = text
        self.showChevron = showChevron
        self.isExpanded = isExpanded
        self.contentStyle = contentStyle
    }

    var body: some View {
        HStack(spacing: contentStyle.rightSpacing) {
            if let text = text {
                Text(text)
                    .font(contentStyle.rightTextFont)
                    .foregroundColor(contentStyle.rightTextColor)
            }

            if showChevron {
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(contentStyle.rightIconFont)
                    .foregroundColor(contentStyle.rightIconColor)
            }
        }
    }
}

/// 标准化的功能行内容布局
struct StandardRowContent: View {
    let leftIcon: String
    let leftTitle: String
    let rightText: String?
    let showChevron: Bool
    let isExpanded: Bool
    let contentStyle: FunctionRowContentStyle

    init(leftIcon: String, leftTitle: String, rightText: String? = nil, showChevron: Bool = true, isExpanded: Bool = false, contentStyle: FunctionRowContentStyle = .default) {
        self.leftIcon = leftIcon
        self.leftTitle = leftTitle
        self.rightText = rightText
        self.showChevron = showChevron
        self.isExpanded = isExpanded
        self.contentStyle = contentStyle
    }

    var body: some View {
        HStack(alignment: .center) {
            StandardRowLeftContent(icon: leftIcon, title: leftTitle, contentStyle: contentStyle)

            Spacer()

            StandardRowRightContent(text: rightText, showChevron: showChevron, isExpanded: isExpanded, contentStyle: contentStyle)
        }
    }
}

// MARK: - View 扩展
extension View {
    /// 标准功能行样式
    func standardRowStyle(hasFixedHeight: Bool = true) -> some View {
        self.modifier(FunctionRowStyleModifier(style: .standard, isActive: false, actionType: nil, hasFixedHeight: hasFixedHeight))
    }
    
    /// 预览播放行样式
    func previewRowStyle(isActive: Bool = false) -> some View {
        self.modifier(FunctionRowStyleModifier(style: .preview, isActive: isActive, actionType: nil))
    }
    
    /// 操作按钮行样式
    func actionRowStyle(_ type: FunctionRowStyleModifier.ActionType = .secondary) -> some View {
        self.modifier(FunctionRowStyleModifier(style: .action, isActive: false, actionType: type))
    }
    
    /// 高亮强调行样式
    func highlightedRowStyle() -> some View {
        self.modifier(FunctionRowStyleModifier(style: .highlighted, isActive: false, actionType: nil))
    }
    
    /// 次要信息行样式
    func secondaryRowStyle() -> some View {
        self.modifier(FunctionRowStyleModifier(style: .secondary, isActive: false, actionType: nil))
    }
    
    /// 下拉列表项样式
    func dropdownItemStyle() -> some View {
        self.modifier(FunctionRowStyleModifier(style: .dropdown, isActive: false, actionType: nil, hasFixedHeight: false))
    }
    
    /// 下拉列表容器样式
    func dropdownContainerStyle() -> some View {
        self.modifier(FunctionRowStyleModifier(style: .dropdownContainer, isActive: false, actionType: nil, hasFixedHeight: false))
    }

    /// 音效编辑专用行样式 - 更窄的宽度
    func soundEditRowStyle(hasFixedHeight: Bool = true) -> some View {
        self.modifier(SoundEditRowStyleModifier(style: .standard, isActive: false, actionType: nil, hasFixedHeight: hasFixedHeight))
    }

    /// 音效编辑专用预览行样式
    func soundEditPreviewRowStyle(isActive: Bool = false) -> some View {
        self.modifier(SoundEditRowStyleModifier(style: .preview, isActive: isActive, actionType: nil))
    }

    /// 音效编辑专用操作按钮行样式
    func soundEditActionRowStyle(_ type: FunctionRowStyleModifier.ActionType = .secondary) -> some View {
        self.modifier(SoundEditRowStyleModifier(style: .action, isActive: false, actionType: type))
    }
}

// MARK: - 音效编辑专用样式修饰器
struct SoundEditRowStyleModifier: ViewModifier {
    let style: FunctionRowStyle
    let isActive: Bool
    let actionType: FunctionRowStyleModifier.ActionType?
    var hasFixedHeight: Bool = true

    @StateObject private var themeManager = FunctionRowThemeManager.shared

    func body(content: Content) -> some View {
        let theme = themeManager.currentTheme

        Group {
            if hasFixedHeight {
                content
                    .frame(height: theme.rowHeight)
                    .padding(.horizontal, theme.innerPadding)
                    .background(
                        RoundedRectangle(cornerRadius: theme.cornerRadius)
                            .fill(backgroundColor(for: style, theme: theme))
                    )
                    .overlay(borderOverlay(for: style, theme: theme))
                    .padding(.horizontal, AppTheme.smallPadding) // 使用更小的外边距
                    .contentShape(Rectangle())
            } else {
                content
                    .padding(theme.innerPadding)
                    .background(
                        RoundedRectangle(cornerRadius: theme.cornerRadius)
                            .fill(backgroundColor(for: style, theme: theme))
                    )
                    .overlay(borderOverlay(for: style, theme: theme))
                    .padding(.horizontal, AppTheme.smallPadding) // 使用更小的外边距
                    .contentShape(Rectangle())
            }
        }
    }

    private func backgroundColor(for style: FunctionRowStyle, theme: FunctionRowTheme) -> Color {
        switch style {
        case .standard:
            return theme.standardBackground
        case .preview:
            return isActive ? theme.previewActiveBackground : theme.previewNormalBackground
        case .action:
            switch actionType {
            case .primary: return theme.actionPrimaryBackground
            case .warning: return theme.actionWarningBackground
            case .secondary, .none: return theme.actionSecondaryBackground
            case .success: return theme.actionSuccessBackground
            case .warningFull: return theme.actionWarningFullBackground
            case .danger: return theme.actionDangerBackground
            }
        case .highlighted:
            return theme.highlightedBackground
        case .secondary:
            return theme.secondaryBackground
        case .dropdown:
            return theme.dropdownItemBackground
        case .dropdownContainer:
            return theme.dropdownContainerBackground
        }
    }

    private func borderOverlay(for style: FunctionRowStyle, theme: FunctionRowTheme) -> some View {
        Group {
            switch style {
            case .preview where isActive:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.previewActiveBorder, lineWidth: 1)
            case .action:
                switch actionType {
                case .primary where theme.actionPrimaryBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionPrimaryBorder, lineWidth: 1)
                case .warning where theme.actionWarningBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionWarningBorder, lineWidth: 1)
                case .secondary where theme.actionSecondaryBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionSecondaryBorder, lineWidth: 1)
                case .success where theme.actionSuccessBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionSuccessBorder, lineWidth: 1)
                case .warningFull where theme.actionWarningFullBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionWarningFullBorder, lineWidth: 1)
                case .danger where theme.actionDangerBorder != Color.clear:
                    RoundedRectangle(cornerRadius: theme.cornerRadius)
                        .stroke(theme.actionDangerBorder, lineWidth: 1)
                default:
                    EmptyView()
                }
            case .highlighted:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.highlightedBorder, lineWidth: 1)
            case .dropdown:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.dropdownItemBorder, lineWidth: 1)
            case .dropdownContainer:
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .stroke(theme.dropdownContainerBorder, lineWidth: 1)
            default:
                EmptyView()
            }
        }
    }
}

// MARK: - 向后兼容
/// 为功能行提供统一的尺寸与内边距；背景和其他效果由调用方自行设置
struct StandardRowStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.standardRowStyle()
    }
}
