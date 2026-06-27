/**
 * Tradução determinística DE/EN → PT para classificação NCM (mock/CI).
 * Produção usa LLM real em executar2PassesComLlm.
 */

const REGRAS: Array<[RegExp, string]> = [
  [/Akku-Bohrschrauber/gi, "Parafusadeira sem fio 18V com baterias e maleta"],
  [/Schraubendreher-Set/gi, "Jogo de chaves de fenda 32 peças cromo-vanádio"],
  [/Thermoskanne[^,]*/gi, "Garrafa térmica aço inox 1L isolamento vácuo dupla parede"],
  [/Kochtopf-Set/gi, "Jogo de panelas aço inox 5 peças com tampa de vidro"],
  [/Bluetooth-Kopfhörer|Bluetooth-Kopfhorer/gi, "Fone bluetooth TWS wireless earphone com case"],
  [/USB-C Ladegerät|USB-C Ladegerat/gi, "Carregador USB-C 65W GaN adaptador elétrico"],
  [/LED-Deckenleuchte/gi, "Luminária elétrica de teto LED redonda 24W dimmable"],
  [/Bürostuhl|Burostuhl/gi, "Cadeira de escritório giratória altura ajustável estofada base metálica"],
  [/Elektroroller/gi, "Patinete elétrico scooter 350W 10 polegadas dobrável"],
  [/Kinderroller/gi, "Patinete infantil 3 rodas LED até 50 kg"],
  [/Stoßdämpfer|Stossdampfer/gi, "Amortecedor traseiro patinete elétrico peça reposição"],
  [/Sechskantschrauben/gi, "Parafuso sextavado M8x40 zincado embalagem 100"],
  [/Mikrofaser-Handtuch/gi, "Jogo toalhas microfibra 80% poliéster 20% poliamida"],
  [/Herren T-Shirt/gi, "Camiseta masculina algodão malha"],
  [/Bohrschrauber/gi, "Parafusadeira sem fio"],
  [/Schraubendreher/gi, "Chave de fenda"],
  [/Thermoskanne/gi, "Garrafa térmica inox"],
  [/Kopfhörer|Kopfhorer/gi, "Fone bluetooth TWS"],
  [/Ladegerät|Ladegerat/gi, "Carregador adaptador elétrico"],
  [/Deckenleuchte/gi, "Luminária de teto LED"],
  [/Ersatzteil/gi, "peça reposição"],
];

/** Traduz descrição de fornecedor para PT (mock). Retorna original se já parecer PT. */
export function traduzirDescricaoClassificacaoMock(desc: string): string {
  let out = desc.trim();
  for (const [re, rep] of REGRAS) {
    if (re.test(out)) {
      out = out.replace(re, rep);
    }
  }
  return out;
}
