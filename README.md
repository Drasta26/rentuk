# RentUK

A simple, private property-management app for UK landlords. Your property data stays on your device. Live at https://rentuk.bimuti.com/

## What it does
- **Home:** a ranked "Needs you" list (overdue rent, urgent repairs, expired or missing checks, deposit deadlines, dates due) with rent, repairs and checks at a glance; switch between one property and the whole portfolio.
- **Rent:** record payments as they arrive; see what was due, what was received, arrears and the oldest unpaid month. Actual figures are always kept apart from estimates.
- **Checks:** legal duties and good practice for the property's nation (England, Wales, Scotland or Northern Ireland), from official sources, with honest statuses: up to date, expiring soon, expired, action required, not applicable, unable to verify. A guide, not legal advice.
- **Tenancy and deposit:** tenant, rent and deposit details; the deposit cap and protection deadline for each nation; end a tenancy and keep its history.
- **Repairs:** log issues, priority, status, contractor, quote and cost; finished repairs add their cost automatically.
- **Documents:** certificates, agreements and receipts (PDF or photo) stored on the device.
- **Money and tax:** costs, a tax-year estimate, and a CSV export for your accountant.
- **Reports and reminders:** a printable property or portfolio report (tenant details left out unless chosen), a move-in pack, and calendar reminders (renewals, monthly rent due, deposit deadline).

## Who it's for
UK landlords with one to a dozen or so properties who want a free, private tool instead of a spreadsheet or a subscription.

## Built with
- HTML, CSS and vanilla JavaScript (no framework, no build step)
- Browser `localStorage` for records and IndexedDB for document files (`files.js`)
- `rules.js`: UK letting rules per nation, each with its official source and the date it was checked
- A service worker (`sw.js`) that caches the app's own files for offline use; it never contacts any other server

## How to run
1. Clone or download this repository.
2. Open `index.html` in any modern browser.

That's it. There is no account, and no server ever holds your data (the optional chat passes questions through a small relay; see Data and privacy). Add `?demo` to the address (for example `index.html?demo`) to try it with made-up sample data.

## Install on your phone or computer
RentUK is an installable web app (PWA): once installed it opens full screen like a normal app and works with no internet connection. Installing needs the app to be served over `https://`; opening `index.html` straight from a folder works, but cannot be installed or used offline. The hosted app is at https://drasta26.github.io/rentuk/.

- **iPhone or iPad (Safari):** open RentUK, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open RentUK and tap **Install app** at the bottom of the screen, or use the menu (⋮) then **Install app**.
- **Mac, Windows or Linux (Chrome or Edge):** click **Install app** at the bottom of the screen, or the install icon in the address bar.

Your data stays in that browser on that device, installed or not. Use **Export** and **Import** to move it.

To try installing locally, serve the folder and open `http://localhost:8000`:

```
python3 -m http.server 8000
```

**Releasing an update:** change `VERSION` in `sw.js`. Installed apps then show "New version available. Tap to update".

## Tests
Requires Node.js 20 or later. No packages to install.

```
npm test
```

## Data and privacy
Full notice: [PRIVACY.md](PRIVACY.md) (also in the app under More → About).
- Your property data stays in your browser on your device. We never receive it. No accounts, analytics or trackers.
- Optional Ask RentUK chat: if you use it, the questions you type (and, only if you tick the box, your property's scores and totals with no names or contact details) pass through our small chat relay to Anthropic, the maker of Claude. You need no account or key. The relay never logs or stores them, and we never see them.
- Use **Export** to save a backup file and **Import** to restore it or move to another browser.
- **Delete all my data** (More → Your data, type DELETE to confirm) removes everything RentUK keeps on this device. It cannot be undone.
- This repository contains no real personal data. Use made-up details when testing.

## Status
Early stage and not yet deployed. First built on Replit in 2025 (with Firebase sign-in); moved to GitHub in October 2026 as a local-only version with Firebase and sign-in removed. The Replit project had no git history, so history here starts at the move.

Compliance reminders are informational only and are not legal advice.

## Roadmap
See [ROADMAP.md](ROADMAP.md).

## Licence
MIT. See [LICENSE](LICENSE).
