#!/usr/bin/env python3
"""Smoke P4 Auth — JWT + tenant isolation + rotas públicas.

Uso:
  python tools/smoke-p4-auth.py <API>                    # dev: x-demo-auth no check 5
  python tools/smoke-p4-auth.py <API> <BEARER_TOKEN>     # prod: JWT Clerk real
"""
import json
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3333"
BEARER = sys.argv[2].strip() if len(sys.argv) > 2 and sys.argv[2].strip() else None
DEMO_HDR = {"x-demo-auth": "1"}


def auth_headers() -> dict[str, str]:
    if BEARER:
        return {"Authorization": f"Bearer {BEARER}"}
    return DEMO_HDR.copy()


def get(path: str, headers: dict | None = None, timeout: int = 30) -> tuple[int, dict | str]:
    req = urllib.request.Request(f"{API.rstrip('/')}{path}", headers=headers or {}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="replace")
            try:
                return r.status, json.loads(body)
            except json.JSONDecodeError:
                return r.status, body
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def main() -> int:
    mode = "Bearer JWT" if BEARER else "x-demo-auth (dev)"
    print(f"API: {API}")
    print(f"Auth check 5: {mode}\n")
    checks: dict[str, bool] = {}

    print("=== 1/6 GET /api/health (pública) ===")
    st, body = get("/api/health")
    ok = st == 200 and isinstance(body, dict) and body.get("ok") is True
    checks["health_publica"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print("\n=== 2/6 GET /api/meta (pública) ===")
    st, body = get("/api/meta")
    ok = st == 200 and isinstance(body, dict) and "provider" in body
    checks["meta_publica"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print("\n=== 3/6 GET /api/cambio (pública" + (", com Bearer" if BEARER else "") + ") ===")
    st, body = get("/api/cambio?moeda=USD", auth_headers() if BEARER else None)
    ok = st == 200 and isinstance(body, dict)
    checks["cambio_publica"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print("\n=== 4/6 GET /api/cotacoes sem auth → 401 ===")
    st, body = get("/api/cotacoes")
    ok = st == 401
    checks["cotacoes_sem_auth_401"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print(f"\n=== 5/6 GET /api/cotacoes com {mode} ===")
    st, body = get("/api/cotacoes", auth_headers())
    if BEARER:
        ok = st == 200 and isinstance(body, dict) and "cotacoes" in body
    else:
        ok = st in (200, 503)
        if st == 503:
            ok = isinstance(body, dict) and "indisponível" in str(body.get("erro", "")).lower()
        elif st == 200:
            ok = isinstance(body, dict) and "cotacoes" in body
    checks["cotacoes_auth_ok"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print("\n=== 6/6 Bearer inválido → 401 ===")
    st, body = get("/api/cotacoes", {"Authorization": "Bearer token-invalido"})
    ok = st == 401
    checks["bearer_invalido_401"] = ok
    print(f"status={st} | {'OK' if ok else 'FALHA'}")

    print("\n=== RESULTADO P4 Auth ===")
    for k, v in checks.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    ok_all = all(checks.values())
    print(f"\n{'ACEITO' if ok_all else 'REPROVADO'}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
