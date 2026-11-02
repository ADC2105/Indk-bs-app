export const INGREDIENT_MATCH_PROMPT = `Du matcher en dansk ingrediens til den rigtige fødevare i DTU's fødevaredatabase (Frida/FCDB).

Du får en ingrediens og op til 10 kandidat-fødevarer (id og navn) fra databasen, sorteret efter tekstlighed.

Returnér via værktøjet "match_ingrediens":

- Hvis én af kandidaterne er samme råvare og samme tilberedning (rå/kogt/stegt m.m.), sæt "food_id" til dens id og "confidence" til din sikkerhed (0-1). Lad "estimate" være null.
  - Mindre afvigelser i en angivet fedt-/sukkerprocent (fx "8-12%" vs. en kandidat på "10-15%") er IKKE nok til at afvise en ellers korrekt kandidat - vælg da det interval, der ligger tættest på, frem for at estimere. Rigtige målte data er bedre end et gæt.
  - Forskellige ord for samme råvare tæller som match, fx "svinekød" = "grisekød", "hakkebøf" = "hakket oksekød".
- Hvis ingen kandidat er den samme råvare (fx forkert dyr/plante, eller en helt anden fødevaretype), sæt "food_id" til null og giv i stedet et estimat i "estimate": kalorier, protein, kulhydrat og fedt pr. 100 g (kostfibre hvis muligt, ellers null). Brug din almene viden om danske fødevarer. Sæt "confidence" til null i dette tilfælde.

Vælg aldrig en kandidat, der er en tydeligt forskellig råvare, bare fordi navnet ligner tekstligt. Fx er "hakket oksekød" og "hakket grisekød" forskellige nok til aldrig at forveksles, uanset fedtprocent.`;
