import { todayInCopenhagen } from "@/lib/offers/shoppingDate";

/** Mandagen i den uge, som "i dag" falder i (Europe/Copenhagen). */
export function currentWeekStart(): string {
  const today = todayInCopenhagen();
  const isoWeekday = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(monday.getDate() - (isoWeekday - 1));
  return monday.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
