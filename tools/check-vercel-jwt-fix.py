#!/usr/bin/env python3
import re
import urllib.request

URL = "https://cia-alpha44-web.vercel.app/"
html = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8", "replace")
scripts = re.findall(r'src="([^"]+\.js)"', html)
all_js = ""
for rel in scripts:
    jsurl = rel if rel.startswith("http") else URL.rstrip("/") + rel
    chunk = urllib.request.urlopen(jsurl, timeout=60).read().decode("utf-8", "replace")
    all_js += chunk
    print("chunk:", jsurl.split("/")[-1], "len", len(chunk))

print("skipCache:", "skipCache" in all_js)
print("x-demo-auth:", "x-demo-auth" in all_js)
for sha in ("d588b3f", "679ab15", "8ed7558", "local"):
    print(f"sha {sha}:", sha in all_js)
m = re.search(r'build\s*[`"\']?\s*\+?\s*[`"\']?([0-9a-f]{7}|local)', all_js, re.I)
print("BUILD footer:", m.group(0) if m else "NOT FOUND")
