import paramiko

HOST="38.55.129.237"
USER="root"
PASSWORD="vzdWC9pN8HkT"

cmd = "bash -lc \"cat <<'PY' | docker exec -i govai-backend python -\nimport asyncio, httpx\nasync def main():\n    async with httpx.AsyncClient() as c:\n        r = await c.get('http://localhost:8000/api/v1/health')\n        print(r.status_code, r.text)\nasyncio.run(main())\nPY\""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=60)
stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print('ERR:', err)
client.close()
