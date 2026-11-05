# Live Photo Slideshow Specification

## Overview
A lightweight, real-time live photo slideshow application built with Bun and native WebSockets. The system consists of a single `server.ts` file serving three web views (`/`, `/camera`, `/display`) and handling WebSocket pub/sub synchronization.

## Architecture

### 1. Server (`server.ts`)
- **Runtime**: Bun (`Bun.serve`)
- **Port**: `process.env.PORT || 3000`
- **In-Memory Storage**:
  - `photoBuffer: string[]` (max 50 photos in memory, ring buffer eviction)
  - `slideshowState: { isPlaying: boolean, currentIndex: number }`
- **Endpoints**:
  - `GET /`: Landing page displaying navigation links and QR code for `/camera`.
  - `GET /camera`: Mobile-friendly camera capture, frame customization, and remote slideshow control interface.
  - `GET /display`: Fullscreen black slideshow view for big screens/PCs with keyboard and hover controls.
  - `GET /ws`: WebSocket endpoint with automatic upgrade.
- **WebSocket Pub/Sub**:
  - Topic: `"slideshow"`
  - Connections subscribe on open and receive `{ type: "init", photos: photoBuffer, state: slideshowState }`.
  - Incoming `{ type: "upload", image }`:
    - Saved into `photoBuffer` (max 50).
    - `slideshowState.currentIndex = photoBuffer.length - 1`.
    - Broadcasts `{ type: "new_photo", image, index: slideshowState.currentIndex, total: photoBuffer.length }`.
  - Incoming `{ type: "control", action, index }`:
    - Actions: `"play"`, `"pause"`, `"next"`, `"prev"`, `"goto"`.
    - Updates `slideshowState`.
    - Broadcasts `{ type: "state", isPlaying, currentIndex, total: photoBuffer.length }`.

### 2. Camera Client (`/camera`)
- **Mobile Viewport & Styling**: Responsive layout using Tailwind CSS CDN.
- **Capture**:
  - Native file input: `<input type="file" accept="image/*" capture="environment">`.
- **Canvas Processing & Frame Customization**:
  - Maximum bounding box: 1280px × 1280px maintaining aspect ratio.
  - Frame options:
    1. **None**: Clean cropped/scaled photo.
    2. **Polaroid**: White outer frame, wide bottom margin with date stamp (`Nov 5, 2026`) and drop-shadow look.
    3. **Filmstrip**: Vintage dark border with sprocket perforation details.
    4. **Minimalist**: Clean border with rounded accents.
  - Rendered on HTML5 `<canvas>` and exported as `canvas.toDataURL("image/jpeg", 0.7)`.
- **Preview & Confirmation**:
  - Shows rendered preview with frame.
  - "Retake" and "Send to Big Screen" buttons.
  - Upload status feedback (sending spinner / sent toast).
- **Remote Controller**:
  - Persistent bottom toolbar displaying:
    - [⏮ Prev] [▶ / ⏸ Play/Pause] [⏭ Next]
    - Status label: *"Photo X of Y"*
  - Controls dispatch `{ type: "control", action }` over WebSocket to sync big screen.

### 3. Big Screen Display Client (`/display`)
- **Visuals**:
  - Fullscreen true black (`#000000`) background.
  - Responsive image rendering (`object-contain`, max height/width 100vh/100vw).
  - Smooth crossfade transitions between photos.
  - Empty state: Subtle prompt to connect phone via `/camera`.
- **Auto-Rotation**:
  - 5-second interval timer when `isPlaying` is true and `photos.length > 0`.
  - Immediate switch to new photo on arrival.
- **PC & On-Screen Controls**:
  - Keyboard shortcuts:
    - `Space`: Toggle Play/Pause
    - `ArrowRight` / `PageDown`: Next photo
    - `ArrowLeft` / `PageUp`: Previous photo
    - `F`: Toggle Fullscreen
  - Semi-transparent hover HUD at bottom (fades out after 3 seconds of mouse inactivity):
    - Prev, Play/Pause, Next buttons, Fullscreen toggle, and slide counter.
  - Synchronization: Interacting locally broadcasts `{ type: "control", action }` to keep all mobile controllers in sync.

### 4. Zero-Dependency QR Code on Landing Page (`/`)
- Inline SVG-based QR code generator or standard micro-script to allow phones on the same local network to scan and immediately open `http://<host>:<port>/camera`.

## Verification & Testing
- Bun test runner or automated verification script testing:
  - HTTP routing (`/`, `/camera`, `/display`).
  - WebSocket connection and upgrade handshake.
  - Photo upload handling, buffer size limit enforcement (50 max), and pub/sub broadcast.
  - Slideshow control state synchronization across multiple WebSocket clients.
