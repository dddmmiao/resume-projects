import Foundation
import SwiftUI
import CoreMotion

// MARK: - ID Types
typealias SoundID = String  // UUID格式
typealias ImageID = String  // UUID格式，用于图片的唯一标识

// MARK: - Image Trigger Mode
public enum ImageTriggerMode: String, CaseIterable, Identifiable, Codable {
    case tap = "点击触发"
    case shake = "摇晃触发"
    case crown = "表冠触发"
    case auto = "自动播放"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .tap: return "hand.tap"
        case .shake: return "iphone.radiowaves.left.and.right"
        case .crown: return "digitalcrown.arrow.clockwise"
        case .auto: return "play.circle"
        }
    }
}

// MARK: - Sound Play Mode
public enum SoundPlayMode: String, CaseIterable, Identifiable, Codable {
    case sequential = "顺序"
    case random = "随机"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .sequential: return "arrow.down"
        case .random: return "shuffle"
        }
    }

    var description: String {
        switch self {
        case .sequential: return "每次触发只播放一个音效，按选择音效的顺序播放"
        case .random: return "每次触发只播放一个音效，按选择音效随机播放"
        }
    }
}

// MARK: - Trigger Animation Style
public enum TriggerAnimationStyle: String, CaseIterable, Codable {
    case bounce = "弹跳"
    case scale = "缩放"
    case slide = "滑动"
    case fade = "渐显"
    case rotate = "旋转"
    case heart = "心跳"
    // 新增高级动画类型
    case flip = "翻转"
    case wave = "波浪"
    case pulse = "脉冲"
    case sparkle = "闪烁"
    case spiral = "螺旋"
    case shake = "摇摆"
    
    var icon: String {
        switch self {
        case .bounce: return "arrow.up.bounce"
        case .scale: return "plus.magnifyingglass"
        case .slide: return "arrow.right"
        case .fade: return "eye"
        case .rotate: return "arrow.clockwise"
        case .heart: return "heart.fill"
        // 新增动画图标
        case .flip: return "flip.horizontal"
        case .wave: return "waveform"
        case .pulse: return "dot.radiowaves.left.and.right"
        case .sparkle: return "sparkles"
        case .spiral: return "tornado"
        case .shake: return "chevron.left.forwardslash.chevron.right"
        }
    }
}

// MARK: - Display Mode Type
public enum CustomDisplayMode: String, CaseIterable, Identifiable, Codable {
    case text = "文字"
    case image = "图片"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .text: return "textformat"
        case .image: return "photo"
        }
    }
}

// MARK: - Image Content Mode for Toast Display
public enum ImageToastContentMode: String, CaseIterable, Identifiable, Codable {
    case fit = "适合"
    case fill = "填充"
    case center = "居中"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .fit: return "rectangle.portrait"
        case .fill: return "rectangle.fill"
        case .center: return "dot.circle"
        }
    }
}

// MARK: - Circle Selection Data
struct CircleSelectionData: Codable, Equatable {
    var pathPoints: [CGPoint] = [] // 圈选路径点（相对坐标）
    var boundingRect: CGRect = .zero // 边界矩形（相对坐标）
}

// MARK: - Custom Trigger Display
struct CustomTriggerDisplay: Codable, Equatable {
    var isEnabled: Bool = true  // 默认启用自定义显示
    var displayMode: CustomDisplayMode = .text // 显示模式：文字或图片
    var customText: String = ""
    var incrementValue: Int = AppConfig.defaultIncrementValue
    var displayColor: String = "white" // 颜色名称
    var emoji: String = "🍀"
    var animationStyle: TriggerAnimationStyle = .bounce // 文字模式的动画样式
    var showIncrement: Bool = true // 是否显示增量数字
    var fontSize: Double = AppConfig.defaultFontSize

    // 图片显示相关配置
    var imageContentMode: ImageToastContentMode = .fit // 图片内容模式
    var imageSize: CGFloat = 60.0 // 图片Toast尺寸
    var imageOpacity: Double = 1.0 // 图片透明度
    var imageAnimationStyle: TriggerAnimationStyle = .scale // 图片模式的动画样式

    // 自定义显示专用的图片裁剪配置
    var customImageScale: CGFloat = 1.0 // 自定义显示图片缩放
    var customImageOffset: CGSize = .zero // 自定义显示图片偏移
    var customImageURL: String? = nil // 自定义显示裁剪后图片URL路径

    // 圈选裁剪配置
    var customCropRect: CGRect? = nil // 圈选裁剪区域（相对坐标）
    var customCropPath: [CGPoint]? = nil // 圈选路径点（相对坐标）
    var circleSelectionData: CircleSelectionData? = nil // 圈选数据（用于Toast图片）
    
    // 主图圈选裁剪配置（与Toast图片分开）
    var mainCircleSelectionData: CircleSelectionData? = nil // 主图圈选数据
    var mainImageScale: CGFloat = 1.0 // 主图缩放
    var mainImageOffset: CGSize = .zero // 主图偏移
    
    // 获取显示文本
    func getDisplayText(currentCount: Int) -> String {
        if showIncrement {
            // 显示时统一 ±1（0 视为 +1），把渲染和数据约束保持一致
            let normalized = normalizedIncrementUnit()
            if normalized < 0 {
                return "\(customText)\(normalized)"
            } else {
                return "\(customText)+\(normalized)"
            }
        } else {
            return "\(customText)"
        }
    }

    /// 归一化计数步长为单位步长（±1，0 视为 +1）
    func normalizedIncrementUnit() -> Int {
        if !showIncrement { return 0 }
        if incrementValue == 0 { return 1 }
        return incrementValue > 0 ? 1 : -1
    }

    /// 返回用于显示的归一化配置（不写回存储，仅用于预览/渲染）
    func normalizedForDisplay() -> CustomTriggerDisplay {
        var c = self
        if c.showIncrement {
            c.incrementValue = c.normalizedIncrementUnit()
        }
        return c
    }
    
    // 获取颜色
    func getColor() -> Color {
        switch displayColor.lowercased() {
        case "red": return .red
        case "blue": return .blue
        case "green": return .green
        case "yellow": return .yellow
        case "orange": return .orange
        case "purple": return .purple
        case "pink": return .pink
        case "gray": return .gray
        case "black": return .black
        default: return .white
        }
    }

    // 根据当前显示模式获取对应的动画样式
    func getCurrentAnimationStyle() -> TriggerAnimationStyle {
        switch displayMode {
        case .text:
            return animationStyle
        case .image:
            return imageAnimationStyle
        }
    }

    // 设置当前显示模式的动画样式
    mutating func setCurrentAnimationStyle(_ style: TriggerAnimationStyle) {
        switch displayMode {
        case .text:
            animationStyle = style
        case .image:
            imageAnimationStyle = style
        }
    }
}

// MARK: - Sound Configuration
struct SoundConfig: Codable, Equatable {
    let id: SoundID // 永不改变的唯一标识符
    let baseSoundName: String // 基础音频文件名（用于播放）

    var playbackRate: Double = AppConfig.defaultPlaybackRate
    var volume: Double = AppConfig.defaultSoundVolume
    var startTime: TimeInterval = 0.0
    var endTime: TimeInterval? // nil means to the end of the clip

    /// 回溯时长（已移至ImageSettings.backtrackDuration，此字段用于运行时传递配置）
    var backtrackDuration: TimeInterval? = nil

    /// Initialize with ID and baseSoundName
    init(id: SoundID? = nil, baseSoundName: String) {
        self.id = id ?? UUID().uuidString
        self.baseSoundName = baseSoundName
    }



    /// Returns true if the configuration is different from the default settings.
    var isCustomized: Bool {
        return playbackRate != AppConfig.defaultPlaybackRate ||
               volume != AppConfig.defaultSoundVolume ||
               startTime != 0.0 ||
               endTime != nil ||
               backtrackDuration != nil
    }
}

// MARK: - Image Mode Type
public enum ImageModeType: String, CaseIterable, Identifiable, Codable {
    case single = "单图片模式"
    case sequence = "连环画模式"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .single: return "photo"
        case .sequence: return "photo.stack"
        }
    }
}

// MARK: - Image Sequence Navigation
public enum SequenceNavigationMode: String, CaseIterable, Identifiable, Codable {
    case manual = "手动切换"
    case autoNext = "自动下一张"
    case loop = "循环播放"

    public var id: String { self.rawValue }

    var icon: String {
        switch self {
        case .manual: return "hand.tap"
        case .autoNext: return "arrow.right"
        case .loop: return "repeat"
        }
    }
}

// MARK: - Mode Context
struct ModeContext: Codable, Hashable {
    let modeId: String
    let modeType: String // "image", "sound", "combo" etc.

    init(modeId: String, modeType: String = "image") {
        self.modeId = modeId
        self.modeType = modeType
    }

    /// 默认mode上下文（用于向后兼容）
    static let `default` = ModeContext(modeId: "default", modeType: "image")

    /// 生成配置存储键值
    func configKey(for imageName: String) -> String {
        return "mode_\(modeId)_image_\(imageName)"
    }

    /// 从配置键值解析mode上下文
    static func fromConfigKey(_ key: String) -> (context: ModeContext, imageName: String)? {
        // 新格式: "mode_{modeId}_image_{imageName}"
        if key.hasPrefix("mode_") && key.contains("_image_") {
            let components = key.components(separatedBy: "_image_")
            guard components.count == 2 else { return nil }

            let modePrefix = components[0]
            let imageName = components[1]
            let modeId = String(modePrefix.dropFirst(5)) // 去掉 "mode_"

            return (ModeContext(modeId: modeId), imageName)
        }

        // 旧格式: "imageSettings{imageName}" (向后兼容)
        if key.hasPrefix("imageSettings") {
            let imageName = String(key.dropFirst(13)) // 去掉 "imageSettings"
            return (ModeContext.default, imageName)
        }

        return nil
    }
}

// MARK: - Image Settings
struct ImageSettings: Codable {

    // MARK: - CodingKeys for custom decoding
    private enum CodingKeys: String, CodingKey {
        case triggerMode, showClickCount, clickCount, scale, offset
        case customTriggerDisplay, displayName, soundConfigs, soundPlayMode
        case enableBacktrack, backtrackDuration, autoTriggerInterval, shakeThreshold, randomHintEnabled
        case modeType, imageSequence, currentImageIndex, navigationMode, autoSwitchInterval
        case modeContext, configVersion
    }
    var triggerMode: ImageTriggerMode = .tap
    var showClickCount: Bool = false
    var clickCount: Int = 0
    var scale: CGFloat = 1.0
    var offset: CGSize = .zero
    var customTriggerDisplay: CustomTriggerDisplay = CustomTriggerDisplay()
    // 用户可自定义的显示名称（与内部 imageName 分离）
    var displayName: String = ""
    // 每个图片独立的音效配置（使用SoundID作为键）
    var soundConfigs: [SoundID: SoundConfig] = [:]
    // 音效播放模式（每个图片独立配置）
    var soundPlayMode: SoundPlayMode = .sequential
    // 是否启用回溯功能（默认关闭）
    var enableBacktrack: Bool = false
    // 音效回溯时长（秒，nil表示回溯到开头，0表示不回溯）
    var backtrackDuration: TimeInterval? = nil
    // 自动触发时间间隔（秒，仅在自动触发模式下使用）
    var autoTriggerInterval: Double = 2.0
    // 摇晃触发阈值（仅在摇晃触发模式下使用）
    var shakeThreshold: Double = AppConfig.defaultShakeThreshold
    // 表冠旋转触发阈值（仅在表冠旋转触发模式下使用）
    var crownRotationThreshold: Double = AppConfig.defaultCrownRotationThreshold
    // 是否启用随机提示功能
    var randomHintEnabled: Bool = false

    // MARK: - 音效相关便利方法

    /// 添加音效到配置
    mutating func addSound(_ soundID: SoundID, config: SoundConfig) {
        soundConfigs[soundID] = config
    }

    /// 移除音效配置
    mutating func removeSound(_ soundID: SoundID) {
        soundConfigs.removeValue(forKey: soundID)
    }

    /// 获取配置的音效ID列表
    func getConfiguredSoundIDs() -> [SoundID] {
        return Array(soundConfigs.keys)
    }

    /// 检查是否包含某个音效
    func containsSound(_ soundID: SoundID) -> Bool {
        return soundConfigs.keys.contains(soundID)
    }

    /// 获取音效配置
    func getSoundConfig(for soundID: SoundID) -> SoundConfig? {
        return soundConfigs[soundID]
    }

    /// 更新音效配置
    mutating func updateSoundConfig(_ config: SoundConfig) {
        soundConfigs[config.id] = config
    }

    // MARK: - Multi-Image Support (统一图片存储设计)
    // 图片模式类型：单图片 or 连环画
    var modeType: ImageModeType = .single
    // 图片序列（统一存储：单图片模式存储一个元素，连环画模式存储多个元素）
    var imageSequence: [String] = []
    // 当前图片索引（仅在连环画模式下使用）
    var currentImageIndex: Int = 0
    // 序列导航模式
    var navigationMode: SequenceNavigationMode = .manual
    // 自动切换间隔（秒，仅在自动模式下使用）
    var autoSwitchInterval: Double = 3.0

    // MARK: - Mode Context Support (新增Mode隔离支持)
    // 所属的mode上下文（用于配置隔离）
    var modeContext: ModeContext?
    // 配置版本（统一设计版本）
    var configVersion: Int = 3

    init(modeContext: ModeContext? = nil) {
        self.modeContext = modeContext
        // 确保所有字段都有正确的默认值
        self.shakeThreshold = AppConfig.defaultShakeThreshold
    }

    // 自定义解码初始化器，确保向后兼容
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // 解码所有字段，为新字段提供默认值
        triggerMode = try container.decodeIfPresent(ImageTriggerMode.self, forKey: .triggerMode) ?? .tap
        showClickCount = try container.decodeIfPresent(Bool.self, forKey: .showClickCount) ?? false
        clickCount = try container.decodeIfPresent(Int.self, forKey: .clickCount) ?? 0
        scale = try container.decodeIfPresent(CGFloat.self, forKey: .scale) ?? 1.0
        offset = try container.decodeIfPresent(CGSize.self, forKey: .offset) ?? .zero
        customTriggerDisplay = try container.decodeIfPresent(CustomTriggerDisplay.self, forKey: .customTriggerDisplay) ?? CustomTriggerDisplay()
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        soundConfigs = try container.decodeIfPresent([SoundID: SoundConfig].self, forKey: .soundConfigs) ?? [:]
        soundPlayMode = try container.decodeIfPresent(SoundPlayMode.self, forKey: .soundPlayMode) ?? .sequential
        enableBacktrack = try container.decodeIfPresent(Bool.self, forKey: .enableBacktrack) ?? false
        backtrackDuration = try container.decodeIfPresent(TimeInterval?.self, forKey: .backtrackDuration) ?? nil
        autoTriggerInterval = try container.decodeIfPresent(Double.self, forKey: .autoTriggerInterval) ?? 2.0
        shakeThreshold = try container.decodeIfPresent(Double.self, forKey: .shakeThreshold) ?? AppConfig.defaultShakeThreshold // 新字段，提供默认值
        randomHintEnabled = try container.decodeIfPresent(Bool.self, forKey: .randomHintEnabled) ?? false

        // 多图片支持字段
        modeType = try container.decodeIfPresent(ImageModeType.self, forKey: .modeType) ?? .single
        imageSequence = try container.decodeIfPresent([String].self, forKey: .imageSequence) ?? []
        currentImageIndex = try container.decodeIfPresent(Int.self, forKey: .currentImageIndex) ?? 0
        navigationMode = try container.decodeIfPresent(SequenceNavigationMode.self, forKey: .navigationMode) ?? .manual
        autoSwitchInterval = try container.decodeIfPresent(Double.self, forKey: .autoSwitchInterval) ?? 3.0

        // Mode上下文支持字段
        modeContext = try container.decodeIfPresent(ModeContext.self, forKey: .modeContext)
        configVersion = try container.decodeIfPresent(Int.self, forKey: .configVersion) ?? 3
    }

    // MARK: - Multi-Image Helper Methods

    /// 获取当前显示的图片名称（统一设计）
    var currentDisplayImageName: String {
        guard !imageSequence.isEmpty else { return "" }

        if modeType == .sequence {
            let safeIndex = max(0, min(currentImageIndex, imageSequence.count - 1))
            return imageSequence[safeIndex]
        } else {
            // 单图片模式：取第一个元素
            return imageSequence[0]
        }
    }

    /// 是否为多图片模式
    var isMultiImageMode: Bool {
        return modeType == .sequence && imageSequence.count > 1
    }

    /// 获取图片总数
    var imageCount: Int {
        return imageSequence.count
    }

    // MARK: - 便捷方法（统一设计）

    /// 设置单图片模式
    mutating func setSingleImage(_ imageName: String) {
        modeType = .single
        imageSequence = [imageName]
        currentImageIndex = 0
    }

    /// 设置连环画模式
    mutating func setImageSequence(_ images: [String]) {
        modeType = images.count <= 1 ? .single : .sequence
        imageSequence = images
        currentImageIndex = 0
    }

    /// 获取单图片模式的图片名称
    var singleImageName: String? {
        guard modeType == .single, let first = imageSequence.first else { return nil }
        return first
    }

    /// 切换到下一张图片
    mutating func nextImage() -> Bool {
        guard isMultiImageMode else { return false }

        if currentImageIndex < imageSequence.count - 1 {
            currentImageIndex += 1
            return true
        } else if navigationMode == .loop {
            currentImageIndex = 0
            return true
        }
        return false
    }

    /// 切换到上一张图片
    mutating func previousImage() -> Bool {
        guard isMultiImageMode else { return false }

        if currentImageIndex > 0 {
            currentImageIndex -= 1
            return true
        } else if navigationMode == .loop {
            currentImageIndex = imageSequence.count - 1
            return true
        }
        return false
    }

    /// 跳转到指定图片
    mutating func jumpToImage(at index: Int) -> Bool {
        guard isMultiImageMode && index >= 0 && index < imageSequence.count else { return false }
        currentImageIndex = index
        return true
    }
    

} 