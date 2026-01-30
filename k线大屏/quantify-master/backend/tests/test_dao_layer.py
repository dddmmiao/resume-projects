"""
DAO层测试
测试数据访问层的各种操作
"""

from sqlalchemy.orm import Session

from app.dao.concept_dao import ConceptDAO
from app.dao.convertible_bond_dao import ConvertibleBondDAO
from app.dao.industry_dao import IndustryDAO
from app.dao.query_utils import QueryUtils
from app.dao.stock_dao import StockDAO
from app.models.entities.concept import Concept, Industry
from app.models.entities.convertible_bond import ConvertibleBond
from app.models.entities.stock import Stock


class TestStockDAO:
    """股票DAO测试类"""

    def test_bulk_upsert_stock_data_success(self, db_session: Session):
        """测试批量插入股票数据成功"""
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

        result = StockDAO.bulk_upsert_stock_data(test_data)

        assert result["inserted_count"] == 2
        assert result["total_count"] == 2

        # 验证数据已插入
        stocks = db_session.query(Stock).all()
        assert len(stocks) == 2
        assert stocks[0].ts_code == "000001.SZ"
        assert stocks[1].ts_code == "000002.SZ"

    def test_bulk_upsert_stock_data_update(self, db_session: Session):
        """测试批量更新股票数据"""
        # 先插入数据
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

        # 更新数据
        updated_data = [{
            "ts_code": "000001.SZ",
            "symbol": "000001",
            "name": "平安银行股份有限公司",
            "area": "深圳",
            "industry": "银行",
            "market": "主板",
            "list_date": "19910403"
        }]

        result = StockDAO.bulk_upsert_stock_data(updated_data)

        assert result["updated_count"] == 1
        assert result["total_count"] == 1

        # 验证数据已更新
        stock = db_session.query(Stock).filter("000001.SZ" == Stock.ts_code).first()
        assert stock.name == "平安银行股份有限公司"

    def test_get_stock_by_ts_code_found(self, db_session: Session):
        """测试根据股票代码获取股票信息 - 找到"""
        # 先插入数据
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

        result = StockDAO.get_stock_by_ts_code("000001.SZ")

        assert result is not None
        assert result["ts_code"] == "000001.SZ"
        assert result["name"] == "平安银行"

    def test_get_stock_by_ts_code_not_found(self, db_session: Session):
        """测试根据股票代码获取股票信息 - 未找到"""
        result = StockDAO.get_stock_by_ts_code("999999.SZ")
        assert result is None

    def test_get_stocks_with_filters(self, db_session: Session):
        """测试获取股票列表 - 带过滤条件"""
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

        # 测试按行业过滤
        result = StockDAO.get_stocks(filters={"industry": "银行"})
        assert len(result) == 1
        assert result[0]["ts_code"] == "000001.SZ"

        # 测试按地区过滤
        result = StockDAO.get_stocks(filters={"area": "深圳"})
        assert len(result) == 2

    def test_get_stocks_with_search(self, db_session: Session):
        """测试获取股票列表 - 带搜索条件"""
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
        result = StockDAO.get_stocks(search="平安")
        assert len(result) == 1
        assert result[0]["name"] == "平安银行"

    def test_get_stocks_with_pagination(self, db_session: Session):
        """测试获取股票列表 - 分页"""
        # 插入多条数据
        test_data = []
        for i in range(10):
            test_data.append({
                "ts_code": f"00000{i}.SZ",
                "symbol": f"00000{i}",
                "name": f"测试股票{i}",
                "area": "深圳",
                "industry": "测试",
                "market": "主板",
                "list_date": "19910403"
            })
        StockDAO.bulk_upsert_stock_data(test_data)

        # 测试分页
        result = StockDAO.get_stocks(limit=5, offset=0)
        assert len(result) == 5

        result = StockDAO.get_stocks(limit=5, offset=5)
        assert len(result) == 5


class TestConceptDAO:
    """概念DAO测试类"""

    def test_bulk_upsert_concept_data_success(self, db_session: Session):
        """测试批量插入概念数据成功"""
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

        result = ConceptDAO.bulk_upsert_concept_data(test_data)

        assert result["inserted_count"] == 2
        assert result["total_count"] == 2

        # 验证数据已插入
        concepts = db_session.query(Concept).all()
        assert len(concepts) == 2
        assert concepts[0].concept_code == "TS001"
        assert concepts[1].concept_code == "TS002"

    def test_bulk_upsert_stock_concept_data(self, db_session: Session):
        """测试批量插入股票概念关联数据"""
        # 先插入概念和股票数据
        concept_data = [{
            "concept_code": "TS001",
            "concept_name": "人工智能",
            "description": "人工智能相关概念"
        }]
        ConceptDAO.bulk_upsert_concept_data(concept_data)

        stock_data = [{
            "ts_code": "000001.SZ",
            "symbol": "000001",
            "name": "平安银行",
            "area": "深圳",
            "industry": "银行",
            "market": "主板",
            "list_date": "19910403"
        }]
        StockDAO.bulk_upsert_stock_data(stock_data)

        # 插入关联数据
        relation_data = [{
            "ts_code": "000001.SZ",
            "concept_code": "TS001"
        }]

        result = ConceptDAO.bulk_upsert_stock_concept_data(relation_data)

        assert result["inserted_count"] == 1
        assert result["total_count"] == 1


class TestIndustryDAO:
    """行业DAO测试类"""

    def test_bulk_upsert_industry_data_success(self, db_session: Session):
        """测试批量插入行业数据成功"""
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

        result = IndustryDAO.bulk_upsert_industry_data(test_data)

        assert result["inserted_count"] == 2
        assert result["total_count"] == 2

        # 验证数据已插入
        industries = db_session.query(Industry).all()
        assert len(industries) == 2
        assert industries[0].industry_code == "801010"
        assert industries[1].industry_code == "801020"


class TestConvertibleBondDAO:
    """可转债DAO测试类"""

    def test_bulk_upsert_convertible_bond_data_success(self, db_session: Session):
        """测试批量插入可转债数据成功"""
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

        result = ConvertibleBondDAO.bulk_upsert_convertible_bond_data(test_data)

        assert result["inserted_count"] == 1

        # 验证数据已插入
        bonds = db_session.query(ConvertibleBond).all()
        assert len(bonds) == 1
        assert bonds[0].ts_code == "128001.SZ"
        assert bonds[0].bond_short_name == "平银转债"


class TestQueryUtils:
    """查询工具测试类"""

    def test_get_records_by_field_found(self, db_session: Session):
        """测试根据字段获取记录 - 找到"""
        # 先插入数据
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

        result = QueryUtils.get_records_by_field(
            model_class=Stock,
            field_name="ts_code",
            field_value="000001.SZ",
            limit=1
        )

        assert len(result) == 1
        assert result[0]["ts_code"] == "000001.SZ"

    def test_get_records_by_field_not_found(self, db_session: Session):
        """测试根据字段获取记录 - 未找到"""
        result = QueryUtils.get_records_by_field(
            model_class=Stock,
            field_name="ts_code",
            field_value="999999.SZ",
            limit=1
        )

        assert len(result) == 0

    def test_get_records_with_filters(self, db_session: Session):
        """测试带过滤条件获取记录"""
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

        # 测试过滤
        result = QueryUtils.get_records(
            model_class=Stock,
            filters={"industry": "银行"},
            limit=10
        )

        assert len(result) == 1
        assert result[0]["ts_code"] == "000001.SZ"

    def test_get_records_with_sorting(self, db_session: Session):
        """测试带排序获取记录"""
        # 先插入测试数据
        test_data = [
            {
                "ts_code": "000002.SZ",
                "symbol": "000002",
                "name": "万科A",
                "area": "深圳",
                "industry": "房地产",
                "market": "主板",
                "list_date": "19910129"
            },
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

        # 测试按ts_code升序排序
        result = QueryUtils.get_records(
            model_class=Stock,
            sort_by="ts_code",
            sort_order="asc",
            limit=10
        )

        assert len(result) == 2
        assert result[0]["ts_code"] == "000001.SZ"
        assert result[1]["ts_code"] == "000002.SZ"

    def test_count_records(self, db_session: Session):
        """测试统计记录数量"""
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

        # 测试统计总数
        total_count = QueryUtils.count_records(Stock)
        assert total_count == 2

        # 测试带条件统计
        bank_count = QueryUtils.count_records(Stock, filters={"industry": "银行"})
        assert bank_count == 1
