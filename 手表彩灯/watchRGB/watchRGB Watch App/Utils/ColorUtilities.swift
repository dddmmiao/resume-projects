import SwiftUI

// MARK: - 颜色转换工具
struct ColorUtilities {
    // 颜色转Hex字符串
    static func colorToHexString(_ color: Color) -> String {
        let uiColor = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        let red = Int(r * 255)
        let green = Int(g * 255)
        let blue = Int(b * 255)
        return String(format: "#%02X%02X%02X", red, green, blue)
    }
    
    // 颜色转RGB字符串updateColorFromRGB
    static func colorToRGBString(_ color: Color) -> String {
        let uiColor = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        
        // 使用四舍五入而非向上取整，确保与RGB选择器显示的值完全一致
        let red = Int(round(r * 255))
        let green = Int(round(g * 255))
        let blue = Int(round(b * 255))
        
        return "RGB\(red),\(green),\(blue)"
    }
    
    // 从RGB值创建精确颜色
    static func createColorFromRGB(red: Int, green: Int, blue: Int) -> Color {
        return Color(
            red: Double(red) / 255.0,
            green: Double(green) / 255.0,
            blue: Double(blue) / 255.0
        )
    }
    
    // 比较两个颜色是否相等，考虑一定的误差范围
    static func colorsAreEqual(_ color1: Color, _ color2: Color) -> Bool {
        let colorInfo1 = ColorInfo.fromColor(color1)
        let colorInfo2 = ColorInfo.fromColor(color2)
        
        // 允许一点误差（考虑浮点数精度）
        let redDiff = abs(colorInfo1.red - colorInfo2.red)
        let greenDiff = abs(colorInfo1.green - colorInfo2.green)
        let blueDiff = abs(colorInfo1.blue - colorInfo2.blue)
        
        // 如果RGB差异都小于某个阈值，认为是同一颜色
        // 使用更小的阈值，提高精度
        let threshold: Double = 0.5
        
        return redDiff < threshold && greenDiff < threshold && blueDiff < threshold
    }
    
    // 同步HSB值
    static func syncHSBFromColor(_ color: Color) -> (hue: Double, saturation: Double, brightness: Double) {
        let uiColor = UIColor(color)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        
        return (Double(h), Double(s), Double(b))
    }
}
