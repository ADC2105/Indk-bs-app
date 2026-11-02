/** Dagens dato i Europe/Copenhagen, ved midnat (til sammenligning med gyldighedsdatoer). */
export function todayInCopenhagen(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(iso + "T00:00:00");
}

/** Næste dato, der falder på den ønskede ISO-ugedag (1 = mandag .. 7 = søndag), inkl. i dag. */
export function nextShoppingDate(shoppingDayIso: number, from: Date = todayInCopenhagen()): Date {
  const currentIso = from.getDay() === 0 ? 7 : from.getDay();
  const diffDays = (shoppingDayIso - currentIso + 7) % 7;
  const result = new Date(from);
  result.setDate(result.getDate() + diffDays);
  return result;
}
