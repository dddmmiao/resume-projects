import SwiftUI

// MARK: - 颜色选择器模式
enum ColorSelectorMode: String, Identifiable, CaseIterable {
    case colorWheel  // 色轮模式
    case rgbInput    // RGB输入模式
    case emojiSelector   // 表情符号颜色选择器模式
    // 未来可以在这里添加新的选择器类型，如HSL选择器、调色板等
    
    var id: String { rawValue }
    
    var icon: String {
        // 无论当前是哪种模式，统一返回相同的图标
        return "slider.horizontal.3"  // 使用循环箭头图标表示切换功能
    }
    
    var order: Int {
        switch self {
        case .colorWheel: return 0
        case .rgbInput: return 1
        case .emojiSelector: return 2
        }
    }
    
    // 获取下一个选择器模式
    func next() -> ColorSelectorMode {
        let allModes = ColorSelectorMode.allCases.sorted(by: { $0.order < $1.order })
        guard let currentIndex = allModes.firstIndex(of: self) else { return .colorWheel }
        let nextIndex = (currentIndex + 1) % allModes.count
        return allModes[nextIndex]
    }
} 