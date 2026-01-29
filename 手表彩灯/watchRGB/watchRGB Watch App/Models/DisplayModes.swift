import SwiftUI

// MARK: - 显示模式
enum DisplayMode: String, Identifiable, CaseIterable {
    case solidColor    // 单色模式
    case breathing     // 呼吸模式
    
    var id: String { rawValue }
    
    var icon: String {
        switch self {
        case .solidColor: return "circle.fill"
        case .breathing: return "waveform"
        }
    }
    
    var order: Int {
        switch self {
        case .solidColor: return 0
        case .breathing: return 1
        }
    }
    
    // 获取下一个显示模式
    func next() -> DisplayMode {
        let allModes = DisplayMode.allCases.sorted(by: { $0.order < $1.order })
        guard let currentIndex = allModes.firstIndex(of: self) else { return .solidColor }
        let nextIndex = (currentIndex + 1) % allModes.count
        return allModes[nextIndex]
    }
}

// MARK: - 呼吸模式
enum BreathingMode: String, Identifiable, CaseIterable {
    case warm      // 暖色系
    case cool      // 冷色系
    case rainbow   // 彩虹色系
    case forest    // 森林色系
    case ocean     // 海洋色系
    case sunset    // 日落色系
    case neon      // 霓虹色系
    case pastel    // 粉彩色系
    case monochrome // 单色渐变
    case stellar   // 星际之梦
    case celestial // 紫薇星宫
    case mystic    // 翡翠秘境
    case platinum  // 白金传说
    case phantom   // 幻影迷雾
    case aurora    // 极光幻舞
    case crystal   // 水晶圣殿
    case custom    // 自定义色系（放到最后）
    
    var id: String { rawValue }
    
    // 存储被删除的模式
    private static var deletedModes: Set<BreathingMode> = []
    
    // 获取所有可用的模式（排除已删除的模式）
    static var availableModes: [BreathingMode] {
        return allCases.filter { !deletedModes.contains($0) }
    }
    
    // 恢复一个模式
    static func restoreMode(_ mode: BreathingMode) {
        deletedModes.remove(mode)
    }
    
    // 检查模式是否被删除
    var isDeleted: Bool {
        return BreathingMode.deletedModes.contains(self)
    }
    
    // 默认颜色列表
    var defaultColors: [Color] {
        switch self {
        case .warm:
            return [
                Color(red: 1.0, green: 0.0, blue: 0.0),    // 红色
                Color(red: 1.0, green: 0.5, blue: 0.0),    // 橙色
                Color(red: 1.0, green: 1.0, blue: 0.0),    // 黄色
                Color(red: 1.0, green: 0.8, blue: 0.0)     // 金色
            ]
        case .cool:
            return [
                Color(red: 0.0, green: 0.0, blue: 1.0),    // 蓝色
                Color(red: 0.0, green: 1.0, blue: 1.0),    // 青色
                Color(red: 0.5, green: 0.0, blue: 1.0),    // 紫色
                Color(red: 0.0, green: 0.5, blue: 1.0)     // 天蓝色
            ]
        case .rainbow:
            return [
                Color(red: 1.0, green: 0.0, blue: 0.0),    // 红色
                Color(red: 1.0, green: 0.5, blue: 0.0),    // 橙色
                Color(red: 1.0, green: 1.0, blue: 0.0),    // 黄色
                Color(red: 0.0, green: 1.0, blue: 0.0),    // 绿色
                Color(red: 0.0, green: 0.0, blue: 1.0),    // 蓝色
                Color(red: 0.5, green: 0.0, blue: 1.0)     // 紫色
            ]
        case .custom:
            return [
                Color(red: 1.0, green: 0.0, blue: 0.0),    // 红色
                Color(red: 0.0, green: 1.0, blue: 0.0),    // 绿色
                Color(red: 0.0, green: 0.0, blue: 1.0)     // 蓝色
            ]
        case .forest:
            return [
                Color(hex: "228B22"),  // 森林绿
                Color(hex: "006400"),  // 深绿
                Color(hex: "556B2F"),  // 橄榄绿
                Color(hex: "8FBC8F")   // 深海绿
            ]
        case .ocean:
            return [
                Color(hex: "1E90FF"),  // 道奇蓝
                Color(hex: "00008B"),  // 深蓝
                Color(hex: "4682B4"),  // 钢蓝
                Color(hex: "87CEEB")   // 天空蓝
            ]
        case .sunset:
            return [
                Color(hex: "FF6347"),  // 番茄红
                Color(hex: "FF4500"),  // 橙红
                Color(hex: "FFD700"),  // 金色
                Color(hex: "FF69B4")   // 热粉
            ]
        case .neon:
            return [
                Color(hex: "00FF00"),  // 霓虹绿
                Color(hex: "FF1493"),  // 深粉
                Color(hex: "00FFFF"),  // 青色
                Color(hex: "FF00FF")   // 品红
            ]
        case .pastel:
            return [
                Color(hex: "FFB6C1"),  // 淡粉
                Color(hex: "98FB98"),  // 淡绿
                Color(hex: "87CEFA"),  // 淡蓝
                Color(hex: "DDA0DD")   // 淡紫
            ]
        case .monochrome:
            return [
                Color.white,           // 白色
                Color.gray,            // 灰色
                Color.black            // 黑色
            ]
        case .stellar:
            return [
                Color(hex: "0F0F23"),  // 深空蓝
                Color(hex: "2E1065"),  // 星云紫
                Color(hex: "4C1D95"),  // 神秘紫
                Color(hex: "7C3AED"),  // 紫罗兰
                Color(hex: "A855F7")   // 亮紫色
            ]
        case .celestial:
            return [
                Color(hex: "1E1B4B"),  // 深紫蓝
                Color(hex: "3730A3"),  // 皇室蓝
                Color(hex: "7C2D92"),  // 紫薇色
                Color(hex: "BE185D"),  // 玫瑰红
                Color(hex: "EC4899")   // 亮粉色
            ]
        case .mystic:
            return [
                Color(hex: "064E3B"),  // 深翡翠绿
                Color(hex: "047857"),  // 翡翠绿
                Color(hex: "059669"),  // 祖母绿
                Color(hex: "10B981"),  // 薄荷绿
                Color(hex: "34D399")   // 亮绿色
            ]
        case .platinum:
            return [
                Color(hex: "374151"),  // 铂金灰
                Color(hex: "6B7280"),  // 银灰色
                Color(hex: "9CA3AF"),  // 亮银色
                Color(hex: "D1D5DB"),  // 珍珠白
                Color(hex: "F3F4F6")   // 白金色
            ]
        case .phantom:
            return [
                Color(hex: "111827"),  // 幻影黑
                Color(hex: "374151"),  // 暗灰色
                Color(hex: "6366F1"),  // 幻紫色
                Color(hex: "8B5CF6"),  // 神秘紫
                Color(hex: "A78BFA")   // 幽灵紫
            ]
        case .aurora:
            return [
                Color(hex: "065F46"),  // 极地绿
                Color(hex: "059669"),  // 北极光绿
                Color(hex: "3B82F6"),  // 天空蓝
                Color(hex: "8B5CF6"),  // 极光紫
                Color(hex: "EC4899")   // 极光粉
            ]
        case .crystal:
            return [
                Color(hex: "1E40AF"),  // 蓝宝石蓝
                Color(hex: "3B82F6"),  // 水晶蓝
                Color(hex: "06B6D4"),  // 海蓝宝石
                Color(hex: "10B981"),  // 祖母绿
                Color(hex: "F59E0B")   // 黄水晶
            ]
        }
    }
    
    // 获取颜色列表的方法
    func colors(from manager: DisplayModeManager?) -> [Color] {
        // 如果提供了管理器，并且其当前模式与此枚举大小写匹配，
        // 检查它是否已加载自定义颜色。
        if let manager = manager, manager.currentBreathingMode == self, !manager.customBreathingColors.isEmpty {
            return manager.customBreathingColors
        }
        
        // 备用方案：直接检查UserDefaults中此模式的自定义颜色。
        let key = "breathingColors_\(self.rawValue)"
        if let colorData = UserDefaults.standard.data(forKey: key),
           let colorDataArray = try? JSONDecoder().decode([[CGFloat]].self, from: colorData) {
            
            let colors = colorDataArray.map { components -> Color in
                if components.count >= 4 {
                    return Color(red: Double(components[0]), green: Double(components[1]), blue: Double(components[2]), opacity: Double(components[3]))
                }
                return .red
            }
            if colors.count >= 2 {
                return colors
            }
        }
        
        // 最终备用方案：此模式的默认颜色。
        return self.defaultColors
    }
    
    var name: String {
        let key = "breathing.mode.\(self.rawValue)"
        return NSLocalizedString(key, comment: "Breathing mode name: \(self.rawValue)")
    }
    
    // 获取下一个呼吸模式
    func next() -> BreathingMode {
        let availableModes = BreathingMode.availableModes
        guard let currentIndex = availableModes.firstIndex(of: self) else { return .warm }
        let nextIndex = (currentIndex + 1) % availableModes.count
        return availableModes[nextIndex]
    }
    
    // 获取上一个呼吸模式
    func previous() -> BreathingMode {
        let availableModes = BreathingMode.availableModes
        guard let currentIndex = availableModes.firstIndex(of: self) else { return .warm }
        let previousIndex = (currentIndex - 1 + availableModes.count) % availableModes.count
        return availableModes[previousIndex]
    }
}

// MARK: - User Interaction State Management
enum UserInteractionState: Equatable {
    case none
    case wheelTapped(Date)
    case rgbClosed(Date)
    
    var timestamp: Date? {
        switch self {
        case .none:
            return nil
        case .wheelTapped(let date), .rgbClosed(let date):
            return date
        }
    }
    
    func isInProtectionWindow(duration: TimeInterval = 1.0) -> Bool {
        guard let timestamp = timestamp else { return false }
        return Date().timeIntervalSince(timestamp) < duration
    }
    
    var isWheelRecentlyTapped: Bool {
        if case .wheelTapped = self, isInProtectionWindow() {
            return true
        }
        return false
    }
}
