#!/usr/bin/env python3
"""Smoke: confirmar NCM em item revisar da fatura-92 (produção)."""
import json
import sys
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
COTACAO_ID = sys.argv[2] if len(sys.argv) > 2 else "cmqa4ipy00001kwctpcstzg5w"


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{API.rstrip('/')}{path}", timeout=60) as r:
        return json.load(r)


def post(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body or {}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def item_pode_confirmar(it: dict) -> bool:
    if it.get("compatibilidadeProduto") == "incompativel":
        return False
    if it.get("ncmRevisadoHumano") and it.get("ncmConfirmado") == (it.get("ncm") or "").replace(" ", ""):
        return False
    ncm = "".join(c for c in (it.get("ncm") or "") if c.isdigit()).zfill(8)[:8]
    if not ncm or ncm == "00000000":
        return False
    if it.get("compatibilidadeProduto") == "revisar":
        return True
    if it.get("ncmValido") is False:
        return True
    if it.get("ncmFonte") == "pendente":
        return True
    conf = it.get("ncmConfianca")
    if conf is not None and conf < 0.85:
        return True
    return False


det = get(f"/api/cotacoes/{COTACAO_ID}")
cliente = (det.get("cotacao") or {}).get("cliente", "?")
itens = det.get("itens") or []
print(f"Cotação {COTACAO_ID} — {cliente} — {len(itens)} itens")

revisar = [i for i, it in enumerate(itens) if it.get("compatibilidadeProduto") == "revisar"]
pendentes = [i for i, it in enumerate(itens) if item_pode_confirmar(it)]
print(f"  revisar compatibilidade: {len(revisar)}")
print(f"  elegíveis Confirmar NCM: {len(pendentes)}")

if not pendentes:
    print("Nenhum item pendente — smoke SKIP (já confirmados?)")
    confirmados = [i for i, it in enumerate(itens) if it.get("ncmConfirmadoPor")]
    if confirmados:
        it = itens[confirmados[0]]
        print(
            f"  exemplo confirmado ordem={confirmados[0]} por={it.get('ncmConfirmadoPor')} "
            f"em={str(it.get('ncmRevisadoEm', ''))[:19]}"
        )
    sys.exit(0)

idx = pendentes[0]
it = itens[idx]
desc = (it.get("descPt") or it.get("descOriginal") or "")[:60]
print(f"\nPOST confirmar-ncm ordem={idx} ncm={it.get('ncm')} — {desc}")
out = post(f"/api/cotacoes/{COTACAO_ID}/itens/{idx}/confirmar-ncm", {"confirmadoPor": "smoke-ui-test"})
conf = out["itens"][idx]
ok = conf.get("ncmRevisadoHumano") and conf.get("ncmConfirmadoPor") == "smoke-ui-test"
print(f"  ncmRevisadoHumano={conf.get('ncmRevisadoHumano')}")
print(f"  ncmConfirmadoPor={conf.get('ncmConfirmadoPor')}")
print(f"  ncmRevisadoEm={str(conf.get('ncmRevisadoEm', ''))[:19]}")
print(f"  badge UI esperado: ✓ NCM confirmado · smoke-ui-test")
print(f"\nRESULTADO: {'OK' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
