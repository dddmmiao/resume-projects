//
//  CyberBugOffApp.swift
//  CyberBugOff Watch App
//
//  Created by 吕海峰 on 2026/1/29.
//

import SwiftUI

@main
struct CyberBugOff_Watch_AppApp: App {
    @StateObject private var model = BugOffModel()
    
    var body: some Scene {
        WindowGroup {
            ImageModeView(model: model)
        }
    }
}
