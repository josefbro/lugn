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

// Markera när overlayen är öppen (döljer reset-FAB så den inte krockar med Nästa)
function setObActive(on) {
  document.body.classList.toggle("ob-active", !!on);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
function initOnboarding() {
  const overlay = $ob("obOverlay");
  if (!overlay) return;
  if (localStorage.getItem("lugn_onboarding_done")) {
    overlay.style.display = "none";
    setObActive(false);
    return;
  }
  overlay.style.display = "flex";
  setObActive(true);
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
  if (step === 4) return (+answers.needPerMonth || 0) > 0;
  if (step === 5) return true;  // Rekommendation — alltid OK att gå vidare
  if (step === 6) return !!answers.disposition;
  return true;
}

// Anta tjänstepensionsavtal utifrån anställningsform (justerbart i kalkylatorn).
function assumedAvtal() {
  if (answers.employment === "ab") return "ingen";   // eget AB → ingen kollektiv TJP
  return "itp1";                                       // anställd/blandat → ITP1 som bas
}

// ─── Steg 5: Rekommendation (behovsbaserad, inkl. pension) ───────────────────
// Två faser: visa spinner direkt (paint), kör tunga Monte Carlo-svepet på nästa
// tick så stegövergången inte fryser.
function renderRecommendation() {
  const el = $ob("obRecommendation");
  if (!el) return;

  // Vänta tills app.js är laddat
  if (typeof simulate !== "function" || typeof earliestSustainAge !== "function"
      || typeof allmanAt65Full !== "function") {
    el.innerHTML = `<p class="ob-sublead" style="opacity:.6">Laddar simulering…</p>`;
    setTimeout(renderRecommendation, 200);
    return;
  }

  el.innerHTML = `
    <div class="ob-spinner" style="margin:40px auto 16px"></div>
    <p class="ob-sublead" style="text-align:center;opacity:.7">Kör tusentals scenarier på din plan…</p>`;
  setTimeout(() => computeRecommendation(el), 40);
}

function computeRecommendation(el) {
  const age          = answers.age || 35;
  const retireAge    = answers.retireAge || 55;
  const totalSaved   = +answers.totalSaved || 0;
  const monthlySav   = +answers.monthlySavings || 0;
  const salary       = +answers.salary || 0;
  const needPerMonth = +answers.needPerMonth || 30_000;

  // Pension från lön — det här lyfter planen från "onödigt pessimistisk".
  const avtal         = assumedAvtal();
  const allmanFull    = allmanAt65Full(salary);                 // kr/mån vid 65, full karriär
  const allmanMonthly = Math.round(allmanFull * allmanFactor(retireAge));
  const tjpContrib    = tjpContribFromAvtal(avtal, salary) || 0; // kr/mån avsättning

  const inputs = {
    age, retire: retireAge, lifespan: 90,
    needPerMonth, savingsPerMonth: monthlySav,
    iskBalance: totalSaved, kfBalance: 0, depaBalance: 0,
    tjpPott: 0, tjpPeriod: 20, tjpContrib, avtal,
    allmanMonthly,
    realReturn: 5, inflation: 2,
  };

  // Sannolikhet att planen håller vid målåldern (Monte Carlo, fat-tailed).
  // Rubriken och alla delbudskap bygger på samma 80 %-tröskel → ingen motsägelse.
  const mc    = runMonteCarlo(inputs);
  const holds = Math.round(mc.successRate * 100);
  const sustainsAtTarget = holds >= 80;
  // Tidigast hållbar ålder (≥80 %) med nuvarande sparande
  const earliest = earliestSustainAge(inputs);

  const kr = n => Math.round(n).toLocaleString("sv-SE").replace(/,/g, " ");

  // ─── Huvudbudskap ──────────────────────────────────────────────────────────
  let messageHtml;
  if (sustainsAtTarget && earliest < retireAge) {
    messageHtml = `
      <div class="ob-rec-highlight good">
        <strong>Bättre än du kanske tror.</strong> Din nuvarande bana bär
        <strong>${kr(needPerMonth)} kr/mån</strong> redan från <strong>${earliest} år</strong> —
        ${retireAge - earliest} år före ditt mål. Du kan gå tidigare, eller lugna ner sparandet.
      </div>`;
  } else if (sustainsAtTarget) {
    messageHtml = `
      <div class="ob-rec-highlight good">
        <strong>Din plan håller.</strong> Med nuvarande sparande kan du leva på
        <strong>${kr(needPerMonth)} kr/mån</strong> från <strong>${retireAge} år</strong> — precis som du siktar på.
      </div>`;
  } else {
    const needSav = requiredSavingsToSustain(inputs, retireAge);
    const extra   = needSav !== null ? Math.max(0, needSav - monthlySav) : null;
    const earliestTxt = earliest !== null
      ? `Med dagens sparande räcker det istället från <strong>${earliest} år</strong>.`
      : `Med dagens sparande nås målet inte inom rimlig horisont.`;
    messageHtml = `
      <div class="ob-rec-highlight warn">
        <strong>Det finns ett gap — men det är konkret.</strong>
        ${extra !== null && extra > 0
          ? `För att leva på ${kr(needPerMonth)} kr/mån från ${retireAge} år behöver du spara
             ca <strong>${kr(Math.round(extra/500)*500)} kr/mån mer</strong>
             (idag ${kr(monthlySav)} kr). `
          : ""}
        ${earliestTxt}
      </div>`;
  }

  // ─── Pensions-rad: visa att vi faktiskt räknar in den ────────────────────────
  const pensionHtml = salary > 0 ? `
    <div class="ob-rec-pension">
      Vi räknar in din <strong>allmänna pension</strong> (~${kr(allmanMonthly)} kr/mån brutto vid ${retireAge})
      ${tjpContrib > 0 ? `och <strong>tjänstepension</strong> (~${kr(tjpContrib)} kr/mån avsätts, antaget ${avtal.toUpperCase()})` : ""}
      utöver ditt egna sparande. Justera avtal och belopp i kalkylatorn.
    </div>` : `
    <div class="ob-rec-pension">
      Ingen lön angiven — då räknar vi utan allmän/tjänstepension. Lägg till lön i kalkylatorn för en mindre pessimistisk bild.
    </div>`;

  el.innerHTML = `
    <p class="ob-sublead">Baserat på dina siffror — vi kör kalkylatorn åt dig.</p>
    <div class="ob-rec-holds ${holds >= 80 ? "good" : holds >= 50 ? "mid" : "low"}">
      <span class="ob-rec-holds-num">${holds}%</span>
      <span class="ob-rec-holds-label">sannolikhet att pengarna räcker livet ut<br>vid uttag från ${retireAge} år</span>
    </div>
    ${messageHtml}
    ${pensionHtml}
    <p class="ob-rec-footer">Du kan finjustera alla siffror — lön, avtal, allokering — i kalkylatorn efteråt.</p>
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

  $ob("obAge")?.addEventListener("input", e => {
    $ob("obAgeVal").textContent = `${e.target.value} år`;
    answers.age = +e.target.value;
  });
  $ob("obRetire")?.addEventListener("input", e => {
    $ob("obRetireVal").textContent = `${e.target.value} år`;
    answers.retireAge = +e.target.value;
  });
  $ob("obSalary")?.addEventListener("input", e => {
    $ob("obSalaryVal").textContent = `${(+e.target.value).toLocaleString("sv-SE").replace(/,/g," ")} kr`;
    answers.salary = +e.target.value;
  });
  $ob("obNeed")?.addEventListener("input", e => {
    $ob("obNeedVal").textContent = `${(+e.target.value).toLocaleString("sv-SE").replace(/,/g," ")} kr/mån`;
    answers.needPerMonth = +e.target.value;
  });

  answers.age          = +$ob("obAge").value;
  answers.retireAge    = +$ob("obRetire").value;
  answers.salary       = +($ob("obSalary")?.value || 40000);
  answers.needPerMonth = +($ob("obNeed")?.value || 30000);

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
      setObActive(false);
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
    setObActive(false);
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
  const salEl = $ob("obSalary"), needEl = $ob("obNeed");
  if (salEl)  { salEl.value = 40000;  $ob("obSalaryVal").textContent = "40 000 kr"; }
  if (needEl) { needEl.value = 30000; $ob("obNeedVal").textContent = "30 000 kr/mån"; }
  const goalsEl = $ob("obGoals");
  if (goalsEl) goalsEl.value = "";
  // Default-svar som setupListeners normalt sätter
  answers.age = 35;
  answers.retireAge = 55;
  answers.salary = 40000;
  answers.needPerMonth = 30000;
}

// ─── Visa igen (från hero-knapp eller reset-knapp) ───────────────────────────
function showOnboarding() {
  localStorage.removeItem("lugn_onboarding_done");
  const overlay = $ob("obOverlay");
  if (!overlay) return;
  if (!_listenersAttached) { setupListeners(); _listenersAttached = true; }
  resetOnboardingState();
  overlay.style.display = "flex";
  setObActive(true);
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
