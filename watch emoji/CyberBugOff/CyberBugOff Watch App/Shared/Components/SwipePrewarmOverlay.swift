import SwiftUI

/// 隐形 overlay，用于在首帧预热 swipeActions 与常用符号渲染
/// 使用方式：在需要的 List 或容器上 .overlay(SwipePrewarmOverlay { /* 预热行 */ })
struct SwipePrewarmOverlay<RowContent: View>: View {
    private let symbols: [String]
    @ViewBuilder private let row: () -> RowContent

    init(symbols: [String] = ["trash", "gearshape", "pencil", "plus.square.on.square"],
         @ViewBuilder row: @escaping () -> RowContent) {
        self.symbols = symbols
        self.row = row
    }

    var body: some View {
        Group {
            HStack(spacing: 0) {
                ForEach(symbols, id: \.self) { name in
                    Image(systemName: name).opacity(0)
                }
            }
            .frame(height: 0)

            row()
        }
        .frame(width: 0, height: 0)
        .opacity(0.001)
        .allowsHitTesting(false)
    }
}

