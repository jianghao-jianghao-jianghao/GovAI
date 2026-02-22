import socket

targets = [
    ("127.0.0.1", 15001),
    ("localhost", 15001),
    ("172.31.0.1", 15001),
    ("host.docker.internal", 15001),
]

for host, port in targets:
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((host, port))
        print(f"OK   {host}:{port}")
    except Exception as e:
        print(f"FAIL {host}:{port} - {e}")
    finally:
        s.close()
