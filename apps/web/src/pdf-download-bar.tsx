import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { PdfDownloadError } from "./lib/pdf-erro.ts";
import { mensagemToastDePendencias, type PendenciaNcmItem } from "./lib/ncm.ts";

type ToastState = {
  titulo: string;
  visiveis: PendenciaNcmItem[];
  restantes: number;
  codigo?: string;
  mostrarResolver: boolean;
};

export function PdfDownloadBar({
  label = "Baixar PDF deste orçamento",
  hint,
  baixando: baixandoProp,
  bloqueado,
  motivoBloqueio,
  qtdPendencias = 0,
  pendencias,
  onBaixar,
  onIrParaResolucaoNcm,
}: {
  label?: string;
  hint?: string;
  baixando?: boolean;
  bloqueado: boolean;
  motivoBloqueio?: string;
  qtdPendencias?: number;
  pendencias?: PendenciaNcmItem[];
  onBaixar: () => void | Promise<void>;
  onIrParaResolucaoNcm?: (idx?: number) => void;
}) {
  const [internoBaixando, setInternoBaixando] = useState(false);
  const baixando = baixandoProp ?? internoBaixando;
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tooltipVisivel, setTooltipVisivel] = useState(false);
  const toastId = useId();

  const fila = useMemo(() => pendencias ?? [], [pendencias]);
  const motivo = motivoBloqueio ?? "Corrija os NCMs pendentes antes de gerar o PDF.";

  const mostrarToastBloqueio = useCallback(
    (opts?: { codigo?: string; titulo?: string }) => {
      const fromFila =
        fila.length > 0 ? mensagemToastDePendencias(fila) : { titulo: motivo, visiveis: [], restantes: 0 };

      setToast({
        titulo: opts?.titulo ?? fromFila.titulo,
        visiveis: fromFila.visiveis,
        restantes: fromFila.restantes,
        codigo: opts?.codigo,
        mostrarResolver: Boolean(
          onIrParaResolucaoNcm && (opts?.codigo === "NCM_INVALIDO" || fila.length > 0 || bloqueado),
        ),
      });
    },
    [bloqueado, fila, motivo, onIrParaResolucaoNcm],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 12_000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function irPara(idx?: number) {
    setToast(null);
    onIrParaResolucaoNcm?.(idx);
  }

  async function executarDownload() {
    if (baixando || bloqueado) return;
    setToast(null);
    setInternoBaixando(true);
    try {
      await onBaixar();
    } catch (e) {
      const err = e instanceof PdfDownloadError ? e : new PdfDownloadError(e instanceof Error ? e.message : "Falha ao gerar PDF.");
      mostrarToastBloqueio({
        codigo: err.codigo,
        titulo: err.mensagemAcionavel(qtdPendencias, fila),
      });
    } finally {
      setInternoBaixando(false);
    }
  }

  function handleAreaClick() {
    if (baixando) return;
    if (bloqueado) {
      mostrarToastBloqueio({ codigo: "NCM_INVALIDO" });
    }
  }

  const desabilitado = baixando || bloqueado;
  const primeiroPendente = fila[0];

  return (
    <div className="relative w-full sm:w-auto">
      {toast && (
        <div
          id={toastId}
          role="alert"
          className="absolute bottom-full right-0 z-20 mb-2 w-full min-w-[280px] max-w-md rounded-lg border border-red-400/60 bg-red-950 px-4 py-3 text-sm text-red-50 shadow-xl sm:w-max"
        >
          <p className="font-semibold leading-snug">{toast.titulo}</p>
          {toast.visiveis.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {toast.visiveis.map((p) => (
                <li key={p.idx}>
                  <button
                    type="button"
                    className="font-semibold text-emerald-300 underline hover:text-emerald-200"
                    onClick={() => irPara(p.idx)}
                  >
                    Ir para {p.nome}
                  </button>
                </li>
              ))}
              {toast.restantes > 0 && (
                <li>
                  <button
                    type="button"
                    className="font-semibold text-red-100 underline hover:text-white"
                    onClick={() => irPara()}
                  >
                    +{toast.restantes} → ver todos na aba técnica
                  </button>
                </li>
              )}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {toast.mostrarResolver && (
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                onClick={() => irPara(primeiroPendente?.idx)}
              >
                {primeiroPendente ? `Ir para ${primeiroPendente.nome.slice(0, 28)}` : "Resolver pendências"}
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-red-400/40 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900/50"
              onClick={() => setToast(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div
        className="inline-flex flex-col items-stretch sm:items-end"
        onClick={bloqueado ? handleAreaClick : undefined}
        onKeyDown={
          bloqueado
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleAreaClick();
                }
              }
            : undefined
        }
        role={bloqueado ? "button" : undefined}
        tabIndex={bloqueado ? 0 : undefined}
        aria-describedby={bloqueado ? toastId : undefined}
        onMouseEnter={() => bloqueado && setTooltipVisivel(true)}
        onMouseLeave={() => setTooltipVisivel(false)}
        onFocus={() => bloqueado && setTooltipVisivel(true)}
        onBlur={() => setTooltipVisivel(false)}
      >
        {bloqueado && tooltipVisivel && (
          <div className="mb-1 max-w-xs rounded-md border border-slate-400 bg-slate-800 px-2 py-1 text-[11px] text-slate-100 shadow-lg">
            {motivo}
          </div>
        )}
        <button
          type="button"
          className={
            desabilitado && bloqueado
              ? "inline-flex shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 border-slate-400 bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 shadow-none"
              : desabilitado
                ? "btn-primary shrink-0 cursor-wait text-sm opacity-70"
                : "btn-primary shrink-0 text-sm"
          }
          disabled={desabilitado && !bloqueado}
          aria-disabled={desabilitado}
          title={bloqueado ? motivo : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (bloqueado) {
              mostrarToastBloqueio({ codigo: "NCM_INVALIDO" });
              return;
            }
            void executarDownload();
          }}
        >
          {bloqueado && (
            <svg className="h-4 w-4 shrink-0 text-slate-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {baixando ? "Gerando PDF…" : label}
        </button>
      </div>

      {hint && !bloqueado && (
        <p className="mt-1 text-left text-xs text-slate-600 sm:text-right">{hint}</p>
      )}
    </div>
  );
}
