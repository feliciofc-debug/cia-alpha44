import { criarMockProvider } from "../apps/api/src/llm/mock.ts";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";

const PACKLISTE_DE = [
  { desc: "DE-WZ-1001 — Akku-Bohrschrauber 18V mit 2 Akkus und Koffer", cap: "84" },
  { desc: "DE-WZ-1002 — Schraubendreher-Set 32-teilig, Chrom-Vanadium", cap: "82" },
  { desc: "DE-KU-2001 — Thermoskanne Edelstahl 1L, doppelwandig vakuumisoliert", cap: "96" },
  { desc: "DE-KU-2002 — Kochtopf-Set 5-teilig Edelstahl mit Glasdeckel", cap: "73" },
  { desc: "DE-EL-3001 — Bluetooth-Kopfhörer TWS mit Ladecase", cap: "85" },
  { desc: "DE-EL-3002 — USB-C Ladegerät 65W GaN Schnellladegerät", cap: "85" },
  { desc: "DE-EL-3003 — LED-Deckenleuchte rund 24W, dimmbar, nur LED-Lichtquelle", cap: "94" },
  { desc: "DE-MB-4001 — Bürostuhl drehbar, höhenverstellbar, gepolstert, Metallgestell", cap: "94" },
  { desc: "DE-SP-5001 — Elektroroller 350W, 10 Zoll Räder, klappbar", cap: "87" },
  { desc: "DE-SP-5002 — Kinderroller mit 3 Rädern, LED-Räder, bis 50 kg", cap: "95" },
  { desc: "DE-AT-6001 — Stoßdämpfer hinten für Elektroroller, Ersatzteil", cap: "87" },
  { desc: "DE-AT-6002 — Sechskantschrauben M8x40 verzinkt, VPE 100", cap: "73" },
  { desc: "DE-TX-7001 — Mikrofaser-Handtuch-Set 3-teilig, 80% Polyester 20% Polyamid", cap: "63" },
  { desc: "DE-TX-7002 — Herren T-Shirt Baumwolle, gestrickt, verschiedene Größen", cap: "61" },
];

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);
const outs = await mock.classify2Passes!(catalog, PACKLISTE_DE.map((p) => ({ descOriginal: p.desc })));

for (let i = 0; i < PACKLISTE_DE.length; i++) {
  const ncm = outs[i]!.ncmCandidatos[0]?.ncm ?? "";
  const cap = ncm.slice(0, 2);
  const ok = cap === PACKLISTE_DE[i]!.cap;
  console.log(`${ok ? "OK" : "FAIL"} ${i + 1} cap=${cap} esp=${PACKLISTE_DE[i]!.cap} ncm=${ncm} | ${outs[i]!.descPt?.slice(0, 50)}`);
}
