import SwiftUI

// MARK: - 按钮视图构建
struct ButtonViews {
    // 构建底部按钮视图
    static func buildButtonsView(
        config: GlobalConfig,
        addColorMode: AddColorMode,
        displayModeManager: DisplayModeManager,
        isCustomColor: Bool,
        isRandomColor: Bool,
        customColor: Color,
        shouldShowAddButton: Bool,
        shouldShowRestoreButton: Bool,
        currentSelectorMode: ColorSelectorMode,
        buttonAnimationsEnabled: Bool,
        
        // 回调函数
        onAddNewBreathingColor: @escaping () -> Void,
        onAddNewColor: @escaping () -> Void,
        onToggleColorSelector: @escaping () -> Void,
        onUpdateBreathingColor: @escaping () -> Void,
        onRestoreBreathingColor: @escaping () -> Void,
        onRemoveBreathingColor: @escaping () -> Void,
        onConfirmColorChange: @escaping () -> Void,
        onRestoreInitialColor: @escaping () -> Void,
        onRemoveColor: @escaping () -> Void
    ) -> some View {
        // 动画配置
        let transition = buttonAnimationsEnabled ? AnyTransition.opacity.combined(with: .scale) : AnyTransition.identity
        
        return ZStack {
            // 模式切换按钮
            if displayModeManager.isEditingBreathingColors {
                // 呼吸模式编辑状态
                breathingModeButtons(
                    config: config,
                    addColorMode: addColorMode,
                    isCustomColor: isCustomColor,
                    shouldShowRestoreButton: shouldShowRestoreButton,
                    currentSelectorMode: currentSelectorMode,
                    onUpdate: onUpdateBreathingColor,
                    onRestore: onRestoreBreathingColor,
                    onRemove: onRemoveBreathingColor,
                    onAdd: onAddNewBreathingColor,
                    onToggleSelector: onToggleColorSelector
                )
                .transition(transition)
            } else {
                // 单色模式状态
                solidColorModeButtons(
                    config: config,
                    addColorMode: addColorMode,
                    isRandomColor: isRandomColor,
                    shouldShowAddButton: shouldShowAddButton,
                    shouldShowRestoreButton: shouldShowRestoreButton,
                    currentSelectorMode: currentSelectorMode,
                    onAdd: onAddNewColor,
                    onConfirm: onConfirmColorChange,
                    onRestore: onRestoreInitialColor,
                    onRemove: onRemoveColor,
                    onToggleSelector: onToggleColorSelector
                )
                .transition(transition)
            }
        }
    }
    
    // 呼吸模式按钮组
    @ViewBuilder
    private static func breathingModeButtons(
        config: GlobalConfig,
        addColorMode: AddColorMode,
        isCustomColor: Bool,
        shouldShowRestoreButton: Bool,
        currentSelectorMode: ColorSelectorMode,
        onUpdate: @escaping () -> Void,
        onRestore: @escaping () -> Void,
        onRemove: @escaping () -> Void,
        onAdd: @escaping () -> Void,
        onToggleSelector: @escaping () -> Void
    ) -> some View {
        // 检查是否显示模式切换按钮（非会员也显示，但点击时跳转）
        let shouldShowModeToggle = true
  
        HStack(spacing: config.spacing(10)) {
            // 根据不同模式显示不同按钮
            if addColorMode != .none {
                // 新增模式：确认添加
                Button(action: onAdd) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: config.fontSize(32)))
                        .foregroundColor(GlobalConfig.Colors.success)
                        .padding(config.spacing(4))
                }
                .buttonStyle(BouncyButtonStyle())
                
                // 模式切换（仅会员显示）
                if shouldShowModeToggle {
                Button(action: onToggleSelector) {
                    Image(systemName: currentSelectorMode.next().icon)
                        .font(.system(size: config.fontSize(32)))
                        .foregroundColor(GlobalConfig.Colors.primaryText)
                        .padding(config.spacing(4))
                }
                .buttonStyle(BouncyButtonStyle())
                }
                
            } else {
                // 编辑模式 - 逻辑与单色模式对齐
                if shouldShowRestoreButton {
                    // 颜色已修改：显示恢复、确认、切换按钮
                    HStack(spacing: shouldShowModeToggle ? config.spacing(10) : config.spacing(18)) {
                        Button(action: onRestore) {
                            Image(systemName: "arrow.uturn.backward.circle.fill")
                                .font(.system(size: config.fontSize(32)))
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                                .padding(config.spacing(4))
                        }
                        .buttonStyle(BouncyButtonStyle())
                        
                        Button(action: onUpdate) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: config.fontSize(32)))
                                .foregroundColor(GlobalConfig.Colors.success)
                                .padding(config.spacing(4))
                        }
                        .buttonStyle(BouncyButtonStyle())
                        
                        // 模式切换（仅会员显示）
                        if shouldShowModeToggle {
                        Button(action: onToggleSelector) {
                            Image(systemName: currentSelectorMode.next().icon)
                                .font(.system(size: config.fontSize(32)))
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                                .padding(config.spacing(4))
                        }
                        .buttonStyle(BouncyButtonStyle())
                        }
                    }
                    // .transition(transition)
                } else {
                    // 颜色未修改：显示删除、切换按钮
                    HStack(spacing: shouldShowModeToggle ? config.spacing(18) : config.spacing(0)) {
                        Button(action: onRemove) {
                            Image(systemName: "minus.circle.fill")
                                .font(.system(size: config.fontSize(32)))
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                                .padding(config.spacing(4))
                        }
                        .buttonStyle(BouncyButtonStyle())
                        
                        // 模式切换（仅会员显示）
                        if shouldShowModeToggle {
                        Button(action: onToggleSelector) {
                            Image(systemName: currentSelectorMode.next().icon)
                                .font(.system(size: config.fontSize(32)))
                                .foregroundColor(GlobalConfig.Colors.primaryText)
                                .padding(config.spacing(4))
                        }
                        .buttonStyle(BouncyButtonStyle())
                        }
                    }
                    // .transition(transition)
                }
            }
        }
    }
    
    // 单色模式按钮组
    @ViewBuilder
    private static func solidColorModeButtons(
        config: GlobalConfig,
        addColorMode: AddColorMode,
        isRandomColor: Bool,
        shouldShowAddButton: Bool,
        shouldShowRestoreButton: Bool,
        currentSelectorMode: ColorSelectorMode,
        onAdd: @escaping () -> Void,
        onConfirm: @escaping () -> Void,
        onRestore: @escaping () -> Void,
        onRemove: @escaping () -> Void,
        onToggleSelector: @escaping () -> Void
    ) -> some View {
        // 检查是否显示模式切换按钮（非会员也显示，但点击时跳转）
        let shouldShowModeToggle = true
        HStack(spacing: config.spacing(10)) {
            // 根据不同条件显示不同按钮
            if shouldShowRestoreButton {
                // 显示恢复、确认和模式切换按钮
                HStack(spacing: config.spacing(10)) {
                    // 恢复
                    Button(action: onRestore) {
                        Image(systemName: "arrow.uturn.backward.circle.fill")
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    
                    // 确认
                    Button(action: onConfirm) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.success)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    
                    // 模式切换（仅会员显示）
                    if shouldShowModeToggle {
                    Button(action: onToggleSelector) {
                        Image(systemName: currentSelectorMode.next().icon)
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    }
                }
                // .transition(transition)
            } else if shouldShowAddButton {
                // 显示添加按钮和模式切换
                HStack(spacing: config.spacing(18)) {
                    Button(action: {
                        // 当当前颜色不在列表中(shouldShowAddButton==true)时执行新增逻辑，否则执行确认更新逻辑
                        if shouldShowAddButton {
                            onAdd()
                        } else {
                            onConfirm()
                        }
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.success)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    
                    // 模式切换（仅会员显示）
                    if shouldShowModeToggle {
                    Button(action: onToggleSelector) {
                        Image(systemName: currentSelectorMode.next().icon)
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    }
                }
                // .transition(transition)
            } else {
                // 显示删除按钮和模式切换
                HStack(spacing: config.spacing(18)) {
                    Button(action: isRandomColor ? onConfirm : onRemove) {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    
                    // 模式切换（仅会员显示）
                    if shouldShowModeToggle {
                    Button(action: onToggleSelector) {
                        Image(systemName: currentSelectorMode.next().icon)
                            .font(.system(size: config.fontSize(32)))
                            .foregroundColor(GlobalConfig.Colors.primaryText)
                            .padding(config.spacing(4))
                    }
                    .buttonStyle(BouncyButtonStyle())
                    }
                }
                // .transition(transition)
            }
        }
    }
}
