import SwiftUI
import WatchKit

/// 图片占比编辑视图 - 用于调节图片在全屏视图中的位置和大小
struct ImageProportionEditorView: View {
    @ObservedObject var model: BugOffModel
    let imageName: String
    let onSave: (CGFloat, CGSize) -> Void
    
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var minScale: CGFloat = 0.2
    @State private var maxScale: CGFloat = 5.0
    
    // 添加计算最小缩放比例的状态
    @State private var calculatedMinScale: CGFloat = 0.1
    
    // 获取屏幕尺寸
    private var screenSize: CGSize {
        AppTheme.screenSize
    }
    
    var body: some View {
        ZStack {
            // 背景
            Color.black.edgesIgnoringSafeArea(.all)
            
            // 图片显示和编辑区域
            GeometryReader { geometry in
                ZStack {
                    // 图片 - 根据当前mode的图片类型显示
                    if let image = getCurrentDisplayImage() {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit() // 使用scaledToFit确保完整显示
                            .scaleEffect(scale)
                            .offset(offset)
                            .gesture(
                                // 拖动手势
                                DragGesture()
                                    .onChanged { value in
                                        let newOffset = CGSize(
                                            width: lastOffset.width + value.translation.width,
                                            height: lastOffset.height + value.translation.height
                                        )
                                        // 限制拖动范围
                                        offset = limitOffset(newOffset, image: image, screenSize: screenSize)
                                    }
                                    .onEnded { _ in
                                        lastOffset = offset
                                    }
                            )
                    } else {
                        Text("无法加载图片")
                            .foregroundColor(.white)
                    }
                    

                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .clipped()
            }
            .edgesIgnoringSafeArea(.all)
            
            // 底部控制按钮
            VStack {
                Spacer()
                
                HStack(spacing: AppTheme.largePadding) {
                    // 重置按钮
                    Button(action: resetToInitial) {
                        Image(systemName: "arrow.counterclockwise.circle.fill")
                    }
                    .floatingActionButtonStyle(
                        color: AppTheme.warningColor,
                        size: AppTheme.buttonHeight
                    )
                    
                    // 保存按钮
                    Button(action: saveAndDismiss) {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    .floatingActionButtonStyle(
                        color: AppTheme.successColor,
                        size: AppTheme.buttonHeight
                    )
                }
                .padding(.bottom, AppTheme.largePadding)
            }
            
            // 顶部缩放信息显示
            VStack {
                HStack {
                    Spacer()
                    Text(String(format: "%.1f×", scale))
                        .hintTextStyle()
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.black.opacity(0.5))
                        .cornerRadius(8)
                }
                .padding(.horizontal)
                .padding(.top, AppTheme.mediumPadding)
                
                Spacer()
            }
        }
        .onAppear {
            loadCurrentSettings()
        }
        // 数字表冠控制缩放
        .focusable(true)
        .digitalCrownRotation(
            $scale,
            from: minScale,
            through: maxScale,
            by: 0.1,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: scale) { oldValue, newValue in
            // 检查边界限制
            var clampedValue = newValue
            var hitBoundary = false

            if newValue >= maxScale {
                clampedValue = maxScale
                hitBoundary = true
            } else if newValue <= minScale {
                clampedValue = minScale
                hitBoundary = true
            }

            // 如果达到边界，强制设置为边界值
            if hitBoundary && clampedValue != scale {
                scale = clampedValue
                WKInterfaceDevice.current().play(.notification)
                return
            }

            // 当缩放变化时，调整偏移量以保持图片居中
            if let image = getCurrentDisplayImage() {
                // 计算缩放比例变化
                let scaleFactor = clampedValue / oldValue

                // 根据缩放比例变化调整偏移量
                let newOffset = CGSize(
                    width: offset.width * scaleFactor,
                    height: offset.height * scaleFactor
                )

                // 限制新的偏移量
                offset = limitOffset(newOffset, image: image, screenSize: screenSize)
                lastOffset = offset
            }
        }
    }
    
    // MARK: - Helper Methods
    
    /// 获取当前显示的图片
    private func getCurrentDisplayImage() -> UIImage? {
        Logger.debug("图片裁剪视图：getCurrentDisplayImage - imageName: \(imageName)", category: .ui)

        // 首先检查是否有圈选裁剪的图片
        if let circleImage = getCircleSelectionImage() {
            Logger.debug("图片裁剪视图：使用圈选裁剪图片", category: .ui)
            return circleImage
        }

        // 检查是否有自定义图片URL（用户选择的图片）
        let config = model.getCustomTriggerDisplay(for: imageName)
        Logger.debug("图片裁剪视图：config.customImageURL = \(config.customImageURL ?? "nil")", category: .ui)
        Logger.debug("图片裁剪视图：config.isEnabled = \(config.isEnabled)", category: .ui)
        Logger.debug("图片裁剪视图：config.displayMode = \(config.displayMode)", category: .ui)

        if let customImageURL = config.customImageURL, !customImageURL.isEmpty {
            Logger.debug("图片裁剪视图：尝试加载自定义图片: \(customImageURL)", category: .ui)

            // 创建文件URL
            let url: URL
            if customImageURL.hasPrefix("file://") {
                guard let parsedURL = URL(string: customImageURL) else {
                    Logger.error("无法解析自定义图片URL: \(customImageURL)", category: .ui)
                    return model.imageManager.getDisplayImage(for: imageName)
                }
                url = parsedURL
            } else {
                url = URL(fileURLWithPath: customImageURL)
            }

            Logger.debug("图片裁剪视图：文件URL: \(url)", category: .ui)

            // 加载自定义图片
            do {
                let data = try Data(contentsOf: url)
                Logger.debug("图片裁剪视图：数据加载成功，大小: \(data.count) bytes", category: .ui)

                if let customImage = UIImage(data: data) {
                    Logger.success("图片裁剪视图：成功加载自定义图片，尺寸: \(customImage.size)", category: .ui)
                    return customImage
                } else {
                    Logger.error("无法从数据创建UIImage", category: .ui)
                }
            } catch {
                Logger.error("加载自定义图片失败: \(error)", category: .ui)
            }
        } else {
            Logger.debug("图片裁剪视图：没有自定义图片URL", category: .ui)
        }

        // 否则获取普通的显示图片
        Logger.debug("图片裁剪视图：使用原始mode图片", category: .ui)
        return model.imageManager.getDisplayImage(for: imageName)
    }
    
    /// 获取圈选裁剪后的图片
    private func getCircleSelectionImage() -> UIImage? {
        let config = model.getCustomTriggerDisplay(for: imageName)
        
        // 检查是否有主图圈选数据
        guard let selectionData = config.mainCircleSelectionData,
              !selectionData.pathPoints.isEmpty else {
            return nil
        }
        
        // 获取原始图片
        guard let originalImage = model.imageManager.getOriginalImage(for: imageName) else {
            return nil
        }
        
        // 应用圈选裁剪
        return model.applyCircleSelectionToImage(
            originalImage,
            selectionData: selectionData,
            scale: config.mainImageScale,
            offset: config.mainImageOffset
        )
    }
    
    /// 加载当前设置
    private func loadCurrentSettings() {
        _ = model.imageManager.getImageSettings(for: imageName)
        
        // 获取当前显示的图片
        guard let image = getCurrentDisplayImage() else {
            scale = 1.0
            offset = .zero
            lastOffset = .zero
            return
        }
        
        // 计算最小缩放比例
        calculateMinScale(image: image)
        
        // 关键修复：确保初始显示大小与全屏视图一致
        // 全屏视图的显示逻辑是：先应用 scaledToFit/scaledToFill，再应用用户设置的缩放比例
        // 但在图片占比视图中，我们使用 scaledToFit，所以需要调整初始缩放比例
        
        let imageSize = image.size
        let _ = imageSize.width / imageSize.height
        let _ = screenSize.width / screenSize.height
        
        // 判断图片类型，确定全屏视图使用的缩放模式
        let isCircleSelectionImage = getCircleSelectionImage() != nil
        
        var baseScale: CGFloat = 1.0
        
        if isCircleSelectionImage {
            // 圈选图片在全屏视图中使用 scaledToFit
            // 计算 scaledToFit 的基础缩放比例
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = min(scaleX, scaleY)
        } else {
            // 普通图片在全屏视图中使用 scaledToFill
            // 计算 scaledToFill 的基础缩放比例
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = max(scaleX, scaleY)
        }
        
        // 图片占比视图使用 scaledToFit，计算其基础缩放比例
        let fitScaleX = screenSize.width / imageSize.width
        let fitScaleY = screenSize.height / imageSize.height
        let fitBaseScale = min(fitScaleX, fitScaleY)
        
        // 计算需要应用的缩放比例，使得图片占比视图的显示大小与全屏视图一致
        let scaleFactor = baseScale / fitBaseScale
        
        // 始终使用1倍作为初始比例，忽略之前保存的设置
        scale = scaleFactor // 只应用基础缩放因子，确保图片初始状态完全适应屏幕

        // 始终重置偏移量为零，确保每次进入都是居中状态
        offset = .zero
        lastOffset = .zero
    }
    
    /// 计算图片的最小缩放比例
    private func calculateMinScale(image: UIImage) {
        let imageSize = image.size

        // 对于scaledToFit模式，最小缩放比例应该让图片完全显示在屏幕内
        let scaleX = screenSize.width / imageSize.width
        let scaleY = screenSize.height / imageSize.height
        calculatedMinScale = min(scaleX, scaleY)

        // 使用固定的最小缩放比例，不再使用计算值
        // 这样可以确保用户始终可以缩小到相同的比例
        calculatedMinScale = minScale
    }
    
    /// 限制偏移量
    private func limitOffset(_ proposedOffset: CGSize, image: UIImage, screenSize: CGSize) -> CGSize {
        let imageSize = image.size

        // 对于scaledToFit模式，计算图片的实际显示尺寸
        let scaleX = screenSize.width / imageSize.width
        let scaleY = screenSize.height / imageSize.height
        let fitScale = min(scaleX, scaleY)

        let displayWidth = imageSize.width * fitScale * scale
        let displayHeight = imageSize.height * fitScale * scale

        // 计算边界限制：确保图片边缘不会超出屏幕边界
        // 当图片小于屏幕时，限制在屏幕范围内
        // 当图片大于屏幕时，允许移动但不能让图片边缘进入屏幕

        let maxOffsetX: CGFloat
        let maxOffsetY: CGFloat

        if displayWidth > screenSize.width {
            // 图片宽度大于屏幕：允许移动，但图片边缘不能进入屏幕
            maxOffsetX = (displayWidth - screenSize.width) / 2
        } else {
            // 图片宽度小于屏幕：限制在屏幕中心，不允许移动超出屏幕边界
            maxOffsetX = (screenSize.width - displayWidth) / 2
        }

        if displayHeight > screenSize.height {
            // 图片高度大于屏幕：允许移动，但图片边缘不能进入屏幕
            maxOffsetY = (displayHeight - screenSize.height) / 2
        } else {
            // 图片高度小于屏幕：限制在屏幕中心，不允许移动超出屏幕边界
            maxOffsetY = (screenSize.height - displayHeight) / 2
        }

        // 限制偏移范围
        let limitedX = min(max(proposedOffset.width, -maxOffsetX), maxOffsetX)
        let limitedY = min(max(proposedOffset.height, -maxOffsetY), maxOffsetY)

        return CGSize(width: limitedX, height: limitedY)
    }
    
    /// 重置到初始状态
    private func resetToInitial() {
        // 获取当前显示的图片
        guard let image = getCurrentDisplayImage() else {
            withAnimation(.easeInOut(duration: 0.3)) {
                scale = 1.0
                offset = .zero
                lastOffset = .zero
            }
            WKInterfaceDevice.current().play(.click)
            return
        }
        
        // 计算与全屏视图一致的初始缩放比例
        let imageSize = image.size
        let isCircleSelectionImage = getCircleSelectionImage() != nil
        
        var baseScale: CGFloat = 1.0
        
        if isCircleSelectionImage {
            // 圈选图片在全屏视图中使用 scaledToFit
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = min(scaleX, scaleY)
        } else {
            // 普通图片在全屏视图中使用 scaledToFill
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = max(scaleX, scaleY)
        }
        
        // 图片占比视图使用 scaledToFit，计算其基础缩放比例
        let fitScaleX = screenSize.width / imageSize.width
        let fitScaleY = screenSize.height / imageSize.height
        let fitBaseScale = min(fitScaleX, fitScaleY)
        
        // 计算需要应用的缩放比例，使得图片占比视图的显示大小与全屏视图一致
        let scaleFactor = baseScale / fitBaseScale
        
        withAnimation(.easeInOut(duration: 0.3)) {
            scale = scaleFactor // 重置为1倍比例（基础缩放因子）
            offset = .zero
            lastOffset = .zero
        }
        
        // 提供触觉反馈
        WKInterfaceDevice.current().play(.click)
    }
    
    /// 保存设置并关闭
    private func saveAndDismiss() {
        // 获取当前显示的图片
        guard let image = getCurrentDisplayImage() else {
            // 如果无法获取图片，使用原始值保存
            onSave(scale, offset)
            WKInterfaceDevice.current().play(.success)
            dismiss()
            return
        }
        
        // 计算需要保存的缩放比例
        let imageSize = image.size
        let isCircleSelectionImage = getCircleSelectionImage() != nil
        
        var baseScale: CGFloat = 1.0
        
        if isCircleSelectionImage {
            // 圈选图片在全屏视图中使用 scaledToFit
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = min(scaleX, scaleY)
        } else {
            // 普通图片在全屏视图中使用 scaledToFill
            let scaleX = screenSize.width / imageSize.width
            let scaleY = screenSize.height / imageSize.height
            baseScale = max(scaleX, scaleY)
        }
        
        // 图片占比视图使用 scaledToFit，计算其基础缩放比例
        let fitScaleX = screenSize.width / imageSize.width
        let fitScaleY = screenSize.height / imageSize.height
        let fitBaseScale = min(fitScaleX, fitScaleY)
        
        // 计算缩放比例因子
        let scaleFactor = baseScale / fitBaseScale
        
        // 将当前缩放比例转换回全屏视图使用的缩放比例
        let savedScale = scale / scaleFactor
        
        // 调用保存回调
        onSave(savedScale, offset)
        
        // 提供触觉反馈
        WKInterfaceDevice.current().play(.success)
        
        // 关闭视图
        dismiss()
    }
}



#Preview {
    ImageProportionEditorView(
        model: BugOffModel(),
        imageName: "bug5",
        onSave: { scale, offset in
            Logger.debug("保存设置: scale=\(scale), offset=\(offset)", category: .ui)
        }
    )
} 