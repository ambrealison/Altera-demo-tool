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

# key: till label and display name in French (the French file), brand, department, segment, net weight (kg), units sold over 12 months
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
    ("passata", "MUTTI PASSATA PUREE TOMATE 500G", "Passata di pomodoro, purée de tomates, 500 g", "Mutti", "Grocery", "Tomato sauces", 0.50, 92000),
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

# the English demo file: the same products as an English-speaking retailer would list them
EN = {
    "beef_mince": ("CHARAL BEEF PATTIES 5%FAT 2X130G", "Minced beef patties 5% fat, 2 × 130 g"),
    "chicken": ("LE GAULOIS CHICKEN FILLET 300G", "Chicken breast fillets, 300 g"),
    "ham": ("HERTA LE BON PARIS COOKED HAM X4", "Le Bon Paris cooked ham, 4 slices"),
    "tuna": ("PETIT NAVIRE TUNA IN BRINE 160G", "Whole tuna in brine, 160 g"),
    "eggs": ("LOUE 6 FREE RANGE EGGS LR LARGE", "6 free-range eggs, Label Rouge"),
    "camembert": ("PRESIDENT CAMEMBERT 250G", "Camembert, 250 g"),
    "yogurt": ("ACTIVIA NATURAL YOGURT 4X125G", "Activia natural yogurt, 4 × 125 g"),
    "milk": ("LACTEL SEMI SKIMMED MILK 1L", "Matin Léger semi-skimmed milk, 1 L"),
    "butter": ("PAYSAN BRETON UNSALTED BUTTER 250G", "Unsalted butter, 250 g"),
    "oil": ("LESIEUR SUNFLOWER OIL 1L", "Cœur de Tournesol sunflower oil, 1 L"),
    "lentils": ("BONDUELLE STEAMED LENTILS 265G", "Steamed lentils, 265 g"),
    "plant_mince": ("GARDEN GOURMET SOY MINCE 200G", "Sensational soy mince, 200 g"),
    "tofu": ("TAIFUN JAPANESE TOFU FILLETS 160G", "Japanese-style tofu fillets, 160 g"),
    "almonds": ("SEEBERGER ROASTED ALMONDS 150G", "Roasted almonds, 150 g"),
    "soy_drink": ("ALPRO SOY NO SUGARS 1L", "Soy drink, no sugars, 1 L"),
    "oat_drink": ("OATLY BARISTA OAT DRINK 1L", "Barista oat drink, 1 L"),
    "peas": ("D AUCY EXTRA FINE PEAS 280G", "Extra fine garden peas, 280 g"),
    "passata": ("MUTTI PASSATA SIEVED TOMATOES 500G", "Passata di pomodoro, sieved tomatoes, 500 g"),
    "spaghetti": ("BARILLA SPAGHETTI N5 500G", "Spaghetti n°5, 500 g"),
    "bread": ("HARRYS WHITE SANDWICH BREAD 500G", "Crustless white sandwich bread, 500 g"),
    "oats": ("QUAKER ROLLED OATS 800G", "Rolled oats, 800 g"),
    "mash": ("MOUSLINE INSTANT MASH 4X130G", "Instant mashed potato, plain, 4 × 130 g"),
    "pringles": ("PRINGLES SOUR CREAM ONION 175G", "Pringles Sour Cream & Onion, 175 g"),
    "nutella": ("NUTELLA HAZELNUT SPREAD 400G", "Nutella hazelnut spread, 400 g"),
    "lays": ("LAYS READY SALTED CRISPS 155G", "Ready salted crisps, 155 g"),
    "lasagne": ("MARIE BEEF LASAGNE 300G", "Beef lasagne bolognese, 300 g"),
    "pizza": ("BUITONI FRAICHUP 4 CHEESE 600G", "Fraîch'Up four-cheese pizza, 600 g"),
    "cola": ("COCA COLA ORIGINAL CAN 33CL", "Coca-Cola Original, 33 cl"),
    "beer": ("HEINEKEN LAGER 33CL", "Heineken lager, 33 cl"),
    "lotus": ("LOTUS TOILET TISSUE AQUA TUBE X12", "Aqua Tube toilet tissue, 12 rolls"),
}
ING_EN = {
    "ham": "Fresh pork ham, salt, dextrose, stock (water, salt, pork rind, onion, carrot, pork meat and bones, spices and herbs, garlic), antioxidant: sodium erythorbate, preservative: sodium nitrite.",
    "yogurt": "Partially skimmed MILK 3.2% fat (98.5%), concentrated or powdered skimmed MILK, cultures (including yogurt cultures and Bifidobacterium (MILK)). MILK: origin France",
    "lentils": "Soaked dried [green] lentils, water, salt, firming agent: calcium chloride. May contain WHEAT",
    "plant_mince": "Water, SOY protein concentrate 23.5%, vegetable oils (rapeseed, coconut), acidity regulator: buffered vinegar; stabiliser: methylcellulose; flavourings, vegetable concentrates (beetroot, apple, carrot, hibiscus), salt, BARLEY malt extract, garlic powder, onion powder, black pepper, SOY sauce (SOY, WHEAT, salt). May contain: EGGS.",
    "tofu": "Tofu* 94% (soya beans* 55%, water, coagulants: magnesium chloride, calcium sulphate), sunflower oil*, vegetable stock (sea salt, yeast extract*, sunflower oil*, leeks*, carrots*, celery*, mace*, nutmeg*, parsley*), concentrated lemon juice*.",
    "soy_drink": "Soya base (98.8%) [water, hulled soya beans (8.7%)], acidity regulators (potassium phosphates), calcium (calcium carbonate), flavourings, sea salt, stabiliser (gellan gum), vitamin B2, vitamin B12, vitamin D2.",
    "oat_drink": "Water, oats 10%, rapeseed oil, acidity regulator (dipotassium phosphate), minerals (calcium carbonate, potassium iodide), salt, vitamins (D2, riboflavin and B12).",
    "passata": "Tomatoes 99.5%, salt",
    "spaghetti": "Durum WHEAT semolina. May contain traces of SOY and MUSTARD.",
    "bread": "WHEAT flour 63%, water, sugar, rapeseed oil, salt, vinegar, yeast, broad bean flour, WHEAT gluten, flavouring (contains alcohol), acerola extract. May contain traces of EGG, SOY, MILK, NUTS and SESAME SEEDS.",
    "pringles": "Dehydrated potatoes, vegetable oils (sunflower, maize), rice flour, WHEAT starch, maize flour, sour cream and onion seasoning (WHEAT starch, flavour enhancers {monosodium glutamate, disodium guanylate, disodium inosinate}, onion powder, maltodextrin, salt, dextrose, sugar, sweet whey powder {MILK}, potato starch, modified maize starch, acids {citric acid, lactic acid, malic acid}, sour cream powder {MILK}, flavourings {MILK}, yeast extract, glucose syrup, MILK protein, rice flour), emulsifier (E471), maltodextrin, salt, colour (annatto).",
    "nutella": "Sugar, palm oil, HAZELNUTS 13%, fat-reduced cocoa 7.4%, skimmed MILK powder 6.6%, WHEY powder, emulsifiers: lecithins (SOY), vanillin. Gluten free.",
    "lays": "Potatoes (66%), vegetable oils (sunflower, rapeseed, maize in varying proportions), salt",
    "lasagne": "Béchamel 33% (water, crème fraîche, skimmed milk powder, maize starch, wheat flour, salt, virgin olive oil, nutmeg), cooked fresh lasagne sheets 17.5% (water, durum wheat semolina), water, beef from France 9.1%, double tomato concentrate 5.9%, tomato pulp in juice 5.9% (tomatoes, tomato juice), cooked beef from France 4.8%, onions, emmental 2.7%, vegetable stock [vegetables and vegetable cooking juices (tomatoes, onions, peppers, grilled aubergines, garlic, courgettes), virgin olive oil, salt, pepper], basil 0.8%, Dijon mustard (water, mustard seeds, spirit vinegar, salt), maize starch, garlic, salt, oregano, pepper.",
    "cola": "Carbonated water; sugar; colour: E150d; acid: phosphoric acid; natural flavourings; caffeine flavouring.",
    "beer": "Water, barley malt, hop extracts, alcohol.",
}
# Open Food Facts lists these two in English only: the French file gets them in French
ING_FR = {
    "soy_drink": "Base de soja (98,8 %) [eau, graines de soja décortiquées (8,7 %)], correcteurs d'acidité (phosphates de potassium), calcium (carbonate de calcium), arômes, sel marin, stabilisant (gomme gellane), vitamine B2, vitamine B12, vitamine D2.",
    "oat_drink": "Eau, avoine 10 %, huile de colza, correcteur d'acidité (phosphate dipotassique), minéraux (carbonate de calcium, iodure de potassium), sel, vitamines (D2, riboflavine et B12).",
}
assert set(EN) == {r[0] for r in ROWS}

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
    "peas": ("model", 0.93, W("whole", "FG1", "pulses", "plant"), "plant_core", "ciqual", 5.0, "one_side", 1, "Petits pois, appertisés, égouttés"),
    "passata": ("model", 0.96, W("whole", "FG4", None, "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "spaghetti": ("reference", 1, W("whole", "FG5", "refined_grain", "plant"), "plant_non_core", "off", 13.0, "one_side", 1, None),
    "bread": ("model", 0.94, W("whole", "FG5", "refined_grain", "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "oats": ("model", 0.95, W("whole", "FG5", "whole_grain", "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "mash": ("model", 0.89, W("whole", "FG6", None, "plant"), "plant_non_core", "ciqual", 8.3, "one_side", 1, "Purée de pomme de terre, flocons déshydratés"),
    "pringles": ("model", 0.93, W("whole", "FG7", None, "animal"), "composite", "off", 6.0, "nevo", 0.92, "Chips, gearomatiseerd"),
    "nutella": ("reference", 1, W("whole", "FG7", None, "animal"), "composite", "declared", None, "ingredients", 0.56, None),
    "lays": ("model", 0.97, W("whole", "FG7", None, "plant"), "plant_non_core", "declared", None, "one_side", 1, None),
    "lasagne": ("model", 0.95, W("composite", cat="meat_based"), "animal_core", "declared", None, "group", 0, None),
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
# a row carrying another product's ingredient list: the barcode is trusted, the list comes back by barcode
WRONG_INGREDIENTS = {"nutella": "lays"}
# what each correction becomes when the presenter declines it: the value as received is kept
DECLINED = {"ingredients": {"plant": 1.0}, "weight": {"weightKg": 0, "weightSrc": "missing"}, "protein": {"prot": 65.0, "protSrc": "declared"}}
# Protein Tracker sub-groups of the two core groups (plant core: the GPA glossary; animal core: the Altera template)
PT_SUB = {"beef_mince": "red_meat", "ham": "red_meat", "chicken": "poultry", "tuna": "fish_seafood", "eggs": "eggs", "camembert": "cheese",
          "yogurt": "milk_yoghurts", "milk": "milk_yoghurts", "butter": "other_animal", "lasagne": "other_animal",
          "lentils": "beans_pulses", "peas": "beans_pulses", "almonds": "nuts_seeds", "plant_mince": "plant_alternatives",
          "tofu": "plant_alternatives", "soy_drink": "plant_alternatives", "oat_drink": "plant_alternatives"}

def fmt(v):
    if v is None: return ""
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)

raws, products, anomalies = [], [], []
for i, (key, till, name, brand, dept, seg, weight, units) in enumerate(ROWS):
    s = SNAP[key]
    eng = ENGINE.get(key)
    declared = eng is not None and eng[4] == "declared"
    ing_fr = "" if key in NO_INGREDIENTS else ING_FR.get(key, (s["ingredients"] or "").replace("\n", " ").replace("_", ""))
    raw = {
        "ean": s["code"],
        "till_label": EN[key][0],
        "product_name": EN[key][1],
        "brand": brand,
        "department": dept,
        "segment": seg,
        "net_weight_kg": "" if key in MISSING_WEIGHT or weight is None else fmt(weight),
        "ingredients": "" if key in NO_INGREDIENTS else ING_EN[WRONG_INGREDIENTS.get(key, key)],
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
        if key in PT_SUB: res["ptSub"] = PT_SUB[key]
    if key in WRONG_INGREDIENTS:
        other = WRONG_INGREDIENTS[key]
        anomalies.append({"id": "ingredients", "row": i, "from": ING_EN[other], "to": ING_EN[key],
                          "fromFr": (SNAP[other]["ingredients"] or "").replace("_", ""), "toFr": ing_fr, "declined": DECLINED["ingredients"]})
        ing_fr = (SNAP[other]["ingredients"] or "").replace("_", "")
    if key in MISSING_WEIGHT: anomalies.append({"id": "weight", "row": i, "from": "", "to": fmt(weight), "declined": DECLINED["weight"]})
    if key in WRONG_PROTEIN: anomalies.append({"id": "protein", "row": i, "from": fmt(WRONG_PROTEIN[key]), "to": fmt(s["protein"]), "declined": DECLINED["protein"]})
    assert bool(raw["ingredients"]) == bool(ing_fr), key
    products.append({"key": key, "raw": raw, "fr": {"till_label": till, "product_name": name, "ingredients": ing_fr}, "res": res})

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
          "Tomato sauces": "Sauces tomate", "Pasta": "Pâtes", "Sandwich bread": "Pain de mie", "Cereals": "Céréales",
          "Potato flakes": "Purées en flocons", "Crisps": "Chips", "Spreads": "Pâtes à tartiner", "Pasta dishes": "Plats de pâtes",
          "Pizzas": "Pizzas", "Soft drinks": "Sodas", "Beer": "Bières", "Paper": "Papier"}
NUMERIC = {"net_weight_kg", "energy_kcal_100g", "fat_g_100g", "carbs_g_100g", "protein_g_100g"}

def french(raw: dict, fr: dict) -> dict:
    out = {}
    for k, v in raw.items():
        if k in fr: v = fr[k]
        if k == "department": v = DEPT_FR[v]
        elif k == "segment": v = SEG_FR[v]
        elif k in NUMERIC: v = v.replace(".", ",")
        out[COLS_FR[k]] = v
    return out

cols = list(raws[0].keys())
demo = ROOT / "public" / "demo"
demo.mkdir(parents=True, exist_ok=True)
for name, rows, fields, delim in (("harbour_market_catalogue.csv", raws, cols, ","),
                                  ("catalogue_harbour_market.csv", [french(r, p["fr"]) for r, p in zip(raws, products)], [COLS_FR[c] for c in cols], ";")):
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
