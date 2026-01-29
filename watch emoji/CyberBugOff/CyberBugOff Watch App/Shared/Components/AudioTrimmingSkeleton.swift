import SwiftUI

struct AudioTrimmingSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            // 波形图占位
            Rectangle()
                .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                .frame(height: AppTheme.rowHeight)
                .overlay(
                    HStack(spacing: 4) {
                        ForEach(0..<20, id: \.self) { _ in
                            Rectangle()
                                .fill(AppTheme.primaryColor.opacity(0.2))
                                .frame(width: 3, height: CGFloat.random(in: 10...30))
                        }
                    }
                )
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                        .fill(AppTheme.secondaryBackgroundColor.opacity(0.5))
                )
                .padding(.horizontal, AppTheme.mediumPadding)
            
            // 信息区域占位
            VStack(spacing: AppTheme.smallPadding) {
                HStack {
                    Rectangle()
                        .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                        .frame(width: 60, height: 16)
                        .cornerRadius(4)
                    Spacer()
                    Rectangle()
                        .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                        .frame(width: 80, height: 14)
                        .cornerRadius(4)
                }
                HStack {
                    Rectangle()
                        .fill(AppTheme.secondaryBackgroundColor.opacity(0.2))
                        .frame(width: 20, height: 14)
                        .cornerRadius(4)
                    Rectangle()
                        .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                        .frame(width: 120, height: 12)
                        .cornerRadius(4)
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
            }
            .padding(.horizontal)
            .padding(.vertical, AppTheme.smallPadding)
            .background(AppTheme.secondaryBackgroundColor.opacity(0.1))
            .cornerRadius(AppTheme.cornerRadius)
        }
    }
}
