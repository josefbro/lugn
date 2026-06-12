/* ════════════════════════════════════════════════════════════════════════
   Faktura — bankimport & avstämning
   Importerar CSV-export från banken (SEB, Swedbank, Handelsbanken,
   Nordea m.fl. — kolumner auto-detekteras), matchar inbetalningar mot
   öppna kundfakturor och utbetalningar mot obetalda utgifter, eller
   kategoriserar direkt mot BAS-konto (skapar verifikation mot 1930).
   Alla åtgärder loggas i revisionsloggen.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const C = () => Faktura.Compute;
  const S = () => Faktura.Store;
  const r2 = (x) => C().round2(x);

  /* ── CSV-parser (hanterar ; eller , citattecken och BOM) ──────────────── */
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (!lines.length) return { headers: [], rows: [] };
    const sep =
      (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
    const parseLine = (line) => {
      const out = [];
      let cur = "",
        q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else q = false;
          } else cur += c;
        } else if (c === '"') q = true;
        else if (c === sep) {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
  }

  /* ── Kolumndetektering ────────────────────────────────────────────────── */
  function detectColumns(headers) {
    const H = headers.map((h) => String(h).toLowerCase());
    const find = (cands) => {
      for (let j = 0; j < cands.length; j++) {
        const i = H.findIndex((h) => h.indexOf(cands[j]) >= 0);
        if (i >= 0) return i;
      }
      return -1;
    };
    return {
      date: find(["bokföringsdatum", "bokford", "transaktionsdatum", "transaktionsdag", "datum", "date"]),
      amount: find(["belopp", "amount", "summa"]),
      text: find(["text", "beskrivning", "meddelande", "rubrik", "referens", "mottagare", "specifikation", "transaktion"]),
    };
  }

  function parseAmount(s) {
    s = String(s || "")
      .replace(/[\s  ]/g, "")
      .replace(/kr|sek/gi, "");
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  function parseDate(s) {
    s = String(s || "").trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = s.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})/))) return m[3] + "-" + m[2] + "-" + m[1];
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + "-" + m[2] + "-" + m[3];
    return "";
  }

  /* ── Import ───────────────────────────────────────────────────────────── */
  function importCSV(companyId, text, sourceNote) {
    const parsed = parseCSV(text);
    if (!parsed.rows.length) throw new Error("CSV-filen verkar vara tom.");
    const cols = detectColumns(parsed.headers);
    if (cols.date < 0 || cols.amount < 0)
      throw new Error(
        "Hittade inte kolumner för datum och belopp. Kontrollera att filen har en rubrikrad (t.ex. Bokföringsdatum;Belopp;Text)."
      );

    const existingKeys = {};
    S().listBankTx(companyId).forEach((t) => (existingKeys[t.dedupeKey] = true));

    const news = [];
    let skipped = 0;
    parsed.rows.forEach((row) => {
      const date = parseDate(row[cols.date]);
      const amount = parseAmount(row[cols.amount]);
      const txt = cols.text >= 0 ? row[cols.text] : "";
      if (!date || isNaN(amount) || amount === 0) {
        skipped++;
        return;
      }
      const key = date + "|" + amount.toFixed(2) + "|" + txt;
      if (existingKeys[key]) {
        skipped++;
        return;
      }
      existingKeys[key] = true;
      news.push({
        id: S().uid("btx"),
        companyId: companyId,
        date: date,
        amount: r2(amount),
        text: txt,
        dedupeKey: key,
        matched: null, // {type:'invoice'|'expense'|'account', ...}
      });
    });
    if (news.length) S().bulkAddBankTx(news, sourceNote);
    return { imported: news.length, skipped: skipped };
  }

  /* ── Matchningsförslag ────────────────────────────────────────────────── */
  function expenseTotal(e) {
    const net = C().toNum(e.net);
    return r2(net + r2(net * C().toNum(e.vatRate)));
  }

  function suggestFor(tx) {
    const out = [];
    if (tx.amount > 0) {
      S()
        .listInvoices(tx.companyId)
        .filter((i) => i.status === "sent")
        .forEach((i) => {
          if (Math.abs(C().compute(i).total - tx.amount) < 0.5) {
            const cu = S().getCustomer(i.customerId);
            out.push({ type: "invoice", id: i.id, label: "Faktura " + i.number + (cu ? " (" + cu.name + ")" : "") });
          }
        });
    } else {
      S()
        .listExpenses(tx.companyId)
        .filter((e) => !e.paid)
        .forEach((e) => {
          if (Math.abs(expenseTotal(e) + tx.amount) < 0.5) {
            out.push({ type: "expense", id: e.id, label: "Utgift " + (e.supplier || e.description || "") });
          }
        });
    }
    return out.slice(0, 3);
  }

  /* ── Matchning / kategorisering / ångra ───────────────────────────────── */
  function matchInvoice(txId, invoiceId) {
    const tx = S().getBankTx(txId);
    const inv = S().getInvoice(invoiceId);
    if (!tx || !inv) throw new Error("Transaktion eller faktura saknas.");
    inv.status = "paid";
    inv.paidDate = tx.date;
    S().upsertInvoice(inv);
    tx.matched = { type: "invoice", id: inv.id, label: "Faktura " + inv.number };
    S().upsertBankTx(tx);
    S().audit("Bankmatchning", tx.date + " " + C().num(tx.amount) + " kr → faktura " + inv.number);
    S().save();
    return tx;
  }

  function matchExpense(txId, expenseId) {
    const tx = S().getBankTx(txId);
    const exp = S().getExpense(expenseId);
    if (!tx || !exp) throw new Error("Transaktion eller utgift saknas.");
    exp.paid = true;
    exp.paymentDate = tx.date;
    S().upsertExpense(exp);
    tx.matched = { type: "expense", id: exp.id, label: "Utgift " + (exp.supplier || "") };
    S().upsertBankTx(tx);
    S().audit("Bankmatchning", tx.date + " " + C().num(tx.amount) + " kr → utgift " + (exp.supplier || exp.id));
    S().save();
    return tx;
  }

  /* Kategorisera mot BAS-konto: skapar verifikation mot 1930. */
  function categorize(txId, account) {
    const tx = S().getBankTx(txId);
    if (!tx) throw new Error("Transaktionen saknas.");
    if (!account) throw new Error("Välj ett konto.");
    const amt = Math.abs(tx.amount);
    const mv = S().newManualVer({
      companyId: tx.companyId,
      date: tx.date,
      text: "Bank: " + (tx.text || "kategoriserad transaktion"),
      lines:
        tx.amount > 0
          ? [
              { account: "1930", debit: amt, credit: 0 },
              { account: String(account), debit: 0, credit: amt },
            ]
          : [
              { account: String(account), debit: amt, credit: 0 },
              { account: "1930", debit: 0, credit: amt },
            ],
    });
    S().upsertManualVer(mv);
    tx.matched = {
      type: "account",
      account: String(account),
      verId: mv.id,
      label: account + " " + (Faktura.Bok.accountName(account) || ""),
    };
    S().upsertBankTx(tx);
    S().audit("Bankkategorisering", tx.date + " " + C().num(tx.amount) + " kr → konto " + account);
    S().save();
    return tx;
  }

  function unmatch(txId) {
    const tx = S().getBankTx(txId);
    if (!tx || !tx.matched) return;
    const m = tx.matched;
    if (m.type === "invoice") {
      const inv = S().getInvoice(m.id);
      if (inv) {
        inv.status = "sent";
        inv.paidDate = "";
        S().upsertInvoice(inv);
      }
    } else if (m.type === "expense") {
      const exp = S().getExpense(m.id);
      if (exp) {
        exp.paid = false;
        exp.paymentDate = "";
        S().upsertExpense(exp);
      }
    } else if (m.type === "account" && m.verId) {
      S().deleteManualVer(m.verId);
    }
    tx.matched = null;
    S().upsertBankTx(tx);
    S().audit("Bankmatchning ångrad", tx.date + " " + C().num(tx.amount) + " kr");
    S().save();
    return tx;
  }

  Faktura.Bank = {
    parseCSV,
    detectColumns,
    parseAmount,
    parseDate,
    importCSV,
    suggestFor,
    matchInvoice,
    matchExpense,
    categorize,
    unmatch,
  };
})();
