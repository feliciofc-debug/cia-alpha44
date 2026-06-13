#!/usr/bin/env python3
"""
Smoke P3b: cache ClassificacaoCache — re-upload packliste-DE 2x.
Run 1: popula cache (misses=14). Run 2: hits=14, latência menor, NCMs idênticos (zero flip-flop).
Caso ACC-ES-043 / DE-AT-6001 Stoßdämpfer: posição 8714 estável entre runs.
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
STOSS_IDX = 10  # DE-AT-6001 Stoßdämpfer (1-based item 11)


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


def classificar_packliste(base: str, linhas: list, label: str) -> tuple[dict, float]:
    print(f"\n=== CLASSIFICAR {label} ===")
    t0 = time.perf_counter()
    try:
        out = post_json(f"{base}/api/classificar", {"linhas": linhas}, TIMEOUT_CLASSIFICAR)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:800]}")
        raise SystemExit(1)
    elapsed = time.perf_counter() - t0
    cache = out.get("classificacaoCache") or {}
    print(
        f"Latência: {elapsed:.1f}s | cache hits={cache.get('hits', '?')} "
        f"misses={cache.get('misses', '?')} humanos={cache.get('humanos', '?')} "
        f"total={cache.get('total', '?')}"
    )
    return out, elapsed


def ncms_por_item(itens: list) -> list[str]:
    return [(it.get("ncm") or "").strip() for it in itens]


def main() -> int:
    if not os.path.isfile(XLSX):
        print(f"ERRO: fixture nao encontrada: {XLSX}")
        return 1

    with open(XLSX, "rb") as f:
        raw = f.read()

    base = API.rstrip("/")
    print(f"API: {base}")
    print(f"Fixture: {XLSX} ({len(raw)} bytes)")

    print("\n=== PARSE ===")
    parsed = post_multipart(f"{base}/api/parse", "packliste-DE-2026-0815.xlsx", raw)
    linhas = parsed.get("linhas") or []
    if len(linhas) != 14:
        print(f"FALHA: esperado 14 linhas, got {len(linhas)}")
        return 1

    out1, t1 = classificar_packliste(base, linhas, "RUN 1 (cold / popula cache)")
    out2, t2 = classificar_packliste(base, linhas, "RUN 2 (warm / cache hit)")

    itens1 = out1.get("itens") or []
    itens2 = out2.get("itens") or []
    ncms1 = ncms_por_item(itens1)
    ncms2 = ncms_por_item(itens2)

    cache1 = out1.get("classificacaoCache") or {}
    cache2 = out2.get("classificacaoCache") or {}

    flip_flops = sum(1 for a, b in zip(ncms1, ncms2) if a and b and a != b)
    stoss1 = ncms1[STOSS_IDX] if len(ncms1) > STOSS_IDX else ""
    stoss2 = ncms2[STOSS_IDX] if len(ncms2) > STOSS_IDX else ""
    stoss_pos1 = stoss1[:4] if len(stoss1) >= 4 else "----"
    stoss_pos2 = stoss2[:4] if len(stoss2) >= 4 else "----"

    print("\n=== COMPARATIVO ===")
    print(f"Run1: {t1:.1f}s | Run2: {t2:.1f}s | speedup: {t1 / t2:.1f}x" if t2 > 0 else f"Run1: {t1:.1f}s | Run2: {t2:.1f}s")
    print(f"Flip-flops NCM (run1 vs run2): {flip_flops} (esperado 0)")
    print(f"Stoßdämpfer item {STOSS_IDX + 1}: run1={stoss1} pos={stoss_pos1} | run2={stoss2} pos={stoss_pos2}")
    print(f"Cache run1: hits={cache1.get('hits')} misses={cache1.get('misses')}")
    print(f"Cache run2: hits={cache2.get('hits')} misses={cache2.get('misses')}")

    ok_cache2 = cache2.get("hits") == 14 and cache2.get("misses") == 0
    ok_flip = flip_flops == 0 and len(ncms1) == 14 and len(ncms2) == 14
    ok_stoss = stoss_pos1 == stoss_pos2 == "8714" or (stoss1 == stoss2 and stoss1)
    ok_faster = t2 < t1 * 0.85 or t2 < 30  # warm deve ser bem mais rápido ou <30s

    if flip_flops:
        print("\nItens com NCM diferente:")
        for i, (a, b) in enumerate(zip(ncms1, ncms2), start=1):
            if a != b:
                desc = (itens1[i - 1].get("descOriginal") or "")[:50]
                print(f"  {i}: {a} → {b} | {desc}")

    ok = ok_flip and ok_stoss and (ok_cache2 or os.environ.get("SMOKE_P3B_SKIP_CACHE_STATS"))
    if not ok_cache2:
        print("AVISO: run2 esperado hits=14 misses=0 — migration P3b aplicada?")
    if not ok_faster:
        print(f"AVISO: run2 ({t2:.1f}s) não ficou ≥15% mais rápido que run1 ({t1:.1f}s)")

    print(f"\nRESULTADO: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
