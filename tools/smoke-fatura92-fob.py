#!/usr/bin/env python3
"""Smoke: POST fatura-92-limpa → FOB DI ~77.417, nenhuma peça com preco-custo."""
import json
import sys
import time
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3333"
PAYLOAD = sys.argv[2] if len(sys.argv) > 2 else "/tmp/fatura-92-limpa-classificar.json"

with open(PAYLOAD, encoding="utf-8") as f:
    linhas = json.load(f)["linhas"]

t0 = time.time()
req = urllib.request.Request(
    f"{API.rstrip('/')}/api/classificar",
    data=json.dumps({"linhas": linhas}).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=600) as r:
    cls = json.load(r)
print(f"classificar: {time.time() - t0:.1f}s provider={cls.get('provider')}")

itens = cls["itens"]
cotacao = {
    "cliente": "Smoke fatura-92",
    "benefFiscal": "ALAGOAS",
    "moeda": "US$",
    "cambio": 5.0211,
    "freteTotalUS": 5500,
    "adicionaisVaUS": 0,
    "reducaoBaseUS": 0,
    "siscomex": 154.23,
    "antidumpingBRL": 0,
    "incoterm": "CFR",
    "origem": "RJ",
    "destino": "SP",
    "itens": itens,
    "despesas": [],
    "params": {
        "markupPct": 0.06,
        "pisSaida": 0.0165,
        "cofinsSaida": 0.076,
        "icmsSaida": 0.04,
        "csllSobreMarkup": 0.09,
        "irrfAliq": 0.25,
        "irrfBaseNotaPct": 0.027,
        "ipiTetoAliqMedia": 0.15,
        "icmsEntrada": 0,
    },
}
t1 = time.time()
req2 = urllib.request.Request(
    f"{API.rstrip('/')}/api/calcular",
    data=json.dumps(cotacao).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req2, timeout=120) as r:
    calc = json.load(r)
print(f"calcular: {time.time() - t1:.1f}s")

itens_out = calc["itens"]
fob_di = sum(it.get("fobTotalUS") or 0 for it in itens_out)
partes_preco = [
    it
    for it in itens_out
    if "ACC-ES" in (it.get("descOriginal") or "")
    and it.get("fobKgFonte") == "preco-custo"
]

print("\n=== SMOKE FOB DI (fatura-92-limpa) ===")
print(f"FOB DI total US$: {fob_di:,.2f}")
print("Meta: ~77.417 (710 × 109 + peças centavos)")
print(f"Partes com fonte preco-custo: {len(partes_preco)}")
for p in partes_preco:
    desc = (p.get("descOriginal") or "")[:45]
    print(f"  FAIL: {desc} fob={p.get('fobTotalUS')} fonte={p.get('fobKgFonte')}")

for it in itens_out:
    if (it.get("descOriginal") or "").startswith("ES-T19"):
        print(
            f"  patinete: fob={it.get('fobTotalUS')} fonte={it.get('fobKgFonte')} "
            f"unit={it.get('fobUnitarioUS')}"
        )

for it in itens_out:
    if "ACC-ES" in (it.get("descOriginal") or ""):
        desc = (it.get("descOriginal") or "")[:38]
        print(
            f"  parte: {desc:38} fob={it.get('fobTotalUS')} fonte={it.get('fobKgFonte')}"
        )

ok_fob = 77300 <= fob_di <= 77500
ok_partes = len(partes_preco) == 0
pendentes = [it for it in itens_out if "ACC-ES" in (it.get("descOriginal") or "") and it.get("fobPendente")]
ok_linha = all(
    it.get("fobKgFonte") == "linha"
    for it in itens_out
    if "ACC-ES" in (it.get("descOriginal") or "")
)
print(f"Partes FOB pendente: {len(pendentes)}")
print(f"Partes fonte linha: {sum(1 for it in itens_out if 'ACC-ES' in (it.get('descOriginal') or '') and it.get('fobKgFonte') == 'linha')}/11")
print(f"\nRESULTADO: fob_di={'OK' if ok_fob else 'FAIL'} partes_preco={'OK' if ok_partes else 'FAIL'} pendentes={'OK' if not pendentes else 'FAIL'} fonte_linha={'OK' if ok_linha else 'FAIL'}")
sys.exit(0 if ok_fob and ok_partes and not pendentes and ok_linha else 1)
