#!/usr/bin/env python3
"""Smoke export conciliacao T7 — fonteII/fonteIPI preenchidos após classificar."""
import json
import sys
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = Path(__file__).resolve().parent
PAYLOAD = ROOT / "fatura-92-limpa-classificar.json"

with open(PAYLOAD, encoding="utf-8") as f:
    linhas = json.load(f)["linhas"]


def post_json(path: str, body: dict, timeout: int = 600) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post_csv(path: str, body: dict, timeout: int = 120) -> str:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8-sig")


cls = post_json("/api/classificar", {"linhas": linhas})
itens = cls["itens"]
r0 = (itens[0].get("aliquotasRastro") or {}).get("ii") or {}
if not r0.get("fonte"):
    print("FAIL: item sem aliquotasRastro.ii.fonte")
    sys.exit(1)
print(f"Rastro API: origem={r0.get('origem')} fonte={r0.get('fonte', '')[:60]}")

cotacao = {
    "cliente": "Smoke export T7",
    "benefFiscal": "ALAGOAS",
    "moeda": "US$",
    "cambio": 5.02,
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

csv = post_csv(
    "/api/conciliacao/export?formato=csv",
    {"cotacao": cotacao, "itens": itens, "resultado": None, "provider": cls.get("provider")},
)
lines = [l for l in csv.split("\n") if l.strip()]
header = lines[0]
for col in ("Fonte II", "Fonte IPI", "Fonte PIS", "Fonte COFINS"):
    if col not in header:
        print(f"FAIL: coluna ausente: {col}")
        sys.exit(1)

data = lines[1]
if data.startswith("TOTAIS"):
    print("FAIL: sem linha de dados")
    sys.exit(1)

cells = data.split(";")
ii_fonte = cells[15].strip('"')
ipi_fonte = cells[16].strip('"')
pis_fonte = cells[17].strip('"')

ok_ii = bool(ii_fonte) and ii_fonte != "legado" and ("Gecex" in ii_fonte or "Res." in ii_fonte)
ok_ipi = bool(ipi_fonte) and ipi_fonte != "legado"
ok_pis = "Lei 10.865" in pis_fonte or "Lei" in pis_fonte

print(f"fonteII:  {ii_fonte[:70]}")
print(f"fonteIPI: {ipi_fonte[:70]}")
print(f"fontePIS: {pis_fonte[:70]}")
print(f"RESULTADO: ii={'OK' if ok_ii else 'FAIL'} ipi={'OK' if ok_ipi else 'FAIL'} pis={'OK' if ok_pis else 'FAIL'}")
sys.exit(0 if ok_ii and ok_ipi and ok_pis else 1)
