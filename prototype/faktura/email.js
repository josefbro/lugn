/* ════════════════════════════════════════════════════════════════════════
   Faktura — e-postutskick
   Två vägar:
     1) mailto  — öppnar kundens e-postklient med ifylld text; PDF laddas ner
                  så att den kan bifogas. Funkar direkt, ingen registrering.
     2) EmailJS — helautomatiskt utskick med PDF som bilaga (kräver konto +
                  nycklar i inställningarna).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const C = () => Faktura.Compute;

  /* ── Standardtexter ───────────────────────────────────────────────────── */
  function subject(inv, company) {
    const co = company ? company.name : "";
    const no = inv.number || "utkast";
    return "Faktura " + no + (co ? " från " + co : "");
  }

  function body(inv, company, customer) {
    const comp = C().compute(inv);
    const greetingName =
      (customer && (customer.reference || customer.name)) || "";
    const lines = [];
    lines.push("Hej" + (greetingName ? " " + firstWord(greetingName) : "") + ",");
    lines.push("");
    lines.push(
      "Här kommer faktura " +
        (inv.number || "") +
        " på " +
        C().money(comp.total, inv.currency || "SEK") +
        "."
    );
    lines.push("");
    lines.push("Fakturadatum:   " + inv.invoiceDate);
    lines.push("Förfallodatum:  " + inv.dueDate);
    if (company && company.bankgiro) lines.push("Bankgiro:       " + company.bankgiro);
    if (company && company.plusgiro) lines.push("Plusgiro:       " + company.plusgiro);
    if (company && company.iban) lines.push("IBAN:           " + company.iban);
    lines.push("Ange vid betalning: " + (inv.number || "fakturanummer"));
    lines.push("");
    if (inv.message) {
      lines.push(inv.message);
      lines.push("");
    }
    lines.push("Fakturan bifogas som PDF.");
    lines.push("");
    lines.push("Vänliga hälsningar,");
    if (company) {
      if (inv.ourReference) lines.push(inv.ourReference);
      lines.push(company.name || "");
      if (company.email) lines.push(company.email);
      if (company.phone) lines.push(company.phone);
    }
    return lines.join("\n");
  }

  function firstWord(s) {
    return String(s).trim().split(/\s+/)[0];
  }

  /* ── mailto ───────────────────────────────────────────────────────────── */
  /* Laddar ner PDF:en och öppnar e-postklienten med förifylld text. */
  function sendMailto(inv, company, customer) {
    // 1) Ladda ner PDF så användaren kan bifoga den.
    try {
      Faktura.Pdf.download(inv, company, customer);
    } catch (e) {
      console.warn("PDF kunde inte skapas:", e);
    }
    // 2) Öppna mailto.
    const to = customer && customer.email ? customer.email : "";
    const url =
      "mailto:" +
      encodeURIComponent(to) +
      "?subject=" +
      encodeURIComponent(subject(inv, company)) +
      "&body=" +
      encodeURIComponent(body(inv, company, customer));
    window.location.href = url;
    return { method: "mailto", note: "PDF nedladdad — bifoga den i mejlet som öppnades." };
  }

  /* ── EmailJS ──────────────────────────────────────────────────────────── */
  function loadEmailJS() {
    return new Promise((resolve, reject) => {
      if (window.emailjs) return resolve(window.emailjs);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload = () => resolve(window.emailjs);
      s.onerror = () => reject(new Error("Kunde inte ladda EmailJS-biblioteket."));
      document.head.appendChild(s);
    });
  }

  function emailjsConfigured() {
    const e = Faktura.Store.getState().settings.emailjs;
    return !!(e && e.publicKey && e.serviceId && e.templateId);
  }

  /*
    Skickar via EmailJS. Förväntad EmailJS-mall (template) bör innehålla
    variabler som: {{to_email}}, {{subject}}, {{message}}, {{from_name}},
    samt en bilaga som mappas mot variabeln "content" (base64) via
    "Attachments → Variable Attachment".
  */
  async function sendEmailJS(inv, company, customer) {
    const cfg = Faktura.Store.getState().settings.emailjs;
    if (!emailjsConfigured()) throw new Error("EmailJS är inte konfigurerat i Inställningar.");
    if (!customer || !customer.email) throw new Error("Kunden saknar e-postadress.");

    const emailjs = await loadEmailJS();
    emailjs.init({ publicKey: cfg.publicKey });

    const pdfB64 = Faktura.Pdf.base64(inv, company, customer);
    const params = {
      to_email: customer.email,
      to_name: customer.name || "",
      from_name: company ? company.name : "",
      reply_to: company ? company.email : "",
      subject: subject(inv, company),
      message: body(inv, company, customer),
      invoice_number: inv.number || "",
      amount: C().money(C().compute(inv).total, inv.currency || "SEK"),
      due_date: inv.dueDate || "",
      // Bilaga: koppla denna variabel som "Variable Attachment" i mallen.
      content: pdfB64,
      filename: Faktura.Pdf.filename(inv, company),
    };

    const res = await emailjs.send(cfg.serviceId, cfg.templateId, params);
    return { method: "emailjs", status: res.status, text: res.text };
  }

  Faktura.Email = {
    subject,
    body,
    sendMailto,
    sendEmailJS,
    emailjsConfigured,
  };
})();
