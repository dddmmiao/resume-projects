import SwiftUI

// MARK: - 会员管理器
class MembershipManager: ObservableObject {
    static let shared = MembershipManager()
    
    @Published var isPremium: Bool = false
    
    private init() {
        // 从UserDefaults加载会员状态
        isPremium = UserDefaults.standard.bool(forKey: "isPremium")
    }
    
    // 检查是否有高级访问权限 - 已改为免费版本，所有用户均可访问
    var hasPremiumAccess: Bool {
        return true
    }
    
    // 更新高级状态（由StoreKit管理器调用）
    func updatePremiumStatus(_ isPremium: Bool) {
        self.isPremium = isPremium
        UserDefaults.standard.set(isPremium, forKey: "isPremium")
    }
    
    // 手动解锁高级版（用于测试或其他场景）
    func unlockPremium() {
        updatePremiumStatus(true)
    }
    
    func canAccessBreathingMode() -> Bool {
        return isPremium
    }
    
    func canAccessAdvancedColorModes() -> Bool {
        return isPremium
    }
    
    // 包装函数：检查会员权限，如果是会员则执行操作，否则显示会员中心
    func executeIfPremium(action: () -> Void) {
        if hasPremiumAccess {
            action() // 如果是会员，直接执行操作
        } else {
            // 如果不是会员，发送通知以显示会员中心
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
        }
    }
} 
