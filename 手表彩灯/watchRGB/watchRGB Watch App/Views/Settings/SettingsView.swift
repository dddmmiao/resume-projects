import SwiftUI
import WatchKit
import StoreKit

/**
 * SettingsView.swift - 设置视图
 *
 * 功能:
 * - 应用设置选项
 * - 语言设置
 * - 关于信息
 * - 版本信息
 */

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var brightnessManager: BrightnessManager
    @ObservedObject var displayModeManager: DisplayModeManager
    @ObservedObject private var colorFormatManager = ColorFormatManager.shared
    
    // 设置选项
    @State private var showAboutInfo: Bool = false
    @State private var showResetConfirmation: Bool = false
    @State private var selectedLanguage: Language = .chinese
    @State private var showTutorialReplay: Bool = false
    @State private var showMembershipCenter: Bool = false
    @State private var showColorFormatSettings: Bool = false
    @State private var showShakeSlider: Bool = false
    @State private var shakeThreshold: Double = GlobalConfig.Shake.defaultThreshold
    @State private var showOptimalSettingsGuide: Bool = false
    
    var body: some View {
        NavigationStack {
            List {
                // 语言设置
                NavigationLink(destination: LanguageSettingsView(selectedLanguage: $selectedLanguage)) {
                    HStack {
                        Image(systemName: "globe")
                            .foregroundColor(GlobalConfig.Colors.primary)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.language")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text(String(format: NSLocalizedString("settings.language.current", comment: ""), selectedLanguage.displayName))
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                
                // 重播引导
                Button(action: {
                    showTutorialReplay = true
                }) {
                    HStack {
                        Image(systemName: "play.circle.fill")
                            .foregroundColor(GlobalConfig.Colors.primary)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.replay.tutorial")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text("settings.replay.tutorial.description")
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())

                // 最佳设置引导 - 已禁用
                // Button(action: {
                //     showOptimalSettingsGuide = true
                // }) {
                //     HStack {
                //         Image(systemName: "gearshape.2.fill")
                //             .foregroundColor(.blue)
                //             .frame(width: GlobalConfig.shared.buttonSize(24))

                //         VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                //             Text("settings.optimal.guide")
                //                 .font(GlobalConfig.Fonts.bodyBold)
                //                 .foregroundColor(GlobalConfig.Colors.primaryText)

                //             Text("settings.optimal.guide.description")
                //                 .font(GlobalConfig.Fonts.caption)
                //                 .foregroundColor(GlobalConfig.Colors.secondaryText)
                //         }

                //         Spacer()
                //     }
                //     .padding(.vertical, GlobalConfig.shared.spacing(4))
                // }
                // .buttonStyle(PlainButtonStyle())

                // 提示颜色格式设置
                Button(action: {
                    showColorFormatSettings = true
                }) {
                    HStack {
                        Image(systemName: "paintpalette")
                            .foregroundColor(GlobalConfig.Colors.accent)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.color.format")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text(colorFormatManager.currentFormat.displayName)
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
                
                // 摇晃灵敏度设置
                Button(action: {
                    if MembershipManager.shared.hasPremiumAccess {
                        // 会员用户：切换滑杆显示
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            showShakeSlider.toggle()
                        }
                    } else {
                        // 非会员用户：跳转到会员中心
                        showMembershipCenter = true
                    }
                }) {
                    HStack {
                        Image(systemName: "iphone.radiowaves.left.and.right")
                            .foregroundColor(GlobalConfig.Colors.primary)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.shake.sensitivity")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text("settings.shake.description")
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()

                        if MembershipManager.shared.hasPremiumAccess {
                            Image(systemName: showShakeSlider ? "chevron.up" : "chevron.down")
                                .font(.system(size: GlobalConfig.shared.fontSize(12)))
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
                
                // 行内滑杆
                if showShakeSlider {
                    ShakeSliderRow(shakeThreshold: $shakeThreshold)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showShakeSlider)
                }
                
                // 会员中心
                Button(action: {
                    showMembershipCenter = true
                }) {
                    HStack {
                        Image(systemName: MembershipManager.shared.isPremium ? "crown.fill" : "crown")
                            .foregroundColor(MembershipManager.shared.isPremium ? .yellow : .gray)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.membership.center")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text(MembershipManager.shared.isPremium ? "settings.membership.premium" : "settings.membership.unlock")
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(MembershipManager.shared.isPremium ? GlobalConfig.Colors.success : GlobalConfig.Colors.secondaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        
                        Spacer()
                        
                        if !MembershipManager.shared.isPremium {
                            Image(systemName: "chevron.right")
                                .font(.system(size: GlobalConfig.shared.fontSize(12)))
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
                
                // 重置设置
                Button(action: {
                    showResetConfirmation = true
                }) {
                    HStack {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(GlobalConfig.Colors.error)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        Text("settings.reset")
                            .font(GlobalConfig.Fonts.bodyBold)
                            .foregroundColor(GlobalConfig.Colors.error)
                        
                        Spacer()
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
                
                // 关于
                Button(action: {
                    showAboutInfo = true
                }) {
                    HStack {
                        Image(systemName: "info.circle")
                            .foregroundColor(GlobalConfig.Colors.primary)
                            .frame(width: GlobalConfig.shared.buttonSize(24))
                        
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text("settings.about")
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text("settings.about.version")
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
            }
            .animation(nil, value: displayModeManager.currentMode)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .medium))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                    }
                }
            }
        }
        .sheet(isPresented: $showAboutInfo) {
            AboutView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .sheet(isPresented: $showTutorialReplay) {
            TutorialReplayView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .sheet(isPresented: $showOptimalSettingsGuide) {
            OptimalSettingsGuideView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .sheet(isPresented: $showColorFormatSettings) {
            ColorFormatSettingsView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .overlay(
            // 在设置视图中也显示Toast，确保语言切换提示可见
            CapsuleToast()
                .allowsHitTesting(false)
        )
        .sheet(isPresented: $showMembershipCenter) {
            MembershipCenterView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
        .alert("settings.reset.confirm.title", isPresented: $showResetConfirmation) {
            Button("settings.reset.confirm.cancel", role: .cancel) { }
            Button("settings.reset.confirm.reset", role: .destructive) {
                resetSettings()
            }
        } message: {
            Text("settings.reset.confirm.message")
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear {
            // 加载当前语言设置
            selectedLanguage = LanguageManager.shared.currentLanguage
            // 异步加载摇晃阈值，避免阻塞主线程
            DispatchQueue.global(qos: .userInitiated).async {
                let threshold = ShakeGestureHandler.shared.shakeThreshold
                DispatchQueue.main.async {
                    self.shakeThreshold = threshold
                }
            }
        }
    }
    
    // 重置设置
    private func resetSettings() {
        // 重置显示模式管理器的设置
        displayModeManager.resetToDefaults()
        
        // 重置亮度
        brightnessManager.brightness = 1.0
        
        // 发送通知，让ContentView处理剩余的重置逻辑
        NotificationCenter.default.post(name: .resetAllSettingsNotification, object: nil)
        
        // 关闭设置视图
        dismiss()
    }
}

// 语言设置视图
struct LanguageSettingsView: View {
    @Binding var selectedLanguage: Language
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        List {
            ForEach(Language.allCases, id: \.self) { language in
                Button(action: {
                    selectedLanguage = language
                    LanguageManager.shared.setLanguage(language)
                    dismiss()
                }) {
                    HStack {
                        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                            Text(language.displayName)
                                .font(GlobalConfig.Fonts.bodyBold)
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                            
                            Text(language.nativeName)
                                .font(GlobalConfig.Fonts.caption)
                                .foregroundColor(GlobalConfig.Colors.secondaryText)
                        }
                        
                        Spacer()
                        
                        if selectedLanguage == language {
                            Image(systemName: "checkmark")
                                .foregroundColor(GlobalConfig.Colors.primary)
                                .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .semibold))
                        }
                    }
                    .padding(.vertical, GlobalConfig.shared.spacing(4))
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .navigationTitle("language.title")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// 语言枚举
enum Language: String, CaseIterable {
    case chinese = "zh-Hans"
    case english = "en"
    case japanese = "ja"
    case korean = "ko"
    case spanish = "es"
    case french = "fr"
    case german = "de"
    
    var displayName: String {
        switch self {
        case .chinese: return "中文 (简体)"
        case .english: return "English"
        case .japanese: return "日本語"
        case .korean: return "한국어"
        case .spanish: return "Español"
        case .french: return "Français"
        case .german: return "Deutsch"
        }
    }
    
    var nativeName: String {
        switch self {
        case .chinese: return "简体中文"
        case .english: return "English"
        case .japanese: return "日本語"
        case .korean: return "한국어"
        case .spanish: return "Español"
        case .french: return "Français"
        case .german: return "Deutsch"
        }
    }
}

// 语言管理器
class LanguageManager: ObservableObject {
    static let shared = LanguageManager()
    
    @Published var currentLanguage: Language {
        didSet {
            UserDefaults.standard.set(currentLanguage.rawValue, forKey: "selectedLanguage")
            // This key is what iOS uses to determine the app's language.
            // A restart might be required for the change to take full effect across the entire app.
            // 用户曾显式选择语言，同步到 AppleLanguages 以便下次启动生效
            UserDefaults.standard.set([currentLanguage.rawValue], forKey: "AppleLanguages")
        }
    }
    
    private init() {
        if let savedLanguage = UserDefaults.standard.string(forKey: "selectedLanguage"),
           let language = Language(rawValue: savedLanguage) {
            currentLanguage = language
        } else {
            // Auto-detect system language on first launch
            let preferredLanguageCode = Locale.preferredLanguages.first ?? "en"
            
            // 特殊处理中文语言代码
            let detectedLanguage: Language
            if preferredLanguageCode.hasPrefix("zh") {
                detectedLanguage = .chinese
            } else {
                // 对于其他语言，使用前两个字符作为语言代码
                let languageCode = String(preferredLanguageCode.prefix(2))
                detectedLanguage = Language(rawValue: languageCode) ?? .english
            }
            
            currentLanguage = detectedLanguage
        }
    }
    
    func setLanguage(_ language: Language) {
        currentLanguage = language
        
        let title = NSLocalizedString("toast.language.switched.title", comment: "")
        let subtitle = NSLocalizedString("toast.language.switched.subtitle", comment: "")
        ToastManager.shared.show(primaryText: "\(title)\n\(subtitle)")
    }
}

// 关于视图
struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: GlobalConfig.shared.spacing(15)) {
                // 应用图标
                    Image(systemName: "sparkles")
                        .font(.system(size: GlobalConfig.shared.fontSize(50)))
                        .foregroundColor(GlobalConfig.Colors.accent)
                
                // 应用名称
                    Text("about.appName")
                        .font(GlobalConfig.Fonts.title)
                
                // 版本信息
                    VStack(spacing: GlobalConfig.shared.spacing(8)) {
                        Text("about.version.number")
                            .font(GlobalConfig.Fonts.caption)
                            .foregroundColor(GlobalConfig.Colors.secondaryText)
                    
                        Text("about.app.description")
                            .font(GlobalConfig.Fonts.caption)
                            .foregroundColor(GlobalConfig.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, GlobalConfig.shared.spacing(20))
                }
                
                Spacer()
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
                    }
                }
            }
        }
    }
}

#Preview {
//    MembershipCenterView()
    SettingsView(displayModeManager: DisplayModeManager())
        .environmentObject(BrightnessManager())
}

// MARK: - 颜色格式管理器
class ColorFormatManager: ObservableObject {
    static let shared = ColorFormatManager()
    
    @Published var currentFormat: ColorFormat = .emoji
    
    private init() {
        // 从UserDefaults加载颜色格式设置
        if let savedFormat = UserDefaults.standard.string(forKey: "selectedColorFormat"),
           let format = ColorFormat(rawValue: savedFormat) {
            // 检查会员状态，非会员只能使用表情符号格式
            if MembershipManager.shared.hasPremiumAccess || format == .emoji {
                currentFormat = format
            } else {
                // 非会员保存的非表情符号格式，重置为表情符号格式
                currentFormat = .emoji
                UserDefaults.standard.set(ColorFormat.emoji.rawValue, forKey: "selectedColorFormat")
            }
        }
    }
    
    func setFormat(_ format: ColorFormat) {
        // 检查会员权限
        if format == .emoji || MembershipManager.shared.hasPremiumAccess {
            currentFormat = format
            UserDefaults.standard.set(format.rawValue, forKey: "selectedColorFormat")
        } else {
            // 非会员尝试设置其他格式时，保持表情符号格式不变
            ToastManager.shared.show(primaryText: NSLocalizedString("toast.premium.required", comment: ""))
        }
    }
    
    // 检查会员状态变化，确保非会员时格式为表情符号
    func checkMembershipStatus() {
        if !MembershipManager.shared.hasPremiumAccess && currentFormat != .emoji {
            setFormat(.emoji)
        }
    }
}

// 颜色格式枚举
enum ColorFormat: String, CaseIterable {
    case emoji = "emoji"
    case rgb = "rgb"
    case hex = "hex"
    
    var displayName: String {
        switch self {
        case .rgb: return NSLocalizedString("color.format.rgb", comment: "")
        case .hex: return NSLocalizedString("color.format.hex", comment: "")
        case .emoji: return NSLocalizedString("color.format.emoji", comment: "")
        }
    }
    
    var description: String {
        switch self {
        case .rgb: return NSLocalizedString("color.format.rgb.description", comment: "")
        case .hex: return NSLocalizedString("color.format.hex.description", comment: "")
        case .emoji: return NSLocalizedString("color.format.emoji.description", comment: "")
        }
    }
    
    var isPremium: Bool {
        switch self {
        case .rgb, .hex:
            return true
        case .emoji:
            return false
        }
    }
}

// MARK: - 会员中心视图
struct MembershipCenterView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var membershipManager = MembershipManager.shared
    @ObservedObject private var storeKitManager = StoreKitManager.shared
    @State private var showPurchaseAlert = false
    @State private var showRestoreAlert = false
    @State private var showErrorAlert = false
    @State private var errorMessage = ""
    
    var body: some View {
        NavigationStack {
            ViewThatFits {
                buildMembershipContentView()
                
                ScrollView {
                    buildMembershipContentView()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .medium))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                    }
                }
            }
        }
        .task {
            // 视图出现时加载产品信息
            await storeKitManager.loadProducts()
        }
        .alert("membership.purchase.error.title", isPresented: $showErrorAlert) {
            Button("common.ok", role: .cancel) { }
        } message: {
            Text(errorMessage)
        }
        .alert("membership.restore.confirm.title", isPresented: $showRestoreAlert) {
            Button("membership.restore.confirm.cancel", role: .cancel) { }
            Button("membership.restore.confirm.restore", role: .none) {
                Task {
                    await storeKitManager.restorePurchases()
                }
            }
        } message: {
            Text("membership.restore.confirm.message")
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    
    @ViewBuilder
    private func buildMembershipContentView() -> some View {
        VStack(spacing: GlobalConfig.shared.spacing(8)) {
            // 会员状态
            VStack(spacing: GlobalConfig.shared.spacing(8)) {
                Image(systemName: membershipManager.hasPremiumAccess ? "crown.fill" : "crown")
                    .font(.system(size: GlobalConfig.shared.fontSize(40)))
                    .foregroundColor(membershipManager.hasPremiumAccess ? .yellow : .gray)
                
                Text(membershipManager.hasPremiumAccess ? "membership.premium.title" : "membership.upgrade.title")
                    .font(.system(size: GlobalConfig.shared.fontSize(17), weight: .bold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                
                Text(membershipManager.hasPremiumAccess ? "membership.premium.description" : "membership.upgrade.description")
                    .font(.system(size: GlobalConfig.shared.fontSize(13)))
                    .foregroundColor(GlobalConfig.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, GlobalConfig.shared.spacing(5))
            
            if !membershipManager.hasPremiumAccess {
                // 功能列表
                VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(8)) {
                    VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(5)) {
                        FeatureRow(icon: "lungs.fill", title: NSLocalizedString("membership.feature.breathing", comment: ""), description: NSLocalizedString("membership.feature.breathing.description", comment: ""), color: .pink)
                        FeatureRow(icon: "slider.horizontal.3", title: NSLocalizedString("membership.feature.rgb", comment: ""), description: NSLocalizedString("membership.feature.rgb.description", comment: ""), color: .green)
                        FeatureRow(icon: "face.smiling", title: NSLocalizedString("membership.feature.emoji", comment: ""), description: NSLocalizedString("membership.feature.emoji.description", comment: ""), color: .yellow)
                        FeatureRow(icon: "swatchpalette.fill", title: NSLocalizedString("membership.feature.colorFormat", comment: ""), description: NSLocalizedString("membership.feature.colorFormat.description", comment: ""), color: .blue)
                        FeatureRow(icon: "shuffle", title: NSLocalizedString("membership.feature.shake", comment: ""), description: NSLocalizedString("membership.feature.shake.description", comment: ""), color: .purple)
                        FeatureRow(icon: "iphone.radiowaves.left.and.right", title: NSLocalizedString("membership.feature.shakeSensitivity", comment: ""), description: NSLocalizedString("membership.feature.shakeSensitivity.description", comment: ""), color: .orange)
                    }
                }
                
                Spacer(minLength: GlobalConfig.shared.spacing(5))
                
                // 购买和恢复按钮
                VStack(spacing: GlobalConfig.shared.spacing(8)) {
                    // 购买按钮
                    purchaseButton
                    
                    // 恢复购买按钮
                    Button(action: {
                        showRestoreAlert = true
                    }) {
                        Text("membership.restore.purchases")
                            .font(.system(size: GlobalConfig.shared.fontSize(13)))
                            .foregroundColor(GlobalConfig.Colors.secondaryText)
                            .underline()
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                
            } else {
                Spacer()
                // 已解锁状态
                VStack(spacing: GlobalConfig.shared.spacing(10)) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: GlobalConfig.shared.fontSize(40)))
                        .foregroundColor(GlobalConfig.Colors.success)
                    
                    Text("membership.unlocked.status")
                        .font(GlobalConfig.Fonts.bodyBold)
                        .foregroundColor(GlobalConfig.Colors.success)
                }
            }
        }
        .padding(.bottom, GlobalConfig.shared.spacing(10))
    }
    
    // 购买按钮
    @ViewBuilder
    private var purchaseButton: some View {
        if let product = storeKitManager.premiumProduct {
            Button(action: {
                Task { await purchaseProduct(product) }
            }) {
                buttonContent(
                    icon: storeKitManager.isPurchasing ? nil : "crown.fill",
                    text: storeKitManager.isPurchasing ? 
                        NSLocalizedString("membership.purchasing", comment: "") :
                        String(format: NSLocalizedString("membership.unlock.button.price", comment: ""), product.displayPrice),
                    isLoading: storeKitManager.isPurchasing,
                    backgroundColor: storeKitManager.isPurchasing ? Color.gray : GlobalConfig.Colors.accent
                )
            }
            .buttonStyle(PlainButtonStyle())
            .disabled(storeKitManager.isPurchasing)
        } else {
            Button(action: {
                if storeKitManager.purchaseError != nil {
                    Task { await storeKitManager.loadProducts() }
                }
            }) {
                buttonContent(
                    icon: storeKitManager.purchaseError != nil ? "arrow.clockwise" : nil,
                    text: storeKitManager.purchaseError != nil ? 
                        NSLocalizedString("membership.loading.retry", comment: "") :
                        NSLocalizedString("membership.loading.products", comment: ""),
                    isLoading: storeKitManager.purchaseError == nil,
                    backgroundColor: storeKitManager.purchaseError != nil ? GlobalConfig.Colors.accent : Color.gray
                )
            }
            .buttonStyle(PlainButtonStyle())
            .disabled(storeKitManager.purchaseError == nil)
        }
    }
    
    // 按钮内容
    @ViewBuilder
    private func buttonContent(icon: String?, text: String, isLoading: Bool, backgroundColor: Color) -> some View {
        HStack {
            if isLoading {
                ProgressView()
                    .scaleEffect(0.8)
                    .progressViewStyle(CircularProgressViewStyle(tint: GlobalConfig.Colors.primaryText))
            } else if let icon = icon {
                Image(systemName: icon)
                    .font(.system(size: GlobalConfig.shared.fontSize(15), weight: .medium))
            }
            
            Text(text)
                .font(.system(size: GlobalConfig.shared.fontSize(15), weight: .medium))
        }
        .foregroundColor(GlobalConfig.Colors.primaryText)
        .padding(.horizontal, GlobalConfig.shared.spacing(25))
        .padding(.vertical, GlobalConfig.shared.spacing(8))
        .background(backgroundColor)
        .clipShape(Capsule())
    }
    
    // 购买产品
    private func purchaseProduct(_ product: Product) async {
        do {
            try await storeKitManager.purchase(product)
            
            // 购买成功后显示成功提示并关闭视图
            if storeKitManager.hasPremium {
                await MainActor.run {
                    ToastManager.shared.show(primaryText: NSLocalizedString("toast.purchase.success", comment: ""))
                    dismiss()
                }
            }
        } catch {
            // 处理购买错误
            await MainActor.run {
                self.errorMessage = error.localizedDescription
                self.showErrorAlert = true
            }
        }
    }
}

// 功能行组件
struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String
    let color: Color
    
    var body: some View {
        HStack(spacing: GlobalConfig.shared.spacing(8)) {
            Image(systemName: icon)
                .font(.system(size: GlobalConfig.shared.fontSize(16)))
                .foregroundColor(color)
                .frame(width: GlobalConfig.shared.spacing(20))
            
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: GlobalConfig.shared.fontSize(14), weight: .medium))
                    .foregroundColor(GlobalConfig.Colors.primaryText)
                
                Text(description)
                    .font(.system(size: GlobalConfig.shared.fontSize(12)))
                    .foregroundColor(GlobalConfig.Colors.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - 颜色格式设置视图
struct ColorFormatSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var formatManager = ColorFormatManager.shared
    @ObservedObject private var membershipManager = MembershipManager.shared
    @State private var showMembershipCenter: Bool = false
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(ColorFormat.allCases, id: \.self) { format in
                    Button(action: {
                        if format.isPremium && !membershipManager.hasPremiumAccess {
                            // 非会员点击高级格式时，显示会员中心
                            showMembershipCenter = true
                        } else {
                            // 会员或免费格式，直接选择
                            formatManager.setFormat(format)
                            dismiss()
                        }
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                                HStack {
                                    Text(format.displayName)
                                        .font(GlobalConfig.Fonts.bodyBold)
                                        .foregroundColor(GlobalConfig.Colors.primaryText)
                                    
                                    if format.isPremium && !membershipManager.hasPremiumAccess {
                                        Image(systemName: "crown.fill")
                                            .font(.system(size: GlobalConfig.shared.fontSize(12)))
                                            .foregroundColor(.yellow)
                                    }
                                }
                                
                                Text(format.description)
                                    .font(GlobalConfig.Fonts.caption)
                                    .foregroundColor(GlobalConfig.Colors.secondaryText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            
                            Spacer()
                            
                            if formatManager.currentFormat == format {
                                Image(systemName: "checkmark")
                                    .foregroundColor(GlobalConfig.Colors.primary)
                                    .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .semibold))
                            }
                        }
                        .padding(.vertical, GlobalConfig.shared.spacing(4))
                        .opacity(format.isPremium && !membershipManager.hasPremiumAccess ? 0.6 : 1.0)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .navigationTitle("color.format.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)
                    }
                }
            }
        }
        .sheet(isPresented: $showMembershipCenter) {
            MembershipCenterView()
                .presentationBackground(.ultraThinMaterial.opacity(0.1))
        }
    }
}

// 行内滑杆视图
struct ShakeSliderRow: View {
    @Binding var shakeThreshold: Double
    @State private var localThreshold: Double = 0.0
    @State private var isInitialized: Bool = false

    var body: some View {
        Slider(
            value: Binding(
                get: {
                    // 反转显示：将阈值转换为灵敏度值（左侧高灵敏度，右侧低灵敏度）
                    GlobalConfig.Shake.maxThreshold + GlobalConfig.Shake.minThreshold - localThreshold
                },
                set: { newValue in
                    // 反转存储：将灵敏度值转换为阈值
                    localThreshold = GlobalConfig.Shake.maxThreshold + GlobalConfig.Shake.minThreshold - newValue
                }
            ),
            in: GlobalConfig.Shake.minThreshold...GlobalConfig.Shake.maxThreshold,
            step: 0.5,
            onEditingChanged: { editing in
                if !editing {
                    // 滑杆编辑结束时保存并同步
                    shakeThreshold = localThreshold
                    ShakeGestureHandler.shared.setShakeThreshold(localThreshold)
                    WKInterfaceDevice.current().play(.click)
                }
            }
        )
        .frame(height: 44) // 设置固定行高，与其他功能行保持一致
        .onAppear {
            localThreshold = shakeThreshold
            isInitialized = true
        }
        .onChange(of: localThreshold) { _, newValue in
            // 实时更新摇晃阈值，让用户立即感受到变化
            ShakeGestureHandler.shared.setShakeThreshold(newValue)
        }
        .onChange(of: shakeThreshold) { _, newValue in
            if isInitialized {
                localThreshold = newValue
            }
        }
    }
}
