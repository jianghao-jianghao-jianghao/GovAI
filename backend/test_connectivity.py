#!/usr/bin/env python3
"""测试不同地址的连通性"""
import socket

targets = [
    ("host.docker.internal", 15001),
    ("192.168.100.49", 15001),
    ("2.0.1.5", 15001),
    ("172.17.0.1", 15001),
]

for host, port in targets:
    try:
        s = socket.create_connection((host, port), timeout=3)
        s.close()
        print(f"OK   {host}:{port}")
    except Exception as e:
        print(f"FAIL {host}:{port} - {e}")
