"""
Fix database schema on 38.55.129.237:
1. Add missing formatted_paragraphs column
2. Stamp alembic to current head
3. Verify all services healthy
"""
import paramiko
import time

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
        for line in out.strip().split('\n')[:50]:
            print(f"  {line}")
    if err.strip():
        for line in err.strip().split('\n')[:20]:
            print(f"  [ERR] {line}")
    if code != 0:
        print(f"  [EXIT={code}]")
    client.close()
    return out, err, code

def main():
    print("=== Step 1: Check current documents table schema ===")
    ssh_exec("docker exec govai-postgres psql -U govai_user -d govai_db -c '\\d documents'")

    print("\n=== Step 2: Add missing formatted_paragraphs column ===")
    ssh_exec("""docker exec govai-postgres psql -U govai_user -d govai_db -c "ALTER TABLE documents ADD COLUMN IF NOT EXISTS formatted_paragraphs TEXT;" """)

    print("\n=== Step 3: Verify column added ===")
    ssh_exec("""docker exec govai-postgres psql -U govai_user -d govai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name='formatted_paragraphs';" """)

    print("\n=== Step 4: Stamp alembic to head ===")
    ssh_exec("cd /root/GovAI && docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend alembic stamp head", timeout=120)

    print("\n=== Step 5: Restart backend ===")
    ssh_exec("cd /root/GovAI && docker compose -f docker-compose.prod.yml --env-file .env.production restart backend")
    time.sleep(5)

    print("\n=== Step 6: Check services ===")
    ssh_exec("docker ps --format 'table {{.Names}}\t{{.Status}}'")

    print("\n=== Step 7: Test frontend health ===")
    ssh_exec("curl -sf http://localhost:80/health && echo ' OK' || echo 'FAIL'")

    print("\n=== Done ===")

if __name__ == "__main__":
    main()
