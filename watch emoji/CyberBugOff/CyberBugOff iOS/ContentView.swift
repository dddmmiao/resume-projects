import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            
            Image(systemName: "applewatch")
                .font(.system(size: 100))
                .foregroundStyle(.blue)
            
            VStack(spacing: 12) {
                Text("watch emoji")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("手腕上的互动音效 Emoji")
                    .font(.title3)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            VStack(spacing: 16) {
                Label("请在 Apple Watch 上使用", systemImage: "arrow.down.circle.fill")
                    .font(.headline)
                    .foregroundColor(.blue)
                
                Text("这是一款专为 Apple Watch 设计的互动图音合成器")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            
            Spacer()
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
