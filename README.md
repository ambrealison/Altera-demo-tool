# Altera AI · demo tool

A working demo of Altera AI on a 30-product catalogue, for a presenter to run live:
import the file, check it, classify every product, match the protein databases, calculate
the WWF and Protein Tracker ratios, run the quality checks and download the deliverables.

Live: https://ambrealison.github.io/Altera-demo-tool/ (`?lang=fr` opens it in French)

## How it works

Nothing calls a remote service. Every result the engine shows was prepared in advance from
the catalogue (`src/data/catalogue.json`); each button plays a timed script (`src/engine.ts`)
that paces those results into the screen, step by step.
Steps take 3 to 10 seconds; the deliverables take about 20. The interface shows no demo
marker: it reads as the real tool.

Three anomalies are planted in the file: an ingredient list that belongs to another product
(the barcode is trusted, the list comes back by barcode), a missing net weight (read from the
till label) and a per-pack protein value. The presenter accepts or declines each proposed
correction. Declining keeps the value as received, and every figure that follows changes with
it: tables, ratios, quality checks and deliverables. The deliverables were built for the eight
combinations of decisions, in `public/downloads/<variant>/`, where the variant is one letter per
anomaly (`a` accepted, `d` declined) in the order ingredients, weight, protein.

The tool accepts only the two demo files, the same 30 rows in each:
`public/demo/harbour_market_catalogue.csv` (English headers, commas) and
`public/demo/catalogue_harbour_market.csv` (French headers, semicolons, decimal commas). Any
other CSV is refused with a message. The import screen offers the file that matches the
interface language.

## The data

- **Products**: 30 real products with their real barcodes and nutrition values, from
  Open Food Facts (ODbL), collected once into `scripts/off_snapshot.json`. Labels, names and
  ingredient lists exist in English and French; each interface language shows its own.
- **Terms**: WWF food groups and sub-groups, food sources and Protein Tracker groups follow
  the Altera glossary (Food Group 1: Protein-Rich Foods, Tofu, tempeh & seitan, Animal-plant-based
  composite, and so on); WWF exclusions are named as the exclusion list.
- **Retailer**: Harbour Market is fictitious, and so are its departments and volumes.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check and build to dist/
npm run deliverables   # rebuild the workbook, the CSV and the four PDFs, for all eight variants
```

`npm run deliverables` writes to `public/downloads/<variant>/`:

| File | What it is |
| --- | --- |
| `HarbourMarket_Protein_Ratio.xlsx` | Altera's results file template (`scripts/assets/workbook_template.xlsx`: Welcome, Protein Tracker, WWF, By category, By department, By brand, By product, Data) filled with the 30 products. One input column, the volumes on Welcome. LibreOffice recalculates it; no error cell is allowed and the ratios are compared with Python. |
| `HarbourMarket_products.csv` | Line-level file: the Data tab's 30 columns, values computed. |
| `HarbourMarket_Insights_Report_{EN,FR}.pdf` | Five 16:9 pages: scope, WWF, Protein Tracker groups and sub-groups, levers. Its ratios are checked against the workbook's. |
| `HarbourMarket_Scope_Statement_{EN,FR}.pdf` | One A4 page: scope covered, product-level approach, data used, volume assumptions. |

The workbook needs `python3` with `openpyxl` and LibreOffice (`soffice`); the PDFs need a
local Chrome (set `CHROME_PATH` outside macOS). The dataset itself is rebuilt with
`python3 scripts/build_dataset.py`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages (`.github/workflows/pages.yml`).
