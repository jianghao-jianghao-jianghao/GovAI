#!/usr/bin/env python3
"""
Phase 2: Transfer project files to server and deploy
"""
import paramiko
import socket
import os
import time
import tarfile
import io

HOST = "38.55.129.237"
PORT = 22
USER = "root"
PASSWORD = "vzdWC9pN8HkT"
LOCAL_BIND_IP = "10.16.35.28"
PROJECT_DIR = r"E:\CodeStudy\GovAI"
REMOTE_DIR = "/root/GovAI"

def create_ssh_client():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(120)
    sock.bind((LOCAL_BIND_IP, 0))
    sock.connect((HOST, PORT))
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST, port=PORT, username=USER, password=PASSWORD,
        timeout=120, banner_timeout=60, auth_timeout=60,
        allow_agent=False, look_for_keys=False, sock=sock
    )
    return client

def run_cmd(client, cmd, timeout=600):
    print(f"\n[CMD] {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out.strip():
        # Print first and last 20 lines if output is very long
        lines = out.strip().split('\n')
        if len(lines) > 40:
            print('\n'.join(lines[:20]))
            print(f"  ... ({len(lines)-40} lines omitted) ...")
            print('\n'.join(lines[-20:]))
        else:
            print(out.strip())
    if err.strip():
        err_lines = err.strip().split('\n')
        # Filter out common noise
        for line in err_lines[:10]:
            print(f"  [STDERR] {line}")
    if exit_code != 0:
        print(f"  [EXIT CODE] {exit_code}")
    return out, err, exit_code

def create_tar(project_dir):
    """Create a tar.gz of the project, excluding unnecessary files"""
    print("Creating project archive...")
    
    exclude_dirs = {
        'node_modules', '.git', '__pycache__', '.venv', 'venv',
        '.next', 'dist', '.cache', '.tox', 'tmp_pip',
    }
    exclude_files = {
        '.env', '.env.production', 'deploy_remote.py', 'deploy_phase2.py',
        'pnpm-lock.yaml',
    }
    exclude_exts = {'.pyc', '.pyo', '.log', '.whl'}
    
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for root, dirs, files in os.walk(project_dir):
            # Filter excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            rel_root = os.path.relpath(root, project_dir)
            
            for f in files:
                if f in exclude_files:
                    continue
                ext = os.path.splitext(f)[1]
                if ext in exclude_exts:
                    continue
                    
                full_path = os.path.join(root, f)
                arc_name = os.path.join(rel_root, f) if rel_root != '.' else f
                arc_name = arc_name.replace('\\', '/')
                
                try:
                    tar.add(full_path, arcname=arc_name)
                except (PermissionError, FileNotFoundError) as e:
                    print(f"  Skipping {arc_name}: {e}")
    
    size_mb = buf.tell() / (1024 * 1024)
    print(f"Archive created: {size_mb:.1f} MB")
    buf.seek(0)
    return buf

def upload_file(client, local_buf, remote_path):
    """Upload a file-like object via SFTP"""
    print(f"Uploading to {remote_path}...")
    sftp = client.open_sftp()
    
    # Get total size
    local_buf.seek(0, 2)
    total = local_buf.tell()
    local_buf.seek(0)
    
    uploaded = [0]
    last_print = [time.time()]
    
    def progress(transferred, total_bytes):
        uploaded[0] = transferred
        now = time.time()
        if now - last_print[0] >= 5:  # Print every 5 seconds
            pct = (transferred / total_bytes) * 100
            mb = transferred / (1024*1024)
            print(f"  Uploaded: {mb:.1f} MB / {total_bytes/(1024*1024):.1f} MB ({pct:.0f}%)")
            last_print[0] = now
    
    sftp.putfo(local_buf, remote_path, file_size=total, callback=progress)
    sftp.close()
    print(f"Upload complete: {total/(1024*1024):.1f} MB")

def main():
    print(f"Connecting to {HOST}...")
    client = create_ssh_client()
    print("Connected!")

    # Step 1: Create project tar
    tar_buf = create_tar(PROJECT_DIR)

    # Step 2: Upload to server
    run_cmd(client, f"mkdir -p {REMOTE_DIR}")
    upload_file(client, tar_buf, "/root/govai_project.tar.gz")

    # Step 3: Extract on server
    print("\nExtracting project files...")
    run_cmd(client, f"cd {REMOTE_DIR} && tar xzf /root/govai_project.tar.gz")
    run_cmd(client, f"rm /root/govai_project.tar.gz")
    run_cmd(client, f"ls -la {REMOTE_DIR}/")

    # Step 4: Create .env.production
    print("\nCreating .env.production...")
    env_content = """# ============================================================
# GovAI Production Environment Variables
# Server: 38.55.129.237
# ============================================================

# Server
SERVER_IP=38.55.129.237
FRONTEND_PORT=80

# PostgreSQL
POSTGRES_USER=govai_user
POSTGRES_PASSWORD=govai_prod_pwd_2026
POSTGRES_DB=govai_db

# Redis
REDIS_PASSWORD=govai_redis_prod_2026

# JWT (random secret)
JWT_SECRET_KEY=govai-prod-xK9mP2vL7qR4wT8nJ3yB6cF1hA5sD0e

# Dify config (mock mode - no real Dify needed)
DIFY_MOCK=true
DIFY_API_PORT=5001
DIFY_BASE_URL=http://host.docker.internal:5001/v1
DIFY_DATASET_API_KEY=dataset-placeholder
DIFY_APP_DOC_DRAFT_KEY=app-placeholder
DIFY_APP_DOC_CHECK_KEY=app-placeholder
DIFY_APP_DOC_OPTIMIZE_KEY=app-placeholder
DIFY_APP_CHAT_KEY=app-placeholder
DIFY_APP_ENTITY_EXTRACT_KEY=app-placeholder
DIFY_APP_DOC_FORMAT_KEY=app-placeholder
DIFY_APP_DOC_DIAGNOSE_KEY=app-placeholder
DIFY_APP_PUNCT_FIX_KEY=app-placeholder
"""
    
    # Write env file via sftp
    sftp = client.open_sftp()
    with sftp.open(f"{REMOTE_DIR}/.env.production", 'w') as f:
        f.write(env_content)
    sftp.close()
    print(".env.production created")
    
    run_cmd(client, f"cat {REMOTE_DIR}/.env.production")

    client.close()
    print("\n\nPhase 2 complete. Files transferred.")

if __name__ == "__main__":
    main()
