import SwiftUI

// MARK: - SoundModeSettingsView Sections
extension SoundModeSettingsView {
    /// 用于显示的音效名称：优先通过传入的 soundName 映射到ID，再取显示名；否则直接显示 soundName，避免出现“未知音效”
    private var displayTitle: String {
        if let id = model.soundManager.displayNameManager.getSoundID(for: soundName) {
            return model.soundManager.displayNameManager.getDisplayName(for: id)
        } else {
            return soundName
        }
    }

    /// 音效信息区（仅显示名称）
    var previewSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            // 显示当前音效名称（只读提示）
            HStack {
                VStack(alignment: .leading, spacing: AppTheme.tinyPadding) {
                    Text(displayTitle)
                        .font(.appBody)
                        .foregroundColor(.textPrimary)
                }
                Spacer()
            }
            .standardRowStyle()
        }
    }


}


