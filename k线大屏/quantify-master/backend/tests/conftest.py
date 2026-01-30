"""
测试配置和公共fixtures
"""

import asyncio
from typing import Generator, Dict, Any
from unittest.mock import Mock

import pytest
# 导入应用
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.models import get_db
from main import app

# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """创建测试数据库会话"""
    # 创建表
    Base.metadata.create_all(bind=engine)

    # 创建会话
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # 清理表
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """创建测试客户端"""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_stock_data() -> Dict[str, Any]:
    """示例股票数据"""
    return {
        "ts_code": "000001.SZ",
        "symbol": "000001",
        "name": "平安银行",
        "area": "深圳",
        "industry": "银行",
        "market": "主板",
        "list_date": "19910403",
        "is_hs": "N"
    }


@pytest.fixture
def sample_concept_data() -> Dict[str, Any]:
    """示例概念数据"""
    return {
        "concept_code": "TS001",
        "concept_name": "人工智能",
        "description": "人工智能相关概念"
    }


@pytest.fixture
def sample_industry_data() -> Dict[str, Any]:
    """示例行业数据"""
    return {
        "industry_code": "801010",
        "industry_name": "农林牧渔",
        "level": "L1",
        "parent_code": "801000"
    }


@pytest.fixture
def sample_convertible_bond_data() -> Dict[str, Any]:
    """示例可转债数据"""
    return {
        "ts_code": "128001.SZ",
        "bond_short_name": "平银转债",
        "stk_code": "000001.SZ",
        "stk_short_name": "平安银行",
        "par_value": 100.0,
        "issue_price": 100.0,
        "issue_size": 26000000000.0,
        "remain_size": 26000000000.0,
        "value_date": "20190401",
        "maturity_date": "20241231",
        "rate_type": "累进利率",
        "coupon_rate": 0.3,
        "add_rate": 0.2,
        "pay_per_year": 1,
        "market": "深交所"
    }


@pytest.fixture
def sample_kline_data() -> Dict[str, Any]:
    """示例K线数据"""
    return {
        "ts_code": "000001.SZ",
        "trade_date": "20240101",
        "open": 10.50,
        "high": 10.80,
        "low": 10.30,
        "close": 10.70,
        "pre_close": 10.40,
        "change": 0.30,
        "pct_chg": 2.88,
        "vol": 1000000,
        "amount": 10700000.0
    }


@pytest.fixture
def mock_tushare_service():
    """模拟Tushare服务"""
    mock_service = Mock()

    # 模拟股票基础信息
    mock_service.get_stock_basic.return_value = [
        {
            "ts_code": "000001.SZ",
            "symbol": "000001",
            "name": "平安银行",
            "area": "深圳",
            "industry": "银行",
            "market": "主板",
            "list_date": "19910403"
        }
    ]

    # 模拟概念数据
    mock_service.get_concept_basic.return_value = [
        {
            "concept_code": "TS001",
            "concept_name": "人工智能",
            "description": "人工智能相关概念"
        }
    ]

    # 模拟行业数据
    mock_service.get_industry_basic.return_value = [
        {
            "industry_code": "801010",
            "industry_name": "农林牧渔",
            "level": "L1",
            "parent_code": "801000"
        }
    ]

    # 模拟可转债数据
    mock_service.get_convertible_bond_basic.return_value = [
        {
            "ts_code": "128001.SZ",
            "bond_short_name": "平银转债",
            "stk_code": "000001.SZ",
            "stk_short_name": "平安银行",
            "maturity_date": "20241231",
            "par_value": 100.0,
            "issue_price": 100.0,
            "issue_size": 26000000000.0,
            "remain_size": 26000000000.0
        }
    ]

    # 模拟K线数据
    mock_service.get_stock_daily.return_value = [
        {
            "ts_code": "000001.SZ",
            "trade_date": "20240101",
            "open": 10.50,
            "high": 10.80,
            "low": 10.30,
            "close": 10.70,
            "pre_close": 10.40,
            "change": 0.30,
            "pct_chg": 2.88,
            "vol": 1000000,
            "amount": 10700000.0
        }
    ]

    return mock_service


@pytest.fixture
def mock_redis_client():
    """模拟Redis客户端"""
    mock_redis = Mock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1
    mock_redis.hgetall.return_value = {}
    mock_redis.smembers.return_value = set()
    mock_redis.scan_iter.return_value = []
    return mock_redis
