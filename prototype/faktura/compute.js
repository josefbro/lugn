/* ════════════════════════════════════════════════════════════════════════
   Faktura — beräkningar, formattering & laglighetsvalidering
   Moms (25/12/6/0 %), beskattningsunderlag per momssats, öresavrundning,
   förfallodatum samt en checklista mot bokföringslagens formkrav.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});

  /* ── Avrundning (round half away from zero, 2 dec) ────────────────────── */
  function round2(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  /* Öresavrundning av slutsumma till hel krona (avrunda 0,5 uppåt). */
  function roundToWhole(x) {
    return Math.round(x + Number.EPSILON);
  }

  /* ── Formattering (sv-SE) ─────────────────────────────────────────────── */
  const moneyFmtCache = {};
  function money(x, currency) {
    const cur = currency || "SEK";
    if (!moneyFmtCache[cur]) {
      moneyFmtCache[cur] = new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return moneyFmtCache[cur].format(x || 0);
  }
  function num(x, dec) {
    return new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: dec == null ? 2 : dec,
      maximumFractionDigits: dec == null ? 2 : dec,
    }).format(x || 0);
  }
  function pct(rate) {
    return num(rate * 100, rate * 100 % 1 === 0 ? 0 : 1) + " %";
  }
  function dateLong(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso + "T00:00:00");
      return new Intl.DateTimeFormat("sv-SE", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(d);
    } catch (e) {
      return iso;
    }
  }

  /* ── Kärnberäkning av en faktura ──────────────────────────────────────── */
  /*
    Returnerar:
      lines: [{...line, net, vatRate, vat}]   (net = rad exkl moms efter rabatt)
      vatGroups: [{rate, base, vat}]          (beskattningsunderlag + momsbelopp per sats)
      net, vat, gross, rounding, total
  */
  function compute(inv) {
    const reverse = !!inv.reverseCharge || !!inv.vatExempt;
    const lines = (inv.lines || []).map((l) => {
      const qty = toNum(l.quantity);
      const price = toNum(l.unitPrice);
      const disc = toNum(l.discountPct) / 100;
      const gross = qty * price;
      const net = round2(gross * (1 - disc));
      const rate = reverse ? 0 : toNum(l.vatRate);
      return Object.assign({}, l, { net: net, effRate: rate, vat: 0 });
    });

    // Gruppera beskattningsunderlag per momssats.
    const groupMap = {};
    lines.forEach((l) => {
      const key = String(l.effRate);
      if (!groupMap[key]) groupMap[key] = { rate: l.effRate, base: 0, vat: 0 };
      groupMap[key].base += l.net;
    });

    const vatGroups = Object.keys(groupMap)
      .map((k) => groupMap[k])
      .sort((a, b) => b.rate - a.rate);
    vatGroups.forEach((g) => {
      g.base = round2(g.base);
      g.vat = round2(g.base * g.rate);
    });
    // Fördela momsbelopp tillbaka till rader (för specifikation).
    lines.forEach((l) => {
      l.vat = round2(l.net * l.effRate);
    });

    const net = round2(vatGroups.reduce((s, g) => s + g.base, 0));
    const vat = round2(vatGroups.reduce((s, g) => s + g.vat, 0));
    let gross = round2(net + vat);

    let rounding = 0;
    let total = gross;
    if (inv.roundTotal) {
      total = roundToWhole(gross);
      rounding = round2(total - gross);
    }

    return {
      lines: lines,
      vatGroups: vatGroups,
      net: net,
      vat: vat,
      gross: gross,
      rounding: rounding,
      total: total,
      reverseCharge: !!inv.reverseCharge,
      vatExempt: !!inv.vatExempt,
    };
  }

  function toNum(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    if (x == null) return 0;
    const n = parseFloat(String(x).replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  /* ── Förfallodatum ────────────────────────────────────────────────────── */
  function dueDate(invoiceDate, termsDays) {
    return Faktura.Store.addDaysISO(invoiceDate, termsDays);
  }

  /* Förhandsvisa nästa nummer utan att tilldela. */
  function previewNumber(company) {
    if (!company) return "—";
    return (company.invoicePrefix || "") + String(company.nextInvoiceNo || 1);
  }

  /* ── Laglighetscheck (bokföringslagen / mervärdesskattelagen) ──────────── */
  /*
    Returnerar lista med { level: 'error'|'warn', field, message }.
    error = obligatoriskt formkrav saknas. warn = rekommenderas.
  */
  function validate(inv, company, customer) {
    const out = [];
    const E = (field, message) => out.push({ level: "error", field, message });
    const W = (field, message) => out.push({ level: "warn", field, message });

    const c = compute(inv);

    // — Säljare —
    if (!company) {
      E("company", "Inget säljarbolag är valt.");
      return out;
    }
    if (!company.name) E("company.name", "Säljarens/bolagets namn saknas.");
    if (!hasAddress(company.address)) E("company.address", "Säljarens adress saknas.");
    if (!company.vatNumber && !inv.vatExempt)
      E("company.vatNumber", "Säljarens momsregistreringsnummer saknas.");

    if (company.form === "ab") {
      if (!company.orgnr) E("company.orgnr", "Aktiebolagets organisationsnummer saknas.");
      if (!company.sate) E("company.sate", "Aktiebolagets säte (kommun) saknas.");
    } else if (!company.orgnr) {
      W("company.orgnr", "Organisations-/personnummer för säljaren saknas.");
    }

    // — Köpare —
    if (!customer) {
      E("customer", "Ingen kund är vald.");
    } else {
      if (!customer.name) E("customer.name", "Köparens namn saknas.");
      if (!hasAddress(customer.address)) E("customer.address", "Köparens adress saknas.");
      if (customer.countryCode && customer.countryCode !== "SE" && !customer.vatNumber)
        W("customer.vatNumber", "Köparens momsnummer saknas (krävs ofta vid EU-handel).");
    }

    // — Faktura —
    if (!inv.invoiceDate) E("invoiceDate", "Fakturadatum saknas.");
    if (!inv.dueDate) E("dueDate", "Förfallodatum saknas.");
    if (!inv.supplyDate) W("supplyDate", "Datum då varan/tjänsten såldes saknas.");
    if (!inv.number) W("number", "Fakturanummer tilldelas när fakturan markeras som skickad.");

    const validLines = (inv.lines || []).filter((l) => l.description && toNum(l.quantity) !== 0);
    if (validLines.length === 0)
      E("lines", "Fakturan saknar specificerade rader (art och omfattning).");
    (inv.lines || []).forEach((l, i) => {
      if (l.description && !l.unit) W("lines." + i, "Rad " + (i + 1) + ": enhet saknas.");
    });

    // — Moms —
    if (inv.vatExempt && !inv.vatExemptReason)
      E("vatExemptReason", "Vid momsbefrielse krävs hänvisning till relevant bestämmelse.");
    if (inv.reverseCharge && customer && customer.countryCode === "SE" && !inv.vatExemptReason)
      W("vatExemptReason", "Ange grund för omvänd skattskyldighet (t.ex. byggtjänster).");

    // — Rekommenderat —
    if (!company.bankgiro && !company.plusgiro && !company.iban)
      W("payment", "Inget bankgiro/plusgiro/IBAN angivet — kunden vet inte vart de ska betala.");
    if (!inv.yourReference && customer && customer.type === "company")
      W("yourReference", "Mottagarens referens saknas (underlättar hos större kunder).");

    return out;
  }

  function hasAddress(a) {
    return !!(a && (a.line1 || a.zip || a.city));
  }

  function addressLines(a) {
    if (!a) return [];
    const out = [];
    if (a.line1) out.push(a.line1);
    if (a.line2) out.push(a.line2);
    const cityLine = [a.zip, a.city].filter(Boolean).join(" ");
    if (cityLine) out.push(cityLine);
    if (a.country && a.country !== "Sverige") out.push(a.country);
    return out;
  }

  /* ── Identitets- & KYC-validering ─────────────────────────────────────── */
  function digitsOnly(s) {
    return String(s || "").replace(/\D/g, "");
  }

  // Luhn (mod 10) — används för svenska org.nr och personnr.
  function luhn(str) {
    const d = digitsOnly(str);
    if (!d) return false;
    let sum = 0,
      alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = parseInt(d[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  // Returnerar { valid, msg } för svenskt organisationsnummer.
  function validateOrgnr(s) {
    let d = digitsOnly(s);
    if (!d) return { valid: null, msg: "" };
    if (d.length === 12) d = d.slice(2); // ta bort sekel/16
    if (d.length !== 10) return { valid: false, msg: "Org.nr ska ha 10 siffror." };
    if (!luhn(d)) return { valid: false, msg: "Kontrollsiffran stämmer inte." };
    return { valid: true, msg: "Giltigt format & kontrollsiffra." };
  }

  function validatePersonnr(s) {
    let d = digitsOnly(s);
    if (!d) return { valid: null, msg: "" };
    if (d.length === 12) d = d.slice(2);
    if (d.length !== 10) return { valid: false, msg: "Personnr ska ha 10 siffror (ÅÅMMDD-XXXX)." };
    if (!luhn(d)) return { valid: false, msg: "Kontrollsiffran stämmer inte." };
    return { valid: true, msg: "Giltigt format & kontrollsiffra." };
  }

  function validateIdNumber(s, type) {
    return type === "private" ? validatePersonnr(s) : validateOrgnr(s);
  }

  // Momsregistreringsnummer. Strikt för SE, lättare för övriga EU.
  function validateVat(s, countryCode) {
    const raw = String(s || "").toUpperCase().replace(/\s/g, "");
    if (!raw) return { valid: null, msg: "" };
    const cc = (raw.slice(0, 2).match(/[A-Z]{2}/) ? raw.slice(0, 2) : countryCode || "SE").toUpperCase();
    if (cc === "SE") {
      const m = raw.replace(/^SE/, "");
      if (!/^\d{12}$/.test(m)) return { valid: false, msg: "Svenskt momsnr: SE + 12 siffror (slutar 01)." };
      if (m.slice(10) !== "01") return { valid: false, msg: "Svenskt momsnr ska sluta på 01." };
      if (!luhn(m.slice(0, 10))) return { valid: false, msg: "Kontrollsiffran i org.nr-delen stämmer inte." };
      return { valid: true, msg: "Giltigt svenskt momsnr-format." };
    }
    // Övriga EU: grundläggande formatkontroll (validera mot VIES manuellt).
    if (!/^[A-Z]{2}[0-9A-Z]{2,12}$/.test(raw))
      return { valid: false, msg: "EU-momsnr: landskod + 2–12 tecken." };
    return { valid: true, msg: "Formatet ser rimligt ut — verifiera i VIES." };
  }

  // Sammanfattande KYC-status för en kund.
  function kycStatus(customer) {
    const k = (customer && customer.kyc) || {};
    const id = validateIdNumber(customer ? customer.orgnr : "", customer ? customer.type : "company");
    const vat = validateVat(customer ? customer.vatNumber : "", customer ? customer.countryCode : "SE");
    const checks = [
      k.orgnrVerified,
      k.fskattChecked,
      customer && customer.countryCode !== "SE" ? k.vatChecked : true,
      k.creditChecked,
    ];
    const done = checks.filter(Boolean).length;
    let state = "none";
    if (k.completed) state = "complete";
    else if (done > 0 || k.sanctionsChecked) state = "partial";
    return { state: state, done: done, total: checks.length, idValid: id.valid, vatValid: vat.valid };
  }

  /* ── Publikt API ──────────────────────────────────────────────────────── */
  Faktura.Compute = {
    luhn,
    validateOrgnr,
    validatePersonnr,
    validateIdNumber,
    validateVat,
    kycStatus,
    round2,
    roundToWhole,
    toNum,
    money,
    num,
    pct,
    dateLong,
    compute,
    dueDate,
    previewNumber,
    validate,
    addressLines,
    hasAddress,
  };
})();
