"""
启动时表初始化模块
在系统启动时预建所有必要的表，避免运行时建表的问题
"""

from datetime import datetime
from typing import Dict, Any

from loguru import logger
from sqlalchemy import inspect

from app.constants.table_types import TableTypes
from ..base.database import engine


# 延迟导入避免循环依赖


class StartupTableInitializer:
    """启动时表初始化器"""

    def __init__(self):
        from ..base.table_factory import TableFactory
        self.table_factory = TableFactory()

    def initialize_all_tables(self,
                              years_ahead: int = 2,
                              years_behind: int = 5,
                              essential_only: bool = False) -> Dict[str, Any]:
        """
        初始化所有表
        Args:
            years_ahead: 向前预建的年数
            years_behind: 向后预建的年数
            essential_only: 是否只建核心表
        """
        logger.info("开始启动时表初始化...")

        try:
            # 检查数据库连接
            if not self._check_database_connection():
                raise Exception("数据库连接失败")

            # 根据配置选择建表策略
            if essential_only:
                results = self._ensure_essential_tables()
                logger.info("核心表初始化完成")
            else:
                results = self._ensure_startup_tables(
                    years_ahead=years_ahead,
                    years_behind=years_behind
                )
                logger.info("完整表初始化完成")

            # 验证建表结果
            validation_result = self._validate_table_creation(results)

            # 生成初始化报告
            report = self._generate_initialization_report(results, validation_result)

            logger.info("启动时表初始化完成")
            return report

        except Exception as e:
            logger.error(f"❌ 启动时表初始化失败: {e}")
            raise

    def _check_database_connection(self) -> bool:
        """检查数据库连接"""
        try:
            # 尝试执行一个简单的查询（使用Core而非原生text）
            from sqlalchemy import select
            from sqlalchemy import literal
            with engine.connect() as conn:
                conn.execute(select(literal(1)))
            logger.debug("数据库连接正常")
            return True
        except Exception as e:
            logger.error(f"❌ 数据库连接失败: {e}")
            return False

    def _validate_table_creation(self, results: Dict[str, Dict[int, bool]]) -> Dict[str, Any]:
        """验证表创建结果"""
        validation_result = {
            "total_expected": 0,
            "total_created": 0,
            "missing_tables": [],
            "validation_passed": True
        }

        try:
            inspector = inspect(engine)

            for table_type, years in results.items():
                for year, success in years.items():
                    validation_result["total_expected"] += 1

                    if success:
                        table_name = f"{self._get_table_name(table_type, year)}"

                        # 检查表是否真的在数据库中存在
                        if inspector.has_table(table_name):
                            validation_result["total_created"] += 1
                            logger.debug(f"表验证通过: {table_name}")
                        else:
                            validation_result["missing_tables"].append(table_name)
                            validation_result["validation_passed"] = False
                            logger.warning(f"表验证失败: {table_name} 在数据库中不存在")
                    else:
                        validation_result["validation_passed"] = False

            logger.info(
                f"表创建验证完成 | 预期: {validation_result['total_expected']} | 实际: {validation_result['total_created']}")

        except Exception as e:
            logger.error(f"❌ 表创建验证失败: {e}")
            validation_result["validation_passed"] = False

        return validation_result

    def _get_table_name(self, table_type: str, year: int) -> str:
        """获取表名"""
        from app.constants.table_types import TableTypes
        table_prefix_mapping = {
            TableTypes.STOCK: f"{TableTypes.STOCK}_klines",
            TableTypes.CONVERTIBLE_BOND: f"{TableTypes.CONVERTIBLE_BOND}_klines",
            TableTypes.CONCEPT: f"{TableTypes.CONCEPT}_klines",
            TableTypes.INDUSTRY: f"{TableTypes.INDUSTRY}_klines"
        }
        return f"{table_prefix_mapping.get(table_type, table_type)}_{year}"

    def _generate_initialization_report(self,
                                        results: Dict[str, Dict[int, bool]],
                                        validation_result: Dict[str, Any]) -> Dict[str, Any]:
        """生成初始化报告"""
        # 统计各类型表的建表结果
        type_summary = {}
        for table_type, years in results.items():
            total = len(years)
            success = sum(1 for success in years.values() if success)
            type_summary[table_type] = {
                "total": total,
                "success": success,
                "failed": total - success,
                "success_rate": f"{(success / total * 100):.1f}%" if total > 0 else "0%"
            }

        report = {
            "initialization_time": self._get_current_timestamp(),
            "overall_status": "success" if validation_result["validation_passed"] else "failed",
            "type_summary": type_summary,
            "validation_result": validation_result,
            "recommendations": self._generate_recommendations(type_summary, validation_result)
        }

        return report

    def _get_current_timestamp(self) -> str:
        """获取当前时间戳"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _generate_recommendations(self,
                                  type_summary: Dict[str, Any],
                                  validation_result: Dict[str, Any]) -> list:
        """生成建议"""
        recommendations = []

        # 检查建表成功率
        for table_type, summary in type_summary.items():
            if summary["failed"] > 0:
                recommendations.append(
                    f"⚠️ {table_type} 类型表有 {summary['failed']} 个创建失败，建议检查数据库权限和配置")

        # 检查验证结果
        if not validation_result["validation_passed"]:
            recommendations.append("🔍 表创建验证失败，建议检查数据库连接和表结构")

        # 检查缺失的表
        if validation_result["missing_tables"]:
            recommendations.append(
                f"📋 发现 {len(validation_result['missing_tables'])} 个表在数据库中缺失，建议重新初始化")

        if not recommendations:
            recommendations.append("✅ 所有表初始化正常，系统可以正常使用")

        return recommendations

    def _ensure_essential_tables(self) -> Dict[str, Dict[int, bool]]:
        """确保核心表存在（当前年份和常用历史年份）"""
        # 使用统一的年份配置
        from app.services import SyncStrategyConfig
        essential_years = SyncStrategyConfig.get_default_years()

        results = {}
        logger.info(f"🔧 确保核心表存在，年份: {essential_years}")

        from app.constants.table_types import TableTypes
        for table_type in TableTypes.ALL_TYPES:
            results[table_type] = {}

            for year in essential_years:
                try:
                    success = self._ensure_table_exists(table_type, year)
                    results[table_type][year] = success

                    if not success:
                        logger.error(f"❌ 核心表 {table_type}_{year} 创建失败")
                except Exception as e:
                    results[table_type][year] = False
                    logger.error(f"❌ 核心表 {table_type}_{year} 创建异常: {e}")

        return results

    def _ensure_startup_tables(self, years_ahead: int = 0, years_behind: int = 3) -> Dict[str, Dict[int, bool]]:
        """系统启动时预建表"""
        current_year = datetime.now().year
        results = {}

        logger.info(f"系统启动预建表开始 | 当前年份: {current_year}")
        logger.info(f"预建范围: {current_year - years_behind} ~ {current_year + years_ahead}")

        from app.constants.table_types import TableTypes
        for table_type in TableTypes.ALL_TYPES:
            results[table_type] = {}

            # 计算需要建表的年份范围
            start_year = current_year - years_behind
            end_year = current_year + years_ahead

            success_count = 0
            total_count = 0
            
            for year in range(start_year, end_year + 1):
                total_count += 1
                try:
                    success = self._ensure_table_exists(table_type, year)
                    results[table_type][year] = success
                    
                    if success:
                        success_count += 1
                    else:
                        logger.warning(f"{table_type}_{year} 表创建失败")

                except Exception as e:
                    logger.error(f"❌ 创建 {table_type}_{year} 表时发生异常: {e}")
                    results[table_type][year] = False
            
            # 输出该类型的汇总信息
            logger.info(f"{table_type}表预建完成 | 成功: {success_count}/{total_count}")

        # 统计结果
        total_tables = sum(len(years) for years in results.values())
        success_tables = sum(sum(1 for success in years.values() if success) for years in results.values())

        logger.info(f"启动时预建表完成 | 总计: {total_tables} | 成功: {success_tables}")

        return results

    def _ensure_table_exists(self, table_type: str, year: int) -> bool:
        """确保指定年份的表存在"""
        try:
            # 获取表模型
            from ..base.table_factory import TableFactory
            if table_type == TableTypes.STOCK:
                model_class = TableFactory.get_stock_kline_table(year)
            elif table_type == TableTypes.CONVERTIBLE_BOND:
                model_class = TableFactory.get_convertible_bond_kline_table(year)
            elif table_type == TableTypes.CONCEPT:
                model_class = TableFactory.get_concept_kline_table(year)
            elif table_type == TableTypes.INDUSTRY:
                model_class = TableFactory.get_industry_kline_table(year)
            else:
                logger.error(f"不支持的表类型: {table_type}")
                return False

            # 检查表是否在数据库中存在
            inspector = inspect(engine)
            if not inspector.has_table(model_class.__tablename__):
                # 创建表
                model_class.__table__.create(engine)
                logger.info(f"创建表: {model_class.__tablename__}")
                return True
            else:
                # 表已存在，不需要输出日志
                return True

        except Exception as e:
            logger.error(f"创建表失败 {table_type}_{year}: {e}")
            return False


# 全局实例 - 延迟初始化避免循环导入
startup_table_initializer = None


def get_startup_table_initializer():
    """获取启动表初始化器实例（延迟初始化）"""
    global startup_table_initializer
    if startup_table_initializer is None:
        startup_table_initializer = StartupTableInitializer()
    return startup_table_initializer


def initialize_tables_on_startup(years_ahead: int = 0,
                                 years_behind: int = 3,
                                 essential_only: bool = False) -> Dict[str, Any]:
    """
    系统启动时调用此函数初始化表
    Args:
        years_ahead: 向前预建的年数（默认0，不预建未来表）
        years_behind: 向后预建的年数（默认3，预建过去3年的表）
        essential_only: 是否只建核心表
    """
    initializer = get_startup_table_initializer()
    return initializer.initialize_all_tables(
        years_ahead=years_ahead,
        years_behind=years_behind,
        essential_only=essential_only
    )
