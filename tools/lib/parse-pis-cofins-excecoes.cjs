/**
 * Aplica exceções PIS/COFINS importação a partir de pis-cofins-excecoes.json curado.
 * Nunca inventa exceção — só entradas com fundamentoLegal.
 */

const { readFileSync } = require("node:fs");

const AVISO_AUTOPECAS_EX =
  "NCM listado na Lei 10.485 (autopeças) com qualificador Ex — verificar se o produto é de uso automotivo; se for, PIS 3,12% / COFINS 14,37%";

/**
 * @param {string} jsonPath
 */
function carregarExcecoes(jsonPath) {
  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  const excecoes = (raw.excecoes ?? []).map((e) => ({
    ncmPrefixo: String(e.ncmPrefixo).replace(/\D/g, ""),
    pis: e.pis,
    cofins: e.cofins,
    condicional: Boolean(e.condicional),
    fundamentoLegal: String(e.fundamentoLegal ?? "").trim(),
  }));
  for (const e of excecoes) {
    if (!e.fundamentoLegal) throw new Error(`Exceção PIS/COFINS sem fundamentoLegal: ${e.ncmPrefixo}`);
  }
  excecoes.sort((a, b) => b.ncmPrefixo.length - a.ncmPrefixo.length);
  return {
    pisPadrao: raw.pisPadrao ?? 0.021,
    cofinsPadrao: raw.cofinsPadrao ?? 0.0965,
    fundamentoPadrao: raw.fundamentoPisCofinsPadrao ?? "Lei 10.865/2004, art. 8º",
    excecoes,
    fonte: raw.fonte ?? "pis-cofins-excecoes.json",
  };
}

/**
 * @param {string} ncm8
 * @param {ReturnType<typeof carregarExcecoes>} cfg
 */
function aplicarPisCofins(ncm8, cfg) {
  for (const ex of cfg.excecoes) {
    if (!ncm8.startsWith(ex.ncmPrefixo)) continue;

    if (ex.condicional) {
      return {
        pis: cfg.pisPadrao,
        cofins: cfg.cofinsPadrao,
        fundamento: cfg.fundamentoPadrao,
        aviso: AVISO_AUTOPECAS_EX,
      };
    }

    return {
      pis: ex.pis,
      cofins: ex.cofins,
      fundamento: ex.fundamentoLegal,
      aviso: null,
    };
  }

  return {
    pis: cfg.pisPadrao,
    cofins: cfg.cofinsPadrao,
    fundamento: cfg.fundamentoPadrao,
    aviso: "PIS/COFINS: padrão importação (Lei 10.865/2004, art. 8º — sem exceção aplicável)",
  };
}

module.exports = { carregarExcecoes, aplicarPisCofins, AVISO_AUTOPECAS_EX };
