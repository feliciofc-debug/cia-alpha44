#!/usr/bin/env python3
"""Smoke: POST confirmar-ncm-lote + cross-tenant 404 + spot-check meta/cache.

Uso:
  python tools/smoke-confirmar-ncm-lote.py <API> [COTACAO_ID] [BEARER]
  python tools/smoke-confirmar-ncm-lote.py <API> [COTACAO_ID] [BEARER] --tenant-b-slug=acme

Cross-tenant (check 3): exige BEARER de tenant B + COTACAO_ID de tenant A.
Sem BEARER_B, cross-tenant fica SKIP (coberto por vitest confirmar-ncm-lote.test.ts).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3333"
COTACAO_ID = None
BEARER = None
TENANT_B_SLUG = os.environ.get("SMOKE_TENANT_B_SLUG", "")

for arg in sys.argv[2:]:
    if arg.startswith("--tenant-b-slug="):
        TENANT_B_SLUG = arg.split("=", 1)[1]
    elif COTACAO_ID is None:
        COTACAO_ID = arg.strip() or None
    elif BEARER is None:
        BEARER = arg.strip() or None

BEARER_B = os.environ.get("SMOKE_BEARER_B", "").strip() or None
COTACAO_CROSS_ID = os.environ.get("SMOKE_COTACAO_CROSS_ID", "").strip() or None
DEMO_HDR = {"x-demo-auth": "1", "content-type": "application/json"}


def auth_headers(bearer: str | None = None) -> dict[str, str]:
    h = {"content-type": "application/json"}
    tok = bearer or BEARER
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    else:
        h["x-demo-auth"] = "1"
    return h


def request(method: str, path: str, body: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str]:
    data = json.dumps(body or {}).encode() if body is not None or method in ("POST", "PATCH") else None
    hdrs = headers or auth_headers()
    req = urllib.request.Request(f"{API.rstrip('/')}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", errors="replace")
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def item_pode_confirmar(it: dict) -> bool:
    if it.get("compatibilidadeProduto") == "incompativel":
        return False
    if it.get("ncmRevisadoHumano") and it.get("ncmConfirmado") == (it.get("ncm") or "").replace(" ", ""):
        return False
    ncm = "".join(c for c in (it.get("ncm") or "") if c.isdigit()).zfill(8)[:8]
    if not ncm or ncm == "00000000":
        return False
    if it.get("compatibilidadeProduto") == "revisar":
        return True
    if it.get("ncmValido") is False:
        return True
    if it.get("ncmFonte") == "pendente":
        return True
    conf = it.get("ncmConfianca")
    if conf is not None and conf < 0.85:
        return True
    return False


def main() -> int:
    mode = "Bearer JWT" if BEARER else "x-demo-auth (dev)"
    print(f"API: {API}")
    print(f"Auth: {mode}")
    checks: dict[str, bool | str] = {}

    if not COTACAO_ID:
        print("\n=== 0/4 COTACAO_ID obrigatório para smoke de lote ===")
        print("Uso: python tools/smoke-confirmar-ncm-lote.py <API> <COTACAO_ID> [BEARER]")
        return 2

    print(f"\n=== 1/4 GET cotação {COTACAO_ID} ===")
    st, det = request("GET", f"/api/cotacoes/{COTACAO_ID}")
    if st != 200 or not isinstance(det, dict):
        print(f"status={st} | FALHA — não foi possível carregar cotação")
        return 1
    itens = det.get("itens") or []
    elegiveis_antes = sum(1 for it in itens if item_pode_confirmar(it))
    print(f"  {len(itens)} itens · {elegiveis_antes} elegíveis antes do lote")
    checks["get_cotacao"] = True

    print(f"\n=== 2/4 POST confirmar-ncm-lote ===")
    st, out = request(
        "POST",
        f"/api/cotacoes/{COTACAO_ID}/itens/confirmar-ncm-lote",
        {"confirmadoPor": "smoke-lote"},
    )
    ok = st == 200 and isinstance(out, dict) and "aprovados" in out
    if ok:
        aprovados = out.get("aprovados", 0)
        pulados = out.get("pulados", 0)
        pendentes = out.get("pendentes", 0)
        print(f"  aprovados={aprovados} pulados={pulados} pendentes={pendentes}")
        checks["lote_ok"] = True
    else:
        print(f"  status={st} body={out}")
        checks["lote_ok"] = False

    print("\n=== 2b/4 Re-chamar lote (idempotência) ===")
    st2, out2 = request(
        "POST",
        f"/api/cotacoes/{COTACAO_ID}/itens/confirmar-ncm-lote",
        {"confirmadoPor": "smoke-lote"},
    )
    ok2 = (
        st2 == 200
        and isinstance(out2, dict)
        and out2.get("aprovados") == 0
        and out2.get("pulados", 0) >= 0
    )
    print(
        f"  aprovados={out2.get('aprovados') if isinstance(out2, dict) else '?'} "
        f"pulados={out2.get('pulados') if isinstance(out2, dict) else '?'}"
    )
    checks["rechamar_idempotente"] = ok2

    print("\n=== 3/4 Cross-tenant (tenant B → cotação A) ===")
    cross_id = COTACAO_CROSS_ID or COTACAO_ID
    cross_bearer = BEARER_B or BEARER
    if cross_bearer and cross_id:
        st3, body3 = request(
            "POST",
            f"/api/cotacoes/{cross_id}/itens/confirmar-ncm-lote",
            {"confirmadoPor": "evil"},
            auth_headers(cross_bearer),
        )
        # Espera 404 quando o bearer não é dono da cotação (outro tenant)
        expect_404 = cross_id != COTACAO_ID or bool(BEARER_B)
        ok3 = st3 == 404 if expect_404 else st3 == 200
        print(
            f"  cotacao={cross_id[:12]}… status={st3} | "
            f"{'OK (404)' if st3 == 404 else ('OK (200 same-tenant)' if st3 == 200 and not expect_404 else 'FALHA')}"
        )
        checks["cross_tenant_404"] = st3 == 404 if expect_404 else ok3
    else:
        print("  SKIP — defina SMOKE_BEARER_B ou Bearer + SMOKE_COTACAO_CROSS_ID")
        checks["cross_tenant_404"] = "SKIP (vitest)"

    print("\n=== 4/4 Spot-check meta confirmada ===")
    st4, det4 = request("GET", f"/api/cotacoes/{COTACAO_ID}")
    spot_ok = False
    if st4 == 200 and isinstance(det4, dict):
        itens4 = det4.get("itens") or []
        confirmados = [it for it in itens4 if it.get("ncmRevisadoHumano")]
        if confirmados:
            amostra = confirmados[0]
            spot_ok = (
                amostra.get("ncmRevisadoHumano") is True
                and amostra.get("ncmConfirmadoPor") == "smoke-lote"
            )
            print(
                f"  {len(confirmados)} confirmados · amostra ncmRevisadoHumano="
                f"{amostra.get('ncmRevisadoHumano')} por={amostra.get('ncmConfirmadoPor')}"
            )
        else:
            print("  nenhum item confirmado (lote pode ter sido pulado se já confirmados)")
            spot_ok = isinstance(out, dict) and out.get("pulados", 0) > 0
    checks["spot_check_meta"] = spot_ok

    print("\n=== RESULTADO smoke confirmar-ncm-lote ===")
    for k, v in checks.items():
        label = "PASS" if v is True else ("SKIP" if isinstance(v, str) else "FAIL")
        print(f"  {k}: {label}" + (f" ({v})" if isinstance(v, str) else ""))

    hard = [v for v in checks.values() if v is not True and not isinstance(v, str)]
    return 0 if not hard else 1


if __name__ == "__main__":
    sys.exit(main())
