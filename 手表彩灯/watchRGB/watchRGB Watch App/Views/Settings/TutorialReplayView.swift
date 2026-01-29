import SwiftUI
import WatchKit

/**
 * TutorialReplayView.swift - 重播引导视图
 *
 * 功能:
 * - 显示应用使用教程
 * - 分步骤引导用户了解功能
 * - 支持跳过和完成操作
 */

struct TutorialReplayView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentStep: Int = 0
    @State private var showStepAnimation: Bool = false
    
    // 新增：是否是初次安装引导
    let isFirstLaunch: Bool
    let onTutorialCompleted: (() -> Void)?
    
    // 初始化方法
    init(isFirstLaunch: Bool = false, onTutorialCompleted: (() -> Void)? = nil) {
        self.isFirstLaunch = isFirstLaunch
        self.onTutorialCompleted = onTutorialCompleted
    }
    
    // 引导步骤数据
    private let tutorialSteps: [TutorialStep] = [
        TutorialStep(
            title: NSLocalizedString("tutorial.step.welcome.title", comment: ""),
            description: NSLocalizedString("tutorial.step.welcome.description", comment: ""),
            icon: "paintpalette.fill",
            color: .blue
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.swipe.title", comment: ""),
            description: NSLocalizedString("tutorial.step.swipe.description", comment: ""),
            icon: "arrow.left.arrow.right",
            color: .green
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.brightness.title", comment: ""),
            description: NSLocalizedString("tutorial.step.brightness.description", comment: ""),
            icon: "warninglight",
            color: .yellow
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.shake.title", comment: ""),
            description: NSLocalizedString("tutorial.step.shake.description", comment: ""),
            icon: "shuffle",
            color: .purple
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.editor.title", comment: ""),
            description: NSLocalizedString("tutorial.step.editor.description", comment: ""),
            icon: "circle.hexagongrid.fill",
            color: .orange
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.breathing.title", comment: ""),
            description: NSLocalizedString("tutorial.step.breathing.description", comment: ""),
            icon: "lungs.fill",
            color: .pink
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.settings.title", comment: ""),
            description: NSLocalizedString("tutorial.step.settings.description", comment: ""),
            icon: "gearshape.fill",
            color: .gray
        ),
        TutorialStep(
            title: NSLocalizedString("tutorial.step.done.title", comment: ""),
            description: NSLocalizedString("tutorial.step.done.description", comment: ""),
            icon: "checkmark.circle.fill",
            color: .green
        )
    ]
    
    var body: some View {
        NavigationStack {
            ViewThatFits {
                // 优先使用这个视图，如果空间足够的话
                buildTutorialView()
                
                // 如果上面的视图空间不足，则使用这个可滚动的版本
                ScrollView {
                    buildTutorialView()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)
                    }
                }
            }
        }
        .onAppear {
            startStepAnimation()
        }
    }
    
    // 构件教程视图，以便重用
    @ViewBuilder
    private func buildTutorialView() -> some View {
        VStack(spacing: 5) {
            // 进度指示器
            ProgressView(value: Double(currentStep + 1), total: Double(tutorialSteps.count))
                .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                .padding(.horizontal, GlobalConfig.shared.spacing(20))
            
            Spacer(minLength: 5)
            
            // 步骤内容
            VStack(spacing: GlobalConfig.shared.spacing(10)) {
                // 图标
                Image(systemName: tutorialSteps[currentStep].icon)
                    .font(.system(size: GlobalConfig.shared.fontSize(40)))
                    .frame(width: GlobalConfig.shared.buttonSize(50), height: GlobalConfig.shared.buttonSize(50))
                    .foregroundColor(tutorialSteps[currentStep].color)
                    .scaleEffect(showStepAnimation ? 1.1 : 1.0)
                    .animation(.spring(response: 0.6, dampingFraction: 0.6), value: showStepAnimation)
                
                // 标题
                Text(tutorialSteps[currentStep].title)
                    .font(.system(size: GlobalConfig.shared.fontSize(17), weight: .bold))
                    .multilineTextAlignment(.center)
                    .opacity(showStepAnimation ? 1.0 : 0.0)
                    .animation(.easeIn(duration: 0.3).delay(0.2), value: showStepAnimation)
                
                // 描述
                VStack {
                    Text(tutorialSteps[currentStep].description)
                        .font(.system(size: GlobalConfig.shared.fontSize(13)))
                        .foregroundColor(GlobalConfig.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .opacity(showStepAnimation ? 1.0 : 0.0)
                        .animation(.easeIn(duration: 0.3).delay(0.4), value: showStepAnimation)
                    Spacer(minLength: 0)
                }
                .frame(height: GlobalConfig.shared.spacing(30))
                .padding(.horizontal, GlobalConfig.shared.spacing(20))
            }
            
            Spacer(minLength: 5)
            
            // 按钮区域
            HStack(spacing: GlobalConfig.shared.spacing(10)) {
                // 跳过按钮 - 初次安装时不显示
                if !isFirstLaunch && currentStep < tutorialSteps.count - 1 {
                    Button("tutorial.button.skip") {
                        dismiss()
                    }
                    .buttonStyle(GlobalSecondaryButtonStyle())
                }
                
                // 下一步/完成按钮
                Button(currentStep < tutorialSteps.count - 1 ? NSLocalizedString("tutorial.button.next", comment: "") : NSLocalizedString("tutorial.button.done", comment: "")) {
                    if currentStep < tutorialSteps.count - 1 {
                        nextStep()
                    } else {
                        // 完成引导
                        if isFirstLaunch {
                            // 初次安装引导完成，调用回调
                            onTutorialCompleted?()
                        }
                        dismiss()
                    }
                }
                .buttonStyle(GlobalPrimaryButtonStyle())
            }
            .padding(.horizontal, GlobalConfig.shared.spacing(10))
        }
        .padding(.vertical)
    }
    
    // 下一步
    private func nextStep() {
        // 播放触觉反馈
        WKInterfaceDevice.current().play(.click)
        
        // 重置动画状态
        showStepAnimation = false
        
        // 延迟后进入下一步
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            currentStep += 1
            startStepAnimation()
        }
    }
    
    // 开始步骤动画
    private func startStepAnimation() {
        showStepAnimation = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation {
                showStepAnimation = true
            }
        }
    }
}

// MARK: - 教程步骤数据结构
struct TutorialStep {
    let title: String
    let description: String
    let icon: String
    let color: Color
}

// MARK: - 主/次要按钮样式
struct GlobalPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(10)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

struct GlobalSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.gray.opacity(0.3))
            .foregroundColor(.white)
            .cornerRadius(10)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

#Preview {
    TutorialReplayView()
} 
