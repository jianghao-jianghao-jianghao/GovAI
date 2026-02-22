import urllib.request, json

url = "http://172.31.0.1:15001/v1/datasets?page=1&limit=1"
req = urllib.request.Request(url, headers={
    "Authorization": "Bearer dataset-02rZJb5w1S39SMUQMXT2sQR2"
})
try:
    r = urllib.request.urlopen(req, timeout=5)
    data = json.loads(r.read())
    print(f"OK status={r.status} total={data.get('total', '?')}")
except Exception as e:
    print(f"FAIL {e}")
