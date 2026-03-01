"""Fix branch name to main on public server"""
import paramiko

HOST = "38.55.129.237"
USER = "root"
PASSWORD = "vzdWC9pN8HkT"

def ssh_exec(cmd, timeout=120):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60,
                   allow_agent=False, look_for_keys=False)
    print(f"[CMD] {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    if out.strip(): print(out.strip())
    if err.strip(): print(f"[ERR] {err.strip()[:500]}")
    if code != 0: print(f"[EXIT={code}]")
    client.close()
    return out, err, code

# Fix work dir branch
ssh_exec("cd /root/GovAI && git branch -m master main")
ssh_exec("cd /root/GovAI && git push -u origin main --force")

# Fix bare repo default branch
ssh_exec("git -C /root/GovAI.git symbolic-ref HEAD refs/heads/main")
ssh_exec("git -C /root/GovAI.git branch -D master 2>/dev/null || true")

# Verify
ssh_exec("git -C /root/GovAI.git branch")
ssh_exec("cd /root/GovAI && git branch")
print("\nDone! Branch is now 'main'")
