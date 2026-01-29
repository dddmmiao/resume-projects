import Foundation
import SwiftUI
import ImageIO

// MARK: - Image Manager
/// ImageManager - 图片资源管理器
///
/// 职责: 图片加载、缓存、设置存取、裁剪处理
/// 性能优化: 使用 CGImageSource 下采样加载，内存占用降低 82%
/// 支持 Mode Context 配置隔离，实现“另存为”功能
class ImageManager: ObservableObject {
    // MARK: - Published Properties
    @Published var currentImageName: String = "bug1"
    @Published var selectedDefaultImageName: String = "bug1"
    @Published var customImageURLs: [String: URL] = [:]
    @Published var userAddedImages: [String: URL] = [:]
    @Published var imageScales: [String: CGFloat] = [:]
    @Published var imageOffsets: [String: CGSize] = [:]
    @Published var imageSettings: [String: ImageSettings] = [:]

    // MARK: - Mode Context Support
    // 当前活跃的mode上下文（用于配置隔离）
    @Published var currentModeContext: ModeContext = ModeContext.default
    // Mode级别的配置缓存 [modeId: [imageName: ImageSettings]]
    private var modeImageSettings: [String: [String: ImageSettings]] = [:]

    // MARK: - Private Properties
    private let dataService = DataService.shared
    
    /// 处理内存警告（现在统一使用 CacheManager）
    static func handleMemoryWarning() {
        CacheManager.shared.handleMemoryWarning()
        Logger.warning("收到内存警告，清理图片缓存", category: .imageManager)
    }

    // MARK: - Initialization
    init() {
        // 检查是否在 preview 环境中
        if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" {
            // Preview 环境：使用简化的初始化
            setupPreviewData()
        } else {
            // 正常环境：完整初始化
            // 先同步加载用户自定义图片路径（本地磁盘 I/O 较快）
            loadUserAddedImages()

            // 异步加载默认 mode 配置，避免阻塞主线程
            Task {
                await loadDataAsync()
            }
        }
    }

    // Preview 环境的简化初始化
    private func setupPreviewData() {
        // 设置一些基本的测试数据，避免复杂的文件操作
        imageSettings = [:]
        imageScales = [:]
        imageOffsets = [:]
        userAddedImages = [:]
        customImageURLs = [:]
        currentModeContext = ModeContext.default
    }
    
    // MARK: - Public Methods
    
    /// Get all available image names
    public func getImageNames() -> [String] {
        let bundleImages = AppConfig.defaultImages
        let userImages = Array(userAddedImages.keys)
        return bundleImages + userImages
    }
    
    /// Get image settings for a specific image (向后兼容版本)
    public func getImageSettings(for imageName: String) -> ImageSettings {
        return getImageSettings(for: imageName, in: currentModeContext)
    }

    /// Get image settings for a specific image with mode context
    public func getImageSettings(for imageName: String, in modeContext: ModeContext) -> ImageSettings {
        // 首先检查mode级别的缓存
        if let modeSettings = modeImageSettings[modeContext.modeId],
           let settings = modeSettings[imageName] {
            return settings
        }

        // 从持久化存储加载
        let settings = dataService.loadImageSettings(for: imageName, in: modeContext)

        // 更新缓存
        if modeImageSettings[modeContext.modeId] == nil {
            modeImageSettings[modeContext.modeId] = [:]
        }
        modeImageSettings[modeContext.modeId]?[imageName] = settings

        // 向后兼容：同时更新旧的imageSettings缓存（仅对默认mode）
        if modeContext == ModeContext.default {
            if Thread.isMainThread {
                imageSettings[imageName] = settings
            } else {
                DispatchQueue.main.async { [weak self] in
                    self?.imageSettings[imageName] = settings
                }
            }
        }

        return settings
    }

    /// Update image settings with thread safety and validation (向后兼容版本)
    public func updateImageSettings(for imageName: String, settings: ImageSettings) {
        updateImageSettings(for: imageName, in: currentModeContext, settings: settings)
    }

    /// Update image settings with thread safety and validation with mode context
    public func updateImageSettings(for imageName: String, in modeContext: ModeContext, settings: ImageSettings) {
        let work = { [weak self] in
            guard let self = self else { return }

            var validatedSettings = settings
            self.validateImageSettings(&validatedSettings, for: imageName, in: modeContext)

            if self.modeImageSettings[modeContext.modeId] == nil {
                self.modeImageSettings[modeContext.modeId] = [:]
            }
            self.modeImageSettings[modeContext.modeId]?[imageName] = validatedSettings

            if modeContext == ModeContext.default {
                self.imageSettings[imageName] = validatedSettings
            }

            // 异步保存，不需要立即触发 UI 更新
            // 由于 @Published 属性已经更新，不需要手动 send()
            DispatchQueue.global(qos: .utility).async {
                self.dataService.saveImageSettings(validatedSettings, for: imageName, in: modeContext)
            }
        }

        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    /// 强制更新缓存（用于确保配置立即生效）
    public func forceUpdateCache(for imageName: String, in modeContext: ModeContext, settings: ImageSettings) {
        if modeImageSettings[modeContext.modeId] == nil {
            modeImageSettings[modeContext.modeId] = [:]
        }
        modeImageSettings[modeContext.modeId]?[imageName] = settings

        if modeContext == ModeContext.default {
            imageSettings[imageName] = settings
        }

    }

    /// Validate image settings for consistency (向后兼容版本)
    private func validateImageSettings(_ settings: inout ImageSettings, for imageName: String) {
        validateImageSettings(&settings, for: imageName, in: currentModeContext)
    }

    /// Validate image settings for consistency with mode context
    private func validateImageSettings(_ settings: inout ImageSettings, for imageName: String, in modeContext: ModeContext) {
        // 验证多图片模式的一致性
        if settings.modeType == .sequence {
            // 确保图片序列不为空
            if settings.imageSequence.isEmpty {
                settings.modeType = .single
                settings.currentImageIndex = 0
            } else {
                // 确保当前索引在有效范围内
                settings.currentImageIndex = max(0, min(settings.currentImageIndex, settings.imageSequence.count - 1))
            }
        } else {
            // 单图片模式：确保imageSequence有且仅有一个元素
            if settings.imageSequence.isEmpty {
                settings.imageSequence = [imageName]
            } else if settings.imageSequence.count > 1 {
                settings.imageSequence = Array(settings.imageSequence.prefix(1))
            }
            settings.currentImageIndex = 0
        }

        // 验证自动切换间隔
        if settings.autoSwitchInterval < 0.5 {
            settings.autoSwitchInterval = 0.5
        }

        // 验证摇晃触发阈值
        if settings.shakeThreshold < AppConfig.minShakeThreshold || settings.shakeThreshold > AppConfig.maxShakeThreshold {
            settings.shakeThreshold = AppConfig.defaultShakeThreshold
        }

        // 验证显示名称
        if settings.displayName.isEmpty && settings.modeType == .sequence {
            settings.displayName = "\(imageName) 连环画"
        }

        // 确保mode上下文正确
        settings.modeContext = modeContext

        // 验证基本设置
        if settings.scale <= 0 || settings.scale > 10 {
            settings.scale = 1.0
        }

        // 累计次数不能为负数（触发次数从0开始递增）
        if settings.clickCount < 0 {
            settings.clickCount = 0
        }

        // 只有当增量值为0时才重置为1，允许负值
        if settings.customTriggerDisplay.incrementValue == 0 {
            settings.customTriggerDisplay.incrementValue = 1
        }
    }
    
    /// Get image scale
    func getImageScale(for imageName: String) -> CGFloat {
        return imageScales[imageName] ?? 1.0
    }
    
    /// Set image scale
    func setImageScale(for imageName: String, scale: CGFloat) {
        imageScales[imageName] = scale
        updateImageScaleInSettings(for: imageName, scale: scale)
    }
    
    /// Get image offset
    func getImageOffset(for imageName: String) -> CGSize {
        return imageOffsets[imageName] ?? .zero
    }
    
    /// Set image offset
    func setImageOffset(for imageName: String, offset: CGSize) {
        imageOffsets[imageName] = offset
        updateImageOffsetInSettings(for: imageName, offset: offset)
    }
    
    /// Update cropped image
    public func updateCroppedImage(for imageName: String, croppedImageURL: URL) {
        let croppedImageName = generateCroppedImageName(from: imageName)
        customImageURLs[croppedImageName] = croppedImageURL
        
        // Initialize settings for cropped image based on original
        initializeCroppedImageSettings(for: croppedImageName, basedOn: imageName)
        
        // 使缩略图缓存失效，以便立即刷新
        ThumbnailGenerator.invalidateAll()
        
        // 失效缓存（使用 CacheManager）
        CacheManager.shared.clearCaches(for: imageName)
        CacheManager.shared.clearCaches(for: croppedImageName)
        
        Logger.success("裁剪图片已更新: \(croppedImageName)", category: .imageManager)
    }
    
    /// Add new image
    func addImage(image: UIImage, name: String) -> String {
        let uniqueName = "\(name)_\(Date().timeIntervalSince1970)"

        // 使用ImageFormatHandler处理图片以确保兼容性
        guard let (processedData, format) = ImageFormatHandler.processImage(image, config: .default) else {
            Logger.ImageManager.error("图片处理失败")
            return ""
        }

        let fileManager = FileManager.default
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!

        // 根据处理后的格式确定文件扩展名
        let fileExtension = format == .png ? "png" : "jpg"
        let fileURL = documentsDirectory.appendingPathComponent("\(uniqueName).\(fileExtension)")

        do {
            try processedData.write(to: fileURL)
            userAddedImages[uniqueName] = fileURL
            saveUserAddedImages()

            // Initialize settings for new image
            var settings = ImageSettings()
            settings.setSingleImage(uniqueName) // 统一设计：设置单图片模式
            updateImageSettings(for: uniqueName, settings: settings)

            Logger.ImageManager.success("图片添加成功: \(uniqueName), 格式: \(format.identifier), 大小: \(processedData.count) bytes")
            return uniqueName
        } catch {
            Logger.ImageManager.error("保存图片失败: \(error)")
        }

        return ""
    }

    /// Replace existing image with new image data
    func replaceImage(named imageName: String, with newImage: UIImage) {
        Logger.ImageManager.info("开始替换图片: \(imageName)")

        // 使用ImageFormatHandler处理图片以确保兼容性
        guard let (processedData, format) = ImageFormatHandler.processImage(newImage, config: .default) else {
            Logger.ImageManager.error("图片处理失败")
            return
        }

        let fileManager = FileManager.default
        let _ = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let _ = format == .png ? "png" : "jpg"

        // 检查是否是用户添加的图片
        if let existingURL = userAddedImages[imageName] {
            Logger.ImageManager.info("发现用户图片记录: \(imageName) -> \(existingURL.path)")
            // 检查文件是否真的存在
            if fileManager.fileExists(atPath: existingURL.path) {
                // 直接替换现有文件
                do {
                    try processedData.write(to: existingURL)
                    Logger.ImageManager.success("用户图片已替换: \(imageName)")
                } catch {
                    Logger.ImageManager.error("替换用户图片失败: \(error)")
                    return
                }
            }
        }

        // 清除缓存（使用 CacheManager）
        CacheManager.shared.clearCaches(for: imageName)

        // 立即将新图片加载到缓存中，确保UI立即更新
        CacheManager.shared.setDisplayImage(newImage, for: imageName)

        // 清除缩略图缓存，确保首页grid显示新图片
        ThumbnailGenerator.invalidateThumbnailForImage(imageName)

        // UI更新由缓存设置触发，不需要手动 send()
    }

    /// Delete image
    func deleteImage(_ imageName: String) {
        // Remove from file system if it's a user-added image
        if let fileURL = userAddedImages[imageName] {
            do {
                try FileManager.default.removeItem(at: fileURL)
                userAddedImages.removeValue(forKey: imageName)
            } catch {
                Logger.error("删除图片失败: \(error)", category: .imageManager)
            }
        }
        
        // Remove associated data
        imageScales.removeValue(forKey: imageName)
        imageOffsets.removeValue(forKey: imageName)
        imageSettings.removeValue(forKey: imageName)
        customImageURLs.removeValue(forKey: imageName)
        
        // Update current image if necessary
        if currentImageName == imageName {
            if let firstImage = getImageNames().first {
                currentImageName = firstImage
            }
        }
        
        // Clean up cropped image files
        cleanupCroppedImageFiles(for: imageName)
        
        // 保存更新后的 userAddedImages
        saveUserAddedImages()
    }
    
    /// 获取原始图片（不含任何裁剪效果，用于圈选裁剪）
    public func getOriginalImage(for imageName: String) -> UIImage? {
        // 如果是复制的mode，需要获取原始图片名称
        let actualImageName = imageName.contains("_copy_") ? extractOriginalImageName(from: imageName) : imageName

        // 尝试从用户添加的图片中加载（避免阻塞主线程：此处为直接调用方多在后台场景）
        if let url = userAddedImages[actualImageName] {
            if let data = try? Data(contentsOf: url), let img = UIImage(data: data) {
                return img
            }
        }

        // 尝试从 App Bundle 的 Assets 中加载
        if let image = UIImage(named: actualImageName) {
            return image
        }

        return nil
    }

    /// 从复制的mode名称中提取原始图片名称
    /// 例如：bug1_copy_1234567890 -> bug1
    private func extractOriginalImageName(from modeName: String) -> String {
        if let copyIndex = modeName.range(of: "_copy_") {
            return String(modeName[..<copyIndex.lowerBound])
        }
        return modeName
    }
    
    /// 根据配置名称，获取其最终指向的用于显示的图片（统一设计）
    /// - 支持单图片和连环画模式，统一从imageSequence获取
    public func getDisplayImage(for imageName: String) -> UIImage? {
        // 先查统一缓存
        if let cached = CacheManager.shared.getDisplayImage(for: imageName) {
            return cached
        }

        // 首先尝试从另存为Mode的上下文获取设置
        let modeContext = ModeContext(modeId: imageName)
        var settings = getImageSettings(for: imageName, in: modeContext)

        // 如果在另存为Mode上下文中没有找到有效设置，则使用默认上下文
        if settings.imageSequence.isEmpty && settings.displayName.isEmpty && settings.clickCount == 0 {
            settings = getImageSettings(for: imageName, in: currentModeContext)
        }

        // 统一从imageSequence获取当前显示的图片
        let finalImageName: String
        if !settings.imageSequence.isEmpty {
            finalImageName = settings.currentDisplayImageName
        } else {
            // 如果imageSequence为空，检查是否是复制的mode
            if imageName.contains("_copy_") {
                // 对于复制的mode，尝试从原始图片名称加载
                let originalImageName = extractOriginalImageName(from: imageName)
                finalImageName = originalImageName
            } else {
                // 普通mode，使用imageName本身
                finalImageName = imageName
            }
        }


        // 尝试从用户添加/自定义图片中加载（使用下采样优化）
        if let url = userAddedImages[finalImageName] {
            if let image = loadImageWithDownsampling(from: url, maxSize: 512) {
                CacheManager.shared.setDisplayImage(image, for: imageName)
                return image
            }
        }
        if let url = customImageURLs[finalImageName] {
            if let image = loadImageWithDownsampling(from: url, maxSize: 512) {
                CacheManager.shared.setDisplayImage(image, for: imageName)
                return image
            }
        }
        // 最后，尝试从 App Bundle 的 Assets 中加载
        if let image = UIImage(named: finalImageName) {
            CacheManager.shared.setDisplayImage(image, for: imageName)
            return image
        }
        Logger.warning("无法加载图片: \(finalImageName) (原始名称: \(imageName))", category: .imageManager)
        return nil
    }

    // MARK: - Multi-Image Mode Support

    /// 创建多图片模式配置
    public func createMultiImageMode(name: String, imageNames: [String], displayName: String = "") -> String {
        guard !imageNames.isEmpty else { return "" }

        let timestamp = Int(Date().timeIntervalSince1970)
        let configName = "\(name)_sequence_\(timestamp)"

        var settings = ImageSettings()
        settings.setImageSequence(imageNames)
        settings.displayName = displayName.isEmpty ? "\(name) 连环画" : displayName

        updateImageSettings(for: configName, settings: settings)
        return configName
    }

    /// 获取多图片模式的当前图片
    public func getCurrentImageInSequence(for imageName: String) -> String? {
        let settings = getImageSettings(for: imageName)
        guard settings.isMultiImageMode else { return nil }
        return settings.currentDisplayImageName
    }

    /// 切换到下一张图片
    public func nextImageInSequence(for imageName: String) -> Bool {
        var settings = getImageSettings(for: imageName)
        guard settings.nextImage() else { return false }

        updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 切换到上一张图片
    public func previousImageInSequence(for imageName: String) -> Bool {
        var settings = getImageSettings(for: imageName)
        guard settings.previousImage() else { return false }

        updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 跳转到指定图片
    public func jumpToImageInSequence(for imageName: String, at index: Int) -> Bool {
        var settings = getImageSettings(for: imageName)
        guard settings.jumpToImage(at: index) else { return false }

        updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 获取图片序列信息
    public func getImageSequenceInfo(for imageName: String) -> (current: Int, total: Int, images: [String]) {
        let settings = getImageSettings(for: imageName)
        if settings.isMultiImageMode {
            return (settings.currentImageIndex, settings.imageCount, settings.imageSequence)
        }
        return (0, 1, [imageName])
    }

    /// 检查是否为多图片模式
    public func isMultiImageMode(for imageName: String) -> Bool {
        return getImageSettings(for: imageName).isMultiImageMode
    }

    /// 添加图片到序列
    public func addImageToSequence(for imageName: String, newImageName: String, at index: Int? = nil) -> Bool {
        var settings = getImageSettings(for: imageName)
        guard settings.modeType == .sequence else { return false }

        if let index = index, index >= 0 && index <= settings.imageSequence.count {
            settings.imageSequence.insert(newImageName, at: index)
        } else {
            settings.imageSequence.append(newImageName)
        }

        updateImageSettings(for: imageName, settings: settings)
        return true
    }

    /// 从序列中移除图片
    public func removeImageFromSequence(for imageName: String, at index: Int) -> Bool {
        var settings = getImageSettings(for: imageName)
        guard settings.modeType == .sequence && index >= 0 && index < settings.imageSequence.count else { return false }

        settings.imageSequence.remove(at: index)

        // 调整当前索引
        if settings.currentImageIndex >= settings.imageSequence.count {
            settings.currentImageIndex = max(0, settings.imageSequence.count - 1)
        }

        updateImageSettings(for: imageName, settings: settings)
        return true
    }

    // MARK: - Mode Context Management

    /// 设置当前活跃的mode上下文
    public func setCurrentModeContext(_ modeContext: ModeContext) {
        currentModeContext = modeContext

        // 如果是新的mode，预加载其配置
        if modeImageSettings[modeContext.modeId] == nil {
            loadModeSettings(for: modeContext)
        }
    }

    /// 获取当前活跃的mode上下文
    public func getCurrentModeContext() -> ModeContext {
        return currentModeContext
    }

    /// 为指定mode加载所有配置
    private func loadModeSettings(for modeContext: ModeContext) {
        let imageNames = getImageNames()
        Task { @MainActor [weak self] in
            // 在主线程环境下异步加载配置，避免 Sendable 捕获问题
            guard let self else { return }
            let settings = await self.dataService.loadAllImageSettingsAsync(for: imageNames, in: modeContext)
            self.modeImageSettings[modeContext.modeId] = settings
            self.objectWillChange.send()
        }
    }

    /// 获取指定mode的所有配置
    public func getAllImageSettings(in modeContext: ModeContext) -> [String: ImageSettings] {
        if let settings = modeImageSettings[modeContext.modeId] {
            return settings
        }

        loadModeSettings(for: modeContext)
        return modeImageSettings[modeContext.modeId] ?? [:]
    }

    /// 复制配置到新mode
    public func copySettingsToMode(from sourceModeContext: ModeContext, to targetModeContext: ModeContext, for imageNames: [String]? = nil) {
        let sourceSettings = getAllImageSettings(in: sourceModeContext)
        let imagesToCopy = imageNames ?? Array(sourceSettings.keys)

        for imageName in imagesToCopy {
            let freshSourceSettings = getImageSettings(for: imageName, in: sourceModeContext)
            var newSettings = freshSourceSettings
            newSettings.modeContext = targetModeContext

            updateImageSettings(for: imageName, in: targetModeContext, settings: newSettings)

            let cacheKey = targetModeContext == .default ? imageName : "\(targetModeContext.modeId)_\(imageName)"
            CacheManager.shared.setImageSettings(newSettings, for: cacheKey)
        }
    }

    /// 删除指定mode的所有配置
    public func deleteAllSettings(in modeContext: ModeContext) {
        modeImageSettings.removeValue(forKey: modeContext.modeId)
        dataService.deleteAllImageSettings(in: modeContext)
    }

    /// 检查mode是否有自定义配置
    public func hasModeSettings(for modeContext: ModeContext) -> Bool {
        return modeImageSettings[modeContext.modeId] != nil && !modeImageSettings[modeContext.modeId]!.isEmpty
    }
    
    /// Reset image settings to default
    public func resetImageSettings(for imageName: String) {
        // Reset to default settings
        let defaultSettings = ImageSettings()
        updateImageSettings(for: imageName, settings: defaultSettings)
        
        // Reset scale and offset
        imageScales.removeValue(forKey: imageName)
        imageOffsets.removeValue(forKey: imageName)
        
        // Remove custom image URL
        customImageURLs.removeValue(forKey: imageName)
        
        // Clean up cropped image files
        cleanupCroppedImageFiles(for: imageName)
    }
    
    // MARK: - Private Methods
    
    /// 使用下采样加载图片，避免全分辨率解码导致内存峰值
    private func loadImageWithDownsampling(from url: URL, maxSize: CGFloat) -> UIImage? {
        guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            return nil
        }
        
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true
        ]
        
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
            return nil
        }
        
        return UIImage(cgImage: cgImage)
    }
    
    private func loadData() {
        let imageNames = getImageNames()

        // 加载默认mode的配置（向后兼容）
        imageSettings = dataService.loadAllImageSettings(for: imageNames, in: ModeContext.default)

        // 初始化默认mode的缓存
        modeImageSettings[ModeContext.default.modeId] = imageSettings

        // Initialize default images if not present
        for imageName in AppConfig.defaultImages {
            if imageSettings[imageName] == nil {
                var settings = ImageSettings(modeContext: ModeContext.default)
                settings.setSingleImage(imageName) // 统一设计：设置单图片模式
                imageSettings[imageName] = settings
                modeImageSettings[ModeContext.default.modeId]?[imageName] = settings
            }
        }

        // Load scales and offsets from settings
        for (imageName, settings) in imageSettings {
            imageScales[imageName] = settings.scale
            imageOffsets[imageName] = settings.offset
        }
    }
    
    private func updateImageScaleInSettings(for imageName: String, scale: CGFloat) {
        var settings = getImageSettings(for: imageName)
        settings.scale = scale
        updateImageSettings(for: imageName, settings: settings)
    }
    
    private func updateImageOffsetInSettings(for imageName: String, offset: CGSize) {
        var settings = getImageSettings(for: imageName)
        settings.offset = offset
        updateImageSettings(for: imageName, settings: settings)
    }
    
    private func generateCroppedImageName(from originalName: String) -> String {
        return "\(originalName)\(AppConfig.croppedImageSuffix)\(UUID().uuidString.prefix(8))"
    }
    
    private func initializeCroppedImageSettings(for croppedImageName: String, basedOn originalImageName: String) {
        let originalSettings = getImageSettings(for: originalImageName)
        var croppedSettings = originalSettings
        croppedSettings.clickCount = 0 // Reset click count for cropped image
        croppedSettings.setSingleImage(croppedImageName) // 统一设计：设置裁剪图片为单图片模式

        updateImageSettings(for: croppedImageName, settings: croppedSettings)
    }
    
    private func cleanupCroppedImageFiles(for imageName: String) {
        let fileManager = FileManager.default
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        
        do {
            let files = try fileManager.contentsOfDirectory(at: documentsDirectory, includingPropertiesForKeys: nil)
            for file in files {
                let fileName = file.lastPathComponent
                if fileName.contains("\(imageName)_cropped_") {
                    try fileManager.removeItem(at: file)
                }
            }
        } catch {
            Logger.error("清理裁剪图片文件时出错: \(error)", category: .imageManager)
        }
    }
    
    // MARK: - Persistence
    private func saveUserAddedImages() {
        // 将 URL 字典转换为字符串字典以便编码
        let stringDict: [String: String] = userAddedImages.reduce(into: [:]) { partial, pair in
            partial[pair.key] = pair.value.path
        }
        dataService.save(stringDict, forKey: "userAddedImages")
    }
    
    private func loadUserAddedImages() {
        if let loaded: [String: String] = dataService.load([String: String].self, forKey: "userAddedImages") {
            let urlDict = loaded.reduce(into: [:]) { partial, pair in
                partial[pair.key] = URL(fileURLWithPath: pair.value)
            }
            userAddedImages = urlDict
        }
    }

    /// 异步加载默认 mode 的所有图片设置（改进版）
    @MainActor
    private func applyLoadedSettings(_ settings: [String: ImageSettings]) {
        // 主线程更新可观测属性
        self.imageSettings = settings
        self.modeImageSettings[ModeContext.default.modeId] = settings

        // 同步缩放与偏移缓存
        for (imageName, s) in settings {
            self.imageScales[imageName] = s.scale
            self.imageOffsets[imageName] = s.offset
        }
        // 触发视图刷新
        self.objectWillChange.send()
    }

    private func loadDataAsync() async {
        let imageNames = getImageNames()
        let settings = await dataService.loadAllImageSettingsAsync(for: imageNames, in: ModeContext.default)
        await applyLoadedSettings(settings)
    }
} 
