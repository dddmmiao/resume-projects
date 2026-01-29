import Foundation

// MARK: - 异步数据存储 Actor
actor DataStoreActor {
    static let shared = DataStoreActor()
    private let ud = UserDefaults.standard

    // 读取 Data
    func data(forKey key: String) -> Data? {
        return ud.data(forKey: key)
    }

    // 存储 Data（nil = 删除）
    func set(_ data: Data?, forKey key: String) {
        ud.set(data, forKey: key)
    }

    // 通用编码存储
    func save<T: Codable>(_ value: T, forKey key: String) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(value) {
            ud.set(data, forKey: key)
        }
    }
} 