import SwiftUI

struct CustomDisplayRow: View {
    let config: CustomTriggerDisplay
    let previewColors: [Color]
    let currentColorIndex: Int
    let onTextCustomization: () -> Void
    let onImageCustomization: () -> Void

    @Binding var isExpanded: Bool

    private var shouldShowSetupText: Bool {
        config.customText.isEmpty && !config.showIncrement
    }

    private var previewText: String {
        if shouldShowSetupText {
            return ""
        }

        if config.showIncrement {
            // 使用模型内统一的归一化逻辑
            let normalized = config.normalizedIncrementUnit()
            let sign = normalized >= 0 ? "+" : ""
            if config.customText.isEmpty {
                return "\(sign)\(normalized)"
            } else {
                return "\(config.customText)\(sign)\(normalized)"
            }
        } else {
            return config.customText
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // 恢复美观的主功能行样式
            HStack {
                // Left Part - 恢复标准样式
                StandardRowLeftContent(icon: "wand.and.sparkles", title: "自定义提示")

                Spacer().layoutPriority(1)

                // 右侧内容区域
                HStack(spacing: 4) {
                    if shouldShowSetupText {
                        Text("设置")
                            .font(.appSmall)
                            .foregroundColor(Color.gray)
                            .fixedSize()
                    } else {
                        if config.displayMode == .image {
                            Text("img")
                                .font(.appSmall)
                                .foregroundColor(Color.gray)
                                .fixedSize()
                        } else if !previewText.isEmpty {
                            ScrollingTextView(
                                text: previewText,
                                font: .appSmall,
                                color: .textTertiary,
                                maxWidth: AppTheme.screenWidth < 184 ? 25 : 32
                            )
                        }
                    }

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
                .frame(maxWidth: AppTheme.screenWidth * 0.3)
                .fixedSize(horizontal: true, vertical: false)
            }
            .standardRowStyle()
            .contentShape(Rectangle())
            .onTapGesture {
                isExpanded.toggle()
            }

            // 恢复美观的展开区域样式
            if isExpanded {
                HStack(spacing: 0) {
                    // 文字按钮
                    Button(action: onTextCustomization) {
                        buttonContent(
                            icon: "textformat",
                            isSelected: config.displayMode == .text
                        )
                        .frame(maxWidth: .infinity)
                        .standardRowStyle()
                    }
                    .buttonStyle(PlainButtonStyle())

                    // 图片按钮
                    Button(action: onImageCustomization) {
                        buttonContent(
                            icon: "photo",
                            isSelected: config.displayMode == .image
                        )
                        .frame(maxWidth: .infinity)
                        .standardRowStyle()
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .frame(height: AppTheme.rowHeight)
                .padding(.top, AppTheme.smallPadding)
            }
        }
    }

    // 恢复按钮内容样式
    @ViewBuilder
    func buttonContent(icon: String, isSelected: Bool) -> some View {
        Image(systemName: icon)
            .font(.system(size: AppTheme.iconSize, weight: .medium))
            .foregroundColor(isSelected ? AppTheme.primaryColor : Color.textSecondary)
            .scaleEffect(isSelected ? 1.1 : 1.0)
    }
}

// MARK: - 简化的滚动文本视图
struct ScrollingTextView: View {
    let text: String
    let font: Font
    let color: Color
    let maxWidth: CGFloat

    @State private var textWidth: CGFloat = 0
    @State private var scrollOffset: CGFloat = 0
    @State private var isScrolling: Bool = false

    var body: some View {
        GeometryReader { geometry in
            Text(text)
                .font(font)
                .foregroundColor(color)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .background(
                    GeometryReader { textGeometry in
                        Color.clear
                            .onAppear {
                                textWidth = textGeometry.size.width
                                startScrollingIfNeeded()
                            }
                            .onChange(of: text) { _, _ in
                                textWidth = textGeometry.size.width
                                scrollOffset = 0
                                startScrollingIfNeeded()
                            }
                    }
                )
                .offset(x: scrollOffset)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        }
        .clipped()
        .frame(width: maxWidth, height: 20)
        .onAppear {
            startScrollingIfNeeded()
        }
        .onDisappear {
            isScrolling = false
        }
    }

    private func startScrollingIfNeeded() {
        // 如果文本宽度超过最大宽度，开始滚动
        if textWidth > maxWidth {
            isScrolling = true
            startScrollAnimation()
        } else {
            isScrolling = false
            scrollOffset = 0
        }
    }

    private func startScrollAnimation() {
        guard isScrolling else { return }

        // 计算需要滚动的距离
        let scrollDistance = textWidth - maxWidth + 2

        // 重置到起始位置
        scrollOffset = 0

        // 延迟开始滚动
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            guard self.isScrolling else { return }

            withAnimation(.linear(duration: Double(scrollDistance / 15))) {
                self.scrollOffset = -scrollDistance
            }

            // 滚动完成后，延迟重新开始
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(scrollDistance / 15) + 1.0) {
                if self.isScrolling {
                    self.startScrollAnimation()
                }
            }
        }
    }
}
