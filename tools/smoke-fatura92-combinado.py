#!/usr/bin/env python3
"""Smoke combinado fatura-92: FOB DI + NET/GROSS distintos + fonte linha."""
import json
import sys
import time
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = Path(__file__).resolve().parent
PAYLOAD = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "fatura-92-limpa-classificar.json"

with open(PAYLOAD, encoding="utf-8") as f:
    linhas = json.load(f)["linhas"]


def post(path: str, body: dict, timeout: int = 600) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


t0 = time.time()
cls = post("/api/classificar", {"linhas": linhas})
print(f"classificar: {time.time() - t0:.1f}s provider={cls.get('provider')}")

itens = cls["itens"]
cotacao = {
    "cliente": "Smoke fatura-92 C",
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
calc = post("/api/calcular", cotacao, timeout=120)
print(f"calcular: {time.time() - t1:.1f}s")

out = calc["itens"]
fob_di = sum(it.get("fobTotalUS") or 0 for it in out)
net = sum(it.get("pesoLiqKg") or 0 for it in out)
gross = sum(it.get("pesoBrutoKg") or 0 for it in out)
bruto_base = [it for it in out if it.get("fobKgBase") == "bruto"]
pendentes = [
    it for it in out if "ACC-ES" in (it.get("descOriginal") or "") and it.get("fobPendente")
]
pecas_linha = [
    it for it in out if "ACC-ES" in (it.get("descOriginal") or "") and it.get("fobKgFonte") == "linha"
]
partes_preco = [
    it
    for it in out
    if "ACC-ES" in (it.get("descOriginal") or "") and it.get("fobKgFonte") == "preco-custo"
]

print("\n=== SMOKE COMBINADO fatura-92-limpa ===")
print(f"FOB DI:        {fob_di:,.2f} US$  (meta ~77.391)")
print(f"NET WEIGHT:    {net:,.2f} kg     (meta ~14.213)")
print(f"GROSS WEIGHT:  {gross:,.2f} kg     (meta ~16.330)")
print(f"NET != GROSS:  diff {abs(net - gross):,.2f} kg")
print(f"fobKgBase=bruto: {len(bruto_base)} itens")
print(f"Partes pendentes: {len(pendentes)}")
print(f"Partes fonte=linha: {len(pecas_linha)}/11")
print(f"Partes preco-custo: {len(partes_preco)}")

ok_fob = 77300 <= fob_di <= 77500
ok_net = 14000 <= net <= 14500
ok_gross = 16000 <= gross <= 16500
ok_dist = abs(net - gross) > 1000
ok_pend = len(pendentes) == 0
ok_linha = len(pecas_linha) == 11
ok_preco = len(partes_preco) == 0

# T7 — rastro por tributo após classificar
com_rastro = [it for it in itens if it.get("aliquotasRastro", {}).get("ii", {}).get("fonte")]
pis_ok = all(
    "Gecex" not in (it.get("aliquotasRastro") or {}).get("pis", {}).get("fonte", "")
    and "TEC" not in (it.get("aliquotasRastro") or {}).get("pis", {}).get("fonte", "").upper()
    for it in itens
    if (it.get("aliquotasRastro") or {}).get("pis")
)
print(f"\nRastro T7: {len(com_rastro)}/{len(itens)} itens com fonteII")
if com_rastro:
    ex = com_rastro[0]["aliquotasRastro"]["ii"]
    print(f"  exemplo II: origem={ex.get('origem')} fonte={ex.get('fonte', '')[:60]}")
ok_rastro = len(com_rastro) >= max(1, len(itens) // 2) and pis_ok

print(
    f"\nRESULTADO: fob={'OK' if ok_fob else 'FAIL'} net={'OK' if ok_net else 'FAIL'} "
    f"gross={'OK' if ok_gross else 'FAIL'} dist={'OK' if ok_dist else 'FAIL'} "
    f"pend={'OK' if ok_pend else 'FAIL'} linha={'OK' if ok_linha else 'FAIL'} "
    f"rastro={'OK' if ok_rastro else 'FAIL'}"
)
ok = ok_fob and ok_net and ok_gross and ok_dist and ok_pend and ok_linha and ok_preco and ok_rastro
sys.exit(0 if ok else 1)
