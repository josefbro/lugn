# Lugn — Granskning av underliggande antaganden

Ärlig revision av varje antagande i modellen. Märkning:
🟢 sunt · 🟡 förenklat (medvetet) · 🔴 inkonsekvens/issue att åtgärda

Senast granskad: 2026-06-06 (Opus). Två buggar hittade & fixade under denna granskning
(skiktgräns-indexering + pensionärs-grundavdrag — se #17–18).

---

## Avkastning & simulering

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 1 | Real aktieavkastning (MC + flat) | 5%/år | 🟡 På optimistiska sidan. PWL/Felix använder ~4–5% real för globalt index efter avgift. 5% är högsta rimliga. Överväg 4,5%. |
| 2 | Aktievolatilitet | 17% | 🟢 Rimligt för globalt index. |
| 3 | Student-t frihetsgrader (fat tails) | ν=5 | 🟢 Defensibelt. Lägre = tjockare svansar. ν=5 ger ~4× fler >3σ vs normal. |
| 4 | Ränte-avkastning / vol (glidbana) | 1% real / 5% | 🟡 1% real rimligt efter 2022. |
| 5 | Aktie/ränte-korrelation | 0 | 🟡 Verklig korr varierar (−0,3 till +0,5 i olika regimer). 0 underskattar diversifiering ibland, överskattar i stress. |
| 6 | **Avkastning år-för-år är oberoende (i.i.d.)** | — | 🔴 Fångar fat tails men INTE serie-korrelation/mean-reversion/momentum. Användaren bad om block-bootstrap — ej byggt. Sekvensrisk fångas delvis (slumpmässig ordning) men inte historiska kluster. **Största kvarvarande modellförenkling.** |
| 7 | Inflation | deterministisk (input) | 🟡 Verkliga planer möter inflations-osäkerhet. Ej stokastisk. |
| 8 | Valutarisk (SEK vs USD/EUR) | ej modellerad | 🟡 Användaren listade den — ej byggt. |

---

## Pension

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 9 | TJP-pott tillväxt till 65 | 4% nominellt (huvudsim) / 2% realt (skatte-opt) | 🟡 Ungefär konsekvent vid 2% inflation. Bör enhetligas. |
| 10 | TJP annuitet-ränta under utbetalning | 3% nom (sim) / 1% real (opt) | 🟡 Två olika ställen. Bör enhetligas. |
| 11 | Allmän pension | konstant realt | 🟡 Egentligen indexerad till inkomstindex (~real lönetillväxt, något över inflation). Lätt underskattning. |
| 12 | **Pension startar vid 65** (hårdkodat) | 65 | 🔴 Lägsta allmän uttagsålder 2026 är **64**, riktålder **67**. Sim antar 65 oavsett. Bör vara konfigurerbar / följa riktålder. |
| 13 | TJP kan tas ut före 55 | flaggas i insights, ej spärrat i sim | 🟡 Insight varnar men sim hindrar inte. |

---

## Skatt

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 14 | ISK schablonskatt 2026 | 1,065% (SLR 2,55% +1pp ×30%) | 🟢 Korrekt. |
| 15 | ISK grundavdrag 2026 | 300 000 kr | 🟢 Korrekt (nytt 2026). |
| 16 | Kommunalskatt | **kommun-vald, riktig 2026-sats** | 🟢 FIXAD. Alla 290 kommuner från SCB 2026 (`kommunalskatt.js`). Spann 28,93–35,65%, default snitt 33,2%. |
| 16b | **Early retirement → lägre pension** | allmän skalas (arbetsår/42), golv 35% | 🟢 NYTT. Slutar du vid R<65 → allmän pension × (R−23)/(65−23). TJP-avsättningar medan du jobbar växer potten. Transparent insight. Golv reflekterar garantipension. Approximation (linjär i år, antar above-cap-inkomst). |
| 17 | **Skiktgräns-indexering** | nu indexerad med inflation | 🟢 FIXAD under granskning. Tidigare fast nominellt → framtida år korsade felaktigt. Nu räknas allt i dagens penningvärde. |
| 18 | **Pensionärs-brytpunkt 66+** | 733 200 kr (vs 660 400 arbetande) | 🟢 FIXAD. 66+ har förhöjt grundavdrag → högre brytpunkt. Tidigare felaktig `643k+grundavdrag`-modell. |
| 19 | Huvudsimens lönesatt (success rate) vs optimerarens brytpunkt | lonTax ~703k effektiv / opt 733,2k | 🔴 Liten inkonsekvens — success-rate-simens pensionsskatt använder annan tröskel än uttagsoptimeraren. Bör enhetligas. |
| 20 | Depå reavinst | 30%, genomsnittsmetoden | 🟢 Korrekt. |
| 21 | KF avtalsavgift | ej modellerad i JS-prototypen | 🟡 Finns i `lugn_tax` (Python) men inte i webb-prototypens `iskTax`. |

---

## Uttag & brygga

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 22 | Uttagsordning | depå → ISK → KF (fast) | 🟡 Rimlig default. Intra-års skiktgräns-optimering (mellan konton) ej byggd — bara TJP-periodval. |
| 23 | Side-income (Barista/Coast) | 50% / 100% av behov till 65 | 🟡 Lugns antagande, illustrativt. |

---

## FIRE-nivåer & score

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 24 | Tier-multiplar (1/SWR) | Coast 0, Barista 10, Lean 17, FIRE 25, Fat 33 | 🟢 FIRE 25 = 4%-regeln, Fat 33 = 3%. Standard. |
| 25 | Tier min-success | 70/75/75/80/90% | 🟡 Lugns egen åsikt, defensibel. |
| 26 | Lugn-score vikter | 45/20/15/20 | 🟡 Lugns egen åsikt. |
| 27 | Skatteeffektivitet-proxy | isk + kf×0,95 / total | 🟡 Grov proxy. |

---

## Behavioral shock & avgifter

| # | Antagande | Värde | Bedömning |
|---|---|---|---|
| 28 | Krasch-procent | 2008 −50%, 2000 −45%, 2020 −34%, 70-tal −45% | 🟡 Ungefärliga, illustrativa. |
| 29 | Krasch-modell | engångs −drop vid pensionsår, ingen explicit återhämtning | 🟡 Återhämtnings-år visas men simuleras ej. |
| 30 | Fee drag | (brutto − avgift) sammansatt | 🟢 Korrekt princip. |

---

## Prioriterade åtgärder (nästa)

1. 🔴 **#12 Pension-startålder** — gör konfigurerbar, följ riktålder 67 / lägsta 64.
2. 🔴 **#6 Block-bootstrap** — addera historiska avkastnings-block för serie-korrelation.
3. 🔴 **#19 Enhetliga skattetrösklar** — låt huvudsimen använda samma pensionärs-brytpunkt som optimeraren.
4. 🟡 **#1 Sänk MU till 4,5%** — mer i linje med PWL CMA.
5. 🟡 **#9/#10 Enhetliga TJP-tillväxt/annuitet** mellan sim och optimerare.
