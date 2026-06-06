# Lugn — Roadmap

Funktionsvision indelad i faser efter vad som faktiskt kräver backend, partnerskap
och regulatoriskt godkännande. Prototypen (`prototype/`) är ren statisk frontend —
allt i **Fas 1** kan byggas där utan server.

---

## Fas 1 — Byggbart i prototypen nu (ren frontend)

### Simuleringsmotor (kategori 2)
- [x] Monte Carlo 5 000 banor med success rate
- [x] **Fat-tailed avkastning** — Student-t istället för normalfördelning (tjocka svansar)
- [x] Sequence-of-returns-risk (implicit i MC, banor med tidig krasch fångas)
- [ ] Block-bootstrap från historisk svensk/global data (kräver datafil)
- [ ] SEK/USD-valutarisk som egen faktor
- [ ] AP7 Såfa-style automatisk de-risking över livscykeln

### Skatt & wrappers (kategori 3)
- [x] ISK schablonbeskattning (statslåneränta + 300k grundavdrag 2026)
- [x] AF/depå 30% reavinst, ISK vs AF-jämförelse
- [x] KF med avtalsavgift
- [ ] **Uttagsoptimering** — mest skatteeffektiva drawdown-ordningen (DP över skiktgräns)
- [ ] Genomsnittsmetoden för historiska AF-innehav
- [ ] Bolån: amorteringskrav + ränteavdrag + uppskov

### Mål-arkitektur (kategori 4)
- [x] Värdedriven onboarding (PERMA-V, Felix)
- [x] Lugn-score + "Att tänka på"-insights (means→ends visualisering)
- [x] What-if: sparkvot, pensionsålder, livsstil-tier
- [ ] **What-if sandbox utbyggd**: bolån-amortering vs investera, karriärspaus/deltid
- [ ] Means-vs-ends explicit mapping (lever → sannolikhet)

### Advisor-in-a-box guardrails (kategori 5)
- [x] **Behavioral Shock Simulator** — 2008-krasch i absoluta SEK, ej procent
- [x] **Fee Drag Auditor** — sammansatt avgiftsdrag över livstid
- [ ] Asset allocation risk-tolerans-test före aggressiv allokering

---

## Fas 2 — Kräver backend (Django + Postgres på Fly.io)

### Data-ingestion (kategori 1)
- [ ] **MinPension.se-ingestion** — secure PDF/dataexport-parser via Claude haiku:
  - Allmän pension (Inkomstpension + PPM)
  - Tjänstepension (ITP1/2, SAF-LO, AKAP-KR, KAP-KL, PA16)
  - Privat pension
- [ ] **Skatteverket kommunalskatt** — hämta korrekt kommunalskattesats per kommun
  för exakt nettoinkomst och framtida skattedrag
- [ ] Spara planer per användare (auth via magic link, senare BankID)
- [ ] Scenario-jämförelse sparad i DB (plan A vs plan B sida vid sida)
- [ ] AI-coach (Claude RAG på Rational Reminder + akademisk litteratur)

---

## Fas 3 — Kräver partnerskap + regulatoriskt godkännande

### Open Banking (kategori 1)
- [ ] **BankID-autentisering** — via Criipto eller liknande
- [ ] **Open Banking / PSD2** — Tink eller Finshark för realtids-saldoaggregering
  (banksaldon, depåer, lån). ~3000 kr/mån startavgift — vänta till revenue finns.
- [ ] Automatisk portfölj-sync (innehav uppdateras live)

### Compliance (kategori 5)
- [ ] GDPR-efterlevnad, bank-grade kryptering at-rest
- [ ] EU-hostat (Fly.io Stockholm-region)
- [ ] Audit-loggar för all dataåtkomst
- [ ] Ev. anknutet ombud-tillstånd om appen rör sig mot rådgivning

---

## Regulatorisk linje (genom alla faser)

Lugn är en **sorteringstjänst + scenario-simulator**, inte investeringsrådgivning
enligt MiFID II. Allt språk är "i detta scenario...", aldrig "vi rekommenderar att du köper".
Se SPEC.md sektion 3 för disclaimer och designprinciper.
