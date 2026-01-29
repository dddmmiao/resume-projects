import SwiftUI
import WatchKit
#if canImport(UIKit)
import UIKit
#endif
import Combine
import Foundation


/// 图片网格面板
struct ImageGridManageView: View {
    @ObservedObject var model: BugOffModel
    @EnvironmentObject var imageManager: ImageManager
    @Binding var showingFullScreen: Bool
    let thumbnailSize: CGFloat
    @Binding var showAddHint: Bool
    let onAddTap: () -> Void           // 点击 + 按钮回调
    let onOpenSettings: () -> Void     // 右滑打开设置

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                LazyVGrid(columns: columns, spacing: 8) {
                    // 添加按钮
                    Button(action: onAddTap) {
                        ZStack {
                            RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                                .stroke(style: StrokeStyle(lineWidth: 1, dash: [4]))
                                .foregroundColor(.gray.opacity(0.6))
                                .frame(width: thumbnailSize, height: thumbnailSize)
                            Image(systemName: "plus")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(AppTheme.primaryColor)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())

                    ForEach(model.defaultImages, id: \.self) { imageName in
                        ThumbnailGridItem(
                            model: model,
                            imageName: imageName,
                            thumbnailSize: thumbnailSize,
                            showingFullScreenImage: $showingFullScreen,
                            useOnDemandLoading: AppConfig.useOnDemandModeLoading // 使用配置控制
                        )
                    }
                }
                .padding(.horizontal, 8)
            }
            .padding(.vertical, 8)
        }
        .onAppear {
            // 只预加载缩略图，不加载配置数据
            ThumbnailGenerator.batchPreload(
                imageNames: model.defaultImages,
                size: thumbnailSize,
                model: model
            )
        }
        // 右滑打开设置
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    if value.translation.width > 40 {
                        onOpenSettings()
                        WKInterfaceDevice.current().play(.click)
                    }
                }
        )
        // 底部一次性添加提示
        .overlay(alignment: .bottom) {
            if showAddHint {
                Text("点击 + 号添加")
                    .font(.appLabel)
                    .padding(6)
                    .background(.ultraThinMaterial)
                    .cornerRadius(8)
                    .padding(.bottom, 5)
                    .transition(.opacity)
            }
        }
    }
}


/// 网格中的单张图片缩略图项，点击跳转到全屏视图
struct ThumbnailGridItem: View {
    @ObservedObject var model: BugOffModel
    @EnvironmentObject var imageManager: ImageManager
    let imageName: String
    let thumbnailSize: CGFloat
    @Binding var showingFullScreenImage: Bool
    let useOnDemandLoading: Bool // 是否使用按需加载

    // 异步缩略图
    @State private var thumb: UIImage? = nil
    // 按需加载状态
    @State private var showingModeTransition = false

    /// 预热缩略图（后台生成并缓存）
    static func preheat(imageName: String, size: CGFloat, model: BugOffModel) {
        Task.detached { _ = await ThumbnailGenerator.thumbnail(for: imageName, size: size, model: model) }
    }

    var body: some View {
        // 当前偏移仅用于缓存 key，显示缩略图时已应用，无需再次用到

        return ZStack {
            // 优先显示用户裁剪后的图片
            Group {
                if let ui = thumb {
                    Image(uiImage: ui)
                        .resizable()
                        .scaledToFill()
                        .frame(width: thumbnailSize, height: thumbnailSize)
                        .transition(.opacity)
                        .animation(.easeInOut(duration: 0.2), value: thumb)
                } else {
                    Color.gray.opacity(0.2)
                }
            }
            .frame(width: thumbnailSize, height: thumbnailSize)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
            .contentShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                    .stroke(Color.black, lineWidth: 1)
            )
        }
        .onTapGesture { handleTap() }
        .fullScreenCover(isPresented: $showingModeTransition) {
            if useOnDemandLoading {
                ModeTransitionView(
                    model: model,
                    targetImageName: imageName,
                    showingFullScreen: $showingModeTransition
                )
            }
        }
        .onReceive(imageManager.objectWillChange) { _ in
            // 当图片相关数据变化时，刷新缩略图
            Task {
                thumb = await ThumbnailGenerator.thumbnail(for: imageName, size: thumbnailSize, model: model)
            }
        }
        .task {
            // 加载缩略图
            if thumb == nil {
                thumb = await ThumbnailGenerator.thumbnail(for: imageName, size: thumbnailSize, model: model)
            }
        }
    }

    private func handleTap() {
        model.selectedDefaultImageName = imageName

        if useOnDemandLoading {
            // 使用按需加载模式
            showingModeTransition = true
        } else {
            // 传统模式，直接显示全屏视图
            showingFullScreenImage = true
        }
    }

    // MARK: - Async Thumbnail
    private func loadThumbnail() async -> UIImage? {
        return await ThumbnailGenerator.thumbnail(for: imageName, size: thumbnailSize, model: model)
    }
} 
