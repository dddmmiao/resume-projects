import SwiftUI
import WatchKit

/// 路径配置协议
protocol PathConfigProtocol {
    static var minPointDistance: CGFloat { get }
    static var simplificationTolerance: CGFloat { get }
    static var maxPathPoints: Int { get }
    static var smoothingFactor: CGFloat { get }
}

/// 圈选功能性能优化器
struct CircleSelectionOptimizer {
    
    /// 路径简化配置
    struct PathConfig: PathConfigProtocol {
        static let minPointDistance: CGFloat = 4.0      // 增加最小点距离，减少密度
        static let simplificationTolerance: CGFloat = 3.0  // 增加简化容差，更激进的简化
        static let maxPathPoints: Int = 30              // 减少最大路径点数，提升性能
        static let smoothingFactor: CGFloat = 0.3       // 平滑系数
    }
    
    /// Toast专用路径简化配置（优化圆滑度）
    struct ToastPathConfig: PathConfigProtocol {
        static let minPointDistance: CGFloat = 1.5      // 进一步降低点距离要求，保持更多细节
        static let simplificationTolerance: CGFloat = 1.0  // 降低容差，保留更多路径细节
        static let maxPathPoints: Int = 60              // 增加最大点数，保持路径圆滑
        static let smoothingFactor: CGFloat = 0.15      // 减少平滑强度，避免过度平滑
    }
    
    /// 渲染优化配置
    struct RenderConfig {
        static let strokeWidth: CGFloat = 2.0
        static let fillOpacity: Double = 0.2
        static let strokeOpacity: Double = 0.8
        static let animationDuration: Double = 0.1
    }
    
    /// 优化路径点集合（通用版本）
    static func optimizePath(_ points: [CGPoint]) -> [CGPoint] {
        return optimizePath(points, config: PathConfig.self)
    }
    
    /// 专门为Toast优化的路径处理
    static func optimizePathForToast(_ points: [CGPoint]) -> [CGPoint] {
        Logger.debug("Toast路径优化开始: 输入点数 \(points.count)", category: .ui)
        let result = optimizePath(points, config: ToastPathConfig.self)
        Logger.success("Toast路径优化完成: \(points.count) -> \(result.count) 个点", category: .ui)
        
        // 安全检查：确保至少保留基本的圈选路径
        let minRequiredPoints = max(3, points.count / 5) // 至少3个点，或原点数的20%
        if result.count < minRequiredPoints {
            Logger.warning("Toast路径过度简化(\(result.count) < \(minRequiredPoints))，使用通用优化", category: .ui)
            let fallbackResult = optimizePath(points, config: PathConfig.self)
            
            // 如果通用优化仍然不够，则进一步放宽要求
            if fallbackResult.count < 3 {
                Logger.warning("通用优化仍不足，使用原始路径前80%的点", category: .ui)
                let safePointCount = max(3, min(points.count, Int(Double(points.count) * 0.8)))
                return Array(points.prefix(safePointCount))
            }
            
            return fallbackResult
        }
        
        return result
    }
    
    /// 优化路径点集合（可配置版本）
    private static func optimizePath<T>(_ points: [CGPoint], config: T.Type) -> [CGPoint] where T: PathConfigProtocol {
        guard points.count > 2 else { return points }
        
        // 1. 距离过滤
        let filteredPoints = filterByDistance(points, minDistance: T.minPointDistance)
        
        // 2. Douglas-Peucker 简化
        let simplifiedPoints = douglasPeucker(filteredPoints, tolerance: T.simplificationTolerance)
        
        // 3. 限制点数
        let limitedPoints = limitPointCount(simplifiedPoints, maxPoints: T.maxPathPoints)
        
        // 4. 平滑处理
        return smoothPath(limitedPoints, factor: T.smoothingFactor)
    }
    
    /// 检查路径是否封闭
    static func isPathClosed(_ points: [CGPoint], threshold: CGFloat = 30.0) -> Bool {
        guard points.count >= 3 else { return false }
        let distance = points.first!.distance(to: points.last!)
        return distance <= threshold
    }
    
    /// 创建优化的 SwiftUI 路径
    static func createOptimizedPath(_ points: [CGPoint]) -> Path {
        var path = Path()
        guard !points.isEmpty else { return path }
        
        path.move(to: points[0])
        
        if points.count == 1 {
            path.addLine(to: points[0])
        } else if points.count == 2 {
            path.addLine(to: points[1])
        } else {
            // 使用二次贝塞尔曲线进行平滑
            for i in 1..<points.count {
                let current = points[i]
                if i < points.count - 1 {
                    let next = points[i + 1]
                    let midPoint = CGPoint(
                        x: (current.x + next.x) / 2,
                        y: (current.y + next.y) / 2
                    )
                    path.addQuadCurve(to: midPoint, control: current)
                } else {
                    path.addLine(to: current)
                }
            }
        }
        
        return path
    }
    
    // MARK: - Private Methods
    
    /// 按距离过滤点
    private static func filterByDistance(_ points: [CGPoint], minDistance: CGFloat) -> [CGPoint] {
        guard !points.isEmpty else { return [] }
        
        var filtered: [CGPoint] = [points[0]]
        
        for point in points.dropFirst() {
            if let last = filtered.last,
               point.distance(to: last) >= minDistance {
                filtered.append(point)
            }
        }
        
        return filtered
    }
    
    /// Douglas-Peucker 路径简化算法
    private static func douglasPeucker(_ points: [CGPoint], tolerance: CGFloat) -> [CGPoint] {
        guard points.count > 2 else { return points }
        
        let firstPoint = points.first!
        let lastPoint = points.last!
        
        var maxDistance: CGFloat = 0
        var maxIndex = 0
        
        // 找到距离起终点连线最远的点
        for i in 1..<points.count - 1 {
            let distance = pointToLineDistance(points[i], lineStart: firstPoint, lineEnd: lastPoint)
            if distance > maxDistance {
                maxDistance = distance
                maxIndex = i
            }
        }
        
        // 如果最大距离大于容差，递归简化
        if maxDistance > tolerance {
            let leftPoints = douglasPeucker(Array(points[0...maxIndex]), tolerance: tolerance)
            let rightPoints = douglasPeucker(Array(points[maxIndex..<points.count]), tolerance: tolerance)
            
            // 合并结果，去除重复点
            return leftPoints + rightPoints.dropFirst()
        } else {
            return [firstPoint, lastPoint]
        }
    }
    
    /// 限制路径点数量
    private static func limitPointCount(_ points: [CGPoint], maxPoints: Int) -> [CGPoint] {
        guard points.count > maxPoints else { return points }
        
        let step = Double(points.count) / Double(maxPoints)
        var result: [CGPoint] = []
        
        for i in 0..<maxPoints {
            let index = Int(Double(i) * step)
            if index < points.count {
                result.append(points[index])
            }
        }
        
        // 确保包含最后一个点
        if let last = points.last, result.last != last {
            result.append(last)
        }
        
        return result
    }
    
    /// 平滑路径
    private static func smoothPath(_ points: [CGPoint], factor: CGFloat) -> [CGPoint] {
        guard points.count > 2 else { return points }
        
        var smoothed: [CGPoint] = [points[0]]
        
        for i in 1..<points.count - 1 {
            let prev = points[i - 1]
            let current = points[i]
            let next = points[i + 1]
            
            let smoothedX = prev.x * factor +
                          current.x * (1 - 2 * factor) +
                          next.x * factor
            
            let smoothedY = prev.y * factor +
                          current.y * (1 - 2 * factor) +
                          next.y * factor
            
            smoothed.append(CGPoint(x: smoothedX, y: smoothedY))
        }
        
        smoothed.append(points.last!)
        return smoothed
    }
    
    /// 计算点到直线的距离
    private static func pointToLineDistance(_ point: CGPoint, lineStart: CGPoint, lineEnd: CGPoint) -> CGFloat {
        let A = lineEnd.y - lineStart.y
        let B = lineStart.x - lineEnd.x
        let C = lineEnd.x * lineStart.y - lineStart.x * lineEnd.y
        
        return abs(A * point.x + B * point.y + C) / sqrt(A * A + B * B)
    }
}

/// CGPoint 扩展
extension CGPoint {
    func distance(to point: CGPoint) -> CGFloat {
        return sqrt(pow(x - point.x, 2) + pow(y - point.y, 2))
    }
} 