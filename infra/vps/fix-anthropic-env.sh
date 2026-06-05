#!/bin/bash
# Corrige ANTHROPIC_MODEL e chave duplicada/corrompida em /etc/cia-alpha44/api.env
set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"
NEW_MODEL="${ANTHROPIC_MODEL_NEW:-claude-sonnet-4-6}"

if [[ ! -f "$ENV_API" ]]; then
  echo "ERRO: $ENV_API não encontrado" >&2
  exit 1
fi

python3 <<'PY'
import re
import urllib.request
import json
from pathlib import Path

env_path = Path("/etc/cia-alpha44/api.env")
lines = env_path.read_text().splitlines()
data = {}
order = []
for line in lines:
    if not line.strip() or line.strip().startswith("#") or "=" not in line:
        order.append(("raw", line))
        continue
    k, v = line.split("=", 1)
    data[k] = v
    order.append(("kv", k))

raw_key = data.get("ANTHROPIC_API_KEY", "")
clean = raw_key
if "systemctl" in clean:
    clean = clean.split("systemctl", 1)[0].strip()
idx = clean.find("sk-ant-api03", 12)
if idx > 0:
    clean = clean[:idx]
clean = clean.strip()

if not clean.startswith("sk-ant-"):
    raise SystemExit("ERRO: chave Anthropic inválida após limpeza")

# Testa a chave com o modelo novo
model = __import__("os").environ.get("ANTHROPIC_MODEL_NEW", "claude-sonnet-4-6")
body = json.dumps({
    "model": model,
    "max_tokens": 32,
    "messages": [{"role": "user", "content": "Responda apenas: ok"}],
}).encode()
req = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=body,
    headers={
        "content-type": "application/json",
        "x-api-key": clean,
        "anthropic-version": "2023-06-01",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=45) as resp:
        ok = resp.status == 200
except urllib.error.HTTPError as e:
    raise SystemExit(f"ERRO: Anthropic HTTP {e.code}: {e.read()[:300]!r}")

if not ok:
    raise SystemExit("ERRO: resposta inesperada da Anthropic")

data["ANTHROPIC_API_KEY"] = clean
data["ANTHROPIC_MODEL"] = model

out = []
for kind, item in order:
    if kind == "raw":
        out.append(item)
    else:
        if item in data:
            out.append(f"{item}={data[item]}")
            del data[item]
for k, v in data.items():
    out.append(f"{k}={v}")

env_path.write_text("\n".join(out) + "\n")
print(f"OK: modelo={model} key_len={len(clean)} anthropic_test=200")
PY

systemctl restart cia-api
sleep 2
curl -sf "http://127.0.0.1:3333/api/meta"
echo ""
