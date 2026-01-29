import SwiftUI

extension SoundModeSettingsView {
    /// 底部操作按钮区
     var actionsSection: some View {
        VStack(spacing: AppTheme.smallPadding) {
            Text("点击完成按钮保存设置")
                .descriptionTextStyle()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, AppTheme.smallPadding)

            // 完成按钮
            Button(action: {
                hasExplicitlySaved = true // 标记为明确保存
                saveChanges()
                isPresented = false
            }) {
                HStack {
                    Image(systemName: "checkmark")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("完成")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)

                    Spacer()
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())

            // 重置按钮
            Button(action: resetSettings) {
                HStack {
                    Image(systemName: "arrow.counterclockwise")
                        .foregroundColor(.orange)
                        .font(.system(size: AppTheme.smallIconSize))
                        .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)

                    Text("重置")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)

                    Spacer()
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())


        }
    }
} 
