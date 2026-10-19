// The scripts the demo plays when the presenter presses a button. Nothing is computed by a
// remote service: every result was prepared from the catalogue, and each script only paces
// its arrival, with the engine log a real run would print.
import type { Event } from "./runner";
import { spread } from "./runner";
import type { Lang, Product } from "./types";
import { ANOMALIES, COLUMNS, IN_PT, N, PRODUCTS, RESULTS, fmtNum, fmtPct } from "./data";

const idx = (key: string) => PRODUCTS.findIndex((p) => p.key === key);
const P = (key: string) => PRODUCTS[idx(key)];
const label = (p: Product) => p.raw.till_label;
const SUB: Record<Lang, Record<string, string>> = {
  en: {
    red_meat: "red meat", poultry: "poultry", fish_shellfish: "fish", eggs: "eggs", dairy: "dairy", animal_fat: "animal fat", plant_fat: "plant fat",
    pulses: "pulses", alternative_products: "meat alternative", tofu_tempeh_seitan: "tofu", nuts: "nuts", dairy_alternatives: "dairy alternative",
    refined_grain: "refined grain", whole_grain: "whole grain",
  },
  fr: {
    red_meat: "viande rouge", poultry: "volaille", fish_shellfish: "poisson", eggs: "œufs", dairy: "laitier", animal_fat: "graisse animale", plant_fat: "graisse végétale",
    pulses: "légumineuses", alternative_products: "alternative à la viande", tofu_tempeh_seitan: "tofu", nuts: "fruits à coque", dairy_alternatives: "alternative laitière",
    refined_grain: "céréale raffinée", whole_grain: "céréale complète",
  },
};
const ORIGIN: Record<Lang, Record<string, string>> = { en: { plant: "plant", animal: "animal" }, fr: { plant: "végétal", animal: "animal" } };
const CAT: Record<Lang, Record<string, string>> = {
  en: { meat_based: "meat-based", seafood_based: "seafood-based", vegetarian: "vegetarian", vegan: "vegan" },
  fr: { meat_based: "viande", seafood_based: "produits de la mer", vegetarian: "végétarien", vegan: "végétalien" },
};
const CLS: Record<string, string> = { animal_core: "Animal core", composite: "Composite", plant_non_core: "Plant-based non-core", plant_core: "Plant-based core" };

/** The WWF classification of a product, in words: food group, sub-group, origin. */
export function wwfText(p: Product, lang: Lang, withOrigin = true): string {
  const w = p.res.wwf;
  const fr = lang === "fr";
  if (!w) return p.res.excl === "alcohol" ? (fr ? "Appendix A (alcool)" : "Appendix A (alcohol)") : (fr ? "Appendix A (soda)" : "Appendix A (soft drink)");
  if (w.struct === "composite") return `${fr ? "composé" : "composite"} · ${CAT[lang][w.cat!]}`;
  return [w.fg, w.sub ? SUB[lang][w.sub] : null, withOrigin ? ORIGIN[lang][w.origin!] : null].filter(Boolean).join(" · ");
}

export interface Script { events: Event[]; total: number }

// ------------------------------------------------------------ 1 · import
export function importScript(bytes: number, lang: Lang): Script {
  const fr = lang === "fr";
  return {
    total: 3400,
    events: [
      { at: 150, log: { tag: "file", text: `harbour_market_catalogue.csv ${fr ? "reçu" : "received"} · ${fmtNum(bytes / 1024, lang, 1)} ${fr ? "Ko" : "KB"}` } },
      { at: 900, log: { tag: "file", text: fr ? "Archivé tel que reçu, en lecture seule · sha256 3f9a…c21e" : "Archived as received, read-only · sha256 3f9a…c21e" } },
      { at: 1700, log: { tag: "file", text: fr ? `UTF-8 · séparateur "," · ${N} lignes · ${COLUMNS.length} colonnes` : `UTF-8 · delimiter "," · ${N} rows · ${COLUMNS.length} columns` } },
      { at: 2500, log: { tag: "file", text: fr ? "En-tête conforme au modèle d'import Altera · travail sur une copie" : "Header matches the Altera import template · working on a copy" } },
      { at: 3200, mark: "imported" },
    ],
  };
}

// ------------------------------------------------------------ 2 · data checks
export const FILL = COLUMNS.map((c) => ({ col: c, rate: PRODUCTS.filter((p) => p.raw[c] !== "").length / N }));

export function checksScript(lang: Lang): Script {
  const fr = lang === "fr";
  const ev: Event[] = [{ at: 150, log: { tag: "file", text: fr ? `Inventaire de ${COLUMNS.length} colonnes sur ${N} lignes` : `Inventory of ${COLUMNS.length} columns over ${N} rows` } }];
  const shown = FILL.filter((f) => f.rate < 1);
  spread(shown.length, 500, 2100, 3).forEach((at, i) => ev.push({ at, log: { tag: "file", text: `${shown[i].col}: ${fmtPct(shown[i].rate, lang, 0)} ${fr ? "rempli" : "filled"}` } }));
  const a = ANOMALIES.find((x) => x.id === "ean")!, w = ANOMALIES.find((x) => x.id === "weight")!;
  const row = fr ? "ligne" : "row";
  ev.push(
    { at: 2300, mark: "fill" },
    { at: 2600, log: { tag: "ean", text: fr ? `${N} codes-barres vérifiés par la clé de contrôle GS1` : `${N} barcodes checked against the GS1 check digit` } },
    { at: 3200, log: { tag: "warn", text: fr ? `${row} ${a.row + 1} ${label(PRODUCTS[a.row])} : ${a.from}, clé de contrôle fausse` : `${row} ${a.row + 1} ${label(PRODUCTS[a.row])}: ${a.from} fails the check digit`, warn: true }, mark: "anom:ean" },
    { at: 3700, log: { tag: "ean", text: fr ? "Aucun doublon · aucun code interne (préfixes 02, 20 à 29)" : "No duplicate codes · no internal codes (prefix 02, 20 to 29)" } },
    { at: 4200, log: { tag: "weight", text: fr ? `${N - 1} poids nets sur ${N}` : `${N - 1} of ${N} net weights present` } },
    { at: 4700, log: { tag: "warn", text: fr ? `${row} ${w.row + 1} ${label(PRODUCTS[w.row])} : poids net manquant · "175G" lu sur le libellé caisse` : `${row} ${w.row + 1} ${label(PRODUCTS[w.row])}: net weight missing · "175G" read from the till label`, warn: true }, mark: "anom:weight" },
    { at: 5300, log: { tag: "scope", text: fr ? `${row} ${idx("lotus") + 1} ${label(P("lotus"))} → non alimentaire, hors des deux périmètres` : `${row} ${idx("lotus") + 1} ${label(P("lotus"))} → non-food, out of both scopes` } },
    { at: 5800, log: { tag: "scope", text: fr ? `Appendix A, WWF seulement : ${label(P("cola"))} (soda), ${label(P("beer"))} (alcool)` : `Appendix A, WWF only: ${label(P("cola"))} (soft drink), ${label(P("beer"))} (alcohol)` } },
    { at: 6250, log: { tag: "scope", text: fr ? `Périmètre WWF : ${PRODUCTS.filter((p) => p.res.inWwf).length} produits` : `WWF scope: ${PRODUCTS.filter((p) => p.res.inWwf).length} products` } },
    { at: 6650, log: { tag: "scope", text: fr ? `Périmètre Protein Tracker : ${IN_PT.length} produits, toute l'alimentation` : `Protein Tracker scope: ${IN_PT.length} products, all food` }, mark: "scope" },
    { at: 7000, log: { tag: "warn", text: fr ? "2 anomalies attendent une décision" : "2 anomalies need a decision", warn: true } },
  );
  return { events: ev, total: 7200 };
}

// ------------------------------------------------------------ 3 · classification
const SEGMENT_KNOWN: Record<string, number> = { chicken: 5, camembert: 4, yogurt: 6, oil: 3, oat_drink: 4, bread: 5 };

export function classifyScript(lang: Lang): Script {
  const fr = lang === "fr";
  const ev: Event[] = [{ at: 150, log: { tag: "rules", text: fr ? `${IN_PT.length} produits à classer · base de référence, puis segments unanimes, puis modèle de langage` : `${IN_PT.length} products to classify · reference base, then unanimous segments, then the language model` } }];
  const ref = IN_PT.filter((p) => p.res.route === "reference");
  const seg = IN_PT.filter((p) => p.res.route === "segment");
  const mod = IN_PT.filter((p) => p.res.route === "model");
  spread(ref.length, 500, 2500, 5).forEach((at, i) => {
    const p = ref[i];
    ev.push({ at, mark: `cls:${idx(p.key)}`, log: { tag: "ref", text: `${p.res.ean} ${label(p)} → ${fr ? "connu" : "known"} · ${wwfText(p, lang)} | ${CLS[p.res.pt!]}` } });
  });
  spread(seg.length, 2800, 4300, 7).forEach((at, i) => {
    const p = seg[i];
    const n = SEGMENT_KNOWN[p.key] ?? 3;
    ev.push({ at, mark: `cls:${idx(p.key)}`, log: { tag: "segment", text: `${p.raw.department} › ${p.raw.segment}: ${fr ? `${n} produits connus concordent` : `${n} known products agree`} → ${wwfText(p, lang)} | ${CLS[p.res.pt!]}` } });
  });
  ev.push({ at: 4600, log: { tag: "model", text: fr ? `${mod.length} produits envoyés en un lot · instructions communes en cache · raisonnement désactivé` : `${mod.length} products sent in one batch · shared instructions cached · reasoning off` } });
  spread(mod.length, 5000, 8900, 11).forEach((at, i) => {
    const p = mod[i];
    ev.push({ at, mark: `cls:${idx(p.key)}`, log: { tag: "model", text: `${label(p)} → ${wwfText(p, lang)} | ${CLS[p.res.pt!]} · ${fmtNum(p.res.conf, lang, 2)}` } });
  });
  ev.push({ at: 9200, log: { tag: "rules", text: fr ? "Assembleur : aucun groupe sur les composés ✓ · sous-groupes en FG1, FG2, FG3, FG5 seulement ✓ · ×10 sur le fromage seulement ✓" : "Assembler: no food group on composites ✓ · sub-groups only in FG1, FG2, FG3, FG5 ✓ · ×10 on cheese only ✓" } });
  return { events: ev, total: 9500 };
}

// ------------------------------------------------------------ 4 · protein and split
const SIM: Record<string, number> = { peas: 0.91, mash: 0.88 };

export function matchScript(lang: Lang): Script {
  const fr = lang === "fr";
  const prot = ANOMALIES.find((a) => a.id === "protein")!;
  const declared = IN_PT.filter((p) => p.res.protSrc === "declared");
  const ev: Event[] = [{ at: 150, log: { tag: "declared", text: fr ? `${declared.length + 1} teneurs déclarées · contrôle d'énergie 4 × P + 9 × L + 4 × G (bière exclue : alcool)` : `${declared.length + 1} declared protein values · energy check 4 × P + 9 × F + 4 × C (beer left out: alcohol)` } }];
  spread(declared.length, 450, 1800, 13).forEach((at, i) => ev.push({ at, mark: `prot:${idx(declared[i].key)}` }));
  const sp = PRODUCTS[prot.row];
  ev.push({ at: 2000, mark: "anom:protein", log: { tag: "warn", warn: true, text: fr ? `${label(sp)} : ${prot.from} g déclarés · 562 kcal calculées, ${sp.raw.energy_kcal_100g} sur l'étiquette → chiffre par paquet` : `${label(sp)}: ${prot.from} g declared · 562 kcal computed, ${sp.raw.energy_kcal_100g} on the label → per-pack figure` } });
  const by = (s: string) => IN_PT.filter((p) => p.res.protSrc === s && p.key !== sp.key);
  const g = (p: Product) => `${fmtNum(p.res.prot, lang)} g`;
  spread(by("reference").length, 2500, 3300, 17).forEach((at, i) => {
    const p = by("reference")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "ref", text: fr ? `${label(p)} : base de référence Altera, par code-barres → ${g(p)}` : `${label(p)}: Altera reference base, by barcode → ${g(p)}` } });
  });
  spread(by("off").length, 3500, 4800, 19).forEach((at, i) => {
    const p = by("off")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "off", text: `${label(p)}${fr ? " :" : ":"} Open Food Facts ${p.res.ean} → ${g(p)}` } });
  });
  spread(by("ciqual").length, 5000, 5700, 23).forEach((at, i) => {
    const p = by("ciqual")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "ciqual", text: `${label(p)}${fr ? " : rapprochement par nom" : ": name match"} "${p.res.matched}" (${fmtNum(SIM[p.key], lang, 2)}) → ${g(p)}` } });
  });
  for (const p of by("median")) ev.push({ at: 5950, mark: `prot:${idx(p.key)}`, log: { tag: "median", text: fr ? `${label(p)} : médiane du segment "${p.raw.segment}" (n = 6) → ${g(p)}` : `${label(p)}: median of the segment "${p.raw.segment}" (n = 6) → ${g(p)}` } });

  const one = IN_PT.filter((p) => p.res.split === "one_side");
  const zero = IN_PT.filter((p) => p.res.split === "zero");
  ev.push({ at: 6300, log: { tag: "split", text: fr ? `Partage végétal / animal : ${one.length} produits d'une seule origine → 100 % végétal ou 100 % animal` : `Plant / animal split: ${one.length} single-origin products → 100% plant or 100% animal` } });
  spread(one.length, 6350, 6900, 29).forEach((at, i) => ev.push({ at, mark: `split:${idx(one[i].key)}` }));
  ev.push({ at: 7100, log: { tag: "split", text: fr ? `${zero.length} produits sans protéines : ${zero.map(label).join(", ")}` : `${zero.length} products carry no protein: ${zero.map(label).join(", ")}` } });
  zero.forEach((p) => ev.push({ at: 7150, mark: `split:${idx(p.key)}` }));
  const n = P("nutella"), l = P("lasagne"), pr = P("pringles"), pz = P("pizza");
  const pl = (p: Product) => `${fr ? "végétal" : "plant"} ${fmtPct(p.res.plant, lang, 0)} · ${fr ? "niveau" : "level"} ${p.res.level}`;
  ev.push(
    { at: 7550, mark: `split:${idx(n.key)}`, log: { tag: "split", text: fr ? `${label(n)} : liste d'ingrédients (noisettes 13 %, cacao 7,4 %, lait écrémé en poudre 6,6 %) → ${pl(n)}` : `${label(n)}: ingredient list (hazelnuts 13%, cocoa 7.4%, skimmed milk powder 6.6%) → ${pl(n)}` } },
    { at: 8050, mark: `split:${idx(l.key)}`, log: { tag: "split", text: fr ? `${label(l)} : liste d'ingrédients (bœuf 13,9 %, béchamel 33 %, emmental 2,7 %) → ${pl(l)}` : `${label(l)}: ingredient list (beef 13.9%, béchamel 33%, emmental 2.7%) → ${pl(l)}` } },
    { at: 8550, mark: `split:${idx(pr.key)}`, log: { tag: "nevo", text: fr ? `${label(pr)} : NEVO "${pr.res.matched}", choisi parmi 4 candidats → ${pl(pr)}` : `${label(pr)}: NEVO "${pr.res.matched}", chosen from 4 candidates → ${pl(pr)}` } },
    { at: 9150, mark: `split:${idx(pz.key)}`, log: { tag: "nevo", text: fr ? `${label(pz)} : pas de liste d'ingrédients · candidats NEVO Pizza margherita, Pizza salami, Pizza tonno · le modèle s'abstient → convention 50/50 · niveau B` : `${label(pz)}: no ingredient list · NEVO candidates Pizza margherita, Pizza salami, Pizza tonno · the model abstains → 50/50 convention · level B` } },
    { at: 9600, log: { tag: "warn", warn: true, text: fr ? "1 valeur attend une décision" : "1 value needs a decision" } },
  );
  return { events: ev, total: 9800 };
}

// ------------------------------------------------------------ 5 · ratios
export function ratiosScript(lang: Lang): Script {
  const fr = lang === "fr";
  const R = RESULTS;
  const pc = (v: number, d = 1) => fmtPct(v, lang, d);
  return {
    total: 5200,
    events: [
      { at: 150, log: { tag: "calc", text: fr ? `Masse vendue = unités × poids net · ${IN_PT.length} produits · ${fmtNum(R.massT, lang, 0)} t` : `Mass sold = units × net weight · ${IN_PT.length} products · ${fmtNum(R.massT, lang, 0)} t` } },
      { at: 900, log: { tag: "calc", text: fr ? "WWF · produits simples en tonnes, laitiers en équivalents lait (camembert ×10)" : "WWF · whole products in tonnes, dairy in dairy equivalents (camembert ×10)" } },
      { at: 1600, mark: "kpi:fg1", log: { tag: "calc", text: fr ? `WWF · part végétale FG1 ${pc(R.wwf.fg1)}` : `WWF · FG1 plant share ${pc(R.wwf.fg1)}` } },
      { at: 2200, mark: "kpi:fg2", log: { tag: "calc", text: fr ? `WWF · part végétale FG2 ${pc(R.wwf.fg2)}` : `WWF · FG2 plant share ${pc(R.wwf.fg2)}` } },
      { at: 2800, mark: "kpi:diet", log: { tag: "calc", text: fr ? `WWF · part végétale de l'alimentation ${pc(R.wwf.diet)} · composés ${pc(R.wwf.compositeShare)} des tonnes, présentés à part` : `WWF · whole diet plant share ${pc(R.wwf.diet)} · composites ${pc(R.wwf.compositeShare)} of tonnes, reported apart` } },
      { at: 3600, mark: "kpi:pt", log: { tag: "calc", text: fr ? `Protein Tracker · ${fmtNum(R.pt.plantT, lang)} t végétales ÷ ${fmtNum(R.pt.protT, lang)} t de protéines = ${pc(R.pt.ratio)}` : `Protein Tracker · ${fmtNum(R.pt.plantT, lang)} t plant ÷ ${fmtNum(R.pt.protT, lang)} t protein = ${pc(R.pt.ratio)}` } },
      { at: 4400, mark: "detail", log: { tag: "calc", text: fr ? `Détails : 4 classes · 7 groupes d'aliments · ${R.pt.byDept.length} rayons · niveau A ${pc(R.pt.levelA, 0)}` : `Breakdowns: 4 classes · 7 food groups · ${R.pt.byDept.length} departments · level A ${pc(R.pt.levelA, 0)}` } },
    ],
  };
}

// ------------------------------------------------------------ 6 · quality checks
export const CHECK_COUNT = [3, 3, 2, 2];
export function qualityScript(lang: Lang): Script {
  const n = IN_PT.length;
  const lines = lang === "fr" ? [
    `Identités · végétal + animal = total sur ${n} lignes ✓`, "Identités · chaque total égale la somme de son bloc ✓", "Identités · chaque tableau couvre toutes les valeurs de sa colonne ✓",
    "Méthode · aucun groupe d'aliments sur un composé WWF ✓", "Méthode · sous-groupes en FG1, FG2, FG3, FG5 seulement ✓", "Méthode · facteur laitier ×10 sur le fromage seulement (1 produit) ✓",
    "Données · bilan d'énergie des valeurs déclarées · 1 valeur remplacée ✓", `Données · ${n} valeurs sur ${n} portent leur source ✓`,
    "Classeur · chaque formule recalculée hors d'Excel · tout concorde ✓", "Classeur · 8 onglets évalués dans un tableur ✓",
  ] : [
    `Identities · plant + animal = total on ${n} rows ✓`, "Identities · every total equals the sum of its block ✓", "Identities · every table covers every value of its column ✓",
    "Methodology · no food group on a WWF composite ✓", "Methodology · sub-groups only in FG1, FG2, FG3, FG5 ✓", "Methodology · ×10 dairy factor on cheese only (1 product) ✓",
    "Data · energy balance of declared values · 1 value replaced ✓", `Data · ${n} of ${n} values carry their source ✓`,
    "Workbook · every formula recomputed outside Excel · all match ✓", "Workbook · 8 tabs evaluated in a spreadsheet ✓",
  ];
  const ev: Event[] = [];
  let k = 0;
  CHECK_COUNT.forEach((c, g) => { for (let i = 0; i < c; i++, k++) ev.push({ at: 400 + k * 560, mark: `chk:${g}-${i}`, log: { tag: "check", text: lines[k] } }); });
  ev.push({ at: 6300, mark: "sample", log: { tag: "check", text: lang === "fr" ? `Échantillon de contrôle : ${n} lignes scellées pour la relecture humaine` : `Control sample: ${n} rows sealed for human review` } });
  return { events: ev, total: 6700 };
}

// ------------------------------------------------------------ 7 · deliverables
export const FILE_WINDOWS: [number, number][] = [[200, 2600], [2600, 4200], [4200, 6400], [6400, 7800]];
export function deliverScript(lang: Lang): Script {
  const fr = lang === "fr";
  const text = fr ? [
    "Classeur · 8 onglets, piloté par formules · une seule entrée : les volumes · recalculé hors d'Excel ✓",
    `Fichier ligne à ligne · ${IN_PT.length} lignes · classe, teneur, partage, niveau et source de chaque valeur ✓`,
    "Rapport d'analyse · 5 pages ✓",
    "Déclaration de périmètre · périmètre couvert, approche produit par produit, données utilisées, hypothèses de volumes ✓",
  ] : [
    "Workbook · 8 tabs, formula-driven · one input: volumes · recomputed outside Excel ✓",
    `Line-level file · ${IN_PT.length} rows · class, content, split, level and source of every value ✓`,
    "Insights report · 5 pages ✓",
    "Scope statement · scope covered, product-level approach, data used, volume assumptions ✓",
  ];
  return {
    total: 8000,
    events: FILE_WINDOWS.flatMap(([a, b], i) => [
      { at: a, log: { tag: "out", text: `${text[i].split(" · ")[0]} · ${fr ? "en cours" : "building"}…` } },
      { at: b - 100, mark: `file:${i}`, log: { tag: "out", text: text[i] } },
    ]),
  };
}
