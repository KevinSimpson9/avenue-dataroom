# The Avenue · Investor Data Room

A password-protected investor data room. Hosted on Vercel (free), connected to GitHub for auto-deploy, with file uploads going straight to your Google Drive.

---

## Deploy Guide — Copy/Paste This Exactly

Total time: about 25 minutes. Most of it is waiting for accounts to verify.

### Part 1 — Get the code on your computer

If you already unzipped the package, skip to Part 2. Otherwise:

```bash
# Open Terminal (Mac) or Command Prompt (Windows), then:
cd ~/Downloads
unzip avenue-dataroom-v2.zip
cd avenue-dataroom-v2
```

### Part 2 — Push to GitHub

You need a GitHub account. If you don't have one, go to https://github.com/signup first.

```bash
# Create a fresh git repo
git init
git add .
git commit -m "Initial data room"
git branch -M main
```

Now go to **https://github.com/new** in your browser:
- Repository name: `avenue-dataroom`
- **Set it to Private** (important — even though there are no secrets in the code, treat it as private)
- Do NOT initialize with a README
- Click "Create repository"

GitHub will show you a page with commands. Copy the two lines under "push an existing repository" — they look like this (with your username):

```bash
git remote add origin https://github.com/YOUR-USERNAME/avenue-dataroom.git
git push -u origin main
```

Run those two commands. Done with GitHub.

### Part 3 — Set up the Google service account (one-time, 5 min)

This lets the website save uploads to your Drive without anyone signing in.

1. Go to https://console.cloud.google.com/
2. Top bar → click the project dropdown → "New Project"
   - Name: `avenue-dataroom`
   - Click Create, wait 10 seconds for it to finish
3. Make sure the new project is selected in the top dropdown
4. Search bar at top → type "Google Drive API" → click the result → click **Enable**
5. Left sidebar → "APIs & Services" → "Credentials"
6. Top → "Create Credentials" → "Service Account"
   - Service account name: `avenue-dataroom-uploader`
   - Click Create and Continue → Skip the optional steps → Done
7. You'll see the service account in the list. Click on it.
8. Top tabs → "Keys" → "Add Key" → "Create new key" → JSON → Create
9. A JSON file downloads. **Save this file somewhere safe**. You'll paste its contents into Vercel in a minute.
10. Open the JSON file in a text editor and copy the email address shown next to `"client_email"` — it looks like `avenue-dataroom-uploader@avenue-dataroom-12345.iam.gserviceaccount.com`

### Part 4 — Create the upload folder in Google Drive

1. Go to https://drive.google.com
2. New → Folder → name it "Avenue Investor Uploads"
3. Open the folder
4. Click the share icon → paste the service account email (from step 10 above)
5. Set permission to **Editor** → Send
6. **Copy the folder ID from the URL** — when you're viewing the folder, the URL looks like:
   ```
   https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          this is the folder ID
   ```
   Save that ID. You'll paste it into Vercel.

### Part 5 — Upload your investor documents to Drive

1. Create another folder in Drive called "Avenue Investor Docs" (this is separate from the upload folder)
2. Upload the deck and any supporting documents you want to share
3. For each document, right-click → Share → "Anyone with the link" → "Viewer" → Copy link
4. Each link looks like `https://drive.google.com/file/d/1xYz123abc/view`. The part between `/d/` and `/view` is the file ID. Save these — you'll paste them into Vercel.

You don't need to upload all docs upfront. Whatever's missing will show "Document not yet available" until you add the file ID later.

### Part 6 — Deploy to Vercel

1. Go to https://vercel.com/signup → sign up with your GitHub account (one click)
2. Once in, click "Add New" → "Project"
3. Import the `avenue-dataroom` repo from GitHub
4. **Framework Preset:** select "Other"
5. **Don't click Deploy yet.** Expand "Environment Variables" and add these:

| Variable Name | Value |
|---|---|
| `DATA_ROOM_PASSWORD` | Whatever password you want investors to use (e.g., `Avenue2026!`) |
| `SESSION_SECRET` | A long random string. Run `openssl rand -base64 48` in Terminal to get one |
| `GOOGLE_DRIVE_UPLOAD_FOLDER_ID` | The folder ID from Part 4 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | The entire contents of the JSON file from Part 3 (paste the whole thing) |
| `DRIVE_FILE_DECK` | The file ID for your investor deck (from Part 5) |
| `DRIVE_FILE_PROMISSORY` | File ID for promissory note (or leave blank) |
| `DRIVE_FILE_APPRAISAL` | File ID for appraisal |
| `DRIVE_FILE_CASA` | File ID for Casa term sheet |
| `DRIVE_FILE_APPROVALS` | File ID for permits |
| `DRIVE_FILE_BUDGET` | File ID for build budget |
| `DRIVE_FILE_PLANS` | File ID for architectural plans |
| `DRIVE_FILE_RESERVATION` | File ID for Unit 6 reservation |
| `DRIVE_FILE_TRACK_RECORD` | File ID for developer track record |

6. Click **Deploy**

Wait about 90 seconds. Vercel will give you a URL like `avenue-dataroom-xyz.vercel.app`.

### Part 7 — Test it

1. Open the Vercel URL
2. Type your password → should land in the data room
3. Try clicking the deck → should open in Drive
4. Try uploading a test file → should appear in your "Avenue Investor Uploads" Drive folder

If something breaks, check the Vercel dashboard → your project → Logs tab. Errors show up there.

### Part 8 — Custom domain (optional, 5 min)

1. In Vercel: your project → Settings → Domains
2. Add a domain like `dataroom.theavenuefh.com` or `invest.theavenuefh.com`
3. Vercel shows you the DNS records to add
4. Add those records wherever your domain is registered (GoDaddy, Cloudflare, etc.)
5. Wait 2-10 minutes for DNS to propagate, then SSL is automatic

---

## Day-to-Day

### Add a new document

1. Upload it to your "Avenue Investor Docs" folder in Drive
2. Get the file ID from the share link
3. Vercel → your project → Settings → Environment Variables → add or update the right `DRIVE_FILE_*` variable
4. Redeploy: Deployments tab → click the three dots on latest → "Redeploy"

### Change the password

Vercel → Settings → Environment Variables → edit `DATA_ROOM_PASSWORD` → Save → Redeploy

### Update the design or text

Edit the files locally, then:
```bash
git add .
git commit -m "describe the change"
git push
```
Vercel auto-deploys in about 60 seconds.

### See who uploaded what

Open your "Avenue Investor Uploads" folder in Google Drive. Each file has a timestamp prefix so you can see when it came in.

---

## Why it's secure

- Password is verified server-side, never sent to the browser
- Session cookies are HMAC-SHA256 signed and expire after 7 days
- Cookies are HttpOnly, Secure, SameSite=Strict
- 800ms artificial delay on wrong passwords slows brute-force attacks
- The `/room` page won't render without a valid session — typing the URL directly redirects to the password gate
- File IDs are stored as environment variables, not in source code
- Drive uploads use a service account with access only to your specific folder
- All pages have `noindex, nofollow` so search engines won't index them
- HTTPS-only with HSTS headers

---

## File structure

```
avenue-dataroom-v2/
├── .github/                      # (empty, optional)
├── api/                          # Vercel serverless functions
│   ├── _auth.js                 # Shared session verification
│   ├── unlock.js                # POST /api/unlock - password check
│   ├── logout.js                # GET /api/logout - clear session
│   ├── room.js                  # GET /room - serves protected page
│   ├── file.js                  # GET /api/file - resolves Drive links
│   └── upload.js                # POST /api/upload - saves to Drive
├── public/
│   ├── index.html               # The gate (password entry)
│   ├── room.html                # The data room (protected)
│   └── styles.css               # All styles
├── .env.example                 # Template for environment variables
├── .gitignore
├── package.json
├── vercel.json                  # Routing + security headers
└── README.md
```

---

## Troubleshooting

**"Server not configured" error after entering password**
You forgot to set `DATA_ROOM_PASSWORD` in Vercel. Settings → Environment Variables.

**Documents won't open**
Either you haven't set the `DRIVE_FILE_*` env var for that doc, or the Drive file isn't shared as "Anyone with the link." Check both.

**Uploads fail with permission error**
The service account doesn't have access to your upload folder. Go to the folder in Drive, share it with the service account email (Editor permission).

**"Cannot find module 'googleapis'"**
Vercel didn't install dependencies. In Vercel → Settings → General → check that "Install Command" is `npm install` (the default).

**Got stuck somewhere**
Email Kevin@AKCapital.fund or DM me. Most issues are missing environment variables.

---

Built April 2026. Last updated for The Avenue at Fountain Hills.
