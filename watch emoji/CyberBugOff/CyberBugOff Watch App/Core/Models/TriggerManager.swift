import Foundation
import SwiftUI
import CoreMotion
import ImageIO

// MARK: - Trigger Manager
class TriggerManager: ObservableObject {
    // MARK: - Published Properties
    @Published var customTriggerDisplays: [ImageID: CustomTriggerDisplay] = [:]


    
    // MARK: - Private Properties
    private let dataService = DataService.shared
    private var colorIndices: [String: Int] = [:]

    // MARK: - ID Mapping Support
    /// ImageManager引用，用于ID-name转换
    private weak var imageManager: ImageManager?

    /// 设置ImageManager引用（用于ID-name转换）
    func setImageManager(_ imageManager: ImageManager) {
        self.imageManager = imageManager
    }
    // 分层临时：颜色选择的临时缓冲（父层关闭时统一保存）
    private var stagedSelectedColors: [String: Set<String>] = [:]
    
    // 预加载任务跟踪，防止重复预加载
    private var preloadingTasks: Set<String> = []
    private let preloadQueue = DispatchQueue(label: "toast.preload", qos: .utility)
    
    // MARK: - Initialization
    init() {
        // 检查是否在 preview 环境中
        if ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" {
            // Preview 环境：使用简化的初始化
            setupPreviewData()
        } else {
            // 正常环境：完整初始化
            loadData()
        }
    }

    // Preview 环境的简化初始化
    private func setupPreviewData() {
        // 设置一些基本的测试数据
        customTriggerDisplays = [:]
        preloadingTasks = []
        // 注意：toastImageCache 是静态的 NSCache，不需要在这里初始化
    }
    
    // MARK: - Public Methods (ID-based)

    /// Get custom trigger display configuration for image by ID
    public func getCustomTriggerDisplay(for imageID: ImageID) -> CustomTriggerDisplay {
        return PerformanceMonitor.measure(label: "ImageID Lookup") {
            var config = customTriggerDisplays[imageID] ?? CustomTriggerDisplay()

            // 一致化：当需要显示计数时，计数值强制归一到 ±1（0 视为 +1）
            if config.showIncrement {
                config.incrementValue = clampIncrementToUnit(config.incrementValue)
            }

            return config
        } ?? CustomTriggerDisplay()
    }

    /// Set custom trigger display configuration for image by ID
    func setCustomTriggerDisplay(for imageID: ImageID, config: CustomTriggerDisplay) {

        // 获取现有配置
        var existingConfig = getCustomTriggerDisplay(for: imageID)

        // 根据新配置的显示模式，只更新对应模式的设置
        switch config.displayMode {
        case .text:
            // 文字模式：更新文字相关设置
            existingConfig.displayMode = .text
            existingConfig.customText = config.customText
            existingConfig.displayColor = config.displayColor
            existingConfig.fontSize = config.fontSize
            existingConfig.showIncrement = config.showIncrement
            // 计数值：统一收敛到 ±1（0 视为 +1），确保随机/自定义一致
            existingConfig.incrementValue = clampIncrementToUnit(config.incrementValue)
            existingConfig.animationStyle = config.animationStyle
            existingConfig.emoji = config.emoji

        case .image:
            // 图片模式：更新图片相关设置（补齐所有图片相关字段，确保预览/裁剪一致）
            existingConfig.displayMode = .image
            // 主图圈选/变换
            existingConfig.mainCircleSelectionData = config.mainCircleSelectionData
            existingConfig.mainImageScale = config.mainImageScale
            existingConfig.mainImageOffset = config.mainImageOffset
            // 自定义Toast图片圈选/变换
            existingConfig.circleSelectionData = config.circleSelectionData
            existingConfig.customImageScale = config.customImageScale
            existingConfig.customImageOffset = config.customImageOffset
            // 自定义图片来源与显示参数
            existingConfig.customImageURL = config.customImageURL
            existingConfig.imageSize = config.imageSize
            existingConfig.imageOpacity = config.imageOpacity
            existingConfig.imageContentMode = config.imageContentMode
            existingConfig.imageAnimationStyle = config.imageAnimationStyle
            // 传统裁剪数据（如有）
            existingConfig.customCropRect = config.customCropRect
            existingConfig.customCropPath = config.customCropPath
            // 动画样式（历史字段，保持兼容）
            existingConfig.animationStyle = config.animationStyle
        }

        // 采用整体赋值以确保 @Published 触发变更
        var updatedDict = customTriggerDisplays
        updatedDict[imageID] = existingConfig
        customTriggerDisplays = updatedDict
        dataService.saveCustomTriggerDisplays(customTriggerDisplays)
    }

    // MARK: - Helpers
    /// 将任意整型增量值收敛到单位步长：±1（0 归一为 +1）
    private func clampIncrementToUnit(_ value: Int) -> Int {
        if value == 0 { return 1 }
        return value > 0 ? 1 : -1
    }

    /// 更新mode图片的圈选数据（不影响displayMode）
    func updateModeImageCircleSelection(for imageID: ImageID,
                                       data: CircleSelectionData?,
                                       scale: CGFloat?,
                                       offset: CGSize?) {

        var existingConfig = getCustomTriggerDisplay(for: imageID)
        existingConfig.mainCircleSelectionData = data
        if let scale = scale {
            existingConfig.mainImageScale = scale
        }
        if let offset = offset {
            existingConfig.mainImageOffset = offset
        }

        // 采用整体赋值以确保 @Published 触发变更
        var updatedDict2 = customTriggerDisplays
        updatedDict2[imageID] = existingConfig
        customTriggerDisplays = updatedDict2
        dataService.saveCustomTriggerDisplays(customTriggerDisplays)
    }

    /// 更新toast自定义图片的圈选数据（不影响displayMode）
    func updateToastCircleSelection(for imageID: ImageID,
                                   data: CircleSelectionData?,
                                   scale: CGFloat?,
                                   offset: CGSize?) {

        var existingConfig = getCustomTriggerDisplay(for: imageID)
        existingConfig.circleSelectionData = data
        if let scale = scale {
            existingConfig.customImageScale = scale
        }
        if let offset = offset {
            existingConfig.customImageOffset = offset
        }

        customTriggerDisplays[imageID] = existingConfig
        dataService.saveCustomTriggerDisplays(customTriggerDisplays)
    }

    // MARK: - Legacy Methods (Deprecated - 兼容性方法)

    /// 检查指定mode的配置是否已缓存
    func isConfigurationCached(for imageName: String) -> Bool {
        return customTriggerDisplays[imageName] != nil
    }
    


    // MARK: - 分层临时：颜色选择
    func stageSelectedColors(_ colors: Set<String>, for imageName: String) {
        stagedSelectedColors[imageName] = colors
        // 不立即写盘
    }

    func drainStagedSelectedColors(for imageName: String) -> Set<String>? {
        defer { stagedSelectedColors[imageName] = nil }
        return stagedSelectedColors[imageName]
    }

    /// 显式清除主图圈选数据（用于从圈选切换为传统裁剪时）
    func clearMainCircleSelection(for imageName: String) {
        var existingConfig = getCustomTriggerDisplay(for: imageName)
        existingConfig.mainCircleSelectionData = nil
        existingConfig.mainImageScale = 1.0
        existingConfig.mainImageOffset = .zero

        if Thread.isMainThread {
            customTriggerDisplays[imageName] = existingConfig
        } else {
            DispatchQueue.main.async {
                self.customTriggerDisplays[imageName] = existingConfig
            }
        }
        // 分层临时：不在子层即时写盘，由父层统一落盘

        // 通知相关视图更新圈选缓存
        NotificationCenter.default.post(
            name: NSNotification.Name("CircleSelectionUpdated"),
            object: nil,
            userInfo: ["imageName": imageName]
        )

    }
    
    /// Check if custom trigger display is enabled for image
    /// 现在默认总是启用自定义显示
    func isCustomTriggerDisplayEnabled(for imageName: String) -> Bool {
        return true  // 总是启用自定义显示
    }
    
    /// Get custom trigger display text for image
    func getCustomTriggerText(for imageName: String, currentCount: Int) -> String {
        let config = getCustomTriggerDisplay(for: imageName)
        return config.getDisplayText(currentCount: currentCount)
    }
    
    /// 应用圈选裁剪到全屏图片（公共方法，供FullScreenImageView使用）
    public func applyCircleSelectionToFullscreen(_ image: UIImage, selectionData: CircleSelectionData, scale: CGFloat, offset: CGSize) -> UIImage? {
        let optimizedPoints = selectionData.pathPoints
        
        // 检查优化后的点数是否足够
        if optimizedPoints.count >= 3 {
            let optimizedSelectionData = CircleSelectionData(pathPoints: optimizedPoints)
            if let croppedImage = applyCircleSelectionToImage(image, selectionData: optimizedSelectionData, scale: scale, offset: offset) {
                Logger.success("全屏视图圈选裁剪成功", category: .triggerManager)
                return croppedImage
            } else {
                Logger.warning("全屏视图圈选裁剪失败，使用原图", category: .triggerManager)
                return image
            }
        } else {
            Logger.warning("优化后点数不足(\(optimizedPoints.count))，使用原图", category: .triggerManager)
            return image
        }
    }
    
    /// 刷新指定图片的Toast缓存（使用 CacheManager）
    public func refreshToastImageCache(for imageName: String) {
        // 清除统一缓存管理器中的图片缓存
        CacheManager.shared.clearCaches(for: imageName)

        // 发送通知，让Toast视图重新加载图片
        NotificationCenter.default.post(name: NSNotification.Name("ToastImageCacheCleared"), object: nil)

        // 预加载新的Toast图片
        preloadCustomDisplayImage(for: imageName)
    }

    /// Get custom display image for toast (独立于全屏视图的图片)
    func getCustomDisplayImage(for imageName: String) -> UIImage? {
        let config = getCustomTriggerDisplay(for: imageName)

        // 仅在图片模式下才生成Toast图片
        if config.displayMode != .image {
            return nil
        }
        
        // 生成缓存键
        let cacheKey = generateToastImageCacheKey(for: imageName, config: config)
        
        // 先检查统一缓存
        if let cachedImage = CacheManager.shared.getToastImage(for: cacheKey) {
            return cachedImage
        }
        
        // 如果有自定义裁剪的图片URL，优先使用（传统模式）
        if let urlString = config.customImageURL {
            // 创建文件URL（支持文件路径）
            let url: URL
            if urlString.hasPrefix("file://") {
                guard let parsedURL = URL(string: urlString) else {
                    Logger.error("无法解析自定义图片URL: \(urlString)", category: .triggerManager)
                    return nil
                }
                url = parsedURL
            } else {
                url = URL(fileURLWithPath: urlString)
            }

            if let image = loadImageWithDownsampling(from: url, maxSize: 512) {
                var finalImage = image
                if let selectionData = config.circleSelectionData {
                    if let croppedImage = applyCircleSelectionToImage(
                        image,
                        selectionData: selectionData,
                        scale: config.customImageScale,
                        offset: config.customImageOffset
                    ) {
                        finalImage = croppedImage
                    } else {
                        Logger.warning("自定义图片圈选裁剪失败，使用原图", category: .triggerManager)
                    }
                }

                // Apply toast-specific compression for performance
                let compressedImage = ImageCompressionUtils.compressForToast(finalImage) ?? finalImage
                // 缓存结果到统一缓存管理器
                CacheManager.shared.setToastImage(compressedImage, for: cacheKey)
                return compressedImage
            } else {
                Logger.error("无法从数据创建UIImage", category: .triggerManager)
            }
        }

        // 获取原始图片
        guard let originalImage = getOriginalImage(for: imageName) else {
            Logger.error("无法获取原始图片: \(imageName)", category: .triggerManager)
            return nil
        }

        var finalImage: UIImage = originalImage

        // 如果有圈选数据，应用路径裁剪（优化处理）
        if let selectionData = config.circleSelectionData {
            let optimizedPoints = selectionData.pathPoints
            
            if optimizedPoints.count >= 3 {
                let optimizedSelectionData = CircleSelectionData(pathPoints: optimizedPoints)
                if let croppedImage = applyCircleSelectionToImage(originalImage, selectionData: optimizedSelectionData, scale: config.customImageScale, offset: config.customImageOffset) {
                    finalImage = croppedImage
                } else {
                    Logger.warning("圈选裁剪失败，使用原图", category: .triggerManager)
                    finalImage = originalImage
                }
            } else {
                Logger.warning("优化后点数不足(\(optimizedPoints.count))，使用原图", category: .triggerManager)
                finalImage = originalImage
            }
        }
        else if let cropRect = config.customCropRect {
            finalImage = applyCropToImage(originalImage, cropRect: cropRect, scale: config.customImageScale, offset: config.customImageOffset) ?? originalImage
        }

        // Apply toast-specific compression for optimal performance
        let compressedImage = ImageCompressionUtils.compressForToast(finalImage) ?? finalImage
        
        if compressedImage.size.width > 0 && compressedImage.size.height > 0 {
            let imageData = compressedImage.pngData()
            let cost = imageData?.count ?? 0
            CacheManager.shared.setToastImage(compressedImage, for: cacheKey, cost: cost)
            return compressedImage
        } else {
            Logger.warning("压缩后图片无效，返回原图", category: .triggerManager)
            return finalImage
        }
    }
    
    /// 生成Toast图片缓存键
    private func generateToastImageCacheKey(for imageName: String, config: CustomTriggerDisplay) -> String {
        var key = imageName
        
        // 包含圈选数据的哈希
        if let selectionData = config.circleSelectionData {
            let pointsHash = selectionData.pathPoints.reduce(0) { result, point in
                result ^ point.x.hashValue ^ point.y.hashValue
            }
            key += "_circle_\(pointsHash)"
        }
        
        // 包含裁剪矩形
        if let cropRect = config.customCropRect {
            key += "_crop_\(cropRect.origin.x)_\(cropRect.origin.y)_\(cropRect.width)_\(cropRect.height)"
        }
        
        // 包含缩放和偏移
        key += "_scale_\(config.customImageScale)"
        key += "_offset_\(config.customImageOffset.width)_\(config.customImageOffset.height)"
        
        return key
    }

    /// 使用下采样加载图片，避免全分辨率解码导致内存峰值
    private func loadImageWithDownsampling(from url: URL, maxSize: CGFloat = 512) -> UIImage? {
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
    
    /// Get original image without any cropping effects
    private func getOriginalImage(for imageName: String) -> UIImage? {
        let actualImageName = resolveActualImageName(for: imageName)

        // 首先尝试从 DataService 获取用户添加的图片路径（使用下采样）
        if let userAddedImages = dataService.loadUserAddedImages(),
           let url = userAddedImages[actualImageName] {
            if let image = loadImageWithDownsampling(from: url, maxSize: 512) {
                return image
            }
        }

        // 然后尝试从 App Bundle 加载
        if let bundleImage = UIImage(named: actualImageName) {
            return bundleImage
        }

        Logger.error("无法加载图片: \(actualImageName) (原始名称: \(imageName))", category: .triggerManager)
        return nil
    }

    /// 解析实际的图片名称（处理复制mode和图片序列）
    private func resolveActualImageName(for imageName: String) -> String {
        // 如果是复制的mode，需要从其配置中获取实际的图片名称
        if imageName.contains("_copy_") {
            let modeContext = ModeContext(modeId: imageName)
            let settings = dataService.loadImageSettings(for: imageName, in: modeContext)

            // 从图片序列中获取实际的图片名称
            if !settings.imageSequence.isEmpty {
                return settings.currentDisplayImageName
            } else {
                // 如果没有图片序列，从mode名称中提取原始图片名称
                return extractOriginalImageName(from: imageName)
            }
        }

        return imageName
    }

    /// 从复制mode名称中提取原始图片名称
    private func extractOriginalImageName(from modeName: String) -> String {
        if let copyIndex = modeName.range(of: "_copy_") {
            return String(modeName[..<copyIndex.lowerBound])
        }
        return modeName
    }

    /// Apply crop configuration to image
    private func applyCropToImage(_ image: UIImage, cropRect: CGRect, scale: CGFloat, offset: CGSize) -> UIImage? {
        let imageSize = image.size

        // 将相对坐标转换为绝对坐标
        let absoluteCropRect = CGRect(
            x: cropRect.origin.x * imageSize.width,
            y: cropRect.origin.y * imageSize.height,
            width: cropRect.size.width * imageSize.width,
            height: cropRect.size.height * imageSize.height
        )

        // 确保裁剪区域在图片范围内
        let clampedCropRect = absoluteCropRect.intersection(CGRect(origin: .zero, size: imageSize))

        guard !clampedCropRect.isEmpty else {
            return image
        }

        // 执行裁剪
        guard let cgImage = image.cgImage,
              let croppedCGImage = cgImage.cropping(to: clampedCropRect) else {
            return image
        }

        return UIImage(cgImage: croppedCGImage)
    }

    /// Apply circle selection to image using path mask
    private func applyCircleSelectionToImage(_ image: UIImage, selectionData: CircleSelectionData, scale: CGFloat, offset: CGSize) -> UIImage? {
        let imageSize = image.size

        // 获取屏幕尺寸用于坐标转换
        let screenSize = AppTheme.screenSize

        // 计算图片在屏幕上的实际显示尺寸和位置
        // 使用与SimpleImageEditorView相同的.scaledToFill()逻辑
        let imageAspectRatio = imageSize.width / imageSize.height
        let screenAspectRatio = screenSize.width / screenSize.height

        // 计算.scaledToFill()后的尺寸
        var fillWidth: CGFloat
        var fillHeight: CGFloat

        if imageAspectRatio > screenAspectRatio {
            // 图片比屏幕更宽，高度会匹配屏幕
            fillHeight = screenSize.height
            fillWidth = fillHeight * imageAspectRatio
        } else {
            // 图片比屏幕更高，宽度会匹配屏幕
            fillWidth = screenSize.width
            fillHeight = fillWidth / imageAspectRatio
        }

        // 然后应用用户的缩放比例
        let scaledWidth = fillWidth * scale
        let scaledHeight = fillHeight * scale

        // 计算图片在屏幕上的显示区域（考虑偏移）
        let displayRect = CGRect(
            x: (screenSize.width - scaledWidth) / 2 + offset.width,
            y: (screenSize.height - scaledHeight) / 2 + offset.height,
            width: scaledWidth,
            height: scaledHeight
        )


        // 将相对坐标转换为图片坐标
        let absolutePathPoints = selectionData.pathPoints.map { relativePoint in
            // 先转换为屏幕坐标
            let screenPoint = CGPoint(
                x: relativePoint.x * screenSize.width,
                y: relativePoint.y * screenSize.height
            )

            // 转换为相对于图片显示区域的坐标
            let imageRelativePoint = CGPoint(
                x: (screenPoint.x - displayRect.minX) / displayRect.width,
                y: (screenPoint.y - displayRect.minY) / displayRect.height
            )

            // 最后转换为图片像素坐标
            let imagePixelPoint = CGPoint(
                x: imageRelativePoint.x * imageSize.width,
                y: imageRelativePoint.y * imageSize.height
            )



            return imagePixelPoint
        }


        // 创建路径遮罩，保持原图尺寸
        guard let maskedImage = createMaskedImageWithOriginalSize(image: image, pathPoints: absolutePathPoints) else {
            return image
        }

        // 新增：根据圈选边界裁剪图像，移除多余空白区域，使预览大小与圈选时一致
        if let croppedToBounds = cropImage(maskedImage, toPathPoints: absolutePathPoints) {
            Logger.success("根据圈选边界裁剪成功，最终尺寸: \(croppedToBounds.size)", category: .imageManager)
            return croppedToBounds
        }

        return maskedImage
    }

    /// 根据路径点裁剪图像到最小边界矩形
    private func cropImage(_ image: UIImage, toPathPoints pathPoints: [CGPoint]) -> UIImage? {
        guard let cgImage = image.cgImage else { return nil }

        guard let minX = pathPoints.map({ $0.x }).min(),
              let maxX = pathPoints.map({ $0.x }).max(),
              let minY = pathPoints.map({ $0.y }).min(),
              let maxY = pathPoints.map({ $0.y }).max() else {
            return nil
        }

        // 计算裁剪矩形并确保在图像范围内
        let imageWidth = CGFloat(cgImage.width)
        let imageHeight = CGFloat(cgImage.height)

        // 添加边距以保持边缘的平滑性
        let padding: CGFloat = 10.0  // 增加边距，确保平滑边缘不会被裁剪掉
        
        let originX = max(0, floor(minX) - padding)
        let originY = max(0, floor(minY) - padding)
        let width = min(imageWidth - originX, ceil(maxX) - floor(minX) + padding * 2)
        let height = min(imageHeight - originY, ceil(maxY) - floor(minY) + padding * 2)

        // 防止异常尺寸
        guard width > 1, height > 1 else { return nil }

        let cropRect = CGRect(x: originX, y: originY, width: width, height: height)

        guard let croppedCG = cgImage.cropping(to: cropRect) else { return nil }
        return UIImage(cgImage: croppedCG)
    }

    /// Create masked image using path points while preserving original size
    private func createMaskedImageWithOriginalSize(image: UIImage, pathPoints: [CGPoint]) -> UIImage? {
        guard !pathPoints.isEmpty else {
            Logger.warning("圈选路径为空，返回原图", category: .imageManager)
            return image
        }


        let imageSize = image.size
        guard let cgImage = image.cgImage else {
            Logger.error("无法获取CGImage", category: .imageManager)
            return image
        }

        // 创建透明背景的图形上下文，保持原图尺寸
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: Int(imageSize.width),
            height: Int(imageSize.height),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            Logger.error("无法创建透明图形上下文", category: .imageManager)
            return image
        }

        // 修正坐标系：Core Graphics的Y轴与屏幕坐标系相反，需要翻转Y坐标
        let flippedPathPoints = pathPoints.map { point in
            CGPoint(x: point.x, y: imageSize.height - point.y)
        }


        // 创建平滑的贝塞尔曲线路径，而不是直接连接点
        let path = CGMutablePath()
        guard flippedPathPoints.count > 0 else {
            Logger.error("翻转后路径点为空", category: .imageManager)
            return image
        }

        // 先简化路径点（减少计算量，但保留更多细节）
        let simplifiedPoints = simplifyPath(flippedPathPoints, tolerance: 3.0)
        
        // 创建平滑的贝塞尔曲线路径
        path.move(to: simplifiedPoints[0])
        
        if simplifiedPoints.count > 2 {
            // 使用三次贝塞尔曲线连接点，增强平滑度
            for i in 0..<simplifiedPoints.count {
                let current = simplifiedPoints[i]
                let next = simplifiedPoints[(i + 1) % simplifiedPoints.count]
                
                // 计算控制点（使用前后点计算切线）
                let prev = simplifiedPoints[(i + simplifiedPoints.count - 1) % simplifiedPoints.count]
                
                // 计算切线向量
                let tangent1 = CGPoint(
                    x: (next.x - prev.x) * 0.3,  // 使用0.3作为张力系数
                    y: (next.y - prev.y) * 0.3
                )
                
                let tangent2 = CGPoint(
                    x: (simplifiedPoints[(i + 2) % simplifiedPoints.count].x - current.x) * 0.3,
                    y: (simplifiedPoints[(i + 2) % simplifiedPoints.count].y - current.y) * 0.3
                )
                
                // 计算控制点
                let control1 = CGPoint(
                    x: current.x + tangent1.x,
                    y: current.y + tangent1.y
                )
                
                let control2 = CGPoint(
                    x: next.x - tangent2.x,
                    y: next.y - tangent2.y
                )
                
                // 添加三次贝塞尔曲线
                path.addCurve(to: next, control1: control1, control2: control2)
            }
        } else {
            // 点数太少，直接连线
            for i in 1..<simplifiedPoints.count {
                path.addLine(to: simplifiedPoints[i])
            }
        }
        
        // 封闭路径
        path.closeSubpath()

        // 检查路径是否有效
        let pathBounds = path.boundingBox

        if pathBounds.isEmpty || pathBounds.width < 1 || pathBounds.height < 1 {
            Logger.warning("路径边界无效，返回原图", category: .imageManager)
            return image
        }

        // 设置裁剪路径并绘制图片
        context.addPath(path)
        context.clip()

        // 绘制原始图片，保持原始尺寸和位置
        context.draw(cgImage, in: CGRect(origin: .zero, size: imageSize))

        // 获取裁剪后的图片
        guard let resultCGImage = context.makeImage() else {
            Logger.error("圈选遮罩创建失败", category: .imageManager)
            return image
        }

        let result = UIImage(cgImage: resultCGImage)
        Logger.success("圈选遮罩创建成功，结果尺寸: \(result.size)", category: .imageManager)
        return result
    }
    
    /// 简化路径点（Douglas-Peucker算法的简化版本）
    private func simplifyPath(_ points: [CGPoint], tolerance: Double) -> [CGPoint] {
        guard points.count > 2 else { return points }

        var simplified: [CGPoint] = [points[0]]

        for i in 1..<points.count-1 {
            let current = points[i]
            let last = simplified.last!

            // 计算距离，如果距离大于阈值则保留点
            let distance = sqrt(pow(current.x - last.x, 2) + pow(current.y - last.y, 2))
            if distance > tolerance {
                simplified.append(current)
            }
        }

        // 总是保留最后一个点
        simplified.append(points.last!)

        return simplified
    }

    /// Create masked image using path points (legacy method)
    private func createMaskedImage(image: UIImage, pathPoints: [CGPoint]) -> UIImage? {
        guard !pathPoints.isEmpty else { 
            Logger.warning("圈选路径为空，返回原图", category: .imageManager)
            return image 
        }
        

        let imageSize = image.size
        guard let cgImage = image.cgImage else {
            Logger.error("无法获取CGImage", category: .imageManager)
            return image
        }

        // 创建透明背景的图形上下文
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: Int(imageSize.width),
            height: Int(imageSize.height),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            Logger.error("无法创建透明图形上下文", category: .imageManager)
            return image
        }

        // 创建路径
        let path = CGMutablePath()
        path.move(to: pathPoints[0])
        for i in 1..<pathPoints.count {
            path.addLine(to: pathPoints[i])
        }
        path.closeSubpath()
        
        // 检查路径是否有效
        let pathBounds = path.boundingBox
        
        if pathBounds.isEmpty || pathBounds.width < 1 || pathBounds.height < 1 {
            Logger.warning("路径边界无效，返回原图", category: .imageManager)
            return image
        }

        // 设置裁剪路径并绘制图片
        context.addPath(path)
        context.clip()
        
        // 绘制原始图片，只有路径内的区域会被绘制，其他区域保持透明
        context.draw(cgImage, in: CGRect(origin: .zero, size: imageSize))

        // 获取裁剪后的图片
        guard let resultCGImage = context.makeImage() else {
            Logger.error("圈选遮罩创建失败", category: .imageManager)
            return image
        }
        
        let result = UIImage(cgImage: resultCGImage)
        Logger.success("圈选遮罩创建成功，结果尺寸: \(result.size)", category: .imageManager)
        return result
    }

    /// Get custom trigger display color for image
    func getCustomTriggerColor(for imageName: String) -> Color {
        let config = getCustomTriggerDisplay(for: imageName)
        
        // Handle rainbow color mode
        if config.displayColor == "rainbow" {
            return getRainbowColor()
        }
        
        // Handle multi-color mode
        let selectedColors = dataService.loadSelectedColors(for: imageName)
        if selectedColors.count > 1 {
            return getRotatingColor(for: imageName, from: selectedColors)
        }
        
        // Single color mode
        return AppTheme.getColor(fromName: config.displayColor)
    }
    
    /// Trigger image interaction
    func triggerImage(for imageName: String,
                     imageManager: ImageManager,
                     soundManager: SoundManager,
                     bugOffModel: BugOffModel? = nil) {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        // Increment trigger count (always +1, regardless of increment value)
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.clickCount += 1
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)

        // 多图片模式：为当前显示的图片播放音效
        let targetImageName: String
        if settings.isMultiImageMode {
            targetImageName = settings.currentDisplayImageName
        } else {
            targetImageName = imageName
        }

        // 播放音效
        playImageSound(for: targetImageName, soundManager: soundManager, imageManager: imageManager, bugOffModel: bugOffModel)
    }

    /// Trigger image interaction with custom increment value (for random hints)
    func triggerImageWithCustomIncrement(for imageName: String,
                                       incrementValue: Int,
                                       imageManager: ImageManager,
                                       soundManager: SoundManager,
                                       bugOffModel: BugOffModel? = nil) {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        // Increment trigger count (always +1, regardless of increment value)
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.clickCount += 1
        imageManager.updateImageSettings(for: imageName, in: modeContext, settings: settings)

        // 多图片模式：为当前显示的图片播放音效
        let targetImageName: String
        if settings.isMultiImageMode {
            targetImageName = settings.currentDisplayImageName
        } else {
            targetImageName = imageName
        }

        // 播放音效
        playImageSound(for: targetImageName, soundManager: soundManager, imageManager: imageManager, bugOffModel: bugOffModel)
    }

    /// 播放图片关联的音效（提取的公共方法）
    private func playImageSound(for imageName: String, soundManager: SoundManager, imageManager: ImageManager, bugOffModel: BugOffModel? = nil) {
        // Play associated sounds using image-specific configurations
        let names = soundManager.getSoundNames(for: imageName)
        if !names.isEmpty {
            // 优先使用BugOffModel的优化方法，确保获取最新配置
            if let model = bugOffModel {
                model.playMultiSounds(names: names, for: imageName)
            } else {
                soundManager.playMultiSounds(names: names, for: imageName, imageManager: imageManager)
            }
        }
    }
    
    /// Get current trigger count for image
    public func getCurrentTriggerCount(for imageName: String, imageManager: ImageManager) -> Int {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        return imageManager.getImageSettings(for: imageName, in: modeContext).clickCount
    }

    /// Reset trigger count for image
    public func resetTriggerCount(for imageName: String, imageManager: ImageManager) {
        // 确定正确的上下文（Mode隔离）
        let modeContext: ModeContext = imageName.contains("_copy_") ? ModeContext(modeId: imageName) : imageManager.getCurrentModeContext()

        // 分层临时：仅更新缓存，由父层统一落盘
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.clickCount = 0
        imageManager.forceUpdateCache(for: imageName, in: modeContext, settings: settings)

        // 同步内部颜色轮播索引
        resetColorIndex(for: imageName)
    }
    
    /// Get trigger mode for image
    public func getTriggerMode(for imageName: String, imageManager: ImageManager) -> ImageTriggerMode {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        return imageManager.getImageSettings(for: imageName, in: modeContext).triggerMode
    }
    
    /// Set trigger mode for image
    public func setTriggerMode(for imageName: String, mode: ImageTriggerMode, imageManager: ImageManager) {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.triggerMode = mode
        // 分层临时：不立即写盘，交由父层统一保存
        imageManager.forceUpdateCache(for: imageName, in: modeContext, settings: settings)
    }
    
    /// Check if click count should be shown for image
    public func shouldShowClickCount(for imageName: String, imageManager: ImageManager) -> Bool {
        // 确定正确的上下文
        let modeContext: ModeContext
        if imageName.contains("_copy_") {
            modeContext = ModeContext(modeId: imageName)
        } else {
            modeContext = imageManager.getCurrentModeContext()
        }

        return imageManager.getImageSettings(for: imageName, in: modeContext).showClickCount
    }
    
    /// Set whether to show click count for image
    public func setShowClickCount(for imageName: String, show: Bool, imageManager: ImageManager) {
        // 确定正确的上下文（Mode隔离）
        let modeContext: ModeContext = imageName.contains("_copy_") ? ModeContext(modeId: imageName) : imageManager.getCurrentModeContext()

        // 分层临时：仅更新缓存，由父层统一落盘
        var settings = imageManager.getImageSettings(for: imageName, in: modeContext)
        settings.showClickCount = show
        imageManager.forceUpdateCache(for: imageName, in: modeContext, settings: settings)
    }
    
    /// Get animation style for trigger display
    func getAnimationStyle(for imageName: String) -> TriggerAnimationStyle {
        return getCustomTriggerDisplay(for: imageName).getCurrentAnimationStyle()
    }
    
    /// Get font size for trigger display
    func getFontSize(for imageName: String) -> Double {
        return getCustomTriggerDisplay(for: imageName).fontSize
    }
    
    /// Get emoji for trigger display
    func getEmoji(for imageName: String) -> String {
        return getCustomTriggerDisplay(for: imageName).emoji
    }
    
    /// Check if increment should be shown in trigger display
    func shouldShowIncrement(for imageName: String) -> Bool {
        return getCustomTriggerDisplay(for: imageName).showIncrement
    }
    
    /// Save selected colors for image
    func saveSelectedColors(_ colors: Set<String>, for imageName: String) {
        dataService.saveSelectedColors(colors, for: imageName)

        // Update display color if single color is selected
        if colors.count == 1, let color = colors.first {
            var config = getCustomTriggerDisplay(for: imageName)
            config.displayColor = color
            setCustomTriggerDisplay(for: imageName, config: config)
        }
    }

    /// Generate random trigger display configuration
    func generateRandomTriggerDisplay() -> CustomTriggerDisplay {
        var config = CustomTriggerDisplay()

        // 随机提示始终使用文字模式，不依赖用户的自定义配置
        config.displayMode = .text

        // 多策略随机选择文案（增强随机性）
        let strategy = Int.random(in: 0...10)
        switch strategy {
        case 0...6:
            // 60%: 使用静态预设列表
            config.customText = AppConfig.randomTextPresets.randomElement() ?? "太棒了!"
        case 7...8:
            // 20%: 动态组合生成
            config.customText = generateDynamicText()
        case 9:
            // 10%: 时间相关文案
            config.customText = generateTimeBasedText()
        default:
            // 10%: 纯emoji组合
            config.customText = generateEmojiCombo()
        }

        // 根据文案末尾是否为标点符号决定是否显示增量
        config.showIncrement = shouldShowIncrementForText(config.customText)

        // 随机选择增量值
        config.incrementValue = generateWeightedRandomIncrement()

        // 随机选择字体大小
        config.fontSize = Double.random(in: AppConfig.fontSizeRange)

        // 随机选择动画样式
        config.animationStyle = TriggerAnimationStyle.allCases.randomElement() ?? .bounce

        // 随机选择颜色
        config.displayColor = AppConfig.defaultColors.randomElement() ?? "white"


        return config
    }

    /// 动态组合生成随机文案
    private func generateDynamicText() -> String {
        // 前缀池
        let prefixes = ["咚", "叮", "嗨", "哇", "呀", "欸", "噢", "哦", "嘿", "唉", "呜", "喵", "汪", "嘻", "啊", "诶", ""]
        // 主体词池
        let bodies = [
            "好运", "发财", "暴富", "转运", "开挂", "飘了", "稳了", "来了", "绝了", "妙了",
            "醒了", "美了", "爆了", "燃了", "灵了", "通了", "开了", "到了", "中了", "成了",
            "福气", "财气", "运气", "元气", "灵气", "仙气", "锦鲤", "暴击", "起飞", "上头"
        ]
        // 后缀池
        let suffixes = ["!", "~", "啦", "呀", "哦", "咯", "嘛", "吧", "呢", "欸", "++", "MAX", "√", ""]
        // emoji池
        let emojis = ["✨", "💫", "🎉", "💰", "🍀", "🔥", "⚡", "🌈", "🎯", "💎", "🚀", "🌟", "🧿", "📈", "💸", "🪙", "🧘", "🎁", "🐟", "🦋", ""]
        
        let prefix = prefixes.randomElement() ?? ""
        let body = bodies.randomElement() ?? "好运"
        let suffix = suffixes.randomElement() ?? ""
        let emoji = emojis.randomElement() ?? ""
        
        // 随机组合方式
        let combineType = Int.random(in: 0...3)
        switch combineType {
        case 0: return "\(emoji)\(prefix)\(body)\(suffix)"
        case 1: return "\(prefix)\(body)\(suffix)\(emoji)"
        case 2: return "\(emoji)\(body)\(emoji)"
        default: return "\(prefix)\(body)\(suffix)"
        }
    }
    
    /// 生成时间相关的问候文案
    private func generateTimeBasedText() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        let weekday = Calendar.current.component(.weekday, from: Date())
        
        // 根据时间生成不同文案
        let timeTexts: [String]
        switch hour {
        case 5...8: timeTexts = ["早安☀️", "早起最棒", "清晨好运", "元气满满", "早睡早起", "新的一天", "活力开启"]
        case 9...11: timeTexts = ["上午好✨", "打工冲鸭", "状态在线", "充电中~", "专注模式", "效率拉满"]
        case 12...13: timeTexts = ["午安🌞", "休息一下", "补充能量", "午觉时间", "干饭啦", "好好吃饭"]
        case 14...17: timeTexts = ["下午茶☕", "继续冲", "稳住别慌", "快下班了", "坚持住", "马上休息"]
        case 18...21: timeTexts = ["晚上好🌙", "放松时间", "今日辛苦", "休息一下", "放空自己", "解压时刻"]
        case 22...23, 0...4: timeTexts = ["夜深了🌛", "别熬夜", "早点休息", "好梦💤", "晚安~", "月亮陪你"]
        default: timeTexts = ["时光飞逝", "珍惜当下"]
        }
        
        // 根据星期添加变化
        let weekendBonus = ["周末快乐🎉", "好好放松", "玩得开心", "充电模式", "自由时间"]
        let fridayBonus = ["周五啦🎊", "快放假了", "冲刺一下", "周末预备"]
        let mondayBonus = ["周一打卡💪", "新周开始", "这周必发", "周一平安"]
        
        var pool = timeTexts
        if weekday == 1 { pool += mondayBonus }
        else if weekday == 6 { pool += fridayBonus }
        else if weekday == 7 || weekday == 1 { pool += weekendBonus }
        
        return pool.randomElement() ?? "好运来"
    }
    
    /// 生成纯emoji组合
    private func generateEmojiCombo() -> String {
        let emojiGroups = [
            ["💰", "💸", "🪙", "💎", "📈", "💳"],  // 财运
            ["🍀", "🌈", "✨", "🌟", "💫", "⭐"],  // 好运
            ["🧘", "🛐", "📿", "🕯️", "🪷", "⛩️"],  // 祈福
            ["😊", "🥰", "😌", "🤗", "🥹", "😇"],  // 开心
            ["🐱", "🐶", "🐰", "🐼", "🦊", "🐾"],  // 萌宠
            ["🎉", "🎊", "🥳", "🎁", "🎂", "🪅"],  // 庆祝
            ["🔥", "⚡", "💥", "🚀", "🎯", "🏆"],  // 能量
            ["🌸", "🌺", "🌷", "🌻", "🌼", "💐"],  // 花卉
            ["☕", "🧃", "🍵", "🧋", "🍰", "🍩"]   // 美食
        ]
        
        let group = emojiGroups.randomElement() ?? emojiGroups[0]
        let count = Int.random(in: 1...3)
        var result = ""
        for _ in 0..<count {
            result += group.randomElement() ?? "✨"
        }
        return result
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

    // 随机增量值仅允许为 ±1（随机提示场景约束）
    private func generateWeightedRandomIncrement() -> Int {
        return Bool.random() ? 1 : -1
    }
    
    /// Load selected colors for image
    func loadSelectedColors(for imageName: String) -> Set<String> {
        return dataService.loadSelectedColors(for: imageName)
    }
    
    /// 异步预处理Toast图片，避免点击时延时
    func preloadCustomDisplayImage(for imageName: String) {
        // 仅在图片模式下预加载
        let cfg = getCustomTriggerDisplay(for: imageName)
        if cfg.displayMode != .image {
            return
        }

        // 检查是否已经在预加载队列中
        guard !preloadingTasks.contains(imageName) else {
            return
        }
        
        // 检查是否已经有缓存
        let config = getCustomTriggerDisplay(for: imageName)
        let cacheKey = generateToastImageCacheKey(for: imageName, config: config)
        if CacheManager.shared.getToastImage(for: cacheKey) != nil {
            return
        }
        
        // 添加到预加载任务队列
        preloadingTasks.insert(imageName)
        
        preloadQueue.async { [weak self] in
            _ = self?.getCustomDisplayImage(for: imageName)
            
            // 完成后从任务队列移除
            DispatchQueue.main.async {
                self?.preloadingTasks.remove(imageName)
            }
        }
    }
    
    /// 批量预处理多个图片的Toast版本
    func preloadCustomDisplayImages(for imageNames: [String]) {
        for (index, imageName) in imageNames.enumerated() {
            // 添加延迟避免同时启动太多任务
            preloadQueue.asyncAfter(deadline: .now() + Double(index) * 0.05) { [weak self] in
                self?.preloadCustomDisplayImage(for: imageName)
            }
        }
    }
    
    /// 清理Toast图片缓存
    static func clearToastImageCache() {
        CacheManager.shared.clearToastCache()
        Logger.debug("Toast图片缓存已清理", category: .general)
    }
    
    /// 获取不带缓存的Toast图片（调试用）
    func getCustomDisplayImageWithoutCache(for imageName: String) -> UIImage? {
        _ = getCustomTriggerDisplay(for: imageName)
        
        // 获取原始图片
        guard let originalImage = getOriginalImage(for: imageName) else {
            Logger.error("调试模式：无法获取原始图片: \(imageName)", category: .general)
            return nil
        }
        
        // 直接返回压缩的原始图片，不进行裁剪
        let compressedImage = ImageCompressionUtils.compressForToast(originalImage) ?? originalImage
        Logger.debug("调试模式：返回压缩原图，尺寸: \(compressedImage.size)", category: .general)
        return compressedImage
    }
    
    // MARK: - Private Methods
    
    private func loadData() {
        // 可能在后台线程调用，切换到主线程发布
        let loaded = dataService.loadCustomTriggerDisplays()
        if Thread.isMainThread {
            customTriggerDisplays = loaded
        } else {
            DispatchQueue.main.async {
                self.customTriggerDisplays = loaded
            }
        }
    }
    
    private func getRainbowColor() -> Color {
        let colors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple, .pink]
        let index = Int(Date().timeIntervalSince1970) % colors.count
        return colors[index]
    }
    
    private func getRotatingColor(for imageName: String, from colors: Set<String>) -> Color {
        let colorArray = Array(colors).sorted() // Sort for consistency
        let index = getAndIncrementColorIndex(for: imageName) % colorArray.count
        return AppTheme.getColor(fromName: colorArray[index])
    }
    
    private func getAndIncrementColorIndex(for imageName: String) -> Int {
        let currentIndex = colorIndices[imageName] ?? 0
        let selectedColors = dataService.loadSelectedColors(for: imageName)
        let nextIndex = (currentIndex + 1) % max(1, selectedColors.count)
        
        colorIndices[imageName] = nextIndex
        
        // Persist to UserDefaults
        UserDefaults.standard.set(nextIndex, forKey: "colorIndex_\(imageName)")
        
        return currentIndex
    }
    
    private func resetColorIndex(for imageName: String) {
        colorIndices[imageName] = 0
        UserDefaults.standard.set(0, forKey: "colorIndex_\(imageName)")
    }

    /// Reset sound settings for an image to default
    public func resetSoundSettings(for imageName: String) {
        // 注意：音效配置实际上存储在ImageManager中，这里只是一个占位方法
        // 实际的重置逻辑在ImageSettingsView的重置按钮中处理
        Logger.info("已重置图片 \(imageName) 的音效设置", category: .general)
    }

    /// Reset backtrack settings for an image to default
    public func resetBacktrackSettings(for imageName: String) {
        // 注意：回溯配置实际上存储在ImageManager中，这里只是一个占位方法
        // 实际的重置逻辑在ImageSettingsView的重置按钮中处理
        Logger.info("已重置图片 \(imageName) 的回溯设置", category: .general)
    }

    /// Remove all trigger settings for an image when the image is deleted
    public func removeTriggerSettings(for imageName: String) {
        // 删除自定义触发器显示设置
        customTriggerDisplays.removeValue(forKey: imageName)
        
        // 删除颜色索引
        colorIndices.removeValue(forKey: imageName)
        
        // 删除UserDefaults中的相关数据
        UserDefaults.standard.removeObject(forKey: "colorIndex_\(imageName)")
        UserDefaults.standard.removeObject(forKey: "selectedColors_\(imageName)")
        
        // 删除DataService中的相关数据
        dataService.removeData(forKey: "\(AppConfig.UserDefaultsKeys.customTriggerDisplays)_\(imageName)")
        
        Logger.info("已删除图片 \(imageName) 的所有触发器设置", category: .general)
    }
} 
