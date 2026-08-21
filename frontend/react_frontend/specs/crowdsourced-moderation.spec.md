---
name: Similar Reports Recommendation & Crowdsourced Moderation
description: Location-first 15km proximity recommendations for incident reports with crowdsourced Lucide voting moderation and automated threshold deletion
targets:
  - ../package.json
  - ../src/App.tsx
  - ../../../backend/src/types.ts
  - ../../../backend/src/index.ts
---

# Similar Reports Recommendation & Crowdsourced Moderation

Enforces a location-first reporting workflow in the left sidebar, displays all existing reports within a 15km radius ranked by community score, enables Lucide icon upvoting/downvoting for nearby reports, and automatically purges reports reaching a net negative score of 100.

## 1. Location-First Reporting Workflow

The reporting sidebar requires capturing the user's location as the initial step before discovering nearby reports or submitting new incidents:
1. **Location-First Prompt:** Placed prominently at the top of the form with options:
   - "Use my location" (GPS capture via `navigator.geolocation`)
   - "Pick on map" (Interactive map click)
2. **Location-Gated Display:** Once location is captured, all logged reports within a **15 km radius** are immediately discovered, ranked by net score (`upvotes - downvotes` desc), and displayed.
3. If location is not yet captured, a guidance prompt instructs the user to capture location first.

`[@test] ../src/__tests__/reporting/location-first-workflow.test.tsx`

## 2. 15km Proximity Filtering & Ranking

### Haversine Proximity Calculation
A pure helper function calculates great-circle distance in kilometers between two `{ lat, lng }` coordinates:
$$d = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta\text{lng}}{2}\right)}\right)$$
where $R = 6371\text{ km}$.

### Match & Ranking Criteria
1. Filter all reports having coordinates where `distanceKm <= 15.0`.
2. Rank matched reports by descending net score: `(upvotes - downvotes)`, secondary sort by `createdAt` desc.
3. Display all matching reports within the 15km radius with distance labels (e.g. `"1.2 km away"`).

`[@test] ../src/__tests__/recommendation/15km-proximity-ranking.test.tsx`

## 3. Nearby Reports Rows & Lucide Voting UI

Rendered in the report sidebar once location is active:
- Each item renders as a horizontal row card with:
  1. **Thumbnail:** Cloudinary dynamic crop transformation `/c_thumb,w_100,h_100,g_auto/`.
  2. **Title & Distance:** Truncated title and distance badge (e.g. `📍 2.4 km away`).
  3. **Net Score:** Badge showing `upvotes - downvotes`.
  4. **Voting Actions:** Interactive `<ThumbsUp size={14} />` and `<ThumbsDown size={14} />` buttons.
  5. Voting is enabled since location is verified.

`[@test] ../src/__tests__/recommendation/nearby-reports-voting-ui.test.tsx`

## 4. Backend Voting & Moderation Endpoint

Endpoint: `POST /api/reports/:id/vote`

`[@test] ../../../backend/src/__tests__/voting/report-voting-endpoint.test.ts`

- URL parameter: `:id`.
- Body: `{ action: 'upvote' | 'downvote' }`.
- Increments `upvotes` or `downvotes` using `FieldValue.increment(1)`.
- Auto-deletion threshold: `if (downvotes - upvotes >= 100)`:
  - Permanently deletes from Firestore (`ticketRef.delete()`).
  - Returns `{ success: true, deleted: true, ticketId }`.
- Otherwise returns `{ success: true, deleted: false, ticket }`.

`[@test] ../../../backend/src/__tests__/voting/report-auto-deletion-threshold.test.ts`
