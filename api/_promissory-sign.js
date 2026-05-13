// PDF overlay helpers for the promissory-note signing flow.
//
// We do NOT regenerate the PDF — that would change the design / formatting.
// Instead we load the existing blank, then draw signature text + date onto
// the signature lines on the execution page (page 4 of the standard template).
//
// Coordinates below are tuned empirically against the existing Schossau notes
// (US Letter, 612 × 792 pt). If alignment drifts on future templates, adjust
// the SIGNATURE_LAYOUT block below.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ---- Coordinate layout ----
// All positions are in PDF points (1pt = 1/72in), origin bottom-left.
// Execution page is the LAST page of the document.
const SIGNATURE_LAYOUT = {
  debtor: {
    by:    { x: 124, y: 372 },
    name:  { x: 138, y: 343 },
    title: { x: 132, y: 314 },
    date:  { x: 134, y: 285 }
  },
  creditor: {
    // Creditor signature + date (printed name is pre-rendered in the template)
    signature: { x: 393, y: 372 },
    date:      { x: 380, y: 314 }
  },
  guarantor: {
    signature: { x: 173, y: 175 },
    date:      { x: 132, y: 117 }
  }
};

const SCRIPT_FONT_SIZE = 16;
const TEXT_FONT_SIZE = 11;

function todayLong(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Sign as Debtor (16740 LLC, by Lukas Bondy as Member) + Guarantor (Lukas individually).
// One PDF, one operation — Lukas does both blocks in a single step.
export async function signAsLukas(bytes, { typedSignature, dateIso }) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1]; // last page = execution page

  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const dateStr = todayLong(dateIso);

  // Debtor block — "By" line is signed by Lukas as Member of the LLC
  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.debtor.by.x, y: SIGNATURE_LAYOUT.debtor.by.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.5) });
  page.drawText('Lukas Bondy', { x: SIGNATURE_LAYOUT.debtor.name.x, y: SIGNATURE_LAYOUT.debtor.name.y, size: TEXT_FONT_SIZE, font: plain });
  page.drawText('Member', { x: SIGNATURE_LAYOUT.debtor.title.x, y: SIGNATURE_LAYOUT.debtor.title.y, size: TEXT_FONT_SIZE, font: plain });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.debtor.date.x, y: SIGNATURE_LAYOUT.debtor.date.y, size: TEXT_FONT_SIZE, font: plain });

  // Guarantor block — Lukas individually
  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.guarantor.signature.x, y: SIGNATURE_LAYOUT.guarantor.signature.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.5) });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.guarantor.date.x, y: SIGNATURE_LAYOUT.guarantor.date.y, size: TEXT_FONT_SIZE, font: plain });

  return doc.save();
}

// Sign as Creditor (the investor). Operates on the already-Lukas-signed PDF
// so the result is fully executed.
export async function signAsInvestor(bytes, { typedSignature, dateIso }) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];

  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const dateStr = todayLong(dateIso);

  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.creditor.signature.x, y: SIGNATURE_LAYOUT.creditor.signature.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.5) });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.creditor.date.x, y: SIGNATURE_LAYOUT.creditor.date.y, size: TEXT_FONT_SIZE, font: plain });

  return doc.save();
}

// Draw probe crosshairs at every signature coordinate. Used for visual
// alignment — call this on a copy of the blank PDF and open the result to
// see whether the points sit on the right signature lines. Coordinates can
// then be nudged in SIGNATURE_LAYOUT above.
export async function probeCrosshairs(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  for (const [block, fields] of Object.entries(SIGNATURE_LAYOUT)) {
    for (const [field, pos] of Object.entries(fields)) {
      page.drawCircle({ x: pos.x, y: pos.y, size: 2, color: rgb(1, 0, 0) });
      page.drawText(`${block}.${field}`, { x: pos.x + 5, y: pos.y + 2, size: 6, font: plain, color: rgb(1, 0, 0) });
    }
  }
  return doc.save();
}
