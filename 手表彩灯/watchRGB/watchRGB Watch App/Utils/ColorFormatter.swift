import SwiftUI

// MARK: - 颜色格式化工具
class ColorFormatter {
    static let shared = ColorFormatter()
    
    // 根据当前设置格式化颜色
    func format(_ color: Color) -> String {
        let format = ColorFormatManager.shared.currentFormat
        
        switch format {
        case .rgb:
            return formatAsRGB(color)
        case .hex:
            return formatAsHex(color)
        case .emoji:
            return formatAsEmoji(color)
        }
    }
    
    // 格式化为RGB字符串: "R: XXX G: XXX B: XXX"
    private func formatAsRGB(_ color: Color) -> String {
        let (r, g, b, _) = color.toRGBA()
        return "R:\(Int(round(r*255))) G:\(Int(round(g*255))) B:\(Int(round(b*255)))"
    }
    
    // 格式化为十六进制字符串: "#RRGGBB"
    private func formatAsHex(_ color: Color) -> String {
        return ColorUtilities.colorToHexString(color)
    }
    
    // 格式化为Emoji字符串
    private func formatAsEmoji(_ color: Color) -> String {
        let (r, g, b, _) = color.toRGBA()
        return EmojiMapper.formatRGBValue(Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
    }
}

// MARK: - Color扩展
extension Color {
    // 将Color转换为RGBA元组
    func toRGBA() -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return (red, green, blue, alpha)
    }
} 