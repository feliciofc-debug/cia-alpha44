#!/usr/bin/env python3
import json
import sys
import urllib.request

API = "https://api2.amzofertas.com.br/cia"
PARTIAL = sys.argv[1] if len(sys.argv) > 1 else "cmqawtqj"
if len(sys.argv) > 2:
    API = sys.argv[1]
    PARTIAL = sys.argv[2]


def get(path):
    with urllib.request.urlopen(f"{API.rstrip('/')}{path}", timeout=60) as r:
        return json.load(r)


lista = get("/api/cotacoes")
if isinstance(lista, dict):
    lista = lista.get("cotacoes") or lista.get("items") or [lista]
matches = [c for c in lista if PARTIAL in str(c.get("id", ""))]
print("matches:", [(c["id"], c.get("cliente")) for c in matches[:5]])
if not matches:
    sys.exit(1)

cid = matches[0]["id"]
det = get(f"/api/cotacoes/{cid}")
itens = det.get("itens") or []
print(f"\n{id} -> {cid} cliente={(det.get('cotacao') or {}).get('cliente')} itens={len(itens)}")


def pode_confirmar(it):
    if it.get("compatibilidadeProduto") == "incompativel":
        return False
    if it.get("ncmRevisadoHumano") and it.get("ncmConfirmado"):
        ncm = "".join(c for c in (it.get("ncm") or "") if c.isdigit()).zfill(8)[:8]
        conf = "".join(c for c in (it.get("ncmConfirmado") or "") if c.isdigit()).zfill(8)[:8]
        if ncm == conf:
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


for i, it in enumerate(itens):
    print(
        f"  [{i}] revisar={it.get('compatibilidadeProduto')} "
        f"ncmValido={it.get('ncmValido')} ncm={it.get('ncm')} "
        f"pode={pode_confirmar(it)} confirmado={it.get('ncmRevisadoHumano')}"
    )
