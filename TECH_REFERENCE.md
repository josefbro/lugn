# Lugn — Teknisk referens (källa-till-sanning)

Auktoritativ spec med exakta endpoints, formler och lagstadgade siffror.
Matas till bygg-agenter för att eliminera hallucination. Verifiera siffror årligen.

---

## 1. Data-ingestion (Fas 3 — backend + regulatoriskt)

### BankID
- **API:** BankID Developer API v6 — https://developers.bankid.com/api-references
- **Flöde:** standard auth-loop `/rp/v6.0/auth` + `/rp/v6.0/collect`
- **Krav:** animerade QR-koder, autostart-parametrar för in-app-redirect
- **Leverantör för enkel integration:** Criipto (abstraherar RP-certifikat)

### Open Banking (PSD2)
- **API:** Tink — https://docs.tink.com/resources/open-banking
- **Använd:** Account Aggregation API → realtids checking accounts, lån, portföljobjekt (standardiserade JSON-scheman)
- **Alt:** Finshark (svenskt), open-source PSD2-wrappers
- **Kostnad:** ~3000 kr/mån startavgift — vänta till revenue

### MinPension
- **Källa:** minPension Handbok — https://www.minpension.se/media/zqajzztz/handbok-minpension.pdf
- **Arkitektur:** XML/JSON-backends via centraliserade statliga API-gateways (Pensionsmyndigheten kör Gravitee open-source gateway)
- **Datastruktur — gruppera ALLTID i exakt tre kategorier:**
  ```json
  {
    "allmanPension": { "inkomstpension": 0, "premiepension_PPM": 0 },
    "tjanstepension": [ { "typ": "ITP1|ITP2|SAF-LO|AKAP-KR|KAP-KL|PA16", "varde": 0 } ],
    "privatPension": 0
  }
  ```
- **MVP:** mock-parser som importerar kombinerad pensionsportfölj från PDF-export (Claude haiku)

---

## 2. Simuleringsmotor

### Avkastningsmodell — INTE statisk ränta
- **Filosofi:** PWL Capital Capital Market Assumptions (Ben Felix / Braden Warwick)
- **Förbud:** `Balance * (1 + rate)` statisk loop
- **Krav:** Block-bootstrapping ELLER Student's t-fördelning, med periodiska negativa sequence-of-return-fall
- **Status i Lugn:** ✅ Student-t (ν=5) implementerad i `app.js` `randStudentT()`

### AP7 Såfa glidbana (livscykel)
- **Källa:** AP7 Såfa — https://www.ap7.se/
- **Hårdkodad default-livscykel (statens premiepensions-default):**
  - **100% aktier** upp till **55 år**
  - Linjär infasning av räntor **3–4% per år** från 55
  - Slutmix vid **75 år: 33% aktier / 67% räntor**
- **Status i Lugn:** ✅ implementerad som valbar glidbana-toggle
- **Antaganden Lugn använder:** aktier real 5% / σ 17%, räntor real 1% / σ 5%, korr ≈ 0

---

## 3. Skatt & wrappers (lagstadgade siffror)

### ISK schablonbeskattning
- **Källa:** Skatteverket — Statlig inkomstskatt-regler
- **Formel:**
  ```
  Skattebas = Kapitalunderlag × (Statslåneränta 30 nov föregående år + 1,0%)
  Skatt      = 30% × Skattebas
  ```
- **2026-värden:** SLR 30 nov 2025 = 2,55% → schablonintäkt 3,55% → effektiv skatt **1,065%**
- **Golv:** schablonintäkten kan ej vara lägre än 1,25%
- **NYTT 2026:** grundavdrag **300 000 kr** per person (summa ISK + KF), skattefritt
- **Status i Lugn:** ✅ `lugn_tax/isk.py` + `app.js` `iskTax()`

### Aktie- & fondkonto (AF/depå)
- 30% kapitalvinstskatt via **genomsnittsmetoden** för historiska innehav
- **Status:** ✅ `lugn_tax/depa.py` (genomsnitt som default)

### Statlig inkomstskatt (skiktgräns)
- **Källa:** Skatteverket — "När ska man betala statlig inkomstskatt"
- **Regel:** 20% statlig OVANPÅ kommunalskatt på beskattningsbar förvärvsinkomst över **skiktgränsen**
- **Skiktgräns:** 643 000 SEK/år (beskattningsbar inkomst)
- **Brytpunkt:** 660 400 SEK/år (före grundavdrag — "brytpunkten")
- **Status i Lugn:** ✅ `salary_tax.py` STATLIG_SKIKTGRANS — verifiera årligen

### Uttagsoptimering (drawdown order) — EJ byggt än
- **Mål:** linjär programmering / regelbaserad optimering av uttagsfasen
- **Logik:** prioritera uttag från konton så att total beskattningsbar årsinkomst
  hålls UNDER skiktgränsen (643 000) → undvik 20% statlig
- **Typisk optimal ordning:** ISK/depå-kapital först (kapitalbeskattat, ej förvärvsinkomst),
  tjänstepension fördelat så lön+pension < skiktgräns, allmän pension sist/jämnt
- **Status:** 🔶 nästa att bygga — `bridge_sim` har grund-ordning, behöver skiktgräns-optimering

### Allmän pension — Pensionsmyndighetens faktiska beräkning
- **Källa:** pensionsmyndigheten.se — "Så beräknas din pension"
- **Avsättning:** 18,5% av pensionsunderlaget per arbetsår
  - 16% → inkomstpension (fördelningssystem, indexeras med inkomstindex)
  - 2,5% → premiepension (PPM, fonderad)
- **Pensionsunderlag:** inkomst efter 7% allmän pensionsavgift, **tak 7,5 IBB**
  - 2026: IBB = 83 400 kr → tak = **625 500 kr/år** (52 125 kr/mån)
- **Behållning → pension:** årspension = pensionsbehållning ÷ **delningstal**
  - Delningstal ≈ förväntad återstående livslängd vid uttag, justerat för
    1,6% antagen tillväxt (norm). ~16 vid 65 (varierar med födelseår/uttagsålder).
- **Följsamhetsindexering:** löpande pension räknas om med inkomstindex − 1,6 (norm)
- **Lugn-formel (verifierad mot publicerade nivåer):**
  ```
  underlag      = min(årslön × 0,93, 625 500)
  pensionsrätt  = 0,185 × underlag           // per arbetsår
  behållning    = pensionsrätt × arbetsår    // karriärstart 23 → 65 = 42 år
  pension/år    = behållning ÷ 16
  ```
  Early retirement: färre arbetsår → mindre behållning → lägre pension (naturligt).
- **Garantipension:** golv för låg pension, trappas av mot inkomstpension (≈0 för
  FIRE-personer med lång karriär). Lugn använder litet golv (10%).

### Tjänstepensionsavtal — avsättnings-% och tidigast uttag
- **Brytpunkt:** 7,5 IBB = 625 500 kr/år = **52 125 kr/mån** (2026)
- **Avsättning:** låg andel på lön ≤7,5 IBB, hög andel på lönedelar däröver

| Avtal | Vem | ≤7,5 IBB | >7,5 IBB | Tidigast uttag |
|---|---|---|---|---|
| **ITP1** | Privata tjänstemän (1979+) | 4,5% | 30% | 55 |
| **ITP2** | Privata tjänstemän (före 1979) | förmånsbest. + ITPK | — | 55/65 |
| **SAF-LO** | Privata arbetare (LO) | 4,5% | 30% | 55 |
| **AKAP-KR** | Kommun/region | 6% | 31,5% | 55 |
| **KAP-KL** | Kommun/region (äldre) | 4,5% | 30% | 55 |
| **PA16** | Statligt anställda | 6,1% | 31,6% | 55 |

- **Tidigast uttag 55** för premiebestämda delar (planeras höjas mot riktålder).
- **Lugn:** användaren väljer avtal → avsättning räknas från lön → växer potten
  medan man jobbar. Verifierat: ITP1 @70k = 7 708 kr/mån, AKAP-KR @70k = 8 758.
- Källor: SKR, Pensionsmyndigheten (PA16), Collectum (ITP), Fora (SAF-LO).

### Skatteverket API (Fas 2)
- Inkomstdeklaration 1 API — https://www.skatteverket.se/omoss/digitalasamarbeten...
- Hämta kommunalskattesats per kommun för exakt nettoinkomst

---

## 4. Mål-arkitektur (frontend state)

- **Ramverk:** Value-Focused Thinking (Ralph Keeney) + Behavioral Goal Framing (Bond, Carlson, Keeney 2008)
- **State-arkitektur:** mappa Strategic Objectives → Means Objectives
  ```json
  {
    "strategic_objective": "Geografisk frihet / Tidig pension",
    "means_objectives": [
      { "target_name": "Betala av dyra lån", "metric": "0 SEK", "priority": "Kritisk" },
      { "target_name": "Bygg ISK-bryggportfölj", "metric": "1500000 SEK", "priority": "Hög" }
    ]
  }
  ```
- **Vid riktig app:** React Context eller Zustand för detta state
- **Status i Lugn:** delvis — onboarding fångar mål (PERMA-V), men means↔ends-mapping ej explicit visualiserad än

---

## 5. Advisor-in-a-box guardrails

### Behavioral Shock (volatilitet i kronor, ej procent)
- **Källa:** Behavioral economics of volatility framing
- **Funktion:** `renderBehavioralShockCanvas()`
- **Trigger:** om användare drar asset-slider till 100% aktier → intercepta state-ändring,
  rendera modal med historisk drawdown (~40%)
- **Kritiskt:** visa förlust i **absoluta SEK** ("Din portfölj faller 250 000 kr på 6 mån"),
  ALDRIG abstrakta procent — väcker realistisk loss aversion
- **Status i Lugn:** ✅ Shock Simulator byggd (2008/2000/2020/70-tal i SEK).
  🔶 Saknar: asset-slider + intercept-modal vid 100% aktier

### Fee Drag Auditor
- Analysera innehav, flagga höga avgifter (aktiva fonder), beräkna sammansatt drag
- **Status:** ✅ byggd `app.js` `computeFeeDrag()`

### Compliance (Fas 3)
- GDPR, bank-grade kryptering at-rest, EU-hosting (Fly.io Stockholm)
- Audit-loggar för all dataåtkomst

---

## Källista
- BankID v6: https://developers.bankid.com/api-references
- Tink: https://docs.tink.com/resources/open-banking
- minPension handbok: https://www.minpension.se/media/zqajzztz/handbok-minpension.pdf
- AP7 Såfa: https://www.ap7.se/
- Skatteverket digitala samarbeten: https://www.skatteverket.se/omoss/digitalasamarbeten.4.3684199413c956649b56298.html
- Skatteverket statlig skatt: https://www.skatteverket.se/privat/etjansterochblanketter/svarpavanligafragor/inkomstavtjanst/
- PWL Capital research: Ben Felix / Braden Warwick
