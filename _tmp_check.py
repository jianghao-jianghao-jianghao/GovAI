import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('38.55.129.237', 22, 'root', 'vzdWC9pN8HkT', timeout=15)
cmd = """docker exec govai-postgres psql -U govai_user -d govai_db -c "SELECT id, name, entity_type FROM graph_entities LIMIT 5;" """
i, o, e = c.exec_command(cmd)
print(o.read().decode())
print(e.read().decode())
c.close()
