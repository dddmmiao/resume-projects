import SwiftUI

class BrightnessManager: ObservableObject {
    @Published var brightness: Double = 1.0
    
    // 设置亮度值，确保在合理范围内
    func setBrightness(_ value: Double) {
        // 使用ContentView中的config.minBrightness来保持一致性
        brightness = max(0.2, min(1.0, value))
    }
} 
 