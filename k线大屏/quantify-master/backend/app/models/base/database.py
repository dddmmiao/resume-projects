"""
数据库连接和会话管理
"""

import logging
import os
from contextlib import contextmanager
from typing import Generator

from loguru import logger
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session as SQLModelSession

from config.config import settings

# 确保数据目录存在（SQLite使用）
if "sqlite" in settings.DATABASE_URL:
    os.makedirs("data", exist_ok=True)

# 创建数据库引擎
connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args = {"check_same_thread": False}
elif "mysql" in settings.DATABASE_URL:
    connect_args = {"charset": "utf8mb4", "autocommit": False}

# 控制 SQL 输出开关：优先使用配置项 SQL_ECHO（默认 False），避免在 DEBUG 下也打印完整 SQL
SQL_ECHO = getattr(settings, "SQL_ECHO", False)

# 降低 SQLAlchemy 内部 logger 的日志级别，压缩冗长 SQL 输出
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)

# 从环境变量读取数据库连接池配置，提供默认值并确保类型正确
DB_POOL_SIZE = int(getattr(settings, "DB_POOL_SIZE", 80))
DB_MAX_OVERFLOW = int(getattr(settings, "DB_MAX_OVERFLOW", 120))
DB_POOL_TIMEOUT = int(getattr(settings, "DB_POOL_TIMEOUT", 15))
DB_POOL_RECYCLE = int(getattr(settings, "DB_POOL_RECYCLE", 1800))
DB_POOL_PRE_PING = str(getattr(settings, "DB_POOL_PRE_PING", "true")).lower() == "true"
DB_POOL_RESET_ON_RETURN = getattr(settings, "DB_POOL_RESET_ON_RETURN", "rollback")

# 🔧 事务隔离级别配置：使用READ-COMMITTED减少死锁
# MySQL默认是REPEATABLE-READ，会产生间隙锁(gap lock)增加死锁概率
# READ-COMMITTED只锁定实际行，大幅降低死锁发生率
DB_ISOLATION_LEVEL = getattr(settings, "DB_ISOLATION_LEVEL", "READ COMMITTED")

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=SQL_ECHO,
    pool_pre_ping=DB_POOL_PRE_PING,  # 自动重连检测
    pool_recycle=DB_POOL_RECYCLE,  # 连接回收时间
    pool_size=DB_POOL_SIZE,  # 基础连接池大小
    max_overflow=DB_MAX_OVERFLOW,  # 溢出连接数
    pool_timeout=DB_POOL_TIMEOUT,  # 连接超时时间
    pool_reset_on_return=DB_POOL_RESET_ON_RETURN,  # 连接重置策略
    isolation_level=DB_ISOLATION_LEVEL,  # 事务隔离级别
)



def get_db():
    """获取数据库会话 - SQLModel原生支持"""
    with SQLModelSession(engine) as session:
        try:
            yield session
            session.commit()  # 自动提交
        except Exception as e:
            session.rollback()  # 自动回滚
            logger.error(f"数据库会话操作失败: {e}")
            raise
        finally:
            session.close()


def init_db():
    """初始化数据库 - 纯SQLModel，跳过模板表"""
    # 导入所有模型以确保它们被注册

    # 创建SQLModel表，但跳过模板基类表
    try:
        from sqlalchemy import MetaData, Table
        
        # 创建一个过滤后的metadata
        filtered_metadata = MetaData()
        
        # 定义要跳过的模板表名
        template_table_names = {
            'stock_klines_base',
            'convertible_bond_klines_base', 
            'concept_klines_base',
            'industry_klines_base'
        }
        
        # 复制所有非模板表到新的metadata
        skipped_count = 0
        included_count = 0
        included_table_names = []
        for table_name, table in SQLModel.metadata.tables.items():
            if table_name not in template_table_names:
                # 复制表到新的metadata
                table.tometadata(filtered_metadata)
                included_count += 1
                included_table_names.append(table_name)
            else:
                skipped_count += 1

        # 打印一次包含的表名，便于确认 users 等实体表是否参与初始化
        try:
            included_table_names_sorted = sorted(set(included_table_names))
            logger.debug(f"将创建的表: {included_table_names_sorted}")
        except Exception:
            # 避免日志格式化失败影响建表
            pass
        
        # 创建所有非模板表
        filtered_metadata.create_all(bind=engine)
        logger.info(f"数据库表创建成功 | 包含: {included_count} | 跳过模板: {skipped_count}")
        
    except Exception as e:
        logger.error(f"❌ 数据库表创建失败: {e}")
        # 不抛出异常，允许系统继续运行


@contextmanager
def db_session_context() -> Generator[SQLModelSession, None, None]:
    """数据库会话上下文管理器 - 简化重复代码"""
    with SQLModelSession(engine) as session:
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"数据库会话操作失败: {e}")
            raise
