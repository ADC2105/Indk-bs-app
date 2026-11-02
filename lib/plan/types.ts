export type MealType = "morgenmad" | "frokost" | "aftensmad" | "snack";
export const MEAL_TYPES: MealType[] = ["morgenmad", "frokost", "aftensmad", "snack"];

export type MacroMode = "fri" | "minimum" | "balanceret" | "skarp";

export type MealGridCell = {
  on: boolean;
  who: "begge" | string; // "begge" eller en person-id
  guests: number;
  leftover?: boolean; // frokost: rester fra aftensmaden dagen før
};

/** Dato (ÅÅÅÅ-MM-DD) -> måltidstype -> celle. */
export type WeekMealGrid = Record<string, Partial<Record<MealType, MealGridCell>>>;
