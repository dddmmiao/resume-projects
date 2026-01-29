import Foundation
import SwiftUI

// MARK: - Double Extensions
extension Double {
    /// Format as percentage string
    var asPercentage: String {
        return "\(Int(self * 100))%"
    }
    
    /// Format with specified decimal places
    func formatted(decimalPlaces: Int) -> String {
        return String(format: "%.\(decimalPlaces)f", self)
    }
}

// MARK: - String Extensions
extension String {
    /// Truncate string to specified length
    func truncated(to length: Int, with trailing: String = "...") -> String {
        if self.count <= length {
            return self
        } else {
            let truncated = String(self.prefix(length))
            return truncated + trailing
        }
    }
    
    /// Check if string is empty or contains only whitespace
    var isBlankOrEmpty: Bool {
        return self.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    /// Generate unique identifier by appending timestamp
    func withTimestamp() -> String {
        return "\(self)_\(Date().timeIntervalSince1970)"
    }
}

// MARK: - Array Extensions
extension Array where Element == String {
    /// Filter out strings containing the specified suffix
    func excludingItemsContaining(_ suffix: String) -> [String] {
        return self.filter { !$0.contains(suffix) }
    }
    
    /// Sort by a custom order, with fallback to original order
    func sorted(by customOrder: [String: Int]) -> [String] {
        return self.sorted { item1, item2 in
            let order1 = customOrder[item1] ?? Int.max
            let order2 = customOrder[item2] ?? Int.max
            return order1 < order2
        }
    }
}

// MARK: - URL Extensions
extension URL {
    /// Get filename without extension
    var nameWithoutExtension: String {
        return self.deletingPathExtension().lastPathComponent
    }
    
    /// Check if file exists at this URL
    var fileExists: Bool {
        return FileManager.default.fileExists(atPath: self.path)
    }
}

// MARK: - UserDefaults Extensions
extension UserDefaults {
    /// Save codable object
    func setCodable<T: Codable>(_ object: T, forKey key: String) {
        do {
            let data = try JSONEncoder().encode(object)
            self.set(data, forKey: key)
        } catch {
            Logger.error("Failed to encode object for key \(key): \(error)", category: .general)
        }
    }
    
    /// Load codable object
    func getCodable<T: Codable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = self.data(forKey: key) else { return nil }
        
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            Logger.error("Failed to decode object for key \(key): \(error)", category: .general)
            return nil
        }
    }
}

// MARK: - Animation Extensions
extension Animation {
    /// Standard app animation
    static var appStandard: Animation {
        return .easeInOut(duration: AppConfig.defaultAnimationDuration)
    }
    
    /// Long app animation
    static var appLong: Animation {
        return .easeInOut(duration: AppConfig.longAnimationDuration)
    }
}

// MARK: - View Extensions
extension View {
    /// Apply conditional modifier
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
    
    /// Apply conditional modifier with else clause
    @ViewBuilder
    func `if`<TrueContent: View, FalseContent: View>(
        _ condition: Bool,
        if ifTransform: (Self) -> TrueContent,
        else elseTransform: (Self) -> FalseContent
    ) -> some View {
        if condition {
            ifTransform(self)
        } else {
            elseTransform(self)
        }
    }
    
    /// Add standard app padding
    func appPadding() -> some View {
        self.padding(AppTheme.mediumPadding)
    }
    
    /// Add standard app background
    func appBackground() -> some View {
        self.background(AppTheme.secondaryBackgroundColor.opacity(0.3))
            .cornerRadius(AppTheme.cornerRadius)
    }
}

// MARK: - FileManager Extensions
extension FileManager {
    /// Get documents directory URL
    var documentsDirectory: URL? {
        return self.urls(for: .documentDirectory, in: .userDomainMask).first
    }
    
    /// Clean up files matching pattern in directory
    func cleanupFiles(in directory: URL, matching pattern: String) {
        do {
            let files = try self.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            for file in files {
                if file.lastPathComponent.contains(pattern) {
                    try self.removeItem(at: file)
                }
            }
        } catch {
            Logger.error("Error cleaning up files: \(error)", category: .general)
        }
    }
    
    /// Create directory if it doesn't exist
    func createDirectoryIfNeeded(at url: URL) {
        if !self.fileExists(atPath: url.path) {
            do {
                try self.createDirectory(at: url, withIntermediateDirectories: true)
            } catch {
                Logger.error("Error creating directory: \(error)", category: .general)
            }
        }
    }
}

// MARK: - Color Extensions
extension Color {
    /// Create color from hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
    
    /// Get hex string representation
    var hexString: String {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        
        uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        
        let rgb: Int = (Int(red * 255) << 16) | (Int(green * 255) << 8) | Int(blue * 255)
        return String(format: "#%06x", rgb)
    }
}

// MARK: - Utilities
struct Utils {
    /// Generate unique filename
    static func uniqueFilename(base: String, extension: String) -> String {
        let timestamp = Date().timeIntervalSince1970
        return "\(base)_\(timestamp).\(`extension`)"
    }
    
    /// Validate filename
    static func isValidFilename(_ filename: String) -> Bool {
        let invalidCharacters = CharacterSet(charactersIn: "\\/:*?\"<>|")
        return filename.rangeOfCharacter(from: invalidCharacters) == nil && !filename.isEmpty
    }
    
    /// Format file size
    static func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
    
    /// Safe cast to specific type
    static func safeCast<T>(_ value: Any, to type: T.Type) -> T? {
        return value as? T
    }
    
    /// Clamp value to range
    static func clamp<T: Comparable>(_ value: T, to range: ClosedRange<T>) -> T {
        return min(max(value, range.lowerBound), range.upperBound)
    }
}

// MARK: - Image Content Mode Extension
extension Image {
    /// Apply image content mode for toast display
    func applyImageContentMode(_ mode: ImageToastContentMode) -> some View {
        switch mode {
        case .fit:
            return AnyView(self.aspectRatio(contentMode: .fit))
        case .fill:
            return AnyView(self.aspectRatio(contentMode: .fill).clipped())
        case .center:
            return AnyView(self.scaledToFit())
        }
    }
}