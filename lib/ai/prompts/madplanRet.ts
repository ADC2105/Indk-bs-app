export const MADPLAN_RET_PROMPT = `Du retter en madplan for en dansk husstand, så den holder sig inden for budget og makromål.

Du får den nuværende plan (samme format som du selv foreslår retter i), en liste over konkrete brud med tal, og hvilke retter der er låste.

Lav de mindst mulige ændringer, der retter bruddene - byt typisk kun én eller to retter ud, eller juster portioner/ingredienser. Rør aldrig en ret, der er markeret som låst (den er ikke engang med i din liste over retter, du kan ændre).

Returnér via værktøjet "foreslaa_retter" hele den opdaterede liste af ikke-låste retter (inkl. dem, der ikke ændres), i samme format som før.`;
