# DFX Admin Frontend

The web admin app for the DFX gold-jewellery / savings-scheme business. Built with Next.js and React. This repo is the FRONTEND only (the screens the staff use in the browser).

## How the code is organised (`src/`)
- `app/` -> Next.js routing plumbing. It is the wrapper Next.js needs to serve the app and the two live-rate API routes. Do not rename this folder. Most real screens live in `modules/`.
- `modules/` -> the actual features, one folder per feature (dashboard, gold-rate, customers, plan, billing, payments, etc.). See `src/modules/README.md` for the full map of "which folder for which screen".
- `_shared/` -> plumbing reused by every feature: the backend connection, login/session, the sidebar and top bar, shared buttons/cards, and small helpers.
- `App.jsx`, `main.jsx`, `index.css` -> the app shell and entry point at the root of `src/`.

## Where the data, database and hosting live
This repo does NOT contain the database or the server. All data (customers, sales, gold rates, payments) is stored and processed by the separate BACKEND repo/server. This frontend only talks to that backend over the internet through `src/_shared/apiClient.js`. Hosting/deployment and the database also live with the backend.

## Import style
Imports use the `@/` alias which points at `src/` (e.g. `@/_shared/apiClient`, `@/modules/gold-rate/GoldRate`), so moving files does not break links.

## Building
`npm install` then `npm run build`. A green build is the sign everything is wired correctly.

