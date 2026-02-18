# Funnel Command Center

A hosted revenue intelligence platform built on Next.js + Google Drive + Vercel. Two collaborators share one Google Drive folder as the data layer — no database required.

---

## Architecture

```
Browser (Next.js / Vercel)
    ↕ Google Drive API (OAuth — each user's own token)
Shared Google Drive Folder
    ├── master-data.json          ← funnel scorecard (single source of truth)
    └── reports/
        ├── mckinsey-assessment.json
        └── mckinsey-assessment.md
```

---

## Setup (one-time, ~15 minutes)

### 1. Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or reuse one)
3. Enable **Google Drive API**: APIs & Services → Library → search "Drive API" → Enable
4. Create OAuth credentials: APIs & Services → Credentials → **Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: add both
     - `http://localhost:3000/api/auth/callback/google` (for local dev)
     - `https://your-app.vercel.app/api/auth/callback/google` (replace with your Vercel URL)
5. Copy the **Client ID** and **Client Secret**

> **OAuth consent screen**: Set to External, add both Google accounts as test users while in development mode. Add scopes: `email`, `profile`, `https://www.googleapis.com/auth/drive`.

---

### 2. Shared Google Drive Folder

1. One person creates a folder in Google Drive
2. Share it with the other Google account (Editor access)
3. Copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/`**`THIS-IS-THE-FOLDER-ID`**
4. Both users will paste this ID on first login

---

### 3. Local Development

```bash
# From the web/ directory
npm install

# Copy env file and fill in values
cp .env.local.example .env.local
# Edit .env.local with your credentials

# Run dev server
npm run dev
# → http://localhost:3000
```

`.env.local` values:

| Variable | Where to get it |
|----------|----------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` for local dev |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |

---

### 4. Deploy to Vercel

1. Push the `web/` directory to a GitHub repository
2. Import it at [vercel.com/new](https://vercel.com/new)
   - **Root directory**: `web` (if it's a subdirectory)
   - **Framework**: Next.js (auto-detected)
3. Add all 5 environment variables in Vercel project settings
4. Update `NEXTAUTH_URL` to your Vercel URL (e.g. `https://funnel-command.vercel.app`)
5. Update the OAuth redirect URI in Google Cloud Console to match your Vercel domain

---

## First Login

1. Visit the app URL
2. Click **Continue with Google** — sign in with your Google account
3. Paste your shared Google Drive folder ID when prompted
4. The app reads `master-data.json` from that folder

Both users follow the same steps with their own Google accounts. Because they both have access to the same Drive folder, they see identical data.

---

## Data Flow

### Adding / Updating Data

Upload files to the Drive folder via the **Upload** button in the app sidebar. The app looks for `master-data.json` as the primary data source.

If you're using Claude Code locally to process data:
1. Use Google Drive desktop sync to have the folder locally
2. Point Claude Code at the local sync path
3. Changes sync to Drive automatically → reflected in the web app on next refresh

### Generating a McKinsey Assessment

The **Generate Assessment** button unlocks when data completeness reaches ≥70%. Clicking it:
1. Sends `master-data.json` to Claude (claude-opus-4-5)
2. Claude returns a structured JSON assessment
3. Both `mckinsey-assessment.json` and `mckinsey-assessment.md` are saved to `reports/` in Drive
4. The report renders immediately in-app

---

## Project Structure

```
web/
├── app/
│   ├── layout.tsx                  ← root layout, SessionProvider, Geist font
│   ├── page.tsx                    ← main orchestrator (auth, folder, data, modals)
│   ├── signin/page.tsx             ← Google sign-in page
│   └── api/
│       ├── auth/[...nextauth]/     ← NextAuth handler
│       ├── drive/data/             ← GET/PUT master-data.json
│       ├── drive/reports/          ← GET report files
│       ├── drive/upload/           ← POST file → Drive inbox
│       ├── folder/                 ← validate Drive folder ID
│       └── report/generate/        ← POST: Claude → structured report → Drive
├── components/
│   ├── FunnelDashboard.tsx         ← main dark dashboard shell + 5 tabs
│   ├── FunnelFlow.tsx              ← interactive 5-stage SVG pipeline
│   ├── McKinseyReport.tsx          ← full-page report (MECE tree, financials, plan)
│   ├── FileUploader.tsx            ← drag-and-drop upload modal
│   └── FolderSetup.tsx             ← first-run folder ID input
└── lib/
    ├── auth.ts                     ← NextAuth config (Google + Drive scope)
    ├── google-drive.ts             ← Drive API wrappers (read/write/upload)
    ├── report-readiness.ts         ← data completeness scoring (0–100)
    └── types.ts                    ← shared TypeScript interfaces
```

---

## McKinsey Report Sections

1. **Executive Summary** — Situation / Complication / Resolution
2. **MECE Issue Tree** — collapsible root → branch → leaf hierarchy
3. **Financial Model** — per-stage current vs. optimized ARR, delta
4. **90-Day Action Plan** — three 30-day sprints × 3 prioritized initiatives
5. **Strategic Assessment** — overall grade, top risks, top opportunities, confidence

Report unlocks at **≥70% data completeness**. Download as `.md` or print to PDF from the report view.

---

## Local Dev Notes

- **No hot-reload for Drive data**: Refresh the page to pull updated Drive data
- **OAuth tokens expire**: NextAuth handles refresh automatically via `next-auth` session
- **CORS**: All Drive API calls go through Next.js API routes (server-side) — no client-side Drive calls
- **Folder ID is browser-local**: Stored in `localStorage` under key `sob_folder_id`. Both users enter the same folder ID manually.
