#!/usr/bin/env python3
import re
import urllib.request

html = urllib.request.urlopen("https://cia-alpha44.vercel.app/", timeout=30).read().decode("utf-8", "replace")
scripts = re.findall(r'src="([^"]+\.js)"', html)
print("scripts:", scripts[:2])
for s in scripts:
    url = s if s.startswith("http") else "https://cia-alpha44.vercel.app" + s
    js = urllib.request.urlopen(url, timeout=60).read().decode("utf-8", "replace")
    for term in ["Confirmar NCM", "Resolver pend", "revisar compatibilidade", "barra-resolucao-ncm", "Clique para resolver"]:
        print(f"  {term!r}: {term in js}")
    break
