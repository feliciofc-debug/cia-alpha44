#!/usr/bin/env python3
"""Verifica bundle Vercel — badge cache humano NCM."""
import re
import sys
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "https://cia-alpha44.vercel.app/"
html = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8", "replace")
scripts = re.findall(r'src="([^"]+\.js)"', html)
jsurl = scripts[0] if scripts[0].startswith("http") else URL.rstrip("/") + scripts[0]
bundle = jsurl.split("/")[-1]
js = urllib.request.urlopen(jsurl, timeout=60).read().decode("utf-8", "replace")
checks = {
    "cache humano": "cache humano" in js,
    "ncmClassificacaoCache": "ncmClassificacaoCache" in js,
}
print(f"URL: {URL}")
print(f"bundle: {bundle}")
for k, v in checks.items():
    print(f"  {k}: {'OK' if v else 'MISSING'}")
sys.exit(0 if all(checks.values()) else 1)
