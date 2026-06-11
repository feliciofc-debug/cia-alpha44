#!/bin/bash
set -e
curl -s -o /tmp/smoke-out.json -w "HTTP:%{http_code} TIME:%{time_total}s\n" \
  -X POST http://127.0.0.1:3333/api/classificar \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/smoke-fatura92-partes.json

python3 <<'PY'
import json
d = json.load(open("/tmp/smoke-out.json"))
partes = d["itens"][1:]
print("provider:", d.get("provider"))
print("--- PARTES (11) ---")
absurd = 0
for x in partes:
    cap = (x.get("ncm") or "")[:4]
    fonte = x.get("ncmFonte", "?")
    desc = (x.get("descOriginal") or "")[:35]
    print(f"  {desc:35} ncm={x.get('ncm',''):8} fonte={fonte}")
    if cap in ("8211", "3002", "5811", "9503"):
        absurd += 1
ia = sum(1 for x in partes if x.get("ncmFonte") == "ia")
sis = sum(1 for x in partes if x.get("ncmFonte") == "siscomex")
print(f"fonte ia={ia}/11 siscomex={sis}/11 absurdos={absurd}")
PY
