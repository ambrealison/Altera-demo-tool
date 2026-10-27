import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnomalyId, Decision, Decisions, Lang } from "./types";
import { STEP_IDS, T, fill, type StepId } from "./i18n";
import { ANOMALIES, ANOMALY_ORDER, BOOKING_URL, COLUMN_NAMES, DEMO_FILES, IN_PT, N, PHD, PRODUCTS, PT_CLASSES, PT_SUBS, FOOD_GROUPS, delimiterOf, downloads, fmtNum, fmtPct, isDemoFile, productsFor, resultsFor, tillLabel } from "./data";
import { useRunner } from "./runner";
import { CHECK_COUNT, CROSS, DELIVER_TOTAL, FILE_WINDOWS, FILL, checksScript, classifyScript, deliverScript, importScript, matchScript, qualityScript, ratiosScript, type Script } from "./engine";
import { RowsTable } from "./Table";

type Status = "locked" | "ready" | "running" | "attention" | "done";
const INITIAL: Record<StepId, Status> = { import: "ready", checks: "locked", classify: "locked", match: "locked", ratios: "locked", quality: "locked", deliver: "locked" };
const STEP_ANOMALIES: Partial<Record<StepId, AnomalyId[]>> = { checks: ["ingredients", "weight"], match: ["protein"] };
const CLASS_COLOR = { animal_core: "var(--animal)", composite: "var(--comp)", plant_non_core: "var(--plant-2)", plant_core: "var(--plant)" } as const;

const Ico = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const I = {
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  check: "M5 12.5l4.2 4.2L19 7",
  cross: "M6 6l12 12M18 6L6 18",
  sheet: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M4 15h16M10 4v16",
  table: "M4 6h16M4 12h16M4 18h16M8 6v12",
  report: "M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M9 17v-3M12 17v-6M15 17v-2",
  doc: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
};
const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en"));
  const [status, setStatus] = useState(INITIAL);
  const [view, setView] = useState<StepId>("import");
  const [decisions, setDecisions] = useState<Decisions>({});
  const [fileError, setFileError] = useState(false);
  const [fileName, setFileName] = useState("");
  const run = useRunner();
  const L = T[lang];

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const set = (patch: Partial<Record<StepId, Status>>) => setStatus((s) => ({ ...s, ...patch }));
  const nextOf = (s: StepId) => STEP_IDS[STEP_IDS.indexOf(s) + 1];

  const finish = (step: StepId) => {
    const need = STEP_ANOMALIES[step];
    if (need) { set({ [step]: "attention" }); return; }
    const nx = nextOf(step);
    set({ [step]: "done", ...(nx ? { [nx]: "ready" } : {}) });
  };
  const play = (step: StepId, script: Script) => {
    set({ [step]: "running" });
    run.play(script.events, script.total, () => finish(step));
  };

  /** The presenter accepts the proposed correction, or declines it and keeps the value as received. */
  const decide = (id: AnomalyId, d: Decision) => {
    const a = ANOMALIES.find((x) => x.id === id)!;
    const p = PRODUCTS[a.row];
    const fr = lang === "fr";
    const row = `${fr ? "ligne" : "row"} ${a.row + 1} ${tillLabel(p, lang)}`;
    const text = d === "accepted"
      ? (id === "ingredients" ? (fr ? `${row} : liste d'ingrédients remplacée par celle du code-barres (accepté)` : `${row}: ingredient list replaced by the one found by barcode (accepted)`)
        : id === "weight" ? (fr ? `${row} : poids net fixé à ${fmtNum(Number(a.to), lang, 3)} kg, lu sur le libellé caisse (accepté)` : `${row}: net weight set to ${a.to} kg, from the till label (accepted)`)
        : (fr ? `${tillLabel(p, lang)} : ${fmtNum(Number(a.to), lang, 1)} g retenus, issus d'Open Food Facts (accepté)` : `${tillLabel(p, lang)}: ${a.to} g kept, from Open Food Facts (accepted)`))
      : (id === "ingredients" ? (fr ? `${row} : liste d'ingrédients conservée telle que reçue (refusé), à confirmer avec le distributeur` : `${row}: ingredient list kept as received (declined), to confirm with the retailer`)
        : id === "weight" ? (fr ? `${row} : pas de poids net, le produit n'entre pas dans les tonnes (refusé)` : `${row}: no net weight, the product is left out of the tonnes (declined)`)
        : (fr ? `${tillLabel(p, lang)} : ${a.from} g conservés tels que déclarés (refusé), à confirmer avec le distributeur` : `${tillLabel(p, lang)}: ${a.from} g kept as declared (declined), to confirm with the retailer`));
    run.say(id === "protein" ? "declared" : id === "weight" ? "weight" : "file", text, d === "declined");
    const next = { ...decisions, [id]: d };
    setDecisions(next);
    for (const [step, ids] of Object.entries(STEP_ANOMALIES) as [StepId, AnomalyId[]][]) {
      if (ids.includes(id) && ids.every((x) => next[x])) {
        const nx = nextOf(step);
        set({ [step]: "done", ...(nx ? { [nx]: "ready" } : {}) });
      }
    }
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    if (!isDemoFile(text)) { setFileError(true); run.say("warn", lang === "fr" ? `${f.name} : ce n'est pas le catalogue attendu pour cette mission, refusé` : `${f.name}: not the catalogue expected for this engagement, rejected`, true); return; }
    setFileError(false);
    setFileName(f.name);
    play("import", importScript(f.size, lang, f.name, delimiterOf(text.replace(/^﻿/, ""))));
  };

  const reset = () => { run.reset(); setStatus(INITIAL); setView("import"); setDecisions({}); setFileError(false); setFileName(""); };

  const st = status[view];
  const S = L.steps[view];
  const n = STEP_IDS.indexOf(view) + 1;
  const scripts: Partial<Record<StepId, (l: Lang) => Script>> = {
    checks: checksScript, classify: classifyScript,
    match: (l) => matchScript(l, decisions), ratios: (l) => ratiosScript(l, decisions),
    quality: (l) => qualityScript(l, decisions), deliver: (l) => deliverScript(l, decisions),
  };
  const imported = status.import === "done";

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="logo"><b>Altera<em>.ai</em></b></div>
          <div className="crumb">{imported ? <><b>Harbour Market</b><span>·</span><span>{L.project.split("·")[1]}</span></> : <span>{L.newProject}</span>}</div>
          <div className="top-r">
            <div className="lang" role="group" aria-label="Language">
              {(["en", "fr"] as Lang[]).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
            </div>
            <button className="ghost" onClick={reset}>{L.reset}</button>
          </div>
        </header>

        <div className="body">
          <aside className="side">
            <div className="side-label">{L.pipeline}</div>
            {STEP_IDS.map((id, i) => {
              const s = status[id];
              const can = s !== "locked";
              const open = (STEP_ANOMALIES[id] ?? []).filter((a) => !decisions[a]).length;
              return (
                <button key={id} className={`pstep ${s} ${can ? "can" : ""} ${view === id ? "now" : ""}`} disabled={!can} onClick={() => can && setView(id)}>
                  <span className="ic" style={{ position: "relative" }}>{s === "done" ? <Ico d={I.check} size={14} /> : s === "running" ? <span className="spin" /> : s === "attention" ? "!" : i + 1}</span>
                  <span>{L.steps[id].name}{s === "attention" && open > 0 && <small>{fill(L.needs, { n: open })}</small>}</span>
                </button>
              );
            })}
            <div className="credit">{L.credit}</div>
          </aside>

          <main className="main">
            <div className="shead">
              <div>
                <div className="k">{fill(L.stepOf, { n })}</div>
                <h1>{S.title}</h1>
                <p>{S.desc}</p>
              </div>
              {view !== "import" && (
                st === "done" && nextOf(view) ? <button className="run lav" onClick={() => setView(nextOf(view)!)}>{L.next} <Ico d={I.arrow} size={16} /></button>
                : st === "done" ? <button className="run done" disabled><Ico d={I.check} size={16} />{S.done}</button>
                : st === "running" ? <button className="run busy" disabled><span className="spin" />{L.running}</button>
                : st === "attention" ? <button className="run busy" disabled>{L.toReview}</button>
                : <button className="run" disabled={st !== "ready" || run.busy} onClick={() => play(view, scripts[view]!(lang))}>{fill(S.run, { n: IN_PT.length })} <Ico d={I.arrow} size={16} /></button>
              )}
              {view === "import" && imported && <button className="run lav" onClick={() => setView("checks")}>{L.next} <Ico d={I.arrow} size={16} /></button>}
            </div>
            {st === "running" && <div className="progress"><i style={{ width: `${run.progress * 100}%` }} /></div>}

            {view === "import" && <ImportPanel lang={lang} status={status.import} error={fileError} fileName={fileName} onFile={onFile} marks={run.marks} />}
            {view === "checks" && <ChecksPanel lang={lang} st={st} marks={run.marks} busy={run.busy} decisions={decisions} decide={decide} />}
            {view === "classify" && <ClassifyPanel lang={lang} marks={run.marks} busy={run.busy} decisions={decisions} />}
            {view === "match" && <MatchPanel lang={lang} st={st} marks={run.marks} busy={run.busy} decisions={decisions} decide={decide} />}
            {view === "ratios" && <RatiosPanel lang={lang} marks={run.marks} decisions={decisions} />}
            {view === "quality" && <QualityPanel lang={lang} marks={run.marks} decisions={decisions} />}
            {view === "deliver" && <DeliverPanel lang={lang} st={st} marks={run.marks} progress={run.progress} decisions={decisions} />}
          </main>

        </div>
      </div>
      <div className="narrow"><div><b>{L.narrow[0]}</b>{L.narrow[1]}</div></div>
    </>
  );
}

// ------------------------------------------------------------ 1 · import
function ImportPanel({ lang, status, error, fileName, onFile, marks }: { lang: Lang; status: Status; error: boolean; fileName: string; onFile: (f: File) => void; marks: Set<string> }) {
  const L = T[lang];
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (status === "done" || marks.has("imported")) return (
    <>
      <div className="ctitle" style={{ marginTop: 4 }}><span>{L.asReceived}</span><span className="chip">{fill(L.rowsCols, { r: N, c: COLUMN_NAMES[lang].length })}</span></div>
      <RowsTable view="raw" lang={lang} marks={marks} busy={false} decisions={{}} />
    </>
  );
  if (status === "running") return (
    <div className="drop"><span className="ico"><span className="spin" style={{ width: 22, height: 22 }} /></span><h2>{L.reading}</h2><p className="mono">{fileName || DEMO_FILES[lang]}</p></div>
  );
  return (
    <>
      <div className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
        <span className="ico"><Ico d={I.upload} size={26} /></span>
        <h2>{L.dropTitle}</h2>
        <p>{L.dropText}</p>
        <button className="browse" onClick={() => input.current?.click()}>{L.browse}</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <div className="cols">{COLUMN_NAMES[lang].map((c) => <span key={c}>{c}</span>)}</div>
        {error && <div className="err">{fill(L.wrongFile, { file: DEMO_FILES[lang] })}</div>}
      </div>
      <div className="getfile"><a href={`demo/${DEMO_FILES[lang]}`} download>{L.getFile}</a></div>
    </>
  );
}

// ------------------------------------------------------------ anomalies: accept or decline
function Anomalies({ lang, ids, marks, decisions, decide, canDecide }: { lang: Lang; ids: AnomalyId[]; marks: Set<string>; decisions: Decisions; decide: (id: AnomalyId, d: Decision) => void; canDecide: boolean }) {
  const L = T[lang];
  const shown = ANOMALIES.filter((a) => ids.includes(a.id) && marks.has(`anom:${a.id}`)).sort((a, b) => ANOMALY_ORDER.indexOf(a.id) - ANOMALY_ORDER.indexOf(b.id));
  if (!shown.length) return null;
  return (
    <div className="card">
      <div className="ctitle"><span>{L.toReview}</span>{shown.every((a) => decisions[a.id]) && <span className="chip ok">{L.allResolved}</span>}</div>
      <div className="anoms">
        {shown.map((a) => {
          const p = PRODUCTS[a.row];
          const d = decisions[a.id];
          const [title, text] = L.anomalies[a.id];
          const from = lang === "fr" && a.fromFr !== undefined ? a.fromFr : a.from;
          const to = lang === "fr" && a.toFr !== undefined ? a.toFr : a.to;
          const fx = a.id === "ingredients" ? <><s>{short(from)}</s>→<b>{short(to)}</b></>
            : a.id === "weight" ? <><s>{L.emptyCell}</s>→<b>{fmtNum(Number(to), lang, 3)} kg</b></>
            : <><s>{from} g</s>→<b>{fmtNum(Number(to), lang, 1)} g</b></>;
          return (
            <div className={`anom ${d === "accepted" ? "ok" : d === "declined" ? "no" : ""}`} key={a.id}>
              <span className="ai">{d === "accepted" ? <Ico d={I.check} /> : d === "declined" ? <Ico d={I.cross} size={16} /> : "!"}</span>
              <div><b>{title} · <span className="mono" style={{ fontWeight: 500 }}>{tillLabel(p, lang)}</span></b><p>{text}</p><span className="fx">{fx}</span></div>
              {d ? <span className={`chip ${d === "accepted" ? "ok" : "warn"}`}>{d === "accepted" ? L.accepted : L.declined}</span>
                : <div className="decide">
                    <button className="decline" disabled={!canDecide} onClick={() => decide(a.id, "declined")}>{L.decline}</button>
                    <button className="accept" disabled={!canDecide} onClick={() => decide(a.id, "accepted")}>{L.accept}</button>
                  </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 2 · data checks
function ChecksPanel({ lang, st, marks, busy, decisions, decide }: { lang: Lang; st: Status; marks: Set<string>; busy: boolean; decisions: Decisions; decide: (id: AnomalyId, d: Decision) => void }) {
  const L = T[lang];
  const scope = marks.has("scope");
  const inWwf = PRODUCTS.filter((p) => p.res.inWwf).length;
  return (
    <>
      <Anomalies lang={lang} ids={["ingredients", "weight"]} marks={marks} decisions={decisions} decide={decide} canDecide={st === "attention"} />
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="ctitle">{L.inventory}</div>
          {FILL.map((f) => (
            <div className="frow" key={f.col}>
              <span className="mono" style={{ fontSize: 12 }}>{COLUMN_NAMES[lang][f.i]}</span>
              <span className="track"><i style={{ width: marks.has("fill") ? `${f.rate * 100}%` : 0, background: f.rate > 0.95 ? "var(--ink)" : f.rate > 0.75 ? "var(--green-2)" : "var(--animal)" }} /></span>
              <b>{marks.has("fill") ? fmtPct(f.rate, lang, 0) : ""}</b>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="ctitle">{L.scope}</div>
          <div className="funnel">
            <div className="fun"><span>{L.received}</span><span className="bar"><i style={{ width: scope ? "100%" : 0, background: "var(--ink)" }} /></span><b>{scope ? N : ""}</b></div>
            <div className="fun"><span>{L.wwfScope}</span><span className="bar"><i style={{ width: scope ? `${(100 * inWwf) / N}%` : 0, background: "var(--comp)" }} /></span><b>{scope ? inWwf : ""}</b></div>
            <div className="fun"><span>{L.ptScope}</span><span className="bar"><i style={{ width: scope ? `${(100 * IN_PT.length) / N}%` : 0, background: "var(--green)" }} /></span><b>{scope ? IN_PT.length : ""}</b></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}><RowsTable view="checks" lang={lang} marks={marks} busy={busy} decisions={decisions} /></div>
    </>
  );
}

// ------------------------------------------------------------ 3 · classification
function ClassifyPanel({ lang, marks, busy, decisions }: { lang: Lang; marks: Set<string>; busy: boolean; decisions: Decisions }) {
  const L = T[lang];
  const seen = (p: (typeof PRODUCTS)[number]) => marks.has(`cls:${PRODUCTS.indexOf(p)}`);
  const cards: [string, number, string, string][] = [
    ...(["reference", "model"] as const).map((r) => [r, IN_PT.filter((p) => p.res.route === r && seen(p)).length, L.routes[r], L.routeNotes[r]] as [string, number, string, string]),
    ["out", PRODUCTS.filter((p) => !p.res.inPt && seen(p)).length, ...L.routeOut],
  ];
  return (
    <>
      <div className="grid3" style={{ marginBottom: 14 }}>
        {cards.map(([k, n, name, note]) => <div className={`stat ${k === "out" ? "out" : ""}`} key={k}><b>{n}</b><span><strong>{name}</strong>{note}</span></div>)}
      </div>
      <RowsTable view="classify" lang={lang} marks={marks} busy={busy} decisions={decisions} />
    </>
  );
}

// ------------------------------------------------------------ 4 · protein and split
function MatchPanel({ lang, st, marks, busy, decisions, decide }: { lang: Lang; st: Status; marks: Set<string>; busy: boolean; decisions: Decisions; decide: (id: AnomalyId, d: Decision) => void }) {
  const L = T[lang];
  const prot = ANOMALIES.find((a) => a.id === "protein")!;
  const products = productsFor(decisions);
  const inPt = products.filter((p) => p.res.inPt);
  const known = (i: number) => (i === prot.row ? !!decisions.protein : marks.has(`prot:${i}`));
  const srcs = (["declared", "reference", "off", "ciqual"] as const).map((s) => ({ s, n: inPt.filter((p) => p.res.protSrc === s && known(products.indexOf(p))).length }));
  const splits = (["one_side", "ingredients", "nevo", "convention", "group"] as const).map((s) => ({ s, n: inPt.filter((p) => p.res.split === s && marks.has(`split:${products.indexOf(p)}`)).length }));
  return (
    <>
      <Anomalies lang={lang} ids={["protein"]} marks={marks} decisions={decisions} decide={decide} canDecide={st === "attention"} />
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card"><div className="ctitle">{L.sourceCounts}</div><div className="counts">{srcs.map(({ s, n }) => <div className="count" key={s}><b>{n}</b>{L.sources[s]}</div>)}</div></div>
        <div className="card"><div className="ctitle">{L.splitCounts}</div><div className="counts">{splits.map(({ s, n }) => <div className="count" key={s}><b>{n}</b>{L.splits[s]}</div>)}</div></div>
      </div>
      <div style={{ marginTop: 14 }}><RowsTable view="match" lang={lang} marks={marks} busy={busy} decisions={decisions} /></div>
    </>
  );
}

// ------------------------------------------------------------ 5 · ratios
function Kpi({ lang, show, tone, method, value, label, refPos, refText }: { lang: Lang; show: boolean; tone: "wwf" | "pt"; method: string; value: number; label: string; refPos?: number; refText: ReactNode }) {
  return (
    <div className={`kpi ${tone}`} style={{ opacity: show ? 1 : 0.35, transition: "opacity .5s" }}>
      <span className="m">{method}</span>
      <b>{show ? fmtPct(value, lang) : "…"}</b>
      <span className="l">{label}</span>
      <div className="gauge"><i style={{ width: show ? `${value * 100}%` : 0 }} />{refPos !== undefined && <s style={{ left: `${refPos * 100}%` }} />}</div>
      <span className="ref">{refText}</span>
    </div>
  );
}
function RatiosPanel({ lang, marks, decisions }: { lang: Lang; marks: Set<string>; decisions: Decisions }) {
  const L = T[lang];
  const R = resultsFor(decisions);
  const det = marks.has("detail");
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Kpi lang={lang} show={marks.has("kpi:fg1")} tone="wwf" method="WWF" value={R.wwf.fg1} label={L.wwfFg1} refPos={PHD.fg1} refText={fill(L.phd, { v: fmtPct(PHD.fg1, lang, 0) })} />
        <Kpi lang={lang} show={marks.has("kpi:fg2")} tone="wwf" method="WWF" value={R.wwf.fg2} label={L.wwfFg2} refText={L.unitWwf} />
        <Kpi lang={lang} show={marks.has("kpi:diet")} tone="wwf" method="WWF" value={R.wwf.diet} label={L.wwfDiet} refPos={PHD.diet} refText={fill(L.phd, { v: fmtPct(PHD.diet, lang, 0) })} />
        <Kpi lang={lang} show={marks.has("kpi:pt")} tone="pt" method="Protein Tracker" value={R.pt.ratio} label={L.ptRatio} refText={fill(L.levelA, { v: fmtPct(R.pt.levelA, lang, 0) })} />
      </div>
      <div className="grid2" style={{ marginTop: 14, opacity: det ? 1 : 0.35, transition: "opacity .5s" }}>
        <div className="card">
          <div className="ctitle"><span>{L.byGroup}</span><span className="legend" style={{ margin: 0 }}><span><i style={{ background: "var(--plant)" }} />{L.plant}</span><span><i style={{ background: "var(--animal)" }} />{L.animal}</span></span></div>
          {FOOD_GROUPS.map((g) => {
            const v = R.wwf.groups[g];
            const all = v.plant + v.animal;
            const share = all ? v.plant / all : 0;
            return (
              <div className="grow" key={g}>
                <span className="gn"><b>{g}</b>{L.fg[g]}</span>
                <span className="t">{det ? `${fmtNum(all, lang, 0)} t` : ""}</span>
                <b>{det ? fmtPct(share, lang, 0) : ""}</b>
                <span className="split"><i style={{ width: det ? `${share * 100}%` : 0, background: "var(--plant)" }} /><i style={{ width: det ? `${(1 - share) * 100}%` : 0, background: "var(--animal)" }} /></span>
              </div>
            );
          })}
          <div className="legend">{lang === "fr" ? "Part végétale de chaque groupe, en tonnes de produit, laitiers en équivalents lait" : "Plant share of each group, in tonnes of product, dairy in dairy equivalents"}</div>
        </div>
        <div className="card">
          <div className="ctitle">{L.byClass}</div>
          <div className="seg">{PT_CLASSES.map((c) => <i key={c} style={{ flexBasis: det ? `${R.pt.byClass[c] * 100}%` : "0%", background: CLASS_COLOR[c] }} />)}</div>
          <div className="legend">{PT_CLASSES.map((c) => <span key={c}><i style={{ background: CLASS_COLOR[c] }} />{L.classes[c]} <b>{det ? fmtPct(R.pt.byClass[c], lang, 0) : ""}</b></span>)}</div>
          <div className="ctitle" style={{ marginTop: 16 }}>{L.bySub}</div>
          {PT_SUBS.map(({ group, subs }) => (
            <div key={group}>
              <div className="subhead"><i style={{ background: CLASS_COLOR[group] }} />{L.classes[group]}</div>
              {subs.filter((s) => R.pt.bySub[s]).map((s) => {
                const t = R.pt.bySub[s] ?? 0;
                return (
                  <div className="drow sub" key={s}>
                    <span>{L.subs[s]}</span>
                    <span className="t">{det ? `${fmtNum(t, lang, 1)} t` : ""}</span>
                    <b>{det ? fmtPct(t / R.pt.protT, lang, 0) : ""}</b>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="legend">{lang === "fr" ? "Tonnes de protéines, et part de toutes les protéines vendues" : "Tonnes of protein, and share of all protein sold"}</div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 6 · quality checks
function QualityPanel({ lang, marks, decisions }: { lang: Lang; marks: Set<string>; decisions: Decisions }) {
  const L = T[lang];
  const kept = decisions.protein === "declined" ? "declined" : "accepted";
  const vals = { n: IN_PT.length, ...CROSS, energy: L.energy[kept], cross: L.cross[kept] };
  return (
    <>
      <div className="card">
        <div className="checks">
          {L.checkGroups.map(([g, items], gi) => (
            <div className={`cgroup ${gi === 4 ? "wide" : ""}`} key={g}>
              <h3>{g}</h3>
              <div className="items">
                {items.slice(0, CHECK_COUNT[gi]).map(([t, d], i) => {
                  const ok = marks.has(`chk:${gi}-${i}`);
                  return (
                    <div className="citem" key={t}>
                      <span className={`tick ${ok ? "ok" : ""}`}>{ok ? <Ico d={I.check} size={12} /> : null}</span>
                      <span>{t}<small>{ok ? fill(d, vals) : " "}</small></span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ opacity: marks.has("sample") ? 1 : 0.35, transition: "opacity .5s" }}>
        <div className="ctitle"><span>{L.sample}</span><span className="chip ink"><Ico d={I.lock} size={12} /> {L.sealed}</span></div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text)", maxWidth: "80ch" }}>{L.sampleText}</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------ 7 · deliverables
function DeliverPanel({ lang, st, marks, progress, decisions }: { lang: Lang; st: Status; marks: Set<string>; progress: number; decisions: Decisions }) {
  const L = T[lang];
  const D = downloads(decisions);
  const icons = [I.report, I.sheet, I.table, I.doc];
  const hrefs = [D.report[lang], D.workbook, D.csv, D.scope[lang]];
  const total = DELIVER_TOTAL;
  return (
    <>
      <div className="files">
        {L.files.map(([name, desc], i) => {
          const ready = marks.has(`file:${i}`);
          const [a, b] = FILE_WINDOWS[i];
          const p = Math.max(0, Math.min(1, (progress * total - a) / (b - a)));
          return (
            <div className="file" key={name} style={{ opacity: st === "ready" ? 0.5 : 1 }}>
              <span className="fi"><Ico d={icons[i]} size={22} /></span>
              <div>
                <b>{name}</b>
                <p>{desc}</p>
                {ready ? <a className="dl" href={hrefs[i]} download><Ico d={I.download} size={14} />{L.download}</a>
                  : st === "running" && p > 0 ? <><div className="bar"><i style={{ width: `${p * 100}%` }} /></div><span className="chip ghosted">{L.building}…</span></>
                  : null}
              </div>
            </div>
          );
        })}
      </div>
      {st === "done" && (
        <div className="cta">
          <div><h2>{L.ctaTitle}</h2><p>{L.ctaText}</p></div>
          <a href={BOOKING_URL} target="_blank" rel="noopener">{L.cta}</a>
        </div>
      )}
    </>
  );
}
