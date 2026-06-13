#!/usr/bin/env python3
"""Smoke P2c: packliste-DE → aviso EUR na cotação, faixa no PDF trade, Cabecalho XLSX."""
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
AVISO = "Valores da planilha em EUR tratados como US$ — conversão pendente"


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
        "ncmConfirmadoPor": "smoke-p2c",
        "ncmRevisadoHumano": True,
        "ncmRevisadoEm": "2026-06-13T00:00:00.000Z",
        "ncmValido": True,
        "compatibilidadeProduto": "compativel",
    }


def cotacao_base(itens: list, moeda_planilha: str) -> dict:
    return {
        "cliente": "Smoke P2c EUR",
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


def pdf_contains_aviso(buf: bytes) -> bool:
    try:
        from pypdf import PdfReader  # type: ignore

        text = "".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(buf)).pages)
        return AVISO in text or "EUR tratados como US" in text
    except ImportError:
        raw = buf.decode("latin-1", errors="replace")
        return AVISO in raw or "EUR tratados como US" in raw


def main() -> int:
    if not os.path.isfile(XLSX):
        print(f"ERRO: fixture nao encontrada: {XLSX}")
        return 1

    base = API.rstrip("/")
    with open(XLSX, "rb") as f:
        raw = f.read()

    print(f"API: {base}")
    print(f"Fixture: {XLSX} ({len(raw)} bytes)\n")

    print("=== 1/4 PARSE (upload fresco) ===")
    try:
        parsed = post_multipart(f"{base}/api/parse", "packliste-DE-2026-0815.xlsx", raw)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    moeda = parsed.get("moedaPlanilha")
    avisos_parse = parsed.get("avisos") or []
    ok_parse = moeda == "EUR" and AVISO in avisos_parse
    print(f"moedaPlanilha: {moeda} | aviso parse: {'OK' if AVISO in avisos_parse else 'FALHA'}")

    print("\n=== 2/4 CALCULAR — aviso na cotação ===")
    itens = [stub_item()]
    cotacao = cotacao_base(itens, moeda or "EUR")
    try:
        calc = post_json(f"{base}/api/calcular", cotacao, timeout=120)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    avisos_fiscais = calc.get("avisosFiscais") or []
    ok_cotacao = AVISO in avisos_fiscais
    print(f"avisosFiscais: {avisos_fiscais}")
    print(f"Banner cotação (API): {'OK' if ok_cotacao else 'FALHA'}")

    resultado = calc.get("resultado")
    itens_calc = calc.get("itens") or itens
    cotacao["params"] = calc.get("params") or cotacao["params"]
    cotacao["avisosFiscais"] = avisos_fiscais

    print("\n=== 3/4 CONCILIAÇÃO XLSX — aba Cabecalho ===")
    try:
        xlsx = post_binary(
            f"{base}/api/conciliacao/export?formato=xlsx",
            {
                "cotacao": cotacao,
                "itens": itens_calc,
                "resultado": resultado,
                "provider": "smoke-p2c",
            },
            timeout=120,
        )
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    xml = xlsx_text(xlsx)
    ok_meta = (
        "Moeda planilha" in xml
        and "Moeda cotação" in xml
        and "Aviso moeda" in xml
        and "EUR" in xml
        and "conversão pendente" in xml
    )
    print(f"Cabecalho XLSX: {'OK' if ok_meta else 'FALHA'} ({len(xlsx)} bytes)")

    print("\n=== 4/4 PDF cliente — faixa aviso EUR ===")
    try:
        pdf = post_binary(
            f"{base}/api/cotacoes/preview-pdf?tipo=cliente",
            {
                "cotacao": cotacao,
                "itens": itens_calc,
                "resultado": resultado,
                "provider": "smoke-p2c",
            },
            timeout=120,
        )
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1

    ok_pdf = pdf_contains_aviso(pdf)
    print(f"PDF cliente aviso: {'OK' if ok_pdf else 'FALHA'} ({len(pdf)} bytes)")

    print("\n=== RESULTADO P2c SMOKE ===")
    checks = {
        "parse_EUR": ok_parse,
        "cotacao_aviso": ok_cotacao,
        "xlsx_cabecalho": ok_meta,
        "pdf_faixa": ok_pdf,
    }
    for k, v in checks.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    ok = all(checks.values())
    print(f"\n{'ACEITO' if ok else 'REPROVADO'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
