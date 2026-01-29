import SwiftUI

/// 音效基础编辑视图 - 用于编辑音效的基础属性（名称等）
/// 与 SoundEditView 不同，这个视图不会修改原音频，只编辑音效的基础属性
struct SoundBasicEditView: View {
    @ObservedObject var model: BugOffModel
    let soundID: SoundID  // 使用SoundID而不是soundName
    @Binding var isPresented: Bool

    // MARK: - State Properties
    @State private var editedName: String = ""
    @State private var originalName: String = ""
    @State private var showErrorToast: Bool = false
    @State private var errorMessage: String = ""

    // MARK: - Initialization
    init(model: BugOffModel, soundID: SoundID, isPresented: Binding<Bool>) {
        self.model = model
        self.soundID = soundID
        self._isPresented = isPresented

        // 从SoundDisplayNameManager获取显示名称
        let displayName = model.soundManager.displayNameManager.getDisplayName(for: soundID)
        self._editedName = State(initialValue: displayName)
        self._originalName = State(initialValue: displayName)
    }


    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.mediumPadding) {
                // 名称编辑区域
                nameEditSection

                // 操作按钮
                actionsSection
            }
            .padding(.top, AppTheme.smallPadding)
        }
        .navigationTitle("编辑音效")
        .navigationBarTitleDisplayMode(.inline)
        .toast(message: errorMessage, isVisible: $showErrorToast)
        .onAppear {
            // 停止其他视图正在播放的音效
            model.stopSound()
            // 加载当前显示名称
            editedName = model.soundManager.displayNameManager.getDisplayName(for: soundID)
            originalName = editedName
        }
    }
    
    // MARK: - View Sections
    
    /// 名称编辑区域
    private var nameEditSection: some View {
        renameSection
    }
    
    
    /// 操作按钮区域
    private var actionsSection: some View {
        VStack(spacing: AppTheme.smallPadding) {
            // 保存按钮
            Button(action: {
                saveChanges()
                isPresented = false
            }) {
                HStack {
                    Image(systemName: "checkmark")
                        .foregroundColor(AppTheme.primaryColor)
                        .font(.system(size: AppTheme.smallIconSize))

                    Text("保存")
                        .font(.appBody)
                        .foregroundColor(.textPrimary)

                    Spacer()
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())
            .disabled(editedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            // 重置按钮
            Button(action: resetName) {
                HStack {
                    Image(systemName: "arrow.counterclockwise")
                        .foregroundColor(.orange)
                        .font(.system(size: AppTheme.smallIconSize))

                    Text("重置名称")
                        .font(.appBody)
                        .foregroundColor(Color.textPrimary)

                    Spacer()
                }
                .standardRowStyle()
            }
            .buttonStyle(PlainButtonStyle())


        }
    }
    
    private var renameSection: some View {
        StandardTextField(
            text: $editedName,
            onTextChange: { newName in
                // 在此处可以添加一些实时验证逻辑，如果需要
            }
        )
    }
    
    // MARK: - Actions
    
    /// 保存更改
    private func saveChanges() {
        let trimmedName = editedName.trimmingCharacters(in: .whitespacesAndNewlines)

        // 检查名称是否为空
        guard !trimmedName.isEmpty else {
            errorMessage = "音效名称不能为空"
            showErrorToast = true
            return
        }

        // 如果名称没有变化，直接关闭
        if trimmedName == originalName {
            isPresented = false
            return
        }

        // 检查名称是否已存在（排除当前音效）
        if model.soundManager.displayNameManager.isDisplayNameExists(trimmedName) {
            // 检查是否是当前音效的名称
            if let existingSoundID = model.soundManager.displayNameManager.getSoundID(for: trimmedName),
               existingSoundID != soundID {
                errorMessage = "音效名称已存在"
                showErrorToast = true
                return
            }
        }

        // 执行重命名 - O(1)操作
        model.soundManager.updateSoundDisplayName(soundID, to: trimmedName)

        Logger.success("音效重命名成功: \(originalName) -> \(trimmedName) (ID: \(soundID))", category: .soundManager)
        isPresented = false
    }
    
    /// 重置名称
    private func resetName() {
        editedName = model.soundManager.displayNameManager.getDisplayName(for: soundID)
    }

}

// MARK: - Preview
#Preview {
    let model = BugOffModel()
    let soundID = model.soundManager.createSound(displayName: "示例音效", baseSoundName: "2004年老电脑关机音")

    SoundBasicEditView(
        model: model,
        soundID: soundID,
        isPresented: .constant(true)
    )
}
