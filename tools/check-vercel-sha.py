#!/usr/bin/env python3
import re
import urllib.request

URL = "https://cia-alpha44.vercel.app/"
html = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8", "replace")
scripts = re.findall(r'src="([^"]+\.js)"', html)
jsurl = scripts[0] if scripts[0].startswith("http") else URL.rstrip("/") + scripts[0]
js = urllib.request.urlopen(jsurl, timeout=60).read().decode("utf-8", "replace")
for sha in ("0f8c527", "540e005", "45957d9", "68ca836", "6fd4e90"):
    if sha in js:
        print(f"VERCEL_BUILD_SHA={sha}")
        break
else:
    m = re.search(r'build\s*["\']?\s*\+?\s*["\']?([0-9a-f]{7})', js, re.I)
    print(f"VERCEL_BUILD_SHA={m.group(1) if m else 'UNKNOWN'}")
print(f"bundle={jsurl.split('/')[-1]}")
