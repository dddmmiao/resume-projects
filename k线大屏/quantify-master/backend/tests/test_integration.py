"""
集成测试
测试各层之间的集成和端到端功能
"""

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.dao.concept_dao import ConceptDAO
from app.dao.convertible_bond_dao import ConvertibleBondDAO
from app.dao.industry_dao import IndustryDAO
from app.dao.stock_dao import StockDAO
from app.models.entities.concept import Concept, Industry
from app.models.entities.convertible_bond import ConvertibleBond
from app.models.entities.stock import Stock


class TestDataSyncIntegration:
    """数据同步集成测试"""

    def test_stock_data_sync_integration(self, client: TestClient, db_session: Session):
        """测试股票数据同步集成流程"""
        # 模拟Tushare返回数据
        mock_tushare_data = [
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

        with patch('app.services.tushare_service.tushare_service') as mock_tushare:
            mock_tushare.get_stock_basic.return_value = mock_tushare_data

            # 通过API触发同步
            response = client.post("/api/admin/sync/stock", json={
                "ts_codes": [],
                "periods": ["daily"],
                "all_selected": True,
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

            # 验证数据已同步到数据库
            stocks = db_session.query(Stock).all()
            assert len(stocks) == 2
            assert stocks[0].ts_code == "000001.SZ"
            assert stocks[1].ts_code == "000002.SZ"

    def test_concept_data_sync_integration(self, client: TestClient, db_session: Session):
        """测试概念数据同步集成流程"""
        mock_tushare_data = [
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

        with patch('app.services.tushare_service.tushare_service') as mock_tushare:
            mock_tushare.get_concept_basic.return_value = mock_tushare_data

            # 通过API触发同步
            response = client.post("/api/admin/sync/concept", json={
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

            # 验证数据已同步到数据库
            concepts = db_session.query(Concept).all()
            assert len(concepts) == 2
            assert concepts[0].concept_code == "TS001"
            assert concepts[1].concept_code == "TS002"

    def test_industry_data_sync_integration(self, client: TestClient, db_session: Session):
        """测试行业数据同步集成流程"""
        mock_tushare_data = [
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

        with patch('app.services.tushare_service.tushare_service') as mock_tushare:
            mock_tushare.get_industry_basic.return_value = mock_tushare_data

            # 通过API触发同步
            response = client.post("/api/admin/sync/industry", json={
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

            # 验证数据已同步到数据库
            industries = db_session.query(Industry).all()
            assert len(industries) == 2
            assert industries[0].industry_code == "801010"
            assert industries[1].industry_code == "801020"

    def test_convertible_bond_data_sync_integration(self, client: TestClient, db_session: Session):
        """测试可转债数据同步集成流程"""
        mock_tushare_data = [
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

        with patch('app.services.tushare_service.tushare_service') as mock_tushare:
            mock_tushare.get_convertible_bond_basic.return_value = mock_tushare_data

            # 通过API触发同步
            response = client.post("/api/admin/sync/convertible-bond", json={
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

            # 验证数据已同步到数据库
            bonds = db_session.query(ConvertibleBond).all()
            assert len(bonds) == 1
            assert bonds[0].ts_code == "128001.SZ"


class TestDataQueryIntegration:
    """数据查询集成测试"""

    def test_stock_query_integration(self, client: TestClient, db_session: Session):
        """测试股票查询集成流程"""
        # 先插入测试数据
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

        # 通过API查询数据
        response = client.post("/api/stocks", json={
            "filters": {"industry": "银行"},
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["stocks"]) == 1
        assert data["data"]["stocks"][0]["industry"] == "银行"

    def test_concept_query_integration(self, client: TestClient, db_session: Session):
        """测试概念查询集成流程"""
        # 先插入测试数据
        test_data = [
            {
                "concept_code": "TS001",
                "concept_name": "人工智能",
                "description": "人工智能相关概念"
            }
        ]
        ConceptDAO.bulk_upsert_concept_data(test_data)

        # 通过API查询数据
        response = client.post("/api/concepts", json={
            "filters": {},
            "search": "人工智能",
            "sort_by": "concept_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["concepts"]) == 1
        assert "人工智能" in data["data"]["concepts"][0]["concept_name"]

    def test_industry_query_integration(self, client: TestClient, db_session: Session):
        """测试行业查询集成流程"""
        # 先插入测试数据
        test_data = [
            {
                "industry_code": "801010",
                "industry_name": "农林牧渔",
                "level": "L1",
                "parent_code": "801000"
            }
        ]
        IndustryDAO.bulk_upsert_industry_data(test_data)

        # 通过API查询数据
        response = client.post("/api/industries", json={
            "filters": {},
            "search": "农林",
            "sort_by": "industry_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["industries"]) == 1
        assert "农林" in data["data"]["industries"][0]["industry_name"]

    def test_convertible_bond_query_integration(self, client: TestClient, db_session: Session):
        """测试可转债查询集成流程"""
        # 先插入测试数据
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

        # 通过API查询数据
        response = client.post("/api/convertible-bonds", json={
            "filters": {},
            "search": "平银",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["convertible_bonds"]) == 1
        assert "平银" in data["data"]["convertible_bonds"][0]["bond_short_name"]


class TestStatisticsIntegration:
    """统计功能集成测试"""

    def test_data_statistics_integration(self, client: TestClient, db_session: Session):
        """测试数据统计集成流程"""
        # 插入各种类型的测试数据
        stock_data = [
            {"ts_code": "000001.SZ", "symbol": "000001", "name": "平安银行", "area": "深圳", "industry": "银行",
             "market": "主板", "list_date": "19910403"}]
        concept_data = [{"concept_code": "TS001", "concept_name": "人工智能", "description": "AI相关"}]
        industry_data = [
            {"industry_code": "801010", "industry_name": "农林牧渔", "level": "L1", "parent_code": "801000"}]
        bond_data = [{"ts_code": "128001.SZ", "bond_short_name": "平银转债", "stk_code": "000001.SZ",
                      "stk_short_name": "平安银行", "maturity_date": "20241231", "par_value": 100.0,
                      "issue_price": 100.0, "issue_size": 26000000000.0, "remain_size": 26000000000.0}]

        StockDAO.bulk_upsert_stock_data(stock_data)
        ConceptDAO.bulk_upsert_concept_data(concept_data)
        IndustryDAO.bulk_upsert_industry_data(industry_data)
        ConvertibleBondDAO.bulk_upsert_convertible_bond_data(bond_data)

        # 通过API获取统计信息
        response = client.get("/api/statistics/data")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["stock"] == 1
        assert data["data"]["concept"] == 1
        assert data["data"]["industry"] == 1
        assert data["data"]["convertible_bond"] == 1


class TestErrorHandlingIntegration:
    """错误处理集成测试"""

    def test_database_error_integration(self, client: TestClient):
        """测试数据库错误处理集成"""
        with patch('app.dao.stock_dao.StockDAO.bulk_upsert_stock_data') as mock_dao:
            mock_dao.side_effect = Exception("数据库连接失败")

            response = client.post("/api/admin/sync/stock", json={
                "ts_codes": ["000001.SZ"],
                "periods": ["daily"],
                "all_selected": False,
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 500
            data = response.json()
            assert data["success"] is False
            assert "数据库连接失败" in data["message"]

    def test_tushare_api_error_integration(self, client: TestClient):
        """测试Tushare API错误处理集成"""
        with patch('app.services.tushare_service.tushare_service') as mock_tushare:
            mock_tushare.get_stock_basic.side_effect = Exception("Tushare API调用失败")

            response = client.post("/api/admin/sync/stock", json={
                "ts_codes": ["000001.SZ"],
                "periods": ["daily"],
                "all_selected": False,
                "sync_mode": "sync",
                "options": {}
            })

            assert response.status_code == 500
            data = response.json()
            assert data["success"] is False
            assert "Tushare API调用失败" in data["message"]

    def test_validation_error_integration(self, client: TestClient):
        """测试验证错误处理集成"""
        response = client.post("/api/stocks", json={
            "filters": "invalid",  # 应该是字典
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 10,
            "offset": 0
        })

        assert response.status_code == 422  # 验证错误


class TestPerformanceIntegration:
    """性能集成测试"""

    def test_large_dataset_query_performance(self, client: TestClient, db_session: Session):
        """测试大数据集查询性能"""
        # 插入大量测试数据
        large_dataset = []
        for i in range(1000):
            large_dataset.append({
                "ts_code": f"00000{i:03d}.SZ",
                "symbol": f"00000{i:03d}",
                "name": f"测试股票{i}",
                "area": "深圳",
                "industry": "测试",
                "market": "主板",
                "list_date": "19910403"
            })

        StockDAO.bulk_upsert_stock_data(large_dataset)

        # 测试查询性能
        import time
        start_time = time.time()

        response = client.post("/api/stocks", json={
            "filters": {},
            "search": "",
            "sort_by": "ts_code",
            "sort_order": "asc",
            "limit": 100,
            "offset": 0
        })

        end_time = time.time()
        query_time = end_time - start_time

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["stocks"]) == 100

        # 验证查询时间在合理范围内（小于1秒）
        assert query_time < 1.0, f"查询时间过长: {query_time:.2f}秒"

    def test_concurrent_requests_integration(self, client: TestClient, db_session: Session):
        """测试并发请求集成"""
        import threading

        # 插入测试数据
        test_data = [
            {"ts_code": "000001.SZ", "symbol": "000001", "name": "平安银行", "area": "深圳", "industry": "银行",
             "market": "主板", "list_date": "19910403"}]
        StockDAO.bulk_upsert_stock_data(test_data)

        results = []
        errors = []

        def make_request():
            try:
                response = client.post("/api/stocks", json={
                    "filters": {},
                    "search": "",
                    "sort_by": "ts_code",
                    "sort_order": "asc",
                    "limit": 10,
                    "offset": 0
                })
                results.append(response.status_code)
            except Exception as e:
                errors.append(str(e))

        # 创建多个线程并发请求
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()

        # 等待所有线程完成
        for thread in threads:
            thread.join()

        # 验证所有请求都成功
        assert len(errors) == 0, f"并发请求出现错误: {errors}"
        assert len(results) == 10
        assert all(status == 200 for status in results), f"部分请求失败: {results}"
