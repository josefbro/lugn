/* ════════════════════════════════════════════════════════════════════════
   Faktura — Årsredovisning (K2) och Inkomstdeklaration 2 (INK2)

   K2: årsredovisning enligt BFNAR 2016:10 för mindre aktiebolag —
   förvaltningsberättelse, resultaträkning, balansräkning, noter och
   underskrifter, genererad som PDF.

   INK2: räkenskapsschema (INK2R) och skattemässiga justeringar (INK2S)
   med SRU-fältkoder, samt export av INFO.SRU + BLANKETTER.SRU för
   Skatteverkets filöverföring.

   SRU-fältkoder verifierade 2026-06 mot srufiler.se, edeklarera.se och
   mycorp.se (standard BAS→SRU-koppling). Testa alltid filerna i
   Skatteverkets testtjänst före skarp inlämning.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const C = () => Faktura.Compute;
  const S = () => Faktura.Store;
  const B = () => Faktura.Bok;
  const r2 = (x) => C().round2(x);
  const kr = (x) => Math.round(x || 0); // hela kronor i deklarationen

  function bokslutFor(companyId, year) {
    return (
      S().getBokslutFor(companyId, String(year)) ||
      S().newBokslut({ companyId: companyId, year: String(year) })
    );
  }

  /* ── Balansposter per bokslutsdag (ackumulerat från bokföringens start) ── */
  function balSums(companyId, to) {
    const led = B().ledger(companyId, null, to);
    const sum = (lo, hi, side) =>
      r2(
        led
          .filter((a) => {
            const n = Number(a.account);
            return n >= lo && n <= hi;
          })
          .reduce((s, a) => s + (side === "credit" ? a.credit - a.debit : a.debit - a.credit), 0)
      );
    return {
      inventarier: sum(1200, 1299, "debit"),
      kundfordringar: sum(1500, 1599, "debit"),
      ovrigaFordringar: sum(1600, 1799, "debit"),
      kassaBank: sum(1800, 1999, "debit"),
      aktiekapital: sum(2080, 2089, "credit"),
      frittBokfort: sum(2090, 2099, "credit"),
      levSkulder: sum(2440, 2449, "credit"),
      skatteskulder: sum(2500, 2599, "credit"),
      ovrigaSkulder: r2(
        sum(2200, 2399, "credit") +
          sum(2400, 2439, "credit") +
          sum(2450, 2499, "credit") +
          sum(2600, 2999, "credit")
      ),
      tillgangar: sum(1000, 1999, "debit"),
      ekBokfort: sum(2000, 2199, "credit"),
      skulder: sum(2200, 2999, "credit"),
    };
  }

  /* Ackumulerat (ej omfört) resultat per bokslutsdag. */
  function ackResultat(bal) {
    return r2(bal.tillgangar - bal.ekBokfort - bal.skulder);
  }

  /* ── K2-data för ett räkenskapsår ─────────────────────────────────────── */
  function k2Data(companyId, year) {
    year = String(year);
    const from = year + "-01-01";
    const to = year + "-12-31";
    const prevY = String(Number(year) - 1);
    const co = S().getCompany(companyId);
    const bk = bokslutFor(companyId, year);

    const rr = B().resultatrakning(companyId, from, to);
    const rrPrev = B().resultatrakning(companyId, prevY + "-01-01", prevY + "-12-31");
    const bal = balSums(companyId, to);
    const balPrev = balSums(companyId, prevY + "-12-31");

    const aretsRes = rr.result;
    const ackRes = ackResultat(bal);
    // Fritt EK = bokfört fritt + alla års ej omförda resultat; årets särredovisas.
    const frittEK = r2(bal.frittBokfort + ackRes);
    const balanserat = r2(frittEK - aretsRes);
    const ekTotal = r2(bal.aktiekapital + frittEK);
    const soliditet = bal.tillgangar > 0 ? r2((ekTotal / bal.tillgangar) * 100) : 0;

    // Flerårsöversikt — alla år med data, max 4.
    const years = [];
    for (let i = 0; i < 4; i++) {
      const yy = String(Number(year) - i);
      const r = i === 0 ? rr : B().resultatrakning(companyId, yy + "-01-01", yy + "-12-31");
      const b = i === 0 ? bal : balSums(companyId, yy + "-12-31");
      if (i > 0 && r.revenue === 0 && b.tillgangar === 0) continue;
      const ar = ackResultat(b);
      const ek = r2(b.aktiekapital + b.frittBokfort + ar);
      years.push({
        year: yy,
        oms: r.revenue,
        res: r.resultatForeSkatt,
        soliditet: b.tillgangar > 0 ? r2((ek / b.tillgangar) * 100) : 0,
      });
    }

    // Förändring av eget kapital.
    const arPrev = ackResultat(balPrev);
    const ekIn = { ak: balPrev.aktiekapital, fritt: r2(balPrev.frittBokfort + arPrev) };
    const akForandring = r2(bal.aktiekapital - ekIn.ak);
    const ovrigFrittForandring = r2(frittEK - ekIn.fritt - aretsRes);

    // Medelantal anställda — angivet eller härlett från årets lönekörningar.
    let anstallda = bk.medelAnstallda;
    if (anstallda === "" || anstallda == null) {
      const names = {};
      S()
        .listPayrolls(companyId)
        .filter((p) => p.period.slice(0, 4) === year)
        .forEach((p) => (names[p.employee || "?"] = true));
      anstallda = Object.keys(names).length;
    }

    // Inventarienot.
    const assets = S().listAssets(companyId).filter((a) => a.date <= to);
    let anskaffning = 0,
      ackAvskr = 0,
      aretsInkop = 0;
    assets.forEach((a) => {
      const cost = C().toNum(a.cost);
      anskaffning += cost;
      if (a.date >= from) aretsInkop += cost;
      ackAvskr += B().assetSchedule(a, to).acc;
    });

    const utdelning = C().toNum(bk.utdelning);
    return {
      year: year,
      prevY: prevY,
      company: co,
      bokslut: bk,
      rr: rr,
      rrPrev: rrPrev,
      bal: bal,
      aretsRes: aretsRes,
      balanserat: balanserat,
      frittEK: frittEK,
      ekTotal: ekTotal,
      soliditet: soliditet,
      flerars: years,
      ekChange: {
        in: ekIn,
        akForandring: akForandring,
        ovrigFritt: ovrigFrittForandring,
        aretsRes: aretsRes,
        ut: { ak: bal.aktiekapital, fritt: frittEK },
      },
      disposition: {
        tillForfogande: frittEK,
        utdelning: utdelning,
        nyRakning: r2(frittEK - utdelning),
      },
      anstallda: anstallda,
      inventarier: {
        anskaffning: r2(anskaffning),
        aretsInkop: r2(aretsInkop),
        ackAvskr: r2(ackAvskr),
        bokfort: r2(anskaffning - ackAvskr),
      },
    };
  }

  /* ── INK2: räkenskapsschema + skattemässiga justeringar ───────────────── */
  function ink2Data(companyId, year) {
    year = String(year);
    const from = year + "-01-01";
    const to = year + "-12-31";
    const rr = B().resultatrakning(companyId, from, to);
    const bal = balSums(companyId, to);
    const bk = bokslutFor(companyId, year);
    const aretsRes = rr.result;
    const frittEK = r2(bal.frittBokfort + ackResultat(bal));

    const R = [];
    const pushR = (code, label, val) => {
      if (Math.abs(val) >= 0.5) R.push({ code: code, label: label, value: kr(val) });
    };
    // Balansräkning (INK2R)
    pushR(7215, "Maskiner, inventarier m.m.", bal.inventarier);
    pushR(7251, "Kundfordringar", bal.kundfordringar);
    pushR(7261, "Övriga fordringar", bal.ovrigaFordringar);
    pushR(7281, "Kassa, bank och redovisningsmedel", bal.kassaBank);
    pushR(7301, "Bundet eget kapital", bal.aktiekapital);
    pushR(7302, "Fritt eget kapital", frittEK);
    pushR(7365, "Leverantörsskulder", bal.levSkulder);
    pushR(7368, "Skatteskulder", bal.skatteskulder);
    pushR(7369, "Övriga skulder", bal.ovrigaSkulder);
    // Resultaträkning (INK2R)
    pushR(7410, "Nettoomsättning", rr.revenue);
    pushR(7511, "Råvaror och förnödenheter", rr.goods);
    pushR(7513, "Övriga externa kostnader", rr.external);
    pushR(7514, "Personalkostnader", rr.personnel);
    pushR(7515, "Av- och nedskrivningar", rr.depreciation);
    pushR(7417, "Ränteintäkter", rr.finIncome);
    pushR(7522, "Räntekostnader", rr.finCost);
    pushR(7528, "Skatt på årets resultat", rr.tax);
    if (aretsRes >= 0) pushR(7450, "Årets resultat, vinst", aretsRes);
    else pushR(7550, "Årets resultat, förlust", -aretsRes);

    // INK2S — skattemässiga justeringar
    const ejAvdr = C().toNum(bk.ejAvdragsgilla);
    const ejSkatt = C().toNum(bk.ejSkattepliktiga);
    const undF = C().toNum(bk.underskottForegAr);
    const overskott = r2(aretsRes + rr.tax + ejAvdr - ejSkatt - undF);

    const Ssch = [];
    if (aretsRes >= 0) Ssch.push({ code: 7650, falt: "4.1", label: "Årets resultat, vinst", value: kr(aretsRes) });
    else Ssch.push({ code: 7750, falt: "4.2", label: "Årets resultat, förlust", value: kr(-aretsRes) });
    if (rr.tax) Ssch.push({ code: 7651, falt: "4.3a", label: "Skatt på årets resultat (återläggs)", value: kr(rr.tax) });
    if (ejAvdr) Ssch.push({ code: 7653, falt: "4.3c", label: "Kostnader som inte ska dras av", value: kr(ejAvdr) });
    if (ejSkatt) Ssch.push({ code: 7754, falt: "4.5c", label: "Intäkter som inte ska tas upp", value: kr(ejSkatt) });
    if (undF) Ssch.push({ code: 7763, falt: "4.14a", label: "Outnyttjat underskott föregående år", value: kr(undF) });
    if (overskott >= 0) Ssch.push({ code: 7670, falt: "4.15", label: "Överskott → INK2 ruta 1.1", value: kr(overskott) });
    else Ssch.push({ code: 7770, falt: "4.16", label: "Underskott → INK2 ruta 1.2", value: kr(-overskott) });

    const skatt = r2(Math.max(0, overskott) * B().TAX_RATE_AB);
    return {
      year: year,
      R: R,
      S: Ssch,
      overskott: overskott,
      beraknadSkatt: skatt,
      bokfordSkatt: rr.tax,
      resterande: r2(Math.max(0, r2(skatt - rr.tax))),
      aretsRes: aretsRes,
    };
  }

  /* ── SRU-filer (INFO.SRU + BLANKETTER.SRU) ────────────────────────────── */
  function periodSuffix(year, to) {
    // P1–P4 efter bokslutsmånad; kalenderår (dec) → P4.
    const m = parseInt((to || year + "-12-31").slice(5, 7), 10);
    const p = m <= 4 ? "P1" : m <= 6 ? "P2" : m <= 8 ? "P3" : "P4";
    return year + p;
  }

  function sruOrgnr(co) {
    const d = String((co && co.orgnr) || "").replace(/\D/g, "");
    return d.length === 10 ? "16" + d : d;
  }

  function sruFiles(companyId, year) {
    const co = S().getCompany(companyId);
    const d = ink2Data(companyId, year);
    const orgnr = sruOrgnr(co);
    const now = new Date();
    const dat =
      now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
    const tid =
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");
    const per = periodSuffix(year);
    const up = (code, val) => "#UPPGIFT " + code + " " + val;
    const head = (blankett) => [
      "#BLANKETT " + blankett + "-" + per,
      "#IDENTITET " + orgnr + " " + dat + " " + tid,
      up(7011, year + "0101"),
      up(7012, year + "1231"),
    ];

    const lines = [];
    lines.push.apply(lines, head("INK2R"));
    d.R.forEach((f) => lines.push(up(f.code, f.value)));
    lines.push("#BLANKETTSLUT");
    lines.push.apply(lines, head("INK2S"));
    d.S.forEach((f) => lines.push(up(f.code, f.value)));
    lines.push("#BLANKETTSLUT");
    lines.push("#FIL_SLUT");

    const info = [
      "#DATABESKRIVNING_START",
      "#PRODUKT SRU",
      "#FILNAMN BLANKETTER.SRU",
      "#DATABESKRIVNING_SLUT",
      "#MEDIELEV_START",
      "#ORGNR " + orgnr,
      "#NAMN " + ((co && co.name) || ""),
      "#POSTNR " + String((co && co.address && co.address.zip) || "").replace(/\s/g, ""),
      "#POSTORT " + ((co && co.address && co.address.city) || ""),
      "#MEDIELEV_SLUT",
    ].join("\r\n");

    return { info: info + "\r\n", blanketter: lines.join("\r\n") + "\r\n" };
  }

  /* ── K2-årsredovisning som PDF ────────────────────────────────────────── */
  const SAGE_DARK = [31, 48, 38];
  const INK = [26, 26, 26];
  const INK6 = [74, 74, 74];
  const LINE = [225, 220, 210];

  function k2Pdf(companyId, year) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF är inte laddat (CDN).");
    const d = k2Data(companyId, year);
    const co = d.company || {};
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    // Sanera all text (typografiskt minus & hårda mellanslag → ASCII).
    const _text = doc.text.bind(doc);
    doc.text = function (t, x, yy, o) {
      return _text(C().pdfSafe(t), x, yy, o);
    };
    const M = 22,
      RIGHT = 188;
    let y = 0;

    const num = (x) => C().num(x, 0);
    const nl = (n) => {
      y += n || 6;
      if (y > 272) {
        doc.addPage();
        y = 24;
      }
    };
    const h1 = (t) => {
      nl(2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor.apply(doc, SAGE_DARK);
      doc.text(t, M, y);
      nl(8);
    };
    const h2 = (t) => {
      nl(3);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor.apply(doc, SAGE_DARK);
      doc.text(t, M, y);
      nl(6);
    };
    const par = (t) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, INK);
      const lines = doc.splitTextToSize(t, RIGHT - M);
      lines.forEach((ln) => {
        doc.text(ln, M, y);
        nl(4.6);
      });
    };
    const row = (label, v1, v2, opts) => {
      opts = opts || {};
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, opts.bold ? SAGE_DARK : INK);
      doc.text(label, M + (opts.indent ? 5 : 0), y);
      if (v1 != null) doc.text(num(v1), 150, y, { align: "right" });
      if (v2 != null) doc.text(num(v2), RIGHT, y, { align: "right" });
      nl(5.4);
      if (opts.line) {
        doc.setDrawColor.apply(doc, LINE);
        doc.line(M, y - 4, RIGHT, y - 4);
      }
    };
    const colHead = (a, b) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, INK6);
      doc.text(a, 150, y, { align: "right" });
      doc.text(b, RIGHT, y, { align: "right" });
      nl(5.5);
    };

    /* — Framsida — */
    y = 60;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor.apply(doc, SAGE_DARK);
    doc.text("Årsredovisning", M, y);
    y += 12;
    doc.setFontSize(14);
    doc.text("för", M, y);
    y += 10;
    doc.setFontSize(18);
    doc.text(co.name || "", M, y);
    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, INK6);
    doc.text("Org.nr " + (co.orgnr || ""), M, y);
    y += 7;
    doc.text("Räkenskapsåret " + d.year + "-01-01 – " + d.year + "-12-31", M, y);
    y += 16;
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, INK);
    doc.text(
      "Styrelsen avger följande årsredovisning, upprättad i enlighet med årsredovisningslagen och",
      M,
      y
    );
    y += 5;
    doc.text("BFNAR 2016:10 (K2) — Årsredovisning i mindre företag.", M, y);

    /* — Förvaltningsberättelse — */
    doc.addPage();
    y = 24;
    h1("Förvaltningsberättelse");
    h2("Verksamheten");
    par(
      (d.bokslut.verksamhet || "Bolaget bedriver verksamhet enligt bolagsordningen.") +
        (co.sate ? " Bolaget har sitt säte i " + co.sate + "." : "")
    );
    h2("Flerårsöversikt (kr)");
    // Tabell: år | nettoomsättning | resultat efter finansiella poster | soliditet
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, INK6);
    doc.text("Nettoomsättning", 105, y, { align: "right" });
    doc.text("Res. efter fin. poster", 150, y, { align: "right" });
    doc.text("Soliditet", RIGHT, y, { align: "right" });
    nl(5.5);
    d.flerars.forEach((f) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, INK);
      doc.text(f.year, M, y);
      doc.text(num(f.oms), 105, y, { align: "right" });
      doc.text(num(f.res), 150, y, { align: "right" });
      doc.text(C().num(f.soliditet, 1) + " %", RIGHT, y, { align: "right" });
      nl(5.4);
    });
    h2("Förändringar i eget kapital");
    colHead("Aktiekapital", "Fritt eget kapital");
    row("Belopp vid årets ingång", d.ekChange.in.ak, d.ekChange.in.fritt);
    if (d.ekChange.akForandring) row("Förändring av aktiekapital", d.ekChange.akForandring, null);
    if (d.ekChange.ovrigFritt) row("Övriga förändringar", null, d.ekChange.ovrigFritt);
    row("Årets resultat", null, d.ekChange.aretsRes);
    row("Belopp vid årets utgång", d.ekChange.ut.ak, d.ekChange.ut.fritt, { bold: true, line: true });
    h2("Resultatdisposition");
    par("Till årsstämmans förfogande står följande medel (kr):");
    row("Fritt eget kapital", null, d.disposition.tillForfogande);
    par("Styrelsen föreslår att medlen disponeras så att:");
    if (d.disposition.utdelning) row("Till aktieägarna utdelas", null, d.disposition.utdelning);
    row("I ny räkning överförs", null, d.disposition.nyRakning, { bold: true });

    /* — Resultaträkning — */
    doc.addPage();
    y = 24;
    h1("Resultaträkning");
    colHead(d.year, d.prevY);
    row("Nettoomsättning", d.rr.revenue, d.rrPrev.revenue, { bold: true });
    if (d.rr.goods || d.rrPrev.goods) row("Råvaror och förnödenheter", -d.rr.goods, -d.rrPrev.goods, { indent: true });
    row("Övriga externa kostnader", -d.rr.external, -d.rrPrev.external, { indent: true });
    row("Personalkostnader", -d.rr.personnel, -d.rrPrev.personnel, { indent: true });
    row("Av- och nedskrivningar", -d.rr.depreciation, -d.rrPrev.depreciation, { indent: true });
    row("Rörelseresultat", d.rr.ebit, d.rrPrev.ebit, { bold: true, line: true });
    if (d.rr.finIncome || d.rrPrev.finIncome) row("Ränteintäkter", d.rr.finIncome, d.rrPrev.finIncome, { indent: true });
    if (d.rr.finCost || d.rrPrev.finCost) row("Räntekostnader", -d.rr.finCost, -d.rrPrev.finCost, { indent: true });
    row("Resultat efter finansiella poster", d.rr.resultatForeSkatt, d.rrPrev.resultatForeSkatt, { bold: true });
    if (d.rr.tax || d.rrPrev.tax) row("Skatt på årets resultat", -d.rr.tax, -d.rrPrev.tax, { indent: true });
    row("Årets resultat", d.rr.result, d.rrPrev.result, { bold: true, line: true });

    /* — Balansräkning — */
    doc.addPage();
    y = 24;
    h1("Balansräkning");
    colHead(d.year + "-12-31", "");
    h2("Tillgångar");
    if (d.bal.inventarier) row("Maskiner och inventarier (not 3)", null, d.bal.inventarier, { indent: true });
    if (d.bal.kundfordringar) row("Kundfordringar", null, d.bal.kundfordringar, { indent: true });
    if (d.bal.ovrigaFordringar) row("Övriga fordringar", null, d.bal.ovrigaFordringar, { indent: true });
    row("Kassa och bank", null, d.bal.kassaBank, { indent: true });
    row("Summa tillgångar", null, d.bal.tillgangar, { bold: true, line: true });
    h2("Eget kapital och skulder");
    row("Aktiekapital", null, d.bal.aktiekapital, { indent: true });
    row("Balanserat resultat", null, d.balanserat, { indent: true });
    row("Årets resultat", null, d.aretsRes, { indent: true });
    row("Summa eget kapital", null, d.ekTotal, { bold: true });
    if (d.bal.levSkulder) row("Leverantörsskulder", null, d.bal.levSkulder, { indent: true });
    if (d.bal.skatteskulder) row("Skatteskulder", null, d.bal.skatteskulder, { indent: true });
    row("Övriga skulder", null, d.bal.ovrigaSkulder, { indent: true });
    row("Summa eget kapital och skulder", null, r2(d.ekTotal + d.bal.levSkulder + d.bal.skatteskulder + d.bal.ovrigaSkulder), { bold: true, line: true });

    /* — Noter & underskrifter — */
    doc.addPage();
    y = 24;
    h1("Noter");
    h2("Not 1 — Redovisningsprinciper");
    par(
      "Årsredovisningen är upprättad i enlighet med årsredovisningslagen och Bokföringsnämndens allmänna råd BFNAR 2016:10 om årsredovisning i mindre företag (K2). Materiella anläggningstillgångar skrivs av linjärt över bedömd nyttjandeperiod."
    );
    h2("Not 2 — Medelantal anställda");
    par("Medelantalet anställda under räkenskapsåret var " + d.anstallda + ".");
    if (d.inventarier.anskaffning) {
      h2("Not 3 — Maskiner och inventarier");
      row("Ackumulerade anskaffningsvärden", null, d.inventarier.anskaffning);
      if (d.inventarier.aretsInkop) row("— varav årets inköp", null, d.inventarier.aretsInkop, { indent: true });
      row("Ackumulerade avskrivningar", null, -d.inventarier.ackAvskr);
      row("Redovisat värde", null, d.inventarier.bokfort, { bold: true, line: true });
    }
    nl(14);
    par((d.bokslut.ort || (co.sate || "")) + " den ____________________");
    nl(10);
    const ledamoter = String(d.bokslut.styrelse || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    (ledamoter.length ? ledamoter : ["____________________"]).forEach((n) => {
      par("______________________________");
      par(n);
      nl(6);
    });

    return doc;
  }

  function k2Filename(companyId, year) {
    const co = S().getCompany(companyId);
    return ("Arsredovisning-" + year + "-" + ((co && co.name) || "bolag")).replace(/[^\wåäöÅÄÖ-]+/g, "-") + ".pdf";
  }

  Faktura.Ars = {
    bokslutFor,
    k2Data,
    k2Pdf,
    k2Filename,
    ink2Data,
    sruFiles,
    periodSuffix,
  };
})();
