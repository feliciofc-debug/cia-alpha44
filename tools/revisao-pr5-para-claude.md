# Relatório de revisão — PR #5 (rótulo NCM honesto)

**PR:** https://github.com/feliciofc-debug/cia-alpha44/pull/5  
**Branch:** `cursor/rotulo-ncm-referencia-honesto-48a6`  
**Data:** 2026-06-23  
**Status:** AGUARDANDO REVISÃO HUMANA — mexe em classificação NCM / hierarquia de fontes  
**Merge:** NÃO realizado (conforme política)

---

## Resumo executivo

O PR corrige o rótulo falso *"declarado na planilha do cliente"* quando o NCM veio de **meta injetado** (patch VPS / gabarito / legado), não de coluna real na planilha. A distinção pivota no campo `ncmEmbarqueStatus` (`coluna` | `heranca-familia` | `sem-ncm-coluna`).

**Veredito preliminar:** lógica coerente; fatura 92 preservada nos testes; caso injetado coberto. **CI no GitHub estava VERMELHO** na última execução (branch criada antes do merge do PR-A); após rebase com `main` (que já tem o fix de CI), testes locais passam **25/25**.

---

## 1. DISTINÇÃO — injetado × coluna real

### Função central: `ncmColunaEmbarqueParaClassificacao`

Arquivo: `packages/pipeline/src/item-meta.ts`

```54:66:packages/pipeline/src/item-meta.ts
export function ncmColunaEmbarqueParaClassificacao(
  meta: ItemMetaPersistido,
  opts?: { ncmConfirmadoHumano?: string | null },
): string | null {
  if (opts?.ncmConfirmadoHumano?.trim()) return opts.ncmConfirmadoHumano.trim();
  if (meta.ncmEmbarqueStatus === "coluna") {
    return meta.ncmEmbarque ?? meta.ncmPlanilhaOriginal ?? null;
  }
  if (meta.ncmEmbarqueStatus === "heranca-familia") {
    return meta.ncmEmbarque ?? null;
  }
  return null;
}
```

| `ncmEmbarqueStatus` | Comportamento | Origem típica |
|---------------------|---------------|---------------|
| `"coluna"` | Retorna NCM → Camada A `planilha-cliente` | Parser leu coluna NCM na planilha (`l.ncm`) |
| `"heranca-familia"` | Retorna `ncmEmbarque` herdado | Linha sem NCM, mesma família que linha com coluna no **mesmo upload** |
| `"sem-ncm-coluna"` ou ausente | **`return null`** | Cot 72 sem coluna; meta com patch/gabarito **ignorado** na classificação |

### Onde a distinção entra no fluxo

**Upload novo** — `montarItens` grava o status a partir da linha parseada (`l.ncm`), não do meta:

```452:468:apps/api/src/services/cotacao.ts
    const ncmColuna = l.ncm ? normNcm8(l.ncm) : null;
    // ...
    const ncmEmbarqueStatus: "coluna" | "heranca-familia" | "sem-ncm-coluna" = ncmColuna
      ? "coluna"
      : c?.classificacaoProvedor === "planilha-cliente-familia" && ncmPlanilhaCliente
        ? "heranca-familia"
        : "sem-ncm-coluna";
```

**Reclassificação** — antes do PR, `linhasCruasFromItensPersistidos` fazia `ncm: meta.ncmPlanilhaOriginal ?? meta.ncmEmbarque` (tratava patch como coluna). Agora:

```485:487:apps/api/src/services/cotacoes-persist.ts
        ncm: ncmColunaEmbarqueParaClassificacao(meta, {
          ncmConfirmadoHumano: humano ? it.ncm : null,
        }),
```

### Exibição honesta para legado injetado

`referenciaNcmLegado` + `mesclarItemMeta` convertem meta antigo em referência visual:

```40:47:packages/pipeline/src/item-meta.ts
export function referenciaNcmLegado(meta: ItemMetaPersistido): string | null {
  if (meta.ncmReferencia?.trim()) return meta.ncmReferencia.trim();
  if (meta.ncmEmbarqueStatus === "sem-ncm-coluna") {
    const legado = meta.ncmPlanilhaOriginal ?? meta.ncmEmbarque ?? null;
    return legado?.trim() ? legado.trim() : null;
  }
  return null;
}
```

```36:37:packages/pipeline/src/item-meta.ts
export function avisoNcmReferencia(ncm: string): string {
  return `NCM de referência — conferir: ${ncm}.`;
}
```

---

## 2. CASO LEGÍTIMO NÃO QUEBRADO — fatura 92 com coluna NCM

### Teste gate (fatura 92)

Arquivo: `apps/api/test/gate-fatura-92-planilha-cliente.test.ts`

```40:73:apps/api/test/gate-fatura-92-planilha-cliente.test.ts
  it("linhas com NCM na planilha → ncmFonte planilha-cliente ou planilha-cliente-familia", async () => {
    // ... montarItens(FIXTURE.linhas, state)
    for (let i = 0; i < FIXTURE.linhas.length; i++) {
      const linha = FIXTURE.linhas[i]!;
      const item = itens[i]!;
      if (!linha.ncm?.trim()) continue;
      expect(["planilha-cliente", "planilha-cliente-familia"]).toContain(item.ncmFonte);
      expect(item.ncmFonte).not.toBe("planilha-china");
    }
  });
```

**Resultado local (após merge com main):** ✓ 1 test passed

### Testes complementares que permanecem verdes

| Teste | Arquivo | O que prova |
|-------|---------|-------------|
| Coluna embarque → `ncmEmbarqueStatus: "coluna"` | `ncm-embarque.test.ts:38-53` | HY-97 com `ncm: "84238900"` na linha |
| Herança família intra-upload | `ncm-embarque.test.ts:55-84` | Linha 2 sem NCM herda de linha 1 com coluna |
| Camada A unitária | `planilha-cliente-ncm.test.ts:8-17` | `resolverNcmDeclaradoCliente` com NCM válido |

**Conclusão:** planilha **com** coluna NCM continua classificando como `planilha-cliente` / `planilha-cliente-familia`. O PR só bloqueia meta injetado com `sem-ncm-coluna`.

---

## 3. CASO INJETADO — cot 72 / patch / legado

### Teste novo — classificação não usa NCM fantasma

Arquivo: `apps/api/test/ncm-embarque.test.ts`

```103:118:apps/api/test/ncm-embarque.test.ts
  it("linha com ncm null (meta injetado ignorado) — não classifica planilha-cliente", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-97;挂钩秤;Balança de gancho portátil (dinamômetro de pesagem)",
        ncm: null,
        // ...
      },
    ];
    const { itens } = await montarItens(linhas, buildState());
    expect(itens[0]!.ncmFonte).not.toBe("planilha-cliente");
    expect(itens[0]!.ncmAvisos?.some((a) => /declarado na planilha do cliente/i.test(a))).toBeFalsy();
  });
```

**Resultado local:** ✓ passed

### Teste novo — rótulo honesto no meta legado

Arquivo: `packages/pipeline/test/item-meta-ncm-referencia.test.ts`

```typescript
it("meta injetado sem coluna → ncmReferencia + aviso honesto", () => {
  const meta = {
    ncmEmbarqueStatus: "sem-ncm-coluna" as const,
    ncmPlanilhaOriginal: "84238900",
  };
  expect(avisoNcmReferencia("84238900")).toBe("NCM de referência — conferir: 84238900.");
  const it = mesclarItemMeta(base, meta);
  expect(it.ncmReferencia).toBe("84238900");
  expect(it.ncmPlanilhaOriginal).toBeUndefined();
  expect(it.ncmAvisos?.some((a) => a.includes("referência"))).toBe(true);
  expect(it.ncmAvisos?.some((a) => a.includes("declarado na planilha"))).toBe(false);
});
```

**Resultado local:** ✓ 4 tests passed

### Patch VPS aposentado

`tools/vps-patch-cot72-embarque-gabarito.mjs` agora termina com exit 1 e mensagem para usar `run-reclassificar-cot72-producao.sh`.

---

## 4. CI — check `test-and-build`

### No GitHub (última execução do PR #5)

| Check | Status | Motivo |
|-------|--------|--------|
| `CI / test-and-build` | **FAILURE** | Branch aberta **antes** do merge do PR-A (#3); base sem `build @cia/shared` antes de `engine:test` |
| Erro | `Failed to resolve entry for package "@cia/shared"` | Mesmo bug que PR-A corrigiu |

### Após rebase com `main` (que já inclui PR-A)

Execução local:

```
npm run build -w @cia/shared && npm run engine:test
→ Test Files  4 passed (4)
→ Tests  25 passed (25)

gate-fatura-92 + ncm-embarque + item-meta-ncm-referencia → todos verdes
```

**Ação necessária antes do merge:** atualizar branch do PR #5 com `main` (rebase ou merge) para o CI rerodar verde. O código do PR #5 **não** reintroduz o bug de CI.

---

## Checklist para o Claude / Felicio

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Injeto × coluna real está claro? | Sim — `ncmEmbarqueStatus` + `ncmColunaEmbarqueParaClassificacao` |
| 2 | Fatura 92 preservada? | Sim — `gate-fatura-92-planilha-cliente.test.ts` verde |
| 3 | Injetado vira referência, não planilha-cliente? | Sim — testes `item-meta-ncm-referencia` + `ncm-embarque` |
| 4 | CI verde? | **Não na última run do GitHub** — precisa rebase com main (PR-A já mergeado) |

---

## Arquivos alterados no PR #5 (escopo)

- `packages/pipeline/src/item-meta.ts` — funções de distinção e rótulo
- `apps/api/src/services/cotacoes-persist.ts` — reclassificação usa função honesta
- `apps/web/src/dashboard.tsx` — badge "NCM de referência — conferir"
- `packages/shared/src/schemas.ts` — campo `ncmReferencia`
- Testes novos/alterados (3 arquivos)
- `tools/vps-patch-cot72-embarque-gabarito.mjs` — aposentado

**Não altera:** `packages/fiscal-engine`, hierarquia Camada A/B/C em `resolve-ncm.ts` (só entrada de dados na reclassificação).
