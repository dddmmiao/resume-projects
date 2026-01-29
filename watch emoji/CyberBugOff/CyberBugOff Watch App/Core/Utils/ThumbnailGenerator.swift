import SwiftUI
import UIKit
import WatchKit
import CryptoKit

/// 生成与全屏视图效果一致的方形缩略图，使用统一的 CacheManager。
struct ThumbnailGenerator {
    // 不再使用独立缓存，全部使用 CacheManager.shared.thumbnailCache

    // 预加载队列，避免阻塞主线程
    private static let preloadQueue = DispatchQueue(label: "com.cyberbugoff.thumbnail.preload", qos: .utility)
    
    // 添加内存监控
    private static var memoryWarningCount = 0
    private static let maxMemoryWarnings = 3

    /// 异步获取缩略图（使用 CacheManager 统一管理）
    /// - Parameters:
    ///   - imageName: 图片名称（或自定义 key）
    ///   - size: 目标边长
    ///   - model: 数据模型，用于读取自定义 URL 与缩放信息
    @preconcurrency static func thumbnail(for imageName: String, size: CGFloat, model: BugOffModel) async -> UIImage? {
        // 检查内存使用情况
        let memoryPercentage = PerformanceMonitor.getMemoryUsagePercentage()
        if memoryPercentage > AppConfig.memoryHighThreshold {
            Logger.warning("内存使用过高(\(String(format: "%.1f", memoryPercentage))%)，跳过缩略图生成: \(imageName)", category: .performance)
            return nil
        }
        
        let scale = model.getImageScale(for: imageName)
        let offset = model.getImageOffset(for: imageName)
        // 缩略图应该与全屏视图保持一致，使用用户设置的缩放而不是effectiveScale

        // 获取主图圈选数据的哈希值（如果有）
        var circleSelectionHash = ""
        let config = model.getCustomTriggerDisplay(for: imageName)
        if let selectionData = config.mainCircleSelectionData, !selectionData.pathPoints.isEmpty {
            // 简单计算路径点的哈希值
            let pointsHash = selectionData.pathPoints.reduce(0) { result, point in
                result ^ point.x.hashValue ^ point.y.hashValue
            }
            circleSelectionHash = "-circle\(pointsHash)"
        }

        // 检查是否有图片占比设置（scale != 1.0 或 offset != .zero）
        let hasProportionSettings = scale != 1.0 || offset != .zero
        let proportionHash = hasProportionSettings ? "-prop\(Int(scale * 100))\(Int(offset.width))\(Int(offset.height))" : ""

        // 获取图片内容标识符（确保图片内容变化时缓存失效）
        let contentIdentifier = getImageContentIdentifier(for: imageName, model: model)

        // 构造唯一 key（包含图片内容标识符）
        let keyString = "\(imageName)-\(Int(size))-s\(String(format: "%.2f", scale))-o\(Int(offset.width))_\(Int(offset.height))\(circleSelectionHash)\(proportionHash)-\(contentIdentifier)"
        // 使用 SHA256 防止文件名过长 / 包含非法字符
        let keyData = Data(keyString.utf8)
        let hash = SHA256.hash(data: keyData)
        let fileName = hash.compactMap { String(format: "%02x", $0) }.joined()
        let fileURL = cacheFolder.appendingPathComponent(fileName).appendingPathExtension("png")

        // 先读 CacheManager 缩略图缓存
        let cacheKey = "\(imageName)_\(Int(size))_thumb"
        if let cached = CacheManager.shared.getThumbnail(for: cacheKey) { return cached }

        // 异步读取磁盘缓存，避免阻塞UI
        if FileManager.default.fileExists(atPath: fileURL.path) {
            // 在后台队列读取磁盘缓存
            let diskImg = await withCheckedContinuation { continuation in
                DispatchQueue.global(qos: .userInitiated).async {
                    let image = UIImage(contentsOfFile: fileURL.path)
                    continuation.resume(returning: image)
                }
            }

            if let diskImg = diskImg {
                // 将磁盘缓存加载到 CacheManager
                CacheManager.shared.setThumbnail(diskImg, for: cacheKey)
                return diskImg
            }
        }

        // 提取配置中的具体值（在主线程外部使用，避免 Sendable 警告）
        let mainCircleSelectionData = config.mainCircleSelectionData
        let mainImageScale = config.mainImageScale
        let mainImageOffset = config.mainImageOffset
        
        // 提取需要的数据，避免在闭包中捕获model
        let imageManager = model.imageManager
        let applyCircleSelectionToImage = model.applyCircleSelectionToImage

        // 获取屏幕尺寸用于后续计算
        let screenBounds = WKInterfaceDevice.current().screenBounds
        let screenAspectRatio = screenBounds.height / screenBounds.width

        // 在主线程加载基础图片，避免在@Sendable闭包中捕获非Sendable类型
        let baseImage: UIImage? = {
            if let selectionData = mainCircleSelectionData, !selectionData.pathPoints.isEmpty,
               let originalImage = imageManager.getOriginalImage(for: imageName) {
                // 应用圈选裁剪
                if let croppedImage = applyCircleSelectionToImage(
                    originalImage,
                    selectionData,
                    mainImageScale,
                    mainImageOffset
                ) {
                    return croppedImage
                } else {
                    return imageManager.getDisplayImage(for: imageName)
                }
            } else {
                return imageManager.getDisplayImage(for: imageName)
            }
        }()

        // 在后台线程完成渲染，避免主线程阻塞
        let rendered: UIImage? = await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                guard let base = baseImage else {
                    continuation.resume(returning: nil)
                    return
                }

                // 2) 渲染缩略图
                let result = generateThumbnailWithUIGraphics(
                    base: base,
                    size: size,
                    userScale: scale,
                    offset: offset,
                    screenAspectRatio: screenAspectRatio,
                    imageName: imageName,
                    mainCircleSelectionData: mainCircleSelectionData,
                    mainImageScale: mainImageScale,
                    mainImageOffset: mainImageOffset,
                    hasProportionSettings: hasProportionSettings
                )
                continuation.resume(returning: result)
            }
        }

        guard let thumb = rendered else { return nil }

        // 压缩图片以减少内存占用
        let compressedThumb = compressImage(thumb, maxSize: size * 2)
        let imageData = compressedThumb.pngData()
        let cost = imageData?.count ?? 0
        
        // 检查内存使用，如果成本过高则跳过缓存
        if cost > 1024 * 1024 { // 1MB
            Logger.warning("缩略图过大，跳过内存缓存: \(imageName), size: \(cost) bytes", category: .performance)
            return compressedThumb
        }
        
        // 存入 CacheManager
        CacheManager.shared.setThumbnail(compressedThumb, for: cacheKey)
        
        // 异步写入磁盘（保持原始质量）
        if let data = imageData {
            DispatchQueue.global(qos: .utility).async {
                try? data.write(to: fileURL, options: .atomic)
            }
        }
        return compressedThumb
    }

    /// 批量预加载缩略图，提升列表滚动性能
    static func batchPreload(imageNames: [String], size: CGFloat, model: BugOffModel) {
        // 检查内存警告次数，如果过多则跳过预加载
        if memoryWarningCount >= maxMemoryWarnings {
            Logger.warning("内存警告次数过多，跳过批量预加载", category: .performance)
            return
        }
        
        // 限制预加载数量
        let limitedNames = Array(imageNames.prefix(10)) // 最多预加载10张
        
        preloadQueue.async {
            for imageName in limitedNames {
                Task {
                    _ = await thumbnail(for: imageName, size: size, model: model)
                }
            }
        }
    }

    /// 智能预加载：根据当前显示的图片预加载相邻图片
    static func smartPreload(currentImage: String, allImages: [String], size: CGFloat, model: BugOffModel) {
        // 检查内存警告次数，如果过多则跳过预加载
        if memoryWarningCount >= maxMemoryWarnings {
            Logger.warning("内存警告次数过多，跳过智能预加载", category: .performance)
            return
        }
        
        guard let currentIndex = allImages.firstIndex(of: currentImage) else { return }

        preloadQueue.async {
            // 减少预加载范围，只预加载前后各1张图片
            let preloadRange = max(0, currentIndex - 1)...min(allImages.count - 1, currentIndex + 1)

            for index in preloadRange {
                let imageName = allImages[index]
                Task {
                    _ = await thumbnail(for: imageName, size: size, model: model)
                }
            }
        }
    }

    /// 失效所有缩略图（使用 CacheManager）
    static func invalidateAll() {
        CacheManager.shared.clearImageCaches()
        clearDiskCache()
    }

    /// 失效特定图片的缩略图（当图片占比设置改变时使用）
    static func invalidateThumbnail(for imageName: String, model: BugOffModel) {
        // 清理 CacheManager 中的缩略图
        CacheManager.shared.clearCaches(for: imageName)

        // 清理磁盘缓存中匹配的项
        let fm = FileManager.default
        if let files = try? fm.contentsOfDirectory(atPath: cacheFolder.path) {
            for file in files {
                // 检查文件名是否包含图片名称的哈希
                // 由于我们使用SHA256哈希，无法直接从文件名判断原始图片名
                // 所以清理所有缓存文件，让系统重新生成
                let fileURL = cacheFolder.appendingPathComponent(file)
                try? fm.removeItem(at: fileURL)
            }
        }
    }

    /// 失效特定图片的缩略图（简化版本，不需要model参数）
    static func invalidateThumbnailForImage(_ imageName: String) {
        // 清理 CacheManager 中的缩略图
        CacheManager.shared.clearCaches(for: imageName)

        // 清理磁盘缓存
        clearDiskCache()
    }



    /// 清理磁盘缓存
    static func clearDiskCache() {
        let fm = FileManager.default
        if let files = try? fm.contentsOfDirectory(atPath: cacheFolder.path) {
            for file in files {
                let fileURL = cacheFolder.appendingPathComponent(file)
                try? fm.removeItem(at: fileURL)
            }
        }
    }
    
    /// 压缩图片以减少内存占用
    private static func compressImage(_ image: UIImage, maxSize: CGFloat) -> UIImage {
        let originalSize = image.size
        let _ = image.scale
        
        // 如果图片尺寸已经很小，直接返回
        if originalSize.width <= maxSize && originalSize.height <= maxSize {
            return image
        }
        
        // 计算新的尺寸，确保不超过最大限制
        let aspectRatio = originalSize.width / originalSize.height
        let newSize: CGSize
        if originalSize.width > originalSize.height {
            newSize = CGSize(width: maxSize, height: maxSize / aspectRatio)
        } else {
            newSize = CGSize(width: maxSize * aspectRatio, height: maxSize)
        }
        
        // 确保新尺寸不超过合理范围
        let finalSize = CGSize(
            width: min(newSize.width, AppConfig.maxThumbnailSize),
            height: min(newSize.height, AppConfig.maxThumbnailSize)
        )
        
        // 使用UIGraphicsBeginImageContextWithOptions进行高质量缩放（watchOS兼容）
        UIGraphicsBeginImageContextWithOptions(finalSize, false, 0.0)
        defer { UIGraphicsEndImageContext() }
        
        image.draw(in: CGRect(origin: .zero, size: finalSize))
        guard let compressedImage = UIGraphicsGetImageFromCurrentImageContext() else {
            return image
        }
        
        // 检查压缩后的图片大小
        if let imageData = compressedImage.pngData() {
            let dataSize = imageData.count
            if dataSize > AppConfig.maxThumbnailFileSize {
                Logger.warning("压缩后图片仍然过大: \(dataSize) bytes，进行进一步压缩", category: .performance)
                
                // 进一步压缩
                let furtherCompressedSize = CGSize(
                    width: finalSize.width * 0.7,
                    height: finalSize.height * 0.7
                )
                UIGraphicsBeginImageContextWithOptions(furtherCompressedSize, false, 0.0)
                defer { UIGraphicsEndImageContext() }
                
                compressedImage.draw(in: CGRect(origin: .zero, size: furtherCompressedSize))
                if let furtherCompressed = UIGraphicsGetImageFromCurrentImageContext() {
                    return furtherCompressed
                }
            }
        }
        
        return compressedImage
    }
    
    /// 处理内存警告（使用 CacheManager）
    static func handleMemoryWarning() {
        memoryWarningCount += 1
        CacheManager.shared.handleMemoryWarning()
        Logger.warning("收到内存警告，清理缩略图缓存，警告次数: \(memoryWarningCount)", category: .performance)
        
        // 如果警告次数过多，暂停预加载
        if memoryWarningCount >= maxMemoryWarnings {
            Logger.error("内存警告次数过多，暂停缩略图预加载", category: .performance)
        }
    }
    
    /// 重置内存警告计数
    static func resetMemoryWarningCount() {
        memoryWarningCount = 0
    }


    
    /// 使用 UIGraphics 生成缩略图（比 ImageRenderer 更快）
    private static func generateThumbnailWithUIGraphics(
        base: UIImage,
        size: CGFloat,
        userScale: CGFloat,  // 用户设置的缩放，与全屏视图一致
        offset: CGSize,
        screenAspectRatio: CGFloat,
        imageName: String,
        mainCircleSelectionData: CircleSelectionData?,
        mainImageScale: CGFloat,
        mainImageOffset: CGSize,
        hasProportionSettings: Bool
    ) -> UIImage? {
        // 使用传入的屏幕比例生成矩形缩略图而不是方形
        let targetSize = CGSize(width: size, height: size * screenAspectRatio)
        // 使用更高的渲染分辨率来提升清晰度
        let renderScale = max(WKInterfaceDevice.current().screenScale, 2.0)

        UIGraphicsBeginImageContextWithOptions(targetSize, false, renderScale)
        defer { UIGraphicsEndImageContext() }

        guard let context = UIGraphicsGetCurrentContext() else { return nil }

        // 设置黑色背景，与全屏视图保持一致
        context.setFillColor(UIColor.black.cgColor)
        context.fill(CGRect(origin: .zero, size: targetSize))
        
        // 计算绘制参数
        let imageSize = base.size
        
        // 根据图片类型和设置选择合适的缩放模式
        let isCircleSelectionImage = mainCircleSelectionData != nil && !mainCircleSelectionData!.pathPoints.isEmpty

        let scaledSize: CGSize

        if isCircleSelectionImage {
            // 圈选图片：模拟全屏视图的scaledToFit + scaleEffect逻辑
            let fitSize = calculateAspectFitSize(imageSize, targetSize: targetSize)
            scaledSize = CGSize(
                width: fitSize.width * userScale,
                height: fitSize.height * userScale
            )
        } else if hasProportionSettings {
            // 普通图片有占比设置：模拟全屏视图的scaledToFill + scaleEffect逻辑
            let fillSize = calculateAspectFillSize(imageSize, targetSize: targetSize)
            scaledSize = CGSize(
                width: fillSize.width * userScale,
                height: fillSize.height * userScale
            )
        } else {
            // 普通图片无占比设置：使用AspectFill模式填充容器
            scaledSize = calculateAspectFillSize(imageSize, targetSize: targetSize)
        }
        
        // 修正偏移量计算，考虑矩形缩略图与实际屏幕的比例关系
        let screenW = WKInterfaceDevice.current().screenBounds.width
        let screenH = WKInterfaceDevice.current().screenBounds.height
        let ratioX = targetSize.width / screenW
        let ratioY = targetSize.height / screenH

        // 应用偏移，使用正确的比例映射
        let offsetX = (targetSize.width - scaledSize.width) / 2 + offset.width * ratioX
        let offsetY = (targetSize.height - scaledSize.height) / 2 + offset.height * ratioY
        
        let drawRect = CGRect(
            x: offsetX,
            y: offsetY,
            width: scaledSize.width,
            height: scaledSize.height
        )

        // 设置裁剪区域为缩略图边界，确保显示完整内容
        context.addRect(CGRect(origin: .zero, size: targetSize))
        context.clip()

        // 绘制图片
        base.draw(in: drawRect)
        
        return UIGraphicsGetImageFromCurrentImageContext()
    }
    
    /// 计算 AspectFill 尺寸
    private static func calculateAspectFillSize(_ imageSize: CGSize, targetSize: CGSize) -> CGSize {
        let widthRatio = targetSize.width / imageSize.width
        let heightRatio = targetSize.height / imageSize.height
        let scale = max(widthRatio, heightRatio)
        
        return CGSize(
            width: imageSize.width * scale,
            height: imageSize.height * scale
        )
    }
    
    /// 计算 AspectFit 尺寸
    private static func calculateAspectFitSize(_ imageSize: CGSize, targetSize: CGSize) -> CGSize {
        let widthRatio = targetSize.width / imageSize.width
        let heightRatio = targetSize.height / imageSize.height
        let scale = min(widthRatio, heightRatio)
        
        return CGSize(
            width: imageSize.width * scale,
            height: imageSize.height * scale
        )
    }

    // 磁盘缓存目录
    private static let cacheFolder: URL = {
        let fm = FileManager.default
        let dir = fm.urls(for: .cachesDirectory, in: .userDomainMask).first!.appendingPathComponent("thumbnails")
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }()

    /// 预加载缩略图到内存缓存（减少启动时的闪烁）
    static func preloadThumbnails(for imageNames: [String], size: CGFloat, model: BugOffModel) {
        Task {
            for imageName in imageNames.prefix(5) { // 只预加载前5个，避免内存压力
                _ = await thumbnail(for: imageName, size: size, model: model)
            }
        }
    }

    /// 清理缓存（使用 CacheManager）
    static func clearCache() {
        CacheManager.shared.clearImageCaches()

        // 清理磁盘缓存
        try? FileManager.default.removeItem(at: cacheFolder)
    }

    /// 获取图片内容标识符（用于缓存键，确保图片内容变化时缓存失效）
    private static func getImageContentIdentifier(for imageName: String, model: BugOffModel) -> String {
        // 1. 尝试获取用户自定义图片的文件修改时间
        if let customURL = model.imageManager.userAddedImages[imageName] {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: customURL.path),
               let modDate = attrs[FileAttributeKey.modificationDate] as? Date {
                return "t\(Int(modDate.timeIntervalSince1970))"
            }
        }

        // 2. 对于默认图片，使用图片数据的简单哈希
        if let image = model.imageManager.getDisplayImage(for: imageName),
           let imageData = image.pngData() {
            // 使用数据长度和前几个字节作为简单标识符
            let dataLength = imageData.count
            let prefix = imageData.prefix(16) // 取前16字节
            let prefixHash = prefix.reduce(0) { $0 ^ Int($1) }
            return "h\(dataLength)_\(prefixHash)"
        }

        // 3. 兜底：使用当前时间戳（确保每次都重新生成）
        return "f\(Int(Date().timeIntervalSince1970))"
    }
}
