import socket
s = socket.socket()
s.settimeout(3)
try:
    s.connect(("172.31.0.1", 15001))
    print("OK - WSL can reach Windows 172.31.0.1:15001")
except Exception as e:
    print(f"FAIL - {e}")
finally:
    s.close()
