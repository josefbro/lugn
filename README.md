# Lugn

**Evidence-based finansplanering för svenskar** — Rational Reminder / PWL Capital-skola,
anpassad svenska skatteregler och pensions-system 2026.

> "The first step in funding a good life is finding a good life." — Benjamin Felix

## Vad finns här

```
SPEC.md                         Komplett spec v0.2 (~700 rader), källor verifierade 2026
PWL Capital - ...Felix 2026.pdf Felix' "Finding and Funding a Good Life" — inspiration för onboarding

lugn_tax/                       Ren Python skatte-DSL — ingen dependency (stdlib + numpy om man vill)
  ├─ constants.py               YearConstants: SLR, IBB, PBB, riktålder, ISK-grundavdrag
  ├─ isk.py                     ISK kapitalbas, schablon, skatt
  ├─ kf.py                      KF schablon + avtalsavgift
  ├─ k10.py                     Nya 3:12-reglerna 2026
  ├─ tjp.py                     Tjänstepension utbetalning + skatt
  ├─ allman_pension.py          Åldersgränser, PGI-tak
  ├─ depa.py                    Privat depå reavinst
  ├─ ab_pension.py              AB-pension 35%-regel
  ├─ salary_tax.py              Inkomstskatt med 65+ bonus
  └─ tests/                     20 unit tests — alla passerar

bridge_sim/                     Year-by-year cash flow + bridge-räkning
  ├─ model.py                   Plan, Account, Pension dataclasses
  └─ simulate.py                simulate_plan() + bridge_required()

demo_cli.py                     Kör ett komplett FIRE-scenario och print:ar resultatet

prototype/                      Visuell prototype — single page, ingen build
  ├─ index.html                 Hero + 3-up explainer + interaktiv FIRE-kalk + filosofi + priser
  ├─ style.css                  Lugns färgsystem (sage + cream + coral)
  └─ app.js                     Live-räkning + canvas-chart för bridge
```

## Kör testerna

```bash
python3 -m unittest discover lugn_tax/tests -v
```

Förväntad output: `Ran 20 tests in 0.000s — OK`.

## Kör demo-scenariot

```bash
python3 demo_cli.py
```

Detta kör en realistisk svensk tech-konsult, 35 år, vill FIRE vid 50:
- 1.5 MSEK ISK, 400k KF, 200k aktiedepå
- Tjänstepension 450k idag
- Allmän pension 20k/mån (uppskattning)
- Behov 35k/mån, sparar 20k/mån

Output visar bridge-pott (~17.9 MSEK i dagens penningvärde), år-för-år flöde, slutkapital.

## Kör visuell prototyp

```bash
cd prototype
python3 -m http.server 8000
# Öppna http://localhost:8000
```

Eller bara öppna `prototype/index.html` direkt i Safari/Chrome. Allt körs i browsern, inga dependencies.

Live-räkning: ändra siffrorna och se bridge-pott + FIRE-tier + chart uppdateras direkt.

## Status

- ✅ Skatte-DSL för 2026 års svenska regler (ISK, KF, K10 nya regler, TJP, AB-pension, depå)
- ✅ Bridge-modell med year-by-year cash flow
- ✅ Deterministisk simulering (Monte Carlo kommer)
- ✅ Visuell prototyp som dogfooded vid 2026-värden
- ⬜ Monte Carlo (10 000 paths)
- ⬜ Onboarding-flöde (PERMA-V à la Felix — se SPEC.md sektion 13)
- ⬜ Min Pension PDF-import
- ⬜ Wrapper-optimering (DP över skattetabeller)
- ⬜ AI-coach (Claude RAG)
- ⬜ Django + Next.js full app

## Filosofi

1. **Mål först, portfölj sen.** Investeringsstrategin tjänar livet — inte tvärtom.
2. **Akademiskt förankrat.** Fama, French, Felix, Bogle. Faktor-investering med UCITS.
3. **Sorteringsverktyg, inte rådgivare.** Inte MiFID II-rådgivning — beslutsstöd. Du väljer.
4. **Lugn, inte stress.** När börsen faller pingar inte Lugn med panik. Vi citerar Fama.

## Källor

Se SPEC.md sektion 12 för verifierade källor till alla 2026-värden:
ISK 300k-grundavdrag, K10 nya 3:12-regler, riktåldern 67, ITP-utbetalning, AB-pension 592k, etc.
