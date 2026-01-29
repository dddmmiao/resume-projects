import SwiftUI

// MARK: - 最佳设置引导视图
struct OptimalSettingsGuideView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: GlobalConfig.shared.spacing(12)) {
                    // 设置项目
                    VStack(spacing: GlobalConfig.shared.spacing(10)) {
                        // 保持屏幕常亮
                        SettingItemView(
                            icon: "circle.lefthalf.filled",
                            title: "optimal.settings.always.on.simple",
                            path: "optimal.settings.always.on.path"
                        )

                        // 保持应用前台显示
                        SettingItemView(
                            icon: "clock.fill",
                            title: "optimal.settings.return.crown.simple",
                            path: "optimal.settings.return.crown.path"
                        )
                    }

                    // 底部按钮
                    Button(action: {
                        dismiss()
                    }) {
                        Text("optimal.settings.got.it")
                    }
                    .buttonStyle(GlobalPrimaryButtonStyle())
                    .padding(.bottom, GlobalConfig.shared.spacing(6))
                }
                .padding(.horizontal, GlobalConfig.shared.spacing(12))
                .padding(.top, GlobalConfig.shared.spacing(8))
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - 设置项目视图
struct SettingItemView: View {
    let icon: String
    let title: String
    let path: String

    var body: some View {
        VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(4)) {
            // 标题行
            HStack(spacing: GlobalConfig.shared.spacing(6)) {
                Image(systemName: icon)
                    .font(.system(size: GlobalConfig.shared.fontSize(18)))
                    .foregroundColor(.blue)
                    .frame(width: 20)

                Text(LocalizedStringKey(title))
                    .font(.system(size: GlobalConfig.shared.fontSize(16), weight: .medium))
                    .foregroundColor(GlobalConfig.Colors.primaryText)

                Spacer()
            }

            // 设置路径
            VStack(alignment: .leading, spacing: GlobalConfig.shared.spacing(2)) {
                Text("optimal.settings.path.label")
                    .font(.system(size: GlobalConfig.shared.fontSize(13)))
                    .foregroundColor(.gray)

                Text(LocalizedStringKey(path))
                    .font(.system(size: GlobalConfig.shared.fontSize(13)))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(GlobalConfig.shared.spacing(8))
        .background(Color.gray.opacity(0.1))
        .cornerRadius(8)
    }
}

#Preview {
    OptimalSettingsGuideView()
}
