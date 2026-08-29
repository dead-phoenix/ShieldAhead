# ShieldAhead Wi-Fi API Integration Handoff

> Status: Frontend integration preparation complete; backend contract changes pending
> Date: 2026-08-29
> Frontend branch: `feature/wifi-api-integration-prep`
> Scope: Epic 2 — nearby Wi-Fi only

## 1. Purpose

The frontend now has a safe API integration layer for Wi-Fi data. It is deliberately disabled by default so the current Mock-ready demonstration remains stable while the backend finishes postcode filtering, distance calculation, stable IDs, verification status and caching behaviour.

This document records what the frontend has completed and what the backend needs to provide before the real API becomes the default data source.

## 2. Current backend implementation

The backend currently provides:

```http
GET http://127.0.0.1:5001/api/wifi
```

It combines:

- confirmed VicFreeWiFi access-point records from DataVic;
- regional libraries and community facilities from Vicmap Features of Interest, where Wi-Fi is only likely and not confirmed.

The current local response contains approximately 1,403 records and takes around 10–15 seconds to generate because both external sources are fetched during each request.

The response envelope is already close to the frontend contract:

```json
{
  "records": [],
  "metadata": {
    "version": "1.0",
    "generatedAt": "2026-08-29T00:00:00.000Z",
    "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
    "coverageAreas": [],
    "limitations": []
  }
}
```

## 3. Frontend work completed

### API Repository

Implemented:

```text
frontend/src/data/api/apiWifiRepository.ts
```

It:

- requests `/api/wifi`;
- sends the saved postcode as `?postcode=3453`;
- uses a configurable API base URL;
- applies a configurable request timeout;
- rejects non-successful HTTP responses;
- validates and normalises the response before pages receive it.

### Runtime Normalizer

The Adapter currently protects the UI from the backend's incomplete optional fields:

- `null` optional strings become `undefined`;
- `null` coordinates and distance become `undefined`;
- missing access conditions become `[]`;
- blank suburb becomes `Area not confirmed`;
- required IDs, names, dates and metadata are validated;
- an invalid response shape is rejected instead of reaching UI components.

All backend-field conversion is centralised in the Adapter, not duplicated in pages.

### Safe data-source selection

Implemented:

```text
frontend/src/data/wifiRepository.ts
```

The default remains:

```env
VITE_DATA_SOURCE=mock
```

API integration can be enabled with:

```env
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=http://127.0.0.1:5001
VITE_API_TIMEOUT_MS=20000
```

Any URL containing a QA fixture, such as `/wifi?fixture=no-coverage`, continues to use Mock data even when API mode is enabled.

### Frontend tests

Seven tests now cover:

- API URL and postcode query construction;
- backend `null` normalisation;
- blank regional fields;
- HTTP 500 rejection;
- invalid response rejection;
- missing API base URL;
- Mock/API repository selection and fixture protection.

The complete frontend suite currently has 29 passing tests. ESLint and the API-mode production build pass.

## 4. Why the API is not enabled by default

The current backend response cannot yet satisfy the meaning of “Nearby free Wi-Fi” because:

- it ignores the supplied postcode;
- it returns all available Victorian records;
- `distanceKm` is always `null`;
- results are not sorted by proximity;
- some public-space records have blank suburb and postcode;
- some `address` values are facility names rather than street addresses;
- public-space IDs use list position and may change after a refresh;
- confirmed Wi-Fi and likely public-space fallbacks are not structurally distinguished;
- there is no cached last-successful response or partial-source fallback;
- failure of either external source currently makes the whole endpoint return HTTP 500.

Enabling this response by default would produce a slow list of approximately 1,403 records that is not actually near the saved postcode and is not offline-safe.

## 5. Backend actions required

### Priority 0 — required before frontend integration

#### 5.1 Honour the postcode query

The frontend already sends:

```http
GET /api/wifi?postcode=3453
```

The backend should validate the postcode and return only a reasonable nearby result set.

Please confirm:

- how the postcode is converted to coordinates;
- the search radius or nearest-result limit;
- behaviour for invalid or unsupported postcodes;
- behaviour when no verified Wi-Fi records are nearby.

#### 5.2 Calculate and return distance

For every record where coordinates are available, return:

```json
"distanceKm": 1.2
```

Use a documented calculation method and sort the result nearest-first. If distance genuinely cannot be calculated, either omit the property or return `null` consistently; the frontend Adapter supports both.

#### 5.3 Provide stable IDs

Do not use list position:

```python
"id": f"public-{i}"
```

Use a stable identifier supplied by the source dataset, for example:

```text
vicfreewifi-{source-id}
vicmap-{object-id}
```

The same physical record must keep the same ID across refreshes so saved usual spots remain valid.

#### 5.4 Distinguish confirmed and likely Wi-Fi

Please add a structured field such as:

```ts
verificationStatus: "confirmed" | "likely" | "unknown";
```

Suggested meaning:

- `confirmed`: the source specifically confirms a public Wi-Fi access point;
- `likely`: a library/community facility that may provide Wi-Fi but is not verified;
- `unknown`: source confidence cannot be established.

Do not rely only on free-text `accessConditions` to communicate this distinction. Frontend and backend should confirm the final field name before Contract v1 is frozen.

#### 5.5 Correct or omit incomplete location fields

Please do not use a facility name as a street address. For unavailable optional values, return `null` consistently or omit the property.

The following should be real values or clearly unavailable:

- `address`;
- `suburb`;
- `postcode`;
- `latitude`;
- `longitude`;
- `openingHours`.

Empty strings should be avoided where possible.

### Priority 1 — required for offline-safe behaviour

#### 5.6 Add a last-successful cache

The endpoint should not fetch both external sources from scratch for every frontend request.

Please implement:

- scheduled or time-limited refresh;
- last-successful cached dataset;
- dataset version and generation timestamp;
- stale status when cached data is older than the agreed threshold.

Suggested metadata:

```json
{
  "version": "wifi-2026-08-29-v1",
  "generatedAt": "2026-08-29T00:00:00.000Z",
  "freshnessStatus": "current"
}
```

#### 5.7 Support partial-source failure

If one external source fails but the other succeeds, return the successful records with a limitation instead of failing the complete endpoint.

Example:

```json
{
  "records": [],
  "metadata": {
    "limitations": [
      "Regional public-space data could not be refreshed; confirmed VicFreeWiFi records are shown."
    ],
    "freshnessStatus": "stale"
  }
}
```

If neither source is available, return the last-successful cache where possible.

#### 5.8 Define removed-record behaviour

If stable records disappear after a complete dataset refresh, optionally return:

```json
"removedRecordIds": ["vicfreewifi-old-id"]
```

The frontend already uses this metadata to clear a delisted usual spot safely.

### Priority 2 — required before deployment

#### 5.9 Define API errors

Please define consistent responses for:

- invalid postcode — HTTP 400;
- rate limiting — HTTP 429 if applicable;
- no matching records — HTTP 200 with `records: []`;
- unavailable upstream sources — cached/partial response where possible, otherwise HTTP 503;
- unexpected server error — HTTP 500 without exposing internal exception details.

#### 5.10 Restrict production CORS

`CORS(app)` is acceptable for local development. Production should allow only the approved frontend origins.

#### 5.11 Add backend tests and run instructions

Please add tests for:

- postcode validation;
- distance calculation and sorting;
- stable ID generation;
- confirmed/likely classification;
- missing fields;
- empty results;
- one-source failure;
- total upstream failure with cache fallback.

Please document how to install dependencies and start the backend.

## 6. Proposed Contract v1 example

The exact `verificationStatus` field still requires team approval, but a useful response would look like:

```json
{
  "records": [
    {
      "id": "vicfreewifi-bd-example-001",
      "name": "Example confirmed access point",
      "address": "1 Example Street",
      "suburb": "Bendigo",
      "postcode": "3550",
      "latitude": -36.757,
      "longitude": 144.279,
      "distanceKm": 0.8,
      "openingHours": null,
      "accessConditions": [],
      "verificationStatus": "confirmed",
      "dataUpdatedAt": "2026-08-29T00:00:00.000Z"
    }
  ],
  "metadata": {
    "version": "wifi-2026-08-29-v1",
    "generatedAt": "2026-08-29T00:00:00.000Z",
    "sourceName": "VicFreeWiFi + Vicmap Features of Interest",
    "coverageAreas": ["Bendigo 3550"],
    "limitations": [],
    "freshnessStatus": "current",
    "removedRecordIds": []
  }
}
```

## 7. Backend handoff checklist

Please notify the frontend owner when the following are ready:

- [ ] Final endpoint and query parameters confirmed.
- [ ] Postcode filtering implemented.
- [ ] Distance calculation and nearest-first sorting implemented.
- [ ] Stable source-based IDs implemented.
- [ ] Confirmed/likely classification agreed and implemented.
- [ ] Missing-field convention agreed.
- [ ] Address, suburb and postcode handling corrected.
- [ ] Cache and stale metadata implemented.
- [ ] Partial-source fallback implemented.
- [ ] Error response format documented.
- [ ] Representative response JSON supplied.
- [ ] Backend tests passing.
- [ ] Run instructions supplied.

## 8. Final integration process

When the backend checklist is complete:

1. Backend sends the final sample response and confirms Contract v1.
2. Frontend updates the Normalizer for any agreed Contract changes.
3. Frontend creates `.env.local` from `frontend/.env.example`.
4. Frontend enables `VITE_DATA_SOURCE=api`.
5. Frontend tests normal, empty, error, stale and missing-field responses.
6. Frontend verifies usual-spot persistence and removed-record behaviour.
7. The team performs performance and offline integration checks.
8. API mode becomes the default only after the integration gate passes.

## 9. Message to the backend owner

> Hi, I have completed the frontend Wi-Fi API integration layer on `feature/wifi-api-integration-prep`. It includes an `ApiWifiRepository`, runtime response normalisation, environment-based Mock/API switching and seven adapter/repository tests. Mock remains the default so the current demo is stable.
>
> The frontend already sends `GET /api/wifi?postcode=3453`, safely normalises the current nullable fields and rejects invalid response shapes. Before we enable API mode by default, could you please complete postcode filtering, distance calculation/sorting, stable source-based IDs, confirmed-versus-likely classification, location-field cleanup and cache/partial-source fallback behaviour?
>
> Please also send a representative final JSON response and confirm the missing-field, freshness and error conventions. Once those items are stable, I will update the frontend Contract/Normalizer if needed, enable API mode and run the final integration checks with you.
