// Lugn prototype — FIRE/bridge/Monte Carlo calculator.
// All inputs live = recalculate on every change.

const fmtKr = n => {
  if (!isFinite(n) || isNaN(n)) return "— kr";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " kr";
};
const fmtPct = n => `${Math.round(n)}%`;
const $ = id => document.getElementById(id);

// ─── Tal-input med mellanslag som tusentalsavgränsare ─────────────────────────
// Heltalsfält visas som "2 000 000". Läs ALLTID av via numv() (strippar mellanslag),
// skriv via setNumVal()/fmtNum() så displayen formateras.
function fmtNum(n) {
  n = Math.round(+n || 0);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + s;
}
function numv(id, dflt = 0) {
  const e = typeof id === "string" ? $(id) : id;
  if (!e || e.value === "" || e.value == null) return dflt;
  const n = +String(e.value).replace(/[\s ]/g, "");
  return isNaN(n) ? dflt : n;
}
function setNumVal(id, n) {
  const e = typeof id === "string" ? $(id) : id;
  if (e) e.value = fmtNum(n);
}
// Live-formatering med bevarad markörposition (heltal, icke-negativa).
function formatNumInput(el) {
  const sel = el.selectionStart ?? el.value.length;
  const digitsBefore = (el.value.slice(0, sel).match(/\d/g) || []).length;
  const digits = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const formatted = digits === "" ? "" : digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  el.value = formatted;
  let pos = 0, count = 0;
  while (pos < formatted.length && count < digitsBefore) {
    if (/\d/.test(formatted[pos])) count++;
    pos++;
  }
  try { el.setSelectionRange(pos, pos); } catch (e) {}
}

// ─── 2026 skattekonstanter ────────────────────────────────────────────────────
const ISK_GRUNDAVDRAG    = 300_000;
const SLR_30_NOV         = 0.0255;
const ISK_SCHABLONINTAKT = SLR_30_NOV + 0.01;           // 3.55%
const ISK_EFFEKTIV_SKATT = ISK_SCHABLONINTAKT * 0.30;   // 1.065%

function iskTax(balance, otherKf = 0) {
  const tot = balance + otherKf;
  if (tot === 0) return 0;
  const avdrag = Math.min(ISK_GRUNDAVDRAG, tot) * (balance / tot);
  return Math.max(0, balance - avdrag) * ISK_EFFEKTIV_SKATT;
}

let _kommunalskatt = 0.332;   // default = riksgenomsnitt 2026 (33,2%)

// ─── Inkomstskatt — Skatteverkets metod (SKV 433, inkomstår 2026) ─────────────
// Verifierat mot teknisk beskrivning SKV 433 utgåva 36 (2025-12-10):
// PBB 2026 = 59 200; skiktgräns (beskattningsbar) = 643 000, statlig 20 % däröver.
const PBB_2026       = 59_200;
const SKIKTGRANS_2026 = 643_000;

// Ordinarie grundavdrag (kr) som funktion av fastställd förvärvsinkomst.
function grundavdragOrd(x) {
  const p = PBB_2026;
  if (x <= 0.99 * p) return 0.423 * p;
  if (x <= 2.72 * p) return 0.423 * p + 0.20 * (x - 0.99 * p);
  if (x <= 3.11 * p) return 0.77 * p;
  if (x <= 7.88 * p) return 0.77 * p - 0.10 * (x - 3.11 * p);
  return 0.293 * p;
}
// Förhöjt grundavdrag (TILLÄGG ovanpå ordinarie) för den som fyllt 66 vid årets ingång.
function grundavdragForhojt(x) {
  const p = PBB_2026;
  let f;
  if      (x <= 0.91 * p)  f = 0.687 * p;
  else if (x <= 1.11 * p)  f = 0.885 * p - 0.20 * x;
  else if (x <= 1.965 * p) f = 0.600 * p + 0.057 * x;
  else if (x <= 2.72 * p)  f = 0.333 * p + 0.1949 * x;
  else if (x <= 3.11 * p)  f = 0.3949 * x - 0.212 * p;
  else if (x <= 3.24 * p)  f = 0.4949 * x - 0.523 * p;
  else if (x <= 5.00 * p)  f = 0.356 * x - 0.073 * p;
  else if (x <= 7.88 * p)  f = 0.017 * p + 0.338 * x;
  else if (x <= 8.08 * p)  f = 0.703 * p + 0.251 * x;
  else if (x <= 11.16 * p) f = 2.732 * p;
  else if (x <= 12.84 * p) f = 9.651 * p - 0.62 * x;
  else                     f = 1.691 * p;
  return Math.max(0, f);
}
// Jobbskatteavdrag (skattereduktion för arbetsinkomst), under 66 år. Reducerar
// endast kommunalskatten. Avtrappningen för höga inkomster slopad fr.o.m. 2025.
function jobbskatteavdrag(ai, gaOrd, kRate) {
  const p = PBB_2026;
  let base;
  if      (ai <= 0.91 * p) base = ai - gaOrd;
  else if (ai <= 3.24 * p) base = 0.91 * p + 0.3874 * (ai - 0.91 * p) - gaOrd;
  else if (ai <= 8.08 * p) base = 1.813 * p + 0.251 * (ai - 3.24 * p) - gaOrd;
  else                     base = 3.027 * p - gaOrd;
  return Math.max(0, base) * kRate;
}

// Total kommunal + statlig inkomstskatt (kr/år). earned=true → arbetsinkomst
// (jobbskatteavdrag); earned=false → pension/ej-arbete (inget jobbskatteavdrag).
function incomeTax(income, age, earned = false) {
  if (income <= 0) return 0;
  const gaOrd = grundavdragOrd(income);
  let ga = gaOrd + (age >= 66 ? grundavdragForhojt(income) : 0);
  ga = Math.ceil(ga / 100) * 100;                       // avrundas uppåt till hundratal
  const taxable  = Math.max(0, income - ga);
  const kommunal = taxable * _kommunalskatt;
  const statlig  = Math.max(0, taxable - SKIKTGRANS_2026) * 0.20;
  const jsa = (earned && age < 66) ? jobbskatteavdrag(income, gaOrd, _kommunalskatt) : 0;
  return Math.max(0, kommunal - jsa) + statlig;
}
// Bakåtkompatibelt alias: pensionsinkomst (ingen jobbskatteavdrag).
function lonTax(income, age) { return incomeTax(income, age, false); }

// Kommunalskatt: slå upp vald kommun (data i kommunalskatt.js), annars snitt.
function getKommunalskatt() {
  const name = (document.getElementById("kommun")?.value || "").trim();
  const tbl = window.KOMMUNALSKATT_2026 || {};
  if (name && tbl[name] != null) return tbl[name] / 100;
  return 0.332;
}

function populateKommunList() {
  const dl = document.getElementById("kommunList");
  const tbl = window.KOMMUNALSKATT_2026;
  if (!dl || !tbl || dl.children.length) return;
  Object.keys(tbl).sort((a, b) => a.localeCompare(b, "sv")).forEach(k => {
    const o = document.createElement("option");
    o.value = k;
    dl.appendChild(o);
  });
}

// ─── Allmän pension — Pensionsmyndighetens faktiska metod ─────────────────────
// 18,5% av pensionsunderlaget (inkomst efter 7% avgift, tak 7,5 IBB) sätts av
// varje arbetsår → pensionsbehållning → ÷ delningstal vid uttag = årspension.
// Källa: pensionsmyndigheten.se (16% inkomstpension + 2,5% premiepension).
const IBB_2026          = 83_400;
const PGI_CEILING_2026  = 625_500;   // 7,5 × IBB på pensionsunderlag
const ALLMAN_RATE       = 0.185;     // 18,5%
const DELNINGSTAL_65    = 16.0;      // ~vid 65 (varierar med födelseår/uttagsålder)
const CAREER_START      = 23;
// Löneväxling 2026: arbetsgivaravgift 31,42% vs särskild löneskatt 24,26% →
// ~5,8% mer till pensionen. Golv 8,07 IBB = 56 087 kr/mån — lönen EFTER växling
// får ej understiga det, annars tappas allmän pension + SGI (sjuk/föräldrapenning).
const VAXLINGSFAKTOR    = 1.058;
const LONEVAXLING_GOLV  = 56_087;    // kr/mån (8,07 IBB 2026)

// Allmän pension/mån vid FULL karriär till 65 (för en given månadslön), dagens värde.
function allmanAt65Full(monthlySalary) {
  if (monthlySalary <= 0) return 0;
  const income = monthlySalary * 12;
  const underlag = Math.min(income * 0.93, PGI_CEILING_2026);   // efter 7% avgift, takat
  const pensionsratt = ALLMAN_RATE * underlag;                  // per arbetsår
  const balance = pensionsratt * (65 - CAREER_START);           // 42 års full karriär
  return (balance / DELNINGSTAL_65) / 12;                       // kr/mån
}

// Reduktionsfaktor vid tidig frihet: pension ∝ antal arbetsår (pensionsrätten
// är konstant per år vid/över taket → linjärt i år). Detta speglar den faktiska
// mekaniken: färre år → mindre behållning → lägre pension (samma delningstal).
function allmanFactor(retire) {
  if (retire >= 65) return 1;
  const full = 65 - CAREER_START;
  const worked = Math.max(0, retire - CAREER_START);
  return Math.max(0.10, worked / full);   // litet golv (garantipension trappas av)
}

function tjpPayout(pott, period) {
  const r = 0.03, n = period > 0 ? period : 25;
  return pott * r / (1 - Math.pow(1 + r, -n));
}

// ─── Tjänstepensionsavtal — avsättnings-% och tidigast uttag ──────────────────
// Avsättning: andel av lön ≤7,5 IBB, högre andel på lönedelar >7,5 IBB.
// 7,5 IBB / 12 = 52 125 kr/mån (2026). Tidigast uttag 55 (planeras höjas).
const TJP_THRESHOLD_MONTH = 7.5 * 83_400 / 12;   // 52 125 kr/mån 2026

// Premiebestämda avtal (alla födda efter 1980). startAge/endAge = intjänandefönster.
// earliest = tidigaste uttagsålder. Verifierat 2026: avtalat.se, Pensionsmynd., minPension.
const AVTAL = {
  itp1:   { namn: "ITP1 — privat tjänsteman (1979+)", low: 0.045, high: 0.30,  earliest: 55, startAge: 25, endAge: 66 },
  saflo:  { namn: "SAF-LO — privat arbetare (LO)",     low: 0.045, high: 0.30,  earliest: 55, startAge: 22, endAge: 65 },
  akapkr: { namn: "AKAP-KR — kommun/region",           low: 0.06,  high: 0.315, earliest: 62, startAge: 22, endAge: 69,
            note: "Uttag tidigast 62 (nytt 2026). Avsättning oavsett ålder, till 69." },
  pa16:   { namn: "PA16 — statligt anställd (1988+)",   low: 0.061, high: 0.316, earliest: 61, startAge: 23, endAge: 69,
            note: "Avd 1: ~6,1% (→6,2% okt 2026) + Kåpan Flex. Uttag tidigast 61." },
  itp2:   { namn: "ITP2 — privat tjänsteman (före 1979)", low: 0.045, high: 0.30, earliest: 55, startAge: 28, endAge: 65,
            note: "Förmånsbestämd grunddel (ofta från 65) + premiebestämd ITPK." },
  kapkl:  { namn: "KAP-KL — kommun/region (äldre)",     low: 0.045, high: 0.30,  earliest: 55, startAge: 21, endAge: 67 },
  egen:   { namn: "Eget AB / direktpension",            low: 0, high: 0, earliest: 55, custom: true },
  ingen:  { namn: "Vet ej / ingen",                    low: 0, high: 0, earliest: 55, custom: true },
};

// Månatlig TJP-avsättning från lön enligt valt avtal.
function tjpContribFromAvtal(avtalKey, monthlySalary) {
  const a = AVTAL[avtalKey];
  if (!a || a.custom || monthlySalary <= 0) return null;   // null = använd manuellt fält
  const low  = Math.min(monthlySalary, TJP_THRESHOLD_MONTH) * a.low;
  const high = Math.max(0, monthlySalary - TJP_THRESHOLD_MONTH) * a.high;
  return Math.round(low + high);
}

// ─── AP7 Såfa-glidbana (livscykel-de-risking) ─────────────────────────────────
// AP7-default: 100% aktier till 55, linjär infasning räntor till 33/67 vid 75.
// Antaganden: aktier real 5%/σ17%, räntor real 1%/σ5%, korr ≈ 0.
const EQ_MU = 0.05, EQ_SIG = 0.17, BOND_MU = 0.01, BOND_SIG = 0.05;

function equityFractionAtAge(age) {
  if (age <= 55) return 1.0;
  if (age >= 75) return 0.33;
  return 1.0 - (age - 55) / 20 * (1.0 - 0.33);   // linjär 100% → 33%
}

// Förväntad real avkastning vid en ålder, med eller utan glidbana.
function expectedRealReturnAtAge(age, inputs) {
  if (!_glidbana) return inputs.realReturn / 100;
  const e = equityFractionAtAge(age);
  return e * EQ_MU + (1 - e) * BOND_MU;
}

// Volatilitet vid en ålder (för MC).
function volAtAge(age) {
  if (!_glidbana) return MC_SIGMA;
  const e = equityFractionAtAge(age);
  return Math.sqrt((e * EQ_SIG) ** 2 + ((1 - e) * BOND_SIG) ** 2);
}

let _glidbana = false;   // sätts av toggle i avancerat

// Räntekris-toggle: utesluter 1990–94 (svenska valutaförsvaret, 500%-räntan)
// från obligationsstatistiken. Hela serien finns kvar i MARKET_HISTORY — bara
// statistik-beräkningen filtreras. Cachen i marketStats() invalideras vid byte.
const RATE_CRISIS_YEARS = new Set([1990, 1991, 1992, 1993, 1994]);
let _excludeRateCrisis = false;
function setExcludeRateCrisis(flag) {
  if (_excludeRateCrisis === flag) return;
  _excludeRateCrisis = flag;
  _marketStats = null;   // tvinga omräkning
}

// Allmän pension: inkomstpension (16%) + premiepension (2,5%) av 18,5%.
const PREMIE_SHARE   = 2.5 / 18.5;   // ≈ 13,5% av allmän pension
const INKOMST_SHARE  = 16  / 18.5;   // ≈ 86,5%
const ALLMAN_EARLIEST = 63;          // lägsta uttagsålder allmän pension (2026)
const DEPA_GAIN_FRAC  = 0.5;         // antagen vinstandel vid depå-uttag (för 30% reavinst)

// Tidigt uttag av allmän pension före 65 ger livsvarigt lägre belopp
// (~7% per år tidigare — högre delningstal).
function earlyAllmanFactor(startAge) {
  if (startAge >= 65) return 1;
  return Math.max(0.6, 1 - (65 - startAge) * 0.07);
}

// ─── Deterministisk simulering ───────────────────────────────────────────────
// returnOverride: array[year] av faktisk real avkastning (för Monte Carlo)
function simulate(inputs, opts = {}) {
  const { age, retire, lifespan, needPerMonth, savingsPerMonth,
          iskBalance, kfBalance, depaBalance,
          tjpPott, tjpPeriod, allmanMonthly, tjpContrib = 0, avtal = "ingen",
          realReturn, inflation,
          loanBalance = 0, loanRate = 0, loanAmort = 0,
          sideIncomeAnnual = 0, partTimeUntilAge = 0,
          bigExpenses = [] } = inputs;

  const retOverride  = opts.returnOverride;    // array[i] eller undefined

  const inf     = inflation / 100;
  const nomBase = (realReturn + inflation) / 100;

  // ── Uttagsstrategi: ta varje pension så tidigt dess regler tillåter ──
  // TJP: tidigast enligt avtal (default 55). Allmän (inkomst+premie): från 63.
  const avtalEarliest = (AVTAL[avtal]?.earliest) ?? 55;
  const tjpStart    = Math.max(retire, avtalEarliest);
  const allmanStart = Math.max(retire, ALLMAN_EARLIEST);

  // TJP-potten växer till FAKTISK startålder (tidigare uttag = mindre pott).
  // Avsättningar görs bara inom avtalets intjänandefönster (start- till slutålder).
  const avtalDef  = AVTAL[avtal] || {};
  const contStart = Math.max(age, avtalDef.startAge ?? 22);
  const contEnd   = Math.min(retire, avtalDef.endAge ?? 65);
  const yearsToTjpStart = Math.max(0, tjpStart - age);
  let tjpContribFV = 0;
  for (let a2 = contStart; a2 < contEnd && a2 < tjpStart; a2++) {
    tjpContribFV += tjpContrib * 12 * Math.pow(1.04, tjpStart - a2);
  }
  const tjpPottStart = tjpPott * Math.pow(1.04, yearsToTjpStart) + tjpContribFV;
  const tjpAnnual    = tjpPayout(tjpPottStart, tjpPeriod);

  // Allmän pension (fältet = vid frihetsålder). Tidigt uttag före 65 sänker den.
  const allmanAdj = allmanMonthly * earlyAllmanFactor(allmanStart);
  const premieMonthly  = allmanAdj * PREMIE_SHARE;
  const inkomstMonthly = allmanAdj * INKOMST_SHARE;

  let isk = iskBalance, kf = kfBalance, depa = depaBalance;
  const flows = [];
  let bridgeUsed = 0, ran_dry = false;

  // Bolån: amorteras ner med fast belopp/år. Räntan (efter ränteavdrag) +
  // amorteringen är en boendekostnad som FÖRSVINNER vid slutbetalning. Under
  // arbetsåren betalas den av lönen (redan inbakat i sparkvoten); under pension
  // måste den tas ur portföljen → vi lägger den på behovet bara då, nominellt.
  let loan = Math.max(0, loanBalance);
  const amortAnnual = Math.max(0, loanAmort) * 12;
  const loanR = Math.max(0, loanRate) / 100;

  for (let a = age; a <= lifespan; a++) {
    const i   = a - age;
    // Nominell avkastning: MC-override, annars glidbane-justerad eller flat
    const nom = retOverride
      ? retOverride[i] + inf
      : (_glidbana ? expectedRealReturnAtAge(a, { realReturn }) + inf : nomBase);
    let needAnnual   = needPerMonth * 12 * Math.pow(1 + inf, i);
    const inAccum    = a < retire;

    // Bolån för detta år: ränta på aktuell skuld (efter ränteavdrag) + amortering.
    // Ränteavdrag: 30 % upp till 100 000 kr ränta/år, 21 % därutöver.
    let housingCost = 0;
    if (loan > 0) {
      const interestY  = loan * loanR;
      const deduction  = Math.min(interestY, 100_000) * 0.30 + Math.max(0, interestY - 100_000) * 0.21;
      const interestNet = interestY - deduction;
      const amortY     = Math.min(amortAnnual, loan);
      housingCost      = interestNet + amortY;     // nominell kr detta år
      loan             = Math.max(0, loan - amortY);
      // Bara under pension belastar boendet portföljen (annars täcks det av lön)
      if (!inAccum) needAnnual += housingCost;
    }

    // Pension i tre delar med egna startåldrar (BRUTTO, nominellt vid ålder a)
    const inflAdj = Math.pow(1 + inf, i);
    let tjpInc = 0, premieInc = 0, inkomstInc = 0;
    if (a >= tjpStart && (tjpPeriod < 0 || a < tjpStart + tjpPeriod))
      tjpInc = tjpAnnual * Math.pow(1 + inf, a - tjpStart);
    if (a >= allmanStart) {
      premieInc  = premieMonthly  * 12 * inflAdj;
      inkomstInc = inkomstMonthly * 12 * inflAdj;
    }
    const pensionGross = tjpInc + premieInc + inkomstInc;

    // Mid-year-konvention: halv årsavkastning före flöden, halv efter.
    // Klampa: en årsavkastning kan aldrig vara < −100% (annars √(neg) = NaN).
    const g = Math.sqrt(Math.max(0.001, 1 + nom));
    isk *= g; kf *= g; depa *= g;

    let bridgeDraw = 0, tax = 0, pensionNet = pensionGross;

    if (!inAccum) {
      // Pension beskattas som inkomst → netto täcker det efter-skatt-behovet.
      const pensionTax = lonTax(pensionGross, a);
      pensionNet = pensionGross - pensionTax;
      // Deltidsinkomst efter frihet (netto, dagens kr) täcker en del av behovet
      // under [retire, partTimeUntilAge). Minskar uttaget ur portföljen.
      const sideIncome = (a >= retire && a < partTimeUntilAge) ? sideIncomeAnnual * inflAdj : 0;
      let still = needAnnual - pensionNet - sideIncome;   // återstående efter-skatt-gap

      if (still > 0) {
        // Skatteeffektiv ordning: ISK → KF (skattefria uttag) → depå (30% på vinst).
        const fi = Math.min(still, isk); isk -= fi; still -= fi; bridgeDraw += fi;
        const fk = Math.min(still, kf);  kf  -= fk; still -= fk; bridgeDraw += fk;
        if (still > 0 && depa > 0) {
          // Depå: brutto-uppräkning för 30% reavinst på vinstandelen.
          const grossUp = 1 / (1 - 0.30 * DEPA_GAIN_FRAC);
          const want = still * grossUp;
          const fd = Math.min(want, depa); depa -= fd;
          const net = fd / grossUp; still -= net; bridgeDraw += fd;
        }
        if (still > 1) ran_dry = true;
      }
      bridgeUsed += bridgeDraw;
      tax += pensionTax;
    } else {
      isk += savingsPerMonth * 12 * inflAdj;   // sparande vid mid-year
    }

    // Andra halvårets avkastning
    isk *= g; kf *= g; depa *= g;

    // Större engångsutgifter detta år (bröllop, bil, renovering…) — dras som
    // klumpsumma ur portföljen (ISK → KF → depå). Dagens värde, inflationsjusterat.
    let bigExpYear = 0;
    for (const e of bigExpenses) if (e.age === a) bigExpYear += e.amount;
    if (bigExpYear > 0) {
      let want = bigExpYear * inflAdj;
      const xi = Math.min(want, isk); isk -= xi; want -= xi;
      const xk = Math.min(want, kf);  kf  -= xk; want -= xk;
      const xd = Math.min(want, depa); depa -= xd; want -= xd;
      if (want > 1) ran_dry = true;   // hade inte råd med utgiften
    }

    // Årlig ISK/KF-schablon — dras FAKTISKT från balansen (verklig kostnad).
    const schISK = iskTax(isk, kf);
    const schKF  = iskTax(kf, isk);
    isk -= schISK; kf -= schKF;
    tax += schISK + schKF;

    // Netto-pensionskomponenter (för stackad graf mot efter-skatt-behov)
    const netScale = pensionGross > 0 ? pensionNet / pensionGross : 1;

    flows.push({
      age: a,
      need: inAccum ? 0 : needAnnual,
      pensionGross, pensionNet,
      tjpInc: tjpInc * netScale,
      premieInc: premieInc * netScale,
      inkomstInc: inkomstInc * netScale,
      bridgeDraw,
      tax,
      totalCapital: isk + kf + depa,
    });
  }

  return {
    flows,
    finalCapital: flows[flows.length - 1].totalCapital,
    bridgeUsed,
    ran_dry,
  };
}

// ─── Monte Carlo ─────────────────────────────────────────────────────────────
// Fat-tailed MULTIVARIATE MC: R_t = μ + sqrt(ν/χ²ν) · L · Z
//   Z ~ N(0, I)   L = chol(Σ)   χ²ν ~ Chi-squared(ν)
// Detta är en multivariat Student-t (ν=5 default → tjocka svansar) som även
// bevarar tillgångars korrelationer via Cholesky-faktorisering av Σ. Ersätter
// den gamla univariata samplingen som ignorerade både korrelation och
// variansreduktionen från obligationer.
const MC_PATHS    = 5_000;
const MC_NU       = 5;     // frihetsgrader — lägre = tjockare svansar
// Legacy konstanter — behålls för chock-/glidbane-visningar som ännu inte
// migrerats till MVT-vägen. Nya MC-banor använder ASSET_CLASSES_DEFAULT nedan.
const MC_MU_REAL  = 0.05;
const MC_SIGMA    = 0.17;

// Tillgångsklass-katalog. μ = förväntad real årsavkastning, σ = årlig std.
// Defaults är fallback-värden — om historik finns (window.MARKET_HISTORY) så
// fyller buildAssetUniverse() i empiriska σ/ρ från marketStats() istället.
const ASSET_CLASSES_DEFAULT = {
  world:    { label: "MSCI World (SEK)", mu: 0.05, sigma: 0.17 },
  sweden:   { label: "SIXRX",            mu: 0.05, sigma: 0.18 },
  bondsSE:  { label: "Svenska statsobligationer", mu: 0.01, sigma: 0.05 },
};
const ASSET_KEYS = ["world", "sweden", "bondsSE"];
// Fallback-korrelationsmatris. Ersätts av empiriska värden om data finns.
const CORR_DEFAULT = [
  [ 1.00,  0.75, -0.10 ],
  [ 0.75,  1.00, -0.10 ],
  [-0.10, -0.10,  1.00 ],
];

// Bygg σ-vektor och Σ från historiska data om de finns; annars defaults.
// Empiriskt 1988–2025 (n=38, Riksbanken SEGVB10YC duration-approximerad TR):
//   σ_bonds ≈ 0.12 — högre än "vanliga" 5%, eftersom 1990–94 hade extrema
//     yield-rörelser. Vi rapporterar ärligt och förlitar oss på korrelationen.
//   ρ(World, bonds) ≈ +0.10, ρ(SIXRX, bonds) ≈ 0. Variansreduktionen kommer
//     alltså från låg/ingen korrelation snarare än negativ — fortfarande en
//     reell diversifieringsvinst, bara mindre dramatisk än lärobokens "−0.3".
function buildAssetUniverse() {
  const ms = (typeof marketStats === "function") ? marketStats() : null;
  const sigmas = ASSET_KEYS.map(k => ASSET_CLASSES_DEFAULT[k].sigma);
  const corr = CORR_DEFAULT.map(row => row.slice());
  if (ms) {
    sigmas[0] = ms.sigmaWorld;
    sigmas[1] = ms.sigmaSwe;
    corr[0][1] = corr[1][0] = ms.rho;
    if (ms.bondStats) {
      sigmas[2] = ms.bondStats.sigmaBond;
      corr[0][2] = corr[2][0] = ms.bondStats.rhoWorldBond;
      corr[1][2] = corr[2][1] = ms.bondStats.rhoSweBond;
    }
  }
  return { sigmas, corr };
}

// Box-Muller normalfördelad slumptal
function randn() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Chi-square(k) via summa av k kvadrerade normaler (endast positivt heltal k).
// Behålls för bakåtkompatibilitet; MVT-vägen använder randChi2Cont nedan.
function randChi2(k) {
  let s = 0;
  for (let i = 0; i < k; i++) { const z = randn(); s += z * z; }
  return s;
}

// Gamma(α, 1) via Marsaglia–Tsang (acceptance-rejection). Stödjer godtyckligt α>0.
function randGamma(alpha) {
  if (alpha < 1) {
    // Ahrens-Dieter boost: Gamma(α) = Gamma(α+1) · U^(1/α)
    const g = randGamma(alpha + 1);
    return g * Math.pow(Math.random(), 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let z, v;
    do { z = randn(); v = 1 + c * z; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Chi-squared(ν) för godtycklig ν > 0: χ²(ν) = 2·Gamma(ν/2, 1).
// (Mer flexibel än sum-of-squares-vägen, som kräver heltals-ν.)
function randChi2Cont(nu) { return 2 * randGamma(nu / 2); }

// Student-t (univariat), skalad till enhetsvarians. Behålls som hjälpare.
function randStudentT(nu = MC_NU) {
  const z = randn();
  const w = randChi2Cont(nu);
  const t = z / Math.sqrt(w / nu);
  return t * Math.sqrt((nu - 2) / nu);
}

// Cholesky-faktorisering av en symmetrisk positivt-definit matris Σ.
// Returnerar nedre triangulär L så att L·Lᵀ = Σ.
function cholesky(sigma) {
  const n = sigma.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = sigma[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) throw new Error(`Σ not positive-definite at (${i},${i})`);
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

// Bygg kovariansmatris från σ-vektor + korrelationsmatris: Σ_ij = σ_i σ_j ρ_ij.
function buildCovariance(sigmas, corr) {
  const n = sigmas.length;
  const S = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      S[i][j] = sigmas[i] * sigmas[j] * corr[i][j];
  return S;
}

// Sampla en MVT-avkastningsvektor R = μ + √(ν/χ²ν) · L · Z, Z ~ N(0,I).
// L måste motsvara μ:s tillgångsordning.
function sampleMvtReturns(mu, L, nu = MC_NU) {
  const n = mu.length;
  const chi2 = randChi2Cont(nu);
  const scale = Math.sqrt(nu / chi2);             // gemensam svans-skalfaktor
  const Z = Array.from({ length: n }, () => randn());
  const R = new Array(n);
  for (let i = 0; i < n; i++) {
    let lz = 0;
    for (let k = 0; k <= i; k++) lz += L[i][k] * Z[k];   // (L·Z)_i
    R[i] = mu[i] + scale * lz;
  }
  return R;
}

// Portfölj-vikter vid en given ålder. Glidbana lägger gradvis över i obligationer.
// allocWorld = andel av AKTIEDELEN som är World; resten är SIXRX. Slidern (DOM)
// styr värdet — fallback 1.0 (100% World) om elementet saknas.
function currentAllocWorld() {
  const v = +document.getElementById("allocSlider")?.value;
  return Number.isFinite(v) ? v / 100 : 1.0;
}
// Användarens explicita ränteandel (0–80%). Returneras endast när glidbana är AV;
// glidbanan styr annars ränteandelen åldersberoende.
function currentBondFrac() {
  if (_glidbana) return 0;
  const v = +document.getElementById("bondSlider")?.value;
  return Number.isFinite(v) ? v / 100 : 0;
}
function portfolioWeightsAtAge(age, inputs) {
  const aw = inputs.allocWorld != null ? inputs.allocWorld : currentAllocWorld();
  let eqFrac;
  if (_glidbana) {
    eqFrac = equityFractionAtAge(age);
  } else {
    const bf = inputs.bondFrac != null ? inputs.bondFrac : currentBondFrac();
    eqFrac = 1 - bf;
  }
  return [ eqFrac * aw, eqFrac * (1 - aw), 1 - eqFrac ];   // [world, sweden, bondsSE]
}

// Portföljens std-avvikelse för en given mix (aktievikt världs-andel + ränteandel),
// beräknad från den empiriska Σ. Används för live-σ-etiketten i bondsslidern.
function portfolioStdFromMix(allocWorld, bondFrac) {
  const { sigmas, corr } = buildAssetUniverse();
  const Sigma = buildCovariance(sigmas, corr);
  const eq = 1 - bondFrac;
  const w = [eq * allocWorld, eq * (1 - allocWorld), bondFrac];
  let v = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) v += w[i] * w[j] * Sigma[i][j];
  return Math.sqrt(Math.max(0, v));
}

// Bygg μ-vektor från klassdef. Användarens `realReturn` tolkas som
// "förväntad real avkastning på aktiedelen" och skalar världs/Sverige-μ
// proportionellt — så MC-medelvärdet följer användarens knapp.
function muVectorFromInputs(inputs) {
  const userEq = inputs.realReturn / 100;
  const defEq  = ASSET_CLASSES_DEFAULT.world.mu;
  const k = defEq > 0 ? userEq / defEq : 1;
  return [
    ASSET_CLASSES_DEFAULT.world.mu   * k,
    ASSET_CLASSES_DEFAULT.sweden.mu  * k,
    ASSET_CLASSES_DEFAULT.bondsSE.mu,     // räntemarknaden följer inte aktie-knappen
  ];
}

// Förberäkna Σ och L en gång per körning (oberoende av väg & år).
function buildMcContext(inputs) {
  const { sigmas, corr } = buildAssetUniverse();
  const Sigma = buildCovariance(sigmas, corr);
  const L     = cholesky(Sigma);
  const mu    = muVectorFromInputs(inputs);
  return { mu, L, Sigma, sigmas };
}

// Samplar EN årlig portföljavkastning (skalär) för år `age` givet MVT-utfallet.
function portfolioReturnFromSample(R, age, inputs) {
  const w = portfolioWeightsAtAge(age, inputs);
  let r = 0;
  for (let i = 0; i < R.length; i++) r += w[i] * R[i];
  // Klampa: ingen bred portfölj har gjort sämre än ~−60% eller bättre än ~+100% ett år (real).
  return Math.max(-0.60, Math.min(1.0, r));
}

function runMonteCarlo(inputs, opts = {}) {
  const years = inputs.lifespan - inputs.age + 1;
  const ctx = buildMcContext(inputs);
  let successes = 0;
  const percentileData = [];
  const allCapitals = Array.from({ length: years }, () => []);

  for (let p = 0; p < MC_PATHS; p++) {
    const ret = new Array(years);
    for (let i = 0; i < years; i++) {
      const R = sampleMvtReturns(ctx.mu, ctx.L, MC_NU);
      ret[i] = portfolioReturnFromSample(R, inputs.age + i, inputs);
    }
    const res = simulate(inputs, { ...opts, returnOverride: ret });
    if (!res.ran_dry) successes++;
    res.flows.forEach((f, i) => allCapitals[i].push(f.totalCapital));
  }

  // Percentiler per år
  allCapitals.forEach((caps, i) => {
    caps.sort((a, b) => a - b);
    const pick = pct => caps[Math.floor(pct / 100 * (caps.length - 1))];
    percentileData.push({
      age: inputs.age + i,
      p10: pick(10), p25: pick(25), p50: pick(50), p75: pick(75), p90: pick(90),
    });
  });

  return {
    successRate: successes / MC_PATHS,
    percentileData,
  };
}

// ─── Tier-system (internt) ───────────────────────────────────────────────────
// Livsstils-nivåerna visas inte längre i UI:t (förvirrande efter att behovet blev
// ett enda kr/mån-fält). De finns kvar internt: "fire" = 25× (4%-regeln) används
// som "på spår"-definition. Planens robusthet mäts mot en enda tröskel: 80 %.
const TIER_MULTIPLE = { coast: 0, barista: 10, lean: 17, fire: 25, fat: 33 };
const TIER_ORDER    = ["coast", "barista", "lean", "fire", "fat"];
const ROBUST_SR     = 0.80;   // sannolikhetströskel för en robust plan

const TIER_LIFESTYLE = {
  coast:   { sideIncomeRatio: 1.0, untilAge: 65, minSuccessRate: 0.70,
             note: "Coast FI: sparandet klart — portföljen växer av sig själv till FIRE-mål vid 65. Du jobbar (eller inte), men tar inga uttag." },
  barista: { sideIncomeRatio: 0.5, untilAge: 65, minSuccessRate: 0.75,
             note: "Barista FIRE: halvtidsjobb täcker ~50% av behovet till 65. Portföljen fyller resten. Jobb = vald, inte tvingad." },
  lean:    { sideIncomeRatio: 0.0, untilAge: 0,  minSuccessRate: 0.75,
             note: "Lean FIRE: ~6% uttag. Kräver flexibilitet — kan sänka spending i dåliga år. Historiskt hög risk vid >35 år utan justering." },
  fire:    { sideIncomeRatio: 0.0, untilAge: 0,  minSuccessRate: 0.80,
             note: "FIRE: klassiska 4%-regeln. Målet är ≥80% — under det är planen inte robust nog för full pension utan inkomst." },
  fat:     { sideIncomeRatio: 0.0, untilAge: 0,  minSuccessRate: 0.90,
             note: "Fat FIRE: ~3% uttag. Kräver ≥90% sannolikhet — annars är du egentligen i FIRE-territoriet med hög spending." },
};

let activeTier = null;

function classifyTier(annualSpend, totalCapital) {
  if (totalCapital <= 0) return "coast";
  const m = totalCapital / annualSpend;
  if (m >= TIER_MULTIPLE.fat)     return "fat";
  if (m >= TIER_MULTIPLE.fire)    return "fire";
  if (m >= TIER_MULTIPLE.lean)    return "lean";
  if (m >= TIER_MULTIPLE.barista) return "barista";
  return "coast";
}

function earliestAgeForTier(baseInputs, tier) {
  if (tier === "coast") return earliestCoastAge(baseInputs);
  const threshold = TIER_MULTIPLE[tier];
  const inf = baseInputs.inflation / 100;
  // Kolla om de redan uppfyller kriteriet idag (ålder = current age)
  const simNow = simulate({ ...baseInputs, retire: baseInputs.age });
  const fNow   = simNow.flows.find(f => f.age === baseInputs.age);
  const spendNow = baseInputs.needPerMonth * 12;
  if (fNow && fNow.totalCapital / spendNow >= threshold) return baseInputs.age;
  for (let testAge = baseInputs.age + 1; testAge <= 75; testAge++) {
    const sim = simulate({ ...baseInputs, retire: testAge });
    const f   = sim.flows.find(f => f.age === testAge);
    if (!f) continue;
    const spend = baseInputs.needPerMonth * 12 * Math.pow(1 + inf, testAge - baseInputs.age);
    if (f.totalCapital / spend >= threshold) return testAge;
  }
  return null;
}

function earliestCoastAge(inputs) {
  const growth = (inputs.realReturn + inputs.inflation) / 100;
  const inf    = inputs.inflation / 100;
  const sim    = simulate({ ...inputs, retire: 999 });
  for (let testAge = inputs.age; testAge <= 65; testAge++) {
    const f = sim.flows.find(f => f.age === testAge);
    if (!f) continue;
    const projAt65   = f.totalCapital * Math.pow(1 + growth, 65 - testAge);
    const spendAt65  = inputs.needPerMonth * 12 * Math.pow(1 + inf, 65 - inputs.age);
    if (projAt65 / spendAt65 >= TIER_MULTIPLE.fire) return testAge;
  }
  return null;
}

// ─── Omvänd kalkyl: hur mycket spara för att gå vid X? ───────────────────────
function requiredSavings(inputs, targetRetireAge) {
  const inf = inputs.inflation / 100;
  // Binarysökning på sparandet [0, needPerMonth×5]
  let lo = 0, hi = inputs.needPerMonth * 5;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2;
    const sim = simulate({ ...inputs, savingsPerMonth: mid, retire: targetRetireAge });
    const f   = sim.flows.find(f => f.age === targetRetireAge);
    const spend = inputs.needPerMonth * 12 * Math.pow(1 + inf, targetRetireAge - inputs.age);
    const tier  = classifyTier(spend, f?.totalCapital ?? 0);
    const tierOk = TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf("fire");
    if (tierOk) hi = mid; else lo = mid;
  }
  return Math.ceil((lo + hi) / 2);
}

// ─── Behovsbaserad utvärdering (utan livsstils-tiers) ────────────────────────
// Allt nedan bygger på SAMMA mått som rubriken: sannolikhet (Monte Carlo, fat-
// tailed) att pengarna räcker livet ut. Vi använder en lättare MC (färre banor)
// för svep/sökningar så onboardingen inte hänger, och ett tröskelvärde på 80 %.
const SUSTAIN_TARGET    = 0.80;
const MC_PATHS_QUICK    = 600;   // lättare MC för svep/sökningar (snabbhet > precision)

// Snabb sannolikhet att planen håller (andel banor som inte tar slut).
function holdProbability(inputs, retireAge, paths = MC_PATHS_QUICK) {
  const base = { ...inputs, retire: retireAge };
  const years = base.lifespan - base.age + 1;
  const ctx = buildMcContext(base);
  let ok = 0;
  for (let p = 0; p < paths; p++) {
    const ret = new Array(years);
    for (let i = 0; i < years; i++) {
      const R = sampleMvtReturns(ctx.mu, ctx.L, MC_NU);
      ret[i] = portfolioReturnFromSample(R, base.age + i, base);
    }
    if (!simulate(base, { returnOverride: ret }).ran_dry) ok++;
  }
  return ok / paths;
}

// "Håller planen?" = ≥80 % sannolikhet att pengarna räcker till lifespan.
function planSustains(inputs, retireAge) {
  return holdProbability(inputs, retireAge) >= SUSTAIN_TARGET;
}

// Tidigaste ålder där nuvarande sparande bär needPerMonth med ≥80 % säkerhet.
// Hållsannolikheten är monoton i uttagsålder (senare frihet → mer pott, kortare
// uttag) → binärsökning räcker (~6 utvärderingar istället för 40).
function earliestSustainAge(inputs) {
  let lo = inputs.age, hi = 75;
  if (!planSustains(inputs, hi)) return null;
  if (planSustains(inputs, lo)) return lo;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (planSustains(inputs, mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// Hur mycket månadssparande krävs för att klara needPerMonth vid retireAge (≥80 %)?
function requiredSavingsToSustain(inputs, retireAge) {
  if (planSustains(inputs, retireAge)) return inputs.savingsPerMonth;
  let lo = inputs.savingsPerMonth, hi = Math.max(inputs.needPerMonth * 6, lo + 1000);
  // Säkerställ att hi faktiskt räcker; annars är målet orealistiskt vid den åldern
  if (!planSustains({ ...inputs, savingsPerMonth: hi }, retireAge)) return null;
  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) / 2;
    if (planSustains({ ...inputs, savingsPerMonth: mid }, retireAge)) hi = mid;
    else lo = mid;
  }
  return Math.ceil((lo + hi) / 2);
}

// Högsta månadsbehov som planen bär med ≥80 % vid given ålder ("tillåtelse att
// spendera"). Hållsannolikheten är monoton AVTAGANDE i behov → binärsökning.
function maxSustainableNeed(inputs, retireAge) {
  if (!planSustains(inputs, retireAge)) return null;        // håller inte ens nu
  let lo = inputs.needPerMonth, hi = inputs.needPerMonth * 2;
  let guard = 0;
  while (planSustains({ ...inputs, needPerMonth: hi }, retireAge) && guard++ < 8) {
    lo = hi; hi *= 1.5;
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (planSustains({ ...inputs, needPerMonth: mid }, retireAge)) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 500) * 500;
}

// ─── Chart: dubbel panel (ackumulering + brygga) ─────────────────────────────
function drawCharts(flows, retireAge, mcData) {
  drawAccumChart(flows, retireAge, mcData);
  drawBridgeChart(flows, retireAge);
}

// Stresstest-noter: livslängd (arv vs slut) + inflation (köpkraftsspegel).
function renderStressNotes(inputs, result) {
  const lvVal = $("lifespanVal");
  if (lvVal) lvVal.textContent = inputs.lifespan;

  const lnEl = $("longevityNote");
  if (lnEl) {
    const dry = result.flows.find(f => f.age > inputs.retire && f.age < inputs.lifespan && f.totalCapital <= 1);
    if (dry) {
      lnEl.className = "field-note lv-warn";
      lnEl.innerHTML = `Pengarna tar slut vid ~<strong>${dry.age} år</strong> — före din planerade ${inputs.lifespan}. Lever du längre ökar risken; lever du kortare hade det räckt.`;
    } else {
      lnEl.className = "field-note";
      lnEl.innerHTML = `Vid ${inputs.lifespan} år: ~<strong>${fmtKr(result.finalCapital)}</strong> kvar att lämna i arv. Lever du kortare blir överskottet större — planera långt, en 65-åring når ofta 90+.`;
    }
  }

  const inEl = $("inflationNote");
  if (inEl) {
    const infl = inputs.inflation / 100;
    const yrs  = Math.max(0, inputs.retire - inputs.age);
    const pp100 = 100 / Math.pow(1 + infl, yrs);
    const nominalNeed = inputs.needPerMonth * Math.pow(1 + infl, yrs);
    inEl.className = "field-note";
    inEl.innerHTML = `Vid ${inputs.inflation}% inflation har 100 kr tappat till ~<strong>${Math.round(pp100)} kr</strong> köpkraft till din frihet (${yrs} år). Din ${fmtKr(inputs.needPerMonth)}/mån kostar då ~${fmtKr(nominalNeed)}/mån i löpande pengar — planen räknar redan med det.`;
  }
}

// Human capital (nuvärde av framtida löner) → finansiellt kapital. Visar frihet
// som omvandlingen av arbetsförmåga till tillgångar, inte ett magiskt tal.
function drawHumanCapitalChart(flows, inputs) {
  const c = $("hcChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const crossEl = $("hcCrossNote");
  const salary = numv("salary");

  if (salary <= 0 || flows.length < 2 || inputs.retire <= inputs.age) {
    ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "center";
    ctx.font = "14px -apple-system, system-ui, sans-serif";
    ctx.fillText("Ange din månadslön för att se din arbetsförmåga omvandlas till kapital.", W / 2, H / 2);
    if (crossEl) crossEl.textContent = "";
    return;
  }

  const age0 = inputs.age, retire = inputs.retire;
  const d = Math.max(0.001, inputs.realReturn / 100);   // real diskonteringsränta
  const annualIncome = salary * 12;                      // real, konstant

  const hcAt = (a) => {                                   // nuvärde av kvarvarande löner
    let pv = 0;
    for (let t = a; t < retire; t++) pv += annualIncome / Math.pow(1 + d, t - a);
    return pv;
  };
  const fcAt = (a) => { const f = flows.find(x => x.age === a); return f ? Math.max(0, f.totalCapital) : 0; };

  const data = [];
  for (let a = age0; a <= retire; a++) data.push({ a, hc: hcAt(a), fc: fcAt(a) });
  const maxTot = Math.max(...data.map(p => p.hc + p.fc), 1);

  const padL = 60, padR = 12, padT = 16, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = a => padL + (a - age0) / Math.max(1, retire - age0) * plotW;
  const yFor = v => padT + plotH - Math.max(0, Math.min(1, v / maxTot)) * plotH;

  ctx.font = "11px -apple-system, system-ui, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH / 4 * i, v = maxTot * (1 - i / 4);
    ctx.strokeStyle = "#1a1a1a10"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "right"; ctx.fillText(fmtKr(v).replace(" kr", ""), padL - 4, y + 4);
  }

  const drawArea = (key, base, color) => {
    ctx.beginPath();
    data.forEach((p, i) => { const x = xFor(p.a), y = yFor(base(p)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = data.length - 1; i >= 0; i--) { const p = data[i]; ctx.lineTo(xFor(p.a), yFor(base(p) + p[key])); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  drawArea("fc", () => 0, "#3a5a40");           // finansiellt kapital (botten)
  drawArea("hc", (p) => p.fc, "#c46d4d");       // arbetsförmåga (ovanpå)

  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil((retire - age0) / 6));
  for (let a = age0; a <= retire; a += step) ctx.fillText(a, xFor(a), H - 12);

  ctx.strokeStyle = "#c46d4d"; ctx.setLineDash([4, 4]); ctx.beginPath();
  ctx.moveTo(xFor(retire), padT); ctx.lineTo(xFor(retire), padT + plotH); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#c46d4d"; ctx.textAlign = "right"; ctx.fillText("frihet " + retire, xFor(retire) - 4, padT + 12);

  const cross = data.find(p => p.fc > p.hc);
  if (crossEl) crossEl.textContent = cross
    ? `↔ Vid ${cross.a} år väger kapitalet tyngre än din arbetsförmåga`
    : "";
}

// Full livscykel: sparande → topp vid frihet → uttag/nedtrappning.
function drawAccumChart(flows, retireAge, mcData) {
  const c = $("accumChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  if (flows.length < 2) return;
  const age0 = flows[0].age;
  const ageN = flows[flows.length - 1].age;

  const padL = 60, padR = 12, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Kapa Y-skalan så medianen + nedsidan blir läsbar. p90-banorna växer
  // exponentiellt över 55 år och skulle annars trycka ihop allt. Vi skalar
  // till ~p75-nivå (max-median × 2,5) och klipper enstaka turbanor upptill.
  let maxCap;
  if (mcData) {
    const maxMedian = Math.max(...mcData.map(d => d.p50), ...flows.map(f => f.totalCapital));
    const maxP75    = Math.max(...mcData.map(d => d.p75));
    maxCap = Math.min(maxP75, maxMedian * 2.5);
  } else {
    maxCap = Math.max(...flows.map(f => f.totalCapital));
  }
  if (maxCap === 0) return;

  const xFor = age => padL + (age - age0) / (ageN - age0) * plotW;
  const yFor = val => padT + plotH - Math.max(0, Math.min(1, val / maxCap)) * plotH;

  // Grid + Y-labels
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    const v = maxCap * (1 - i / 4);
    ctx.strokeStyle = "#1a1a1a10";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "right";
    ctx.fillText(fmtKr(v).replace(" kr", ""), padL - 4, y + 4);
  }

  // Markörer: frihet (koral) och pension 65 (grå streckad)
  const drawMarker = (age, label, color) => {
    if (age < age0 || age > ageN) return;
    const x = xFor(age);
    ctx.strokeStyle = color; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.textAlign = "center";
    ctx.font = "10px -apple-system, system-ui, sans-serif";
    ctx.fillText(label, x, padT + 10);
  };

  // MC-fan över HELA livscykeln
  if (mcData) {
    const fillBand = (pLo, pHi, alpha) => {
      ctx.beginPath();
      mcData.forEach((d, i) => {
        const x = xFor(d.age), y = yFor(d[pLo]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      [...mcData].reverse().forEach(d => ctx.lineTo(xFor(d.age), yFor(d[pHi])));
      ctx.closePath();
      ctx.fillStyle = `rgba(88,129,87,${alpha})`;
      ctx.fill();
    };
    fillBand("p10", "p90", 0.10);
    fillBand("p25", "p75", 0.16);

    ctx.beginPath();
    mcData.forEach((d, i) => {
      const x = xFor(d.age), y = yFor(d.p50);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#3a5a40"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }

  // Deterministisk linje
  ctx.beginPath();
  flows.forEach((f, i) => {
    const x = xFor(f.age), y = yFor(f.totalCapital);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = mcData ? "#1a1a1a40" : "#3a5a40";
  ctx.lineWidth = mcData ? 1 : 2.5;
  ctx.setLineDash(mcData ? [4, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1;

  // Markörer
  drawMarker(retireAge, "frihet", "#c46d4d");
  drawMarker(65, "pension", "#1a1a1a40");

  // X-axis ålder-labels var 5:e
  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "center";
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  flows.forEach(f => {
    if (f.age % 5 === 0) ctx.fillText(f.age, xFor(f.age), H - padB + 18);
  });

  // Värde vid frihet — median om MC finns (matchar gröna linjen), annars deterministisk
  const mcAtRetire = mcData?.find(d => d.age === retireAge);
  const peakVal = mcAtRetire ? mcAtRetire.p50 : flows.find(f => f.age === retireAge)?.totalCapital;
  if (peakVal != null) {
    ctx.fillStyle = "#c46d4d"; ctx.textAlign = "center";
    ctx.font = "bold 11px -apple-system, system-ui, sans-serif";
    ctx.fillText(fmtKr(peakVal), xFor(retireAge), yFor(peakVal) - 6);
  }
}

function drawBridgeChart(flows, retireAge) {
  const c = $("bridgeChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const retYears = flows.filter(f => f.age >= retireAge);
  if (retYears.length === 0) return;

  const maxNeed = Math.max(...retYears.map(f => f.need));
  if (maxNeed === 0) return;

  const padL = 56, padR = 12, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW  = plotW / retYears.length;

  // Grid
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    const v = maxNeed * (1 - i / 4);
    ctx.strokeStyle = "#1a1a1a10";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a";
    ctx.textAlign = "right";
    ctx.fillText(fmtKr(v).replace(" kr", ""), padL - 4, y + 4);
  }

  // Stackade lager underifrån: inkomstpension → premiepension → TJP → bridge-pott
  retYears.forEach((f, i) => {
    const x = padL + i * barW;
    const w = Math.max(1, barW - 1);
    let yBase = padT + plotH;   // botten

    const stack = (amount, color) => {
      if (amount <= 0) return;
      const h = (amount / maxNeed) * plotH;
      ctx.fillStyle = color;
      ctx.fillRect(x, yBase - h, w, h);
      yBase -= h;
    };
    stack(f.inkomstInc, "#3a5a40");   // inkomstpension — mörkgrön
    stack(f.premieInc,  "#588157");   // premiepension — mellangrön
    stack(f.tjpInc,     "#a3b18a");   // tjänstepension — ljusgrön
    stack(f.bridgeDraw, "#c46d4d");   // bridge-pott (ISK/depå) — koral

    // Streck för behov
    const ny = padT + plotH - (f.need / maxNeed) * plotH;
    ctx.strokeStyle = "#1a1a1a20";
    ctx.beginPath(); ctx.moveTo(x, ny); ctx.lineTo(x + w, ny); ctx.stroke();
  });

  // X-axis
  ctx.fillStyle = "#8a8a8a";
  ctx.textAlign = "center";
  retYears.forEach((f, i) => {
    if (f.age % 5 === 0 || i === 0 || i === retYears.length - 1)
      ctx.fillText(f.age, padL + i * barW + barW / 2, H - padB + 18);
  });

  // Markörer där TJP resp. allmän pension börjar
  const mark = (age, label) => {
    const idx = retYears.findIndex(f => f.age === age);
    if (idx < 0) return;
    const x = padL + idx * barW;
    ctx.strokeStyle = "#1a1a1a30"; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4a4a4a"; ctx.textAlign = "left";
    ctx.font = "10px -apple-system, system-ui, sans-serif";
    ctx.fillText(label, x + 3, padT + 10);
  };
  // Hitta första året med TJP resp. allmän
  const tjpStartAge = retYears.find(f => f.tjpInc > 0)?.age;
  const allmanStartAge = retYears.find(f => f.inkomstInc > 0)?.age;
  if (tjpStartAge) mark(tjpStartAge, `${tjpStartAge} TJP`);
  if (allmanStartAge && allmanStartAge !== tjpStartAge) mark(allmanStartAge, `${allmanStartAge} allmän`);
}

// ─── Plan summary ────────────────────────────────────────────────────────────
const TIER_NAMES = { coast:"Coast FI", barista:"Barista FIRE", lean:"Lean FIRE", fire:"FIRE", fat:"Fat FIRE" };

function updatePlanSummary(inputs, successRate) {
  const el = $("planSummaryText");
  if (!el) return;
  const minSr  = ROBUST_SR;
  const sr     = successRate;
  const need   = fmtKr(inputs.needPerMonth);

  if (sr === null) {
    // Före MC är klart — visa det vi vet
    el.innerHTML = `Din plan: <strong>${need}/mån</strong> från <strong>${inputs.retire} år</strong>. Beräknar sannolikhet…`;
    return;
  }

  const srPct  = Math.round(sr * 100);
  const minPct = Math.round(minSr * 100);
  const gap    = sr - minSr;

  // Hitta närmaste age för att nå målet med minSr
  const needed = _srTable.length >= 3 ? srLookup(minSr) : null;

  if (gap >= 0.05) {
    el.innerHTML = `
      <span class="ps-good">✓ Din plan håller.</span>
      ${need}/mån från ${inputs.retire} år med <strong>${srPct}%</strong> sannolikhet — ${srPct - minPct} pp över gränsen för en robust plan.`;
  } else if (gap >= 0) {
    el.innerHTML = `
      <span class="ps-good">✓ Planen fungerar</span>, men med snäva marginaler.
      ${need}/mån från ${inputs.retire} år — ${srPct}% sannolikhet (målet är ≥${minPct}%).`;
  } else {
    const fixText = needed
      ? `Flytta pension till <strong>${needed} år</strong> eller öka sparandet.`
      : `Öka sparandet eller senarelägg pensionen.`;
    el.innerHTML = `
      <span class="ps-warn">⚠ Planen behöver justeras.</span>
      ${srPct}% sannolikhet — en robust plan vill ha ≥${minPct}%. ${fixText}`;
  }
}

// ─── Spara-omvänd kalkyl ─────────────────────────────────────────────────────
function updateReversecalc(inputs) {
  const el = $("reverseSavings");
  if (!el) return;

  const targetTierLocal = activeTier || "fire";
  const earliestNow = earliestAgeForTier(inputs, targetTierLocal);
  const isOnTrack   = earliestNow !== null && earliestNow <= inputs.retire;

  if (isOnTrack) {
    // På spår → visa hur mycket TIDIGARE de kan gå om de sparar mer
    const moreInput = { ...inputs, savingsPerMonth: inputs.savingsPerMonth + 5000 };
    const earliestIfMore = earliestAgeForTier(moreInput, targetTierLocal);
    const gain = earliestIfMore !== null ? inputs.retire - earliestIfMore : 0;
    el.innerHTML = gain > 0
      ? `+5 000 kr/mån extra → ${earliestIfMore} år <em>(${gain} år tidigare)</em>`
      : `Din plan håller redan — bra som den är.`;
  } else {
    // Inte på spår → visa ANTINGEN mer sparande ELLER sen ålder — aldrig båda
    const needed = requiredSavings(inputs, inputs.retire);
    const delta  = Math.max(0, needed - inputs.savingsPerMonth);

    if (earliestNow !== null) {
      // Välj tydligaste alternativet
      el.innerHTML = `Spara <strong>${fmtKr(delta)}/mån</strong> mer → ${inputs.retire} år`;
      el.innerHTML += `<span style="color:var(--ink-400);font-size:12px"> · utan extra: ${earliestNow} år</span>`;
    } else {
      el.textContent = `Spara ${fmtKr(delta)}/mån mer för att nå ${inputs.retire} år`;
    }
  }
}

// ─── Huvudberäkning ───────────────────────────────────────────────────────────
let _mcTimeout   = null;
let _lastMcData  = null;
let _lastMcSuccess = null;   // senaste MC success-rate (för jämförelse i backtest)
let _lastTier      = "fire"; // senaste klassificerade tier
let _srTable     = [];   // [{age, rate}] förberäknad lookup för success-rate slider
let _srTableInputsKey = ""; // cache-nyckel så vi inte räknar om i onödan

function getInputs() {
  const age = +$("age").value;
  // Deltidsarbete efter frihet: nettolön av X % av lönen täcker en del av behovet.
  const ptPct   = +($("partTimePct")?.value || 0);
  const ptUntil = +($("partTimeUntil")?.value || 0);
  const salaryY = numv("salary") * (ptPct / 100) * 12;
  const sideIncomeAnnual = ptPct > 0 ? Math.max(0, salaryY - incomeTax(salaryY, age, true)) : 0;
  return {
    age,
    retire:         +$("retire").value,
    lifespan:       +$("lifespan").value,
    sideIncomeAnnual,
    partTimeUntilAge: ptPct > 0 ? ptUntil : 0,
    needPerMonth:   numv("needPerMonth"),
    savingsPerMonth:numv("savingsPerMonth"),
    iskBalance:     numv("iskBalance"),
    kfBalance:      numv("kfBalance"),
    depaBalance:    numv("depaBalance"),
    tjpPott:        numv("tjpPott"),
    tjpPeriod:      +$("tjpPeriod").value,
    // TJP-avsättning: avtals-avsättning på (skyddad) bruttolön + löneväxling × faktor.
    tjpContrib:     (tjpContribFromAvtal($("avtal")?.value || "ingen", numv("salary")) ?? numv("tjpContrib"))
                    + numv("loneVaxling") * VAXLINGSFAKTOR,
    avtal:          $("avtal")?.value || "ingen",
    allmanMonthly:  numv("allmanMonthly"),   // fältet är källa; lön för-ifyller det
    realReturn:     +$("realReturn").value,
    inflation:      +$("inflation").value,
    loanBalance:    numv("loanBalance"),
    loanRate:       +($("loanRate")?.value || 0),
    loanAmort:      numv("loanAmort"),
    propertyValue:  numv("propertyValue"),
    bigExpenses:    readBigExpenses(),
  };
}

// Läs större engångsutgifter från raderna i inmatningen.
function readBigExpenses() {
  return [...document.querySelectorAll(".bigexp-row")].map(r => ({
    label:  r.querySelector(".bigexp-label")?.value || "",
    amount: numv(r.querySelector(".bigexp-amount")),
    age:    +(r.querySelector(".bigexp-age")?.value || 0),
  })).filter(e => e.amount > 0 && e.age > 0);
}

// Lagstadgat amorteringskrav (lag 2026:226, från 1 april 2026). Endast belånings-
// grad styr: >70 % → 2 %/år, 50–70 % → 1 %, ≤50 % → 0. Det SKÄRPTA (skuldkvots-)
// kravet på +1 procentenhet vid lån >4,5× bruttoinkomst är SLOPAT 2026-04-01.
// OBS: kravet räknas på ursprungligt lånebelopp; här uppskattat på nuvarande lån.
function amorteringskrav(loan, propertyValue) {
  if (loan <= 0 || propertyValue <= 0) return null;
  const ltv = loan / propertyValue;
  const pct = ltv > 0.70 ? 0.02 : ltv > 0.50 ? 0.01 : 0;
  return { ltv, pct, annual: pct * loan, monthly: pct * loan / 12 };
}

// Två-vägs-synk mellan belåningsgrad-slider och kvarvarande lån + autofyll amort.
let _bolanSource = "ltv";   // "ltv" = slidern styr lånet, "loan" = användaren skrev lånet
function syncBolan() {
  const pv     = numv("propertyValue");
  const slider = $("ltvSlider");
  const loanF  = $("loanBalance");
  const amortF = $("loanAmort");
  if (!slider || !loanF) return;

  if (pv > 0) {
    if (_bolanSource === "loan") {
      const ltv = Math.max(0, Math.min(90, numv(loanF) / pv * 100));
      slider.value = Math.round(ltv);
    } else {
      setNumVal(loanF, Math.round((+slider.value / 100) * pv / 1000) * 1000);   // jämn 1000-tal
    }
  }
  const ltvEl = $("ltvVal");
  if (ltvEl) ltvEl.textContent = `${Math.round(+slider.value)} %`;

  // Amorteringen autofylls med lagkravet om användaren inte skrivit eget belopp
  if (amortF && !amortF._userEdited) {
    const krav = amorteringskrav(numv(loanF), pv);
    setNumVal(amortF, krav ? Math.round(krav.monthly / 100) * 100 : 0);
  }
}

// Deltid efter frihet: visa till-ålder + en liten förklaring av nettoinkomsten.
function updatePartTimeUI() {
  const pct  = +($("partTimePct")?.value || 0);
  const row  = $("partTimeUntilRow");
  const hint = $("partTimeHint");
  if (row) row.style.display = pct > 0 ? "" : "none";
  if (!hint) return;
  if (pct > 0) {
    const grossY = numv("salary") * (pct / 100) * 12;
    const netM   = Math.max(0, grossY - incomeTax(grossY, +$("age").value, true)) / 12;
    const until  = +($("partTimeUntil")?.value || 0);
    hint.style.display = "";
    hint.innerHTML = numv("salary") > 0
      ? `Deltid ${pct} % ≈ <strong>${fmtKr(netM)}/mån</strong> netto fram till ${until} år — täcker en del av behovet, så du behöver mindre kapital.`
      : `Ange din lön ovan så räknar vi ut hur mycket deltiden täcker.`;
  } else {
    hint.style.display = "none";
  }
}

function recalc() {
  _glidbana = !!document.getElementById("glidbana")?.checked;
  setExcludeRateCrisis(!!document.getElementById("excludeRateCrisis")?.checked);
  _kommunalskatt = getKommunalskatt();
  const krEl = document.getElementById("kommunRate");
  if (krEl) krEl.textContent = `${(_kommunalskatt*100).toFixed(2)}% kommunalskatt`;

  // För-ifyll allmän pension från lön — VID VALD FRIHETSÅLDER (reducerad).
  // Löneväxling sänker pensionsgrundande lön; allmanAt65Full takar vid 7,5 IBB så
  // det påverkar bara om man växlar ner sig under taket (vilket man inte bör).
  const salaryVal = numv("salary");
  const salaryEfterVaxling = Math.max(0, salaryVal - numv("loneVaxling"));
  const retireVal = +$("retire").value;
  const amField = $("allmanMonthly");
  if (amField && salaryVal > 0 && !amField._userEdited) {
    setNumVal(amField, Math.round(allmanAt65Full(salaryEfterVaxling) * allmanFactor(retireVal)));
  }

  // Löneväxling-not: varna under golvet, annars visa nyttan.
  const lvEl = $("loneVaxlingNote");
  const lv = numv("loneVaxling");
  if (lvEl) {
    if (lv <= 0) {
      lvEl.style.display = "none";
    } else if (salaryEfterVaxling < LONEVAXLING_GOLV) {
      lvEl.style.display = "";
      lvEl.className = "field-note lv-warn";
      lvEl.innerHTML = `⚠ Lön efter växling ${fmtKr(salaryEfterVaxling)}/mån är under golvet ${fmtKr(LONEVAXLING_GOLV)} (8,07 IBB) — du tappar allmän pension och sjuk-/föräldrapenning. Väx bara lön över golvet.`;
    } else {
      lvEl.style.display = "";
      lvEl.className = "field-note";
      const overBryt = salaryVal * 12 > BRYTPUNKT_ARBETANDE;
      const avtal = $("avtal")?.value || "ingen";
      const privat    = ["itp1", "itp2", "saflo"].includes(avtal);
      const offentlig = ["akapkr", "kapkl", "pa16"].includes(avtal);
      // Lugn räknar ordinarie TJP på lönen FÖRE växling. Men skyddet är inte
      // automatiskt i privat sektor → varna avtals-medvetet.
      const skydd = privat
        ? ` <strong>Säkerställ i avtalet</strong> att din ordinarie tjänstepension beräknas på lönen <em>före</em> växling — det är inte automatiskt i privat sektor (Pensionsmynd./facken).`
        : offentlig
          ? ` Inom kommun/region/stat är skyddet oftast standardiserat — ordinarie pension beräknas på oreducerad lön.`
          : ` Säkerställ med arbetsgivaren att din ordinarie tjänstepension inte sänks av växlingen.`;
      lvEl.innerHTML = `${fmtKr(lv)}/mån → ~${fmtKr(lv * VAXLINGSFAKTOR)}/mån till tjänstepension (×${VAXLINGSFAKTOR}).`
        + (overBryt ? " Du slipper 20 % statlig skatt nu." : "")
        + skydd;
    }
  }

  // ── Bolån: belåningsgrad-slidern styr kvarvarande lån; amortering autofylls med
  //    lagkravet (ordinarie belåningsgradskrav) om användaren inte skrivit eget. ──
  syncBolan();
  updatePartTimeUI();

  const inputs = getInputs();

  // Visa avtals-info: avsättning + tidigast uttag
  const avtalEl = document.getElementById("avtalInfo");
  const avtalKey = $("avtal")?.value || "ingen";
  const salForAvtal = numv("salary");
  if (avtalEl) {
    const a = AVTAL[avtalKey];
    const contrib = tjpContribFromAvtal(avtalKey, salForAvtal);
    if (contrib != null) {
      avtalEl.textContent = `${fmtKr(contrib)}/mån avsätts · tidigast uttag ${a.earliest} år`;
    } else if (a && !a.custom) {
      avtalEl.textContent = `${(a.low*100).toFixed(1)}% / ${(a.high*100).toFixed(1)}% av lön · ange lön nedan`;
    } else {
      avtalEl.textContent = "avsättning + tidigast uttag";
    }
  }

  // Hint på lön-fältet
  const acEl = document.getElementById("allmanComputed");
  if (acEl) {
    acEl.textContent = salaryVal > 0 ? "→ fyller i allmän pension nedan" : "räknar allmän pension åt dig";
  }

  // Liten not under allmän pension-fältet: vad du får om du jobbar till 65
  const at65El = document.getElementById("allmanAt65Note");
  if (at65El) {
    if (salaryVal > 0 && inputs.retire < 65) {
      const full65 = Math.round(allmanAt65Full(salaryVal));
      at65El.textContent = `Vid din frihetsålder ${inputs.retire}. Jobbar du till 65: ≈ ${fmtKr(full65)}/mån.`;
      at65El.style.display = "";
    } else {
      at65El.style.display = "none";
    }
  }

  const lifestyle = activeTier
    ? TIER_LIFESTYLE[activeTier]
    : { sideIncomeRatio: 0, untilAge: 0 };

  const result = simulate(inputs, {
    sideIncomeRatio: lifestyle.sideIncomeRatio,
    sideIncomeUntilAge: lifestyle.untilAge,
  });

  const ytr = inputs.retire - inputs.age;
  const inf = inputs.inflation / 100;

  // Beräkna om de faktiskt är på spår för sitt mål (tier vid retire-ålder)
  const flowAtGoal     = result.flows.find(f => f.age === inputs.retire);
  const capitalAtGoal  = flowAtGoal?.totalCapital ?? 0;
  const annualSpendGoal = inputs.needPerMonth * 12 * Math.pow(1 + inf, ytr);
  const tierAtGoal     = classifyTier(annualSpendGoal, capitalAtGoal);
  const targetTier     = activeTier || "fire";  // använd aktiv tier eller fire som mål

  // Earliestage för målnivån med NUVARANDE sparande
  const earliestTarget = earliestAgeForTier(inputs, targetTier);
  const isOnTrackForGoal = earliestTarget !== null && earliestTarget <= inputs.retire;

  // Person-centrerat svar
  const answerAge = $("answerAge");
  const answerSub = $("answerSub");
  if (isOnTrackForGoal) {
    if (answerAge) { answerAge.textContent = `${inputs.retire} år`; answerAge.style.color = ""; }
    if (answerSub) answerSub.innerHTML = `<span style="color:#7ec8a0">✓ Du är på spår</span> — portföljen bär tills pensionerna fasas in`;
  } else {
    // Inte på spår — visa VERKLIGT möjlig ålder, inte målet
    const realistiskAlder = earliestTarget ?? (earliestAgeForTier(inputs, "lean") ?? (earliestAgeForTier(inputs, "barista") ?? "?"));
    if (answerAge) { answerAge.textContent = `${realistiskAlder} år`; answerAge.style.color = "var(--coral-500)"; }
    if (answerSub) answerSub.innerHTML = `Med nuvarande sparande — du siktar på ${inputs.retire} år, se nedan hur`;
  }

  // Bridge-detalj — pensionerna fasas in: TJP först (avtal), sen allmän (63)
  if ($("bridgeSub")) {
    const avtalE = (AVTAL[inputs.avtal]?.earliest) ?? 55;
    const tjpS = Math.max(inputs.retire, avtalE);
    const allmS = Math.max(inputs.retire, ALLMAN_EARLIEST);
    $("bridgeSub").textContent = inputs.retire < allmS
      ? `Portföljen ensam ${inputs.retire}–${tjpS}, sen TJP, full pension från ${allmS}`
      : `Pension tillgänglig direkt från ${inputs.retire}`;
  }

  $("endAge").textContent     = inputs.lifespan;
  $("endCapital").textContent = fmtKr(result.finalCapital);

  // Tier
  const flowAtRetire     = result.flows.find(f => f.age === inputs.retire);
  const capitalAtRetire  = flowAtRetire?.totalCapital ?? 0;
  const annualSpend      = inputs.needPerMonth * 12 * Math.pow(1 + inf, ytr);
  const currentTier      = classifyTier(annualSpend, capitalAtRetire);

  _lastTier = currentTier;

  // Uppdatera "Din plan i ett nötskal" — preliminärt tills MC är klart
  updatePlanSummary(inputs, null);

  // Tidigast hållbar ålder (≥80 % MC) — för insikter om du kan gå tidigare/senare
  const earliest80 = earliestSustainAge(inputs);

  syncIskAfDefaults();
  renderShock(inputs);
  renderFeeDrag();
  renderWithdrawalOpt(inputs);
  renderTrygghet();
  renderBacktest();

  // Synka reverseAge med retire om användaren inte rört den
  const raInput = $("reverseAge");
  if (raInput && !raInput._userMoved) raInput.value = inputs.retire;

  // Charts: rita deterministisk direkt, MC-fan med kort fördröjning
  drawCharts(result.flows, inputs.retire, _lastMcData);
  drawHumanCapitalChart(result.flows, inputs);
  renderStressNotes(inputs, result);
  updateReversecalc(inputs);

  // MC-simulering: fördröj 300ms så UI:t inte hänger vid snabb input
  // Visa "räknar" medan MC snurrar
  $("successRate").textContent = "…";
  $("successRate").className = "success-badge";
  $("successLabel").textContent = `Räknar ${MC_PATHS.toLocaleString("sv")} banor…`;

  clearTimeout(_mcTimeout);
  _mcTimeout = setTimeout(() => {
    const mc = runMonteCarlo(inputs, {
      sideIncomeRatio: lifestyle.sideIncomeRatio,
      sideIncomeUntilAge: lifestyle.untilAge,
    });
    _lastMcData = mc.percentileData;

    // Uppdatera success rate badge — färg relativt robusthetströskeln (80 %)
    const sr    = mc.successRate;
    const tier  = "fire";          // intern referens för score/insikter (4%-regeln)
    const minSr = ROBUST_SR;
    const gap   = sr - minSr;

    const badge = $("successRate");
    badge.textContent = fmtPct(sr * 100);
    badge.className = "success-badge " +
      (gap >= 0.05 ? "good" : gap >= 0 ? "ok" : "warn");

    const srLabel = $("successLabel");
    const minPct  = Math.round(minSr * 100);
    if (srLabel) {
      if (gap >= 0.05) {
        srLabel.textContent = `av ${MC_PATHS} banor. En robust plan vill ha ≥${minPct}% — god marginal.`;
      } else if (gap >= 0) {
        srLabel.textContent = `av ${MC_PATHS} banor. En robust plan vill ha ≥${minPct}% — precis godkänt, snäva marginaler.`;
      } else {
        const needed = _srTable.length >= 3 ? srLookup(minSr) : null;
        srLabel.innerHTML = `av ${MC_PATHS} banor. <strong>En robust plan vill ha ≥${minPct}%</strong> — planen håller inte än. `
          + (needed ? `Pension vid ${needed} år ger ≥${minPct}%.` : `Justera med slidern nedan.`);
      }
    }

    // Sätt sliderns default till tier-tröskeln (om användaren inte rört den)
    const slider = $("srSlider");
    if (slider && !slider._userMoved) {
      slider.value = minPct;
      updateSrSliderDisplay();
    }

    // Rita om med fan chart
    drawCharts(result.flows, inputs.retire, mc.percentileData);
    updatePlanSummary(inputs, mc.successRate);

    // Lugn-score + Insights (Conquest-stil plan-känsla)
    const scoreData = computeLugnScore(inputs, mc, tier, result);
    renderPlanScore(scoreData);
    const insights = generateInsights(inputs, mc, result, earliest80);
    renderInsights(insights);

    // Spara MC-resultat och uppdatera backtest-jämförelsen sida-vid-sida
    _lastMcSuccess = mc.successRate;
    renderBacktest();

    // Bygg SR-lookup-tabell om inputs ändrats (körs i bakgrunden efter MC)
    const key = `${inputs.age}|${inputs.needPerMonth}|${inputs.savingsPerMonth}|${inputs.iskBalance}|${inputs.kfBalance}|${inputs.depaBalance}|${inputs.tjpPott}|${inputs.tjpPeriod}|${inputs.allmanMonthly}|${inputs.realReturn}|${inputs.inflation}`;
    if (key !== _srTableInputsKey) {
      _srTableInputsKey = key;
      buildSrTable(inputs, lifestyle);
    }
  }, 300);
}

// ─── Lugn-score (SAM SCORE-motsvarighet) ──────────────────────────────────────
// Ett tal 0-100 för planens kvalitet. Fyra komponenter, viktade.
function computeLugnScore(inputs, mc, tier, result) {
  const minSr = ROBUST_SR;

  // 1. Hållbarhet (45%) — Monte Carlo success rate vs robusthetströskeln.
  //    Full poäng vid minSr+10pp, noll vid minSr−40pp.
  const sustainability = clamp01((mc.successRate - (minSr - 0.40)) / 0.50);

  // 2. Skatteeffektivitet (20%) — andel i skatteeffektiva wrappers.
  const total = inputs.iskBalance + inputs.kfBalance + inputs.depaBalance;
  const efficient = inputs.iskBalance + inputs.kfBalance * 0.95;  // depå minst effektiv
  const taxEff = total > 0 ? efficient / total : 1;

  // 3. Brygga (15%) — håller portföljen hela vägen utan att ta slut?
  const bridge = result.ran_dry ? 0.35 : 1;

  // 4. Komplett (20%) — har de fyllt i pension-data?
  let completeness = 0.4;
  if (inputs.tjpPott > 0)      completeness += 0.3;
  if (inputs.allmanMonthly > 0) completeness += 0.3;

  const score = Math.round(100 * (
    0.45 * sustainability +
    0.20 * taxEff +
    0.15 * bridge +
    0.20 * completeness
  ));

  return { score, parts: { sustainability, taxEff, bridge, completeness }, minSr };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function scoreGrade(score) {
  if (score >= 85) return { label: "Stark plan",    cls: "good" };
  if (score >= 70) return { label: "Robust plan",   cls: "good" };
  if (score >= 55) return { label: "Okej plan",     cls: "ok" };
  if (score >= 40) return { label: "Behöver jobb",  cls: "warn" };
  return { label: "Tidig fas", cls: "warn" };
}

// ─── Insights-motor ("Att tänka på") ──────────────────────────────────────────
// Rangordnade, vägledande observationer. Aldrig dikterande.
function generateInsights(inputs, mc, result, earliest80) {
  const insights = [];
  const minSr  = ROBUST_SR;
  const sr = mc.successRate;

  // — Hållbarhet —
  if (sr < minSr) {
    const needed = _srTable.length >= 3 ? srLookup(minSr) : null;
    insights.push({
      sev: 3, icon: "⚠",
      title: "Planen håller inte ända fram",
      body: `Med ${Math.round(sr*100)}% sannolikhet når den inte robusthetströskeln på ${Math.round(minSr*100)}%. `
        + (needed ? `I ett scenario där du går vid ${needed} år istället håller den.` : `Mer sparande eller senare frihet hjälper.`),
    });
  } else if (sr - minSr >= 0.10) {
    insights.push({
      sev: 1, icon: "✓",
      title: "Du har god marginal",
      body: earliest80 && earliest80 < inputs.retire
        ? `Planen är stark. Med ≥80 % säkerhet bär den redan från ${earliest80} år — du kan gå tidigare, eller leva på mer.`
        : `Planen är stark med ${Math.round(sr*100)}% sannolikhet. Du har utrymme att leva på mer eller gå tidigare.`,
    });
  }

  // — Skatteeffektivitet: depå —
  if (inputs.depaBalance > 100_000) {
    insights.push({
      sev: 2, icon: "◇",
      title: "Du har kapital i vanlig depå",
      body: `${fmtKr(inputs.depaBalance)} ligger i aktiedepå med 30% reavinstskatt. Vid avkastning över 3,55% ger ISK oftast mer netto över tid — se jämförelsen nedan.`,
    });
  }

  // — Stor KF —
  if (inputs.kfBalance > 300_000) {
    insights.push({
      sev: 1, icon: "◇",
      title: "Stor kapitalförsäkring",
      body: `${fmtKr(inputs.kfBalance)} i KF. KF och ISK beskattas lika, men KF har ofta en avtalsavgift. Kontrollera vad din KF kostar per år.`,
    });
  }

  // — Saknar allmän pension —
  if (inputs.allmanMonthly === 0) {
    insights.push({
      sev: 2, icon: "○",
      title: "Lägg in din allmänna pension",
      body: `Planen räknar nu utan allmän pension, vilket gör den mer pessimistisk än verkligheten. Hämta ditt belopp på minpension.se för en träffsäker bild.`,
      link: { text: "minpension.se ↗", url: "https://www.minpension.se" },
    });
  }

  // — Saknar tjänstepension —
  if (inputs.tjpPott === 0 && inputs.allmanMonthly >= 0) {
    insights.push({
      sev: 1, icon: "○",
      title: "Har du tjänstepension?",
      body: `Inget tjänstepensionskapital är inlagt. De flesta anställda har det — det kan vara en betydande del av din pensionsbrygga.`,
    });
  }

  // — Early retirement sänker pensionen (räknat från lön) —
  const salaryForInsight = numv("salary");
  if (inputs.retire < 62 && salaryForInsight > 0) {
    const f = allmanFactor(inputs.retire);
    const full = Math.round(allmanAt65Full(salaryForInsight));
    const reduced = Math.round(full * f);
    const lost = full - reduced;
    if (lost > 500) {
      insights.push({
        sev: 2, icon: "↓",
        title: "Tidig frihet sänker din allmänna pension",
        body: `Slutar du jobba vid ${inputs.retire} betalar du in pension i färre år. Din allmänna pension blir ca <strong>${fmtKr(reduced)}/mån</strong> istället för ${fmtKr(full)} vid 65 (–${Math.round((1-f)*100)}%). Planen räknar redan med detta. Garantipensionen ger ett golv.`,
      });
    }
  }

  // — Skiktgräns: pension korsar brytpunkten —
  if (inputs.tjpPott > 0) {
    const o = optimizeTjpPeriod(inputs);
    if (o.crossesBrytpunkt && o.saving > 2000) {
      const pl = o.bestPeriod < 0 ? "livsvarig" : `${o.bestPeriod} år`;
      insights.push({
        sev: 2, icon: "⚖",
        title: "Din pension beskattas statligt i onödan",
        body: `Tjänstepensionen korsar brytpunkten och utlöser 20% statlig skatt. Sprid uttaget över ${pl} så slipper du det — ca ${fmtKr(o.saving)} sparat. Se uttagsoptimeringen nedan.`,
      });
    }
  }

  // — Frihet före tidigast uttag (avtals-specifikt) —
  const avtalDef = AVTAL[inputs.avtal] || AVTAL.ingen;
  if (inputs.retire < avtalDef.earliest) {
    insights.push({
      sev: 2, icon: "⚑",
      title: `Du planerar frihet före ${avtalDef.earliest}`,
      body: `${inputs.avtal !== "ingen" && inputs.avtal !== "egen" ? avtalDef.namn.split(" — ")[0] + ": t" : "T"}jänstepension kan tidigast tas ut vid ${avtalDef.earliest} år. Hela perioden ${inputs.retire}–${avtalDef.earliest} måste täckas av ISK/depå.${avtalDef.note ? " " + avtalDef.note : ""}`,
    });
  }

  // — Bridge tills TJP fasas in —
  const avtalE = (AVTAL[inputs.avtal]?.earliest) ?? 55;
  const tjpStart = Math.max(inputs.retire, avtalE);
  const soloYears = tjpStart - inputs.retire;
  if (soloYears >= 5) {
    insights.push({
      sev: 1, icon: "⌁",
      title: `${soloYears} år innan första pensionen`,
      body: `Från ${inputs.retire} till ${tjpStart} bär ditt sparkapital allt ensamt — TJP kan tas ut först vid ${avtalE}. Sen fasas tjänstepension och (från 63) allmän pension in och avlastar.`,
    });
  }

  // — Sparkvot —
  const savingsRate = inputs.savingsPerMonth / Math.max(1, inputs.needPerMonth);
  if (savingsRate < 0.3 && sr < minSr) {
    insights.push({
      sev: 2, icon: "▲",
      title: "Sparkvoten är låg för målet",
      body: `Du sparar ${fmtKr(inputs.savingsPerMonth)}/mån mot ett behov på ${fmtKr(inputs.needPerMonth)}/mån. Felix poäng: din sparkvot styr ditt frihetsdatum mer än börsavkastningen.`,
    });
  }

  // Sortera fallande severity, max 4
  return insights.sort((a, b) => b.sev - a.sev).slice(0, 4);
}

function renderPlanScore(scoreData) {
  const el = $("lugnScore");
  const ring = $("scoreRing");
  if (!el) return;
  const grade = scoreGrade(scoreData.score);
  el.textContent = scoreData.score;
  el.className = `score-num ${grade.cls}`;
  const labelEl = $("scoreGrade");
  if (labelEl) { labelEl.textContent = grade.label; labelEl.className = `score-grade ${grade.cls}`; }

  // Ring (conic gradient via stroke-dashoffset på SVG-cirkel)
  if (ring) {
    const circ = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${circ}`;
    ring.style.strokeDashoffset = `${circ * (1 - scoreData.score / 100)}`;
    ring.style.stroke = grade.cls === "good" ? "#3a5a40" : grade.cls === "ok" ? "#b07d2a" : "#c46d4d";
  }

  // Delkomponenter
  const partsEl = $("scoreParts");
  if (partsEl) {
    const p = scoreData.parts;
    const bar = (label, val) => `
      <div class="score-part">
        <span class="score-part-label">${label}</span>
        <span class="score-part-bar"><span style="width:${Math.round(val*100)}%"></span></span>
      </div>`;
    partsEl.innerHTML =
      bar("Hållbarhet", p.sustainability) +
      bar("Skatteeffektivitet", p.taxEff) +
      bar("Brygga håller", p.bridge) +
      bar("Komplett underlag", p.completeness);
  }
}

function renderInsights(insights) {
  const el = $("insightsList");
  if (!el) return;
  if (insights.length === 0) {
    el.innerHTML = `<div class="insight-empty">Inga flaggor — din plan ser balanserad ut.</div>`;
    return;
  }
  const sevClass = s => s >= 3 ? "sev-high" : s === 2 ? "sev-mid" : "sev-low";
  el.innerHTML = insights.map(i => `
    <div class="insight ${sevClass(i.sev)}">
      <span class="insight-icon">${i.icon}</span>
      <div class="insight-body">
        <div class="insight-title">${i.title}</div>
        <div class="insight-text">${i.body}${i.link ? ` <a href="${i.link.url}" target="_blank">${i.link.text}</a>` : ""}</div>
      </div>
    </div>`).join("");
}

// ─── ISK vs AF/Depå-jämförelse ────────────────────────────────────────────────
// Modell: ISK betalar schablon varje år (1.065% av balansen 2026).
//         AF/Depå betalar 30% kapitalskatt enbart vid försäljning.
//         "Netto" = balansen MINUS det skatte-kapitalet man gett ifrån sig
//         (möjlighetskostnad: schablonbetalningar investerade alternativt).

// Räknar exakt antal månader till FIRE för ISK resp. AF/depå.
// ISK: skattefri utbetalning, men schablon betalas löpande (dras från portföljen dec varje år).
// AF:  noll löpande skatt, men 30% kapitalskatt vid uttag — du behöver mer brutto för samma netto.
function monthsToFire(initial, monthly, annualNominalReturn, fireTargetNetto, accountType) {
  const r = annualNominalReturn / 100 / 12;
  let balance   = initial;
  let costBasis = initial;

  for (let m = 0; m <= 720; m++) {   // max 60 år
    // Beräkna netto-värde vid detta datum
    let netto;
    if (accountType === "isk") {
      netto = balance;  // inget uttags-skatt
    } else {
      const gain = Math.max(0, balance - costBasis);
      netto = balance - 0.30 * gain;
    }

    if (netto >= fireTargetNetto) return m;

    // Tillväxt detta månad
    balance   = balance * (1 + r) + monthly;
    costBasis += monthly;

    // ISK: schablon betalas i december (månad 11, 23, 35…)
    if (accountType === "isk" && m % 12 === 11) {
      const schablon = Math.max(0, balance - ISK_GRUNDAVDRAG) * ISK_EFFEKTIV_SKATT;
      balance -= schablon;
    }
  }

  return null;  // når inte FIRE inom 60 år
}

function compareIskVsAf(initial, monthlyContrib, years, annualNominalReturn) {
  // Nominell avkastning (inkl. inflation)
  const r      = annualNominalReturn / 100;
  const sRate  = ISK_EFFEKTIV_SKATT;   // 1.065% 2026

  const iskNetSeries     = [initial];
  const afAfterTaxSeries = [initial];

  let iskBalance  = initial;
  let schablonFV  = 0;         // FV av alla schabloner betalda hittills
  let afBalance   = initial;
  let afCostBasis = initial;   // kumulativ insats i AF

  for (let t = 1; t <= years; t++) {
    // Schablon betalas på ingående balans MINUS 300 000 kr grundavdrag (2026)
    const schablon = Math.max(0, iskBalance - ISK_GRUNDAVDRAG) * sRate;
    schablonFV = schablonFV * (1 + r) + schablon;

    // Båda växer på full avkastning, sedan tillkommer månadssparande
    iskBalance = iskBalance * (1 + r) + monthlyContrib * 12;
    afBalance  = afBalance  * (1 + r) + monthlyContrib * 12;
    afCostBasis += monthlyContrib * 12;

    // ISK netto = balansen minus möjlighetskostnaden av schabloner
    iskNetSeries.push(iskBalance - schablonFV);

    // AF netto om man säljer allt vid år t: 30% på vinsten
    const afGain = Math.max(0, afBalance - afCostBasis);
    afAfterTaxSeries.push(afBalance - 0.30 * afGain);
  }

  const iskFinal = iskNetSeries[years];
  const afFinal  = afAfterTaxSeries[years];

  let crossover = null;
  for (let t = 1; t <= years; t++) {
    if (iskNetSeries[t] >= afAfterTaxSeries[t]) { crossover = t; break; }
  }

  return { iskNetSeries, afAfterTaxSeries, iskFinal, afFinal, crossover,
           iskWins: iskFinal >= afFinal, advantage: Math.abs(iskFinal - afFinal) };
}

function renderIskVsAfChart(initial, monthly, years, nominalReturn) {
  const c = document.getElementById("iskAfChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const result = compareIskVsAf(initial, monthly, years, nominalReturn);
  const allVals = [...result.iskNetSeries, ...result.afAfterTaxSeries];
  const maxV    = Math.max(...allVals);
  const minV    = Math.min(...allVals) * 0.97;

  const padL = 64, padR = 16, padT = 16, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xFor = t  => padL + (t / years) * plotW;
  const yFor = v  => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

  // Grid
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    const v = maxV - (maxV - minV) * (i / 4);
    ctx.strokeStyle = "#1a1a1a10"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "right";
    ctx.fillText(fmtKr(v).replace(" kr",""), padL - 4, y + 4);
  }

  // X-axis
  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "center";
  for (let t = 0; t <= years; t += Math.ceil(years / 6)) {
    ctx.fillText(`${t}år`, xFor(t), H - padB + 16);
  }

  const drawLine = (series, color, dash = []) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(dash);
    series.forEach((v, t) => t === 0 ? ctx.moveTo(xFor(t), yFor(v)) : ctx.lineTo(xFor(t), yFor(v)));
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };

  // ISK = sage-grön, AF = coral (streckad)
  drawLine(result.afAfterTaxSeries, "#c46d4d", [5, 4]);
  drawLine(result.iskNetSeries,     "#3a5a40");

  // Korsningspunkt
  if (result.crossover && result.crossover < years) {
    const x = xFor(result.crossover);
    const y = yFor(result.iskNetSeries[result.crossover]);
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = "#3a5a40"; ctx.fill();
    ctx.fillStyle = "#3a5a40"; ctx.textAlign = "left"; ctx.font = "bold 11px -apple-system, system-ui, sans-serif";
    ctx.fillText(`ISK vinner`, x + 7, y - 4);
  }

  // Endvärden — labels
  const iskY = yFor(result.iskNetSeries[years]);
  const afY  = yFor(result.afAfterTaxSeries[years]);
  ctx.font = "bold 12px -apple-system, system-ui, sans-serif"; ctx.textAlign = "right";
  ctx.fillStyle = "#3a5a40"; ctx.fillText(fmtKr(result.iskFinal), W - padR, iskY - 6);
  ctx.fillStyle = "#c46d4d"; ctx.fillText(fmtKr(result.afFinal),  W - padR, afY + 14);

  // Uppdatera textsammanfattning
  const diff    = document.getElementById("iskAfDiff");
  const winner  = document.getElementById("iskAfWinner");
  const cross   = document.getElementById("iskAfCrossover");
  if (diff && winner && cross) {
    const adv = result.advantage;
    if (result.iskWins) {
      winner.textContent = `ISK ger ${fmtKr(adv)} mer`;
      winner.className = "isk-af-winner good";
    } else {
      winner.textContent = `Aktiedepå ger ${fmtKr(adv)} mer`;
      winner.className = "isk-af-winner warn";
    }
    diff.textContent = `efter ${years} år med ${fmtKr(initial)} + ${fmtKr(monthly)}/mån vid ${nominalReturn}% avkastning`;
    if (result.crossover) {
      cross.textContent = `ISK börjar vinna efter ${result.crossover} år`;
      cross.style.display = "";
    } else if (!result.iskWins) {
      cross.textContent = `ISK vinner inte inom ${years} år — avkastningen är för låg`;
      cross.style.display = "";
    } else {
      cross.style.display = "none";
    }
  }

  // Tid till FIRE-jämförelse
  const fireEl = document.getElementById("iskAfFireTime");
  if (fireEl) {
    // Hämta FIRE-mål från kalkylatorn (25× årsspend)
    const needPerMonth = numv("needPerMonth", 35000);
    const fireTarget   = needPerMonth * 12 * 25;

    const iskMonths = monthsToFire(initial, monthly, nominalReturn, fireTarget, "isk");
    const afMonths  = monthsToFire(initial, monthly, nominalReturn, fireTarget, "af");

    if (iskMonths === null && afMonths === null) {
      fireEl.innerHTML = `<span style="color:var(--ink-400)">Når inte FIRE inom 60 år — öka sparandet.</span>`;
      return;
    }

    const fmt = m => {
      if (m === null) return "ej inom 60 år";
      const y = Math.floor(m / 12);
      const mo = m % 12;
      return mo > 0 ? `${y} år ${mo} mån` : `${y} år`;
    };

    const diff_months = (afMonths ?? 720) - (iskMonths ?? 720);

    let html = `
      <div class="fire-time-row">
        <div class="fire-time-item isk">
          <span class="fire-time-label">ISK</span>
          <span class="fire-time-val">${fmt(iskMonths)}</span>
        </div>
        <div class="fire-time-item af">
          <span class="fire-time-label">Aktiedepå</span>
          <span class="fire-time-val">${fmt(afMonths)}</span>
        </div>
      </div>`;

    if (diff_months > 0) {
      const diffY  = Math.floor(diff_months / 12);
      const diffMo = diff_months % 12;
      const diffStr = diffY > 0
        ? (diffMo > 0 ? `${diffY} år och ${diffMo} månader` : `${diffY} år`)
        : `${diffMo} månader`;
      html += `<div class="fire-time-gain">ISK når FIRE <strong>${diffStr} tidigare</strong> — FIRE vid ${fmt(iskMonths)}, aktiedepå ${fmt(afMonths)}</div>`;
    } else if (diff_months < 0) {
      html += `<div class="fire-time-gain warn">Aktiedepå når FIRE ${fmt(Math.abs(diff_months))} månader tidigare (låg avkastning)</div>`;
    } else {
      html += `<div class="fire-time-gain">Lika snabba vid denna avkastning</div>`;
    }

    fireEl.innerHTML = html;
  }
}

function updateIskAfComparison() {
  const initial  = numv("iskAfInitial", 1_000_000);
  const monthly  = numv("iskAfMonthly", 10_000);
  const years    = +document.getElementById("iskAfYears")?.value    || 20;
  const ret      = +document.getElementById("iskAfReturn")?.value   || 7;
  renderIskVsAfChart(initial, monthly, years, ret);
}

// ─── Behavioral Shock Simulator ───────────────────────────────────────────────
// Visar en historisk krasch i ABSOLUTA KRONOR (ej procent) vid sämsta tänkbara
// tidpunkt: året du går i pension (sequence-of-returns-risk). Testar tålamod.
const CRASH_SCENARIOS = {
  "2008":   { label: "Finanskrisen 2008", drop: 0.50, recoveryYears: 4,
              note: "Global aktiemarknad föll ~50% topp till botten. Återhämtning ~4 år." },
  "2000":   { label: "IT-bubblan 2000",   drop: 0.45, recoveryYears: 6,
              note: "Långsam, utdragen nedgång. ~6 år till återhämtning." },
  "2020":   { label: "Covid-kraschen 2020", drop: 0.34, recoveryYears: 1,
              note: "Brant fall, ovanligt snabb återhämtning (~6 mån)." },
  "1973":   { label: "Stagflation 70-tal", drop: 0.45, recoveryYears: 8,
              note: "Krasch + hög inflation. Värst i reala termer — köpkraften åt upp resten." },
};
let activeCrash = "2008";

function computeShock(inputs, crashPct) {
  // Portfölj vid pensionsåldern (deterministisk bana)
  const base = simulate(inputs);
  const flowAtRetire = base.flows.find(f => f.age === inputs.retire);
  const portfolioAtRetire = flowAtRetire?.totalCapital ?? 0;
  const lossSEK = portfolioAtRetire * crashPct;
  const afterCrash = portfolioAtRetire - lossSEK;

  // Överlever planen en krasch året man går? Injicera stort negativt år vid retire.
  const years = inputs.lifespan - inputs.age + 1;
  const crashYearIdx = inputs.retire - inputs.age;
  const ret = Array.from({ length: years }, (_, i) =>
    i === crashYearIdx ? -crashPct : MC_MU_REAL
  );
  const shocked = simulate(inputs, { returnOverride: ret });
  const survives = !shocked.ran_dry;
  const finalAfter = shocked.flows[shocked.flows.length - 1].totalCapital;

  return { portfolioAtRetire, lossSEK, afterCrash, survives, finalAfter };
}

function renderShock(inputs) {
  const el = document.getElementById("shockResult");
  if (!el) return;
  const scenario = CRASH_SCENARIOS[activeCrash];
  const s = computeShock(inputs, scenario.drop);

  const verdict = s.survives
    ? `<span class="shock-verdict good">✓ Din plan tål det</span>`
    : `<span class="shock-verdict warn">⚠ Detta skulle tvinga dig tillbaka till jobbet</span>`;

  el.innerHTML = `
    <div class="shock-big">
      <span class="shock-loss">−${fmtKr(s.lossSEK)}</span>
      <span class="shock-loss-sub">så mycket faller din portfölj samma år du blir fri</span>
    </div>
    <div class="shock-flow">
      <span>${fmtKr(s.portfolioAtRetire)}</span>
      <span class="shock-arrow">→</span>
      <span class="shock-after">${fmtKr(s.afterCrash)}</span>
    </div>
    ${verdict}
    <p class="shock-note">${scenario.note}</p>
  `;
}

function setupShockChips() {
  document.querySelectorAll(".shock-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".shock-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      activeCrash = chip.dataset.crash;
      renderShock(getInputs());
    });
  });
}

// ─── Fee Drag Auditor ──────────────────────────────────────────────────────────
// Visar sammansatt avgiftsdrag över livstid: dyr aktiv fond vs billig indexfond.
function computeFeeDrag(initial, monthly, years, grossReturn, highFee, lowFee) {
  const fv = (annualFee) => {
    const r = (grossReturn - annualFee) / 100;
    let bal = initial;
    for (let y = 0; y < years; y++) bal = bal * (1 + r) + monthly * 12;
    return bal;
  };
  const high = fv(highFee);
  const low  = fv(lowFee);
  return { high, low, drag: low - high };
}

function renderFeeDrag() {
  const el = document.getElementById("feeDragResult");
  if (!el) return;
  const inputs  = getInputs();
  const initial = inputs.iskBalance;
  const monthly = inputs.savingsPerMonth;
  const years   = Math.max(5, Math.min(40, inputs.lifespan - inputs.age));
  const gross   = inputs.realReturn + inputs.inflation;
  const highFee = +document.getElementById("feeHigh")?.value || 1.5;
  const lowFee  = +document.getElementById("feeLow")?.value  || 0.2;

  const r = computeFeeDrag(initial, monthly, years, gross, highFee, lowFee);

  // "How much MORE would you need to save to reach the same goal with the higher fee?"
  // Binary-search: find extra monthly contribution under highFee that matches lowFee target.
  const targetHigh = r.low;   // we want to reach what lowFee would give
  const rHigh = (gross - highFee) / 100;
  let lo = 0, hi = monthly * 4;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    let b = initial;
    for (let t = 0; t < years; t++) b = b * (1 + rHigh) + (monthly + mid) * 12;
    b >= targetHigh ? hi = mid : lo = mid;
  }
  const extraNeeded     = Math.max(0, Math.round((lo + hi) / 2 / 100) * 100);
  const extraPct        = monthly > 0 ? Math.round(extraNeeded / monthly * 100) : 0;

  // Simplicity-tax logic: is the 0.10% premium for auto-rebalancing worth it?
  const isSimplicityTax = Math.abs(highFee - lowFee) <= 0.11;
  let insight;
  if (isSimplicityTax) {
    insight = `<div class="fee-insight good">
      💡 <strong>Det tunga lyftet sköter sig självt.</strong> En allt-i-ett-fond kostar ${highFee}% mot din ${lowFee}% — skillnaden är ${fmtKr(r.drag)} på ${years} år. Men en manuell portfölj som aldrig rebalanseras kan kosta <em>mer</em> i beteende: performancejakten, att sälja i botten, att aldrig fylla på. Betala ${(highFee-lowFee).toFixed(2)}% för att slippa det — det är troligen bra affär.
    </div>`;
  } else {
    insight = `<div class="fee-insight warn">
      💡 <strong>Du måste spara ${extraPct}% mer</strong> för att nå samma slutkapital med ${highFee}% avgift som med ${lowFee}%:
      ~<strong>${fmtKr(extraNeeded)}/mån extra</strong> — varevigt, utan garantier. Att byta till indexfond är enklare.
    </div>`;
  }

  el.innerHTML = `
    <div class="fee-big">−${fmtKr(r.drag)}</div>
    <div class="fee-sub">förlorad avkastning över ${years} år — ${highFee}% vs ${lowFee}% avgift</div>
    <div class="fee-bars">
      <div class="fee-bar-row">
        <span class="fee-bar-label">B: ${lowFee}%</span>
        <span class="fee-bar"><span class="fee-bar-fill low" style="width:100%"></span></span>
        <span class="fee-bar-val">${fmtKr(r.low)}</span>
      </div>
      <div class="fee-bar-row">
        <span class="fee-bar-label">A: ${highFee}%</span>
        <span class="fee-bar"><span class="fee-bar-fill high" style="width:${Math.round(r.high/r.low*100)}%"></span></span>
        <span class="fee-bar-val">${fmtKr(r.high)}</span>
      </div>
    </div>
    ${insight}
    <p class="fee-note">Avgiften är en av de få saker du säkert kan kontrollera — marknadsavkastning kan du inte.</p>
  `;
}

// ─── Uttagsoptimering (skiktgräns-medveten drawdown) ─────────────────────────
// Tjänstepension + allmän pension = förvärvsinkomst → räknas mot skiktgränsen.
// ISK/KF-uttag = kapital → räknas INTE. Optimera TJP-period så årlig pension
// håller sig under brytpunkten (660 400 kr 2026) och undvik 20% statlig.
// Brytpunkt = gross-inkomst där 20% statlig börjar. Pensionärer 66+ har
// förhöjt grundavdrag → högre brytpunkt än arbetande. (Verifiera årligen.)
const BRYTPUNKT_ARBETANDE  = 660_400;   // < 66 år
const BRYTPUNKT_PENSIONAR  = 751_100;   // 66+ (förhöjt grundavdrag), 2026

// Real annuitet (dagens penningvärde) — 1% real avkastning under utbetalning.
function tjpAnnuityReal(pottToday, period) {
  const r = 0.01, n = period > 0 ? period : 25;
  return pottToday * r / (1 - Math.pow(1 + r, -n));
}

// Pension i DAGENS penningvärde vid en ålder. Allt realt → jämförbart med
// dagens skiktgräns. Pott antas växa ~2% realt fram till 65.
function pensionRealAtAge(inputs, age, tjpPeriod) {
  if (age < 65) return 0;
  let g = inputs.allmanMonthly * 12;   // fältet är redan effektivt vid frihetsåldern
  const yearsToTjp = Math.max(0, 65 - inputs.age);
  let pott65Real = inputs.tjpPott * Math.pow(1.02, yearsToTjp);
  for (let a2 = inputs.age; a2 < inputs.retire && a2 < 65; a2++) {
    pott65Real += (inputs.tjpContrib || 0) * 12 * Math.pow(1.02, 65 - a2);
  }
  if (tjpPeriod < 0 || age < 65 + tjpPeriod)
    g += tjpAnnuityReal(pott65Real, tjpPeriod);
  return g;
}

// Statlig (20%) skatt på real pensionsinkomst mot brytpunkten.
function stateTaxOnly(grossReal, age) {
  const bp = age >= 66 ? BRYTPUNKT_PENSIONAR : BRYTPUNKT_ARBETANDE;
  return Math.max(0, grossReal - bp) * 0.20;
}

// Total statlig skatt (dagens värde) över livet för en given TJP-period.
function lifetimeStateTax(inputs, tjpPeriod) {
  let total = 0;
  for (let age = 65; age <= inputs.lifespan; age++) {
    total += stateTaxOnly(pensionRealAtAge(inputs, age, tjpPeriod), age);
  }
  return total;
}

// Hitta TJP-period som minimerar statlig skatt. Returnerar jämförelse.
function optimizeTjpPeriod(inputs) {
  const periods = [5, 10, 15, 20, -1];   // -1 = livsvarig
  const current = inputs.tjpPeriod;
  const results = periods.map(p => ({ period: p, tax: lifetimeStateTax(inputs, p) }));
  const best = results.reduce((a, b) => b.tax < a.tax ? b : a);
  const currentTax = lifetimeStateTax(inputs, current);
  return {
    current, currentTax,
    bestPeriod: best.period, bestTax: best.tax,
    saving: Math.max(0, currentTax - best.tax),
    results,
    crossesBrytpunkt: currentTax > 100,
  };
}

// ─── Trygghet: buffert · motståndskraft · tillåtelse att spendera ────────────
// Uppskatta dagens månadsutgifter efter skatt: nettolön − sparande. Faller
// tillbaka på önskat behov om lön saknas. Editbart fält vinner alltid.
function estimateExpensesToday(inputs) {
  const salary = numv("salary");
  if (salary <= 0) return inputs.needPerMonth;
  const annualGross = salary * 12;
  const netMonthly  = (annualGross - incomeTax(annualGross, inputs.age, true)) / 12;
  return Math.max(0, Math.round((netMonthly - inputs.savingsPerMonth) / 100) * 100);
}

function renderTrygghet() {
  if (!document.getElementById("tryggBufferResult")) return;
  const inputs = getInputs();

  // — Månadsutgifter: för-ifyll uppskattning om användaren inte rört fältet —
  const expEl = $("tryggExpenses");
  const estimate = estimateExpensesToday(inputs);
  if (expEl && !expEl._userEdited) setNumVal(expEl, estimate);
  const expenses = expEl && expEl.value !== "" ? numv(expEl, estimate) : estimate;

  // ── 1. Buffert ──────────────────────────────────────────────────────────────
  const months    = +($("tryggBufferMonths")?.value || 6);
  const bufferNow  = numv("tryggBufferNow");
  const target     = expenses * months;
  const gap        = target - bufferNow;
  const bufEl = $("tryggBufferResult");
  if (bufEl) {
    if (gap <= 0) {
      bufEl.innerHTML = `<span class="trygg-ok">✓ Du har en buffert på ${fmtKr(bufferNow)}</span> — täcker
        ${(bufferNow / Math.max(1, expenses)).toFixed(1)} mån av dina utgifter, mer än målet ${months} mån (${fmtKr(target)}).`;
    } else {
      const haveMonths = (bufferNow / Math.max(1, expenses));
      bufEl.innerHTML = `Mål: <strong>${fmtKr(target)}</strong> (${months} mån × ${fmtKr(expenses)}).
        Du har ${fmtKr(bufferNow)} (${haveMonths.toFixed(1)} mån) — <span class="trygg-warn">${fmtKr(gap)} kvar</span>.
        Bufferten bör ligga på sparkonto, inte investerad.`;
    }
  }

  // ── 1b. Bolån & amortering ────────────────────────────────────────────────────
  const bolEl = $("tryggBolanResult");
  if (bolEl) {
    const loan  = inputs.loanBalance, rate = inputs.loanRate / 100, amort = inputs.loanAmort;
    if (loan <= 0) {
      bolEl.innerHTML = `Inget bolån inlagt. Har du ett — fyll i det ovan så visar vi när det är
        avbetalt, hur boendekostnaden sjunker, och om du bör amortera eller investera.`;
    } else {
      const amortAnnual = amort * 12;
      const interestY   = loan * rate;
      const deduction   = Math.min(interestY, 100_000) * 0.30 + Math.max(0, interestY - 100_000) * 0.21;
      const interestNetMonth = (interestY - deduction) / 12;
      const housingMonth = interestNetMonth + amort;                 // ränta efter avdrag + amortering
      const payoffYears  = amortAnnual > 0 ? Math.ceil(loan / amortAnnual) : Infinity;
      const payoffAge    = inputs.age + payoffYears;

      // Amortera vs investera: riskfri avkastning = ränta efter ränteavdrag (~×0,70)
      const afterTaxMortgage = inputs.loanRate * 0.70;               // %
      const expectedNominal  = inputs.realReturn + inputs.inflation; // %
      const amortWins = afterTaxMortgage > expectedNominal;

      let payoffTxt;
      if (payoffYears === Infinity) {
        payoffTxt = `Du amorterar inte — lånet ligger kvar. Boendekostnaden ~${fmtKr(housingMonth)}/mån
          (ränta efter avdrag) finns kvar livet ut och belastar din pension.`;
      } else if (payoffAge > inputs.lifespan) {
        payoffTxt = `I din takt (${fmtKr(amort)}/mån) är lånet inte avbetalt under din livstid — boendekostnaden
          ~<strong>${fmtKr(housingMonth)}/mån</strong> följer med in i pensionen. En högre amortering betalar av det
          tidigare och sänker behovet.`;
      } else {
        const beforeFrihet = payoffAge <= inputs.retire;
        payoffTxt = `Avbetalt om <strong>${payoffYears} år</strong> (vid ${payoffAge} år). Då försvinner
          ~<strong>${fmtKr(housingMonth)}/mån</strong> i boendekostnad (ränta efter avdrag + amortering).
          ${beforeFrihet
            ? `Det sker <span class="trygg-ok">före din frihetsålder</span> — din pension är redan utan bolån.`
            : `Det sker <span class="trygg-warn">efter din frihetsålder ${inputs.retire}</span> — planen lägger automatiskt på boendet tills dess.`}`;
      }

      const vsTxt = amortWins
        ? `<span class="trygg-ok">Amortering vinner.</span> Att amortera ger en garanterad ~${afterTaxMortgage.toFixed(1)} % efter ränteavdrag — mer än din förväntade avkastning ${expectedNominal.toFixed(1)} %. Extra amortering är både trygghet och bra affär.`
        : `Förväntad avkastning ${expectedNominal.toFixed(1)} % > lånets ~${afterTaxMortgage.toFixed(1)} % efter avdrag → att investera ger mer i snitt. Men amortering är <em>riskfritt</em> och sänker dina fasta kostnader — väg trygghet mot förväntat överskott.`;

      // Lagstadgat amorteringskrav (om bostadsvärde angetts) — endast belåningsgrad
      const krav = amorteringskrav(loan, inputs.propertyValue);
      let kravTxt = "";
      if (krav) {
        const ltvPct = (krav.ltv * 100).toFixed(0);
        if (krav.pct === 0) {
          kravTxt = `<p class="trygg-note">Belåningsgrad <strong>${ltvPct} %</strong> (under 50 %) → <span class="trygg-ok">inget amorteringskrav</span>.
            Extra amortering är frivillig — väg den mot att investera ovan.</p>`;
        } else {
          const bracket = krav.ltv > 0.70 ? "2 %" : "1 %";
          const needsMore = krav.monthly > inputs.loanAmort + 50;
          kravTxt = `<p class="trygg-note">Belåningsgrad <strong>${ltvPct} %</strong> → amorteringskrav ${bracket}/år
            ≈ ~<strong>${fmtKr(krav.monthly)}/mån</strong>.
            ${needsMore
              ? `Du amorterar ${fmtKr(inputs.loanAmort)} — under kravet. <button class="btn btn-ghost trygg-apply" id="kravApply" type="button">Använd ${fmtKr(krav.monthly)}/mån →</button>`
              : `Du uppfyller kravet. ✓`}
            <br><span style="opacity:.7">Skärpta skuldkvotskravet slopat 1 apr 2026. Uppskattat på nuvarande lån (kravet räknas på ursprungligt belopp).</span></p>`;
        }
      }

      bolEl.innerHTML = `${payoffTxt}<br><span style="display:inline-block;margin-top:8px">${vsTxt}</span>`
        + kravTxt
        + `<p class="trygg-note">Ange "Vill leva på" som dina utgifter <em>utan</em> bolån — boendet läggs på automatiskt tills lånet är avbetalt, så det inte dubbelräknas.</p>`;

      const kravBtn = document.getElementById("kravApply");
      if (kravBtn) kravBtn.onclick = () => {
        const f = $("loanAmort");
        if (f) { f._userEdited = false; recalc(); }   // tillbaka till auto = lagkravet
      };
    }
  }

  // ── 2. Motståndskraft (inkomstbortfall) ──────────────────────────────────────
  const lossMonths = +($("tryggLossMonths")?.value || 6);
  const lvEl = $("tryggLossVal"); if (lvEl) lvEl.textContent = lossMonths;
  const safety     = numv("tryggSafetyNet");
  const shortfall  = Math.max(0, expenses - safety);          // kr/mån som måste täckas
  const need       = shortfall * lossMonths;                  // totalt under perioden
  const covered    = shortfall > 0 ? bufferNow / shortfall : Infinity;
  const resEl = $("tryggResilienceResult");
  if (resEl) {
    if (shortfall === 0) {
      resEl.innerHTML = `<span class="trygg-ok">✓ Ditt skyddsnät täcker hela utgiften</span> — du tär inte på bufferten alls.`;
    } else if (bufferNow >= need) {
      resEl.innerHTML = `<span class="trygg-ok">✓ Bufferten klarar det.</span> ${lossMonths} mån utan inkomst
        kostar ${fmtKr(need)} (efter skyddsnät). Din buffert räcker ${covered.toFixed(1)} mån — du behöver inte röra investeringarna.`;
    } else {
      const fromPortfolio = need - bufferNow;
      resEl.innerHTML = `<span class="trygg-warn">Bufferten räcker ${covered.toFixed(1)} mån.</span>
        ${lossMonths} mån utan inkomst kostar ${fmtKr(need)} — <strong>${fmtKr(fromPortfolio)}</strong> måste tas från
        investeringar eller sänkta utgifter. Överväg en större buffert eller lägre fasta kostnader.`;
    }
  }
  // SGI-not: relevant för den som planerar frihet före pensionsålder
  const sgiEl = $("tryggSgiNote");
  if (sgiEl) {
    sgiEl.textContent = inputs.retire < 65
      ? "Tänk på: slutar du jobba före pension förlorar du din SGI — då finns ingen sjukpenning eller föräldrapenning som golv, bara din buffert och ditt kapital."
      : "A-kassa kräver medlemskap; sjukpenning bygger på din SGI (ung. 80 % av lön upp till tak). Lämna skyddsnätet på 0 för att se värsta fallet.";
  }

  // ── 3. Tillåtelse att spendera (debouncad — Monte Carlo-binärsökning) ─────────
  // Visas BARA om planen håller ≥80 % — annars finns ingen möjlighet att spendera
  // mer, och kortet döljs helt.
  const permEl   = $("tryggPermissionResult");
  const permCard = permEl ? permEl.closest(".trygg-card") : null;
  if (permEl) {
    permEl.classList.add("trygg-calc");
    clearTimeout(_tryggPermTimeout);
    _tryggPermTimeout = setTimeout(() => {
      const fresh = getInputs();
      const maxNeed = maxSustainableNeed(fresh, fresh.retire);
      permEl.classList.remove("trygg-calc");
      if (maxNeed === null) {
        if (permCard) permCard.style.display = "none";   // ingen möjlighet → dölj kortet
        return;
      }
      if (permCard) permCard.style.display = "";
      const headroom = maxNeed - fresh.needPerMonth;
      if (headroom >= 500) {
        permEl.innerHTML = `<span class="trygg-ok">Du har råd att leva på mer.</span> Din plan håller ≥80 % ända upp till
          <strong>${fmtKr(maxNeed)}/mån</strong> vid ${fresh.retire} år — <strong>${fmtKr(headroom)}/mån mer</strong>
          än du planerar (${fmtKr(fresh.needPerMonth)}). Du får unna dig. Pengarna finns för att leva, inte bara räknas.`;
      } else {
        permEl.innerHTML = `Du ligger nära taket: <strong>${fmtKr(maxNeed)}/mån</strong> är ungefär så högt du kan gå
          vid ${fresh.retire} år och fortfarande hålla ≥80 %. Vill du leva på mer — jobba något år till eller spara lite mer.`;
      }
    }, 280);
  }
}
let _tryggPermTimeout = null;

function renderWithdrawalOpt(inputs) {
  const el = document.getElementById("withdrawalOpt");
  if (!el) return;
  if (inputs.tjpPott === 0) {
    el.innerHTML = `<p class="wo-empty">Lägg in din tjänstepension ovan för att se hur uttaget kan optimeras mot skiktgränsen.</p>`;
    return;
  }
  const o = optimizeTjpPeriod(inputs);
  const periodLabel = p => p < 0 ? "livsvarig" : `${p} år`;

  // Pension vid 66 i DAGENS penningvärde (jämförbart med dagens brytpunkt)
  const gAt66 = pensionRealAtAge(inputs, 66, o.current);
  const crosses = gAt66 > BRYTPUNKT_PENSIONAR;

  if (!o.crossesBrytpunkt && o.saving < 500) {
    el.innerHTML = `
      <div class="wo-ok">✓ Din pension håller sig under brytpunkten — ingen statlig inkomstskatt på pensionen.</div>
      <p class="wo-note">Din samlade pension (${periodLabel(o.current)}) ger ${fmtKr(gAt66)}/år vid 66 i dagens värde. Brytpunkten för pensionärer går vid ${fmtKr(BRYTPUNKT_PENSIONAR)}.</p>`;
    return;
  }

  el.innerHTML = `
    <div class="wo-finding">
      <span class="wo-cross">⚑ Din pension korsar brytpunkten</span>
      <p>Med ${periodLabel(o.current)}s utbetalning blir din samlade pension ${fmtKr(gAt66)}/år vid 66 (dagens värde) — över pensionärs-brytpunkten ${fmtKr(BRYTPUNKT_PENSIONAR)}. Det utlöser 20% statlig skatt på överskottet.</p>
    </div>
    <div class="wo-compare">
      <div class="wo-opt-card">
        <div class="wo-opt-label">Sprid över ${periodLabel(o.bestPeriod)}</div>
        <div class="wo-opt-save">spara ${fmtKr(o.saving)}</div>
        <div class="wo-opt-sub">i statlig skatt över livet (dagens värde)</div>
      </div>
      <button class="btn btn-ghost wo-apply" id="woApply" type="button">Använd ${periodLabel(o.bestPeriod)} →</button>
    </div>
    <p class="wo-note">Lägre årligt pensionsuttag → resten täcks av ISK/depå, som är kapital och inte räknas mot skiktgränsen.</p>`;

  const btn = document.getElementById("woApply");
  if (btn) btn.onclick = () => {
    const sel = $("tjpPeriod");
    if (sel) { sel.value = String(o.bestPeriod); recalc(); }
  };
}

// ─── Engine A: Historisk backtesting (rullande fönster) ──────────────────────
// Testar planen mot faktiska historiska avkastningssekvenser. Ackumulering
// deterministisk; uttagsfasen replayar varje historiskt fönster (sequence risk).
// allocWorld = andel MSCI World (resten = World ex-USA), 0..1.
// allocWorld = andel International (MSCI World), resten = Sverige (SIXRX).
function runBacktest(inputs, allocWorld) {
  const hist = window.MARKET_HISTORY;
  if (!hist) return null;
  const wWorld = hist.world.returns;
  const wSwe   = hist.sweden.returns;
  const fx     = hist.usdSek.rates;

  // MSCI World är i USD → räkna om till SEK (svensk investerares perspektiv):
  // SEK-avkastning = (1 + USD-avk) × (USD/SEK_t / USD/SEK_{t-1}) − 1.
  const worldSek = (y) => {
    if (wWorld[y] == null || fx[y] == null || fx[y - 1] == null) return null;
    return (1 + wWorld[y]) * (fx[y] / fx[y - 1]) - 1;
  };

  // Blandad SEK-avkastning för ett år, eller null om data saknas i mixen.
  const needWorld = allocWorld > 0, needSwe = allocWorld < 1;
  const blend = (y) => {
    let w = 0, s = 0;
    if (needWorld) { w = worldSek(y); if (w == null) return null; }
    if (needSwe)   { s = wSwe[y];     if (s == null) return null; }
    return allocWorld * w + (1 - allocWorld) * s;
  };

  // Tillgängligt år-spann beroende på vilka serier som behövs
  const allYears = new Set([...Object.keys(wWorld), ...Object.keys(wSwe)].map(Number));
  const avail = [...allYears].filter(y => blend(y) != null).sort((a, b) => a - b);
  if (avail.length < 5) return null;
  const firstY = avail[0], lastY = avail[avail.length - 1];

  const inf = inputs.inflation / 100;
  const retireIdx  = inputs.retire - inputs.age;
  const planYears  = inputs.lifespan - inputs.age;
  const decumYears = inputs.lifespan - inputs.retire;
  if (decumYears < 1) return null;

  let windows = 0, survived = 0;
  const failYears = [];

  for (let startY = firstY; startY + decumYears <= lastY + 1; startY++) {
    const ret = [];
    let ok = true;
    for (let i = 0; i <= planYears; i++) {
      if (i < retireIdx) {
        ret.push(inputs.realReturn / 100);            // ackumulering: deterministisk real
      } else {
        const b = blend(startY + (i - retireIdx));
        if (b == null) { ok = false; break; }          // hoppa fönster med datagap
        ret.push((1 + b) / (1 + inf) - 1);             // nominell → real
      }
    }
    if (!ok) continue;
    const sim = simulate(inputs, { returnOverride: ret });
    windows++;
    if (!sim.ran_dry) survived++; else failYears.push(startY);
  }
  return { successRate: windows ? survived / windows : 0, windows, survived, failYears,
           decumYears, firstY, lastY };
}

// Statistik över de två marknaderna (årsavkastning SEK, 1970–2025).
// Cachas eftersom den inte beror på allokeringen.
let _marketStats = null;
function marketStats() {
  if (_marketStats) return _marketStats;
  const H = window.MARKET_HISTORY;
  if (!H) return null;
  const w = H.world.returns, s = H.sweden.returns, fx = H.usdSek.rates;
  const worldSek = y => (1 + w[y]) * (fx[y] / fx[y-1]) - 1;
  const rw = [], rs = [];
  for (let y = 1970; y <= 2025; y++) {
    if (w[y] == null || s[y] == null || fx[y] == null || fx[y-1] == null) continue;
    rw.push(worldSek(y)); rs.push(s[y]);
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const std  = a => { const m = mean(a); return Math.sqrt(a.reduce((t, x) => t + (x-m)**2, 0) / a.length); };
  const ma = mean(rw), mb = mean(rs);
  const cov = rw.reduce((t, _, i) => t + (rw[i]-ma)*(rs[i]-mb), 0) / rw.length;
  const sw = std(rw), ss = std(rs), rho = cov / (sw * ss);
  // Minsta-varians-vikt på World: w* = (σs² − cov) / (σw² + σs² − 2cov)
  let wmv = (ss*ss - cov) / (sw*sw + ss*ss - 2*cov);
  wmv = Math.max(0, Math.min(1, wmv));
  // Max-Sharpe (tangering, rf=0): bästa avkastning per risk. Bygger på historisk
  // avkastning → bräcklig (Felix: past returns predict little). Visas med brasklapp.
  const num = ma*ss*ss - mb*cov;
  const den = ma*ss*ss + mb*sw*sw - (ma+mb)*cov;
  let wms = den !== 0 ? num/den : 1;
  wms = Math.max(0, Math.min(1, wms));
  // Bondsstatistik (om serien finns): μ, σ, samt korrelationer med World/SIXRX
  // på det överlappande fönstret. Bonds är nominella SEK redan → ingen FX-konv.
  let bondStats = null;
  if (H.bondsSE && H.bondsSE.returns) {
    const b = H.bondsSE.returns;
    const rwO = [], rsO = [], rb = [];
    for (let y = 1970; y <= 2025; y++) {
      if (w[y] == null || s[y] == null || fx[y] == null || fx[y-1] == null || b[y] == null) continue;
      if (_excludeRateCrisis && RATE_CRISIS_YEARS.has(y)) continue;
      rwO.push(worldSek(y)); rsO.push(s[y]); rb.push(b[y]);
    }
    if (rb.length >= 10) {
      const mbo = mean(rb), sbo = std(rb);
      const mwO = mean(rwO), msO = mean(rsO);
      const sWo = std(rwO),  sSo = std(rsO);
      const covWB = rb.reduce((t, _, i) => t + (rwO[i]-mwO)*(rb[i]-mbo), 0) / rb.length;
      const covSB = rb.reduce((t, _, i) => t + (rsO[i]-msO)*(rb[i]-mbo), 0) / rb.length;
      bondStats = {
        meanBond:  mbo, sigmaBond: sbo,
        rhoWorldBond:  covWB / (sWo * sbo),
        rhoSweBond:    covSB / (sSo * sbo),
        nOverlap: rb.length,
      };
    }
  }
  _marketStats = { sigmaWorld: sw, sigmaSwe: ss, cov, rho,
                   meanWorld: ma, meanSwe: mb, minVarAlloc: wmv, maxSharpeAlloc: wms,
                   bondStats };
  return _marketStats;
}

// Portföljens standardavvikelse vid en given World-vikt.
function blendStd(allocWorld) {
  const m = marketStats(); if (!m) return null;
  const w = allocWorld, sw = m.sigmaWorld, ss = m.sigmaSwe, cov = m.cov;
  return Math.sqrt(w*w*sw*sw + (1-w)*(1-w)*ss*ss + 2*w*(1-w)*cov);
}

// Tillväxtserier (1 kr investerad 1970) i SEK för World, SIXRX och mix.
function historySeries(allocWorld) {
  const H = window.MARKET_HISTORY;
  if (!H) return null;
  const w = H.world.returns, s = H.sweden.returns, fx = H.usdSek.rates;
  const worldSek = y => (w[y] == null || fx[y] == null || fx[y-1] == null)
    ? null : (1 + w[y]) * (fx[y] / fx[y-1]) - 1;

  let cw = 1, cs = 1, cb = 1;
  const pts = [{ year: 1969, world: 1, sixrx: 1, blend: 1 }];
  const rw = [], rs = [], rb = [];
  for (let y = 1970; y <= 2025; y++) {
    const ws = worldSek(y), ss = s[y];
    if (ws == null || ss == null) continue;
    const bb = allocWorld * ws + (1 - allocWorld) * ss;
    cw *= (1 + ws); cs *= (1 + ss); cb *= (1 + bb);
    rw.push(ws); rs.push(ss); rb.push(bb);
    pts.push({ year: y, world: cw, sixrx: cs, blend: cb });
  }
  const n = rw.length;
  const cagr = c => Math.pow(c, 1 / n) - 1;
  return { pts, n,
    cagrWorld: cagr(cw), cagrSixrx: cagr(cs), cagrBlend: cagr(cb) };
}

function renderHistoryChart(allocWorld) {
  const c = document.getElementById("histChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const data = historySeries(allocWorld);
  if (!data) return;
  const pts = data.pts;

  const padL = 52, padR = 12, padT = 12, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const y0 = pts[0].year, y1 = pts[pts.length-1].year;
  const maxV = Math.max(...pts.map(p => Math.max(p.world, p.sixrx, p.blend)));
  // Log-skala (55 års tillväxt)
  const logMax = Math.log10(maxV);
  const xFor = yr => padL + (yr - y0) / (y1 - y0) * plotW;
  const yFor = v => padT + plotH - (Math.log10(Math.max(1, v)) / logMax) * plotH;

  // Gridlinjer vid 1, 10, 100, ...
  ctx.font = "10px -apple-system, system-ui, sans-serif";
  for (let p = 0; p <= Math.ceil(logMax); p++) {
    const v = Math.pow(10, p), y = yFor(v);
    ctx.strokeStyle = "#1a1a1a10";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "right";
    ctx.fillText(v >= 1000 ? (v/1000)+"k" : v+"×", padL - 4, y + 3);
  }
  // X-årtal
  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "center";
  for (let yr = 1970; yr <= 2025; yr += 10) ctx.fillText(yr, xFor(yr), H - padB + 16);

  const line = (key, color, width) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    pts.forEach((p, i) => { const x=xFor(p.year), y=yFor(p[key]);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); });
    ctx.stroke(); ctx.lineWidth = 1;
  };
  line("sixrx", "#c46d4d", 1.8);   // SIXRX — koral
  line("world", "#3a5a40", 1.8);   // MSCI World SEK — sage
  line("blend", "#4a6b8a", 2.6);   // Din mix — blå, tjockare

  // Snittavkastning/år (CAGR) + standardavvikelse (σ) per linje
  const avg = document.getElementById("histAvg");
  const m = marketStats();
  if (avg && m) {
    const f = x => (x*100).toFixed(1) + "%";
    avg.innerHTML = `
      <span class="ha"><span class="hd" style="background:#3a5a40"></span>MSCI World (SEK) <b>${f(data.cagrWorld)}/år</b> <span class="hsig">σ ${f(m.sigmaWorld)}</span></span>
      <span class="ha"><span class="hd" style="background:#c46d4d"></span>SIXRX <b>${f(data.cagrSixrx)}/år</b> <span class="hsig">σ ${f(m.sigmaSwe)}</span></span>
      <span class="ha"><span class="hd" style="background:#4a6b8a"></span>Din mix <b>${f(data.cagrBlend)}/år</b> <span class="hsig">σ ${f(blendStd(allocWorld))}</span></span>`;
  }
}

function renderBacktest() {
  const el = document.getElementById("backtestResult");
  if (!el) return;
  const inputs = getInputs();
  const lifestyle = activeTier ? TIER_LIFESTYLE[activeTier] : { sideIncomeRatio: 0, untilAge: 0 };
  const allocWorld = (+document.getElementById("allocSlider")?.value || 100) / 100;
  // applicera livsstil
  const inp = { ...inputs };
  const bt = runBacktest(inp, allocWorld);
  if (!bt) { el.innerHTML = ""; return; }

  const pct = Math.round(bt.successRate * 100);
  const cls = pct >= 90 ? "good" : pct >= 75 ? "ok" : "warn";
  const lbl = document.getElementById("allocLabel");
  const ms = marketStats();
  if (lbl) lbl.textContent = `${Math.round(allocWorld*100)}% international / ${Math.round((1-allocWorld)*100)}% Sverige`;

  // Bond-sliderns etikett: visa ränteandel + portföljens σ för aktuell mix.
  // När glidbana är på äger den ränteandelen → inaktivera slider och säg det.
  const bondSlider = document.getElementById("bondSlider");
  const bondLabel  = document.getElementById("bondLabel");
  const bondHint   = document.getElementById("bondHint");
  if (bondSlider && bondLabel) {
    if (_glidbana) {
      bondSlider.disabled = true;
      bondLabel.textContent = "Räntor styrs av AP7-glidbanan (åldersberoende)";
      if (bondHint) bondHint.style.opacity = "0.5";
    } else {
      bondSlider.disabled = false;
      const bf  = (+bondSlider.value) / 100;
      const sig = portfolioStdFromMix(allocWorld, bf);
      bondLabel.textContent = `${Math.round(bf*100)}% räntor (${100 - Math.round(bf*100)}% aktier) · framåtblickande σ ${(sig*100).toFixed(1)}%`;
      if (bondHint) bondHint.style.opacity = "1";
    }
  }

  // Optimeringspunkter: min-varians + max-Sharpe (klickbara)
  const optim = document.getElementById("allocOptim");
  if (optim && ms) {
    const setAlloc = w => { const as = document.getElementById("allocSlider");
      as.value = Math.round(w*100); as._userMoved = true; renderBacktest(); };
    const mvW = Math.round(ms.minVarAlloc*100), msW = Math.round(ms.maxSharpeAlloc*100);
    optim.innerHTML =
      `<button class="optim-chip" id="optMinVar">Lägst risk: ${mvW}/${100-mvW}</button>` +
      `<button class="optim-chip" id="optMaxSharpe">Bäst risk/avkastning: ${msW}/${100-msW}</button>` +
      `<span class="optim-hint">(international/Sverige)</span>`;
    document.getElementById("optMinVar").onclick   = () => setAlloc(ms.minVarAlloc);
    document.getElementById("optMaxSharpe").onclick = () => setAlloc(ms.maxSharpeAlloc);
  }

  renderHistoryChart(allocWorld);

  // Framåtblickande antagande + historiskt snitt för jämförelse
  const fwReal = inputs.realReturn, fwNom = inputs.realReturn + inputs.inflation;
  const hs = historySeries(allocWorld);
  const histNom = hs ? hs.cagrBlend : null;
  const histReal = histNom != null ? (1+histNom)/(1+inputs.inflation/100)-1 : null;
  const mcPct = _lastMcSuccess != null ? Math.round(_lastMcSuccess*100) : null;
  const minSr = TIER_LIFESTYLE[activeTier || _lastTier || "fire"]?.minSuccessRate ?? 0.80;
  const mcCls = mcPct == null ? "" : (mcPct/100 - minSr >= 0.05 ? "good" : mcPct/100 - minSr >= 0 ? "ok" : "warn");

  el.innerHTML = `
    <div class="compare-row">
      <div class="compare-box">
        <div class="compare-h">Historiskt stresstest</div>
        <span class="bt-pct ${cls}">${pct}%</span>
        <div class="compare-s">av ${bt.windows} verkliga ${bt.decumYears}-årsperioder (${bt.firstY}–${bt.lastY})</div>
      </div>
      <div class="compare-box">
        <div class="compare-h">Monte Carlo</div>
        <span class="bt-pct ${mcCls}">${mcPct != null ? mcPct + "%" : "…"}</span>
        <div class="compare-s">av ${MC_PATHS} simulerade banor</div>
      </div>
    </div>
    <div class="forward-note">
      <strong>Framåtblickande antagande:</strong> ${fwReal}% real (${fwNom}% nominell) per år — det Monte Carlo räknar med.
      ${histNom != null ? `Historiskt 1970–2025 gav din mix <strong>${(histNom*100).toFixed(1)}%/år</strong> nominell (~${(histReal*100).toFixed(1)}% real).
      ${histReal > fwReal/100 ? "Ditt antagande är alltså försiktigt jämfört med historien." : "Ditt antagande ligger över det historiska snittet."}` : ""}
    </div>
    <div class="bt-detail">
      Historiskt testar <strong>uttagsfasen</strong> mot faktiska sekvenser (givet din målportfölj). Monte Carlo testar hela resan med slumpad fat-tailed avkastning.
      ${bt.failYears.length
        ? ` Tog slut vid start ${bt.failYears.join(", ")} — stor nedgång tidigt (sekvensrisk).`
        : ` Klarade alla historiska startår, inkl. de värsta (1973–74, 2000, 2008).`}
    </div>`;
}

// ─── SR lookup-tabell ─────────────────────────────────────────────────────────
// Räknar MC för retire-åldrar från age+5 till 72 med steg 3.
// ~13 datapunkter × 124ms ≈ 1.6s, körs en gång i bakgrunden.
function buildSrTable(inputs, lifestyle) {
  const slider = $("srSlider");
  if (slider) {
    slider.disabled = true;
    $("srBuilding").style.display = "inline";
  }
  _srTable = [];

  setTimeout(() => {
    const minAge = Math.max(inputs.age + 3, 38);
    const maxAge = 72;
    for (let a = minAge; a <= maxAge; a += 3) {
      const mc = runMonteCarlo(
        { ...inputs, retire: a },
        { sideIncomeRatio: lifestyle.sideIncomeRatio, sideIncomeUntilAge: lifestyle.untilAge }
      );
      _srTable.push({ age: a, rate: mc.successRate });
    }
    // Sortera stigande ålder
    _srTable.sort((a, b) => a.age - b.age);

    if (slider) {
      slider.disabled = false;
      $("srBuilding").style.display = "none";
      updateSrSliderDisplay();
    }
  }, 50);
}

// Interpolera: given ett target success rate, returnera kräver retire-ålder
function srLookup(targetRate) {
  if (_srTable.length < 2) return null;
  // Success rate sjunker med yngre ålder (kortare ackumulering)
  // Tabellen är sorterad yngst→äldst, rate stiger
  for (let i = 0; i < _srTable.length - 1; i++) {
    const lo = _srTable[i], hi = _srTable[i + 1];
    if (targetRate >= lo.rate && targetRate <= hi.rate) {
      // Linjär interpolation
      const t = (targetRate - lo.rate) / (hi.rate - lo.rate);
      return Math.round(lo.age + t * (hi.age - lo.age));
    }
  }
  // Utanför tabellens räckvidd
  if (targetRate < _srTable[0].rate) return _srTable[0].age;
  return _srTable[_srTable.length - 1].age;
}

function updateSrSliderDisplay() {
  const slider = $("srSlider");
  if (!slider || _srTable.length === 0) return;
  const target = slider.value / 100;
  const age    = srLookup(target);
  const currentRetire = +$("retire").value;
  const diff   = age !== null ? age - currentRetire : null;

  $("srSliderValue").textContent = `${slider.value}%`;

  if (age === null) {
    $("srSliderResult").textContent = "Räknar…";
    $("srApplyBtn").style.display = "none";
    return;
  }

  let txt = `kräver pension vid ${age} år`;
  if (diff !== null && diff !== 0) {
    txt += diff > 0
      ? ` — ${diff} år senare än din nuvarande plan`
      : ` — ${-diff} år tidigare`;
  } else if (diff === 0) {
    txt += " — exakt din nuvarande plan ✓";
  }
  $("srSliderResult").textContent = txt;

  // Visa "Använd XX år"-knapp om ålder skiljer sig
  const btn = $("srApplyBtn");
  if (diff !== 0) {
    btn.textContent = `Sätt pension till ${age} år →`;
    btn.style.display = "inline-block";
    btn.onclick = () => {
      $("retire").value = age;
      activeTier = null;
      recalc();
    };
  } else {
    btn.style.display = "none";
  }
}

// ─── Önskad inkomst ────────────────────────────────────────────────────────────
// Livsstils-chipsen är borttagna — behovet anges direkt i kr/mån (#needPerMonth),
// som redan är wired till recalc via den generella input-lyssnaren nedan.
function setupLifestyleChips() { /* deprecated: inga chips längre */ }

// ─── Wire up inputs ───────────────────────────────────────────────────────────
// Tal-fält med mellanslag (.num): live-formatera FÖRST (registreras före övriga
// lyssnare så formateringen sker innan downstream-läsning via numv).
document.querySelectorAll("input.num").forEach(el => {
  el.addEventListener("input", () => formatNumInput(el));
  formatNumInput(el);   // formatera initiala HTML-värden (t.ex. 1500000 → 1 500 000)
});

// Trygghet-fälten påverkar bara Trygghet-panelen → egen lätt lyssnare (ingen tung MC).
const TRYGG_FIELDS = new Set([
  "tryggExpenses", "tryggBufferNow", "tryggBufferMonths", "tryggLossMonths", "tryggSafetyNet",
]);
document.querySelectorAll("input, select").forEach(el => {
  if (el.id === "customNeedInput") return;  // hanteras separat
  if (el.id === "allmanMonthly") return;    // hanteras separat (override-flagga)
  if (el.id === "ltvSlider" || el.id === "loanBalance" || el.id === "loanAmort") return; // bolån separat
  if (TRYGG_FIELDS.has(el.id)) {
    if (el.id === "tryggExpenses") {
      el.addEventListener("input", () => { el._userEdited = numv(el) > 0; renderTrygghet(); });
    } else {
      el.addEventListener("input", renderTrygghet);
    }
    el.addEventListener("change", renderTrygghet);
    return;
  }
  el.addEventListener("input",  recalc);
  el.addEventListener("change", recalc);
});

// Fördjupning: rita om canvas-graferna när avsnittet öppnas (de är display:none
// medan det är hopfällt, vilket kan ge fel storlek vid första öppning).
document.querySelector(".deepdive")?.addEventListener("toggle", (e) => {
  if (e.target.open) { renderBacktest(); updateIskAfComparison(); }
});

// Större framtida utgifter: dynamiska rader (etikett, belopp, ålder)
function addBigExpRow(label = "", amount = "", age = "") {
  const list = $("bigExpList");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "bigexp-row";
  row.innerHTML = `
    <input type="text" class="bigexp-label" placeholder="t.ex. barnens bröllop" value="${label}">
    <input type="text" inputmode="numeric" class="bigexp-amount" placeholder="belopp kr" value="${amount}">
    <span class="bigexp-at">vid</span>
    <input type="number" class="bigexp-age" placeholder="år" min="${+$("age").value}" max="100" value="${age}">
    <button type="button" class="bigexp-del" title="Ta bort">×</button>`;
  list.appendChild(row);
  // wire: format belopp, recalc på ändring, ta bort
  const amt = row.querySelector(".bigexp-amount");
  amt.addEventListener("input", () => { formatNumInput(amt); recalc(); });
  row.querySelector(".bigexp-label").addEventListener("input", recalc);
  row.querySelector(".bigexp-age").addEventListener("input", recalc);
  row.querySelector(".bigexp-del").addEventListener("click", () => { row.remove(); recalc(); });
}
$("bigExpAdd")?.addEventListener("click", () => addBigExpRow());

// Bolån: tvåvägs-synk slider ↔ lån, + manuell amortering låser autofyllet
$("ltvSlider")?.addEventListener("input", () => { _bolanSource = "ltv"; recalc(); });
$("loanBalance")?.addEventListener("input", () => { _bolanSource = "loan"; recalc(); });
$("loanAmort")?.addEventListener("input", () => {
  const el = $("loanAmort");
  el._userEdited = numv(el) > 0;   // tomt/0 → återgå till auto (lagkrav)
  recalc();
});

// Tier-klick
document.querySelectorAll(".tier").forEach(t => {
  t.addEventListener("click", () => {
    if (t.classList.contains("unreachable")) return;
    const match = t.querySelector(".tier-age").textContent.match(/(\d+)/);
    if (!match) return;
    activeTier = t.dataset.tier;
    $("retire").value = match[1];
    recalc();
    const r = $("retire");
    r.style.transition = "background .4s";
    r.style.background = "var(--cream-200)";
    setTimeout(() => (r.style.background = ""), 450);
  });
});

$("retire").addEventListener("input", () => { activeTier = null; });

// Reverse-calc
$("reverseAge")?.addEventListener("input", () => { $("reverseAge")._userMoved = true;
  const inputs = getInputs();
  updateReversecalc(inputs);
});

$("srSlider")?.addEventListener("input", () => {
  $("srSlider")._userMoved = true;
  updateSrSliderDisplay();
});

document.getElementById("allocSlider")?.addEventListener("input", () => {
  document.getElementById("allocSlider")._userMoved = true;
  renderBacktest();
});

// Avancerade inställningar toggle
// ISK vs AF: wire inputs
["iskAfInitial","iskAfMonthly","iskAfYears","iskAfReturn"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", updateIskAfComparison);
});
function syncIskAfDefaults() {
  const elInit = document.getElementById("iskAfInitial");
  if (elInit && !elInit._userMoved) setNumVal(elInit, numv("iskBalance", 1_000_000));
  const elMon = document.getElementById("iskAfMonthly");
  if (elMon && !elMon._userMoved) setNumVal(elMon, numv("savingsPerMonth", 10_000));
  const elRet = document.getElementById("iskAfReturn");
  if (elRet && !elRet._userMoved) {
    elRet.value = (+($("realReturn")?.value || 5)) + (+($("inflation")?.value || 2));
  }
  updateIskAfComparison();
}
["iskAfInitial","iskAfMonthly","iskAfYears","iskAfReturn"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", () => {
    document.getElementById(id)._userMoved = true;
  });
});

$("advancedToggle")?.addEventListener("click", () => {
  const sec = $("advancedSection");
  const arrow = $("advancedArrow");
  const open = sec.classList.toggle("open");
  arrow.textContent = open ? "▴" : "▾";
});

// Fee preset buttons
document.querySelectorAll(".fee-preset").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".fee-preset").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    const h = $("feeHigh"), l = $("feeLow");
    if (h) { h.value = btn.dataset.high; h.dispatchEvent(new Event("input", {bubbles:true})); }
    if (l) { l.value = btn.dataset.low;  l.dispatchEvent(new Event("input", {bubbles:true})); }
  });
});
["feeHigh","feeLow"].forEach(id =>
  document.getElementById(id)?.addEventListener("input", renderFeeDrag));

// Manuell ändring av allmän pension → sluta för-ifylla från lön (flagga FÖRE recalc)
$("allmanMonthly")?.addEventListener("input", () => {
  const el = $("allmanMonthly");
  el._userEdited = numv(el) > 0;  // tomt/0 → återgå till auto
  recalc();
});

window.addEventListener("DOMContentLoaded", () => {
  populateKommunList();
  // Default = max-Sharpe (bästa risk/avkastning, ~i linje med forskningens
  // hemmamarknads-bias) snarare än min-variansens hörnlösning.
  const as = document.getElementById("allocSlider");
  const ms = marketStats();
  if (as && ms && !as._userMoved) as.value = Math.round(ms.maxSharpeAlloc * 100);
  setupLifestyleChips();
  setupShockChips();
  applyOnboardingAnswers();
  if (localStorage.getItem("lugn_onboarding_done")) {
    const hero = document.querySelector(".hero");
    if (hero) hero.style.display = "none";
  }
  recalc();
});

// ─── Läs onboarding-svar och fyll kalkylatorn ─────────────────────────────────
function applyOnboardingAnswers() {
  const raw = localStorage.getItem("lugn_onboarding");
  if (!raw) return;
  try {
    const a = JSON.parse(raw);

    if (a.age)           $("age").value            = a.age;
    if (a.retireAge)     $("retire").value          = a.retireAge;
    if (a.totalSaved)    setNumVal("iskBalance", a.totalSaved);
    if (a.monthlySavings) setNumVal("savingsPerMonth", a.monthlySavings);
    if (a.needPerMonth)  setNumVal("needPerMonth", a.needPerMonth);
    if (a.salary != null && $("salary")) setNumVal("salary", a.salary);

    // Antaget avtal utifrån anställningsform (kan ändras i kalkylatorn)
    if (a.employment && $("avtal")) {
      $("avtal").value = a.employment === "ab" ? "ingen" : "itp1";
    }

    // TJP: om de inte vet, sätt pott till 0
    if (a.hasTjp === "none") setNumVal("tjpPott", 0);

    // Disposition: spara för coach
    if (a.disposition) window._lugn_disposition = a.disposition;
    if (a.goals)       window._lugn_goals       = a.goals;

  } catch (e) {
    console.warn("Could not parse onboarding answers", e);
  }
}
