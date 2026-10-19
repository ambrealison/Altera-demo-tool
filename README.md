# Altera AI · demo tool

A working demo of Altera AI on a 30-product catalogue, for a presenter to run live:
import the file, check it, classify every product, match the protein databases, calculate
the WWF and Protein Tracker ratios, run the quality checks and download the deliverables.

Live: https://ambrealison.github.io/Altera-demo-tool/ (`?lang=fr` opens it in French)

## How it works

Nothing calls a remote service. Every result the engine shows was prepared in advance from
the catalogue (`src/data/catalogue.json`); each button plays a timed script (`src/engine.ts`)
that paces those results into the table and prints the engine log a real run would print.
Steps take 3 to 10 seconds; the deliverables take about 20. Three anomalies are planted in the file (a mistyped barcode, a
missing net weight, a per-pack protein value); the presenter accepts each proposed correction
before the pipeline moves on.

The tool accepts only the two demo files, the same 30 rows in each:
`public/demo/harbour_market_catalogue.csv` (English headers, commas) and
`public/demo/catalogue_harbour_market.csv` (French headers, semicolons, decimal commas). Any
other CSV is refused with a message. The import screen offers the file that matches the
interface language.

## The data

- **Products**: 30 real products with their real barcodes and nutrition values, from
  Open Food Facts (ODbL), collected once into `scripts/off_snapshot.json`.
- **Retailer**: Harbour Market is fictitious, and so are its departments and volumes.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check and build to dist/
npm run deliverables   # rebuild the workbook, the CSV and the four PDFs
```

`npm run deliverables` writes to `public/downloads/`:

| File | What it is |
| --- | --- |
| `HarbourMarket_Protein_Ratio_DEMO.xlsx` | 8 tabs, formula-driven, one input column (volumes). Every formula is recalculated with LibreOffice and compared with Python before the file is accepted. |
| `HarbourMarket_products_DEMO.csv` | Line-level file: classes, contents, split, data level and the source of every value. |
| `HarbourMarket_Insights_Report_{EN,FR}.pdf` | Five 16:9 pages: scope, WWF, Protein Tracker, levers. |
| `HarbourMarket_Scope_Statement_{EN,FR}.pdf` | One A4 page: scope covered, product-level approach, data used, volume assumptions. |

The workbook needs `python3` with `openpyxl` and LibreOffice (`soffice`); the PDFs need a
local Chrome (set `CHROME_PATH` outside macOS). The dataset itself is rebuilt with
`python3 scripts/build_dataset.py`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages (`.github/workflows/pages.yml`).
