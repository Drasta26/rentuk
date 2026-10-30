# RentUK — v2 (local-only)

Simple property-management web app for UK landlords: dashboard, expenses, reminders and compliance (gas safety, EPC, deposit protection, etc.), tenants, multiple properties.

## Versions (Mac: `AI Project/RentUK/`)
- `RentUK-replit-export-2026-10-30.zip` — original Replit export, SHA-256 f2ee2be7e15be9c7e67685dcbeba19234ba9a353b9ca4e3d51b3f2070a4f87b2. A copy is also in Downloads.
- `v1-replit-2026-10-30/` — unchanged Replit version (Firebase + Google sign-in).
- `v2-claude-2026-10-30/` — **current**. Local-only.
- Replit project `@bewithbreath/RentUK` left untouched (Private, unpublished, dev database empty).

## v2 changes (30 Oct 2026)
- Removed Firebase SDK, `firebase-config.js`, Google sign-in, cloud sync and the login screen. The app opens straight to the dashboard.
- Removed the Google Fonts link (it sent the visitor's IP to Google). Falls back to system fonts.
- Removed Replit-only files (`.replit`, `.config/`).
- Added the missing `addExportImportButtons()` (v1 called it but never defined it, which threw an error on every dashboard load). Adds Export/Import backup buttons and a local-storage notice.
- Fixed the export link (missing `data:` prefix), and renamed the backup file to `rentuk-backup-YYYY-MM-DD.json`.
- Tested in headless Chromium: no console errors, no external network requests, property and expense save and survive reload, export downloads.

## How to run
Double-click `index.html` (opens in the default browser). Data lives in that browser's localStorage only. Different browsers or devices do not share data; use Export/Import to move it.

## Compliance position (not legal advice)
- No server, no accounts, no third-party processors. The developer does not receive or hold any user data.
- A landlord using the app to record tenant names and contacts is still a controller under UK GDPR for their own records; the app keeps that data on their device only.
- Unverified: whether any ICO fee applies to individual landlords — for the landlord to check, not the app.

## Done since import (see git log)
- User text escaped before rendering (`escapeHtml` in `lib.js`).
- Backup files validated on import (schema, size, safe IDs).
- Storage failures handled: corrupt values fall back to defaults; full or blocked storage shows a warning instead of crashing (`readJson` / `writeAll` in `lib.js`).
- Unit tests: `npm test` (Node 20+, no packages), 12 passing on 30 Oct 2026.

## Open gaps
- No browser (end-to-end) tests or CI yet.
- `script.js` is one large file; splitting into modules is on the roadmap.
- Reminder dates and compliance items are informational only; they are not legal advice on landlord obligations.
- Hosting not chosen (any static host works; still no data leaves the device).
