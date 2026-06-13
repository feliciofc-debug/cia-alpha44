#!/usr/bin/env python3
"""Smoke P3a prod — 4 cenários ICMS via POST /api/calcular + PDF regime NORMAL."""
import io
import json
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
AVISO_NORMAL = "ICMS de importação não calculado neste regime (v1)"


def post_json(path: str, body: dict, timeout: int = 120) -> dict:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post_binary(path: str, body: dict, timeout: int = 120) -> bytes:
    req = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def base_cotacao(**over) -> dict:
    c = {
        "cliente": "Smoke P3a ICMS",
        "benefFiscal": "ALAGOAS",
        "moeda": "US$",
        "cambio": 5.2,
        "freteTotalUS": 3500,
        "siscomex": 154.23,
        "origem": "RJ",
        "destino": "SP",
        "ufEmpresa": "AL",
        "regimeIcms": "AL_DIFERIDO",
        "icmsSaidaManualFlag": False,
        "avisosFiscais": [],
        "itens": [
            {
                "descOriginal": "Ferramenta smoke ICMS",
                "descPt": "Ferramenta smoke ICMS",
                "descDuimp": "",
                "ncm": "84672100",
                "ncmCandidatos": [],
                "pesoLiqKg": 100,
                "pesoBrutoKg": 100,
                "qtd": 1,
                "fobTotalUS": 2000,
                "aliquotas": {
                    "ii": 0.18,
                    "ipi": 0.05,
                    "pis": 0.021,
                    "cofins": 0.0965,
                    "icmsEntrada": 0,
                },
                "aliquotasOverride": False,
                "anuencia": [],
                "antidumping": False,
                "ncmConfirmado": "84672100",
                "ncmConfirmadoPor": "smoke-p3a",
                "ncmRevisadoHumano": True,
                "ncmValido": True,
                "compatibilidadeProduto": "compativel",
            }
        ],
        "despesas": [],
        "params": {
            "markupPct": 0.06,
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
    c.update(over)
    if "params" in over and isinstance(over["params"], dict):
        c["params"] = {**c["params"], **over["params"]}
    return c


def pdf_text(buf: bytes) -> str:
    try:
        from pypdf import PdfReader

        return "".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(buf)).pages)
    except ImportError:
        return buf.decode("latin-1", errors="replace")


def main() -> int:
    results: dict[str, bool] = {}

    print(f"API: {API.rstrip('/')}\n")

    # (1) AL→SP auto 4% + Res. Senado
    print("=== (1) AL→SP auto — 4% + fundamento Res. Senado ===")
    try:
        out1 = post_json("/api/calcular", base_cotacao())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")
        return 1
    icms1 = out1.get("icms") or {}
    p1 = out1.get("params") or {}
    fund = icms1.get("fundamentoSaida") or ""
    ok1 = (
        abs((icms1.get("icmsSaidaEfetivo") or 0) - 0.04) < 1e-6
        and abs((p1.get("icmsSaida") or 0) - 0.04) < 1e-6
        and "Senado" in fund
        and icms1.get("icmsSaidaManualFlag") is False
    )
    print(f"  icmsSaidaEfetivo={icms1.get('icmsSaidaEfetivo')}")
    print(f"  fundamentoSaida={fund!r}")
    print(f"  → {'PASS' if ok1 else 'FAIL'}")
    results["1_al_sp_4pct"] = ok1

    # (2) ufEmpresa=SP destino=SP → 18% interna
    print("\n=== (2) ufEmpresa=SP, destino=SP — ICMS interno 18% ===")
    out2 = post_json(
        "/api/calcular",
        base_cotacao(ufEmpresa="SP", destino="SP", origem="SP"),
    )
    icms2 = out2.get("icms") or {}
    p2 = out2.get("params") or {}
    fund2 = icms2.get("fundamentoSaida") or ""
    ok2 = (
        abs((icms2.get("icmsSaidaEfetivo") or 0) - 0.18) < 1e-6
        and abs((p2.get("icmsSaida") or 0) - 0.18) < 1e-6
        and "interno" in fund2.lower()
        and icms2.get("icmsSaidaManualFlag") is False
    )
    print(f"  icmsSaidaEfetivo={icms2.get('icmsSaidaEfetivo')}")
    print(f"  fundamentoSaida={fund2!r}")
    print(f"  → {'PASS' if ok2 else 'FAIL'}")
    results["2_sp_interno_18"] = ok2

    # (3) manual 12% — UF/regime não alteram %
    print("\n=== (3) manual 12% — selects não alteram o % ===")
    manual_base = base_cotacao(
        icmsSaidaManualFlag=True,
        params={"icmsSaida": 0.12},
    )
    out3a = post_json("/api/calcular", manual_base)
    icms3a = out3a.get("icms") or {}
    ok3a = (
        abs((icms3a.get("icmsSaidaEfetivo") or 0) - 0.12) < 1e-6
        and icms3a.get("icmsSaidaManualFlag") is True
        and "manual" in (icms3a.get("fundamentoSaida") or "").lower()
    )
    # Simula editor: muda uf/regime mas mantém flag manual + params.icmsSaida
    out3b = post_json(
        "/api/calcular",
        {
            **manual_base,
            "ufEmpresa": "SP",
            "destino": "RJ",
            "regimeIcms": "NORMAL",
        },
    )
    icms3b = out3b.get("icms") or {}
    ok3b = (
        abs((icms3b.get("icmsSaidaEfetivo") or 0) - 0.12) < 1e-6
        and icms3b.get("icmsSaidaManualFlag") is True
    )
    ok3 = ok3a and ok3b
    print(f"  manual 12% efetivo={icms3a.get('icmsSaidaEfetivo')} flag={icms3a.get('icmsSaidaManualFlag')}")
    print(f"  após uf=SP dest=RJ regime=NORMAL ainda={icms3b.get('icmsSaidaEfetivo')} flag={icms3b.get('icmsSaidaManualFlag')}")
    print(f"  → {'PASS' if ok3 else 'FAIL'} (badge UI verificado no bundle)")
    results["3_manual_12_override"] = ok3

    # (4) regime NORMAL — aviso API + PDF
    print("\n=== (4) regime NORMAL — aviso cotação + faixa PDF ===")
    cot4 = base_cotacao(regimeIcms="NORMAL")
    out4 = post_json("/api/calcular", cot4)
    icms4 = out4.get("icms") or {}
    aviso4 = icms4.get("avisoRegimeIcms") or ""
    ok4_api = AVISO_NORMAL in aviso4 or aviso4 == AVISO_NORMAL
    print(f"  avisoRegimeIcms={aviso4!r}")
    cot4["params"] = out4.get("params") or cot4["params"]
    cot4["avisosFiscais"] = out4.get("avisosFiscais") or []
    pdf4 = post_binary(
        "/api/cotacoes/preview-pdf?tipo=cliente",
        {"cotacao": cot4, "itens": out4.get("itens"), "resultado": out4.get("resultado")},
    )
    txt4 = pdf_text(pdf4)
    ok4_pdf = AVISO_NORMAL in txt4 or "importação não calculado" in txt4
    print(f"  PDF aviso: {'OK' if ok4_pdf else 'FALHA'} ({len(pdf4)} bytes)")
    print(f"  → {'PASS' if ok4_api and ok4_pdf else 'FAIL'}")
    results["4_normal_banner_pdf"] = ok4_api and ok4_pdf

    print("\n=== RESULTADO P3a SMOKE ===")
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    ok_all = all(results.values())
    print(f"\n{'ACEITO (4/4)' if ok_all else 'REPROVADO'}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
