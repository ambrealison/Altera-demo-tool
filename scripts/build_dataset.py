"""Build the demo catalogue: the CSV the presenter drops, and what the engine finds for each row.

    python3 scripts/build_dataset.py

Reads scripts/off_snapshot.json, a frozen extract of Open Food Facts (ODbL) for 30 real
products, taken once while building the demo. The app itself never calls an API: every
result it "computes" live is written here, in advance, from that snapshot.

Writes:
    public/demo/harbour_market_catalogue.csv   the retailer's export, as received (with gaps and 3 anomalies)
    public/demo/catalogue_harbour_market.csv   the same export as a French retailer sends it (French headers,
                                               semicolons, decimal commas)
    src/data/catalogue.json                     the same rows plus the engine's results
"""
import csv, io, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAP = json.loads((ROOT / "scripts" / "off_snapshot.json").read_text())

# key: till label, display name, brand, department, segment, net weight (kg), units sold over 12 months
ROWS = [
    ("beef_mince", "CHARAL STK HACHE 5%MG 2X130G", "Steaks hachés 5% MG, 2 × 130 g", "Charal", "Butchery", "Minced beef", 0.26, 186000),
    ("chicken", "LE GAULOIS FILET POULET 300G", "Filet de poulet, 300 g", "Le Gaulois", "Poultry", "Chicken", 0.30, 142000),
    ("ham", "HERTA BON PARIS JAMBON ETOUF X4", "Jambon à l'étouffée Le Bon Paris, ×4", "Herta", "Deli", "Cooked ham", 0.17, 228000),
    ("tuna", "PT NAVIRE THON ENTIER NAT 160G", "Thon entier au naturel, 160 g", "Petit Navire", "Grocery", "Canned fish", 0.16, 96000),
    ("eggs", "LOUE 6 OEUFS FERMIERS LR GROS", "6 œufs fermiers Label Rouge", "Loué", "Dairy", "Eggs", 0.39, 214000),
    ("camembert", "PRESIDENT CAMEMBERT 250G", "Camembert, 250 g", "Président", "Cheese", "Soft cheese", 0.25, 118000),
    ("yogurt", "ACTIVIA NATURE 4X125G", "Activia nature, 4 × 125 g", "Activia", "Dairy", "Yoghurts", 0.50, 164000),
    ("milk", "LACTEL MATIN LEGER 1/2 ECR 1L", "Lait demi-écrémé Matin Léger, 1 L", "Lactel", "Dairy", "Milk", 1.0, 612000),
    ("butter", "PAYSAN BRETON BEURRE DOUX 250G", "Beurre doux, 250 g", "Paysan Breton", "Dairy", "Butter", 0.25, 131000),
    ("oil", "LESIEUR COEUR TOURNESOL 1L", "Huile Cœur de Tournesol, 1 L", "Lesieur", "Grocery", "Oils", 1.0, 58000),
    ("lentils", "BONDUELLE LENTILLES VAP 265G", "Lentilles vapeur, 265 g", "Bonduelle", "Grocery", "Canned pulses", 0.265, 47000),
    ("plant_mince", "GARDEN GOURMET HACHE SOJA 200G", "Sensational haché cru soja, 200 g", "Garden Gourmet", "Plant-based", "Meat alternatives", 0.20, 24000),
    ("tofu", "TAIFUN FILETS TOFU JAPON 160G", "Filets de tofu à la japonaise, 160 g", "Taifun", "Plant-based", "Tofu", 0.16, 9800),
    ("almonds", "SEEBERGER AMANDES GRILL 150G", "Amandes grillées, 150 g", "Seeberger", "Grocery", "Nuts and dried fruit", 0.15, 18500),
    ("soy_drink", "ALPRO SOYA S/SUCRE 1L", "Boisson soja sans sucres, 1 L", "Alpro", "Plant-based", "Plant drinks", 1.0, 61000),
    ("oat_drink", "OATLY BARISTA AVOINE 1L", "Boisson avoine Barista, 1 L", "Oatly", "Plant-based", "Plant drinks", 1.0, 52000),
    ("peas", "D AUCY PETITS POIS XFINS 280G", "Petits pois extra fins, 280 g", "D'aucy", "Grocery", "Canned vegetables", 0.28, 73000),
    ("compote", "ANDROS COMPOTE POMME 730G", "Compote pomme nature, 730 g", "Andros", "Grocery", "Fruit desserts", 0.73, 88000),
    ("spaghetti", "BARILLA SPAGHETTI N5 500G", "Spaghetti n°5, 500 g", "Barilla", "Grocery", "Pasta", 0.50, 254000),
    ("bread", "HARRYS PAIN DE MIE NATURE 500G", "Pain de mie 100% mie nature, 500 g", "Harrys", "Bakery", "Sandwich bread", 0.50, 167000),
    ("oats", "QUAKER FLOCONS AVOINE 800G", "Flocons d'avoine, 800 g", "Quaker", "Breakfast", "Cereals", 0.80, 39000),
    ("mash", "MOUSLINE PUREE NATURE 4X130G", "Purée nature, 4 × 130 g", "Mousline", "Grocery", "Potato flakes", 0.52, 44000),
    ("pringles", "PRINGLES SOUR CREAM ONION 175G", "Pringles Sour Cream & Onion, 175 g", "Pringles", "Snacks", "Crisps", 0.175, 102000),
    ("nutella", "NUTELLA PATE A TARTINER 400G", "Nutella, 400 g", "Nutella", "Breakfast", "Spreads", 0.40, 139000),
    ("lays", "LAYS NATURE 155G", "Chips nature, 155 g", "Lay's", "Snacks", "Crisps", 0.155, 97000),
    ("lasagne", "MARIE LASAGNES BOLOGNAISE 300G", "Lasagnes à la bolognaise, 300 g", "Marie", "Ready meals", "Pasta dishes", 0.30, 58000),
    ("pizza", "BUITONI FRAICHUP 4 FROMAGES 600G", "Pizza Fraîch'Up 4 fromages, 600 g", "Buitoni", "Frozen", "Pizzas", 0.60, 71000),
    ("cola", "COCA COLA ORIGINAL CAN 33CL", "Coca-Cola Original, 33 cl", "Coca-Cola", "Drinks", "Soft drinks", 0.33, 296000),
    ("beer", "HEINEKEN BIERE 33CL", "Heineken, 33 cl", "Heineken", "Beer & wine", "Beer", 0.33, 180000),
    ("lotus", "LOTUS PQ AQUA TUBE X12", "Papier toilette Aqua Tube, 12 rouleaux", "Lotus", "Household", "Paper", None, 64000),
]

W = lambda struct, fg=None, sub=None, origin=None, cat=None: {"struct": struct, "fg": fg, "sub": sub, "origin": origin, "cat": cat}
# key: route, confidence, WWF classification (None when excluded), PT class, protein source, protein used, split method, plant share of protein, matched food
ENGINE = {
    "beef_mince": ("reference", 1, W("whole", "FG1", "red_meat", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "chicken": ("reference", 1, W("whole", "FG1", "poultry", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "ham": ("reference", 1, W("whole", "FG1", "red_meat", "animal"), "animal_core", "reference", 21.0, "one_side", 0, None),
    "tuna": ("model", 0.97, W("whole", "FG1", "fish_shellfish", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "eggs": ("reference", 1, W("whole", "FG1", "eggs", "animal"), "animal_core", "reference", 12.7, "one_side", 0, None),
    "camembert": ("model", 0.97, W("whole", "FG2", "dairy", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "yogurt": ("reference", 1, W("whole", "FG2", "dairy", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "milk": ("reference", 1, W("whole", "FG2", "dairy", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "butter": ("reference", 1, W("whole", "FG3", "animal_fat", "animal"), "animal_core", "declared", None, "one_side", 0, None),
    "oil": ("reference", 1, W("whole", "FG3", "plant_fat", "plant"), "plant_non_core", "declared", None, "zero", 1, None),
    "lentils": ("model", 0.96, W("whole", "FG1", "pulses", "plant"), "plant_core", "off", 8.7, "one_side", 1, None),
    "plant_mince": ("model", 0.98, W("whole", "FG1", "alternative_products", "plant"), "plant_core", "declared", None, "one_side", 1, None),
    "tofu": ("reference", 1, W("whole", "FG1", "tofu_tempeh_seitan", "plant"), "plant_core", "reference", 19.0, "one_side", 1, None),
    "almonds": ("model", 0.97, W("whole", "FG1", "nuts", "plant"), "plant_core", "off", 26.0, "one_side", 1, None),
    "soy_drink": ("reference", 1, W("whole", "FG2", "dairy_alternatives", "plant"), "plant_core", "declared", None, "one_side", 1, None),
    "oat_drink": ("model", 0.95, W("whole", "FG2", "dairy_alternatives", "plant"), "plant_core", "declared", None, "one_side", 1, None),
    "peas": ("model", 0.93, W("whole", "FG4", None, "plant"), "plant_non_core", "ciqual", 5.0, "one_side", 1, "Petits pois, appertisés, égouttés"),
    "compote": ("model", 0.91, W("whole", "FG4", None, "plant"), "plant_non_core", "median", 0.4, "one_side", 1, "Fruit desserts"),
    "spaghetti": ("reference", 1, W("whole", "FG5", "refined_grain", "plant"), "plant_non_core", "off", 13.0, "one_side", 1, None),
    "bread": ("model", 0.94, W("whole", "FG5", "refined_grain", "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "oats": ("model", 0.95, W("whole", "FG5", "whole_grain", "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "mash": ("model", 0.89, W("whole", "FG6", None, "plant"), "plant_non_core", "ciqual", 8.3, "one_side", 1, "Purée de pomme de terre, flocons déshydratés"),
    "pringles": ("model", 0.93, W("whole", "FG7", None, "animal"), "composite", "off", 6.0, "nevo", 0.92, "Chips, gearomatiseerd"),
    "nutella": ("reference", 1, W("whole", "FG7", None, "animal"), "composite", "declared", None, "ingredients", 0.56, None),
    "lays": ("model", 0.97, W("whole", "FG7", None, "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "lasagne": ("model", 0.95, W("composite", cat="meat_based"), "composite", "declared", None, "ingredients", 0.21, None),
    "pizza": ("model", 0.88, W("composite", cat="vegetarian"), "composite", "off", 11.8, "convention", 0.5, None),
    "cola": ("reference", 1, None, "plant_non_core", "declared", None, "zero", 1, None),
    "beer": ("reference", 1, None, "plant_non_core", "declared", None, "zero", 1, None),
}
EXCL = {"cola": "beverage", "beer": "alcohol", "lotus": "non_food"}
DAIRY = {"camembert": 10}
# what the retailer's file leaves empty, on purpose
NO_INGREDIENTS = {"beef_mince", "chicken", "tuna", "eggs", "camembert", "milk", "butter", "oil", "almonds", "peas", "oats", "mash", "pizza", "lotus"}
WRONG_PROTEIN = {"spaghetti": 65.0}          # a per-pack figure typed as per 100 g (13 g × 500 g)
MISSING_WEIGHT = {"pringles"}                # read from the till label
WRONG_EAN = {"yogurt": "3033491147063"}      # last digit mistyped

def fmt(v):
    if v is None: return ""
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)

raws, products, anomalies = [], [], []
for i, (key, till, name, brand, dept, seg, weight, units) in enumerate(ROWS):
    s = SNAP[key]
    eng = ENGINE.get(key)
    declared = eng is not None and eng[4] == "declared"
    raw = {
        "ean": WRONG_EAN.get(key, s["code"]),
        "till_label": till,
        "product_name": name,
        "brand": brand,
        "department": dept,
        "segment": seg,
        "net_weight_kg": "" if key in MISSING_WEIGHT or weight is None else fmt(weight),
        "ingredients": "" if key in NO_INGREDIENTS else (s["ingredients"] or "").replace("\n", " ").replace("_", ""),
        "energy_kcal_100g": fmt(round(s["kcal"], 1)) if (declared or key in WRONG_PROTEIN) and s["kcal"] is not None else "",
        "fat_g_100g": fmt(s["fat"]) if (declared or key in WRONG_PROTEIN) else "",
        "carbs_g_100g": fmt(s["carbs"]) if (declared or key in WRONG_PROTEIN) else "",
        "protein_g_100g": fmt(WRONG_PROTEIN.get(key, s["protein"])) if (declared or key in WRONG_PROTEIN) else "",
        "units_sold_12m": str(units),
    }
    raws.append(raw)
    if key == "lotus":
        res = {"ean": s["code"], "inPt": False, "inWwf": False, "excl": "non_food", "weightKg": 0, "weightSrc": "declared",
               "route": "reference", "conf": 1, "wwf": None, "dairy": 1, "pt": None, "prot": 0, "protSrc": "declared",
               "plant": 0, "split": "zero", "level": None}
    else:
        route, conf, wwf, pt, src, prot, split, plant, matched = eng
        prot = s["protein"] if prot is None else prot
        res = {"ean": s["code"], "inPt": True, "inWwf": key not in EXCL, "weightKg": weight, "weightSrc": "label" if key in MISSING_WEIGHT else "declared",
               "route": route, "conf": conf, "wwf": wwf, "dairy": DAIRY.get(key, 1), "pt": pt, "prot": prot, "protSrc": src,
               "plant": plant, "split": split, "level": None if split == "zero" else ("B" if split == "convention" else "A")}
        if key in EXCL: res["excl"] = EXCL[key]
        if matched: res["matched"] = matched
    products.append({"key": key, "raw": raw, "res": res})
    if key in WRONG_EAN: anomalies.append({"id": "ean", "row": i, "from": WRONG_EAN[key], "to": s["code"]})
    if key in MISSING_WEIGHT: anomalies.append({"id": "weight", "row": i, "from": "", "to": fmt(weight)})
    if key in WRONG_PROTEIN: anomalies.append({"id": "protein", "row": i, "from": fmt(WRONG_PROTEIN[key]), "to": fmt(s["protein"])})

# the energy check must pass on every declared value except the planted one
for p in products:
    r = p["raw"]
    # alcohol brings energy the formula does not count: beer is left out of this check
    if r["protein_g_100g"] and r["energy_kcal_100g"] and r["department"] != "Beer & wine":
        kcal = float(r["energy_kcal_100g"]); calc = 4 * float(r["protein_g_100g"]) + 9 * float(r["fat_g_100g"] or 0) + 4 * float(r["carbs_g_100g"] or 0)
        bad = abs(calc - kcal) > max(15, 0.15 * kcal)
        assert bad == (p["key"] in WRONG_PROTEIN), (p["key"], kcal, calc)

# the French file: the same rows, as a French retailer exports them
COLS_FR = {"ean": "code_ean", "till_label": "libelle_caisse", "product_name": "nom_produit", "brand": "marque", "department": "rayon",
           "segment": "segment", "net_weight_kg": "poids_net_kg", "ingredients": "ingredients", "energy_kcal_100g": "energie_kcal_100g",
           "fat_g_100g": "lipides_g_100g", "carbs_g_100g": "glucides_g_100g", "protein_g_100g": "proteines_g_100g",
           "units_sold_12m": "unites_vendues_12m"}
DEPT_FR = {"Butchery": "Boucherie", "Poultry": "Volaille", "Deli": "Charcuterie", "Grocery": "Épicerie", "Dairy": "Crèmerie",
           "Cheese": "Fromages", "Plant-based": "Végétal", "Bakery": "Boulangerie", "Breakfast": "Petit-déjeuner",
           "Snacks": "Biscuits et snacks", "Ready meals": "Plats préparés", "Frozen": "Surgelés", "Drinks": "Boissons",
           "Beer & wine": "Bières et vins", "Household": "Droguerie"}
SEG_FR = {"Minced beef": "Viande hachée", "Chicken": "Poulet", "Cooked ham": "Jambon cuit", "Canned fish": "Poisson en conserve",
          "Eggs": "Œufs", "Soft cheese": "Fromages à pâte molle", "Yoghurts": "Yaourts", "Milk": "Lait", "Butter": "Beurre",
          "Oils": "Huiles", "Canned pulses": "Légumineuses cuisinées", "Meat alternatives": "Alternatives à la viande", "Tofu": "Tofu",
          "Nuts and dried fruit": "Fruits secs", "Plant drinks": "Boissons végétales", "Canned vegetables": "Légumes en conserve",
          "Fruit desserts": "Compotes", "Pasta": "Pâtes", "Sandwich bread": "Pain de mie", "Cereals": "Céréales",
          "Potato flakes": "Purées en flocons", "Crisps": "Chips", "Spreads": "Pâtes à tartiner", "Pasta dishes": "Plats de pâtes",
          "Pizzas": "Pizzas", "Soft drinks": "Sodas", "Beer": "Bières", "Paper": "Papier"}
NUMERIC = {"net_weight_kg", "energy_kcal_100g", "fat_g_100g", "carbs_g_100g", "protein_g_100g"}

def french(raw: dict) -> dict:
    out = {}
    for k, v in raw.items():
        if k == "department": v = DEPT_FR[v]
        elif k == "segment": v = SEG_FR[v]
        elif k in NUMERIC: v = v.replace(".", ",")
        out[COLS_FR[k]] = v
    return out

cols = list(raws[0].keys())
demo = ROOT / "public" / "demo"
demo.mkdir(parents=True, exist_ok=True)
for name, rows, fields, delim in (("harbour_market_catalogue.csv", raws, cols, ","),
                                  ("catalogue_harbour_market.csv", [french(r) for r in raws], [COLS_FR[c] for c in cols], ";")):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, delimiter=delim, lineterminator="\n")
    w.writeheader(); w.writerows(rows)
    # with a byte order mark, Excel opens the accents right
    (demo / name).write_text(buf.getvalue(), encoding="utf-8-sig")
out_csv = demo / "harbour_market_catalogue.csv"
out_json = ROOT / "src" / "data" / "catalogue.json"
out_json.parent.mkdir(parents=True, exist_ok=True)
out_json.write_text(json.dumps({"columns": cols, "fr": {"columns": [COLS_FR[c] for c in cols], "segments": SEG_FR, "departments": DEPT_FR},
                                "products": products, "anomalies": anomalies}, ensure_ascii=False, indent=1))

# a first look at the ratios, to check the story holds
tot = pl = 0
for p in products:
    r = p["res"]
    if not r["inPt"]: continue
    kg = int(p["raw"]["units_sold_12m"]) * r["weightKg"]
    t = kg * r["prot"] / 100; tot += t; pl += t * r["plant"]
print(f"  {len(products)} rows, {len(anomalies)} anomalies · protein {tot/1000:.1f} t · PT plant share {pl/tot:.1%}")
print(f"  -> {out_csv.relative_to(ROOT)}, public/demo/catalogue_harbour_market.csv, {out_json.relative_to(ROOT)}")
