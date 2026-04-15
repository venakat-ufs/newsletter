import urllib.request, urllib.error, ssl, re, json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html,*/*', 'Accept-Encoding': 'identity'}

print("=== RealtyTrac page 2 ===")
try:
    req = urllib.request.Request('https://www.realtytrac.com/foreclosure/?p=2', headers=H)
    resp = urllib.request.urlopen(req, timeout=20, context=ctx)
    chunks = []
    while True:
        chunk = resp.read(65536)
        if not chunk: break
        chunks.append(chunk)
    content = b''.join(chunks).decode('utf-8', errors='replace')
    next_data = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', content, re.DOTALL)
    if next_data:
        data = json.loads(next_data.group(1))
        pp = data['props']['pageProps']
        print("Page 2 totalResults:", pp.get("totalResults"))
        print("offsetN:", pp.get("offsetN"))
        print("properties:", len(pp.get("properties", [])))
    else:
        print("__NEXT_DATA__ not found")
except Exception as ex:
    print("Error:", ex)

print()
print("=== RealtyTrac bank-owned TX ===")
try:
    req = urllib.request.Request('https://www.realtytrac.com/foreclosure/tx/bank-owned/', headers=H)
    resp = urllib.request.urlopen(req, timeout=20, context=ctx)
    chunks = []
    while True:
        chunk = resp.read(65536)
        if not chunk: break
        chunks.append(chunk)
    content = b''.join(chunks).decode('utf-8', errors='replace')
    next_data = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', content, re.DOTALL)
    if next_data:
        data = json.loads(next_data.group(1))
        pp = data['props']['pageProps']
        print("TX bank-owned totalResults:", pp.get("totalResults"))
        props = pp.get("properties", [])
        print("properties:", len(props))
        if props:
            p = props[0]
            print("Sample:", p.get("fullAddr"), "$" + str(p.get("value", 0)))
    else:
        print("__NEXT_DATA__ not found")
except Exception as ex:
    print("Error:", ex)
