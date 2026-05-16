import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Field } from '@/lib/drive/envelopes';

/**
 * Generic PDF flattener: takes source PDF bytes plus the envelope's fields
 * (each with filledValue) and draws each value at its stored coordinates.
 * Coordinates are PDF points, bottom-left origin — matches pdf-lib directly.
 *
 * Empty `filledValue` is skipped. Text auto-shrinks to fit the field's width.
 */

const SIG_COLOR = rgb(0, 0, 0.45);
const PLAIN_COLOR = rgb(0, 0, 0);

export async function flattenEnvelope(
  pdfBytes: Buffer | Uint8Array,
  fields: Field[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const plain = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const f of fields) {
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

    const baselineY = f.y + Math.max(0, (f.height - size * 0.7) / 2);
    page.drawText(text, { x: f.x + 2, y: baselineY, size, font, color });
  }

  return doc.save();
}

export function todayLong(dateIso?: string | null): string {
  const d = dateIso ? new Date(dateIso) : new Date();
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
