/** Limites de upload de planilhas/PDF com fotos embutidas (fornecedor). */

export const UPLOAD_MAX_BYTES = 60 * 1024 * 1024;

export const UPLOAD_MAX_MB = UPLOAD_MAX_BYTES / (1024 * 1024);

export const ERRO_UPLOAD_EXCEDE_LIMITE = `Arquivo excede ${UPLOAD_MAX_MB}MB — reduza fotos ou compacte a planilha.`;

export function mensagemArquivoGrandeDemais(): string {
  return ERRO_UPLOAD_EXCEDE_LIMITE;
}
