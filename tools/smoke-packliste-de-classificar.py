#!/usr/bin/env python3
"""
Re-smoke P2a+P2b: parse + classificar packliste-DE (upload fresco).
Mede latência total dos 14 itens e compara capítulo vs gabarito.
"""
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.path.join(ROOT, "packages", "pipeline", "test", "fixtures", "packliste-DE-2026-0815.xlsx")
)
TIMEOUT_CLASSIFICAR = int(os.environ.get("SMOKE_CLASSIFICAR_TIMEOUT", "300"))

GABARITO = [
    {"sku": "DE-WZ-1001", "cap": "84", "pos": "8467", "nota": "Akku-Bohrschrauber"},
    {"sku": "DE-WZ-1002", "cap": "82", "pos": "8205", "nota": "Schraubendreher-Set"},
    {"sku": "DE-KU-2001", "cap": "96", "pos": "9617", "nota": "Thermoskanne"},
    {"sku": "DE-KU-2002", "cap": "73", "pos": "7323", "nota": "Kochtopf-Set"},
    {"sku": "DE-EL-3001", "cap": "85", "pos": "8518", "nota": "Bluetooth-Kopfhörer"},
    {"sku": "DE-EL-3002", "cap": "85", "pos": "8504", "nota": "USB-C Ladegerät"},
    {"sku": "DE-EL-3003", "cap": "94", "pos": "9405", "nota": "LED-Deckenleuchte"},
    {"sku": "DE-MB-4001", "cap": "94", "pos": "9401", "nota": "Bürostuhl"},
    {"sku": "DE-SP-5001", "cap": "87", "pos": "8711", "nota": "Elektroroller"},
    {"sku": "DE-SP-5002", "cap": "95", "pos": "9503", "nota": "Kinderroller"},
    {"sku": "DE-AT-6001", "cap": "87", "pos": "8714", "nota": "Stoßdämpfer Ersatzteil"},
    {"sku": "DE-AT-6002", "cap": "73", "pos": "7318", "nota": "Sechskantschrauben"},
    {"sku": "DE-TX-7001", "cap": "63", "pos": "6302", "nota": "Mikrofaser-Handtuch"},
    {"sku": "DE-TX-7002", "cap": "61", "pos": "6109", "nota": "Herren T-Shirt"},
]


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


def post_json(url: str, payload: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def main() -> int:
    if not os.path.isfile(XLSX):
        print(f"ERRO: fixture nao encontrada: {XLSX}")
        return 1

    with open(XLSX, "rb") as f:
        raw = f.read()

    base = API.rstrip("/")
    print(f"API: {base}")
    print(f"Fixture: {XLSX} ({len(raw)} bytes)\n")

    print("=== 1/2 PARSE ===")
    t0 = time.perf_counter()
    try:
        parsed = post_multipart(f"{base}/api/parse", "packliste-DE-2026-0815.xlsx", raw)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1
    t_parse = time.perf_counter() - t0

    linhas = parsed.get("linhas") or []
    print(f"Linhas: {len(linhas)} | parse: {t_parse:.1f}s")
    if len(linhas) != 14:
        print("FALHA: esperado 14 linhas")
        return 1

    print("\n=== 2/2 CLASSIFICAR (14 itens) ===")
    t1 = time.perf_counter()
    try:
        out = post_json(f"{base}/api/classificar", {"linhas": linhas}, TIMEOUT_CLASSIFICAR)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        return 1
    except TimeoutError:
        print(f"TIMEOUT após {TIMEOUT_CLASSIFICAR}s — nginx limite 300s")
        return 1
    t_class = time.perf_counter() - t1
    t_total = t_parse + t_class

    itens = out.get("itens") or []
    provider = out.get("provider", "?")
    print(f"Provider: {provider}")
    print(f"Latência classificar: {t_class:.1f}s | total parse+classificar: {t_total:.1f}s")
    if t_total > 150:
        print(f"AVISO: total > 150s — considerar batch/paralelismo na tradução (P3 cache)")
    if t_total > 300:
        print("FALHA: total > 300s (limite nginx)")
        return 1

    print("\n=== ITEM A ITEM vs GABARITO ===")
    acertos_cap = 0
    cavalos = 0
    checks = {"8711": False, "9503": False, "7318": False}

    for i, (g, it) in enumerate(zip(GABARITO, itens), start=1):
        ncm = (it.get("ncm") or "").strip()
        cap = ncm[:2] if len(ncm) >= 2 else "--"
        pos = ncm[:4] if len(ncm) >= 4 else "----"
        ok_cap = cap == g["cap"]
        if ok_cap:
            acertos_cap += 1
        if ncm == "01012100":
            cavalos += 1
        if g["pos"][:4] == "8711" and ncm.startswith("8711"):
            checks["8711"] = True
        if g["pos"][:4] == "9503" and ncm.startswith("9503"):
            checks["9503"] = True
        if g["pos"][:4] == "7318" and ncm.startswith("7318"):
            checks["7318"] = True

        fonte = it.get("ncmFonte", "?")
        conf = it.get("ncmConfianca")
        avisos = it.get("ncmAvisos") or []
        trad = any("tradução indisponível" in str(a).lower() for a in avisos)
        desc = (it.get("descOriginal") or "")[:55]
        flag = "OK" if ok_cap else "FAIL"
        print(
            f"{i:2d} [{flag}] cap={cap} pos={pos} ncm={ncm or '(pendente)':8s} "
            f"esp={g['cap']} | {g['nota'][:28]:28s} | fonte={fonte} conf={conf}"
        )
        if trad:
            print("     ↳ aviso tradução indisponível")

    print(f"\nAcertos capítulo: {acertos_cap}/14 (mínimo 12)")
    print(f"Cavalos 01012100: {cavalos} (esperado 0)")
    print(f"Elektroroller 8711: {'OK' if checks['8711'] else 'FALHA'}")
    print(f"Kinderroller 9503: {'OK' if checks['9503'] else 'FALHA'}")
    print(f"Parafuso 7318: {'OK' if checks['7318'] else 'FALHA'}")

    ok = (
        acertos_cap >= 12
        and cavalos == 0
        and checks["8711"]
        and checks["9503"]
        and checks["7318"]
        and t_total <= 300
    )
    print(f"\nRESULTADO: {'PASS' if ok else 'FAIL'} | tempo total {t_total:.1f}s")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
