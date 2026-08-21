---
name: Mapbox 2D/3D Mode Toggle
description: Seamlessly toggle the Mapbox instance between a flat 2D view and a 3D terrain/building view while preserving user camera state.
targets:
  - ../src/App.tsx
  - ../src/App.css
---

# Mapbox 2D/3D Mode Toggle

This specification defines the implementation of a 2D/3D toggle for the existing Mapbox GL JS map instance. The toggle must alter the pitch, terrain, and building extrusions while strictly preserving the user's current spatial context (center, zoom, and bearing).

## 1. Investigation & Setup
Before modifying the code, inspect the existing map implementation in `App.tsx`.
- Identify the `mapboxgl.Map` initialization inside the `useEffect` hook.
- Identify where map controls (like `NavigationControl`) are added to determine the best placement for the new toggle.
- Verify if `style.load` or `load` events are already being handled.

## 2. Map Source and Layer Initialization
To support 3D mode, the map requires specific sources and layers to be injected once the base style loads.

- On map `style.load` (or `load`), add a `raster-dem` source (e.g., `mapbox://mapbox.mapbox-terrain-dem-v1`) if it does not already exist.
  `[@test] ../src/__tests__/map/dem-source-initialization.test.tsx`
- On the same event, add a `fill-extrusion` layer for 3D buildings based on the `composite` source and `building` source-layer, configured to extrude based on building height data.
  `[@test] ../src/__tests__/map/3d-building-layer-initialization.test.tsx`
- By default, initialize the map in 2D mode (terrain off, building extrusions hidden, pitch 0).

## 3. The Toggle UI
- Add a visible UI toggle (e.g., a floating button labeled "2D / 3D" or an icon toggle) positioned over the map canvas or within the existing map control overlays.
  `[@test] ../src/__tests__/map/mode-toggle-ui-presence.test.tsx`
- Clicking the toggle flips an `is3DMode` boolean state.

## 4. State Preservation & Transition Logic
When the `is3DMode` state changes, the map must transition smoothly without resetting the user's view.

### Context Preservation
Before executing the transition, read the map's current state:
- Capture current center: `map.getCenter()`
- Capture current zoom: `map.getZoom()`
- Capture current bearing: `map.getBearing()`
  `[@test] ../src/__tests__/map/camera-state-preservation.test.tsx`

### 3D Mode Activation (is3DMode === true)
- Call `map.easeTo({ pitch: 60, center: currentCenter, zoom: currentZoom, bearing: currentBearing, duration: 1000 })`.
- Call `map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })`.
- Set the 3D building layer visibility to `visible` via `map.setLayoutProperty`.
  `[@test] ../src/__tests__/map/transition-to-3d-mode.test.tsx`

### 2D Mode Activation (is3DMode === false)
- Call `map.easeTo({ pitch: 0, center: currentCenter, zoom: currentZoom, bearing: currentBearing, duration: 1000 })`.
- Call `map.setTerrain(null)`.
- Set the 3D building layer visibility to `none` via `map.setLayoutProperty`.
  `[@test] ../src/__tests__/map/transition-to-2d-mode.test.tsx`

## 5. Strict Negative Constraints
- **No FlyTo:** Do NOT use `map.flyTo`. The transition must strictly use `easeTo` to avoid dramatic camera movements or spinning.
- **No Globe Spinning:** The map must not automatically spin, rotate, or reset to a world/default view when toggled. It must feel like changing the view mode of the exact coordinate the user is currently looking at.
- **No Pitch Preservation:** Pitch must NOT be preserved from the previous state. It must be strictly overwritten to `0` (for 2D) or `60` (for 3D).
  `[@test] ../src/__tests__/map/strict-transition-constraints.test.tsx`

