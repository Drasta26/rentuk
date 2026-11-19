# RentUK — v2 (local-only)

Simple property-management web app for UK landlords: dashboard, expenses, reminders and compliance (gas safety, EPC, deposit protection, etc.), tenants, multiple properties.

## Versions (Mac: `AI Project/RentUK/`)
- `RentUK-replit-export-2026-10-30.zip` — original Replit export, SHA-256 f2ee2be7e15be9c7e67685dcbeba19234ba9a353b9ca4e3d51b3f2070a4f87b2. A copy is also in Downloads.
- `v1-replit-2026-10-30/` — unchanged Replit version (Firebase + Google sign-in).
- `v2-claude-2026-10-30/` — **current**. Local-only.
- The earlier Replit project was left untouched (Private, unpublished, dev database empty).

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
- Delete all my data: More → Your data, typed DELETE confirmation; clears only the keys in `RentUKLib.DATA_KEYS` (other apps on the same github.io site are untouched), keeps the offline app cache.
- Calendar export: certificate renewal dates and open reminders as an .ics file with a 14-day alert.
- Tenant move-in pack: printable checklist (before move-in, move-in day, within 30 days), meters, keys, inventory and signatures; opens in a new window.
- Demo mode: open `index.html?demo` (or the link on the setup screen). Loads 3 made-up properties (great, fair and poor scores) into memory only; real saved data is never read or changed. Banner links back to the normal app.
- Accessibility pass (30 Oct 2026): all visible text on all four tabs and the setup wizard measured at WCAG AA contrast (4.5:1, 3:1 for large text) in demo mode; every input and button has a label; popups are proper dialogs (focus moves in, Tab stays inside, Escape closes, focus returns); visible yellow keyboard focus ring; skip link; one `main` landmark (removed a duplicate `#app` ID); tab and property buttons announce which is selected; respects "reduce motion"; 44px touch targets on phones. Not tested with a real screen reader (VoiceOver/NVDA).
- Installable app / PWA (4 Nov 2026): `manifest.webmanifest`, icons in `icons/` (redraw with `python3 scripts/make-icons.py`), splash screen, `sw.js` offline cache (bump `VERSION` on every release), `pwa.js` for install help and the update message. Service workers need https or localhost, so opening from a folder skips them. Tested in Chromium (Playwright): offline load including `?demo`, update message and reload, install button, iPhone hint (iPhone user agent only, not real Safari). Lighthouse 13.5 mobile: 99/100/100/100 (performance/accessibility/best practices/SEO). Lighthouse no longer has a PWA category; Chrome's installability check reports no errors.
- Redesign (5 Nov 2026): app-like shell with no page scrolling. Top bar (logo + property switcher), one screen at a time, bottom tab bar (Home, Checks, Money, More; Dates merged into Checks on 17 Nov 2026). Lists page with Back/Next (`pager()` sizes rows to the screen). All forms open as bottom sheets (`openSheet()`). Home: score hero, "Next up" (most urgent item), 4 tiles. Dates merges your reminders with certificate renewals and lease end; quick-add ideas when there is room. Money: Overview / Costs / Tax. First launch shows the sample dashboard (see Look). Checks & dates: the legal checks (light green when done, light amber when they need doing) then "Your dates" (own reminders, extra dates, lease end); certificate renewals and the standard gas/electrical/EPC/deposit reminders are hidden there because the check rows cover them. Look (revised 6 Nov 2026 to light): airy pale base with slowly drifting soft colour (lavender, mint, peach) behind white frosted-glass cards; floating tab bar and + button; one brand colour (indigo) and one warm accent. Home tiles are all sky blue; anything needing a look gets a solid amber warning badge (17 Nov 2026). The indigo score card sits at the bottom with the tagline "Your app. Your data. Your choice." underneath. Icons are crisp line icons in coloured rounded squares (no emoji). Tab bar icons are coloured per section; the open tab glows indigo to sky. First visit (nothing saved) opens this dashboard with sample data in memory, with a "Set up mine" link (`?setup`) that starts the real setup; the old welcome card now shows only if storage is blocked or setup is closed early.
- Robustness fixes (6 Nov 2026): open tabs stay in step after Delete all; tidier handling of imported text and saved data; confirmation before a restore replaces data.
- More (17 Nov 2026): four smaller sky tiles (Move-in pack, Your data, Feedback, About) plus a long indigo Helpful resources card (12 official GOV.UK, HMRC and HSE links, each checked live on 17 Nov 2026; re-check before releases).
- Ask (17 Nov 2026): centre tab in the bottom bar with the assistant's avatar (`icons/assistant.svg`, a free illustrated portrait, clearly an AI). Opens a full-screen chat. Voice chat and Video chat (Premium) are shown as "coming soon" only; nothing behind them is built. Chat works through the relay with no key needed; the own-key option only shows if the relay address is emptied.
- Chat relay (`relay/`, deployed 17 Nov 2026 at https://rentuk-chat.rentuk.workers.dev/ via the Cloudflare dashboard, with the CEO's approval): a Cloudflare Worker that holds the owner's Anthropic key as a secret so users need no key. It accepts requests only from the RentUK site, fixes the model and prompt, limits sizes, rate-limits each visitor and never logs content. Tested with a stubbed Anthropic API (`tests/relay.test.js`). Request logs are off; rate limit 6 per minute per visitor (approximate). Limits: 24 KB per request, 11 turns, earlier answers up to 8,000 characters, answers up to 1,500 tokens; the app sends only the last five exchanges and keeps answer text only. The owner's key was added by the CEO as a Cloudflare secret. Any change to the deployed relay needs the CEO's approval.
- Ask RentUK chat: calls the Claude Messages API from the browser with the user's own Anthropic key (model `claude-opus-5-5`, effort low, server-side refusal fallback). The key is held only in that tab's memory, never in storage. Only the typed questions go to Anthropic, plus scores and totals (no names, addresses or tenant details) if the user ticks the box. Replies are shown as plain text, never as HTML. Tested with a stubbed network only; no live call has been made.
- Unit tests: `npm test` (Node 20+, no packages), 31 passing on 6 Nov 2026.

## Product upgrade (18–19 Nov 2026, local commits, not yet pushed)
- Tabs: Home, Checks, Ask, Money, Property. Menu (☰, top right) holds Your data, resources, feedback, about/privacy.
- Data (localStorage keys): properties (now with `nation`, `pastTenants`, tenant deposit fields `depositAmount/Scheme/Ref/Received/Protected`, `rentDueDay`, `rentFrom`, compliance values date | true | 'na' | 'unsure' and `epcRating`), expenses (`issueId` links a repair cost), reminders, aobReminders (`propertyId`; empty = all properties), payments, issues, documents (list only). Document files live in IndexedDB `rentuk-files` (`files.js`); demo mode uses an in-memory file store. All new lists are validated in `validateBackup` and cleared by Delete all.
- `rules.js`: compliance rules per nation (England, Wales, Scotland, NI) with legal duty vs good practice, intervals, plain-English detail and official source URL; `VERIFIED` = 18 November 2026; `upcoming` lists announced changes not in force. Re-check against official sources before every release (research notes were in the session scratchpad, not the repo).
- Wording rule: never say a landlord is "compliant". Use "up to date (as recorded)", and keep "a guide, not legal advice". Statuses: Up to date, Expiring soon (60 days), Expired, Action required, Not applicable, Unable to verify. Only legal duties are scored; not applicable is excluded.
- Rent: `rentLedger` counts monthly dues from `rentFrom` (or lease start) to today or tenancy end and compares with recorded payments; payments pay off the oldest month first. Only recorded payments count as received.
- Deposits: `depositCheck` caps (England 5/6 weeks, Scotland 2 months, NI 1 month, Wales none found) and deadlines (30 days; Scotland 30 working days, bank holidays not excluded; NI 28 days).
- Screens fit the phone: `render()` draws lists optimistically then trims rows until nothing overflows (measured with animations paused); re-fits on resize. Tested at 390x844 and 375x667 (all screens fit) and 320x568 (Home, Rent and Tax may scroll slightly).
- Tests: `npm test`, 73 passing on 19 Nov 2026 (new files: tests/compliance, deposit, documents, csv).

## Open gaps
- No browser (end-to-end) tests or CI yet.
- `script.js` is one large file; splitting into modules is on the roadmap.
- Compliance rules for all four UK nations were checked against official sources on 18 Nov 2026 (see rules.js). Could not verify: formal withdrawal of How to Rent; final England written-statement content; Wales security-deposit cap; NI notice-to-quit periods and any NI legionella duty. Re-check before each release.
- Reminder dates and compliance items are informational only; they are not legal advice on landlord obligations.
- Hosted on GitHub Pages since 5 Nov 2026: https://drasta26.github.io/rentuk/ (serves `main`). Every push to `main` goes live.

## Foundation (applies to all of Asta's apps; adopted 1 Nov 2026)
Tagline: "Your app. Your data. Your choice."

The 3 USPs, which are non-negotiable:
1. **We never see your data.** Everything stays on the user's device. Users bring their own AI key. No accounts, no tracking, no tracking ads, nothing to breach.
2. **You own everything.** Your app, your data, your key. Export, delete or take it anywhere. Open-source code anyone can check.
3. **Fair by design.** Free core. Pay what you want or one-off upgrades. No subscription traps. Open costs page.

Build rules: local-first storage; no analytics, trackers, ad networks or data-leaking third-party scripts; never log prompts or user content; always offer export and delete-all; never commit secrets (scan history before any push); made-up sample data only; MIT licence unless Asta says otherwise; truthful privacy claims ("we never see or store your data" if text goes to an AI provider). No adverts. A later support button uses "Support", not "Donate", with the copy "Built by one. Funded by many." UK English. If a request conflicts with this foundation, say so and suggest a compliant alternative.
- Security and privacy (17 Nov 2026): Content Security Policy in `index.html` (scripts only from this site; network only to the relay and Anthropic), so never add inline `onclick` handlers or outside scripts. Privacy notice in the app (About → Read our privacy notice, and the chat footer) and in `PRIVACY.md`; keep both in step.
