import paramiko, socket

def ssh_exec(cmd, timeout=1800):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(120)
    sock.bind(('10.16.35.28', 0))
    sock.connect(('38.55.129.237', 22))
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect('38.55.129.237', port=22, username='root', password='vzdWC9pN8HkT',
              timeout=120, banner_timeout=60, auth_timeout=60,
              allow_agent=False, look_for_keys=False, sock=sock)
    i,o,e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode()
    err = e.read().decode()
    code = o.channel.recv_exit_status()
    c.close()
    return out, err, code

# Check if files exist
out, err, code = ssh_exec("ls /root/GovAI/docker-compose.prod.yml /root/GovAI/backend/Dockerfile.prod /root/GovAI/frontend.Dockerfile 2>&1")
with open('deploy_check.log', 'w') as f:
    f.write(f"File check (exit={code}):\n{out}\n{err}\n")

# Check .env.production
out2, err2, code2 = ssh_exec("cat /root/GovAI/.env.production 2>&1 || echo MISSING")
with open('deploy_check.log', 'a') as f:
    f.write(f"\n.env.production (exit={code2}):\n{out2}\n")

print("Check complete. See deploy_check.log")
