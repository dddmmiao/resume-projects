import SwiftUI

// A helper preference key to pass the content width to the parent.
private struct ContentWidthPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// A view that automatically scrolls its content horizontally back and forth if it's too wide.
/// It also allows for manual scrolling.
struct AutoScrollingView<Content: View>: View {
    let content: Content
    let animationDuration: TimeInterval
    let delay: TimeInterval
    let alignment: HorizontalAlignment
    
    // State for managing geometry and animation
    @State private var contentWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var timer: Timer?
    @State private var isScrollingToEnd = true

    init(animationDuration: TimeInterval = 2.0, delay: TimeInterval = 2.0, alignment: HorizontalAlignment = .leading, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.animationDuration = animationDuration
        self.delay = delay
        self.alignment = alignment
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        if (alignment == .trailing || alignment == .center) && contentWidth <= containerWidth {
                            Spacer(minLength: 0)
                        }
                        
                        content
                            .background(
                                GeometryReader { contentGeometry in
                                    Color.clear.preference(key: ContentWidthPreferenceKey.self, value: contentGeometry.size.width)
                                }
                            )

                        if (alignment == .leading || alignment == .center) && contentWidth <= containerWidth {
                            Spacer(minLength: 0)
                        }
                    }
                    .frame(minWidth: containerWidth)
                    .id("content")
                }
                .disabled(contentWidth <= containerWidth) // Disable scrolling if not needed
                .onPreferenceChange(ContentWidthPreferenceKey.self, perform: { width in
                    self.contentWidth = width
                    self.containerWidth = geometry.size.width
                    // Defer the timer check to avoid modifying the view during an update
                    DispatchQueue.main.async {
                        checkAndStartTimer(proxy: proxy)
                    }
                })
                .onDisappear(perform: stopTimer)
                .onAppear(perform: {
                    // When the view appears or the content changes, re-evaluate.
                     DispatchQueue.main.async {
                         self.containerWidth = geometry.size.width
                         checkAndStartTimer(proxy: proxy)
                     }
                })
            }
        }
    }
    
    private func checkAndStartTimer(proxy: ScrollViewProxy) {
        stopTimer() // Stop any existing timer
        
        // Only start the timer if the content is wider than the container
        if contentWidth > containerWidth {
            // 使用强引用，因为 struct 不需要 weak
            timer = Timer.scheduledTimer(withTimeInterval: animationDuration + delay, repeats: true) { _ in
                Task { @MainActor in
                    withAnimation(.easeInOut(duration: self.animationDuration)) {
                        if self.isScrollingToEnd {
                            // 直接在主线程中调用，避免异步捕获
                            proxy.scrollTo("content", anchor: .trailing)
                        } else {
                            proxy.scrollTo("content", anchor: .leading)
                        }
                    }
                    self.isScrollingToEnd.toggle()
                }
            }
        }
    }
    
    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
} 