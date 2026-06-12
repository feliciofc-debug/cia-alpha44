#!/usr/bin/env python3
"""Smoke UX PDF — API: confirmado baixa; pendente retorna 422 NCM_INVALIDO acionável."""
import json
import sys
import urllib.error
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
CONFIRMADO = sys.argv[2] if len(sys.argv) > 2 else "cmqb8uowx0001kwgk87pyskr5"
PENDENTE = sys.argv[3] if len(sys.argv) > 3 else "cmqb85m4e0001kwni2ko0m9r2"


def get_pdf(cid: str) -> dict:
    url = f"{API.rstrip('/')}/api/cotacoes/{cid}/pdf?tipo=cliente"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            return {"url": url, "status": r.status, "pdf": body[:4] == b"%PDF", "bytes": len(body)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            j = json.loads(raw)
        except json.JSONDecodeError:
            j = {"erro": raw[:200]}
        return {"url": url, "status": e.code, "json": j}


ok_a = get_pdf(CONFIRMADO)
ok_b = get_pdf(PENDENTE)

print("=== Smoke PDF UX (API) ===")
print("A confirmado:", ok_a)
print("B pendente:", {**ok_b, "json": ok_b.get("json")})

pass_a = ok_a.get("status") == 200 and ok_a.get("pdf")
pass_b = (
    ok_b.get("status") == 422
    and (ok_b.get("json") or {}).get("codigo") == "NCM_INVALIDO"
    and len((ok_b.get("json") or {}).get("itensInvalidos") or []) >= 1
)

print("PASS A (confirmado baixa):", pass_a)
print("PASS B (pendente 422 acionável):", pass_b)
print("RESULT:", "PASS" if pass_a and pass_b else "FAIL")
sys.exit(0 if pass_a and pass_b else 1)
