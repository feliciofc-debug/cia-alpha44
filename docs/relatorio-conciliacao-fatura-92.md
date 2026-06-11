# Relatório de Conciliação — Fatura 92 (NCMs + FOB/kg)

## 1. Cabeçalho

| Campo | Valor |
|-------|-------|
| Fatura | Fatura 92 — 0617滑板车 |
| Data da prova | 2026-06-11 |
| Commit | `b0861df` |
| Provider | anthropic:claude-sonnet-4-6 |
| Tempo classificação | ~100 s |
| Prompt | PROMPT_PASSE2_V4 |
| Câmbio | 5.0211 |
| Frete | US$ 5,500 |
| Incoterm | CFR |
| Benefício fiscal | ALAGOAS |
| Rota | RJ → SP |
| Fonte prova | `tools/fatura92-out-vps.json` |

## 2. Tabela principal — NCM e alíquotas (13 itens)

| # | Modelo | Descrição (ZH/EN) | Material | Uso | NCM Plataforma | Fonte | Conf. | Compat. | NCM Despachante | Veredito | II% Plat. | IPI% Plat. | II% Desp. | IPI% Desp. |
|---|--------|-------------------|----------|-----|----------------|-------|-------|---------|-----------------|----------|-----------|------------|-----------|------------|
| 1 | ES-T19A-10BLK | 滑板车T1 MAX 10寸500W款（黑色） | 高碳钢 | 骑行 | 87116000 | ia | 0.97 | revisar | 87116000 | **OK ncm8** | 18,00% | 35,00% | 18% | 35% |
| 2 | ES-T19A-10WHI | 滑板车T1 MAX 10寸500W款（白色） | 高碳钢 | 骑行 | 87116000 | ia | 0.95 | revisar | 87116000 | **OK ncm8** | 18,00% | 35,00% | 18% | 35% |
| 3 | ACC-ES-SSA001 | 减震器 | 铁 | 配件 | 87149990 | ia | 0.82 | revisar | 87141000 | **OK capítulo** | 14,40% | 6,50% | 14,4% | 9% |
| 4 | ACC-ES-BC002 | 刹车线 | 镀铬钢+塑胶 | 配件 | 87149490 | ia | 0.85 | revisar | 87149490 | **OK ncm8** | 14,40% | 6,50% | 14,4% | 6,5% |
| 5 | ACC-ES-LS001 | 后尾挡泥板螺丝 | 铁 | 配件 | 73181500 | ia | 0.92 | compativel | 73181500 | **OK ncm8** | 16,00% | 6,50% | 16% | 6,5% |
| 6 | ACC-ES-018 | 仪表 | PC板 | 配件 | 90319090 | ia | 0.35 | revisar | 87141000 | **DIVERGE** | 12,60% | 9,75% | 14,4% | 9% |
| 7 | ACC-ES-034 | 减震螺丝 | 铁 | 配件 | 87149990 | ia | 0.72 | revisar | 73182400 | **DIVERGE** | 14,40% | 6,50% | 16% | 6,5% |
| 8 | ACC-ES-035 | 额头螺丝 | 铁 | 配件 | 73181500 | ia | 0.88 | compativel | 73181500 | **OK ncm8** | 16,00% | 6,50% | 16% | 6,5% |
| 9 | ACC-ES-043 | 适配器 | 塑胶 | 配件 | 85044090 | ia | 0.72 | compativel | 85044010 | **OK capítulo** | 12,60% | 9,75% | 18% | 5% |
| 10 | ACC-ES-042 | 控制器 | 铝合金 | 配件 | 87149990 | ia | 0.72 | revisar | 87141000 | **OK capítulo** | 14,40% | 6,50% | 14,4% | 9% |
| 11 | ACC-ES-045 | 刹车把 | 铝合金 | 配件 | 87149490 | ia | 0.88 | revisar | 87149490 | **OK ncm8** | 14,40% | 6,50% | 14,4% | 6,5% |
| 12 | ACC-ES-040 | 后挡泥板 | PVC | 配件 | 87149990 | ia | 0.85 | revisar | 87141000 | **OK capítulo** | 14,40% | 6,50% | 14,4% | 9% |
| 13 | ACC-ES-033 | 后挡泥板 | PVC | 配件 | 87149990 | ia | 0.85 | revisar | 87141000 | **OK capítulo** | 14,40% | 6,50% | 14,4% | 9% |

**Gabarito despachante:** patinetes `87116000`; amortecedor/painel/controlador/para-lamas `87141000`; cabo + manete freio `87149490`; parafusos `73181500` / `73182400` / `73181600`; adaptador `85044010`.

## 3. Tabela FOB/kg

| # | Modelo | Qtd total | FOB unit. fatura (US$) | Base custo desp. (US$) | Peso líq. unit. (kg) | Peso bruto unit. (kg) | Peso líq. total (kg) | Peso bruto total (kg) | FOB/kg líq. (fatura) | FOB/kg líq. (base 109) | FOB/kg bruto (base) |
|---|--------|-----------|------------------------|------------------------|----------------------|-----------------------|----------------------|-----------------------|----------------------|-------------------------|---------------------|
| 1 | ES-T19A-10BLK | 500 | 140.5800 | 109.00 | 20.00 | 23.00 | 10000.00 | 11500.00 | 7.03 | 5.45 | 4.74 |
| 2 | ES-T19A-10WHI | 210 | 140.5800 | 109.00 | 20.00 | 23.00 | 4200.00 | 4830.00 | 7.03 | 5.45 | 4.74 |
| 3 | ACC-ES-SSA001 | 4 | 0.1200 | — | 4.00 | 4.10 | 16.00 | 16.40 | 0.03 | — | — |
| 4 | ACC-ES-BC002 | — | 0.0500 | — | — | — | — | — | — | — | — |
| 5 | ACC-ES-LS001 | — | 0.0010 | — | — | — | — | — | — | — | — |
| 6 | ACC-ES-018 | — | 0.1000 | — | — | — | — | — | — | — | — |
| 7 | ACC-ES-034 | — | 0.0100 | — | — | — | — | — | — | — | — |
| 8 | ACC-ES-035 | — | 0.0100 | — | — | — | — | — | — | — | — |
| 9 | ACC-ES-043 | — | 0.2000 | — | — | — | — | — | — | — | — |
| 10 | ACC-ES-042 | 10 | 0.1000 | — | 0.60 | 0.65 | 6.00 | 6.50 | 0.17 | — | — |
| 11 | ACC-ES-045 | — | 0.1000 | — | — | — | — | — | — | — | — |
| 12 | ACC-ES-040 | — | 0.1000 | — | — | — | — | — | — | — | — |
| 13 | ACC-ES-033 | — | 0.1000 | — | — | — | — | — | — | — | — |

### Totais da carga

| Métrica | Fatura fornecedor | Base custo despachante (US$ 109/un patinete) |
|---------|-------------------|-----------------------------------------------|
| FOB total | US$ 99,813.28 | US$ 77,390.00 (~77.417) |
| Peso líquido | 16,343 kg | — |
| Peso bruto | 17,977 kg | — |
| FOB/kg (líquido, base 109) | — | **US$ 4.74/kg** (~4,74) |

*Patinetes: 710 un. × 20 kg líq. / 23 kg bruto unit. (planilha); despachante usou 23 kg bruto fornecedor como líquido — ver divergência (e).*

## 4. Divergências abertas (validação despachante)

**a. IPI 8714.10.00** — Despachante informa 9%; TIPI vigente (Decreto 12.665/2025) no `tec-cache`: **12,00%** para `87141000`.

**b. 仪表 (painel)** — Plataforma `90319090` (cap. 90, Nota 2(g) Seção XVII — instrumento) × despachante `87141000` (parte de veículo). Veredito: **DIVERGE**.

**c. 减震螺丝** — Plataforma `87149990` (residual 87.14) × gabarito `73182400` (Nota 2(a) — parafuso uso geral). Veredito: **DIVERGE**. Lapidação prompt pendente.

**d. Preço patinete** — Fatura US$ 140,58/un × base operacional US$ 109,00/un (valor de transação a confirmar com fornecedor/despachante).

**e. Peso** — Despachante: 23 kg/un bruto fornecedor tratado como líquido; líquido real **20 kg/un** (710 × 20 = 14.200 kg só patinetes). Totais operacionais: **16.343 kg líq.** / **17.977 kg bruto**.

## 5. Rodapé de auditoria

- **Score NCM:** 11/13 (critério ≥11/13 — **aprovado**)
- **Fonte IA:** 13/13 itens (`ncmFonte: ia`)
- **Fallback Siscomex:** 0
- **Capítulos absurdos (8211/3002/5811):** 0
- **Alíquotas plataforma:** TEC Res. Gecex 770/2025 (Anexo II) + TIPI Decreto 12.665/2025
- **Prompt:** PROMPT_PASSE2_V4 (regras 8708×8714 + Nota 2 Seção XVII)
