// The demo catalogue (scripts/build_dataset.py): 30 real products, a fictitious retailer.
import raw from "./data/catalogue.json";
import type { Anomaly, Lang, Product, PtClass, RawRow } from "./types";

interface Catalogue {
  columns: (keyof RawRow)[];
  fr: { columns: string[]; segments: Record<string, string>; departments: Record<string, string> };
  products: (Product & { key: string })[];
  anomalies: Anomaly[];
}
const CAT = raw as unknown as Catalogue;

export const COLUMNS = CAT.columns;
/** Column names as each demo file spells them: the French file has French headers. */
export const COLUMN_NAMES: Record<Lang, string[]> = { en: CAT.columns, fr: CAT.fr.columns };
export const segment = (s: string, lang: Lang) => (lang === "fr" ? CAT.fr.segments[s] ?? s : s);
/** A product's till label, name and ingredients, as the demo file of that language gives them. */
export const tillLabel = (p: Product, lang: Lang) => (lang === "fr" ? p.fr.till_label : p.raw.till_label);
export const productName = (p: Product, lang: Lang) => (lang === "fr" ? p.fr.product_name : p.raw.product_name);
export const ingredients = (p: Product, lang: Lang) => (lang === "fr" ? p.fr.ingredients : p.raw.ingredients);
export const PRODUCTS = CAT.products;
export const ANOMALIES = CAT.anomalies;
export const N = PRODUCTS.length;
export const IN_PT = PRODUCTS.filter((p) => p.res.inPt);
export const IN_WWF = PRODUCTS.filter((p) => p.res.inWwf);
/** One demo file per language: the French one has French headers, semicolons and decimal commas. */
export const DEMO_FILES: Record<Lang, string> = { en: "harbour_market_catalogue.csv", fr: "catalogue_harbour_market.csv" };
export const BOOKING_URL = "https://calendar.google.com/appointments/schedules/AcZssZ3Ft80cRX9S775isS1JromPC4cnU7qQvtdJC6jh7ePlIEe8xlKqjuxUsqtR-qw30JNnPhbFGbyO";
export const DOWNLOADS = {
  workbook: "downloads/HarbourMarket_Protein_Ratio_DEMO.xlsx",
  csv: "downloads/HarbourMarket_products_DEMO.csv",
  report: { en: "downloads/HarbourMarket_Insights_Report_EN.pdf", fr: "downloads/HarbourMarket_Insights_Report_FR.pdf" },
  scope: { en: "downloads/HarbourMarket_Scope_Statement_EN.pdf", fr: "downloads/HarbourMarket_Scope_Statement_FR.pdf" },
};

// ------------------------------------------------------------ the file the presenter drops
/** The delimiter of a CSV, read from its header line: semicolon (French exports) or comma. */
export function delimiterOf(text: string): string {
  const head = text.split(/\r?\n/, 1)[0];
  return (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
}

/** Minimal CSV parser: one delimiter, double quotes, embedded quotes and delimiters. */
export function parseCsv(text: string, delim = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** The demo is scripted on its two files: same header (English or French), same barcodes, same row count. */
export function isDemoFile(text: string): boolean {
  const clean = text.replace(/^\uFEFF/, "");
  const rows = parseCsv(clean, delimiterOf(clean));
  if (rows.length !== N + 1) return false;
  if (!Object.values(COLUMN_NAMES).some((cols) => rows[0].join("|") === cols.join("|"))) return false;
  const eans = new Set(rows.slice(1).map((r) => r[0]));
  return PRODUCTS.every((p) => eans.has(p.raw.ean));
}

// ------------------------------------------------------------ the two ratios
const kg = (p: Product) => Number(p.raw.units_sold_12m) * p.res.weightKg;

export const FOOD_GROUPS = ["FG1", "FG2", "FG3", "FG4", "FG5", "FG6", "FG7"];
export const PT_CLASSES: PtClass[] = ["animal_core", "composite", "plant_non_core", "plant_core"];

function compute() {
  // Protein Tracker: tonnes of protein, across all food
  let prot = 0, plant = 0, levelA = 0;
  const byClass = Object.fromEntries(PT_CLASSES.map((c) => [c, 0])) as Record<PtClass, number>;
  const byDept = new Map<string, { prot: number; plant: number }>();
  for (const p of IN_PT) {
    const t = (kg(p) * p.res.prot) / 100;
    prot += t; plant += t * p.res.plant;
    byClass[p.res.pt!] += t;
    if (p.res.level === "A") levelA += t;
    const d = byDept.get(p.raw.department) ?? { prot: 0, plant: 0 };
    d.prot += t; d.plant += t * p.res.plant;
    byDept.set(p.raw.department, d);
  }
  // WWF: tonnes of product, whole products by food group in dairy equivalents, composites apart
  const groups = Object.fromEntries(FOOD_GROUPS.map((g) => [g, { plant: 0, animal: 0 }])) as Record<string, { plant: number; animal: number }>;
  const cats: Record<string, number> = { meat_based: 0, seafood_based: 0, vegetarian: 0, vegan: 0 };
  let whole = 0, composite = 0;
  for (const p of IN_WWF) {
    const t = kg(p) / 1000;
    const w = p.res.wwf!;
    if (w.struct === "composite") { composite += t; cats[w.cat!] += t; continue; }
    whole += t;
    const eq = t * p.res.dairy;
    groups[w.fg!][w.origin === "plant" ? "plant" : "animal"] += eq;
  }
  const share = (g: string[]) => {
    const pl = g.reduce((a, k) => a + groups[k].plant, 0), tot = g.reduce((a, k) => a + groups[k].plant + groups[k].animal, 0);
    return tot ? pl / tot : 0;
  };
  return {
    pt: { ratio: plant / prot, protT: prot / 1000, plantT: plant / 1000, levelA: levelA / prot, byClass: Object.fromEntries(PT_CLASSES.map((c) => [c, byClass[c] / prot])) as Record<PtClass, number>,
      byDept: [...byDept].map(([d, v]) => ({ dept: d, t: v.prot / 1000, ratio: v.prot ? v.plant / v.prot : 0 })).sort((a, b) => b.t - a.t) },
    wwf: { fg1: share(["FG1"]), fg2: share(["FG2"]), diet: share(FOOD_GROUPS), groups, cats, wholeT: whole, compositeT: composite, compositeShare: composite / (whole + composite) },
    massT: IN_PT.reduce((a, p) => a + kg(p), 0) / 1000,
  };
}
export const RESULTS = compute();
export const PHD = { fg1: 0.6, diet: 0.74 };

export const fmtNum = (v: number, lang: string, d = 1) => v.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (v: number, lang: string, d = 1) => `${fmtNum(v * 100, lang, d)}${lang === "fr" ? " %" : "%"}`;
export const fmtInt = (v: number, lang: string) => Math.round(v).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB");
