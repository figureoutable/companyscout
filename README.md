# Company Scout

A Next.js web application that queries the **Companies House public API** to find recently incorporated UK companies and their directors, for sales outreach.

## Features

- **Search** by **how many** most recently incorporated companies you want (newest first), plus SIC codes, company type, and registered address keyword
- **Enrich from file** tab: drop a CSV/TXT of company numbers → fetches company name, registered address, directors and director addresses from Companies House (cap per run via `ENRICH_MAX_COMPANIES`, default 500). The results table also shows **whether annual accounts are overdue**, **next accounts due date**, **whether the confirmation statement is overdue**, and **next confirmation due date** (from the company profile).
- **Results table** with company details and director names, occupations, nationalities
- **Export** to CSV — full column set including derived outreach fields; **Enrich** tab’s table also shows those derived columns plus accounts/confirmation overdue (**Search** table omits those extra columns for a simpler view)
- **Rate limiting**: configurable delay between officer lookups, exponential backoff on 429, live progress (“Fetching directors: X of Y companies”)
- **Dark mode** and responsive layout

## Tech Stack

- Next.js 15 (App Router) + React 19
- [Kokonut UI](https://kokonutui.com/)–style components (`components/kokonutui/`) + shadcn/ui, Tailwind CSS
- axios, Server Actions (API key stays server-side)

### Design

- **Logo & favicon**: explorer illustration at `public/logo.png` (also used as `app/icon.png`).
- **Jungle theme**: emerald / forest greens and warm accents in `app/globals.css` (light + dark).
- **Kokonut UI**: shimmer text and command button patterns inspired by [Kokonut UI](https://kokonutui.com/) (MIT). The shadcn registry can add more with `npx shadcn@latest add @kokonutui/<name>` when it doesn’t conflict with existing files.

## Getting started

### 1. Register for a Companies House API key

The API is free to use. Get a key from:

- **Developer hub**: [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk)

Sign in or register, then create an application and generate an API key. You’ll use this as Basic Auth (username = API key, password = empty).

### 2. Environment variables

Copy the example env file and add your key:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

```env
COMPANIES_HOUSE_API_KEY=your-api-key-here
```

Optional (defaults shown):

```env
# Delay in ms between officer API calls (default 200). Helps stay under 600 req/5 min.
OFFICER_FETCH_DELAY_MS=200
```

**Never commit `.env.local`** — it’s in `.gitignore`.

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

### Requirements

- **Node.js 18.18+** (Node 20+ recommended for Next.js 15).

### If the dev server or build acts strangely

```bash
rm -rf .next node_modules
npm install
npm run dev
```

Keep **`app/page.tsx`** as a **Server Component** (no `"use client"`, no `async` default export). Interactive UI lives in client components under `components/`.

The **“Download the React DevTools…”** line in the console is a normal dev hint, not an error.

## Email and enrichment

**Email addresses are not available** from the Companies House API. After exporting your CSV, use enrichment tools for contact data, for example:

- [Apollo.io](https://www.apollo.io/)
- [Hunter.io](https://hunter.io/)
- [LinkedIn Sales Navigator](https://business.linkedin.com/sales-solutions)

## API reference

- Base URL: `https://api.company-information.service.gov.uk`
- Advanced company search and company officers are used; all requests are made server-side so the API key is never exposed to the client.

## Daily fetch (previous day → file + optional Google Drive)

A script can run automatically (e.g. via cron) to fetch ~2k companies incorporated **the previous day**, save a CSV under `exports/`, and optionally upload it to **Google Drive**.

### Run once

```bash
npm run daily-fetch
```

Requires `.env.local` with `COMPANIES_HOUSE_API_KEY`. Optional:

- `MAX_COMPANIES_PER_DAY` — optional cap (omit to fetch **all** companies from the previous day)
- `OFFICER_FETCH_DELAY_MS=700` — delay between officer calls (stay under 600 req/5 min)

Output: `exports/companies_house_YYYY-MM-DD.csv` (date = yesterday).

### Upload to Google Drive

1. **Google Cloud**: create a project, enable the **Google Drive API**, and create a **service account**. Download its JSON key and save it somewhere safe (e.g. `secrets/google-service-account.json`). Do not commit this file.
2. **Drive folder**: create a folder in Google Drive, share it with the **service account email** (e.g. `xxx@yyy.iam.gserviceaccount.com`) as Editor. Copy the folder ID from the URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.
3. **Env** in `.env.local`:

```env
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_APPLICATION_CREDENTIALS=./secrets/google-service-account.json
```

4. Run `npm run daily-fetch` again. The script will still write the CSV to `exports/` and will also upload a copy to that Drive folder.

### Email the CSV after each run

**Easiest — [Resend](https://resend.com)** (API key only; no SMTP):

```env
RESEND_API_KEY=re_paste_your_key_here
DAILY_FETCH_EMAIL_TO=you@example.com
RESEND_FROM=onboarding@resend.dev
```

- `onboarding@resend.dev` works for quick tests. After you **verify a domain** in Resend, set `RESEND_FROM=reports@yourdomain.com`.
- Multiple recipients: `DAILY_FETCH_EMAIL_TO=a@x.com,b@y.com`

**Or SMTP** (Gmail [App Password](https://support.google.com/accounts/answer/185833)):

```env
DAILY_FETCH_EMAIL_TO=you@example.com
DAILY_FETCH_EMAIL_FROM=you@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
SMTP_SECURE=false
```

### Schedule daily at **1:00 AM** (2000 records + CSV email)

One command (from the project folder):

```bash
npm run schedule-1am
```

That installs cron: **every day at 1:00 AM** (your Mac’s local time) it runs `scripts/run-daily-fetch.sh`, which:

1. Pulls **all** companies incorporated **the previous calendar day** (no cap by default; set `MAX_COMPANIES_PER_DAY` to cap).
2. Saves `exports/companies_house_YYYY-MM-DD.csv`.
3. **Emails the CSV** via Resend if `RESEND_API_KEY` + `DAILY_FETCH_EMAIL_TO` are set.

Logs append to **`logs/daily-fetch.log`**.

- **Mac must be awake at 1am** (or enable “Wake for network access” / leave it plugged in). Sleeping Macs often skip cron.
- **List jobs:** `crontab -l`
- **Remove:** `crontab -e` and delete the `run-daily-fetch.sh` line.

Manual cron line (if you prefer): see `scripts/cron-1am.example`.

### GitHub Actions (laptop off — works with Vercel)

**Vercel** only hosts the Next.js app; it **cannot** run `daily-fetch` (would hit **~10s–5min** serverless limits; a 2k pull needs **~20–30+ minutes**).

If the repo is on **GitHub**, use **Actions** instead:

1. Push the workflow: `.github/workflows/daily-fetch.yml`
2. **Settings → Secrets and variables → Actions** — add:
   - `COMPANIES_HOUSE_API_KEY`
   - `RESEND_API_KEY`
   - `DAILY_FETCH_EMAIL_TO`
3. **Actions → Daily Companies House fetch → Run workflow** to test, or wait for the scheduled run (**04:00 UTC** daily — change the `cron` line in the workflow if you want another time).

**1am pull + 4am email?** One job can’t pause on GitHub’s runner for hours then send. This workflow does **pull → CSV → email in one go**, so the email lands **soon after** the pull finishes (~20–30 min for 2k). Scheduling at **4am UTC** means the job **starts** at 4am and you get the email around **4:20–4:30am** for a 2k pull. For a **1am start** instead, set cron to `0 1 * * *`.

You still get the **CSV by email** (Resend) and an **artifact** ZIP of `exports/*.csv` on each run.

## Project structure

- `app/page.tsx` — Search UI and results
- `app/actions.ts` — Server Actions for Companies House calls
- `components/` — SearchFilters, ResultsTable, ExportButton, ProgressBar
- `lib/companiesHouse.ts` — API client with rate limiting and backoff
- `lib/csvExport.ts` — CSV generation
- `scripts/daily-fetch-to-drive.ts` — Daily job: previous day → CSV + optional Drive
- `types/index.ts` — TypeScript types for API and UI
