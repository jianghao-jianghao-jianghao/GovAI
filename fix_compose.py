"""
Fix CORS_ORIGINS in docker-compose.prod.yml on server, stamp alembic, restart backend
"""
import paramiko

HOST = "38.55.129.237"
USER = "root"
PASSWORD = "vzdWC9pN8HkT"

def ssh_exec(cmd, timeout=300):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60,
                   allow_agent=False, look_for_keys=False)
    print(f"\n[CMD] {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    if out.strip():
        for line in out.strip().split('\n')[:30]:
            print(f"  {line}")
    if err.strip():
        for line in err.strip().split('\n')[:10]:
            print(f"  [ERR] {line}")
    if code != 0:
        print(f"  [EXIT={code}]")
    client.close()
    return out, err, code

def ssh_upload(remote_path, content):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60,
                   allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    with sftp.open(remote_path, 'w') as f:
        f.write(content)
    sftp.close()
    client.close()
    print(f"Uploaded {remote_path}")

def main():
    # Step 1: Re-upload clean docker-compose.prod.yml from local
    print("=== Step 1: Upload clean docker-compose.prod.yml ===")
    with open(r'E:\CodeStudy\GovAI\docker-compose.prod.yml', 'r', encoding='utf-8') as f:
        content = f.read()
    ssh_upload('/root/GovAI/docker-compose.prod.yml', content)

    # Step 2: Verify
    ssh_exec("grep CORS_ORIGINS /root/GovAI/docker-compose.prod.yml")

    # Step 3: Stamp alembic to head
    print("\n=== Step 2: Stamp alembic ===")
    ssh_exec("cd /root/GovAI && docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend alembic stamp head", timeout=120)

    # Step 4: Restart backend
    print("\n=== Step 3: Restart backend ===")
    ssh_exec("cd /root/GovAI && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate backend")

    import time; time.sleep(5)

    # Step 5: Verify
    print("\n=== Step 4: Verify ===")
    ssh_exec("docker ps --format 'table {{.Names}}\t{{.Status}}'")
    ssh_exec("curl -sf http://localhost:80/health && echo ' OK' || echo 'FAIL'")

    print("\nDone!")

if __name__ == "__main__":
    main()
