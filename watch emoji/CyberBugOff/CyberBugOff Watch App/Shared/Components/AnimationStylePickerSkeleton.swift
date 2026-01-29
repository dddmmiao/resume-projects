import SwiftUI

struct AnimationStylePickerSkeleton: View {
    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: AppTheme.smallPadding) {
                ForEach(0..<6, id: \.self) { _ in
                    HStack {
                        Rectangle()
                            .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                            .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                            .cornerRadius(4)
                        Rectangle()
                            .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                            .frame(height: 16)
                            .cornerRadius(4)
                        Spacer()
                    }
                    .frame(height: AppTheme.rowHeight)
                    .padding(.horizontal)
                    .background(AppTheme.secondaryBackgroundColor.opacity(0.1))
                    .cornerRadius(AppTheme.cornerRadius)
                }
            }
        }
        .frame(height: AppTheme.pickerHeight)
        .padding(.horizontal, AppTheme.mediumPadding)
    }
}
