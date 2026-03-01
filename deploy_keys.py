"""部署SSH公钥到两台服务器，以便 git push 免密码"""
import paramiko, os

PUBKEY = open(os.path.expanduser("~/.ssh/id_ed25519.pub")).read().strip()

SERVERS = [
    {"host": "38.55.129.237", "port": 22, "user": "root", "password": "vzdWC9pN8HkT", "name": "公网服务器"},
    {"host": "10.16.49.100",  "port": 8989, "user": "wy",   "password": "wy62487732",   "name": "内网服务器"},
]

for srv in SERVERS:
    print(f"\n=== {srv['name']} ({srv['host']}:{srv['port']}) ===")
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect(srv["host"], port=srv["port"], username=srv["user"], password=srv["password"], timeout=15)
        
        cmds = [
            "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
            f"grep -qF '{PUBKEY}' ~/.ssh/authorized_keys 2>/dev/null || echo '{PUBKEY}' >> ~/.ssh/authorized_keys",
            "chmod 600 ~/.ssh/authorized_keys",
        ]
        for cmd in cmds:
            stdin, stdout, stderr = c.exec_command(cmd)
            stdout.channel.recv_exit_status()
        
        # 验证
        stdin, stdout, stderr = c.exec_command("cat ~/.ssh/authorized_keys")
        keys = stdout.read().decode()
        if PUBKEY in keys:
            print(f"  ✓ 公钥已部署成功")
        else:
            print(f"  ✗ 公钥部署失败")
        c.close()
    except Exception as e:
        print(f"  ✗ 连接失败: {e}")

print("\n完成！")
