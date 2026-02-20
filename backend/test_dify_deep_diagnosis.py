#!/usr/bin/env python3
"""
深度诊断：测试 DNS 解析和网络连接
"""
import os
import sys
import socket
import subprocess
from urllib import request
import json

def print_section(title):
    print("\n" + "="*70)
    print(f"🔍 {title}")
    print("="*70)

def run_command(cmd, desc=""):
    """运行命令并返回输出"""
    print(f"\n📌 运行: {cmd}")
    if desc:
        print(f"   {desc}")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
        if result.stdout:
            print(f"   ✅ 输出:\n{result.stdout}")
        if result.stderr:
            print(f"   ⚠️  错误:\n{result.stderr}")
        return result.returncode == 0, result.stdout
    except Exception as e:
        print(f"   ❌ 异常: {e}")
        return False, ""

def test_dns_resolution():
    """测试 DNS 解析"""
    print_section("DNS 解析测试")
    
    hosts_to_test = [
        "127.0.0.1",
        "localhost"
    ]
    
    for host in hosts_to_test:
        try:
            ip = socket.gethostbyname(host)
            print(f"✅ {host:30} → {ip}")
        except Exception as e:
            print(f"❌ {host:30} → {e}")

def test_ssh_tunnel_binding():
    """检查 SSH 隧道在哪个地址上监听"""
    print_section("SSH 隧道绑定检查")
    
    run_command("netstat -tlnp | grep 15001", "查看本地 15001 端口绑定")
    run_command("ss -tlnp | grep 15001", "使用 ss 命令查看 15001 端口")
    run_command("ps aux | grep ssh", "查看 SSH 进程")

def test_curl_from_container():
    """从容器内测试 curl"""
    print_section("curl 测试 (容器内)")
    
    base_url = os.getenv("DIFY_BASE_URL", "http://127.0.0.1:15001/v1")
    print(f"📍 DIFY_BASE_URL: {base_url}")
    
    # 测试 curl 的详细输出
    run_command(
        f"curl -v {base_url}/datasets 2>&1 | head -50",
        "GET /datasets (详细输出)"
    )
    
    # 尝试不同的主机地址
    print("\n📌 尝试不同的主机地址:")
    
    # 解析主机到 IP
    try:
        resolved_ip = socket.gethostbyname("127.0.0.1")
        print(f"✅ 127.0.0.1 解析为: {resolved_ip}")
        
        # 尝试直接用 IP
        success, output = run_command(
            f"curl -v http://{resolved_ip}:15001/v1/datasets 2>&1 | head -30",
            f"GET /datasets (使用 IP {resolved_ip})"
        )
    except Exception as e:
        print(f"❌ DNS 解析失败: {e}")

def test_raw_http_request():
    """原始 HTTP 请求测试"""
    print_section("原始 HTTP 请求测试")
    
    host = "127.0.0.1"
    port = 15001
    
    try:
        # 尝试原始 socket HTTP 请求
        sock = socket.create_connection((host, port), timeout=3)
        print(f"✅ Socket 连接成功 ({host}:{port})")
        
        # 发送 HTTP GET 请求
        request_data = b"GET /v1/datasets HTTP/1.1\r\nHost: 127.0.0.1:15001\r\nConnection: close\r\n\r\n"
        sock.sendall(request_data)
        print(f"📤 已发送 HTTP 请求头")
        
        # 尝试接收响应
        response = b""
        sock.settimeout(2)
        try:
            while True:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                response += chunk
        except socket.timeout:
            print(f"⚠️  Socket 超时")
        except Exception as e:
            print(f"⚠️  接收错误: {e}")
        
        sock.close()
        
        if response:
            print(f"📥 接收到响应 ({len(response)} 字节)")
            print(f"   {response[:200]}")
        else:
            print(f"❌ 未接收到任何响应")
            
    except Exception as e:
        print(f"❌ 异常: {e}")

def test_environment():
    """测试环境变量"""
    print_section("环境变量检查")
    
    vars_to_check = [
        "DIFY_BASE_URL",
        "DIFY_API_KEY",
        "DIFY_DATASET_API_KEY",
        "PYTHONPATH"
    ]
    
    for var in vars_to_check:
        value = os.getenv(var, "未设置")
        # 隐藏敏感值
        if "KEY" in var:
            value = value[:10] + "***" if len(value) > 10 else "***"
        print(f"  {var:25} = {value}")

if __name__ == "__main__":
    print("\n" + "🚀 " * 35)
    print("深度诊断开始".center(70))
    print("🚀 " * 35 + "\n")
    
    test_environment()
    test_dns_resolution()
    test_ssh_tunnel_binding()
    test_raw_http_request()
    test_curl_from_container()
    
    print("\n" + "="*70)
    print("✅ 诊断完成")
    print("="*70 + "\n")
