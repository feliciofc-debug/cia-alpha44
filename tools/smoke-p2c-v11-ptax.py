#!/usr/bin/env python3
"""Smoke P2c v1.1 — PTAX EUR→US$ na ingestão + aviso v1.1 + não-regressão USD."""
import io
import json
import os
import sys
import uuid
import urllib.error
import urllib.request
import zipfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.path.join(ROOT, "packages", "pipeline", "test", "fixtures", "packliste-DE-2026-0815.xlsx")
)
AVISO_V1 = "Valores da planilha em EUR tratados como US$ — conversão pendente"
AVISO_V11_MARK = "convertidos de EUR para US$"


def post_multipart(url: str, filename: str, data: bytes, timeout: int = 120) -> dict:
    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def post_binary(url: str, payload: dict, timeout: int = 120) -> bytes:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def xlsx_text(buf: bytes) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(io.BytesIO(buf)) as z:
        for name in z.namelist():
            if name.endswith(".xml") and ("worksheets/" in name or "sharedStrings" in name):
                parts.append(z.read(name).decode("utf-8", errors="replace"))
    return "\n".join(parts)


def stub_item() -> dict:
    return {
        "descOriginal": "DE-WZ-1001 Akku-Bohrschrauber",
        "descPt": "Furadeira sem fio",
        "descDuimp": "",
        "ncm": "84672100",
        "ncmCandidatos": [],
        "pesoBrutoKg": 290,
        "pesoLiqKg": 290,
        "qtd": 200,
        "fobUnitarioUS": 38.9,
        "fobTotalUS": 7780,
        "aliquotas": {"ii": 0.18, "ipi": 0.05, "pis": 0.021, "cofins": 0.0965, "icmsEntrada": 0},
        "aliquotasOverride": False,
        "anuencia": [],
        "antidumping": False,
        "ncmConfirmado": "84672100",
        "ncmConfirmadoPor": "smoke-p2c-v11",
        "ncmRevisadoHumano": True,
        "ncmRevisadoEm": "2026-06-13T00:00:00.000Z",
        "ncmValido": True,
        "compatibilidadeProduto": "compativel",
    }


def cotacao_base(itens: list, moeda_planilha: str | None, cambio_eur_usd=None) -> dict:
    c = {
        "cliente": "Smoke P2c v1.1",
        "benefFiscal": "ALAGOAS",
        "moeda": "US$",
        "moedaPlanilha": moeda_planilha,
        "cambio": 5.2,
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
    if cambio_eur_usd is not None:
        c["cambioEurUsd"] = cambio_eur_usd
        c["cambioEurUsdData"] = "2026-06-10"
        c["cambioEurUsdFonte"] = "PTAX-cross"
    return c


def main() -> int:
    if not os.path.isfile(XLSX):
        print(f"ERRO: fixture nao encontrada: {XLSX}")
        return 1

    base = API.rstrip("/")
    with open(XLSX, "rb") as f:
        raw = f.read()

    print(f"API: {base}")
    print(f"Fixture: {XLSX}\n")

    print("=== 1/5 PARSE EUR (ingestão + conversão) ===")
    try:
        parsed = post_multipart(f"{base}/api/parse", "packliste-DE-2026-0815.xlsx", raw)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    taxa = parsed.get("cambioEurUsd")
    avisos = parsed.get("avisos") or []
    linha1 = (parsed.get("linhas") or [{}])[0]
    fob1 = linha1.get("fobUnitarioUS") or linha1.get("fobTotalUS")
    eur_cru = 38.9

    ok_taxa = taxa is not None and 1.0 <= float(taxa) <= 1.3
    ok_aviso = any(AVISO_V11_MARK in str(a) for a in avisos) and not any(AVISO_V1 == str(a) for a in avisos)
    ok_fob = fob1 is not None and abs(float(fob1) - eur_cru) > 0.01
    if taxa and fob1:
        ok_fob = ok_fob and abs(float(fob1) - eur_cru * float(taxa)) < 0.5

    print(f"cambioEurUsd: {taxa} | plausível 1.0–1.3: {'OK' if ok_taxa else 'FALHA'}")
    print(f"FOB item1: {fob1} (EUR cru ~{eur_cru}) | convertido: {'OK' if ok_fob else 'FALHA'}")
    print(f"aviso v1.1: {'OK' if ok_aviso else 'FALHA'}")

    print("\n=== 2/5 CLASSIFICAR — meta cambio propagada ===")
    try:
        cls = post_json(
            f"{base}/api/classificar",
            {
                "linhas": parsed.get("linhas") or [],
                "moedaPlanilha": parsed.get("moedaPlanilha"),
                "cambioEurUsd": parsed.get("cambioEurUsd"),
                "cambioEurUsdData": parsed.get("cambioEurUsdData"),
                "cambioEurUsdFonte": parsed.get("cambioEurUsdFonte"),
            },
            timeout=300,
        )
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    ok_cls_meta = cls.get("cambioEurUsd") is not None and cls.get("cambioEurUsd") == taxa
    print(f"classificar cambioEurUsd: {cls.get('cambioEurUsd')} | {'OK' if ok_cls_meta else 'FALHA'}")

    print("\n=== 3/5 CALCULAR EUR — aviso v1.1 ===")
    itens = [stub_item()]
    cotacao = cotacao_base(itens, "EUR", taxa)
    try:
        calc = post_json(f"{base}/api/calcular", cotacao, timeout=120)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    avisos_fiscais = calc.get("avisosFiscais") or []
    ok_calc = any(AVISO_V11_MARK in str(a) for a in avisos_fiscais)
    print(f"avisosFiscais: {avisos_fiscais[:1]} | {'OK' if ok_calc else 'FALHA'}")

    print("\n=== 4/5 NÃO-REGRESSÃO USD (campos null) ===")
    cot_usd = cotacao_base([stub_item()], None)
    try:
        calc_usd = post_json(f"{base}/api/calcular", cot_usd, timeout=120)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    ok_usd = not calc_usd.get("avisosFiscais") or not any(AVISO_V11_MARK in str(a) for a in calc_usd.get("avisosFiscais") or [])
    print(f"sem aviso EUR: {'OK' if ok_usd else 'FALHA'}")

    print("\n=== 5/5 XLSX Cabecalho — taxa EUR→US$ ===")
    cotacao["avisosFiscais"] = avisos_fiscais
    cotacao["params"] = calc.get("params") or cotacao["params"]
    try:
        xlsx = post_binary(
            f"{base}/api/conciliacao/export?formato=xlsx",
            {
                "cotacao": cotacao,
                "itens": calc.get("itens") or itens,
                "resultado": calc.get("resultado"),
                "provider": "smoke-p2c-v11",
            },
            timeout=120,
        )
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    xml = xlsx_text(xlsx)
    ok_xlsx = "Taxa EUR" in xml or "EUR→US" in xml or "EUR" in xml
    ok_xlsx = ok_xlsx and AVISO_V11_MARK.split()[0] in xml or "convertidos" in xml
    print(f"XLSX cabecalho: {'OK' if ok_xlsx else 'FALHA'} ({len(xlsx)} bytes)")

    checks = {
        "parse_taxa": ok_taxa,
        "parse_fob": ok_fob,
        "parse_aviso_v11": ok_aviso,
        "classificar_meta": ok_cls_meta,
        "calcular_aviso": ok_calc,
        "usd_sem_regressao": ok_usd,
        "xlsx_taxa": ok_xlsx,
    }
    print("\n=== RESULTADO P2c v1.1 ===")
    for k, v in checks.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    ok = all(checks.values())
    print(f"\n{'ACEITO' if ok else 'REPROVADO'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
