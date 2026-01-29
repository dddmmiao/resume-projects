import UIKit
import UniformTypeIdentifiers
import ImageIO
import CoreGraphics

/// 图片格式处理工具类 - 处理图片格式兼容性问题
class ImageFormatHandler {
    
    // MARK: - 支持的图片格式
    
    /// watchOS支持的图片格式
    static let supportedImageTypes: [UTType] = [
        .jpeg,
        .png,
        .heic,
        .heif,
        .gif,
        .bmp,
        .tiff
    ]
    
    /// 推荐的输出格式（PNG - 无损压缩，兼容性最好）
    static let preferredOutputFormat: UTType = .png
    
    // MARK: - 图片处理配置
    
    struct ProcessingConfig {
        /// 最大图片尺寸（像素）
        let maxSize: CGSize
        /// 压缩质量（0.0-1.0，仅对JPEG有效）
        let compressionQuality: CGFloat
        /// 是否强制转换为PNG格式
        let forceConvertToPNG: Bool
        /// 最大文件大小（字节）
        let maxFileSize: Int
        
        static let `default` = ProcessingConfig(
            maxSize: CGSize(width: 2048, height: 2048), // 提高到2K分辨率
            compressionQuality: 0.9, // 提高压缩质量
            forceConvertToPNG: true,
            maxFileSize: 5 * 1024 * 1024 // 提高到5MB
        )

        static let thumbnail = ProcessingConfig(
            maxSize: CGSize(width: 512, height: 512), // 提高缩略图尺寸
            compressionQuality: 0.85, // 提高压缩质量
            forceConvertToPNG: true,
            maxFileSize: 1024 * 1024 // 提高到1MB
        )

        static let toast = ProcessingConfig(
            maxSize: CGSize(width: 1024, height: 1024), // 提高Toast图片尺寸
            compressionQuality: 0.9, // 提高压缩质量
            forceConvertToPNG: true,
            maxFileSize: 3 * 1024 * 1024 // 提高到3MB
        )
    }
    
    // MARK: - 图片处理方法
    
    /// 处理图片以确保兼容性
    /// - Parameters:
    ///   - image: 原始图片
    ///   - config: 处理配置
    /// - Returns: 处理后的图片数据和格式信息
    static func processImage(_ image: UIImage, config: ProcessingConfig = .default) -> (data: Data, format: UTType)? {
        // 1. 检查和调整图片尺寸
        let processedImage = resizeImageIfNeeded(image, maxSize: config.maxSize)
        
        // 2. 转换为目标格式
        guard let imageData = convertToTargetFormat(processedImage, config: config) else {
            Logger.error("图片格式转换失败", category: .general)
            return nil
        }
        
        // 3. 检查文件大小
        if imageData.count > config.maxFileSize {
            Logger.warning("图片文件过大: \(imageData.count) bytes, 最大允许: \(config.maxFileSize) bytes", category: .general)
            // 尝试进一步压缩
            if let compressedData = compressImageData(processedImage, targetSize: config.maxFileSize) {
                return (compressedData, config.forceConvertToPNG ? .png : .jpeg)
            } else {
                Logger.error("图片压缩失败", category: .general)
                return nil
            }
        }
        
        let outputFormat = config.forceConvertToPNG ? UTType.png : UTType.jpeg
        Logger.success("图片处理成功: \(imageData.count) bytes, 格式: \(outputFormat.identifier)", category: .general)

        // 性能监控：记录处理后的图片信息，便于后续优化
        let sizeInMB = Double(imageData.count) / (1024 * 1024)
        if sizeInMB > 3.0 {
            Logger.warning("图片文件较大: \(String(format: "%.1f", sizeInMB))MB，如遇性能问题可考虑降低质量设置", category: .general)
        }

        return (imageData, outputFormat)
    }
    
    /// 检查图片格式是否受支持
    /// - Parameter data: 图片数据
    /// - Returns: 是否支持该格式
    static func isImageFormatSupported(_ data: Data) -> Bool {
        guard let imageSource = CGImageSourceCreateWithData(data as CFData, nil),
              let imageType = CGImageSourceGetType(imageSource) else {
            return false
        }
        
        let utType = UTType(imageType as String)
        return supportedImageTypes.contains { $0.conforms(to: utType ?? UTType.data) }
    }
    
    /// 获取图片格式信息
    /// - Parameter data: 图片数据
    /// - Returns: 图片格式类型
    static func getImageFormat(_ data: Data) -> UTType? {
        guard let imageSource = CGImageSourceCreateWithData(data as CFData, nil),
              let imageType = CGImageSourceGetType(imageSource) else {
            return nil
        }
        
        return UTType(imageType as String)
    }
    
    // MARK: - 私有辅助方法
    
    /// 调整图片尺寸
    private static func resizeImageIfNeeded(_ image: UIImage, maxSize: CGSize) -> UIImage {
        let imageSize = image.size
        
        // 如果图片尺寸已经符合要求，直接返回
        if imageSize.width <= maxSize.width && imageSize.height <= maxSize.height {
            return image
        }
        
        // 计算缩放比例，保持宽高比
        let widthRatio = maxSize.width / imageSize.width
        let heightRatio = maxSize.height / imageSize.height
        let scaleFactor = min(widthRatio, heightRatio)
        
        let newSize = CGSize(
            width: imageSize.width * scaleFactor,
            height: imageSize.height * scaleFactor
        )
        
        // 创建新的图片上下文
        UIGraphicsBeginImageContextWithOptions(newSize, false, 0.0)
        defer { UIGraphicsEndImageContext() }
        
        image.draw(in: CGRect(origin: .zero, size: newSize))
        
        guard let resizedImage = UIGraphicsGetImageFromCurrentImageContext() else {
            Logger.warning("图片缩放失败，返回原图", category: .general)
            return image
        }
        
        Logger.debug("图片已缩放: \(imageSize) -> \(newSize)", category: .general)
        return resizedImage
    }
    
    /// 转换为目标格式
    private static func convertToTargetFormat(_ image: UIImage, config: ProcessingConfig) -> Data? {
        if config.forceConvertToPNG {
            return image.pngData()
        } else {
            return image.jpegData(compressionQuality: config.compressionQuality)
        }
    }
    
    /// 压缩图片数据到目标大小
    private static func compressImageData(_ image: UIImage, targetSize: Int) -> Data? {
        var compressionQuality: CGFloat = 0.8
        var imageData = image.jpegData(compressionQuality: compressionQuality)
        
        // 逐步降低质量直到满足大小要求
        while let data = imageData, data.count > targetSize && compressionQuality > 0.1 {
            compressionQuality -= 0.1
            imageData = image.jpegData(compressionQuality: compressionQuality)
        }
        
        if let data = imageData, data.count <= targetSize {
            Logger.debug("图片已压缩到: \(data.count) bytes, 质量: \(compressionQuality)", category: .general)
            return data
        }
        
        return nil
    }
}

// MARK: - 扩展方法

extension UIImage {
    /// 便捷方法：处理图片以确保兼容性
    func processForCompatibility(config: ImageFormatHandler.ProcessingConfig = .default) -> (data: Data, format: UTType)? {
        return ImageFormatHandler.processImage(self, config: config)
    }
}
