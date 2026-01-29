import SwiftUI
import WatchKit // 添加WatchKit导入以获取屏幕尺寸
import UIKit // 添加UIKit导入

// MARK: - 表情符号颜色选择器配置
struct EmojiColorSelectorConfig {
    // 基础尺寸
    let baseWheelWidth: CGFloat = 50  // 增加滚轮宽度以适应表情符号
    let baseWheelHeight: CGFloat = 70
    let horizontalSpacing: CGFloat = 4  // 减小水平间距
    let verticalSpacing: CGFloat = 8
    
    // 基于设备尺寸的自适应比例因子
    func scaleFactor() -> CGFloat {
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        // 以44mm表盘（约184pt宽度）为基准
        let baseFactor: CGFloat = 1.0
        let scaleFactor = screenWidth / 184.0
        
        // 限制比例范围，避免过大或过小
        return min(max(scaleFactor * baseFactor, 0.8), 1.2)
    }
    
    // 根据设备尺寸自适应滚轮宽度
    func wheelWidth() -> CGFloat {
        return baseWheelWidth * scaleFactor()
    }
    
    // 根据设备尺寸自适应滚轮高度
    func wheelHeight() -> CGFloat {
        return baseWheelHeight * scaleFactor()
    }
    
    // 根据设备尺寸自适应间距
    func spacing(_ space: CGFloat) -> CGFloat {
        return space * scaleFactor()
    }
    
    // 根据设备尺寸自适应字体大小
    func fontSize(_ size: CGFloat) -> CGFloat {
        return size * scaleFactor()
    }
}

// MARK: - 表情符号颜色选择器
struct EmojiColorSelector: View {
    @Binding var isPresented: Bool
    @Binding var selectedColor: Color
    let onColorSelected: (Color) -> Void
    // 添加直接的RGB值参数，用于确保精确的值传递
    var initialRed: Int? = nil
    var initialGreen: Int? = nil
    var initialBlue: Int? = nil
    
    // 添加环境对象以访问显示模式管理器
    @EnvironmentObject var displayModeManager: DisplayModeManager
    
    // 添加配置
    private let config = EmojiColorSelectorConfig()
    
    // 直接在构造时初始化RGB值，避免onAppear延迟
    @State private var redValue: Int
    @State private var greenValue: Int
    @State private var blueValue: Int
    
    // 添加原始值跟踪
    @State private var originalRedValue: Int
    @State private var originalGreenValue: Int
    @State private var originalBlueValue: Int
    
    // 添加一个静态变量，用于跟踪通知状态
    private static var isNotificationSent = false
    
    // 添加防抖机制
    private var lastToastUpdate: Date = Date()
    
    // 环境对象
    @Environment(\.dismiss) private var dismiss
    
    // 添加emoji缓存
    private var redEmojiCache: [String] = []
    private var greenEmojiCache: [String] = []
    private var blueEmojiCache: [String] = []
    
    // 初始化器
    init(isPresented: Binding<Bool>, selectedColor: Binding<Color>, onColorSelected: @escaping (Color) -> Void, initialRed: Int? = nil, initialGreen: Int? = nil, initialBlue: Int? = nil) {
        self._isPresented = isPresented
        self._selectedColor = selectedColor
        self.onColorSelected = onColorSelected
        self.initialRed = initialRed
        self.initialGreen = initialGreen
        self.initialBlue = initialBlue
        
        // 预先计算RGB值
        let red: Int
        let green: Int
        let blue: Int
        
        if let r = initialRed, let g = initialGreen, let b = initialBlue {
            // 直接使用提供的RGB值
            red = r
            green = g
            blue = b
        } else {
            // 从Color中提取
            let uiColor = UIColor(selectedColor.wrappedValue)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
            
            // 转换为0-255范围
            red = Int(round(r * 255))
            green = Int(round(g * 255))
            blue = Int(round(b * 255))
        }
        
        // 使用计算的值初始化State变量
        self._redValue = State(initialValue: red)
        self._greenValue = State(initialValue: green)
        self._blueValue = State(initialValue: blue)
        self._originalRedValue = State(initialValue: red)
        self._originalGreenValue = State(initialValue: green)
        self._originalBlueValue = State(initialValue: blue)
        
        // 填充emoji缓存
        self.redEmojiCache = (0...255).map { EmojiMapper.emojiForValue($0, channel: "R") }
        self.greenEmojiCache = (0...255).map { EmojiMapper.emojiForValue($0, channel: "G") }
        self.blueEmojiCache = (0...255).map { EmojiMapper.emojiForValue($0, channel: "B") }
        
        // 移除立即预热通知系统，延迟到onAppear中执行
    }
    
    // 检查是否有变化
    private var hasChanges: Bool {
        return redValue != originalRedValue ||
               greenValue != originalGreenValue ||
               blueValue != originalBlueValue
    }
    
    var body: some View {
        VStack(spacing: config.spacing(8)) {
            // RGB滚轮 - 移除顶部Spacer，让组件上移
            HStack(spacing: config.spacing(config.horizontalSpacing)) {
                // 红色滚轮
                VStack(spacing: 0) {
                    Picker("R", selection: $redValue) {
                        ForEach(0...255, id: \.self) { value in
                            Text(redEmojiCache[value])
                                .font(.system(size: 22))
                                .frame(width: config.wheelWidth() - 8, alignment: .center)
                                .minimumScaleFactor(0.9)  // 允许轻微缩小以适应内容
                                .lineLimit(1)
                                .tag(value)
                        }
                    }
                    .pickerStyle(WheelPickerStyle())
                    .frame(width: config.wheelWidth(), height: config.wheelHeight())
                    .clipped()
                    .compositingGroup()
                }
                
                // 绿色滚轮
                VStack(spacing: 0) {
                    Picker("G", selection: $greenValue) {
                        ForEach(0...255, id: \.self) { value in
                            Text(greenEmojiCache[value])
                                .font(.system(size: 22))
                                .frame(width: config.wheelWidth() - 8, alignment: .center)
                                .minimumScaleFactor(0.9)  // 允许轻微缩小以适应内容
                                .lineLimit(1)
                                .tag(value)
                        }
                    }
                    .pickerStyle(WheelPickerStyle())
                    .frame(width: config.wheelWidth(), height: config.wheelHeight())
                    .clipped()
                    .compositingGroup()
                }
                
                // 蓝色滚轮
                VStack(spacing: 0) {
                    Picker("B", selection: $blueValue) {
                        ForEach(0...255, id: \.self) { value in
                            Text(blueEmojiCache[value])
                                .font(.system(size: 22))
                                .frame(width: config.wheelWidth() - 8, alignment: .center)
                                .minimumScaleFactor(0.9)  // 允许轻微缩小以适应内容
                                .lineLimit(1)
                                .tag(value)
                        }
                    }
                    .pickerStyle(WheelPickerStyle())
                    .frame(width: config.wheelWidth(), height: config.wheelHeight())
                    .clipped()
                    .compositingGroup()
                }
            }
            .onChange(of: redValue) { _, _ in updateSelectedColor() }
            .onChange(of: greenValue) { _, _ in updateSelectedColor() }
            .onChange(of: blueValue) { _, _ in updateSelectedColor() }
        }
        .padding(.init(
            top: -config.wheelHeight() * 0.25, // 使用屏幕比例计算负边距，大约是滚轮高度的1/4
            leading: config.spacing(4),
            bottom: config.spacing(4),
            trailing: config.spacing(4)
        )) // 使用动态计算的padding，适应不同尺寸的屏幕
        .onAppear {
            // 初始化通知状态
            EmojiColorSelector.isNotificationSent = false
            
            // 播放触觉反馈
            WKInterfaceDevice.current().play(.click)
            
            // 延迟发送通知，避免在初始化时立即发送
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                // 表情符号选择器显示时，通知主视图停止响应表冠
                NotificationCenter.default.post(Notification(name: .rgbPickerActive))
            }
            
            // 延迟显示Toast，避免初始化时的性能压力
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self.showColorToast()
            }
        }
        .onDisappear {
            // 当表情符号颜色选择器关闭时，通知主视图
            NotificationCenter.default.post(Notification(name: .rgbPickerInactive))
            
            // 确保通知只发送一次 - 如果已经在点击确定时发送了通知，就不再发送
            if EmojiColorSelector.isNotificationSent {
                return
            }
            
            // 严格检查是否有实际的颜色变化 - 必须有明显变化才发送通知
            let hasSignificantChange = abs(Double(originalRedValue) - Double(redValue)) > 1.0 ||
                                       abs(Double(originalGreenValue) - Double(greenValue)) > 1.0 ||
                                       abs(Double(originalBlueValue) - Double(blueValue)) > 1.0
            
            // 只有在值确实发生明显变化时才同步
            if hasSignificantChange {
                // 获取当前RGB颜色的HSB值
                let color = Color(red: Double(redValue)/255, green: Double(greenValue)/255, blue: Double(blueValue)/255)
                syncSaturationValue(color)
            }
            
            // 发送通知，通知ContentView将表冠重置到亮度控制模式
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                NotificationCenter.default.post(Notification(name: .resetCrownToBrightness))
            }
        }
    }
    
    // 计算对比文字颜色
    private var textColor: Color {
        let brightness = (0.299 * Double(redValue) + 0.587 * Double(greenValue) + 0.114 * Double(blueValue)) / 255
        return brightness > 0.5 ? .black : .white
    }
    
    // 计算RGB值对应的HSB值
    static private func getHSBFromRGB(_ red: Double, _ green: Double, _ blue: Double) -> (hue: Double, saturation: Double, brightness: Double) {
        let maxValue = max(red, green, blue)
        let minValue = min(red, green, blue)
        let delta = maxValue - minValue
        
        // 计算亮度
        let brightness = maxValue
        
        // 计算饱和度
        let saturation = maxValue == 0 ? 0 : delta / maxValue
        
        // 计算色相
        var hue: Double = 0
        if delta == 0 {
            hue = 0
        } else if maxValue == red {
            hue = ((green - blue) / delta).remainder(dividingBy: 6.0) / 6.0
            if hue < 0 { hue += 1.0 }
        } else if maxValue == green {
            hue = ((blue - red) / delta + 2.0) / 6.0
        } else {
            hue = ((red - green) / delta + 4.0) / 6.0
        }
        
        return (hue, saturation, brightness)
    }
    
    // 同步饱和度的方法也需要防止不必要的同步
    private func syncSaturationValue(_ color: Color) {
        // 如果通知已经发送，不再重复发送
        if EmojiColorSelector.isNotificationSent {
            return
        }
        
        // 获取HSB值
        let uiColor = UIColor(color)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        // 标记通知已发送
        EmojiColorSelector.isNotificationSent = true
        
        // 确保有必要才发送通知
        let newSaturation = Double(s)
        let originalColor = Color(red: Double(originalRedValue)/255, green: Double(originalGreenValue)/255, blue: Double(originalBlueValue)/255)
        let originalUIColor = UIColor(originalColor)
        var originalS: CGFloat = 0
        originalUIColor.getHue(nil, saturation: &originalS, brightness: nil, alpha: nil)
        
        // 只有当饱和度发生明显变化时才同步
        if abs(Double(originalS) - newSaturation) > 0.01 {
           DispatchQueue.main.async {
                NotificationCenter.default.post(
                    Notification(name: .saturationUpdated, object: newSaturation)
                )
            }
        }
    }
    
    // 添加一个方法来实时更新选中的颜色
    private func updateSelectedColor() {
        let newColor = Color(red: Double(redValue)/255, green: Double(greenValue)/255, blue: Double(blueValue)/255)
        selectedColor = newColor
        
        // 调用回调函数，确保按钮状态能正确更新
        onColorSelected(newColor)
        
        // 使用防抖机制来减少Toast更新频率
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.showColorToast()
        }
    }
    
    // 新增方法：显示颜色Toast
    private func showColorToast() {
        // 使用安全解包处理，在预览环境中可能无法获取displayModeManager
        let isEditingBreathingColors = displayModeManager.isEditingBreathingColors
        
        // 检查是否在呼吸模式颜色编辑
        if isEditingBreathingColors {
            // 在呼吸模式下，只显示颜色序列索引提示
            let index = displayModeManager.editingColorIndex
            let total = displayModeManager.customBreathingColors.count
            ToastManager.shared.show(primaryText: String(format: NSLocalizedString("toast.color.index", comment: "Color index toast"), index + 1, total))
        } else {
            // 非呼吸模式，显示当前RGB值和对应表情符号
            let formattedColor = ColorFormatter.shared.format(selectedColor)
            ToastManager.shared.show(primaryText: formattedColor)
        }
    }
    
    // 自定义按钮样式
    struct BouncyButtonStyle: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
                .animation(.spring(response: 0.5, dampingFraction: 0.8), value: configuration.isPressed)
        }
    }
}

// MARK: - 预览
#Preview {
    EmojiColorSelector(
        isPresented: .constant(true),
        selectedColor: .constant(.red),
        onColorSelected: { _ in }
    )
    .environmentObject(DisplayModeManager()) // 添加环境对象，解决预览崩溃问题
}

// MARK: - 表情符号映射
struct EmojiMapper {
    // 所有可用的表情符号 - 分为R、G、B三组
    static let redEmojis = ["😋","👂","🌞","🦇","🍣","😘","📝","🔍","🦤","🧖🏻‍♂️","🧧","🍄","🧜🏻‍♂️","↙️","🩼","🛷","💭","🥯","📆","🎤","🍄‍🟫","🚒","🎽","㊗️","🧟‍♂️","📕","🌗","😾","🥾","🦻","🏒","🕙","🐡","🩷","🦸🏻‍♀️","⛓","◻️","💋","🎞","👯","🥀","🟥","🏉","😀","🌶","🥊","🧱","🩻","😉","🔸","🦆","🟠","♋","🔻","🚟","⏭","🚥","🗯","🈲","🍅","👨🏻‍🦲","🏭","⚪","🍶","💔","🧶","✍","👿","📱","🧲","🎨","👩🏻‍🎤","🐾","🤓","🧨","🌤","♥️","🚨","😭","👨🏻‍🎨","🤔","😠","💓","🏃🏻‍♀️","🈯","👍","🪓","🎂","💷","👛","⛄","🍎","🪭","🔅","💐","💈","💁","😡","🫙","🚼","🚡","🫐","🏺","🔌","🪟","🤹","🧻","🧟","🚣","🍹","🧁","😪","🩰","🦘","👄","☺️","🛍","🫓","🪨","🐯","❣️","👶","🌹","🗄","🧑🏻‍🎤","2️⃣","🚬","📔","🥇","🟧","🍁","🛢","🎈","🚶","📛","😕","⌛","😜","🏃","🏈","💒","👨🏻‍🎓","🦁","🎮","🎀","🧞","🚚","👅","❤️","🍓","🥣","🌆","♎","👩🏻‍⚕️","🪷","⚙️","🥌","⛔","⛪","🎪","🥸","🤟","📽","🧙🏻‍♂️","♓","👲","♦️","🤬","🗻","🕘","🐛","📡","👨🏻‍✈️","🈴","🆎","🧒","🤩","🎒","🔐","🚆","👨🏻‍⚖️","🤗","🏃🏻‍♂️","🥋","🏐","🫨","🔝","🎴","👨🏻‍🦰","💫","🛣","🫀","🥵","🧑‍🧑‍🧒","🦀","🍴","🤾🏻‍♂️","💄","🤾🏻‍♀️","🔎","💣","🦓","🤘","🎏","💥","🌍","💃","🥮","💅","🟫","🪶","🧑🏻‍🍼","🐒","🔆","💢","😮‍💨","🖊","🚣🏻‍♂️","🤒","🧑🏻‍💼","🛑","🏃🏻‍♀️","💬","🚶🏻‍♀️","♾","🍉","🪘","9️⃣","😓","🧡","👰","🧾","🍷","😍","📙","🐺","🔘","☀️","🖋","⭕","⌚","🛡","🍰","🐎","🚋","🛹","🥐","🛂","💀","🥩","🏰","🔴","☄️","🎫","🍒","🩸"]
    
    static let greenEmojis = ["🍯","👨🏻‍🏫","🥰","🔨","🍍","🌥","🤽🏻‍♂️","🐘","🔧","💕","🕑","😆","🛫","🕖","🚗","🈳","🏵","3️⃣","⬆️","🧑🏻‍🌾","🐲","🛶","🦹🏻‍♀️","🐖","🆓","🪺","🌡","🍃","📻","🤼","🧺","🌯","🪲","🆕","🌾","🚔","🌋","🐩","📮","🐸","🤧","🏚","🥗","😸","🧑‍🧒‍🧒","☘️","🎟","💨","♻️","😅","🚶🏻‍♀️","💹","🥝","⚾","🙈","🕞","🏠","🐕‍🦺","👣","🤑","🔽","🧞‍♂️","➕","🗃","🔃","✅","👨🏻‍❤️‍💋‍👨","🌷","🎺","📗","💁🏻‍♀️","🐉","🐄","🐈‍⬛","🌜","🧅","🍟","🎲","🐈","🦸🏻‍♂️","🏮","🪹","🚻","🕝","🌴","🗳","🔦","🥖","🟩","💺","🌲","👔","🌿","🧍","🏩","🥫","🩺","🧣","😖","🍐","❤️‍🔥","🌵","⏯","🪞","👜","🚽","🦟","🔺","🌉","🚴🏻‍♀️","🙊","⏺","👃","🪴","✊","🚑","👕","↩️","🌳","👩🏻‍🚀","🧠","🛰","⛓️‍💥","👩🏻‍🍳","🤽🏻‍♀️","👁","🥒","🐣","😤","👯‍♀️","🔋","🚶🏻‍♂️","🦠","🍪","☠️","📶","🛅","⏳","🎥","🧝","🆔","✋","⛩","🕧","🧝🏻‍♀️","🐅","🧗","🚺","👷🏻‍♂️","🧦","🥚","♒","⏫","👋","👨🏻‍🦱","📘","🪃","🧕","🔖","🦿","🚠","🎍","🥑","🟪","💉","☣️","🍏","💚","💯","🪪","🖲","🥔","🛞","🗓","🤪","🙃","✡️","🍀","🍌","➡️","💛","🫰","🧃","🦖","🥦","🟢","🌱","🍺","😊","📒","🐨","👌","🦢","🍡","👊","🧟‍♀️","📂","😏","🐢","🍈","🫔","🥬","👩🏻‍🏫","🦯","🗼","🥘","🚣🏻‍♀️","🔞","🪔","🧝🏻‍♂️","🎱","👨🏻‍🦳","🪿","🫛","😛","👘","🦡","🦕","📍","🥴","🎓","🆖","🏯","☸️","🩱","🦫","🧪","🌙","🔡","🐍","💂🏻‍♂️","👳🏻‍♀️","📹","🧛","🥱","😚","🦼","🥄","🤭","🐵","📬","🪀","🚮","🪯","⛈","🚴","🫏","🦎","🔼","🌫","🌎","🦑","🙏","🏜","❎","🫑"]
    
    static let blueEmojis = ["🪬","🐻","🧋","🦏","🦩","😼","🔏","🛋","🚢","🎯","🖱","🙍","📸","🈺","💆🏻‍♂️","🕔","🪐","👯‍♂️","🪥","🩶","🤿","🖖","🛳","🧞‍♀️","📫","💙","⁉️","🎡","🥧","🎳","💇","➗","🦭","🕜","📩","🪖","😶","🥼","🔶","🚰","❗","🕍","🙎","💟","📖","🎶","🛌","🦪","🚴🏻‍♂️","👖","🤮","🍾","↪️","🛜","➿","🥠","⛅","🫷","🦋","👏","😑","🤤","▶️","📺","🌊","🔟","🥅","🦹","💎","👨🏻‍⚕️","🖥","😢","🎐","🛐","🚄","🙅🏻‍♀️","🎧","🔕","☃️","🕐","⚔️","🫚","💾","⚧️","✒️","🏞","♏","👷","🪽","🗽","🛕","🏔","🪣","🚸","Ⓜ️","🪰","🥳","🛰","❄️","🏫","🚌","☎️","♈","🍼","🆒","✉️","✈️","🧼","🖍","👟","🎼","🩹","🧿","🤸🏻‍♂️","♉","👽","🈚","🧥","🛺","💊","🅿️","🤦","🌨","🌁","🤶","🐮","🥏","🚤","🟣","🧗🏻‍♂️","🎻","🦊","👩🏻‍⚖️","🩵","🚿","🔷","🌀","👴","👩🏻‍❤️‍👩","🤸","👩🏻‍🌾","😈","🌮","📘","🧮","🚀","💠","🤡","🐦","🧤","💦","⏏️","🪤","🌕","👉","⏱","🔣","🟦","🔬","🏷","🐧","🚇","💜","🥭","🦝","🍋‍🟩","🌐","🫤","❔","✨","🏊🏻‍♂️","🚶🏻‍♂️","🗒","🆘","🧛🏻‍♀️","😣","🔑","💂","🦞","🪸","🏊🏻‍♀️","🤵🏻‍♀️","🫂","🧑🏻‍🚒","🤲","🌧","🫲","🪙","🐬","👱🏻‍♂️","🍗","🍤","🅰️","🛁","😥","🧑🏻‍🎓","⛱","🙁","🧓","🎰","🧩","😿","☕","🕹","👾","📳","🔹","🈁","🌂","🚲","📅","🉑","♊","😌","🦙","💧","🛥","🧸","⛽","🥶","🦃","🦽","🌔","🤹🏻‍♂️","🟤","🦹🏻‍♂️","🍧","📤","❕","💻","🚂","🏆","💱","🎭","🎗","😟","🧽","⚒","🚵🏻‍♀️","🕡","😮","🔵","🛟","👈","👩🏻‍🦰","🔪","👮🏻‍♀️","🧊","🕗","🏓","🎩","🪼","⛑","🐶","🫢","👚"]
    
    // 根据数值获取对应通道的表情符号
    static func emojiForValue(_ value: Int, channel: String) -> String {
        let emojis: [String]
        
        // 根据通道选择对应的表情符号数组
        switch channel {
        case "R":
            emojis = redEmojis
        case "G":
            emojis = greenEmojis
        case "B":
            emojis = blueEmojis
        default:
            emojis = redEmojis
        }
        
        // 确保不越界，如果value超出了表情符号数组范围，则取模循环使用
        if value < emojis.count {
            return emojis[value]
        } else {
            // 超出范围时使用固定表情符号或循环使用
            return emojis[value % emojis.count]
        }
    }
    
    // 显示RGB值和对应表情符号
    static func formatRGBValue(_ red: Int, _ green: Int, _ blue: Int) -> String {
        return "\(emojiForValue(red, channel: "R"))\(emojiForValue(green, channel: "G"))\(emojiForValue(blue, channel: "B"))"
//        return "R:\(emojiForValue(red, channel: "R")) G:\(emojiForValue(green, channel: "G")) B:\(emojiForValue(blue, channel: "B"))"
    }
} 
