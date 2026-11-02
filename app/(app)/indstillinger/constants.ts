export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Man",
  tue: "Tir",
  wed: "Ons",
  thu: "Tor",
  fri: "Fre",
  sat: "Lør",
  sun: "Søn",
};
export const MEAL_TYPES = ["morgenmad", "frokost", "aftensmad", "snack"] as const;
