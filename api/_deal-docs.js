// Single source of truth for the shared deal documents (the investor deck,
// appraisal, budget, etc.). Used by both the public data room (`file.js`) and the
// investor portal (`/portal/deal-docs`) so the two never drift apart.
//
// Each doc's location comes from a DRIVE_FILE_* env var, which may be:
//   - a bare Drive file ID            → opened via the file viewer
//   - a full http(s) URL              → passed through as-is
//   - "folder:<id>"                   → linked to the Drive folder browser
// If the env var is unset, the doc is treated as "coming soon".

export const DEAL_DOCS = [
  { key: 'deck',         envVar: 'DRIVE_FILE_DECK',         label: 'Investor Presentation', blurb: 'Capital stack, returns, timeline & risk mitigation.' },
  { key: 'appraisal',    envVar: 'DRIVE_FILE_APPRAISAL',    label: 'Property Appraisal',    blurb: 'Independent valuation of the property.' },
  { key: 'bov',          envVar: 'DRIVE_FILE_BOV',          label: 'Broker Opinion of Value', blurb: 'Market pricing and comparables.' },
  { key: 'casa',         envVar: 'DRIVE_FILE_CASA',         label: 'CASA',                  blurb: 'Project documentation.' },
  { key: 'budget',       envVar: 'DRIVE_FILE_BUDGET',       label: 'Construction Budget',   blurb: 'Build budget and cost estimates.' },
  { key: 'plans',        envVar: 'DRIVE_FILE_PLANS',        label: 'Architectural Plans',   blurb: 'Architectural & engineering drawings.' },
  { key: 'approvals',    envVar: 'DRIVE_FILE_APPROVALS',    label: 'Permits & Approvals',   blurb: 'Municipal permits and town entitlements.' },
  { key: 'track-record', envVar: 'DRIVE_FILE_TRACK_RECORD', label: 'Developer Track Record', blurb: 'Past projects and outcomes.' }
];

// Map keyed by doc key, for quick lookups (mirrors the old DOC_MAP in file.js).
export const DOC_MAP = Object.fromEntries(DEAL_DOCS.map(d => [d.key, d.envVar]));

export function fileViewerUrl(id) {
  return `https://drive.google.com/file/d/${id}/view`;
}

// Resolve a raw env-var value into a link the browser can open.
// Returns { type: 'url', url } or null when the value is empty.
export function resolveDealDoc(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('folder:')) {
    return { type: 'url', url: `https://drive.google.com/drive/folders/${trimmed.slice(7)}` };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { type: 'url', url: trimmed };
  }
  return { type: 'url', url: fileViewerUrl(trimmed) };
}

// Build the list the portal renders: every deal doc with its resolved link, or
// available:false when its env var isn't set yet.
export function listDealDocsForPortal() {
  return DEAL_DOCS.map(d => {
    const resolved = resolveDealDoc(process.env[d.envVar]);
    return {
      key: d.key,
      label: d.label,
      blurb: d.blurb,
      available: !!resolved,
      url: resolved ? resolved.url : null
    };
  });
}
