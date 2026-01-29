import SwiftUI
import WatchKit

/// 音效添加方式
enum SoundAddMethod {
    case record      // 直接录制
    case syncFromiPhone  // 从iPhone同步
}

/// 音乐选择器视图（watchOS版本）
struct MusicPickerView: View {
    @Binding var isPresented: Bool
    @Binding var selectedItem: Any?
    let onMusicSelected: (Any?) -> Void
    let onMethodSelected: ((SoundAddMethod) -> Void)?
    let onRecordingComplete: ((URL, String) -> Void)?

    // 录音界面导航状态
    @State private var showingRecorder = false

    init(isPresented: Binding<Bool>, selectedItem: Binding<Any?>, onMusicSelected: @escaping (Any?) -> Void, onMethodSelected: ((SoundAddMethod) -> Void)? = nil, onRecordingComplete: ((URL, String) -> Void)? = nil) {
        self._isPresented = isPresented
        self._selectedItem = selectedItem
        self.onMusicSelected = onMusicSelected
        self.onMethodSelected = onMethodSelected
        self.onRecordingComplete = onRecordingComplete
    }
    
    var body: some View {
        NavigationView {
            methodSelectionView
                .navigationTitle("添加音效")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    // MARK: - 子视图

    private var methodSelectionView: some View {
        VStack(spacing: AppTheme.mediumPadding) {
            // 直接录制选项
            recordOptionRow

            // iPhone同步选项
            syncOptionRow

            Spacer()
        }
        .padding(AppTheme.mediumPadding)
    }

    // 直接录制选项行
    private var recordOptionRow: some View {
        NavigationLink(destination: SoundRecorderView(
            isPresented: $isPresented,
            onRecordingComplete: { url, name in
                // 录制完成后关闭整个选择界面
                isPresented = false
                // 调用录制完成回调
                onRecordingComplete?(url, name)
            }
        )) {
            HStack {
                // 图标
                Image(systemName: "mic.fill")
                    .font(.system(size: AppTheme.smallIconSize))
                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    .foregroundColor(.white)
                    .background(Color.red)
                    .clipShape(Circle())

                // 文字内容
                Text("录制")
                    .font(AppTheme.bodyFont)
                    .foregroundColor(Color.textPrimary)

                Spacer()

                // 箭头
                Image(systemName: "chevron.right")
                    .font(AppTheme.smallFont)
                    .foregroundColor(Color.textTertiary)
            }
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // iPhone同步选项行
    private var syncOptionRow: some View {
        Button(action: {
            handleMethodSelection(.syncFromiPhone)
        }) {
            HStack {
                // 图标
                Image(systemName: "iphone")
                    .font(.system(size: AppTheme.smallIconSize))
                    .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                    .foregroundColor(.white)
                    .background(Color.blue)
                    .clipShape(Circle())

                // 文字内容
                Text("从iPhone同步")
                    .font(AppTheme.bodyFont)
                    .foregroundColor(Color.textPrimary)

                Spacer()

                // 箭头
                Image(systemName: "chevron.right")
                    .font(AppTheme.smallFont)
                    .foregroundColor(Color.textTertiary)
            }
            .standardRowStyle()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 方法处理

    private func handleMethodSelection(_ method: SoundAddMethod) {
        WKInterfaceDevice.current().play(.click)

        // 先调用回调，让父视图处理导航，然后关闭当前视图
        onMethodSelected?(method)

        // 稍微延迟关闭，确保新视图已经开始显示
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            isPresented = false
        }
    }
}

#Preview {
    MusicPickerView(
        isPresented: .constant(true),
        selectedItem: .constant(nil),
        onMusicSelected: { _ in },
        onMethodSelected: { method in
            Logger.debug("Selected method: \(method)", category: .ui)
        }
    )
}
