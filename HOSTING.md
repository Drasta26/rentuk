# Hosting RentUK on GitHub Pages (draft, not yet done)

Status, 5 Nov 2026: the repo `Drasta26/rentuk` is public; Pages is **not** switched on.
Nothing here has been done. Each step that publishes needs the CEO's explicit yes.

## Why GitHub Pages
- Free, https by default (phones need https to install an app and run it offline).
- Only serves the app's files. Your data never leaves your device. No accounts, no analytics.
- Address will be: `https://drasta26.github.io/rentuk/`

## Before switching on (checks)
1. `npm test` passes.
2. Secret scan of the full git history is clean (done 4 Nov 2026; repeat before switching on).
3. Bump `VERSION` in `sw.js` for each release so phones get the update message.
4. Note: GitHub (Microsoft) can see visitor IP addresses in its server logs, as any host can.
   Our privacy wording stays true: *we* never see or store your data.

## Switch on (needs CEO approval — publishes the app)
Option A, website (simplest):
1. GitHub → `Drasta26/rentuk` → Settings → Pages.
2. Source: "Deploy from a branch". Branch: `main`, folder: `/ (root)`. Save.
3. Wait 1–2 minutes; the address appears at the top of that page.
4. Tick "Enforce HTTPS" if shown.

Option B, command line (Claude can run this only after approval):
```bash
gh api -X POST repos/Drasta26/rentuk/pages -f "source[branch]=main" -f "source[path]=/"
```

## After switching on (checks)
1. Open the address on a computer: app loads, no console errors.
2. iPhone (Safari): Share → Add to Home Screen; open it, turn on Airplane mode, reopen. Should work.
3. Android (Chrome): "Install app" button appears; install; test offline.
4. Push a small change with a new `VERSION`; confirm "New version available" shows.
5. Re-run Lighthouse against the live address.
6. Add the address to README and the repo's "Website" field (needs approval: public change).

## To switch off
Settings → Pages → Unpublish site (or `gh api -X DELETE repos/Drasta26/rentuk/pages`). Needs approval.

## Later (optional)
- Your own domain (e.g. rentuk.co.uk): add a `CNAME` file and DNS records. Costs the domain fee only.
- Moving the app files into a `docs/` folder is not needed.
