import type { ReactNode } from "react";
import type { AnomalyId, Lang, Product } from "./types";
import { T, dept } from "./i18n";
import { ANOMALIES, PRODUCTS, fmtInt, fmtNum, fmtPct } from "./data";
import { wwfText } from "./engine";

export type View = "raw" | "checks" | "classify" | "match";

interface Props {
  view: View;
  lang: Lang;
  marks: Set<string>;
  busy: boolean;
  accepted: Set<AnomalyId>;
}

const anomalyOf = (row: number) => ANOMALIES.find((a) => a.row === row);
const Wait = ({ busy }: { busy: boolean }) => (busy ? <span className="dots"><i /><i /><i /></span> : <span>·</span>);

/** The catalogue, row by row, showing what the engine has found so far. */
export function RowsTable({ view, lang, marks, busy, accepted }: Props) {
  const L = T[lang];
  const C = L.cols;
  const empty = <td className="empty">{L.emptyCell}</td>;
  const v = (s: string, render?: (s: string) => ReactNode) => (s === "" ? empty : <td>{render ? render(s) : s}</td>);
  const scoped = marks.has("scope");

  const head: Record<View, string[]> = {
    raw: [C.ean, C.product, C.brand, C.dept, C.weight, "kcal", C.prot, C.units, lang === "fr" ? "Ingrédients" : "Ingredients"],
    checks: [C.ean, C.product, C.dept, C.weight, C.units, ""],
    classify: [C.product, C.route, C.wwf, C.pt, C.conf],
    match: [C.product, C.prot, C.psrc, C.split, C.level],
  };

  const row = (p: Product & { key: string }, i: number) => {
    const r = p.raw, s = p.res;
    const a = anomalyOf(i);
    const fixed = a ? accepted.has(a.id) : false;
    const flagged = a && !fixed && marks.has(`anom:${a.id}`) && ((view === "checks" && a.id !== "protein") || (view === "match" && a.id === "protein"));
    const out = scoped && !s.inPt;
    const cls = [out ? "out" : "", flagged ? "flag" : ""].join(" ");
    const name = <td><span className="pn" title={r.product_name}>{r.till_label}</span></td>;

    if (view === "raw") return (
      <tr key={i} className={cls}>
        <td className="mono">{r.ean}</td>
        <td><span className="pn" title={r.till_label}>{r.product_name}</span></td>
        <td>{r.brand}</td>
        <td>{dept(r.department, lang)}</td>
        {v(r.net_weight_kg, (x) => `${fmtNum(Number(x), lang, 3)} kg`)}
        {v(r.energy_kcal_100g)}
        {v(r.protein_g_100g)}
        <td className="num">{fmtInt(Number(r.units_sold_12m), lang)}</td>
        {v(r.ingredients, (x) => <span className="chip ghosted">{fmtInt(x.length, lang)} chars</span>)}
      </tr>
    );

    if (view === "checks") {
      const ean = a?.id === "ean" ? (fixed ? <span className="mono">{a.to} <span className="chip ok">✓</span></span> : <span className="mono" style={{ color: marks.has("anom:ean") ? "var(--red)" : undefined }}>{r.ean}</span>) : <span className="mono">{r.ean}</span>;
      const weight = a?.id === "weight"
        ? (fixed ? <span>{fmtNum(Number(a.to), lang, 3)} kg <span className="chip ok">✓</span></span> : marks.has("anom:weight") ? <span className="chip warn">{L.emptyCell}</span> : <span className="chip ghosted">{L.emptyCell}</span>)
        : `${fmtNum(Number(r.net_weight_kg), lang, 3)} kg`;
      const status = !scoped ? null
        : !s.inPt ? <span className="chip">{L.outScope} · {lang === "fr" ? "non-alimentaire" : "non-food"}</span>
        : !s.inWwf ? <span className="chip warn">{L.excludedA} · WWF</span>
        : <span className="chip ok">✓</span>;
      return (
        <tr key={i} className={cls}>
          <td>{ean}</td>{name}<td>{dept(r.department, lang)}</td><td>{weight}</td>
          <td className="num">{fmtInt(Number(r.units_sold_12m), lang)}</td><td>{status}</td>
        </tr>
      );
    }

    if (view === "classify") {
      const done = marks.has(`cls:${i}`);
      if (!s.inPt) return (
        <tr key={i} className="out">{name}<td colSpan={4}>{L.outScope} · {lang === "fr" ? "non-alimentaire" : "non-food"}</td></tr>
      );
      const wwf = !s.wwf ? <span className="chip">{L.excludedA}</span>
        : s.wwf.struct === "composite" ? <span className="chip composite">{L.composite} · {L.cats[s.wwf.cat!]}</span>
        : <span className={`chip ${s.wwf.origin}`}>{wwfText(p, lang, false)} · {L.origin[s.wwf.origin!]}</span>;
      return (
        <tr key={i} className={done ? "fresh" : ""}>
          {name}
          {done ? <>
            <td><span className={`chip ${s.route === "model" ? "ok" : s.route === "segment" ? "composite" : "ink"}`}>{L.routes[s.route]}</span></td>
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
      ? (fixed ? <span><b>{fmtNum(s.prot, lang)}</b> g <span className="chip ok">✓</span></span>
        : marks.has("anom:protein") ? <span><s style={{ color: "var(--red)" }}>{a.from}</s> g</span> : null)
      : marks.has(`prot:${i}`) ? <span><b>{fmtNum(s.prot, lang)}</b> g</span> : null;
    const srcShown = (a?.id === "protein" ? fixed : marks.has(`prot:${i}`)) ? <span className={`chip ${s.protSrc === "declared" ? "" : "ok"}`}>{L.sources[s.protSrc]}</span> : null;
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
        <table className="data">
          <thead><tr>{head[view].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{PRODUCTS.map(row)}</tbody>
        </table>
      </div>
    </div>
  );
}
