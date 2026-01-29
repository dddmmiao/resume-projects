import SwiftUI

// MARK: - Legacy Components (Deprecated)
// Note: ExpandableSection has been replaced by PerformantExpandableSection
// for better performance and consistency. Use PerformantExpandableSection for new code.

// MARK: - Configuration Row
struct ConfigurationRow: View {
    let title: String
    let icon: String
    let value: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            StandardRowContent(
                leftIcon: icon,
                leftTitle: title,
                rightText: value,
                showChevron: false
            )
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Slider Configuration View
struct SliderConfigView: View {
    let title: String
    let value: Binding<Double>
    let range: ClosedRange<Double>
    let formatter: (Double) -> String

    init(title: String,
         value: Binding<Double>,
         range: ClosedRange<Double>,
         formatter: @escaping (Double) -> String = { String(format: "%.1f", $0) }) {
        self.title = title
        self.value = value
        self.range = range
        self.formatter = formatter
    }

    var body: some View {
        VStack(spacing: AppTheme.smallPadding) {
            Slider(value: value, in: range)
                .accentColor(AppTheme.primaryColor)

            Text("\(title): \(formatter(value.wrappedValue))")
                .hintTextStyle()
        }
        .padding(.top, AppTheme.smallPadding)
    }
}

// MARK: - Color Picker Grid
struct ColorPickerGrid: View {
    @Binding var selectedColors: Set<String>
    let colors: [String]
    let allowMultipleSelection: Bool
    let onColorSelected: ((String) -> Void)?
    
    init(selectedColors: Binding<Set<String>>,
         colors: [String] = AppConfig.defaultColors,
         allowMultipleSelection: Bool = true,
         onColorSelected: ((String) -> Void)? = nil) {
        self._selectedColors = selectedColors
        self.colors = colors
        self.allowMultipleSelection = allowMultipleSelection
        self.onColorSelected = onColorSelected
    }
    
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: AppTheme.smallPadding) {
            ForEach(colors, id: \.self) { colorName in
                colorButton(for: colorName)
            }
        }
        .padding(.horizontal, AppTheme.smallPadding)
    }
    
    private func colorButton(for colorName: String) -> some View {
        Button(action: {
            if allowMultipleSelection {
                if selectedColors.contains(colorName) {
                    selectedColors.remove(colorName)
                } else {
                    selectedColors.insert(colorName)
                }
            } else {
                selectedColors = [colorName]
            }
            onColorSelected?(colorName)
        }) {
            Circle()
                .fill(AppTheme.getColor(fromName: colorName))
                .frame(width: 30, height: 30)
                .overlay(
                    Circle()
                        .stroke(
                            selectedColors.contains(colorName) ? AppTheme.primaryColor : Color.gray,
                            lineWidth: selectedColors.contains(colorName) ? 3 : 1
                        )
                )
                .scaleEffect(selectedColors.contains(colorName) ? 1.1 : 1.0)
                .animation(.easeInOut(duration: AppConfig.defaultAnimationDuration), value: selectedColors.contains(colorName))
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Preference Key for Width Measurement
struct WidthPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

public struct PrimaryCapsuleStyle: ButtonStyle {
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: AppTheme.smallIconSize))
            .foregroundColor(AppTheme.primaryColor)
            .frame(width: AppTheme.smallButtonHeight, height: AppTheme.smallButtonHeight)
            .background(AppTheme.primaryColor.opacity(0.2))
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

/// 播放/暂停按钮的简化样式（移除动画以避免渲染问题）
struct PlayPauseButtonStyle: ButtonStyle {
    var isPlaying: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: AppTheme.smallIconSize))
            .foregroundColor(isPlaying ? .white : AppTheme.primaryColor)
            .frame(width: AppTheme.smallButtonHeight, height: AppTheme.smallButtonHeight)
            .background(
                Circle()
                    .fill(isPlaying ? AppTheme.primaryColor.opacity(0.8) : AppTheme.primaryColor.opacity(0.2))
            )
            .clipShape(Circle())
            // 移除动画以避免Metal渲染问题
            // .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            // .animation(.spring(), value: configuration.isPressed)
            // .animation(.easeInOut(duration: 0.2), value: isPlaying)
    }
}

// MARK: - Standard Text Field
/// 标准文本输入框组件，具有字符限制、文本截断检测和完整功能
struct StandardTextField: View {
    let placeholder: String
    @Binding var text: String
    let limit: Int
    let removeWhitespace: Bool
    let onTextChange: ((String) -> Void)?
    
    init(placeholder: String = "输入名称",
         text: Binding<String>,
         limit: Int = AppConfig.maxSoundNameLength,
         removeWhitespace: Bool = true,
         onTextChange: ((String) -> Void)? = nil) {
        self.placeholder = placeholder
        self._text = text
        self.limit = limit
        self.removeWhitespace = removeWhitespace
        self.onTextChange = onTextChange
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            // 主输入框 - 直接占满整行
            TextField(placeholder, text: $text)
                .textFieldStyle(PlainTextFieldStyle())
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, AppTheme.mediumPadding)
                .onChange(of: text) { oldValue, newValue in
                    var processed = newValue
                    if removeWhitespace {
                        processed = processed.replacingOccurrences(of: " ", with: "")
                    }
                    if processed.count > limit {
                        processed = String(processed.prefix(limit))
                    }
                    if processed != text {
                        text = processed
                    }
                    onTextChange?(processed)
                }

            // 超出限制提示
            if text.count >= limit {
                HStack {
                    Spacer()

                    Text("已达上限")
                        .warningHintTextStyle()
                }
                .padding(.horizontal, AppTheme.mediumPadding) // 与输入框对齐
            }
        }
    }
} 
