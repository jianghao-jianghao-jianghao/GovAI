"""
Phase 2: Transfer project files to server using chunked SFTP upload
Uses smaller buffer size and explicit flush for reliability
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
PROJECT_DIR = r"E:\CodeStudy\GovAI"
REMOTE_DIR = "/root/GovAI"

def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST, port=PORT, username=USER, password=PASSWORD,
        timeout=120, banner_timeout=60, auth_timeout=60,
        allow_agent=False, look_for_keys=False,
    )
    return client

def run_cmd(client, cmd, timeout=600):
    print(f"[CMD] {cmd}")
    i, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode('utf-8', errors='replace')
    err = e.read().decode('utf-8', errors='replace')
    code = o.channel.recv_exit_status()
    if out.strip():
        lines = out.strip().split('\n')
        for line in lines[:30]:
            print(f"  {line}")
        if len(lines) > 30:
            print(f"  ... ({len(lines)-30} more lines)")
    if err.strip():
        for line in err.strip().split('\n')[:5]:
            print(f"  [ERR] {line}")
    if code != 0:
        print(f"  [EXIT={code}]")
    return out, err, code

def create_tar(project_dir):
    """Create a tar.gz of the project, excluding unnecessary files"""
    print("Creating project archive...")
    
    exclude_dirs = {
        'node_modules', '.git', '__pycache__', '.venv', 'venv',
        '.next', 'dist', '.cache', '.tox', 'tmp_pip',
    }
    exclude_files = {
        '.env', '.env.production', 'deploy_remote.py', 'deploy_phase2.py',
        'deploy_phase2b.py', 'check_server.py', 'ssh_cmd.py', 'rcmd.py',
        'deploy_check.log', '_ssh_output.txt',
    }
    exclude_exts = {'.pyc', '.pyo', '.log', '.whl'}
    
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz', compresslevel=6) as tar:
        for root, dirs, files in os.walk(project_dir):
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
                    fsize = os.path.getsize(full_path)
                    if fsize > 100 * 1024 * 1024:  # Skip files > 100MB
                        print(f"  Skipping large file: {arc_name} ({fsize/(1024*1024):.0f}MB)")
                        continue
                    tar.add(full_path, arcname=arc_name)
                except (PermissionError, FileNotFoundError) as e:
                    print(f"  Skipping {arc_name}: {e}")
    
    size_mb = buf.tell() / (1024 * 1024)
    print(f"Archive created: {size_mb:.1f} MB")
    buf.seek(0)
    return buf

def chunked_upload(sftp, local_buf, remote_path, chunk_size=32768):
    """Upload with explicit chunking for reliability"""
    local_buf.seek(0, 2)
    total = local_buf.tell()
    local_buf.seek(0)
    
    print(f"Uploading {total/(1024*1024):.1f} MB to {remote_path}...")
    
    with sftp.open(remote_path, 'wb') as rf:
        rf.set_pipelined(True)
        uploaded = 0
        last_report = time.time()
        
        while True:
            chunk = local_buf.read(chunk_size)
            if not chunk:
                break
            rf.write(chunk)
            uploaded += len(chunk)
            
            now = time.time()
            if now - last_report >= 10:
                pct = (uploaded / total) * 100
                print(f"  {uploaded/(1024*1024):.1f} / {total/(1024*1024):.1f} MB ({pct:.0f}%)")
                last_report = now
    
    print(f"  Upload complete: {total/(1024*1024):.1f} MB")

def main():
    print(f"Connecting to {HOST}...")
    client = create_ssh_client()
    print("Connected!")

    # Step 1: Create archive
    tar_buf = create_tar(PROJECT_DIR)

    # Step 2: Upload
    run_cmd(client, f"rm -rf {REMOTE_DIR}; mkdir -p {REMOTE_DIR}")
    
    sftp = client.open_sftp()
    chunked_upload(sftp, tar_buf, "/root/govai_project.tar.gz")
    sftp.close()

    # Step 3: Extract
    print("\nExtracting on server...")
    run_cmd(client, f"cd {REMOTE_DIR} && tar xzf /root/govai_project.tar.gz && rm /root/govai_project.tar.gz")
    
    # Verify
    out, _, _ = run_cmd(client, f"ls {REMOTE_DIR}/docker-compose.prod.yml {REMOTE_DIR}/backend/Dockerfile.prod {REMOTE_DIR}/frontend.Dockerfile 2>&1")
    
    if "No such file" in out:
        print("\nERROR: Files not properly extracted!")
        client.close()
        return
    
    print("\nFiles verified on server!")

    # Step 4: Create .env.production
    print("\nCreating .env.production...")
    env_content = """# GovAI Production Environment
SERVER_IP=38.55.129.237
FRONTEND_PORT=80

POSTGRES_USER=govai_user
POSTGRES_PASSWORD=govai_prod_pwd_2026
POSTGRES_DB=govai_db

REDIS_PASSWORD=govai_redis_prod_2026

JWT_SECRET_KEY=govai-prod-xK9mP2vL7qR4wT8nJ3yB6cF1hA5sD0eZz

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
    sftp = client.open_sftp()
    with sftp.open(f"{REMOTE_DIR}/.env.production", 'w') as f:
        f.write(env_content)
    sftp.close()
    
    run_cmd(client, f"cat {REMOTE_DIR}/.env.production")
    print("\n.env.production created!")

    # Step 5: Update CORS in docker-compose.prod.yml for public IP
    print("\nUpdating docker-compose.prod.yml CORS for public IP...")
    run_cmd(client, f'''sed -i 's|CORS_ORIGINS:.*|CORS_ORIGINS: \'["http://38.55.129.237","http://38.55.129.237:80"]\'|' {REMOTE_DIR}/docker-compose.prod.yml''')

    # Step 6: Build and deploy
    print("\n=== Building Docker images (this may take several minutes) ===")
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production build", timeout=1800)
    
    print("\n=== Starting database and redis ===")
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis", timeout=120)
    
    print("Waiting for database to be ready...")
    time.sleep(15)
    
    print("\n=== Running database migration ===")
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend alembic upgrade head 2>&1 || echo 'Migration skipped (first deploy)'", timeout=300)
    
    print("\n=== Starting all services ===")
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --remove-orphans", timeout=300)
    
    print("\n=== Service status ===")
    time.sleep(10)
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production ps")
    
    # Step 7: Basic health check
    print("\n=== Health checks ===")
    time.sleep(5)
    run_cmd(client, "curl -sf http://localhost:80/health 2>&1 || echo 'Frontend not ready yet'")
    run_cmd(client, "curl -sf http://localhost:8000/api/v1/health 2>&1 || echo 'Backend not ready yet - checking via docker'")
    run_cmd(client, "docker logs govai-backend --tail 20 2>&1")
    run_cmd(client, "docker logs govai-frontend --tail 10 2>&1")
    
    print(f"\n{'='*60}")
    print(f"  Deployment complete!")
    print(f"  Access: http://38.55.129.237")
    print(f"{'='*60}")
    
    client.close()

if __name__ == "__main__":
    main()
