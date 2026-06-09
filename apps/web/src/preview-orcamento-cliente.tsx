import { useState } from "react";
import { fmtNcm } from "./lib/format.ts";
import { fotoItemSrc } from "./lib/item-foto.ts";
import type { Cotacao, Despesa, Item, ResultadoCotacao } from "./lib/types.ts";

function parseDataIso(iso?: string) {
  const src = iso?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const [y, m, d] = src.split("-");
  return { d: d ?? "01", m: m ?? "01", y: y ?? "2026" };
}

function fmtDataBr(iso?: string) {
  const { d, m, y } = parseDataIso(iso);
  return `${d}/${m}/${y}`;
}

function fmtDataFatura(iso?: string) {
  const { d, m, y } = parseDataIso(iso);
  return `${d}-${m}-${y}`;
}

function temTextoUnicode(texto: string) {
  return /[^\u0000-\u007F]/.test(texto);
}

function tituloFatura(cliente: string, criadoEm?: string) {
  const data = fmtDataFatura(criadoEm);
  const nome = (cliente || "CLIENTE").trim();
  if (temTextoUnicode(nome)) return `${nome} - ${data}`;
  return `${nome} - ${data}`.toUpperCase();
}

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsd(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function despesaValor(despesas: Despesa[], ...chaves: string[]) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const d of despesas) {
    const n = norm(d.nome);
    if (chaves.some((k) => n.includes(norm(k)))) return d.valorBRL;
  }
  return 0;
}

function totaisRegime(resultado: ResultadoCotacao) {
  const e = resultado.entrada;
  const impostosSuspensos = e.iiTotal + e.ipiTotal + e.pisTotal + e.cofinsTotal;
  const totalIntegral = resultado.totalBRL;
  const totalEntreposto = Math.max(0, totalIntegral - impostosSuspensos);
  return { totalIntegral, totalEntreposto, proveitoEconomico: totalIntegral - totalEntreposto };
}

function Box({
  title,
  left,
  right,
  className = "",
}: {
  title?: string;
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-black text-[11px] leading-tight text-black ${className}`}>
      {title ? (
        <div className="grid grid-cols-2 border-b border-black font-bold">
          <div className="border-r border-black px-2 py-1">{title.split("|")[0]}</div>
          <div className="px-2 py-1">{title.split("|")[1] ?? ""}</div>
        </div>
      ) : null}
      <div className={`grid ${right != null ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className={right != null ? "border-r border-black px-2 py-2" : "px-2 py-2"}>{left}</div>
        {right != null ? <div className="px-2 py-2">{right}</div> : null}
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="font-bold">{label}</span>
      <span>{valor}</span>
    </div>
  );
}

function fotoSrc(it: Item): string | null {
  return fotoItemSrc(it);
}

function FotosCertificacao({ itens }: { itens: Item[] }) {
  const urls = itens.map(fotoSrc).filter((u): u is string => Boolean(u));
  if (urls.length === 0) {
    return <p className="text-[10px] text-slate-500">Sem foto na planilha</p>;
  }
  const cols = urls.length <= 2 ? urls.length : 3;
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {urls.slice(0, 6).map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`Produto ${i + 1}`}
          className="h-14 w-full rounded border border-black/10 object-contain bg-white"
        />
      ))}
    </div>
  );
}

export function PreviewOrcamentoCliente({
  cotacao,
  itens,
  resultado,
  onBaixarPdf,
  salvo = true,
  criadoEm,
  pdfBloqueado = false,
  motivoBloqueioPdf,
}: {
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
  onBaixarPdf?: () => void | Promise<void>;
  /** Cotação já persistida — PDF usa ID salvo; senão gera preview temporário. */
  salvo?: boolean;
  /** Data da cotação salva — alinha preview com o PDF baixado. */
  criadoEm?: string;
  /** Impede download quando há NCM inválido na cotação. */
  pdfBloqueado?: boolean;
  motivoBloqueioPdf?: string;
}) {
  const [baixando, setBaixando] = useState(false);

  async function handleBaixarPdf() {
    if (!onBaixarPdf || baixando) return;
    setBaixando(true);
    try {
      await onBaixarPdf();
    } catch {
      // mensagem de erro exibida pelo Dashboard
    } finally {
      setBaixando(false);
    }
  }
  const dataStr = fmtDataBr(criadoEm);
  const porto = `PORTO ${cotacao.origem || "RJ"}`;
  const fatura = tituloFatura(cotacao.cliente || "CLIENTE", criadoEm);

  if (!resultado) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
        Recalcule a cotação para visualizar o orçamento no formato padrão INNOVE 888.
      </div>
    );
  }

  const cambio = cotacao.cambio;
  const fobUS = resultado.entrada.fobTotalUS;
  const freteUS = cotacao.freteTotalUS ?? 0;
  const cifUS = fobUS + freteUS;
  const e = resultado.entrada;
  const s = resultado.saida;
  const despesas = cotacao.despesas ?? [];
  const { totalIntegral, totalEntreposto, proveitoEconomico } = totaisRegime(resultado);
  const pesoLiq = itens.reduce((acc, it) => acc + (it.pesoLiqKg > 0 ? it.pesoLiqKg : 0), 0);
  const pesoBruto = itens.reduce((acc, it) => acc + (it.pesoBrutoKg ?? 0), 0) || pesoLiq * 1.1;
  const desc = (itens[0]?.descPt || itens[0]?.descOriginal || "—").toUpperCase();
  const ncm = [...new Set(itens.map((it) => fmtNcm(it.ncm || "00000000")))].join(" / ");
  const pctMarkup = `${(cotacao.params.markupPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`;
  const fotoMercadoria = itens.map(fotoSrc).find(Boolean);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white text-black shadow-xl">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black pb-3">
          <img src="/logo-innove888.jpeg" alt="INNOVE 888" className="h-12 w-auto object-contain" />
          <p className="max-w-md text-right text-[10px] font-bold leading-snug sm:text-xs">
            FATURA: {fatura}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 border border-black text-center text-[11px] font-bold">
          <div className="border-r border-black px-2 py-1.5 text-left">DATA: {dataStr}</div>
          <div className="border-r border-black px-2 py-1.5 text-blue-700">{porto}</div>
          <div className="px-2 py-1.5 text-right text-red-600">ESTIMATIVA</div>
        </div>

        <div className="mt-2 border border-black p-2 text-[11px]">
          <p className="font-bold">TAXA DOLLAR: $ {fmtUsd(cambio)}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 font-bold">
            <div />
            <div className="text-right">US$</div>
            <div className="text-right">R$</div>
            <div>VALOR FOB DI</div>
            <div className="text-right font-normal">$ {fmtUsd(fobUS)}</div>
            <div className="text-right font-normal">{fmtBrl(fobUS * cambio)}</div>
            <div>FRETE PREPAID</div>
            <div className="text-right font-normal">$ {fmtUsd(freteUS)}</div>
            <div className="text-right font-normal">{fmtBrl(freteUS * cambio)}</div>
            <div>VALOR CIF</div>
            <div className="text-right font-normal">$ {fmtUsd(cifUS)}</div>
            <div className="text-right font-normal">{fmtBrl(cifUS * cambio)}</div>
          </div>
        </div>

        <Box
          className="mt-2"
          title="IMPOSTOS DE ENTRADA|MERCADORIAS NCM"
          left={
            <>
              <Linha label="II:" valor={`R$ ${fmtBrl(e.iiTotal)}`} />
              <Linha label="IPI:" valor={`R$ ${fmtBrl(e.ipiTotal)}`} />
              <Linha label="PIS:" valor={`R$ ${fmtBrl(e.pisTotal)}`} />
              <Linha label="COFINS:" valor={`R$ ${fmtBrl(e.cofinsTotal)}`} />
              <Linha label="TAXA SISC:" valor={`R$ ${fmtBrl(e.siscomex)}`} />
              <Linha label="ANTIDUMPING:" valor={`R$ ${fmtBrl(e.antidumpingBRL)}`} />
            </>
          }
          right={
            <>
              <p className="font-bold">{desc}</p>
              <p className="mt-2">NCM: {ncm}</p>
              {fotoMercadoria ? (
                <img
                  src={fotoMercadoria}
                  alt="Produto"
                  className="mt-2 h-10 max-w-[88px] rounded border border-black/10 object-contain"
                />
              ) : null}
            </>
          }
        />

        <Box
          className="mt-2"
          title="TAXAS LOCAIS|CERTIFICAÇÃO"
          left={
            <>
              <Linha label="AFRMM:" valor={`R$ ${fmtBrl(despesaValor(despesas, "afrmm"))}`} />
              <Linha label="ARMAZENAGEM:" valor={`R$ ${fmtBrl(despesaValor(despesas, "armazenagem"))}`} />
              <Linha label="LIBERAÇÃO BL:" valor={`R$ ${fmtBrl(despesaValor(despesas, "liberação", "bl"))}`} />
              <Linha label="GNRE:" valor={`R$ ${fmtBrl(despesaValor(despesas, "gnre"))}`} />
              <Linha label="ADMINISTRATIVO:" valor={`R$ ${fmtBrl(despesaValor(despesas, "administrativo"))}`} />
              <Linha label="TRANSP+ESC DTA:" valor={`R$ ${fmtBrl(despesaValor(despesas, "transp", "dta"))}`} />
              <Linha label={`TRANSPORTE ${cotacao.destino}:`} valor={`R$ ${fmtBrl(despesaValor(despesas, "transporte"))}`} />
              <Linha label={`ESCOLTA ${cotacao.destino}:`} valor={`R$ ${fmtBrl(despesaValor(despesas, "escolta"))}`} />
              <Linha label="DESPACHO HON:" valor={`R$ ${fmtBrl(despesaValor(despesas, "despacho", "honor"))}`} />
              <Linha label="PROVEITO ECONÔMICO:" valor={`R$ ${fmtBrl(s.markup)}`} />
            </>
          }
          right={
            <div className="flex min-h-[120px] flex-col justify-between gap-2">
              <FotosCertificacao itens={itens} />
              <p className="text-right font-bold">{pctMarkup}</p>
            </div>
          }
        />

        <Box
          className="mt-2"
          title="IMPOSTOS DE SAIDA|OUTRAS INFORMAÇÕES"
          left={
            <>
              <Linha label="DIF IPI:" valor={`R$ ${fmtBrl(s.difIPI)}`} />
              <Linha label="DIF PIS:" valor={`R$ ${fmtBrl(s.difPIS)}`} />
              <Linha label="DIF COFINS:" valor={`R$ ${fmtBrl(s.difCOFINS)}`} />
              <Linha label="ICMS SAIDA:" valor={`R$ ${fmtBrl(s.icmsSaida)}`} />
              <Linha label="CSLL:" valor={`R$ ${fmtBrl(s.csll)}`} />
              <Linha label="IRRF:" valor={`R$ ${fmtBrl(s.irrf)}`} />
              <Linha label="MARKUP:" valor={`R$ ${fmtBrl(s.markup)}`} />
            </>
          }
          right={
            <>
              <Linha label="GROSS WEIGHT:" valor={fmtBrl(pesoBruto)} />
              <Linha label="NET WEIGHT:" valor={fmtBrl(pesoLiq)} />
              <Linha label="CAIXAS:" valor="" />
            </>
          }
        />

        {[
          [totalIntegral, "VALOR DAS DESPESAS + IMPOSTOS REGIME INTEGRAL"],
          [totalEntreposto, "VALOR DAS DESPESAS - ENTREPOSTO ADUANEIRO SUSPENSOS"],
          [proveitoEconomico, "VALOR DO PROVEITO ECONÔMICO C/ENTREPOSTO ADUANEIRO"],
        ].map(([val, leg], i) => (
          <div key={i} className="mt-1 grid grid-cols-[1fr_auto_auto] border border-black text-[10px] font-bold sm:text-[11px]">
            <div className="border-r border-black px-2 py-1.5">TOTAL R$ {fmtBrl(val as number)}</div>
            <div className="border-r border-black px-2 py-1.5">$ {fmtUsd(cambio > 0 ? (val as number) / cambio : 0)}</div>
            <div className="px-2 py-1.5 text-right font-normal">{leg as string}</div>
          </div>
        ))}

        <p className="mt-3 text-[10px] font-bold leading-snug">
          OBS: NO ATO DA NACIONALIZAÇÃO PODEREMOS PLEITEAR O USO DE UM E-TARIFÁRIO E REDUZIR O II PARA R$ 0,00
        </p>
      </div>

      {onBaixarPdf && (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
          {pdfBloqueado ? (
            <p className="mb-2 text-left text-xs font-medium text-red-700 sm:mb-0">
              {motivoBloqueioPdf ?? "Corrija os NCMs inválidos antes de gerar o PDF."}
            </p>
          ) : (
            <p className="mb-2 text-left text-xs text-slate-600 sm:mb-0">
              {salvo
                ? "Revise o layout acima. Quando estiver ok, baixe o PDF para enviar ao cliente."
                : "Salve a cotação para manter o histórico; você ainda pode baixar um PDF de preview."}
            </p>
          )}
          <button
            type="button"
            className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={baixando || pdfBloqueado}
            title={pdfBloqueado ? motivoBloqueioPdf : undefined}
            onClick={() => void handleBaixarPdf()}
          >
            {baixando ? "Gerando PDF…" : "Baixar PDF deste orçamento"}
          </button>
        </div>
      )}
    </div>
  );
}
