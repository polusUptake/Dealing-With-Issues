---
name: Dark Theme UI and 3D Globe Overhaul
description: Applies a dark, glassmorphic intelligence dashboard theme and configures Mapbox as a 3D globe with dusk lighting, strictly preserving all existing functionality.
targets:
  - ../src/index.css
  - ../src/App.css
  - ../src/App.tsx
---

# Dark Theme UI and 3D Globe Overhaul

## 1. Purpose and Scope
This specification defines the visual structure, 3D map configuration, and theming required to make the frontend match a premium, dark "Intelligence Dashboard" UI. 

**CRITICAL CONSTRAINT:** This overhaul is strictly visual. You MUST preserve all existing application logic, including the 15km location-gated ranked feed, the Recharts analytics panel, the Cloudflare Turnstile security verification, the Drop Pin functionality, and all backend API communication. Do not introduce mock data.

## 2. Overall Visual System
- The application MUST use a dark visual theme (e.g., deep navy, charcoal, `#0e0e11` for background).
- Panels and sidebars MUST use translucent, glassmorphic surfaces (e.g., `background: rgba(20, 20, 24, 0.75); backdrop-filter: blur(16px);`) with subtle, thin borders (`rgba(255, 255, 255, 0.1)`).
- Typography MUST have a compact, technical dashboard appearance. Text must remain highly readable (pure white for primary text, muted grays for secondary).
- Destructive/emergency actions (like the SOS button) MUST use a visually prominent red.
- Primary interactive actions (Submit Report) MUST use a vibrant blue accent.

## 3. Central Map Styling (3D Globe)
The central map must be the immersive focal point of the application.
- **Globe Projection:** The Mapbox instance MUST be configured to use the globe projection (`projection: 'globe'`).
- **Atmosphere & Lighting:** Add atmosphere (fog/starfield) to the map so the surrounding space appears dark. Configure the 3D map to use dusk/evening/night lighting.
- **Full Bleed:** The map must occupy `100vw` and `100dvh` and sit entirely behind the UI panels.
- **Existing Pins:** The dynamic, severity-based colored pins (Red, Orange, Yellow) MUST remain visible and fully functional against the dark map style.
  `[@test] ../src/__tests__/ui/mapbox-globe-projection.test.tsx`

## 4. Left Panel Styling (Report Submission)
The left panel remains fixed-width and visually distinct.
- **Panel Base:** Apply the dark glassmorphic styling.
- **Location Mode Toggle:** Style the "Use my location" and "Drop pin" buttons as a segmented control or cohesive button group.
- **Media Upload:** Style the "Add images" area as a dashed-border dropzone with a camera icon.
- **Security:** Ensure the Cloudflare Turnstile CAPTCHA container has adequate spacing and blends with the dark theme if possible.
- **Submit Button:** Style as a full-width, pill-shaped, vibrant blue button.
  `[@test] ../src/__tests__/ui/left-panel-styling.test.tsx`

## 5. Right Panel Styling (Analytics & Ranked Feed)
The right panel contains the 15km location-gated feed and Recharts analytics.
- **Empty State:** Style the "Location Required" prompt to be centered, using muted text and a location icon.
- **Ranked Feed Cards:** 
  - Remove solid white backgrounds from the report cards. 
  - Apply hover states (`background: rgba(255, 255, 255, 0.05)`).
  - Ensure the Cloudinary thumbnails, upvote/downvote icons (`lucide-react`), and text remain aligned and properly padded.
- **Recharts Panel:** When a report expands into analytics, ensure the Recharts lines, bar charts, and text tooltips contrast properly against the dark background (update chart axes/lines to use light grays).
  `[@test] ../src/__tests__/ui/right-panel-feed-styling.test.tsx`

## 6. Bottom Map Action Bar
The floating navbar must remain overlaid at the bottom-center.
- Use a dark, rounded container for the three actions ("Coordinate", "Register org", "SOS").
- Maintain the red highlight for the SOS button.
- Ensure the dropdown/modal triggered by "Register org" also adopts the dark glassmorphic theme.
  `[@test] ../src/__tests__/ui/bottom-action-bar-styling.test.tsx`

## 7. Responsive Behavior
- On smaller screens, side panels may collapse or stack.
- The map must remain usable, and the layout must never overflow horizontally.
- Transitions (like expanding the Analytics panel) should feel smooth and performant.

