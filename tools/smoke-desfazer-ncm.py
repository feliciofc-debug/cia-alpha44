#!/usr/bin/env python3
"""Desfaz confirmação NCM de teste (smoke) em cotação salva."""
import json
import sys
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
COTACAO_ID = sys.argv[2] if len(sys.argv) > 2 else "cmqa4ipy00001kwctpcstzg5w"
ORDEM = int(sys.argv[3]) if len(sys.argv) > 3 else 0


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{API.rstrip('/')}{path}", timeout=60) as r:
        return json.load(r)


def post(path: str) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=b"{}",
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


before = get(f"/api/cotacoes/{COTACAO_ID}")
it = before["itens"][ORDEM]
print(f"Antes ordem={ORDEM}: revisado={it.get('ncmRevisadoHumano')} por={it.get('ncmConfirmadoPor')}")

out = post(f"/api/cotacoes/{COTACAO_ID}/itens/{ORDEM}/desfazer-ncm")
after = out["itens"][ORDEM]
ok = not after.get("ncmRevisadoHumano") and not after.get("ncmConfirmadoPor")
print(f"Depois: revisado={after.get('ncmRevisadoHumano')} por={after.get('ncmConfirmadoPor')}")
print(f"compatibilidade={after.get('compatibilidadeProduto')} — botao Confirmar NCM deve voltar")
print(f"RESULTADO: {'OK' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
