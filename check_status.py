"""Check server status after deploy"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("38.55.129.237", port=22, username="root", password="vzdWC9pN8HkT", timeout=15)

cmds = [
    "docker compose -f /root/GovAI/docker-compose.prod.yml --env-file /root/GovAI/.env.production ps",
    "ls -la /root/GovAI/.env.production",
    "docker compose -f /root/GovAI/docker-compose.prod.yml --env-file /root/GovAI/.env.production logs backend --tail=30",
    "curl -s http://localhost/health",
]

for cmd in cmds:
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = c.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(f"STDERR: {err}")

c.close()
