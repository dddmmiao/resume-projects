import SwiftUI

/// 用于预热 swipeActions 的隐形行，适配首页 SoundList 上下文
struct SwipePrewarmRow: View {
    enum Context {
        case soundList(imageName: String?)
    }

    let model: BugOffModel
    let context: Context

    init(model: BugOffModel, context: Context) {
        self.model = model
        self.context = context
    }

    var body: some View {
        switch context {
        case .soundList(let imageName):
            // 预热首页行：预先生成右滑删除 action（已废除左滑编辑功能）
            UnifiedSwipableRow(
                sound: "__warm__",
                model: model,
                playingSounds: .constant([]),
                soundToEdit: .constant(nil),
                isShowingEditSheet: .constant(false),
                updateImageSounds: {},
                onSoundsUpdated: nil,
                deleteSound: { _ in },
                imageName: imageName,
                shouldShowHint: false,
                swipeHintManager: nil,
                hintStyle: .single(.left), // 只提示右滑删除操作
                mode: .edit,
                onStopAllAnimations: nil
            )
        }
    }
}

