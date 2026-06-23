#!/usr/bin/env python3
"""Verifica bundle Vercel P3a — strings ICMS no JS de produção."""
import re
import sys
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "https://cia-alpha44.vercel.app/"
EXPECTED_PREFIX = sys.argv[2] if len(sys.argv) > 2 else None

html = urllib.request.urlopen(URL, timeout=30).read().decode("utf-8", "replace")
scripts = re.findall(r'src="([^"]+\.js)"', html)
if not scripts:
    print("FAIL: nenhum script no index")
    sys.exit(1)
jsurl = scripts[0] if scripts[0].startswith("http") else URL.rstrip("/") + scripts[0]
bundle_name = jsurl.split("/")[-1]
js = urllib.request.urlopen(jsurl, timeout=60).read().decode("utf-8", "replace")

checks = {
    "ufEmpresa": "ufEmpresa" in js,
    "regimeIcms": "regimeIcms" in js,
    "icmsSaidaManualFlag": "icmsSaidaManualFlag" in js,
    "override manual": "Override manual em vigor" in js or "override manual em vigor" in js.lower(),
    "P2.3 ICMS": "P2.3" in js or "empresa e regime" in js,
}
print(f"URL: {URL}")
print(f"bundle: {bundle_name}")
for k, v in checks.items():
    print(f"  {k}: {'OK' if v else 'MISSING'}")
if EXPECTED_PREFIX and not bundle_name.startswith(EXPECTED_PREFIX.split("-")[0]):
    pass  # optional
ok = all(checks.values())
print(f"\nVercel P3a bundle: {'OK' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
