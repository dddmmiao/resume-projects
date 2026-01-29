import SwiftUI

/// 缩放提示管理器
class ScaleToastManager: ObservableObject {
    /// 是否显示提示
    @Published var isVisible = false
    
    /// 显示提示的持续时间
    private let displayDuration: TimeInterval = 1.5
    
    /// 计时器
    private var timer: Timer?
    
    /// 显示提示
    func showToast() {
        // 取消之前的计时器
        timer?.invalidate()
        
        // 显示提示
        withAnimation {
            isVisible = true
        }
        
        // 设置新的计时器
        timer = Timer.scheduledTimer(withTimeInterval: displayDuration, repeats: false) { [weak self] _ in
            withAnimation {
                self?.isVisible = false
            }
        }
    }
    
    deinit {
        timer?.invalidate()
    }
}

/// 缩放提示视图
struct ScaleToast: View {
    let message: String
    @Binding var isVisible: Bool
    
    var body: some View {
        VStack {
            if isVisible {
                Text(message)
                    .font(.appBody)
                    .multilineTextAlignment(.center)
                    .padding(.top, AppTheme.largePadding)
                    .padding(.bottom, AppTheme.largePadding)
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .animation(Animation.standardAnimation(), value: isVisible)
    }
}

extension View {
    func toast(message: String, isVisible: Binding<Bool>) -> some View {
        ZStack(alignment: .top) {
            self
            
            if isVisible.wrappedValue {
                Text(message)
                    .font(.appBody)
                    .foregroundColor(Color.textPrimary)
                    .padding(.vertical, AppTheme.smallPadding)
                    .padding(.horizontal, AppTheme.mediumPadding)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                            .fill(AppTheme.backgroundColor.opacity(0.9))
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 10)
            }
        }
        .animation(Animation.standardAnimation(), value: isVisible.wrappedValue)
    }
}

/// 预览
#Preview {
    ZStack {
        Color.black.edgesIgnoringSafeArea(.all)
        
        ScaleToast(message: "2.5×", isVisible: .constant(true))
    }
} 
 