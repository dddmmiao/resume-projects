"""
股票K线大屏系统 - 后端主程序
"""

import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 加载环境变量
def load_environment():
    """加载环境变量"""
    # 获取当前环境
    env = os.getenv("ENVIRONMENT", "development")
    
    # 根据环境加载对应的 .env 文件
    if env == "production":
        env_file = ".env.production"
    else:
        env_file = ".env.development"
    
    # 检查文件是否存在
    if os.path.exists(env_file):
        load_dotenv(env_file)
        logger.info(f"已加载环境变量文件: {env_file}")
    else:
        logger.warning(f"环境变量文件不存在: {env_file}")

# 在导入配置之前加载环境变量
load_environment()

# 配置日志（模块级别调用，确保uvicorn启动时生效）
def _setup_logging():
    """配置loguru日志，支持trace_id追踪"""
    os.makedirs("logs", exist_ok=True)
    logger.remove()

    from app.core.logging_context import get_trace_id
    from config.config import settings as cfg
    
    def _format(record):
        """日志格式化：自动添加trace_id"""
        tid = get_trace_id()
        record["extra"]["trace"] = f"[{tid}] " if tid else ""
        return "{time:YYYY-MM-DD HH:mm:ss} | {level} | {extra[trace]}{name}:{function}:{line} - {message}\n"
    
    def _format_color(record):
        """带颜色的日志格式化"""
        tid = get_trace_id()
        record["extra"]["trace"] = f"[{tid}] " if tid else ""
        return "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | <yellow>{extra[trace]}</yellow><cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>\n"

    # 控制台输出
    logger.add(
        sys.stdout,
        level="DEBUG" if cfg.DEBUG else cfg.LOG_LEVEL,
        format=_format_color,
        colorize=sys.stdout.isatty() and not os.getenv('NO_COLOR'),
    )
    # 文件输出
    logger.add(cfg.LOG_FILE, level="DEBUG", format=_format, rotation="1 day", retention="30 days", compression="zip")

_setup_logging()

from config.config import settings
from app.models import init_db
from app.api.stocks import router as stocks_router
from app.api.convertible_bonds import router as convertible_bonds_router
from app.core.scheduler import data_sync_scheduler
from app.api.admin import router as admin_router
from app.api.concepts import router as concepts_router
from app.api.industries import router as industries_router
from app.api.statistics import router as statistics_router
from app.api.strategies import router as strategies_router
from app.api.tasks import router as tasks_router
from app.api.favorites import router as favorites_router
from app.api.ths_accounts import router as ths_accounts_router
from app.api.user import router as user_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("正在启动股票K线大屏系统...")

    # 打印CORS配置
    logger.info(f"CORS配置: {settings.CORS_ORIGINS}")

    # 初始化数据库
    try:
        init_db()
        logger.info("数据库初始化成功")
    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        raise

    # 启动时动态建表初始化
    try:
        from app.models import initialize_tables_on_startup
        
        # 配置建表策略：不预建未来表，只预建过去3年的表
        table_init_report = initialize_tables_on_startup(
            years_ahead=0,      # 不预建未来表
            years_behind=3,     # 预建过去3年的表
            essential_only=False # 完整初始化
        )
        
        if table_init_report["overall_status"] == "success":
            logger.info("✅ 启动时表初始化成功")
            logger.info(f"📊 表初始化报告: {table_init_report['type_summary']}")
        else:
            logger.warning("⚠️ 启动时表初始化存在问题，但系统继续启动")
            logger.warning(f"📋 建议: {table_init_report['recommendations']}")
            
    except Exception as e:
        logger.error(f"❌ 启动时表初始化失败: {e}")
        logger.warning("⚠️ 表初始化失败，系统将继续启动，但可能影响后续数据操作")

    # 检查Tushare配置
    if not hasattr(settings, "TUSHARE_TOKEN") or not settings.TUSHARE_TOKEN:
        logger.warning("未配置TUSHARE_TOKEN，部分功能可能无法使用")
    else:
        logger.info("Tushare配置检查通过")

    # 启动定时任务调度器
    try:
        data_sync_scheduler.start()
        logger.info("定时任务调度器启动成功")
    except Exception as e:
        logger.error(f"定时任务调度器启动失败: {e}")
        # 不抛出异常，允许系统继续运行

    logger.info("系统启动完成")

    yield

    # 关闭时执行
    logger.info("关闭定时任务调度器...")
    data_sync_scheduler.stop()
    logger.info("定时任务调度器已停止")
    logger.info("应用关闭完成")


# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="股票K线大屏展示系统API",
    lifespan=lifespan,
    # 禁用Swagger UI的CDN依赖，使用本地资源
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# 配置中间件
from app.core.middleware import setup_middleware

# 配置CORS（保持原有配置）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 设置统一中间件
setup_middleware(app)

# 注册路由 - 按功能分组
# 证券数据相关
app.include_router(stocks_router)
app.include_router(convertible_bonds_router)

# K线数据相关 - 已分散到各业务路由中

# 市场数据相关
app.include_router(concepts_router)
app.include_router(industries_router)

# 认证相关功能已迁移到 user_router

# 用户管理相关
app.include_router(ths_accounts_router)
app.include_router(user_router)

# 系统管理相关
app.include_router(admin_router)

# 数据统计相关
app.include_router(statistics_router)

# 策略相关
app.include_router(strategies_router)

# 策略执行历史相关
from app.api.strategy_history import router as strategy_history_router
app.include_router(strategy_history_router)

# 任务管理相关
app.include_router(tasks_router)

# 新增：自选批量解析
app.include_router(favorites_router)

# 交易日历相关
from app.api.trade_calendar import router as trade_calendar_router
app.include_router(trade_calendar_router)

# 同花顺登录相关
from app.api.ths_login import router as ths_login_router
app.include_router(ths_login_router)

# ==================== 统一异常处理 ====================
from fastapi import Request
from fastapi.responses import JSONResponse
from app.services.external.ths.core.constants import ThsSessionExpiredException


@app.exception_handler(ThsSessionExpiredException)
async def ths_session_expired_handler(request: Request, exc: ThsSessionExpiredException):
    """
    同花顺登录态过期异常处理
    
    返回特定的code，前端可以根据此code触发全局通知
    """
    return JSONResponse(
        status_code=401,
        content={
            "success": False,
            "code": exc.code,  # "THS_SESSION_EXPIRED"
            "message": exc.message,
            "data": {
                "user_id": exc.user_id,
                "ths_account": exc.ths_account
            }
        }
    )


# 添加静态文件服务
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "股票K线大屏系统API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    from datetime import datetime

    # 检查数据库连接
    db_status = "healthy"
    try:
        from app.models.base.database import get_db
        from sqlalchemy import literal

        db = next(get_db())
        # 轻量健康检查：使用 ORM 查询而不是原生 text
        db.query(literal(1)).first()
        db.close()
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    # 检查Tushare配置
    tushare_status = (
        "configured"
        if hasattr(settings, "TUSHARE_TOKEN") and settings.TUSHARE_TOKEN
        else "not_configured"
    )

    return {
        "status": "healthy" if db_status == "healthy" else "unhealthy",
        "timestamp": datetime.now().isoformat(),
        "version": settings.APP_VERSION,
        "components": {
            "database": db_status,
            "tushare": tushare_status,
            "scheduler": "running" if data_sync_scheduler._is_running else "stopped",
        },
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理"""
    from fastapi.responses import JSONResponse

    logger.error(f"未处理的异常: {exc}")
    return JSONResponse(status_code=500, content={"detail": "内部服务器错误"})


if __name__ == "__main__":
    logger.info(f"启动配置:")
    logger.info(f"  - 主机: {settings.HOST}")
    logger.info(f"  - 端口: {settings.PORT}")
    logger.info(f"  - 调试模式: {settings.DEBUG}")
    logger.info(f"  - 数据库: {settings.DATABASE_URL}")
    logger.info(f"  - 日志级别: {settings.LOG_LEVEL}")

    # 启动服务器
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="warning",  # 只显示警告级别以上的uvicorn日志
        access_log=False,  # 禁用uvicorn访问日志（由loguru处理）
    )
