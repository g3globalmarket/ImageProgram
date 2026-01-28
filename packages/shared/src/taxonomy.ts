import type { Store } from "./types";

// Top-level categories
export type TopCategoryKey = "electronics" | "beauty" | "home_appliances";

// Sub-categories
export type SubCategoryKey =
  // Electronics
  | "phones"
  | "tablets"
  | "computers_laptops"
  | "smartwatches"
  | "audio"
  | "cameras"
  | "video_games"
  | "projectors"
  | "accessories"
  // Beauty
  | "skincare"
  | "makeup"
  | "haircare"
  | "bodycare"
  | "mens"
  | "hands_nails"
  | "perfume"
  | "supplements"
  | "beauty_devices"
  | "tools_brushes"
  // Home Appliances
  | "kitchen_airfryer"
  | "kitchen_ricecooker"
  | "kitchen_blender_mixer"
  | "kitchen_toaster"
  | "kitchen_juicer"
  | "kitchen_waffle_snack"
  | "kitchen_coffee"
  | "kitchen_kettle"
  | "kitchen_electric_grill_pan"
  | "kitchen_multicooker_hotplate"
  | "kitchen_chopper_helpers"
  | "kitchen_scales_measure"
  | "kitchen_food_disposer"
  | "home_vacuum"
  | "home_air_purifier"
  | "home_humidifier"
  | "home_heater_warm_mat"
  | "home_fan_cooling"
  | "home_massagers"
  | "home_iron"
  | "home_clipper_shaver_epilator"
  | "home_hairdryer_styler"
  | "home_sewing_lintremover"
  | "home_insect_repeller"
  | "office_equipment";

// Category taxonomy structure
export const CATEGORIES: Record<
  TopCategoryKey,
  { label: string; sub: SubCategoryKey[] }
> = {
  electronics: {
    label: "Электроника",
    sub: [
      "phones",
      "tablets",
      "computers_laptops",
      "smartwatches",
      "audio",
      "cameras",
      "video_games",
      "projectors",
      "accessories",
    ],
  },
  beauty: {
    label: "Красота",
    sub: [
      "skincare",
      "makeup",
      "haircare",
      "bodycare",
      "mens",
      "hands_nails",
      "perfume",
      "supplements",
      "beauty_devices",
      "tools_brushes",
    ],
  },
  home_appliances: {
    label: "Бытовая техника",
    sub: [
      "kitchen_airfryer",
      "kitchen_ricecooker",
      "kitchen_blender_mixer",
      "kitchen_toaster",
      "kitchen_juicer",
      "kitchen_waffle_snack",
      "kitchen_coffee",
      "kitchen_kettle",
      "kitchen_electric_grill_pan",
      "kitchen_multicooker_hotplate",
      "kitchen_chopper_helpers",
      "kitchen_scales_measure",
      "kitchen_food_disposer",
      "home_vacuum",
      "home_air_purifier",
      "home_humidifier",
      "home_heater_warm_mat",
      "home_fan_cooling",
      "home_massagers",
      "home_iron",
      "home_clipper_shaver_epilator",
      "home_hairdryer_styler",
      "home_sewing_lintremover",
      "home_insect_repeller",
      "office_equipment",
    ],
  },
};

// Store rules: which top categories and sub categories are allowed
export interface StoreRules {
  allowedTopCategories: TopCategoryKey[];
  allowedSubCategories?: Partial<Record<TopCategoryKey, SubCategoryKey[]>>;
}

export const STORE_RULES: Partial<Record<Store, StoreRules>> = {
  gmarket: {
    allowedTopCategories: ["electronics", "beauty", "home_appliances"],
  },
  "11st": {
    allowedTopCategories: ["electronics", "beauty", "home_appliances"],
  },
  oliveyoung: {
    allowedTopCategories: ["beauty"],
    allowedSubCategories: {
      beauty: [
        "skincare",
        "makeup",
        "haircare",
        "bodycare",
        "mens",
        "hands_nails",
        "perfume",
        "supplements",
        "beauty_devices",
        "tools_brushes",
      ],
    },
  },
};

/**
 * Check if a top category is allowed for a store
 */
export function isTopCategoryAllowed(
  store: Store,
  topCategory: TopCategoryKey
): boolean {
  const rules = STORE_RULES[store];
  if (!rules) {
    return false; // Store not in rules, deny by default
  }
  return rules.allowedTopCategories.includes(topCategory);
}

/**
 * Check if a sub category is allowed for a store and top category
 */
export function isSubCategoryAllowed(
  store: Store,
  topCategory: TopCategoryKey,
  subCategory?: SubCategoryKey
): boolean {
  const rules = STORE_RULES[store];
  if (!rules) {
    return false; // Store not in rules, deny by default
  }

  // If no subCategory provided, allow (means "All" within topCategory)
  if (!subCategory) {
    return true;
  }

  // If store has no allowedSubCategories restriction, allow any sub
  if (!rules.allowedSubCategories) {
    return true;
  }

  // If topCategory has no restrictions, allow any sub
  const allowedSubs = rules.allowedSubCategories[topCategory];
  if (!allowedSubs) {
    return true;
  }

  // Check if subCategory is in allowed list
  return allowedSubs.includes(subCategory);
}

