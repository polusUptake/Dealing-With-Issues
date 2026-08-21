---
name: Disaster Response App Scaffold
description: Offline-first React PWA scaffold with map, incident reporting, analytics sidebar, and Firebase-backed report sync
targets:
  - ../src/**/*.ts
  - ../src/**/*.tsx
  - ../src/**/*.css
  - ../src/**/*.json
  - ../../../backend/src/**/*.ts
---

# Disaster Response App Scaffold

A scaffold-level disaster response web app that validates core product behavior: map display, report submission, incident visualization, analytics panel, offline-first reporting, and mobile-first information hierarchy.

## Primary UI layout

On desktop and tablet breakpoints, the app renders a three-panel layout:
- Left collapsible sidebar for report creation.
- Center map canvas for incident/report pins.
- Right collapsible sidebar for incident analytics and summary.

`[@test] ../src/__tests__/layout/desktop-three-panel-layout.test.tsx`

### Sidebar collapse behavior

- Left and right sidebars each have an independent collapsed/expanded state.
- On desktop breakpoints, both sidebars are overlaid on top of the map layer rather than reflowing layout width.
- Expanding or collapsing either sidebar on desktop must not trigger map resize, re-center, or re-render caused by container dimension changes.
- Sidebar state changes do not clear form data in the reporting panel.

`[@test] ../src/__tests__/layout/sidebar-collapse-behavior.test.tsx`

## Map and pin rendering

The map implementation must support custom overlay styling and pin rendering. Mapbox is the required and only map provider.

`[@test] ../src/__tests__/map/map-provider-selection.test.tsx`

### Report pin lifecycle

- Submitting a valid report creates a pin on the displayed map.
- Pins include all user-submitted reports from local and remote sources.
- Pins remain visible after app refresh when persisted data is available.

`[@test] ../src/__tests__/map/report-pin-lifecycle.test.tsx`

## Reporting workflow (left sidebar)

The reporting interface includes:
- Title input (required).
- Image attachment support (0..n images).
- Location selection prompt triggered after images are added:
  - Prompt asking whether the disaster is at the user's current location.
  - "Yes (Current Location)": Captures device GPS coordinates (`navigator.geolocation`).
  - "No (Pick on Map)": Enables interactive map picking. Clicking on the active map captures the clicked latitude/longitude, places a temporary selection pin, and saves coordinates to the report.
- Bot / security verification (Cloudflare Turnstile CAPTCHA).
- Submit action that produces a new report record.

`[@test] ../src/__tests__/reporting/report-form-required-fields.test.tsx`

### Location selection on map
- When "Pick on map" mode is selected, clicking on the map canvas captures `e.lngLat` (lat and lng).
- A selection pin indicates the chosen location on the map.
- Mobile users switching to the map panel retain their selected coordinates when returning to the report panel.

`[@test] ../src/__tests__/reporting/report-map-click-location.test.tsx`

### Security verification (Turnstile)
- Form presents a Cloudflare Turnstile challenge using `VITE_CLOUDFLARE_SITE_KEY`.
- Submitting without passing the CAPTCHA is blocked with a user-visible validation message.
- The backend verifies the received Turnstile token against Cloudflare's `/siteverify` endpoint using `CLOUDFLARE_SECRET_KEY`.

`[@test] ../src/__tests__/security/turnstile-captcha-verification.test.tsx`

### Validation and submit outcomes
- Submitting without title is blocked with a user-visible validation message.
- Submitting without location is blocked with a user-visible validation message.
- Successful submit displays a green status text panel at the bottom showing "Submitted" for 5 seconds.
- After 5 seconds, the status text panel returns to "Report Incident", the form resets (clearing title, images, location selection mode), and the user can submit a new report.

`[@test] ../src/__tests__/reporting/report-submit-validation-and-success.test.tsx`

## Incident analytics (right sidebar)

The analytics sidebar displays current incident/disaster information derived from reports shown on the map.

Minimum scaffold analytics include:
- Total report count.
- Count by status/source (online-synced vs pending-offline).
- Latest reported incident metadata (for example, most recent title and timestamp).

`[@test] ../src/__tests__/analytics/incidents-summary-panel.test.tsx`

## Offline-first reporting and sync

The application must support report creation while offline and synchronize those reports when connectivity returns.

### Offline capture requirements

- If network is unavailable, report submission is stored locally in a durable client store.
- Offline-submitted reports are immediately represented in the UI and map as pending sync.
- Pending reports survive full app reload while still offline.

`[@test] ../src/__tests__/offline/offline-report-capture-and-persistence.test.tsx`

### Reconnect synchronization requirements

- When connectivity is restored, pending reports are sent to backend storage automatically.
- Successfully synced reports transition from pending to synced state in UI and analytics.
- Sync retries occur for transient failures without duplicating reports.

`[@test] ../src/__tests__/offline/reconnect-sync-and-deduplication.test.tsx`

## Firebase data storage

Firebase is the system of record for shared reports.

- Report metadata is persisted to Firebase (for example, Firestore document per report).
- Image attachments are persisted to Firebase-managed storage (for example, Cloud Storage).
- On startup while online, app hydrates map/report state from Firebase records.

`[@test] ../src/__tests__/data/firebase-report-persistence-and-hydration.test.tsx`

## Mobile-first behavior

On mobile breakpoints, information priority changes to optimize field reporting:
- Primary: reporting UI shown first.
- Secondary: map view accessible next.
- Tertiary: analytics view accessible after map.

`[@test] ../src/__tests__/responsive/mobile-priority-order.test.tsx`

### Mobile interaction model

- Mobile users can navigate between reporting, map, and analytics without data loss.
- Report submission from mobile follows the same validation and offline-sync rules as desktop.

`[@test] ../src/__tests__/responsive/mobile-navigation-and-state-retention.test.tsx`

## Floating Action Navbar & SOS System

This section defines a new floating navigation bar overlaid on the map. It includes placeholder actions for coordination, a multi-step modal for organization registration, and an SOS button that utilizes the native browser Notification API.

### 1. Floating Navbar UI & Layout

The navbar must be persistently visible over the map interface.
- Positioned absolutely or fixed at the bottom center of the screen (e.g., `bottom: 24px`, `left: 50%`, `transform: translateX(-50%)`).
- Must have a high enough `z-index` to sit above the Mapbox canvas and other overlay elements.
- Contains three evenly spaced buttons: "Coordinate", "Register org", and "SOS".
  `[@test] ../src/__tests__/navbar/navbar-positioning.test.tsx`

### 2. "Coordinate" Button (Placeholder)

- Renders a button labeled "Coordinate".
- Currently performs no action when clicked (no-op).
  `[@test] ../src/__tests__/navbar/coordinate-noop.test.tsx`

### 3. "Register org" Flow

Clicking "Register org" opens a centered overlay/modal blocking interaction with the map until closed.

#### 3.1 The Registration Modal
- Centered on the screen with a semi-transparent backdrop.
- Includes a "Close" (X) button to dismiss the modal.
- Displays a dropdown or a list of radio buttons with the following exact options:
  - Volunteer
  - NGO
  - Government bodies
  - Emergency response service
  `[@test] ../src/__tests__/navbar/register-modal-rendering.test.tsx`

#### 3.2 Registration Form State
- Initially, only the organization type selection is visible.
- Once an organization type is selected by the user, dynamically reveal:
  - An email `<input type="email" />`.
  - A "Register" `<button>`.
- Clicking "Register" currently performs no backend action, but should ideally close the modal or show a "Registration pending" placeholder message.
  `[@test] ../src/__tests__/navbar/register-dynamic-form.test.tsx`

### 4. "SOS" Button Flow

The SOS button executes two distinct actions simultaneously to assist the user in an emergency.

#### 4.1 Native Browser Notification
- When "SOS" is clicked, the app must check for `Notification` API support and current permission status.
- If permissions are not granted, it must call `Notification.requestPermission()`.
- Once granted, it must trigger a local system notification (e.g., `new Notification('SOS Alert', { body: 'Emergency alert triggered.' })`).
  `[@test] ../src/__tests__/navbar/sos-native-notification.test.tsx`

#### 4.2 Local Alert Dialog
- Immediately alongside the notification attempt, the app must display a highly visible on-screen dialog or native `window.alert()`.
- The dialog must explicitly state the text: `"Call 112"`.
  `[@test] ../src/__tests__/navbar/sos-alert-dialog.test.tsx`

### 5. CSS & Responsiveness

- Ensure the floating navbar collapses elegantly on mobile screens (e.g., reducing padding or stacking horizontally if the screen is exceptionally narrow).
- Ensure the Registration Modal and SOS Dialog are responsive and do not overflow off-screen on small mobile viewports.
  `[@test] ../src/__tests__/navbar/navbar-responsive-design.test.tsx`

## Non-goals for scaffold phase

- Advanced routing, role-based access, and full incident management workflows are out of scope.
- Rich geospatial analytics beyond summary counts are out of scope.
- Production-hardening concerns (e.g., full observability, disaster-grade HA settings) are out of scope.

`[@test] ../src/__tests__/scope/scaffold-non-goals-boundary.test.tsx`
