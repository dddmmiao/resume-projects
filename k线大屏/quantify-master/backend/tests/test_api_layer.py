"""
API层测试
测试各种API端点的功能
"""

from unittest.mock import patch

from fastapi import status
from fastapi.testclient import TestClient


class TestStockAPI:
    """股票API测试类"""

    def test_get_stocks_success(self, client: TestClient, db_session):
        """测试获取股票列表成功"""
        # 先插入测试数据
        from app.dao.stock_dao import StockDAO
        test_data = [
            {
                "ts_code": "000001.SZ",
                "symbol": "000001",
                "name": "平安银行",
                "area": "深圳",
                "industry": "银行",
                "market": "主板",
                "list_date": "19910403"
            },
            {
                "ts_code": "000002.SZ",
                "symbol": "000002",
                "name": "万科A",
                "area": "深圳",
                "industry": "房地产",
                "market": "主板",
                "list_date": "19910129"
            }
        ]
        StockDAO.bulk_upsert_stock_data(test_data)

        # 测试API调用
        response = client.post("/api/stocks", json={
            "filters": {},
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["stocks"]) == 2
        assert data["data"]["stocks"][0]["ts_code"] == "000001.SZ"

    def test_get_stocks_with_filters(self, client: TestClient, db_session):
        """测试带过滤条件的获取股票列表"""
        # 先插入测试数据
        from app.dao.stock_dao import StockDAO
        test_data = [
            {
                "ts_code": "000001.SZ",
                "symbol": "000001",
                "name": "平安银行",
                "area": "深圳",
                "industry": "银行",
                "market": "主板",
                "list_date": "19910403"
            },
            {
                "ts_code": "000002.SZ",
                "symbol": "000002",
                "name": "万科A",
                "area": "深圳",
                "industry": "房地产",
                "market": "主板",
                "list_date": "19910129"
            }
        ]
        StockDAO.bulk_upsert_stock_data(test_data)

        # 测试按行业过滤
        response = client.post("/api/stocks", json={
            "filters": {"industry": "银行"},
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["stocks"]) == 1
        assert data["data"]["stocks"][0]["industry"] == "银行"

    def test_get_stocks_with_search(self, client: TestClient, db_session):
        """测试带搜索条件的获取股票列表"""
        # 先插入测试数据
        from app.dao.stock_dao import StockDAO
        test_data = [
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
        StockDAO.bulk_upsert_stock_data(test_data)

        # 测试按名称搜索
        response = client.post("/api/stocks", json={
            "filters": {},
            "search": "平安",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["stocks"]) == 1
        assert "平安" in data["data"]["stocks"][0]["name"]

    def test_get_stock_klines_success(self, client: TestClient, db_session):
        """测试获取股票K线数据成功"""
        # 先插入测试数据
        from app.dao.stock_dao import StockDAO
        test_data = [{
            "ts_code": "000001.SZ",
            "symbol": "000001",
            "name": "平安银行",
            "area": "深圳",
            "industry": "银行",
            "market": "主板",
            "list_date": "19910403"
        }]
        StockDAO.bulk_upsert_stock_data(test_data)

        # 模拟K线数据
        with patch('app.services.stock_kline_service.stock_kline_service') as mock_service:
            mock_service.get_stock_kline_data.return_value = [
                {
                    "ts_code": "000001.SZ",
                    "trade_date": "20240101",
                    "open": 10.50,
                    "high": 10.80,
                    "low": 10.30,
                    "close": 10.70,
                    "vol": 1000000,
                    "amount": 10700000.0
                }
            ]

            response = client.get("/api/stocks/000001.SZ/klines?period=daily&limit=100")

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 1
            assert data["data"][0]["ts_code"] == "000001.SZ"

    def test_get_stock_klines_invalid_code(self, client: TestClient):
        """测试获取股票K线数据 - 无效代码"""
        response = client.get("/api/stocks/invalid_code/klines?period=daily&limit=100")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert data["success"] is False


class TestConceptAPI:
    """概念API测试类"""

    def test_get_concepts_success(self, client: TestClient, db_session):
        """测试获取概念列表成功"""
        # 先插入测试数据
        from app.dao.concept_dao import ConceptDAO
        test_data = [
            {
                "concept_code": "TS001",
                "concept_name": "人工智能",
                "description": "人工智能相关概念"
            },
            {
                "concept_code": "TS002",
                "concept_name": "新能源汽车",
                "description": "新能源汽车相关概念"
            }
        ]
        ConceptDAO.bulk_upsert_concept_data(test_data)

        # 测试API调用
        response = client.post("/api/concepts", json={
            "filters": {},
            "search": "",
            "sort_by": "concept_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["concepts"]) == 2
        assert data["data"]["concepts"][0]["concept_code"] == "TS001"

    def test_get_concepts_with_filters(self, client: TestClient, db_session):
        """测试带过滤条件的获取概念列表"""
        # 先插入测试数据
        from app.dao.concept_dao import ConceptDAO
        test_data = [
            {
                "concept_code": "TS001",
                "concept_name": "人工智能",
                "description": "人工智能相关概念"
            }
        ]
        ConceptDAO.bulk_upsert_concept_data(test_data)

        # 测试按名称过滤
        response = client.post("/api/concepts", json={
            "filters": {"concept_name": "人工智能"},
            "search": "",
            "sort_by": "concept_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["concepts"]) == 1
        assert data["data"]["concepts"][0]["concept_name"] == "人工智能"


class TestIndustryAPI:
    """行业API测试类"""

    def test_get_industries_success(self, client: TestClient, db_session):
        """测试获取行业列表成功"""
        # 先插入测试数据
        from app.dao.industry_dao import IndustryDAO
        test_data = [
            {
                "industry_code": "801010",
                "industry_name": "农林牧渔",
                "level": "L1",
                "parent_code": "801000"
            },
            {
                "industry_code": "801020",
                "industry_name": "采掘",
                "level": "L1",
                "parent_code": "801000"
            }
        ]
        IndustryDAO.bulk_upsert_industry_data(test_data)

        # 测试API调用
        response = client.post("/api/industries", json={
            "filters": {},
            "search": "",
            "sort_by": "industry_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["industries"]) == 2
        assert data["data"]["industries"][0]["industry_code"] == "801010"


class TestConvertibleBondAPI:
    """可转债API测试类"""

    def test_get_convertible_bonds_success(self, client: TestClient, db_session):
        """测试获取可转债列表成功"""
        # 先插入测试数据
        from app.dao.convertible_bond_dao import ConvertibleBondDAO
        test_data = [
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
        ConvertibleBondDAO.bulk_upsert_convertible_bond_data(test_data)

        # 测试API调用
        response = client.post("/api/convertible-bonds", json={
            "filters": {},
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["convertible_bonds"]) == 1
        assert data["data"]["convertible_bonds"][0]["ts_code"] == "128001.SZ"


class TestStatisticsAPI:
    """统计API测试类"""

    def test_get_data_statistics_success(self, client: TestClient):
        """测试获取数据统计成功"""
        # 模拟服务返回数据
        with patch('app.services.stock_service.stock_service') as mock_stock, \
                patch('app.services.concept_service.concept_service') as mock_concept, \
                patch('app.services.industry_service.industry_service') as mock_industry, \
                patch('app.services.convertible_bond_service.convertible_bond_service') as mock_bond:
            mock_stock.get_all_ts_codes_cached.return_value = ["000001.SZ", "000002.SZ"]
            mock_concept.get_all_ts_codes_cached.return_value = ["TS001", "TS002"]
            mock_industry.get_all_ts_codes_cached.return_value = ["801010", "801020"]
            mock_bond.get_all_ts_codes_cached.return_value = ["128001.SZ", "128002.SZ"]

            response = client.get("/api/statistics/data")

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert data["data"]["stock"] == 2
            assert data["data"]["concept"] == 2
            assert data["data"]["industry"] == 2
            assert data["data"]["convertible_bond"] == 2


class TestAdminAPI:
    """管理API测试类"""

    def test_sync_stock_data_success(self, client: TestClient):
        """测试同步股票数据成功"""
        with patch('app.services.scheduler_service.scheduler_service') as mock_scheduler:
            mock_scheduler.start_sync_stock_data.return_value = {
                "success": True,
                "task_id": "test_task_123",
                "message": "任务已启动"
            }

            response = client.post("/api/admin/sync/stock", json={
                "ts_codes": ["000001.SZ"],
                "periods": ["daily"],
                "all_selected": False,
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert data["data"]["task_id"] == "test_task_123"

    def test_get_system_status_success(self, client: TestClient):
        """测试获取系统状态成功"""
        with patch('app.services.performance_monitor.system_monitor') as mock_monitor:
            mock_monitor.get_system_status.return_value = {
                "status": "healthy",
                "database": "connected",
                "redis": "connected",
                "tushare": "connected"
            }

            response = client.get("/api/admin/status")

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert data["data"]["status"] == "healthy"


class TestIndicatorsAPI:
    """技术指标API测试类"""

    def test_get_indicators_for_strategy_success(self, client: TestClient):
        """测试获取策略指标数据成功"""
        with patch('app.dao.indicator_query_utils.IndicatorQueryUtils') as mock_utils:
            mock_utils.get_indicator_data.return_value = [
                {
                    "trade_date": "20240101",
                    "close": 10.70,
                    "ma_5": 10.50,
                    "ma_10": 10.40,
                    "rsi_6": 65.5,
                    "rsi_12": 62.3
                }
            ]

            response = client.get("/api/indicators/strategy?entity_type=stock&entity_codes=000001.SZ&period=daily")

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["success"] is True
            assert "000001.SZ" in data["data"]
            assert len(data["data"]["000001.SZ"]) == 1

    def test_get_indicators_for_strategy_invalid_params(self, client: TestClient):
        """测试获取策略指标数据 - 无效参数"""
        response = client.get("/api/indicators/strategy?entity_type=stock&entity_codes=&period=daily")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert data["success"] is False
        assert "实体代码不能为空" in data["message"]


class TestAPIErrorHandling:
    """API错误处理测试类"""

    def test_internal_server_error(self, client: TestClient):
        """测试内部服务器错误处理"""
        with patch('app.services.stock_service.stock_service') as mock_service:
            mock_service.get_all_ts_codes_cached.side_effect = Exception("数据库连接失败")

            response = client.get("/api/statistics/data")

            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            data = response.json()
            assert data["success"] is False
            assert "数据库连接失败" in data["message"]

    def test_validation_error(self, client: TestClient):
        """测试验证错误处理"""
        response = client.post("/api/stocks", json={
            "filters": "invalid_filters",  # 应该是字典
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_not_found_error(self, client: TestClient):
        """测试404错误处理"""
        response = client.get("/api/nonexistent-endpoint")

        assert response.status_code == status.HTTP_404_NOT_FOUND
