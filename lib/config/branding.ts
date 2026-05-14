/**
 * Single source of truth for org-specific values. Future projects re-using this
 * portal as a template should only need to edit this file (and swap assets in
 * /public/ - logo.png, favicon, og-image, etc.).
 */
export const BRANDING = {
  orgName: 'The Avenue at Fountain Hills',
  orgShortName: 'Avenue',
  productName: 'Avenue Investor Portal',
  tagline: 'Investor Data Room',

  // Email addresses that are seeded as admin accounts in the registry. The
  // first entry is the canonical contact / signer for envelopes.
  adminEmails: [
    'kevin@akcapital.fund',
  ],

  // Every envelope invite is BCC'd to these addresses.
  envelopeBcc: [
    'kevin@akcapital.fund',
  ],

  // The counter-signer on investor agreements (the "Lukas" role in v1).
  counterSignerEmail: 'lukas@akcapital.fund',
  counterSignerName: 'Lukas',

  // Tailwind theme colors. Mapped onto `colors.brand.*` in tailwind.config.ts.
  colors: {
    DEFAULT: '#1f2937',
    accent: '#b08d57',   // warm gold
    bg: '#faf7f2',       // cream
    fg: '#1c1c1c',
    muted: '#6b7280',
    line: '#e7e2d8',
  },

  // Feature flags. Flip during cutover.
  features: {
    /** When true, /portal/* routes are served by the new Next.js app. When
     *  false, they fall through to the legacy dispatcher at /api/portal/*. */
    newPortalEnabled: false,
    /** Optional TOTP 2FA enrollment. */
    totp: false,
    /** In-portal messaging. */
    messaging: true,
    /** Admin updates feed. */
    updates: true,
  },
} as const;

export type Branding = typeof BRANDING;
