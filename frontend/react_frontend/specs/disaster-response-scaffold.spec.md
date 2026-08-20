---
name: Disaster Response App Scaffold
description: Offline-first React PWA scaffold with map, incident reporting, analytics sidebar, and Firebase-backed report sync
targets:
  - ../src/**/*.ts
  - ../src/**/*.tsx
  - ../src/**/*.css
  - ../src/**/*.json
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
- User location capture (lat/lng required before successful submit).
- Submit action that produces a new report record.

`[@test] ../src/__tests__/reporting/report-form-required-fields.test.tsx`

### Validation and submit outcomes

- Submitting without title is blocked with a user-visible validation message.
- Submitting without location is blocked with a user-visible validation message.
- Successful submit shows immediate local confirmation and updates map pins.

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

## Non-goals for scaffold phase

- Advanced routing, role-based access, and full incident management workflows are out of scope.
- Rich geospatial analytics beyond summary counts are out of scope.
- Production-hardening concerns (e.g., full observability, disaster-grade HA settings) are out of scope.

`[@test] ../src/__tests__/scope/scaffold-non-goals-boundary.test.tsx`
