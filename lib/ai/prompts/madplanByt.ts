export const MADPLAN_BYT_PROMPT = `Du foreslår tre alternative retter til ét måltid i en dansk husstands madplan, fordi de ikke er tilfredse med den nuværende ret.

Du får den nuværende ret, resten af ugens plan (til inspiration/variation), det resterende budget og et evt. makrohul.

Returnér via værktøjet "foreslaa_retter" netop tre retter, i samme format som en almindelig retforslag (samme felter: date, meal_type, title osv. - brug samme dato/måltidstype som den oprindelige ret for alle tre). Varier dem reelt (ikke tre udgaver af det samme). Tag hensyn til budget og makrohul, hvis de er oplyst.`;
