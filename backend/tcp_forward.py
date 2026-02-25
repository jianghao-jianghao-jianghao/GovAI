"""
TCP Port Forwarder: 172.31.0.1:15001 -> 127.0.0.1:15001
让 WSL2/Docker 可以通过 Windows 网关访问 SSH 隧道
"""
import asyncio

LOCAL_HOST = "0.0.0.0"   # Listen on all interfaces (including WSL-facing vEthernet adapter)
LOCAL_PORT = 15001
REMOTE_HOST = "127.0.0.1"  # SSH tunnel on loopback
REMOTE_PORT = 15001

async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def handle(local_r, local_w):
    peer = local_w.get_extra_info("peername")
    try:
        remote_r, remote_w = await asyncio.open_connection(REMOTE_HOST, REMOTE_PORT)
    except Exception as e:
        print(f"[!] Cannot connect to {REMOTE_HOST}:{REMOTE_PORT}: {e}")
        try:
            local_w.close()
            await local_w.wait_closed()
        except Exception:
            pass
        return
    print(f"[+] {peer} -> {REMOTE_HOST}:{REMOTE_PORT}")
    try:
        await asyncio.gather(pipe(local_r, remote_w), pipe(remote_r, local_w))
    except Exception as e:
        print(f"[!] pipe error for {peer}: {e}")
    print(f"[-] {peer} closed")

async def main():
    server = await asyncio.start_server(handle, LOCAL_HOST, LOCAL_PORT)
    print(f"[*] TCP Forwarder listening on {LOCAL_HOST}:{LOCAL_PORT} -> {REMOTE_HOST}:{REMOTE_PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Stopped")
