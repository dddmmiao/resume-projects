#!/usr/bin/env python3
"""
测试运行脚本
提供便捷的测试执行和报告功能
"""

import argparse
import subprocess
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def run_tests(test_pattern=None, verbose=False, coverage=False, parallel=False):
    """运行测试"""
    cmd = ["python", "-m", "pytest"]

    # 设置测试目录
    test_dir = Path(__file__).parent
    cmd.append(str(test_dir))

    # 添加模式匹配
    if test_pattern:
        cmd.append(f"-k {test_pattern}")

    # 添加详细输出
    if verbose:
        cmd.append("-v")

    # 添加覆盖率
    if coverage:
        cmd.extend(["--cov=app", "--cov-report=html", "--cov-report=term"])

    # 添加并行执行
    if parallel:
        cmd.extend(["-n", "auto"])

    # 添加其他选项
    cmd.extend([
        "--tb=short",  # 简短的错误跟踪
        "--strict-markers",  # 严格的标记检查
        "--disable-warnings",  # 禁用警告
    ])

    print(f"运行命令: {' '.join(cmd)}")
    print("-" * 50)

    try:
        result = subprocess.run(cmd, check=True)
        print("\n✅ 所有测试通过!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ 测试失败，退出码: {e.returncode}")
        return False


def run_specific_layer(layer):
    """运行特定层的测试"""
    layer_tests = {
        "tushare": "test_tushare_service.py",
        "dao": "test_dao_layer.py",
        "service": "test_business_services.py",
        "api": "test_api_layer.py",
        "integration": "test_integration.py",
        "utils": "test_utils.py"
    }

    if layer not in layer_tests:
        print(f"❌ 未知的测试层: {layer}")
        print(f"可用的层: {', '.join(layer_tests.keys())}")
        return False

    test_file = layer_tests[layer]
    print(f"🧪 运行 {layer} 层测试: {test_file}")

    return run_tests(test_pattern=test_file, verbose=True)


def show_test_coverage():
    """显示测试覆盖率报告"""
    print("📊 生成测试覆盖率报告...")

    cmd = [
        "python", "-m", "pytest",
        "--cov=app",
        "--cov-report=html",
        "--cov-report=term-missing",
        str(Path(__file__).parent)
    ]

    try:
        subprocess.run(cmd, check=True)
        print("\n📈 覆盖率报告已生成到 htmlcov/index.html")
    except subprocess.CalledProcessError as e:
        print(f"❌ 生成覆盖率报告失败: {e}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="量化交易系统测试运行器")
    parser.add_argument("--layer", "-l", choices=["tushare", "dao", "service", "api", "integration", "utils"],
                        help="运行特定层的测试")
    parser.add_argument("--pattern", "-k", help="运行匹配模式的测试")
    parser.add_argument("--verbose", "-v", action="store_true", help="详细输出")
    parser.add_argument("--coverage", "-c", action="store_true", help="生成覆盖率报告")
    parser.add_argument("--parallel", "-p", action="store_true", help="并行执行测试")
    parser.add_argument("--coverage-only", action="store_true", help="只生成覆盖率报告")

    args = parser.parse_args()

    print("🚀 量化交易系统测试运行器")
    print("=" * 50)

    # 检查是否安装了pytest
    try:
        import pytest
    except ImportError:
        print("❌ 未安装pytest，请先安装: pip install pytest")
        return 1

    # 检查是否安装了pytest-cov（如果需要覆盖率）
    if args.coverage or args.coverage_only:
        try:
            import pytest_cov
        except ImportError:
            print("❌ 未安装pytest-cov，请先安装: pip install pytest-cov")
            return 1

    # 检查是否安装了pytest-xdist（如果需要并行）
    if args.parallel:
        try:
            import pytest_xdist
        except ImportError:
            print("❌ 未安装pytest-xdist，请先安装: pip install pytest-xdist")
            return 1

    # 只生成覆盖率报告
    if args.coverage_only:
        show_test_coverage()
        return 0

    # 运行特定层的测试
    if args.layer:
        success = run_specific_layer(args.layer)
    else:
        # 运行所有测试
        success = run_tests(
            test_pattern=args.pattern,
            verbose=args.verbose,
            coverage=args.coverage,
            parallel=args.parallel
        )

    if success:
        print("\n🎉 测试执行完成!")
        if args.coverage:
            print("📊 查看详细覆盖率报告: htmlcov/index.html")
        return 0
    else:
        print("\n💥 测试执行失败!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
