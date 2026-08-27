# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- React 19 + TypeScript + Vite.
- Mobile-first progressive web app (PWA) target.
- Local preferences in `localStorage`; larger cached records are expected to use IndexedDB and Cache Storage.
- Data is consumed through repository/adapter boundaries so versioned static JSON and a future API can share one UI contract.
- Python scripts remain the data collection, cleaning and validation layer unless the team approves a different backend path.

## Users

### Primary users

- Low-income households in Victoria's Loddon Campaspe region, initially focused on Bendigo, Castlemaine and Harcourt.
- People using older phones, slow or unreliable networks, or limited mobile data.
- People who may have lower digital confidence, reading difficulty, disability or health-related access needs.

### Representative situations

- Mel Doyle is a 34-year-old single parent in Harcourt. She needs to avoid wasting fuel on a service that cannot help and wants the app to work without creating an account.
- Julie Marsden is 63, lives alone in Castlemaine and has medication that requires refrigeration. During power or network disruption she needs information that remains plain, stable and available.

## Product Purpose

ShieldAhead helps households prepare useful local information while connectivity is available, then continue reading cached Wi-Fi and support-service information when connectivity is disrupted.

Success means a user can:

1. complete a short, understandable household setup without an account;
2. understand what is stored on their device and delete it;
3. find previously prepared Wi-Fi and local-support information while offline;
4. see freshness, limitations and uncertainty before spending time or money travelling.

## Positioning

ShieldAhead is not a real-time emergency response system or a charity inventory system. Its differentiating mechanism is preparation-first local caching: useful regional information is made understandable and stored on the user's device before a disruption, with freshness and uncertainty kept visible after the connection disappears.

## Operating Context

- Mobile-first use, often one-handed, outdoors, during travel or under time pressure.
- Bushfire, power outage, NBN interruption and mobile-network congestion are expected operating conditions.
- Users may be anxious, conserving battery or mobile data, and unable to retry complex flows.
- No account is required for Iteration 1. Household details and consent remain on the device.
- Australian English and familiar Victorian place names are used.

## Capabilities and Constraints

### Iteration 1 scope

- Epic 1 / US 1.1–1.3: guided household setup, consent, on-device profile control and compatibility with the user's existing phone and connection.
- Epic 2 / US 2.1–2.2: offline-capable nearby Wi-Fi list/detail and a saved usual location.
- Epic 3 / US 3.1–3.3: local support-service list/detail, service type, eligibility, availability uncertainty, partner status and update dates.
- US 3.4: complete list/map UX design now; implementation remains a team decision.

### Explicit exclusions

- User accounts, cloud profile sync and multi-device sync.
- Financial forecasting and charity-side reporting.
- Turn-by-turn navigation.
- Real-time stock or availability as a default promise.
- Automatic contact with emergency services.
- Epic 4–7 during Iteration 1.

### Data constraints

- Iteration 1 is mock-first because data and backend work are not complete.
- Mock and real sources must implement the same TypeScript contracts.
- Components do not import mock fixtures directly; they read through adapters.
- Missing fields, empty coverage, offline state, stale data and data errors are first-class states.
- Mock information must never be represented as verified live information.

### Open team decisions

- Final approval of React + TypeScript + Vite and the deployment target.
- Minimum supported Android/Chrome and iOS/Safari versions.
- Static versioned JSON versus API delivery.
- Data refresh cadence, dataset version rules and error structure.
- Whether charging locations belong to Epic 2.
- Whether US 3.4 code implementation moves into Iteration 1.
- Final integration owner and map/tile provider.

## Brand Commitments

- `ShieldAhead` is a working product name and must be replaceable through centralized configuration.
- Product voice is calm, direct, respectful and non-judgmental.
- Interface copy uses plain Australian English and never creates urgency without evidence.
- The app must feel like a dependable public-service tool, not a marketing site or gamified consumer app.
- No final logo, illustration system or external brand asset has been approved.

## Evidence on Hand

- `C:/Users/73637/Desktop/5120/main/ShieldAhead_Epics_UserStories (2).docx` contains the supplied Epic and User Story requirements.
- `C:/Users/73637/Desktop/5120/main/ShieldAhead_Frontend_Workplan.md` contains the current frontend scope, acceptance-criteria tracking, draft contracts, assumptions and delivery plan.
- Repository Python scripts explore charities, incidents and bushfire-related open data.
- No production-ready, validated Wi-Fi or support-service dataset is currently available.
- No evidence supports claims of real-time service availability, guaranteed eligibility or complete regional coverage; the UI must not invent them.

## Product Principles

1. Prepare before disruption: useful information should be cached while a connection exists.
2. Be honest about uncertainty: show freshness, source limitations and unconfirmed availability.
3. Keep control on the device: no account is required, and profile data can be reviewed or deleted.
4. Reduce the cost of a failed trip: eligibility, contact details and limitations appear before directions or travel decisions.
5. Make stressful tasks simple: short flows, plain language, large targets and recoverable actions take priority over feature density.

## Accessibility & Inclusion

- WCAG 2.2 AA is the minimum target.
- Core tasks must support keyboard and screen-reader use.
- Normal text contrast must be at least 4.5:1; status is never communicated by colour alone.
- Default body text is at least 16px, supports zoom and avoids forced truncation.
- Touch targets are designed to be at least 48px with clear pressed and focus states.
- Motion is minimal and respects `prefers-reduced-motion`.
- Forms use persistent labels, contextual help, inline errors and predictable back navigation.
- The experience must remain understandable at 200% zoom and on a 375px-wide screen.
