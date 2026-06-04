// Single source of truth for the shared deal documents (the investor deck,
// appraisal, budget, etc.). Used by the data room (`file.js`) to resolve a doc key
// to its Drive location. Each doc's location comes from a DRIVE_FILE_* env var.

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
