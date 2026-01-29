import SwiftUI

struct CustomTriggerConfigView: View {
    @ObservedObject var model: BugOffModel
    let imageName: String
    @Binding var isPresented: Bool

    @State private var config: CustomTriggerDisplay

    // 多选颜色支持
    @State private var selectedColors: Set<String> = []
    @State private var colorChangeTimer: Timer? = nil
    @State private var debounceTimer: Timer? = nil
    @State private var currentColorIndex: Int = 0
    @State private var clickColorIndex: Int = 0 // 用于点击时切换颜色

    // 性能优化：缓存计算结果
    @State private var cachedColorArray: [String] = []
    @State private var lastSelectedColors: Set<String> = []

    @State private var showFontSizeSettings: Bool = false
    @State private var showColorSettings: Bool = false
    @State private var showAnimationStyleSettings: Bool = false



    init(model: BugOffModel, imageName: String, isPresented: Binding<Bool>) {
        self.model = model
        self.imageName = imageName
        self._isPresented = isPresented

        // 获取当前配置并确保启用状态和文字模式
        var currentConfig = model.getCustomTriggerDisplay(for: imageName)
        currentConfig.isEnabled = true // 默认启用
        currentConfig.displayMode = .text // 确保是文字模式
        self._config = State(initialValue: currentConfig)

        // 尝试从TriggerManager加载保存的颜色选择（统一经由DataService）
        let loaded = model.triggerManager.loadSelectedColors(for: imageName)
        if !loaded.isEmpty && !(loaded.count == 1 && loaded.contains("white")) {
            self._selectedColors = State(initialValue: loaded)
        } else if currentConfig.displayColor != "white" {
            // 如果没有保存的颜色但有配置的颜色，使用配置的颜色
            self._selectedColors = State(initialValue: Set([currentConfig.displayColor]))
        } else {
            // 默认选择白色
            self._selectedColors = State(initialValue: Set(["white"]))
        }
    }

    // MARK: - 动画样式设置区域

    /// 动画样式设置区域
    private var animationStyleSection: some View {
        AnimationStyleSelectorView(
            selectedStyle: Binding(
                get: { config.getCurrentAnimationStyle() },
                set: { config.setCurrentAnimationStyle($0) }
            ),
            isExpanded: $showAnimationStyleSettings,
            onStyleChanged: {
                saveSettings()
            }
        )
    }



    var body: some View {
        NavigationView {
            ScrollView(.vertical, showsIndicators: true) {

                LazyVStack(alignment: .leading, spacing: AppTheme.mediumPadding) { // Lazy: 避免一次性布局全部区块
                    // 自定义文本输入区域
                    CustomTextInputView(config: $config, saveAction: saveSettings)

                    // 随机配置按钮
                    randomConfigButton

                    // 字体大小设置区域（使用高性能可展开组件）
                    PerformantExpandableSection(
                        isExpanded: $showFontSizeSettings,
                        header: {
                            StandardRowContent(
                                leftIcon: "textformat.size",
                                leftTitle: "字体大小",
                                rightText: config.fontSize == AppTheme.defaultFontSize ? "默认" : "\(Int(config.fontSize))",
                                isExpanded: showFontSizeSettings
                            )
                            .standardRowStyle()
                            .contentShape(Rectangle())
                        },
                        content: {
                            fontSizeSliderView
                        },
                        skeleton: {
                            SliderSkeleton()
                        }
                    )

                    // 文字颜色设置（优化：隔离为子视图，减少父视图重排）
                    ColorSettingsSectionView(
                        displayColor: config.displayColor,
                        selectedColors: $selectedColors,
                        onToggleColor: { name in toggleColor(name) }
                    )

                    // 显示增量/减量开关区域
                    Button(action: {
                        config.showIncrement.toggle()
                        debouncedSave()
                    }) {
                        HStack(alignment: .center) {
                            StandardRowLeftContent(
                                icon: config.incrementValue >= 0 ? "plus.circle" : "minus.circle",
                                title: "计数"
                            )

                            Spacer()

                            // 右侧开关
                            Toggle("", isOn: $config.showIncrement)
                                .labelsHidden()
                                .allowsHitTesting(false) // 防止Toggle自身接收点击事件
                        }
                        .standardRowStyle()
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PlainButtonStyle())

                    // 增量减量值切换区域 - 只有当显示计数值开启时才显示
                    if config.showIncrement {
                        Button(action: {
                            // 在正数和负数之间切换
                            config.incrementValue = -config.incrementValue
                            debouncedSave()
                        }) {
                            StandardRowContent(
                                leftIcon: "arrow.up.arrow.down",
                                leftTitle: "计数方向",
                                rightText: config.incrementValue >= 0 ? "增加" : "减少",
                                showChevron: false
                            )
                            .standardRowStyle()
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PlainButtonStyle())
                        .transition(.opacity.combined(with: .scale))
                    }

                    // 动画样式设置区域
                    animationStyleSection

                    // 预览区域
                    PreviewDisplayView(
                        config: config.normalizedForDisplay(),
                        currentCount: 0, // 预览时使用固定计数
                        currentColor: getCurrentDisplayColor(),
                        selectedColors: Array(selectedColors),
                        currentColorIndex: currentColorIndex
                    )
                }
                .padding(.vertical)
            }
            .navigationTitle("自定义提示")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            loadSettings()
            // 软禁用：仅确保 displayMode 为 .text，不清理图片配置，便于切回图片模式延续之前设置
            config.displayMode = .text
            // 将较重的模型更新与定时器启动延后到首帧之后，避免阻塞首次展开
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                model.setCustomTriggerDisplay(for: imageName, config: config)
                if config.displayColor == "rainbow" || selectedColors.count > 1 {
                    startColorChangeTimer()
                }
            }
        }
        .onDisappear {
            stopColorChangeTimer()
        }
    }

    // 字体大小滑块视图
    private var fontSizeSliderView: some View {
        VStack(spacing: AppTheme.smallPadding) {
            // 字体大小滑块
            Slider(
                value: $config.fontSize,
                in: AppTheme.minFontSize...AppTheme.maxFontSize
            ) {
                Text("字体大小")
            } minimumValueLabel: {
                Text("A")
                    .font(.appSmall)
            } maximumValueLabel: {
                Text("A")
                    .font(.appTitle)
            }
            .tint(AppTheme.primaryColor)
            .onChange(of: config.fontSize) { oldValue, newValue in
                // 分层临时：仅更新内存配置，保存由去抖触发
                debouncedSave()
            }
        }
        .padding(.horizontal)
        .padding(.vertical, AppTheme.smallPadding)
        .cornerRadius(AppTheme.cornerRadius)

    }

    // 颜色选择器视图
    private var colorPickerView: some View {
        VStack(spacing: AppTheme.mediumPadding) {
            // 颜色选项
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AppTheme.mediumPadding) {
                    // 诊断：仅展示一个颜色以排查卡顿根因
                    Button(action: {
                        toggleColor("white")
                    }) {
                        Circle()
                            .fill(Color.white)
                            .frame(width: Sizes.smallButtonHeight, height: Sizes.smallButtonHeight)
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: 1)
                            )
                            .overlay(
                                Circle()
                                    .stroke(AppTheme.primaryColor, lineWidth: 3)
                                    .opacity(selectedColors.contains("white") ? 1 : 0)
                            )
                            .padding(Sizes.smallPadding)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .padding(.vertical, AppTheme.mediumPadding)
                .padding(.horizontal, AppTheme.smallPadding)
            }

            // 多选提示
            Text("提示：可以选择多种颜色，文字将会循环变色")
                .smallTextStyle()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, Sizes.tinyPadding)
        }
        .background(AppTheme.secondaryBackgroundColor.opacity(0.3))
        .cornerRadius(AppTheme.cornerRadius)
    }

    // 获取当前显示颜色
    private func getCurrentDisplayColor() -> Color {
        if selectedColors.isEmpty {
            // 没有选中颜色时返回默认颜色
            return .white
        } else if selectedColors.count == 1 {
            return AppTheme.getColor(fromName: selectedColors.first!)
        } else if selectedColors.contains("rainbow") {
            // 彩色模式特殊处理，这里简单返回一个颜色
            // 实际效果会在PreviewDisplayView中处理
            return .red
        } else {
            // 多选模式，返回当前索引对应的颜色
            if currentColorIndex < selectedColors.count {
                return AppTheme.getColor(fromName: Array(selectedColors)[currentColorIndex])
            }
            return .white
        }
    }

    // 切换颜色选择
    private func toggleColor(_ color: String) {
        // 如果是彩虹色模式，特殊处理
        if color == "rainbow" {
            if selectedColors.contains("rainbow") {
                // 如果已经选择了彩虹色，则移除
                selectedColors.remove("rainbow")
            } else {
                // 如果选择彩虹色，清除其他颜色
                selectedColors.removeAll()
                selectedColors.insert("rainbow")
            }
        } else {
            // 如果选择了普通颜色，移除彩虹色
            selectedColors.remove("rainbow")

            // 切换颜色选择状态
            if selectedColors.contains(color) {
                selectedColors.remove(color)
            } else {
                selectedColors.insert(color)
            }
        }

        // 确保至少有一个颜色被选中
        if selectedColors.isEmpty {
            selectedColors.insert("white") // 默认白色
        }

        // 保存设置
        saveSettings()

        // 重新启动颜色定时器（如果需要）
        if config.displayColor == "rainbow" || selectedColors.count > 1 {
            startColorChangeTimer()
        } else {
            stopColorChangeTimer()
        }
    }

    // 启动颜色切换定时器
    private func startColorChangeTimer() {
        // 先停止现有定时器
        stopColorChangeTimer()

        // 如果是彩色模式或多选模式，启动颜色切换定时器
        if selectedColors.contains("rainbow") || selectedColors.count > 1 {
            colorChangeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                if selectedColors.count > 1 {
                    // 多色模式
                    currentColorIndex = (currentColorIndex + 1) % selectedColors.count
                } else if config.displayColor == "rainbow" {
                    // 彩色模式特殊处理
                    currentColorIndex = (currentColorIndex + 1) % 6 // 使用6种基本颜色循环
                }
            }
        }
    }

    // 停止颜色切换定时器
    private func stopColorChangeTimer() {
        colorChangeTimer?.invalidate()
        colorChangeTimer = nil
    }

    private func loadSettings() {
        config = model.getCustomTriggerDisplay(for: imageName)

        // 确保启用状态
        config.isEnabled = true

        // 尝试从UserDefaults加载保存的颜色选择
        if let colorData = UserDefaults.standard.data(forKey: "selectedColors_\(imageName)") {
            if let colors = try? JSONDecoder().decode([String].self, from: colorData) {
                selectedColors = Set(colors)
            } else {
                // 初始化选中颜色
                selectedColors = Set([config.displayColor])
            }
        } else {
            // 初始化选中颜色
            selectedColors = Set([config.displayColor])
        }

        // note: 不在 loadSettings 里启动颜色定时器，避免首帧展开期间触发额外工作
    }

    // 轻量去抖：将密集调用合并，降低与布局的竞争
    private func debouncedSave() {
        debounceTimer?.invalidate()
        debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: false) { _ in
            saveSettings()
        }
    }

    private func saveSettings() {
        // 确保启用状态和文字模式
        config.isEnabled = true
        config.displayMode = .text // 确保保存时是文字模式

        // 清空emoji字段，因为现在包含在自定义文本中
        config.emoji = ""

        // 保存多选颜色信息
        if selectedColors.count > 0 {
            // 使用第一个颜色作为基础颜色
            config.displayColor = selectedColors.first!
        }

        model.setCustomTriggerDisplay(for: imageName, config: config)

        // 更新多选颜色（临时层），不直接写入UserDefaults
        model.triggerManager.stageSelectedColors(selectedColors, for: imageName)
    }

    // 本地不再重复归一化，统一交由 TriggerManager + normalizedForDisplay 负责

    // 增加字体大小
    private func increaseFontSize() {
        config.fontSize = min(config.fontSize + AppTheme.quickFontSizeStep, AppTheme.maxFontSize)
        config.fontSize = round(config.fontSize) // 确保是整数
        saveSettings()
    }

    // 减小字体大小
    private func decreaseFontSize() {
        config.fontSize = max(config.fontSize - AppTheme.quickFontSizeStep, AppTheme.minFontSize)
        config.fontSize = round(config.fontSize) // 确保是整数
        saveSettings()
    }

    // 触发图片时调用此方法
    func triggerWithColorChange() {
        // 先触发图片
        model.triggerImage(for: imageName)

        // 如果是多色模式，更新当前颜色索引
        if selectedColors.count > 1 {
            // 重置模型中的颜色索引以确保正确的循环
            model.resetColorIndex(for: imageName)

            // 获取并递增颜色索引
            clickColorIndex = model.getAndIncrementColorIndex(for: imageName) % selectedColors.count

            // 更新UI
            DispatchQueue.main.async {
                currentColorIndex = clickColorIndex
            }
        }
    }

    // MARK: - 随机配置按钮
    private var randomConfigButton: some View {
        Button(action: randomizeConfiguration) {
            StandardRowContent(
                leftIcon: "shuffle",
                leftTitle: "随机配置",
                showChevron: false
            )
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - 随机配置方法
    private func randomizeConfiguration() {
        // 随机选择自定义文本（从全局配置中选择）
        config.customText = AppConfig.randomTextPresets.randomElement() ?? "太棒了!"

        // 根据文案末尾是否为标点符号决定是否显示增量
        config.showIncrement = shouldShowIncrementForText(config.customText)

        // 随机选择增量值（使用加权随机，小数值概率更高）
        config.incrementValue = generateWeightedRandomIncrement()

        // 随机选择字体大小（从可选范围中随机选择）
        config.fontSize = Double.random(in: AppConfig.fontSizeRange)

        // 随机选择动画样式
        config.setCurrentAnimationStyle(TriggerAnimationStyle.allCases.randomElement() ?? .bounce)

        // 随机选择颜色配置
        randomizeColors()

        // 保存配置
        saveSettings()

        // 触觉反馈
        WKInterfaceDevice.current().play(.click)

        // 重新启动颜色定时器（如果需要）
        if config.displayColor == "rainbow" || selectedColors.count > 1 {
            startColorChangeTimer()
        }
    }

    // 判断是否应该显示增量（基于文案末尾字符）
    private func shouldShowIncrementForText(_ text: String) -> Bool {
        guard !text.isEmpty else { return Bool.random() }

        // 定义标点符号集合
        let punctuationMarks: Set<Character> = ["!", "。", "？", "?", "！", "…", "~", "～", ".", ",", "，", "；", ";", ":", "："]

        // 获取文案的最后一个字符
        let lastCharacter = text.last!

        // 如果末尾是标点符号，不显示增量
        if punctuationMarks.contains(lastCharacter) {
            return false
        }

        // 如果末尾不是标点符号，随机决定是否显示增量
        return Bool.random()
    }

    // 随机增量值仅允许为 ±1（与随机提示统一约束）
    private func generateWeightedRandomIncrement() -> Int {
        return Bool.random() ? 1 : -1
    }

    // 随机选择颜色配置
    private func randomizeColors() {
        let availableColors = AppConfig.defaultColors
        let colorModes = ["single", "multiple", "rainbow"]
        let selectedMode = colorModes.randomElement() ?? "single"

        switch selectedMode {
        case "single":
            // 单色模式：随机选择一个颜色
            let randomColor = availableColors.randomElement() ?? "white"
            config.displayColor = randomColor
            selectedColors = Set([randomColor])

        case "multiple":
            // 多色模式：随机选择2-4个颜色
            let colorCount = Int.random(in: 2...min(4, availableColors.count))
            let shuffledColors = availableColors.shuffled()
            let randomColors = Array(shuffledColors.prefix(colorCount))
            selectedColors = Set(randomColors)
            config.displayColor = randomColors.first ?? "white"

        case "rainbow":
            // 彩虹模式
            config.displayColor = "rainbow"
            selectedColors = Set(["rainbow"])

        default:
            break
        }

        // 保存颜色选择
        if let colorData = try? JSONEncoder().encode(Array(selectedColors)) {
            UserDefaults.standard.set(colorData, forKey: "selectedColors_\(imageName)")
        }
    }
}

// MARK: - 子视图

// 自定义文本输入视图
struct CustomTextInputView: View {
    @Binding var config: CustomTriggerDisplay
    let saveAction: () -> Void

    var body: some View {
        StandardTextField(
            placeholder: "输入自定义文本",
            text: $config.customText,
            limit: AppConfig.maxSoundNameLength,
            removeWhitespace: false,
            onTextChange: { _ in
                saveAction()
            }
        )
    }
}

// 预览显示视图
struct PreviewDisplayView: View {
    let config: CustomTriggerDisplay
    let currentCount: Int
    let currentColor: Color
    let selectedColors: [String]
    let currentColorIndex: Int

    private let rainbowColors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple]

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            Text("预览效果")
                .font(.appSmall)
                .foregroundColor(Color.textPrimary)
                .padding(.horizontal)

            HStack {
                Spacer()
                Text(getDisplayText())
                    .font(.system(size: AppTheme.adaptiveSize(config.fontSize), weight: .bold))
                    .foregroundColor(getDisplayColor())
                    .padding(AppTheme.mediumPadding)
                    .background(AppTheme.secondaryBackgroundColor)
                    .cornerRadius(AppTheme.cornerRadius)
                Spacer()
            }
        }
    }

    private func getDisplayText() -> String {
        if config.showIncrement {
            // 显示计数值模式：使用全局配置中设置的incrementValue
            let configValue = abs(config.incrementValue) // 取绝对值，符号由incrementValue的正负决定
            let sign = config.incrementValue >= 0 ? "+" : "-"
            let displayValue = "\(sign)\(configValue)"

            if config.customText.isEmpty {
                return displayValue
            } else {
                return "\(config.customText) \(displayValue)"
            }
        } else {
            // 不显示计数值模式：只显示自定义文案，如果为空则显示提示文本
            return config.customText.isEmpty ? "自定义文案" : config.customText
        }
    }

    private func getDisplayColor() -> Color {
        if config.displayColor == "rainbow" {
            // 彩虹模式：使用传入的颜色索引
            let safeIndex = currentColorIndex % rainbowColors.count
            return rainbowColors[safeIndex]
        } else if selectedColors.count > 1 {
            // 多色模式：使用传入的颜色索引
            if !selectedColors.isEmpty {
                let safeIndex = currentColorIndex % selectedColors.count
                return AppTheme.getColor(fromName: selectedColors[safeIndex])
            }
            return .white // 默认颜色
        }
        return currentColor
    }


}



#Preview {
    CustomTriggerConfigView(
        model: BugOffModel(),
        imageName: "bug1",
        isPresented: .constant(true)
    )
}



