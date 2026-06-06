# Lugn — Evidence-based finansplanering för svenskar

**Status:** Spec v0.2 — pre-build, marknadsvaliderad mot 2026 års svenska regler, onboarding utbyggd från Felix "Finding and Funding a Good Life"
**Författare:** Josef Brolin
**Datum:** 2026-06-05
**Filosofi:** Rational Reminder / PWL Capital-skola — låg kostnad, index + factor tilts, akademiskt förankrad, beteende-medveten. Onboarding bygger på Benjamin Felix' PERMA-V-ramverk: "the first step in funding a good life is finding a good life".

---

## 1. Sammanfattning

Lugn är en **planerings-app** (inte broker, inte robo-advisor) för svenskar som vill investera evidence-based och planera pension/FI. Kärnan är:

1. En korrekt skatte-modell över alla svenska wrappers (ISK, KF, tjänstepension, AB-pension, privat depå)
2. Monte Carlo-simulering med svenska uttagsregler och åldersgränser
3. **Pensions-brygga-kalkyl** för FIRE-publiken (hur stor pott behövs för att överbrygga early retirement till tjänstepension/allmän pension kickar in)
4. Faktor-tilt portföljförslag med UCITS-instrument som faktiskt finns på Avanza/Nordnet
5. Beteende-coach (AI) som citerar Fama, Felix, Bogle vid marknads-stress

Målgrupp: ~200-500k svenskar med portfölj >500k SEK + intresse för evidence-based investering och pension/FI-planering. Subgrupper: AB-ägare, FIRE-rörelsen, "Rikatillsammans-publiken".

---

## 2. Varför nu, varför Sverige

### Konkurrensbild (juni 2026)

| Aktör | Vad de gör | Vad de INTE gör |
|---|---|---|
| **Lysa** | Robo-advisor, fonder + tjänstepension @ 0.6%/år, auto glidbana | Ingen plan, ingen Monte Carlo, ingen bridge-kalkyl, ingen AB/K10-stöd |
| **Min Pension** | Aggregerar pensionsdata från alla pensionsbolag | Ingen rekommendation, ingen optimering, ingen portföljanalys |
| **Pensionera** | App + prognos + boka licensierad rådgivare | Säljer rådgivning (vill INTE göra DIY-verktyg), bunden till sina egna fonder |
| **Pensionskraft** | Web-tool, simpel kalkyl | Föråldrat, ingen Monte Carlo, ingen modern UX |
| **Pensionsmyndighetens app** | Kollar din allmänna pension | Bara allmän, ingen helhet, ingen plan |
| **Avanza/Nordnet** | Broker + portföljvy | Ingen plan, ingen wrapper-optimering, ingen bridge |
| **Rikatillsammans** | Innehåll + Excel-mallar | Ingen app, manuellt jobb |

**Gapet:** Det finns *ingen* svensk app som gör Monte Carlo pension-planering med wrapper-medveten skatt + FIRE-brygga + factor-tilt-rekommendationer.

### Varför 2026 är rätt timing

- **300 000 kr ISK-grundavdrag införs 2026** — fundamentalt ändrar wrapper-allokeringen. Alla gamla Excel-mallar är obsoleta.
- **Nya 3:12-reglerna 2026** — förenklingsregel + huvudregel slås ihop, lönekravet bort. K10 blir modellerbart.
- **Avantis UCITS-ETFer** kom sep 2024, Dimensional UCITS lanseras sent 2025. Factor-investing blir tillgängligt för svenska privatinvesterare *just nu*.
- **Riktåldern höjs till 67 år** — FIRE-bryggan blir längre och dyrare, så planeringen blir viktigare.

---

## 3. Regulatorisk strategi (kritiskt)

### Position: verktyg, ej rådgivning

Personlig investeringsrådgivning kräver tillstånd från Finansinspektionen (MiFID II). Vi vill **inte** vara rådgivare.

**Lösning:** Position Lugn som en **"sorteringstjänst" + scenario-simulator + beslutsstödsverktyg**. Detta är ett etablerat undantag enligt FI.

### Konkreta designprinciper för att INTE vara rådgivning

| Gör så här | Gör INTE så här |
|---|---|
| "Här är ett scenario givet dina inputs" | "Vi rekommenderar att du köper..." |
| "Detta är en modell, inte rådgivning" | "Du bör flytta från KF till ISK" |
| Visa flera scenarier sida-vid-sida | Föreslå en enskild "bästa" portfölj |
| Citera akademisk forskning + Felix/Fama | Ge dina egna åsikter |
| Användaren tar alla beslut | Auto-trades, auto-rebalansering |
| Disclaimer på varje skärm | Skippa friskrivning |

### Disclaimer-mall

> Lugn är ett scenario-baserat planeringsverktyg och utgör inte investeringsrådgivning enligt MiFID II. Alla beräkningar är modeller baserade på dina inputs och historiska data. Du fattar alla investeringsbeslut själv. Vid behov av personlig rådgivning, kontakta en licensierad finansiell rådgivare.

### När/om du vill bli rådgivningsbar

Om Lugn växer kan det bli värt att söka tillstånd som "anknutet ombud" till en värdepappersinstitution. Kräver kapital, kompetens, dokumentation — skjut till v3+.

---

## 4. Tekniska kärnformler (2026 års värden)

### 4.1 ISK-schablon

```
schablonintäkt(år) = kapitalbas × (statslåneräntan_30_nov_föregående_år + 1pp)
                     # 2026: 2.55% + 1% = 3.55%

skatt(år) = max(0, kapitalbas − 300_000) × schablonintäkt_procent × 30%
            # 2026: 1.065% av kapitalbasen över 300 000 kr per person

kapitalbas(år) = (värde_1_jan + värde_1_apr + värde_1_jul + värde_1_okt
                + insättningar_under_året) / 4
```

**Viktigt 2026:** 300 000 kr-grundavdraget gäller summan av ISK + KF per person. Par = 600 000 kr skattefritt. Detta är en STOR förändring som påverkar nästan all wrapper-optimering.

### 4.2 KF-skatt

```
schablonintäkt och skatt = samma som ISK
+ försäkringsavtals-avgift (varierar 0% — 0.7%/år, parameter per användare)
+ utländsk källskatt: KF får automatiskt avräkning (fördel vs depå)
+ ISK kan inte ärvas/försäkras på liv — KF kan
```

### 4.3 Tjänstepension — utbetalning

```
typer: ITP1 (default 66 år, livsvarig), ITP2 (default 65 år, livsvarig),
       SAF-LO, KAP-KL/AKAP-KR (kommun/region), PA16 (statlig),
       privat tjänstepensionsförsäkring, direktpension (AB)

lägsta_uttagsålder: 55 år (samtliga försäkrings-typer)
utbetalningsperioder: 5, 10, 15, 20 år eller livsvarig
        # MVP: användaren väljer; default 20 år

utbetalning(t) = pott(t_start) / period_år / 12 + indexering
                 # Förenklat: livsvarig = antaganden om livslängd
                 # 50% sannolikhet att leva till ~85, använd 90 för konservativ

skatt(utbetalning) = lön_skatt(utbetalning, ålder)
                     # 65+ har högre grundavdrag + lägre statlig — modellera!
```

### 4.4 Allmän pension

```
riktålder_2026 = 67          # 2026-2031
lägsta_uttagsålder_2026 = 64 # riktålder - 3
garantipension_ålder = 67    # = riktåldern
PGI_tak_2026 = 8.07 × IBB = 56_100 kr/mån före skatt

inkomst_pension(t) = ack_pensionsrätt × delningstal(uttagsålder)
                     # Pensionsmyndigheten har tabeller — importera dem

premiepension(t) = AP7 Såfa eller egna fondval, från 64 år

allmän_pension(t) = inkomst_pension(t) + premiepension(t)
                  + garantipension om låg + bostadstillägg om låg
```

### 4.5 AB-pension (för AB-ägare)

```
max_avdrag_2026 = min(35% × lön, 10 × prisbasbelopp) = max 592_000 kr/år

direktpension: byggs av beskattad AB-vinst, ej försäkring
              # fördel: full kontroll, ärvbar
              # nackdel: inte avdragsgill, AB-bolagsskatt först

PGI för att maxa allmän pension: lön ≥ 8.07 × IBB = 56_100 kr/mån
```

### 4.6 K10 — nya 3:12-reglerna 2026

```
# Förenklingsregel + huvudregel SLÅS IHOP 2026
gränsbelopp(år) = grundbelopp + lönebaserat_utrymme + sparat_utrymme

grundbelopp_2026 = 4 × IBB = 322_400 kr   # fördelas proportionerligt per AB

lönebaserat_utrymme = max(0, 50% × andel_av_löneunderlag − 644_800)
                      # Lönekrav BORTTAGET 2026 — stor förenkling

sparat_utrymme(t) = sparat_utrymme(t-1) × 1.0966 + ej_utnyttjat(t-1)
                    # SLR + 3pp ränta på sparat utrymme

utdelning_inom_gränsbelopp: 20% skatt (kapitalbeskattat)
utdelning_över_gränsbelopp: 30% kapital eller upp till 90 IBB sen 30%
```

### 4.7 Privat depå (AKB)

```
reavinst_skatt = 30% × (försäljningspris − genomsnittligt_omkostnadsbelopp)
                 # FIFO eller genomsnittsmetoden

utdelning_svensk = 30% (källskatt 30%, betalas direkt)
utdelning_utländsk = 30% + utländsk källskatt (avräkningsbar upp till 500 kr förenklat)
```

### 4.8 Pensions-brygga cash flow (kärn-algoritm)

```python
def bridge_simulation(plan, market_returns, years=60):
    """
    Year-by-year cash flow för en FIRE/early retirement-plan.
    
    plan har:
      - retirement_age, current_age
      - need_per_month (real, dvs inflation-justerat)
      - accounts: list of (type, balance, return_assumption)
      - tjänstepensioner: list of (type, future_pott, start_age, period)
      - allmän_pension: forecast från Min Pension PDF
    """
    state = plan.current_state()
    flows = []
    
    for age in range(plan.current_age, plan.current_age + years):
        # Inkomst-sidan
        inflöden = 0
        if plan.retirement_age <= age:
            # Bestäm uttag i optimerad ordning
            need = plan.need_per_month * 12
            for account in plan.withdrawal_order(age):
                draw = min(need, account.available(age))
                inflöden += draw
                account.withdraw(draw)
                need -= draw
                if need <= 0: break
            
            # Tjänstepensioner som börjat utbetalas
            for tjp in plan.tjänstepensioner:
                if tjp.start_age <= age < tjp.start_age + tjp.period:
                    inflöden += tjp.annual_payout(age)
            
            # Allmän pension
            if age >= 64 and plan.tar_ut_allmän:
                inflöden += plan.allmän_pension_annual(age)
        
        # Skatt
        tax = compute_tax(inflöden, age, accounts=state.accounts)
        
        # Tillväxt
        for account in plan.accounts:
            account.grow(market_returns[age - plan.current_age])
            account.charge_schablon(slr=current_slr())
        
        flows.append(YearFlow(age, inflöden, tax, state.snapshot()))
    
    return flows


def withdrawal_order(plan, age):
    """
    Default ordning för Lean/Coast FIRE:
      1. Privat depå (lägst förväntad framtida skatt om grundavdrag inte fyllt)
      2. ISK över 300k (schablon redan betald, så uttag är skatte-fritt)
      3. KF över 300k
      4. ISK/KF under 300k (skatte-fritt)
      5. Direktpension/AB-pension (om åldern tillåter)
      6. Tjänstepension (beskattas som lön)
    
    Lugns optimerare räknar fram VERKLIGT optimal ordning per användare
    via dynamic programming över skattetabeller — detta är default-heuristik.
    """
```

---

## 5. FIRE-personas (kärn-feature)

Tre presets som användaren kan starta från och tweaka:

### Lean FIRE
- 25-30k kr/mån uttag (real)
- Mest aktier 90/10 till 5 år före, sen glida ner
- ISK-tung allokering (schablon dominerar vid stor pott)
- Bridge fokus: lång (15-25 år), måste tåla sekvensrisk
- Stresstest: 1970-stagflation, Japan 1990

### Coast FIRE
- Slutar spara tidigt (t.ex. 40 år), jobbar deltid till pensionering
- Lön täcker löpande, pensionsutmaning blir bara att låta pengar växa
- Optimering: hur lite kan du jobba för att inte behöva röra portföljen?
- Bridge: noll eller liten

### Fat FIRE / AB-ägare
- 50k+ kr/mån uttag
- Komplex: K10-utrymme + direktpension + privat
- Optimering: utdelning vs lön vs reinvestera-i-AB
- Skatte-arbitrage stor (gränsbelopp 20% vs tjänstepension som lön)
- Bridge: liten (eftersom AB-pension/direktpension flexibel)

---

## 6. Datamodell (kärnentiteter)

```
User
  ├─ name, email, birth_date
  └─ Household
       ├─ partners: [User]
       ├─ children: [Person]   # för pensions-planeringsantaganden
       └─ Plan
            ├─ retirement_target_age
            ├─ income_need_real (kr/mån i dagens penningvärde)
            ├─ inflation_assumption (default 2%)
            ├─ risk_tolerance (1-10)
            ├─ factor_tilt (none | mild | aggressive)
            ├─ Account[]
            │    ├─ type: ISK | KF | TJP | AB_PENSION | DIREKTPENSION | DEPÅ | AB_LIKVID
            │    ├─ institution, balance, currency
            │    ├─ avtals_avgift (för KF/TJP)
            │    ├─ withdrawal_start_age (för TJP)
            │    ├─ withdrawal_period_years (för TJP — användaren väljer)
            │    └─ Holding[]
            │         ├─ instrument (ISIN), name, type (fond|ETF|aktie|kontanter)
            │         ├─ shares, avg_cost_basis
            │         └─ category (broad_index | factor_value | factor_quality | bond | other)
            ├─ AllmänPensionForecast (från Min Pension PDF-import)
            └─ Simulation[]
                 ├─ run_at, monte_carlo_paths (default 10_000)
                 ├─ market_model (bootstrap | parametric | regime-specific)
                 ├─ result_distribution (percentiler för slutkapital)
                 └─ success_probability vid given uttagsnivå

Catalog
  ├─ Instrument[]   # Lugns katalog av rekommenderbara UCITS
  │    ├─ ISIN, name, TER, category, factor_loadings
  │    └─ available_at: [Avanza, Nordnet, SAVR, Lysa]
  └─ TaxConstant[]  # tidsserier: SLR, IBB, PBB, riktålder per år
       └─ year, slr, ibb, pbb, riktålder, isk_grundavdrag
```

---

## 7. Tech stack

```
Backend:       Python 3.12 + Django 5 + DRF
DB:            Postgres 16 + pgvector (för senare RAG)
Sim/calc:      numpy, scipy.stats, pandas
Tax-DSL:       eget paket `lugn_tax/`, ren Python (stdlib + numpy)
               # extraheras gemensamt med Real Estate Screener
LLM:           Claude API
               - claude-opus-4-7 för coach-svar och stora analyser
               - claude-haiku-4-5 för dokumentparsning, kategorisering
               - prompt caching aktivt
Frontend:      Next.js 15 + Tailwind + shadcn/ui, PWA-mobile-first
Charts:        Recharts (fan charts, cash flow timelines)
Hosting:       Fly.io (~100 kr/mån initialt, skalas linjärt)
Auth:          Magic link via Resend, BankID senare via Criipto
Bank-data:     CSV-import (Avanza, Nordnet) MVP; Tink i v2
Pension-data:  Min Pension PDF-export → Claude parsing (haiku)
Domän:         lugn.se (kolla ledig först)
```

---

## 8. MVP-scope (4 veckor, 50-80 timmar)

### Vecka 1 — Skatte-DSL + datamodell
- `lugn_tax/` paket med ren Python: ISK, KF, K10 (nya 2026-regler), depå, AB-pension
- 2026 års konstanter (SLR 2.55%, IBB 80 600, riktålder 67, etc.)
- Year-by-year cash-flow-motor med bridge-stöd
- Unit tests för varje skatte-funktion mot Skatteverket-exempel
- Django-projekt + modeller + admin

### Vecka 2 — Import + dashboard
- CSV-parser Avanza (innehav-export)
- CSV-parser Nordnet (innehav-export)
- Min Pension PDF → strukturerad data via Claude
- Magic-link auth
- Dashboard: "Din pensionsbild idag" — alla wrappers, allokering, total

### Vecka 3 — Monte Carlo + FIRE-personas
- 10 000 simuleringar, bootstrap från Fama-French + svensk bostads-/obligationsindex
- Tre FIRE-presets med en-klicks-applicering
- "Bridge-pott behövs"-kalkyl
- "Coast FI-ålder"-kalkyl
- Spara-mer / Jobba-längre trade-off-graf
- Fan chart visualisering

### Vecka 4 — Wrapper-optimerare + landing + alfa
- Optimal uttagssekvens via dynamic programming över skattetabeller
- "Du har X i KF som skulle gett Y mer netto i ISK — flytta Z"
- Stresstest mot 1970-stagflation, Japan 1990-2010, 2008
- Landing-sida med wait-list ("Beta — 50 första gratis i 6 mån")
- Inlägg i r/SwedishPersonalFinance, Twitter/X till 5-10 svenska FIRE-konton

### Efter MVP: V2-prioriteter
- AI-coach (RAG på akademisk litteratur + Rational Reminder transcripts)
- Tink-integration för auto-portfölj-sync
- Rebalansering-rec med skatteefficiens
- AB-ägare-specifika flöden (K10 + direktpension-optimering)
- Försäkringsanalys (livförsäkring, sjukvård)

---

## 9. Faktor-tilt produktkatalog (svenska UCITS)

| Faktor | Instrument | TER | Tillgänglig |
|---|---|---|---|
| **Bred världsindex** | Avanza Global, Länsförsäkringar Global Indexnära | 0.10-0.20% | Avanza, Nordnet, SAVR |
| **Value (global)** | iShares Edge MSCI World Value (IWVL) | 0.30% | Avanza, Nordnet |
| **Quality (global)** | iShares Edge MSCI World Quality | 0.30% | Avanza, Nordnet |
| **Size (global)** | iShares Edge MSCI World Size | 0.30% | Avanza, Nordnet |
| **Small Cap Value** | Avantis Global Small Cap Value (IE0003R87OG3) | 0.39% | Nordnet (begärs) |
| **Targeted Value** | Dimensional Global Targeted Value UCITS (DGTV) | ~0.40% | Lanseras sent 2025 |
| **Core Equity** | Dimensional Global Core Equity UCITS (DGCE) | ~0.25% | Lanseras sent 2025 |
| **Obligationer** | XACT Obligation, Vanguard Global Bond | 0.20-0.30% | Avanza, Nordnet |

Lugn rekommenderar inte enskilda instrument — den visar **kategorier** och pekar på exempel-instrument per kategori. Användaren väljer själv (sorteringstjänst, ej rådgivning).

---

## 10. Distribution + prissmodell

### Distribution
1. **Rikatillsammans-podden** — Jan Bolmeson älskar evidence-based, gästa
2. **r/SwedishPersonalFinance, r/sweden-FIRE** — veckovis innehåll
3. **FIRE-Twitter/X** — Frihetsmaskinen, Onkel Tom, Sparafarmor (om hen är på X)
4. **Lead magnet:** PDF-guide "Evidence-based pension för svenskar 2026" (gratis nedladdning)
5. **Bok**: V2 — kortbok "Evidence-based FI för svenskar" på Amazon Kindle

### Pris
- **Free**: läsa portfölj, en basic Monte Carlo per månad, default-personas
- **Plus** 99 kr/mån eller 990 kr/år: full Monte Carlo, wrapper-optimering, alla stresstest, alla personas
- **Pro** 199 kr/mån eller 1990 kr/år: AB-ägare-modul (K10 + direktpension-optimering), AI-coach, rebalansering-rec

### Måltal
- M3: 100 beta-användare
- M6: 500 användare, 50 betalande @ Plus = 5k kr/mån
- M12: 2000 användare, 200 betalande = 20-30k kr/mån
- M24: 10 000 användare, 1000 betalande = 100-150k kr/mån

---

## 11. Risker + öppna frågor

### Tekniska
- **Premiepensionsdata** — ingen öppen API, måste parsa PDF eller skraper Pensionsmyndigheten med BankID. Klarar Claude haiku det? Test i v1.
- **Tjänstepensions-data fragmenterat** — Alecta, AMF, Skandia, Folksam har olika format. MVP: manuell inmatning från Min Pension PDF.
- **Faktor-data** — Fama-French europeisk historik är kortare. Var transparent.

### Regulatoriskt
- **Sorteringstjänst-gränsen** — om Lugns optimerare blir för specifik kan FI hävda att det är rådgivning. Behåll alltid "scenario"-språkbruk + flera alternativ visas.
- **GDPR** — finansiell data är känslig. Kryptering at-rest, audit logs, EU-hostat (Fly.io Stockholm).

### Marknads
- **Lysa** kan börja erbjuda planeringsverktyg som komplement till robo. Mitigering: vi är inte broker, ingen intressekonflikt → mer trovärdig.
- **Avanza** kan rulla ut en "planera"-funktion. Mitigering: vi har wrapper-arbitrage (de tjänar på depå/ISK, vi ger oberoende råd).

### Öppna beslut för dig
1. Bygga Plus + Pro samtidigt eller börja med bara Plus?
2. Live-bank-koppling (Tink) i v2 eller v3? (Cost ~3000 kr/mån startavgift)
3. Solo eller bjuda in en designer-vän? (UX är kritiskt för "förtroende" i finans-app)
4. Namn "Lugn" — kolla domän + söka ledigt varumärke i klass 9 + 36

---

## 12. Källor

**Pensionsregler 2026:**
- [Riktålder för allmän pension — Pensionsmyndigheten](https://www.pensionsmyndigheten.se/ga-i-pension/planera-din-pension/pensionsaldrar-och-riktalder)
- [Olika åldersgränser för pensionsuttag — Min Pension](https://www.minpension.se/allt-om-pensioner/ta-ut-pension/olika-aldersgranser-for-pensionsuttag)
- [Pension för dig som är egen företagare — Pensionsmyndigheten](https://www.pensionsmyndigheten.se/forsta-din-pension/vad-paverkar-din-pension/du-som-ar-foretagare)

**ISK + KF 2026:**
- [Så blir ISK-skatten 2026 — Fondkollen](https://fondkollen.se/skatt/sa-blir-isk-skatten-2026/)
- [Så hög kan ISK-skatten bli 2026 — Morningstar Sverige](https://global.morningstar.com/sv/privatekonomi/s-hg-kan-isk-skatten-bli-2026)
- [Investeringssparkonto (ISK) — Skatteverket](https://www.skatteverket.se/privat/skatter/vardepapper/investeringssparkontoisk.4.5fc8c94513259a4ba1d800037851.html)

**K10 / 3:12 2026:**
- [Guide: K10-blanketten 2026 — Talenom](https://talenom.com/sv-se/blog/guider/guide-k10-blanketten-2026/)
- [Nya 3:12-regler träder i kraft 1 januari 2026 — PwC](https://blogg.pwc.se/taxmatters/nya-312-regler)
- [Nya 3:12-reglerna från 2026 — Företagarna](https://www.foretagarna.se/driva-eget-foretag/handbocker-och-guider/handbok-312-reglerna/nya-312-reglerna-fran-2026/)
- [3:12-reglerna för Fåmansbolag 2025 och 2026 — Strathus](https://strathus.se/312-reglerna-for-famansbolag-2025-2026/)

**Tjänstepension:**
- [Uttagsregler tjänstepension ITP — Swedbank](https://www.swedbank.se/privat/pension/nar-du-narmar-dig-pension/uttagsregler/kollektivavtalad-tjanstepension/uttagsregler-tjanstepension-itp.html)
- [Tjänstepension ITP — Pensionsmyndigheten](https://www.pensionsmyndigheten.se/forsta-din-pension/tjanstepension/privatanstalld-tjansteman)
- [Egenföretagare kan stoppa in 592 000 kronor i tjänstepension — Dagens PS](https://www.dagensps.se/privatekonomi/pension/egenforetagare-kan-stoppa-in-592-000-kronor-i-tjanstepension-sa-maxar-du-avdraget-2026/)

**Konkurrenter:**
- [Lysa Pension](https://www.lysa.se/pension)
- [Min Pension](https://www.minpension.se/)
- [Pensionera](https://www.pensionera.se/)
- [Pensionskraft](https://my.pensionskraft.se/)

**Regulatoriskt:**
- [FI:s syn på automatiserad rådgivning — Finansinspektionen](https://www.fi.se/sv/publicerat/sarskilda-pm-beslut/2017/fis-syn-pa-automatiserad-radgivning/)
- [Robotrådgivare marknadsöversikt — Pensionsmyndigheten](https://www.pensionsmyndigheten.se/content/dam/pensionsmyndigheten/blanketter---broschyrer---faktablad/publikationer/rapporter/2018/Robotr%C3%A5dgivare%20-%20en%20marknads%C3%B6versikt.pdf)
- [Vägledning om robotrådgivning — Pensionsmyndigheten](https://www.pensionsmyndigheten.se/content/dam/pensionsmyndigheten/blanketter---broschyrer---faktablad/publikationer/rapporter/2021/Vagledning-om-robotradgivare.pdf)
- [Reglerna i korthet (MiFID) — Finansinspektionen](https://www.fi.se/sv/marknad/vardepappersmarknad-mifidmifir/reglerna-i-korthet/)

**Faktor-ETF:**
- [iShares Edge MSCI World Value Factor UCITS ETF](https://www.justetf.com/en/etf-profile.html?isin=IE00BP3QZB59)
- [Avantis Global Small Cap Value UCITS ETF](https://www.avantisinvestors.com/ucitsetf/avantis-global-small-cap-value-ucits-etf/)
- [Dimensional readies systematic active ETFs in Europe — ETF Stream](https://www.etfstream.com/articles/dimensional-fund-advisors-readies-systematic-active-etf-duo-in-europe)

**Open Banking:**
- [Tink — European open banking platform](https://tink.com/)
- [Finshark](https://www.finshark.io/)

**Onboarding-ramverk:**
- Benjamin Felix, "Finding and Funding a Good Life", PWL Capital, 2022 — finns i projektmappen
- Seligman (2011) — PERMA-modellen
- Bond, Carlson, Keeney (2008, 2010) — varför folk missar hälften av sina mål
- Fishbach (2022) — *Get It Done* — goal systems, approach vs avoidance
- Jebb, Tay, Diener, Oishi (2018) — income satiation points

---

## 13. Onboarding — "Hitta livet innan du finansierar det"

Felix' centrala insikt: **människor är dåliga på att identifiera sina egna mål**. I forskning av Bond, Carlson & Keeney (2008) missade deltagare ~50% av de mål de själva senare bedömde som personligt viktiga. Standard "vad är dina mål?" är otillräckligt. Och Felix poäng: investeringsstrategi tjänar målen, inte tvärtom — så onboarding måste börja med målen, inte risk-toleransen.

Lugns onboarding är därför inte en vanlig riskprofil-enkät utan en **vägledd reflektion** baserad på Felix' PERMA-V-ramverk + Bond-Carlson-Keeney's "challenge"-metodik.

### Strategiskt val

Onboardingen är **lång och tankeväckande** — 10-15 min, inte 60 sekunder. Detta är en differentierare:
- Skapar bindning ("jag har redan investerat tid i denna app")
- Filtrerar bort fel målgrupp (vill inte ha tradern som söker hot tips)
- Genererar data som ingen annan har — kan informera AI-coachen senare
- Positionerar Lugn som "den seriösa appen" från första klick

### Sju steg

#### Steg 1 — Vad är ett gott liv för dig? (Generating Objectives)

Fri inmatning:
> Innan vi pratar om pengar — vad är viktigt för dig i livet? Skriv minst 5 saker. Var konkret. Vad skulle ett gott liv för dig se ut som? Tänk på relationer, hälsa, arbete, fritid, var du bor, vad du vill skapa, vem du vill bli.

Vänta minst 2 minuter innan nästa knapp aktiveras. Visa Felix-citat i sidofältet:
> "The first step in funding a good life is finding a good life." — Benjamin Felix

#### Steg 2 — Utmaning: dubbla listan (Challenge prompt)

Visa användarens lista. Be om mer:
> Forskning visar att folk normalt missar nästan hälften av de mål de senare bedömer som viktigast (Bond, Carlson & Keeney, 2008). Försök fördubbla din lista. Tänk på saker du tidigare drömt om, det du saknar i livet idag, eller det du tar för givet.

#### Steg 3 — Kategori-prompt (PERMA-V som tankehjälp)

Visa de sex PERMA-V-kategorierna med en fråga per:

| Kategori | Fråga |
|---|---|
| **Positiv emotion** | Vilka små glädjeämnen vill du aldrig vara utan? Vad är du tacksam för? |
| **Engagemang** | I vilka aktiviteter tappar du tidskänslan? Vad är du bra på som du också tycker är meningsfullt? |
| **Relationer** | Vem skulle du vilja träffa oftare? Hur mår dina viktigaste relationer? |
| **Mening** | Vilket bidrag vill du göra till världen, din familj, ditt samhälle? |
| **Prestation** | Vad vill du bli bättre på? Vad vill du ha åstadkommit om 5 år? |
| **Vitalitet** | Hur är din kost, träning, sömn? Vad skulle göra dem bättre? |

Efter varje fråga — möjlighet att lägga till mål till listan.

#### Steg 4 — Approach vs Avoidance-disposition (1 min)

4 påståenden, skala 1-7 (Fishbach, 2022):
1. När jag vill ha något ger jag mig hän helt för att få det
2. När jag ser en möjlighet till något jag gillar blir jag direkt taggad
3. Jag oroar mig för att göra fel
4. Kritik eller tillrättavisning gör verkligen ont

Klassificera: höga 1+2 = **Approach** (mot något), höga 3+4 = **Avoidance** (bort från något). Mixad = båda. Detta lagras på profilen och styr framtida coach-meddelandens framing.

#### Steg 5 — Vilka mål är finansierbara? (Translate to financial planning)

Visa hela listan + AI-förslag på hur varje mål kan kategoriseras:

| Mål-typ | Exempel | Lugn modellerar det? |
|---|---|---|
| **Behöver pengar nu** | Köpa hus, bil, fritidshus | Kassaflöde-mål |
| **Behöver pengar i framtiden** | Pension, barns utbildning, sabbatsår | FI-mål — Monte Carlo |
| **Behöver tid (inte pengar)** | Mer tid med familjen, lära mig laga mat | "Income satiation"-prompt |
| **Behöver beteende (inte pengar)** | Träna 3 ggr/v, sova 7h | Lagras som "soft goals" — coach kan påminna |
| **Inte finansiellt** | Bli bättre på relationer | Bara erkänns, ej modelleras |

Användaren bekräftar vilka kategorier varje mål hamnar i. Lugn lagrar alla mål, även icke-finansiella — de informerar coach-tonen senare.

#### Steg 6 — Income satiation-reflektion (2 min)

Två frågor (från Jebb et al., 2018, anpassat svenskt):
1. **Om du tjänade 10 000 kr mer per månad (efter skatt) — vad skulle du göra med dem?** Fri text.
2. **Skulle du jobba 3 timmar extra per dag för att tjäna betydligt mer?** Ja / Nej / Beror på vad.

Visa resultat:
> Global forskning (Jebb, Tay, Diener, Oishi 2018) visar att lyckan av extra inkomst planar ut runt 600 000-950 000 kr/år. Du angav att du skulle använda 10k extra på X. Tänk på: är det X som faktiskt skulle förbättra ditt liv? Eller är det något du kan ge dig själv idag inom befintlig budget?

Detta är inte ett mål-steg utan ett pedagogiskt steg — det förbereder användaren för att Lugn kommer ifrågasätta antaganden.

#### Steg 7 — Finansiella målens parametrar

Nu, för varje "Behöver pengar"-mål från steg 5, en kort form:

| Fält | Default |
|---|---|
| Mål-namn | (från steg 5) |
| Abstrakt form | (från steg 5 — användaren omformulerar gärna till "desired state") |
| När i livet? | Ålder eller datum |
| Hur mycket (idag-värde)? | kr |
| Hård deadline? | Ja / Nej (påverkar hur Monte Carlo presenterar success rate) |
| Är detta målet eller medlet? | Ofta är användarens "köp ett hus" ett medel mot "stabilitet" |

För pensionering specifikt:
- "Vill du sluta jobba helt eller jobba mindre?" — Felix poäng: working longer at an enjoyable job kan ändra hela planen dramatiskt
- "Vill du jobba med något annat som ger lägre inkomst?" → halv-Coast-FIRE scenario
- "Vilken månadsutgift täcker det goda livet?" — INTE "vilken månadsutgift har du nu"

### Output av onboarding — Goals System

Användaren får en visualisering av sitt **goals system** (Fishbach, 2022):

```
                    [Det goda livet]
                    /      |       \
       [Trygghet]   [Frihet]   [Familj-tid]
        /     \         |          /     \
   [Buffert] [Pension] [Sabbatsår] [Mer tid hemma] [Resa]
       |       |          |              |          |
   [Spara]  [ISK+TJP]  [Bridge-pott]  [Jobba 80%] [Resefond]
```

Detta är **användarens egen modell**, inte Lugns. Plan-objektet i datamodellen sparar:
- Top-level abstrakta mål (PERMA-V-taggade)
- Sub-mål
- Finansiella mål (medel)
- Vilka medel som är multifinal/equifinal/unifinal (för "weakening link"-varning)

### Onboarding-version 2 (senare)

- "End of history illusion"-prompt — be användaren skriva ett brev till sig själv om 10 år, peka på Quoidbach et al. (2013): "Dina värderingar lär ändras mer än du tror"
- Regret-reflektion (Felix kap 5) — "Vilka beslut har du ångrat? Aktion eller inaktion?"
- Partner-onboarding — par fyller separat, sen jämför Lugn deras goals systems
- Re-onboarding-påminnelse var 12:e månad ("Dina mål kan ha ändrats — vill du uppdatera?")

### Datamodell-tillägg

```
Plan
  ├─ goals_system: tree-struktur av Goal-noder
  └─ Goal
       ├─ text: str
       ├─ perma_v_category: enum
       ├─ abstraction_level: top | sub | means
       ├─ type: financial_need | time_need | behavior | other
       ├─ target_age, target_amount_real
       ├─ is_hard_deadline: bool
       └─ parent_goal_id: FK

UserDisposition
  ├─ approach_score: 1-7
  ├─ avoidance_score: 1-7
  ├─ income_satiation_answer: text
  ├─ work_more_for_money: enum
  └─ life_letter: text (V2)
```

### Tonal princip för coach (sätts av onboarding)

Lugn AI-coach använder dispositionsdata + goals system för att skräddarsy framing:
- **Approach-användare** får framing: "du är på väg mot X — så här tar du nästa steg"
- **Avoidance-användare** får framing: "din plan skyddar dig mot X — så här undviker du Y"
- **Vid marknads-stress** citerar coach Felix/Fama men ramar in det runt *användarens egna abstrakta mål* från onboardingen, inte generiska argument

