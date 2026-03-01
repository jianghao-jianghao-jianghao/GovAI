import paramiko

HOST = "38.55.129.237"
USER = "root"
PASSWORD = "vzdWC9pN8HkT"

CMD = "sed -i 's|^\\s*CORS_ORIGINS:.*|      CORS_ORIGINS: \"[\\\\\"http://38.55.129.237\\\\\",\\\\\"http://38.55.129.237:80\\\\\"]\"|' /root/GovAI/docker-compose.prod.yml"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=60)
stdin, stdout, stderr = client.exec_command(CMD)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err)
client.close()
