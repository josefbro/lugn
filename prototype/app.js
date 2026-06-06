// Lugn prototype — FIRE/bridge/Monte Carlo calculator.
// All inputs live = recalculate on every change.

const fmtKr = n => {
  if (!isFinite(n) || isNaN(n)) return "— kr";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " kr";
};
const fmtPct = n => `${Math.round(n)}%`;
const $ = id => document.getElementById(id);

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

function lonTax(income, age) {
  if (income <= 0) return 0;
  const ga = age >= 65 ? 60_000 : 40_000;
  const t = Math.max(0, income - ga);
  return t * 0.32 + Math.max(0, t - 643_100) * 0.20;
}

function tjpPayout(pott, period) {
  const r = 0.03, n = period > 0 ? period : 25;
  return pott * r / (1 - Math.pow(1 + r, -n));
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

// ─── Deterministisk simulering ───────────────────────────────────────────────
// returnOverride: array[year] av faktisk real avkastning (för Monte Carlo)
function simulate(inputs, opts = {}) {
  const { age, retire, lifespan, needPerMonth, savingsPerMonth,
          iskBalance, kfBalance, depaBalance,
          tjpPott, tjpPeriod, allmanMonthly,
          realReturn, inflation } = inputs;

  const sideRatio    = opts.sideIncomeRatio    ?? 0;
  const sideUntilAge = opts.sideIncomeUntilAge ?? 0;
  const retOverride  = opts.returnOverride;    // array[i] eller undefined

  const inf     = inflation / 100;
  const nomBase = (realReturn + inflation) / 100;

  const yearsToTjp = Math.max(0, 65 - age);
  const tjpAt65    = tjpPott * Math.pow(1.04, yearsToTjp);
  const tjpAnnual  = tjpPayout(tjpAt65, tjpPeriod);

  let isk = iskBalance, kf = kfBalance, depa = depaBalance;
  const flows = [];
  let bridgeUsed = 0, ran_dry = false;

  for (let a = age; a <= lifespan; a++) {
    const i   = a - age;
    // Nominell avkastning: MC-override, annars glidbane-justerad eller flat
    const nom = retOverride
      ? retOverride[i] + inf
      : (_glidbana ? expectedRealReturnAtAge(a, { realReturn }) + inf : nomBase);
    const needAnnual = needPerMonth * 12 * Math.pow(1 + inf, i);
    const inAccum    = a < retire;

    let pensionGross = 0;
    if (a >= 65) {
      pensionGross += allmanMonthly * 12 * Math.pow(1 + inf, i);
      if (tjpPeriod < 0 || a < 65 + tjpPeriod)
        pensionGross += tjpAnnual * Math.pow(1 + inf, a - 65);
    }

    let bridgeDraw = 0, tax = 0;

    if (!inAccum) {
      const sideIncome = a < sideUntilAge ? needAnnual * sideRatio : 0;
      let still = needAnnual - pensionGross - sideIncome;
      if (still > 0) {
        const fd = Math.min(still, depa); depa -= fd; still -= fd; bridgeDraw += fd;
        const fi = Math.min(still, isk);  isk  -= fi; still -= fi; bridgeDraw += fi;
        const fk = Math.min(still, kf);   kf   -= fk; still -= fk; bridgeDraw += fk;
        if (still > 1) ran_dry = true;
      }
      bridgeUsed += bridgeDraw;
      tax += lonTax(pensionGross, a) + iskTax(isk, kf) + iskTax(kf, isk);
    } else {
      isk += savingsPerMonth * 12 * Math.pow(1 + inf, i);
      tax += iskTax(isk, kf) + iskTax(kf, isk);
    }

    isk  *= 1 + nom;
    kf   *= 1 + nom;
    depa *= 1 + nom;

    flows.push({
      age: a,
      need: inAccum ? 0 : needAnnual,
      pensionGross,
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
// Fat-tailed MC: real return ~ skalad Student-t (tjocka svansar).
// Verkliga börsavkastningar har fler extremutfall än normalfördelningen antar
// (svarta svanar: 2008, 2020). Student-t med ν=5 fångar detta.
const MC_PATHS    = 5_000;
const MC_MU_REAL  = 0.05;
const MC_SIGMA    = 0.17;
const MC_NU       = 5;     // frihetsgrader — lägre = tjockare svansar

// Box-Muller normalfördelad slumptal
function randn() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Chi-square(k) via summa av k kvadrerade normaler
function randChi2(k) {
  let s = 0;
  for (let i = 0; i < k; i++) { const z = randn(); s += z * z; }
  return s;
}

// Student-t-fördelat slumptal, skalat till enhetsvarians.
// t = Z / sqrt(W/ν), sedan × sqrt((ν-2)/ν) för std = 1.
function randStudentT(nu = MC_NU) {
  const z = randn();
  const w = randChi2(nu);
  const t = z / Math.sqrt(w / nu);
  return t * Math.sqrt((nu - 2) / nu);   // normaliserad till std 1
}

function runMonteCarlo(inputs, opts = {}) {
  const years = inputs.lifespan - inputs.age + 1;
  let successes = 0;
  const percentileData = [];   // [age] → [p10, p25, p50, p75, p90] kapital

  // Per-års kapital per bana (för fan chart)
  const allCapitals = Array.from({ length: years }, () => []);

  for (let p = 0; p < MC_PATHS; p++) {
    // Sampla en avkastnings-bana med fat-tailed (Student-t) avkastning.
    // Vid glidbana varierar förväntad avkastning och vol med åldern.
    const ret = Array.from({ length: years }, (_, i) => {
      const age = inputs.age + i;
      const mu  = _glidbana ? expectedRealReturnAtAge(age, inputs) : MC_MU_REAL;
      const sig = volAtAge(age);
      return mu + randStudentT() * sig;
    });
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

// ─── Tier-system ─────────────────────────────────────────────────────────────
const TIER_MULTIPLE = { coast: 0, barista: 10, lean: 17, fire: 25, fat: 33 };
const TIER_ORDER    = ["coast", "barista", "lean", "fire", "fat"];

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

// ─── Chart: dubbel panel (ackumulering + brygga) ─────────────────────────────
function drawCharts(flows, retireAge, mcData) {
  drawAccumChart(flows, retireAge, mcData);
  drawBridgeChart(flows, retireAge);
}

function drawAccumChart(flows, retireAge, mcData) {
  const c = $("accumChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const accumFlows = flows.filter(f => f.age <= retireAge);
  if (accumFlows.length < 2) return;

  const padL = 60, padR = 12, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxCap = mcData
    ? Math.max(...mcData.filter(d => d.age <= retireAge).map(d => d.p90))
    : Math.max(...accumFlows.map(f => f.totalCapital));
  if (maxCap === 0) return;

  // Grid
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    const v = maxCap * (1 - i / 4);
    ctx.strokeStyle = "#1a1a1a10";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a";
    ctx.textAlign = "right";
    ctx.fillText(fmtKr(v).replace(" kr", ""), padL - 4, y + 4);
  }

  const xFor = age => padL + (age - accumFlows[0].age) / (retireAge - accumFlows[0].age) * plotW;
  const yFor = val => padT + plotH - Math.min(1, val / maxCap) * plotH;

  // MC-fan (p10–p90, p25–p75)
  if (mcData) {
    const mAcc = mcData.filter(d => d.age <= retireAge);

    const fillBand = (pLo, pHi, alpha) => {
      ctx.beginPath();
      mAcc.forEach((d, i) => {
        const x = xFor(d.age), y = yFor(d[pLo]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      [...mAcc].reverse().forEach(d => ctx.lineTo(xFor(d.age), yFor(d[pHi])));
      ctx.closePath();
      ctx.fillStyle = `rgba(88,129,87,${alpha})`;
      ctx.fill();
    };
    fillBand("p10", "p90", 0.10);
    fillBand("p25", "p75", 0.16);

    // Median linje
    ctx.beginPath();
    mAcc.forEach((d, i) => {
      const x = xFor(d.age), y = yFor(d.p50);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#3a5a40";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Deterministisk linje (vit/mörk)
  ctx.beginPath();
  accumFlows.forEach((f, i) => {
    const x = xFor(f.age), y = yFor(f.totalCapital);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = mcData ? "#1a1a1a40" : "#3a5a40";
  ctx.lineWidth = mcData ? 1 : 2.5;
  ctx.setLineDash(mcData ? [4, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;

  // X-axis ålder-labels
  ctx.fillStyle = "#8a8a8a";
  ctx.textAlign = "center";
  accumFlows.forEach(f => {
    if (f.age % 5 === 0) {
      ctx.fillText(f.age, xFor(f.age), H - padB + 18);
    }
  });

  // Label vid slutpunkten
  const last = accumFlows[accumFlows.length - 1];
  ctx.fillStyle = "#3a5a40";
  ctx.textAlign = "right";
  ctx.font = "bold 12px -apple-system, system-ui, sans-serif";
  ctx.fillText(fmtKr(last.totalCapital), xFor(last.age), yFor(last.totalCapital) - 6);
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

  retYears.forEach((f, i) => {
    const x = padL + i * barW;
    const w = Math.max(1, barW - 1);

    const pensH = (Math.min(f.pensionGross, f.need) / maxNeed) * plotH;
    ctx.fillStyle = "#3a5a40";
    ctx.fillRect(x, padT + plotH - pensH, w, pensH);

    if (f.bridgeDraw > 0) {
      const bH = (f.bridgeDraw / maxNeed) * plotH;
      ctx.fillStyle = "#c46d4d";
      ctx.fillRect(x, padT + plotH - pensH - bH, w, bH);
    }

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

  // Markera 65 år (pension)
  const idx65 = retYears.findIndex(f => f.age === 65);
  if (idx65 >= 0) {
    const x = padL + idx65 * barW;
    ctx.strokeStyle = "#1a1a1a35";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4a4a4a";
    ctx.font = "11px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("65 — pension", x + 4, padT + 12);
  }
}

// ─── Plan summary ────────────────────────────────────────────────────────────
const TIER_NAMES = { coast:"Coast FI", barista:"Barista FIRE", lean:"Lean FIRE", fire:"FIRE", fat:"Fat FIRE" };

function updatePlanSummary(inputs, tier, successRate) {
  const el = $("planSummaryText");
  if (!el) return;
  const tierName = TIER_NAMES[tier] || tier;
  const minSr    = TIER_LIFESTYLE[tier]?.minSuccessRate ?? 0.80;
  const sr       = successRate;

  if (sr === null) {
    // Före MC är klart — visa det vi vet
    el.innerHTML = `Din plan siktar på <strong>${tierName}</strong> vid <strong>${inputs.retire} år</strong>. Beräknar sannolikhet…`;
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
      ${tierName} vid ${inputs.retire} år med <strong>${srPct}%</strong> sannolikhet — ${srPct - minPct} pp över gränsen för en robust plan.`;
  } else if (gap >= 0) {
    el.innerHTML = `
      <span class="ps-good">✓ Planen fungerar</span>, men med snäva marginaler.
      ${tierName} vid ${inputs.retire} år — ${srPct}% sannolikhet (målet är ≥${minPct}%).`;
  } else {
    const fixText = needed
      ? `Flytta pension till <strong>${needed} år</strong> eller öka sparandet.`
      : `Öka sparandet eller senarelägger pensionen.`;
    el.innerHTML = `
      <span class="ps-warn">⚠ Planen behöver justeras.</span>
      ${srPct}% sannolikhet — ${tierName} kräver ≥${minPct}%. ${fixText}`;
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
let _srTable     = [];   // [{age, rate}] förberäknad lookup för success-rate slider
let _srTableInputsKey = ""; // cache-nyckel så vi inte räknar om i onödan

function getInputs() {
  return {
    age:            +$("age").value,
    retire:         +$("retire").value,
    lifespan:       +$("lifespan").value,
    needPerMonth:   +$("needPerMonth").value,
    savingsPerMonth:+$("savingsPerMonth").value,
    iskBalance:     +$("iskBalance").value,
    kfBalance:      +$("kfBalance").value,
    depaBalance:    +$("depaBalance").value,
    tjpPott:        +$("tjpPott").value,
    tjpPeriod:      +$("tjpPeriod").value,
    allmanMonthly:  +$("allmanMonthly").value,
    realReturn:     +$("realReturn").value,
    inflation:      +$("inflation").value,
  };
}

function recalc() {
  _glidbana = !!document.getElementById("glidbana")?.checked;
  const inputs = getInputs();

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
    if (answerSub) answerSub.innerHTML = `<span style="color:#7ec8a0">✓ Du är på spår</span> — portföljen täcker ${inputs.retire < 65 ? `${inputs.retire}–65 år, sedan pension` : "pensionen direkt"}`;
  } else {
    // Inte på spår — visa VERKLIGT möjlig ålder, inte målet
    const realistiskAlder = earliestTarget ?? (earliestAgeForTier(inputs, "lean") ?? (earliestAgeForTier(inputs, "barista") ?? "?"));
    if (answerAge) { answerAge.textContent = `${realistiskAlder} år`; answerAge.style.color = "var(--coral-500)"; }
    if (answerSub) answerSub.innerHTML = `Med nuvarande sparande — du siktar på ${inputs.retire} år, se nedan hur`;
  }

  // Bridge-detalj
  if ($("bridgeSub")) $("bridgeSub").textContent =
    inputs.retire < 65
      ? `${inputs.retire}→65 år (${65 - inputs.retire} år utan pension), sedan TJP + allmän`
      : `Pension tillgänglig från ${inputs.retire} år`;

  $("endAge").textContent     = inputs.lifespan;
  $("endCapital").textContent = fmtKr(result.finalCapital);

  // Tier
  const flowAtRetire     = result.flows.find(f => f.age === inputs.retire);
  const capitalAtRetire  = flowAtRetire?.totalCapital ?? 0;
  const annualSpend      = inputs.needPerMonth * 12 * Math.pow(1 + inf, ytr);
  const currentTier      = classifyTier(annualSpend, capitalAtRetire);

  // Uppdatera "Din plan i ett nötskal" — preliminärt tills MC är klart
  updatePlanSummary(inputs, currentTier, null);

  // Beräkna earliest per tier
  const earliestByTier = {};
  TIER_ORDER.forEach(t => { earliestByTier[t] = earliestAgeForTier(inputs, t); });

  document.querySelectorAll(".tier").forEach(t => {
    const tier    = t.dataset.tier;
    const earliest = earliestByTier[tier];
    const ageEl   = t.querySelector(".tier-age");
    if (earliest === null) {
      ageEl.textContent = "ej nåbart";
      t.classList.add("unreachable");
    } else {
      ageEl.textContent = `${earliest} år`;
      t.classList.remove("unreachable");
    }
    t.classList.toggle("active", tier === currentTier && !activeTier);
    t.classList.toggle("selected", tier === activeTier);
  });

  const displayedTier = activeTier || currentTier;
  $("fireTier").textContent = displayedTier[0].toUpperCase() + displayedTier.slice(1);

  const noteEl = $("tierNote");
  if (noteEl) noteEl.textContent = TIER_LIFESTYLE[displayedTier].note;

  // Delta-text
  const deltaEl = $("tiersDelta");
  const earliest = earliestByTier[currentTier];
  if (!activeTier && earliest !== null && earliest < inputs.retire) {
    deltaEl.textContent = `Du kan nå ${currentTier} redan vid ${earliest} år — ${inputs.retire - earliest} år tidigare`;
  } else if (activeTier) {
    deltaEl.textContent = `Visar ${activeTier}-scenariot`;
  } else {
    deltaEl.textContent = "";
  }

  syncIskAfDefaults();
  renderShock(inputs);
  renderFeeDrag();

  // Synka reverseAge med retire om användaren inte rört den
  const raInput = $("reverseAge");
  if (raInput && !raInput._userMoved) raInput.value = inputs.retire;

  // Charts: rita deterministisk direkt, MC-fan med kort fördröjning
  drawCharts(result.flows, inputs.retire, _lastMcData);
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

    // Uppdatera success rate badge — färg relativt tier-tröskeln
    const sr    = mc.successRate;
    const tier  = activeTier || currentTier;
    const minSr = TIER_LIFESTYLE[tier]?.minSuccessRate ?? 0.80;
    const gap   = sr - minSr;

    const badge = $("successRate");
    badge.textContent = fmtPct(sr * 100);
    badge.className = "success-badge " +
      (gap >= 0.05 ? "good" : gap >= 0 ? "ok" : "warn");

    const srLabel = $("successLabel");
    const minPct  = Math.round(minSr * 100);
    if (srLabel) {
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      if (gap >= 0.05) {
        srLabel.textContent = `av ${MC_PATHS} banor. ${tierName} kräver ≥${minPct}% — god marginal.`;
      } else if (gap >= 0) {
        srLabel.textContent = `av ${MC_PATHS} banor. ${tierName} kräver ≥${minPct}% — precis godkänt, snäva marginaler.`;
      } else {
        const needed = _srTable.length >= 3 ? srLookup(minSr) : null;
        srLabel.innerHTML = `av ${MC_PATHS} banor. <strong>${tierName} kräver ≥${minPct}%</strong> — planen håller inte. `
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
    updatePlanSummary(inputs, currentTier, mc.successRate);

    // Lugn-score + Insights (Conquest-stil plan-känsla)
    const scoreData = computeLugnScore(inputs, mc, tier, result);
    renderPlanScore(scoreData);
    const insights = generateInsights(inputs, mc, tier, result, earliestByTier);
    renderInsights(insights);

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
  const minSr = TIER_LIFESTYLE[tier]?.minSuccessRate ?? 0.80;

  // 1. Hållbarhet (45%) — Monte Carlo success rate vs nivåns krav.
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
function generateInsights(inputs, mc, tier, result, earliestByTier) {
  const insights = [];
  const minSr  = TIER_LIFESTYLE[tier]?.minSuccessRate ?? 0.80;
  const tierName = TIER_NAMES[tier] || tier;
  const sr = mc.successRate;

  // — Hållbarhet —
  if (sr < minSr) {
    const needed = _srTable.length >= 3 ? srLookup(minSr) : null;
    insights.push({
      sev: 3, icon: "⚠",
      title: "Planen håller inte ända fram",
      body: `Med ${Math.round(sr*100)}% sannolikhet når den inte ${tierName}-tröskeln på ${Math.round(minSr*100)}%. `
        + (needed ? `I ett scenario där du går vid ${needed} år istället håller den.` : `Mer sparande eller senare frihet hjälper.`),
    });
  } else if (sr - minSr >= 0.10) {
    const earlier = earliestByTier[tier];
    insights.push({
      sev: 1, icon: "✓",
      title: "Du har god marginal",
      body: earlier && earlier < inputs.retire
        ? `Planen är stark. I ett scenario kan du nå ${tierName} redan vid ${earlier} år — eller höja din livsstil.`
        : `Planen är stark med ${Math.round(sr*100)}% sannolikhet. Du har utrymme att höja din livsstil eller gå tidigare.`,
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

  // — Frihet före 55 (TJP-spärr) —
  if (inputs.retire < 55) {
    insights.push({
      sev: 2, icon: "⚑",
      title: "Du planerar frihet före 55",
      body: `Tjänstepension och privat pensionsförsäkring kan tidigast tas ut vid 55. Hela perioden ${inputs.retire}–55 måste täckas av ISK/depå.`,
    });
  }

  // — Stor bridge —
  if (inputs.retire < 64) {
    const bridgeYears = 64 - inputs.retire;
    if (bridgeYears >= 10) {
      insights.push({
        sev: 1, icon: "⌁",
        title: `${bridgeYears} år att överbrygga`,
        body: `Mellan ${inputs.retire} och 64 (lägsta allmän pension 2026) finns inga pensionsutbetalningar. Ditt sparkapital bär hela den perioden.`,
      });
    }
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
    const needPerMonth = +($("needPerMonth")?.value || 35_000);
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
  const initial  = +document.getElementById("iskAfInitial")?.value  || 1_000_000;
  const monthly  = +document.getElementById("iskAfMonthly")?.value  || 10_000;
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
  const initial = getInputs().iskBalance;
  const monthly = getInputs().savingsPerMonth;
  const years   = Math.max(5, 65 - getInputs().age);
  const gross   = getInputs().realReturn + getInputs().inflation;
  const highFee = +document.getElementById("feeHigh")?.value || 1.5;
  const lowFee  = +document.getElementById("feeLow")?.value  || 0.2;

  const r = computeFeeDrag(initial, monthly, years, gross, highFee, lowFee);

  el.innerHTML = `
    <div class="fee-big">−${fmtKr(r.drag)}</div>
    <div class="fee-sub">extra du betalar över ${years} år med ${highFee}% avgift istället för ${lowFee}%</div>
    <div class="fee-bars">
      <div class="fee-bar-row">
        <span class="fee-bar-label">${lowFee}% indexfond</span>
        <span class="fee-bar"><span class="fee-bar-fill low" style="width:100%"></span></span>
        <span class="fee-bar-val">${fmtKr(r.low)}</span>
      </div>
      <div class="fee-bar-row">
        <span class="fee-bar-label">${highFee}% aktiv fond</span>
        <span class="fee-bar"><span class="fee-bar-fill high" style="width:${Math.round(r.high/r.low*100)}%"></span></span>
        <span class="fee-bar-val">${fmtKr(r.high)}</span>
      </div>
    </div>
    <p class="fee-note">Avgiften ser liten ut per år, men ränta-på-ränta gör den enorm över tid. Detta är en av de få saker du säkert kan kontrollera.</p>
  `;
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

// ─── Livsstil-chips ────────────────────────────────────────────────────────────
function setupLifestyleChips() {
  const chips     = document.querySelectorAll(".lchip");
  const hidden    = $("needPerMonth");
  const customWrap = $("customNeedWrap");
  const customIn   = $("customNeedInput");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("lchip-selected"));
      chip.classList.add("lchip-selected");
      const need = chip.dataset.need;
      if (need === "custom") {
        customWrap.style.display = "";
        if (customIn) {
          customIn.focus();
          hidden.value = customIn.value || 35000;
        }
      } else {
        customWrap.style.display = "none";
        hidden.value = need;
        $("customNeedLabel").textContent = `${(+need/1000).toFixed(0)} 000 / mån`;
      }
      recalc();
    });
  });

  // Synka custom input
  customIn?.addEventListener("input", () => {
    hidden.value = customIn.value;
    $("customNeedLabel").textContent = `${Math.round(customIn.value/1000)} 000 / mån`;
    recalc();
  });
}

// ─── Wire up inputs ───────────────────────────────────────────────────────────
document.querySelectorAll("input, select").forEach(el => {
  if (el.id === "customNeedInput") return; // hanteras separat
  el.addEventListener("input",  recalc);
  el.addEventListener("change", recalc);
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
  const inputs = {
    age:            +$("age").value,
    retire:         +$("retire").value,
    lifespan:       +$("lifespan").value,
    needPerMonth:   +$("needPerMonth").value,
    savingsPerMonth:+$("savingsPerMonth").value,
    iskBalance:     +$("iskBalance").value,
    kfBalance:      +$("kfBalance").value,
    depaBalance:    +$("depaBalance").value,
    tjpPott:        +$("tjpPott").value,
    tjpPeriod:      +$("tjpPeriod").value,
    allmanMonthly:  +$("allmanMonthly").value,
    realReturn:     +$("realReturn").value,
    inflation:      +$("inflation").value,
  };
  updateReversecalc(inputs);
});

$("srSlider")?.addEventListener("input", () => {
  $("srSlider")._userMoved = true;
  updateSrSliderDisplay();
});

// Avancerade inställningar toggle
// ISK vs AF: wire inputs
["iskAfInitial","iskAfMonthly","iskAfYears","iskAfReturn"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", updateIskAfComparison);
});
function syncIskAfDefaults() {
  const elInit = document.getElementById("iskAfInitial");
  if (elInit && !elInit._userMoved) elInit.value = $("iskBalance")?.value || 1_000_000;
  const elMon = document.getElementById("iskAfMonthly");
  if (elMon && !elMon._userMoved) elMon.value = $("savingsPerMonth")?.value || 10_000;
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

["feeHigh","feeLow"].forEach(id =>
  document.getElementById(id)?.addEventListener("input", renderFeeDrag));

window.addEventListener("DOMContentLoaded", () => {
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
    if (a.totalSaved)    $("iskBalance").value      = a.totalSaved;
    if (a.monthlySavings) $("savingsPerMonth").value = a.monthlySavings;
    if (a.needPerMonth)  $("needPerMonth").value    = a.needPerMonth;

    // TJP: om de inte vet, sätt pott till 0
    if (a.hasTjp === "none") $("tjpPott").value = 0;

    // Disposition: spara för coach
    if (a.disposition) window._lugn_disposition = a.disposition;
    if (a.goals)       window._lugn_goals       = a.goals;

  } catch (e) {
    console.warn("Could not parse onboarding answers", e);
  }
}
