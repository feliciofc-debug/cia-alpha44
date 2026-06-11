#!/usr/bin/env python3
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/smoke-out.json"
with open(path, encoding="utf-8") as f:
    d = json.load(f)

itens = d.get("itens", [])
partes = itens[1:] if len(itens) > 1 else itens

print("provider:", d.get("provider"))
print("total partes:", len(partes))
print()
print(f"{'desc':<40} {'ncm':<10} {'fonte':<10} {'cap':<6}")
print("-" * 70)
for x in partes:
    desc = (x.get("descOriginal") or x.get("descricao") or "")[:38]
    ncm = x.get("ncm") or ""
    fonte = x.get("ncmFonte") or ""
    cap = ncm[:4] if ncm else ""
    rastro = x.get("rastro") or []
    rastro_fontes = [r.get("fonte") for r in rastro if isinstance(r, dict) and r.get("fonte")]
    rastro_str = ",".join(rastro_fontes[:3]) if rastro_fontes else "-"
    print(f"{desc:<40} {ncm:<10} {fonte:<10} {cap:<6} rastro:{rastro_str}")

ia = sum(1 for x in partes if x.get("ncmFonte") == "ia")
sis = sum(1 for x in partes if x.get("ncmFonte") == "siscomex")
plan = sum(1 for x in partes if x.get("ncmFonte") == "planilha")
caps = sorted({(x.get("ncm") or "")[:4] for x in partes if x.get("ncm")})
print()
print(f"fontes: ia={ia} siscomex={sis} planilha={plan}")
print("capitulos partes:", caps)
expected = {"8714", "8708", "7318", "8504"}
bad = [c for c in caps if c not in expected]
print("fora familia:", bad if bad else "nenhum")
