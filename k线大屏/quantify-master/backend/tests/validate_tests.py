#!/usr/bin/env python3
"""
测试验证脚本
验证测试文件的基本语法和结构
"""

import ast
import sys
from pathlib import Path


def validate_python_syntax(file_path):
    """验证Python文件语法"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # 解析AST
        ast.parse(content)
        return True, "语法正确"
    except SyntaxError as e:
        return False, f"语法错误: {e}"
    except Exception as e:
        return False, f"解析错误: {e}"


def validate_test_structure(file_path):
    """验证测试文件结构"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # 检查是否包含测试类
        if "class Test" not in content:
            return False, "缺少测试类"

        # 检查是否包含测试方法
        if "def test_" not in content:
            return False, "缺少测试方法"

        # pytest导入不是必须的，pytest会自动发现测试

        return True, "结构正确"
    except Exception as e:
        return False, f"结构检查错误: {e}"


def main():
    """主函数"""
    tests_dir = Path(__file__).parent
    test_files = list(tests_dir.glob("test_*.py"))

    print("🧪 验证测试文件...")
    print("=" * 50)

    all_valid = True

    for test_file in test_files:
        print(f"\n📄 检查文件: {test_file.name}")

        # 验证语法
        syntax_valid, syntax_msg = validate_python_syntax(test_file)
        if syntax_valid:
            print(f"  ✅ 语法: {syntax_msg}")
        else:
            print(f"  ❌ 语法: {syntax_msg}")
            all_valid = False

        # 验证结构
        structure_valid, structure_msg = validate_test_structure(test_file)
        if structure_valid:
            print(f"  ✅ 结构: {structure_msg}")
        else:
            print(f"  ❌ 结构: {structure_msg}")
            all_valid = False

    print("\n" + "=" * 50)
    if all_valid:
        print("🎉 所有测试文件验证通过!")
        return 0
    else:
        print("💥 部分测试文件验证失败!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
