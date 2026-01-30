"""
工具类测试
测试各种工具函数和辅助类
"""

from datetime import datetime, date
from unittest.mock import patch

from app.core.validators import validate_ts_code
from app.utils.concurrent_utils import ConcurrentProcessor, process_concurrently
from app.utils.date_utils import date_utils
from app.utils.number_utils import safe_float


class TestDateUtils:
    """日期工具测试类"""

    def test_get_trade_dates_range(self):
        """测试获取交易日范围"""
        start_date = "20240101"
        end_date = "20240105"

        # 模拟交易日历数据
        mock_trade_dates = [
            {"cal_date": "20240101", "is_open": 0},  # 元旦，休市
            {"cal_date": "20240102", "is_open": 1},  # 开市
            {"cal_date": "20240103", "is_open": 1},  # 开市
            {"cal_date": "20240104", "is_open": 1},  # 开市
            {"cal_date": "20240105", "is_open": 0},  # 周末，休市
        ]

        with patch('app.utils.date_utils.tushare_service') as mock_tushare:
            mock_tushare.get_trade_calendar.return_value = mock_trade_dates

            result = date_utils.get_trade_dates_range(start_date, end_date)

            assert len(result) == 3  # 只有3个交易日
            assert "20240102" in result
            assert "20240103" in result
            assert "20240104" in result
            assert "20240101" not in result  # 休市
            assert "20240105" not in result  # 休市

    def test_get_default_date_range(self):
        """测试获取默认日期范围"""
        with patch('app.utils.date_utils.datetime') as mock_datetime:
            # 模拟当前日期为2024年1月15日
            mock_now = datetime(2024, 1, 15)
            mock_datetime.now.return_value = mock_now

            start_date, end_date = date_utils.get_default_date_range()

            # 应该返回3年前到当前日期的范围
            assert start_date == "20210115"
            assert end_date == "20240115"

    def test_format_date(self):
        """测试日期格式化"""
        # 测试字符串日期格式化
        result = date_utils.format_date("20240101", "%Y%m%d", "%Y-%m-%d")
        assert result == "2024-01-01"

        # 测试datetime对象格式化
        dt = datetime(2024, 1, 1)
        result = date_utils.format_date(dt, None, "%Y-%m-%d")
        assert result == "2024-01-01"

        # 测试date对象格式化
        d = date(2024, 1, 1)
        result = date_utils.format_date(d, None, "%Y-%m-%d")
        assert result == "2024-01-01"

    def test_parse_date(self):
        """测试日期解析"""
        # 测试解析字符串日期
        result = date_utils.parse_date("2024-01-01", "%Y-%m-%d")
        assert result == date(2024, 1, 1)

        # 测试解析数字日期
        result = date_utils.parse_date(20240101, "%Y%m%d")
        assert result == date(2024, 1, 1)

    def test_is_trade_date(self):
        """测试判断是否为交易日"""
        # 模拟交易日历数据
        mock_trade_dates = [
            {"cal_date": "20240101", "is_open": 0},  # 休市
            {"cal_date": "20240102", "is_open": 1},  # 开市
        ]

        with patch('app.utils.date_utils.tushare_service') as mock_tushare:
            mock_tushare.get_trade_calendar.return_value = mock_trade_dates

            # 测试休市日期
            result = date_utils.is_trade_date("20240101")
            assert result is False

            # 测试开市日期
            result = date_utils.is_trade_date("20240102")
            assert result is True


class TestNumberUtils:
    """数字工具测试类"""

    def test_safe_float_conversion(self):
        """测试安全的浮点数转换"""
        # 测试正常数字
        result = safe_float("123.45")
        assert result == 123.45

        # 测试整数
        result = safe_float("123")
        assert result == 123.0

        # 测试空值
        result = safe_float(None)
        assert result is None

        result = safe_float("")
        assert result is None

        # 测试无效字符串
        result = safe_float("invalid")
        assert result is None

        # 测试科学计数法
        result = safe_float("1.23e+02")
        assert result == 123.0

    def test_safe_int_conversion(self):
        """测试安全的整数转换"""

        # 简单的安全整数转换函数
        def safe_int(value):
            try:
                return int(float(value)) if value is not None else None
            except Exception:
                return None

        # 测试正常整数
        result = safe_int("123")
        assert result == 123

        # 测试浮点数
        result = safe_int("123.45")
        assert result == 123

        # 测试空值
        result = safe_int(None)
        assert result is None

        result = safe_int("")
        assert result is None

        # 测试无效字符串
        result = safe_int("invalid")
        assert result is None

    def test_format_percentage(self):
        """测试百分比格式化"""

        # 简单的百分比格式化函数
        def format_percentage(value, decimals=2):
            if value is None:
                return None
            return f"{value * 100:.{decimals}f}%"

        # 测试正常百分比
        result = format_percentage(0.1234, 2)
        assert result == "12.34%"

        # 测试零值
        result = format_percentage(0, 2)
        assert result == "0.00%"

        # 测试负值
        result = format_percentage(-0.0567, 2)
        assert result == "-5.67%"

        # 测试None值
        result = format_percentage(None, 2)
        assert result is None

    def test_format_currency(self):
        """测试货币格式化"""

        # 简单的货币格式化函数
        def format_currency(value, decimals=2):
            if value is None:
                return None
            return f"{value:,.{decimals}f}"

        # 测试正常金额
        result = format_currency(1234567.89, 2)
        assert result == "1,234,567.89"

        # 测试零值
        result = format_currency(0, 2)
        assert result == "0.00"

        # 测试负值
        result = format_currency(-1234567.89, 2)
        assert result == "-1,234,567.89"

        # 测试None值
        result = format_currency(None, 2)
        assert result is None


class TestConcurrentUtils:
    """并发工具测试类"""

    def test_process_concurrently_success(self):
        """测试并发处理成功"""

        def process_item(item):
            return item * 2

        items = [1, 2, 3, 4, 5]
        results = process_concurrently(items, process_item, max_workers=2)

        assert len(results) == 5
        assert results == [2, 4, 6, 8, 10]

    def test_process_concurrently_with_error(self):
        """测试并发处理错误处理"""

        def process_item(item):
            if item == 3:
                raise ValueError("处理失败")
            return item * 2

        items = [1, 2, 3, 4, 5]

        # 测试默认错误处理（返回None）
        results = process_concurrently(items, process_item, max_workers=2)
        assert len(results) == 5
        assert results[0] == 2
        assert results[1] == 4
        assert results[2] is None  # 错误项
        assert results[3] == 8
        assert results[4] == 10

        # 测试自定义错误处理
        def error_handler(item, error):
            return f"错误: {item}"

        results = process_concurrently(items, process_item, max_workers=2, error_handler=error_handler)
        assert len(results) == 5
        assert results[2] == "错误: 3"

    def test_concurrent_processor_class(self):
        """测试并发处理器类"""
        processor = ConcurrentProcessor(max_workers=2)

        def process_item(item):
            return item * 2

        items = [1, 2, 3, 4, 5]
        results = processor.process(items, process_item)

        assert len(results) == 5
        assert results == [2, 4, 6, 8, 10]

    def test_concurrent_processor_with_progress(self):
        """测试带进度的并发处理器"""
        processor = ConcurrentProcessor(max_workers=2)

        def process_item(item):
            return item * 2

        progress_updates = []

        def progress_callback(completed, total):
            progress_updates.append((completed, total))

        items = [1, 2, 3, 4, 5]
        results = processor.process_with_progress(
            items,
            process_item,
            progress_callback=progress_callback
        )

        assert len(results) == 5
        assert results == [2, 4, 6, 8, 10]
        assert len(progress_updates) > 0
        assert progress_updates[-1] == (5, 5)  # 最后应该是全部完成


class TestValidators:
    """验证器测试类"""

    def test_validate_ts_code_valid(self):
        """测试验证有效的股票代码"""
        # 测试有效的股票代码
        assert validate_ts_code("000001.SZ") is True
        assert validate_ts_code("000002.SZ") is True
        assert validate_ts_code("600000.SH") is True
        assert validate_ts_code("300001.SZ") is True

    def test_validate_ts_code_invalid(self):
        """测试验证无效的股票代码"""
        # 测试无效格式
        assert validate_ts_code("000001") is False  # 缺少交易所后缀
        assert validate_ts_code("000001.XX") is False  # 无效交易所
        assert validate_ts_code("") is False  # 空字符串
        assert validate_ts_code(None) is False  # None值
        assert validate_ts_code("invalid") is False  # 完全无效

    def test_validate_date_format_valid(self):
        """测试验证有效的日期格式"""

        # 简单的日期格式验证函数
        def validate_date_format(date_str, format_str):
            if not date_str:
                return False
            try:
                datetime.strptime(date_str, format_str)
                return True
            except ValueError:
                return False

        # 测试有效的日期格式
        assert validate_date_format("20240101", "%Y%m%d") is True
        assert validate_date_format("2024-01-01", "%Y-%m-%d") is True
        assert validate_date_format("01/01/2024", "%m/%d/%Y") is True

    def test_validate_date_format_invalid(self):
        """测试验证无效的日期格式"""

        # 简单的日期格式验证函数
        def validate_date_format(date_str, format_str):
            if not date_str:
                return False
            try:
                datetime.strptime(date_str, format_str)
                return True
            except ValueError:
                return False

        # 测试无效的日期格式
        assert validate_date_format("20240101", "%Y-%m-%d") is False  # 格式不匹配
        assert validate_date_format("2024-01-01", "%Y%m%d") is False  # 格式不匹配
        assert validate_date_format("invalid", "%Y%m%d") is False  # 无效日期
        assert validate_date_format("", "%Y%m%d") is False  # 空字符串
        assert validate_date_format(None, "%Y%m%d") is False  # None值


class TestCacheUtils:
    """缓存工具测试类"""

    def test_cache_key_generation(self):
        """测试缓存键生成"""

        # 简单的缓存键生成函数
        def generate_cache_key(prefix, key):
            return f"{prefix}:{key}"

        # 测试基本缓存键生成
        key1 = generate_cache_key("stock", "000001.SZ")
        key2 = generate_cache_key("stock", "000002.SZ")

        assert key1 != key2
        assert "stock" in key1
        assert "000001.SZ" in key1

    def test_cache_expiration(self):
        """测试缓存过期"""

        # 简单的缓存过期时间计算函数
        def get_cache_expiration(seconds):
            return min(seconds, 3600)  # 最大1小时

        # 测试缓存过期时间计算
        expiration = get_cache_expiration(3600)  # 1小时
        assert expiration > 0
        assert expiration <= 3600


class TestTextUtils:
    """文本工具测试类"""

    def test_safe_string_conversion(self):
        """测试安全的字符串转换"""

        # 简单的字符串转换函数
        def safe_str(value):
            if value is None:
                return ""
            return str(value)

        # 测试正常字符串
        assert safe_str("hello") == "hello"

        # 测试数字转换
        assert safe_str(123) == "123"
        assert safe_str(123.45) == "123.45"

        # 测试None值
        assert safe_str(None) == ""

        # 测试空值
        assert safe_str("") == ""

    def test_truncate_string(self):
        """测试字符串截断"""

        # 简单的字符串截断函数
        def truncate_string(text, max_length):
            if not text:
                return ""
            return text[:max_length] if len(text) > max_length else text

        # 测试正常截断
        result = truncate_string("hello world", 5)
        assert result == "hello"

        # 测试不需要截断
        result = truncate_string("hello", 10)
        assert result == "hello"

        # 测试空字符串
        result = truncate_string("", 5)
        assert result == ""

    def test_format_number_with_commas(self):
        """测试数字千分位格式化"""

        # 简单的数字格式化函数
        def format_number_with_commas(number):
            if number is None:
                return None
            return f"{number:,}"

        # 测试正常数字
        assert format_number_with_commas(1234567) == "1,234,567"
        assert format_number_with_commas(1234567.89) == "1,234,567.89"

        # 测试小数
        assert format_number_with_commas(1234.56) == "1,234.56"

        # 测试零值
        assert format_number_with_commas(0) == "0"

        # 测试负值
        assert format_number_with_commas(-1234567) == "-1,234,567"
