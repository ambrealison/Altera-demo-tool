import type { ReactNode } from "react";
import type { Decisions, Lang } from "./types";
import { T, dept } from "./i18n";
import { ANOMALIES, PRODUCTS, fmtInt, fmtNum, fmtPct, ingredients, productName, productsFor, tillLabel } from "./data";
import { wwfText } from "./engine";

export type View = "raw" | "checks" | "classify" | "match";

interface Props {
  view: View;
  lang: Lang;
  marks: Set<string>;
  busy: boolean;
  decisions: Decisions;
}

const anomalyOf = (row: number) => ANOMALIES.find((a) => a.row === row);
const Wait = ({ busy }: { busy: boolean }) => (busy ? <span className="dots"><i /><i /><i /></span> : <span>·</span>);
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** The catalogue, row by row, showing what the engine has found so far. */
export function RowsTable({ view, lang, marks, busy, decisions }: Props) {
  const L = T[lang];
  const C = L.cols;
  const empty = <td className="empty">{L.emptyCell}</td>;
  const v = (s: string, render?: (s: string) => ReactNode) => (s === "" ? empty : <td>{render ? render(s) : s}</td>);
  const scoped = marks.has("scope");
  const dec = (x: string) => (lang === "fr" ? x.replace(".", ",") : x);
  const products = productsFor(decisions);
  const done = <span className="chip ok">✓</span>;
  const keptChip = <span className="chip warn">{lang === "fr" ? "conservé" : "kept"}</span>;

  const head: Record<View, string[]> = {
    raw: [C.ean, C.product, C.brand, C.dept, C.weight, "kcal", C.prot, C.units, C.ingr],
    checks: [C.ean, C.product, C.ingr, C.weight, C.units, ""],
    classify: [C.product, C.route, C.wwf, C.pt, C.conf],
    match: [C.product, C.prot, C.psrc, C.split, C.level],
  };

  const row = (p: (typeof PRODUCTS)[number], i: number) => {
    const r = p.raw, s = products[i].res;
    const a = anomalyOf(i);
    const d = a ? decisions[a.id] : undefined;
    const flagged = a && !d && marks.has(`anom:${a.id}`) && ((view === "checks" && a.id !== "protein") || (view === "match" && a.id === "protein"));
    const out = scoped && !s.inPt;
    const cls = [out ? "out" : "", flagged ? "flag" : ""].join(" ");
    const name = <td><span className="pn" title={productName(p, lang)}>{tillLabel(p, lang)}</span></td>;

    if (view === "raw") return (
      <tr key={i} className={cls}>
        <td className="mono">{r.ean}</td>
        <td><span className="pn" title={tillLabel(p, lang)}>{productName(p, lang)}</span></td>
        <td>{r.brand}</td>
        <td>{dept(r.department, lang)}</td>
        {v(r.net_weight_kg, (x) => `${fmtNum(Number(x), lang, 3)} kg`)}
        {v(r.energy_kcal_100g, dec)}
        {v(r.protein_g_100g, dec)}
        <td className="num">{fmtInt(Number(r.units_sold_12m), lang)}</td>
        {v(ingredients(p, lang), (x) => <span className="chip ghosted">{fmtInt(x.length, lang)} {lang === "fr" ? "caractères" : "chars"}</span>)}
      </tr>
    );

    if (view === "checks") {
      const received = ingredients(p, lang);
      const ingr = a?.id === "ingredients"
        ? (d === "accepted" ? <span>{short((lang === "fr" ? a.toFr : a.to) ?? "")} {done}</span>
          : d === "declined" ? <span>{short(received)} {keptChip}</span>
          : <span style={{ color: marks.has("anom:ingredients") ? "var(--red)" : undefined }}>{short(received)}</span>)
        : received ? <span className="muted">{short(received)}</span> : <span className="chip ghosted">{L.emptyCell}</span>;
      const weight = a?.id === "weight"
        ? (d === "accepted" ? <span>{fmtNum(Number(a.to), lang, 3)} kg {done}</span>
          : d === "declined" ? <span className="chip warn">{L.emptyCell} · {lang === "fr" ? "conservé" : "kept"}</span>
          : marks.has("anom:weight") ? <span className="chip warn">{L.emptyCell}</span> : <span className="chip ghosted">{L.emptyCell}</span>)
        : r.net_weight_kg ? `${fmtNum(Number(r.net_weight_kg), lang, 3)} kg` : <span className="chip ghosted">{L.emptyCell}</span>;
      const status = !scoped ? null
        : !s.inPt ? <span className="chip">{L.outScope} · {lang === "fr" ? "non-alimentaire" : "non-food"}</span>
        : !s.inWwf ? <span className="chip warn">{L.excludedA} · WWF</span>
        : done;
      return (
        <tr key={i} className={cls}>
          <td className="mono">{r.ean}</td>{name}<td className="ingr">{ingr}</td><td>{weight}</td>
          <td className="num">{fmtInt(Number(r.units_sold_12m), lang)}</td><td>{status}</td>
        </tr>
      );
    }

    if (view === "classify") {
      const shown = marks.has(`cls:${i}`);
      if (!s.inPt) return (
        <tr key={i} className="out">{name}<td colSpan={4}>{L.outScope} · {lang === "fr" ? "non-alimentaire" : "non-food"}</td></tr>
      );
      const wwf = !s.wwf ? <span className="chip">{L.excludedA}</span>
        : s.wwf.struct === "composite" ? <span className="chip composite">{L.composite} · {L.cats[s.wwf.cat!]}</span>
        : <span className={`chip ${s.wwf.origin}`}>{wwfText(p, lang, false)} · {L.origin[s.wwf.origin!]}</span>;
      return (
        <tr key={i} className={shown ? "fresh" : ""}>
          {name}
          {shown ? <>
            <td><span className={`chip ${s.route === "model" ? "ok" : "ink"}`}>{L.routes[s.route]}</span></td>
            <td>{wwf}</td>
            <td><span className={`chip ${s.pt}`}><i />{L.classes[s.pt!]}</span></td>
            <td className="conf">{s.route === "model" ? fmtNum(s.conf, lang, 2) : <span className="chip ghosted">{lang === "fr" ? "connu" : "known"}</span>}</td>
          </> : <><td className="wait"><Wait busy={busy} /></td><td className="wait" /><td className="wait" /><td className="wait" /></>}
        </tr>
      );
    }

    // match: protein content and split
    if (!s.inPt) return <tr key={i} className="out">{name}<td colSpan={4}>{L.outScope} · {lang === "fr" ? "non-alimentaire" : "non-food"}</td></tr>;
    const protShown = a?.id === "protein"
      ? (d ? <span><b>{fmtNum(s.prot, lang)}</b> g {d === "accepted" ? done : keptChip}</span>
        : marks.has("anom:protein") ? <span><s style={{ color: "var(--red)" }}>{a.from}</s> g</span> : null)
      : marks.has(`prot:${i}`) ? <span><b>{fmtNum(s.prot, lang)}</b> g</span> : null;
    const srcShown = (a?.id === "protein" ? !!d : marks.has(`prot:${i}`)) ? <span className={`chip ${s.protSrc === "declared" ? "" : "ok"}`}>{L.sources[s.protSrc]}</span> : null;
    const split = marks.has(`split:${i}`);
    return (
      <tr key={i} className={cls}>
        {name}
        <td>{protShown ?? <Wait busy={busy} />}</td>
        <td>{srcShown ?? (a?.id === "protein" && marks.has("anom:protein") ? <span className="chip warn">{L.toReview}</span> : null)}</td>
        <td style={{ minWidth: 190 }}>{split ? (s.split === "zero" ? <span className="chip ghosted">{L.splits.zero}</span> : (
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="split" style={{ width: 90 }}><i style={{ width: `${s.plant * 100}%`, background: "var(--plant)" }} /><i style={{ width: `${(1 - s.plant) * 100}%`, background: "var(--animal)" }} /></span>
            <span className="num">{fmtPct(s.plant, lang, 0)}</span>
            <span className="chip ghosted">{L.splits[s.split]}</span>
          </span>
        )) : <Wait busy={busy && marks.has("anom:protein")} />}</td>
        <td>{split && s.level ? <span className={`chip ${s.level === "A" ? "ink" : "warn"}`}>{s.level}</span> : null}</td>
      </tr>
    );
  };

  return (
    <div className="card tablecard">
      <div className="tscroll">
        <table className={`data v-${view}`}>
          <thead><tr>{head[view].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{PRODUCTS.map(row)}</tbody>
        </table>
      </div>
    </div>
  );
}
