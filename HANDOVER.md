# Lugn — Handöver till nästa session

**Datum:** 2026-06-08  
**Senaste commit:** `b79bb26` (MC-motor: multivariat Student-t + flertillgångar med svenska obligationer)  
**Repo:** https://github.com/josefbro/lugn  
**Live:** https://josefbro.github.io/lugn/  
**Dev-server:** `python3 -m http.server 8765` kör i `Projects/Lugn/prototype/`  
**Cache:** `?v=55` — bumpa alltid vid HTML/CSS/JS-ändringar  

---

## Vad projektet är

**Lugn** = evidensbaserad svensk FIRE/pensions-planerare. Inspirerat av Rational Reminder/Ben Felix. Statisk frontend (HTML + vanilla JS), deployad på GitHub Pages via Actions. Filosofin: "Hitta livet *innan* du finansierar det." — en *plan*, inte en kalkylator. Alla beräkningar måste stämma.

**Målgrupp:** Svenska löntagare 30–55 år som vill veta när de kan bli ekonomiskt fria, om pengarna räcker, och vågar leva. "Tjänar bra men blir inte rik."

---

## Fil-struktur

```
Projects/Lugn/
├── prototype/              ← HELA frontend-appen (detta är vad som deployas)
│   ├── app.js              (2 968 rader — all logik)
│   ├── index.html          (799 rader — all HTML)
│   ├── style.css           (1 512 rader)
│   ├── onboarding.js       (348 rader — 6-stegs onboarding-overlay)
│   ├── onboarding.css      (531 rader)
│   ├── kommunalskatt.js    (window.KOMMUNALSKATT_2026 — 290 kommuner)
│   └── market_history.js   (MSCI World USD, SIXRX SEK 1900-2025, USD/SEK FRED)
├── Reseach Material/       ← Kahneman, Pompian, Felix/PWL (copyrightskyddade böcker)
├── MARKET_RESEARCH.md      ← RT-forum-analys, pain points, betalningsvilja
├── RESEARCH_SYNTHESIS.md   ← Syntes av de tre böckerna → 10 designprinciper
├── TECH_REFERENCE.md       ← Alla skatte-/pensionsformler med källor
├── ASSUMPTIONS.md          ← Kassaflödes-audit (3 kritiska buggar lösta)
├── HANDOVER.md             ← DETTA DOKUMENT
├── SPEC.md, ROADMAP.md     ← Produktspec + roadmap
└── .github/workflows/      ← GitHub Actions → Pages
```

---

## app.js — kritiska sektioner

### Skattemotor (incomeTax, lonTax)
**Skatteverket SKV 433, 2026. VIKTIG — ändra aldrig utan att verifiera mot källan.**
- `PBB_2026 = 59_200`, `SKIKTGRANS_2026 = 643_000`
- `grundavdragOrd(x)` — glidande grundavdrag (5 intervall)
- `grundavdragForhojt(x)` — **tillägg** 66+ (12 intervall) — summas med ordinarie
- `jobbskatteavdrag(ai, gaOrd, kRate)` — arbetsinkomst <66, reducerar bara kommunalskatt
- `incomeTax(income, age, earned)` — `earned=true` för lön/deltid, `false` för pension
- `lonTax(income, age)` → alias för `incomeTax(income, age, false)`

### simulate(inputs, opts)
Deterministisk kassaflödes-motor. Hanterar:
- Bolån (amorteras, ränta efter avdrag, försvinner vid avbetalning)
- Deltidsinkomst (`sideIncomeAnnual`, `partTimeUntilAge`) — netto, inflationsjusterad
- Engångsutgifter (`bigExpenses = [{age, amount, label}]`) — dras ur ISK→KF→depå
- Pensioner i tre delar med egna startåldrar (TJP, allmän, premie)
- Skatteeffektiv uttagsordning: ISK→KF→depå
- `ran_dry = true` om portföljen tar slut

### Monte Carlo (runMonteCarlo)
**Multivariat Student-t (ν=5)** med tre tillgångsklasser: world (MSCI, SEK), sweden (SIXRX), bondsSE. Cholesky-dekomponering. `MC_PATHS = 5_000`. `ROBUST_SR = 0.80` är den fasta tröskeln (tier-systemet tas inte av användare).

### Behovsbaserad sannolikhet
- `planSustains(inputs, retireAge)` — ≥80% MC → hållbar
- `earliestSustainAge(inputs)` — binärsöker tidiga ålder (monoton → snabb)
- `maxSustainableNeed(inputs, retireAge)` — max behov vid ≥80%
- `MC_PATHS_QUICK = 600` används i svep/sök-funktionerna

### getInputs()
Läser ALLA fält inkl. bolån, deltid, löneväxling, engångsutgifter. **numv(id)** läser text-fält med mellanslag-separering. **setNumVal(id, n)** skriver formaterat.

### Viktiga konstanter (2026, verifieras årligen)
```
ALLMAN_EARLIEST = 63      Lägsta uttagsålder allmän pension
VAXLINGSFAKTOR  = 1.058   Arbetsgivaravgift 31,42% - SLS 24,26% = ~5,8%
LONEVAXLING_GOLV = 56_087  8,07 IBB — lön efter växling får ej understiga
BRYTPUNKT_ARBETANDE = 660_400  Statlig skatt < 66 år
BRYTPUNKT_PENSIONAR = 751_100  Statlig skatt 66+ (förhöjt grundavdrag)
ISK_GRUNDAVDRAG = 300_000  ISK/KF-grundavdrag 2026 (ny!)
```

---

## Senaste 20 commits (vad som finns)

| Commit | Feature |
|---|---|
| `b79bb26` | MC: multivariat Student-t + obligationer (ej fullt integrerat i UI ännu) |
| `ec84c2b` | Fee & friction visualizer — "spara 71% mer" + simplicity tax |
| `8a7370d` | Longevity-slider (80–105, default 95) + inflation köpkraftsspegel |
| `bfe2ec6` | Human capital → financial capital graf (North Star) |
| `55a0d0c` | Löneväxling: avtals-medveten varning (privat vs offentlig sektor) |
| `ecdb801` | Löneväxling-fält med golvvarning (8,07 IBB) |
| `b55c2a3` | RESEARCH_SYNTHESIS.md — Kahneman/Pompian/Felix syntes |
| `47b9073` + `31ac15c` | Större framtida utgifter (bröllop, bil, renovering) |
| `c7f0bc2` | Riktig inkomstskatt (SKV 433 2026) — stor korrekthetshöjning |
| `e0c00f7` | Deltid efter frihet (25/50/75 %) |
| `956de08` | Fördjupning-hopfällbar (analysverktyg dolda som default) |
| `c8ac1f4` | Mellanslag-separering (2 000 000) |
| `89ad6c7` | Trygghet-läget (buffert + motståndskraft + tillåtelse att spendera) |
| `3885337` | Responsiv mobilanpassning |

---

## UX-arkitektur

**Sidan är strukturerad:**
1. **Onboarding** (6 steg, modal overlay) → fyller kalkylatorn + sparas i localStorage
2. **Kalkylatorn** (två kolumner: inputs vänster, resultat höger)
   - **Vänster inputs:** ålder/frihet, behov, deltid, dina pengar, bolån (slider+krav), framtida utgifter, pension (lön, avtals-TJP, löneväxling, allmän pension)
   - **Höger resultat:** plan-hero (score+frihetålder) → insikter → SR-slider → Trygghet-panel → Human capital-graf → Livscykel-graf → Pensions-brygga-graf → Fördjupning (hopfällt)
3. **Fördjupning** (`<details>`) — ISK vs depå, historisk backtesting, uttagsoptimering, kraschtest, avgifter/friktion
4. **Sidans nedre del** — filosofi-sektion + priser (beta)

**Reset-knapp** (↺ i hörnet): `showOnboarding()` — nollställer localStorage + formulär.

---

## Kända issues / varnanden

1. **MC multivariat (`b79bb26`)** — koden finns men är ej fullt träd-integrerad i UI:t. `portfolioWeightsAtAge()` och `buildMcContext()` är klara, men glidbanans obligationsandel är inte kopplad till UI-sliders. **Testa noggrant om du ändrar MC-motorn.**

2. **Löneväxling + ordinarie TJP** — modellen räknar ordinarie pension på lönen FÖRE växling (korrekt), men privat sektor (ITP1) kräver att detta stands i avtalet. Varnas med text men inte "enforced" i modellen.

3. **Human capital-grafen** (`drawHumanCapitalChart`) — ritar bara under ackumulerings-fasen (age→retire). Om salary=0 visas ett tomt meddelande. Livslängd efter retire ingår inte i HC (HCs sanning: HC avslutas vid frihet).

4. **`lifespan`-fältet är nu en slider** (v54) — gamla users med localStorage-sparad `lifespan: 90` får 90, nya får 95. Det är OK men notera avvikelsen.

5. **Engångsutgifter** är inte sparade i localStorage (rensas vid sidladdning). Design-val — kan ändras om det känns fel.

6. **Skuldkvotsbaserat amorteringskrav** är korrekt borttaget (slopat 1 apr 2026). `amorteringskrav(loan, propertyValue)` tar nu bara tvåparametrar.

---

## Nästa saker att bygga (prioritetsordning)

### Klara av de 4 features (från användarens lista)
- ✅ #2 Human capital → financial capital
- ✅ #3 Fee & friction visualizer
- ✅ #4 Longevity + inflation stress-test
- ⏭ **#1 Happiness-adjusted spending (CSV)** — återstår. Stor feature. Kräver CSV-uppladdning + beteende-audit UI. Bäst som premium-modul.

### Personalisering (hög beslutsnytta, litet jobb)
- **A: Spegla målen** — visa användarens egna ord från onboarding (steg 6: "vad vill du ha mer tid till") i resultatet och kraschtestet. localStorage-nyckel: `_lugn_goals`. Trigger: om `window._lugn_goals` finns, lägg in i plan-hero-sub och i krasch-noten.
- **B: Motivationen styr vyn** — `answers.motivation` (fire/pension/optimera/nyfiken) styr insikternas ordning och om Fördjupning auto-öppnas.
- **C: Approach/avoidance-ton** — insikternas språk (möjlighet vs trygghet).

### Betal-infrastruktur (Fas 2)
- Backend behövs för konton och betalning (Supabase + Stripe Checkout).
- Tills dess: lägg in `data-premium`-attribut på premium-funktioner + e-post-infångning (väntelista).
- Premium-features: engångsutgifter, löneväxling, deltid, human capital (kandidater att gata).
- AB-ägare: K10/3:12-modulen (199/1990 kr i pris-sektionen).

### Korrekthetsgränsen att hålla
> "Det är ju super super viktigt att beräkningarna som görs är rätt — annars är ju sidan inget värd."

Verifiera alltid mot Skatteverket/Pensionsmyndigheten vid årsändringar:
- PBB, IBB, skiktgräns, grundavdragsintervall, LONEVAXLING_GOLV — uppdateras varje år
- ISK_GRUNDAVDRAG 300k — ny 2026, kan ändras
- Amorteringskraven (FI) — nyligen ändrade (2026-04-01)

---

## Verktygstips

```bash
# Servera lokalt
cd ~/Documents/Claude/Projects/Lugn/prototype
python3 -m http.server 8765   # (redan igång i bakgrunden)

# Testa i Chrome via MCP
# tabId: 1995511201 — brukar vara Lugn-tabben

# Bumpa cache (gör ALLTID vid ändringar)
sed -i '' 's/?v=55/?v=56/g' index.html

# Läs siffror ur fält korrekt (strippar mellanslag)
numv("iskBalance")   # ej +$("iskBalance").value

# Skriv siffror formaterat
setNumVal("iskBalance", 2000000)  # → "2 000 000"

# All Monte Carlo går via simulate() → korrekt kaskad
# Ändra aldrig avkastnings-/skatte-logik utan att köra igenom MC-validering
```

---

## Josef-profil (relevant för tone/features)
- 26 år, Nässjö ↔ Stockholm-pendlare, bor på GRAD Hotel (dubbelbosättning)
- Gillar Rational Reminder, evidensbaserat, factor investing — INTE trading/stock-picking
- Bygger även: GRAD Kvitto (kvittolog), Real Estate Screener, Personal Finance (Gemini-kategorisering), Skärgårdskyrkan CRM

Lugn är hans egna app men med ambition att bli en riktig produkt för andra.
