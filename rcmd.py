import paramiko, socket, sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(60)
sock.bind(('10.16.35.28', 0))
sock.connect(('38.55.129.237', 22))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('38.55.129.237', port=22, username='root', password='vzdWC9pN8HkT',
          timeout=60, banner_timeout=60, auth_timeout=60,
          allow_agent=False, look_for_keys=False, sock=sock)
cmd = sys.argv[1] if len(sys.argv) > 1 else "echo hello"
i,o,e = c.exec_command(cmd, timeout=1800)
out = o.read().decode()
err = e.read().decode()
exit_code = o.channel.recv_exit_status()
with open(r'E:\CodeStudy\GovAI\_ssh_output.txt', 'w', encoding='utf-8') as f:
    f.write(f"CMD: {cmd}\n")
    f.write(f"EXIT: {exit_code}\n")
    f.write(f"{'='*60}\nSTDOUT:\n{out}\n")
    if err.strip():
        f.write(f"{'='*60}\nSTDERR:\n{err}\n")
print(f"Done. Exit={exit_code}. Output in _ssh_output.txt")
c.close()
