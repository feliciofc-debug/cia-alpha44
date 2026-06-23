#!/usr/bin/env python3
"""Diagnóstico A/B PDF — cotação confirmada vs pendente (Network capture)."""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = sys.argv[1] if len(sys.argv) > 1 else "https://api2.amzofertas.com.br/cia"
ROOT = Path(__file__).resolve().parent


def req(method: str, path: str, body: dict | None = None, timeout: int = 120):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"} if body is not None else {}
    r = urllib.request.Request(
        f"{API.rstrip('/')}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            raw = res.read()
            elapsed = time.time() - t0
            return {
                "url": f"{API.rstrip('/')}{path}",
                "status": res.status,
                "headers": dict(res.headers),
                "body": raw,
                "elapsed_s": round(elapsed, 2),
                "error": None,
            }
    except urllib.error.HTTPError as e:
        raw = e.read()
        elapsed = time.time() - t0
        return {
            "url": f"{API.rstrip('/')}{path}",
            "status": e.code,
            "headers": dict(e.headers),
            "body": raw,
            "elapsed_s": round(elapsed, 2),
            "error": None,
        }
    except Exception as e:
        return {
            "url": f"{API.rstrip('/')}{path}",
            "status": None,
            "headers": {},
            "body": b"",
            "elapsed_s": round(time.time() - t0, 2),
            "error": str(e),
        }


def summarize_pdf(label: str, out: dict) -> dict:
    ct = out["headers"].get("Content-type") or out["headers"].get("Content-Type") or ""
    body = out["body"]
    summary = {
        "label": label,
        "url": out["url"],
        "status": out["status"],
        "content_type": ct,
        "bytes": len(body),
        "elapsed_s": out["elapsed_s"],
        "error": out["error"],
    }
    if out["status"] == 200 and body[:4] == b"%PDF":
        summary["pdf_magic"] = True
    elif body:
        try:
            summary["json_body"] = json.loads(body.decode("utf-8"))
        except Exception:
            summary["text_body"] = body[:500].decode("utf-8", errors="replace")
    return summary


def ncm_stats(itens: list) -> dict:
    pend = sum(1 for it in itens if it.get("ncmFonte") == "pendente" or it.get("ncmValido") is False)
    revisar = sum(1 for it in itens if it.get("compatibilidadeProduto") == "revisar")
    confirm = sum(1 for it in itens if it.get("ncmConfirmadoPor"))
    invalid = sum(1 for it in itens if (it.get("ncm") or "") in ("01012100", "00000000", ""))
    return {
        "total": len(itens),
        "pendente_fonte": pend,
        "revisar_compat": revisar,
        "confirmados": confirm,
        "ncm_suspeitos": invalid,
    }


def find_cotacao_ids() -> list[tuple[str, str]]:
    lista = req("GET", "/api/cotacoes?limite=100")
    if lista["status"] != 200:
        return []
    rows = json.loads(lista["body"].decode()).get("cotacoes") or []
    hits = []
    for r in rows:
        c = (r.get("cliente") or "").lower()
        if any(k in c for k in ("fatura", "92", "0815", "packliste", "de-2026", "alem", "german")):
            hits.append((r["id"], r.get("cliente", "")))
    return hits


def create_minimal_confirmed() -> str | None:
    """Cria cotação mínima 1 item NCM válido + confirmado, retorna id."""
    linha = {
        "descOriginal": "Parafuso aço M6 smoke PDF",
        "ncm": "73181500",
        "qtd": 100,
        "pesoLiqKg": 50,
        "fobTotalUS": 500,
    }
    cls = req("POST", "/api/classificar", {"linhas": [linha]}, timeout=180)
    if cls["status"] != 200:
        print("classificar FAIL", cls["status"], cls["body"][:200])
        return None
    itens = json.loads(cls["body"].decode()).get("itens") or []
    if not itens:
        return None
    cotacao = {
        "cliente": "Smoke PDF A/B confirmado",
        "benefFiscal": "ALAGOAS",
        "moeda": "US$",
        "cambio": 5.2,
        "freteTotalUS": 100,
        "siscomex": 154.23,
        "origem": "AL",
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
    calc = req("POST", "/api/calcular", cotacao, timeout=120)
    if calc["status"] != 200:
        print("calcular FAIL", calc["status"])
        return None
    calc_j = json.loads(calc["body"].decode())
    salvar = req(
        "POST",
        "/api/cotacoes",
        {
            "cotacao": cotacao,
            "itens": calc_j["itens"],
            "resultado": calc_j["resultado"],
            "provider": json.loads(cls["body"].decode()).get("provider"),
        },
        timeout=60,
    )
    if salvar["status"] != 200:
        print("salvar FAIL", salvar["status"], salvar["body"][:300])
        return None
    saved = json.loads(salvar["body"].decode())
    cid = saved.get("id")
    if not cid:
        return None
    conf = req("POST", f"/api/cotacoes/{cid}/itens/0/confirmar-ncm", {"confirmadoPor": "diag-pdf-ab"})
    if conf["status"] != 200:
        print("confirmar-ncm FAIL", conf["status"], conf["body"][:300])
    return cid


def main():
    extra_ids = sys.argv[2:] if len(sys.argv) > 2 else []
    reports = []

    print("=== LISTAGEM cotações relevantes ===")
    for cid, cliente in find_cotacao_ids():
        print(f"  {cid} — {cliente}")

    print("\n=== CRIAR cotação mínima 100% confirmada ===")
    smoke_id = create_minimal_confirmed()
    if smoke_id:
        print(f"  criada: {smoke_id}")
    else:
        print("  FALHA ao criar — tentará só IDs existentes")

    ids_to_test: list[tuple[str, str]] = []
    if smoke_id:
        ids_to_test.append((smoke_id, "A — smoke confirmado (controle)"))
    for cid, cliente in find_cotacao_ids():
        ids_to_test.append((cid, f"B/C — {cliente}"))
    for cid in extra_ids:
        ids_to_test.append((cid, f"extra — {cid}"))

    # dedupe
    seen = set()
    unique = []
    for cid, label in ids_to_test:
        if cid in seen:
            continue
        seen.add(cid)
        unique.append((cid, label))

    print("\n=== TESTE PDF GET /api/cotacoes/:id/pdf?tipo=cliente ===")
    for cid, label in unique:
        det = req("GET", f"/api/cotacoes/{cid}")
        stats = {}
        if det["status"] == 200:
            j = json.loads(det["body"].decode())
            stats = ncm_stats(j.get("itens") or [])
            stats["cliente"] = (j.get("cotacao") or {}).get("cliente")
        pdf = req("GET", f"/api/cotacoes/{cid}/pdf?tipo=cliente", timeout=180)
        s = summarize_pdf(label, pdf)
        s["ncm_stats"] = stats
        reports.append(s)
        print(f"\n--- {label} ({cid}) ---")
        print(f"  NCM stats: {json.dumps(stats, ensure_ascii=False)}")
        print(f"  URL: {s['url']}")
        print(f"  Status: {s['status']} | {s['bytes']} bytes | {s['elapsed_s']}s | CT={s.get('content_type')}")
        if s.get("pdf_magic"):
            print("  PDF: OK (%PDF magic)")
        elif s.get("json_body"):
            print(f"  Body JSON: {json.dumps(s['json_body'], ensure_ascii=False)}")
        elif s.get("text_body"):
            print(f"  Body text: {s['text_body'][:200]}")
        if s.get("error"):
            print(f"  Transport error: {s['error']}")

    out_path = ROOT / "diag-pdf-ab-report.json"
    out_path.write_text(json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nRelatório salvo: {out_path}")

    # Verdict
    control = next((r for r in reports if r["label"].startswith("A —")), None)
    others = [r for r in reports if not r["label"].startswith("A —")]
    if control:
        c_ok = control.get("pdf_magic") or (control["status"] == 200 and control["bytes"] > 1000)
        print("\n=== VEREDITO A/B ===")
        print(f"  Controle confirmado: {'PDF OK' if c_ok else 'PDF FALHOU'} (status {control['status']})")
        if not c_ok:
            print("  → Causa provável: GERAÇÃO/BLOB/TIMEOUT (não é trava NCM 422 engolido)")
        else:
            fail_422 = [r for r in others if r["status"] == 422]
            fail_other = [r for r in others if r["status"] not in (200, None) and r["status"] != 422]
            ok = [r for r in others if r.get("pdf_magic")]
            print(f"  Casos problema: {len(others)} | PDF OK: {len(ok)} | 422: {len(fail_422)} | outros erro: {len(fail_other)}")
            if fail_422 and ok:
                print("  → Causa provável: 422 NCM no back + front engole erro (controle baixa, pendente não)")
            elif fail_422 and not ok:
                print("  → Causa provável: 422 NCM em todos (validação server-side)")
            elif not ok and not fail_422:
                print("  → Causa provável: geração/timeout/outro erro server")


if __name__ == "__main__":
    main()
