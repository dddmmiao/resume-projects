import SwiftUI
import StoreKit

// MARK: - StoreKit 管理器
@MainActor
class StoreKitManager: ObservableObject {
    static let shared = StoreKitManager()
    
    // 产品ID
    private let premiumProductID = "watchrgb_premium_unlock"
    
    @Published var products: [Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    @Published var isPurchasing = false
    @Published var purchaseError: String?
    
    private var updates: Task<Void, Never>?
    
    private init() {
        updates = listenForTransactions()
    }
    
    deinit {
        updates?.cancel()
    }
    
    // 加载产品
    func loadProducts() async {
        do {
            let products = try await withTimeout(seconds: 10) {
                try await Product.products(for: [self.premiumProductID])
            }
            
            guard !products.isEmpty else {
                throw StoreError.noProductsFound
            }
            
            self.products = products
            self.purchaseError = nil
            
            await checkPurchasedProducts()
            
        } catch {
            self.purchaseError = (error as? StoreError)?.errorDescription ?? error.localizedDescription
        }
    }
    
    // 超时函数
    private func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw StoreError.timeout
            }
            
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }
    
    // 检查已购买产品
    private func checkPurchasedProducts() async {
        var purchasedIDs: Set<String> = []
        
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                purchasedIDs.insert(transaction.productID)
            } catch {
                // 静默处理验证失败
            }
        }
        
        self.purchasedProductIDs = purchasedIDs
        updateMembershipStatus()
    }
    
    // 购买产品
    func purchase(_ product: Product) async throws {
        self.isPurchasing = true
        self.purchaseError = nil
        
        defer { self.isPurchasing = false }
        
        let result = try await product.purchase()
        
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            self.purchasedProductIDs.insert(transaction.productID)
            updateMembershipStatus()
            await transaction.finish()
            
        case .userCancelled, .pending:
            break
            
        @unknown default:
            break
        }
    }
    
    // 恢复购买
    func restorePurchases() async {
        try? await AppStore.sync()
        await checkPurchasedProducts()
    }
    
    // 验证交易
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }
    
    // 监听交易更新
    private func listenForTransactions() -> Task<Void, Never> {
        Task {
            for await result in Transaction.updates {
                do {
                    let transaction = try checkVerified(result)
                    self.purchasedProductIDs.insert(transaction.productID)
                    updateMembershipStatus()
                    await transaction.finish()
                } catch {
                    // 静默处理验证失败
                }
            }
        }
    }
    
    // 更新会员状态
    private func updateMembershipStatus() {
        let hasPremium = purchasedProductIDs.contains(premiumProductID)
        MembershipManager.shared.updatePremiumStatus(hasPremium)
    }
    
    // 计算属性
    var hasPremium: Bool {
        purchasedProductIDs.contains(premiumProductID)
    }
    
    var premiumProduct: Product? {
        products.first { $0.id == premiumProductID }
    }
}

// MARK: - StoreKit 错误
enum StoreError: Error, LocalizedError {
    case failedVerification
    case timeout
    case noProductsFound
    
    var errorDescription: String? {
        switch self {
        case .failedVerification:
            return "Transaction verification failed"
        case .timeout:
            return "Loading timeout, please check your network connection"
        case .noProductsFound:
            return "No products found"
        }
    }
} 
