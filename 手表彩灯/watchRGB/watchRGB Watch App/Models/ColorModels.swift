import SwiftUI

// MARK: - 颜色信息模型
struct ColorInfo: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let red: Double
    let green: Double
    let blue: Double
    
    var color: Color {
        Color(red: red/255, green: green/255, blue: blue/255)
    }
    
    // 基本初始化方法
    init(name: String, red: Double, green: Double, blue: Double) {
        self.name = name
        self.red = red
        self.green = green
        self.blue = blue
    }
    
    // 从Color对象创建ColorInfo，使用统一的四舍五入逻辑
    static func fromColor(_ color: Color, name: String = "自定义") -> ColorInfo {
        let uiColor = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        
        // 统一使用四舍五入逻辑，确保与RGB选择器一致
        let red = round(Double(r * 255))
        let green = round(Double(g * 255))
        let blue = round(Double(b * 255))
        
        return ColorInfo(
            name: name,
            red: red,
            green: green,
            blue: blue
        )
    }
    
    // 获取HSB值
    func getHSB() -> (hue: Double, saturation: Double, brightness: Double) {
        let uiColor = UIColor(red: CGFloat(red/255), green: CGFloat(green/255), blue: CGFloat(blue/255), alpha: 1.0)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        return (Double(h), Double(s), Double(b))
    }
    
    // 支持Equatable协议
    static func == (lhs: ColorInfo, rhs: ColorInfo) -> Bool {
        return lhs.red == rhs.red && lhs.green == rhs.green && lhs.blue == rhs.blue
    }
}

// MARK: - 颜色选择器配置
struct ColorWheelConfig {
    // 色轮尺寸
    let size: CGFloat = 100
    // 水平内边距
    let horizontalPadding: CGFloat = 30
    // 垂直内边距
    let verticalPadding: CGFloat = 10
    // 动画参数
    let animationSpeed: Double = 0.2
    let animationDamping: Double = 0.75
    // 亮度范围
    let minBrightness: Double = 0.2
    let maxBrightness: Double = 1.0
    
    var brightnessRange: ClosedRange<Double> { minBrightness...maxBrightness }
    
    // 基于设备尺寸的自适应比例因子
    func scaleFactor() -> CGFloat {
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        // 以44mm表盘（约184pt宽度）为基准
        let baseFactor: CGFloat = 1.0
        let scaleFactor = screenWidth / 184.0
        
        // 限制比例范围，避免过大或过小
        return min(max(scaleFactor * baseFactor, 0.8), 1.2)
    }
    
    // 根据设备尺寸自适应字体大小
    func fontSize(_ size: CGFloat) -> CGFloat {
        return size * scaleFactor()
    }
    
    // 根据设备尺寸自适应间距
    func spacing(_ space: CGFloat) -> CGFloat {
        return space * scaleFactor()
    }
}

// MARK: - 颜色数据持久化
extension ContentView {
    // 保存颜色列表
    func saveColorList() {
        // 将颜色列表转换为可编码的格式
        let encodableColors = colorList.map { colorInfo -> [String: Any] in
            return [
                "name": colorInfo.name,
                "red": colorInfo.red,
                "green": colorInfo.green,
                "blue": colorInfo.blue
            ]
        }
        
        // 保存到UserDefaults
        UserDefaults.standard.set(encodableColors, forKey: "savedColorList")
    }
    
    // 读取颜色列表
    func loadColorList() {
        // 从UserDefaults读取
        if let savedColors = UserDefaults.standard.array(forKey: "savedColorList") as? [[String: Any]] {
            // 转换回ColorInfo数组
            let loadedColors = savedColors.compactMap { dict -> ColorInfo? in
                guard let name = dict["name"] as? String,
                      let red = dict["red"] as? Double,
                      let green = dict["green"] as? Double,
                      let blue = dict["blue"] as? Double else {
                    return nil
                }
                
                return ColorInfo(name: name, red: red, green: green, blue: blue)
            }
            
            // 如果成功读取并且不为空，使用读取的列表
            if !loadedColors.isEmpty {
                colorList = loadedColors
            }
        }
    }
    
    // 保存当前颜色索引
    func saveCurrentColorIndex() {
        UserDefaults.standard.set(currentColorIndex, forKey: "savedCurrentColorIndex")
    }
    
    // 读取当前颜色索引
    func loadCurrentColorIndex() {
        let savedIndex = UserDefaults.standard.integer(forKey: "savedCurrentColorIndex")
        // 确保索引在有效范围内
        if savedIndex >= 0 && savedIndex < colorList.count {
            currentColorIndex = savedIndex
        } else {
            currentColorIndex = 0
        }
    }
}

// MARK: - 新增颜色模式
enum AddColorMode {
    case none    // 非新增模式
    case head    // 头部新增模式
    case tail    // 尾部新增模式
    
    func isEditingColor() -> Bool {
        return self == .head || self == .tail
    }
}
