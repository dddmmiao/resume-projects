import SwiftUI

/// Mode配置加载中的视图
struct ModeLoadingView: View {
    let imageName: String
    @State private var isAnimating = false
    
    var body: some View {
        ZStack {
            // 背景
            Color.black
                .ignoresSafeArea()
            
            VStack(spacing: AppTheme.mediumPadding) {
                // 加载动画
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.primaryColor))
                    .scaleEffect(1.5)
                    .opacity(isAnimating ? 1.0 : 0.6)
                    .animation(
                        Animation.easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                        value: isAnimating
                    )
                
                // 加载文本
                VStack(spacing: AppTheme.smallPadding) {
                    Text("加载中...")
                        .titleTextStyle()
                        .foregroundColor(.white)

                    Text("正在准备 \(imageName)")
                        .hintTextStyle()
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .onAppear {
            isAnimating = true
        }
    }
}

/// 带有加载状态的Mode切换视图
struct ModeTransitionView: View {
    @ObservedObject var model: BugOffModel
    let targetImageName: String
    @Binding var showingFullScreen: Bool
    
    @State private var isLoading = true
    @State private var loadingFailed = false
    
    var body: some View {
        Group {
            if isLoading {
                ModeLoadingView(imageName: targetImageName)
            } else if loadingFailed {
                ModeLoadingErrorView(
                    imageName: targetImageName,
                    onRetry: {
                        loadConfiguration()
                    },
                    onCancel: {
                        showingFullScreen = false
                    }
                )
            } else {
                FullScreenImageView(
                    defaultImageName: targetImageName,
                    isPresented: $showingFullScreen,
                    model: model
                )
                .environmentObject(model.imageManager)
                .environmentObject(model.soundManager)
                .environmentObject(model.triggerManager)
            }
        }
        .onAppear {
            loadConfiguration()
        }
    }
    
    private func loadConfiguration() {
        // 检查是否已缓存
        if model.isModeConfigurationCached(for: targetImageName) {
            // 已缓存，直接显示
            isLoading = false
            loadingFailed = false
            return
        }
        
        // 需要加载配置
        isLoading = true
        loadingFailed = false
        
        Task {
            // 使用简单的超时保护
            let result = await loadConfigurationWithTimeout()
            
            await MainActor.run {
                isLoading = false
                loadingFailed = !result
                if result {
                } else {
                    Logger.warning("Mode配置加载失败或超时: \(targetImageName)", category: .ui)
                }
            }
        }
    }
    
    // 带超时的配置加载
    private func loadConfigurationWithTimeout() async -> Bool {
        let configTask = Task {
            return await model.loadModeConfigurationAsync(for: targetImageName)
        }
        
        let timeoutTask = Task {
            do {
                try await Task.sleep(nanoseconds: UInt64(AppConfig.modeLoadingTimeout * 1_000_000_000))
                return false
            } catch {
                return false
            }
        }
        
        // 等待配置加载完成或超时
        let result = await withTaskGroup(of: Bool.self) { group in
            group.addTask { await configTask.value }
            group.addTask { await timeoutTask.value }
            
            let firstResult = await group.next()
            group.cancelAll()
            return firstResult ?? false
        }
        
        // 如果超时了，取消配置加载任务
        if result == false {
            configTask.cancel()
        }
        
        return result
    }
}

/// 加载失败的错误视图
struct ModeLoadingErrorView: View {
    let imageName: String
    let onRetry: () -> Void
    let onCancel: () -> Void
    
    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()
            
            VStack(spacing: AppTheme.mediumPadding) {
                // 错误图标
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 40))
                    .foregroundColor(.orange)
                
                // 错误信息
                VStack(spacing: AppTheme.smallPadding) {
                    Text("加载失败")
                        .titleTextStyle()
                        .foregroundColor(.white)

                    Text("无法加载 \(imageName) 的配置")
                        .hintTextStyle()
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                }
                
                // 操作按钮
                HStack(spacing: AppTheme.mediumPadding) {
                    Button("重试") {
                        onRetry()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.primaryColor)
                    
                    Button("取消") {
                        onCancel()
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }
}

#Preview {
    ModeLoadingView(imageName: "示例模式")
}
