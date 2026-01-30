"""
Tushare服务层测试
测试Tushare API集成和数据获取功能
"""
from unittest.mock import Mock, patch

import pandas as pd
import pytest

from app.services.external.tushare_service import TushareService


class TestTushareService:
    """Tushare服务测试类"""

    @pytest.fixture
    def mock_settings(self):
        """模拟配置"""
        with patch('app.services.tushare_service.settings') as mock_settings:
            mock_settings.TUSHARE_TOKEN = "test_token_12345"
            yield mock_settings

    @pytest.fixture
    def mock_tushare_pro(self):
        """模拟Tushare Pro API"""
        with patch('app.services.tushare_service.ts') as mock_ts:
            mock_pro = Mock()
            mock_ts.set_token.return_value = None
            mock_ts.pro_api.return_value = mock_pro

            # 模拟交易日历数据
            mock_cal_data = pd.DataFrame({
                'cal_date': ['20240801'],
                'is_open': [1]
            })
            mock_pro.trade_cal.return_value = mock_cal_data

            yield mock_pro

    def test_tushare_service_init_success(self, mock_settings, mock_tushare_pro):
        """测试Tushare服务初始化成功"""
        service = TushareService()
        assert service.pro is not None
        assert hasattr(service, '_lock')

    def test_tushare_service_init_no_token(self):
        """测试Tushare服务初始化失败 - 无Token"""
        with patch('app.services.tushare_service.settings') as mock_settings:
            mock_settings.TUSHARE_TOKEN = None
            with pytest.raises(ValueError, match="请在配置文件中设置TUSHARE_TOKEN"):
                TushareService()

    def test_tushare_service_init_empty_token(self):
        """测试Tushare服务初始化失败 - 空Token"""
        with patch('app.services.tushare_service.settings') as mock_settings:
            mock_settings.TUSHARE_TOKEN = ""
            with pytest.raises(ValueError, match="请在配置文件中设置TUSHARE_TOKEN"):
                TushareService()

    @pytest.fixture
    def tushare_service(self, mock_settings, mock_tushare_pro):
        """创建Tushare服务实例"""
        return TushareService()

    def test_get_stock_basic(self, tushare_service, mock_tushare_pro):
        """测试获取股票基础信息"""
        # 模拟返回数据
        mock_data = pd.DataFrame({
            'ts_code': ['000001.SZ', '000002.SZ'],
            'symbol': ['000001', '000002'],
            'name': ['平安银行', '万科A'],
            'area': ['深圳', '深圳'],
            'industry': ['银行', '房地产'],
            'market': ['主板', '主板'],
            'list_date': ['19910403', '19910129']
        })
        mock_tushare_pro.stock_basic.return_value = mock_data

        result = tushare_service.get_stock_basic()

        assert len(result) == 2
        assert result[0]['ts_code'] == '000001.SZ'
        assert result[0]['name'] == '平安银行'
        mock_tushare_pro.stock_basic.assert_called_once()

    def test_get_concept_basic(self, tushare_service, mock_tushare_pro):
        """测试获取概念基础信息"""
        mock_data = pd.DataFrame({
            'concept_code': ['TS001', 'TS002'],
            'concept_name': ['人工智能', '新能源汽车'],
            'description': ['AI相关', '新能源车相关']
        })
        mock_tushare_pro.concept.return_value = mock_data

        result = tushare_service.get_concept_basic()

        assert len(result) == 2
        assert result[0]['concept_code'] == 'TS001'
        assert result[0]['concept_name'] == '人工智能'

    def test_get_industry_basic(self, tushare_service, mock_tushare_pro):
        """测试获取行业基础信息"""
        mock_data = pd.DataFrame({
            'industry_code': ['801010', '801020'],
            'industry_name': ['农林牧渔', '采掘'],
            'level': ['L1', 'L1'],
            'parent_code': ['801000', '801000']
        })
        mock_tushare_pro.industry.return_value = mock_data

        result = tushare_service.get_industry_basic()

        assert len(result) == 2
        assert result[0]['industry_code'] == '801010'
        assert result[0]['industry_name'] == '农林牧渔'

    def test_get_convertible_bond_basic(self, tushare_service, mock_tushare_pro):
        """测试获取可转债基础信息"""
        mock_data = pd.DataFrame({
            'ts_code': ['128001.SZ', '128002.SZ'],
            'bond_short_name': ['平银转债', '万科转债'],
            'stk_code': ['000001.SZ', '000002.SZ'],
            'stk_short_name': ['平安银行', '万科A'],
            'maturity_date': ['20241231', '20251231'],
            'par_value': [100.0, 100.0],
            'issue_price': [100.0, 100.0],
            'issue_size': [26000000000.0, 20000000000.0],
            'remain_size': [26000000000.0, 20000000000.0]
        })
        mock_tushare_pro.cb_basic.return_value = mock_data

        result = tushare_service.get_convertible_bond_basic()

        assert len(result) == 2
        assert result[0]['ts_code'] == '128001.SZ'
        assert result[0]['bond_short_name'] == '平银转债'

    def test_get_stock_daily(self, tushare_service, mock_tushare_pro):
        """测试获取股票日K线数据"""
        mock_data = pd.DataFrame({
            'ts_code': ['000001.SZ', '000001.SZ'],
            'trade_date': ['20240101', '20240102'],
            'open': [10.50, 10.70],
            'high': [10.80, 10.90],
            'low': [10.30, 10.60],
            'close': [10.70, 10.80],
            'pre_close': [10.40, 10.70],
            'change': [0.30, 0.10],
            'pct_chg': [2.88, 0.93],
            'vol': [1000000, 1200000],
            'amount': [10700000.0, 12960000.0]
        })
        mock_tushare_pro.daily.return_value = mock_data

        result = tushare_service.get_stock_daily(
            ts_code="000001.SZ",
            start_date="20240101",
            end_date="20240102"
        )

        assert len(result) == 2
        assert result[0]['ts_code'] == '000001.SZ'
        assert result[0]['trade_date'] == '20240101'
        assert result[0]['close'] == 10.70

    def test_get_trade_calendar(self, tushare_service, mock_tushare_pro):
        """测试获取交易日历"""
        mock_data = pd.DataFrame({
            'cal_date': ['20240101', '20240102', '20240103'],
            'is_open': [0, 1, 1]  # 1月1日休市，2日3日开市
        })
        mock_tushare_pro.trade_cal.return_value = mock_data

        result = tushare_service.get_trade_calendar(
            exchange="SSE",
            start_date="20240101",
            end_date="20240103"
        )

        assert len(result) == 3
        assert result[0]['cal_date'] == '20240101'
        assert result[0]['is_open'] == 0
        assert result[1]['is_open'] == 1

    def test_get_ths_hot(self, tushare_service, mock_tushare_pro):
        """测试获取同花顺热门数据"""
        mock_data = pd.DataFrame({
            'ts_code': ['000001.SZ', '000002.SZ'],
            'ts_name': ['平安银行', '万科A'],
            'hot': [100, 95],
            'rank': [1, 2],
            'trade_date': ['20240101', '20240101']
        })
        mock_tushare_pro.ths_hot.return_value = mock_data

        result = tushare_service.get_ths_hot(trade_date="20240101")

        assert len(result) == 2
        assert result[0]['ts_code'] == '000001.SZ'
        assert result[0]['hot'] == 100
        assert result[0]['rank'] == 1

    def test_api_error_handling(self, tushare_service, mock_tushare_pro):
        """测试API错误处理"""
        # 模拟API调用失败
        mock_tushare_pro.stock_basic.side_effect = Exception("API调用失败")

        with pytest.raises(Exception, match="API调用失败"):
            tushare_service.get_stock_basic()

    def test_rate_limiting(self, tushare_service, mock_tushare_pro):
        """测试限流机制"""
        # 模拟快速连续调用
        mock_data = pd.DataFrame({'ts_code': ['000001.SZ']})
        mock_tushare_pro.stock_basic.return_value = mock_data

        # 连续调用多次
        for _ in range(5):
            result = tushare_service.get_stock_basic()
            assert len(result) == 1

        # 验证调用次数
        assert mock_tushare_pro.stock_basic.call_count == 5

    def test_data_validation(self, tushare_service, mock_tushare_pro):
        """测试数据验证"""
        # 模拟返回空数据
        mock_data = pd.DataFrame()
        mock_tushare_pro.stock_basic.return_value = mock_data

        result = tushare_service.get_stock_basic()
        assert result == []

    def test_field_constants_usage(self, tushare_service, mock_tushare_pro):
        """测试字段常量使用"""
        mock_data = pd.DataFrame({
            'ts_code': ['000001.SZ'],
            'ts_name': ['平安银行'],
            'hot': [100],
            'rank': [1],
            'trade_date': ['20240101']
        })
        mock_tushare_pro.ths_hot.return_value = mock_data

        tushare_service.get_ths_hot(trade_date="20240101")

        # 验证调用时使用了正确的字段参数
        call_args = mock_tushare_pro.ths_hot.call_args
        assert 'fields' in call_args.kwargs
        assert call_args.kwargs['fields'] == "ts_code,ts_name,hot,rank,trade_date"
