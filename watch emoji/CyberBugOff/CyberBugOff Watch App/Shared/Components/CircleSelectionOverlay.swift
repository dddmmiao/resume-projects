import SwiftUI

/// 手势圈选覆盖层 - 用于在图片上进行自由圈选裁剪
struct CircleSelectionOverlay: View {
    let onSelectionComplete: ([CGPoint], CGRect) -> Void // 传递路径点和边界矩形
    let onCancel: () -> Void

    @State private var drawingPath = Path()
    @State private var currentPath = Path()
    @State private var smoothedPath = Path()
    @State private var pathPoints: [CGPoint] = []
    @State private var isDrawing = false
    @State private var isPathClosed = false

    private var screenSize: CGSize {
        AppTheme.screenSize
    }
    
    var body: some View {
        ZStack {
            // 半透明背景 - 同时作为手势接收区域
            Color.black.opacity(0.5)
                .edgesIgnoringSafeArea(.all)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            handleDrawing(at: value.location)
                        }
                        .onEnded { _ in
                            finishDrawing()
                        }
                )

            // 绘制区域
            ZStack {
                // 用户绘制的原始路径（绘制时显示）
                if isDrawing {
                    currentPath
                        .stroke(AppTheme.primaryColor.opacity(0.6), lineWidth: 2)
                }

                // 平滑后的路径（完成绘制后显示）
                if !isDrawing && !pathPoints.isEmpty {
                    smoothedPath
                        .stroke(AppTheme.primaryColor, lineWidth: 3)
                        .opacity(0.9)
                }

                // 如果路径已封闭，显示填充区域
                if isPathClosed {
                    smoothedPath
                        .fill(AppTheme.primaryColor.opacity(0.2))
                }

                // 路径点指示器（用于调试）
                ForEach(Array(pathPoints.enumerated()), id: \.offset) { index, point in
                    if index == 0 || index == pathPoints.count - 1 {
                        Circle()
                            .fill(index == 0 ? Color.green : Color.red)
                            .frame(width: 6, height: 6)
                            .position(point)
                    }
                }
            }
            .allowsHitTesting(false) // 不阻挡手势
            
            // 顶部提示文字
            VStack {
                if !isDrawing && pathPoints.isEmpty {
                    Text("用手指画圈选择区域")
                        .hintTextStyle()
                        .foregroundColor(.white)
                        .padding(.top, AppTheme.smallPadding)
                } else if isDrawing {
                    Text("继续绘制...")
                        .hintTextStyle()
                        .foregroundColor(.white)
                        .padding(.top, AppTheme.smallPadding)
                } else if isPathClosed {
                    Text("圈选完成")
                        .hintTextStyle()
                        .foregroundColor(.green)
                        .padding(.top, AppTheme.smallPadding)
                } else {
                    Text("请画一个封闭的圈")
                        .hintTextStyle()
                        .foregroundColor(.orange)
                        .padding(.top, AppTheme.smallPadding)
                }

                Spacer()
            }
            
            // 底部按钮
            VStack {
                Spacer()

                HStack(spacing: AppTheme.largePadding) {
                    // 取消按钮
                    Button(action: onCancel) {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .floatingActionButtonStyle(
                        color: AppTheme.warningColor,
                        size: AppTheme.buttonHeight
                    )

                    // 重新绘制按钮
                    if !pathPoints.isEmpty {
                        Button(action: clearPath) {
                            Image(systemName: "arrow.counterclockwise.circle.fill")
                        }
                        .floatingActionButtonStyle(
                            color: AppTheme.primaryColor,
                            size: AppTheme.buttonHeight
                        )
                    }

                    // 确认按钮（只有在路径封闭时才启用）
                    Button(action: confirmSelection) {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    .floatingActionButtonStyle(
                        color: isPathClosed ? AppTheme.successColor : Color.gray,
                        size: AppTheme.buttonHeight
                    )
                    .disabled(!isPathClosed)
                }
                .padding(.bottom, AppTheme.largePadding)
            }
        }
    }

    // MARK: - 手势绘制逻辑

    /// 处理绘制手势
    private func handleDrawing(at point: CGPoint) {
        if !isDrawing {
            // 开始新的绘制
            startNewPath(at: point)
        } else {
            // 继续当前路径
            addPointToPath(point)
        }
    }

    /// 开始新的路径
    private func startNewPath(at point: CGPoint) {
        isDrawing = true
        isPathClosed = false
        pathPoints = [point]

        currentPath = Path()
        currentPath.move(to: point)

        // 提供触觉反馈
        WKInterfaceDevice.current().play(.click)
    }

    /// 添加点到当前路径
    private func addPointToPath(_ point: CGPoint) {
        // 避免添加过于接近的点
        if let lastPoint = pathPoints.last {
            let distance = sqrt(pow(point.x - lastPoint.x, 2) + pow(point.y - lastPoint.y, 2))
            if distance < 3 { // 降低最小距离阈值，让绘制更流畅
                return
            }
        }

        pathPoints.append(point)
        currentPath.addLine(to: point)

        // 检查是否接近起点（形成封闭路径）
        if pathPoints.count > 8 { // 降低最小点数要求
            let startPoint = pathPoints[0]
            let distance = sqrt(pow(point.x - startPoint.x, 2) + pow(point.y - startPoint.y, 2))

            if distance < 25 { // 稍微降低封闭距离阈值
                closePathIfValid()
            }
        }
    }

    /// 完成绘制
    private func finishDrawing() {
        isDrawing = false

        // 如果路径还没有封闭，尝试自动封闭
        if !isPathClosed && pathPoints.count > 3 {
            let startPoint = pathPoints[0]
            let endPoint = pathPoints.last!
            let distance = sqrt(pow(endPoint.x - startPoint.x, 2) + pow(endPoint.y - startPoint.y, 2))

            if distance < 50 { // 更宽松的自动封闭阈值
                closePathIfValid()
            }
        }

        // 生成平滑路径
        generateSmoothPath()
    }

    /// 封闭路径
    private func closePathIfValid() {
        if pathPoints.count > 3 {
            currentPath.closeSubpath()
            isPathClosed = true

            // 提供触觉反馈
            WKInterfaceDevice.current().play(.success)
        }
    }

    /// 生成平滑路径
    private func generateSmoothPath() {
        guard pathPoints.count > 2 else { return }

        // 简化路径点（减少计算量）
        let simplifiedPoints = simplifyPath(pathPoints, tolerance: 8.0)

        // 创建平滑的贝塞尔曲线路径
        smoothedPath = createSmoothPath(from: simplifiedPoints)

        // 如果路径已封闭，确保平滑路径也封闭
        if isPathClosed {
            smoothedPath.closeSubpath()
        }
    }

    /// 简化路径点（Douglas-Peucker算法的简化版本）
    private func simplifyPath(_ points: [CGPoint], tolerance: Double) -> [CGPoint] {
        guard points.count > 2 else { return points }

        var simplified: [CGPoint] = [points[0]]

        for i in 1..<points.count-1 {
            let current = points[i]
            let last = simplified.last!

            // 计算距离，如果距离大于阈值则保留点
            let distance = sqrt(pow(current.x - last.x, 2) + pow(current.y - last.y, 2))
            if distance > tolerance {
                simplified.append(current)
            }
        }

        // 总是保留最后一个点
        simplified.append(points.last!)

        return simplified
    }

    /// 创建平滑的贝塞尔曲线路径
    private func createSmoothPath(from points: [CGPoint]) -> Path {
        guard points.count > 1 else { return Path() }

        var path = Path()
        path.move(to: points[0])

        if points.count == 2 {
            path.addLine(to: points[1])
            return path
        }

        // 使用二次贝塞尔曲线连接点
        for i in 1..<points.count {
            let current = points[i]
            let _ = points[i-1]

            if i == points.count - 1 {
                // 最后一个点直接连线
                path.addLine(to: current)
            } else {
                let next = points[i+1]

                // 计算控制点
                let controlPoint = CGPoint(
                    x: current.x,
                    y: current.y
                )

                // 计算中点作为终点
                let midPoint = CGPoint(
                    x: (current.x + next.x) / 2,
                    y: (current.y + next.y) / 2
                )

                path.addQuadCurve(to: midPoint, control: controlPoint)
            }
        }

        return path
    }

    /// 清除路径
    private func clearPath() {
        pathPoints.removeAll()
        currentPath = Path()
        smoothedPath = Path()
        isDrawing = false
        isPathClosed = false
    }

    /// 确认选择
    private func confirmSelection() {
        guard isPathClosed else {
            #if DEBUG
            Logger.warning("⚠️ 圈选确认失败：路径未闭合", category: .ui)
            #endif
            return
        }

        let boundingRect = calculateBoundingRect()

        // 传递路径点和边界矩形
        onSelectionComplete(pathPoints, boundingRect)
    }

    /// 计算路径的边界矩形
    private func calculateBoundingRect() -> CGRect {
        guard !pathPoints.isEmpty else {
            return CGRect.zero
        }

        let minX = pathPoints.map { $0.x }.min() ?? 0
        let maxX = pathPoints.map { $0.x }.max() ?? 0
        let minY = pathPoints.map { $0.y }.min() ?? 0
        let maxY = pathPoints.map { $0.y }.max() ?? 0

        // 添加一些边距以确保完整包含圈选区域
        let margin: CGFloat = 5
        let adjustedMinX = max(0, minX - margin)
        let adjustedMinY = max(0, minY - margin)
        let adjustedMaxX = min(screenSize.width, maxX + margin)
        let adjustedMaxY = min(screenSize.height, maxY + margin)

        // 转换为相对于屏幕的比例坐标
        let normalizedX = adjustedMinX / screenSize.width
        let normalizedY = adjustedMinY / screenSize.height
        let normalizedWidth = (adjustedMaxX - adjustedMinX) / screenSize.width
        let normalizedHeight = (adjustedMaxY - adjustedMinY) / screenSize.height

        return CGRect(
            x: normalizedX,
            y: normalizedY,
            width: normalizedWidth,
            height: normalizedHeight
        )
    }
}

#Preview {
    return CircleSelectionOverlay(
        onSelectionComplete: { _, _ in },
        onCancel: { }
    )
}
