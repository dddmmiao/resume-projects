import SwiftUI

// MARK: - 引导管理器
class TutorialManager: ObservableObject {
    static let shared = TutorialManager()
    
    @Published var shouldShowTutorial: Bool = false
    
    private let hasSeenTutorialKey = "hasSeenTutorial"
    
    private init() {
        // 检查是否已经看过引导
        shouldShowTutorial = !UserDefaults.standard.bool(forKey: hasSeenTutorialKey)
    }
    
    // 标记引导已完成
    func markTutorialAsCompleted() {
        UserDefaults.standard.set(true, forKey: hasSeenTutorialKey)
        shouldShowTutorial = false
    }
    
    // 检查是否是首次安装
    var isFirstLaunch: Bool {
        return shouldShowTutorial
    }
} 
 