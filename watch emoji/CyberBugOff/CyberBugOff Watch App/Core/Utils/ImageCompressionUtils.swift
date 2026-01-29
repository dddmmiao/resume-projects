import UIKit
import SwiftUI
import WatchKit

/// Apple Watch 专用图片压缩工具
struct ImageCompressionUtils {
    
    /// 压缩配置
    enum CompressionLevel {
        case high      // 高质量 - 用于显示
        case medium    // 中质量 - 用于缓存
        case low       // 低质量 - 用于预览
        case thumbnail // 缩略图专用
        
        var quality: CGFloat {
            switch self {
            case .high: return 0.8
            case .medium: return 0.6
            case .low: return 0.4
            case .thumbnail: return 0.5
            }
        }
        
        var maxDimension: CGFloat {
            let screenWidth = WKInterfaceDevice.current().screenBounds.width
            switch self {
            case .high: return screenWidth * 2
            case .medium: return screenWidth * 1.5
            case .low: return screenWidth
            case .thumbnail: return min(screenWidth * 0.5, 120)
            }
        }
    }
    
    /// 智能压缩图片
    static func compressImage(_ image: UIImage, level: CompressionLevel) -> UIImage? {
        // 1. 先调整尺寸
        let resizedImage = resizeImage(image, maxDimension: level.maxDimension)
        
        // 2. 再压缩质量
        guard let data = resizedImage.jpegData(compressionQuality: level.quality),
              let compressedImage = UIImage(data: data) else {
            return resizedImage
        }
        
        return compressedImage
    }
    
    /// 专门用于 Toast 显示的压缩
    static func compressForToast(_ image: UIImage) -> UIImage? {
        let screenWidth = WKInterfaceDevice.current().screenBounds.width
        let toastSize = screenWidth * 0.6 // 增大Toast尺寸到屏幕60%，提升清晰度
        
        // 高质量压缩策略：优先保证清晰度
        let resized = resizeImage(image, maxDimension: toastSize)
        
        // 使用PNG格式保持透明度，避免白底问题
        guard let compressedData = resized.pngData(),
              let compressedImage = UIImage(data: compressedData) else {
            Logger.warning("Toast PNG压缩失败，返回调整尺寸的原图", category: .general)
            return resized // 如果压缩失败，至少返回调整尺寸的图片
        }
        
        Logger.success("Toast压缩成功(PNG): \(image.size) -> \(resized.size) -> \(compressedImage.size)", category: .general)
        return compressedImage
    }
    
    /// 调整图片尺寸
    private static func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        let maxCurrentDimension = max(size.width, size.height)
        
        // 如果图片已经足够小，直接返回
        if maxCurrentDimension <= maxDimension {
            return image
        }
        
        let scale = maxDimension / maxCurrentDimension
        let newSize = CGSize(
            width: size.width * scale,
            height: size.height * scale
        )
        
        return image.resized(to: newSize) ?? image
    }
    
    /// 异步压缩（避免阻塞主线程）
    static func compressImageAsync(_ image: UIImage, level: CompressionLevel) async -> UIImage? {
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let result = compressImage(image, level: level)
                continuation.resume(returning: result)
            }
        }
    }
}

/// UIImage 扩展
private extension UIImage {
    func resized(to size: CGSize) -> UIImage? {
        UIGraphicsBeginImageContextWithOptions(size, false, self.scale)
        defer { UIGraphicsEndImageContext() }
        
        draw(in: CGRect(origin: .zero, size: size))
        return UIGraphicsGetImageFromCurrentImageContext()
    }
} 