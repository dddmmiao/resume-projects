import SwiftUI
import WatchKit

/// 按钮类型枚举
enum CircleButtonType {
    case primary
    case secondary
    case warning
    case success
    case disabled
    
    /// 获取按钮背景色
    var backgroundColor: Color {
        switch self {
        case .primary:
            return AppTheme.primaryColor
        case .secondary:
            return AppTheme.secondaryColor
        case .warning:
            return AppTheme.warningColor
        case .success:
            return AppTheme.successColor
        case .disabled:
            return Color.disabled
        }
    }
    
    /// 获取按钮前景色
    var foregroundColor: Color {
        return Color.textPrimary
    }
}

/// 圆形按钮组件
struct CircleButton: View {
    /// 图标名称
    let icon: String
    
    /// 按钮标签
    let label: String
    
    /// 按钮类型
    let type: CircleButtonType
    
    /// 按钮大小
    var size: CGFloat = Sizes.buttonHeight
    
    /// 图标大小
    var iconSize: CGFloat = Sizes.iconSize
    
    /// 是否禁用
    var isDisabled: Bool = false
    
    /// 点击动作
    let action: () -> Void
    
    var body: some View {
        Button(action: {
            if !isDisabled {
                action()
            }
        }) {
            VStack(spacing: Sizes.tinyPadding) {
                // 图标
                Image(systemName: icon)
                    .font(.system(size: iconSize, weight: .semibold))
                    .foregroundColor(type.foregroundColor)
                    .frame(width: size, height: size)
                    .background(
                        Circle()
                            .fill(isDisabled ? Color.disabled : type.backgroundColor)
                    )
                
                // 标签
                if !label.isEmpty {
                    Text(label)
                        .font(.appSmall)
                        .foregroundColor(isDisabled ? Color.disabled : Color.textSecondary)
                }
            }
        }
        .buttonStyle(CircleButtonStyle())
        .disabled(isDisabled)
    }
}

/// 圆形按钮样式
struct CircleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(AppTheme.standardAnimation(), value: configuration.isPressed)
    }
}

/// 预览
#Preview {
    VStack(spacing: 20) {
        HStack(spacing: 20) {
            CircleButton(
                icon: "play.fill",
                label: "播放",
                type: .primary,
                action: {}
            )
            
            CircleButton(
                icon: "stop.fill",
                label: "停止",
                type: .warning,
                action: {}
            )
        }
        
        HStack(spacing: 20) {
            CircleButton(
                icon: "checkmark",
                label: "确认",
                type: .success,
                action: {}
            )
            
            CircleButton(
                icon: "xmark",
                label: "取消",
                type: .secondary,
                action: {}
            )
        }
        
        CircleButton(
            icon: "lock.fill",
            label: "禁用",
            type: .primary,
            isDisabled: true,
            action: {}
        )
    }
    .padding()
    .background(Color.black)
} 
 
