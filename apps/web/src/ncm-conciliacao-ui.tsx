import { useCallback, useEffect, useState } from "react";
import { api, type ConciliarNcmResult, type LookupNcmResult } from "./lib/api.ts";
import { fmtNcm } from "./lib/format.ts";

const DISCLAIMER =
  "Conciliação por IA (referência). O NCM que você informar prevalece — não bloqueia o PDF.";

export function DisclaimerConciliacaoIa() {
  return (
    <p className="rounded-lg border border-slate-600/40 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-400">
      {DISCLAIMER}
    </p>
  );
}

export function SeloConciliacaoNcm({
  cotacaoId,
  ordem,
  ncmAtual,
  onAplicarSugestao,
  aplicando,
  auto = false,
}: {
  cotacaoId: string | null | undefined;
  ordem: number;
  ncmAtual: string;
  onAplicarSugestao?: (ordem: number, ncm: string) => void | Promise<void>;
  aplicando?: boolean;
  /** Dispara conciliação ao montar (1x por NCM). */
  auto?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConciliarNcmResult | null>(null);

  const conciliar = useCallback(async () => {
    if (!cotacaoId) return;
    setLoading(true);
    try {
      const out = await api.conciliarNcmItem(cotacaoId, ordem);
      if (out.ok && out.status !== "sem_sugestao") {
        setResult(out);
      } else {
        setResult(null);
      }
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [cotacaoId, ordem]);

  useEffect(() => {
    if (auto && cotacaoId) void conciliar();
  }, [auto, cotacaoId, conciliar, ncmAtual]);

  if (!cotacaoId) return null;

  return (
    <div className="mt-1.5 space-y-1 border-t border-white/5 pt-1.5">
      {!auto && (
        <button
          type="button"
          className="rounded bg-slate-700/80 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          disabled={loading || aplicando}
          onClick={() => void conciliar()}
        >
          {loading ? "Conciliando…" : "Conciliar (IA)"}
        </button>
      )}
      {loading && auto && (
        <span className="block text-[10px] text-slate-500">Conciliando IA…</span>
      )}
      {result?.status === "coerente" && (
        <div
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200"
          title={result.justificativaRGI}
        >
          <span className="font-semibold">IA confirma</span>
          {result.descricaoSugerida && (
            <span className="block text-emerald-300/90">{result.descricaoSugerida}</span>
          )}
          {result.descricaoCiaInformado && (
            <span className="block text-slate-400">CIA: {result.descricaoCiaInformado.slice(0, 72)}</span>
          )}
        </div>
      )}
      {result?.status === "divergente" && result.ncmSugerido && (
        <div
          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100"
          title={result.justificativaRGI}
        >
          <span className="font-semibold">
            IA sugere {fmtNcm(result.ncmSugerido)}
            {result.descricaoSugerida ? ` (${result.descricaoSugerida})` : ""}
          </span>
          {result.confianca != null && (
            <span className="ml-1 text-amber-200/70">· {(result.confianca * 100).toFixed(0)}%</span>
          )}
          {onAplicarSugestao && (
            <button
              type="button"
              className="mt-1 block w-full rounded bg-amber-600/80 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-500 disabled:opacity-50"
              disabled={aplicando}
              onClick={() => void onAplicarSugestao(ordem, result.ncmSugerido!)}
            >
              {aplicando ? "Aplicando…" : "Aplicar sugestão (opcional)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LookupNcmInline({ ncmDraft }: { ncmDraft: string }) {
  const [info, setInfo] = useState<LookupNcmResult | null>(null);

  useEffect(() => {
    const digits = ncmDraft.replace(/\D/g, "").slice(0, 8);
    if (digits.length !== 8 || digits === "00000000") {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void api.lookupNcm(digits).then((r) => {
        if (!cancelled && r.ok) setInfo(r);
        else if (!cancelled) setInfo(null);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ncmDraft]);

  if (!info?.ok) return null;

  return (
    <p className="mt-1 text-[10px] leading-snug text-slate-400">
      {info.descricaoOficial && <span className="block text-slate-300">{info.descricaoOficial}</span>}
      {(info.capitulo || info.posicao) && (
        <span className="block">
          {[info.capitulo && `Cap. ${info.capitulo}`, info.posicao && `Pos. ${info.posicao}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      {info.descricaoCia && info.fonte === "cia-catalog" && !info.capitulo && (
        <span className="block truncate" title={info.descricaoCia}>
          Ref. CIA: {info.descricaoCia.slice(0, 80)}
        </span>
      )}
    </p>
  );
}
