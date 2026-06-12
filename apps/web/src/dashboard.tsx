import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth/auth.tsx";
import { api, type AnaliseCompleta, type Meta } from "./lib/api.ts";
import { brl, fmtNcm, pct, usdKg } from "./lib/format.ts";
import { fobKgItem } from "./lib/fob-kg.ts";
import { contarItensComFoto, fotoItemSrc } from "./lib/item-foto.ts";
import { extrairResumoFinanceiro, type ResumoFinanceiro } from "./lib/financeiro.ts";
import {
  aplicarEditorNaCotacao,
  editorFromCotacao,
  payloadAtualizar,
  type EditorDraft,
} from "./lib/editor-cotacao.ts";
import type { Aliquotas, Canal, CotacaoResumo, CotacaoSalva, Item, ResultadoCotacao } from "./lib/types.ts";
import { PainelEditorCotacao } from "./painel-editor.tsx";
import { AppShell, type NavItem } from "./app-shell.tsx";
import { ClientesView } from "./clientes-view.tsx";
import { PainelKpisView } from "./painel-kpis.tsx";
import { BenchmarkReferenciaView } from "./benchmark-referencia-view.tsx";
import { PreviewOrcamentoCliente } from "./preview-orcamento-cliente.tsx";
import { cotacaoParaSalvar, itensParaSalvar } from "./lib/cotacao-payload.ts";
import { pdfBloqueadoPorNcm, resumoBloqueioNcm, avisoCompatibilidadePdf, itemPodeConfirmarNcm, itemPodeDesfazerNcm, itensPendentesConfirmacaoNcm, metaConfirmacaoNcm, limparConfirmacaoNcm } from "./lib/ncm.ts";
import { aplicarOverrideManualAliquota, desfazerOverrideManualAliquota, type ChaveTributoRastro } from "@cia/shared";
import { DetalheRastroAliquota } from "./lib/aliquota-rastro-ui.tsx";
import type { ClienteResumo, DashboardKpis, DashboardSeries } from "./lib/types.ts";

type View = NavItem | "detalhe";

const CANAL_LABEL: Record<Canal, string> = {
  VERDE_PROVAVEL: "Verde",
  AMARELO_TECNICO: "Amarelo",
  VERMELHO_TECNICO: "Vermelho",
  CINZA_VALORACAO: "Cinza",
};

const CANAL_STYLE: Record<Canal, string> = {
  VERDE_PROVAVEL: "bg-emerald-500/20 text-emerald-300",
  AMARELO_TECNICO: "bg-amber-500/20 text-amber-300",
  VERMELHO_TECNICO: "bg-red-500/20 text-red-300",
  CINZA_VALORACAO: "bg-slate-500/20 text-slate-300",
};

function resumoCanais(itens: Item[]) {
  const m: Record<string, number> = {};
  for (const it of itens) {
    const c = it.risco?.canal ?? "AMARELO_TECNICO";
    m[c] = (m[c] ?? 0) + 1;
  }
  return m;
}

function IconLixeira() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AnaliseView = AnaliseCompleta | CotacaoSalva;

type AliquotaCampo = keyof Aliquotas;

function InputAliquotaImport({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String((value * 100).toFixed(2)));
  useEffect(() => {
    setLocal(String((value * 100).toFixed(2)));
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      max={100}
      step={0.01}
      disabled={disabled}
      title="Alíquota de importação (%)"
      className="w-[4.25rem] rounded border border-white/15 bg-ink-900/80 px-1 py-0.5 text-xs text-white disabled:opacity-50"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const v = Math.min(100, Math.max(0, Number(local) || 0)) / 100;
        onCommit(v);
      }}
    />
  );
}

function ResumoFinanceiroPainel({
  financeiro,
  resultado,
}: {
  financeiro: ResumoFinanceiro | null;
  resultado?: ResultadoCotacao | null;
}) {
  if (!financeiro) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Custo importação</p>
          <p className="mt-1 text-xl font-bold text-slate-200">{brl(financeiro.custoImportacaoBRL)}</p>
          <p className="mt-1 text-xs text-slate-500">Fixo — nacionalização (não muda com markup)</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">Impostos venda</p>
          <p className="mt-1 text-xl font-bold text-amber-200/90">{brl(financeiro.impostosSaidaBRL)}</p>
          <p className="mt-1 text-xs text-slate-500">ICMS + DIFs — variam com UF destino e margem</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Lucro da trade</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{brl(financeiro.markupBRL)}</p>
          <p className="mt-1 text-xs text-emerald-400/80">
            Markup {pct(financeiro.markupPct)} · líquido {brl(financeiro.lucroLiquidoTradeBRL)}
          </p>
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-300">Total orçamento</p>
          <p className="mt-1 text-xl font-bold text-white">{brl(financeiro.totalOrcamentoBRL)}</p>
          <p className="mt-1 text-xs text-slate-400">Importação + impostos venda + margem</p>
        </div>
      </div>

      <p className="rounded-lg border border-white/10 bg-ink-900/40 px-4 py-3 text-center text-sm text-slate-300">
        <span className="text-slate-500">{brl(financeiro.custoImportacaoBRL)}</span>
        <span className="mx-2 text-slate-600">+</span>
        <span className="text-amber-400/90">{brl(financeiro.impostosSaidaBRL)}</span>
        <span className="mx-2 text-slate-600">+</span>
        <span className="text-emerald-400">{brl(financeiro.markupBRL)}</span>
        <span className="mx-2 text-slate-600">=</span>
        <span className="font-semibold text-white">{brl(financeiro.totalOrcamentoBRL)}</span>
        <span className="mt-1 block text-xs text-slate-500">
          Custo import. + Imp. venda + Lucro trade
        </span>
      </p>

      {resultado && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <p className="font-medium text-slate-300">Breakdown impostos de venda</p>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <p className="text-slate-400">
              ICMS saída: <span className="text-amber-200/90">{brl(resultado.saida.icmsSaida)}</span>
            </p>
            <p className="text-slate-400">
              DIF IPI: <span className="text-amber-200/90">{brl(resultado.saida.difIPI)}</span>
            </p>
            <p className="text-slate-400">
              DIF PIS: <span className="text-amber-200/90">{brl(resultado.saida.difPIS)}</span>
            </p>
            <p className="text-slate-400">
              DIF COFINS: <span className="text-amber-200/90">{brl(resultado.saida.difCOFINS)}</span>
            </p>
            <p className="text-slate-400">
              CSLL: <span className="text-amber-200/90">{brl(resultado.saida.csll)}</span>
            </p>
            <p className="text-slate-400">
              IRRF: <span className="text-amber-200/90">{brl(resultado.saida.irrf)}</span>
            </p>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-500">Entrada + taxas locais</summary>
            <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              <p>Impostos entrada: {brl(resultado.entrada.impostosEntradaTotal)}</p>
              <p>Taxas locais: {brl(resultado.saida.taxasLocaisTotalBRL)}</p>
              <p>Venda líquida: {brl(resultado.saida.vendaLiquida)}</p>
              <p>Margem s/ custo: {pct(financeiro.margemSobreCustoPct)}</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function AnalisePainel({
  analise,
  onSalvar,
  salvando,
  salvaId,
  editorDraft,
  onEditorChange,
  onAplicarEditor,
  aplicandoEditor,
  onBaixarPdfCliente,
  irParaOrcamento,
  onAlterarAliquota,
  recalculandoAliquota,
  onDesfazerAliquota,
  desfazendoAliquota,
  onConfirmarNcm,
  confirmandoNcm,
  onDesfazerNcm,
}: {
  analise: AnaliseView;
  onSalvar?: () => void;
  salvando?: boolean;
  salvaId?: string | null;
  editorDraft?: EditorDraft;
  onEditorChange?: (d: EditorDraft) => void;
  onAplicarEditor?: () => void;
  aplicandoEditor?: boolean;
  onBaixarPdfCliente?: () => void | Promise<void>;
  /** Incrementar para abrir a aba Orçamento cliente e rolar até o preview. */
  irParaOrcamento?: number;
  onAlterarAliquota?: (idx: number, campo: AliquotaCampo, valor: number) => void | Promise<void>;
  recalculandoAliquota?: boolean;
  onDesfazerAliquota?: (idx: number, campo: ChaveTributoRastro) => void | Promise<void>;
  desfazendoAliquota?: { idx: number; campo: ChaveTributoRastro } | null;
  onConfirmarNcm?: (idx: number) => void | Promise<void>;
  confirmandoNcm?: number | null;
  onDesfazerNcm?: (idx: number) => void | Promise<void>;
}) {
  const itens = analise.itens;
  const qtdPendentesNcm = itensPendentesConfirmacaoNcm(itens).length;
  const ncmBloqueiaPdfInicial = pdfBloqueadoPorNcm(itens);
  const [aba, setAba] = useState<"orcamento" | "tecnica">(() => {
    if (qtdPendentesNcm > 0 || ncmBloqueiaPdfInicial) return "tecnica";
    if (salvaId && contarItensComFoto(itens) === 0) return "tecnica";
    return "orcamento";
  });
  const [exportandoConc, setExportandoConc] = useState<"xlsx" | "csv" | null>(null);

  async function exportarConciliacao(fmt: "xlsx" | "csv") {
    setExportandoConc(fmt);
    try {
      if (salvaId) {
        await api.exportarConciliacaoSalva(salvaId, fmt);
      } else {
        await api.exportarConciliacaoAnalise(
          {
            cotacao: analise.cotacao,
            itens,
            resultado: analise.resultado,
            provider: (analise as { provider?: string | null }).provider,
          },
          fmt,
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Falha ao exportar conciliação.");
    } finally {
      setExportandoConc(null);
    }
  }

  useEffect(() => {
    if (!irParaOrcamento) return;
    setAba("orcamento");
    requestAnimationFrame(() => {
      document.getElementById("preview-orcamento-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [irParaOrcamento]);
  const qtdFotos = contarItensComFoto(itens);
  const ncmBloqueiaPdf = pdfBloqueadoPorNcm(itens);
  const motivoBloqueioPdf = resumoBloqueioNcm(itens);
  const avisoCompatPdf = avisoCompatibilidadePdf(itens);
  const provider = (analise as { provider?: string | null }).provider ?? "—";
  const canais = resumoCanais(itens);
  const financeiro =
    "financeiro" in analise && analise.financeiro
      ? analise.financeiro
      : extrairResumoFinanceiro(analise.resultado, analise.cotacao.params.markupPct);

  const conteudoTecnico: ReactNode = (
    <>
      <ResumoFinanceiroPainel financeiro={financeiro} resultado={analise.resultado} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Exportar conciliação:</span>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={exportandoConc != null}
          onClick={() => void exportarConciliacao("xlsx")}
        >
          {exportandoConc === "xlsx" ? "Gerando XLSX…" : "XLSX"}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={exportandoConc != null}
          onClick={() => void exportarConciliacao("csv")}
        >
          {exportandoConc === "csv" ? "Gerando CSV…" : "CSV"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.entries(canais) as [Canal, number][]).map(([canal, qtd]) => (
          <span key={canal} className={`rounded-full px-3 py-1 text-xs font-medium ${CANAL_STYLE[canal]}`}>
            {CANAL_LABEL[canal]}: {qtd}
          </span>
        ))}
        {qtdFotos > 0 && (
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
            {qtdFotos} foto(s) de produto
          </span>
        )}
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
        <p className="sticky top-0 z-10 border-b border-white/10 bg-ink-800/95 px-3 py-2 text-xs text-slate-400">
          Alíquotas de importação editáveis (II, IPI, PIS, COFINS, ICMS) — altere e saia do campo para recalcular.
          {recalculandoAliquota && <span className="ml-2 text-brand-300">Recalculando…</span>}
        </p>
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="sticky top-8 bg-ink-800 text-slate-400">
            <tr>
              <th className="p-2 w-14">Foto</th>
              <th className="p-2">Descrição (PT)</th>
              <th className="p-2">NCM</th>
              <th className="p-2">II %</th>
              <th className="p-2">IPI %</th>
              <th className="p-2">PIS %</th>
              <th className="p-2">COFINS %</th>
              <th className="p-2">ICMS imp. %</th>
              <th className="p-2">FOB US$</th>
              <th className="p-2">FOB US$/kg</th>
              <th className="p-2">Ref ComexStat</th>
              <th className="p-2">Desvio ref</th>
              <th className="p-2">Canal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => {
              const fobKg = fobKgItem(it);
              const foto = fotoItemSrc(it);
              return (
                <tr key={i} className="border-t border-white/5 text-slate-300">
                  <td className="p-2 align-top">
                    {foto ? (
                      <img
                        src={foto}
                        alt=""
                        className="h-12 w-12 rounded border border-white/10 object-contain bg-white"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                  </td>
                  <td className="max-w-xs p-2">
                    <div className="truncate font-medium text-white">{it.descPt || it.descOriginal}</div>
                    <div className="truncate text-slate-500">{it.descDuimp.slice(0, 80)}</div>
                  </td>
                  <td className="max-w-[11rem] p-2 align-top">
                    <span className={it.ncmValido === false ? "font-semibold text-red-400" : "text-emerald-300"}>
                      {fmtNcm(it.ncm || "00000000")}
                    </span>
                    {it.compatibilidadeProduto === "incompativel" && (
                      <span
                        className="mt-0.5 block text-[10px] font-semibold text-orange-400"
                        title={it.motivoCompatibilidade}
                      >
                        ⚠ NCM × produto incompatível
                      </span>
                    )}
                    {it.compatibilidadeProduto === "revisar" && (
                      <span
                        className="mt-0.5 block text-[10px] font-medium text-amber-400"
                        title={it.motivoCompatibilidade}
                      >
                        ◐ revisar compatibilidade
                      </span>
                    )}
                    {it.compatibilidadeProduto === "compativel" && (
                      <span className="mt-0.5 block text-[10px] text-slate-500" title={it.motivoCompatibilidade}>
                        ✓ compatível
                      </span>
                    )}
                    {it.ncmPlanilhaOriginal && it.ncmPlanilhaOriginal !== it.ncm && (
                      <span className="block text-[10px] text-red-400/80 line-through">
                        planilha: {fmtNcm(it.ncmPlanilhaOriginal)}
                      </span>
                    )}
                    {it.ncmFonte && (
                      <span className="block text-[10px] text-slate-500">
                        {it.ncmFonte === "siscomex" ? "Siscomex vigente" : it.ncmFonte}
                      </span>
                    )}
                    {it.ncmDescricaoOficial && (
                      <span className="block max-w-[12rem] text-[10px] text-slate-500 truncate" title={it.ncmDescricaoOficial}>
                        {it.ncmDescricaoOficial.slice(0, 50)}
                      </span>
                    )}
                    {it.ncmAvisos?.slice(0, 1).map((a, j) => (
                      <span key={j} className="block max-w-[12rem] text-[10px] text-amber-400/90" title={a}>
                        {a.slice(0, 70)}{a.length > 70 ? "…" : ""}
                      </span>
                    ))}
                    {it.ncmConfianca != null && it.ncmConfianca < 0.85 && it.compatibilidadeProduto !== "revisar" && (
                      <span className="mt-0.5 block text-[10px] font-medium text-amber-400" title="Confiança NCM abaixo do limiar">
                        ◐ baixa confiança NCM ({(it.ncmConfianca * 100).toFixed(0)}%)
                      </span>
                    )}
                    <div className="mt-1.5 space-y-1 border-t border-white/10 pt-1">
                    {itemPodeConfirmarNcm(it) && onConfirmarNcm && (
                      <button
                        type="button"
                        className="block w-full rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        disabled={confirmandoNcm === i}
                        onClick={() => void onConfirmarNcm(i)}
                      >
                        {confirmandoNcm === i ? "Confirmando…" : "Confirmar NCM"}
                      </button>
                    )}
                    {itemPodeDesfazerNcm(it) && onDesfazerNcm && (
                      <button
                        type="button"
                        className="block w-full rounded bg-slate-600/80 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-500 disabled:opacity-50"
                        disabled={confirmandoNcm === i}
                        onClick={() => void onDesfazerNcm(i)}
                      >
                        {confirmandoNcm === i ? "…" : "Desfazer confirmação"}
                      </button>
                    )}
                    {itemPodeDesfazerNcm(it) && (
                      <span
                        className="block text-[10px] font-medium text-emerald-400"
                        title={[
                          it.ncmRevisadoEm ? `Confirmado em ${it.ncmRevisadoEm}` : "",
                          it.ncmConfirmado ? `NCM ${fmtNcm(it.ncmConfirmado)}` : "",
                          it.ncmConfirmadoPor ? `por ${it.ncmConfirmadoPor}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        ✓ NCM confirmado
                        {it.ncmConfirmadoPor ? ` · ${it.ncmConfirmadoPor}` : ""}
                        {it.ncmRevisadoEm ? ` · ${fmtData(it.ncmRevisadoEm)}` : ""}
                      </span>
                    )}
                    </div>
                  </td>
                  {(["ii", "ipi", "pis", "cofins"] as const).map((campo) => (
                    <td key={campo} className="p-2 align-top">
                      {onAlterarAliquota ? (
                        <InputAliquotaImport
                          value={it.aliquotas[campo]}
                          disabled={recalculandoAliquota}
                          onCommit={(v) => void onAlterarAliquota(i, campo, v)}
                        />
                      ) : (
                        <span>{pct(it.aliquotas[campo])}</span>
                      )}
                      <DetalheRastroAliquota
                        it={it}
                        campo={campo}
                        onDesfazer={
                          onDesfazerAliquota && it.aliquotasRastro?.[campo]?.origem === "manual"
                            ? () => void onDesfazerAliquota(i, campo)
                            : undefined
                        }
                        desfazendo={
                          desfazendoAliquota?.idx === i && desfazendoAliquota?.campo === campo
                        }
                      />
                    </td>
                  ))}
                  <td className="p-2 align-top">
                    {onAlterarAliquota ? (
                      <InputAliquotaImport
                        value={it.aliquotas.icmsEntrada}
                        disabled={recalculandoAliquota}
                        onCommit={(v) => void onAlterarAliquota(i, "icmsEntrada", v)}
                      />
                    ) : (
                      <span>{pct(it.aliquotas.icmsEntrada)}</span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">{it.fobTotalUS > 0 ? it.fobTotalUS.toFixed(2) : "—"}</td>
                  <td className="p-2 whitespace-nowrap">
                    {fobKg.principal != null ? (
                      <>
                        <span className={fobKg.ajustado ? "font-medium text-amber-300" : ""}>{usdKg(fobKg.principal)}</span>
                        {fobKg.ajustado && fobKg.original != null && (
                          <span className="block text-[10px] text-slate-500">orig. {usdKg(fobKg.original)}</span>
                        )}
                        {it.pesoLiqKg > 0 && (
                          <span className="block text-[10px] text-slate-500">{it.pesoLiqKg.toLocaleString("pt-BR")} kg</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                    {it.fobPendente && (
                      <span className="mt-0.5 block text-[10px] font-semibold text-amber-400" title={it.fobKgAvisos?.join(" ")}>
                        ⚠ FOB pendente
                      </span>
                    )}
                    {it.fobKgFonte && !it.fobPendente && (
                      <span className="mt-0.5 block max-w-[10rem] truncate text-[10px] text-slate-500" title={it.fobKgFonte}>
                        {it.fobKgFonte}
                      </span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {it.benchmark?.mediaFobKg != null ? (
                      <>
                        <span className="text-emerald-300">{usdKg(it.benchmark.mediaFobKg)}</span>
                        <span className="block text-[10px] text-slate-500">{it.benchmark.fonte}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">sem ref</span>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {it.benchmark?.mediaFobKg != null ? (
                      <>
                        {it.calibracao?.desvioBenchmarkPct != null ? (
                          <span
                            className={
                              Math.abs(it.calibracao.desvioBenchmarkPct) > 25
                                ? "font-medium text-amber-300"
                                : "text-slate-300"
                            }
                          >
                            {it.calibracao.desvioBenchmarkPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                        {it.calibracao?.ajustado && (
                          <span className="block text-[10px] text-amber-400">calibrado</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500">sem base</span>
                    )}
                  </td>
                  <td className="p-2">
                    {it.risco && (
                      <span className={`rounded px-2 py-0.5 ${CANAL_STYLE[it.risco.canal]}`}>
                        {CANAL_LABEL[it.risco.canal]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="space-y-6 text-left">
      {editorDraft && onEditorChange && onAplicarEditor && (
        <PainelEditorCotacao
          draft={editorDraft}
          onChange={onEditorChange}
          onAplicar={onAplicarEditor}
          aplicando={aplicandoEditor}
          modo={salvaId ? "salva" : "analise"}
        />
      )}

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
        <p className="font-semibold text-white">
          {salvaId ? "Cotação salva" : "Análise concluída"}
          {salvaId && <span className="ml-2 text-xs font-normal text-slate-400">#{salvaId.slice(0, 8)}</span>}
        </p>
        <p className="mt-1 text-sm text-slate-300">
          Provedor: {provider} · {itens.length} itens · {analise.cotacao.empresaTrade || "—"} →{" "}
          {analise.cotacao.cliente} · rota {analise.cotacao.origem} → {analise.cotacao.destino} · ICMS{" "}
          {pct(analise.cotacao.params.icmsSaida)}
        </p>
        {analise.avisoFiscal && <p className="mt-2 text-sm text-amber-300">{analise.avisoFiscal}</p>}
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-1">
        <button
          type="button"
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
            aba === "orcamento" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
          }`}
          onClick={() => setAba("orcamento")}
        >
          Orçamento cliente
        </button>
        <button
          type="button"
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
            aba === "tecnica" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
          }`}
          onClick={() => setAba("tecnica")}
        >
          Detalhamento técnico
          {qtdPendentesNcm > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
              {qtdPendentesNcm} NCM
            </span>
          )}
        </button>
      </div>

      {aba === "orcamento" ? (
        <div id="preview-orcamento-cliente" className="space-y-3">
          {ncmBloqueiaPdf && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {motivoBloqueioPdf}
              {qtdPendentesNcm > 0 && (
                <button
                  type="button"
                  className="mt-2 block rounded bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  onClick={() => setAba("tecnica")}
                >
                  Confirmar NCM ({qtdPendentesNcm} item{qtdPendentesNcm === 1 ? "" : "s"}) — abrir Detalhamento técnico
                </button>
              )}
            </div>
          )}
          {avisoCompatPdf && (
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
              {avisoCompatPdf}
            </div>
          )}
          <PreviewOrcamentoCliente
            cotacao={analise.cotacao}
            itens={itens}
            resultado={analise.resultado}
            onBaixarPdf={onBaixarPdfCliente}
            salvo={Boolean(salvaId)}
            criadoEm={"criadoEm" in analise ? analise.criadoEm : undefined}
            pdfBloqueado={ncmBloqueiaPdf}
            motivoBloqueioPdf={motivoBloqueioPdf}
            avisoCompatibilidade={avisoCompatPdf}
          />
        </div>
      ) : (
        conteudoTecnico
      )}

      {!salvaId && onSalvar && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-center text-xs text-slate-400">
            Revise o orçamento na aba acima antes de salvar e enviar ao cliente.
          </p>
          <button type="button" className="btn-primary w-full" disabled={salvando} onClick={onSalvar}>
            {salvando ? "Salvando…" : "Salvar cotação"}
          </button>
        </div>
      )}
    </div>
  );
}

function ModalDuplicar({
  cotacao,
  onClose,
  onConfirm,
  loading,
}: {
  cotacao: CotacaoResumo;
  onClose: () => void;
  onConfirm: (markupPct: number) => void;
  loading: boolean;
}) {
  const [markup, setMarkup] = useState(Math.min(0.25, cotacao.markupPct + 0.02));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white">Duplicar com nova margem</h3>
        <p className="mt-2 text-sm text-slate-400">
          {cotacao.cliente} · markup atual {pct(cotacao.markupPct)}
        </p>
        <div className="mt-6">
          <label className="label">Novo markup — {pct(markup)}</label>
          <input
            type="range"
            min={0}
            max={0.25}
            step={0.005}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0%</span>
            <span>25%</span>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => onConfirm(markup)}>
            {loading ? "Gerando…" : "Duplicar e recalcular"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("painel");
  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [origemVoltar, setOrigemVoltar] = useState<"lista" | "clientes">("lista");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState("");

  const [lista, setLista] = useState<CotacaoResumo[]>([]);
  const [totalHoje, setTotalHoje] = useState(0);
  const [listaLoading, setListaLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof api.parse>> | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseCompleta | null>(null);
  const [cliente, setCliente] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvaId, setSalvaId] = useState<string | null>(null);

  const [detalhe, setDetalhe] = useState<CotacaoSalva | null>(null);
  const [dupAlvo, setDupAlvo] = useState<CotacaoResumo | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [aplicandoEditor, setAplicandoEditor] = useState(false);
  const [recalculandoAliquota, setRecalculandoAliquota] = useState(false);
  const [desfazendoAliquota, setDesfazendoAliquota] = useState<{ idx: number; campo: ChaveTributoRastro } | null>(
    null,
  );
  const [confirmandoNcm, setConfirmandoNcm] = useState<number | null>(null);
  const [pdfBaixando, setPdfBaixando] = useState<"cliente" | "trade" | null>(null);
  const [irParaOrcamento, setIrParaOrcamento] = useState(0);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [series, setSeries] = useState<DashboardSeries | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);

  const carregarPainel = useCallback(async () => {
    setKpisLoading(true);
    try {
      const [k, s] = await Promise.all([api.dashboardKpis(), api.dashboardSeries(12)]);
      setKpis(k);
      setSeries(s);
    } catch (e) {
      setKpis(null);
      setSeries(null);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("abort") || msg.includes("AbortError")) {
        setErro("API demorou para responder. Recarregue a página ou tente novamente.");
      }
    } finally {
      setKpisLoading(false);
    }
  }, []);

  const carregarLista = useCallback(async (cliente?: string) => {
    setListaLoading(true);
    try {
      const res = await api.listarCotacoes(cliente?.trim() || undefined);
      setLista(res.cotacoes);
      setTotalHoje(res.totalHoje);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar cotações.");
    } finally {
      setListaLoading(false);
    }
  }, []);

  const carregarClientes = useCallback(async (q?: string) => {
    setClientesLoading(true);
    try {
      const res = await api.dashboardClientes(q);
      setClientes(res.clientes);
    } catch {
      setClientes([]);
    } finally {
      setClientesLoading(false);
    }
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
    void carregarPainel();
    void carregarLista();
  }, [carregarPainel, carregarLista]);

  function irNav(n: NavItem) {
    setErro("");
    if (n === "nova") irNova();
    else if (n === "painel") {
      setView("painel");
      void carregarPainel();
    } else if (n === "lista") {
      setView("lista");
      void carregarLista(filtroAtivo || undefined);
    } else if (n === "clientes") {
      setView("clientes");
      void carregarClientes(busca || undefined);
    } else if (n === "referencia") {
      setView("referencia");
    }
  }

  function submitBusca() {
    const q = busca.trim();
    setFiltroAtivo(q);
    setOrigemVoltar(view === "clientes" ? "clientes" : "lista");
    setView("lista");
    void carregarLista(q || undefined);
  }

  function voltarParaClientes() {
    setBusca("");
    setFiltroAtivo("");
    setView("clientes");
    void carregarClientes();
  }

  function voltarDoDetalhe() {
    setDetalhe(null);
    setEditorDraft(null);
    if (origemVoltar === "clientes") {
      setView("clientes");
      void carregarClientes(busca.trim() || undefined);
    } else {
      setView("lista");
      void carregarLista(filtroAtivo || undefined);
    }
  }

  function voltarDaLista() {
    if (origemVoltar === "clientes" || filtroAtivo) {
      voltarParaClientes();
      return;
    }
    setFiltroAtivo("");
    setBusca("");
    void carregarLista();
  }

  function irNova() {
    setView("nova");
    setErro("");
    setParsed(null);
    setAnalise(null);
    setSalvaId(null);
    setCliente("");
    setDetalhe(null);
    setEditorDraft(null);
  }

  async function abrirCotacao(id: string, origem: "lista" | "clientes" = "lista") {
    setOrigemVoltar(origem);
    setErro("");
    try {
      const c = await api.buscarCotacao(id);
      setDetalhe(c);
      setEditorDraft(editorFromCotacao(c.cotacao));
      setView("detalhe");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao abrir cotação.");
    }
  }

  async function aplicarEditorAnalise() {
    if (!analise || !editorDraft) return;
    setAplicandoEditor(true);
    setErro("");
    try {
      const cotacao = { ...aplicarEditorNaCotacao(analise.cotacao, editorDraft), itens: analise.itens };
      const { resultado, itens } = await api.calcular(cotacao);
      setAnalise({ ...analise, cotacao, resultado, itens });
      setCliente(editorDraft.cliente);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao recalcular.");
    } finally {
      setAplicandoEditor(false);
    }
  }

  async function alterarAliquotaItem(idx: number, campo: AliquotaCampo, valor: number) {
    const base = analise ?? detalhe;
    if (!base) return;
    const itAtual = base.itens[idx];
    if (!itAtual) return;
    const editadoPor = user?.email ?? user?.nome;
    const itEditado =
      campo === "icmsEntrada"
        ? {
            ...itAtual,
            aliquotas: { ...itAtual.aliquotas, icmsEntrada: valor },
            aliquotasOverride: true,
          }
        : aplicarOverrideManualAliquota(itAtual, campo, valor, editadoPor);
    const itens = base.itens.map((it, i) => (i === idx ? itEditado : it));
    const draft = editorDraft ?? editorFromCotacao(base.cotacao, "cliente" in base ? base.cotacao.cliente : cliente);
    const cotacao = { ...aplicarEditorNaCotacao(base.cotacao, draft), itens };
    setRecalculandoAliquota(true);
    setErro("");
    try {
      if (detalhe?.id) {
        const atualizada = await api.atualizarCotacao(detalhe.id, {
          ...payloadAtualizar(draft),
          itensAliquotas: [
            {
              ordem: idx,
              aliquotas: itEditado.aliquotas,
              aliquotasOverride: itEditado.aliquotasOverride,
            },
          ],
        });
        setDetalhe(atualizada);
        setEditorDraft(editorFromCotacao(atualizada.cotacao));
        return;
      }
      const { resultado, itens: itensNovos } = await api.calcular(cotacao);
      if (analise) setAnalise({ ...analise, cotacao, resultado, itens: itensNovos });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao recalcular alíquotas.");
    } finally {
      setRecalculandoAliquota(false);
    }
  }

  async function desfazerAliquotaItem(idx: number, campo: ChaveTributoRastro) {
    const base = analise ?? detalhe;
    if (!base) return;
    setDesfazendoAliquota({ idx, campo });
    setErro("");
    try {
      if (detalhe?.id) {
        const draft = editorDraft ?? editorFromCotacao(base.cotacao);
        const atualizada = await api.atualizarCotacao(detalhe.id, {
          ...payloadAtualizar(draft),
          itensAliquotas: [{ ordem: idx, desfazerTributos: [campo] }],
        });
        setDetalhe(atualizada);
        setEditorDraft(editorFromCotacao(atualizada.cotacao));
        return;
      }
      const itAtual = base.itens[idx];
      if (!itAtual) return;
      const itEditado = desfazerOverrideManualAliquota(itAtual, campo);
      const itens = base.itens.map((it, i) => (i === idx ? itEditado : it));
      const draft = editorDraft ?? editorFromCotacao(base.cotacao, "cliente" in base ? base.cotacao.cliente : cliente);
      const cotacao = { ...aplicarEditorNaCotacao(base.cotacao, draft), itens };
      const { resultado, itens: itensNovos } = await api.calcular(cotacao);
      if (analise) setAnalise({ ...analise, cotacao, resultado, itens: itensNovos });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao desfazer alíquota.");
    } finally {
      setDesfazendoAliquota(null);
    }
  }

  async function confirmarNcmItem(idx: number) {
    const base = analise ?? detalhe;
    if (!base) return;
    setConfirmandoNcm(idx);
    setErro("");
    const confirmadoPor = user?.email ?? user?.nome;
    try {
      const idSalvo = detalhe?.id ?? salvaId;
      if (idSalvo) {
        const atualizada = await api.confirmarNcmItem(idSalvo, idx, confirmadoPor);
        if (detalhe?.id) {
          setDetalhe(atualizada);
        } else if (analise) {
          setAnalise({ ...analise, itens: atualizada.itens });
        }
        return;
      }
      const itens = base.itens.map((it, i) =>
        i === idx ? { ...it, ...metaConfirmacaoNcm(it.ncm, confirmadoPor) } : it,
      );
      if (analise) setAnalise({ ...analise, itens });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao confirmar NCM.");
    } finally {
      setConfirmandoNcm(null);
    }
  }

  async function desfazerNcmItem(idx: number) {
    const base = analise ?? detalhe;
    if (!base) return;
    setConfirmandoNcm(idx);
    setErro("");
    try {
      const idSalvo = detalhe?.id ?? salvaId;
      if (idSalvo) {
        const atualizada = await api.desfazerNcmItem(idSalvo, idx);
        if (detalhe?.id) {
          setDetalhe(atualizada);
        } else if (analise) {
          setAnalise({ ...analise, itens: atualizada.itens });
        }
        return;
      }
      const itens = base.itens.map((it, i) => (i === idx ? limparConfirmacaoNcm(it) : it));
      if (analise) setAnalise({ ...analise, itens });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao desfazer confirmação.");
    } finally {
      setConfirmandoNcm(null);
    }
  }

  async function baixarPdf(tipo: "cliente" | "trade") {
    if (!detalhe) return;
    setPdfBaixando(tipo);
    setErro("");
    try {
      await api.baixarPdf(detalhe.id, tipo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setPdfBaixando(null);
    }
  }

  async function baixarPdfClienteOrcamento() {
    setErro("");
    try {
      const idSalvo = detalhe?.id ?? salvaId;
      if (idSalvo) {
        await api.baixarPdf(idSalvo, "cliente");
        return;
      }
      if (!analise) return;
      const draft = editorDraft ?? editorFromCotacao(analise.cotacao, cliente);
      const cotacao = aplicarEditorNaCotacao(analise.cotacao, draft);
      await api.previewPdf({ cotacao, itens: analise.itens, resultado: analise.resultado }, "cliente");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      setErro(msg.includes("abort") ? "Geração do PDF demorou demais. Tente novamente." : msg);
      throw e;
    }
  }

  async function aplicarEditorDetalhe() {
    if (!detalhe || !editorDraft) return;
    setAplicandoEditor(true);
    setErro("");
    try {
      const atualizada = await api.atualizarCotacao(detalhe.id, payloadAtualizar(editorDraft));
      setDetalhe(atualizada);
      setEditorDraft(editorFromCotacao(atualizada.cotacao));
      await carregarLista();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar cotação.");
    } finally {
      setAplicandoEditor(false);
    }
  }

  async function processarArquivo(file: File) {
    setErro("");
    setParsed(null);
    setAnalise(null);
    setSalvaId(null);
    setUploading(true);
    try {
      const resultado = await api.parse(file);
      setParsed(resultado);
      const base = file.name.replace(/\.[^.]+$/, "");
      setCliente(base);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function iniciarAnalise() {
    if (!parsed?.linhas.length) return;
    setErro("");
    setAnalisando(true);
    setAnalise(null);
    setSalvaId(null);
    try {
      const res = await api.analisar(parsed.linhas);
      setAnalise(res);
      setEditorDraft(editorFromCotacao(res.cotacao, cliente));
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.name === "AbortError"
            ? "Análise demorou demais — tente com menos linhas."
            : e.message
          : "Falha na análise IA.",
      );
    } finally {
      setAnalisando(false);
    }
  }

  async function salvarAnalise() {
    if (!analise || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const draft = editorDraft ?? editorFromCotacao(analise.cotacao, cliente);
      const cotacao = cotacaoParaSalvar(aplicarEditorNaCotacao(analise.cotacao, draft));
      const salva = await api.salvarCotacao({
        cotacao,
        itens: itensParaSalvar(analise.itens),
        resultado: analise.resultado,
        provider: analise.provider,
      });
      setSalvaId(salva.id);
      await carregarLista();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      setErro(
        msg.includes("abort") || msg.includes("AbortError")
          ? "Salvar demorou demais. Verifique a conexão e tente novamente."
          : msg.includes("413")
            ? "Planilha com fotos muito grandes. Tente salvar de novo ou reduza as imagens."
            : msg,
      );
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarDuplicar(markupPct: number) {
    if (!dupAlvo) return;
    setDuplicando(true);
    setErro("");
    try {
      const nova = await api.duplicarCotacao(dupAlvo.id, { markupPct });
      setDupAlvo(null);
      await carregarLista();
      setDetalhe(nova);
      setView("detalhe");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao duplicar.");
    } finally {
      setDuplicando(false);
    }
  }

  async function excluirCotacao(c: CotacaoResumo) {
    const msg = `Excluir a cotação de "${c.cliente}"?\n\nEsta ação não pode ser desfeita.`;
    if (!window.confirm(msg)) return;

    setExcluindoId(c.id);
    setErro("");
    try {
      await api.excluirCotacao(c.id);
      if (detalhe?.id === c.id) {
        setDetalhe(null);
        setEditorDraft(null);
        setView("lista");
      }
      await Promise.all([
        carregarLista(filtroAtivo || undefined),
        carregarPainel(),
        carregarClientes(busca.trim() || undefined),
      ]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir cotação.");
    } finally {
      setExcluindoId(null);
    }
  }

  const navAtivo: NavItem = view === "detalhe" ? "lista" : view;

  return (
    <AppShell
      nav={navAtivo}
      onNav={irNav}
      userEmail={user?.email}
      totalHoje={totalHoje}
      busca={busca}
      onBuscaChange={setBusca}
      onBuscaSubmit={submitBusca}
      onLogout={logout}
    >
      <div className="container-cia py-6 md:py-8">
        {erro && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {erro}
          </p>
        )}

        {view === "referencia" && (
          <BenchmarkReferenciaView />
        )}

        {view === "painel" && (
          <div className="card overflow-hidden">
            <PainelKpisView
              kpis={kpis}
              series={series}
              loading={kpisLoading}
              onAbrir={(id) => void abrirCotacao(id)}
            />
          </div>
        )}

        {view === "clientes" && (
          <div className="card overflow-hidden">
            <ClientesView
              clientes={clientes}
              loading={clientesLoading}
              busca={busca}
              onVoltar={busca.trim() ? voltarParaClientes : undefined}
              onAbrirCliente={(nome) => {
                setBusca(nome);
                setFiltroAtivo(nome);
                setOrigemVoltar("clientes");
                setView("lista");
                void carregarLista(nome);
              }}
              onAbrirCotacao={(id) => void abrirCotacao(id, "clientes")}
            />
          </div>
        )}

        {view === "lista" && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-start gap-3">
                {(filtroAtivo || origemVoltar === "clientes") && (
                  <button type="button" className="btn-ghost mt-0.5 py-1.5 text-xs" onClick={voltarDaLista}>
                    ← Voltar
                  </button>
                )}
                <div>
                  <h2 className="text-lg font-bold text-white">Minhas cotações</h2>
                  <p className="text-sm text-slate-400">
                    {lista.length} processo(s)
                    {filtroAtivo ? ` · filtro “${filtroAtivo}”` : " salvos"}
                  </p>
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={irNova}>
                + Nova cotação
              </button>
            </div>
            {listaLoading ? (
              <p className="p-8 text-center text-slate-400">Carregando…</p>
            ) : lista.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400">Nenhuma cotação salva ainda.</p>
                <button type="button" className="btn-primary mt-4" onClick={irNova}>
                  Criar primeira cotação
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <p className="border-b border-white/5 px-6 py-2 text-xs text-slate-500">
                  Orçamento = <span className="text-slate-400">Custo import.</span> +{" "}
                  <span className="text-amber-500/80">Imp. venda</span> +{" "}
                  <span className="text-emerald-500/80">Lucro trade</span>
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-800/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-3 py-3" aria-label="Excluir" />
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Itens</th>
                      <th className="px-4 py-3">Destino</th>
                      <th className="px-4 py-3">Custo import.</th>
                      <th className="px-4 py-3">Imp. venda</th>
                      <th className="px-4 py-3">Lucro trade</th>
                      <th className="px-4 py-3">Orçamento</th>
                      <th className="px-4 py-3">Canal</th>
                      <th className="sticky right-0 bg-ink-800/95 px-4 py-3 text-right shadow-[-8px_0_12px_rgba(0,0,0,0.35)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-t border-white/5 hover:bg-white/[0.04]"
                        onClick={() => void abrirCotacao(c.id)}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                            title="Excluir cotação"
                            aria-label={`Excluir cotação de ${c.cliente}`}
                            disabled={excluindoId === c.id}
                            onClick={() => void excluirCotacao(c)}
                          >
                            <IconLixeira />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">{c.cliente}</td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtData(c.criadoEm)}</td>
                        <td className="px-4 py-3 text-slate-300">{c.totalItens}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          {c.destino ?? "—"}
                          {c.icmsSaidaPct != null && (
                            <span className="ml-1 text-xs text-slate-500">({pct(c.icmsSaidaPct)})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {c.custoImportacaoBRL != null ? brl(c.custoImportacaoBRL) : "—"}
                        </td>
                        <td className="px-4 py-3 text-amber-200/80">
                          {c.impostosSaidaBRL != null ? brl(c.impostosSaidaBRL) : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-emerald-300">
                          {c.markupBRL != null ? (
                            <>
                              {brl(c.markupBRL)}
                              <span className="ml-1 text-xs text-emerald-500/80">({pct(c.markupPct)})</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {c.totalBRL != null ? brl(c.totalBRL) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {c.canalPredominante && (
                            <span className={`rounded px-2 py-0.5 text-xs ${CANAL_STYLE[c.canalPredominante]}`}>
                              {CANAL_LABEL[c.canalPredominante]}
                            </span>
                          )}
                        </td>
                        <td className="sticky right-0 bg-ink-900/95 px-4 py-3 text-right shadow-[-8px_0_12px_rgba(0,0,0,0.35)]" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-primary py-1.5 text-xs"
                            onClick={() => void abrirCotacao(c.id)}
                          >
                            Abrir cotação
                          </button>
                          <button type="button" className="btn-ghost ml-2 py-1 text-xs" onClick={() => setDupAlvo(c)}>
                            Duplicar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === "detalhe" && detalhe && (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{detalhe.cotacao.cliente}</h2>
                <p className="text-sm text-slate-400">Salva em {fmtData(detalhe.criadoEm)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIrParaOrcamento((n) => n + 1)}
                >
                  Ver orçamento cliente
                </button>
                <button
                  type="button"
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pdfBaixando != null || pdfBloqueadoPorNcm(detalhe.itens)}
                  title={
                    pdfBloqueadoPorNcm(detalhe.itens) ? resumoBloqueioNcm(detalhe.itens) : undefined
                  }
                  onClick={() => void baixarPdf("trade")}
                >
                  {pdfBaixando === "trade" ? "Gerando…" : "PDF trade"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setDupAlvo({
                      id: detalhe.id,
                      cliente: detalhe.cotacao.cliente,
                      status: detalhe.status,
                      totalBRL: detalhe.totalBRL,
                      canalPredominante: detalhe.canalPredominante,
                      origem: detalhe.cotacao.origem,
                      destino: detalhe.cotacao.destino,
                      icmsSaidaPct: detalhe.cotacao.params.icmsSaida,
                      markupPct: detalhe.cotacao.params.markupPct,
                      markupBRL: detalhe.financeiro?.markupBRL ?? null,
                      lucroLiquidoTradeBRL: detalhe.financeiro?.lucroLiquidoTradeBRL ?? null,
                      custoImportacaoBRL: detalhe.financeiro?.custoImportacaoBRL ?? null,
                      impostosSaidaBRL: detalhe.financeiro?.impostosSaidaBRL ?? null,
                      custoOperacionalBRL: detalhe.financeiro?.custoImportacaoBRL ?? null,
                      totalItens: detalhe.itens.length,
                      criadoEm: detalhe.criadoEm,
                    })
                  }
                >
                  Duplicar + margem
                </button>
                <button type="button" className="btn-ghost" onClick={voltarDoDetalhe}>
                  ← Voltar
                </button>
              </div>
            </div>
            <div className="card p-6">
              <AnalisePainel
                analise={detalhe}
                salvaId={detalhe.id}
                editorDraft={editorDraft ?? undefined}
                onEditorChange={setEditorDraft}
                onAplicarEditor={() => void aplicarEditorDetalhe()}
                aplicandoEditor={aplicandoEditor}
                onBaixarPdfCliente={baixarPdfClienteOrcamento}
                irParaOrcamento={irParaOrcamento}
                onAlterarAliquota={alterarAliquotaItem}
                recalculandoAliquota={recalculandoAliquota}
                onDesfazerAliquota={desfazerAliquotaItem}
                desfazendoAliquota={desfazendoAliquota}
                onConfirmarNcm={confirmarNcmItem}
                confirmandoNcm={confirmandoNcm}
                onDesfazerNcm={desfazerNcmItem}
              />
            </div>
          </div>
        )}

        {view === "nova" && (
          <div
            className={`card mx-auto max-w-4xl p-10 text-center transition-colors ${
              dragOver ? "border-brand-500/50 bg-brand-500/5" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processarArquivo(file);
            }}
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 text-3xl">
              📄
            </div>
            <h2 className="text-xl font-bold text-white">Arraste a planilha do fornecedor</h2>
            <p className="mt-2 text-sm text-slate-400">.xlsx · .csv · .pdf · imagem</p>
            <label className={`btn-primary mt-8 inline-flex cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? "Processando…" : "Selecionar arquivo"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void processarArquivo(file);
                  e.target.value = "";
                }}
                disabled={uploading}
              />
            </label>

            {parsed && (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-left text-sm">
                <p className="font-semibold text-white">
                  ✓ {parsed.arquivo ?? "Arquivo"} — {parsed.totalLinhas} linha(s)
                  {parsed.fonte === "ocr" && (
                    <span className="ml-2 text-xs font-normal text-slate-400">(PDF/imagem)</span>
                  )}
                </p>
                {parsed.avisos?.length ? (
                  <ul className="mt-2 list-inside list-disc text-xs text-amber-400/90">
                    {parsed.avisos.slice(0, 6).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                ) : null}
                {!analise && (
                  <button
                    type="button"
                    className="btn-primary mt-6 w-full"
                    disabled={analisando}
                    onClick={() => void iniciarAnalise()}
                  >
                    {analisando ? `Analisando ${parsed.totalLinhas} itens…` : `Analisar com IA (${parsed.totalLinhas} itens)`}
                  </button>
                )}
              </div>
            )}

            {analise && (
              <div className="mt-8">
                <AnalisePainel
                  analise={analise}
                  onSalvar={() => void salvarAnalise()}
                  salvando={salvando}
                  salvaId={salvaId}
                  editorDraft={editorDraft ?? undefined}
                  onEditorChange={(d) => {
                    setEditorDraft(d);
                    setCliente(d.cliente);
                  }}
                  onAplicarEditor={() => void aplicarEditorAnalise()}
                  aplicandoEditor={aplicandoEditor}
                  onBaixarPdfCliente={baixarPdfClienteOrcamento}
                  onAlterarAliquota={alterarAliquotaItem}
                  recalculandoAliquota={recalculandoAliquota}
                  onDesfazerAliquota={desfazerAliquotaItem}
                  desfazendoAliquota={desfazendoAliquota}
                  onConfirmarNcm={confirmarNcmItem}
                  confirmandoNcm={confirmandoNcm}
                  onDesfazerNcm={desfazerNcmItem}
                />
                {salvaId && (
                  <button type="button" className="btn-ghost mt-4 w-full" onClick={() => void abrirCotacao(salvaId)}>
                    Ver cotação salva →
                  </button>
                )}
              </div>
            )}

            <p className="mt-6 text-xs text-slate-500">
              Upload → IA → salvar → histórico · {meta?.ncmVigenteTotal?.toLocaleString("pt-BR") ?? "—"} NCMs Siscomex · {meta?.comexTotal.toLocaleString("pt-BR")} no benchmark
            </p>
          </div>
        )}
      </div>

      {dupAlvo && (
        <ModalDuplicar
          cotacao={dupAlvo}
          onClose={() => setDupAlvo(null)}
          onConfirm={(m) => void confirmarDuplicar(m)}
          loading={duplicando}
        />
      )}
    </AppShell>
  );
}
