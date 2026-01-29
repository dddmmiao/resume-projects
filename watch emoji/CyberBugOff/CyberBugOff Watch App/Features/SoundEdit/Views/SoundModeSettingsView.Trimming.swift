import SwiftUI
import WatchKit

// MARK: - Trimming & Waveform
extension SoundModeSettingsView {
    /// 音频裁剪区，包含波形图与裁剪点操作
    var trimmingSection: some View {
        PerformantExpandableSection(
            isExpanded: $showingTrimmingInterface,
            header: {
                HStack {
                    HStack(spacing: AppTheme.smallPadding) {
                        Image(systemName: "scissors")
                            .foregroundColor(AppTheme.primaryColor)
                            .font(.system(size: AppTheme.smallIconSize))
                            .frame(width: AppTheme.iconSize, height: AppTheme.iconSize)
                        Text("音频裁剪")
                            .font(.appBody)
                            .foregroundColor(Color.textPrimary)
                    }
                    Spacer()
                    Image(systemName: showingTrimmingInterface ? "chevron.up" : "chevron.down")
                        .font(.appSmall)
                        .foregroundColor(.textTertiary)
                        .rotationEffect(.degrees(showingTrimmingInterface ? 0 : 0))
                }
                .standardRowStyle()
            },
            content: {
                VStack(alignment: .leading, spacing: AppTheme.smallPadding) {
                    if !waveformData.isEmpty {
                        waveformView
                            .frame(height: AppTheme.rowHeight)
                            .background(
                                RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                                    .fill(AppTheme.secondaryBackgroundColor.opacity(0.5))
                            )
                            .padding(.horizontal, AppTheme.mediumPadding)
                    }
                    infoArea
                        .standardRowStyle(hasFixedHeight: false)
                }
                .onAppear {
                    // 当展开时，触发波形数据生成
                    if waveformData.isEmpty {
                        DispatchQueue.global(qos: .userInitiated).async {
                            if let url = model.getURL(for: config.baseSoundName) {
                                generateWaveformData(from: url)
                            }
                        }
                    }
                }
                .onDisappear {
                    // 当关闭调整行时，重置控制点激活状态
                    activeTrimPoint = nil
                    Logger.debug("音效裁剪调整行已关闭，控制点激活状态已重置", category: .ui)
                }
            },
            skeleton: {
                AudioTrimmingSkeleton()
            }
        )
    }
    

    
    private var infoArea: some View {
        VStack(spacing: AppTheme.smallPadding) {
            HStack {
                Text("裁切范围")
                    .font(.appBody)
                    .foregroundColor(.textPrimary)
                Spacer()
                Text("\(formatTime(config.startTime)) - \(formatTime(config.endTime ?? totalDuration))")
                    .font(.appSmall)
                    .foregroundColor(.textTertiary)
            }
            HStack {
                Image(systemName: "digitalcrown.arrow.clockwise")
                    .font(.system(size: 14))
                    .foregroundColor(.textTertiary)
                Text("拖动或选中圆点后转动表冠微调")
                    .font(.appLabel)
                    .foregroundColor(.textTertiary)
                    .lineLimit(nil)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        }
    }

    // MARK: - 波形图视图
    private var waveformView: some View {
        VStack(spacing: 4) {
            HStack {
                if isGeneratingWaveform { ProgressView().scaleEffect(0.7) }
            }
            GeometryReader { geometry in
                let paddedWidth = geometry.size.width - 32 // 左右各16的padding
                
                ZStack {
                    gridLines
                    waveformBarsView(for: paddedWidth)
                    selectionRect(in: geometry, paddedWidth: paddedWidth)
                    // 起止点圆点指示器
                    if !waveformData.isEmpty {
                        // 起点
                        Circle()
                            .fill(activeTrimPoint == .start ? .yellow : .green)
                            .frame(width: 16, height: 16)
                            .overlay(Circle().stroke(Color.white, lineWidth: 2))
                            .shadow(radius: activeTrimPoint == .start ? 4 : 0)
                            .position(x: pointPosition(time: config.startTime, paddedWidth: paddedWidth), y: geometry.size.height / 2)
                            .gesture(
                                DragGesture(minimumDistance: 5)
                                    .onChanged { drag in
                                        if activeTrimPoint != .start {
                                            activeTrimPoint = .start
                                            WKInterfaceDevice.current().play(.click)
                                        }
                                        isDragging = true
                                        let newTime = ((drag.location.x - 16) / paddedWidth) * totalDuration
                                        let endTime = config.endTime ?? totalDuration
                                        let clampedTime = max(0, min(newTime, endTime - 0.05))
                                        config.startTime = clampedTime
                                    }
                                    .onEnded { _ in isDragging = false }
                            )
                            .onTapGesture {
                                activeTrimPoint = (activeTrimPoint == .start) ? nil : .start
                                WKInterfaceDevice.current().play(.click)
                            }

                        // 终点（当 endTime 存在时）
                        if let endTime = config.endTime {
                            Circle()
                                .fill(activeTrimPoint == .end ? .yellow : .red)
                                .frame(width: 16, height: 16)
                                .overlay(Circle().stroke(Color.white, lineWidth: 2))
                                .shadow(radius: activeTrimPoint == .end ? 4 : 0)
                                .position(x: pointPosition(time: endTime, paddedWidth: paddedWidth), y: geometry.size.height / 2)
                                .gesture(
                                    DragGesture(minimumDistance: 5)
                                        .onChanged { drag in
                                            if activeTrimPoint != .end {
                                                activeTrimPoint = .end
                                                WKInterfaceDevice.current().play(.click)
                                            }
                                            isDragging = true
                                            let newTime = ((drag.location.x - 16) / paddedWidth) * totalDuration
                                            let clampedTime = min(totalDuration, max(newTime, config.startTime + 0.05))
                                            config.endTime = clampedTime
                                        }
                                        .onEnded { _ in isDragging = false }
                                )
                                .onTapGesture {
                                    activeTrimPoint = (activeTrimPoint == .end) ? nil : .end
                                    WKInterfaceDevice.current().play(.click)
                                }
                        }
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { activeTrimPoint = nil }
            }
            .frame(height: 40)
            .clipped()
        }
    }

    private var gridLines: some View {
        VStack(spacing: 0) {
            ForEach(0..<5, id: \.self) { _ in
                Divider().opacity(0.3)
                Spacer()
            }
        }
    }

    private func waveformBarsView(for width: CGFloat) -> some View {
        let barCount = waveformData.count
        guard barCount > 0 else {
            return AnyView(Rectangle().fill(Color.clear).frame(width: width, height: 30))
        }

        let spacing: CGFloat = 0.5
        let totalSpacing = CGFloat(barCount - 1) * spacing
        let barWidth = max(0.1, (width - totalSpacing) / CGFloat(barCount))

        return AnyView(
            HStack(spacing: spacing) {
                ForEach(Array(waveformData.enumerated()), id: \.offset) { index, amp in
                    let height = max(2, CGFloat(amp) * 30)
                    Rectangle()
                        .fill(isInSelectionRange(index: index) ? AppTheme.primaryColor : Color.gray.opacity(0.6))
                        .frame(width: barWidth, height: height)
                        .animation(isDragging ? .none : .easeInOut(duration: 0.1), value: isDragging)
                }
            }
            .frame(width: width)
        )
    }

    private func selectionRect(in geometry: GeometryProxy, paddedWidth: CGFloat) -> some View {
        let startRatio = config.startTime / totalDuration
        let endRatio = (config.endTime ?? totalDuration) / totalDuration
        
        let width = paddedWidth * CGFloat(endRatio - startRatio)
        let selectionCenterX = 16 + paddedWidth * CGFloat(startRatio) + (width / 2)
        
        return Rectangle()
            .fill(AppTheme.primaryColor.opacity(0.2))
            .frame(width: width, height: geometry.size.height)
            .position(x: selectionCenterX, y: geometry.size.height / 2)
            .animation(isDragging ? .none : .default, value: width)
            .animation(isDragging ? .none : .default, value: selectionCenterX)
    }

    // MARK: - 计算辅助
    private func pointPosition(time: TimeInterval, paddedWidth: CGFloat) -> CGFloat {
        guard !waveformData.isEmpty, totalDuration > 0 else { return 16 }
        let ratio = time / totalDuration
        return 16 + paddedWidth * CGFloat(ratio)
    }

    private func isInSelectionRange(index: Int) -> Bool {
        guard !waveformData.isEmpty else { return false }
        let ratio = Double(index) / Double(waveformData.count)
        let startRatio = config.startTime / totalDuration
        let endRatio = (config.endTime ?? totalDuration) / totalDuration
        return ratio >= startRatio && ratio <= endRatio
    }

    // MARK: - Stub for rotation handling to satisfy compiler
    fileprivate func handleCrownRotation(delta: Double) {
        // 根据表冠旋转增量计算时间调整量
        guard let activePoint = activeTrimPoint else { return }
        let timeAdjustment = (delta / 10.0) * (totalDuration / 30.0)

        switch activePoint {
        case .start:
            // 起点不能超过终点 - 0.05
            let newStart = max(0, min(config.startTime + timeAdjustment, (config.endTime ?? totalDuration) - 0.05))
            if newStart != config.startTime {
                config.startTime = newStart
                WKInterfaceDevice.current().play(.click)
            }
        case .end:
            // 终点不能小于起点 + 0.05
            let newEnd = min(totalDuration, max(config.startTime + 0.05, (config.endTime ?? totalDuration) + timeAdjustment))
            if newEnd != config.endTime {
                config.endTime = newEnd
                WKInterfaceDevice.current().play(.click)
            }
        }
    }
    
}
