// PDF overlay helpers for the promissory-note signing flow.
//
// We do NOT regenerate the PDF — that would change the design / formatting.
// Instead we load the existing blank, find the execution page (the page with
// the DEBTOR / CREDITOR / GUARANTOR blocks), and draw signature + date text
// onto the existing signature lines.
//
// Coordinates below were derived empirically from the existing Schossau notes
// (US Letter, 612 × 792 pt) by probing label positions with pdfplumber.
// pdfplumber uses top-down y; pdf-lib uses bottom-up — y_pdfLib = 792 - y_top.
// If a future template's layout drifts, re-probe and update SIGNATURE_LAYOUT.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Coordinates in PDF points (origin bottom-left). All drawText calls render at
// the baseline of the underscore signature line.
const SIGNATURE_LAYOUT = {
  debtor: {
    by:    { x: 85,  y: 333 }, // "By:   _______________"
    name:  { x: 100, y: 314 }, // "Name: _______________"
    title: { x: 95,  y: 295 }, // "Title: ______________"
    date:  { x: 95,  y: 276 }  // "Date: _______________"
  },
  creditor: {
    signature: { x: 370, y: 333 }, // "Signature: __________"
    date:      { x: 348, y: 295 }  // "Date:      __________"
  },
  guarantor: {
    signature: { x: 117, y: 175 }, // "Signature: __________"
    date:      { x: 95,  y: 138 }  // "Date:      __________"
  }
};

const SCRIPT_FONT_SIZE = 14;
const TEXT_FONT_SIZE = 11;

// The "execution" page is the page with the DEBTOR / CREDITOR / GUARANTOR
// blocks. In the current template (5 pages) it's the second-to-last page —
// the last page is a disclaimer. Use the second-to-last if there is one;
// otherwise fall back to the last page.
function executionPage(doc) {
  const pages = doc.getPages();
  return pages.length >= 2 ? pages[pages.length - 2] : pages[pages.length - 1];
}

function todayLong(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Sign as Debtor (16740 LLC, by Lukas Bondy as Member) + Guarantor (Lukas individually).
// One PDF, one operation — Lukas does both blocks in a single step.
export async function signAsLukas(bytes, { typedSignature, dateIso }) {
  const doc = await PDFDocument.load(bytes);
  const page = executionPage(doc);

  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const dateStr = todayLong(dateIso);

  // Debtor block — "By" line is signed by Lukas as Member of the LLC
  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.debtor.by.x, y: SIGNATURE_LAYOUT.debtor.by.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.45) });
  page.drawText('Lukas Bondy', { x: SIGNATURE_LAYOUT.debtor.name.x, y: SIGNATURE_LAYOUT.debtor.name.y, size: TEXT_FONT_SIZE, font: plain });
  page.drawText('Member', { x: SIGNATURE_LAYOUT.debtor.title.x, y: SIGNATURE_LAYOUT.debtor.title.y, size: TEXT_FONT_SIZE, font: plain });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.debtor.date.x, y: SIGNATURE_LAYOUT.debtor.date.y, size: TEXT_FONT_SIZE, font: plain });

  // Guarantor block — Lukas individually
  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.guarantor.signature.x, y: SIGNATURE_LAYOUT.guarantor.signature.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.45) });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.guarantor.date.x, y: SIGNATURE_LAYOUT.guarantor.date.y, size: TEXT_FONT_SIZE, font: plain });

  return doc.save();
}

// Sign as Creditor (the investor). Operates on the already-Lukas-signed PDF
// so the result is fully executed.
export async function signAsInvestor(bytes, { typedSignature, dateIso }) {
  const doc = await PDFDocument.load(bytes);
  const page = executionPage(doc);

  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const dateStr = todayLong(dateIso);

  page.drawText(typedSignature, { x: SIGNATURE_LAYOUT.creditor.signature.x, y: SIGNATURE_LAYOUT.creditor.signature.y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.45) });
  page.drawText(dateStr, { x: SIGNATURE_LAYOUT.creditor.date.x, y: SIGNATURE_LAYOUT.creditor.date.y, size: TEXT_FONT_SIZE, font: plain });

  return doc.save();
}

// Generic field-driven signing.
//
// Used by the multi-signer flow where the admin places fields on the PDF in
// the admin UI. Each field carries its page index, point coordinates (origin
// bottom-left, PDF points), and a type. We render the assigned signer's
// inputs onto each field; fields belonging to other signers are left alone
// so subsequent signers can fill them in.
//
// fields: array of
//   { id, signerId, page (0-based), x, y, type, label? }
// where type is one of: 'signature' | 'date' | 'name' | 'title' | 'initials'
//
// signerInputs:
//   { typedSignature, name, title, initials, dateIso }
export async function applyFieldsForSigner(bytes, fields, signerInputs) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const dateStr = todayLong(signerInputs.dateIso);
  const sig = String(signerInputs.typedSignature || '').trim();
  const name = String(signerInputs.name || sig || '').trim();
  const title = String(signerInputs.title || '').trim();
  const initials = String(signerInputs.initials || sig.split(/\s+/).map(p => p[0] || '').join('').toUpperCase()).trim();

  for (const f of fields) {
    const pageIdx = Math.max(0, Math.min(pages.length - 1, Number(f.page) || 0));
    const page = pages[pageIdx];
    const x = Number(f.x);
    const y = Number(f.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (f.type === 'signature') {
      page.drawText(sig, { x, y, size: SCRIPT_FONT_SIZE, font: script, color: rgb(0, 0, 0.45) });
    } else if (f.type === 'date') {
      page.drawText(dateStr, { x, y, size: TEXT_FONT_SIZE, font: plain });
    } else if (f.type === 'name') {
      page.drawText(name, { x, y, size: TEXT_FONT_SIZE, font: plain });
    } else if (f.type === 'title') {
      page.drawText(title, { x, y, size: TEXT_FONT_SIZE, font: plain });
    } else if (f.type === 'initials') {
      page.drawText(initials, { x, y, size: TEXT_FONT_SIZE, font: plain });
    }
  }
  return doc.save();
}

// Draw probe crosshairs at every signature coordinate. Used for visual
// alignment — call this on a copy of the blank PDF and open the result to
// see whether the points sit on the right signature lines. Coordinates can
// then be nudged in SIGNATURE_LAYOUT above.
export async function probeCrosshairs(bytes) {
  const doc = await PDFDocument.load(bytes);
  const page = executionPage(doc);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  for (const [block, fields] of Object.entries(SIGNATURE_LAYOUT)) {
    for (const [field, pos] of Object.entries(fields)) {
      page.drawCircle({ x: pos.x, y: pos.y, size: 2, color: rgb(1, 0, 0) });
      page.drawText(`${block}.${field}`, { x: pos.x + 5, y: pos.y + 2, size: 6, font: plain, color: rgb(1, 0, 0) });
    }
  }
  return doc.save();
}
