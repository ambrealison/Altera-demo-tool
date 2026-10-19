// Print the two PDF deliverables of the demo, in English and French:
//   public/downloads/HarbourMarket_Insights_Report_{EN,FR}.pdf   five 16:9 pages
//   public/downloads/HarbourMarket_Scope_Statement_{EN,FR}.pdf   one A4 page
//
//     node scripts/build_documents.mjs
//
// Every figure is computed here from src/data/catalogue.json, the file the app reads, with the
// same rules as the workbook; the ratios are checked against the workbook's before printing.
// Uses the local Chrome through puppeteer-core (set CHROME_PATH elsewhere than macOS).
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cat = JSON.parse(readFileSync(join(ROOT, "src/data/catalogue.json"), "utf8"));
const P = cat.products;
const IN_PT = P.filter((p) => p.res.inPt);
const FG = ["FG1", "FG2", "FG3", "FG4", "FG5", "FG6", "FG7"];
const CLASSES = ["animal_core", "composite", "plant_non_core", "plant_core"];
const PHD = { fg1: 0.6, diet: 0.74 };

// ------------------------------------------------------------ the figures
const kgBase = (p) => Number(p.raw.units_sold_12m) * p.res.weightKg;
function compute(kgOf = kgBase) {
  let prot = 0, plant = 0, levelA = 0, mass = 0, whole = 0, comp = 0;
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const byDept = new Map();
  const groups = Object.fromEntries(FG.map((g) => [g, { plant: 0, animal: 0 }]));
  const cats = { meat_based: 0, seafood_based: 0, vegetarian: 0, vegan: 0 };
  for (const p of P) {
    const kg = kgOf(p);
    if (p.res.inPt) {
      const t = (kg * p.res.prot) / 100 / 1000;
      prot += t; plant += t * p.res.plant; mass += kg / 1000;
      byClass[p.res.pt] += t;
      if (p.res.level === "A") levelA += t;
      const d = byDept.get(p.raw.department) ?? { t: 0, plant: 0 };
      d.t += t; d.plant += t * p.res.plant;
      byDept.set(p.raw.department, d);
    }
    if (p.res.inWwf) {
      const t = kg / 1000, w = p.res.wwf;
      if (w.struct === "composite") { comp += t; cats[w.cat] += t; continue; }
      whole += t;
      groups[w.fg][w.origin === "plant" ? "plant" : "animal"] += t * p.res.dairy;
    }
  }
  const share = (gs) => {
    const pl = gs.reduce((a, g) => a + groups[g].plant, 0), all = gs.reduce((a, g) => a + groups[g].plant + groups[g].animal, 0);
    return all ? pl / all : 0;
  };
  return {
    prot, plant, mass, levelA: levelA / prot, pt: plant / prot, byClass,
    byDept: [...byDept].map(([dept, v]) => ({ dept, t: v.t, ratio: v.t ? v.plant / v.t : 0 })).sort((a, b) => b.t - a.t),
    groups, cats, whole, comp, compShare: comp / (whole + comp),
    fg1: share(["FG1"]), fg2: share(["FG2"]), diet: share(FG),
  };
}
const R = compute();
// the workbook prints these four (scripts/build_workbook.py); the report must say the same
for (const [k, want] of Object.entries({ fg1: 0.086, fg2: 0.103, diet: 0.296, pt: 0.349 })) {
  if (Math.abs(R[k] - want) > 0.0006) throw new Error(`${k} = ${R[k]} differs from the workbook (${want})`);
}
const shift = (from, to, share) => (p) => {
  const moved = kgBase(P.find((x) => x.key === from)) * share;
  return p.key === from ? kgBase(p) - moved : p.key === to ? kgBase(p) + moved : kgBase(p);
};
const SCEN = [
  { id: "milk", r: compute(shift("milk", "soy_drink", 0.2)), wwf: "fg2" },
  { id: "beef", r: compute(shift("beef_mince", "plant_mince", 0.2)), wwf: "fg1" },
  { id: "plant", r: compute((p) => (["lentils", "tofu", "plant_mince"].includes(p.key) ? 2 : 1) * kgBase(p)), wwf: "fg1" },
];
const key = (k) => P.find((p) => p.key === k);
const protOf = (k) => (kgBase(key(k)) * key(k).res.prot) / 1e5;
const fg1Animal = P.filter((p) => p.res.inWwf && p.res.wwf?.fg === "FG1" && p.res.wwf.origin === "animal");
const count = (f, v) => IN_PT.filter((p) => p.res[f] === v).length;
const declaredShare = IN_PT.filter((p) => p.res.protSrc === "declared").reduce((a, p) => a + (kgBase(p) * p.res.prot) / 1e5, 0) / R.prot;
const levelB = IN_PT.filter((p) => p.res.level === "B");

// ------------------------------------------------------------ words
const loc = (lang) => (lang === "fr" ? "fr-FR" : "en-GB");
const num = (v, lang, d = 1) => v.toLocaleString(loc(lang), { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, lang, d = 1) => `${num(v * 100, lang, d)}${lang === "fr" ? " %" : "%"}`;
const pts = (v, lang) => `+${num(v * 100, lang, 1)} pts`;
const t = (v, lang, d = 1) => `${num(v, lang, d)} t`;
const DEPT_FR = { Butchery: "Boucherie", Poultry: "Volaille", Deli: "Charcuterie", Grocery: "Épicerie", Dairy: "Crèmerie", Cheese: "Fromages",
  "Plant-based": "Végétal", Bakery: "Boulangerie", Breakfast: "Petit-déjeuner", Snacks: "Biscuits et snacks", "Ready meals": "Plats préparés",
  Frozen: "Surgelés", Drinks: "Boissons", "Beer & wine": "Bières et vins", Household: "Droguerie" };
const dept = (d, lang) => (lang === "fr" ? DEPT_FR[d] ?? d : d);
const CLASS = { animal_core: "Animal core", composite: "Composite", plant_non_core: "Plant-based non-core", plant_core: "Plant-based core" };
const CLASS_COLOR = { animal_core: "var(--animal)", composite: "var(--comp)", plant_non_core: "var(--plant-2)", plant_core: "var(--plant)" };
const FG_NAME = {
  en: { FG1: "Protein-rich foods", FG2: "Dairy", FG3: "Fats", FG4: "Fruit and vegetables", FG5: "Grains", FG6: "Tubers", FG7: "Other foods" },
  fr: { FG1: "Aliments riches en protéines", FG2: "Produits laitiers", FG3: "Matières grasses", FG4: "Fruits et légumes", FG5: "Céréales", FG6: "Tubercules", FG7: "Autres aliments" },
};
const FICT = {
  en: "Fictitious retailer: Harbour Market, its departments and its volumes are invented. Products and nutrition values from Open Food Facts (ODbL).",
  fr: "Distributeur fictif : Harbour Market, ses rayons et ses volumes sont inventés. Produits et valeurs nutritionnelles issus d'Open Food Facts (ODbL).",
};
const DATE = { en: "19 October 2026", fr: "19 octobre 2026" };

function words(lang) {
  const fr = lang === "fr";
  const n = IN_PT.length, nWwf = P.filter((p) => p.res.inWwf).length;
  const milk = protOf("milk") / R.prot;
  const fg1A = fg1Animal.reduce((a, p) => a + kgBase(p) / 1000, 0), fg1T = R.groups.FG1.plant + R.groups.FG1.animal;
  return {
    reportName: fr ? "Rapport d'analyse" : "Insights report",
    cover: {
      eyebrow: fr ? "Rapport d'analyse · ratio protéique" : "Insights report · protein ratio",
      title: fr ? "Le ratio protéique de votre catalogue" : "The protein ratio of your catalogue",
      sub: fr ? `${n} produits classés un par un, deux méthodologies de référence appliquées à la même base produits, et ce qui ferait bouger le chiffre.`
        : `${n} products classified one by one, two reference methodologies applied to the same product base, and what would move the figure.`,
      who: fr ? "Harbour Market · Catalogue 2026" : "Harbour Market · Catalogue 2026",
      badge: fr ? "Rapport de démonstration" : "Demo report",
      glance: fr ? "En un coup d'œil" : "At a glance",
      k: [
        ["WWF · " + (fr ? "aliments riches en protéines (FG1)" : "protein-rich foods (FG1)"), R.fg1, PHD.fg1],
        ["WWF · " + (fr ? "toute l'alimentation" : "whole diet"), R.diet, PHD.diet],
        ["Protein Tracker · " + (fr ? "toutes les protéines" : "all protein"), R.pt, null],
      ],
      phd: (v) => (fr ? `Planetary Health Diet : ${pct(v, lang, 0)}` : `Planetary Health Diet: ${pct(v, lang, 0)}`),
    },
    scope: {
      eyebrow: fr ? "Le périmètre" : "The scope",
      title: fr ? "Un catalogue, classé produit par produit" : "One catalogue, classified product by product",
      sub: fr ? "Le chiffre ne vient pas d'un échantillon : il vient de toute votre gamme, croisée avec vos volumes de vente."
        : "The figure does not come from a sample. It comes from your whole range, crossed with your sales volumes.",
      cards: [
        [String(n), fr ? `produits classés, du code-barres au groupe d'aliments, sur ${P.length} lignes reçues : un article non alimentaire mis de côté.`
          : `products classified, from the barcode to the food group, out of ${P.length} rows received: one non-food item set aside.`],
        [t(R.mass, lang, 0), fr ? `de produits vendus sur douze mois, soit ${t(R.prot, lang)} de protéines mises sur le marché.`
          : `of product sold over twelve months, that is ${t(R.prot, lang)} of protein put on the market.`],
        [pct(declaredShare, lang, 0), fr ? "des protéines viennent d'une valeur déclarée dans votre fichier, contrôlée. Le reste vient de la base de référence Altera, d'Open Food Facts et de NEVO, plus la table nationale (CIQUAL en France)."
          : "of the protein comes with a value declared in your file, checked. The rest comes from the Altera reference base, Open Food Facts and NEVO, plus the national table (CIQUAL in France)."],
      ],
      fixesTitle: fr ? "Trois anomalies, résolues avant le calcul" : "Three anomalies, resolved before the calculation",
      fixes: fr ? [
        ["ACTIVIA NATURE 4X125G", "code-barres à la clé de contrôle fausse, retrouvé par son nom : le dernier chiffre était mal saisi."],
        ["BARILLA SPAGHETTI N5 500G", "65 g de protéines déclarés pour 100 g : un chiffre par paquet. 13 g retenus, issus d'Open Food Facts."],
        ["PRINGLES SOUR CREAM ONION 175G", "poids net manquant, lu sur le libellé caisse : 0,175 kg."],
      ] : [
        ["ACTIVIA NATURE 4X125G", "barcode with a wrong check digit, found by its name: the last digit was mistyped."],
        ["BARILLA SPAGHETTI N5 500G", "65 g of protein declared per 100 g: a per-pack figure. 13 g kept, from Open Food Facts."],
        ["PRINGLES SOUR CREAM ONION 175G", "net weight missing, read from the till label: 0.175 kg."],
      ],
      takeaway: fr ? "Chaque chiffre de ce rapport se recalcule dans le classeur : une seule colonne à saisir, vos volumes."
        : "Every figure in this report recalculates in the workbook: one input column, your volumes.",
      source: fr ? "Fichier catalogue Harbour Market, 13 colonnes, ventes sur douze mois. Teneurs : valeurs déclarées contrôlées, base de référence Altera, Open Food Facts et NEVO, plus la table nationale (CIQUAL en France)."
        : "Harbour Market catalogue file, 13 columns, sales over twelve months. Contents: declared values checked, Altera reference base, Open Food Facts and NEVO, plus the national table (CIQUAL in France).",
    },
    wwf: {
      eyebrow: "WWF Planet-Based Diets",
      title: fr ? "Ce que pèsent vos rayons" : "What your shelves weigh",
      sub: fr ? `Tonnes de produit par groupe d'aliments, laitiers en équivalents lait (fromage ×10). Les composés, ${pct(R.compShare, lang)} des tonnes, sont présentés à part.`
        : `Tonnes of product by food group, dairy in dairy equivalents (cheese ×10). Composites, ${pct(R.compShare, lang)} of tonnes, are reported apart.`,
      ratios: [
        [fr ? "Aliments riches en protéines (FG1)" : "Protein-rich foods (FG1)", R.fg1, PHD.fg1],
        [fr ? "Produits laitiers (FG2)" : "Dairy (FG2)", R.fg2, null],
        [fr ? "Toute l'alimentation (FG1 à FG7)" : "Whole diet (FG1 to FG7)", R.diet, PHD.diet],
      ],
      groupsTitle: fr ? "Produits simples, par groupe · tonnes" : "Whole products, by food group · tonnes",
      keyTitle: fr ? "Le point clé" : "The key point",
      key: fr ? `Les aliments riches en protéines sont à ${pct(R.fg1, lang)} végétaux, contre ${pct(PHD.fg1, lang, 0)} dans la Planetary Health Diet : steak haché, poulet, jambon, thon et œufs pèsent ${t(fg1A, lang, 0)} sur les ${t(fg1T, lang, 0)} du groupe.`
        : `Protein-rich foods are ${pct(R.fg1, lang)} plant against ${pct(PHD.fg1, lang, 0)} in the Planetary Health Diet: minced beef, chicken, ham, tuna and eggs weigh ${t(fg1A, lang, 0)} of the group's ${t(fg1T, lang, 0)}.`,
      takeaway: fr ? "WWF compte des tonnes de produit : un litre de lait pèse autant qu'un litre de boisson au soja."
        : "WWF counts tonnes of product: a litre of milk weighs as much as a litre of soy drink.",
      source: fr ? `Onglet WWF du classeur. Périmètre WWF : ${nWwf} produits, hors Appendix A (un soda, une bière). Référence : Planetary Health Diet.`
        : `WWF tab of the workbook. WWF scope: ${nWwf} products, Appendix A excluded (one soft drink, one beer). Reference: Planetary Health Diet.`,
    },
    pt: {
      eyebrow: "Protein Tracker",
      title: fr ? "Où se trouvent les protéines que vous vendez" : "Where the protein you sell sits",
      sub: fr ? `${t(R.prot, lang)} de protéines, réparties entre les quatre classes de la méthodologie, chaque produit dans une seule classe.`
        : `${t(R.prot, lang)} of protein, spread over the methodology's four classes, each product in one class only.`,
      deptTitle: fr ? "Par rayon · protéines et part végétale" : "By department · protein and plant share",
      keyTitle: fr ? "Le point clé" : "The key point",
      key: fr ? `Le lait demi-écrémé porte à lui seul ${pct(milk, lang, 0)} des protéines vendues : la Crèmerie est le premier rayon en protéines, et elle est à 0 % végétale. Le niveau de donnée A couvre ${pct(R.levelA, lang, 0)} des protéines ; la convention 50/50 ne concerne qu'une pizza.`
        : `Semi-skimmed milk alone carries ${pct(milk, lang, 0)} of the protein sold: Dairy is the first department in protein, and it is 0% plant. Data level A covers ${pct(R.levelA, lang, 0)} of the protein; the 50/50 convention applies to one pizza only.`,
      takeaway: fr ? "Protein Tracker compte des protéines : pâtes et pain font de Plant-based non-core la deuxième classe."
        : "Protein Tracker counts protein: pasta and bread make Plant-based non-core the second class.",
      source: fr ? `Onglets Protein Tracker et Par rayon du classeur. Périmètre : ${n} produits, toute l'alimentation. Niveau B : ${levelB.length} produit.`
        : `Protein Tracker and By department tabs of the workbook. Scope: ${n} products, all food. Level B: ${levelB.length} product.`,
    },
    levers: {
      eyebrow: fr ? "Les leviers" : "The levers",
      title: fr ? "Ce qui ferait bouger le ratio" : "What would move the ratio",
      sub: fr ? "Trois déplacements, calculés dans le même classeur en ne changeant que la colonne des volumes."
        : "Three shifts, calculated in the same workbook by changing the volume column only.",
      head: fr ? ["Si…", "WWF", "Protein Tracker"] : ["If…", "WWF", "Protein Tracker"],
      rows: {
        milk: fr ? "20 % des volumes de lait passent à la boisson au soja" : "20% of the milk volume moves to soy drink",
        beef: fr ? "20 % du steak haché passe au haché végétal" : "20% of minced beef moves to plant-based mince",
        plant: fr ? "Lentilles, tofu et haché végétal vendent deux fois plus" : "Lentils, tofu and plant-based mince sell twice as much",
      },
      wwfName: { fg1: "FG1", fg2: "FG2" },
      today: fr ? "Aujourd'hui" : "Today",
      keyTitle: fr ? "Le point clé" : "The key point",
      key: fr ? "Le premier levier est là où sont les tonnes : la Crèmerie. Les leviers de FG1 font bouger WWF plus que Protein Tracker, parce que WWF compte des tonnes de produit et Protein Tracker des tonnes de protéines."
        : "The first lever is where the tonnes are: dairy. FG1 levers move WWF more than Protein Tracker, because WWF counts tonnes of product and Protein Tracker tonnes of protein.",
      takeaway: fr ? "Chaque scénario se rejoue dans le classeur : changez les volumes, tout se recalcule."
        : "Each scenario replays in the workbook: change the volumes, everything recalculates.",
      source: fr ? "Scénarios à masse constante : les tonnes retirées d'un produit sont ajoutées à l'autre. Ratios recalculés avec les règles du classeur."
        : "Scenarios at constant mass: the tonnes taken from one product are added to the other. Ratios recalculated with the workbook's rules.",
    },
  };
}

// ------------------------------------------------------------ pages
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const font = (fam, w, style, file) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${style};src:url("${pathToFileURL(join(ROOT, "node_modules/@fontsource", file)).href}") format("woff2");}`;
const FONTS = [
  font("Archivo", 800, "normal", "archivo/files/archivo-latin-800-normal.woff2"),
  font("Archivo", 900, "normal", "archivo/files/archivo-latin-900-normal.woff2"),
  ...[400, 500, 600, 700].map((w) => font("Inter", w, "normal", `inter/files/inter-latin-${w}-normal.woff2`)),
].join("\n");
const LOGO = pathToFileURL(join(ROOT, "scripts/assets/altera_wordmark.png")).href;

const CSS = `${FONTS}
:root{--paper:#FAF8F5;--ink:#151B1E;--text:#2B3438;--muted:#5F6A6F;--faint:#98A1A5;--line:#E6E1DA;--white:#fff;
--lav:#C3ADF5;--lav-soft:#EFE8FD;--peach:#F9CEA9;--peach-soft:#FDEBDC;--plant:#476B56;--plant-2:#9CC5A8;--animal:#D9824F;--comp:#9A83E3;--green-soft:#E3EDE6;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--paper);color:var(--ink);font-family:Inter,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;overflow:hidden;background:var(--paper);page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.disp{font-family:Archivo,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-0.01em;line-height:0.95}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted)}
.num{font-variant-numeric:tabular-nums}
`;

const REPORT_CSS = `
@page{size:1280px 720px;margin:0}
.page{width:1280px;height:720px;padding:44px 56px 0}
.logo{position:absolute;top:30px;right:46px;height:44px;mix-blend-mode:multiply}
h1.disp{font-size:46px;margin-top:10px;max-width:980px}
.sub{font-size:16px;color:var(--text);margin-top:12px;max-width:940px}
.body{margin-top:22px;display:grid;gap:16px}
.card{background:var(--white);border-radius:18px;padding:22px 24px;border:1px solid var(--line)}
.key{background:var(--peach-soft);border-radius:16px;padding:13px 22px;font-size:14px;line-height:1.48;color:var(--text)}
.key b{display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink);margin-bottom:4px}
.take{position:absolute;left:56px;right:56px;bottom:70px;background:var(--ink);color:#fff;border-radius:14px;padding:15px 22px;font-size:15px;display:flex;gap:12px;align-items:center}
.take i{width:8px;height:8px;border-radius:50%;background:var(--lav);flex:none}
.foot{position:absolute;left:56px;right:56px;bottom:18px;border-top:1px solid var(--line);padding-top:9px;font-size:10.5px;color:var(--muted);display:grid;grid-template-columns:1fr auto;gap:2px 30px}
.foot .f{color:var(--faint)}
.bar{height:10px;border-radius:999px;background:#EEEAE4;overflow:hidden;display:flex}
.bar i{display:block;height:100%}
.gauge{position:relative;height:10px;border-radius:999px;background:rgba(21,27,30,0.08);margin-top:10px}
.gauge i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--plant)}
.gauge s{position:absolute;top:-5px;width:2px;height:20px;background:var(--ink)}
/* cover */
.cover{display:grid;grid-template-columns:1fr 400px;padding:0}
.cover .l{padding:56px 56px 0;position:relative}
.cover .r{background:var(--peach);padding:120px 40px 0}
.cover h1.disp{font-size:66px;max-width:640px;margin-top:22px}
.cover .who{margin-top:34px;max-width:620px;border-top:2px solid var(--ink);padding-top:14px;display:flex;gap:16px;align-items:center}
.cover .who b{font-family:Archivo;font-weight:800;font-size:20px;color:var(--plant)}
.chip{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;background:var(--lav-soft);color:#5B43B5;border-radius:999px;padding:5px 10px}
.glance{margin-bottom:26px}
.glance .m{font-size:13px;font-weight:600}
.glance b{display:block;font-family:Archivo;font-weight:900;font-size:40px;margin-top:2px}
.glance small{display:block;font-size:11px;color:#9A4A1E;margin-top:5px}
`;

function frame(lang, i, eyebrow, inner, takeaway, source) {
  return `<section class="page"><img class="logo" src="${LOGO}" alt="Altera">
<div class="eyebrow">${esc(eyebrow)}</div>${inner}
<div class="take"><i></i>${esc(takeaway)}</div>
<div class="foot"><span>${esc(source)}</span><span>Altera · ${esc(words(lang).reportName)} · ${i} / 5</span><span class="f">${esc(FICT[lang])}</span><span class="f">${DATE[lang]}</span></div></section>`;
}

function report(lang) {
  const W = words(lang);
  const C = W.cover;
  const cover = `<section class="page cover"><div class="l"><img src="${LOGO}" style="height:52px;margin:-10px 0 0 -14px;mix-blend-mode:multiply" alt="Altera">
<div class="eyebrow" style="margin-top:96px">${esc(C.eyebrow)}</div><h1 class="disp">${esc(C.title)}</h1>
<p class="sub" style="max-width:560px">${esc(C.sub)}</p>
<div class="who"><b>${esc(C.who)}</b><span class="chip">${esc(C.badge)}</span></div>
<p style="position:absolute;left:56px;bottom:26px;font-size:10.5px;color:var(--faint);max-width:600px">${esc(FICT[lang])}</p></div>
<div class="r"><div class="eyebrow" style="color:#9A4A1E;margin-bottom:24px">${esc(C.glance)}</div>
${C.k.map(([m, v, ref]) => `<div class="glance"><span class="m">${esc(m)}</span><b class="num">${pct(v, lang)}</b>
<div class="gauge" style="background:rgba(21,27,30,0.12)"><i style="width:${v * 100}%"></i>${ref ? `<s style="left:${ref * 100}%"></s>` : ""}</div>${ref ? `<small>${esc(C.phd(ref))}</small>` : ""}</div>`).join("")}
</div></section>`;

  const S = W.scope;
  const scope = frame(lang, 2, S.eyebrow, `<h1 class="disp">${esc(S.title)}</h1><p class="sub">${esc(S.sub)}</p>
<div class="body" style="grid-template-columns:repeat(3,1fr)">${S.cards.map(([big, txt], i) => `<div class="card" style="${i === 1 ? "background:var(--peach-soft);border-color:transparent" : ""}"><b class="disp num" style="font-size:44px;color:var(--plant);text-transform:none">${esc(big)}</b><p style="margin-top:10px;font-size:14px;line-height:1.5;color:var(--text)">${esc(txt)}</p></div>`).join("")}</div>
<div class="card" style="margin-top:16px;background:var(--green-soft);border-color:transparent;padding:16px 22px"><div class="eyebrow" style="color:var(--plant)">${esc(S.fixesTitle)}</div>
${S.fixes.map(([p, txt]) => `<div style="display:grid;grid-template-columns:280px 1fr;gap:16px;font-size:13.5px;margin-top:8px"><b style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px">${esc(p)}</b><span style="color:var(--text)">${esc(txt)}</span></div>`).join("")}</div>`, S.takeaway, S.source);

  const Wf = W.wwf;
  const maxG = Math.max(...FG.map((g) => R.groups[g].plant + R.groups[g].animal));
  const wwf = frame(lang, 3, Wf.eyebrow, `<h1 class="disp">${esc(Wf.title)}</h1><p class="sub">${esc(Wf.sub)}</p>
<div class="body" style="grid-template-columns:360px 1fr">
<div style="display:grid;gap:10px">${Wf.ratios.map(([name, v, ref]) => `<div class="card" style="padding:14px 20px;background:var(--peach-soft);border-color:transparent"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:13px;font-weight:600">${esc(name)}</span><b class="disp num" style="font-size:30px;text-transform:none">${pct(v, lang)}</b></div><div class="gauge"><i style="width:${v * 100}%"></i>${ref ? `<s style="left:${ref * 100}%"></s>` : ""}</div>${ref ? `<small style="display:block;font-size:11px;color:#9A4A1E;margin-top:6px">${esc(W.cover.phd(ref))}</small>` : ""}</div>`).join("")}</div>
<div class="card" style="padding:18px 22px"><div style="display:flex;justify-content:space-between"><span class="eyebrow">${esc(Wf.groupsTitle)}</span><span style="font-size:11.5px;color:var(--muted);display:flex;gap:14px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--plant);margin-right:5px"></i>${lang === "fr" ? "Végétal" : "Plant"}</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--animal);margin-right:5px"></i>Animal</span></span></div>
${FG.map((g) => { const v = R.groups[g], all = v.plant + v.animal; return `<div style="display:grid;grid-template-columns:200px 1fr 64px 52px;gap:12px;align-items:center;margin-top:9px;font-size:13px"><span><b>${g}</b> · ${esc(FG_NAME[lang][g])}</span><div class="bar" style="background:transparent"><i style="width:${(v.plant / maxG) * 100}%;background:var(--plant)"></i><i style="width:${(v.animal / maxG) * 100}%;background:var(--animal)"></i></div><span class="num" style="text-align:right;color:var(--muted)">${t(all, lang, 0)}</span><b class="num" style="text-align:right">${pct(all ? v.plant / all : 0, lang, 0)}</b></div>`; }).join("")}
</div></div>
<div class="key" style="margin-top:16px"><b>${esc(Wf.keyTitle)}</b>${esc(Wf.key)}</div>`, Wf.takeaway, Wf.source);

  const Pt = W.pt;
  const maxD = Math.max(...R.byDept.map((d) => d.t));
  const pt = frame(lang, 4, Pt.eyebrow, `<h1 class="disp">${esc(Pt.title)}</h1><p class="sub">${esc(Pt.sub)}</p>
<div class="body" style="grid-template-columns:1fr 1fr">
<div class="card" style="padding:18px 22px"><div class="eyebrow" style="margin-bottom:6px">Protein Tracker · ${lang === "fr" ? "par classe" : "by class"}</div>
<div style="display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 10px"><span style="font-size:13px;font-weight:600">${lang === "fr" ? "Part végétale de toutes les protéines" : "Plant share of all protein"}</span><b class="disp num" style="font-size:34px;text-transform:none">${pct(R.pt, lang)}</b></div>
${CLASSES.map((c) => `<div style="display:grid;grid-template-columns:160px 1fr 52px 58px;gap:12px;align-items:center;margin-top:10px;font-size:13px"><b>${CLASS[c]}</b><div class="bar"><i style="width:${(R.byClass[c] / R.prot) * 100}%;background:${CLASS_COLOR[c]}"></i></div><b class="num" style="text-align:right">${pct(R.byClass[c] / R.prot, lang)}</b><span class="num" style="text-align:right;color:var(--muted)">${t(R.byClass[c], lang)}</span></div>`).join("")}</div>
<div class="card" style="padding:18px 22px"><div class="eyebrow" style="margin-bottom:4px">${esc(Pt.deptTitle)}</div>
${R.byDept.slice(0, 7).map((d) => `<div style="display:grid;grid-template-columns:120px 1fr 56px 44px;gap:12px;align-items:center;margin-top:9px;font-size:13px"><span>${esc(dept(d.dept, lang))}</span><div class="bar" style="background:transparent;height:8px"><i style="width:${((d.t * d.ratio) / maxD) * 100}%;background:var(--plant)"></i><i style="width:${((d.t * (1 - d.ratio)) / maxD) * 100}%;background:var(--animal)"></i></div><span class="num" style="text-align:right;color:var(--muted)">${t(d.t, lang)}</span><b class="num" style="text-align:right">${pct(d.ratio, lang, 0)}</b></div>`).join("")}</div>
</div>
<div class="key" style="margin-top:16px"><b>${esc(Pt.keyTitle)}</b>${esc(Pt.key)}</div>`, Pt.takeaway, Pt.source);

  const L = W.levers;
  const cell = (from, to) => `<span class="num" style="color:var(--muted)">${pct(from, lang)}</span> → <b class="num">${pct(to, lang)}</b> <span class="chip" style="background:var(--green-soft);color:var(--plant)">${pts(to - from, lang)}</span>`;
  const levers = frame(lang, 5, L.eyebrow, `<h1 class="disp">${esc(L.title)}</h1><p class="sub">${esc(L.sub)}</p>
<div class="card" style="margin-top:24px;padding:8px 24px">
<div style="display:grid;grid-template-columns:1fr 300px 300px;gap:18px;padding:12px 0;border-bottom:1px solid var(--line)" class="eyebrow">${L.head.map((h) => `<span>${esc(h)}</span>`).join("")}</div>
${SCEN.map((s) => `<div style="display:grid;grid-template-columns:1fr 300px 300px;gap:18px;padding:16px 0;border-bottom:1px solid var(--line);align-items:center;font-size:14.5px"><b>${esc(L.rows[s.id])}</b><span><span style="font-size:11px;font-weight:700;color:var(--muted);margin-right:8px">${L.wwfName[s.wwf]}</span>${cell(R[s.wwf], s.r[s.wwf])}</span><span>${cell(R.pt, s.r.pt)}</span></div>`).join("")}
<div style="display:grid;grid-template-columns:1fr 300px 300px;gap:18px;padding:12px 0;font-size:13px;color:var(--muted)"><span>${esc(L.today)}</span><span>FG1 ${pct(R.fg1, lang)} · FG2 ${pct(R.fg2, lang)}</span><span>${pct(R.pt, lang)}</span></div>
</div>
<div class="key" style="margin-top:16px"><b>${esc(L.keyTitle)}</b>${esc(L.key)}</div>`, L.takeaway, L.source);

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${CSS}${REPORT_CSS}</style></head><body>${cover}${scope}${wwf}${pt}${levers}</body></html>`;
}

// ------------------------------------------------------------ scope statement, one A4 page
function statement(lang) {
  const fr = lang === "fr";
  const n = IN_PT.length, nWwf = P.filter((p) => p.res.inWwf).length;
  const out = P.filter((p) => !p.res.inPt || !p.res.inWwf);
  const why = { non_food: fr ? "non alimentaire : hors des deux périmètres" : "non-food: out of both scopes",
    beverage: fr ? "Appendix A, soda : exclu de WWF seulement" : "Appendix A, soft drink: excluded from WWF only",
    alcohol: fr ? "Appendix A, alcool : exclu de WWF seulement" : "Appendix A, alcohol: excluded from WWF only" };
  const src = (k) => count("protSrc", k), spl = (k) => count("split", k), rt = (k) => count("route", k);
  const sec = (h, body) => `<section class="sec"><h2>${esc(h)}</h2>${body}</section>`;
  const li = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const body = [
    sec(fr ? "1. Périmètre couvert" : "1. Scope covered", li([
      fr ? `<b>${P.length}</b> produits reçus dans le fichier catalogue de Harbour Market, ventes sur douze mois.` : `<b>${P.length}</b> products received in the Harbour Market catalogue file, sales over twelve months.`,
      fr ? `<b>WWF : ${nWwf} produits</b>, après la liste d'exclusion de l'Appendix A.` : `<b>WWF: ${nWwf} products</b>, after the Appendix A exclusion list.`,
      fr ? `<b>Protein Tracker : ${n} produits</b>, toute l'alimentation et les boissons.` : `<b>Protein Tracker: ${n} products</b>, all food and drink.`,
    ]) + `<table><thead><tr><th>${fr ? "Hors périmètre" : "Out of scope"}</th><th>WWF</th><th>Protein Tracker</th><th>${fr ? "Motif" : "Reason"}</th></tr></thead><tbody>${out.map((p) => `<tr><td class="mono">${esc(p.raw.till_label)}</td><td>${fr ? "exclu" : "out"}</td><td>${p.res.inPt ? (fr ? "inclus" : "in") : (fr ? "exclu" : "out")}</td><td>${esc(why[p.res.excl])}</td></tr>`).join("")}</tbody></table>`),
    sec(fr ? "2. Approche produit par produit" : "2. Product-level approach", li([
      fr ? "Chaque produit est classé individuellement, par son code-barres : produit simple ou composé, groupe d'aliments FG1 à FG7, origine végétale ou animale, sous-groupe ; les composés par catégorie (viande, produits de la mer, végétarien, végétalien)." : "Every product is classified individually, by its barcode: whole or composite, food group FG1 to FG7, plant or animal origin, sub-group; composites by category (meat-based, seafood-based, vegetarian, vegan).",
      fr ? `Sources de classement : base de référence Altera (${rt("reference")}), puis modèle de langage (${rt("model")}), chaque champ validé contre le vocabulaire autorisé.` : `Classification sources: Altera reference base (${rt("reference")}), then the language model (${rt("model")}), every field validated against the allowed vocabulary.`,
      fr ? "Règles appliquées par l'assembleur : aucun groupe d'aliments sur un composé, sous-groupes en FG1, FG2, FG3 et FG5 seulement, facteur laitier ×10 réservé au fromage (1 produit)." : "Rules applied by the assembler: no food group on a composite, sub-groups only in FG1, FG2, FG3 and FG5, dairy factor ×10 reserved for cheese (1 product).",
    ])),
    sec(fr ? "3. Données utilisées" : "3. Data used", li([
      fr ? "Fichier catalogue du distributeur, 13 colonnes : code-barres, libellés, marque, rayon, segment, poids net, ingrédients, valeurs nutritionnelles, unités vendues." : "Retailer catalogue file, 13 columns: barcode, labels, brand, department, segment, net weight, ingredients, nutrition values, units sold.",
      fr ? `Teneurs en protéines, chacune avec sa source : déclarée et contrôlée (${src("declared")}), base de référence Altera (${src("reference")}), Open Food Facts (${src("off")}), CIQUAL (${src("ciqual")}), médiane du segment (${src("median")}). Sources : Open Food Facts et NEVO, plus la table nationale (CIQUAL en France).` : `Protein contents, each with its source: declared and checked (${src("declared")}), Altera reference base (${src("reference")}), Open Food Facts (${src("off")}), CIQUAL (${src("ciqual")}), segment median (${src("median")}). Sources: Open Food Facts and NEVO, plus the national table (CIQUAL in France).`,
      fr ? `Partage végétal / animal : une seule origine (${spl("one_side")}), liste d'ingrédients (${spl("ingredients")}), table NEVO (${spl("nevo")}), convention 50/50 (${spl("convention")}), sans protéines (${spl("zero")}). Niveau de donnée A : ${pct(R.levelA, lang, 0)} des protéines.` : `Plant / animal split: single origin (${spl("one_side")}), ingredient list (${spl("ingredients")}), NEVO table (${spl("nevo")}), 50/50 convention (${spl("convention")}), no protein (${spl("zero")}). Data level A: ${pct(R.levelA, lang, 0)} of the protein.`,
      fr ? "Chaque teneur est recoupée avec une deuxième source : par code-barres avec Open Food Facts, par nom avec NEVO. Un partage NEVO n'est retenu que s'il concorde avec la liste d'ingrédients ; sinon, la convention 50/50 s'applique au niveau B." : "Every protein value is cross-checked against a second source: by barcode against Open Food Facts, by name against NEVO. A NEVO split is kept only when it agrees with the ingredient list; otherwise the 50/50 convention applies, at level B.",
    ])),
    sec(fr ? "4. Hypothèses de volumes" : "4. Volume assumptions", li([
      fr ? "Volumes réels fournis par le distributeur : unités vendues aux consommateurs sur douze mois. Aucun volume estimé." : "Real volumes supplied by the retailer: consumer units sold over twelve months. No volume estimated.",
      fr ? `Masse vendue = unités × poids net qualifié : ${t(R.mass, lang, 0)} sur le périmètre Protein Tracker. Un poids net manquant a été lu sur le libellé caisse (0,175 kg).` : `Mass sold = units × qualified net weight: ${t(R.mass, lang, 0)} on the Protein Tracker scope. One missing net weight was read from the till label (0.175 kg).`,
      fr ? "Corrections acceptées avant calcul : un code-barres mal saisi, un poids net manquant, une teneur saisie par paquet. Chacune figure dans l'onglet Corrections du classeur." : "Corrections accepted before calculation: one mistyped barcode, one missing net weight, one content entered per pack. Each is listed on the Corrections tab of the workbook.",
      fr ? "Hypothèses de travail ouvertes : aucune." : "Open working assumptions: none.",
    ])),
  ].join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${CSS}
@page{size:A4;margin:0}
.page{width:210mm;height:297mm;padding:16mm 17mm 0}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--ink);padding-bottom:12px}
.top img{height:40px;margin:-8px -10px 0 0;mix-blend-mode:multiply}
h1.disp{font-size:34px;margin-top:8px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 6px;font-size:11px}
.meta div{background:var(--white);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.meta span{display:block;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.sec{margin-top:13px}
.sec h2{font-family:Archivo;font-weight:800;font-size:15px;margin-bottom:5px}
ul{padding-left:16px;font-size:11.4px;line-height:1.5;color:var(--text)}
li{margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10.5px}
th{text-align:left;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--ink);padding:5px 6px}
td{padding:5px 6px;border-bottom:1px solid var(--line)}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:10px}
.foot{position:absolute;left:17mm;right:17mm;bottom:11mm;border-top:1px solid var(--line);padding-top:7px;font-size:9px;color:var(--faint);display:flex;justify-content:space-between;gap:20px}
</style></head><body><section class="page">
<div class="top"><div><div class="eyebrow">WWF Planet-Based Diets · Appendix A, ${fr ? "onglet" : "tab"} 6</div><h1 class="disp">${fr ? "Déclaration de périmètre" : "Scope statement"}</h1></div><img src="${LOGO}" alt="Altera"></div>
<div class="meta"><div><span>${fr ? "Distributeur" : "Retailer"}</span>Harbour Market</div><div><span>${fr ? "Période" : "Period"}</span>${fr ? "12 mois de ventes" : "12 months of sales"}</div><div><span>${fr ? "Préparé par" : "Prepared by"}</span>Altera AI</div><div><span>Date</span>${DATE[lang]}</div></div>
${body}
<div class="foot"><span>${esc(FICT[lang])}</span><span>Altera · ${fr ? "Déclaration de périmètre" : "Scope statement"} · 1 / 1</span></div>
</section></body></html>`;
}

// ------------------------------------------------------------ print
const tmp = mkdtempSync(join(tmpdir(), "altera-docs-"));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const lang of ["en", "fr"]) {
    for (const [name, html, opts, pages] of [
      [`HarbourMarket_Insights_Report_${lang.toUpperCase()}.pdf`, report(lang), { width: "1280px", height: "720px" }, 5],
      [`HarbourMarket_Scope_Statement_${lang.toUpperCase()}.pdf`, statement(lang), { format: "A4" }, 1],
    ]) {
      if (/[\u2013\u2014\u2212]/.test(html)) throw new Error(`${name}: a dash glyph is in the text`);
      const file = join(tmp, name.replace(".pdf", ".html"));
      writeFileSync(file, html);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle0" });
      await page.evaluate(() => document.fonts.ready);
      // every page keeps its content inside its frame, clear of the takeaway bar
      const problems = await page.$$eval(".page", (xs) => xs.map((p, i) => {
        const r = p.getBoundingClientRect();
        const kids = [...p.querySelectorAll("*")].filter((e) => !e.closest(".foot") && !e.closest(".take"));
        const bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
        const take = p.querySelector(".take") ?? p.querySelector(".foot");
        const limit = take ? take.getBoundingClientRect().top - 8 : r.bottom;
        const fonts = [...new Set(kids.map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "")))];
        return bottom > limit ? `page ${i + 1}: content runs ${Math.round(bottom - limit)}px too low (${fonts.join(", ")})` : null;
      }).filter(Boolean));
      const count = await page.$$eval(".page", (xs) => xs.length);
      if (count !== pages) problems.push(`${count} pages, expected ${pages}`);
      if (problems.length) throw new Error(`${name}: ${problems.join("; ")}`);
      const out = join(ROOT, "public/downloads", name);
      await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true, ...opts });
      console.log(`  -> public/downloads/${name} (${Math.round(statSync(out).size / 1024)} KB)`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
