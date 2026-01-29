import SwiftUI
import WatchKit

/// 应用设置中心视图
struct AppSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: BugOffModel
    @ObservedObject private var settingsManager = SettingsManager.shared
    
    // 设置选项状态
    @State private var showAboutInfo: Bool = false
    @State private var showResetConfirmation: Bool = false
    @State private var showClearCacheConfirmation: Bool = false
    @State private var showTutorial: Bool = false
    @State private var cacheSize: String = "计算中..."
    
    var body: some View {
        NavigationStack {
            List {
                // 触觉反馈开关
                Toggle(isOn: $settingsManager.hapticFeedbackEnabled) {
                    HStack {
                        Image(systemName: "hand.tap")
                            .foregroundColor(AppTheme.primaryColor)
                            .frame(width: 24)
                        Text("触觉反馈")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(AppTheme.textColor)
                    }
                }
                .tint(AppTheme.primaryColor)
                
                // 使用引导
                Button(action: {
                    showTutorial = true
                }) {
                    SettingsRow(
                        icon: "questionmark.circle",
                        iconColor: AppTheme.successColor,
                        title: "使用引导",
                        subtitle: "重新查看使用教程"
                    )
                }
                .buttonStyle(PlainButtonStyle())
                
                // 存储空间
                SettingsRow(
                    icon: "internaldrive",
                    iconColor: AppTheme.tertiaryTextColor,
                    title: "存储空间",
                    subtitle: cacheSize
                )
                
                // 清除缓存
                Button(action: {
                    showClearCacheConfirmation = true
                }) {
                    SettingsRow(
                        icon: "trash",
                        iconColor: AppTheme.secondaryColor,
                        title: "清除缓存",
                        subtitle: "清除图片和音效缓存"
                    )
                }
                .buttonStyle(PlainButtonStyle())
                
                // 重置设置
                Button(action: {
                    showResetConfirmation = true
                }) {
                    SettingsRow(
                        icon: "arrow.clockwise",
                        iconColor: AppTheme.errorColor,
                        title: "重置设置",
                        subtitle: "恢复所有设置到默认值"
                    )
                }
                .buttonStyle(PlainButtonStyle())
                
                // 关于
                Button(action: {
                    showAboutInfo = true
                }) {
                    SettingsRow(
                        icon: "info.circle",
                        iconColor: AppTheme.primaryColor,
                        title: "关于",
                        subtitle: "版本 \(getAppVersion())"
                    )
                }
                .buttonStyle(PlainButtonStyle())
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(AppTheme.textColor)
                    }
                }
            }
            .onAppear {
                updateCacheSize()
            }
        }
        .sheet(isPresented: $showAboutInfo) {
            AboutView()
        }
        .sheet(isPresented: $showTutorial) {
            TutorialView()
        }
        .alert("确认清除缓存？", isPresented: $showClearCacheConfirmation) {
            Button("取消", role: .cancel) { }
            Button("清除", role: .destructive) {
                clearCache()
            }
        } message: {
            Text("这将清除所有图片和音效缓存，不会删除您的配置数据。")
        }
        .alert("确认重置设置？", isPresented: $showResetConfirmation) {
            Button("取消", role: .cancel) { }
            Button("重置", role: .destructive) {
                resetSettings()
            }
        } message: {
            Text("这将恢复所有设置到默认值，包括触发模式、音效配置等。此操作不可撤销。")
        }
    }
    
    // MARK: - Cache Size
    
    /// 更新缓存大小显示
    private func updateCacheSize() {
        DispatchQueue.global(qos: .utility).async {
            let size = SettingsManager.shared.getFormattedCacheSize()
            DispatchQueue.main.async {
                cacheSize = size
            }
        }
    }
    
    // MARK: - Private Methods
    
    /// 获取应用版本号
    private func getAppVersion() -> String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
    
    /// 清除缓存
    private func clearCache() {
        // 清除图片缓存
        CacheManager.shared.clearAllCaches()
        
        // 清除音效缓存
        model.soundManager.audioService.clearSoundDataCache()
        
        // 触觉反馈
        SettingsManager.shared.playSuccessHaptic()
        
        // 更新缓存大小显示
        updateCacheSize()
    }
    
    /// 重置设置
    private func resetSettings() {
        // 重置所有图片设置
        for imageName in model.defaultImages {
            let defaultSettings = ImageSettings()
            model.imageManager.updateImageSettings(for: imageName, settings: defaultSettings)
        }
        
        // 重置全局设置
        SettingsManager.shared.resetAllSettings()
        
        // 清除所有缓存
        CacheManager.shared.clearAllCaches()
        
        // 触觉反馈
        SettingsManager.shared.playSuccessHaptic()
        
        // 关闭设置视图
        dismiss()
    }
}

// MARK: - 使用引导视图
struct TutorialView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentPage: Int = 0
    
    var body: some View {
        NavigationStack {
            TabView(selection: $currentPage) {
                // 欢迎页
                TutorialPageView(
                    icon: "ladybug.fill",
                    iconColor: AppTheme.primaryColor,
                    title: "欢迎使用",
                    subtitle: "watch emoji",
                    description: "一款有趣的解压小工具\n让每次点击都充满乐趣",
                    tips: nil
                )
                .tag(0)
                
                // 点击触发
                TutorialPageView(
                    icon: "hand.tap.fill",
                    iconColor: AppTheme.successColor,
                    title: "点击触发",
                    subtitle: nil,
                    description: "点击屏幕即可触发音效\n同时显示计数动画",
                    tips: ["单击屏幕触发", "支持连续快速点击", "计数会自动累加"]
                )
                .tag(1)
                
                // 摇晃触发
                TutorialPageView(
                    icon: "arrow.triangle.2.circlepath",
                    iconColor: AppTheme.secondaryColor,
                    title: "摇晃触发",
                    subtitle: nil,
                    description: "摇动手表触发音效\n解放双手，随时解压",
                    tips: ["轻轻摇晃手腕", "灵敏度可调节", "适合运动时使用"]
                )
                .tag(2)
                
                // 表冠触发
                TutorialPageView(
                    icon: "crown.fill",
                    iconColor: AppTheme.accentColor,
                    title: "表冠触发",
                    subtitle: nil,
                    description: "旋转数码表冠触发\n精准控制，一转即响",
                    tips: ["顺时针或逆时针", "旋转速度可调", "单手即可操作"]
                )
                .tag(3)
                
                // 自动触发
                TutorialPageView(
                    icon: "timer",
                    iconColor: Color.purple,
                    title: "自动触发",
                    subtitle: nil,
                    description: "设置定时自动触发\n让音效持续播放",
                    tips: ["可设置间隔时间", "后台也能运行", "适合冥想放松"]
                )
                .tag(4)
                
                // 自定义设置
                TutorialPageView(
                    icon: "slider.horizontal.3",
                    iconColor: AppTheme.primaryColor,
                    title: "个性化定制",
                    subtitle: nil,
                    description: "长按图片进入设置\n打造专属体验",
                    tips: ["自定义显示文字", "选择喜欢的音效", "调整动画效果", "设置显示颜色"]
                )
                .tag(5)
                
                // 音效管理
                TutorialPageView(
                    icon: "music.note.list",
                    iconColor: Color.pink,
                    title: "音效管理",
                    subtitle: nil,
                    description: "丰富的音效选择\n支持自定义导入",
                    tips: ["内置多种音效", "支持音乐导入", "可调节音量速度", "支持音频裁剪"]
                )
                .tag(6)
                
                // 开始使用
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(AppTheme.successColor)
                    
                    Text("准备就绪！")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(AppTheme.textColor)
                    
                    Text("开始你的解压之旅")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.secondaryTextColor)
                    
                    Button(action: {
                        SettingsManager.shared.markTutorialCompleted()
                        dismiss()
                    }) {
                        HStack {
                            Text("开始使用")
                            Image(systemName: "arrow.right")
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(AppTheme.primaryColor)
                        .cornerRadius(25)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.top, 15)
                }
                .tag(7)
            }
            .tabViewStyle(.verticalPage)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(AppTheme.textColor)
                    }
                }
            }
        }
    }
}

// MARK: - 教程页面组件
struct TutorialPageView: View {
    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String?
    let description: String
    let tips: [String]?
    
    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                // 图标
                Image(systemName: icon)
                    .font(.system(size: 40))
                    .foregroundColor(iconColor)
                
                // 标题
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(AppTheme.textColor)
                
                // 副标题
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(iconColor)
                }
                
                // 描述
                Text(description)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.secondaryTextColor)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
                
                // 提示列表
                if let tips = tips, !tips.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(tips, id: \.self) { tip in
                            HStack(spacing: 6) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(iconColor)
                                Text(tip)
                                    .font(.system(size: 12))
                                    .foregroundColor(AppTheme.tertiaryTextColor)
                            }
                        }
                    }
                    .padding(.top, 8)
                }
            }
            .padding(.vertical, 10)
        }
    }
}

// MARK: - 设置行组件
struct SettingsRow: View {
    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(iconColor)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.textColor)
                
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.secondaryTextColor)
            }
            
            Spacer()
        }
        .padding(.vertical, 4)
    }
}

// MARK: - 关于视图
struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 15) {
                    // 应用图标
                    Image(systemName: "ladybug.fill")
                        .font(.system(size: 50))
                        .foregroundColor(AppTheme.primaryColor)
                    
                    // 应用名称
                    Text("watch emoji")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(AppTheme.textColor)
                    
                    // 版本信息
                    VStack(spacing: 8) {
                        Text("版本 \(getAppVersion())")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.secondaryTextColor)
                        
                        Text("一款有趣的解压小工具")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.tertiaryTextColor)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                    }
                    
                    Spacer()
                    
                    // 版权信息
                    Text("© 2024 watch emoji")
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.tertiaryTextColor)
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(AppTheme.textColor)
                    }
                }
            }
        }
    }
    
    /// 获取应用版本号
    private func getAppVersion() -> String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}

#Preview {
    AppSettingsView(model: BugOffModel())
}
