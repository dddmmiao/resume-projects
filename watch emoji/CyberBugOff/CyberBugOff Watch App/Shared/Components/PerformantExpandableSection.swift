import SwiftUI

/// 高性能可展开区域组件
/// 解决首次展开卡顿问题，同时保持良好的可维护性
struct PerformantExpandableSection<Header: View, Content: View, Skeleton: View>: View {
    let header: () -> Header
    let content: () -> Content
    let skeleton: () -> Skeleton
    
    @Binding var isExpanded: Bool
    @State private var expandState = ExpandState()
    
    init(
        isExpanded: Binding<Bool>,
        @ViewBuilder header: @escaping () -> Header,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder skeleton: @escaping () -> Skeleton = { EmptyView() as! Skeleton }
    ) {
        self._isExpanded = isExpanded
        self.header = header
        self.content = content
        self.skeleton = skeleton
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
            Button(action: handleToggle) {
                header()
            }
            .buttonStyle(PlainButtonStyle())
            
            if isExpanded {
                if expandState.shouldShowSkeleton {
                    skeleton()
                        .onAppear { expandState.triggerContentSwap() }
                } else {
                    content()
                }
            }
        }
        .onChange(of: isExpanded) { _, newValue in
            expandState.handleExpandChange(newValue)
        }
    }
    
    private func handleToggle() {
        expandState.handleToggle(currentlyExpanded: isExpanded) { newValue in
            isExpanded = newValue
        }
    }
}

/// 封装展开状态的复杂逻辑，提高可维护性
@Observable
private class ExpandState {
    private var phase: ExpandPhase = .initial
    private(set) var shouldShowSkeleton = false
    
    private enum ExpandPhase {
        case initial           // 从未展开过
        case firstExpanded     // 首次展开完成
        case firstCollapsed    // 首次关闭完成
        case subsequent        // 后续操作
    }
    
    func handleToggle(currentlyExpanded: Bool, updateBinding: @escaping (Bool) -> Void) {
        switch (phase, currentlyExpanded) {
        case (.initial, false):
            // 首次展开：禁动画 + skeleton
            phase = .firstExpanded
            shouldShowSkeleton = true
            performNoAnimationToggle { updateBinding(true) }
            
        case (.firstExpanded, true):
            // 首次关闭：禁动画
            phase = .firstCollapsed
            performNoAnimationToggle { updateBinding(false) }
            
        case (.firstCollapsed, false):
            // 第二次展开：禁动画（内容已构建但重新挂载仍有成本）
            phase = .subsequent
            performNoAnimationToggle { updateBinding(true) }
            
        case (.subsequent, _):
            // 后续操作：可以使用动画或继续禁动画（根据需要调整）
            performNoAnimationToggle { updateBinding(!currentlyExpanded) }
            
        default:
            // 正常切换
            updateBinding(!currentlyExpanded)
        }
    }
    
    func handleExpandChange(_ isExpanded: Bool) {
        if isExpanded && phase == .initial {
            phase = .firstExpanded
        }
    }
    
    func triggerContentSwap() {
        DispatchQueue.main.async { [weak self] in
            self?.shouldShowSkeleton = false
        }
    }
    
    private func performNoAnimationToggle(action: @escaping () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction, action)
    }
}

// MARK: - 便利扩展
extension PerformantExpandableSection where Skeleton == EmptyView {
    /// 无 skeleton 的便利初始化器（适用于轻量内容）
    init(
        isExpanded: Binding<Bool>,
        @ViewBuilder header: @escaping () -> Header,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(
            isExpanded: isExpanded,
            header: header,
            content: content,
            skeleton: { EmptyView() }
        )
    }
}

// MARK: - 预定义 Skeleton 组件
struct SliderSkeleton: View {
    var body: some View {
        VStack(spacing: AppTheme.smallPadding) {
            Rectangle()
                .fill(AppTheme.secondaryBackgroundColor.opacity(0.4))
                .frame(height: 20)
                .cornerRadius(6)
            HStack {
                Text("A").font(.appBody).opacity(0.6)
                Spacer()
                Text("A").font(.appTitle).opacity(0.6)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, AppTheme.smallPadding)
        .cornerRadius(AppTheme.cornerRadius)
    }
}

struct ColorPickerSkeleton: View {
    var body: some View {
        VStack(spacing: AppTheme.mediumPadding) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: AppTheme.mediumPadding) {
                    ForEach(0..<8, id: \.self) { _ in
                        Circle()
                            .fill(AppTheme.secondaryBackgroundColor.opacity(0.3))
                            .frame(width: Sizes.smallButtonHeight, height: Sizes.smallButtonHeight)
                            .overlay(Circle().stroke(Color.gray.opacity(0.2), lineWidth: 1))
                            .padding(Sizes.smallPadding)
                    }
                }
                .padding(.vertical, AppTheme.mediumPadding)
                .padding(.horizontal, AppTheme.smallPadding)
            }
            Text("提示：可以选择多种颜色，文字将会循环变色")
                .smallTextStyle()
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, Sizes.tinyPadding)
        }


        .background(AppTheme.secondaryBackgroundColor.opacity(0.3))
        .cornerRadius(AppTheme.cornerRadius)
    }
}
