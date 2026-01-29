//
//  watchRGBApp.swift
//  watchRGB Watch App
//
//  Created by 吕海峰 on 2025/5/30.
//

/*
 * ============================================================================
 * 文件名称: watchRGBApp.swift
 * 文件功能: watchRGB 应用程序入口点
 * 所属模块: Application (应用入口层)
 * ============================================================================
 *
 * 【文件概述】
 * 本文件是整个 watchRGB 应用的入口文件，使用 SwiftUI 的 App 协议定义应用结构。
 * 主要职责包括:
 *   1. 声明应用入口点 (@main)
 *   2. 初始化全局状态对象 (BrightnessManager, DisplayModeManager)
 *   3. 将状态对象注入到视图层级 (通过 environmentObject)
 *
 * 【设计说明】
 * - 采用 SwiftUI 声明式 App 生命周期管理
 * - 使用 @StateObject 确保状态对象在应用生命周期内保持单一实例
 * - 通过 environmentObject 实现依赖注入，子视图无需手动传递状态
 *
 * 【技术要点】
 * 1. @main: Swift 5.3+ 特性，标记应用程序入口点
 * 2. @StateObject: 在视图中创建并持有引用类型的状态，生命周期与视图绑定
 * 3. environmentObject: SwiftUI 的依赖注入机制，沿视图树向下传递共享数据
 *
 * ============================================================================
 */

import SwiftUI

// MARK: - 应用程序入口
/// watchRGB 应用主结构体
///
/// 这是整个应用的入口点，遵循 SwiftUI 的 App 协议。
/// @main 属性包装器告诉编译器这是程序的启动入口。
///
/// ## 职责
/// - 初始化全局状态管理器
/// - 创建主窗口组并加载 ContentView
/// - 将共享状态注入到视图环境中
///
/// ## 状态管理架构
/// ```
/// watchRGB_Watch_AppApp
///     ├── brightnessManager (BrightnessManager)
///     │   └── 管理屏幕亮度状态
///     └── displayModeManager (DisplayModeManager)
///         └── 管理显示模式、呼吸动画、颜色序列
/// ```
@main
struct watchRGB_Watch_AppApp: App {
    
    // MARK: - 状态对象
    
    /// 亮度管理器
    /// - Note: 使用 @StateObject 确保在 App 生命周期内只创建一次
    /// - 功能: 管理屏幕显示亮度值 (0.2 ~ 1.0)
    /// - 访问方式: 子视图通过 `@EnvironmentObject var brightnessManager: BrightnessManager` 获取
    @StateObject private var brightnessManager = BrightnessManager()
    
    /// 显示模式管理器
    /// - Note: 应用核心状态管理器，包含大量业务逻辑
    /// - 功能: 管理单色/呼吸模式切换、呼吸动画控制、自定义颜色序列
    /// - 访问方式: 子视图通过 `@EnvironmentObject var displayModeManager: DisplayModeManager` 获取
    @StateObject private var displayModeManager = DisplayModeManager()
    
    // MARK: - 视图主体
    
    /// 应用程序场景定义
    ///
    /// 使用 WindowGroup 创建主窗口，加载 ContentView 作为根视图。
    /// 通过 environmentObject 修饰符将状态对象注入视图环境。
    ///
    /// ## 视图层级
    /// ```
    /// WindowGroup
    ///     └── ContentView
    ///         ├── 接收 brightnessManager 环境对象
    ///         └── 接收 displayModeManager 环境对象
    /// ```
    var body: some Scene {
        WindowGroup {
            // 加载主视图
            ContentView()
                // 注入亮度管理器到环境
                // 所有子视图都可以通过 @EnvironmentObject 访问
                .environmentObject(brightnessManager)
                // 注入显示模式管理器到环境
                // 包含呼吸动画、颜色编辑等核心功能
                .environmentObject(displayModeManager)
        }
    }
}

/*
 * ============================================================================
 * 【扩展阅读】
 *
 * 1. App 协议 (SwiftUI)
 *    - iOS 14+ / watchOS 7+ 引入的新 App 生命周期
 *    - 替代传统的 UIApplicationDelegate
 *    - 文档: https://developer.apple.com/documentation/swiftui/app
 *
 * 2. @StateObject vs @ObservedObject
 *    - @StateObject: 视图创建并持有对象，对象生命周期与视图绑定
 *    - @ObservedObject: 视图不持有对象，需要外部传入
 *    - 在 App 入口使用 @StateObject 确保状态在整个应用期间存活
 *
 * 3. Environment Object 传递机制
 *    - environmentObject(_:) 将对象放入视图环境
 *    - 子视图使用 @EnvironmentObject 属性包装器获取
 *    - 如果子视图未找到对应类型的环境对象，会导致运行时崩溃
 *
 * ============================================================================
 */
