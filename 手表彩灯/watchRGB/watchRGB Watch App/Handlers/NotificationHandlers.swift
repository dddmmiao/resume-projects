import SwiftUI

// MARK: - 通知名称扩展
extension Notification.Name {
    static let didRotateCrown = Notification.Name("didRotateCrown")
    static let colorWheelTouchBegan = Notification.Name("colorWheelTouchBegan")
    static let colorWheelTouchEnded = Notification.Name("colorWheelTouchEnded")
    static let rgbPickerActive = Notification.Name("rgbPickerActive")
    static let rgbPickerInactive = Notification.Name("rgbPickerInactive")
    static let saturationUpdated = Notification.Name("saturationUpdated")
    static let resetCrownToBrightness = Notification.Name("resetCrownToBrightness")
    static let brightnessControlActivated = Notification.Name("brightnessControlActivated")
    static let brightnessControlDeactivated = Notification.Name("brightnessControlDeactivated")
    static let resetAllSettingsNotification = Notification.Name("resetAllSettingsNotification")
    static let showMembershipCenterNotification = Notification.Name("showMembershipCenter")
}

// MARK: - 通知中心扩展
extension NotificationCenter {
    // 亮度控制观察
    private static let brightnessControlKey = "hasBrightnessControl"
    private static let saturationSmoothingKey = "hasSaturationSmoothing"
    
    func addBrightnessControlObserver() {
        UserDefaults.standard.set(false, forKey: NotificationCenter.brightnessControlKey)
        UserDefaults.standard.set(false, forKey: NotificationCenter.saturationSmoothingKey)
    }
    
    func observeHasActiveBrightnessControl() -> Bool {
        return UserDefaults.standard.bool(forKey: NotificationCenter.brightnessControlKey)
    }
    
    func setActiveBrightnessControl(_ active: Bool) {
        UserDefaults.standard.set(active, forKey: NotificationCenter.brightnessControlKey)
    }
    
    func observeHasSaturationSmoothing() -> Bool {
        return UserDefaults.standard.bool(forKey: NotificationCenter.saturationSmoothingKey)
    }
    
    func setSaturationSmoothing(_ active: Bool) {
        UserDefaults.standard.set(active, forKey: NotificationCenter.saturationSmoothingKey)
    }
}

// MARK: - 通知处理器
class NotificationHandler {
    private static var observers: [NSObject: [NSObjectProtocol]] = [:]
    
    // 设置通知观察者 - 原始接口
    static func setupNotificationObservers(
        for target: AnyObject,
        onCrownRotation: @escaping (Double, Double) -> Void,
        onColorWheelTouchBegan: @escaping () -> Void,
        onColorWheelTouchEnded: @escaping () -> Void,
        onRGBPickerActive: @escaping () -> Void,
        onRGBPickerInactive: @escaping () -> Void,
        onSaturationUpdated: @escaping (Double) -> Void,
        onResetCrownToBrightness: @escaping () -> Void
    ) {
        // 确保目标是NSObject类型
        guard let targetObject = target as? NSObject else {
            print("Error: target must be an NSObject")
            return
        }
        
        // 确保先移除之前的观察者
        removeNotificationObservers(for: target)
        
        var currentObservers: [NSObjectProtocol] = []
        
        // 数字表冠旋转事件
        let crownObserver = NotificationCenter.default.addObserver(
            forName: .didRotateCrown,
            object: nil,
            queue: .main
        ) { notification in
            if let userInfo = notification.userInfo,
               let value = userInfo["value"] as? Double,
               let oldValue = userInfo["oldValue"] as? Double {
                onCrownRotation(oldValue, value)
            }
        }
        currentObservers.append(crownObserver)
        
        // 监听RGB选择器和表情选择器关闭时的表冠重置通知
        let resetObserver = NotificationCenter.default.addObserver(
            forName: .resetCrownToBrightness,
            object: nil,
            queue: .main
        ) { _ in
            onResetCrownToBrightness()
        }
        currentObservers.append(resetObserver)
        
        let touchBeganObserver = NotificationCenter.default.addObserver(
            forName: .colorWheelTouchBegan,
            object: nil,
            queue: .main
        ) { _ in
            onColorWheelTouchBegan()
        }
        currentObservers.append(touchBeganObserver)
        
        let touchEndedObserver = NotificationCenter.default.addObserver(
            forName: .colorWheelTouchEnded,
            object: nil,
            queue: .main
        ) { _ in
            onColorWheelTouchEnded()
        }
        currentObservers.append(touchEndedObserver)
        
        // 添加亮度控制模式观察
        NotificationCenter.default.addBrightnessControlObserver()
        
        // 添加RGB选择器状态观察
        let rgbActiveObserver = NotificationCenter.default.addObserver(
            forName: .rgbPickerActive,
            object: nil,
            queue: .main
        ) { _ in
            onRGBPickerActive()
        }
        currentObservers.append(rgbActiveObserver)
        
        let rgbInactiveObserver = NotificationCenter.default.addObserver(
            forName: .rgbPickerInactive,
            object: nil,
            queue: .main
        ) { _ in
            onRGBPickerInactive()
        }
        currentObservers.append(rgbInactiveObserver)
        
        // 修改通知观察部分，优化同步时机和表冠响应性
        let saturationObserver = NotificationCenter.default.addObserver(
            forName: .saturationUpdated,
            object: nil,
            queue: .main
        ) { notification in
            // 获取新的饱和度值
            if let saturationValue = notification.object as? Double {
                onSaturationUpdated(saturationValue)
            }
        }
        currentObservers.append(saturationObserver)
        
        // 保存所有观察者
        observers[targetObject] = currentObservers
    }
    
    // 移除通知观察者 - 原始接口
    static func removeNotificationObservers(for target: AnyObject) {
        guard let targetObject = target as? NSObject else {
            print("Error: target must be an NSObject")
            return
        }
        
        if let currentObservers = observers[targetObject] {
            for observer in currentObservers {
                NotificationCenter.default.removeObserver(observer)
            }
            observers.removeValue(forKey: targetObject)
        }
    }
}


