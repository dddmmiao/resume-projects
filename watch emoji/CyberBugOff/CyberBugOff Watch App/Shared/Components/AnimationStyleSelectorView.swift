import SwiftUI

/// 动画样式选择器组件 - 可复用的动画样式设置UI
struct AnimationStyleSelectorView: View {
    @Binding var selectedStyle: TriggerAnimationStyle
    @Binding var isExpanded: Bool
    let onStyleChanged: () -> Void
    
    var body: some View {
        PerformantExpandableSection(
            isExpanded: $isExpanded,
            header: {
                StandardRowContent(
                    leftIcon: "sparkles",
                    leftTitle: "动画样式",
                    rightText: selectedStyle.rawValue,
                    isExpanded: isExpanded
                )
                .standardRowStyle()
                .contentShape(Rectangle())
            },
            content: {
                animationStylePickerView
                    .padding(.top, AppTheme.smallPadding)
            },
            skeleton: {
                AnimationStylePickerSkeleton()
                    .padding(.top, AppTheme.smallPadding)
            }
        )
    }
    
    /// 动画样式选择器视图
    private var animationStylePickerView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: AppTheme.smallPadding) {
                ForEach(TriggerAnimationStyle.allCases, id: \.self) { style in
                    Button(action: {
                        // 更新配置
                        selectedStyle = style
                        onStyleChanged()

                        // 选择后自动关闭列表（无动画，因为 PerformantExpandableSection 会处理）
                        isExpanded = false
                    }) {
                        HStack {
                            Image(systemName: AnimationStyleHelper.getIcon(for: style))
                                .foregroundColor(AppTheme.primaryColor)
                                .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                            Text(style.rawValue)
                                .font(.appBody)
                                .foregroundColor(Color.textPrimary)
                            Spacer()
                            if selectedStyle == style {
                                Image(systemName: "checkmark")
                                    .foregroundColor(AppTheme.primaryColor)
                            }
                        }
                        .frame(height: AppTheme.rowHeight)
                        .padding(.horizontal)
                        .background(AppTheme.secondaryBackgroundColor.opacity(0.3))
                        .cornerRadius(AppTheme.cornerRadius)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .frame(height: AppTheme.pickerHeight)
        .padding(.horizontal, AppTheme.mediumPadding)
    }
}

/// 动画样式辅助工具类
struct AnimationStyleHelper {
    /// 为动画样式选择合适的图标
    static func getIcon(for style: TriggerAnimationStyle) -> String {
        switch style {
        case .scale:
            return "arrow.up.and.down"
        case .bounce:
            return "arrow.up.arrow.down"
        case .rotate:
            return "arrow.clockwise"
        case .fade:
            return "wand.and.stars"
        case .slide:
            return "arrow.right"
        case .heart:
            return "heart.fill"
        // 新增高级动画图标
        case .flip:
            return "flip.horizontal"
        case .wave:
            return "waveform"
        case .pulse:
            return "dot.radiowaves.left.and.right"
        case .sparkle:
            return "sparkles"
        case .spiral:
            return "tornado"
        case .shake:
            return "chevron.left.forwardslash.chevron.right"
        }
    }
}

#Preview {
    @Previewable @State var selectedStyle: TriggerAnimationStyle = .bounce
    @Previewable @State var isExpanded: Bool = false
    
    return AnimationStyleSelectorView(
        selectedStyle: $selectedStyle,
        isExpanded: $isExpanded,
        onStyleChanged: {
            Logger.debug("Style changed to: \(selectedStyle)", category: .ui)
        }
    )
}
