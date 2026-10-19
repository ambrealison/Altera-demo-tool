"""Build the workbook and the line-level file the demo offers at its last step.

    python3 scripts/build_workbook.py

Reads src/data/catalogue.json (the 30 products of the demo catalogue and every result the
engine shows) and writes:
    public/downloads/HarbourMarket_Protein_Ratio_DEMO.xlsx   formula-driven workbook, 8 tabs
    public/downloads/HarbourMarket_products_DEMO.csv         line-level file, in-scope products

Every figure in the workbook is a formula over the Data tab, whose only input is the volume
column. openpyxl writes formulas without evaluating them, so each formula cell is registered
with the value Python expects; LibreOffice then recalculates the workbook and every one of
those cells is compared. The script refuses to finish on any difference.
"""
from __future__ import annotations

import csv
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, Reference, Series
from openpyxl.drawing.image import Image
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.hyperlink import Hyperlink

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "catalogue.json"
ASSETS = ROOT / "scripts" / "assets"
OUT = ROOT / "public" / "downloads"
XLSX = OUT / "HarbourMarket_Protein_Ratio_DEMO.xlsx"
CSV = OUT / "HarbourMarket_products_DEMO.csv"

# ------------------------------------------------------------ house style
NAVY, GREEN, ORANGE, GREY = "1F3864", "375623", "C55A11", "7F7F7F"
ARIAL = Font(name="Arial", size=10)
BOLD = Font(name="Arial", size=10, bold=True)
NOTE = Font(name="Arial", size=10, color="404040")
SMALL = Font(name="Arial", size=9, italic=True, color=GREY)
NAVY_B = Font(name="Arial", size=11, bold=True, color=NAVY)
WHITE_B = Font(name="Arial", size=11, bold=True, color="FFFFFF")
KPI = Font(name="Arial", size=24, bold=True, color=GREEN)
WARN = Font(name="Arial", size=10, bold=True, color="C00000")
HEAD_FILL = PatternFill("solid", fgColor="F2F2F2")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")
OUT_FILL = PatternFill("solid", fgColor="F7F7F7")
HEAD_BORDER = Border(bottom=Side(style="medium", color=NAVY))
INPUT_BORDER = Border(bottom=Side(style="thin", color="BF8F00"))
WRAP_TOP = Alignment(wrap_text=True, vertical="top")
T, PCT, INT, G = '#,##0.0', "0.0%", "#,##0", "0.0"
BANNER = ("DEMO · Harbour Market, its departments and its volumes are fictitious. "
          "The products and their nutrition values are real, from Open Food Facts (ODbL).")

PT_ORDER = ["animal_core", "composite", "plant_non_core", "plant_core"]
PT_LABEL = {"animal_core": "Animal core", "composite": "Composite", "plant_non_core": "Plant-based non-core", "plant_core": "Plant-based core"}
PT_FILL = {"animal_core": "C00000", "composite": "D99694", "plant_non_core": "A9D3AB", "plant_core": "375623"}
FG_NAME = {"FG1": "Protein-rich foods", "FG2": "Dairy", "FG3": "Fats", "FG4": "Fruit and vegetables",
           "FG5": "Grains", "FG6": "Tubers and starchy vegetables", "FG7": "Other foods"}
SUB = {"red_meat": "red meat", "poultry": "poultry", "fish_shellfish": "fish and shellfish", "eggs": "eggs", "dairy": "dairy",
       "animal_fat": "animal fat", "plant_fat": "plant fat", "pulses": "pulses", "alternative_products": "meat alternatives",
       "tofu_tempeh_seitan": "tofu, tempeh, seitan", "nuts": "nuts", "dairy_alternatives": "dairy alternatives",
       "refined_grain": "refined grain", "whole_grain": "whole grain"}
CAT = {"meat_based": "Meat-based", "seafood_based": "Seafood-based", "vegetarian": "Vegetarian", "vegan": "Vegan"}
ROUTE = {"reference": "Altera reference base", "segment": "Unanimous segment", "model": "Language model"}
PSRC = {"declared": "Declared by the retailer, checked", "reference": "Altera reference base", "off": "Open Food Facts",
        "nevo": "NEVO", "ciqual": "CIQUAL", "median": "Median of the segment"}
SPLIT = {"one_side": "Single origin", "ingredients": "Ingredient list", "nevo": "NEVO table", "convention": "50/50 convention", "zero": "No protein"}
EXCL = {"non_food": "Non-food: out of both scopes", "alcohol": "Appendix A: alcohol, WWF only", "beverage": "Appendix A: soft drink, WWF only"}
PHD = {"FG1": 0.60, "diet": 0.74}

# Data tab: (key, header, width, format). Keys from "mass" on are formulas.
DATA_COLS = [
    ("ean", "EAN 13", 15, "@"), ("label", "Till label", 30, None), ("name", "Product", 34, None), ("brand", "Brand", 14, None),
    ("dept", "Department", 13, None), ("segment", "Segment", 20, None),
    ("in_wwf", "WWF scope", 10, None), ("in_pt", "Protein Tracker scope", 10, None), ("scope_note", "Scope note", 26, None),
    ("struct", "WWF structure", 11, None), ("fg", "WWF food group", 9, None), ("sub", "WWF sub-group", 17, None),
    ("origin", "WWF origin", 9, None), ("cat", "WWF composite category", 13, None), ("pt", "Protein Tracker class", 18, None),
    ("route", "Classified by", 18, None), ("conf", "Model confidence", 10, "0.00"),
    ("units", "Units sold, 12 months (INPUT)", 13, INT), ("weight", "Net weight (kg)", 10, "0.000"), ("weight_src", "Weight from", 12, None),
    ("prot", "Protein (g/100 g)", 10, G), ("prot_src", "Protein value from", 24, None),
    ("plant", "Plant share of protein", 10, "0%"), ("split", "Split measured by", 15, None), ("level", "Data level", 7, None),
    ("dairy", "Dairy factor", 7, "0"),
    ("mass", "Mass sold, PT scope (t)", 11, T), ("prot_t", "Protein (t)", 10, "#,##0.00"), ("plant_t", "Plant protein (t)", 10, "#,##0.00"),
    ("animal_t", "Animal protein (t)", 10, "#,##0.00"), ("wwf_t", "Mass sold, WWF scope (t)", 11, T), ("wwf_eq", "WWF tonnes, dairy equivalents", 12, T),
]
DC = {k: chr(65 + i) if i < 26 else "A" + chr(65 + i - 26) for i, (k, *_rest) in enumerate(DATA_COLS)}
D0 = 6  # first data row


def flat(p: dict) -> dict:
    raw, res = p["raw"], p["res"]
    w = res["wwf"] or {}
    r = {
        "ean": res["ean"], "label": raw["till_label"], "name": raw["product_name"], "brand": raw["brand"],
        "dept": raw["department"], "segment": raw["segment"],
        "in_pt": "yes" if res["inPt"] else "no", "in_wwf": "yes" if res["inWwf"] else "no",
        "scope_note": EXCL.get(res.get("excl") or "", ""),
        "struct": w.get("struct") or "", "fg": w.get("fg") or "", "sub": SUB.get(w.get("sub") or "", ""),
        "origin": w.get("origin") or "", "cat": CAT.get(w.get("cat") or "", ""),
        "pt": PT_LABEL.get(res["pt"] or "", ""), "_pt": res["pt"] or "",
        "route": ROUTE[res["route"]] if res["inPt"] else "", "conf": res["conf"] if res["route"] == "model" else None,
        "units": int(raw["units_sold_12m"]), "weight": res["weightKg"] or None,
        "weight_src": {"declared": "Retailer file", "label": "Till label"}.get(res["weightSrc"], res["weightSrc"]) if res["inPt"] else "",
        "prot": res["prot"] if res["inPt"] else None, "prot_src": PSRC[res["protSrc"]] if res["inPt"] else "",
        "plant": res["plant"] if res["inPt"] else None, "split": SPLIT[res["split"]] if res["inPt"] else "",
        "level": res["level"] or "", "dairy": res["dairy"],
    }
    on, wwf = res["inPt"], res["inWwf"]
    kg = r["units"] * (r["weight"] or 0)
    r["mass"] = kg / 1000 if on else 0.0
    r["prot_t"] = r["mass"] * (r["prot"] or 0) / 100
    r["plant_t"] = r["prot_t"] * (r["plant"] or 0)
    r["animal_t"] = r["prot_t"] - r["plant_t"]
    r["wwf_t"] = kg / 1000 if wwf else 0.0
    r["wwf_eq"] = r["wwf_t"] * r["dairy"]
    return r


class Book:
    """The workbook plus, for every formula written, the value Python expects of it."""

    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.n = len(rows)
        self.wb = Workbook()
        self.expect: list[tuple[str, str, float]] = []

    def rng(self, key: str) -> str:
        c = DC[key]
        return f"Data!${c}${D0}:${c}${D0 + self.n - 1}"

    def sumifs(self, val: str, **crit: str) -> tuple[str, float]:
        parts = ",".join(f'{self.rng(k)},"{v}"' for k, v in crit.items())
        f = f"SUMIFS({self.rng(val)},{parts})" if crit else f"SUM({self.rng(val)})"
        v = sum(r[val] for r in self.rows if all(r[k] == x for k, x in crit.items()))
        return f, v

    def put(self, ws, cell: str, formula: str, value, fmt: str | None = None, font: Font = ARIAL):
        c = ws[cell]
        c.value = formula if formula.startswith("=") else "=" + formula
        c.font = font
        if fmt:
            c.number_format = fmt
        self.expect.append((ws.title, cell, value))
        return c

    def val(self, sheet: str, cell: str):
        return next(v for t, c, v in self.expect if t == sheet and c == cell)


# ------------------------------------------------------------ layout helpers
def text(ws, cell: str, value, font: Font = ARIAL, merge: str | None = None, align: Alignment | None = None):
    c = ws[cell]
    c.value = value
    c.font = font
    if merge:
        ws.merge_cells(f"{cell}:{merge}")
    if align:
        c.alignment = align
    return c


def bar(ws, row: int, label: str, fill: str = GREEN, last: str = "G", height: float = 25.5):
    for col in range(1, ws[f"{last}1"].column + 1):
        ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor=fill)
    text(ws, f"A{row}", "  " + label, WHITE_B, merge=f"{last}{row}", align=Alignment(vertical="center"))
    ws.row_dimensions[row].height = height


def header(ws, row: int, labels: list[str], col: int = 1, height: float = 30):
    for i, h in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=h)
        c.font, c.fill, c.border = BOLD, HEAD_FILL, HEAD_BORDER
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="left" if i == 0 else "center")
    ws.row_dimensions[row].height = height


def widths(ws, spec: dict[str, float]):
    for col, w in spec.items():
        ws.column_dimensions[col].width = w


def top(ws, title: str):
    ws.sheet_view.showGridLines = False
    text(ws, "A1", title, Font(name="Arial", size=16, bold=True, color=NAVY))
    text(ws, "A2", BANNER, SMALL)
    ws.row_dimensions[1].height = 26


def colour(s: Series, rgb: str):
    s.graphicalProperties.solidFill = rgb
    s.graphicalProperties.line.solidFill = rgb


# ------------------------------------------------------------ Welcome
def welcome(bk: Book):
    ws = bk.wb.active
    ws.title = "Welcome"
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 26, "B": 22, "C": 22, "D": 22, "E": 22, "F": 4})
    logo = Image(str(ASSETS / "altera_wordmark.png"))
    logo.width, logo.height = 166, 67
    ws.add_image(logo, "A1")
    hm = Image(str(ASSETS / "harbour_market_logo.png"))
    hm.width, hm.height = 84, 67
    ws.add_image(hm, "B1")
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 30
    text(ws, "C1", "PROTEIN RATIO\nHarbour Market catalogue · demo", Font(name="Arial", size=18, bold=True, color=NAVY),
         merge="E2", align=Alignment(wrap_text=True, vertical="center"))
    text(ws, "A3", BANNER, WARN, merge="E3", align=Alignment(wrap_text=True, vertical="center"))
    ws.row_dimensions[3].height = 28

    bar(ws, 5, "THE RATIOS · WWF first, then Protein Tracker", last="E")
    header(ws, 6, ["Method", "Ratio", "Value", "Planetary Health Diet", "Unit"])
    kpis = [
        ("WWF", "Plant share of protein-rich foods (FG1)", "WWF!E18", PHD["FG1"], "tonnes of product"),
        ("WWF", "Plant share of dairy (FG2)", "WWF!E20", None, "tonnes, dairy equivalents"),
        ("WWF", "Plant share of the whole diet", "WWF!E19", PHD["diet"], "tonnes of product"),
        ("Protein Tracker", "Plant share of all protein sold", "'Protein Tracker'!B14", None, "tonnes of protein"),
    ]
    for i, (m, name, ref, phd, unit) in enumerate(kpis, start=7):
        text(ws, f"A{i}", m, BOLD, align=Alignment(vertical="center"))
        text(ws, f"B{i}", name, ARIAL, align=Alignment(wrap_text=True, vertical="center"))
        sheet, cell = ref.split("!")
        bk.put(ws, f"C{i}", ref, bk.val(sheet.strip("'"), cell), PCT, Font(name="Arial", size=16, bold=True, color=GREEN))
        c = ws[f"D{i}"]
        c.value, c.number_format, c.font = phd, "0%", ARIAL
        text(ws, f"E{i}", unit, NOTE, align=Alignment(vertical="center"))
        ws.row_dimensions[i].height = 30
        for col in "CD":
            ws[f"{col}{i}"].alignment = Alignment(horizontal="center", vertical="center")

    para = [
        (12, "What this workbook contains",
         "The share of the protein Harbour Market puts on the market that is of plant origin, by the WWF Planet-Based Diets "
         "methodology first, then by Protein Tracker. The two are calculated separately and never merged."),
        (14, "How to use it",
         "The only input is the yellow column of the Data tab: units sold over twelve months, as in your file. "
         "Type other volumes there and every tab recalculates."),
        (16, "Where the values come from",
         "Protein contents: the values you declared once checked, then the Altera reference base, Open Food Facts and NEVO, "
         "plus the national table (CIQUAL in France). Every value carries its source on the Data tab."),
    ]
    for row, k, v in para:
        text(ws, f"A{row}", k, NAVY_B, align=WRAP_TOP)
        text(ws, f"B{row}", v, ARIAL, merge=f"E{row}", align=WRAP_TOP)
        ws.row_dimensions[row].height = 42

    text(ws, "A19", "THE TABS", NAVY_B)
    tabs = [
        ("WWF", "the seven food groups in tonnes of product, dairy in dairy equivalents, composites apart"),
        ("Protein Tracker", "the ratio in tonnes of protein, the four classes, the data levels"),
        ("By department", "protein sold and plant share, department by department"),
        ("Scope", "what is in each scope, what is out and why"),
        ("Corrections", "the anomalies found in the file and how each was resolved"),
        ("Checks", "the identities the workbook verifies on itself"),
        ("Data", "one row per product: classes, contents, split, data level and the source of every value"),
    ]
    for i, (k, v) in enumerate(tabs, start=20):
        text(ws, f"A{i}", k, Font(name="Arial", size=10, bold=True, color=NAVY, underline="single"))
        ws[f"A{i}"].hyperlink = Hyperlink(ref=f"A{i}", location=f"'{k}'!A1", display=k)
        text(ws, f"B{i}", v, ARIAL, merge=f"E{i}")

    text(ws, "A28", "ACCURACY", NAVY_B, align=WRAP_TOP)
    text(ws, "B28",
         "On a real engagement, accuracy is measured on your own catalogue, one rate per field, on a control sample sealed "
         "before review: 500 rows drawn at random, the 500 products weighing most in tonnes of protein and the 3 best sellers "
         "of every category. Every row of the sample is reviewed by hand. This demo catalogue shows no accuracy figure.",
         ARIAL, merge="E28", align=WRAP_TOP)
    ws.row_dimensions[28].height = 66


# ------------------------------------------------------------ WWF
def wwf(bk: Book):
    ws = bk.wb.create_sheet("WWF")
    top(ws, "WWF Planet-Based Diets · plant share in tonnes of product")
    widths(ws, {"A": 34, "B": 15, "C": 15, "D": 15, "E": 15, "F": 15, "G": 4})
    text(ws, "A3", "Whole products by food group and origin. Dairy (FG2) counts in dairy equivalents: cheese ×10. "
         "Composites are reported apart, by category. Appendix A exclusions are listed on the Scope tab.",
         NOTE, merge="F3", align=WRAP_TOP)
    ws.row_dimensions[3].height = 30
    bar(ws, 5, "WHOLE PRODUCTS · by food group", last="F")
    header(ws, 6, ["Food group", "Plant (t)", "Animal (t)", "Total (t)", "Plant share", "Planetary Health Diet"])
    rows = {}
    for i, fg in enumerate(FG_NAME, start=7):
        text(ws, f"A{i}", f"{fg} · {FG_NAME[fg]}", ARIAL)
        fp, vp = bk.sumifs("wwf_eq", struct="whole", fg=fg, origin="plant")
        fa, va = bk.sumifs("wwf_eq", struct="whole", fg=fg, origin="animal")
        bk.put(ws, f"B{i}", fp, vp, T)
        bk.put(ws, f"C{i}", fa, va, T)
        bk.put(ws, f"D{i}", f"B{i}+C{i}", vp + va, T)
        bk.put(ws, f"E{i}", f"IFERROR(B{i}/D{i},0)", vp / (vp + va) if vp + va else 0, PCT)
        rows[fg] = (vp, va)
    tp, ta = sum(v[0] for v in rows.values()), sum(v[1] for v in rows.values())
    text(ws, "A14", "Total, whole products", BOLD)
    bk.put(ws, "B14", "SUM(B7:B13)", tp, T, BOLD)
    bk.put(ws, "C14", "SUM(C7:C13)", ta, T, BOLD)
    bk.put(ws, "D14", "SUM(D7:D13)", tp + ta, T, BOLD)
    ws["F7"].value, ws["F7"].number_format = PHD["FG1"], "0%"

    bar(ws, 16, "THE THREE WWF RATIOS", last="F")
    header(ws, 17, ["Ratio", "Plant (t)", "Total (t)", "", "Plant share", "Planetary Health Diet"])
    ratio_rows = [
        (18, "Protein-rich foods (FG1)", "B7", "D7", rows["FG1"], PHD["FG1"]),
        (19, "Whole diet (FG1 to FG7)", "B14", "D14", (tp, ta), PHD["diet"]),
        (20, "Dairy (FG2)", "B8", "D8", rows["FG2"], None),
    ]
    for r, name, pc, tc, (vp, va), phd in ratio_rows:
        text(ws, f"A{r}", name, BOLD)
        bk.put(ws, f"B{r}", pc, vp, T)
        bk.put(ws, f"C{r}", tc, vp + va, T)
        bk.put(ws, f"E{r}", f"IFERROR(B{r}/C{r},0)", vp / (vp + va) if vp + va else 0, PCT, Font(name="Arial", size=12, bold=True, color=GREEN))
        if phd is not None:
            ws[f"F{r}"].value, ws[f"F{r}"].number_format = phd, "0%"

    bar(ws, 22, "COMPOSITES · reported apart, by category", fill=NAVY, last="F")
    header(ws, 23, ["Category", "Tonnes", "Share of composites", "", "", ""])
    whole_t = sum(r["wwf_t"] for r in bk.rows if r["struct"] == "whole")
    comp = {}
    for i, (k, name) in enumerate(CAT.items(), start=24):
        text(ws, f"A{i}", name, ARIAL)
        f, v = bk.sumifs("wwf_t", struct="composite", cat=name)
        bk.put(ws, f"B{i}", f, v, T)
        comp[name] = v
    ct = sum(comp.values())
    for i, name in enumerate(CAT.values(), start=24):
        bk.put(ws, f"C{i}", f"IFERROR(B{i}/$B$28,0)", comp[name] / ct if ct else 0, PCT)
    text(ws, "A28", "Total, composites", BOLD)
    bk.put(ws, "B28", "SUM(B24:B27)", ct, T, BOLD)
    text(ws, "A29", "Composites, share of all WWF tonnes", ARIAL)
    fw, vw = bk.sumifs("wwf_t", struct="whole")
    bk.put(ws, "B29", f"IFERROR(B28/(B28+{fw}),0)", ct / (ct + vw), PCT)

    ch = BarChart()
    ch.type, ch.grouping, ch.overlap = "bar", "percentStacked", 100
    ch.title = "Plant and animal, by food group"
    ch.width, ch.height = 15, 7.5
    for col, rgb in (("B", GREEN), ("C", ORANGE)):
        s = Series(Reference(ws, range_string=f"WWF!${col}$7:${col}$13"), title=ws[f"{col}6"].value)
        colour(s, rgb)
        ch.series.append(s)
    ch.set_categories(Reference(ws, range_string="WWF!$A$7:$A$13"))
    ws.add_chart(ch, "H5")
    return whole_t


# ------------------------------------------------------------ Protein Tracker
def protein_tracker(bk: Book):
    ws = bk.wb.create_sheet("Protein Tracker")
    top(ws, "Protein Tracker · plant share in tonnes of protein")
    widths(ws, {"A": 30, "B": 15, "C": 15, "D": 15, "E": 15, "F": 15})
    text(ws, "A3", "Every product in scope, food only: tonnes sold × protein per 100 g, then split between plant and animal "
         "origin. Single-origin products are 100% one side; mixed products are split from their ingredient list or the NEVO table.",
         NOTE, merge="F3", align=WRAP_TOP)
    ws.row_dimensions[3].height = 30
    bar(ws, 5, "BY CLASS", last="F")
    header(ws, 6, ["Class", "Protein (t)", "Plant (t)", "Animal (t)", "Plant share", "Share of protein"])
    vals = {}
    for i, c in enumerate(PT_ORDER, start=7):
        text(ws, f"A{i}", PT_LABEL[c], ARIAL)
        fp, vp = bk.sumifs("prot_t", pt=PT_LABEL[c])
        fl, vl = bk.sumifs("plant_t", pt=PT_LABEL[c])
        fa, va = bk.sumifs("animal_t", pt=PT_LABEL[c])
        bk.put(ws, f"B{i}", fp, vp, "#,##0.00")
        bk.put(ws, f"C{i}", fl, vl, "#,##0.00")
        bk.put(ws, f"D{i}", fa, va, "#,##0.00")
        bk.put(ws, f"E{i}", f"IFERROR(C{i}/B{i},0)", vl / vp if vp else 0, PCT)
        vals[c] = (vp, vl, va)
    tp = sum(v[0] for v in vals.values())
    tl = sum(v[1] for v in vals.values())
    ta = sum(v[2] for v in vals.values())
    for i, c in enumerate(PT_ORDER, start=7):
        bk.put(ws, f"F{i}", f"IFERROR(B{i}/$B$11,0)", vals[c][0] / tp, PCT)
    text(ws, "A11", "Total", BOLD)
    bk.put(ws, "B11", "SUM(B7:B10)", tp, "#,##0.00", BOLD)
    bk.put(ws, "C11", "SUM(C7:C10)", tl, "#,##0.00", BOLD)
    bk.put(ws, "D11", "SUM(D7:D10)", ta, "#,##0.00", BOLD)
    bk.put(ws, "F11", "SUM(F7:F10)", 1.0, PCT, BOLD)

    bar(ws, 13, "THE RATIO", last="F")
    text(ws, "A14", "Plant share of all protein sold", BOLD)
    bk.put(ws, "B14", "IFERROR(C11/B11,0)", tl / tp, PCT, KPI)
    ws.row_dimensions[14].height = 36
    text(ws, "A15", "Animal share of all protein sold", ARIAL)
    bk.put(ws, "B15", "IFERROR(D11/B11,0)", ta / tp, PCT)

    bar(ws, 17, "DATA LEVELS", fill=NAVY, last="F")
    header(ws, 18, ["Level", "Protein (t)", "Share of protein", "", "", ""])
    for i, (lv, note) in enumerate((("A", "measured: single origin, ingredient list or NEVO"), ("B", "by convention, 50/50")), start=19):
        text(ws, f"A{i}", f"Level {lv} · {note}", ARIAL)
        f, v = bk.sumifs("prot_t", level=lv)
        bk.put(ws, f"B{i}", f, v, "#,##0.00")
        bk.put(ws, f"C{i}", f"IFERROR(B{i}/$B$11,0)", v / tp, PCT)

    ch = BarChart()
    ch.type, ch.grouping, ch.overlap = "bar", "stacked", 100
    ch.title = "Protein by class (t)"
    ch.width, ch.height = 15, 7.5
    for col, rgb in (("C", GREEN), ("D", ORANGE)):
        s = Series(Reference(ws, range_string=f"'Protein Tracker'!${col}$7:${col}$10"), title=ws[f"{col}6"].value)
        colour(s, rgb)
        ch.series.append(s)
    ch.set_categories(Reference(ws, range_string="'Protein Tracker'!$A$7:$A$10"))
    ws.add_chart(ch, "H5")
    return tl / tp


# ------------------------------------------------------------ By department
def by_department(bk: Book):
    ws = bk.wb.create_sheet("By department")
    top(ws, "Protein Tracker · by department")
    widths(ws, {"A": 22, "B": 15, "C": 15, "D": 15, "E": 15, "F": 15})
    depts = {}
    for r in bk.rows:
        if r["in_pt"] == "yes":
            depts[r["dept"]] = depts.get(r["dept"], 0) + r["prot_t"]
    order = sorted(depts, key=lambda d: -depts[d])
    header(ws, 4, ["Department", "Mass sold (t)", "Protein (t)", "Plant protein (t)", "Plant share", "Share of protein"])
    tp = sum(depts.values())
    for i, d in enumerate(order, start=5):
        text(ws, f"A{i}", d, ARIAL)
        fm, vm = bk.sumifs("mass", dept=d)
        fp, vp = bk.sumifs("prot_t", dept=d)
        fl, vl = bk.sumifs("plant_t", dept=d)
        bk.put(ws, f"B{i}", fm, vm, T)
        bk.put(ws, f"C{i}", fp, vp, "#,##0.00")
        bk.put(ws, f"D{i}", fl, vl, "#,##0.00")
        bk.put(ws, f"E{i}", f"IFERROR(D{i}/C{i},0)", vl / vp if vp else 0, PCT)
        bk.put(ws, f"F{i}", f"IFERROR(C{i}/$C${5 + len(order)},0)", vp / tp, PCT)
    t = 5 + len(order)
    text(ws, f"A{t}", "Total", BOLD)
    for col, key in (("B", "mass"), ("C", "prot_t"), ("D", "plant_t")):
        bk.put(ws, f"{col}{t}", f"SUM({col}5:{col}{t - 1})", sum(r[key] for r in bk.rows), "#,##0.00" if col != "B" else T, BOLD)
    bk.put(ws, f"E{t}", f"IFERROR(D{t}/C{t},0)", sum(r["plant_t"] for r in bk.rows) / tp, PCT, BOLD)
    text(ws, f"A{t + 2}", "Departments are Harbour Market's own, as in the file received. Out-of-scope products carry no protein here.", SMALL)
    return len(order)


# ------------------------------------------------------------ Scope
def scope(bk: Book):
    ws = bk.wb.create_sheet("Scope")
    top(ws, "Scope · what each methodology covers")
    widths(ws, {"A": 34, "B": 14, "C": 14, "D": 40})
    header(ws, 4, ["", "WWF", "Protein Tracker", ""])
    text(ws, "A5", "Products received", ARIAL)
    bk.put(ws, "B5", f"COUNTA({bk.rng('ean')})", bk.n, INT)
    bk.put(ws, "C5", f"COUNTA({bk.rng('ean')})", bk.n, INT)
    text(ws, "A6", "In scope", BOLD)
    npt = sum(1 for r in bk.rows if r["in_pt"] == "yes")
    nww = sum(1 for r in bk.rows if r["in_wwf"] == "yes")
    bk.put(ws, "B6", f'COUNTIF({bk.rng("in_wwf")},"yes")', nww, INT, BOLD)
    bk.put(ws, "C6", f'COUNTIF({bk.rng("in_pt")},"yes")', npt, INT, BOLD)
    text(ws, "A7", "Out of scope", ARIAL)
    bk.put(ws, "B7", "B5-B6", bk.n - nww, INT)
    bk.put(ws, "C7", "C5-C6", bk.n - npt, INT)

    bar(ws, 9, "OUT OF SCOPE, PRODUCT BY PRODUCT", fill=NAVY, last="D")
    header(ws, 10, ["Product", "WWF", "Protein Tracker", "Reason"])
    i = 11
    for r in bk.rows:
        if r["in_pt"] == "yes" and r["in_wwf"] == "yes":
            continue
        text(ws, f"A{i}", r["label"], ARIAL)
        text(ws, f"B{i}", "in" if r["in_wwf"] == "yes" else "out", ARIAL, align=Alignment(horizontal="center"))
        text(ws, f"C{i}", "in" if r["in_pt"] == "yes" else "out", ARIAL, align=Alignment(horizontal="center"))
        text(ws, f"D{i}", r["scope_note"], ARIAL)
        i += 1
    text(ws, f"A{i + 1}", "WWF Appendix A excludes soft drinks and alcohol from the WWF ratios; Protein Tracker keeps every food "
         "and drink. Non-food is out of both.", NOTE, merge=f"D{i + 1}", align=WRAP_TOP)
    ws.row_dimensions[i + 1].height = 30


# ------------------------------------------------------------ Corrections
def corrections(bk: Book, anomalies: list[dict], products: list[dict]):
    ws = bk.wb.create_sheet("Corrections")
    top(ws, "Corrections · anomalies found in the file")
    widths(ws, {"A": 32, "B": 14, "C": 16, "D": 16, "E": 50, "F": 16})
    header(ws, 4, ["Product", "Field", "As received", "Used", "How it was found", "Decision"])
    how = {
        "ean": ("Barcode", "Fails the GS1 check digit; matched by name in the Altera reference base, the last digit was mistyped."),
        "weight": ("Net weight (kg)", "Missing in the file; read from the till label."),
        "protein": ("Protein (g/100 g)", "Declared energy does not match 4 × protein + 9 × fat + 4 × carbohydrate: a per-pack figure "
                    "entered per 100 g. Value from Open Food Facts, by barcode."),
    }
    for i, a in enumerate(sorted(anomalies, key=lambda a: a["row"]), start=5):
        p = products[a["row"]]
        field, note = how[a["id"]]
        text(ws, f"A{i}", p["raw"]["till_label"], ARIAL)
        text(ws, f"B{i}", field, ARIAL)
        text(ws, f"C{i}", a["from"] or "(empty)", ARIAL)
        text(ws, f"D{i}", a["to"], BOLD)
        text(ws, f"E{i}", note, ARIAL, align=WRAP_TOP)
        text(ws, f"F{i}", "Accepted", Font(name="Arial", size=10, bold=True, color=GREEN))
        for col in "ABCDF":
            ws[f"{col}{i}"].alignment = Alignment(vertical="top", wrap_text=col == "A")
        ws[f"C{i}"].number_format = ws[f"D{i}"].number_format = "@"
        ws.row_dimensions[i].height = 42


# ------------------------------------------------------------ Checks
def checks(bk: Book):
    ws = bk.wb.create_sheet("Checks")
    top(ws, "Checks · identities the workbook verifies on itself")
    widths(ws, {"A": 60, "B": 16, "C": 16, "D": 12})
    header(ws, 4, ["Identity", "Left", "Right", "Result"])
    tp = sum(r["prot_t"] for r in bk.rows)
    tl = sum(r["plant_t"] for r in bk.rows)
    ta = sum(r["animal_t"] for r in bk.rows)
    wwf_whole = sum(r["wwf_eq"] for r in bk.rows if r["struct"] == "whole")
    wwf_comp = sum(r["wwf_t"] for r in bk.rows if r["struct"] == "composite")
    items = [
        ("Plant + animal protein = total protein (Protein Tracker)", "'Protein Tracker'!C11+'Protein Tracker'!D11", tl + ta, "'Protein Tracker'!B11", tp),
        ("Classes add up to the protein of the Data tab", "'Protein Tracker'!B11", tp, f"SUM({bk.rng('prot_t')})", tp),
        ("Departments add up to the protein of the Data tab", f"'By department'!C{5 + bk.n_dept}", tp, f"SUM({bk.rng('prot_t')})", tp),
        ("Food groups add up to the whole-product tonnes of the Data tab", "WWF!D14", wwf_whole, f'SUMIFS({bk.rng("wwf_eq")},{bk.rng("struct")},"whole")', wwf_whole),
        ("Composite categories add up to the composite tonnes of the Data tab", "WWF!B28", wwf_comp, f'SUMIFS({bk.rng("wwf_t")},{bk.rng("struct")},"composite")', wwf_comp),
        ("Data levels add up to the total protein", "'Protein Tracker'!B19+'Protein Tracker'!B20", tp, "'Protein Tracker'!B11", tp),
        ("No food group on a WWF composite", f'COUNTIFS({bk.rng("struct")},"composite",{bk.rng("fg")},"<>")', 0, "0", 0),
        ("Dairy factor ×10 on cheese only", f'COUNTIF({bk.rng("dairy")},10)', 1, f'COUNTIFS({bk.rng("dairy")},10,{bk.rng("segment")},"Soft cheese")', 1),
        ("Every in-scope product has a protein source", f'COUNTIFS({bk.rng("in_pt")},"yes",{bk.rng("prot_src")},"<>")', bk.npt, f'COUNTIF({bk.rng("in_pt")},"yes")', bk.npt),
    ]
    for i, (name, lf, lv, rf, rv) in enumerate(items, start=5):
        text(ws, f"A{i}", name, ARIAL)
        fmt = "#,##0.000" if isinstance(lv, float) else INT
        bk.put(ws, f"B{i}", lf, lv, fmt)
        bk.put(ws, f"C{i}", rf, rv, fmt)
        bk.put(ws, f"D{i}", f'IF(ABS(B{i}-C{i})<0.000001,1,0)', 1, '"OK";;"FAILED"', Font(name="Arial", size=10, bold=True, color=GREEN))
    t = 5 + len(items)
    text(ws, f"A{t}", "All checks", BOLD)
    bk.put(ws, f"D{t}", f"IF(SUM(D5:D{t - 1})={len(items)},1,0)", 1, '"OK";;"FAILED"', Font(name="Arial", size=11, bold=True, color=GREEN))


# ------------------------------------------------------------ Data
def data(bk: Book):
    ws = bk.wb.create_sheet("Data")
    top(ws, "Data · one row per product")
    text(ws, "A3", "Yellow column: the only input, units sold over twelve months. Grey columns: formulas. "
         "Every protein value carries its source.", NOTE)
    for i, (key, head, width, fmt) in enumerate(DATA_COLS):
        col = DC[key]
        ws.column_dimensions[col].width = width
    header(ws, 5, [h for _, h, _, _ in DATA_COLS], height=54)
    ws.freeze_panes = f"{DC['name']}{D0}"
    formulas = {
        "mass": lambda r: f'IF({DC["in_pt"]}{r}="yes",{DC["units"]}{r}*N({DC["weight"]}{r})/1000,0)',
        "prot_t": lambda r: f'{DC["mass"]}{r}*N({DC["prot"]}{r})/100',
        "plant_t": lambda r: f'{DC["prot_t"]}{r}*N({DC["plant"]}{r})',
        "animal_t": lambda r: f'{DC["prot_t"]}{r}-{DC["plant_t"]}{r}',
        "wwf_t": lambda r: f'IF({DC["in_wwf"]}{r}="yes",{DC["units"]}{r}*N({DC["weight"]}{r})/1000,0)',
        "wwf_eq": lambda r: f'{DC["wwf_t"]}{r}*{DC["dairy"]}{r}',
    }
    for i, r in enumerate(bk.rows):
        row = D0 + i
        for key, _, _, fmt in DATA_COLS:
            col = DC[key]
            if key in formulas:
                c = bk.put(ws, f"{col}{row}", formulas[key](row), r[key], fmt)
                c.fill = OUT_FILL
                continue
            c = ws[f"{col}{row}"]
            c.value = r[key] if r[key] != "" else None
            c.font = ARIAL
            if fmt:
                c.number_format = fmt
            if key == "units":
                c.fill, c.border = INPUT_FILL, INPUT_BORDER
    dv = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                        error="A volume is a whole number, zero or more.", showErrorMessage=True)
    ws.add_data_validation(dv)
    dv.add(f"{DC['units']}{D0}:{DC['units']}{D0 + bk.n - 1}")
    ws.auto_filter.ref = f"A5:{DC['wwf_eq']}{D0 + bk.n - 1}"


# ------------------------------------------------------------ build, write, check
def build(cat: dict) -> Book:
    products = cat["products"]
    rows = [flat(p) for p in products]
    bk = Book(rows)
    bk.npt = sum(1 for r in rows if r["in_pt"] == "yes")
    # the tabs are written in an order where every reference already exists, then reordered
    wwf(bk)
    pt = protein_tracker(bk)
    bk.n_dept = by_department(bk)
    scope(bk)
    corrections(bk, cat["anomalies"], products)
    checks(bk)
    data(bk)
    welcome_ws = bk.wb.active  # the default sheet, filled last: it reads the other tabs
    welcome(bk)
    order = ["Welcome", "WWF", "Protein Tracker", "By department", "Scope", "Corrections", "Checks", "Data"]
    bk.wb._sheets = [bk.wb[n] for n in order]
    bk.wb.active = 0
    for ws in bk.wb.worksheets:  # printable: one page wide, landscape
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
    assert welcome_ws.title == "Welcome" and len(bk.wb.sheetnames) == 8, bk.wb.sheetnames
    bk.pt = pt
    bk.wb.save(XLSX)
    return bk


def write_csv(bk: Book) -> None:
    cols = [("ean", "ean"), ("label", "till_label"), ("name", "product_name"), ("brand", "brand"), ("dept", "department"),
            ("segment", "segment"), ("units", "units_sold_12m"), ("weight", "net_weight_kg"), ("weight_src", "weight_from"),
            ("in_wwf", "wwf_scope"), ("struct", "wwf_structure"), ("fg", "wwf_food_group"), ("sub", "wwf_sub_group"),
            ("origin", "wwf_origin"), ("cat", "wwf_composite_category"), ("pt", "protein_tracker_class"),
            ("route", "classified_by"), ("conf", "model_confidence"), ("prot", "protein_g_100g"), ("prot_src", "protein_from"),
            ("plant", "plant_share_of_protein"), ("split", "split_measured_by"), ("level", "data_level"),
            ("mass", "mass_sold_t"), ("prot_t", "protein_t"), ("plant_t", "plant_protein_t")]
    with CSV.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([h for _, h in cols])
        for r in bk.rows:
            if r["in_pt"] != "yes":
                continue
            w.writerow(["" if r[k] is None else (round(r[k], 4) if isinstance(r[k], float) else r[k]) for k, _ in cols])


def verify(bk: Book) -> list[str]:
    soffice = shutil.which("soffice")
    if not soffice:
        print("  LibreOffice not found: formulas NOT recalculated.")
        return ["LibreOffice is needed to verify the workbook"]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([soffice, "--headless", "--calc", "--convert-to", "xlsx", "--outdir", tmp, str(XLSX)],
                       check=True, capture_output=True, timeout=300)
        wb = load_workbook(Path(tmp) / XLSX.name, data_only=True)
    errors = []
    for sheet, cell, want in bk.expect:
        got = wb[sheet][cell].value
        if want == "" or want is None:
            ok = got in ("", None)
        else:
            ok = isinstance(got, (int, float)) and abs(got - want) <= 1e-6 * max(1, abs(want))
        if not ok:
            errors.append(f"{sheet}!{cell}: workbook {got!r} vs python {want!r}")
    bad = [f"{s.title}!{c.coordinate}" for s in wb.worksheets for row in s.iter_rows() for c in row
           if isinstance(c.value, str) and c.value.startswith("#")]
    if bad:
        errors.append(f"{len(bad)} cells evaluate to an error, e.g. {bad[:5]}")
    print(f"  recalculated with LibreOffice: {len(bk.expect)} formula cells compared with Python")
    return errors


def main() -> int:
    cat = json.loads(SRC.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    bk = build(cat)
    write_csv(bk)
    errors = verify(bk)
    print(f"  WWF FG1 {bk.val('WWF', 'E18'):.1%} · FG2 {bk.val('WWF', 'E20'):.1%} · whole diet {bk.val('WWF', 'E19'):.1%} · "
          f"Protein Tracker {bk.pt:.1%}")
    print(f"  -> {XLSX.relative_to(ROOT)} ({XLSX.stat().st_size // 1024} KB, {len(bk.wb.sheetnames)} tabs), "
          f"{CSV.relative_to(ROOT)} ({CSV.stat().st_size // 1024} KB)")
    if errors:
        print("REFUSED:", *errors[:30], sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
