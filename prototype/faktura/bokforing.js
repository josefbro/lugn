/* ════════════════════════════════════════════════════════════════════════
   Faktura — bokföring
   Genererar verifikationer (dubbel bokföring, BAS-konton) från bokförda
   fakturor, betalningar och utgifter. Bygger huvudbok, momsrapport (mot
   Skatteverkets rutor), resultaträkning samt SIE4- och CSV-export.

   Förenklingar: en verifikationsserie, datumsorterad numrering, fokus på
   svensk inrikeshandel + omvänd skattskyldighet + momsfritt. EU-handel är
   förenklad. Detta är ett praktiskt underlag/exportverktyg — stäm av med
   din redovisningskonsult innan deklaration.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const C = () => Faktura.Compute;
  const S = () => Faktura.Store;

  /* ── BAS-kontoplan (delmängd) ─────────────────────────────────────────── */
  const ACCOUNTS = {
    1510: "Kundfordringar",
    1930: "Företagskonto / bank",
    2440: "Leverantörsskulder",
    2611: "Utgående moms 25 %",
    2621: "Utgående moms 12 %",
    2631: "Utgående moms 6 %",
    2640: "Ingående moms",
    3001: "Försäljning 25 % moms",
    3002: "Försäljning 12 % moms",
    3003: "Försäljning 6 % moms",
    3004: "Försäljning momsfri",
    3231: "Försäljning omvänd skattskyldighet",
    3105: "Försäljning varor/tjänster annat EU-land",
    3740: "Öresavrundning",
    4000: "Varuinköp / material",
    5000: "Lokalkostnader",
    5400: "Förbrukningsinventarier & material",
    5800: "Resekostnader",
    6000: "Övriga externa kostnader",
    6540: "IT-tjänster",
    6570: "Bankkostnader",
  };

  // Kostnadskategorier (utgifter) som visas i UI.
  const EXPENSE_ACCOUNTS = ["4000", "5000", "5400", "5800", "6000", "6540", "6570"];

  function accountName(no) {
    return ACCOUNTS[no] || "";
  }

  /* ── Kontoval för en momssats ─────────────────────────────────────────── */
  function salesAccount(rate, inv) {
    if (inv.reverseCharge) return "3231";
    if (inv.vatExempt) return "3004";
    if (Math.abs(rate - 0.25) < 1e-6) return "3001";
    if (Math.abs(rate - 0.12) < 1e-6) return "3002";
    if (Math.abs(rate - 0.06) < 1e-6) return "3003";
    return "3004"; // 0 % inrikes
  }
  function vatAccount(rate) {
    if (Math.abs(rate - 0.25) < 1e-6) return "2611";
    if (Math.abs(rate - 0.12) < 1e-6) return "2621";
    if (Math.abs(rate - 0.06) < 1e-6) return "2631";
    return null;
  }

  const r2 = (x) => C().round2(x);

  /* ── Verifikation för en såld faktura ─────────────────────────────────── */
  function saleVer(inv, customer) {
    const comp = C().compute(inv);
    const lines = [];
    // Kundfordran (debet) = totalbelopp inkl moms och öresavrundning
    lines.push({ account: "1510", debit: comp.total, credit: 0 });
    // Försäljning per momssats (kredit) + utgående moms (kredit)
    comp.vatGroups.forEach((g) => {
      lines.push({ account: salesAccount(g.rate, inv), debit: 0, credit: g.base });
      const va = vatAccount(g.rate);
      if (va && g.vat) lines.push({ account: va, debit: 0, credit: g.vat });
    });
    // Öresavrundning
    if (comp.rounding) {
      if (comp.rounding > 0) lines.push({ account: "3740", debit: 0, credit: comp.rounding });
      else lines.push({ account: "3740", debit: -comp.rounding, credit: 0 });
    }
    return {
      date: inv.invoiceDate,
      text: "Faktura " + (inv.number || "(utkast)") + " " + (customer ? customer.name : ""),
      lines: lines,
      kind: "sale",
      source: inv.id,
    };
  }

  function paymentVer(inv) {
    const comp = C().compute(inv);
    const date = inv.paidDate || inv.dueDate || inv.invoiceDate;
    return {
      date: date,
      text: "Betalning faktura " + (inv.number || ""),
      lines: [
        { account: "1930", debit: comp.total, credit: 0 },
        { account: "1510", debit: 0, credit: comp.total },
      ],
      kind: "payment",
      source: inv.id,
    };
  }

  function expenseVer(exp) {
    const net = C().toNum(exp.net);
    const vat = r2(net * C().toNum(exp.vatRate));
    const total = r2(net + vat);
    const lines = [{ account: exp.account || "6000", debit: net, credit: 0 }];
    if (vat) lines.push({ account: "2640", debit: vat, credit: 0 });
    lines.push({ account: "2440", debit: 0, credit: total });
    return {
      date: exp.date,
      text: (exp.supplier || "Utgift") + (exp.description ? " – " + exp.description : ""),
      lines: lines,
      kind: "expense",
      source: exp.id,
    };
  }

  function expensePaymentVer(exp) {
    const net = C().toNum(exp.net);
    const total = r2(net + r2(net * C().toNum(exp.vatRate)));
    return {
      date: exp.paymentDate || exp.date,
      text: "Betalning " + (exp.supplier || "utgift"),
      lines: [
        { account: "2440", debit: total, credit: 0 },
        { account: "1930", debit: 0, credit: total },
      ],
      kind: "expense-payment",
      source: exp.id,
    };
  }

  /* ── Alla verifikationer i en period ──────────────────────────────────── */
  function verifications(companyId, from, to) {
    const invoices = S().listInvoices(companyId).filter((i) => i.status === "sent" || i.status === "paid");
    const expenses = S().listExpenses(companyId);
    let vers = [];
    invoices.forEach((inv) => {
      const cu = S().getCustomer(inv.customerId);
      vers.push(saleVer(inv, cu));
      if (inv.status === "paid") vers.push(paymentVer(inv));
    });
    expenses.forEach((exp) => {
      vers.push(expenseVer(exp));
      if (exp.paid) vers.push(expensePaymentVer(exp));
    });
    if (from) vers = vers.filter((v) => v.date >= from);
    if (to) vers = vers.filter((v) => v.date <= to);
    // Datumsortering + sekvensnummer
    vers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    vers.forEach((v, i) => {
      v.no = i + 1;
      v.debit = r2(v.lines.reduce((s, l) => s + l.debit, 0));
      v.credit = r2(v.lines.reduce((s, l) => s + l.credit, 0));
      v.balanced = Math.abs(v.debit - v.credit) < 0.005;
    });
    return vers;
  }

  /* ── Huvudbok (per konto) ─────────────────────────────────────────────── */
  function ledger(companyId, from, to) {
    const vers = verifications(companyId, from, to);
    const accounts = {};
    vers.forEach((v) => {
      v.lines.forEach((l) => {
        if (!accounts[l.account])
          accounts[l.account] = { account: l.account, name: accountName(l.account), debit: 0, credit: 0, rows: [] };
        const a = accounts[l.account];
        a.debit += l.debit;
        a.credit += l.credit;
        a.rows.push({ no: v.no, date: v.date, text: v.text, debit: l.debit, credit: l.credit });
      });
    });
    return Object.values(accounts)
      .map((a) => {
        a.debit = r2(a.debit);
        a.credit = r2(a.credit);
        a.balance = r2(a.debit - a.credit);
        return a;
      })
      .sort((a, b) => Number(a.account) - Number(b.account));
  }

  /* ── Momsrapport (Skatteverkets rutor) ────────────────────────────────── */
  function vatReport(companyId, from, to) {
    const invoices = S().listInvoices(companyId).filter((i) => i.status === "sent" || i.status === "paid");
    const expenses = S().listExpenses(companyId);
    const rep = {
      base25: 0, base12: 0, base6: 0,
      out25: 0, out12: 0, out6: 0,
      reverseSales: 0, exemptSales: 0, euSales: 0,
      inVat: 0,
    };
    invoices
      .filter((i) => (!from || i.invoiceDate >= from) && (!to || i.invoiceDate <= to))
      .forEach((inv) => {
        const comp = C().compute(inv);
        if (inv.reverseCharge) {
          rep.reverseSales += comp.net;
          return;
        }
        if (inv.vatExempt) {
          rep.exemptSales += comp.net;
          return;
        }
        comp.vatGroups.forEach((g) => {
          if (Math.abs(g.rate - 0.25) < 1e-6) { rep.base25 += g.base; rep.out25 += g.vat; }
          else if (Math.abs(g.rate - 0.12) < 1e-6) { rep.base12 += g.base; rep.out12 += g.vat; }
          else if (Math.abs(g.rate - 0.06) < 1e-6) { rep.base6 += g.base; rep.out6 += g.vat; }
          else { rep.exemptSales += g.base; }
        });
      });
    expenses
      .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      .forEach((e) => {
        rep.inVat += r2(C().toNum(e.net) * C().toNum(e.vatRate));
      });
    // Avrunda
    Object.keys(rep).forEach((k) => (rep[k] = r2(rep[k])));
    rep.box05 = r2(rep.base25 + rep.base12 + rep.base6); // beskattningsunderlag (momspliktig försäljning)
    rep.box10 = rep.out25;
    rep.box11 = rep.out12;
    rep.box12 = rep.out6;
    rep.box41 = rep.reverseSales; // försäljning omvänd skattskyldighet
    rep.box42 = rep.exemptSales; // övrig momsfri försäljning
    rep.outVatTotal = r2(rep.out25 + rep.out12 + rep.out6); // ruta 49-del: utgående moms
    rep.box48 = rep.inVat; // ingående moms att dra av
    rep.box49 = r2(rep.outVatTotal - rep.inVat); // moms att betala (+) / få tillbaka (−)
    return rep;
  }

  /* ── Resultaträkning (enkel) ──────────────────────────────────────────── */
  function income(companyId, from, to) {
    const invoices = S().listInvoices(companyId).filter((i) => i.status === "sent" || i.status === "paid");
    const expenses = S().listExpenses(companyId);
    let revenue = 0, rounding = 0, costs = 0;
    invoices
      .filter((i) => (!from || i.invoiceDate >= from) && (!to || i.invoiceDate <= to))
      .forEach((inv) => {
        const comp = C().compute(inv);
        revenue += comp.net;
        rounding += comp.rounding;
      });
    expenses
      .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      .forEach((e) => (costs += C().toNum(e.net)));
    revenue = r2(revenue + rounding);
    costs = r2(costs);
    return { revenue: revenue, costs: costs, result: r2(revenue - costs) };
  }

  /* ── SIE4-export ──────────────────────────────────────────────────────── */
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function sieDate(iso) {
    return iso ? iso.replace(/-/g, "") : "";
  }
  function sieAmount(x) {
    return (Math.round(x * 100) / 100).toFixed(2);
  }
  function q(s) {
    return '"' + String(s || "").replace(/"/g, "'") + '"';
  }

  function exportSIE(companyId, from, to) {
    const co = S().getCompany(companyId);
    const vers = verifications(companyId, from, to);
    // Konton som används
    const usedAccounts = {};
    vers.forEach((v) => v.lines.forEach((l) => (usedAccounts[l.account] = true)));

    const out = [];
    out.push("#FLAGGA 0");
    out.push("#PROGRAM " + q("Lugn Faktura") + " " + q("1.0"));
    out.push("#FORMAT PC8");
    out.push("#GEN " + sieDate(S().todayISO()));
    out.push("#SIETYP 4");
    if (co && co.orgnr) out.push("#ORGNR " + co.orgnr.replace(/\D/g, ""));
    if (co) out.push("#FNAMN " + q(co.name));
    const yStart = from || (S().todayISO().slice(0, 4) + "-01-01");
    const yEnd = to || (S().todayISO().slice(0, 4) + "-12-31");
    out.push("#RAR 0 " + sieDate(yStart) + " " + sieDate(yEnd));
    Object.keys(usedAccounts)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((a) => out.push("#KONTO " + a + " " + q(accountName(a))));
    // Verifikationer
    vers.forEach((v) => {
      out.push("#VER " + q("A") + " " + q(v.no) + " " + sieDate(v.date) + " " + q(v.text));
      out.push("{");
      v.lines.forEach((l) => {
        const amount = sieAmount(l.debit - l.credit); // debet +, kredit −
        out.push("   #TRANS " + l.account + " {} " + amount);
      });
      out.push("}");
    });
    return out.join("\r\n") + "\r\n";
  }

  /* ── CSV-export av verifikationer ─────────────────────────────────────── */
  function exportCSV(companyId, from, to) {
    const vers = verifications(companyId, from, to);
    const rows = [["Ver", "Datum", "Konto", "Kontonamn", "Debet", "Kredit", "Text"]];
    vers.forEach((v) => {
      v.lines.forEach((l) => {
        rows.push([
          v.no,
          v.date,
          l.account,
          accountName(l.account),
          l.debit ? sieAmount(l.debit) : "",
          l.credit ? sieAmount(l.credit) : "",
          v.text,
        ]);
      });
    });
    return rows
      .map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";"))
      .join("\r\n");
  }

  Faktura.Bok = {
    ACCOUNTS,
    EXPENSE_ACCOUNTS,
    accountName,
    verifications,
    ledger,
    vatReport,
    income,
    exportSIE,
    exportCSV,
  };
})();
