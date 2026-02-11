#!/usr/bin/env python3
"""
明文密码转加密密码脚本
基于 app.core.security 中的 hash_password 函数
"""

import sys
import os
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.security import hash_password
from getpass import getpass


def hash_password_interactive():
    """交互式密码哈希"""
    print("=" * 50)
    print("明文密码转加密密码工具")
    print("=" * 50)
    
    while True:
        print("\n请选择操作:")
        print("1. 单个密码哈希")
        print("2. 批量密码哈希 (从文件读取)")
        print("3. 退出")
        
        choice = input("\n请输入选择 (1/2/3): ").strip()
        
        if choice == "1":
            hash_single_password()
        elif choice == "2":
            hash_passwords_from_file()
        elif choice == "3":
            print("再见!")
            break
        else:
            print("❌ 无效选择，请重试")


def hash_single_password():
    """哈希单个密码"""
    print("\n--- 单个密码哈希 ---")
    
    # 使用 getpass 隐藏输入
    plain_password = getpass("请输入明文密码 (输入时不显示): ")
    
    if not plain_password:
        print("❌ 密码不能为空")
        return
    
    hashed_password = hash_password(plain_password)
    
    print(f"\n✅ 哈希成功!")
    print(f"明文密码: {plain_password}")
    print(f"加密密码: {hashed_password}")
    
    # 提供复制选项
    copy_prompt = input("\n是否复制加密密码到剪贴板? (y/n): ").strip().lower()
    if copy_prompt == 'y':
        try:
            import pyperclip
            pyperclip.copy(hashed_password)
            print("✅ 已复制到剪贴板")
        except ImportError:
            print("⚠️ pyperclip 未安装，无法复制到剪贴板")
            print(f"加密密码: {hashed_password}")


def hash_passwords_from_file():
    """从文件读取明文密码进行批量哈希"""
    print("\n--- 批量密码哈希 ---")
    
    file_path = input("请输入密码文件路径 (每行一个密码): ").strip()
    
    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return
    
    try:
        output_file = file_path.replace(".txt", "_hashed.txt")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        hashed_results = []
        for i, line in enumerate(lines, 1):
            plain_password = line.strip()
            if plain_password:  # 跳过空行
                hashed_password = hash_password(plain_password)
                hashed_results.append(f"{plain_password}\t{hashed_password}\n")
                print(f"✅ 已处理第 {i} 个密码")
        
        # 保存结果
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("明文密码\t加密密码\n")
            f.write("-" * 100 + "\n")
            f.writelines(hashed_results)
        
        print(f"\n✅ 批量哈希成功!")
        print(f"输入文件: {file_path}")
        print(f"输出文件: {output_file}")
        print(f"处理数量: {len(hashed_results)} 个密码")
        
    except Exception as e:
        print(f"❌ 处理失败: {e}")


def hash_password_direct(plain_password: str) -> str:
    """直接哈希密码 (编程方式)"""
    return hash_password(plain_password)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 命令行模式: python hash_password.py "your_plain_password"
        plain_pwd = sys.argv[1]
        hashed = hash_password_direct(plain_pwd)
        print(f"明文: {plain_pwd}")
        print(f"加密: {hashed}")
    else:
        # 交互模式
        hash_password_interactive()
