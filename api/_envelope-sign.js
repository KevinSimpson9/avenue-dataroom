// Generic PDF flattener for any envelope. Takes the source PDF bytes plus the
// envelope's fields (each with filledValue) and draws each field's value at
// its stored coordinates. Coordinates are PDF points, bottom-left origin —
// matches pdf-lib directly.
//
// Field types:
//   signature  → italic Times Roman, dark blue ink (matches _promissory-sign.js)
//   initials   → Helvetica plain
//   date       → Helvetica plain (server pre-fills filledValue at sign time)
//   text       → Helvetica plain
//
// Auto-fits text width to the field's bounding box by shrinking font size.
// Skips fields with empty filledValue.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SIG_COLOR = rgb(0, 0, 0.45);
const PLAIN_COLOR = rgb(0, 0, 0);

export async function flattenEnvelope(pdfBytes, fields) {
  const doc = await PDFDocument.load(pdfBytes);
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const f of fields || []) {
    if (f.filledValue == null || f.filledValue === '') continue;
    const page = pages[(f.page || 1) - 1];
    if (!page) continue;

    const isSig = f.type === 'signature';
    const font = isSig ? script : plain;
    const color = isSig ? SIG_COLOR : PLAIN_COLOR;
    const text = String(f.filledValue);

    const targetSize = isSig
      ? Math.min(Math.max(f.height * 0.85, 10), 22)
      : Math.min(Math.max(f.height * 0.65, 8), 12);
    let size = targetSize;
    let width = font.widthOfTextAtSize(text, size);
    while (width > Math.max(f.width - 2, 1) && size > 6) {
      size -= 0.5;
      width = font.widthOfTextAtSize(text, size);
    }

    // Baseline placed ~30% above the bottom of the field box — visually
    // centred for both script and Helvetica.
    const baselineY = f.y + Math.max(0, (f.height - size) * 0.30);
    page.drawText(text, {
      x: f.x + 2,
      y: baselineY,
      size,
      font,
      color
    });
  }

  return doc.save();
}

// Format date in long form, matching the existing _promissory-sign style.
export function todayLong(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
