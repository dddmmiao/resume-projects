import SwiftUI

struct SettingsSliderSkeleton: View {
    let title: String
    let leftLabel: String
    let rightLabel: String
    
    init(title: String = "设置项", leftLabel: String = "最小", rightLabel: String = "最大") {
        self.title = title
        self.leftLabel = leftLabel
        self.rightLabel = rightLabel
    }
    
    var body: some View {
        VStack(spacing: AppTheme.smallPadding) {
            HStack {
                Rectangle()
                    .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                    .frame(width: 60, height: 14)
                    .cornerRadius(4)
                Spacer()
            }
            
            // 滑块占位
            Rectangle()
                .fill(AppTheme.secondaryBackgroundColor.opacity(0.4))
                .frame(height: 20)
                .cornerRadius(10)
                .overlay(
                    HStack {
                        Circle()
                            .fill(AppTheme.primaryColor.opacity(0.6))
                            .frame(width: 16, height: 16)
                        Spacer()
                    }
                    .padding(.horizontal, 2)
                )
            
            HStack {
                Rectangle()
                    .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                    .frame(width: 20, height: 12)
                    .cornerRadius(4)
                Spacer()
                Rectangle()
                    .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                    .frame(width: 20, height: 12)
                    .cornerRadius(4)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, AppTheme.smallPadding)
        .cornerRadius(AppTheme.cornerRadius)
    }
}
