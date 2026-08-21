---
name: Incident Analytics Intelligence Dashboard
description: Location-gated 15km ranked feed, Drop-Pin & Remote reporting tracking, and Recharts analytics dashboard in the right sidebar
targets:
  - ../src/App.tsx
  - ../src/App.css
  - ../src/components/AnalyticsPanel.tsx
  - ../package.json
---

# Location-Gated 15km Ranked Feed & Incident Analytics Intelligence

Implements a location-gated, 15km proximity-ranked feed in the right sidebar that expands into full Recharts visual analytics (including On-site vs. Remote classification) upon clicking any incident report card.

---

## 1. Location Modes & Remote Incident Tracking

Users can report incidents using one of two location capture workflows:

### GPS Location vs. Drop Pin Mode
- **GPS Location:** Uses device geolocation to capture high-accuracy coordinates on-site with image upload enabled.
- **Drop Pin on Map:** Allows users to click anywhere on the Mapbox map to drop a pin.
  - Image upload is disabled (`disabled={true}`) for drop-pin reports.
  - Users are prompted with a checkbox: *"Did you see this incident somewhere else? (e.g., Social Media, News)"*, recording `isRemote: boolean`.
  `[@test] ../src/__tests__/analytics/drop-pin-remote-mode.test.tsx`

---

## 2. Location-Gated Feed & Proximity Ranking

The right sidebar's resting state is governed by user location:

### No Location State
- If `location` is `null`, renders an informative banner:
  *"Capture your location in the left sidebar to view nearby incident reports and analytics."*
  `[@test] ../src/__tests__/analytics/empty-location-banner.test.tsx`

### Location Captured State
- Calculates distance using the Haversine formula:
  $$d = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta\text{lng}}{2}\right)}\right)$$
- Filters reports located within a **15 km radius** (`distance <= 15.0`).
- Sorts reports descending by raw **`upvotes`** count so the highest-signal incident appears first.
  `[@test] ../src/__tests__/analytics/15km-upvote-ranking.test.tsx`

---

## 3. Scrollable Ranked Feed Cards

Renders a scrollable feed of all reports in `nearbyRankedReports`:
- **Thumbnail:** Full-width Cloudinary dynamic crop `/c_fill,w_350,h_180,g_auto/` at the top of each card (or placeholder if no image).
- **Metadata:** Title, distance from user (e.g. `"2.4 km away"`), and formatted creation timestamp.
- **Read-Only Votes:** Raw counts labeled with `<ThumbsUp size={14} />` and `<ThumbsDown size={14} />` icons. No net scores or +/- numbers are displayed.
- **Interaction:** Entire card is clickable to open analytics for that incident.
  `[@test] ../src/__tests__/analytics/ranked-feed-card.test.tsx`

---

## 4. Click-to-Expand Incident Analytics View

When a user clicks any report card from the ranked list:
- Hides the scrollable feed and renders `AnalyticsPanel` specifically for that incident report.
- **Back Navigation:** Prominent `"← Back to nearby reports"` button at the top to return to the feed.
  `[@test] ../src/__tests__/analytics/back-to-feed-button.test.tsx`

### Analytics Panel Contents & Charts
- **Header:** Title, Distance, Severity badge (`LOW` | `MODERATE` | `HIGH` | `CRITICAL`), Confidence score %, raw upvotes & downvotes.
- **Visual Analytics (`recharts`):**
  - **Volume Progression (`AreaChart`):** Chronological report accumulation and velocity.
  - **Report Locations: On-site vs. Remote (`BarChart`):** Discrete bar chart comparing firsthand on-site submissions (`isRemote === false`) with secondhand / remote reports (`isRemote === true`).
  - **Source Breakdown (`PieChart` / Donut):** Distribution between Firsthand Witness, Nearby Observer, and Remote / Unverified.
  - **Supporting Evidence Breakdown:** Photographic media proportion progress bar.
  `[@test] ../src/__tests__/analytics/incident-analytics-charts.test.tsx`

---

## 5. Vocabulary & Metric Standardization

- **Terminology:** Only `upvotes` and `downvotes` are used throughout UI components.
- **Raw Counts:** All metrics show exact raw integer counts for upvotes and downvotes without net score calculations.
