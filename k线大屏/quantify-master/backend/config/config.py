"""
简化配置文件 - 纯环境变量方式
"""
import os

class Settings:
    """应用配置 - 纯环境变量方式"""
    
    def __init__(self):
        # 应用基础配置
        self.APP_NAME = os.getenv("APP_NAME", "股票K线大屏系统")
        self.APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
        self.DEBUG = os.getenv("DEBUG", "true").lower() == "true"
        self.ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
        
        # 服务器配置
        self.HOST = os.getenv("HOST", "0.0.0.0")
        self.PORT = int(os.getenv("PORT", "8000"))
        
        # 数据库配置
        self.DATABASE_URL = os.getenv("DATABASE_URL")
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL 环境变量未设置，请在 .env 文件中配置数据库连接信息")
        
        # Tushare配置
        self.TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN")
        if not self.TUSHARE_TOKEN:
            raise ValueError("TUSHARE_TOKEN 环境变量未设置，请在 .env 文件中配置 Tushare Token")
        
        # 安全配置
        self.SECRET_KEY = os.getenv("SECRET_KEY")
        if not self.SECRET_KEY:
            raise ValueError("SECRET_KEY 环境变量未设置，请在 .env 文件中配置安全密钥")
        
        # JWT 配置
        self.ALGORITHM = os.getenv("ALGORITHM", "HS256")
        
        # 数据更新配置
        self.DATA_UPDATE_HOUR = int(os.getenv("DATA_UPDATE_HOUR", "18"))
        self.DATA_UPDATE_MINUTE = int(os.getenv("DATA_UPDATE_MINUTE", "0"))
        
        # 缓存配置
        self.REDIS_URL = os.getenv("REDIS_URL")
        self.CACHE_EXPIRE_SECONDS = int(os.getenv("CACHE_EXPIRE_SECONDS", "3600"))
        self.CACHE_DIR = os.getenv("CACHE_DIR", "./data/cache")
        
        # 日志配置
        self.LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG")
        self.LOG_FILE = os.getenv("LOG_FILE", "./logs/app.log")
        
        # CORS配置
        cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        self.CORS_ORIGINS = [origin.strip() for origin in cors_origins.split(",")]
        
        # 股票配置
        default_stocks = os.getenv("DEFAULT_STOCK_LIST", "000001.SZ,000002.SZ,600000.SH,600036.SH,600519.SH,000858.SZ")
        self.DEFAULT_STOCK_LIST = [stock.strip() for stock in default_stocks.split(",")]
        
        # K线数据配置
        self.KLINE_PERIODS = {
            "daily": "日线",
            "weekly": "周线", 
            "monthly": "月线"
        }
        
        # 数据获取配置
        self.MAX_KLINE_DAYS = int(os.getenv("MAX_KLINE_DAYS", "365"))
        self.BATCH_SIZE = int(os.getenv("BATCH_SIZE", "50"))
        
        # 任务配置
        self.TASK_TIMEOUT = int(os.getenv("TASK_TIMEOUT", "300"))
        self.MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "5"))
        
        # 数据库连接池配置
        self.DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
        self.DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "30"))
        self.DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
        self.DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))
        
        # Redis连接池配置
        self.REDIS_POOL_SIZE = int(os.getenv("REDIS_POOL_SIZE", "20"))
        self.REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "100"))
        
        # 限流配置
        self.RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
        self.RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "1000"))
        self.RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
        
        # 健康检查配置
        self.HEALTH_CHECK_INTERVAL = int(os.getenv("HEALTH_CHECK_INTERVAL", "30"))
        self.HEALTH_CHECK_TIMEOUT = int(os.getenv("HEALTH_CHECK_TIMEOUT", "10"))
        
        # 备份配置
        self.BACKUP_ENABLED = os.getenv("BACKUP_ENABLED", "true").lower() == "true"
        self.BACKUP_SCHEDULE = os.getenv("BACKUP_SCHEDULE", "0 2 * * *")
        self.BACKUP_RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
        
        # 性能配置
        self.MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", "10485760"))  # 10MB
        self.REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
        
        # 监控配置
        self.ENABLE_METRICS = os.getenv("ENABLE_METRICS", "true").lower() == "true"
        self.METRICS_PORT = int(os.getenv("METRICS_PORT", "9090"))
        
        # 文件路径配置
        self.DATA_DIR = os.getenv("DATA_DIR", "./data")
        self.LOGS_DIR = os.getenv("LOGS_DIR", "./logs")
        self.CACHE_DIR = os.getenv("CACHE_DIR", "./cache")
        
        # 宝塔面板特定配置
        self.BT_PANEL = os.getenv("BT_PANEL", "false").lower() == "true"
        self.BT_SITE_PATH = os.getenv("BT_SITE_PATH", "./")
        
        # 进程管理
        self.WORKERS = int(os.getenv("WORKERS", "4"))
        self.WORKER_CLASS = os.getenv("WORKER_CLASS", "uvicorn.workers.UvicornWorker")


# 创建全局配置实例
settings = Settings()
