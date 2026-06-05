# Investor Data Room — Setup Guide

A step-by-step playbook to spin up a private, NDA-gated investor data room for a new project, modeled on **The Avenue at Fountain Hills**.

End result: `dataroom.<your-project>.com` — investors land on a branded password gate, can self-serve access by signing an electronic NDA (PDF generated, saved to your Drive, password emailed automatically), unlock to a clean investor overview with deal terms, supporting documents (appraisal, BOV, term sheet, budget, plans, permits, sponsor track record), and a secure document upload tile.

Estimated time end-to-end: **3–4 hours** for the first project, **45–60 minutes** for each one after.

> **Note on the current Avenue deployment.** This guide documents the original
> *NDA-gated, self-signup* template. The live Avenue deployment has since moved to a
> **closed** model: the public gate password shows a "deal is closed" page, the NDA
> self-signup and all document-signing (promissory note / envelopes) have been
> removed, and committed investors use a private **Investor Portal** (`/portal`) with
> a data-room link, updates, messages, and document sharing. Sections about the NDA
> flow (3.7) and the `sign-nda` / promissory-note files below describe the original
> template and no longer reflect the live app — see the README for the current state.

---

## Table of contents

1. Prerequisites
2. Clone the template
3. Project-specific content swaps (find & replace)
4. Hero rendering image
5. Google Drive setup (service account + folders)
6. Email setup (Resend)
7. Deploy to Vercel
8. Custom domain
9. Environment variables — full reference
10. First-run verification
11. Adding or swapping documents later
12. Updating copy, numbers, or the rendering
13. Common issues & fixes
14. File map (what does what)

---

## 1. Prerequisites

You will need:

- A **GitHub account** (free).
- A **Vercel account** (free) connected to GitHub.
- A **Google account** with access to **Google Cloud Console** and **Google Drive**.
- A **Resend account** (free tier is plenty) for transactional email — `https://resend.com`.
- A **domain** you own and can point a subdomain at (Cloudflare, GoDaddy, Namecheap, etc.).
- **Node.js** and **git** installed locally if you want to run / preview before deploy. Optional — you can edit and deploy entirely through GitHub's web UI.

---

## 2. Clone the template

The Avenue data room repo is the template. Two options:

**Option A — Fork via GitHub UI (easiest):**

1. Go to `https://github.com/KevinSimpson9/avenue-dataroom`.
2. Click **Fork** (top right).
3. Name the fork something like `<project-slug>-dataroom` (e.g. `silverpine-dataroom`).
4. Make it **private** if the original was — *Settings → Danger Zone → Change visibility*.

**Option B — Clone locally and push to a new repo:**

```bash
git clone https://github.com/KevinSimpson9/avenue-dataroom.git my-new-project-dataroom
cd my-new-project-dataroom
rm -rf .git
git init
git add .
git commit -m "Initial commit from Avenue template"
# Then create a new GitHub repo and push:
git remote add origin git@github.com:<you>/my-new-project-dataroom.git
git push -u origin main
```

---

## 3. Project-specific content swaps (find & replace)

This is the bulk of the work. Open the repo in your editor (VS Code, etc.) and run a project-wide find & replace for each item below.

### 3.1 Branding and project name

| Find | Replace with |
|---|---|
| `The Avenue at Fountain Hills` | Full project name |
| `The Avenue` | Short brand name (used in nav, emails, hero accents) |
| `Fountain Hills` | City |
| `Fountain Hills, Arizona` | City + State |
| `Avenue of the Fountains` | Street name |
| `16740 E. Avenue of the Fountains` | Full street address |
| `16740 E. Ave of the Fountains LLC` | LLC / disclosing-party legal name |
| `Fountain Hills, AZ 85268` | City + state + ZIP |
| `https://theavenuefh.com` | Public marketing site URL (or remove tile if N/A) |
| `dataroom.theavenuefh.com` | New data-room subdomain |
| `Kevin@AKCapital.fund` | Contact email shown to investors |
| `AK Capital Investments` | Sponsor / GP entity name |

Files that hold this content (most edits land here):

- `public/index.html` — gate page (login + NDA modal)
- `public/room.html` — protected room (deal overview + tiles)
- `api/sign-nda.js` — confirmation email greetings
- `api/forgot-password.js` — re-send email
- `api/_nda-content.js` — full NDA legal text

### 3.2 Deal headline

In `public/room.html`, find the hero block (around line 487–491) and rewrite:

```html
<div class="eyebrow">Avenue of the Fountains · Fountain Hills, Arizona</div>
<h1 class="room-title">Capital raise of $350K at <em>20% APR</em></h1>
<p class="room-subtitle">Backed by a second-position mortgage and a personal guarantee. Fully entitled six-unit luxury townhome development ready to break ground.</p>
```

Keep it short. The format that works:
- **Eyebrow**: location, single line, all-caps treatment is automatic.
- **Title**: the deal in one phrase. The `<em>` wraps the gold-italic accent.
- **Subtitle**: 1–2 sentences, security + project description.

### 3.3 Stat strip (4 numbers under the hero)

Same file, just below the hero. Update each stat:

```html
<div class="stat-cell">
  <div class="stat-label">Appraised Value</div>
  <div class="stat-val">$15.42<em>M</em></div>
</div>
```

Pattern: `<em>` wraps the unit suffix (`M`, `K`, `%`, `x`). The four slots:

1. **Appraised value** — total stabilized value
2. **Current raise** — dollars open in this tranche
3. **APR** — investor return
4. **Coverage ratio** — appraised value ÷ raise (or total debt + raise)

### 3.4 Investor overview narrative + deck banner

```html
<div class="overview-narrative" style="max-width: 820px;">
  <p>Proceeds close the equity gap on a six-unit luxury townhome development...</p>
</div>

<a href="#" data-doc="deck" class="deck-banner drive-link">
  <div>
    <div class="deck-banner-eyebrow">Investor Overview Deck · 14 slides · April 2026</div>
    <div class="deck-banner-title">Capital stack, returns, timeline &amp; risk mitigation</div>
  </div>
  <span class="deck-banner-btn">View deck →</span>
</a>
```

One sentence in the narrative — the stat strip already shows the numbers. Update the deck banner with your slide count and date.

### 3.5 Document tiles (financial, project, sponsor)

Each tile is a `<a class="doc-row drive-link" data-doc="<key>">`. The `data-doc` value must match a key in `api/file.js` `DOC_MAP`. The default keys:

| `data-doc` | Tile name | Section | Drive env var |
|---|---|---|---|
| `deck` | Investor Overview Deck | Hero banner | `DRIVE_FILE_DECK` |
| `appraisal` | Independent Appraisal | Financial documentation | `DRIVE_FILE_APPRAISAL` |
| `bov` | Broker's Opinion of Value | Financial documentation | `DRIVE_FILE_BOV` |
| `casa` | Senior loan term sheet | Financial documentation | `DRIVE_FILE_CASA` |
| `budget` | Detailed build budget | Financial documentation | `DRIVE_FILE_BUDGET` |
| `plans` | Architectural plans | Project & permits | `DRIVE_FILE_PLANS` |
| `approvals` | City approvals & permits | Project & permits | `DRIVE_FILE_APPROVALS` |
| `track-record` | Developer track record | Sponsor & track record | `DRIVE_FILE_TRACK_RECORD` |

Update each tile's display name and meta line. If you need a tile for a new doc type, see **Section 11**.

### 3.6 Sponsor section

In room.html, the **Sponsor & track record** section (`— 04`) holds:

- A small italic line under the section heading (combined experience claim)
- Two principal cards (`<div class="principal-card">`) — one per partner

Update the avatar initials, role, name, org, and bio for each principal. Cards are fully self-contained — copy/paste a card to add a third partner if needed.

### 3.7 NDA legal content

`api/_nda-content.js` builds the signed NDA PDF. The NDA recital block at the top mentions:

- Disclosing party (LLC name)
- Project name
- City & state
- A long "Definition of Proprietary Information" paragraph that references the project address

Have your attorney review the NDA before first deploy. The structure (Purpose, Definition, Exceptions, Restrictions, Remedies, Term, Information Return, Severability, Governing Law) is standard and can stay; replace project-specific language inside.

The same NDA text is also embedded in the modal on `public/index.html` (so investors can read before signing). Keep the two in sync — copy/paste sections one-to-one.

### 3.8 Footer

Bottom of `public/room.html`:

```html
<div class="room-footer">
  <div>The Avenue · 16740 E. Avenue of the Fountains · Fountain Hills, AZ 85268</div>
  <div>Confidential · Not a securities offering · Accredited investors only</div>
</div>
```

Update the address line.

---

## 4. Hero rendering image

The hero on `/room` uses `public/hero-rendering.jpg` as a full-bleed background.

1. Drop your project rendering at `public/hero-rendering.jpg`.
2. Use a **landscape** image, ideally 1600×900 or wider. JPG keeps file size reasonable; PNG is fine if the rendering has hard edges.
3. Aim for **under 800 KB** so mobile loads quickly.
4. The CSS auto-applies a teal scrim — no transparency edits needed on the image itself.
5. If your image is portrait-oriented or the building falls outside the central 60%, tweak `background-position` in the inline `<style>` block at the top of `public/room.html`:

```css
.room-hero { background-position: center 32%; }
@media (max-width: 600px) {
  .room-hero { background-position: 50% 40%; }
}
```

The percentage is vertical anchor — lower numbers show the top of the image, higher numbers show the bottom.

---

## 5. Google Drive setup

The data room serves PDFs and folders directly from your Google Drive via the Drive API and a service account.

### 5.1 Create a Google Cloud project

1. Go to `https://console.cloud.google.com`.
2. Top bar → **Select a project** → **New Project**.
3. Name it `<project-slug>-dataroom`.
4. With it selected, go to **APIs & Services → Library**, search **Google Drive API**, click **Enable**.

### 5.2 Create a service account

1. **APIs & Services → Credentials → Create credentials → Service account**.
2. Name: `dataroom-service`.
3. Grant role: **Editor** (or Viewer + custom Drive scope; Editor is simplest).
4. Done.
5. Click the service account → **Keys → Add key → Create new key → JSON**.
6. Save the JSON file securely. **You will paste its full contents into a Vercel env var.**

### 5.3 Drive folder structure

Create a top-level folder in Google Drive (or a Shared Drive if your org uses them) named `<Project> Investor Data Room`. Inside it, create:

```
<Project> Investor Data Room/
├── Avenue NDAs/                ← signed NDAs land here
├── Investor Submissions/       ← uploads from investors land here
├── Deck/
├── Appraisal/
├── BOV/
├── Senior Loan/
├── Build Budget/
├── Architectural Plans/
├── City Approvals/
└── Track Record/
```

Drop the relevant document into each folder. **You may also use a single file per slot** instead of a folder — both work, see env-var formats in Section 9.

### 5.4 Share with the service account

For every folder above, right-click → **Share** → paste the service account email (looks like `dataroom-service@<project>.iam.gserviceaccount.com`) → set role to **Editor** → uncheck "Notify people" → Share.

For investor-facing PDFs (deck, appraisal, BOV, etc.), **also** set the file's general access to **"Anyone with the link · Viewer"** so the embedded Drive viewer can render them in our iframe.

### 5.5 Capture the IDs

For each folder/file, the ID is the long string in the URL:

```
https://drive.google.com/file/d/THIS_IS_THE_FILE_ID/view
https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID
```

Note them down — you'll paste them into Vercel env vars in Section 7.

---

## 6. Email setup (Resend)

Resend powers the password-delivery email after an investor signs the NDA, and the forgot-password resend.

1. Sign up at `https://resend.com`.
2. **Add a domain** matching your project (e.g. `<project>.com`).
3. Add the DNS records Resend gives you (TXT/CNAME for DKIM and SPF) at your registrar. Wait for verification (5–30 min).
4. **API Keys → Create API key** with the "Sending access" preset. Copy the key.
5. Choose a sending address — e.g. `investors@<project>.com` or `noreply@<project>.com`.
6. Choose a reply-to — typically your personal address (`<you>@<sponsor>.com`).

These three values become env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`.

> **Note:** Until your domain verifies, Resend will only send from `onboarding@resend.dev`. That's fine for testing.

---

## 7. Deploy to Vercel

### 7.1 Connect the repo

1. Go to `https://vercel.com/new`.
2. **Import** your GitHub repo (the fork you made in Section 2).
3. Framework preset: **Other** (Vercel auto-detects this is a static + serverless setup).
4. Don't deploy yet — go to **Environment Variables** first.

### 7.2 Set environment variables

Paste each variable below into Vercel (Settings → Environment Variables). Set scope to **Production, Preview, and Development** for all of them.

See full reference in Section 9. The minimum set to make the room functional:

```
DATA_ROOM_PASSWORD                <a strong, hard-to-guess password>
SESSION_SECRET                    <random 64-char string — generate with `openssl rand -hex 32`>
GOOGLE_SERVICE_ACCOUNT_KEY        <paste the entire JSON file from Section 5.2>
GOOGLE_DRIVE_NDA_FOLDER_ID        <ID of the "Avenue NDAs" folder>
DRIVE_FILE_DECK                   <Drive file or folder ID>
DRIVE_FILE_APPRAISAL              <Drive file or folder ID>
DRIVE_FILE_BOV                    <Drive file or folder ID>
DRIVE_FILE_CASA                   <Drive file or folder ID>
DRIVE_FILE_APPROVALS              <Drive file or folder ID>
DRIVE_FILE_BUDGET                 <Drive file or folder ID>
DRIVE_FILE_PLANS                  <Drive file or folder ID>
DRIVE_FILE_TRACK_RECORD           <Drive file or folder ID>
DRIVE_FOLDER_UPLOADS              <ID of the "Investor Submissions" folder>
RESEND_API_KEY                    re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL                 The Avenue <investors@<project>.com>
RESEND_REPLY_TO                   <you>@<sponsor>.com
NDA_NOTIFY_EMAIL                  <optional — bcc address for NDA confirmations>
```

> **Drive ID format tip:** A bare file ID renders the file in the in-app viewer. A folder ID prefixed with `folder:` (e.g. `folder:1abc...`) renders an in-app picker that lists files inside. A full URL is also accepted and passed through.

### 7.3 Deploy

Hit **Deploy**. First build takes ~1–2 minutes. When it's green, visit the auto-assigned `<project>.vercel.app` URL and confirm the gate page loads.

---

## 8. Custom domain

1. **Vercel → Project → Settings → Domains → Add**.
2. Enter `dataroom.<your-project>.com`.
3. Vercel shows a CNAME to point at. Add it at your DNS provider (Cloudflare, etc.):
   ```
   Type: CNAME
   Name: dataroom
   Target: cname.vercel-dns.com
   Proxy: OFF (DNS only) if using Cloudflare
   ```
4. Wait 1–10 minutes for DNS + SSL provisioning.
5. Visit `https://dataroom.<your-project>.com` — gate page should load over HTTPS.

---

## 9. Environment variables — full reference

| Variable | Required | Format | Notes |
|---|:---:|---|---|
| `DATA_ROOM_PASSWORD` | ✅ | string | What investors enter to unlock. Pick something memorable but not guessable. |
| `SESSION_SECRET` | ✅ | string (≥32 chars) | Signs the auth cookie. **Never share. Never reuse across projects.** Generate with `openssl rand -hex 32`. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ✅ | JSON | Full contents of the service-account JSON, pasted as one line. |
| `GOOGLE_DRIVE_NDA_FOLDER_ID` | ✅ | Drive folder ID | Where signed NDAs are saved + the registry file lives. |
| `DRIVE_FILE_DECK` | ✅ | file ID or `folder:<id>` or URL | Investor overview deck. |
| `DRIVE_FILE_APPRAISAL` | ✅ | same | Independent appraisal. |
| `DRIVE_FILE_BOV` | optional | same | Broker's opinion of value. Leave unset → tile shows "Will update soon". |
| `DRIVE_FILE_CASA` | ✅ | same | Senior loan term sheet. Variable name is a holdover; rename if you want via `api/file.js` `DOC_MAP`. |
| `DRIVE_FILE_APPROVALS` | ✅ | same | City approvals / permits. |
| `DRIVE_FILE_BUDGET` | ✅ | same | Detailed build budget. |
| `DRIVE_FILE_PLANS` | ✅ | same | Architectural plans. |
| `DRIVE_FILE_TRACK_RECORD` | ✅ | same | Sponsor / developer track record. |
| `DRIVE_FOLDER_UPLOADS` | ✅ | folder ID | Where investor uploads land. |
| `RESEND_API_KEY` | ✅ | `re_…` | Sending API key. |
| `RESEND_FROM_EMAIL` | ✅ | `Name <addr>` | Verified sender. Until domain is verified, use `onboarding@resend.dev`. |
| `RESEND_REPLY_TO` | recommended | email | Where investor replies should go. |
| `NDA_NOTIFY_EMAIL` | optional | email | BCC address on NDA confirmations. Useful for record-keeping. |

> **Any missing `DRIVE_FILE_*` variable** → that tile renders a polite "Will update soon" notice instead of breaking. Safe to deploy with placeholders.

---

## 10. First-run verification

Before sharing the URL with investors, walk through this checklist:

- [ ] Visit `https://dataroom.<project>.com` — gate page loads, branding correct.
- [ ] Click **Need access? Get password** → NDA modal opens, scrolls cleanly.
- [ ] Sign the NDA with a **test email** you control. After signing:
  - [ ] Confirmation email arrives within 30 seconds.
  - [ ] Email contains the access password and signed PDF attached.
  - [ ] You're auto-logged in to `/room`.
- [ ] In `/room`:
  - [ ] Hero rendering loads (no broken image icon).
  - [ ] Stats display correctly.
  - [ ] **View deck** banner opens the deck inline.
  - [ ] Each document tile opens correctly.
  - [ ] Tiles you haven't filled show "Will update soon" (not an error).
  - [ ] **Submit your documents** upload accepts a small test PDF.
- [ ] Open Google Drive:
  - [ ] **Avenue NDAs** folder has a new PDF named `<date>__<TestName>__<Project>_NDA.pdf`.
  - [ ] **Investor Submissions** folder has the test upload.
  - [ ] `nda-registry.json` exists in the NDA folder with one entry.
- [ ] Sign out → password gate is shown again. Enter the password directly → unlocks.
- [ ] **Forgot password?** flow with the test email → password re-emails. With a fake email → NDA modal auto-opens.

If any step fails, jump to **Section 13 — Common issues & fixes**.

---

## 11. Adding or swapping documents later

### 11.1 Swap a document

You don't need to redeploy code. Just update the env var.

**Vercel → Settings → Environment Variables → DRIVE_FILE_<KEY> → Edit → paste new file ID → Save.** Then trigger a redeploy: Vercel applies env-var changes only on the next deploy. Push any commit, or in **Deployments** click the latest → **⋯ → Redeploy**.

### 11.2 Add a brand-new tile

Two small edits, one env var:

**1. `api/file.js`** — add to `DOC_MAP`:
```js
const DOC_MAP = {
  // ...existing keys...
  'rentroll': 'DRIVE_FILE_RENTROLL'
};
```

**2. `public/room.html`** — copy any existing `<a class="doc-row drive-link">` block and change the `data-doc` value:
```html
<a href="#" data-doc="rentroll" class="doc-row drive-link">
  <div class="doc-tag"><span>PDF</span></div>
  <div class="doc-info">
    <div class="doc-name">Stabilized Rent Roll</div>
    <div class="doc-meta">Trailing 12 mo · Q1 2026</div>
  </div>
  <span class="doc-arrow">→</span>
</a>
```

**3. Vercel** — add `DRIVE_FILE_RENTROLL` env var with the Drive file ID. Redeploy.

### 11.3 Remove a tile

Delete the `<a>` block in `public/room.html`. Optionally also delete the row in `DOC_MAP` and the env var, but leaving them does no harm — orphaned env vars are free.

---

## 12. Updating copy, numbers, or the rendering

All investor-facing copy lives in **`public/room.html`** and **`public/index.html`**. Edit, commit, push — Vercel auto-deploys in ~1 minute.

To swap the hero rendering, replace `public/hero-rendering.jpg` with a new file of the same name. Commit, push.

> **Tip:** keep edits as small focused commits. Easy to revert if a number turns out wrong.

---

## 13. Common issues & fixes

**Hero rendering shows blank teal background.**
JPG is missing or didn't deploy. Check `public/hero-rendering.jpg` is in the repo. If it just won't show on Vercel, push any small commit to force a fresh build.

**Tile shows "Will update soon" but I set the env var.**
Vercel applies env-var changes only on the next build. Trigger a redeploy.

**Tile errors "Unable to open document."**
Drive file isn't shared with **Anyone with the link · Viewer**. Open the file in Drive → Share → change general access.

**NDA confirmation email never arrives.**
Either Resend domain isn't verified (check Resend dashboard) or `RESEND_API_KEY` is wrong. Until the domain verifies, set `RESEND_FROM_EMAIL` to `The Avenue <onboarding@resend.dev>` (Resend's sandbox sender).

**"Server not configured" message after signing.**
Means one of `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_KEY`, or `GOOGLE_DRIVE_NDA_FOLDER_ID` is unset. Check Vercel env vars.

**Forgot-password says "no NDA on file" for someone you know signed.**
The registry file (`nda-registry.json` in the NDA folder) didn't pick them up. Open it in Drive — if their email isn't there, append manually:
```json
{ "email": "name@example.com", "name": "Their Name", "signedAt": "2026-04-15T00:00:00Z", "reference": "" }
```

**Investor reports the gate page won't load on iOS Safari.**
Almost always a stale cache. Have them close the tab fully and reopen, or Settings → Safari → Clear History and Website Data.

---

## 14. File map

What does what, in case you need to dig in:

| File | Purpose |
|---|---|
| `public/index.html` | Public gate page — password input only (NDA flow removed). |
| `public/closed.html` | "This deal is closed" page shown after entering the gate password. |
| `public/room.html` | The real data room — hero, stats, overview, doc tiles. Served only to signed-in portal users. |
| `public/portal.html` | Investor portal hub — data-room link, investment summary, documents, updates, messages. |
| `public/portal-admin.html` | Admin dashboard — roster, add investor, updates, messages inbox. |
| `public/portal-signin.html` / `public/portal-setup.html` | Portal sign-in and invite password setup. |
| `public/styles.css` | Shared gate/room styles. Brand tokens at top (colors, fonts). |
| `public/hero-rendering.jpg` | Hero background image. |
| `api/unlock.js` | Verifies the gate password, sets the data-room session cookie. |
| `api/file.js` | Resolves a `data-doc` key to a Drive viewer URL or folder listing. Reads `DRIVE_FILE_*` env vars. |
| `api/upload.js` | Receives uploads, saves to the uploads Drive folder. |
| `api/room.js` | Serves `/room` — real docs for portal users (investor or admin), the closed page otherwise. |
| `api/logout.js` | Clears the data-room session cookie. |
| `api/_auth.js` | Data-room session signing / verification helpers. |
| `api/_deal-docs.js` | Shared deal-document map used by `file.js`. |
| `api/portal/[[...slug]].js` | Single function handling **all** Investor Portal routes (auth, roster, folders, uploads, updates, messages, add-investor, data-room bridge). |
| `api/_portal-auth.js` | Portal sessions, scrypt password hashing, single-use invite/reset tokens. |
| `api/_portal-registry.js` | Investor + admin registry (`investor-registry.json` on Drive). |
| `api/_portal-updates.js` / `api/_portal-messages.js` | Drive-backed JSON stores for updates and messages. |
| `api/_portal-email.js` | Resend email templates (invite, message + update notifications). |
| `vercel.json` | Routes (`/room`, `/portal/*`), security headers. |
| `.env.example` | Template of env vars (copy to `.env.local` for local dev). |

---

## Appendix — What gives this an institutional feel

A few small things matter more than they look. Keep these for any new project:

- **The deal in the headline.** Not "Welcome to the data room" — the actual return and security in one phrase.
- **Stats above the fold.** Four numbers in a strip, with the unit (`M`, `%`) in italic gold.
- **One deck CTA, prominently placed.** Investors want to read the deck, not browse tiles. Put the deck banner immediately after the overview narrative.
- **Themed sections, not a flat document list.** *Financial documentation* / *Project & permits* / *Sponsor & track record* — three to four sections, each one obvious.
- **Restraint.** No buzzwords, no exclamation marks, no gradient banners. Numbers, names, dates. Let the documents speak.
- **A real rendering in the hero.** Sky, lights, people on the sidewalk. Communicates more than 200 words of copy.

---

*Built on the Avenue at Fountain Hills data-room template. Questions while spinning up a new project — keep notes; we'll roll improvements back into this guide.*
