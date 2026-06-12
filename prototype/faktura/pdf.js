/* ════════════════════════════════════════════════════════════════════════
   Faktura — PDF-generering (jsPDF + autotable)
   Producerar en A4-faktura med alla obligatoriska fält enligt
   bokföringslagen och momsspecifikation per momssats.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const Faktura = (window.Faktura = window.Faktura || {});
  const C = () => Faktura.Compute;

  // Lugns färgpalett (RGB).
  const SAGE = [58, 90, 64]; // --sage-700
  const SAGE_DARK = [31, 48, 38]; // --sage-900
  const INK = [26, 26, 26];
  const INK6 = [74, 74, 74];
  const INK4 = [138, 138, 138];
  const LINE = [225, 220, 210];
  const CREAM = [244, 241, 236];

  const docTypeLabel = {
    faktura: "FAKTURA",
    kreditfaktura: "KREDITFAKTURA",
    proforma: "PROFORMAFAKTURA",
    paminnelse: "BETALNINGSPÅMINNELSE",
  };

  function ensureLibs() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF är inte laddat. Kontrollera internetanslutning (CDN).");
    }
  }

  /* Bygg dokumentet och returnera jsPDF-instansen. */
  function build(inv, company, customer) {
    ensureLibs();
    const { jsPDF } = window.jspdf;
    const comp = C().compute(inv);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    // Sanera all text (typografiskt minus & hårda mellanslag → ASCII).
    const _text = doc.text.bind(doc);
    doc.text = function (t, x, y, o) {
      return _text(C().pdfSafe(t), x, y, o);
    };

    const PAGE_W = 210;
    const M = 16; // marginal
    const RIGHT = PAGE_W - M;
    let y = M;

    /* ── Sidhuvud: logotyp + titel ──────────────────────────────────────── */
    const logoBottom = drawLogo(doc, company, M, y);
    // Titel uppe till höger
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor.apply(doc, SAGE_DARK);
    doc.text(docTypeLabel[inv.docType] || "FAKTURA", RIGHT, y + 7, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, INK6);
    const numTxt = inv.number ? inv.number : "(utkast)";
    doc.text("Fakturanr  " + numTxt, RIGHT, y + 14, { align: "right" });

    y = Math.max(logoBottom, y + 18) + 4;

    /* ── Två kolumner: Säljare (vänster) / Köpare (höger) ───────────────── */
    const colGap = 8;
    const colW = (RIGHT - M - colGap) / 2;
    const sellerX = M;
    const buyerX = M + colW + colGap;

    const sellerTop = y;
    let ys = label(doc, "FRÅN", sellerX, sellerTop);
    ys = company ? party(doc, sellerLines(company), sellerX, ys) : ys;

    let yb = label(doc, "FAKTURERAS TILL", buyerX, sellerTop);
    yb = customer ? party(doc, buyerLines(customer), buyerX, yb) : yb;

    y = Math.max(ys, yb) + 4;

    /* ── Metaruta: datum, förfallo, referenser ──────────────────────────── */
    y = metaBox(doc, inv, comp, M, RIGHT, y);
    y += 5;

    /* ── Radtabell (specifikation) ──────────────────────────────────────── */
    y = lineTable(doc, inv, comp, M, RIGHT, y);

    /* ── Summering + momsspecifikation ──────────────────────────────────── */
    y = summary(doc, inv, comp, company, M, RIGHT, y);

    /* ── Betalinformation ───────────────────────────────────────────────── */
    y = paymentBlock(doc, inv, comp, company, M, RIGHT, y);

    /* ── Meddelande ─────────────────────────────────────────────────────── */
    if (inv.message) {
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, INK6);
      const lines = doc.splitTextToSize(inv.message, RIGHT - M);
      doc.text(lines, M, y);
      y += lines.length * 4.5;
    }

    /* ── Sidfot på varje sida ───────────────────────────────────────────── */
    drawFooter(doc, company);

    return doc;
  }

  /* ── Hjälpritare ──────────────────────────────────────────────────────── */
  function drawLogo(doc, company, x, y) {
    if (company && company.logo) {
      try {
        const props = doc.getImageProperties(company.logo);
        const maxW = 48,
          maxH = 22;
        let w = maxW,
          h = (props.height / props.width) * w;
        if (h > maxH) {
          h = maxH;
          w = (props.width / props.height) * h;
        }
        const fmt = (props.fileType || "PNG").toUpperCase();
        doc.addImage(company.logo, fmt, x, y, w, h);
        return y + h;
      } catch (e) {
        /* faller igenom till textnamn */
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor.apply(doc, SAGE_DARK);
    doc.text(company ? company.name || "" : "", x, y + 7);
    return y + 9;
  }

  function label(doc, txt, x, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, INK4);
    doc.text(txt, x, y);
    return y + 4.5;
  }

  function party(doc, lines, x, y) {
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, INK);
    lines.forEach((ln, i) => {
      doc.setFont("helvetica", i === 0 ? "bold" : "normal");
      doc.text(ln, x, y);
      y += 4.6;
    });
    return y;
  }

  function sellerLines(co) {
    const L = [co.name];
    C().addressLines(co.address).forEach((l) => L.push(l));
    if (co.orgnr) L.push("Org.nr " + co.orgnr);
    if (co.vatNumber) L.push("Momsnr " + co.vatNumber);
    if (co.email) L.push(co.email);
    if (co.phone) L.push("Tel " + co.phone);
    return L.filter(Boolean);
  }

  function buyerLines(cu) {
    const L = [cu.name];
    C().addressLines(cu.address).forEach((l) => L.push(l));
    if (cu.orgnr) L.push((cu.type === "private" ? "Pers.nr " : "Org.nr ") + cu.orgnr);
    if (cu.vatNumber) L.push("Momsnr " + cu.vatNumber);
    return L.filter(Boolean);
  }

  function metaBox(doc, inv, comp, left, right, y) {
    const fields = [
      ["Fakturadatum", inv.invoiceDate],
      ["Förfallodatum", inv.dueDate],
      ["Leveransdatum", inv.supplyDate],
      ["Betalningsvillkor", (inv.termsDays != null ? inv.termsDays : 30) + " dagar netto"],
    ];
    if (inv.yourReference) fields.push(["Er referens", inv.yourReference]);
    if (inv.ourReference) fields.push(["Vår referens", inv.ourReference]);
    if (inv.orderRef) fields.push(["Ordernr/offert", inv.orderRef]);
    if (inv.deliveryTerms) fields.push(["Leveransvillkor", inv.deliveryTerms]);

    const cols = 4;
    const cellW = (right - left) / cols;
    const rows = Math.ceil(fields.length / cols);
    const rowH = 11;
    const boxH = rows * rowH + 3;

    doc.setFillColor.apply(doc, CREAM);
    doc.setDrawColor.apply(doc, LINE);
    doc.roundedRect(left, y, right - left, boxH, 1.5, 1.5, "F");

    fields.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = left + col * cellW + 3;
      const cy = y + row * rowH + 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, INK4);
      doc.text(f[0].toUpperCase(), cx, cy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, INK);
      doc.text(String(f[1] || "—"), cx, cy + 4.6);
    });

    return y + boxH;
  }

  function lineTable(doc, inv, comp, left, right, y) {
    const cur = inv.currency || "SEK";
    const body = comp.lines
      .filter((l) => l.description || C().toNum(l.quantity) || C().toNum(l.unitPrice))
      .map((l) => [
        l.description || "",
        C().num(C().toNum(l.quantity), trimDec(l.quantity)),
        l.unit || "",
        C().num(C().toNum(l.unitPrice)),
        C().toNum(l.discountPct) ? C().num(C().toNum(l.discountPct), 0) + " %" : "—",
        comp.reverseCharge || comp.vatExempt ? "0 %" : C().pct(l.effRate),
        C().num(l.net),
      ]);

    doc.autoTable({
      startY: y,
      head: [["Beskrivning", "Antal", "Enhet", "À-pris", "Rabatt", "Moms", "Belopp"]],
      body: body,
      margin: { left: left, right: 210 - right },
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
        textColor: INK,
        lineColor: LINE,
        lineWidth: 0,
      },
      headStyles: {
        fillColor: SAGE,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "right",
      },
      columnStyles: {
        0: { halign: "left", cellWidth: "auto" },
        1: { halign: "right", cellWidth: 16 },
        2: { halign: "left", cellWidth: 14 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 16 },
        6: { halign: "right", cellWidth: 24 },
      },
      didParseCell: function (data) {
        if (data.section === "head" && data.column.index === 0) data.cell.styles.halign = "left";
        if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "left";
        if (data.section === "body") {
          data.cell.styles.lineWidth = { bottom: 0.1, top: 0, left: 0, right: 0 };
        }
      },
    });
    return doc.lastAutoTable.finalY + 4;
  }

  function summary(doc, inv, comp, company, left, right, y) {
    const cur = inv.currency || "SEK";
    const boxW = 78;
    const x = right - boxW;

    // Bryt till ny sida om det inte får plats.
    const needed = 30 + comp.vatGroups.length * 5;
    if (y + needed > 270) {
      doc.addPage();
      y = 20;
    }

    const rowH = 5.5;
    let ry = y;

    const put = (lbl, val, bold, big) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(big ? 11 : 9.5);
      doc.setTextColor.apply(doc, bold ? SAGE_DARK : INK6);
      doc.text(lbl, x, ry);
      doc.setTextColor.apply(doc, bold ? SAGE_DARK : INK);
      doc.text(val, right, ry, { align: "right" });
      ry += big ? 7 : rowH;
    };

    put("Summa exkl. moms", C().money(comp.net, cur));
    comp.vatGroups.forEach((g) => {
      const rateTxt = comp.reverseCharge || comp.vatExempt ? "0 %" : C().pct(g.rate);
      put("Moms " + rateTxt + " (av " + C().num(g.base) + ")", C().money(g.vat, cur));
    });
    if (inv.roundTotal && comp.rounding) {
      put("Öresavrundning", C().money(comp.rounding, cur));
    }

    // Linje + slutsumma
    doc.setDrawColor.apply(doc, SAGE);
    doc.setLineWidth(0.3);
    doc.line(x, ry, right, ry);
    ry += 5;
    put("ATT BETALA", C().money(comp.total, cur), true, true);

    // Omvänd skattskyldighet / momsbefrielse-text
    let noteY = Math.max(ry, y) + 2;
    if (comp.reverseCharge || comp.vatExempt) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, INK6);
      let txt = comp.reverseCharge
        ? "Omvänd skattskyldighet — köparen redovisar och betalar momsen."
        : "Momsbefriad försäljning.";
      if (inv.vatExemptReason) txt += " " + inv.vatExemptReason;
      const wrapped = doc.splitTextToSize(txt, right - left);
      doc.text(wrapped, left, y + 4);
      noteY = Math.max(noteY, y + 4 + wrapped.length * 4);
    }

    return noteY + 2;
  }

  function paymentBlock(doc, inv, comp, company, left, right, y) {
    if (!company) return y;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    y += 2;
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(left, y, right, y);
    y += 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, INK4);
    doc.text("BETALNING", left, y);
    y += 5;

    const pay = [];
    if (company.bankgiro) pay.push(["Bankgiro", company.bankgiro]);
    if (company.plusgiro) pay.push(["Plusgiro", company.plusgiro]);
    if (company.iban) pay.push(["IBAN", company.iban]);
    if (company.bic) pay.push(["BIC", company.bic]);
    pay.push(["Ange vid betalning", inv.number || "fakturanummer"]);
    pay.push(["Förfallodatum", inv.dueDate || "—"]);

    doc.setFontSize(9);
    const colW = (right - left) / 3;
    pay.forEach((p, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = left + col * colW;
      const cy = y + row * 9;
      doc.setFont("helvetica", "normal");
      doc.setTextColor.apply(doc, INK4);
      doc.setFontSize(7.5);
      doc.text(p[0], cx, cy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor.apply(doc, INK);
      doc.setFontSize(9.5);
      doc.text(String(p[1]), cx, cy + 4.4);
    });
    y += Math.ceil(pay.length / 3) * 9 + 1;

    if (company.lateInterestText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, INK6);
      const w = doc.splitTextToSize(company.lateInterestText, right - left);
      doc.text(w, left, y);
      y += w.length * 4;
    }
    return y;
  }

  function drawFooter(doc, company) {
    if (!company) return;
    const pageCount = doc.getNumberOfPages();
    const bits = [];
    if (company.name) bits.push(company.name);
    if (company.orgnr) bits.push("Org.nr " + company.orgnr);
    if (company.form === "ab" && company.sate) bits.push("Säte: " + company.sate);
    if (company.vatNumber) bits.push(company.vatNumber);
    if (company.fskatt) bits.push("Godkänd för F-skatt");
    if (company.website) bits.push(company.website);
    const line1 = bits.join("  ·  ");

    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(16, 285, 194, 285);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, INK4);
      const wrapped = doc.splitTextToSize(line1, 150);
      doc.text(wrapped, 16, 289);
      doc.text("Sida " + p + " / " + pageCount, 194, 289, { align: "right" });
      if (company.footerNote) {
        doc.text(doc.splitTextToSize(company.footerNote, 150), 16, 289 + wrapped.length * 3);
      }
    }
  }

  function trimDec(q) {
    const n = C().toNum(q);
    return n % 1 === 0 ? 0 : 2;
  }

  /* ── Filnamn ──────────────────────────────────────────────────────────── */
  function filename(inv, company) {
    const co = company ? (company.name || "").replace(/[^\wåäöÅÄÖ]+/g, "-") : "faktura";
    const no = inv.number || "utkast";
    return "Faktura-" + no + "-" + co + ".pdf";
  }

  /* ── Publika hjälpfunktioner ──────────────────────────────────────────── */
  function open(inv, company, customer) {
    const doc = build(inv, company, customer);
    window.open(doc.output("bloburl"), "_blank");
  }
  function download(inv, company, customer) {
    const doc = build(inv, company, customer);
    doc.save(filename(inv, company));
  }
  function dataUri(inv, company, customer) {
    const doc = build(inv, company, customer);
    return doc.output("datauristring"); // "data:application/pdf;base64,...."
  }
  function base64(inv, company, customer) {
    return dataUri(inv, company, customer).split(",")[1];
  }
  function blob(inv, company, customer) {
    const doc = build(inv, company, customer);
    return doc.output("blob");
  }

  Faktura.Pdf = { build, open, download, dataUri, base64, blob, filename };
})();
