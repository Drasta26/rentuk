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
Double-click `index.html` (opens in the default browser), or run `python3 -m http.server 8000` in this folder for the offline/installable version. Data lives in that browser's localStorage only. Different browsers or devices do not share data; use Export/Import to move it.

## Compliance position (not legal advice)
- No server, no accounts, no third-party processors. The developer does not receive or hold any user data.
- A landlord using the app to record tenant names and contacts is still a controller under UK GDPR for their own records; the app keeps that data on their device only.
- Unverified: whether any ICO fee applies to individual landlords — for the landlord to check, not the app.

## Done since import (see git log)
- User text escaped before rendering (`escapeHtml` in `lib.js`).
- Backup files validated on import (schema, size, safe IDs).
- Storage failures handled: corrupt values fall back to defaults; full or blocked storage shows a warning instead of crashing (`readJson` / `writeAll` in `lib.js`).
- Compliance Score (0-100) per property on the dashboard: 7 England checks (gas, EICR, EPC, deposit, alarms, Right to Rent, Renters' Rights Act information), editable inline, each linked to GOV.UK. Logic in `lib.js` (`complianceScore`).
- 60-second setup wizard: opens on first launch and from "+ Add Property"; ends by showing the score.
- Share card: 1080x1080 PNG of the score only (no names, addresses or tenant details), via the device share sheet or a download.
- Tax year estimate (all properties): projected rent from lease dates, expenses or the £1,000 property allowance (whichever is bigger), tax at 20/40/45%, and a Making Tax Digital flag (£50k from Apr 2026, £30k from Apr 2027, £20k from Apr 2028, income before expenses). Checked on GOV.UK 30 Oct 2026. Not modelled: mortgage interest credit, other income, joint ownership, personal allowance.
- Calendar export: certificate renewal dates and open reminders as an .ics file with a 14-day alert.
- Tenant move-in pack: printable checklist (before move-in, move-in day, within 30 days), meters, keys, inventory and signatures; opens in a new window.
- Demo mode: open `index.html?demo` (or the link on the setup screen). Loads 3 made-up properties (great, fair and poor scores) into memory only; real saved data is never read or changed. Banner links back to the normal app.
- Accessibility pass (30 Oct 2026): all visible text on all four tabs and the setup wizard measured at WCAG AA contrast (4.5:1, 3:1 for large text) in demo mode; every input and button has a label; popups are proper dialogs (focus moves in, Tab stays inside, Escape closes, focus returns); visible yellow keyboard focus ring; skip link; one `main` landmark (removed a duplicate `#app` ID); tab and property buttons announce which is selected; respects "reduce motion"; 44px touch targets on phones. Not tested with a real screen reader (VoiceOver/NVDA).
- Installable app / PWA (4 Nov 2026): `manifest.webmanifest`, icons in `icons/` (redraw with `python3 scripts/make-icons.py`), splash screen, `sw.js` offline cache (bump `VERSION` on every release), `pwa.js` for install help and the update message. Service workers need https or localhost, so opening from a folder skips them. Tested in Chromium (Playwright): offline load including `?demo`, update message and reload, install button, iPhone hint (iPhone user agent only, not real Safari). Lighthouse 13.5 mobile: 99/100/100/100 (performance/accessibility/best practices/SEO). Lighthouse no longer has a PWA category; Chrome's installability check reports no errors.
- Unit tests: `npm test` (Node 20+, no packages), 26 passing on 4 Nov 2026.

## Open gaps
- No browser (end-to-end) tests or CI yet.
- `script.js` is one large file; splitting into modules is on the roadmap.
- Compliance rules were checked against GOV.UK and HSE on 30 Oct 2026. How to Rent (withdrawn 1 May 2026) is replaced by the Renters' Rights Act Information Sheet / written terms. Re-check before each release; rules change. Not checked: EPC minimum rating, Wales/Scotland/NI rules.
- The old `showAddPropertyForm` dialog is no longer used by any button.
- Reminder dates and compliance items are informational only; they are not legal advice on landlord obligations.
- Hosting not chosen (any static https host works, e.g. GitHub Pages; still no data leaves the device). Needed before anyone can install the app.
- No "delete all my data" button yet (the foundation requires export and delete-all).

## Foundation (applies to all of Asta's apps; adopted 1 Nov 2026)
Tagline: "Your app. Your data. Your choice."

The 3 USPs, which are non-negotiable:
1. **We never see your data.** Everything stays on the user's device. Users bring their own AI key. No accounts, no tracking, no tracking ads, nothing to breach.
2. **You own everything.** Your app, your data, your key. Export, delete or take it anywhere. Open-source code anyone can check.
3. **Fair by design.** Free core. Pay what you want or one-off upgrades. No subscription traps. Open costs page.

Build rules: local-first storage; no analytics, trackers, ad networks or data-leaking third-party scripts; never log prompts or user content; always offer export and delete-all; never commit secrets (scan history before any push); made-up sample data only; MIT licence unless Asta says otherwise; truthful privacy claims ("we never see or store your data" if text goes to an AI provider). No adverts. A later support button uses "Support", not "Donate", with the copy "Built by one. Funded by many." UK English. If a request conflicts with this foundation, say so and suggest a compliant alternative.
