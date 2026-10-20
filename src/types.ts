export type Lang = "en" | "fr";

export type PtClass = "animal_core" | "composite" | "plant_non_core" | "plant_core";
export type Route = "reference" | "model";
export type ProtSrc = "declared" | "reference" | "off" | "nevo" | "ciqual";
/** "group": the product's protein follows its Protein Tracker group (a composite classed Animal core). */
export type SplitMethod = "one_side" | "ingredients" | "nevo" | "convention" | "group" | "zero";
/** Sub-groups of the two Protein Tracker core groups. */
export type PtSub = "red_meat" | "poultry" | "fish_seafood" | "eggs" | "cheese" | "milk_yoghurts" | "other_animal" | "beans_pulses" | "nuts_seeds" | "spreads" | "plant_alternatives";
export type Excl = "non_food" | "beverage" | "alcohol";

/** One row of the catalogue as the retailer sends it: every value is text, some are empty. */
export interface RawRow {
  ean: string;
  till_label: string;
  product_name: string;
  brand: string;
  department: string;
  segment: string;
  net_weight_kg: string;
  ingredients: string;
  energy_kcal_100g: string;
  fat_g_100g: string;
  carbs_g_100g: string;
  protein_g_100g: string;
  units_sold_12m: string;
}

/** What the engine ends up with for a row, once every step has run. */
export interface Result {
  ean: string;
  inPt: boolean;
  inWwf: boolean;
  excl?: Excl;
  weightKg: number;
  weightSrc: "declared" | "label" | "missing";
  route: Route;
  conf: number;
  wwf: { struct: "whole" | "composite"; fg?: string; sub?: string; origin?: "plant" | "animal"; cat?: string } | null;
  dairy: number;
  pt: PtClass | null;
  ptSub?: PtSub;
  prot: number;
  protSrc: ProtSrc;
  /** Food matched in a composition table, for name matches and NEVO splits. */
  matched?: string;
  plant: number;
  split: SplitMethod;
  level: "A" | "B" | null;
}

/** raw is the row of the English demo file; fr holds the texts of the French one. */
export interface Product { raw: RawRow; fr: { till_label: string; product_name: string; ingredients: string }; res: Result }

export type AnomalyId = "ingredients" | "weight" | "protein";
export interface Anomaly {
  id: AnomalyId;
  /** Index of the row in the catalogue. */
  row: number;
  from: string;
  to: string;
  /** The same values in the French file, where they differ. */
  fromFr?: string;
  toFr?: string;
  /** What the result becomes when the presenter declines the correction: the value as received is kept. */
  declined: Partial<Result>;
}
export type Decision = "accepted" | "declined";
export type Decisions = Partial<Record<AnomalyId, Decision>>;
