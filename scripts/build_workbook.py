"""Build the workbook and the line-level file offered at the last step.

    python3 scripts/build_workbook.py

The workbook is Altera's results file template (scripts/assets/workbook_template.xlsx), filled
with the 30 products of the catalogue (src/data/catalogue.json): its eight tabs, styles,
logos and charts are kept; its fifty example rows are replaced by ours, every formula range is
resized to them, and the lists (categories, departments, brands, products) are rewritten.

Writes, for each combination of the presenter's decisions on the three anomalies (accepted or
declined; the folder name is one letter per anomaly, a or d, in the order ingredients, weight,
protein):
    public/downloads/<aaa>/HarbourMarket_Protein_Ratio.xlsx   the filled template
    public/downloads/<aaa>/HarbourMarket_products.csv         the Data tab, values computed
and src/data/deliverables.json, the number of formulas the app's log announces.

openpyxl writes formulas without evaluating them: LibreOffice recalculates the workbook, every
cell is checked for errors, and the figures that matter are compared with Python's. The script
refuses to finish on any difference.
"""
from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from copy import copy
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.worksheet.formula import ArrayFormula

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "catalogue.json"
TEMPLATE = ROOT / "scripts" / "assets" / "workbook_template.xlsx"
OUT = ROOT / "public" / "downloads"
XLSX_NAME, CSV_NAME = "HarbourMarket_Protein_Ratio.xlsx", "HarbourMarket_products.csv"
ORDER = ["ingredients", "weight", "protein"]
VARIANTS = [a + b + c for a in "ad" for b in "ad" for c in "ad"]
TEMPLATE_ROWS = 51          # the template's Data tab: header + 50 example products

# ------------------------------------------------------------ vocabulary of the template's Data tab
SUBGROUP = {"red_meat": "red_meat", "poultry": "poultry", "fish_shellfish": "seafood", "eggs": "eggs", "dairy": "dairy_animal",
            "animal_fat": "animal_based_fat", "plant_fat": "plant_based_fat", "pulses": "legumes", "nuts": "nuts",
            "alternative_products": "meat_egg_seafood_alternatives", "tofu_tempeh_seitan": "tofu_tempeh_seitan",
            "dairy_alternatives": "dairy_alternative_plant", "refined_grain": "refined_grain", "whole_grain": "whole_grain"}
PT_CLASS = {"animal_core": "animal_core", "plant_core": "plant_core", "plant_non_core": "plant_non_core",
            "composite": "animal-plant-based composite"}
OUT_WWF = "outside WWF scope"
NA = "not applicable"


def cols(a: str, b: str) -> list[str]:
    return [get_column_letter(i) for i in range(column_index_from_string(a), column_index_from_string(b) + 1)]


def decided(cat: dict, variant: str) -> list[dict]:
    """The products once the presenter has decided: a declined correction keeps the value as received."""
    products = [dict(p, res=dict(p["res"])) for p in cat["products"]]
    for a, letter in zip(sorted(cat["anomalies"], key=lambda a: ORDER.index(a["id"])), variant):
        p = products[a["row"]]
        p["declined"] = p.get("declined", set()) | ({a["id"]} if letter == "d" else set())
        if letter == "d":
            p["res"].update(a["declined"])
        elif a["id"] == "ingredients":
            p["raw"] = dict(p["raw"], ingredients=a["to"])      # the list found by barcode
    return products


def rows_of(cat: dict, variant: str = "aaa") -> list[dict]:
    """One Data row per product, in the template's columns, sorted by sales rank."""
    products = decided(cat, variant)
    rank = {p["key"]: i + 1 for i, p in enumerate(sorted(products, key=lambda p: -int(p["raw"]["units_sold_12m"])))}
    out = []
    for p in products:
        raw, res = p["raw"], p["res"]
        w = res["wwf"]
        in_pt, in_wwf = res["inPt"], res["inWwf"]
        prot = res["prot"] if in_pt else None
        plant = round(prot * res["plant"], 2) if prot is not None else None
        if w is None:
            fg = sub = origin = comp = ccat = OUT_WWF
        elif w["struct"] == "composite":
            fg, sub, origin, comp, ccat = NA, NA, NA, "Yes", w["cat"]
        else:
            fg, sub = w["fg"], SUBGROUP.get(w["sub"] or "", NA)
            origin, comp, ccat = ("plant_based" if w["origin"] == "plant" else "animal_based"), "No", NA
        pt = PT_CLASS[res["pt"]] if in_pt else "outside scope - non-food"
        if not in_pt:
            src = split = "outside scope"
        else:
            src = {"declared": "retailer", "reference": "Altera reference database", "off": "OpenFoodFacts", "ciqual": "CIQUAL",
                   "median": f"median of the category ({raw['segment']})"}[res["protSrc"]]
            if p["key"] == "spaghetti":
                src = ("retailer · implausible (per-pack figure), kept as declared: to confirm" if "protein" in p.get("declined", ())
                       else "OpenFoodFacts · retailer value implausible, corrected (per-pack figure)")
            split = {"one_side": ("exact · all ingredients on the same side" if raw["ingredients"]
                                  else "deduced from the origin of the product · the protein follows its single side"),
                     "ingredients": "exact · percentages declared in the ingredient list",
                     "nevo": f"NEVO · plant and animal protein of the matched food ({res.get('matched')})",
                     "convention": "50/50 by convention · not deducible from the ingredients",
                     "group": f"follows its Protein Tracker group ({PT_CLASS[res['pt']].replace('_', ' ')}) · all animal",
                     "zero": "no protein"}[res["split"]]
        model = round(res["conf"] * 100) if res["route"] == "model" else None
        out.append({
            "key": p["key"], "rank": rank[p["key"]],
            "A": res["ean"], "B": raw["product_name"], "C": raw["brand"], "D": raw["department"], "E": raw["segment"],
            "F": fg, "G": sub, "H": origin, "I": comp, "J": ccat, "K": pt,
            "L": prot, "M": plant, "N": round(prot - plant, 2) if prot is not None else None,
            "O": res["weightKg"] or None, "P": rank[p["key"]], "Q": int(raw["units_sold_12m"]),
            "U": raw["ingredients"] or None, "V": "Yes" if in_wwf else "No", "W": "Yes" if in_pt else "No",
            "X": (model if model is not None else "Altera reference database") if in_wwf else "outside scope",
            "Y": (model if model is not None else "Altera reference database") if in_pt else "outside scope",
            "Z": src, "AA": split, "AB": (res["level"] or "A") if in_pt else NA, "AC": res["dairy"],
        })
    for r in out:  # the formula columns, as Python computes them
        r["R"] = 0.0 if not (r["Q"] and r["O"]) else r["Q"] * r["O"]
        r["S"] = r["R"] * (r["M"] or 0) / 100
        r["T"] = r["R"] * (r["N"] or 0) / 100
        r["AD"] = r["R"] * r["AC"]
    return sorted(out, key=lambda r: r["rank"])


# ------------------------------------------------------------ helpers
def style_like(dst, src):
    dst._style = copy(src._style)


def copy_row_style(ws, src_row: int, dst_row: int, columns):
    for c in columns:
        style_like(ws[f"{c}{dst_row}"], ws[f"{c}{src_row}"])
    if ws.row_dimensions[src_row].height:
        ws.row_dimensions[dst_row].height = ws.row_dimensions[src_row].height


def clear(ws, first: int, last: int, columns, blank_style_row: int | None = None):
    for r in range(first, last + 1):
        for c in columns:
            cell = ws[f"{c}{r}"]
            cell.value = None
            if blank_style_row:
                style_like(cell, ws[f"{c}{blank_style_row}"])


def nodash(s):
    """The template's dashes used as separators become middle dots; no em or en dash anywhere."""
    if isinstance(s, str) and not s.startswith("="):
        return s.replace(" - ", " · ").replace("\u2014", "N/A").replace("\u2013", "·")
    return s


RANGE = re.compile(r"(\$[A-Z]{1,2}\$)2:(\$[A-Z]{1,2}\$)" + str(TEMPLATE_ROWS) + r"\b")


def resize(wb, last: int):
    """Every Data!$X$2:$X$51 range of the template now ends on our last row."""
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    c.value = RANGE.sub(lambda m: f"{m.group(1)}2:{m.group(2)}{last}", c.value)


def group_formulas(col: str, r: int, last: int) -> dict:
    rng = lambda c: f"Data!${c}$2:${c}${last}"
    return {
        "B": f"=SUMIFS({rng('R')},{rng(col)},A{r})/1000",
        "C": f"=D{r}+E{r}",
        "D": f"=SUMIFS({rng('S')},{rng(col)},A{r})/1000",
        "E": f"=SUMIFS({rng('T')},{rng(col)},A{r})/1000",
        "F": f'=IF(C{r}=0,"",D{r}/C{r})',
        "G": f'=IF(C{r}=0,"",E{r}/C{r})',
    }


def ranked(rows: list[dict], col: str) -> list[str]:
    tot: dict[str, float] = {}
    for r in rows:
        tot[r[col]] = tot.get(r[col], 0) + r["S"] + r["T"]
    return sorted(tot, key=lambda k: (-tot[k], k))


def list_sheet(ws, rows, col: str, first: int, donor: int, old_last: int, head: int) -> list[str]:
    """Rewrite a By department / By brand / retailer category list, heaviest in protein first."""
    names = ranked(rows, col)
    last_data = len(rows) + 1
    for i in range(len(names)):
        copy_row_style(ws, donor, first + i, "ABCDEFG")
    clear(ws, first, max(old_last, first + len(names)), "ABCDEFG")
    for i, name in enumerate(names):
        r = first + i
        ws[f"A{r}"] = name
        for c, f in group_formulas(col, r, last_data).items():
            ws[f"{c}{r}"] = f
    ws.auto_filter.ref = f"A{head}:G{first + len(names) - 1}"
    return names


# ------------------------------------------------------------ build
def build(cat: dict, variant: str, xlsx: Path) -> tuple[list[dict], dict]:
    rows = rows_of(cat, variant)
    n = len(rows)
    last = n + 1
    wb = load_workbook(TEMPLATE)

    # ---- Data
    ds = wb["Data"]
    data_cols = cols("A", "AD")
    blank_row = TEMPLATE_ROWS + 5
    for row in range(2, ds.max_row + 1):
        for c in data_cols:
            ds[f"{c}{row}"].value = None
    for i in range(n):
        copy_row_style(ds, 3, 2 + i, data_cols)        # an ordinary example row dresses ours
    for row in range(last + 1, TEMPLATE_ROWS + 1):
        copy_row_style(ds, blank_row, row, data_cols)
    for i, r in enumerate(rows):
        row = 2 + i
        for c in data_cols:
            if c not in ("Q", "R", "S", "T", "AD"):
                ds[f"{c}{row}"] = r[c]
        ds[f"A{row}"].number_format = "@"
        ds[f"Q{row}"] = f"=IFERROR(VLOOKUP(A{row},Welcome!$B$33:$D${32 + n},3,FALSE),0)"
        ds[f"R{row}"] = f"=IF(N(Q{row})*N(O{row})=0,0,Q{row}*O{row})"
        ds[f"S{row}"] = f"=R{row}*N(M{row})/100"
        ds[f"T{row}"] = f"=R{row}*N(N{row})/100"
        ds[f"AD{row}"] = f"=R{row}*N(AC{row})"
        for c in ("Q", "R", "S", "T", "AD"):
            ds[f"{c}{row}"].number_format = "#,##0"
    ds.auto_filter.ref = f"A1:AD{last}"

    resize(wb, last)

    # ---- Welcome
    we = wb["Welcome"]
    we["C1"] = "PROTEIN RATIO\nHarbour Market catalogue"
    we["A5"] = "  HARBOUR MARKET · CATALOGUE 2026"
    we["A6"] = (f"{n} products from your catalogue file, each classified for WWF and for the Protein Tracker. Protein contents: "
                "your declared values, then the Altera reference database, Open Food Facts (ODbL), NEVO and CIQUAL.")
    we["A12"] = "Your volumes"
    we["B12"] = "Units sold over twelve months, from your file: type others over them and every tab recalculates."
    we.row_dimensions[8].height = 28  # room for the second line of "What this workbook contains"
    f = we["B14"].font
    we["B14"] = "Measured\nby hand"
    we["B14"].font = Font(name=f.name, size=16, bold=True, color=copy(f.color))
    we["B14"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    we["B14"].number_format = "General"
    we["C14"] = ("Measured on your own catalogue, one rate per field, on a control sample sealed before review:\n"
                 "• 500 products drawn at random\n• the 500 heaviest products in tonnes of protein\n"
                 "• the 3 best sellers of every category\nReviewed by hand, row by row.")
    for r in range(14, 19):
        we.row_dimensions[r].height = 17
    we["B22"] = f"the WWF sub-groups and the {len({r['E'] for r in rows})} retailer categories"
    we["B23"] = f"the {len({r['D'] for r in rows})} departments"
    we["B24"] = f"the {len({r['C'] for r in rows})} brands"
    we["A25"] = "By product"
    we["B25"] = "the 10 products carrying the most plant protein and the 10 carrying the most animal protein"
    we["B26"] = f"one row per product, {n} in total"
    we["A30"] = "  YOUR SALES VOLUMES · enter them in the yellow column"
    we["D32"] = "Volume sold (units)"
    for i in range(n):
        copy_row_style(we, 33, 33 + i, "ABCD")
    clear(we, 33 + n, 82, "ABCD", blank_style_row=90)
    for i, r in enumerate(rows):
        row = 33 + i
        we[f"A{row}"], we[f"B{row}"], we[f"C{row}"], we[f"D{row}"] = r["rank"], r["A"], r["B"], r["Q"]
        we[f"B{row}"].number_format = "@"

    # ---- Protein Tracker: the composite class spelt as in the Data tab
    pt = wb["Protein Tracker"]
    for c in ("B48", "D48", "E48"):
        pt[c] = pt[c].value.replace('"composite"', '"animal-plant-based composite"')
    pt["A1"] = "  PROTEIN TRACKER · Green Protein Alliance"

    # ---- WWF
    ww = wb["WWF"]
    ww["A1"] = "  WWF PLANET-BASED DIETS · REPORT IN APPENDIX D FORMAT"
    ww["B4"] = f"Harbour Market catalogue, {n} products, volumes entered on the Welcome tab"
    ww["B5"] = "Step 1 · product level"

    # ---- By category (the WWF sub-groups stay; the retailer categories are ours), By department, By brand
    list_sheet(wb["By category"], rows, "E", 28, 29, 51, 27)
    list_sheet(wb["By department"], rows, "D", 4, 5, 16, 3)
    list_sheet(wb["By brand"], rows, "C", 4, 5, 14, 3)

    # ---- By product: the 10 heaviest in plant protein, then the 10 heaviest in animal protein
    bp = wb["By product"]
    k = cols("A", "K")
    title = {c: copy(bp[f"{c}29"]._style) for c in k}
    head = {c: copy(bp[f"{c}31"]._style) for c in k}
    line = {c: copy(bp[f"{c}32"]._style) for c in k}
    blank = {c: copy(bp[f"{c}60"]._style) for c in k}
    heights = bp.row_dimensions[29].height, bp.row_dimensions[31].height
    headers = [bp[f"{c}31"].value for c in k]
    bp.unmerge_cells("A29:K29")
    for r in range(6, 53):
        for c in k:
            bp[f"{c}{r}"].value = None
            bp[f"{c}{r}"]._style = copy(blank[c])
        bp.row_dimensions[r].height = None
    bp["A1"] = "  BY PRODUCT · the 10 products carrying the most plant protein and the 10 carrying the most animal protein"
    bp["A3"] = "  The 10 products carrying the most plant protein"
    scope = [r for r in rows if r["W"] == "Yes" and (r["S"] + r["T"]) > 0]
    plant = sorted(scope, key=lambda r: -r["S"])[:10]
    animal = sorted(scope, key=lambda r: -r["T"])[:10]

    def product_rows(start: int, picks: list[dict]):
        for i, r in enumerate(picks):
            row, d = start + i, 2 + rows.index(r)
            for c in k:
                bp[f"{c}{row}"]._style = copy(line[c])
            bp[f"A{row}"], bp[f"B{row}"], bp[f"C{row}"], bp[f"D{row}"], bp[f"E{row}"] = r["A"], r["B"], r["C"], r["E"], r["F"]
            bp[f"F{row}"], bp[f"G{row}"], bp[f"H{row}"] = f"=Data!O{d}", f"=Data!Q{d}", f"=Data!L{d}"
            bp[f"I{row}"], bp[f"J{row}"] = f"=Data!S{d}/1000", f"=Data!T{d}/1000"
            bp[f"K{row}"] = f'=IF(I{row}+J{row}=0,"",I{row}/(I{row}+J{row}))'

    product_rows(6, plant)
    t2 = 6 + len(plant) + 2
    for c in k:
        bp[f"{c}{t2}"]._style = copy(title[c])
        bp[f"{c}{t2 + 2}"]._style = copy(head[c])
        bp[f"{c}{t2 + 2}"].value = headers[k.index(c)]
    bp[f"A{t2}"] = "  The 10 products carrying the most animal protein"
    bp.merge_cells(f"A{t2}:K{t2}")
    bp.row_dimensions[t2].height, bp.row_dimensions[t2 + 2].height = heights
    product_rows(t2 + 3, animal)

    # ---- no array formula of the template is left; no dash used as a separator
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, ArrayFormula):
                    raise SystemExit(f"array formula left in {ws.title}!{c.coordinate}")
                if isinstance(c.value, str):
                    c.value = nodash(c.value)
    wb.active = 0
    wb.save(xlsx)
    return rows, {"plant": [r["key"] for r in plant], "animal": [r["key"] for r in animal]}


# ------------------------------------------------------------ the figures Python expects
def expected(rows: list[dict]) -> dict[tuple[str, str], float]:
    S = lambda f: sum(r["S"] for r in rows if f(r))
    T = lambda f: sum(r["T"] for r in rows if f(r))
    AD = lambda f: sum(r["AD"] for r in rows if f(r))
    R = lambda f: sum(r["R"] for r in rows if f(r))
    prot = S(lambda r: True) + T(lambda r: True)
    e = {("Protein Tracker", "C3"): S(lambda r: True) / prot, ("Protein Tracker", "B15"): prot / 1000}
    for row, cls in ((11, "animal_core"), (12, "animal-plant-based composite"), (13, "plant_non_core"), (14, "plant_core")):
        t = S(lambda r: r["K"] == cls) + T(lambda r: r["K"] == cls)
        e[("Protein Tracker", f"B{row}")] = t / 1000
        e[("Protein Tracker", f"C{row}")] = t / prot
    for row, cls in ((46, "plant_core"), (47, "plant_non_core"), (48, "animal-plant-based composite"), (49, "animal_core")):
        e[("Protein Tracker", f"D{row}")] = S(lambda r: r["K"] == cls) / 1000
    fg1p = ("legumes", "nuts", "seeds", "meat_egg_seafood_alternatives", "tofu_tempeh_seitan")
    fg1a = ("red_meat", "poultry", "seafood", "eggs", "other_animal")
    p1, a1 = AD(lambda r: r["G"] in fg1p), AD(lambda r: r["G"] in fg1a)
    e[("WWF", "C43")] = p1 / (p1 + a1)
    p2, a2 = AD(lambda r: r["G"] == "dairy_alternative_plant"), AD(lambda r: r["G"] == "dairy_animal")
    e[("WWF", "C46")] = p2 / (p2 + a2)
    pd = AD(lambda r: r["H"] == "plant_based" and r["I"] == "No")
    ad = AD(lambda r: r["H"] == "animal_based" and r["I"] == "No")
    e[("WWF", "C49")] = pd / (pd + ad)
    whole, comp = AD(lambda r: r["I"] == "No"), AD(lambda r: r["I"] == "Yes")
    e[("WWF", "C54")] = comp / (whole + comp)
    e[("WWF", "B79")] = R(lambda r: r["F"].startswith("FG")) / 1000
    return e


def write_csv(rows: list[dict], csv_path: Path) -> None:
    wb = load_workbook(TEMPLATE, read_only=True)
    header = [c.value for c in next(wb["Data"].iter_rows(min_row=1, max_row=1))]
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for r in rows:
            w.writerow(["" if r[c] is None else (round(r[c], 4) if isinstance(r[c], float) else r[c]) for c in cols("A", "AD")])


def verify(rows: list[dict], xlsx: Path) -> tuple[list[str], int]:
    soffice = shutil.which("soffice")
    if not soffice:
        return ["LibreOffice is needed to verify the workbook"], 0
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([soffice, "--headless", "--calc", "--convert-to", "xlsx", "--outdir", tmp, str(xlsx)],
                       check=True, capture_output=True, timeout=300)
        got = load_workbook(Path(tmp) / xlsx.name, data_only=True)
    written = load_workbook(xlsx)
    n_formulas = sum(1 for s in written.worksheets for row in s.iter_rows() for c in row
                     if isinstance(c.value, str) and c.value.startswith("="))
    errors = []
    for (sheet, cell), want in expected(rows).items():
        v = got[sheet][cell].value
        if not (isinstance(v, (int, float)) and abs(v - want) <= 1e-6 * max(1, abs(want))):
            errors.append(f"{sheet}!{cell}: workbook {v!r} vs python {want!r}")
    bad = [f"{s.title}!{c.coordinate}" for s in got.worksheets for row in s.iter_rows() for c in row
           if isinstance(c.value, str) and c.value.startswith("#")]
    if bad:
        errors.append(f"{len(bad)} cells evaluate to an error, e.g. {bad[:8]}")
    for i, r in enumerate(rows):  # each volume reaches its row of the Data tab
        if got["Data"][f"Q{2 + i}"].value != r["Q"]:
            errors.append(f"Data!Q{2 + i}: volume {got['Data'][f'Q{2 + i}'].value!r} vs {r['Q']}")
    want = sum(r["S"] + r["T"] for r in rows) / 1000
    for sheet, first in (("By department", 4), ("By brand", 4), ("By category", 28)):  # the lists add up to the whole
        total = sum(got[sheet][f"C{r}"].value or 0 for r in range(first, first + 40) if got[sheet][f"A{r}"].value)
        if abs(total - want) > 1e-6:
            errors.append(f"{sheet}: protein adds up to {total} vs {want}")
    dashes = [f"{s.title}!{c.coordinate}" for s in written.worksheets for row in s.iter_rows() for c in row
              if isinstance(c.value, str) and not c.value.startswith("=") and re.search("[\u2013\u2014\u2212]| - ", c.value)]
    if dashes:
        errors.append(f"dash used as a separator in {dashes[:8]}")
    print(f"  recalculated with LibreOffice: {n_formulas} formulas, no error cell, key figures compared with Python")
    return errors, n_formulas


def main() -> int:
    cat = json.loads(SRC.read_text())
    for old in list(OUT.glob("*.xlsx")) + list(OUT.glob("*.csv")):
        old.unlink()                                           # files of an earlier layout
    failed, n_formulas, ratios = False, 0, {}
    for variant in VARIANTS:
        out = OUT / variant
        out.mkdir(parents=True, exist_ok=True)
        xlsx, csv_path = out / XLSX_NAME, out / CSV_NAME
        rows, _ = build(cat, variant, xlsx)
        write_csv(rows, csv_path)
        errors, n_formulas = verify(rows, xlsx)
        e = expected(rows)
        ratios[variant] = {"fg1": e[("WWF", "C43")], "fg2": e[("WWF", "C46")], "diet": e[("WWF", "C49")], "pt": e[("Protein Tracker", "C3")]}
        print(f"  {variant}: WWF FG1 {e[('WWF', 'C43')]:.1%} · FG2 {e[('WWF', 'C46')]:.1%} · whole diet {e[('WWF', 'C49')]:.1%} · "
              f"Protein Tracker {e[('Protein Tracker', 'C3')]:.1%} · {xlsx.stat().st_size // 1024} KB")
        if errors:
            failed = True
            print("REFUSED:", *errors[:30], sep="\n  ")
    # the app's log announces the formula count; the PDF builder checks its ratios against these
    (ROOT / "src" / "data" / "deliverables.json").write_text(json.dumps({"formulas": n_formulas, "ratios": ratios}, indent=1) + "\n")
    print(f"  -> public/downloads/<variant>/{XLSX_NAME} and {CSV_NAME}, {len(VARIANTS)} variants, {n_formulas} formulas each")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
