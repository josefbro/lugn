/* ════════════════════════════════════════════════════════════════════════
   Faktura — UI / app-logik
   Hash-router, vyer, formulär, live-preview, toast & modaler. Vanilla JS.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const S = () => Faktura.Store;
  const C = () => Faktura.Compute;

  const app = () => document.getElementById("app");

  /* ── Småhjälpare ──────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(x, cur) {
    return C().money(x, cur);
  }
  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (o[k] == null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = val;
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */
  function toast(msg, kind) {
    const wrap = document.getElementById("toasts");
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, kind === "err" ? 5200 : 3000);
  }

  /* ── Modal ────────────────────────────────────────────────────────────── */
  let modalEl = null;
  function openModal(html) {
    closeModal();
    modalEl = document.createElement("div");
    modalEl.className = "modal-back";
    modalEl.innerHTML = '<div class="modal">' + html + "</div>";
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
    document.body.appendChild(modalEl);
    return modalEl.querySelector(".modal");
  }
  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }
  Faktura._closeModal = closeModal;

  /* ── Router ───────────────────────────────────────────────────────────── */
  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, "");
    const parts = hash.split("/");
    return { name: parts[0] || "", id: parts[1] || null };
  }

  function render() {
    const r = currentRoute();
    syncCompanySwitch();
    setActiveNav(r.name);

    const companies = S().listCompanies();
    if (companies.length === 0 && r.name !== "companies" && r.name !== "settings") {
      app().innerHTML = viewWelcome();
      return;
    }

    switch (r.name) {
      case "":
        app().innerHTML = viewDashboard();
        break;
      case "invoices":
        app().innerHTML = viewInvoices();
        break;
      case "invoice":
        renderEditor(r.id);
        break;
      case "customers":
        app().innerHTML = viewCustomers();
        break;
      case "bokforing":
        app().innerHTML = viewBokforing();
        break;
      case "companies":
        app().innerHTML = viewCompanies();
        break;
      case "settings":
        app().innerHTML = viewSettings();
        break;
      default:
        location.hash = "#/";
    }
    window.scrollTo(0, 0);
  }

  function setActiveNav(name) {
    document.querySelectorAll("#nav a").forEach((a) => {
      a.classList.toggle("active", (a.getAttribute("data-route") || "") === name);
    });
  }

  function syncCompanySwitch() {
    const sel = document.getElementById("companySwitch");
    const companies = S().listCompanies();
    const active = S().getActiveCompany();
    if (companies.length === 0) {
      sel.style.display = "none";
      return;
    }
    sel.style.display = "";
    sel.innerHTML = companies
      .map(
        (c) =>
          '<option value="' +
          c.id +
          '"' +
          (active && c.id === active.id ? " selected" : "") +
          ">" +
          esc(c.name || "(namnlöst bolag)") +
          "</option>"
      )
      .join("");
  }

  /* ════════════════════════════════════════════════════════════════════
     VYER
     ════════════════════════════════════════════════════════════════════ */

  function viewWelcome() {
    return (
      '<div class="empty card">' +
      '<div class="big">🧾</div>' +
      "<h2>Välkommen till Lugn Faktura</h2>" +
      "<p>Skapa ditt första bolag för att börja fakturera. Du kan lägga till flera bolag och växla mellan dem när som helst.</p>" +
      '<div class="btn-row" style="justify-content:center">' +
      '<button class="btn btn-primary" data-action="new-company">+ Skapa bolag</button>' +
      '<button class="btn btn-ghost" data-action="seed-demo">Fyll i exempelbolag</button>' +
      "</div></div>"
    );
  }

  /* ── Dashboard ─────────────────────────────────────────────────────────── */
  function viewDashboard() {
    const co = S().getActiveCompany();
    const invoices = S().listInvoices(co ? co.id : null);
    const today = S().todayISO();

    let unpaid = 0,
      overdue = 0,
      paidThisYear = 0;
    const year = today.slice(0, 4);
    invoices.forEach((inv) => {
      const t = C().compute(inv).total;
      if (inv.status === "paid") {
        if ((inv.invoiceDate || "").slice(0, 4) === year) paidThisYear += t;
      } else if (inv.status === "sent") {
        unpaid += t;
        if (inv.dueDate && inv.dueDate < today) overdue += t;
      }
    });

    const recent = invoices.slice(0, 8);

    return (
      '<div class="page-head"><div><h1>Översikt</h1><p>' +
      esc(co ? co.name : "") +
      "</p></div>" +
      '<div class="btn-row"><button class="btn btn-primary" data-action="new-invoice">+ Ny faktura</button></div></div>' +
      '<div class="stats">' +
      stat("Fakturor totalt", invoices.length, false) +
      stat("Utestående", money(unpaid, co && co.currency), false) +
      stat("Varav förfallet", money(overdue, co && co.currency), overdue > 0) +
      stat("Betalt " + year, money(paidThisYear, co && co.currency), false) +
      "</div>" +
      '<div class="card"><h2>Senaste fakturor</h2>' +
      (recent.length ? invoiceTable(recent) : '<p class="muted">Inga fakturor ännu. Skapa din första!</p>') +
      "</div>"
    );
  }

  function stat(k, v, alert) {
    return (
      '<div class="stat' +
      (alert ? " alert" : "") +
      '"><div class="k">' +
      esc(k) +
      '</div><div class="v">' +
      esc(v) +
      "</div></div>"
    );
  }

  /* ── Fakturalista ──────────────────────────────────────────────────────── */
  function viewInvoices() {
    const co = S().getActiveCompany();
    const invoices = S().listInvoices(co ? co.id : null);
    return (
      '<div class="page-head"><div><h1>Fakturor</h1><p>' +
      invoices.length +
      " st</p></div>" +
      '<div class="btn-row"><button class="btn btn-primary" data-action="new-invoice">+ Ny faktura</button></div></div>' +
      '<div class="card">' +
      (invoices.length ? invoiceTable(invoices) : '<p class="muted">Inga fakturor ännu.</p>') +
      "</div>"
    );
  }

  function statusBadge(inv) {
    const today = S().todayISO();
    if (inv.status === "paid") return '<span class="badge paid">Betald</span>';
    if (inv.status === "sent") {
      if (inv.dueDate && inv.dueDate < today) return '<span class="badge overdue">Förfallen</span>';
      return '<span class="badge sent">Skickad</span>';
    }
    return '<span class="badge draft">Utkast</span>';
  }

  function invoiceTable(invoices) {
    const rows = invoices
      .map((inv) => {
        const cu = S().getCustomer(inv.customerId);
        const comp = C().compute(inv);
        return (
          '<tr data-open="' +
          inv.id +
          '" style="cursor:pointer">' +
          "<td><strong>" +
          esc(inv.number || "—") +
          "</strong></td>" +
          "<td>" +
          esc(cu ? cu.name : "(ingen kund)") +
          "</td>" +
          "<td>" +
          esc(inv.invoiceDate || "") +
          "</td>" +
          "<td>" +
          esc(inv.dueDate || "") +
          "</td>" +
          '<td class="num">' +
          esc(money(comp.total, inv.currency)) +
          "</td>" +
          "<td>" +
          statusBadge(inv) +
          "</td>" +
          '<td class="row-actions no-print">' +
          iconBtn("pdf", inv.id, "PDF", "📄") +
          iconBtn("email", inv.id, "Skicka", "✉️") +
          (inv.status !== "paid"
            ? iconBtn("mark-paid", inv.id, "Markera betald", "✓")
            : "") +
          iconBtn("del-invoice", inv.id, "Radera", "🗑") +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<table class="data"><thead><tr>' +
      "<th>Nr</th><th>Kund</th><th>Datum</th><th>Förfaller</th>" +
      '<th class="num">Belopp</th><th>Status</th><th></th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>"
    );
  }

  function iconBtn(action, id, title, glyph) {
    return (
      '<button class="btn btn-ghost btn-icon" data-action="' +
      action +
      '" data-id="' +
      id +
      '" title="' +
      esc(title) +
      '">' +
      glyph +
      "</button>"
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     BOKFÖRING
     ════════════════════════════════════════════════════════════════════ */
  let bokTab = "verifikationer";
  let bokFrom = null;
  let bokTo = null;

  function ensurePeriod() {
    if (!bokFrom || !bokTo) {
      const y = S().todayISO().slice(0, 4);
      bokFrom = y + "-01-01";
      bokTo = y + "-12-31";
    }
  }

  function viewBokforing() {
    ensurePeriod();
    const co = S().getActiveCompany();
    const cid = co ? co.id : null;
    const tabs = [
      ["verifikationer", "Verifikationer"],
      ["huvudbok", "Huvudbok"],
      ["bank", "Bank"],
      ["utgifter", "Utgifter"],
      ["lon", "Lön"],
      ["tillgangar", "Tillgångar"],
      ["rapporter", "Rapporter"],
      ["moms", "Momsrapport"],
      ["arsavslut", "Årsavslut"],
      ["export", "Export"],
      ["logg", "Logg"],
    ];
    const tabBtns = tabs
      .map(
        (t) =>
          '<button class="btn btn-sm ' +
          (bokTab === t[0] ? "btn-primary" : "btn-ghost") +
          '" data-action="bok-tab" data-id="' +
          t[0] +
          '">' +
          t[1] +
          "</button>"
      )
      .join("");

    let body = "";
    if (bokTab === "verifikationer") body = bokVerifikationer(cid);
    else if (bokTab === "huvudbok") body = bokHuvudbok(cid);
    else if (bokTab === "bank") body = bokBank(cid);
    else if (bokTab === "utgifter") body = bokUtgifter(cid);
    else if (bokTab === "lon") body = bokLon(cid);
    else if (bokTab === "tillgangar") body = bokTillgangar(cid);
    else if (bokTab === "rapporter") body = bokRapporter(cid);
    else if (bokTab === "moms") body = bokMoms(cid);
    else if (bokTab === "arsavslut") body = bokArsavslut(cid);
    else if (bokTab === "export") body = bokExport(cid);
    else if (bokTab === "logg") body = bokLogg(cid);

    const showPeriod = ["utgifter", "tillgangar", "bank", "logg"].indexOf(bokTab) < 0;

    return (
      '<div class="page-head"><div><h1>Bokföring</h1><p>Automatisk dubbel bokföring från dina fakturor och utgifter — underlag för Skatteverket.</p></div></div>' +
      '<div class="btn-row" style="margin-bottom:16px">' +
      tabBtns +
      "</div>" +
      (showPeriod ? periodBar() : "") +
      body
    );
  }

  function periodBar() {
    const y = parseInt(bokFrom.slice(0, 4), 10) || parseInt(S().todayISO().slice(0, 4), 10);
    return (
      '<div class="card" style="padding:14px 18px"><div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">' +
      '<div class="field" style="max-width:170px"><label>Från</label><input type="date" id="bokFrom" value="' +
      bokFrom +
      '"></div>' +
      '<div class="field" style="max-width:170px"><label>Till</label><input type="date" id="bokTo" value="' +
      bokTo +
      '"></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost btn-sm" data-action="bok-period" data-id="year">Hela ' +
      y +
      "</button>" +
      '<button class="btn btn-ghost btn-sm" data-action="bok-period" data-id="q1">Q1</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="bok-period" data-id="q2">Q2</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="bok-period" data-id="q3">Q3</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="bok-period" data-id="q4">Q4</button>' +
      "</div></div></div>"
    );
  }

  function bokVerifikationer(cid) {
    const vers = Faktura.Bok.verifications(cid, bokFrom, bokTo);
    const head =
      '<div class="page-head" style="margin-bottom:12px"><div></div><div class="btn-row"><button class="btn btn-primary" data-action="new-manual">+ Manuell verifikation</button></div></div>';
    if (!vers.length)
      return head + '<div class="card"><p class="muted">Inga bokförda händelser i perioden. Skicka en faktura, lägg till en utgift, lön eller manuell verifikation.</p></div>';
    const rows = vers
      .map((v) => {
        const lines = v.lines
          .map(
            (l) =>
              '<div style="display:grid;grid-template-columns:64px 1fr 110px 110px;gap:8px;font-size:.86rem;padding:2px 0">' +
              '<span class="muted">' +
              l.account +
              "</span><span>" +
              esc(Faktura.Bok.accountName(l.account)) +
              '</span><span class="num">' +
              (l.debit ? C().num(l.debit) : "") +
              '</span><span class="num">' +
              (l.credit ? C().num(l.credit) : "") +
              "</span></div>"
          )
          .join("");
        return (
          '<tr><td style="vertical-align:top"><strong>V' +
          v.no +
          '</strong><br><span class="muted small">' +
          esc(v.date) +
          "</span>" +
          (v.kind === "manual"
            ? '<br><button class="line-del" data-action="del-manual" data-id="' + v.source + '" title="Radera manuell verifikation">🗑</button>'
            : "") +
          "</td>" +
          "<td><strong>" +
          esc(v.text) +
          "</strong>" +
          '<div style="margin-top:6px;border-top:1px solid var(--line-soft);padding-top:4px">' +
          '<div style="display:grid;grid-template-columns:64px 1fr 110px 110px;gap:8px;font-size:.68rem;text-transform:uppercase;color:var(--ink-400);font-weight:700"><span>Konto</span><span></span><span class="num">Debet</span><span class="num">Kredit</span></div>' +
          lines +
          "</div></td></tr>"
        );
      })
      .join("");
    return (
      head +
      '<div class="card"><table class="data"><thead><tr><th style="width:90px">Ver</th><th>Bokföring</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>"
    );
  }

  function bokHuvudbok(cid) {
    const accounts = Faktura.Bok.ledger(cid, bokFrom, bokTo);
    if (!accounts.length)
      return '<div class="card"><p class="muted">Inga poster i perioden.</p></div>';
    const rows = accounts
      .map(
        (a) =>
          "<tr><td><strong>" +
          a.account +
          "</strong></td><td>" +
          esc(a.name) +
          '</td><td class="num">' +
          C().num(a.debit) +
          '</td><td class="num">' +
          C().num(a.credit) +
          '</td><td class="num"><strong>' +
          C().num(a.balance) +
          "</strong></td></tr>"
      )
      .join("");
    return (
      '<div class="card"><table class="data"><thead><tr><th>Konto</th><th>Namn</th><th class="num">Debet</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>"
    );
  }

  function bokUtgifter(cid) {
    const expenses = S().listExpenses(cid);
    const rows = expenses
      .map((e) => {
        const vat = C().round2(C().toNum(e.net) * C().toNum(e.vatRate));
        return (
          "<tr><td>" +
          esc(e.date) +
          "</td><td><strong>" +
          esc(e.supplier || "—") +
          "</strong><br><span class=\"muted small\">" +
          esc(e.description || "") +
          "</span></td><td>" +
          e.account +
          " " +
          esc(Faktura.Bok.accountName(e.account)) +
          '</td><td class="num">' +
          C().num(C().toNum(e.net)) +
          '</td><td class="num">' +
          C().num(vat) +
          "</td><td>" +
          (e.paid ? '<span class="badge paid">Betald</span>' : '<span class="badge draft">Obetald</span>') +
          '</td><td class="row-actions">' +
          iconBtn("edit-expense", e.id, "Redigera", "✏️") +
          iconBtn("del-expense", e.id, "Radera", "🗑") +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<div class="page-head" style="margin-bottom:12px"><div></div><div class="btn-row"><button class="btn btn-primary" data-action="new-expense">+ Ny utgift</button></div></div>' +
      '<div class="card">' +
      (expenses.length
        ? '<table class="data"><thead><tr><th>Datum</th><th>Leverantör</th><th>Konto</th><th class="num">Exkl moms</th><th class="num">Moms</th><th>Status</th><th></th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga utgifter ännu. Lägg till leverantörsfakturor och kostnader här så kommer ingående moms och resultatet med i rapporterna.</p>') +
      "</div>"
    );
  }

  function bokMoms(cid) {
    const r = Faktura.Bok.vatReport(cid, bokFrom, bokTo);
    const rr = Faktura.Bok.resultatrakning(cid, bokFrom, bokTo);
    const inc = { revenue: rr.revenue, costs: rr.costsTotal, result: rr.resultatForeSkatt };
    const box = (n, label, val, strong) =>
      "<tr" +
      (strong ? ' style="font-weight:700"' : "") +
      '><td class="muted" style="width:54px">' +
      (n ? n : "") +
      "</td><td>" +
      esc(label) +
      '</td><td class="num">' +
      C().num(val) +
      " kr</td></tr>";
    const payLabel = r.box49 >= 0 ? "Moms att betala" : "Moms att få tillbaka";
    return (
      '<div class="card"><h2>Momsrapport ' +
      esc(bokFrom) +
      " – " +
      esc(bokTo) +
      "</h2>" +
      '<p class="muted small">Belopp mappade mot Skatteverkets momsdeklaration. Kontrollera alltid mot din bokföring innan inlämning.</p>' +
      '<table class="data"><tbody>' +
      box("05", "Momspliktig försäljning (beskattningsunderlag)", r.box05) +
      (r.base12 ? box("", "  varav underlag 12 %", r.base12) : "") +
      (r.base6 ? box("", "  varav underlag 6 %", r.base6) : "") +
      box("41", "Försäljning omvänd skattskyldighet", r.box41) +
      box("42", "Övrig momsfri försäljning", r.box42) +
      box("10", "Utgående moms 25 %", r.box10) +
      box("11", "Utgående moms 12 %", r.box11) +
      box("12", "Utgående moms 6 %", r.box12) +
      box("", "Summa utgående moms", r.outVatTotal, true) +
      box("48", "Ingående moms att dra av", r.box48) +
      box("49", payLabel, Math.abs(r.box49), true) +
      "</tbody></table></div>" +
      '<div class="stats">' +
      stat("Intäkter (exkl moms)", C().money(inc.revenue, S().getActiveCompany() && S().getActiveCompany().currency)) +
      stat("Kostnader (exkl moms)", C().money(inc.costs)) +
      stat("Resultat", C().money(inc.result), inc.result < 0) +
      "</div>"
    );
  }

  function bokExport(cid) {
    const co = S().getActiveCompany();
    return (
      '<div class="card"><h2>Exportera bokföring</h2>' +
      '<p class="muted small">Period: <strong>' +
      esc(bokFrom) +
      " – " +
      esc(bokTo) +
      "</strong></p>" +
      '<div class="info"><strong>SIE4</strong> är det svenska standardformatet för bokföring. Filen kan importeras av din redovisningskonsult och av program som Fortnox, Visma, Bokio m.fl. — perfekt för att lämna över allt underlag.</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-primary" data-action="export-sie">⬇ Exportera SIE4-fil</button>' +
      '<button class="btn btn-ghost" data-action="export-csv">⬇ Exportera verifikationer (CSV)</button>' +
      "</div>" +
      '<p class="muted small" style="margin-top:14px">Tips: ' +
      (co ? "" : "välj ett bolag och ") +
      "se till att fakturor är markerade som <em>skickade</em> (de bokförs först då) och att betalningar/utgifter är registrerade.</p>" +
      "</div>"
    );
  }

  /* ── Bank: import & avstämning ────────────────────────────────────────── */
  function bokBank(cid) {
    const txs = S().listBankTx(cid);
    const open = txs.filter((t) => !t.matched).length;

    const rows = txs
      .map((tx) => {
        let actionCell;
        if (tx.matched) {
          actionCell =
            '<span class="badge paid">✓ ' +
            esc(tx.matched.label || tx.matched.type) +
            "</span> " +
            '<button class="btn btn-ghost btn-sm" data-action="bank-unmatch" data-id="' +
            tx.id +
            '">Ångra</button>';
        } else {
          const sugg = Faktura.Bank.suggestFor(tx)
            .map(
              (s) =>
                '<button class="btn btn-primary btn-sm" data-action="bank-match" data-id="' +
                tx.id +
                '" data-tgt="' +
                s.type +
                ":" +
                s.id +
                '">→ ' +
                esc(s.label) +
                "</button>"
            )
            .join(" ");
          const accSel =
            '<select data-bank-acc="' +
            tx.id +
            '" style="width:auto;max-width:230px;display:inline-block;padding:6px 8px;font-size:.84rem">' +
            accountOptions("") +
            "</select> " +
            '<button class="btn btn-ghost btn-sm" data-action="bank-categorize" data-id="' +
            tx.id +
            '">Kategorisera</button>';
          actionCell =
            (sugg ? sugg + "<br>" : "") +
            accSel +
            " " +
            iconBtn("del-banktx", tx.id, "Radera transaktion", "🗑");
        }
        return (
          "<tr><td>" +
          esc(tx.date) +
          "</td><td>" +
          esc(tx.text || "") +
          '</td><td class="num" style="font-weight:600;color:' +
          (tx.amount >= 0 ? "var(--ok)" : "var(--ink-900)") +
          '">' +
          C().num(tx.amount) +
          "</td><td>" +
          actionCell +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<div class="card"><h2>Importera kontoutdrag</h2>' +
      '<p class="muted small">Exportera CSV från din internetbank (SEB, Swedbank, Handelsbanken, Nordea m.fl.). Kolumner för datum, belopp och text hittas automatiskt; dubbletter hoppas över. Matcha inbetalningar mot öppna fakturor, utbetalningar mot obetalda utgifter — eller kategorisera direkt mot konto (verifikation mot 1930 skapas). Allt loggas i revisionsloggen.</p>' +
      '<div class="btn-row"><label class="btn btn-primary" style="cursor:pointer">⬆ Välj CSV-fil<input type="file" id="bankCsvInput" accept=".csv,text/csv,text/plain" style="display:none"></label></div>' +
      "</div>" +
      '<div class="card"><h2>Transaktioner' +
      (txs.length ? " (" + open + " omatchade av " + txs.length + ")" : "") +
      "</h2>" +
      (txs.length
        ? '<table class="data"><thead><tr><th>Datum</th><th>Text</th><th class="num">Belopp</th><th>Avstämning</th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga banktransaktioner importerade ännu.</p>') +
      "</div>"
    );
  }

  /* ── Revisionslogg ────────────────────────────────────────────────────── */
  function bokLogg() {
    const log = S().listAudit();
    const chainOk = S().verifyAuditChain();
    const rows = log
      .map(
        (e) =>
          '<tr><td class="muted small" style="white-space:nowrap">' +
          esc(e.ts.slice(0, 19).replace("T", " ")) +
          "</td><td><strong>" +
          esc(e.action) +
          "</strong></td><td>" +
          esc(e.details) +
          '</td><td class="muted small">' +
          esc(e.h) +
          "</td></tr>"
      )
      .join("");
    return (
      '<div class="card"><h2>Revisionslogg (behandlingshistorik)</h2>' +
      '<p class="muted small">Append-only logg över alla bokföringshändelser. Varje post bär föregående posts hash — om något ändras i efterhand bryts kedjan. Loggen ingår i JSON-exporten (säkerhetskopian).</p>' +
      (chainOk
        ? '<p class="compliance-ok">✓ Hash-kedjan är intakt (' + log.length + " poster).</p>"
        : '<p style="color:var(--err);font-weight:600">⚠ Hash-kedjan är BRUTEN — loggen kan ha manipulerats.</p>') +
      '<div class="btn-row" style="margin-bottom:12px"><button class="btn btn-ghost btn-sm" data-action="export-audit">⬇ Exportera logg (CSV)</button></div>' +
      (log.length
        ? '<table class="data"><thead><tr><th>Tidpunkt</th><th>Händelse</th><th>Detaljer</th><th>Hash</th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga händelser loggade ännu.</p>') +
      "</div>"
    );
  }

  /* ── Lön ──────────────────────────────────────────────────────────────── */
  function bokLon(cid) {
    const list = S()
      .listPayrolls(cid)
      .filter((p) => (!bokFrom || p.payDate >= bokFrom) && (!bokTo || p.payDate <= bokTo));
    const rows = list
      .map((p) => {
        const x = Faktura.Bok.payrollParts(p);
        return (
          "<tr><td>" +
          esc(p.period) +
          "</td><td><strong>" +
          esc(p.employee || "—") +
          '</strong></td><td class="num">' +
          C().num(x.gross) +
          '</td><td class="num">' +
          C().num(x.tax) +
          '</td><td class="num">' +
          C().num(x.ag) +
          '</td><td class="num"><strong>' +
          C().num(x.net) +
          "</strong></td><td>" +
          esc(p.payDate) +
          '</td><td class="row-actions">' +
          iconBtn("edit-payroll", p.id, "Redigera", "✏️") +
          iconBtn("del-payroll", p.id, "Radera", "🗑") +
          "</td></tr>"
        );
      })
      .join("");
    const agi = Faktura.Bok.agiSummary(cid, bokFrom, bokTo);
    const agiRows = agi
      .map(
        (b) =>
          "<tr><td><strong>" +
          esc(b.period) +
          "</strong> (" +
          b.count +
          ' st)</td><td class="num">' +
          C().num(b.gross) +
          '</td><td class="num">' +
          C().num(b.tax) +
          '</td><td class="num">' +
          C().num(b.ag) +
          '</td><td class="num"><strong>' +
          C().num(C().round2(b.tax + b.ag)) +
          "</strong></td></tr>"
      )
      .join("");
    return (
      '<div class="page-head" style="margin-bottom:12px"><div></div><div class="btn-row"><button class="btn btn-primary" data-action="new-payroll">+ Ny lönekörning</button></div></div>' +
      '<div class="card"><h2>Lönekörningar</h2>' +
      (list.length
        ? '<table class="data"><thead><tr><th>Period</th><th>Anställd</th><th class="num">Brutto</th><th class="num">Prelskatt</th><th class="num">Arb.avgift</th><th class="num">Netto</th><th>Utbetald</th><th></th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga löner i perioden. Lägg till en lönekörning så bokförs lön, preliminärskatt och arbetsgivaravgifter automatiskt.</p>') +
      "</div>" +
      (agi.length
        ? '<div class="card"><h2>Underlag arbetsgivardeklaration (AGI)</h2>' +
          '<p class="muted small">Deklareras månadsvis på skatteverket.se. Arbetsgivaravgift ' +
          C().num(Faktura.Bok.AG_RATE * 100, 2) +
          " % (full sats). Preliminärskatten här är en förenklad procentsats — använd Skatteverkets skattetabell för exakt belopp.</p>" +
          '<table class="data"><thead><tr><th>Period</th><th class="num">Bruttolön (ruta 011)</th><th class="num">Avdragen skatt</th><th class="num">Arb.avgifter</th><th class="num">Att betala</th></tr></thead><tbody>' +
          agiRows +
          "</tbody></table></div>"
        : "")
    );
  }

  function payrollForm(p) {
    return (
      "<h2>" +
      (p.employee ? "Redigera lönekörning" : "Ny lönekörning") +
      "</h2>" +
      '<div class="form-grid">' +
      '<div class="field"><label>Period (ÅÅÅÅ-MM)</label><input type="month" data-pf="period" value="' +
      esc(p.period) +
      '"></div>' +
      '<div class="field"><label>Anställd</label><input type="text" data-pf="employee" value="' +
      esc(p.employee) +
      '"></div>' +
      '<div class="field"><label>Bruttolön (kr)</label><input type="text" inputmode="decimal" data-pf="gross" value="' +
      esc(p.gross) +
      '"></div>' +
      '<div class="field"><label>Preliminärskatt (%)</label><input type="text" inputmode="decimal" data-pf="taxPct" value="' +
      esc(p.taxPct) +
      '"><span class="hint">Förenklad — se skattetabell för exakt</span></div>' +
      '<div class="field"><label>Utbetalningsdag</label><input type="date" data-pf="payDate" value="' +
      esc(p.payDate) +
      '"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-payroll" data-id="' +
      p.id +
      '">Spara lön</button></div>'
    );
  }

  function savePayroll(id) {
    const existing = S().getPayroll(id);
    const p = existing || S().newPayroll();
    p.id = id;
    modalEl.querySelectorAll("[data-pf]").forEach((inp) => {
      const key = inp.getAttribute("data-pf");
      let v = inp.value;
      if (key === "gross" || key === "taxPct") v = C().toNum(v);
      p[key] = v;
    });
    if (!p.gross) return toast("Ange bruttolön.", "warn");
    if (!p.companyId) {
      const co = S().getActiveCompany();
      p.companyId = co ? co.id : null;
    }
    S().upsertPayroll(p);
    closeModal();
    toast("Lönekörning sparad och bokförd.");
    render();
  }

  /* ── Tillgångar ───────────────────────────────────────────────────────── */
  function bokTillgangar(cid) {
    const assets = S().listAssets(cid);
    const until = bokTo || S().todayISO();
    const rows = assets
      .map((a) => {
        const sch = Faktura.Bok.assetSchedule(a, until);
        return (
          "<tr><td><strong>" +
          esc(a.name) +
          "</strong></td><td>" +
          esc(a.date) +
          '</td><td class="num">' +
          C().num(C().toNum(a.cost)) +
          "</td><td>" +
          a.lifeYears +
          ' år</td><td class="num">' +
          C().num(sch.acc) +
          '</td><td class="num"><strong>' +
          C().num(sch.value) +
          "</strong></td>" +
          '<td class="row-actions">' +
          iconBtn("edit-asset", a.id, "Redigera", "✏️") +
          iconBtn("del-asset", a.id, "Radera", "🗑") +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<div class="page-head" style="margin-bottom:12px"><div></div><div class="btn-row"><button class="btn btn-primary" data-action="new-asset">+ Ny tillgång</button></div></div>' +
      '<div class="card"><h2>Anläggningstillgångar</h2>' +
      '<p class="muted small">Inköpet bokförs mot bank (1220/1930) och skrivs av rakt per månad (7832/1229) — verifikationerna skapas automatiskt. Ack. avskrivning beräknad t.o.m. ' +
      esc(until) +
      ".</p>" +
      (assets.length
        ? '<table class="data"><thead><tr><th>Tillgång</th><th>Inköpt</th><th class="num">Anskaffningsvärde</th><th>Livslängd</th><th class="num">Ack. avskrivning</th><th class="num">Bokfört värde</th><th></th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga tillgångar registrerade. Inventarier över ett halvt prisbasbelopp bör skrivas av — billigare kan kostnadsföras direkt som utgift.</p>') +
      "</div>"
    );
  }

  function assetForm(a) {
    return (
      "<h2>" +
      (a.name ? "Redigera tillgång" : "Ny tillgång") +
      "</h2>" +
      '<div class="form-grid">' +
      '<div class="field full"><label>Beskrivning</label><input type="text" data-af="name" value="' +
      esc(a.name) +
      '" placeholder="t.ex. MacBook Pro 16&quot;"></div>' +
      '<div class="field"><label>Inköpsdatum</label><input type="date" data-af="date" value="' +
      esc(a.date) +
      '"></div>' +
      '<div class="field"><label>Anskaffningsvärde exkl moms (kr)</label><input type="text" inputmode="decimal" data-af="cost" value="' +
      esc(a.cost) +
      '"></div>' +
      '<div class="field"><label>Nyttjandeperiod (år)</label><input type="number" min="1" max="50" data-af="lifeYears" value="' +
      esc(a.lifeYears) +
      '"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-asset" data-id="' +
      a.id +
      '">Spara tillgång</button></div>'
    );
  }

  function saveAsset(id) {
    const existing = S().getAsset(id);
    const a = existing || S().newAsset();
    a.id = id;
    modalEl.querySelectorAll("[data-af]").forEach((inp) => {
      const key = inp.getAttribute("data-af");
      let v = inp.value;
      if (key === "cost") v = C().toNum(v);
      if (key === "lifeYears") v = Math.max(1, parseInt(v, 10) || 5);
      a[key] = v;
    });
    if (!a.name) return toast("Tillgången behöver en beskrivning.", "warn");
    if (!a.cost) return toast("Ange anskaffningsvärde.", "warn");
    if (!a.companyId) {
      const co = S().getActiveCompany();
      a.companyId = co ? co.id : null;
    }
    S().upsertAsset(a);
    closeModal();
    toast("Tillgång sparad — inköp och avskrivningar bokförs automatiskt.");
    render();
  }

  /* ── Manuell verifikation ─────────────────────────────────────────────── */
  let mvDraft = null;

  function accountOptions(sel) {
    const A = Faktura.Bok.ACCOUNTS;
    return (
      '<option value="">— konto —</option>' +
      Object.keys(A)
        .map(
          (a) =>
            '<option value="' +
            a +
            '"' +
            (String(sel) === String(a) ? " selected" : "") +
            ">" +
            a +
            " " +
            esc(A[a]) +
            "</option>"
        )
        .join("")
    );
  }

  function mvBalanceText() {
    const d = C().round2(mvDraft.lines.reduce((s, l) => s + C().toNum(l.debit), 0));
    const c = C().round2(mvDraft.lines.reduce((s, l) => s + C().toNum(l.credit), 0));
    const diff = C().round2(d - c);
    return (
      "Debet " +
      C().num(d) +
      " · Kredit " +
      C().num(c) +
      (Math.abs(diff) < 0.005 && d > 0 ? "  ✓ balanserar" : Math.abs(diff) >= 0.005 ? "  — diff " + C().num(diff) : "")
    );
  }

  function manualForm() {
    const mv = mvDraft;
    const rows = mv.lines
      .map(
        (l, i) =>
          '<tr><td><select data-mvl="' +
          i +
          '" data-key="account">' +
          accountOptions(l.account) +
          "</select></td>" +
          '<td class="num" style="width:110px"><input type="text" inputmode="decimal" data-mvl="' +
          i +
          '" data-key="debit" value="' +
          esc(l.debit || "") +
          '"></td>' +
          '<td class="num" style="width:110px"><input type="text" inputmode="decimal" data-mvl="' +
          i +
          '" data-key="credit" value="' +
          esc(l.credit || "") +
          '"></td>' +
          '<td style="width:30px"><button class="line-del" data-action="del-mv-line" data-id="' +
          i +
          '" title="Ta bort rad">×</button></td></tr>'
      )
      .join("");
    return (
      "<h2>Manuell verifikation</h2>" +
      '<p class="muted small">För allt som inte bokförs automatiskt: aktiekapital vid start, banklån, utdelning, rättelser m.m.</p>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Datum</label><input type="date" data-mv="date" value="' +
      esc(mv.date) +
      '"></div>' +
      '<div class="field"><label>Text</label><input type="text" data-mv="text" value="' +
      esc(mv.text) +
      '" placeholder="t.ex. Insättning aktiekapital"></div>' +
      "</div>" +
      '<table class="lines" style="margin-top:12px"><thead><tr><th>Konto</th><th>Debet</th><th>Kredit</th><th></th></tr></thead><tbody>' +
      rows +
      "</tbody></table>" +
      '<div class="btn-row" style="margin-top:10px;align-items:center">' +
      '<button class="btn btn-ghost btn-sm" data-action="add-mv-line">+ Rad</button>' +
      '<span class="small muted" id="mvBalance" style="margin-left:auto">' +
      mvBalanceText() +
      "</span></div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-manual">Bokför</button></div>'
    );
  }

  function saveManual() {
    const mv = mvDraft;
    mv.lines = mv.lines.filter((l) => l.account && (C().toNum(l.debit) || C().toNum(l.credit)));
    const d = C().round2(mv.lines.reduce((s, l) => s + C().toNum(l.debit), 0));
    const c = C().round2(mv.lines.reduce((s, l) => s + C().toNum(l.credit), 0));
    if (mv.lines.length < 2) return toast("Minst två rader med konto behövs.", "warn");
    if (Math.abs(d - c) >= 0.005) return toast("Verifikationen balanserar inte (debet ≠ kredit).", "err");
    if (d <= 0) return toast("Beloppen är noll.", "warn");
    if (!mv.companyId) {
      const co = S().getActiveCompany();
      mv.companyId = co ? co.id : null;
    }
    S().upsertManualVer(mv);
    mvDraft = null;
    closeModal();
    toast("Verifikation bokförd.");
    render();
  }

  /* ── Rapporter (RR + BR) ──────────────────────────────────────────────── */
  function bokRapporter(cid) {
    const rr = Faktura.Bok.resultatrakning(cid, bokFrom, bokTo);
    const br = Faktura.Bok.balansrakning(cid, bokFrom, bokTo);
    const row = (label, val, strong, indent) =>
      "<tr" +
      (strong ? ' style="font-weight:700"' : "") +
      "><td" +
      (indent ? ' style="padding-left:24px"' : "") +
      ">" +
      esc(label) +
      '</td><td class="num">' +
      C().num(val) +
      " kr</td></tr>";
    const rrRows =
      row("Rörelsens intäkter", rr.revenue, true) +
      (rr.goods ? row("Råvaror och förnödenheter", -rr.goods, false, true) : "") +
      (rr.external ? row("Övriga externa kostnader", -rr.external, false, true) : "") +
      (rr.personnel ? row("Personalkostnader", -rr.personnel, false, true) : "") +
      (rr.depreciation ? row("Avskrivningar", -rr.depreciation, false, true) : "") +
      (rr.otherOp ? row("Övriga rörelsekostnader", -rr.otherOp, false, true) : "") +
      row("Rörelseresultat", rr.ebit, true) +
      (rr.finIncome ? row("Finansiella intäkter", rr.finIncome, false, true) : "") +
      (rr.finCost ? row("Finansiella kostnader", -rr.finCost, false, true) : "") +
      row("Resultat före skatt", rr.resultatForeSkatt, true) +
      (rr.tax ? row("Skatt på årets resultat", -rr.tax, false, true) : "") +
      row("Periodens resultat", rr.result, true);
    const brRows =
      '<tr><td colspan="2" style="font-weight:700;color:var(--sage-900)">Tillgångar</td></tr>' +
      row("Anläggningstillgångar", br.anlaggning, false, true) +
      row("Omsättningstillgångar", br.omsattning, false, true) +
      row("Summa tillgångar", br.tillgangar, true) +
      '<tr><td colspan="2" style="font-weight:700;color:var(--sage-900);padding-top:14px">Eget kapital och skulder</td></tr>' +
      row("Eget kapital", br.egetKapital, false, true) +
      row("Periodens resultat (beräknat)", br.beraknatResultat, false, true) +
      (br.langfristiga ? row("Långfristiga skulder", br.langfristiga, false, true) : "") +
      row("Kortfristiga skulder", br.kortfristiga, false, true) +
      row("Summa eget kapital och skulder", br.summaEKSkulder, true);
    return (
      '<div class="card"><h2>Resultaträkning ' +
      esc(bokFrom) +
      " – " +
      esc(bokTo) +
      '</h2><table class="data"><tbody>' +
      rrRows +
      "</tbody></table></div>" +
      '<div class="card"><h2>Balansräkning per ' +
      esc(bokTo) +
      '</h2><table class="data"><tbody>' +
      brRows +
      "</tbody></table>" +
      (br.balanced
        ? '<p class="compliance-ok" style="margin-top:10px">✓ Balansräkningen balanserar.</p>'
        : '<p class="small" style="color:var(--err);margin-top:10px">Obs: balanserar inte — kontrollera verifikationerna.</p>') +
      "</div>"
    );
  }

  /* ── Årsavslut: bokslut, INK2 och K2-årsredovisning ───────────────────── */
  function bokArsavslut(cid) {
    const year = bokFrom.slice(0, 4);
    const d = Faktura.Ars.ink2Data(cid, year);
    const bk = Faktura.Ars.bokslutFor(cid, year);
    const items = [
      "Alla kundfakturor för året är bokförda (markerade som skickade/betalda).",
      "Alla utgifter och leverantörsfakturor är registrerade under Utgifter.",
      "Alla lönekörningar är registrerade och AGI inlämnad varje månad.",
      "Momsdeklarationerna för årets perioder är inlämnade (se Momsrapport).",
      "Bokslutsuppgifterna är ifyllda (verksamhet, styrelse, ev. justeringar).",
      "Bolagsskatten är bokförd (knappen nedan).",
      "Årsredovisningen (K2) är genererad, underskriven av styrelsen och inlämnad till Bolagsverket (med fastställelseintyg).",
      "INK2 är inlämnad till Skatteverket (SRU-filer eller manuellt via e-tjänsten).",
      "Årsstämma hålls och ev. utdelning beslutas (styr K10-utrymmet).",
    ];
    const sruRow = (f) =>
      "<tr><td class=\"muted\" style=\"width:64px\">" +
      (f.falt || "") +
      '</td><td class="muted" style="width:64px">' +
      f.code +
      "</td><td>" +
      esc(f.label) +
      '</td><td class="num">' +
      C().num(f.value, 0) +
      " kr</td></tr>";

    return (
      // — Bokslutsuppgifter —
      '<div class="card"><h2>Bokslutsuppgifter ' +
      esc(year) +
      "</h2>" +
      '<p class="muted small">Verksamhetsbeskrivning, styrelse, föreslagen utdelning och skattemässiga justeringar — används i årsredovisningen och INK2.</p>' +
      '<p class="small">' +
      (bk.verksamhet ? "✓ Verksamhet: " + esc(bk.verksamhet.slice(0, 80)) + (bk.verksamhet.length > 80 ? "…" : "") : "— Verksamhetsbeskrivning saknas") +
      "<br>" +
      (bk.styrelse ? "✓ Styrelse: " + esc(bk.styrelse) : "— Styrelseledamöter saknas") +
      "</p>" +
      '<div class="btn-row"><button class="btn btn-primary" data-action="edit-bokslut">Redigera bokslutsuppgifter</button></div></div>' +
      // — Skatteberäkning (INK2S-kedjan) —
      '<div class="card"><h2>Skatteberäkning ' +
      esc(year) +
      " (INK2S)</h2>" +
      '<table class="data"><tbody>' +
      d.S.map(sruRow).join("") +
      '<tr style="font-weight:700"><td colspan="3">Beräknad bolagsskatt (' +
      C().num(Faktura.Bok.TAX_RATE_AB * 100, 1) +
      ' % av överskott)</td><td class="num">' +
      C().num(d.beraknadSkatt, 0) +
      " kr</td></tr>" +
      '<tr><td colspan="3">Redan bokförd skatt</td><td class="num">' +
      C().num(d.bokfordSkatt, 0) +
      " kr</td></tr>" +
      '<tr style="font-weight:700"><td colspan="3">Kvar att bokföra</td><td class="num">' +
      C().num(d.resterande, 0) +
      " kr</td></tr>" +
      "</tbody></table>" +
      '<div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" data-action="book-tax"' +
      (d.resterande > 0 ? "" : " disabled") +
      ">Bokför bolagsskatt (8910/2510)</button></div></div>" +
      // — INK2 —
      '<div class="card"><h2>Inkomstdeklaration 2 — räkenskapsschema (INK2R)</h2>' +
      '<p class="muted small">Fältkoderna (SRU) motsvarar rutorna i INK2R. Överskott/underskott från INK2S förs till ruta 1.1/1.2 på INK2:s första sida.</p>' +
      '<table class="data"><thead><tr><th>Fält</th><th>SRU</th><th>Post</th><th class="num">Belopp</th></tr></thead><tbody>' +
      d.R.map(sruRow).join("") +
      "</tbody></table>" +
      '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn btn-primary" data-action="dl-sru">⬇ SRU-filer (INFO.SRU + BLANKETTER.SRU)</button></div>' +
      '<p class="muted small" style="margin-top:10px">Ladda upp via Skatteverkets filöverföring. Testa alltid först i Skatteverkets <em>testtjänst för filöverföring</em>. Schablonjusteringar (periodiseringsfond, ränteavdragsbegränsning m.m.) ingår inte — stäm av med konsult vid behov.</p>' +
      "</div>" +
      // — K2 —
      '<div class="card"><h2>Årsredovisning (K2)</h2>' +
      '<p class="muted small">Komplett årsredovisning enligt BFNAR 2016:10: förvaltningsberättelse med flerårsöversikt och resultatdisposition, resultat- och balansräkning, noter och underskriftssida. Skrivs under av styrelsen och lämnas till Bolagsverket med fastställelseintyg.</p>' +
      '<div class="btn-row"><button class="btn btn-coral" data-action="dl-k2">⬇ Årsredovisning ' +
      esc(year) +
      " (PDF)</button></div></div>" +
      // — Checklista —
      '<div class="card"><h2>Checklista årsavslut</h2><ul class="checklist">' +
      items.map((i) => '<li><span class="dot" style="background:var(--sage-500)">·</span><span>' + esc(i) + "</span></li>").join("") +
      "</ul></div>"
    );
  }

  function bokslutForm(bk) {
    const f = (label, key, val, type, full, hint) =>
      '<div class="field' +
      (full ? " full" : "") +
      '"><label>' +
      esc(label) +
      '</label><input type="' +
      (type || "text") +
      '" data-bk="' +
      key +
      '" value="' +
      esc(val == null ? "" : val) +
      '">' +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") +
      "</div>";
    return (
      "<h2>Bokslutsuppgifter " +
      esc(bk.year) +
      "</h2>" +
      '<div class="form-grid">' +
      '<div class="field full"><label>Verksamhetsbeskrivning (förvaltningsberättelsen)</label><textarea data-bk="verksamhet" placeholder="Bolaget bedriver konsultverksamhet inom ...">' +
      esc(bk.verksamhet) +
      "</textarea></div>" +
      f("Ort (underskrifter)", "ort", bk.ort) +
      f("Styrelseledamöter (kommaseparerade)", "styrelse", bk.styrelse) +
      f("Medelantal anställda (tomt = härleds från löner)", "medelAnstallda", bk.medelAnstallda) +
      f("Föreslagen utdelning (kr)", "utdelning", bk.utdelning) +
      f("Ej avdragsgilla kostnader (INK2S 4.3c)", "ejAvdragsgilla", bk.ejAvdragsgilla, "text", false, "t.ex. representation över schablon, förseningsavgifter") +
      f("Ej skattepliktiga intäkter (INK2S 4.5c)", "ejSkattepliktiga", bk.ejSkattepliktiga) +
      f("Outnyttjat underskott föregående år (4.14a)", "underskottForegAr", bk.underskottForegAr) +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-bokslut" data-id="' +
      bk.id +
      '">Spara</button></div>'
    );
  }

  function saveBokslut(id) {
    const year = bokFrom.slice(0, 4);
    const co = S().getActiveCompany();
    const existing = S().getBokslutFor(co.id, year);
    const bk = existing || S().newBokslut({ companyId: co.id, year: year });
    bk.id = id || bk.id;
    modalEl.querySelectorAll("[data-bk]").forEach((inp) => {
      const key = inp.getAttribute("data-bk");
      let v = inp.value;
      if (key === "utdelning" || key === "ejAvdragsgilla" || key === "ejSkattepliktiga" || key === "underskottForegAr")
        v = C().toNum(v);
      bk[key] = v;
    });
    S().upsertBokslut(bk);
    closeModal();
    toast("Bokslutsuppgifter sparade.");
    render();
  }

  /* Utgiftsformulär (modal) */
  function expenseForm(e) {
    const cats = Faktura.Bok.EXPENSE_ACCOUNTS.map(
      (a) =>
        '<option value="' +
        a +
        '"' +
        (e.account === a ? " selected" : "") +
        ">" +
        a +
        " " +
        esc(Faktura.Bok.accountName(a)) +
        "</option>"
    ).join("");
    const vatOpt = [
      [0.25, "25 %"],
      [0.12, "12 %"],
      [0.06, "6 %"],
      [0, "0 %"],
    ]
      .map(
        (r) =>
          '<option value="' +
          r[0] +
          '"' +
          (Math.abs(r[0] - e.vatRate) < 1e-6 ? " selected" : "") +
          ">" +
          r[1] +
          "</option>"
      )
      .join("");
    return (
      "<h2>" +
      (e.supplier ? "Redigera utgift" : "Ny utgift") +
      "</h2>" +
      '<div class="form-grid">' +
      '<div class="field"><label>Datum</label><input type="date" data-xf="date" value="' +
      esc(e.date) +
      '"></div>' +
      '<div class="field"><label>Leverantör</label><input type="text" data-xf="supplier" value="' +
      esc(e.supplier) +
      '"></div>' +
      '<div class="field full"><label>Beskrivning</label><input type="text" data-xf="description" value="' +
      esc(e.description) +
      '"></div>' +
      '<div class="field"><label>Belopp exkl moms</label><input type="text" inputmode="decimal" data-xf="net" value="' +
      esc(e.net) +
      '"></div>' +
      '<div class="field"><label>Moms</label><select data-xf="vatRate">' +
      vatOpt +
      "</select></div>" +
      '<div class="field full"><label>Kostnadskonto (BAS)</label><select data-xf="account">' +
      cats +
      "</select></div>" +
      '<div class="field check"><input type="checkbox" data-xf-check="paid" id="xf_paid"' +
      (e.paid ? " checked" : "") +
      '><label for="xf_paid">Betald</label></div>' +
      '<div class="field"><label>Betaldatum</label><input type="date" data-xf="paymentDate" value="' +
      esc(e.paymentDate) +
      '"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-expense" data-id="' +
      e.id +
      '">Spara utgift</button></div>'
    );
  }

  function saveExpense(id) {
    const existing = S().getExpense(id);
    const e = existing || S().newExpense();
    e.id = id;
    modalEl.querySelectorAll("[data-xf]").forEach((inp) => {
      const key = inp.getAttribute("data-xf");
      let v = inp.value;
      if (key === "net") v = C().toNum(v);
      if (key === "vatRate") v = parseFloat(v);
      e[key] = v;
    });
    const paid = modalEl.querySelector('[data-xf-check="paid"]');
    if (paid) e.paid = paid.checked;
    if (!e.companyId) {
      const co = S().getActiveCompany();
      e.companyId = co ? co.id : null;
    }
    if (!e.supplier && !e.description) return toast("Ange leverantör eller beskrivning.", "warn");
    S().upsertExpense(e);
    closeModal();
    toast("Utgift sparad.");
    render();
  }

  /* ════════════════════════════════════════════════════════════════════
     FAKTURA-EDITOR
     ════════════════════════════════════════════════════════════════════ */
  let draft = null;

  function renderEditor(id) {
    const co = S().getActiveCompany();
    if (id && id !== "new") {
      draft = JSON.parse(JSON.stringify(S().getInvoice(id)));
    } else {
      draft = S().newInvoice(co);
    }
    app().innerHTML = editorHTML();
    refreshPreview();
  }

  function editorHTML() {
    const co = S().getCompany(draft.companyId) || S().getActiveCompany();
    const customers = S().listCustomers(co ? co.id : null);
    const isNew = !draft.number;

    return (
      '<div class="page-head"><div><h1>' +
      (draft.number ? "Faktura " + esc(draft.number) : "Ny faktura") +
      "</h1><p>" +
      esc(co ? co.name : "") +
      "</p></div>" +
      '<div class="btn-row no-print">' +
      '<button class="btn btn-ghost" data-action="back-invoices">← Tillbaka</button>' +
      '<button class="btn" data-action="save-draft">Spara utkast</button>' +
      (draft.status === "draft"
        ? '<button class="btn btn-primary" data-action="finalize">Bokför &amp; ge nummer</button>'
        : "") +
      "</div></div>" +
      '<div class="editor">' +
      // ── Vänster: formulär ──
      '<div class="form-col">' +
      '<div class="card"><h2>Uppgifter</h2>' +
      '<div class="form-grid">' +
      field("Kund", customerSelect(customers), true) +
      selField("Fakturatyp", "docType", [
        ["faktura", "Faktura"],
        ["kreditfaktura", "Kreditfaktura"],
        ["proforma", "Proformafaktura"],
        ["paminnelse", "Betalningspåminnelse"],
      ]) +
      inputField("Fakturadatum", "invoiceDate", "date") +
      inputField("Leveransdatum", "supplyDate", "date") +
      inputField("Betalningsvillkor (dagar)", "termsDays", "number") +
      inputField("Förfallodatum", "dueDate", "date") +
      inputField("Er referens", "yourReference", "text") +
      inputField("Vår referens", "ourReference", "text") +
      inputField("Ordernr / offert", "orderRef", "text") +
      inputField("Leveransvillkor", "deliveryTerms", "text") +
      "</div></div>" +
      // ── Rader ──
      '<div class="card"><h2>Specifikation</h2>' +
      '<div id="linesWrap">' +
      linesHTML() +
      "</div>" +
      '<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-action="add-line">+ Lägg till rad</button></div>' +
      // ── Moms-special ──
      '<h3>Moms</h3>' +
      '<div class="form-grid">' +
      checkField("Omvänd skattskyldighet (köparen betalar moms)", "reverseCharge") +
      checkField("Momsbefriad försäljning", "vatExempt") +
      checkField("Öresavrundning till hel krona", "roundTotal") +
      '<div class="field full"><label>Hänvisning vid momsbefrielse / omvänd skattskyldighet</label>' +
      '<input type="text" data-bind="vatExemptReason" value="' +
      esc(draft.vatExemptReason) +
      '" placeholder="t.ex. 3 kap. 21 § mervärdesskattelagen, eller \'Byggtjänster, omvänd moms\'"></div>' +
      "</div>" +
      '<div class="field full" style="margin-top:12px"><label>Meddelande till kund</label>' +
      '<textarea data-bind="message" placeholder="Tack för din beställning ...">' +
      esc(draft.message) +
      "</textarea></div>" +
      "</div>" +
      "</div>" +
      // ── Höger: preview + validering + actions ──
      '<div class="preview-col">' +
      '<div class="card no-print"><h2>Status</h2><div id="validation"></div>' +
      '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn btn-ghost btn-sm" data-action="pdf-current">📄 PDF</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="print-current">🖨 Skriv ut</button>' +
      '<button class="btn btn-coral btn-sm" data-action="email-current">✉️ Skicka via e-post</button>' +
      "</div></div>" +
      '<div id="previewDoc"></div>' +
      "</div>" +
      "</div>"
    );
  }

  function customerSelect(customers) {
    const opts = ['<option value="">— välj kund —</option>']
      .concat(
        customers.map(
          (c) =>
            '<option value="' +
            c.id +
            '"' +
            (c.id === draft.customerId ? " selected" : "") +
            ">" +
            esc(c.name || "(namnlös)") +
            "</option>"
        )
      )
      .join("");
    return (
      '<select data-bind="customerId">' +
      opts +
      "</select>" +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="quick-customer" style="margin-top:6px">+ Ny kund</button>'
    );
  }

  function linesHTML() {
    const co = S().getCompany(draft.companyId);
    const rows = draft.lines
      .map((l, i) => {
        return (
          "<tr>" +
          '<td><input type="text" data-line="' +
          i +
          '" data-key="description" value="' +
          esc(l.description) +
          '" placeholder="Beskrivning"></td>' +
          '<td class="num" style="width:64px"><input type="text" inputmode="decimal" data-line="' +
          i +
          '" data-key="quantity" value="' +
          esc(l.quantity) +
          '"></td>' +
          '<td style="width:64px"><input type="text" data-line="' +
          i +
          '" data-key="unit" value="' +
          esc(l.unit) +
          '"></td>' +
          '<td class="num" style="width:84px"><input type="text" inputmode="decimal" data-line="' +
          i +
          '" data-key="unitPrice" value="' +
          esc(l.unitPrice) +
          '"></td>' +
          '<td class="num" style="width:60px"><input type="text" inputmode="decimal" data-line="' +
          i +
          '" data-key="discountPct" value="' +
          esc(l.discountPct) +
          '" title="Rabatt %"></td>' +
          '<td style="width:78px"><select data-line="' +
          i +
          '" data-key="vatRate">' +
          vatOptions(l.vatRate) +
          "</select></td>" +
          '<td style="width:30px"><button class="line-del" data-action="del-line" data-id="' +
          i +
          '" title="Ta bort rad">×</button></td>' +
          "</tr>"
        );
      })
      .join("");
    return (
      '<table class="lines"><thead><tr>' +
      "<th>Beskrivning</th><th>Antal</th><th>Enhet</th><th>À-pris</th><th>Rabatt%</th><th>Moms</th><th></th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>"
    );
  }

  function vatOptions(sel) {
    const rates = [
      [0.25, "25 %"],
      [0.12, "12 %"],
      [0.06, "6 %"],
      [0, "0 %"],
    ];
    return rates
      .map(
        (r) =>
          '<option value="' +
          r[0] +
          '"' +
          (Math.abs(r[0] - sel) < 0.0001 ? " selected" : "") +
          ">" +
          r[1] +
          "</option>"
      )
      .join("");
  }

  /* ── Field-byggare ─────────────────────────────────────────────────────── */
  function field(label, inner, full) {
    return (
      '<div class="field' +
      (full ? " full" : "") +
      '"><label>' +
      esc(label) +
      "</label>" +
      inner +
      "</div>"
    );
  }
  function inputField(label, bind, type) {
    const v = getPath(draft, bind);
    return field(
      label,
      '<input type="' +
        type +
        '" data-bind="' +
        bind +
        '" value="' +
        esc(v == null ? "" : v) +
        '">'
    );
  }
  function selField(label, bind, options) {
    const v = getPath(draft, bind);
    const opts = options
      .map(
        (o) =>
          '<option value="' +
          o[0] +
          '"' +
          (o[0] === v ? " selected" : "") +
          ">" +
          esc(o[1]) +
          "</option>"
      )
      .join("");
    return field(label, '<select data-bind="' + bind + '">' + opts + "</select>");
  }
  function checkField(label, bind) {
    const v = !!getPath(draft, bind);
    return (
      '<div class="field check full"><input type="checkbox" data-bind-check="' +
      bind +
      '" id="chk_' +
      bind +
      '"' +
      (v ? " checked" : "") +
      '><label for="chk_' +
      bind +
      '">' +
      esc(label) +
      "</label></div>"
    );
  }

  /* ── Preview + validering ──────────────────────────────────────────────── */
  function refreshPreview() {
    const co = S().getCompany(draft.companyId);
    const cu = S().getCustomer(draft.customerId);
    const pv = document.getElementById("previewDoc");
    if (pv) pv.innerHTML = invoiceDocHTML(draft, co, cu);
    const val = document.getElementById("validation");
    if (val) val.innerHTML = validationHTML(draft, co, cu);
  }

  function validationHTML(inv, co, cu) {
    const issues = C().validate(inv, co, cu);
    const errs = issues.filter((i) => i.level === "error");
    const warns = issues.filter((i) => i.level === "warn");
    if (errs.length === 0 && warns.length === 0) {
      return '<div class="compliance-ok">✓ Fakturan uppfyller formkraven.</div>';
    }
    let html = "";
    if (errs.length) {
      html +=
        '<p class="small" style="margin:0 0 6px;font-weight:600;color:var(--err)">Måste åtgärdas (' +
        errs.length +
        "):</p><ul class=\"checklist\">" +
        errs
          .map((e) => '<li class="err"><span class="dot">!</span><span>' + esc(e.message) + "</span></li>")
          .join("") +
        "</ul>";
    }
    if (warns.length) {
      html +=
        '<p class="small" style="margin:12px 0 6px;font-weight:600;color:var(--warn)">Rekommenderas (' +
        warns.length +
        "):</p><ul class=\"checklist\">" +
        warns
          .map((w) => '<li class="warn"><span class="dot">?</span><span>' + esc(w.message) + "</span></li>")
          .join("") +
        "</ul>";
    }
    return html;
  }

  /* On-screen faktura-dokument (speglar PDF:en). */
  function invoiceDocHTML(inv, co, cu) {
    const comp = C().compute(inv);
    const cur = inv.currency || "SEK";
    const docTypeLabel = {
      faktura: "Faktura",
      kreditfaktura: "Kreditfaktura",
      proforma: "Proformafaktura",
      paminnelse: "Påminnelse",
    };

    const sellerLines = co
      ? [co.name]
          .concat(C().addressLines(co.address))
          .concat(co.orgnr ? ["Org.nr " + co.orgnr] : [])
          .concat(co.vatNumber ? ["Momsnr " + co.vatNumber] : [])
          .filter(Boolean)
      : ["(inget bolag valt)"];
    const buyerLines = cu
      ? [cu.name]
          .concat(C().addressLines(cu.address))
          .concat(cu.orgnr ? [(cu.type === "private" ? "Pers.nr " : "Org.nr ") + cu.orgnr] : [])
          .concat(cu.vatNumber ? ["Momsnr " + cu.vatNumber] : [])
          .filter(Boolean)
      : ["(ingen kund vald)"];

    const lineRows = comp.lines
      .filter((l) => l.description || C().toNum(l.quantity) || C().toNum(l.unitPrice))
      .map(
        (l) =>
          "<tr><td>" +
          esc(l.description) +
          "</td><td>" +
          C().num(C().toNum(l.quantity), C().toNum(l.quantity) % 1 ? 2 : 0) +
          "</td><td>" +
          esc(l.unit) +
          "</td><td>" +
          C().num(C().toNum(l.unitPrice)) +
          "</td><td>" +
          (comp.reverseCharge || comp.vatExempt ? "0 %" : C().pct(l.effRate)) +
          "</td><td>" +
          C().num(l.net) +
          "</td></tr>"
      )
      .join("");

    const vatRows = comp.vatGroups
      .map(
        (g) =>
          "<tr><td>Moms " +
          (comp.reverseCharge || comp.vatExempt ? "0 %" : C().pct(g.rate)) +
          " (underlag " +
          C().num(g.base) +
          ")</td><td>" +
          money(g.vat, cur) +
          "</td></tr>"
      )
      .join("");

    const pay = [];
    if (co && co.bankgiro) pay.push(["Bankgiro", co.bankgiro]);
    if (co && co.plusgiro) pay.push(["Plusgiro", co.plusgiro]);
    if (co && co.iban) pay.push(["IBAN", co.iban]);
    pay.push(["Ange vid betalning", inv.number || "(fakturanr)"]);

    const footBits = [];
    if (co) {
      if (co.orgnr) footBits.push("Org.nr " + co.orgnr);
      if (co.form === "ab" && co.sate) footBits.push("Säte: " + co.sate);
      if (co.vatNumber) footBits.push(co.vatNumber);
      if (co.fskatt) footBits.push("Godkänd för F-skatt");
    }

    return (
      '<div class="invoice-doc">' +
      '<div class="doc-head">' +
      "<div>" +
      (co && co.logo
        ? '<img class="doc-logo" src="' + esc(co.logo) + '" alt="logo">'
        : '<div style="font-family:var(--serif);font-size:1.3rem;color:var(--sage-900);font-weight:700">' +
          esc(co ? co.name : "") +
          "</div>") +
      "</div>" +
      '<div class="doc-title">' +
      (docTypeLabel[inv.docType] || "Faktura") +
      "<small>" +
      esc(inv.number ? "Nr " + inv.number : "(utkast)") +
      "</small></div>" +
      "</div>" +
      '<div class="parties">' +
      '<div><div class="ptitle">Från</div>' +
      sellerLines.map((l, i) => '<div class="' + (i === 0 ? "pname" : "") + '">' + esc(l) + "</div>").join("") +
      "</div>" +
      '<div><div class="ptitle">Faktureras till</div>' +
      buyerLines.map((l, i) => '<div class="' + (i === 0 ? "pname" : "") + '">' + esc(l) + "</div>").join("") +
      "</div></div>" +
      '<div class="meta">' +
      metaCell("Fakturadatum", inv.invoiceDate) +
      metaCell("Förfallodatum", inv.dueDate) +
      metaCell("Leveransdatum", inv.supplyDate) +
      metaCell("Villkor", (inv.termsDays != null ? inv.termsDays : 30) + " dgr netto") +
      (inv.yourReference ? metaCell("Er referens", inv.yourReference) : "") +
      (inv.ourReference ? metaCell("Vår referens", inv.ourReference) : "") +
      (inv.orderRef ? metaCell("Ordernr", inv.orderRef) : "") +
      "</div>" +
      '<table class="idoc"><thead><tr><th>Beskrivning</th><th>Antal</th><th>Enhet</th><th>À-pris</th><th>Moms</th><th>Belopp</th></tr></thead><tbody>' +
      (lineRows || '<tr><td colspan="6" style="color:var(--ink-400)">Inga rader ännu</td></tr>') +
      "</tbody></table>" +
      '<div class="totals"><table>' +
      "<tr><td>Summa exkl. moms</td><td>" +
      money(comp.net, cur) +
      "</td></tr>" +
      vatRows +
      (inv.roundTotal && comp.rounding
        ? "<tr><td>Öresavrundning</td><td>" + money(comp.rounding, cur) + "</td></tr>"
        : "") +
      '<tr class="grand"><td>Att betala</td><td>' +
      money(comp.total, cur) +
      "</td></tr></table></div>" +
      (comp.reverseCharge || comp.vatExempt
        ? '<div class="note">' +
          (comp.reverseCharge
            ? "Omvänd skattskyldighet — köparen redovisar momsen. "
            : "Momsbefriad försäljning. ") +
          esc(inv.vatExemptReason || "") +
          "</div>"
        : "") +
      (inv.message ? '<div class="note">' + esc(inv.message) + "</div>" : "") +
      '<div class="pay">' +
      pay
        .map((p) => '<div><div class="k">' + esc(p[0]) + "</div><div>" + esc(p[1]) + "</div></div>")
        .join("") +
      "</div>" +
      '<div class="doc-foot">' +
      esc(footBits.join("  ·  ")) +
      (co && co.lateInterestText ? "<br>" + esc(co.lateInterestText) : "") +
      "</div>" +
      "</div>"
    );
  }
  function metaCell(k, v) {
    return '<div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v || "—") + "</div></div>";
  }

  /* ════════════════════════════════════════════════════════════════════
     KUNDER
     ════════════════════════════════════════════════════════════════════ */
  function viewCustomers() {
    const co = S().getActiveCompany();
    const customers = S().listCustomers(co ? co.id : null);
    const rows = customers
      .map(
        (c) =>
          "<tr><td><strong>" +
          esc(c.name) +
          "</strong></td><td>" +
          esc(c.orgnr || "") +
          "</td><td>" +
          esc(c.email || "") +
          "</td><td>" +
          esc(c.type === "private" ? "Privatperson" : "Företag") +
          "</td><td>" +
          kycBadge(c) +
          '</td><td class="row-actions">' +
          iconBtn("edit-customer", c.id, "Redigera", "✏️") +
          iconBtn("del-customer", c.id, "Radera", "🗑") +
          "</td></tr>"
      )
      .join("");
    return (
      '<div class="page-head"><div><h1>Kunder</h1><p>' +
      customers.length +
      " st för " +
      esc(co ? co.name : "") +
      "</p></div>" +
      '<div class="btn-row"><button class="btn btn-primary" data-action="new-customer">+ Ny kund</button></div></div>' +
      '<div class="card">' +
      (customers.length
        ? '<table class="data"><thead><tr><th>Namn</th><th>Org/Pers.nr</th><th>E-post</th><th>Typ</th><th>Kontroll</th><th></th></tr></thead><tbody>' +
          rows +
          "</tbody></table>"
        : '<p class="muted">Inga kunder ännu.</p>') +
      "</div>"
    );
  }

  function customerForm(c) {
    const k = c.kyc || {};
    const orgRes = C().validateIdNumber(c.orgnr, c.type);
    const vatRes = C().validateVat(c.vatNumber, c.countryCode);
    const risk = (v, t) =>
      '<option value="' + v + '"' + (k.riskLevel === v ? " selected" : "") + ">" + t + "</option>";
    return (
      "<h2>" +
      (c.name ? "Redigera kund" : "Ny kund") +
      "</h2>" +
      '<h3 style="margin-top:6px">Kunduppgifter</h3>' +
      '<div class="form-grid">' +
      cf("Namn", "name", c.name, "text", true) +
      '<div class="field"><label>Typ</label><select data-cf="type">' +
      '<option value="company"' +
      (c.type === "company" ? " selected" : "") +
      ">Företag</option>" +
      '<option value="private"' +
      (c.type === "private" ? " selected" : "") +
      ">Privatperson</option></select></div>" +
      cfVal("Org./personnr", "orgnr", c.orgnr, "cfOrgStatus", orgRes) +
      cfVal("Momsnr (EU-handel)", "vatNumber", c.vatNumber, "cfVatStatus", vatRes) +
      cf("E-post", "email", c.email, "email") +
      cf("Referens (attesterar)", "reference", c.reference, "text") +
      cf("Adress", "address.line1", c.address.line1, "text", true) +
      cf("Postnr", "address.zip", c.address.zip, "text") +
      cf("Ort", "address.city", c.address.city, "text") +
      cf("Land", "address.country", c.address.country, "text") +
      cf("Landskod", "address_cc", c.countryCode, "text") +
      "</div>" +
      // ── Kontroll & kundkännedom ──
      '<h3>Kontroll &amp; kundkännedom (KYC)</h3>' +
      '<div class="info">Grundkontroll är klok praxis för alla. <strong>Formell kundkännedom (AML)</strong> krävs bara om ditt bolag är verksamhetsutövare enligt penningtvättslagen. Kontrollera mot register:' +
      ' <a href="https://www.allabolag.se/" target="_blank" rel="noopener">Allabolag</a> ·' +
      ' <a href="https://ec.europa.eu/taxation_customs/vies/" target="_blank" rel="noopener">VIES (EU-moms)</a> ·' +
      ' <a href="https://www.skatteverket.se/" target="_blank" rel="noopener">Skatteverket (F-skatt)</a> ·' +
      ' <a href="https://www.sanctionsmap.eu/" target="_blank" rel="noopener">EU sanktionslista</a></div>' +
      '<div class="form-grid">' +
      cfkCheck("Org.nr kontrollerat mot register", "orgnrVerified", k.orgnrVerified) +
      cfkCheck("F-skatt verifierad", "fskattChecked", k.fskattChecked) +
      cfk("Datum F-skattkontroll", "fskattDate", k.fskattDate, "date") +
      cfkCheck("Momsnr kontrollerat (VIES vid EU)", "vatChecked", k.vatChecked) +
      cfk("Datum momskontroll", "vatDate", k.vatDate, "date") +
      cfkCheck("Kreditkontroll gjord", "creditChecked", k.creditChecked) +
      cfk("Datum kreditkontroll", "creditDate", k.creditDate, "date") +
      cfk("Beviljad kreditgräns (kr)", "creditLimit", k.creditLimit, "text") +
      "</div>" +
      // ── AML / penningtvätt ──
      '<h3>Kundkännedom / AML (vid lagkrav)</h3>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Riskklass</label><select data-kyc="riskLevel">' +
      risk("low", "Låg risk") +
      risk("medium", "Medel") +
      risk("high", "Hög risk") +
      "</select></div>" +
      cfk("Affärsrelationens syfte", "purpose", k.purpose, "text") +
      cfk("Verklig huvudman", "beneficialOwner", k.beneficialOwner, "text", true) +
      cfk("ID-kontroll metod (BankID, pass …)", "idMethod", k.idMethod, "text") +
      cfk("Datum ID-kontroll", "idDate", k.idDate, "date") +
      cfkCheck("Person i politiskt utsatt ställning (PEP)", "pep", k.pep) +
      cfkCheck("Sanktionslistkontroll gjord", "sanctionsChecked", k.sanctionsChecked) +
      cfk("Datum sanktionskontroll", "sanctionsDate", k.sanctionsDate, "date") +
      cfkCheck("Kundkännedom slutförd", "completed", k.completed) +
      cfk("Datum slutförd", "completedDate", k.completedDate, "date") +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-customer" data-id="' +
      c.id +
      '">Spara</button></div>'
    );
  }

  function kycBadge(c) {
    const s = C().kycStatus(c);
    const warn = s.idValid === false ? ' <span class="vb bad" title="Org/personnr ogiltigt">✗ nr</span>' : "";
    if (s.state === "complete") return '<span class="badge kyc-complete">KYC klar</span>' + warn;
    if (s.state === "partial")
      return '<span class="badge kyc-partial">Påbörjad ' + s.done + "/" + s.total + "</span>" + warn;
    return '<span class="badge kyc-none">Ej gjord</span>' + warn;
  }

  function valBadge(res) {
    if (!res || res.valid === null) return "";
    return (
      '<span class="vb ' +
      (res.valid ? "ok" : "bad") +
      '">' +
      (res.valid ? "✓ " : "✗ ") +
      esc(res.msg) +
      "</span>"
    );
  }
  function cfVal(label, key, val, statusId, res) {
    return (
      '<div class="field"><label>' +
      esc(label) +
      ' <span class="vb-wrap" id="' +
      statusId +
      '">' +
      valBadge(res) +
      '</span></label><input type="text" data-cf="' +
      key +
      '" value="' +
      esc(val == null ? "" : val) +
      '"></div>'
    );
  }
  function cfk(label, key, val, type, full) {
    return (
      '<div class="field' +
      (full ? " full" : "") +
      '"><label>' +
      esc(label) +
      '</label><input type="' +
      (type || "text") +
      '" data-kyc="' +
      key +
      '" value="' +
      esc(val == null ? "" : val) +
      '"></div>'
    );
  }
  function cfkCheck(label, key, checked) {
    return (
      '<div class="field check"><input type="checkbox" data-kyc="' +
      key +
      '" id="kyc_' +
      key +
      '"' +
      (checked ? " checked" : "") +
      '><label for="kyc_' +
      key +
      '">' +
      esc(label) +
      "</label></div>"
    );
  }
  function updateKycBadges() {
    if (!modalEl) return;
    const get = (k) => {
      const e = modalEl.querySelector('[data-cf="' + k + '"]');
      return e ? e.value : "";
    };
    const type = get("type") || "company";
    const cc = get("address_cc") || "SE";
    const o = modalEl.querySelector("#cfOrgStatus");
    const v = modalEl.querySelector("#cfVatStatus");
    if (o) o.innerHTML = valBadge(C().validateIdNumber(get("orgnr"), type));
    if (v) v.innerHTML = valBadge(C().validateVat(get("vatNumber"), cc));
  }
  function cf(label, key, val, type, full) {
    return (
      '<div class="field' +
      (full ? " full" : "") +
      '"><label>' +
      esc(label) +
      '</label><input type="' +
      type +
      '" data-cf="' +
      key +
      '" value="' +
      esc(val == null ? "" : val) +
      '"></div>'
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     BOLAG
     ════════════════════════════════════════════════════════════════════ */
  function viewCompanies() {
    const companies = S().listCompanies();
    const active = S().getActiveCompany();
    const cards = companies
      .map(
        (c) =>
          '<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">' +
          "<div>" +
          (c.logo ? '<img src="' + esc(c.logo) + '" style="max-height:40px;margin-bottom:8px">' : "") +
          '<h2 style="margin:0">' +
          esc(c.name || "(namnlöst)") +
          (active && c.id === active.id ? ' <span class="badge sent">Aktivt</span>' : "") +
          "</h2>" +
          '<p class="muted small" style="margin:4px 0 0">' +
          esc([c.orgnr ? "Org.nr " + c.orgnr : "", c.vatNumber, c.form === "ab" && c.sate ? "Säte " + c.sate : ""].filter(Boolean).join("  ·  ")) +
          "</p></div>" +
          '<div class="btn-row">' +
          (active && c.id === active.id
            ? ""
            : '<button class="btn btn-ghost btn-sm" data-action="activate-company" data-id="' + c.id + '">Aktivera</button>') +
          '<button class="btn btn-ghost btn-sm" data-action="edit-company" data-id="' +
          c.id +
          '">Redigera</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="del-company" data-id="' +
          c.id +
          '">🗑</button>' +
          "</div></div></div>"
      )
      .join("");
    return (
      '<div class="page-head"><div><h1>Bolag</h1><p>Flera bolag kan använda samma app — varje faktura tillhör ett bolag.</p></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="new-company">+ Nytt bolag</button></div></div>' +
      (companies.length ? cards : '<div class="empty card"><p>Inga bolag ännu.</p><button class="btn btn-primary" data-action="new-company">+ Skapa bolag</button></div>')
    );
  }

  function companyForm(c) {
    const formOpt = (v, t) =>
      '<option value="' + v + '"' + (c.form === v ? " selected" : "") + ">" + t + "</option>";
    return (
      "<h2>" +
      (c.name ? "Redigera bolag" : "Nytt bolag") +
      "</h2>" +
      '<div class="logo-box" style="margin-bottom:16px">' +
      '<div class="logo-prev" id="logoPrev">' +
      (c.logo ? '<img src="' + esc(c.logo) + '">' : '<span class="muted small">logo</span>') +
      "</div>" +
      '<div><input type="file" accept="image/*" id="logoInput" class="small">' +
      (c.logo ? '<button class="btn btn-ghost btn-sm" data-action="clear-logo" style="margin-top:6px">Ta bort logo</button>' : "") +
      "</div></div>" +
      '<div class="form-grid">' +
      cf2("Bolagsnamn", "name", c.name, true) +
      '<div class="field"><label>Bolagsform</label><select data-co="form">' +
      formOpt("ab", "Aktiebolag") +
      formOpt("enskild", "Enskild firma") +
      formOpt("hb", "Handelsbolag") +
      formOpt("kb", "Kommanditbolag") +
      formOpt("ekforening", "Ekonomisk förening") +
      formOpt("other", "Annat") +
      "</select></div>" +
      cf2("Organisationsnummer", "orgnr", c.orgnr) +
      cf2("Momsregistreringsnummer", "vatNumber", c.vatNumber) +
      cf2("Säte (kommun)", "sate", c.sate) +
      '<div class="field check"><input type="checkbox" data-co-check="fskatt" id="co_fskatt"' +
      (c.fskatt ? " checked" : "") +
      '><label for="co_fskatt">Godkänd för F-skatt</label></div>' +
      cf2("Adress", "address.line1", c.address.line1, true) +
      cf2("Postnummer", "address.zip", c.address.zip) +
      cf2("Ort", "address.city", c.address.city) +
      cf2("E-post", "email", c.email) +
      cf2("Telefon", "phone", c.phone) +
      cf2("Webbplats", "website", c.website) +
      cf2("Bankgiro", "bankgiro", c.bankgiro) +
      cf2("Plusgiro", "plusgiro", c.plusgiro) +
      cf2("IBAN", "iban", c.iban) +
      cf2("BIC/SWIFT", "bic", c.bic) +
      cf2("Fakturanr-prefix", "invoicePrefix", c.invoicePrefix) +
      cf2("Nästa fakturanr", "nextInvoiceNo", c.nextInvoiceNo) +
      cf2("Betalningsvillkor (dagar)", "defaultTermsDays", c.defaultTermsDays) +
      '<div class="field full"><label>Standardtext dröjsmålsränta</label><textarea data-co="lateInterestText">' +
      esc(c.lateInterestText) +
      "</textarea></div>" +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Avbryt</button>' +
      '<button class="btn btn-primary" data-action="save-company" data-id="' +
      c.id +
      '">Spara bolag</button></div>'
    );
  }
  function cf2(label, key, val, full) {
    return (
      '<div class="field' +
      (full ? " full" : "") +
      '"><label>' +
      esc(label) +
      '</label><input type="text" data-co="' +
      key +
      '" value="' +
      esc(val == null ? "" : val) +
      '"></div>'
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     INSTÄLLNINGAR
     ════════════════════════════════════════════════════════════════════ */
  function viewSettings() {
    const st = S().getState().settings;
    const drive = st.drive;
    const driveConnected = Faktura.Drive.isConnected();
    return (
      '<div class="page-head"><div><h1>Inställningar</h1><p>E-post, molnsynk och säkerhetskopiering.</p></div></div>' +
      // ── EmailJS ──
      '<div class="card"><h2>✉️ E-post (EmailJS)</h2>' +
      '<p class="muted small">mailto fungerar direkt utan inställningar. Vill du skicka helautomatiskt med PDF-bilaga, koppla ett gratis EmailJS-konto.</p>' +
      '<div class="form-grid">' +
      sf("Public key", "emailjs.publicKey", st.emailjs.publicKey) +
      sf("Service ID", "emailjs.serviceId", st.emailjs.serviceId) +
      sf("Template ID", "emailjs.templateId", st.emailjs.templateId) +
      "</div>" +
      '<div class="info"><strong>Tips för EmailJS-mallen:</strong> använd variablerna ' +
      "<code>{{to_email}}</code>, <code>{{subject}}</code>, <code>{{message}}</code>, <code>{{from_name}}</code> " +
      "och lägg till en <em>Variable Attachment</em> kopplad till <code>{{content}}</code> med filnamn <code>{{filename}}</code>.</div>" +
      '<div class="btn-row"><button class="btn btn-primary" data-action="save-settings">Spara</button></div>' +
      "</div>" +
      // ── Google Drive ──
      '<div class="card"><h2>☁️ Google Drive-synk</h2>' +
      '<p class="muted small">Spara all data + PDF:er i ditt eget Google Drive. Varje bolag kan koppla sitt eget konto. Appen rör bara filer den själv skapar (' +
      "<code>drive.file</code>) — ingen Google-verifiering krävs.</p>" +
      '<div class="form-grid"><div class="field full"><label>Google OAuth Client-ID</label>' +
      '<input type="text" data-setting="drive.clientId" value="' +
      esc(drive.clientId) +
      '" placeholder="xxxxx.apps.googleusercontent.com"></div></div>' +
      (driveConnected
        ? '<div class="info">Ansluten som <strong>' +
          esc(drive.connectedEmail) +
          "</strong>" +
          (drive.lastSync ? " · senast synkad " + esc(drive.lastSync.slice(0, 16).replace("T", " ")) : "") +
          "</div>" +
          '<div class="field check"><input type="checkbox" data-setting-check="drive.autoSync" id="autosync"' +
          (drive.autoSync ? " checked" : "") +
          '><label for="autosync">Synka automatiskt vid ändringar</label></div>' +
          '<div class="btn-row">' +
          '<button class="btn" data-action="drive-up">⬆ Spara till Drive</button>' +
          '<button class="btn" data-action="drive-down">⬇ Hämta från Drive</button>' +
          '<button class="btn btn-ghost" data-action="drive-disconnect">Koppla från</button>' +
          "</div>"
        : '<div class="btn-row"><button class="btn btn-primary" data-action="save-settings">Spara Client-ID</button>' +
          '<button class="btn btn-coral" data-action="drive-connect">Anslut Google Drive</button></div>' +
          driveSetupInfo()) +
      "</div>" +
      // ── Backup ──
      '<div class="card"><h2>💾 Säkerhetskopiering (JSON)</h2>' +
      '<p class="muted small">All data ligger i din webbläsare. Exportera regelbundet, eller flytta mellan datorer.</p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-primary" data-action="export-json">⬇ Exportera all data</button>' +
      '<label class="btn btn-ghost" style="cursor:pointer">⬆ Importera<input type="file" accept="application/json" id="importInput" style="display:none"></label>' +
      '<button class="btn btn-ghost" data-action="wipe">Rensa allt</button>' +
      "</div></div>"
    );
  }
  function sf(label, key, val) {
    return (
      '<div class="field"><label>' +
      esc(label) +
      '</label><input type="text" data-setting="' +
      key +
      '" value="' +
      esc(val || "") +
      '"></div>'
    );
  }
  function driveSetupInfo() {
    return (
      '<div class="info"><strong>Engångssetup (ca 5 min):</strong>' +
      "<ol>" +
      '<li>Gå till <code>console.cloud.google.com</code> → skapa ett projekt.</li>' +
      "<li>Aktivera <strong>Google Drive API</strong>.</li>" +
      "<li>Skapa <strong>OAuth-klient-ID</strong> (typ: Webbapplikation).</li>" +
      "<li>Lägg sidans adress under <em>Authorized JavaScript origins</em> (t.ex. <code>" +
      esc(location.origin) +
      "</code>).</li>" +
      "<li>Klistra in klient-ID:t ovan och tryck <em>Anslut</em>.</li>" +
      "</ol></div>"
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     ACTIONS (delegerad click + input)
     ════════════════════════════════════════════════════════════════════ */
  function onClick(e) {
    // Öppna faktura genom radklick
    const openRow = e.target.closest("[data-open]");
    if (openRow && !e.target.closest("[data-action]")) {
      location.hash = "#/invoice/" + openRow.getAttribute("data-open");
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    const handler = actions[action];
    if (handler) {
      e.preventDefault();
      handler(id, btn);
    }
  }

  const actions = {
    "new-invoice": () => {
      if (!S().getActiveCompany()) return toast("Skapa ett bolag först.", "warn");
      location.hash = "#/invoice/new";
    },
    "back-invoices": () => (location.hash = "#/invoices"),
    "add-line": () => {
      const co = S().getCompany(draft.companyId);
      draft.lines.push(S().newLine({ vatRate: co ? co.defaultVatRate : 0.25 }));
      document.getElementById("linesWrap").innerHTML = linesHTML();
      refreshPreview();
    },
    "del-line": (idx) => {
      draft.lines.splice(parseInt(idx, 10), 1);
      if (draft.lines.length === 0) draft.lines.push(S().newLine());
      document.getElementById("linesWrap").innerHTML = linesHTML();
      refreshPreview();
    },
    "save-draft": () => {
      S().upsertInvoice(draft);
      toast("Utkast sparat.");
    },
    finalize: () => {
      const co = S().getCompany(draft.companyId);
      const cu = S().getCustomer(draft.customerId);
      const errs = C().validate(draft, co, cu).filter((i) => i.level === "error");
      if (errs.length) return toast("Åtgärda " + errs.length + " fel innan bokföring.", "err");
      S().assignNumber(draft);
      draft.status = "sent";
      S().upsertInvoice(draft);
      toast("Faktura " + draft.number + " bokförd.");
      app().innerHTML = editorHTML();
      refreshPreview();
    },
    "pdf-current": () => {
      ensureSavedDraft();
      try {
        Faktura.Pdf.download(draft, S().getCompany(draft.companyId), S().getCustomer(draft.customerId));
      } catch (err) {
        toast(err.message, "err");
      }
    },
    "print-current": () => {
      const co = S().getCompany(draft.companyId);
      const cu = S().getCustomer(draft.customerId);
      try {
        Faktura.Pdf.open(draft, co, cu);
      } catch (err) {
        toast(err.message, "err");
      }
    },
    "email-current": () => {
      ensureSavedDraft();
      emailFlow(draft);
    },
    pdf: (id) => {
      const inv = S().getInvoice(id);
      try {
        Faktura.Pdf.download(inv, S().getCompany(inv.companyId), S().getCustomer(inv.customerId));
      } catch (err) {
        toast(err.message, "err");
      }
    },
    email: (id) => emailFlow(S().getInvoice(id)),
    "mark-paid": (id) => {
      const inv = S().getInvoice(id);
      inv.status = "paid";
      if (!inv.paidDate) inv.paidDate = S().todayISO();
      S().upsertInvoice(inv);
      toast("Markerad som betald.");
      render();
    },
    "del-invoice": (id) => {
      if (!confirm("Radera fakturan permanent?")) return;
      S().deleteInvoice(id);
      toast("Faktura raderad.");
      render();
    },
    // — kunder —
    "new-customer": () => {
      const co = S().getActiveCompany();
      const c = S().newCustomer({ companyId: co ? co.id : null });
      openModal(customerForm(c));
    },
    "quick-customer": () => {
      const co = S().getCompany(draft.companyId);
      const c = S().newCustomer({ companyId: co ? co.id : null });
      openModal(customerForm(c));
    },
    "edit-customer": (id) => openModal(customerForm(S().getCustomer(id))),
    "save-customer": (id) => saveCustomer(id),
    "del-customer": (id) => {
      if (!confirm("Radera kunden?")) return;
      S().deleteCustomer(id);
      render();
    },
    // — bolag —
    "new-company": () => {
      pendingLogo = null;
      openModal(companyForm(S().newCompany()));
    },
    "edit-company": (id) => {
      pendingLogo = null;
      openModal(companyForm(S().getCompany(id)));
    },
    "save-company": (id) => saveCompany(id),
    "activate-company": (id) => {
      S().setActiveCompany(id);
      render();
    },
    "del-company": (id) => {
      if (!confirm("Radera bolaget och ALLA dess kunder och fakturor?")) return;
      S().deleteCompany(id);
      render();
    },
    "clear-logo": () => {
      const prev = document.getElementById("logoPrev");
      if (prev) prev.innerHTML = '<span class="muted small">logo</span>';
      pendingLogo = "";
    },
    "seed-demo": () => seedDemo(),
    // — bokföring —
    "bok-tab": (id) => {
      bokTab = id;
      render();
    },
    "bok-period": (id) => {
      const y = parseInt(bokFrom.slice(0, 4), 10) || parseInt(S().todayISO().slice(0, 4), 10);
      const q = { q1: ["01-01", "03-31"], q2: ["04-01", "06-30"], q3: ["07-01", "09-30"], q4: ["10-01", "12-31"] };
      if (id === "year") {
        bokFrom = y + "-01-01";
        bokTo = y + "-12-31";
      } else if (q[id]) {
        bokFrom = y + "-" + q[id][0];
        bokTo = y + "-" + q[id][1];
      }
      render();
    },
    "new-expense": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      openModal(expenseForm(S().newExpense({ companyId: co.id })));
    },
    "edit-expense": (id) => openModal(expenseForm(S().getExpense(id))),
    "save-expense": (id) => saveExpense(id),
    "del-expense": (id) => {
      if (!confirm("Radera utgiften?")) return;
      S().deleteExpense(id);
      render();
    },
    // — lön —
    "new-payroll": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      openModal(payrollForm(S().newPayroll({ companyId: co.id })));
    },
    "edit-payroll": (id) => openModal(payrollForm(S().getPayroll(id))),
    "save-payroll": (id) => savePayroll(id),
    "del-payroll": (id) => {
      if (!confirm("Radera lönekörningen?")) return;
      S().deletePayroll(id);
      render();
    },
    // — tillgångar —
    "new-asset": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      openModal(assetForm(S().newAsset({ companyId: co.id })));
    },
    "edit-asset": (id) => openModal(assetForm(S().getAsset(id))),
    "save-asset": (id) => saveAsset(id),
    "del-asset": (id) => {
      if (!confirm("Radera tillgången (inköp + avskrivningar försvinner ur bokföringen)?")) return;
      S().deleteAsset(id);
      render();
    },
    // — manuell verifikation —
    "new-manual": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      mvDraft = S().newManualVer({ companyId: co.id });
      openModal(manualForm());
    },
    "add-mv-line": () => {
      mvDraft.lines.push({ account: "", debit: 0, credit: 0 });
      openModal(manualForm());
    },
    "del-mv-line": (idx) => {
      mvDraft.lines.splice(parseInt(idx, 10), 1);
      if (mvDraft.lines.length < 2) mvDraft.lines.push({ account: "", debit: 0, credit: 0 });
      openModal(manualForm());
    },
    "save-manual": () => saveManual(),
    "del-manual": (id) => {
      if (!confirm("Radera den manuella verifikationen?")) return;
      S().deleteManualVer(id);
      render();
    },
    // — bank —
    "bank-match": (id, btn) => {
      const tgt = btn.getAttribute("data-tgt") || "";
      const sep = tgt.indexOf(":");
      const type = tgt.slice(0, sep);
      const targetId = tgt.slice(sep + 1);
      try {
        if (type === "invoice") Faktura.Bank.matchInvoice(id, targetId);
        else if (type === "expense") Faktura.Bank.matchExpense(id, targetId);
        toast("Transaktion matchad.");
        render();
      } catch (err) {
        toast(err.message, "err");
      }
    },
    "bank-categorize": (id) => {
      const sel = document.querySelector('[data-bank-acc="' + id + '"]');
      if (!sel || !sel.value) return toast("Välj ett konto först.", "warn");
      try {
        Faktura.Bank.categorize(id, sel.value);
        toast("Kategoriserad — verifikation skapad.");
        render();
      } catch (err) {
        toast(err.message, "err");
      }
    },
    "bank-unmatch": (id) => {
      Faktura.Bank.unmatch(id);
      toast("Matchning ångrad.");
      render();
    },
    "del-banktx": (id) => {
      if (!confirm("Radera banktransaktionen ur listan?")) return;
      S().deleteBankTx(id);
      render();
    },
    "export-audit": () => {
      const rows = [["Tidpunkt", "Händelse", "Detaljer", "Hash", "Föregående hash"]];
      S()
        .listAudit()
        .reverse()
        .forEach((e) => rows.push([e.ts, e.action, e.details, e.h, e.prev]));
      const csv =
        "﻿" +
        rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";")).join("\r\n");
      downloadText("revisionslogg-" + S().todayISO() + ".csv", csv, "text/csv");
      toast("Revisionslogg exporterad.");
    },
    // — årsavslut —
    "edit-bokslut": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      openModal(bokslutForm(Faktura.Ars.bokslutFor(co.id, bokFrom.slice(0, 4))));
    },
    "save-bokslut": (id) => saveBokslut(id),
    "dl-k2": () => {
      const co = S().getActiveCompany();
      if (!co) return;
      try {
        const year = bokFrom.slice(0, 4);
        Faktura.Ars.k2Pdf(co.id, year).save(Faktura.Ars.k2Filename(co.id, year));
        toast("Årsredovisning (K2) nedladdad.");
      } catch (err) {
        toast(err.message, "err");
      }
    },
    "dl-sru": () => {
      const co = S().getActiveCompany();
      if (!co) return;
      if (!co.orgnr) return toast("Bolaget saknar organisationsnummer.", "warn");
      const files = Faktura.Ars.sruFiles(co.id, bokFrom.slice(0, 4));
      downloadText("INFO.SRU", files.info, "text/plain");
      setTimeout(() => downloadText("BLANKETTER.SRU", files.blanketter, "text/plain"), 400);
      toast("SRU-filer nedladdade — testa i Skatteverkets testtjänst.");
    },
    "book-tax": () => {
      const co = S().getActiveCompany();
      if (!co) return;
      const t = Faktura.Ars.ink2Data(co.id, bokFrom.slice(0, 4));
      if (t.resterande <= 0) return toast("Ingen skatt kvar att bokföra.", "warn");
      S().upsertManualVer(
        S().newManualVer({
          companyId: co.id,
          date: bokTo,
          text: "Bokförd bolagsskatt " + bokFrom.slice(0, 4),
          lines: [
            { account: "8910", debit: t.resterande, credit: 0 },
            { account: "2510", debit: 0, credit: t.resterande },
          ],
        })
      );
      toast("Bolagsskatt " + C().num(t.resterande) + " kr bokförd.");
      render();
    },
    "export-sie": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Välj ett bolag först.", "warn");
      const sie = Faktura.Bok.exportSIE(co.id, bokFrom, bokTo);
      downloadText((co.name || "bokforing").replace(/[^\wåäöÅÄÖ]+/g, "-") + "-" + bokFrom + ".se", sie, "application/octet-stream");
      toast("SIE4-fil exporterad.");
    },
    "export-csv": () => {
      const co = S().getActiveCompany();
      if (!co) return toast("Välj ett bolag först.", "warn");
      const csv = "﻿" + Faktura.Bok.exportCSV(co.id, bokFrom, bokTo);
      downloadText("verifikationer-" + bokFrom + ".csv", csv, "text/csv");
      toast("CSV exporterad.");
    },
    // — inställningar —
    "save-settings": () => saveSettings(),
    "drive-connect": () => driveConnect(),
    "drive-disconnect": () => {
      Faktura.Drive.disconnect();
      toast("Frånkopplad.");
      render();
    },
    "drive-up": () => driveSync("up"),
    "drive-down": () => driveSync("down"),
    "export-json": () => exportJSON(),
    wipe: () => {
      if (!confirm("Detta raderar ALL data permanent. Säker?")) return;
      localStorage.removeItem(S().LS_KEY);
      S().replaceState(JSON.parse(JSON.stringify({ companies: [], customers: [], invoices: [], settings: {} })));
      location.hash = "#/";
      location.reload();
    },
    "close-modal": () => closeModal(),
  };

  function ensureSavedDraft() {
    S().upsertInvoice(draft);
  }

  /* ── Input-hantering (binding) ─────────────────────────────────────────── */
  function onInput(e) {
    const t = e.target;

    // Editor: faktura-fält
    if (t.hasAttribute("data-bind")) {
      const path = t.getAttribute("data-bind");
      let v = t.value;
      if (path === "termsDays") v = parseInt(v || 0, 10);
      setPath(draft, path, v);
      if (path === "invoiceDate" || path === "termsDays") {
        draft.dueDate = S().addDaysISO(draft.invoiceDate, draft.termsDays);
        const due = document.querySelector('[data-bind="dueDate"]');
        if (due) due.value = draft.dueDate;
      }
      if (path === "customerId") {
        const cu = S().getCustomer(v);
        if (cu && cu.reference && !draft.yourReference) {
          draft.yourReference = cu.reference;
          const yr = document.querySelector('[data-bind="yourReference"]');
          if (yr) yr.value = cu.reference;
        }
      }
      refreshPreview();
      return;
    }
    if (t.hasAttribute("data-bind-check")) {
      setPath(draft, t.getAttribute("data-bind-check"), t.checked);
      refreshPreview();
      return;
    }
    // Editor: radfält
    if (t.hasAttribute("data-line")) {
      const i = parseInt(t.getAttribute("data-line"), 10);
      const key = t.getAttribute("data-key");
      let v = t.value;
      if (key === "vatRate") v = parseFloat(v);
      draft.lines[i][key] = v;
      refreshPreview();
      return;
    }
    // Inställningar: spara direkt vid ändring
    if (t.hasAttribute("data-setting")) {
      setPath(S().getState().settings, t.getAttribute("data-setting"), t.value.trim());
      S().save();
      return;
    }
    if (t.hasAttribute("data-setting-check")) {
      setPath(S().getState().settings, t.getAttribute("data-setting-check"), t.checked);
      S().save();
      return;
    }
    // Manuell verifikation: huvudfält + rader (live-balans)
    if (t.hasAttribute("data-mv")) {
      mvDraft[t.getAttribute("data-mv")] = t.value;
      return;
    }
    if (t.hasAttribute("data-mvl")) {
      const i = parseInt(t.getAttribute("data-mvl"), 10);
      mvDraft.lines[i][t.getAttribute("data-key")] = t.value;
      const b = document.getElementById("mvBalance");
      if (b) b.textContent = mvBalanceText();
      return;
    }
    // Live-validering av org.nr / momsnr i kundformuläret
    if (t.hasAttribute("data-cf")) {
      const key = t.getAttribute("data-cf");
      if (key === "orgnr" || key === "type" || key === "vatNumber" || key === "address_cc")
        updateKycBadges();
    }
  }

  /* ── Spara kund ────────────────────────────────────────────────────────── */
  function saveCustomer(id) {
    const existing = S().getCustomer(id);
    const c = existing || S().newCustomer();
    c.id = id;
    modalEl.querySelectorAll("[data-cf]").forEach((inp) => {
      const key = inp.getAttribute("data-cf");
      if (key === "address_cc") c.countryCode = (inp.value || "SE").toUpperCase();
      else setPath(c, key, inp.value);
    });
    // KYC / kundkännedom
    if (!c.kyc) c.kyc = S().newCustomer().kyc;
    modalEl.querySelectorAll("[data-kyc]").forEach((inp) => {
      const key = inp.getAttribute("data-kyc");
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (key === "creditLimit") v = C().toNum(v);
      c.kyc[key] = v;
    });
    if (c.kyc.completed && !c.kyc.completedDate) c.kyc.completedDate = S().todayISO();
    if (!c.name) return toast("Kunden behöver ett namn.", "warn");
    if (!c.companyId) {
      const co = S().getActiveCompany();
      c.companyId = co ? co.id : null;
    }
    S().upsertCustomer(c);
    closeModal();
    toast("Kund sparad.");
    // Om vi står i editorn, uppdatera kundlistan.
    if (currentRoute().name === "invoice") {
      draft.customerId = c.id;
      app().innerHTML = editorHTML();
      refreshPreview();
    } else {
      render();
    }
  }

  /* ── Spara bolag ───────────────────────────────────────────────────────── */
  let pendingLogo = null;
  function saveCompany(id) {
    const existing = S().getCompany(id);
    const c = existing || S().newCompany();
    c.id = id;
    modalEl.querySelectorAll("[data-co]").forEach((inp) => {
      const key = inp.getAttribute("data-co");
      let v = inp.value;
      if (key === "nextInvoiceNo" || key === "defaultTermsDays") v = parseInt(v || 0, 10) || 0;
      setPath(c, key, v);
    });
    const fskatt = modalEl.querySelector('[data-co-check="fskatt"]');
    if (fskatt) c.fskatt = fskatt.checked;
    if (pendingLogo !== null) c.logo = pendingLogo;
    pendingLogo = null;
    if (!c.name) return toast("Bolaget behöver ett namn.", "warn");
    S().upsertCompany(c);
    closeModal();
    toast("Bolag sparat.");
    render();
  }

  /* ── E-post-flöde (val mellan mailto / EmailJS) ────────────────────────── */
  function emailFlow(inv) {
    const co = S().getCompany(inv.companyId);
    const cu = S().getCustomer(inv.customerId);
    if (!cu) return toast("Välj en kund först.", "warn");
    if (!cu.email) return toast("Kunden saknar e-postadress.", "warn");
    const hasEjs = Faktura.Email.emailjsConfigured();

    const html =
      "<h2>Skicka faktura</h2>" +
      "<p>Till <strong>" +
      esc(cu.email) +
      "</strong></p>" +
      '<div class="btn-row" style="flex-direction:column;align-items:stretch;gap:10px;margin-top:14px">' +
      (hasEjs
        ? '<button class="btn btn-coral" data-action="send-ejs">✉️ Skicka automatiskt (EmailJS, med PDF)</button>'
        : "") +
      '<button class="btn btn-primary" data-action="send-mailto">📧 Öppna i e-postprogram (PDF laddas ner)</button>' +
      (Faktura.Drive.isConnected()
        ? '<button class="btn btn-ghost" data-action="send-drive">☁️ Spara PDF i Drive</button>'
        : "") +
      "</div>" +
      (!hasEjs
        ? '<p class="muted small" style="margin-top:12px">Tips: konfigurera EmailJS i Inställningar för helautomatiskt utskick.</p>'
        : "") +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">Stäng</button></div>';
    const m = openModal(html);
    m.querySelector('[data-action="send-mailto"]').onclick = () => {
      markSentIfDraft(inv);
      Faktura.Email.sendMailto(inv, co, cu);
      closeModal();
      toast("E-postprogram öppnat — bifoga den nedladdade PDF:en.");
      if (currentRoute().name === "invoice") {
        app().innerHTML = editorHTML();
        refreshPreview();
      } else render();
    };
    const ejsBtn = m.querySelector('[data-action="send-ejs"]');
    if (ejsBtn)
      ejsBtn.onclick = async () => {
        ejsBtn.disabled = true;
        ejsBtn.textContent = "Skickar …";
        try {
          markSentIfDraft(inv);
          await Faktura.Email.sendEmailJS(inv, co, cu);
          closeModal();
          toast("Faktura skickad till " + cu.email + ".");
          render();
        } catch (err) {
          toast(err.message, "err");
          ejsBtn.disabled = false;
          ejsBtn.textContent = "✉️ Skicka automatiskt (EmailJS, med PDF)";
        }
      };
    const driveBtn = m.querySelector('[data-action="send-drive"]');
    if (driveBtn)
      driveBtn.onclick = async () => {
        driveBtn.disabled = true;
        try {
          const res = await Faktura.Drive.uploadPdf(inv, co, cu);
          closeModal();
          toast("PDF sparad i Drive.");
        } catch (err) {
          toast(err.message, "err");
          driveBtn.disabled = false;
        }
      };
  }

  function markSentIfDraft(inv) {
    if (inv.status === "draft") {
      S().assignNumber(inv);
      inv.status = "sent";
      S().upsertInvoice(inv);
      if (draft && draft.id === inv.id) draft = inv;
    }
  }

  /* ── Inställningar ─────────────────────────────────────────────────────── */
  function saveSettings() {
    const st = S().getState().settings;
    document.querySelectorAll("[data-setting]").forEach((inp) => {
      setPath(st, inp.getAttribute("data-setting"), inp.value.trim());
    });
    document.querySelectorAll("[data-setting-check]").forEach((inp) => {
      setPath(st, inp.getAttribute("data-setting-check"), inp.checked);
    });
    S().save();
    toast("Inställningar sparade.");
    render();
  }

  async function driveConnect() {
    saveSettings(); // spara ev. inskrivet client-ID först
    if (!Faktura.Drive.isConfigured()) return toast("Ange Google Client-ID först.", "warn");
    try {
      toast("Öppnar Google-inloggning …");
      const email = await Faktura.Drive.connect();
      toast("Ansluten som " + email);
      // Försök hämta befintlig data.
      try {
        await Faktura.Drive.syncDown();
        toast("Data hämtad från Drive.");
      } catch (e) {
        await Faktura.Drive.syncUp();
        toast("Data sparad till Drive.");
      }
      render();
    } catch (err) {
      toast("Anslutning misslyckades: " + err.message, "err");
    }
  }

  async function driveSync(dir) {
    try {
      if (dir === "up") {
        await Faktura.Drive.syncUp();
        toast("Sparat till Drive.");
      } else {
        await Faktura.Drive.syncDown();
        toast("Hämtat från Drive.");
      }
      render();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  /* ── Export / import / demo ────────────────────────────────────────────── */
  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const blob = new Blob([S().exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "faktura-backup-" + S().todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exporterad.");
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S().importJSON(reader.result, false);
        toast("Data importerad.");
        render();
      } catch (e) {
        toast("Kunde inte läsa filen: " + e.message, "err");
      }
    };
    reader.readAsText(file);
  }

  function seedDemo() {
    const co = S().newCompany({
      name: "Exempel Konsult AB",
      form: "ab",
      orgnr: "556677-8899",
      sate: "Stockholm",
      vatNumber: "SE556677889901",
      fskatt: true,
      address: { line1: "Storgatan 1", line2: "", zip: "111 22", city: "Stockholm", country: "Sverige" },
      email: "faktura@exempelkonsult.se",
      phone: "08-123 45 67",
      bankgiro: "123-4567",
      invoicePrefix: "2026-",
      nextInvoiceNo: 1,
    });
    S().upsertCompany(co);
    S().setActiveCompany(co.id);
    const cu = S().newCustomer({
      companyId: co.id,
      type: "company",
      name: "Kundföretaget AB",
      orgnr: "559900-1122",
      email: "ekonomi@kundforetaget.se",
      reference: "Anna Andersson",
      address: { line1: "Kungsgatan 5", zip: "411 19", city: "Göteborg", country: "Sverige" },
    });
    S().upsertCustomer(cu);
    const inv = S().newInvoice(co, { customerId: cu.id, yourReference: "Anna Andersson" });
    inv.lines = [
      S().newLine({ description: "Konsultarbete, systemutveckling", quantity: 24, unit: "tim", unitPrice: 1150, vatRate: 0.25 }),
      S().newLine({ description: "Projektledning", quantity: 8, unit: "tim", unitPrice: 1350, vatRate: 0.25 }),
    ];
    S().upsertInvoice(inv);
    toast("Exempelbolag skapat.");
    location.hash = "#/";
    render();
  }

  /* ── Övriga DOM-events ─────────────────────────────────────────────────── */
  function onChange(e) {
    const t = e.target;
    if (t.id === "companySwitch") {
      S().setActiveCompany(t.value);
      render();
      return;
    }
    if (t.id === "bokFrom") {
      bokFrom = t.value;
      render();
      return;
    }
    if (t.id === "bokTo") {
      bokTo = t.value;
      render();
      return;
    }
    if (t.id === "logoInput" && t.files && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        pendingLogo = reader.result;
        const prev = document.getElementById("logoPrev");
        if (prev) prev.innerHTML = '<img src="' + reader.result + '">';
      };
      reader.readAsDataURL(t.files[0]);
      return;
    }
    if (t.id === "importInput" && t.files && t.files[0]) {
      importFile(t.files[0]);
      return;
    }
    if (t.id === "bankCsvInput" && t.files && t.files[0]) {
      const co = S().getActiveCompany();
      if (!co) return toast("Skapa ett bolag först.", "warn");
      const file = t.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const res = Faktura.Bank.importCSV(co.id, reader.result, file.name);
          toast(res.imported + " transaktioner importerade" + (res.skipped ? " (" + res.skipped + " överhoppade)" : "") + ".");
          render();
        } catch (e2) {
          toast(e2.message, "err");
        }
      };
      reader.readAsText(file, "utf-8");
      return;
    }
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  function init() {
    S().load();
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    window.addEventListener("hashchange", render);
    render();
  }

  Faktura.App = { init, render, toast };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
