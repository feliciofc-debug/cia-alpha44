#!/usr/bin/env python3
"""Smoke P2.3: cotação AL→SP nova → ICMS 4% + fundamentoSaida no payload."""
import json
import sys
import urllib.error
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"


def post(path: str, body: dict, timeout: int = 120) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


cotacao = {
    "cliente": "Smoke P2.3 ICMS",
    "benefFiscal": "ALAGOAS",
    "moeda": "US$",
    "cambio": 5.2051,
    "freteTotalUS": 3500,
    "siscomex": 154.23,
    "origem": "AL",
    "destino": "SP",
    "ufEmpresa": "AL",
    "regimeIcms": "AL_DIFERIDO",
    "icmsSaidaManualFlag": False,
    "avisosFiscais": [],
    "itens": [
        {
            "descOriginal": "Ferramenta smoke",
            "ncm": "82042000",
            "pesoLiqKg": 100,
            "fobTotalUS": 2027.2,
            "aliquotas": {
                "ii": 0.162,
                "ipi": 0.052,
                "pis": 0.021,
                "cofins": 0.0965,
                "icmsEntrada": 0,
            },
        }
    ],
    "despesas": [],
    "params": {
        "markupPct": 0.04,
        "pisSaida": 0.0165,
        "cofinsSaida": 0.076,
        "icmsSaida": 0.18,
        "csllSobreMarkup": 0.09,
        "irrfAliq": 0.25,
        "irrfBaseNotaPct": 0.027,
        "ipiTetoAliqMedia": 0.15,
        "icmsEntrada": 0,
    },
}

try:
    out = post("/api/calcular", cotacao)
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    print(f"FAIL HTTP {e.code}: {body[:500]}")
    sys.exit(1)

icms = out.get("icms") or {}
params = out.get("params") or {}
fundamento = icms.get("fundamentoSaida") or ""
icms_ef = icms.get("icmsSaidaEfetivo")
icms_param = params.get("icmsSaida")

ok = (
    abs((icms_ef or 0) - 0.04) < 1e-6
    and abs((icms_param or 0) - 0.04) < 1e-6
    and bool(fundamento)
    and icms.get("icmsSaidaManualFlag") is False
)

print(f"icmsSaidaEfetivo={icms_ef}")
print(f"params.icmsSaida={icms_param}")
print(f"fundamentoSaida={fundamento!r}")
print(f"operacaoInterestadual={icms.get('operacaoInterestadual')}")
print("PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
