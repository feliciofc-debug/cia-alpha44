#!/usr/bin/env python3
"""Relatório da prova real fatura-92-limpa — NCM, fonte, confiança, compatibilidade."""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/fatura92-out.json"

GABARITO = [
    {"ncm8": ["87116000"], "caps": ["8711"]},
    {"ncm8": ["87116000"], "caps": ["8711"]},
    {"ncm8": ["87141000"], "caps": ["8714"]},
    {"ncm8": ["87141000", "87149490"], "caps": ["8714"]},
    {"ncm8": ["73181500", "73181600", "73182200"], "caps": ["7318"]},
    {"ncm8": ["87141000", "87149490"], "caps": ["8714"]},
    {"ncm8": ["73181500", "73181600", "73182200"], "caps": ["7318"]},
    {"ncm8": ["73181500", "73181600", "73182200"], "caps": ["7318"]},
    {"ncm8": ["85044010"], "caps": ["8504"]},
    {"ncm8": ["87141000", "87149490", "85044010"], "caps": ["8714", "8504"]},
    {"ncm8": ["87141000", "87149490"], "caps": ["8714"]},
    {"ncm8": ["87141000", "87149490"], "caps": ["8714"]},
    {"ncm8": ["87141000", "87149490"], "caps": ["8714"]},
]


def ok_item(ncm: str, g: dict) -> tuple[bool, str]:
    if ncm in g["ncm8"]:
        return True, "ncm8"
    cap = ncm[:4] if ncm else ""
    if cap in g["caps"]:
        return True, f"cap {cap}"
    return False, ""


with open(path, encoding="utf-8") as f:
    d = json.load(f)

itens = d.get("itens", [])
print("provider:", d.get("provider"))
print("total:", len(itens))
print()
print(f"{'#':<3} {'desc':<42} {'NCM':<10} {'fonte':<8} {'conf':<5} {'compat':<12} {'gabarito'}")
print("-" * 110)

acertos = 0
for i, x in enumerate(itens):
    desc = (x.get("descOriginal") or "")[:40]
    ncm = x.get("ncm") or ""
    fonte = x.get("ncmFonte") or ""
    cands = x.get("ncmCandidatos") or []
    conf = cands[0].get("confianca") if cands else None
    conf_s = f"{conf:.2f}" if isinstance(conf, (int, float)) else "-"
    compat = x.get("compatibilidadeProduto") or "-"
    g = GABARITO[i] if i < len(GABARITO) else {"ncm8": [], "caps": []}
    hit, motivo = ok_item(ncm, g)
    if hit:
        acertos += 1
    mark = "OK" if hit else "MISS"
    print(f"{i+1:<3} {desc:<42} {ncm:<10} {fonte:<8} {conf_s:<5} {compat:<12} {mark} {motivo}")

print()
print(f"score: {acertos}/{len(itens)} (critério ≥11/13)")
patinetes = [x.get("ncm", "") for x in itens[:2]]
parafusos = [x.get("ncm", "") for x in itens if "螺丝" in (x.get("descOriginal") or "")]
adaptador = next((x.get("ncm") for x in itens if "适配器" in (x.get("descOriginal") or "")), "")
print(f"patinetes: {patinetes} (obrigatório 87116000×2)")
print(f"parafusos 7318: {sum(1 for n in parafusos if str(n).startswith('7318'))}/{len(parafusos)}")
print(f"adaptador: {adaptador} (obrigatório cap 8504)")
ia = sum(1 for x in itens if x.get("ncmFonte") == "ia")
sis = sum(1 for x in itens if x.get("ncmFonte") == "siscomex")
print(f"fontes: ia={ia} siscomex={sis}")
