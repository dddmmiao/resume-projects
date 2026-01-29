// 新建 GestureHandlers.swift
import SwiftUI
import WatchKit

extension ContentView {
    // 处理背景拖动手势
     func handleBackgroundDragGesture(value: DragGesture.Value) {
        if !showColorWheel {
            gestureActive.toggle()
            if displayModeManager.currentMode == .breathing {
                if displayModeManager.isEditingBreathingColors {
                    // 在编辑呼吸颜色模式下，左右滑动处理
                    let isLeftSwipe = value.translation.width < 0
                    
                    if isLeftSwipe {
                        // 左滑逻辑
                        if addColorMode == .head {
                            handleHeadAddModeLeftSwipe()
                        } else {
                            // 非头部新增视图左滑 - 切换到下一个颜色
                            changeToNextBreathingColor()
                        }
                    } else {
                        // 右滑逻辑
                        if addColorMode == .tail {
                            handleTailAddModeRightSwipe()
                        } else if addColorMode != .head {
                            // 非头部新增视图右滑 - 切换到上一个颜色
                            changeToPreviousBreathingColor()
                        }
                    }
                } else {
                   // 在呼吸模式下，左右滑动切换呼吸模式
                    MembershipManager.shared.executeIfPremium {
                        if value.translation.width < 0 {
                            self.displayModeManager.nextBreathingMode()
                        } else if value.translation.width > 0 {
                            self.displayModeManager.previousBreathingMode()
                        }
                    }
                }
            } else {
                // 单色模式下的左右滑动
                if isRandomColor {
                    // 退出随机颜色模式
                    isRandomColor = false
                    
                    if colorList.isEmpty {
                        // 列表为空，返回大加号视图
                        isCustomColor = true
                        addColorMode = .none
                        customColor = .white // 背景设为白色
                    } else {
                        // 列表不为空，恢复到之前的颜色
                        if let prevIdx = previousColorIndexForRandom, colorList.indices.contains(prevIdx) {
                            currentColorIndex = prevIdx
                        }
                        isCustomColor = false
                        showColorToast(for: currentColor)
                    }
                    // 退出后重置索引
                    previousColorIndexForRandom = nil
                    return
                }

                if colorList.isEmpty {
                    // 如果列表为空且不是随机模式，则不处理滑动
                    return
                }
                
                let isLeftSwipe = value.translation.width < 0
                
                if isLeftSwipe {
                    // 左滑逻辑
                    if addColorMode == .head {
                        // 头部新增视图左滑 - 回到第一个颜色
                        addColorMode = .none
                        isCustomColor = false
                        isRandomColor = false  // 重置随机颜色标志
                        currentColorIndex = 0
                        showColorToast(for: currentColor)
                        saveInitialViewColor()
                    } else if addColorMode != .tail {
                        // 非尾部新增视图左滑 - 正常切换到下一个颜色
                        changeToNextColor()
                    }
                } else {
                    // 右滑逻辑
                    if addColorMode == .tail {
                        // 尾部新增视图右滑 - 回到最后一个颜色
                        addColorMode = .none
                        isCustomColor = false
                        isRandomColor = false  // 重置随机颜色标志
                        currentColorIndex = colorList.count - 1
                        showColorToast(for: currentColor)
                        saveInitialViewColor()
                    } else if addColorMode != .head {
                        // 非头部新增视图右滑 - 正常切换到上一个颜色
                        changeToPreviousColor()
                    }
                }
            }
        } else if displayModeManager.isEditingBreathingColors {
            // 在编辑呼吸颜色模式的色轮视图中，左右滑动切换编辑的颜色
            if value.translation.width < 0 {
                // 左滑切换到下一个颜色
                changeToNextBreathingColor()
            } else if value.translation.width > 0 {
                // 右滑切换到上一个颜色
                changeToPreviousBreathingColor()
            }
        }
    }
    // 处理背景点击手势
     func handleBackgroundTapGesture() {
        // 如果是随机颜色视图，单击仅用于显示设置按钮
        if isRandomColor {
            showSettingsButton = true
            resetSettingsButtonTimer()
            return
        }

        // 检查是否可能是双击事件的第一次点击
        let now = Date()
        let doubleTapTimeThreshold = 0.3 // 双击检测的时间阈值（秒）
        let timeSinceLastTap = now.timeIntervalSince(lastTapTime)
        lastTapTime = now
        
        // 如果两次点击间隔很短，可能是双击的第一次点击，不处理单击逻辑
        if timeSinceLastTap < doubleTapTimeThreshold {
            return
        }
        
        // 显示设置按钮
        showSettingsButton = true
        resetSettingsButtonTimer()
        
        // 如果在呼吸模式下，显示速度控制按钮
        if displayModeManager.currentMode == .breathing && !displayModeManager.isEditingBreathingColors && !showColorWheel {
            MembershipManager.shared.executeIfPremium {
                // 显示控制按钮
                self.showBreathingControls = true
                // 设置自动隐藏计时器
                self.resetBreathingControlsTimer()
            }
            return
        }
        
        // 如果色轮已打开，关闭它
        if showColorWheel {
            closeColorWheel()
            return
        }
        
        // 如果正在呼吸模式编辑，不处理
        if displayModeManager.isEditingBreathingColors {
            return
        }
        
        // 如果是随机颜色状态，处理退出随机颜色模式
        if isRandomColor && displayModeManager.currentMode == .solidColor {
            // 重置随机颜色状态
            isRandomColor = false
            
            // 根据颜色列表状态决定如何恢复
            if colorList.isEmpty {
                // 颜色列表为空，恢复为大加号视图状态
                // 但保持当前颜色，而不是重置为白色
                isCustomColor = true
                addColorMode = .none
            } else {
                // 颜色列表不为空，恢复为普通颜色视图
                isCustomColor = false
                showColorToast(for: currentColor)
            }
            return
        }
        
        // 处理大加号视图模式
        if !showColorWheel && addColorMode != .none {
            if displayModeManager.currentMode == .solidColor {
                // 只有当颜色列表为空时，才通过点击空白处重置新增模式
                // 如果列表不为空，用户需要通过滑动来取消
                if colorList.isEmpty {
                    addColorMode = .none
                }
            } else if displayModeManager.currentMode == .breathing && displayModeManager.isEditingBreathingColors {
                // 呼吸模式编辑状态下点击空白处，返回呼吸模式
                addColorMode = .none
                displayModeManager.cancelEditingBreathingColors()
            }
        }
    }
    // 处理背景双击手势
    func handleBackgroundDoubleTapGesture() {
        // 在大加号视图（列表为空时）或新增颜色模式下，禁用双击打开颜色编辑器
        if (colorList.isEmpty && !isRandomColor) || addColorMode != .none {
            return
        }
        
        if !showColorWheel {
            let action = {
                if self.displayModeManager.currentMode == .breathing {
                    // 在呼吸模式下双击，进入编辑模式
                    self.displayModeManager.startEditingBreathingColors()
                    self.initializeColorWheelForBreathingEdit()
                    withAnimation(.spring(response: self.config.animationSpeed, dampingFraction: self.config.animationDamping)) {
                        self.showColorWheel = true
                    }
                } else {
                    // 在单色模式下双击，打开普通色轮
                    self.initializeColorWheel()
                    withAnimation(.spring(response: self.config.animationSpeed, dampingFraction: self.config.animationDamping)) {
                        self.showColorWheel = true
                    }
                }
            }

            if displayModeManager.currentMode == .breathing {
                MembershipManager.shared.executeIfPremium(action: action)
            } else {
                action()
            }
        }
    }
    // 处理背景长按手势
    func handleBackgroundLongPressGesture() {
        if addColorMode == .none && !showColorWheel {
            // 播放触觉反馈
            WKInterfaceDevice.current().play(.click)
            
            let switchAction = {
                let previousMode = self.displayModeManager.currentMode
                // 切换到下一个显示模式
                self.displayModeManager.toggleToNextMode()
                
                // 如果从呼吸模式切换到单色模式，重置自定义颜色状态
                if previousMode == .breathing && self.displayModeManager.currentMode == .solidColor {
                    self.isCustomColor = false
                    if !self.colorList.isEmpty {
                        self.customColor = self.colorList[self.currentColorIndex].color
                    }
                }
                
                // 显示当前模式提示
                let modeName: String
                switch self.displayModeManager.currentMode {
                case .solidColor: modeName = NSLocalizedString("mode.solidColor", comment: "")
                case .breathing: modeName = NSLocalizedString("mode.breathing", comment: "")
                }
                ToastManager.shared.show(primaryText: modeName)
                
                // 如果切换到呼吸模式，开始动画
                if self.displayModeManager.currentMode == .breathing {
                    self.displayModeManager.startAnimation()
                }
            }

            // 检查下一个模式是否为呼吸模式
            let nextMode = displayModeManager.currentMode.next()
            if nextMode == .breathing {
                MembershipManager.shared.executeIfPremium(action: switchAction)
            } else {
                switchAction()
            }
        }
    }
    // 处理色轮拖动手势
     func handleColorWheelDragGesture(value: DragGesture.Value) {
        if displayModeManager.isEditingBreathingColors {
            MembershipManager.shared.executeIfPremium {
                // 判断是否在加号视图模式
                let inAddColorMode = addColorMode != .none
                
                if inAddColorMode {
                    // 在呼吸模式下的加号视图中滑动
                    if value.translation.width < 0 {
                        // 左滑 - 回到颜色列表的第一个颜色
                        addColorMode = .none
                        displayModeManager.editingColorIndex = 0
                        updateColorWheelForEditingBreathingColor()
                    } else {
                        // 右滑 - 回到颜色列表的最后一个颜色
                        addColorMode = .none
                        displayModeManager.editingColorIndex = max(0, displayModeManager.customBreathingColors.count - 1)
                        updateColorWheelForEditingBreathingColor()
                    }
                } else {
                    // 正常编辑模式下的滑动逻辑
                    if value.translation.width < 0 {
                        // 左滑切换到下一个颜色
                        changeToNextBreathingColor()
                    } else if value.translation.width > 0 {
                        // 右滑切换到上一个颜色
                        changeToPreviousBreathingColor()
                    }
                }
            }
        }
    }
    
    // 处理头部新增模式左滑
     func handleHeadAddModeLeftSwipe() {
        MembershipManager.shared.executeIfPremium {
            // 检查会员权限
            if !MembershipManager.shared.hasPremiumAccess {
                // 没有会员权限，跳转到会员中心
                NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
                return
            }
            
            // 头部新增视图左滑 - 回到第一个颜色并重置新增状态
            addColorMode = .none
            isCustomColor = false // 重置为非自定义颜色
            displayModeManager.editingColorIndex = 0
            updateColorWheelForEditingBreathingColor()
            
            // 自动打开色轮
            if !showColorWheel {
                withAnimation(.spring(
                    response: config.animationSpeed,
                    dampingFraction: config.animationDamping
                )) {
                    showColorWheel = true
                }
            }
            
            ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
        }
    }
    // 处理尾部新增模式右滑
     func handleTailAddModeRightSwipe() {
        MembershipManager.shared.executeIfPremium {
            // 检查会员权限
            if !MembershipManager.shared.hasPremiumAccess {
                // 没有会员权限，跳转到会员中心
                NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
                return
            }
            
            // 尾部新增视图右滑 - 回到最后一个颜色并重置新增状态
            addColorMode = .none
            isCustomColor = false // 重置为非自定义颜色
            
            // 确保颜色数组不为空
            if displayModeManager.customBreathingColors.count > 0 {
                // 设置为呼吸模式颜色序列的最后一个颜色
                displayModeManager.editingColorIndex = displayModeManager.customBreathingColors.count - 1
                updateColorWheelForEditingBreathingColor()
                
                // 自动打开色轮
                if !showColorWheel {
                    withAnimation(.spring(
                        response: config.animationSpeed,
                        dampingFraction: config.animationDamping
                    )) {
                        showColorWheel = true
                    }
                }
                
                ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(displayModeManager.customBreathingColors.count)")
            } else {
                // 如果颜色数组为空，显示提示
                ToastManager.shared.show(primaryText: NSLocalizedString("toast.no.editable.color", comment: ""))
            }
        }
    }
    
    // 重置呼吸控制按钮计时器
    func resetBreathingControlsTimer() {
        // 取消现有计时器
        breathingControlsTimer?.invalidate()
        
        // 创建新计时器，3秒后自动隐藏按钮
        breathingControlsTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            // 使用动画平滑隐藏按钮
            withAnimation(.easeInOut(duration: 0.3)) {
                self.showBreathingControls = false
            }
        }
    }
    
    // 重置设置按钮计时器
    func resetSettingsButtonTimer() {
        // 取消现有计时器
        settingsButtonTimer?.invalidate()
        
        // 创建新计时器，5秒后自动隐藏设置按钮
        settingsButtonTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { _ in
            // 使用动画平滑隐藏按钮
            withAnimation(.easeInOut(duration: 0.3)) {
                self.showSettingsButton = false
            }
        }
    }
}

// MARK: - 颜色切换方法
extension ContentView {
    // 颜色切换 - 向左滑动，切换到下一个颜色
    func changeToNextColor() {
        // 确保颜色列表不为空
        if colorList.isEmpty { return }
        
        // 计算下一个索引
        let nextIndex = (currentColorIndex + 1) % (colorList.count + 1)
        
        // 如果是最后一个虚拟位置，进入尾部新增颜色模式
        if nextIndex == colorList.count {
            // 进入尾部新增颜色模式，但不直接打开色轮
            isCustomColor = true
            customColor = .white // 默认白色背景
            // 标记为尾部新增颜色模式
            addColorMode = .tail
            // 同步HSB值
            syncHSBFromColor(customColor)
            // 保存初始视图颜色
            saveInitialViewColor()
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
        } else {
            // 普通颜色切换
            isCustomColor = false
            currentColorIndex = nextIndex
            saveCurrentColorIndex()
            showColorToast(for: currentColor)
            // 保存初始视图颜色
            saveInitialViewColor()
        }
    }
    
    // 颜色切换 - 向右滑动，切换到上一个颜色
    func changeToPreviousColor() {
        // 确保颜色列表不为空
        if colorList.isEmpty { return }
        
        // 如果当前是第一个颜色，进入头部新增模式
        if currentColorIndex == 0 {
            // 进入头部新增颜色模式
            isCustomColor = true
            customColor = .white // 默认白色背景
            // 标记为头部新增颜色模式
            addColorMode = .head
            // 同步HSB值
            syncHSBFromColor(customColor)
            // 保存初始视图颜色
            saveInitialViewColor()
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
            return
        }
        
        // 普通颜色切换
        addColorMode = .none
        currentColorIndex = (currentColorIndex - 1 + colorList.count) % colorList.count
        saveCurrentColorIndex()
        // 更新状态，确保后续逻辑以列表颜色为准
        isCustomColor = false
        isRandomColor = false
        customColor = colorList[currentColorIndex].color

        // 显示颜色提示
        showColorToast(for: currentColor)
        
        // 保存初始视图颜色
        saveInitialViewColor()
    }
    
    // 呼吸模式颜色切换 - 向左滑动，切换到下一个颜色
    func changeToNextBreathingColor() {
        // 检查会员权限
        if !MembershipManager.shared.hasPremiumAccess {
            // 没有会员权限，跳转到会员中心
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        let colorCount = displayModeManager.customBreathingColors.count
        
        // 确保颜色序列不为空
        if colorCount == 0 { return }
        
        // 计算下一个索引，包括一个额外的虚拟位置用于新增
        let nextIndex = (displayModeManager.editingColorIndex + 1) % (colorCount + 1)
        
        // 如果是最后一个虚拟位置，进入尾部新增颜色模式
        if nextIndex == colorCount {
            // 进入尾部新增颜色模式
            customColor = .white // 默认白色背景
            addColorMode = .tail
            syncHSBFromColor(customColor)
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
            
            // 如果色轮正在显示，先关闭它
            if showColorWheel {
                withAnimation(.easeOut(duration: 0.2)) {
                    showColorWheel = false
                }
            }
        } else {
            // 普通颜色切换
            addColorMode = .none
            displayModeManager.editingColorIndex = nextIndex
            updateColorWheelForEditingBreathingColor()
            
            // 自动打开色轮
            if !showColorWheel {
                withAnimation(.spring(
                    response: config.animationSpeed,
                    dampingFraction: config.animationDamping
                )) {
                    showColorWheel = true
                }
            }
            
            // 显示提示
            ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(colorCount)")
        }
    }
    
    // 呼吸模式颜色切换 - 向右滑动，切换到上一个颜色
    func changeToPreviousBreathingColor() {
        // 检查会员权限
        if !MembershipManager.shared.hasPremiumAccess {
            // 没有会员权限，跳转到会员中心
            NotificationCenter.default.post(name: .showMembershipCenterNotification, object: nil)
            return
        }
        
        let colorCount = displayModeManager.customBreathingColors.count
        
        // 确保颜色序列不为空
        if colorCount == 0 { return }
        
        // 如果当前是第一个颜色，进入头部新增模式
        if displayModeManager.editingColorIndex == 0 {
            // 进入头部新增颜色模式
            customColor = .white // 默认白色背景
            addColorMode = .head
            syncHSBFromColor(customColor)
            // 手动隐藏当前显示的 toast
            ToastManager.shared.hide()
            
            // 如果色轮正在显示，先关闭它
            if showColorWheel {
                withAnimation(.easeOut(duration: 0.2)) {
                    showColorWheel = false
                }
            }
            
            return
        }
        
        // 普通颜色切换
        addColorMode = .none
        displayModeManager.editingColorIndex = (displayModeManager.editingColorIndex - 1 + colorCount) % colorCount
        updateColorWheelForEditingBreathingColor()
        
        // 自动打开色轮
        if !showColorWheel {
            withAnimation(.spring(
                response: config.animationSpeed,
                dampingFraction: config.animationDamping
            )) {
                showColorWheel = true
            }
        }
        
        // 显示提示
        ToastManager.shared.show(primaryText: "\(displayModeManager.editingColorIndex + 1)/\(colorCount)")
    }
}

