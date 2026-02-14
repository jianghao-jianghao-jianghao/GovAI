#!/usr/bin/env python
"""
测试运行脚本

用法:
    python tests/run_tests.py              # 运行所有单元测试
    python tests/run_tests.py --all        # 运行所有测试(包括集成测试)
    python tests/run_tests.py --unit       # 只运行单元测试
    python tests/run_tests.py --integration # 只运行集成测试
    python tests/run_tests.py --cov        # 运行测试并生成覆盖率报告
"""
import sys
import subprocess
from pathlib import Path


def run_command(cmd):
    """运行命令"""
    print(f"运行: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=Path(__file__).parent.parent)
    return result.returncode


def main():
    """主函数"""
    args = sys.argv[1:]
    
    # 基础命令
    base_cmd = ["pytest", "tests/"]
    
    if not args or "--unit" in args:
        # 运行单元测试
        print("=" * 60)
        print("运行单元测试")
        print("=" * 60)
        cmd = base_cmd + ["-m", "unit"]
        return run_command(cmd)
    
    elif "--integration" in args:
        # 运行集成测试
        print("=" * 60)
        print("运行集成测试 (需要真实API Key)")
        print("=" * 60)
        cmd = base_cmd + ["-m", "integration"]
        return run_command(cmd)
    
    elif "--all" in args:
        # 运行所有测试
        print("=" * 60)
        print("运行所有测试")
        print("=" * 60)
        return run_command(base_cmd)
    
    elif "--cov" in args:
        # 运行测试并生成覆盖率报告
        print("=" * 60)
        print("运行测试并生成覆盖率报告")
        print("=" * 60)
        cmd = base_cmd + [
            "-m", "unit",
            "--cov=dify/services/dify",
            "--cov-report=html",
            "--cov-report=term"
        ]
        return run_command(cmd)
    
    else:
        print(__doc__)
        return 1


if __name__ == "__main__":
    sys.exit(main())
