# ShieldAhead Frontend Data Handoff

> Status: Proposed frontend-facing contract v0.1
> Audience: Frontend, backend and data team
> Scope: Iteration 1 — Epic 2 and Epic 3 (US 3.1–3.3)
> Last updated: 2026-08-28

## 1. Purpose

The frontend Mock implementation is complete for nearby Wi-Fi locations and support services. This document explains what data the current UI expects so the backend and data team can align their implementation with the existing frontend.

This is not a database schema and does not require the database to use the same field names. The backend may read and clean differently named source fields, but its frontend-facing response should either match this contract or provide an agreed adapter mapping.

The contract remains `v0.1` until the team reviews representative records from the real datasets.

## 2. Responsibility boundary

### Frontend

- Define the information required by the screens and User Stories.
- Maintain frontend-facing TypeScript contracts and Mock fixtures.
- Handle documented optional fields and UI states.
- Replace Mock repositories with API repositories when the API is available.
- Verify that integrated responses display correctly.

### Data team

- Provide source links, schema/field descriptions and representative records.
- Explain coverage, missing fields, update frequency and data quality.
- Confirm licensing, attribution and business filtering rules.
- Identify which fields are unavailable or require another source.

### Backend

- Read, clean and normalise the source data.
- Map source/database fields into the agreed frontend-facing contract.
- Provide stable IDs, metadata, error behaviour and environment URLs.
- Implement any agreed distance or freshness calculation.
- Inform the frontend before changing field types, enum values or response structure.

## 3. Current implementation references

- Frontend contracts: `frontend/src/data/contracts.ts`
- Repository interfaces: `frontend/src/data/repositories.ts`
- Normal and edge-case fixtures: `frontend/src/data/mock/mockRepositories.ts`
- Epic 2 tests: `frontend/src/features/wifi/pages/WifiEpic2.test.tsx`
- Epic 3 tests: `frontend/src/features/support-services/pages/SupportEpic3.test.tsx`

The existing pages depend on repository interfaces rather than database field names or hard-coded API URLs.

## 4. Proposed API surface

For Iteration 1, the smallest useful API is:

```http
GET /api/v1/wifi-locations?postcode=3453
GET /api/v1/support-services?postcode=3453
```

The current frontend can obtain detail records from each list by stable `id`. Separate detail endpoints may be added later if dataset size or access rules require them:

```http
GET /api/v1/wifi-locations/{id}
GET /api/v1/support-services/{id}
```

The endpoint names are proposals and should be confirmed with the backend owner.

## 5. Shared response envelope

Both datasets should use the same response shape:

```ts
interface DatasetResult<T> {
  records: T[];
  metadata: DatasetMetadata;
}

interface DatasetMetadata {
  version: string;
  generatedAt: string;
  sourceName: string;
  coverageAreas: string[];
  limitations: string[];
  freshnessStatus?: "current" | "stale";
  removedRecordIds?: string[];
}
```

Example:

```json
{
  "records": [],
  "metadata": {
    "version": "support-2026-08-28-v1",
    "generatedAt": "2026-08-28T08:30:00.000Z",
    "sourceName": "Approved support-service dataset",
    "coverageAreas": ["Harcourt 3453", "Castlemaine 3450"],
    "limitations": [],
    "freshnessStatus": "current",
    "removedRecordIds": []
  }
}
```

An empty result should normally be HTTP `200` with `records: []`, not HTTP `404`.

## 6. Wi-Fi location contract

```ts
interface WifiLocation {
  id: string;
  name: string;
  address?: string;
  suburb: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  openingHours?: string;
  accessConditions?: string[];
  dataUpdatedAt: string;
}
```

Example response record:

```json
{
  "id": "wifi-harcourt-library",
  "name": "Harcourt Community Wi-Fi",
  "address": "12 Example Street",
  "suburb": "Harcourt",
  "postcode": "3453",
  "latitude": -36.999,
  "longitude": 144.263,
  "distanceKm": 0.8,
  "openingHours": "Monday–Friday, 9:00 am–5:00 pm",
  "accessConditions": [
    "Available during opening hours",
    "Ask staff before connecting"
  ],
  "dataUpdatedAt": "2026-08-28T08:30:00.000Z"
}
```

### Wi-Fi-specific requirements

- `id` must remain stable across refreshes.
- Removed stable IDs should be reported through `metadata.removedRecordIds` so the frontend can clear a saved usual spot.
- Unknown address, distance, opening hours and access conditions are supported by the UI.
- The team must confirm who calculates `distanceKm` and which location/postcode method is used.

## 7. Support-service contract

```ts
type AvailabilityStatus =
  | "not-confirmed"
  | "normal"
  | "low"
  | "closed";

interface SupportService {
  id: string;
  name: string;
  serviceTypes: string[];
  address?: string;
  suburb: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  phone?: string;
  website?: string;
  eligibility?: string;
  partnerStatus?: "partner" | "open-referral" | "unknown";
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt?: string;
  availabilityFreshness?: "current" | "stale";
  dataUpdatedAt: string;
}
```

Example response record:

```json
{
  "id": "support-food-relief-001",
  "name": "Example Food Relief Service",
  "serviceTypes": ["Food parcels", "Financial counselling"],
  "address": "123 Example Street",
  "suburb": "Harcourt",
  "postcode": "3453",
  "latitude": -36.999,
  "longitude": 144.263,
  "distanceKm": 1.2,
  "phone": "03 5000 0000",
  "website": "https://example.org",
  "eligibility": "Referral not required. Assistance is available once every four weeks.",
  "partnerStatus": "partner",
  "availabilityStatus": "normal",
  "availabilityUpdatedAt": "2026-08-28T08:15:00.000Z",
  "availabilityFreshness": "current",
  "dataUpdatedAt": "2026-08-28T08:30:00.000Z"
}
```

### Support-specific requirements

- `partnerStatus` describes the organisation relationship; `availabilityStatus` describes current availability. They are not interchangeable.
- If no verified availability source exists, use `availabilityStatus: "not-confirmed"`.
- Do not infer `normal`, `low` or `closed` from unrelated fields.
- A verified `normal`, `low` or `closed` value should include `availabilityUpdatedAt`.
- The data/backend team must define the stale threshold and source of partner availability.
- Missing address, distance, phone, website and eligibility are already supported by the UI.

## 8. Field and value rules

- Required fields must always be present and have the documented type.
- For v1, optional properties should preferably be omitted when unavailable rather than returned as `null`.
- Arrays should use `[]` when empty, not `null`.
- All timestamps should use ISO 8601 UTC, for example `2026-08-28T08:30:00.000Z`.
- Enum values must match the agreed spelling exactly.
- Unknown enum values must not be introduced without a contract review.
- Stable IDs must not depend on list order or change on every refresh.
- `version` should change when a dataset release changes.
- `generatedAt` describes when the returned dataset was produced.
- `dataUpdatedAt` describes when an individual record was updated.

If the backend must return `null`, the team should document this and add a normalising adapter before integration.

## 9. Privacy boundary

Wi-Fi and support-service lookup should normally require only the user's postcode. The following locally stored profile information must not be sent to the backend unless a later requirement and consent decision explicitly authorise it:

- name;
- age;
- household details;
- health needs;
- accessibility needs;
- consent selections.

Personal or health information must not be placed in URLs, server logs or analytics by default.

## 10. Initial field-mapping worksheet

The frontend fills the first two columns, the data team identifies source fields, and the backend records the transformation.

| Frontend field | UI purpose | Source field | Available? | Transformation/owner | Missing behaviour |
|---|---|---|---|---|---|
| `id` | Detail lookup and saved records | TBD | TBD | Data/backend | Required and stable |
| `name` | Record heading | TBD | TBD | Backend mapping | Required |
| `address` | Location details | TBD | TBD | Backend cleaning | Show “not confirmed” |
| `serviceTypes` | Support categories/filtering | TBD | TBD | Data classification | Use `[]` if none |
| `phone` | Published contact | TBD | TBD | Backend cleaning | Show “not published” |
| `eligibility` | Conditions/referral/visit limits | TBD | TBD | Data/backend | Show generic fallback |
| `latitude/longitude` | Distance and future map | TBD | TBD | Data validation | Map fallback later |
| `distanceKm` | Nearest-first ordering | Calculated | TBD | Team decision | Unknown goes last |
| `availabilityStatus` | Know-before-you-go status | TBD/partner source | TBD | Backend/partner | `not-confirmed` |
| `dataUpdatedAt` | Saved-copy date | TBD | TBD | Backend | Required |

## 11. Information requested from the data team

- Dataset source URL or file location.
- Schema/data dictionary.
- 10–20 representative records for each dataset.
- Coverage areas and known gaps.
- Missing-value and duplicate-ID information.
- Update schedule and ownership.
- Availability of stable IDs, addresses and coordinates.
- Availability of phone, website, eligibility and detailed service types.
- Availability and authority of partner status data.
- Licensing and attribution requirements.

## 12. Information requested from the backend

- Proposed endpoint paths and API base URL.
- Development/test environment URL.
- OpenAPI/Swagger documentation or equivalent response examples.
- Stable-ID strategy.
- Distance-calculation responsibility and method.
- Missing-field convention: omission or `null`.
- Timestamp, timezone and freshness rules.
- HTTP `400`, `404`, `429` and `500` error format.
- Timeout/retry expectations.
- CORS configuration for local development and deployed frontend origins.
- Dataset versioning and removed-record mechanism.

## 13. Integration acceptance checklist

- [ ] Real dataset samples have been reviewed by frontend, backend and data members.
- [ ] The field-mapping table has no unresolved required fields.
- [ ] Contract v1 has been agreed and versioned.
- [ ] Normal Wi-Fi response matches the contract.
- [ ] Normal support-service response matches the contract.
- [ ] Empty responses use HTTP `200` and `records: []`.
- [ ] Missing optional fields do not break the frontend.
- [ ] Dates and enum values pass runtime validation.
- [ ] Stable IDs survive a dataset refresh.
- [ ] Removed usual-spot IDs are handled correctly.
- [ ] Unverified availability uses `not-confirmed`.
- [ ] Stale metadata displays the saved-copy warning.
- [ ] CORS works from the local and preview frontend.
- [ ] Mock records cannot be used accidentally in production.
- [ ] Frontend integration tests pass against the test API.

## 14. Ready-to-send handoff message

> Hi team, the frontend Mock implementation for Epic 2 and Epic 3 is complete and merged into `main`. The current TypeScript contracts and Mock fixtures define the data shape expected by the UI, including normal, empty, missing-field and stale states.
>
> This document is a proposed frontend-facing contract v0.1, not a final database or API schema. The database field names may differ; the backend can normalise them into the agreed frontend response.
>
> Could the data team provide the source schema, source/licensing information and 10–20 representative records for each dataset? Could the backend review the proposed API shape and confirm stable IDs, distance calculation, missing-field handling, timestamps, CORS and the test environment?
>
> After the three roles complete the field-mapping table, we can freeze Contract v1. The frontend will then replace the Mock repositories with API repositories and perform integration testing.
