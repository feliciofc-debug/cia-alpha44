import { useCallback, useEffect, useId, useState } from "react";
import { PdfDownloadError } from "./lib/pdf-erro.ts";

type ToastState = {
  mensagem: string;
  codigo?: string;
  contagem: number;
  mostrarResolver: boolean;
};

export function PdfDownloadBar({
  label = "Baixar PDF deste orçamento",
  hint,
  baixando: baixandoProp,
  bloqueado,
  motivoBloqueio,
  qtdPendencias = 0,
  onBaixar,
  onIrParaResolucaoNcm,
}: {
  label?: string;
  hint?: string;
  baixando?: boolean;
  bloqueado: boolean;
  motivoBloqueio?: string;
  qtdPendencias?: number;
  onBaixar: () => void | Promise<void>;
  onIrParaResolucaoNcm?: () => void;
}) {
  const [internoBaixando, setInternoBaixando] = useState(false);
  const baixando = baixandoProp ?? internoBaixando;
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tooltipVisivel, setTooltipVisivel] = useState(false);
  const toastId = useId();

  const motivo = motivoBloqueio ?? "Corrija os NCMs pendentes antes de gerar o PDF.";
  const contagemExibir = toast?.contagem || qtdPendencias;

  const mostrarToastBloqueio = useCallback(
    (opts?: { codigo?: string; contagem?: number; mensagem?: string }) => {
      const n = opts?.contagem ?? qtdPendencias;
      const codigo = opts?.codigo;
      const mensagem =
        opts?.mensagem ??
        (codigo === "NCM_INVALIDO" && n > 0
          ? `PDF bloqueado: ${n} item(ns) com NCM pendente`
          : motivo);
      setToast({
        mensagem,
        codigo,
        contagem: n,
        mostrarResolver: Boolean(onIrParaResolucaoNcm && (codigo === "NCM_INVALIDO" || n > 0 || bloqueado)),
      });
    },
    [bloqueado, motivo, onIrParaResolucaoNcm, qtdPendencias],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 12_000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleResolver() {
    setToast(null);
    onIrParaResolucaoNcm?.();
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
        contagem: err.contagemPendencias || qtdPendencias,
        mensagem: err.mensagemAcionavel(qtdPendencias),
      });
    } finally {
      setInternoBaixando(false);
    }
  }

  function handleAreaClick() {
    if (baixando) return;
    if (bloqueado) {
      mostrarToastBloqueio({ codigo: "NCM_INVALIDO", contagem: qtdPendencias });
    }
  }

  const desabilitado = baixando || bloqueado;

  return (
    <div className="relative w-full sm:w-auto">
      {toast && (
        <div
          id={toastId}
          role="alert"
          className="absolute bottom-full right-0 z-20 mb-2 w-full min-w-[280px] max-w-md rounded-lg border border-red-400/60 bg-red-950 px-4 py-3 text-sm text-red-50 shadow-xl sm:w-max"
        >
          <p className="font-semibold">{toast.mensagem}</p>
          {toast.codigo === "NCM_INVALIDO" && contagemExibir > 0 && (
            <p className="mt-1 text-xs text-red-200/90">
              {contagemExibir} item(ns) exigem confirmação ou revisão na barra NCM.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {toast.mostrarResolver && (
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                onClick={handleResolver}
              >
                Resolver pendências
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
              mostrarToastBloqueio({ codigo: "NCM_INVALIDO", contagem: qtdPendencias });
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
