import SwiftUI

// 用于管理提示消息的单例
class ToastManager: ObservableObject {
    static let shared = ToastManager()
    @Published var message: String = ""
    @Published var isShowing: Bool = false
    
    private var timer: Timer?
    
    private init() {}
    

    // 显示消息，只接受一个参数表示表情符号
    func show(primaryText: String, duration: TimeInterval = GlobalConfig.Toast.defaultDuration) {
        // 如果有正在显示的，先取消
        if isShowing {
            timer?.invalidate()
        }
        
        // 设置新消息
        message = primaryText
        isShowing = true
        
        // 设置定时器
        timer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
            withAnimation(GlobalConfig.Animation.easeInOut) {
                self?.isShowing = false
            }
        }
    }
    
    // 手动去除当前显示的 toast
    func hide() {
        // 取消定时器
        timer?.invalidate()
        timer = nil
        
        // 隐藏 toast
        withAnimation(GlobalConfig.Animation.easeInOut) {
            isShowing = false
        }
    }
}

// 胶囊形状的提示视图
struct CapsuleToast: View {
    @ObservedObject private var toastManager = ToastManager.shared
    @EnvironmentObject var brightnessManager: BrightnessManager
    
    var body: some View {
        // 将Toast固定在最顶部，不使用VStack
        Group {
            if toastManager.isShowing {
                VStack(spacing: GlobalConfig.shared.spacing(4)) {
                    // 显示表情符号
                    ForEach(toastManager.message.split(separator: "\n"), id: \.self) { line in
                        Text(String(line))
                            .font(.system(size: GlobalConfig.shared.fontSize(20), weight: .medium))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .lineLimit(1)
                    }
                }
                .padding(.horizontal, GlobalConfig.shared.spacing(6))
                .padding(.vertical, GlobalConfig.shared.spacing(6))
                .background(
                    Capsule()
                        .fill(GlobalConfig.Colors.toastBackground)
                )
                .transition(.move(edge: .top).combined(with: .opacity))
                .animation(GlobalConfig.Animation.easeInOut, value: toastManager.isShowing)
                // 强制固定在顶部，给足够小的距离
                .padding(.top, GlobalConfig.shared.spacing(10))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .zIndex(999) // 确保始终在最上层
        .ignoresSafeArea(.container, edges: .top) // 关键：忽略顶部安全区
        .animation(GlobalConfig.Animation.easeInOut, value: toastManager.isShowing)
    }
}
