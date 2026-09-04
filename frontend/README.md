# ShieldAhead Frontend

ShieldAhead is a mobile-first support app designed for people dealing with unreliable internet access. Users can find nearby public Wi-Fi and local support services while online, save selected information to their device, and reopen it when the network is unavailable.

This directory contains the React frontend for the ShieldAhead project.

## Iteration 1 scope

The current frontend includes:

- Account-free onboarding, consent choices, and a locally stored household profile.
- Postcode-based public Wi-Fi and support-service lists.
- Wi-Fi and support-service detail pages.
- Clear labels for confirmed and likely Wi-Fi records.
- Honest handling of missing, unavailable, and potentially stale information.
- Downloading public information for offline use with IndexedDB.
- A responsive PWA-style application shell for desktop and mobile screens.

## Technology

- React 19 and TypeScript
- Vite 8
- React Router
- IndexedDB for downloaded public datasets
- `localStorage` for the household profile, consent choices, and lightweight preferences
- Vitest and Testing Library

## Requirements

- Node.js 20.19 or later, or Node.js 22.12 or later
- npm
- The ShieldAhead backend when testing live data

Backend setup instructions are available in [the backend README](../backend/README.md).

## Local setup

Install the frontend dependencies:

```powershell
cd frontend
npm install
```

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

The supported environment variables are:

```env
VITE_API_BASE_URL=http://127.0.0.1:5001
VITE_API_TIMEOUT_MS=20000
```

Start the backend according to its README, then start the frontend:

```powershell
npm run dev
```

Open the local address displayed by Vite, normally `http://127.0.0.1:5173` or the next available port.

## Production data behaviour

The application now uses the backend API as its only runtime data source:

- `GET /api/wifi?postcode={postcode}` for nearby Wi-Fi locations
- `GET /api/charities?postcode={postcode}` for nearby support services

There is no runtime Mock/API switch and URL fixture parameters are not part of the production flow. Test fixtures remain in the test suite so automated tests can run predictably; they are not used as production data.

## Offline behaviour

The intended flow is:

1. The user completes setup and provides a postcode.
2. While online, the frontend requests public information from the backend.
3. Successful results are stored in IndexedDB under the postcode used for that request.
4. If the API cannot be reached later, ShieldAhead loads the most recently saved copy for that postcode.
5. If that postcode has never been downloaded, the interface shows an offline empty state instead of unrelated sample data.

Changing the household postcode changes the search area. It does not rewrite the postcode inside returned records: a location may legitimately have a different postcode if the backend considers it one of the nearest results.

## Available commands

```powershell
npm run dev       # Start the development server
npm run build     # Type-check and create a production build
npm run preview   # Preview the production build locally
npm run lint      # Run ESLint
npm run test      # Run the automated test suite
```

Before pushing a frontend change, run:

```powershell
npm run lint
npm run test
npm run build
```

## Project structure

```text
frontend/
|-- public/              Static assets, web manifest, and service worker
|-- src/
|   |-- components/      Shared UI components
|   |-- data/            API repositories, contracts, caching, and test fixtures
|   |-- pages/           Route-level screens
|   |-- styles/          Global styles and design tokens
|   |-- test/            Test configuration and shared test utilities
|   `-- App.tsx          Application routes
|-- .env.example         Local environment template
`-- package.json         Scripts and dependencies
```

## PWA status

The repository includes a web app manifest and service worker, and public datasets can be retained in IndexedDB for offline access. Before treating the Iteration 1 build as an install-ready mobile PWA, the team should still:

- Add suitable PNG app icons in the sizes required by the target devices.
- Test installation and offline behaviour on a real Android device using flight mode.

## Deployment

The shared deployment is available at [shieldahead.onrender.com](https://shieldahead.onrender.com/). Render free services may sleep after a period of inactivity, so the first request can take longer while the service wakes up.

## Known limitations

- Support-service relevance and category quality depend on the ACNC-derived backend dataset and its filtering rules.
- Wi-Fi records can be marked `confirmed` or `likely`; the interface preserves this distinction.
- The current Wi-Fi ordering prioritises confirmed listings before distance and then limits the result set. This may place a farther confirmed location above a nearer likely location.
- A new postcode needs at least one successful online request before its data is available offline.
- Missing phone numbers, opening hours, availability, and other unpublished fields are displayed honestly rather than guessed.
- ShieldAhead is not an emergency-response service and does not guarantee live availability, stock, or operating status.
