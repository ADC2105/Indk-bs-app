export const OFFER_EXTRACT_PROMPT = `Du udtrækker dagligvaretilbud fra en side af en dansk tilbudsavis - enten indsat som tekst eller som et eller flere billeder af avisen.

Find alle tilbud på fødevarer/dagligvarer (spring nonfood over, fx legetøj, elektronik, husholdningsartikler, der ikke er mad).

Returnér via værktøjet "gem_udtraekte_tilbud" en liste, hvor hvert tilbud har:

- heading: varens navn/overskrift, som den står i avisen.
- category: én af "frugt_grønt", "kød", "fisk", "mejeri_æg", "brød", "kolonial", "frost", "drikke", "snacks", "andet".
- ingredient_name: generisk dansk navn på hovedingrediensen i ental, uden mærkevare og uden mængde.
- pack_count: antal enheder i tilbuddet (normalt 1, eller fx 2 ved "2 for 90,-").
- pack_size: størrelsen pr. enhed som tal, altid omregnet til g eller ml (aldrig kg, l eller cl).
- pack_unit: "g", "ml" eller "stk".
- total_price: den samlede pris for tilbuddet i kroner.
- usikker: true, hvis du er i tvivl om tolkningen af pris, mængde eller vare. Ellers false.

Opfind aldrig tilbud, der ikke tydeligt fremgår af teksten/billedet. Spring uklare linjer over i stedet for at gætte vildt.`;
