// The scripts the demo plays when the presenter presses a button. Nothing is computed by a
// remote service: every result was prepared from the catalogue, and each script only paces
// its arrival, with the engine log a real run would print.
import type { Event } from "./runner";
import { spread } from "./runner";
import type { Lang, Product } from "./types";
import { ANOMALIES, COLUMNS, COLUMN_NAMES, IN_PT, N, PRODUCTS, RESULTS, fmtNum, fmtPct, segment, tillLabel } from "./data";

const idx = (key: string) => PRODUCTS.findIndex((p) => p.key === key);
const P = (key: string) => PRODUCTS[idx(key)];
const label = (p: Product, lang: Lang) => tillLabel(p, lang);
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
export function importScript(bytes: number, lang: Lang, name: string, delim: string): Script {
  const fr = lang === "fr";
  return {
    total: 3400,
    events: [
      { at: 150, log: { tag: "file", text: `${name} ${fr ? "reçu" : "received"} · ${fmtNum(bytes / 1024, lang, 1)} ${fr ? "Ko" : "KB"}` } },
      { at: 900, log: { tag: "file", text: fr ? "Archivé tel que reçu, en lecture seule · sha256 3f9a…c21e" : "Archived as received, read-only · sha256 3f9a…c21e" } },
      { at: 1700, log: { tag: "file", text: fr ? `UTF-8 · séparateur "${delim}" · ${N} lignes · ${COLUMNS.length} colonnes` : `UTF-8 · delimiter "${delim}" · ${N} rows · ${COLUMNS.length} columns` } },
      { at: 2500, log: { tag: "file", text: fr ? "En-tête conforme au modèle d'import Altera · travail sur une copie" : "Header matches the Altera import template · working on a copy" } },
      { at: 3200, mark: "imported" },
    ],
  };
}

// ------------------------------------------------------------ 2 · data checks
export const FILL = COLUMNS.map((c, i) => ({ col: c, i, rate: PRODUCTS.filter((p) => p.raw[c] !== "").length / N }));

export function checksScript(lang: Lang): Script {
  const fr = lang === "fr";
  const ev: Event[] = [{ at: 150, log: { tag: "file", text: fr ? `Inventaire de ${COLUMNS.length} colonnes sur ${N} lignes` : `Inventory of ${COLUMNS.length} columns over ${N} rows` } }];
  const shown = FILL.filter((f) => f.rate < 1);
  spread(shown.length, 500, 2100, 3).forEach((at, i) => ev.push({ at, log: { tag: "file", text: `${COLUMN_NAMES[lang][shown[i].i]}${fr ? " :" : ":"} ${fmtPct(shown[i].rate, lang, 0)} ${fr ? "rempli" : "filled"}` } }));
  const a = ANOMALIES.find((x) => x.id === "ean")!, w = ANOMALIES.find((x) => x.id === "weight")!;
  const row = fr ? "ligne" : "row";
  ev.push(
    { at: 2300, mark: "fill" },
    { at: 2600, log: { tag: "ean", text: fr ? `${N} codes-barres vérifiés par la clé de contrôle GS1` : `${N} barcodes checked against the GS1 check digit` } },
    { at: 3200, log: { tag: "warn", text: fr ? `${row} ${a.row + 1} ${label(PRODUCTS[a.row], lang)} : ${a.from}, clé de contrôle fausse` : `${row} ${a.row + 1} ${label(PRODUCTS[a.row], lang)}: ${a.from} fails the check digit`, warn: true }, mark: "anom:ean" },
    { at: 3700, log: { tag: "ean", text: fr ? "Aucun doublon · aucun code interne (préfixes 02, 20 à 29)" : "No duplicate codes · no internal codes (prefix 02, 20 to 29)" } },
    { at: 4200, log: { tag: "weight", text: fr ? `${N - 1} poids nets sur ${N}` : `${N - 1} of ${N} net weights present` } },
    { at: 4700, log: { tag: "warn", text: fr ? `${row} ${w.row + 1} ${label(PRODUCTS[w.row], lang)} : poids net manquant · "175G" lu sur le libellé caisse` : `${row} ${w.row + 1} ${label(PRODUCTS[w.row], lang)}: net weight missing · "175G" read from the till label`, warn: true }, mark: "anom:weight" },
    { at: 5300, log: { tag: "scope", text: fr ? `${row} ${idx("lotus") + 1} ${label(P("lotus"), lang)} → non alimentaire, hors des deux périmètres` : `${row} ${idx("lotus") + 1} ${label(P("lotus"), lang)} → non-food, out of both scopes` } },
    { at: 5800, log: { tag: "scope", text: fr ? `Appendix A, WWF seulement : ${label(P("cola"), lang)} (soda), ${label(P("beer"), lang)} (alcool)` : `Appendix A, WWF only: ${label(P("cola"), lang)} (soft drink), ${label(P("beer"), lang)} (alcohol)` } },
    { at: 6250, log: { tag: "scope", text: fr ? `Périmètre WWF : ${PRODUCTS.filter((p) => p.res.inWwf).length} produits` : `WWF scope: ${PRODUCTS.filter((p) => p.res.inWwf).length} products` } },
    { at: 6650, log: { tag: "scope", text: fr ? `Périmètre Protein Tracker : ${IN_PT.length} produits, toute l'alimentation` : `Protein Tracker scope: ${IN_PT.length} products, all food` }, mark: "scope" },
    { at: 7000, log: { tag: "warn", text: fr ? "2 anomalies attendent une décision" : "2 anomalies need a decision", warn: true } },
  );
  return { events: ev, total: 7200 };
}

// ------------------------------------------------------------ 3 · classification
export function classifyScript(lang: Lang): Script {
  const fr = lang === "fr";
  const ev: Event[] = [{ at: 150, log: { tag: "rules", text: fr ? `${IN_PT.length} produits à classer · base de référence Altera, puis modèle de langage` : `${IN_PT.length} products to classify · Altera reference base, then the language model` } }];
  const out = P("lotus");
  ev.push({ at: 350, mark: `cls:${idx(out.key)}`, log: { tag: "scope", text: fr ? `${label(out, lang)} → hors périmètre, non alimentaire : non classé` : `${label(out, lang)} → out of scope, non-food: not classified` } });
  const ref = IN_PT.filter((p) => p.res.route === "reference");
  const mod = IN_PT.filter((p) => p.res.route === "model");
  spread(ref.length, 600, 3700, 5).forEach((at, i) => {
    const p = ref[i];
    ev.push({ at, mark: `cls:${idx(p.key)}`, log: { tag: "ref", text: `${p.res.ean} ${label(p, lang)} → ${fr ? "connu" : "known"} · ${wwfText(p, lang)} | ${CLS[p.res.pt!]}` } });
  });
  ev.push({ at: 4000, log: { tag: "model", text: fr ? `${mod.length} produits envoyés en un lot · instructions communes en cache · raisonnement désactivé` : `${mod.length} products sent in one batch · shared instructions cached · reasoning off` } });
  spread(mod.length, 4400, 8900, 11).forEach((at, i) => {
    const p = mod[i];
    ev.push({ at, mark: `cls:${idx(p.key)}`, log: { tag: "model", text: `${label(p, lang)} → ${wwfText(p, lang)} | ${CLS[p.res.pt!]} · ${fmtNum(p.res.conf, lang, 2)}` } });
  });
  ev.push({ at: 9200, log: { tag: "rules", text: fr ? "Assembleur : aucun groupe sur les composés ✓ · sous-groupes en FG1, FG2, FG3, FG5 seulement ✓ · ×10 sur le fromage seulement ✓" : "Assembler: no food group on composites ✓ · sub-groups only in FG1, FG2, FG3, FG5 ✓ · ×10 on cheese only ✓" } });
  return { events: ev, total: 9500 };
}

// ------------------------------------------------------------ 4 · protein and split
const SIM: Record<string, number> = { peas: 0.91, mash: 0.88 };
/** CIQUAL names its foods in French, NEVO in Dutch: the log glosses them in the reader's language. */
const GLOSS: Record<Lang, Record<string, string>> = {
  en: { peas: "garden peas, canned, drained", mash: "mashed potato, dehydrated flakes", pringles: "crisps, flavoured" },
  fr: { pringles: "chips aromatisées" },
};
const matched = (p: Product & { key: string }, lang: Lang) => `"${p.res.matched}"${GLOSS[lang][p.key] ? ` (${GLOSS[lang][p.key]})` : ""}`;

export function matchScript(lang: Lang): Script {
  const fr = lang === "fr";
  const prot = ANOMALIES.find((a) => a.id === "protein")!;
  const declared = IN_PT.filter((p) => p.res.protSrc === "declared");
  const ev: Event[] = [{ at: 150, log: { tag: "declared", text: fr ? `${declared.length + 1} teneurs déclarées · contrôle d'énergie 4 × P + 9 × L + 4 × G (bière exclue : alcool)` : `${declared.length + 1} declared protein values · energy check 4 × P + 9 × F + 4 × C (beer left out: alcohol)` } }];
  spread(declared.length, 450, 1800, 13).forEach((at, i) => ev.push({ at, mark: `prot:${idx(declared[i].key)}` }));
  const sp = PRODUCTS[prot.row];
  ev.push({ at: 2000, mark: "anom:protein", log: { tag: "warn", warn: true, text: fr ? `${label(sp, lang)} : ${prot.from} g déclarés · 562 kcal calculées, ${sp.raw.energy_kcal_100g} sur l'étiquette → chiffre par paquet` : `${label(sp, lang)}: ${prot.from} g declared · 562 kcal computed, ${sp.raw.energy_kcal_100g} on the label → per-pack figure` } });
  const by = (s: string) => IN_PT.filter((p) => p.res.protSrc === s && p.key !== sp.key);
  const g = (p: Product) => `${fmtNum(p.res.prot, lang)} g`;
  spread(by("reference").length, 2500, 3300, 17).forEach((at, i) => {
    const p = by("reference")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "ref", text: fr ? `${label(p, lang)} : base de référence Altera, par code-barres → ${g(p)}` : `${label(p, lang)}: Altera reference base, by barcode → ${g(p)}` } });
  });
  spread(by("off").length, 3500, 4800, 19).forEach((at, i) => {
    const p = by("off")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "off", text: `${label(p, lang)}${fr ? " :" : ":"} Open Food Facts ${p.res.ean} → ${g(p)}` } });
  });
  spread(by("ciqual").length, 5000, 5700, 23).forEach((at, i) => {
    const p = by("ciqual")[i];
    ev.push({ at, mark: `prot:${idx(p.key)}`, log: { tag: "ciqual", text: `${label(p, lang)}${fr ? " : rapprochement par nom" : ": name match"} ${matched(p, lang)}, ${fr ? "similarité" : "similarity"} ${fmtNum(SIM[p.key], lang, 2)} → ${g(p)}` } });
  });
  for (const p of by("median")) ev.push({ at: 5950, mark: `prot:${idx(p.key)}`, log: { tag: "median", text: fr ? `${label(p, lang)} : médiane du segment "${segment(p.raw.segment, lang)}" (n = 6) → ${g(p)}` : `${label(p, lang)}: median of the segment "${p.raw.segment}" (n = 6) → ${g(p)}` } });

  const one = IN_PT.filter((p) => p.res.split === "one_side");
  const zero = IN_PT.filter((p) => p.res.split === "zero");
  ev.push({ at: 6300, log: { tag: "split", text: fr ? `Partage végétal / animal : ${one.length} produits d'une seule origine → 100 % végétal ou 100 % animal` : `Plant / animal split: ${one.length} single-origin products → 100% plant or 100% animal` } });
  spread(one.length, 6350, 6900, 29).forEach((at, i) => ev.push({ at, mark: `split:${idx(one[i].key)}` }));
  ev.push({ at: 7100, log: { tag: "split", text: fr ? `${zero.length} produits sans protéines : ${zero.map((p) => label(p, lang)).join(", ")}` : `${zero.length} products carry no protein: ${zero.map((p) => label(p, lang)).join(", ")}` } });
  zero.forEach((p) => ev.push({ at: 7150, mark: `split:${idx(p.key)}` }));
  const n = P("nutella"), l = P("lasagne"), pr = P("pringles"), pz = P("pizza");
  const pl = (p: Product) => `${fr ? "végétal" : "plant"} ${fmtPct(p.res.plant, lang, 0)} · ${fr ? "niveau" : "level"} ${p.res.level}`;
  ev.push(
    { at: 7550, mark: `split:${idx(n.key)}`, log: { tag: "split", text: fr ? `${label(n, lang)} : liste d'ingrédients (noisettes 13 %, cacao 7,4 %, lait écrémé en poudre 6,6 %) → ${pl(n)}` : `${label(n, lang)}: ingredient list (hazelnuts 13%, cocoa 7.4%, skimmed milk powder 6.6%) → ${pl(n)}` } },
    { at: 8050, mark: `split:${idx(l.key)}`, log: { tag: "split", text: fr ? `${label(l, lang)} : liste d'ingrédients (bœuf 13,9 %, béchamel 33 %, emmental 2,7 %) → ${pl(l)}` : `${label(l, lang)}: ingredient list (beef 13.9%, béchamel 33%, emmental 2.7%) → ${pl(l)}` } },
    { at: 8550, mark: `split:${idx(pr.key)}`, log: { tag: "nevo", text: fr ? `${label(pr, lang)} : NEVO ${matched(pr, lang)}, choisi parmi 4 candidats → ${pl(pr)}` : `${label(pr, lang)}: NEVO ${matched(pr, lang)}, chosen from 4 candidates → ${pl(pr)}` } },
    { at: 9150, mark: `split:${idx(pz.key)}`, log: { tag: "nevo", text: fr ? `${label(pz, lang)} : pas de liste d'ingrédients · candidats NEVO Pizza margherita, Pizza salami, Pizza tonno · le modèle s'abstient → convention 50/50 · niveau B` : `${label(pz, lang)}: no ingredient list · NEVO candidates Pizza margherita, Pizza salami, Pizza tonno · the model abstains → 50/50 convention · level B` } },
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
export const CHECK_COUNT = [3, 3, 2, 2, 3];
/** Values cross-checked between sources: by barcode against Open Food Facts, by name against NEVO. */
const byBarcode = IN_PT.filter((p) => p.res.protSrc === "declared" || p.res.protSrc === "reference").length + 1; // + the per-pack value
const byName = IN_PT.filter((p) => p.res.protSrc === "off" || p.res.protSrc === "ciqual").length;
export const CROSS = { a: byBarcode, b: byBarcode - 1, c: byName };

export function qualityScript(lang: Lang): Script {
  const n = IN_PT.length;
  const fr = lang === "fr";
  const pr = P("pringles"), pz = P("pizza");
  const lines = fr ? [
    `Identités · végétal + animal = total sur ${n} lignes ✓`, "Identités · chaque total égale la somme de son bloc ✓", "Identités · chaque tableau couvre toutes les valeurs de sa colonne ✓",
    "Méthode · aucun groupe d'aliments sur un composé WWF ✓", "Méthode · sous-groupes en FG1, FG2, FG3, FG5 seulement ✓", "Méthode · facteur laitier ×10 sur le fromage seulement (1 produit) ✓",
    "Données · bilan d'énergie des valeurs déclarées · 1 valeur remplacée ✓", `Données · ${n} valeurs sur ${n} portent leur source ✓`,
    "Classeur · chaque formule recalculée hors d'Excel · tout concorde ✓", "Classeur · 8 onglets évalués dans un tableur ✓",
    `Sources · ${CROSS.a} teneurs comparées à Open Food Facts par code-barres : ${CROSS.b} concordent, 1 valeur par paquet déjà remplacée ✓`,
    `Sources · ${CROSS.c} teneurs Open Food Facts et CIQUAL comparées à NEVO par nom : toutes dans la tolérance d'étiquetage UE ✓`,
    `Sources · ${label(pr, lang)} : partage NEVO ${matched(pr, lang)} ${fmtPct(pr.res.plant, lang, 0)} végétal contre la liste d'ingrédients (pomme de terre, farines de riz et de maïs en tête ; lait seulement dans l'assaisonnement) → cohérent ✓`,
  ] : [
    `Identities · plant + animal = total on ${n} rows ✓`, "Identities · every total equals the sum of its block ✓", "Identities · every table covers every value of its column ✓",
    "Methodology · no food group on a WWF composite ✓", "Methodology · sub-groups only in FG1, FG2, FG3, FG5 ✓", "Methodology · ×10 dairy factor on cheese only (1 product) ✓",
    "Data · energy balance of declared values · 1 value replaced ✓", `Data · ${n} of ${n} values carry their source ✓`,
    "Workbook · every formula recomputed outside Excel · all match ✓", "Workbook · 8 tabs evaluated in a spreadsheet ✓",
    `Sources · ${CROSS.a} protein values against Open Food Facts by barcode: ${CROSS.b} match, 1 per-pack value already replaced ✓`,
    `Sources · ${CROSS.c} Open Food Facts and CIQUAL values against NEVO by name: all within the EU labelling tolerance ✓`,
    `Sources · ${label(pr, lang)}: NEVO split ${matched(pr, lang)} ${fmtPct(pr.res.plant, lang, 0)} plant against the ingredient list (potato, rice and maize flour first; milk only in the seasoning) → consistent ✓`,
  ];
  const ev: Event[] = [];
  let k = 0;
  CHECK_COUNT.forEach((c, g) => { for (let i = 0; i < c; i++, k++) ev.push({ at: 400 + k * 540, mark: `chk:${g}-${i}`, log: { tag: "check", text: lines[k] } }); });
  ev.push({ at: 400 + (k - 1) * 540 + 300, log: { tag: "check", text: fr ? `Sources · ${label(pz, lang)} : candidats NEVO en désaccord, le partage NEVO n'est pas retenu → convention 50/50, niveau B ✓` : `Sources · ${label(pz, lang)}: NEVO candidates disagree, no NEVO split kept → 50/50 convention, level B ✓` } });
  const end = 400 + k * 540 + 500;
  ev.push({ at: end, mark: "sample", log: { tag: "check", text: fr ? `Échantillon de contrôle : ${n} lignes scellées pour la relecture humaine` : `Control sample: ${n} rows sealed for human review` } });
  return { events: ev, total: end + 400 };
}

// ------------------------------------------------------------ 7 · deliverables
// the insights report first, then the workbook, the line-level file and the scope statement
export const DELIVER_TOTAL = 20000;
export const FILE_WINDOWS: [number, number][] = [[300, 7000], [7000, 13200], [13200, 16200], [16200, 19600]];
export function deliverScript(lang: Lang): Script {
  const fr = lang === "fr";
  const R = RESULTS;
  const name = fr ? ["Rapport d'analyse", "Classeur", "Fichier ligne à ligne", "Déclaration de périmètre"] : ["Insights report", "Workbook", "Line-level file", "Scope statement"];
  const steps: string[][] = fr ? [
    [`page 1/5 · couverture, les ratios en un coup d'œil`, `page 2/5 · le périmètre : ${IN_PT.length} produits, ${fmtNum(R.massT, lang, 0)} t`, "page 3/5 · WWF par groupe d'aliments", "page 4/5 · Protein Tracker par classe et par rayon", "page 5/5 · les leviers : 3 scénarios recalculés"],
    ["onglets Welcome, Protein Tracker, WWF, By category", "onglets By department, By brand, By product, Data", "1 098 formules écrites · une seule saisie : les volumes", "recalcul dans un tableur : aucune cellule en erreur, ratios conformes"],
    [`${N} lignes · 30 colonnes, celles de l'onglet Data`, "source de chaque valeur écrite"],
    ["périmètre couvert · approche produit par produit", "données utilisées · hypothèses de volumes"],
  ] : [
    ["page 1/5 · cover, the ratios at a glance", `page 2/5 · the scope: ${IN_PT.length} products, ${fmtNum(R.massT, lang, 0)} t`, "page 3/5 · WWF by food group", "page 4/5 · Protein Tracker by class and department", "page 5/5 · the levers: 3 scenarios recalculated"],
    ["tabs Welcome, Protein Tracker, WWF, By category", "tabs By department, By brand, By product, Data", "1,098 formulas written · one input: volumes", "recalculated in a spreadsheet: no error cell, ratios match"],
    [`${N} rows · 30 columns, those of the Data tab`, "source of every value written"],
    ["scope covered · product-level approach", "data used · volume assumptions"],
  ];
  const done = fr
    ? ["5 pages ✓", "8 onglets, piloté par formules ✓", `${N} lignes ✓`, "1 page ✓"]
    : ["5 pages ✓", "8 tabs, formula-driven ✓", `${N} rows ✓`, "1 page ✓"];
  return {
    total: DELIVER_TOTAL,
    events: FILE_WINDOWS.flatMap(([a, b], i) => [
      { at: a, log: { tag: "out", text: `${name[i]} · ${fr ? "en cours" : "building"}…` } },
      ...spread(steps[i].length, a + 400, b - 700, 31 + i).map((at, j) => ({ at, log: { tag: "out", text: `${name[i]} · ${steps[i][j]}` } })),
      { at: b - 100, mark: `file:${i}`, log: { tag: "out", text: `${name[i]} · ${done[i]}` } },
    ]),
  };
}
