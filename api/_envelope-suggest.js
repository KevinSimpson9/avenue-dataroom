// AI field detector. Given a PDF, returns an array of suggested fields:
// signature / initials / date / text regions with a free-form recipient label
// read from whatever role text appears near each region.
//
// Document-agnostic: no hardcoded role names, no template assumptions. The
// model reads the PDF and proposes fields based on what it sees.
//
// On ANY failure (no API key, network, malformed output) returns [] — never
// blocks the upload. The admin can place fields manually in the designer.
//
// Coordinates: the model returns top-left-origin percentages of the page
// (xPct/yPct/widthPct/heightPct ∈ [0,1]). We convert to PDF points (bottom-
// left origin) on the server using the actual page sizes from pdf-lib, so
// the suggestions render correctly regardless of how the model represents
// the PDF internally.
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_FIELDS = 64;

const TOOL = {
  name: 'record_fields',
  description: 'Record the signature, initial, date, and free-text fields you found in this PDF.',
  input_schema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'One entry per field that a signer should fill. Empty array if you find none.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['signature', 'initials', 'date', 'text'],
              description: 'Field type. Use "signature" for full signature lines, "initials" for short initialing spots, "date" for date lines, "text" for printed-name/title/address blanks.'
            },
            page: {
              type: 'integer',
              minimum: 1,
              description: '1-indexed page number where the field appears.'
            },
            suggestedRecipientLabel: {
              type: 'string',
              description: 'Free-form role text read from the document near the field (e.g. "Tenant", "Borrower", "Director", "Witness", "Notary"). Use the exact label from the PDF when available. If no label is visible, use "Signer".'
            },
            bbox: {
              type: 'object',
              description: 'Bounding box for the field, as fractions of the page in TOP-LEFT origin. All values are between 0 and 1.',
              properties: {
                xPct: { type: 'number', minimum: 0, maximum: 1 },
                yPct: { type: 'number', minimum: 0, maximum: 1 },
                widthPct: { type: 'number', minimum: 0, maximum: 1 },
                heightPct: { type: 'number', minimum: 0, maximum: 1 }
              },
              required: ['xPct', 'yPct', 'widthPct', 'heightPct']
            }
          },
          required: ['type', 'page', 'suggestedRecipientLabel', 'bbox']
        }
      }
    },
    required: ['fields']
  }
};

const SYSTEM_PROMPT = [
  'You analyze legal and business PDFs to identify regions where a human signer will need to fill in something.',
  'Do not assume the document type. Read whatever role labels actually appear in the PDF.',
  'Return one field per blank/line/checkbox a signer must complete.',
  'Coordinate system: percentages of page width/height, TOP-LEFT origin. Pages are 1-indexed.',
  'Make bounding boxes tight around the blank line or empty space where the value goes, not around the surrounding label.',
  'If you are unsure whether a region is a fillable field, omit it — the admin can add fields manually.'
].join(' ');

export async function suggestFields(pdfBytes) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Need page dimensions for coord conversion; load once.
  let pageSizes;
  try {
    const doc = await PDFDocument.load(pdfBytes);
    pageSizes = doc.getPages().map(p => {
      const { width, height } = p.getSize();
      return { width, height };
    });
  } catch (err) {
    console.warn('suggest: pdf-lib load failed', err.message);
    return [];
  }

  const base64 = Buffer.from(pdfBytes).toString('base64');
  const model = process.env.SUGGEST_MODEL || DEFAULT_MODEL;

  let body;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'record_fields' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 }
              },
              {
                type: 'text',
                text: 'Identify every region in this PDF that a signer must fill in (signatures, initials, dates, printed names, titles, addresses, etc.). Use the record_fields tool. Return at most ' + MAX_FIELDS + ' fields.'
              }
            ]
          }
        ]
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('suggest: anthropic ' + res.status + ': ' + txt.slice(0, 240));
      return [];
    }
    body = await res.json();
  } catch (err) {
    console.warn('suggest: network failure', err.message);
    return [];
  }

  // Extract the tool_use block.
  const toolUse = (body?.content || []).find(b => b && b.type === 'tool_use' && b.name === 'record_fields');
  const rawFields = toolUse?.input?.fields;
  if (!Array.isArray(rawFields)) return [];

  const out = [];
  for (const raw of rawFields.slice(0, MAX_FIELDS)) {
    const f = normalizeField(raw, pageSizes);
    if (f) out.push(f);
  }
  return out;
}

function normalizeField(raw, pageSizes) {
  if (!raw || typeof raw !== 'object') return null;
  const type = ['signature', 'initials', 'date', 'text'].includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const page = Number.isInteger(raw.page) ? raw.page : parseInt(raw.page, 10);
  if (!Number.isInteger(page) || page < 1 || page > pageSizes.length) return null;
  const dims = pageSizes[page - 1];
  const bbox = raw.bbox || {};
  const clamp = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
  };
  const xPct = clamp(bbox.xPct);
  const yPct = clamp(bbox.yPct);
  const wPct = clamp(bbox.widthPct);
  const hPct = clamp(bbox.heightPct);
  if (xPct == null || yPct == null || wPct == null || hPct == null) return null;
  if (wPct <= 0 || hPct <= 0) return null;

  // Convert top-left % → PDF points (bottom-left origin).
  const xPt = xPct * dims.width;
  const wPt = wPct * dims.width;
  const hPt = hPct * dims.height;
  const yTopPt = yPct * dims.height;
  const yPt = dims.height - yTopPt - hPt;

  return {
    id: crypto.randomUUID(),
    recipientId: '',
    type,
    page,
    x: round(xPt),
    y: round(yPt),
    width: round(wPt),
    height: round(hPt),
    required: true,
    status: 'suggested',
    suggestedRecipientLabel: String(raw.suggestedRecipientLabel || 'Signer').slice(0, 80),
    defaultValue: null,
    filledValue: null,
    filledAt: null
  };
}

function round(n) { return Math.round(n * 100) / 100; }

export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}
