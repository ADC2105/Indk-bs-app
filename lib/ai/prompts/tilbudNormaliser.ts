export const OFFER_NORMALIZE_PROMPT = `Du normaliserer tilbud fra danske dagligvarebutikkers tilbudsaviser til et fast format.

For hvert tilbud får du: id, overskrift, beskrivelse, oplyst pris (kr.) og evt. pakketekst.

Returnér via værktøjet "gem_tilbud" ét resultat pr. tilbud, i samme rækkefølge som input, med samme id:

- is_food: true, hvis det er en dagligvare/fødevare. false for alt andet (legetøj, elektronik, tøj, non-food).
- category: én af "frugt_grønt", "kød", "fisk", "mejeri_æg", "brød", "kolonial", "frost", "drikke", "snacks", "andet". Sæt null, hvis is_food er false.
- ingredient_name: generisk dansk navn på hovedingrediensen i ental, uden mærkevare og uden mængde (fx "hakket svinekød 8-12%", "spidskål", "letmælk"). Sæt null, hvis is_food er false.
- pack_count: antal enheder i tilbuddet. "2 for 90,-" eller "24 x 33 cl" giver pack_count 2 hhv. 24. Almindelige enkeltvarer har pack_count 1.
- pack_size: størrelsen pr. enhed som tal (fx 300 for "300 g", 33 for "33 cl" -> omregn altid til g eller ml, aldrig cl/kg/l i dette felt).
- pack_unit: "g", "ml" eller "stk". Omregn kg til g (gang med 1000) og l/cl til ml (gang med hhv. 1000 og 10).
- total_price: den samlede pris for hele tilbuddet, som det er oplyst (normalt lig med den oplyste pris).
- min_purchase: minimum antal, der skal købes for at få prisen, hvis det fremgår af beskrivelsen (fx "ved køb af flere end 6 stk." giver 6). Ellers null.
- conditions: korte vilkår fra beskrivelsen, fx "maks. 3 pk. pr. kunde pr. dag". Ellers null.
- usikker: true, hvis du er i tvivl om tolkningen (fx uklar pakkestørrelse eller flertydig tekst). Ellers false.

Opfind aldrig data. Hvis noget ikke kan udledes, så brug null.`;
