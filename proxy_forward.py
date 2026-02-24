"""TCP proxy forwarder: 0.0.0.0:7891 -> 127.0.0.1:7890
Makes Clash proxy accessible from WSL2 / Docker build containers.
Usage: python proxy_forward.py
"""
import socket, threading, sys

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 7891
TARGET_HOST = "127.0.0.1"
TARGET_PORT = 7890


def relay(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        src.close()
        dst.close()


def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((LISTEN_HOST, LISTEN_PORT))
    server.listen(50)
    print(f"TCP proxy: {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)

    try:
        while True:
            client, addr = server.accept()
            try:
                remote = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote.connect((TARGET_HOST, TARGET_PORT))
                threading.Thread(target=relay, args=(client, remote), daemon=True).start()
                threading.Thread(target=relay, args=(remote, client), daemon=True).start()
            except Exception:
                client.close()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        server.close()


if __name__ == "__main__":
    main()
