/* ════════════════════════════════════════════════════════════════════════
   Faktura — datalager
   All state, persistens (localStorage), CRUD samt JSON-export/import.
   Fristående modul i Lugn-repot. Ingen build, vanilla JS.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});

  const LS_KEY = "faktura.data.v1";

  /* ── ID-generator ─────────────────────────────────────────────────────── */
  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    const time = Date.now().toString(36);
    return (prefix || "id") + "_" + time + rand;
  }

  /* ── Default-state ────────────────────────────────────────────────────── */
  function emptyState() {
    return {
      version: 1,
      activeCompanyId: null,
      companies: [],
      customers: [],
      invoices: [],
      expenses: [],
      settings: {
        emailjs: { publicKey: "", serviceId: "", templateId: "" },
        drive: { clientId: "", fileId: "", connectedEmail: "", autoSync: false },
      },
    };
  }

  /* ── Fabriker ─────────────────────────────────────────────────────────── */
  function newCompany(over) {
    return Object.assign(
      {
        id: uid("co"),
        name: "",
        form: "ab", // ab | enskild | hb | kb | ekforening | other
        orgnr: "",
        sate: "", // styrelsens säte (kommun) — obligatoriskt för AB
        vatNumber: "", // momsregistreringsnummer, t.ex. SE556677889901
        fskatt: true, // godkänd för F-skatt
        address: { line1: "", line2: "", zip: "", city: "", country: "Sverige" },
        email: "",
        phone: "",
        website: "",
        bankgiro: "",
        plusgiro: "",
        iban: "",
        bic: "",
        logo: "", // data-URL (base64)
        currency: "SEK",
        defaultTermsDays: 30,
        defaultVatRate: 0.25,
        lateInterestText:
          "Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen (referensränta + 8 procentenheter).",
        invoicePrefix: "",
        nextInvoiceNo: 1,
        footerNote: "",
      },
      over || {}
    );
  }

  function newCustomer(over) {
    return Object.assign(
      {
        id: uid("cu"),
        companyId: null, // ägs av ett säljarbolag
        type: "company", // company | private
        name: "",
        orgnr: "", // org.nr eller personnr
        vatNumber: "", // köparens momsnr (EU-handel)
        countryCode: "SE",
        address: { line1: "", line2: "", zip: "", city: "", country: "Sverige" },
        email: "",
        reference: "", // deras referens (attesterar)
        notes: "",
        kyc: newKyc(),
      },
      over || {}
    );
  }

  function newKyc() {
    return {
      // Vanlig kundkontroll
      orgnrVerified: false, // org.nr kontrollerat mot register
      fskattChecked: false, // F-skatt verifierad
      fskattDate: "",
      vatChecked: false, // momsnr kontrollerat (VIES vid EU)
      vatDate: "",
      creditChecked: false, // kreditkontroll gjord
      creditDate: "",
      creditLimit: 0, // beviljad kreditgräns
      // Kundkännedom / AML (penningtvättslagen — för verksamhetsutövare)
      beneficialOwner: "", // verklig huvudman
      pep: false, // person i politiskt utsatt ställning
      sanctionsChecked: false, // sanktionslistkontroll
      sanctionsDate: "",
      idMethod: "", // metod för ID-kontroll (BankID, pass ...)
      idDate: "",
      riskLevel: "low", // low | medium | high
      purpose: "", // affärsrelationens syfte
      completed: false, // kundkännedom slutförd
      completedDate: "",
    };
  }

  function newLine(over) {
    return Object.assign(
      {
        id: uid("ln"),
        description: "",
        quantity: 1,
        unit: "st", // st, tim, dag, kg, m, månad ...
        unitPrice: 0,
        vatRate: 0.25, // 0.25 | 0.12 | 0.06 | 0
        discountPct: 0,
      },
      over || {}
    );
  }

  function newInvoice(company, over) {
    const co = company || {};
    const today = todayISO();
    return Object.assign(
      {
        id: uid("inv"),
        companyId: co.id || null,
        customerId: null,
        docType: "faktura", // faktura | kreditfaktura | proforma | paminnelse
        number: "", // tilldelas när fakturan bokförs/skickas
        status: "draft", // draft | sent | paid
        invoiceDate: today,
        supplyDate: today, // datum då vara/tjänst tillhandahölls
        termsDays: co.defaultTermsDays != null ? co.defaultTermsDays : 30,
        dueDate: addDaysISO(today, co.defaultTermsDays != null ? co.defaultTermsDays : 30),
        currency: co.currency || "SEK",
        yourReference: "", // mottagarens referens
        ourReference: "", // avsändarens referens
        orderRef: "", // hänvisning till beställning/offert
        deliveryTerms: "",
        lines: [newLine({ vatRate: co.defaultVatRate != null ? co.defaultVatRate : 0.25 })],
        reverseCharge: false, // omvänd skattskyldighet
        vatExempt: false, // momsbefriad
        vatExemptReason: "", // hänvisning till bestämmelse
        roundTotal: true, // öresavrundning till hel krona
        message: "", // meddelande till kund
        createdAt: new Date().toISOString(),
        creditOf: null, // för kreditfaktura: id till ursprungsfaktura
      },
      over || {}
    );
  }

  function newExpense(over) {
    return Object.assign(
      {
        id: uid("exp"),
        companyId: null,
        date: todayISO(),
        supplier: "", // leverantör
        description: "",
        net: 0, // belopp exkl moms
        vatRate: 0.25, // ingående moms
        account: "6000", // BAS-konto (kostnadskategori)
        paid: false,
        paymentDate: "",
      },
      over || {}
    );
  }

  /* ── Datumhjälp (ISO YYYY-MM-DD) ──────────────────────────────────────── */
  function todayISO() {
    const d = new Date();
    return isoFromDate(d);
  }
  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function addDaysISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    return isoFromDate(d);
  }

  /* ── State (singleton i minnet) ───────────────────────────────────────── */
  let state = emptyState();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = migrate(parsed);
      }
    } catch (e) {
      console.warn("Kunde inte läsa sparad data:", e);
      state = emptyState();
    }
    return state;
  }

  function migrate(s) {
    // Slå ihop med default så framtida fält finns även i gammal data.
    const base = emptyState();
    const merged = Object.assign(base, s || {});
    merged.settings = Object.assign(base.settings, s.settings || {});
    merged.settings.emailjs = Object.assign(base.settings.emailjs, (s.settings || {}).emailjs || {});
    merged.settings.drive = Object.assign(base.settings.drive, (s.settings || {}).drive || {});
    // Bakåtfyll KYC på äldre kunder
    (merged.customers || []).forEach((c) => {
      c.kyc = Object.assign(newKyc(), c.kyc || {});
    });
    return merged;
  }

  let saveTimer = null;
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Kunde inte spara data:", e);
    }
    // Notifiera ev. Drive-synk (debounced).
    if (Faktura.Drive && state.settings.drive.autoSync && state.settings.drive.connectedEmail) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => Faktura.Drive.syncUp(true), 2500);
    }
    window.dispatchEvent(new CustomEvent("faktura:saved"));
  }

  function getState() {
    return state;
  }
  function replaceState(next) {
    state = migrate(next);
    save();
    return state;
  }

  /* ── Bolag ────────────────────────────────────────────────────────────── */
  function listCompanies() {
    return state.companies.slice();
  }
  function getCompany(id) {
    return state.companies.find((c) => c.id === id) || null;
  }
  function getActiveCompany() {
    return getCompany(state.activeCompanyId) || state.companies[0] || null;
  }
  function setActiveCompany(id) {
    state.activeCompanyId = id;
    save();
  }
  function upsertCompany(company) {
    const idx = state.companies.findIndex((c) => c.id === company.id);
    if (idx >= 0) state.companies[idx] = company;
    else state.companies.push(company);
    if (!state.activeCompanyId) state.activeCompanyId = company.id;
    save();
    return company;
  }
  function deleteCompany(id) {
    state.companies = state.companies.filter((c) => c.id !== id);
    state.customers = state.customers.filter((c) => c.companyId !== id);
    state.invoices = state.invoices.filter((i) => i.companyId !== id);
    if (state.activeCompanyId === id)
      state.activeCompanyId = state.companies[0] ? state.companies[0].id : null;
    save();
  }

  /* ── Kunder ───────────────────────────────────────────────────────────── */
  function listCustomers(companyId) {
    return state.customers.filter((c) => !companyId || c.companyId === companyId);
  }
  function getCustomer(id) {
    return state.customers.find((c) => c.id === id) || null;
  }
  function upsertCustomer(customer) {
    const idx = state.customers.findIndex((c) => c.id === customer.id);
    if (idx >= 0) state.customers[idx] = customer;
    else state.customers.push(customer);
    save();
    return customer;
  }
  function deleteCustomer(id) {
    state.customers = state.customers.filter((c) => c.id !== id);
    save();
  }

  /* ── Fakturor ─────────────────────────────────────────────────────────── */
  function listInvoices(companyId) {
    return state.invoices
      .filter((i) => !companyId || i.companyId === companyId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  function getInvoice(id) {
    return state.invoices.find((i) => i.id === id) || null;
  }
  function upsertInvoice(inv) {
    const idx = state.invoices.findIndex((i) => i.id === inv.id);
    if (idx >= 0) state.invoices[idx] = inv;
    else state.invoices.push(inv);
    save();
    return inv;
  }
  function deleteInvoice(id) {
    state.invoices = state.invoices.filter((i) => i.id !== id);
    save();
  }

  /* Tilldela nästa fakturanummer i obruten svit för bolaget. */
  function assignNumber(inv) {
    const co = getCompany(inv.companyId);
    if (!co) return inv;
    if (inv.number) return inv; // redan tilldelat
    const n = co.nextInvoiceNo || 1;
    inv.number = (co.invoicePrefix || "") + String(n);
    co.nextInvoiceNo = n + 1;
    upsertCompany(co);
    upsertInvoice(inv);
    return inv;
  }

  /* ── Utgifter (leverantörsfakturor / kostnader) ──────────────────────── */
  function listExpenses(companyId) {
    return state.expenses
      .filter((e) => !companyId || e.companyId === companyId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  function getExpense(id) {
    return state.expenses.find((e) => e.id === id) || null;
  }
  function upsertExpense(exp) {
    const idx = state.expenses.findIndex((e) => e.id === exp.id);
    if (idx >= 0) state.expenses[idx] = exp;
    else state.expenses.push(exp);
    save();
    return exp;
  }
  function deleteExpense(id) {
    state.expenses = state.expenses.filter((e) => e.id !== id);
    save();
  }

  /* ── Export / import ──────────────────────────────────────────────────── */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(text, merge) {
    const parsed = JSON.parse(text);
    if (merge) {
      // Slå ihop listor på id (importerad data vinner).
      const byId = (arr) => {
        const m = {};
        arr.forEach((x) => (m[x.id] = x));
        return m;
      };
      ["companies", "customers", "invoices", "expenses"].forEach((k) => {
        const cur = byId(state[k]);
        (parsed[k] || []).forEach((x) => (cur[x.id] = x));
        state[k] = Object.values(cur);
      });
    } else {
      state = migrate(parsed);
    }
    save();
    return state;
  }

  /* ── Publikt API ──────────────────────────────────────────────────────── */
  Faktura.Store = {
    LS_KEY,
    uid,
    load,
    save,
    getState,
    replaceState,
    // fabriker
    newCompany,
    newCustomer,
    newLine,
    newInvoice,
    newExpense,
    // datum
    todayISO,
    addDaysISO,
    isoFromDate,
    // bolag
    listCompanies,
    getCompany,
    getActiveCompany,
    setActiveCompany,
    upsertCompany,
    deleteCompany,
    // kunder
    listCustomers,
    getCustomer,
    upsertCustomer,
    deleteCustomer,
    // fakturor
    listInvoices,
    getInvoice,
    upsertInvoice,
    deleteInvoice,
    assignNumber,
    // utgifter
    listExpenses,
    getExpense,
    upsertExpense,
    deleteExpense,
    // i/o
    exportJSON,
    importJSON,
  };
})();
