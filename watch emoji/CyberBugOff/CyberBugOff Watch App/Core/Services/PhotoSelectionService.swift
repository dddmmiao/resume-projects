import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// 图片选择服务 - 统一处理PhotosPicker的图片选择和保存逻辑
@MainActor
class PhotoSelectionService: ObservableObject {
    
    // MARK: - Types
    
    /// 图片保存类型
    enum ImageSaveType {
        case modeImage                   // Mode图片：通过ImageManager管理
        case customToastImage(String)    // 自定义Toast图片：参数为imageName
        case customImage(String)         // 其他自定义图片：参数为自定义标识符
    }
    
    /// 图片处理结果
    struct ImageProcessResult {
        let imageName: String      // 生成的图片名称
        let imageURL: URL         // 图片文件URL
        let originalImage: UIImage // 原始图片
    }
    
    // MARK: - Properties
    
    @Published var isProcessing: Bool = false
    @Published var errorMessage: String = ""
    @Published var showError: Bool = false
    
    // MARK: - Public Methods
    
    /// 处理选择的图片
    /// - Parameters:
    ///   - item: PhotosPicker选择的图片项
    ///   - saveType: 保存类型
    ///   - compressionQuality: JPEG压缩质量 (0.0-1.0)
    /// - Returns: 图片处理结果
    func handleSelectedPhoto(
        _ item: PhotosPickerItem?,
        saveType: ImageSaveType,
        compressionQuality: CGFloat = 0.8
    ) async -> ImageProcessResult? {

        Logger.info("PhotoSelectionService.handleSelectedPhoto - item: \(item != nil ? "存在" : "nil"), saveType: \(saveType)", category: .imageManager)

        guard let item = item else {
            Logger.error("PhotoSelectionService: 图片项为nil", category: .imageManager)
            await setError("未选择图片")
            return nil
        }
        
        isProcessing = true
        defer { isProcessing = false }
        
        do {
            Logger.debug("开始加载图片数据...", category: .imageManager)

            // 加载图片数据
            guard let data = try await item.loadTransferable(type: Data.self) else {
                Logger.error("无法从PhotosPickerItem加载数据", category: .imageManager)
                await setError("无法加载选择的图片数据")
                return nil
            }

            Logger.debug("图片数据加载成功，大小: \(data.count) bytes", category: .imageManager)

            guard let uiImage = UIImage(data: data) else {
                Logger.error("无法从数据创建UIImage", category: .imageManager)
                await setError("无法解析选择的图片")
                return nil
            }

            Logger.debug("UIImage创建成功，尺寸: \(uiImage.size)", category: .imageManager)

            // 检查图片格式兼容性
            if !ImageFormatHandler.isImageFormatSupported(data) {
                Logger.error("不支持的图片格式", category: .imageManager)
                await setError("不支持的图片格式")
                return nil
            }

            Logger.debug("图片格式检查通过", category: .imageManager)

            // 生成文件名和保存路径
            let (imageName, imageURL) = generateImagePath(for: saveType)
            Logger.debug("生成路径 - imageName: \(imageName), imageURL: \(imageURL)", category: .imageManager)

            // 根据保存类型选择处理配置
            let config = getProcessingConfig(for: saveType, compressionQuality: compressionQuality)

            // 使用ImageFormatHandler处理图片以确保兼容性
            guard let (processedData, format) = ImageFormatHandler.processImage(uiImage, config: config) else {
                await setError("图片处理失败")
                return nil
            }

            // 更新文件扩展名以匹配处理后的格式
            let finalImageURL = updateFileExtension(imageURL, for: format)

            try processedData.write(to: finalImageURL)
            
            let result = ImageProcessResult(
                imageName: imageName,
                imageURL: finalImageURL,
                originalImage: uiImage
            )
            
            // 修正日志：输出最终保存路径，避免与实际扩展名不一致（如处理为PNG时仍显示JPG）
            Logger.success("图片保存成功: \(imageName) -> \(finalImageURL.path)", category: .imageManager)
            return result
            
        } catch {
            await setError("保存图片失败: \(error.localizedDescription)")
            return nil
        }
    }
    
    /// 批量处理多张图片
    /// - Parameters:
    ///   - items: PhotosPicker选择的图片项数组
    ///   - saveType: 保存类型
    ///   - compressionQuality: JPEG压缩质量
    /// - Returns: 图片处理结果数组
    func handleSelectedPhotos(
        _ items: [PhotosPickerItem],
        saveType: ImageSaveType,
        compressionQuality: CGFloat = 0.8
    ) async -> [ImageProcessResult] {
        
        var results: [ImageProcessResult] = []
        
        for item in items {
            if let result = await handleSelectedPhoto(
                item,
                saveType: saveType,
                compressionQuality: compressionQuality
            ) {
                results.append(result)
            }
        }
        
        return results
    }

    /// 处理Mode图片选择（特殊处理，通过ImageManager管理）
    /// - Parameters:
    ///   - item: PhotosPicker选择的图片项
    ///   - model: BugOffModel实例
    /// - Returns: 添加到ImageManager的图片名称
    func handleModeImageSelection(
        _ item: PhotosPickerItem?,
        model: BugOffModel
    ) async -> String? {

        guard let item = item else {
            await setError("未选择图片")
            return nil
        }

        isProcessing = true
        defer { isProcessing = false }

        do {
            // 加载图片数据
            guard let data = try await item.loadTransferable(type: Data.self),
                  let uiImage = UIImage(data: data) else {
                await setError("无法加载选择的图片")
                return nil
            }

            // 生成唯一名称
            let timestamp = Int(Date().timeIntervalSince1970)
            let imageName = "photo_\(timestamp)"

            // 通过ImageManager添加图片（不压缩，保持最高清晰度）
            let newImageName = model.imageManager.addImage(image: uiImage, name: imageName)

            if !newImageName.isEmpty {
                Logger.success("Mode图片添加成功: \(newImageName)", category: .imageManager)
                return newImageName
            } else {
                await setError("添加图片到ImageManager失败")
                return nil
            }

        } catch {
            await setError("处理Mode图片失败: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Private Methods
    
    /// 生成图片路径
    private func generateImagePath(for saveType: ImageSaveType) -> (imageName: String, imageURL: URL) {
        let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let timestamp = Int(Date().timeIntervalSince1970)
        
        let imageName: String
        let fileName: String
        
        switch saveType {
        case .modeImage:
            imageName = "photo_\(timestamp)"
            fileName = "\(imageName).jpg"

        case .customToastImage(let baseName):
            imageName = "custom_toast_\(baseName)_\(timestamp)"
            fileName = "\(imageName).jpg"

        case .customImage(let identifier):
            imageName = "custom_\(identifier)_\(timestamp)"
            fileName = "\(imageName).jpg"
        }
        
        let imageURL = documentsDirectory.appendingPathComponent(fileName)
        return (imageName, imageURL)
    }
    
    /// 根据保存类型获取处理配置
    private func getProcessingConfig(for saveType: ImageSaveType, compressionQuality: CGFloat) -> ImageFormatHandler.ProcessingConfig {
        switch saveType {
        case .modeImage:
            return ImageFormatHandler.ProcessingConfig.default
        case .customToastImage:
            return ImageFormatHandler.ProcessingConfig.toast
        case .customImage:
            return ImageFormatHandler.ProcessingConfig.default
        }
    }

    /// 更新文件扩展名以匹配处理后的格式
    private func updateFileExtension(_ originalURL: URL, for format: UTType) -> URL {
        let directory = originalURL.deletingLastPathComponent()
        let baseName = originalURL.deletingPathExtension().lastPathComponent

        let fileExtension: String
        switch format {
        case .png:
            fileExtension = "png"
        case .jpeg:
            fileExtension = "jpg"
        default:
            fileExtension = "png" // 默认使用PNG
        }

        return directory.appendingPathComponent("\(baseName).\(fileExtension)")
    }

    /// 设置错误信息
    private func setError(_ message: String) async {
        errorMessage = message
        showError = true
        Logger.error("PhotoSelectionService Error: \(message)", category: .imageManager)
    }

    // MARK: - Utility Methods
    
    /// 清除错误状态
    func clearError() {
        errorMessage = ""
        showError = false
    }
    
    /// 检查Documents目录中是否存在指定图片
    static func imageExists(at path: String) -> Bool {
        return FileManager.default.fileExists(atPath: path)
    }
    
    /// 删除指定路径的图片文件
    static func deleteImage(at path: String) -> Bool {
        do {
            try FileManager.default.removeItem(atPath: path)
            Logger.success("图片删除成功: \(path)", category: .imageManager)
            return true
        } catch {
            Logger.error("图片删除失败: \(error)", category: .imageManager)
            return false
        }
    }
    
    /// 获取图片文件大小（字节）
    static func getImageSize(at path: String) -> Int64? {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: path)
            return attributes[.size] as? Int64
        } catch {
            return nil
        }
    }
}

// MARK: - SwiftUI Integration

/// PhotosPicker的SwiftUI包装器，集成PhotoSelectionService
struct PhotoSelectionView: View {
    @StateObject private var photoService = PhotoSelectionService()
    
    let saveType: PhotoSelectionService.ImageSaveType
    let compressionQuality: CGFloat
    let onImageSelected: (PhotoSelectionService.ImageProcessResult) -> Void
    
    @State private var showingPhotosPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    
    init(
        saveType: PhotoSelectionService.ImageSaveType,
        compressionQuality: CGFloat = 0.8,
        onImageSelected: @escaping (PhotoSelectionService.ImageProcessResult) -> Void
    ) {
        self.saveType = saveType
        self.compressionQuality = compressionQuality
        self.onImageSelected = onImageSelected
    }
    
    var body: some View {
        Button(action: { showingPhotosPicker = true }) {
            HStack(alignment: .center) {
                HStack(spacing: AppTheme.smallPadding) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    Text("选择图片")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)
                }
                Spacer()
                
                if photoService.isProcessing {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.appSmall)
                        .foregroundColor(Color.gray)
                }
            }
            .standardRowStyle()
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(photoService.isProcessing)
        .photosPicker(
            isPresented: $showingPhotosPicker,
            selection: $selectedPhotoItem,
            matching: .images
        )
        .onChange(of: selectedPhotoItem) { oldItem, newItem in
            Logger.debug("PhotosPicker onChange - oldItem: \(oldItem != nil ? "存在" : "nil"), newItem: \(newItem != nil ? "存在" : "nil")", category: .ui)

            // 只处理非nil的选择项
            guard newItem != nil else {
                Logger.debug("跳过nil选择项", category: .ui)
                return
            }

            Task {
                Logger.debug("开始处理选择的图片...", category: .ui)
                if let result = await photoService.handleSelectedPhoto(
                    newItem,
                    saveType: saveType,
                    compressionQuality: compressionQuality
                ) {
                    Logger.success("图片处理成功，调用回调", category: .ui)
                    onImageSelected(result)
                } else {
                    Logger.error("图片处理失败", category: .ui)
                }

                // 重要：处理完成后重置选中状态，避免第二次选择时出现问题
                await MainActor.run {
                    selectedPhotoItem = nil
                    Logger.debug("PhotosPicker状态已重置", category: .ui)
                }
            }
        }
        .alert("图片处理错误", isPresented: $photoService.showError) {
            Button("确定") {
                photoService.clearError()
            }
        } message: {
            Text(photoService.errorMessage)
        }
    }
}
