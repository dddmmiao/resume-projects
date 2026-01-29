import SwiftUI

struct CustomImageTriggerConfigView: View {
    @ObservedObject var model: BugOffModel
    let imageName: String
    @Binding var isPresented: Bool
    
    @State private var config: CustomTriggerDisplay
    
    @State private var showingImageSizeEditor: Bool = false
    @State private var showImageSizeSettings: Bool = false
    @State private var showAnimationStyleSettings: Bool = false
    
    init(model: BugOffModel, imageName: String, isPresented: Binding<Bool>) {
        self.model = model
        self.imageName = imageName
        self._isPresented = isPresented
        
        // 获取当前配置并设置为图片模式
        var currentConfig = model.getCustomTriggerDisplay(for: imageName)
        currentConfig.isEnabled = true
        currentConfig.displayMode = .image // 自动切换到图片模式
        self._config = State(initialValue: currentConfig)
    }

    // MARK: - 动画样式设置区域

    /// 动画样式设置区域
    private var animationStyleSection: some View {
        AnimationStyleSelectorView(
            selectedStyle: Binding(
                get: { config.getCurrentAnimationStyle() },
                set: { config.setCurrentAnimationStyle($0) }
            ),
            isExpanded: $showAnimationStyleSettings,
            onStyleChanged: {
                saveSettings()
            }
        )
    }

    var body: some View {
        NavigationView {
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: AppTheme.mediumPadding) {

                    // 选择图片功能行
                    PhotoSelectionView(
                        saveType: .customToastImage(imageName),
                        compressionQuality: 0.8
                    ) { result in
                        // 更新配置，使用自定义图片
                        config.customImageURL = result.imageURL.path
                        // 选择新图片时，重置与旧图片绑定的裁剪/圈选与变换配置，避免继承
                        config.customImageScale = 1.0
                        config.customImageOffset = .zero
                        config.customCropRect = nil
                        config.customCropPath = nil
                        config.circleSelectionData = nil
                        // 图片大小也重置为默认值，避免沿用上一次图片的大小
                        config.imageSize = 60.0
                        Logger.debug("已重置自定义图片裁剪/圈选与大小配置为默认", category: .ui)
                        saveSettings()

                        // 清除Toast图片缓存，确保预览立即更新
                        model.triggerManager.refreshToastImageCache(for: imageName)

                        Logger.success("自定义Toast图片已保存: \(result.imageName)", category: .ui)
                        Logger.debug("Toast图片缓存已刷新，预览将显示新图片", category: .ui)
                    }

                    // 图片裁剪设置
                    Button(action: { showingImageSizeEditor = true }) {
                        HStack(alignment: .center) {
                            HStack(spacing: AppTheme.smallPadding) {
                                Image(systemName: "crop")
                                    .foregroundColor(AppTheme.primaryColor)
                                    .font(.system(size: AppTheme.smallIconSize))
                                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                                Text("图片裁剪")
                                    .font(.appBody)
                                    .foregroundColor(Color.textPrimary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.appSmall)
                                .foregroundColor(Color.gray)
                        }
                        .standardRowStyle()
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    // 动画样式设置区域
                    animationStyleSection

                    // 图片大小设置 - 移到最后一个功能行，与预览效果挨着
                    PerformantExpandableSection(
                        isExpanded: $showImageSizeSettings,
                        header: {
                            HStack(alignment: .center) {
                                // 左侧图标和文本组
                                HStack(spacing: AppTheme.smallPadding) {
                                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                                        .foregroundColor(AppTheme.primaryColor)
                                        .font(.system(size: AppTheme.smallIconSize))
                                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                                    Text("图片大小")
                                        .font(.appBody)
                                        .foregroundColor(Color.textPrimary)
                                }

                                Spacer()

                                // 右侧当前值显示
                                HStack(spacing: 4) {
                                    Image(systemName: showImageSizeSettings ? "chevron.up" : "chevron.down")
                                        .font(.appSmall)
                                        .foregroundColor(Color.gray)
                                }
                            }
                            .frame(height: AppTheme.rowHeight)
                            .padding(.horizontal)
                            .background(AppTheme.secondaryBackgroundColor.opacity(0.5))
                            .cornerRadius(AppTheme.cornerRadius)
                            .contentShape(Rectangle())
                        },
                        content: {
                            imageSizeSliderView
                        },
                        skeleton: {
                            SliderSkeleton()
                        }
                    )
                    .padding(.horizontal)

                    // 预览区域
                    ImagePreviewDisplayView(
                        config: config,
                        imageName: imageName,
                        imageManager: model.imageManager,
                        triggerManager: model.triggerManager
                    )
                }
                .padding(.vertical)
            }
            .navigationTitle("图片自定义")
            .navigationBarTitleDisplayMode(.inline)

        }
        .sheet(isPresented: $showingImageSizeEditor) {
            ImageSizeEditorView.createCircleSelectionEditor(
                model: model,
                imageName: imageName,
                onCircleSelectionCompleted: { pathPoints, cropRect, scale, offset in
                    Logger.debug("圈选完成回调 - 路径点数: \(pathPoints.count), 裁剪区域: \(cropRect), 缩放: \(scale), 偏移: \(offset)", category: .ui)

                    // 应用圈选配置到自定义显示配置（仅用于Toast图片）
                    self.config.customImageScale = scale
                    self.config.customImageOffset = offset
                    self.config.customCropRect = cropRect // 保存圈选裁剪区域
                    self.config.customCropPath = pathPoints // 保存圈选路径点

                    // 创建圈选数据（仅用于Toast图片）
                    let selectionData = CircleSelectionData(
                        pathPoints: pathPoints,
                        boundingRect: cropRect
                    )
                    self.config.circleSelectionData = selectionData
                    Logger.debug("圈选数据已设置 - 点数: \(selectionData.pathPoints.count), 边界: \(selectionData.boundingRect)", category: .ui)

                    // 注意：这里不修改mainCircleSelectionData，保持主图和Toast图片分离

                    // 保存配置
                    Logger.debug("保存配置前 - circleSelectionData: \(self.config.circleSelectionData != nil ? "存在" : "nil")", category: .ui)
                    self.saveSettings()
                    Logger.debug("保存配置后 - 验证配置是否保存成功", category: .ui)

                    // 验证配置是否正确保存
                    let savedConfig = self.model.getCustomTriggerDisplay(for: self.imageName)
                    Logger.debug("验证保存结果 - circleSelectionData: \(savedConfig.circleSelectionData != nil ? "存在" : "nil")", category: .ui)
                    if let savedSelectionData = savedConfig.circleSelectionData {
                        Logger.debug("保存的圈选数据 - 点数: \(savedSelectionData.pathPoints.count)", category: .ui)
                    }

                    // 清除Toast图片缓存，确保预览显示圈选结果
                    self.model.triggerManager.refreshToastImageCache(for: self.imageName)
                    Logger.debug("圈选完成，已刷新Toast缓存以显示圈选结果", category: .ui)

                    // 关闭编辑器
                    self.showingImageSizeEditor = false
                }
            )
        }
        .onAppear {
            // 仅加载配置；即时切换在设置页按钮点击时已完成
            loadSettings()
        }
        .onDisappear {
            // 视图关闭时自动保存设置
            saveSettings()
        }
    }
    
    // MARK: - Subviews
    




    private var imageSizeSliderView: some View {
        VStack(spacing: 4) {
            Slider(value: $config.imageSize, in: 30.0...120.0) { editing in
                if !editing {
                    saveSettings()
                }
            }
            .accentColor(AppTheme.primaryColor)
            .onChange(of: config.imageSize) { _, _ in
                saveSettings()
            }
        }
        .padding(.vertical, AppTheme.smallPadding)
        .cornerRadius(AppTheme.cornerRadius)
    }
    
    // MARK: - Helper Methods
    
    private func loadSettings() {
        config = model.getCustomTriggerDisplay(for: imageName)
        config.isEnabled = true
        config.displayMode = .image // 确保是图片模式
    }
    
    private func saveSettings() {
        // 确保是图片模式
        config.isEnabled = true
        config.displayMode = .image

        model.setCustomTriggerDisplay(for: imageName, config: config)
    }

}

// MARK: - Image Preview Display View
struct ImagePreviewDisplayView: View {
    let config: CustomTriggerDisplay
    let imageName: String
    let imageManager: ImageManager
    let triggerManager: TriggerManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            Text("预览效果")
                .font(.appSmall)
                .foregroundColor(Color.textPrimary)
                .padding(.horizontal)
            
            HStack {
                Spacer()
                
                // 预览图片 - 优先自定义图，缺省回退到mode图
                if let uiImage = triggerManager.getCustomDisplayImage(for: imageName) ?? imageManager.getDisplayImage(for: imageName) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: config.imageSize, height: config.imageSize)
                        .background(AppTheme.secondaryBackgroundColor)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                        )
                } else {
                    RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                        .fill(AppTheme.secondaryBackgroundColor)
                        .frame(width: config.imageSize, height: config.imageSize)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundColor(.gray)
                        )
                }
                
                Spacer()
            }
            .padding()
        }
    }
}

 
