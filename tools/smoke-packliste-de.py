#!/usr/bin/env python3
"""Smoke: POST packliste-DE → 14 linhas, aviso EUR, qtd itens 11/12."""
import json
import mimetypes
import os
import sys
import uuid
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.path.join(ROOT, "packages", "pipeline", "test", "fixtures", "packliste-DE-2026-0815.xlsx")
)

if not os.path.isfile(XLSX):
    print(f"ERRO: fixture nao encontrada: {XLSX}")
    sys.exit(1)

with open(XLSX, "rb") as f:
    data = f.read()

boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="packliste-DE-2026-0815.xlsx"\r\n'
    f"Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n"
).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("utf-8")

url = f"{API.rstrip('/')}/api/parse"
req = urllib.request.Request(
    url,
    data=body,
    headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)

print(f"POST {url}")
print(f"Arquivo: {XLSX} ({len(data)} bytes)")

try:
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.load(r)
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
    sys.exit(1)

linhas = out.get("linhas") or []
avisos = out.get("avisos") or []
total = out.get("totalLinhas", len(linhas))
moeda = out.get("moedaPlanilha")
aba = out.get("abaUsada")

print("\n=== SMOKE PACKLISTE DE ===")
print(f"abaUsada: {aba}")
print(f"totalLinhas: {total}")
print(f"moedaPlanilha: {moeda}")
print(f"avisos ({len(avisos)}):")
for a in avisos:
    print(f"  - {a}")

eur_ok = any("EUR" in a and "US$" in a for a in avisos)
print(f"\nAviso EUR vs US$: {'OK' if eur_ok else 'FALHA'}")

if len(linhas) >= 12:
    i11 = linhas[10]
    i12 = linhas[11]
    print(f"\nItem 11: qtd={i11.get('qtd')} desc={str(i11.get('descOriginal',''))[:70]}")
    print(f"Item 12: qtd={i12.get('qtd')} desc={str(i12.get('descOriginal',''))[:70]}")
    q11 = i11.get("qtd") == 1
    q12 = i12.get("qtd") == 100
    print(f"Item 11 qtd=1: {'OK' if q11 else 'FALHA'}")
    print(f"Item 12 qtd=100: {'OK' if q12 else 'FALHA'}")
else:
    q11 = q12 = False
    print(f"\nFALHA: menos de 12 linhas retornadas")

ok = total == 14 and eur_ok and q11 and q12
print(f"\nRESULTADO: {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
