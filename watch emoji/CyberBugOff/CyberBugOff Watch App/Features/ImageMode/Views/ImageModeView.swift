import SwiftUI
import WatchKit
import PhotosUI

/// ViewMode 表示界面的两种显示模式
enum ViewMode {
    case grid      // 网格视图
    case sounds    // 音效列表
}

// MARK: - 主图片模式界面
struct ImageModeView: View {
    @ObservedObject var model: BugOffModel
    @State private var showingDefaultImagePicker = false
    @State private var showingPhotosPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @StateObject private var photoService = PhotoSelectionService()
    @State private var isPlaying = false
    @State private var showingFullScreenImage = false
    @State private var showingSettings = false
    @State private var showingSortSheet = false
    @State private var showingDeleteConfirmation = false
    @State private var pendingDeleteImage: String? = nil
    
    @State private var showAddHint: Bool = false
    @State private var pressedRow: String? = nil
    // 视图模式（两种模式循环切换）
    @State private var viewMode: ViewMode = .grid

    // Digital Crown 焦点管理
    @FocusState private var isGridFocused: Bool
    @FocusState private var isSoundFocused: Bool
    
    // 视图预加载状态
    @State private var isGridViewLoaded: Bool = false
    @State private var isSoundViewLoaded: Bool = false
    
    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    var thumbnailSize: CGFloat {
        return AppTheme.adaptiveSize(80)
    }
    
    var navigationTitle: String {
        switch viewMode {
        case .grid:
            return "图片网格"
        case .sounds:
            return "音效列表"
        }
    }
    
    var viewModeIcon: String {
        switch viewMode {
        case .grid:
            return "speaker.wave.2.fill"  // 当前是网格，点击切换到音效
        case .sounds:
            return "square.grid.2x2"  // 当前是音效，点击切换到网格
        }
    }
    
    var body: some View {
        NavigationStack {
            // 核心性能优化：使用ZStack + opacity避免视图重建，保持两个视图都在内存中
            ZStack {
                gridView
                    .opacity(viewMode == .grid ? 1 : 0)
                    .allowsHitTesting(viewMode == .grid)
                    .focusable(viewMode == .grid)
                    .focused($isGridFocused)
                
                soundView
                    .opacity(viewMode == .sounds ? 1 : 0)
                    .allowsHitTesting(viewMode == .sounds)
                    .focusable(viewMode == .sounds)
                    .focused($isSoundFocused)
            }
            .animation(.none, value: viewMode)
            .onChange(of: viewMode) { _, newMode in
                // 视图切换时自动设置焦点，确保 Digital Crown 立即可用
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    switch newMode {
                    case .grid:
                        isGridFocused = true
                        isSoundFocused = false
                    case .sounds:
                        isSoundFocused = true
                        isGridFocused = false
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: {
                        // 在显示设置视图之前停止所有音效
                        model.stopSound()
                        showingSettings = true
                    }) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: AppTheme.smallIconSize))
                            .foregroundColor(AppTheme.primaryColor)
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: {
                        // 直接切换视图模式
                        switch viewMode {
                        case .grid:
                            viewMode = .sounds
                        case .sounds:
                            viewMode = .grid
                        }
                    }) {
                        Image(systemName: viewModeIcon)
                            .font(.system(size: AppTheme.smallIconSize))
                            .foregroundColor(AppTheme.primaryColor)
                    }
                }
                }
            }
            .sheet(isPresented: $showingDefaultImagePicker) {
                DefaultImagePicker(model: model)
            }
            .photosPicker(
                isPresented: $showingPhotosPicker,
                selection: $selectedPhotoItem,
                matching: .images
            )
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    await handleSelectedPhotoWithService(newItem)
                }
            }
            .sheet(isPresented: $showingSettings) {
                AppSettingsView(model: model)
            }

            .fullScreenCover(isPresented: $showingFullScreenImage) {
                FullScreenImageView(
                    defaultImageName: model.selectedDefaultImageName,
                    isPresented: $showingFullScreenImage,
                    model: model
                )
                .environmentObject(model.imageManager)
                .environmentObject(model.soundManager)
                .environmentObject(model.triggerManager)
            }
            // 删除确认对话框
            .alert("确认删除该mode?", isPresented: Binding(
                get: { pendingDeleteImage != nil },
                set: { if !$0 { pendingDeleteImage = nil } }
            )) {
                Button("取消", role: .cancel) {}
                Button("删除", role: .destructive) {
                    if let img = pendingDeleteImage { deleteImage(img) }
                    pendingDeleteImage = nil
                }
            }
            .onAppear {
                // 确保数据准备就绪
                self.model.refreshDefaultSounds()

                // 预加载视图
                self.preloadAllViews()

                // 后台预热音效缓存
                if AppConfig.enableSoundDataCache && !self.model.defaultSounds.isEmpty {
                    Task.detached(priority: .userInitiated) {
                        await self.model.soundManager.audioService.prewarmAsync(sounds: self.model.defaultSounds)
                    }
                }

                // 延迟显示添加提示
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    if self.model.defaultImages.isEmpty {
                        self.showAddHint = true
                    }
                }
            }
            .onDisappear {
                // 当离开首页时，停止所有正在播放的音效
                self.model.stopSound()
            }
        }
    }

// 将辅助方法放入扩展，避免作用域歧义
extension ImageModeView {

    // MARK: - 图片操作
    private func deleteImage(_ imageName: String) {
        guard let index = model.defaultImages.firstIndex(of: imageName) else { return }
        // 删除关联
        model.imageManager.deleteImage(imageName)
        model.soundManager.removeSoundsForImage(imageName)
        model.triggerManager.removeTriggerSettings(for: imageName)
        model.defaultImages.remove(at: index)
        // 如果删除当前选中图片，切换到第一张
        if model.selectedDefaultImageName == imageName {
            model.selectedDefaultImageName = model.defaultImages.first ?? ""
        }
        model.saveImageOrder()
        WKInterfaceDevice.current().play(.success)
        
        // 如果当前处于网格模式且已无图片，显示一次性提示
        if viewMode == .grid && model.defaultImages.isEmpty {
            showAddHint = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation { showAddHint = false }
            }
        }
    }
    
    private func moveImages(from offsets: IndexSet, to destination: Int) {
        model.defaultImages.move(fromOffsets: offsets, toOffset: destination)
        model.saveImageOrder()
    }
    
    /// 使用PhotoSelectionService处理从PhotosPicker选中的图片
    @MainActor
    private func handleSelectedPhotoWithService(_ item: PhotosPickerItem?) async {
        guard let newImageName = await photoService.handleModeImageSelection(item, model: model) else {
            // 播放失败反馈
            WKInterfaceDevice.current().play(.failure)
            selectedPhotoItem = nil
            return
        }
        
        // 添加到图片列表
        model.defaultImages.insert(newImageName, at: 0)
        model.saveImageOrder()
        
        // 设置为当前选中图片
        model.selectedDefaultImageName = newImageName
        
        // 播放成功反馈
        WKInterfaceDevice.current().play(.success)
        
        // 预加载缩略图
        Task {
            _ = await ThumbnailGenerator.thumbnail(for: newImageName, size: thumbnailSize, model: model)
        }
        
        // 清除选中状态
        selectedPhotoItem = nil
    }
    
    // MARK: - 预加载视图组件
    
    @ViewBuilder
    private var gridView: some View {
        if isGridViewLoaded {
            ImageGridManageView(
                model: self.model,
                showingFullScreen: self.$showingFullScreenImage,
                thumbnailSize: self.thumbnailSize,
                showAddHint: self.$showAddHint,
                onAddTap: {
                    self.showingPhotosPicker = true
                },
                onOpenSettings: { self.showingSettings = true }
            )
            .environmentObject(model.imageManager)
            .environmentObject(model.soundManager)
        } else {
            Color.clear
        }
    }
    
    @ViewBuilder
    private var soundView: some View {
        if isSoundViewLoaded {
            SoundListView(
                model: self.model,
                mode: .edit,
                selectedSound: .constant(nil),
                selectedSounds: .constant(Set<String>()),
                onSoundSelected: nil,
                onSoundsUpdated: nil,
                imageName: nil,
                isActive: true
            )
            .id("soundView-stable")
        } else {
            Color.clear
        }
    }

    // MARK: - 预加载方法

    private func preloadCurrentView() {
        switch viewMode {
        case .grid:
            preloadGridView()
        case .sounds:
            preloadSoundView()
        }
    }

    private func preloadAllViews() {
        preloadGridView()
        preloadSoundView()
    }

    private func preloadGridView() {
        if !isGridViewLoaded {
            isGridViewLoaded = true

            // 预加载缩略图，减少闪烁
            ThumbnailGenerator.preloadThumbnails(
                for: model.defaultImages,
                size: thumbnailSize,
                model: model
            )
        }
    }

    private func preloadSoundView() {
        if !isSoundViewLoaded {
            isSoundViewLoaded = true
        }
    }
}

    struct DefaultImagePicker: View {
        @ObservedObject var model: BugOffModel
        @Environment(\.presentationMode) var presentationMode
        
        let columns = [
            GridItem(.flexible()),
            GridItem(.flexible())
        ]
        
        var thumbnailSize: CGFloat {
            return AppTheme.adaptiveSize(70)
        }
        
        var body: some View {
            VStack {
                Text("选择图片")
                    .titleTextStyle()
                    .padding(.top, 8)
                
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(model.defaultImages, id: \.self) { imageName in
                            Image(imageName)
                                .resizable()
                                .scaledToFill()
                                .frame(width: thumbnailSize, height: thumbnailSize)
                                .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                                        .stroke(model.selectedDefaultImageName == imageName ? Color.blue : Color.clear, lineWidth: 2)
                                )
                                .onTapGesture {
                                    model.selectedDefaultImageName = imageName
                                    presentationMode.wrappedValue.dismiss()
                                }
                        }
                    }
                    .padding(Sizes.smallPadding)
                }
                
                Button("关闭") {
                    presentationMode.wrappedValue.dismiss()
                }
                .primaryCapsuleStyle()
                .padding(.horizontal, Sizes.mediumPadding)
                .padding(.bottom, Sizes.smallPadding)
            }
        }
    }
    
    struct ImageModeView_Previews: PreviewProvider {
        static var previews: some View {
            // 创建一个简化的预览模型，避免复杂的初始化
            let model = createPreviewModel()
            
            // 注入关键的环境对象，让预览环境更稳定
            ImageModeView(model: model)
                .environmentObject(model.imageManager)
                .environmentObject(model.soundManager)
                .environmentObject(model.triggerManager)
        }
        
        // 创建预览专用的模型，避免复杂的初始化导致 crash
        private static func createPreviewModel() -> BugOffModel {
            let model = BugOffModel()
            
            // 为预览设置一些基本的测试数据
            model.defaultImages = ["bug1", "bug2", "bug3"]
            model.selectedDefaultImageName = "bug1"
            
            // 确保所有图片都有基本的设置，包括新的 shakeThreshold 字段
            for imageName in model.defaultImages {
                var settings = ImageSettings()
                settings.setSingleImage(imageName)
                settings.shakeThreshold = AppConfig.defaultShakeThreshold // 确保有默认值
                model.imageManager.updateImageSettings(for: imageName, settings: settings)
            }
            
            return model
        }
    }

