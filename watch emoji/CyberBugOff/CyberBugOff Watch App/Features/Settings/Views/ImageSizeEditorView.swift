import SwiftUI
import WatchKit

/// 通用图片编辑视图 - 支持直接保存到模型或通过回调传递结果
struct ImageSizeEditorView: View {
    @ObservedObject var model: BugOffModel
    let imageName: String

    // 裁剪目标：区分不同入口，确保数据隔离
    enum CropTarget {
        case modeImage      // 裁剪mode主图
        case toastCustom    // 裁剪自定义toast图
    }

    // 保存模式：直接保存到模型或通过回调传递结果
    enum SaveMode {
        case directSave    // 直接保存到模型
        case callback      // 通过回调传递结果
        case configOnly    // 只保存配置，不生成图片文件
    }

    let saveMode: SaveMode
    let cropTarget: CropTarget // 裁剪目标，用于数据隔离
    let onCropCompleted: ((UIImage, CGFloat, CGSize, URL) -> Void)?
    let onConfigCompleted: ((CGRect, CGFloat, CGSize) -> Void)? // 圈选裁剪配置回调
    let onCircleSelectionCompleted: (([CGPoint], CGRect, CGFloat, CGSize) -> Void)? // 圈选路径配置回调
    let useCustomImage: Bool // 是否使用自定义图片（用于区分mode设置和图片自定义场景）
    
    @Environment(\.dismiss) private var dismiss
    @State private var isCropping: Bool = false
    @StateObject private var toastManager = ScaleToastManager()
    @StateObject private var imageEditorWrapper = SimpleImageEditorViewWrapper()

    // 圈选裁剪相关状态
    @State private var isCircleSelecting: Bool = false
    @State private var selectedPathPoints: [CGPoint] = [] // 保存选中的路径点
    
    // 获取屏幕尺寸
    private var screenSize: CGSize {
        AppTheme.screenSize
    }
    
    // 计算裁剪框大小
    private var cropFrameSize: CGSize {
        return screenSize
    }
    
    // 判断是否可以拖动 - 已移至 SimpleImageEditorView
    var body: some View {
        ZStack {
            // 黑色背景，以及作为主视图的编辑器
            SimpleImageEditorView(
                imageName: imageName,
                onReset: {
                    toastManager.showToast()
                },
                isInteractionEnabled: !isCircleSelecting // 圈选时禁用图片交互
            )
            .environmentObject(imageEditorWrapper)
            .edgesIgnoringSafeArea(.all)

            // 圈选覆盖层
            if isCircleSelecting {
                CircleSelectionOverlay(
                    onSelectionComplete: { pathPoints, boundingRect in
                        completeCircleSelection(pathPoints: pathPoints, boundingRect: boundingRect)
                    },
                    onCancel: {
                        cancelCircleSelection()
                    }
                )
                .edgesIgnoringSafeArea(.all)
            }

            // 浮层UI
            VStack {
                Spacer()
                
                // 底部按钮栏
                let hasChanges = abs(imageEditorWrapper.scale - 1.0) > 0.001 || imageEditorWrapper.offset != .zero
                if !isCropping && !isCircleSelecting {
                    if hasChanges {
                        HStack(spacing: AppTheme.largePadding) {
                            // 重置按钮
                            Button(action: {
                                withAnimation(AppTheme.standardAnimation()) {
                                    imageEditorWrapper.resetToInitial()
                                }
                                toastManager.showToast()
                            }) {
                                Image(systemName: "arrow.counterclockwise.circle.fill")
                            }
                            .floatingActionButtonStyle(
                                color: AppTheme.warningColor,
                                size: AppTheme.buttonHeight
                            )

                            // 圈选按钮（仅在配置模式下显示）
                            if saveMode == .configOnly {
                                Button(action: {
                                    startCircleSelection()
                                }) {
                                    Image(systemName: "circle.dashed")
                                }
                                .floatingActionButtonStyle(
                                    color: AppTheme.primaryColor,
                                    size: AppTheme.buttonHeight
                                )
                            }

                            // 圈选按钮（在callback模式下也显示）
                            if saveMode == .callback {
                                Button(action: {
                                    startCircleSelection()
                                }) {
                                    Image(systemName: "circle.dashed")
                                }
                                .floatingActionButtonStyle(
                                    color: AppTheme.primaryColor,
                                    size: AppTheme.buttonHeight
                                )
                            }

                            // 确认按钮（配置模式下只有在有圈选数据时才显示）
                            if saveMode != .configOnly || !selectedPathPoints.isEmpty {
                                Button(action: {
                                    confirmAndSave()
                                }) {
                                    Image(systemName: "checkmark.circle.fill")
                                }
                                .floatingActionButtonStyle(
                                    color: AppTheme.successColor,
                                    size: AppTheme.buttonHeight
                                )
                            }
                        }
                        .padding(.bottom, AppTheme.largePadding)
                    } else if saveMode == .configOnly {
                        // 没有变化时的按钮显示（配置模式）
                        HStack(spacing: AppTheme.largePadding) {
                            // 圈选按钮
                            Button(action: {
                                startCircleSelection()
                            }) {
                                Image(systemName: "circle.dashed")
                            }
                            .floatingActionButtonStyle(
                                color: AppTheme.primaryColor,
                                size: AppTheme.buttonHeight
                            )

                            // 如果有圈选数据，显示确认按钮
                            if !selectedPathPoints.isEmpty {
                                Button(action: {
                                    confirmAndSave()
                                }) {
                                    Image(systemName: "checkmark.circle.fill")
                                }
                                .floatingActionButtonStyle(
                                    color: AppTheme.successColor,
                                    size: AppTheme.buttonHeight
                                )
                            }
                        }
                        .padding(.bottom, AppTheme.largePadding)
                    } else if saveMode == .callback {
                        // 没有变化时的按钮显示（回调模式）
                        HStack(spacing: AppTheme.largePadding) {
                            // 圈选按钮
                            Button(action: {
                                startCircleSelection()
                            }) {
                                Image(systemName: "circle.dashed")
                            }
                            .floatingActionButtonStyle(
                                color: AppTheme.primaryColor,
                                size: AppTheme.buttonHeight
                            )

                            // 确认按钮 - 即使没有圈选数据也显示，用于传统裁剪
                            Button(action: {
                                confirmAndSave()
                            }) {
                                Image(systemName: "checkmark.circle.fill")
                            }
                            .floatingActionButtonStyle(
                                color: AppTheme.successColor,
                                size: AppTheme.buttonHeight
                            )
                        }
                        .padding(.bottom, AppTheme.largePadding)
                    }
                }
            }
            
            // 缩放提示
            ScaleToast(message: String(format: "%.1f×", imageEditorWrapper.scale), isVisible: $toastManager.isVisible)
            
            // 裁剪中的加载指示器
            if isCropping {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color.textPrimary))
                    .scaleEffect(1.5)
                    .background(AppTheme.backgroundColor.opacity(0.7))
                    .frame(width: 60, height: 60)
                    .cornerRadius(AppTheme.cornerRadius)
            }
        }
        .edgesIgnoringSafeArea(.all)
        .onAppear {
            loadImage()
        }
        .onDisappear {
            cleanupTemporaryFiles()
            // 清除自定义图片缓存
            imageEditorWrapper.clearCustomImage(for: imageName)
        }
        .onChange(of: imageEditorWrapper.scale) { _, _ in
            toastManager.showToast()
        }
    }
    
    // 加载图片
    private func loadImage() {
        // 只有在允许使用自定义图片时才检查自定义图片URL
        if useCustomImage {
            // 检查是否有自定义图片URL（用户选择的图片）
            let config = model.getCustomTriggerDisplay(for: imageName)

            if let customImageURL = config.customImageURL, !customImageURL.isEmpty {
            // 创建文件URL
            let url: URL
            if customImageURL.hasPrefix("file://") {
                guard let parsedURL = URL(string: customImageURL) else {
                    fallbackToOriginalImage()
                    return
                }
                url = parsedURL
            } else {
                url = URL(fileURLWithPath: customImageURL)
            }

            // 加载自定义图片
            do {
                let data = try Data(contentsOf: url)

                if let customImage = UIImage(data: data) {
                    // 直接设置自定义图片到缓存中
                    imageEditorWrapper.setCustomImage(customImage, for: imageName)

                    // 触发图片加载（这次会从缓存中获取自定义图片）
                    _ = imageEditorWrapper.getOriginalImage(named: imageName)
                    return
                }
            } catch {
                // 加载失败，继续使用原始图片
            }
            } else {
                #if DEBUG
                Logger.debug("ImageSizeEditorView: 没有自定义图片URL", category: .ui)
                #endif
            }
        } else {
            #if DEBUG
            Logger.debug("ImageSizeEditorView: 不使用自定义图片，直接使用原始图片", category: .ui)
            #endif
        }

        // 后备方案：使用原始图片
        fallbackToOriginalImage()
    }

    private func fallbackToOriginalImage() {
        // 这里只是为了确保在wrapper中图片被加载，实际显示由SimpleImageEditorView处理
        _ = imageEditorWrapper.getOriginalImage(named: imageName)
    }

    /// 临时保存自定义图片，供SimpleImageEditorView使用
    private func saveCustomImageTemporarily(_ image: UIImage, fileName: String) -> Bool {
        guard let data = image.pngData() else {
            Logger.error("无法转换图片为PNG数据", category: .ui)
            return false
        }

        let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let tempURL = documentsDirectory.appendingPathComponent("\(fileName).png")

        do {
            try data.write(to: tempURL)
            Logger.success("临时保存自定义图片: \(tempURL)", category: .ui)
            return true
        } catch {
            Logger.error("保存临时图片失败: \(error)", category: .ui)
            return false
        }
    }

    /// 清理临时文件
    private func cleanupTemporaryFiles() {
        let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let tempFileName = "temp_custom_\(imageName).png"
        let tempURL = documentsDirectory.appendingPathComponent(tempFileName)

        if FileManager.default.fileExists(atPath: tempURL.path) {
            do {
                try FileManager.default.removeItem(at: tempURL)
                Logger.debug("已清理临时文件: \(tempFileName)", category: .ui)
            } catch {
                Logger.error("清理临时文件失败: \(error)", category: .ui)
            }
        }
    }
    
    // 确认并保存
    private func confirmAndSave() {
        switch saveMode {
        case .configOnly:
            // 配置模式：检查是否有手势圈选数据
            if !selectedPathPoints.isEmpty {
                // 有手势圈选数据，保存配置参数
                let cropRect = calculateCropRect()
                
                // 如果有圈选回调，使用它
                if let circleCallback = onCircleSelectionCompleted {
                    let normalizedPathPoints = normalizePathPoints(selectedPathPoints)
                    circleCallback(normalizedPathPoints, cropRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                    dismiss()
                    return
                }
                
                // 否则使用普通配置回调
                onConfigCompleted?(cropRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                dismiss()
                return
            }

            // 没有手势圈选数据：表示用户仅调整比例/位置或无改动
            // 这种情况下应清除主图圈选数据，避免沿用旧圈选
            if let configDone = onConfigCompleted {
                // 如果上层只要配置（不生成图片），回调配置并清除圈选
                let cropRect = calculateCropRect()
                configDone(cropRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                // 子层仅暂存清空圈选，由父层统一落盘
                model.triggerManager.clearMainCircleSelection(for: self.imageName)
                NotificationCenter.default.post(
                    name: NSNotification.Name("CircleSelectionUpdated"),
                    object: nil,
                    userInfo: ["imageName": self.imageName]
                )
                dismiss()
                return
            }
            // 其余情况，进入传统裁剪流程（与 callback 分支一致）
            isCropping = true
            DispatchQueue.global(qos: .userInitiated).async {
                guard let croppedImage = imageEditorWrapper.cropImage(
                    imageName: self.imageName,
                    cropSize: self.cropFrameSize
                ) else {
                    DispatchQueue.main.async { self.isCropping = false }
                    return
                }
                let compressedImage = ImageCompressionUtils.compressImage(croppedImage, level: .high) ?? croppedImage
                guard let data = compressedImage.jpegData(compressionQuality: 0.7) else {
                    DispatchQueue.main.async { self.isCropping = false }
                    return
                }
                let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
                let fileURL = documentsDirectory.appendingPathComponent("\(imageName)_cropped_\(Date().timeIntervalSince1970).jpg")
                do {
                    try data.write(to: fileURL)
                    DispatchQueue.main.async {
                        self.onCropCompleted?(croppedImage, self.imageEditorWrapper.scale, self.imageEditorWrapper.offset, fileURL)
                        // 清除圈选（暂存，不立即落盘），避免沿用旧圈选
                        self.model.triggerManager.clearMainCircleSelection(for: self.imageName)
                        NotificationCenter.default.post(
                            name: NSNotification.Name("CircleSelectionUpdated"),
                            object: nil,
                            userInfo: ["imageName": self.imageName]
                        )
                        ThumbnailGenerator.invalidateAll()
                        self.dismiss()
                    }
                } catch {
                    DispatchQueue.main.async { self.isCropping = false }
                }
            }
            return

        case .callback:
            // 检查是否有圈选数据
            if !selectedPathPoints.isEmpty && onCircleSelectionCompleted != nil {
                // 有圈选数据且有回调，使用圈选模式
                let cropRect = calculateCropRect()
                let normalizedPathPoints = normalizePathPoints(selectedPathPoints)
                onCircleSelectionCompleted?(normalizedPathPoints, cropRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                dismiss()
                return
            }
            
            // 没有圈选数据，使用传统裁剪模式
            isCropping = true

            DispatchQueue.global(qos: .userInitiated).async {
                // 1. 裁剪图片
                guard let croppedImage = imageEditorWrapper.cropImage(
                    imageName: self.imageName,
                    cropSize: self.cropFrameSize
                ) else {
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                    return
                }

                // 2. 压缩并保存图片文件
                let compressedImage = ImageCompressionUtils.compressImage(croppedImage, level: .high) ?? croppedImage
                guard let data = compressedImage.jpegData(compressionQuality: 0.7) else {
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                    return
                }

                let fileManager = FileManager.default
                let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
                let fileName = "\(imageName)_cropped_\(Date().timeIntervalSince1970).jpg"
                let fileURL = documentsDirectory.appendingPathComponent(fileName)

                do {
                    try data.write(to: fileURL)

                    // 3. 在主线程更新模型并关闭视图
                    DispatchQueue.main.async {
                        self.onCropCompleted?(
                            croppedImage,
                            self.imageEditorWrapper.scale,
                            self.imageEditorWrapper.offset,
                            fileURL
                        )
                        
                        // 清除圈选裁剪数据（暂存，不立即落盘），确保传统裁剪和圈选裁剪不会冲突
                        self.model.triggerManager.clearMainCircleSelection(for: self.imageName)

                        // 通知全屏视图和缩略图更新
                        NotificationCenter.default.post(
                            name: NSNotification.Name("CircleSelectionUpdated"),
                            object: nil,
                            userInfo: ["imageName": self.imageName]
                        )

                        // 使缩略图缓存失效
                        ThumbnailGenerator.invalidateAll()
                        
                        self.dismiss()
                    }

                } catch {
                    // print("保存裁剪图片失败: \(error)") // 可选：保留用于调试
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                }
            }
            
        case .directSave:
            // 传统模式：生成裁剪图片文件
            isCropping = true

            DispatchQueue.global(qos: .userInitiated).async {
                // 1. 裁剪图片
                guard let croppedImage = imageEditorWrapper.cropImage(
                    imageName: self.imageName,
                    cropSize: self.cropFrameSize
                ) else {
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                    return
                }

                // 2. 压缩并保存图片文件
                let compressedImage = ImageCompressionUtils.compressImage(croppedImage, level: .high) ?? croppedImage
                guard let data = compressedImage.jpegData(compressionQuality: 0.7) else {
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                    return
                }

                let fileManager = FileManager.default
                let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
                let fileName = "\(imageName)_cropped_\(Date().timeIntervalSince1970).jpg"
                let fileURL = documentsDirectory.appendingPathComponent(fileName)

                do {
                    try data.write(to: fileURL)

                    // 3. 在主线程更新模型并关闭视图
                    DispatchQueue.main.async {
                        self.model.updateCroppedImage(for: self.imageName, croppedImageURL: fileURL)
                        
                        // 清除圈选裁剪数据，确保传统裁剪和圈选裁剪不会冲突
                        self.model.triggerManager.clearMainCircleSelection(for: self.imageName)
                        
                        // 通知全屏视图和缩略图更新
                        NotificationCenter.default.post(
                            name: NSNotification.Name("CircleSelectionUpdated"),
                            object: nil,
                            userInfo: ["imageName": self.imageName]
                        )
                        
                        // 使缩略图缓存失效
                        ThumbnailGenerator.invalidateAll()
                        
                        self.dismiss()
                    }

                } catch {
                    // print("保存裁剪图片失败: \(error)") // 可选：保留用于调试
                    DispatchQueue.main.async {
                        self.isCropping = false
                    }
                }
            }
        }
    }

    // MARK: - 圈选裁剪相关方法

    /// 开始圈选
    private func startCircleSelection() {
        withAnimation(AppTheme.standardAnimation()) {
            isCircleSelecting = true
        }
    }

    /// 完成圈选
    private func completeCircleSelection(pathPoints: [CGPoint], boundingRect: CGRect) {
        // 保存圈选的路径点
        selectedPathPoints = pathPoints

        // 根据保存模式处理结果
        switch saveMode {
        case .configOnly:
            // 将路径点转换为相对坐标并保存
            let normalizedPathPoints = normalizePathPoints(pathPoints)

            // 如果有圈选路径回调，使用它；否则使用普通配置回调
            if let circleCallback = onCircleSelectionCompleted {
                circleCallback(normalizedPathPoints, boundingRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                dismiss()
            } else if let configCallback = onConfigCompleted {
                // 普通配置回调模式：直接调用配置回调并关闭视图
                configCallback(boundingRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                dismiss()
            } else {
                // 没有回调的情况：圈选完成后退出圈选模式，但不立即关闭视图
                // 用户需要点击确认按钮才能完成操作
                withAnimation(AppTheme.standardAnimation()) {
                    isCircleSelecting = false
                }
            }
        case .callback:
            // 回调模式下也直接处理圈选结果
            if let circleCallback = onCircleSelectionCompleted {
                let normalizedPathPoints = normalizePathPoints(pathPoints)
                circleCallback(normalizedPathPoints, boundingRect, imageEditorWrapper.scale, imageEditorWrapper.offset)
                dismiss()
            } else {
                // 没有圈选回调，退出圈选模式
                withAnimation(AppTheme.standardAnimation()) {
                    isCircleSelecting = false
                }
            }
        default:
            // 其他模式暂时不支持圈选
            cancelCircleSelection()
        }
    }

    /// 将路径点转换为相对坐标
    private func normalizePathPoints(_ points: [CGPoint]) -> [CGPoint] {
        let screenSize = AppTheme.screenSize

        #if DEBUG
        Logger.debug("🔄 坐标转换信息:", category: .ui)
        Logger.debug("   屏幕尺寸: \(screenSize)", category: .ui)
        Logger.debug("   输入路径点数量: \(points.count)", category: .ui)
        Logger.debug("   前3个输入点: \(points.prefix(3))", category: .ui)
        #endif

        let normalizedPoints = points.map { screenPoint in
            // 简单的屏幕坐标到相对坐标转换
            let normalizedPoint = CGPoint(
                x: screenPoint.x / screenSize.width,
                y: screenPoint.y / screenSize.height
            )

            return normalizedPoint
        }

        #if DEBUG
        Logger.debug("   输出路径点数量: \(normalizedPoints.count)", category: .ui)
        Logger.debug("   前3个输出点: \(normalizedPoints.prefix(3))", category: .ui)
        #endif

        return normalizedPoints
    }

    /// 取消圈选
    private func cancelCircleSelection() {
        withAnimation(AppTheme.standardAnimation()) {
            isCircleSelecting = false
        }
        // 清除已保存的路径点
        selectedPathPoints.removeAll()
    }

    /// 计算当前变换的裁剪矩形（用于缩放拖拽模式）
    private func calculateCropRect() -> CGRect {
        let screenSize = AppTheme.screenSize

        // 基于当前的缩放和偏移计算裁剪区域
        // 这里返回相对于原图的比例坐标
        let normalizedX = (screenSize.width / 2 - imageEditorWrapper.offset.width) / (screenSize.width * imageEditorWrapper.scale)
        let normalizedY = (screenSize.height / 2 - imageEditorWrapper.offset.height) / (screenSize.height * imageEditorWrapper.scale)
        let normalizedWidth = 1.0 / imageEditorWrapper.scale
        let normalizedHeight = 1.0 / imageEditorWrapper.scale

        return CGRect(
            x: normalizedX - normalizedWidth / 2,
            y: normalizedY - normalizedHeight / 2,
            width: normalizedWidth,
            height: normalizedHeight
        )
    }


}

// MARK: - 便利初始化方法

extension ImageSizeEditorView {
    /// 创建直接保存到模型的图片编辑器（用于mode设置，使用原始图片）
    static func createDirectSaveEditor(
        model: BugOffModel,
        imageName: String
    ) -> ImageSizeEditorView {
        return ImageSizeEditorView(
            model: model,
            imageName: imageName,
            saveMode: .directSave,
            cropTarget: .modeImage, // mode设置视图中裁剪mode图片
            onCropCompleted: nil,
            onConfigCompleted: nil,
            onCircleSelectionCompleted: nil,
            useCustomImage: false // mode设置不使用自定义图片
        )
    }
    
    /// 创建通过回调传递结果的图片编辑器（用于mode设置，使用原始图片）
    static func createCallbackEditor(
        model: BugOffModel,
        imageName: String,
        onCropCompleted: @escaping (UIImage, CGFloat, CGSize, URL) -> Void
    ) -> ImageSizeEditorView {
        return ImageSizeEditorView(
            model: model,
            imageName: imageName,
            saveMode: .callback,
            cropTarget: .modeImage, // mode设置视图中裁剪mode图片
            onCropCompleted: onCropCompleted,
            onConfigCompleted: nil,
            onCircleSelectionCompleted: nil,
            useCustomImage: false // mode设置不使用自定义图片
        )
    }

    /// 创建配置模式的图片编辑器（圈选裁剪，用于mode设置，使用原始图片）
    static func createConfigEditor(
        model: BugOffModel,
        imageName: String,
        onConfigCompleted: @escaping (CGRect, CGFloat, CGSize) -> Void
    ) -> ImageSizeEditorView {
        return ImageSizeEditorView(
            model: model,
            imageName: imageName,
            saveMode: .configOnly,
            cropTarget: .modeImage, // mode设置视图中裁剪mode图片
            onCropCompleted: nil,
            onConfigCompleted: onConfigCompleted,
            onCircleSelectionCompleted: nil,
            useCustomImage: false // mode设置不使用自定义图片
        )
    }

    /// 创建圈选模式的图片编辑器（支持路径圈选，用于图片自定义，使用自定义图片）
    static func createCircleSelectionEditor(
        model: BugOffModel,
        imageName: String,
        onCircleSelectionCompleted: @escaping ([CGPoint], CGRect, CGFloat, CGSize) -> Void
    ) -> ImageSizeEditorView {
        return ImageSizeEditorView(
            model: model,
            imageName: imageName,
            saveMode: .configOnly,
            cropTarget: .toastCustom, // 自定义图片提示中裁剪toast图片
            onCropCompleted: nil,
            onConfigCompleted: nil,
            onCircleSelectionCompleted: onCircleSelectionCompleted,
            useCustomImage: true // 图片自定义使用自定义图片
        )
    }
}

#Preview {
    ImageSizeEditorView.createDirectSaveEditor(
        model: BugOffModel(),
        imageName: "bug5"
    )
}
