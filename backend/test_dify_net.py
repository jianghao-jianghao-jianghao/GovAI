import urllib.request
try:
    r = urllib.request.urlopen('http://172.31.0.1:15001/v1/', timeout=5)
    print('OK:', r.status)
except Exception as e:
    print('FAILED:', e)

# Also try host.docker.internal
try:
    r2 = urllib.request.urlopen('http://host.docker.internal:15001/v1/', timeout=5)
    print('host.docker.internal OK:', r2.status)
except Exception as e2:
    print('host.docker.internal FAILED:', e2)

# Try docker gateway
import subprocess, socket
try:
    gw = subprocess.check_output(['ip', 'route', 'show', 'default']).decode().split()[2]
    print('Gateway:', gw)
    r3 = urllib.request.urlopen(f'http://{gw}:15001/v1/', timeout=5)
    print(f'Gateway {gw} OK:', r3.status)
except Exception as e3:
    print('Gateway FAILED:', e3)
