import SwiftUI

struct ColorSettingsSectionView: View {
    let displayColor: String
    @Binding var selectedColors: Set<String>
    let onToggleColor: (String) -> Void

    @State private var isExpanded: Bool = false

    var body: some View {
        PerformantExpandableSection(
            isExpanded: $isExpanded,
            header: {
                HStack(alignment: .center) {
                    StandardRowLeftContent(icon: "paintbrush.fill", title: "文字颜色")
                    Spacer()
                    HStack(spacing: AppTheme.smallPadding) {
                        colorPreviewIcon
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.appSmall)
                            .foregroundColor(Color.gray)
                    }
                }
                .standardRowStyle()
            },
            content: {
                colorPickerView
            },
            skeleton: {
                ColorPickerSkeleton()
            }
        )
    }

    @ViewBuilder
    private var colorPreviewIcon: some View {
        if displayColor == "rainbow" {
            Circle()
                .fill(
                    AngularGradient(
                        gradient: Gradient(colors: [.red, .yellow, .green, .blue, .purple, .red]),
                        center: .center
                    )
                )
                .frame(width: Sizes.smallIconSize, height: Sizes.smallIconSize)
                .overlay(Circle().stroke(Color.white, lineWidth: 1))
        } else if selectedColors.count > 1 {
            Text("多色")
                .font(.appSmall)
                .foregroundColor(Color.gray)
        } else if selectedColors.isEmpty || displayColor == "white" {
            Circle()
                .fill(Color.white)
                .frame(width: Sizes.smallIconSize, height: Sizes.smallIconSize)
                .overlay(Circle().stroke(Color.gray, lineWidth: 1))
        } else {
            Circle()
                .fill(AppTheme.getColor(fromName: displayColor))
                .frame(width: Sizes.smallIconSize, height: Sizes.smallIconSize)
                .overlay(Circle().stroke(Color.white, lineWidth: 1))
        }
    }

    private var colorPickerView: some View {
        VStack(spacing: AppTheme.mediumPadding) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: AppTheme.mediumPadding) {
                    ForEach(AppTheme.colorOptions, id: \.name) { option in
                        Button(action: { onToggleColor(option.name) }) {
                            if option.name == "rainbow" {
                                Circle()
                                    .fill(
                                        AngularGradient(
                                            gradient: Gradient(colors: [.red, .yellow, .green, .blue, .purple, .red]),
                                            center: .center
                                        )
                                    )
                                    .frame(width: Sizes.smallButtonHeight, height: Sizes.smallButtonHeight)
                                    .overlay(Circle().stroke(Color.white, lineWidth: 1))
                                    .overlay(
                                        Circle()
                                            .stroke(AppTheme.primaryColor, lineWidth: 3)
                                            .opacity(selectedColors.contains(option.name) ? 1 : 0)
                                    )
                                    .padding(Sizes.smallPadding)
                            } else {
                                Circle()
                                    .fill(option.color)
                                    .frame(width: Sizes.smallButtonHeight, height: Sizes.smallButtonHeight)
                                    .overlay(Circle().stroke(Color.white, lineWidth: 1))
                                    .overlay(
                                        Circle()
                                            .stroke(AppTheme.primaryColor, lineWidth: 3)
                                            .opacity(selectedColors.contains(option.name) ? 1 : 0)
                                    )
                                    .padding(Sizes.smallPadding)
                            }
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
                .padding(.vertical, AppTheme.mediumPadding)
                .padding(.horizontal, AppTheme.smallPadding)
            }
            Text("提示：可以选择多种颜色，文字将会循环变色")
                .smallTextStyle()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, Sizes.tinyPadding)
        }
        .background(AppTheme.secondaryBackgroundColor.opacity(0.3))
        .cornerRadius(AppTheme.cornerRadius)
    }

}