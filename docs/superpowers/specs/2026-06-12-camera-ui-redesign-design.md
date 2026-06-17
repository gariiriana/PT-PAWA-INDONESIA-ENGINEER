# Design Spec: PT PAWA Smart Camera UI Redesign & Controls Integration

This document outlines the design and implementation plan to fix the styling layout of the `CameraModal` (mobile and desktop responsiveness) and integrate fully functional camera controls (Switch Camera, Flashlight/Torch, and Zoom).

## 1. Problem Description & Root Cause

- **Tailwind CSS Compilation**: Components inside `shared/components/*` are not scanned by Tailwind v4 in `hse-web` and `engineer-web`. Consequently, utility classes like `fixed`, `absolute`, `z-50`, etc., are missing, collapsing the modal layout.
- **Responsiveness**: The camera stream and modal dimensions lack constraints. On desktop, the stream fills the whole screen, hiding the header and footer. On mobile, the buttons wrap and are cut off.
- **Mock Watermark Positioning**: The watermark overlay is positioned relative to an unconstrained container, causing it to float in the middle of the screen rather than staying anchored neatly to the bottom-left of the camera bounds.

## 2. Proposed Changes

### A. Tailwind CSS v4 Scanning Configuration

We will add the `@source` directive pointing to the shared folder in both applications' main stylesheet:

- `apps/hse-web/src/index.css`
- `apps/engineer-web/src/index.css`

```css
@import "tailwindcss";
@source "../../shared/**/*.tsx";
```

### B. CameraModal Responsive Layout

We will wrap the camera stream in a viewport-constrained card container:

- Modal wrapper: `fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4`
- Card container: `relative w-full max-w-2xl bg-[#0d111a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]`
- Camera container: `relative flex-1 min-h-[300px] max-h-[55vh] bg-black flex items-center justify-center overflow-hidden`
- This ensures the modal content never overflows the height of the screen, and the header & footer remain visible.

### C. Live Camera View Controls & Overlays

We will add the exact UI features from the reference screenshot:

1. **Top Bar Header**:
   - Left: Rounded container with a yellow/orange camera icon.
   - Title: `Ambil Foto Dokumentasi` (bold white).
   - Subtitle: Dynamic GPS icon with coordinates & accuracy (e.g., `-6.352581, 107.192539 (±37m)`).
   - Right: Close button `✕`.
2. **Left Controls Overlay** (absolutely positioned over the live feed):
   - **Switch Camera**: Translucent circular button. On click, it cycles between the front and rear cameras.
   - **Flashlight (Torch)**: Orange/yellow circular button. On click, toggles the camera track's `torch` capability (supported on mobile).
3. **Right Controls Overlay**:
   - **Zoom Controls**: Vertical column containing a zoom-in magnifier button, a vertical slider track with a blue handle, and a zoom-out magnifier button.
   - Zoom value text: `1.0x` (up to `3.0x` or `4.0x`).
   - Zoom behavior:
     - Live view: Applies `transform: scale(zoomValue)` to the `<video>` element.
     - Captured photo: The canvas drawing logic in `applyWatermark` will crop the image matching the selected scale, ensuring the final saved file is zoomed.
4. **Top Right Overlay**:
   - Translucent green label: `✓ TERVERIFIKASI`.
5. **Corner Guides**:
   - Absolute corner L-brackets outlining the camera focus frame.
6. **Watermark Preview** (bottom-left overlay):
   - Styled exactly like the screenshot:
     - Brand Title: `PT PAWA INDONESIA ENGINEER` (Bold yellow/orange).
     - Activities: `KEGIATAN: DOKUMENTASI ENGINEER` (Bold white) or the `detailUnit`.
     - Timestamp: `<date>, <time> WIB` (White).
     - Coordinates: Red pin + `latitude, longitude (±accuracy)` (Yellow).
     - Address: Geocoded address (White, smaller text, maximum 2 lines).

### D. Watermark Draw Helper (`shared/utils/camera.ts`)

Update `applyWatermark` and canvas drawing to render the watermark exactly as styled in the preview overlay (matching color schemes, fonts, red pin icon, and layout).

---

## 3. Verification Plan

- **Manual Verification**:

  1. Open the HSE Web app and Engineer Web app.
  2. Open the camera dialog on both desktop and mobile viewports.
  3. Verify that the modal header, close button, live camera view, overlays (left/right controls), and footer buttons are completely visible.
  4. Test "Switch Camera", "Flashlight", and "Zoom slider" interactions.
  5. Click "Ambil Foto" and verify the preview has the clean watermark.
  6. Confirm the captured image downloads correctly and contains the exact watermark.
