#!/usr/bin/env python3
"""
Remote deployment script for GovAI
Connects to server via SSH and executes deployment commands
"""
import paramiko
import sys
import time
import socket

HOST = "38.55.129.237"
PORT = 22
USER = "root"
PASSWORD = "vzdWC9pN8HkT"
LOCAL_BIND_IP = "10.16.35.28"  # Real ethernet adapter, bypass FlClash proxy

def create_ssh_client(retries=3):
    for attempt in range(retries):
        try:
            # Create a raw socket bound to real NIC to bypass proxy
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(60)
            sock.bind((LOCAL_BIND_IP, 0))
            sock.connect((HOST, PORT))

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                HOST, port=PORT, username=USER, password=PASSWORD,
                timeout=60, banner_timeout=60, auth_timeout=60,
                allow_agent=False, look_for_keys=False,
                sock=sock
            )
            return client
        except Exception as e:
            print(f"  Attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(5)
            else:
                raise

def run_cmd(client, cmd, timeout=300):
    """Run a command and print output in real-time"""
    print(f"\n{'='*60}")
    print(f"[CMD] {cmd}")
    print('='*60)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out)
    if err.strip():
        print(f"[STDERR] {err}")
    print(f"[EXIT CODE] {exit_code}")
    return out, err, exit_code

def main():
    print(f"Connecting to {HOST}...")
    client = create_ssh_client()
    print("Connected!")

    # Step 1: Check server info
    print("\n\n=== Step 1: Server Info ===")
    run_cmd(client, "uname -a && cat /etc/os-release | head -3 && free -h | head -2 && df -h / | tail -1")

    # Step 2: Check/Install Docker
    print("\n\n=== Step 2: Check Docker ===")
    out, err, code = run_cmd(client, "docker --version 2>/dev/null && docker compose version 2>/dev/null")
    
    if code != 0:
        print("\nDocker not found. Installing Docker...")
        # Install Docker
        commands = [
            "apt-get update -y",
            "apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release",
            "curl -fsSL https://get.docker.com | sh",
            "systemctl enable docker && systemctl start docker",
            "docker --version && docker compose version",
        ]
        for cmd in commands:
            out, err, code = run_cmd(client, cmd, timeout=600)
            if code != 0 and "docker" in cmd.lower() and "install" not in cmd.lower():
                print(f"WARNING: Command failed: {cmd}")
    
    # Step 3: Check/Install Git
    print("\n\n=== Step 3: Check Git ===")
    out, err, code = run_cmd(client, "git --version 2>/dev/null")
    if code != 0:
        print("Installing git...")
        run_cmd(client, "apt-get install -y git", timeout=120)

    client.close()
    print("\n\nPhase 1 complete. Server is ready.")

if __name__ == "__main__":
    main()
