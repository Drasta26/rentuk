# RentUK roadmap

Planned work, in priority order. Hours are rough estimates (about 35-50 hours in total).

## 1. Security and robustness (4-6 h)
- [x] Escape all user text before rendering (replace unescaped `innerHTML`).
- [x] Validate backup files on import (schema and size checks) so a crafted file cannot inject script or corrupt data.
- [x] Handle full or unavailable `localStorage` gracefully.

## 2. Tests (6-8 h)
- [x] Add a test runner and unit tests for the escaping and backup checks.
- [ ] Unit tests for totals, dates and reminder logic.
- [ ] Add browser tests: add property, add expense, reload, export, import.
- [ ] Run tests on every push with GitHub Actions.

## 3. Code structure (5-7 h)
- [ ] Split the single `script.js` into small modules (storage, properties, tenants, expenses, reminders, UI).
- [ ] Add linting and formatting.

## 4. Rent tracking (5-7 h)
- [ ] Rent schedule and payment log per tenancy.
- [ ] Arrears view on the dashboard.

## 5. Compliance reminders (4-5 h)
- [x] Compliance Score per property with a 60-second setup wizard and a private share card.
- [ ] Per-property certificate records (gas safety, EICR, EPC, deposit protection) with expiry dates and reminders.
- [ ] Link each item to official GOV.UK guidance; check every interval against it before release. Informational only, not legal advice.

## 6. Reports (3-4 h)
- [x] Tax year estimate with property allowance and Making Tax Digital check.
- [x] Calendar (.ics) export of renewals and reminders.
- [x] Printable tenant move-in pack.
- [ ] Annual income and expense summary per property, exportable as CSV.

## 7. Usability (4-6 h)
- [ ] Mobile layout and accessibility pass (labels, keyboard use, contrast).
- [ ] Demo mode with made-up sample data.

## 8. Release (3-4 h)
- [ ] Host as a static site (for example GitHub Pages); no data leaves the device.
- [ ] Tag v1.0 and write a short user guide.
