# RentUK

A simple property-management web app for UK landlords. Track properties, tenants, expenses and compliance reminders (gas safety, EPC, deposit protection and similar) in one place.

## Who it's for
Individual UK landlords with one or a few properties who want a free, private tool instead of a spreadsheet.

## Built with
- HTML, CSS and vanilla JavaScript (no framework, no build step)
- Browser `localStorage` for data
- A service worker (`sw.js`) that caches the app's own files for offline use; it never contacts any other server

## How to run
1. Clone or download this repository.
2. Open `index.html` in any modern browser.

That's it. There is no server and no account. Add `?demo` to the address (for example `index.html?demo`) to try it with made-up sample data.

## Install on your phone or computer
RentUK is an installable web app (PWA): once installed it opens full screen like a normal app and works with no internet connection. Installing needs the app to be served over `https://`; opening `index.html` straight from a folder works, but cannot be installed or used offline. A hosted address is not set up yet (see the roadmap).

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
- All data stays in your browser on your device. Nothing is sent to a server or third party. No accounts, analytics or trackers.
- Use **Export** to save a backup file and **Import** to restore it or move to another browser.
- This repository contains no real personal data. Use made-up details when testing.

## Status
Early stage and not yet deployed. First built on Replit in 2025 (with Firebase sign-in); moved to GitHub in October 2026 as a local-only version with Firebase and sign-in removed. The Replit project had no git history, so history here starts at the move.

Compliance reminders are informational only and are not legal advice.

## Roadmap
See [ROADMAP.md](ROADMAP.md).

## Licence
MIT. See [LICENSE](LICENSE).
