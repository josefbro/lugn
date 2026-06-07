// Lugn Onboarding — 6 steg inbäddade i index.html
// Steg 1-4: Datainsamling
// Steg 5:   Rekommendation (live-beräkning med simulate() från app.js)
// Steg 6:   "Hitta livet" (Felix / Fishbach)
// Steg 7:   Computing-animation → dölj overlay → scrolla till kalkylatorn

const TOTAL_STEPS = 6;
let currentStep = 1;
const answers   = {};
let _listenersAttached = false;

const $ob = id => document.getElementById(id);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
function initOnboarding() {
  const overlay = $ob("obOverlay");
  if (!overlay) return;
  if (localStorage.getItem("lugn_onboarding_done")) {
    overlay.style.display = "none";
    return;
  }
  overlay.style.display = "flex";
  if (!_listenersAttached) { setupListeners(); _listenersAttached = true; }
  showStep(1);
}

// ─── Steg-navigation ─────────────────────────────────────────────────────────
function showStep(n) {
  document.querySelectorAll(".ob-step").forEach(s => s.classList.remove("active"));
  const el = document.querySelector(`[data-step="${n}"]`);
  if (el) el.classList.add("active");
  currentStep = n;

  const isComputingStep = n === TOTAL_STEPS + 1;
  $ob("obProgress").style.width = isComputingStep
    ? "100%"
    : `${((n - 1) / TOTAL_STEPS) * 100}%`;
  $ob("obBack").style.display   = n > 1 && !isComputingStep ? "inline-block" : "none";
  $ob("obNav").style.display    = isComputingStep ? "none" : "flex";

  // Dots (1–6)
  const dots = $ob("obDots");
  dots.innerHTML = "";
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const d = document.createElement("span");
    d.className = "ob-dot" + (i === n ? " active" : i < n ? " done" : "");
    dots.appendChild(d);
  }

  updateNextBtn();
  $ob("obOverlay").scrollTop = 0;

  // Rendera rekommendation dynamiskt när vi når steg 5
  if (n === 5) renderRecommendation();
}

function updateNextBtn() {
  const btn = $ob("obNext");
  btn.disabled    = !isStepValid(currentStep);
  btn.textContent = currentStep === TOTAL_STEPS ? "Bygg min plan →" : "Nästa →";
}

function isStepValid(step) {
  if (step === 1) return !!answers.motivation;
  if (step === 2) return !!answers.partner && !!answers.employment;
  if (step === 3) return !!answers.totalSaved && !!answers.monthlySavings && !!answers.hasTjp;
  if (step === 4) return !!answers.targetTier;
  if (step === 5) return true;  // Rekommendation — alltid OK att gå vidare
  if (step === 6) return !!answers.disposition;
  return true;
}

// ─── Steg 5: Rekommendation ──────────────────────────────────────────────────
function renderRecommendation() {
  const el = $ob("obRecommendation");
  if (!el) return;

  // Vänta tills app.js är laddat (ska alltid vara det vid interaktion)
  if (typeof simulate !== "function" || typeof earliestAgeForTier !== "function") {
    el.innerHTML = `<p class="ob-sublead" style="opacity:.6">Laddar simulering…</p>`;
    setTimeout(renderRecommendation, 200);
    return;
  }

  const age          = answers.age || 35;
  const retireAge    = answers.retireAge || 55;
  const totalSaved   = +answers.totalSaved  || 1_000_000;
  const monthlySav   = +answers.monthlySavings || 10_000;
  const targetTier   = answers.targetTier || "fire";
  const needPerMonth = answers.needPerMonth || 35_000;

  const inputs = {
    age, retire: retireAge, lifespan: 90,
    needPerMonth, savingsPerMonth: monthlySav,
    iskBalance: totalSaved, kfBalance: 0, depaBalance: 0,
    tjpPott: 0, tjpPeriod: 20, allmanMonthly: 0,
    realReturn: 5, inflation: 2,
  };

  // Beräkna earliestAge per tier
  const tiers = ["coast", "barista", "lean", "fire", "fat"];
  const tierLabels = { coast:"Coast", barista:"Barista", lean:"Lean", fire:"FIRE", fat:"Fat FIRE" };
  const earliestAges = {};
  tiers.forEach(t => { earliestAges[t] = earliestAgeForTier(inputs, t); });

  // Klassificera nuläget vid targetRetireAge
  const simAtRetire   = simulate(inputs);
  const flowAtRetire  = simAtRetire.flows.find(f => f.age === retireAge);
  const inf           = 0.02;
  const annualSpend   = needPerMonth * 12 * Math.pow(1 + inf, retireAge - age);
  const capital       = flowAtRetire?.totalCapital ?? 0;
  const achievedTier  = classifyTier(annualSpend, capital);
  const tierOrder     = tiers;
  const targetIdx     = tierOrder.indexOf(targetTier);
  const achievedIdx   = tierOrder.indexOf(achievedTier);
  const gap           = targetIdx - achievedIdx;

  // Hur mycket extra sparande krävs för att nå target tier vid target age?
  const neededSavings = gap > 0
    ? requiredSavings({ ...inputs, retire: retireAge }, retireAge)
    : null;
  const savingsDelta = neededSavings !== null ? neededSavings - monthlySav : null;

  // Special case: Coast FI nu
  const isAlreadyCoast = earliestAges.coast !== null && earliestAges.coast <= age;

  // ─── Rendera HTML ──────────────────────────────────────────────────────────
  const tierPillsHtml = tiers.map(t => {
    const a = earliestAges[t];
    const isTarget   = t === targetTier;
    const isAchieved = t === achievedTier;
    const isCoastNow = t === "coast" && isAlreadyCoast;
    let cls = "ob-rec-tier";
    if (isTarget)   cls += " target";
    if (isAchieved && !isTarget) cls += " achieved";
    if (isCoastNow) cls += " achieved";
    return `
      <div class="${cls}">
        <span class="ob-rec-tier-name">${tierLabels[t]}</span>
        <span class="ob-rec-tier-age">${isCoastNow ? "Nu ✓" : a !== null ? `${a} år` : "ej nåbart"}</span>
        ${isTarget ? '<span class="ob-rec-tier-badge">ditt mål</span>' : ""}
      </div>`;
  }).join("");

  let messageHtml;
  if (isAlreadyCoast) {
    messageHtml = `
      <div class="ob-rec-highlight good">
        <strong>Du är redan Coast FI</strong> — din portfölj kan växa till FIRE-nivå vid 65 utan att du sparar en krona till. Allt extra sparande är ett val, inte ett krav.
      </div>`;
  } else if (gap <= 0) {
    // On track or over-delivering
    const earlyYears = retireAge - (earliestAges[targetTier] ?? retireAge);
    if (earlyYears > 0) {
      messageHtml = `
        <div class="ob-rec-highlight good">
          <strong>Bättre än du tror.</strong> Din nuvarande bana når ${tierLabels[targetTier]} redan vid <strong>${earliestAges[targetTier]} år</strong> — ${earlyYears} år tidigare än ditt mål. Du kan lugna ner sparandet, eller gå tidigare.
        </div>`;
    } else {
      messageHtml = `
        <div class="ob-rec-highlight good">
          <strong>Din plan håller.</strong> Med nuvarande sparande når du ${tierLabels[targetTier]} vid <strong>${earliestAges[targetTier] ?? retireAge} år</strong> — precis som du planerat.
        </div>`;
    }
  } else {
    // Gap — needs more savings or later retirement
    const altTierAge = earliestAges[achievedTier];
    messageHtml = `
      <div class="ob-rec-highlight warn">
        <strong>Gapet är hanterbart.</strong> Med nuvarande sparande når du <strong>${tierLabels[achievedTier]}</strong> vid ${altTierAge ?? "?"} år — ett steg under ditt mål.
        ${savingsDelta && savingsDelta > 0
          ? `Spara <strong>${Math.round(savingsDelta/500)*500} kr/mån</strong> mer för att nå ${tierLabels[targetTier]} vid ${retireAge} år.`
          : ""}
      </div>`;
  }

  // Alternativ att se på
  const alternativesHtml = (() => {
    const lines = [];
    // Om de inte redan är Coast FI och Coast är möjligt snart
    if (!isAlreadyCoast && earliestAges.coast !== null) {
      lines.push(`🏝 <strong>Coast FI</strong> uppnår du redan vid ${earliestAges.coast} år — sluta spara och låt portföljen växa.`);
    }
    // Lean om de siktar på FIRE/Fat
    if ((targetTier === "fire" || targetTier === "fat") && earliestAges.lean !== null) {
      lines.push(`⚡ <strong>Lean FIRE</strong> är möjligt ${earliestAges.lean} år — ${retireAge - earliestAges.lean} år tidigare med lägre spending.`);
    }
    // FIRE om de siktar på Fat
    if (targetTier === "fat" && earliestAges.fire !== null) {
      lines.push(`🎯 <strong>FIRE (4%)</strong> uppnår du vid ${earliestAges.fire} år — ${retireAge - earliestAges.fire} år tidigare.`);
    }
    return lines.length
      ? `<div class="ob-rec-alternatives"><p class="ob-question" style="margin-bottom:10px">Alternativ att se på:</p><ul class="ob-rec-list">${lines.map(l=>`<li>${l}</li>`).join("")}</ul></div>`
      : "";
  })();

  el.innerHTML = `
    <p class="ob-sublead">Baserat på dina siffror — vi kör kalkylatorn åt dig.</p>
    <div class="ob-rec-tiers">${tierPillsHtml}</div>
    ${messageHtml}
    ${alternativesHtml}
    <p class="ob-rec-footer">Du kan finjustera alla siffror i kalkylatorn efteråt.</p>
  `;
}

// ─── Väljare ─────────────────────────────────────────────────────────────────
function setupListeners() {
  document.querySelectorAll("#obOverlay .ob-options").forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll(".ob-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".ob-opt").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[key] = btn.dataset.val;
        updateNextBtn();
        if (key === "motivation") setTimeout(() => {
          if (isStepValid(1)) showStep(2);
        }, 220);
      });
    });
  });

  document.querySelectorAll("#obOverlay .ob-chips").forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll(".ob-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".ob-chip").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[key] = btn.dataset.val;
        updateNextBtn();
      });
    });
  });

  document.querySelectorAll("#obOverlay .ob-tier-cards").forEach(group => {
    group.querySelectorAll(".ob-tier-card").forEach(card => {
      card.addEventListener("click", () => {
        group.querySelectorAll(".ob-tier-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        answers.targetTier   = card.dataset.val;
        answers.needPerMonth = +card.dataset.need;
        updateNextBtn();
      });
    });
  });

  $ob("obAge")?.addEventListener("input", e => {
    $ob("obAgeVal").textContent = `${e.target.value} år`;
    answers.age = +e.target.value;
  });
  $ob("obRetire")?.addEventListener("input", e => {
    $ob("obRetireVal").textContent = `${e.target.value} år`;
    answers.retireAge = +e.target.value;
  });

  answers.age      = +$ob("obAge").value;
  answers.retireAge = +$ob("obRetire").value;

  $ob("obGoals")?.addEventListener("input", e => { answers.goals = e.target.value; });

  $ob("obNext").addEventListener("click", () => {
    if (!isStepValid(currentStep)) return;
    if (currentStep === TOTAL_STEPS) startComputing();
    else showStep(currentStep + 1);
  });
  $ob("obBack").addEventListener("click", () => {
    if (currentStep > 1) showStep(currentStep - 1);
  });
}

// ─── Computing → stäng overlay → scrolla ─────────────────────────────────────
function startComputing() {
  showStep(TOTAL_STEPS + 1);

  localStorage.setItem("lugn_onboarding", JSON.stringify(answers));
  localStorage.setItem("lugn_onboarding_done", "1");
  applyOnboardingAnswers(answers);

  const steps = ["cs1","cs2","cs3","cs4"];
  steps.forEach((id, i) => {
    setTimeout(() => {
      const el = $ob(id);
      if (!el) return;
      el.classList.add("visible");
      setTimeout(() => el.classList.add("done"), 200);
    }, 300 + i * 380);
  });

  setTimeout(() => {
    const overlay = $ob("obOverlay");
    overlay.classList.add("hiding");
    setTimeout(() => {
      overlay.style.display = "none";
      overlay.classList.remove("hiding");
      const kalk = document.getElementById("kalkylator");
      if (kalk) kalk.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
  }, 300 + steps.length * 380 + 400);
}

// ─── Hoppa över onboarding ───────────────────────────────────────────────────
function skipOnboarding() {
  localStorage.setItem("lugn_onboarding_done", "skip");
  const overlay = $ob("obOverlay");
  overlay.classList.add("hiding");
  setTimeout(() => {
    overlay.style.display = "none";
    overlay.classList.remove("hiding");
    const kalk = document.getElementById("kalkylator");
    if (kalk) kalk.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 300);
}

// ─── Nollställ alla svar till ett rent utgångsläge ───────────────────────────
function resetOnboardingState() {
  // Töm svarsobjektet
  Object.keys(answers).forEach(k => delete answers[k]);
  // Avmarkera alla val
  document.querySelectorAll("#obOverlay .selected")
    .forEach(el => el.classList.remove("selected"));
  // Återställ reglage till default
  const ageEl = $ob("obAge"), retireEl = $ob("obRetire");
  if (ageEl)    { ageEl.value = 35;    $ob("obAgeVal").textContent = "35 år"; }
  if (retireEl) { retireEl.value = 55; $ob("obRetireVal").textContent = "55 år"; }
  const goalsEl = $ob("obGoals");
  if (goalsEl) goalsEl.value = "";
  // Default-svar som setupListeners normalt sätter
  answers.age = 35;
  answers.retireAge = 55;
}

// ─── Visa igen (från hero-knapp eller reset-knapp) ───────────────────────────
function showOnboarding() {
  localStorage.removeItem("lugn_onboarding_done");
  const overlay = $ob("obOverlay");
  if (!overlay) return;
  if (!_listenersAttached) { setupListeners(); _listenersAttached = true; }
  resetOnboardingState();
  overlay.style.display = "flex";
  showStep(1);
  window.scrollTo({ top: 0 });
  // Visa hero igen
  const hero = document.querySelector(".hero");
  if (hero) hero.style.display = "";
}

// ─── Init ─────────────────────────────────────────────────────────────────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOnboarding);
} else {
  initOnboarding();
}
