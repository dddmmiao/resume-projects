"""
业务服务层测试
测试各种业务服务的功能
"""

from unittest.mock import patch

import pytest

from app.core.exceptions import CancellationException
from app.services.data.concept_service import ConceptService
from app.services.data.convertible_bond_service import ConvertibleBondService
from app.services.data.industry_service import IndustryService
from app.services.data.stock_kline_service import StockKlineService
from app.services.data.stock_service import StockService


class TestStockService:
    """股票服务测试类"""

    @pytest.fixture
    def stock_service(self):
        """创建股票服务实例"""
        with patch('app.services.stock_service.tushare_service') as mock_tushare, \
                patch('app.services.stock_service.industry_service') as mock_industry, \
                patch('app.services.stock_service.concept_service') as mock_concept, \
                patch('app.services.stock_service.cache_service') as mock_cache:
            return StockService()

    def test_sync_stock_basic_info_success(self, stock_service):
        """测试同步股票基础信息成功"""
        # 模拟Tushare返回数据
        mock_data = [
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
        stock_service.data_service.get_stock_basic.return_value = mock_data

        # 模拟DAO操作
        with patch('app.services.stock_service.stock_dao') as mock_dao:
            mock_dao.bulk_upsert_stock_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0,
                "total_count": 1
            }

            result = stock_service.sync_stock_basic_info()

            assert result["success"] is True
            assert result["inserted_count"] == 1
            assert result["updated_count"] == 0
            mock_dao.bulk_upsert_stock_data.assert_called_once()

    def test_sync_stock_basic_info_with_task_id(self, stock_service):
        """测试带任务ID的同步股票基础信息"""
        mock_data = [{"ts_code": "000001.SZ", "name": "平安银行"}]
        stock_service.data_service.get_stock_basic.return_value = mock_data

        with patch('app.services.stock_service.stock_dao') as mock_dao, \
                patch('app.services.stock_service.redis_task_manager') as mock_redis:
            mock_dao.bulk_upsert_stock_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0
            }

            result = stock_service.sync_stock_basic_info(task_id="test_task_123")

            assert result["success"] is True
            # 验证任务进度更新被调用
            assert mock_redis.update_task_progress.called

    def test_get_all_ts_codes_cached(self, stock_service):
        """测试获取所有股票代码（缓存）"""
        mock_codes = ["000001.SZ", "000002.SZ", "000003.SZ"]
        stock_service.cache_service.get_cached_codes.return_value = mock_codes

        result = stock_service.get_all_ts_codes_cached()

        assert result == mock_codes
        stock_service.cache_service.get_cached_codes.assert_called_once_with("stock")

    def test_get_stock_statistics(self, stock_service):
        """测试获取股票统计信息"""
        # 模拟各种统计数据
        stock_service.get_all_ts_codes_cached.return_value = ["000001.SZ", "000002.SZ"]
        stock_service.industry_service.get_industry_distribution.return_value = {
            "银行": 1,
            "房地产": 1
        }
        stock_service.concept_service.get_concept_distribution.return_value = {
            "人工智能": 1,
            "新能源汽车": 1
        }

        result = stock_service.get_stock_statistics()

        assert result["total_count"] == 2
        assert "industry_distribution" in result
        assert "concept_distribution" in result

    def test_sync_stock_basic_info_api_error(self, stock_service):
        """测试同步股票基础信息 - API错误"""
        stock_service.data_service.get_stock_basic.side_effect = Exception("API调用失败")

        result = stock_service.sync_stock_basic_info()

        assert result["success"] is False
        assert "API调用失败" in result["message"]


class TestConceptService:
    """概念服务测试类"""

    @pytest.fixture
    def concept_service(self):
        """创建概念服务实例"""
        with patch('app.services.concept_service.tushare_service') as mock_tushare, \
                patch('app.services.concept_service.cache_service') as mock_cache:
            return ConceptService()

    def test_sync_concept_basic_info_success(self, concept_service, mock_tushare_service):
        """测试同步概念基础信息成功"""
        mock_data = [
            {
                "concept_code": "TS001",
                "concept_name": "人工智能",
                "description": "人工智能相关概念"
            }
        ]
        concept_service.tushare.get_concept_basic.return_value = mock_data

        with patch('app.services.concept_service.concept_dao') as mock_dao:
            mock_dao.bulk_upsert_concept_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0,
                "total_count": 1
            }

            result = concept_service.sync_concept_basic_info()

            assert result["success"] is True
            assert result["inserted_count"] == 1

    def test_sync_single_concept_stocks_success(self, concept_service, mock_tushare_service):
        """测试同步单个概念股票成功"""
        # 模拟概念成员数据
        mock_members = [
            {"ts_code": "000001.SZ", "concept_code": "TS001"},
            {"ts_code": "000002.SZ", "concept_code": "TS001"}
        ]
        concept_service.tushare.get_concept_members.return_value = mock_members

        with patch('app.services.concept_service.concept_dao') as mock_dao:
            mock_dao.bulk_upsert_stock_concept_data.return_value = {
                "inserted_count": 2,
                "updated_count": 0,
                "total_count": 2
            }

            result = concept_service.sync_single_concept_stocks("TS001")

            assert result["success"] is True
            assert result["inserted_count"] == 2

    def test_get_all_ts_codes_cached(self, concept_service):
        """测试获取所有概念代码（缓存）"""
        mock_codes = ["TS001", "TS002", "TS003"]
        concept_service.cache_service.get_cached_codes.return_value = mock_codes

        result = concept_service.get_all_ts_codes_cached()

        assert result == mock_codes
        concept_service.cache_service.get_cached_codes.assert_called_once_with("concept")


class TestIndustryService:
    """行业服务测试类"""

    @pytest.fixture
    def industry_service(self):
        """创建行业服务实例"""
        with patch('app.services.industry_service.tushare_service') as mock_tushare, \
                patch('app.services.industry_service.cache_service') as mock_cache:
            return IndustryService()

    def test_sync_industry_basic_info_success(self, industry_service, mock_tushare_service):
        """测试同步行业基础信息成功"""
        mock_data = [
            {
                "industry_code": "801010",
                "industry_name": "农林牧渔",
                "level": "L1",
                "parent_code": "801000"
            }
        ]
        industry_service.tushare.get_industry_basic.return_value = mock_data

        with patch('app.services.industry_service.industry_dao') as mock_dao:
            mock_dao.bulk_upsert_industry_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0,
                "total_count": 1
            }

            result = industry_service.sync_industry_basic_info()

            assert result["success"] is True
            assert result["inserted_count"] == 1

    def test_sync_single_industry_stocks_success(self, industry_service, mock_tushare_service):
        """测试同步单个行业股票成功"""
        # 模拟行业成员数据
        mock_members = [
            {"ts_code": "000001.SZ", "industry_code": "801010"},
            {"ts_code": "000002.SZ", "industry_code": "801010"}
        ]
        industry_service.tushare.get_industry_members.return_value = mock_members

        with patch('app.services.industry_service.industry_dao') as mock_dao:
            mock_dao.bulk_upsert_stock_industry_data.return_value = {
                "inserted_count": 2,
                "updated_count": 0,
                "total_count": 2
            }

            result = industry_service.sync_single_industry_stocks("801010")

            assert result["success"] is True
            assert result["inserted_count"] == 2


class TestConvertibleBondService:
    """可转债服务测试类"""

    @pytest.fixture
    def convertible_bond_service(self):
        """创建可转债服务实例"""
        with patch('app.services.convertible_bond_service.tushare_service') as mock_tushare, \
                patch('app.services.convertible_bond_service.cache_service') as mock_cache:
            return ConvertibleBondService()

    def test_sync_convertible_bond_basic_info_success(self, convertible_bond_service, mock_tushare_service):
        """测试同步可转债基础信息成功"""
        mock_data = [
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
        convertible_bond_service.tushare.get_convertible_bond_basic.return_value = mock_data

        with patch('app.services.convertible_bond_service.convertible_bond_dao') as mock_dao:
            mock_dao.bulk_upsert_convertible_bond_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0
            }

            result = convertible_bond_service.sync_convertible_bond_basic_info()

            assert result["success"] is True
            assert result["inserted_count"] == 1

    def test_get_all_ts_codes_cached(self, convertible_bond_service):
        """测试获取所有可转债代码（缓存）"""
        mock_codes = ["128001.SZ", "128002.SZ", "128003.SZ"]
        convertible_bond_service.cache_service.get_cached_codes.return_value = mock_codes

        result = convertible_bond_service.get_all_ts_codes_cached()

        assert result == mock_codes
        convertible_bond_service.cache_service.get_cached_codes.assert_called_once_with("convertible_bond")


class TestStockKlineService:
    """股票K线服务测试类"""

    @pytest.fixture
    def stock_kline_service(self):
        """创建股票K线服务实例"""
        with patch('app.services.stock_kline_service.tushare_service') as mock_tushare, \
                patch('app.services.stock_kline_service.kline_query_utils') as mock_query_utils:
            return StockKlineService()

    def test_sync_stock_kline_data_success(self, stock_kline_service, mock_tushare_service):
        """测试同步股票K线数据成功"""
        mock_data = [
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
        stock_kline_service.tushare.get_stock_daily.return_value = mock_data

        with patch('app.services.stock_kline_service.stock_kline_dao') as mock_dao:
            mock_dao.bulk_upsert_kline_data.return_value = {
                "inserted_count": 1,
                "updated_count": 0,
                "total_count": 1
            }

            result = stock_kline_service.sync_stock_kline_data(
                ts_codes=["000001.SZ"],
                period="daily",
                start_date="20240101",
                end_date="20240101"
            )

            assert result["success"] is True
            assert result["inserted_count"] == 1

    def test_get_stock_kline_data(self, stock_kline_service):
        """测试获取股票K线数据"""
        mock_data = [
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
        stock_kline_service.kline_query_utils.get_kline_data.return_value = mock_data

        result = stock_kline_service.get_stock_kline_data(
            ts_code="000001.SZ",
            period="daily",
            limit=100
        )

        assert len(result) == 1
        assert result[0]["ts_code"] == "000001.SZ"
        stock_kline_service.kline_query_utils.get_kline_data.assert_called_once()

    def test_sync_stock_kline_data_with_cancellation(self, stock_kline_service, mock_tushare_service):
        """测试同步股票K线数据 - 任务取消"""
        stock_kline_service.tushare.get_stock_daily.side_effect = CancellationException("任务已取消")

        result = stock_kline_service.sync_stock_kline_data(
            ts_codes=["000001.SZ"],
            period="daily",
            start_date="20240101",
            end_date="20240101",
            task_id="test_task"
        )

        assert result["success"] is False
        assert "任务已取消" in result["message"]


class TestServiceIntegration:
    """服务集成测试类"""

    def test_service_dependency_injection(self):
        """测试服务依赖注入"""
        with patch('app.services.stock_service.tushare_service') as mock_tushare, \
                patch('app.services.stock_service.industry_service') as mock_industry, \
                patch('app.services.stock_service.concept_service') as mock_concept, \
                patch('app.services.stock_service.cache_service') as mock_cache:
            service = StockService()

            # 验证依赖注入成功
            assert service.data_service is not None
            assert service.industry_service is not None
            assert service.concept_service is not None
            assert service.cache_service is not None

    def test_service_error_handling(self):
        """测试服务错误处理"""
        with patch('app.services.stock_service.tushare_service') as mock_tushare, \
                patch('app.services.stock_service.industry_service') as mock_industry, \
                patch('app.services.stock_service.concept_service') as mock_concept, \
                patch('app.services.stock_service.cache_service') as mock_cache:
            service = StockService()
            service.data_service.get_stock_basic.side_effect = Exception("网络错误")

            result = service.sync_stock_basic_info()

            assert result["success"] is False
            assert "网络错误" in result["message"]
