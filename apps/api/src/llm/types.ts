/** Contrato do provedor de IA (tradução + classificação NCM + descrição DUIMP). */

export interface ClassifyItemInput {
  descOriginal: string;
  ncmInformado?: string | null;
  contexto?: string | null;
}

export interface NcmCandidatoLlm {
  ncm: string;
  descricaoOficial?: string;
  confianca: number;
}

export interface ClassifyItemOutput {
  descPt: string;
  descDuimp: string;
  ncmCandidatos: NcmCandidatoLlm[];
  /** Preenchido pelo fluxo 2 passes. */
  posicaoPasse1?: string;
  confiancaPasse1?: number;
  confiancaPasse2?: number;
  justificativaRGI?: string;
  classificacaoBaixaConfianca?: boolean;
  /** Passe 2: material determinante ausente na descrição. */
  avisoMaterial?: string;
  /** Passe 2: atributo determinante (ex.: altura ajustável) ausente na descrição. */
  avisoAtributo?: string;
}

export interface LlmProvider {
  nome: string;
  /** Se há credencial configurada (senão, o sistema usa fallback/mock). */
  disponivel: boolean;
  /** Classifica um lote de itens em uma passada (regra: baixa latência). */
  classify(itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]>;
  /** Classificação NCM em 2 passes (posição → NCM-8). Opcional — mock/anthropic/openai. */
  classify2Passes?(catalog: import("@cia/pipeline").NcmCatalog, itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]>;
}
