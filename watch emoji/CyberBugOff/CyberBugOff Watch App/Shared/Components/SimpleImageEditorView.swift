import SwiftUI
import WatchKit
import ImageIO

/// 简单图片编辑视图包装器 - 用于在其他视图中引用
class SimpleImageEditorViewWrapper: ObservableObject {

    /// 当前偏移量
    @Published var offset: CGSize = .zero

    /// 当前缩放比例
    @Published var scale: CGFloat = 1.0

    // 缓存自定义图片和对应的图片名称
    private var customImageCache: [String: UIImage] = [:]

    /// 重置到初始状态
    func resetToInitial() {
        NotificationCenter.default.post(name: .resetImageEditor, object: nil)
    }

    /// 设置自定义图片（用于显示用户选择的图片）
    func setCustomImage(_ image: UIImage, for imageName: String) {
        customImageCache[imageName] = image
    }

    /// 清除自定义图片缓存
    func clearCustomImage(for imageName: String) {
        customImageCache.removeValue(forKey: imageName)
    }

    /// 使用下采样加载图片，避免全分辨率解码导致内存峰值
    private func loadImageWithDownsampling(from url: URL, maxSize: CGFloat = 1024) -> UIImage? {
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
    
    /// 获取原始图片，优先从用户图片获取，然后从Bundle获取（使用下采样）
    func getOriginalImage(named imageName: String) -> UIImage? {
        // 首先检查自定义图片缓存
        if let customImage = customImageCache[imageName] {
            return customImage
        }

        // 优先检查是否是用户替换的图片（存储在文档目录）
        let fileManager = FileManager.default
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!

        // 尝试直接使用图片名称（使用下采样）
        var imageURL = documentsDirectory.appendingPathComponent(imageName)
        if fileManager.fileExists(atPath: imageURL.path) {
            return loadImageWithDownsampling(from: imageURL, maxSize: 1024)
        }

        // 尝试添加常见图片扩展名（使用下采样）
        for ext in ["jpg", "jpeg", "png"] {
            if !imageName.hasSuffix(".\(ext)") {
                imageURL = documentsDirectory.appendingPathComponent("\(imageName).\(ext)")
                if fileManager.fileExists(atPath: imageURL.path) {
                    return loadImageWithDownsampling(from: imageURL, maxSize: 1024)
                }
            }
        }

        // 如果用户目录中没有，再尝试从Bundle中获取原始图片
        if let originalImage = UIImage(named: imageName) {
            return originalImage
        }

        // 如果仍未找到，尝试使用基名（去掉_copy_及其后缀）再次搜索（使用下采样）
        if let baseName = imageName.components(separatedBy: "_copy_").first {
            // 先尝试文件系统
            var baseURL = documentsDirectory.appendingPathComponent(baseName)
            if fileManager.fileExists(atPath: baseURL.path) {
                return loadImageWithDownsampling(from: baseURL, maxSize: 1024)
            }
            for ext in ["jpg", "jpeg", "png"] {
                baseURL = documentsDirectory.appendingPathComponent("\(baseName).\(ext)")
                if fileManager.fileExists(atPath: baseURL.path) {
                    return loadImageWithDownsampling(from: baseURL, maxSize: 1024)
                }
            }
            // 最后尝试Bundle
            if let baseImg = UIImage(named: baseName) {
                return baseImg
            }
        }
        
        return nil
    }
    
    /// 裁剪图片
    func cropImage(imageName: String, cropSize: CGSize) -> UIImage? {
        // 获取原始图片
        guard let originalImage = getOriginalImage(named: imageName) else {
            return nil
        }
        
        // 创建一个新的图形上下文
        UIGraphicsBeginImageContextWithOptions(cropSize, false, 0)
        defer { UIGraphicsEndImageContext() }
        
        // 计算图片在裁剪区域中的位置
        let imageSize = originalImage.size
        let screenSize = cropSize // 使用cropSize作为屏幕尺寸
        
        // 计算.scaledToFill()后的尺寸 - 这是关键！
        let imageAspectRatio = imageSize.width / imageSize.height
        let screenAspectRatio = screenSize.width / screenSize.height
        
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
        
        // 修复绘制区域计算 - 这里是关键修复！
        // 用户看到的图片中心位置应该对应裁剪区域的中心
        // offset表示图片相对于屏幕中心的偏移量
        let drawRect = CGRect(
            x: (cropSize.width - scaledWidth) / 2 + offset.width,
            y: (cropSize.height - scaledHeight) / 2 + offset.height,
            width: scaledWidth,
            height: scaledHeight
        )
        
        // 绘制图片
        originalImage.draw(in: drawRect)
        
        // 获取裁剪后的图片
        guard let croppedImage = UIGraphicsGetImageFromCurrentImageContext() else {
            return nil
        }
        
        return croppedImage
    }
    
    /// 更新偏移量和缩放比例
    func updateTransform(offset: CGSize, scale: CGFloat) {
        self.offset = offset
        self.scale = scale
    }
}

// 通知名称扩展
extension Notification.Name {
    static let resetImageEditor = Notification.Name("resetImageEditor")
}

/// 简单图片编辑视图
struct SimpleImageEditorView: View {
    let imageName: String
    var onReset: (() -> Void)?
    var isInteractionEnabled: Bool = true // 是否启用交互
    
    // 状态变量
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var minScale: CGFloat = 0
    @State private var maxScale: CGFloat = 20.0
    
    // 添加计算最小缩放比例的状态
    @State private var calculatedMinScale: CGFloat = 0.1
    
    @EnvironmentObject private var wrapper: SimpleImageEditorViewWrapper
    @FocusState private var crownFocused: Bool
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // 背景
                Color.black.edgesIgnoringSafeArea(.all)
                
                // 图片 - 简化版本，使用scaledToFill并居中
                if let image = wrapper.getOriginalImage(named: imageName) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill() // 使用Fill模式填充
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            // 拖动手势 - 仅在启用交互时响应
                            isInteractionEnabled ? DragGesture()
                                .onChanged { value in
                                    let newOffset = CGSize(
                                        width: lastOffset.width + value.translation.width,
                                        height: lastOffset.height + value.translation.height
                                    )
                                    // 限制拖动范围，确保图片边缘不会出现在表盘可见范围内
                                    offset = limitOffset(newOffset, image: image, screenSize: WKInterfaceDevice.current().screenBounds.size)
                                    wrapper.updateTransform(offset: offset, scale: scale)
                                }
                                .onEnded { _ in
                                    lastOffset = offset
                                } : nil
                        )
                        .onAppear {
                            // 计算图片的最小缩放比例，使其完整显示
                            calculateMinScale(image: image)
                            
                            // 初始化
                            scale = 1.0
                            offset = .zero
                            lastOffset = .zero
                            wrapper.updateTransform(offset: offset, scale: scale)
                        }
                } else {
                    Text("无法加载图片").foregroundColor(.white)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped() // 裁剪超出边界的内容
        }
        .edgesIgnoringSafeArea(.all)
        .onAppear {
            wrapper.updateTransform(offset: offset, scale: scale)
            // 延迟一帧再设置焦点，进一步降低 Crown Sequencer 警告概率
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                crownFocused = isInteractionEnabled
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .resetImageEditor)) { _ in
            resetToInitial()
        }
        // 数字表冠控制缩放 - 仅在启用交互时响应
        .focusable(isInteractionEnabled)
        .focused($crownFocused)
        .digitalCrownRotation(
            isInteractionEnabled ? $scale : .constant(scale),
            from: calculatedMinScale > 0 ? calculatedMinScale : 0.1,
            through: maxScale,
            by: 0.1,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: isInteractionEnabled
        )
        .onChange(of: isInteractionEnabled) { _, enabled in
            // 根据交互开关更新焦点
            DispatchQueue.main.async {
                crownFocused = enabled
            }
        }
        .onChange(of: scale) { oldValue, newValue in
            // 仅在启用交互时处理缩放变化
            guard isInteractionEnabled else { return }

            // 当缩放变化时，调整偏移量以保持图片居中
            if let image = wrapper.getOriginalImage(named: imageName) {
                // 计算缩放比例变化
                let scaleFactor = newValue / oldValue

                // 根据缩放比例变化调整偏移量
                let newOffset = CGSize(
                    width: offset.width * scaleFactor,
                    height: offset.height * scaleFactor
                )

                // 限制新的偏移量
                offset = limitOffset(newOffset, image: image, screenSize: WKInterfaceDevice.current().screenBounds.size)
                lastOffset = offset

                // 更新wrapper
                wrapper.updateTransform(offset: offset, scale: scale)
            }

            // 当达到极限值时提供触觉反馈
            if (newValue >= maxScale && newValue > oldValue) || (newValue <= calculatedMinScale && newValue < oldValue) {
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }
    
    // 计算图片的最小缩放比例，使其完整显示
    private func calculateMinScale(image: UIImage) {
        let screenSize = WKInterfaceDevice.current().screenBounds.size
        let imageSize = image.size
        
        // 计算图片的宽高比
        let imageAspectRatio = imageSize.width / imageSize.height
        let screenAspectRatio = screenSize.width / screenSize.height
        
        // 计算使图片完全显示的最小缩放比例
        if imageAspectRatio > screenAspectRatio {
            // 图片比屏幕更宽，需要基于宽度计算
            calculatedMinScale = screenSize.width / (imageSize.width * (screenSize.height / imageSize.height))
        } else {
            // 图片比屏幕更高，需要基于高度计算
            calculatedMinScale = screenSize.height / (imageSize.height * (screenSize.width / imageSize.width))
        }
        
        // 确保最小缩放比例不会太小
        calculatedMinScale = max(0.1, calculatedMinScale)
    }
    
    // 限制偏移量，确保图片边缘不会出现在表盘可见范围内
    private func limitOffset(_ proposedOffset: CGSize, image: UIImage, screenSize: CGSize) -> CGSize {
        // 获取图片原始尺寸
        let imageSize = image.size
        
        // 由于使用了.scaledToFill()，我们需要计算图片在屏幕上的实际显示尺寸
        // 首先计算图片的宽高比
        let imageAspectRatio = imageSize.width / imageSize.height
        let screenAspectRatio = screenSize.width / screenSize.height
        
        // 根据宽高比计算.scaledToFill()后的尺寸
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
        
        // 然后应用当前的缩放比例
        let scaledWidth = fillWidth * scale
        let scaledHeight = fillHeight * scale
        
        // 计算图片与屏幕的尺寸差异的一半（这是最大可以偏移的距离）
        let maxOffsetX = max(0, (scaledWidth - screenSize.width) / 2)
        let maxOffsetY = max(0, (scaledHeight - screenSize.height) / 2)
        
        // 限制偏移范围，确保图片边缘不会出现在可见范围内
        let limitedX = min(max(proposedOffset.width, -maxOffsetX), maxOffsetX)
        let limitedY = min(max(proposedOffset.height, -maxOffsetY), maxOffsetY)
        
        return CGSize(width: limitedX, height: limitedY)
    }
    
    // 重置到初始状态 - 简化版本
    private func resetToInitial() {
        withAnimation(.easeInOut(duration: 0.2)) {
            scale = 1.0
            offset = .zero
            lastOffset = .zero
            wrapper.updateTransform(offset: CGSize.zero, scale: 1.0)
        }
        onReset?()
    }
}

/// 预览
#Preview {
    SimpleImageEditorView(
        imageName: "bug5"
    )
    .environmentObject(SimpleImageEditorViewWrapper())
} 