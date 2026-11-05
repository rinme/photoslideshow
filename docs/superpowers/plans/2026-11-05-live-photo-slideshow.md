# Live Photo Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal, real-time live photo slideshow app in a single `server.ts` file using Bun, WebSockets, and Tailwind CSS CDN, featuring phone camera capture with customizable frames and synchronized dual (phone & PC) slideshow playback controls.

**Architecture:** A unified Bun server (`Bun.serve`) serving three views (`/`, `/camera`, `/display`) and handling native WebSocket pub/sub on the `"slideshow"` topic. The server maintains an in-memory ring buffer (up to 50 photos) and playback state (`isPlaying`, `currentIndex`). Mobile devices capture and composite photos with frames onto an HTML5 `<canvas>` (scaled to max 1280px, JPEG 0.7), and both mobile and PC views can control playback seamlessly over WebSockets.

**Tech Stack:** Bun, TypeScript, Native WebSockets (Bun Pub/Sub), Tailwind CSS (CDN), HTML5 Canvas.

**Spec:** [`docs/superpowers/specs/2026-11-05-live-photo-slideshow-design.md`](../specs/2026-11-05-live-photo-slideshow-design.md)

## Global Constraints
- Single application file: All production server and UI code must reside in `server.ts`.
- Max photo dimension: 1280px (width or height, maintaining aspect ratio).
- Image encoding: JPEG quality 0.7 (`image/jpeg`).
- In-memory ring buffer size limit: 50 photos max.
- Slideshow interval: 5 seconds.
- No external runtime database or npm dependencies beyond Bun and Tailwind CDN.

---

### Task 1: Core Bun Server & WebSocket Protocol

**Files:**
- Create: `package.json`
- Create: `server.ts`
- Test: `server.test.ts`

**Interfaces:**
- Produces:
  - `startServer(port?: number): Server`
  - Routes: `GET /`, `GET /camera`, `GET /display`, `GET /ws`
  - WebSocket protocol message schemas:
    - `{ type: "init", photos: string[], state: { isPlaying: boolean, currentIndex: number } }`
    - `{ type: "upload", image: string }`
    - `{ type: "new_photo", image: string, index: number, total: number }`
    - `{ type: "control", action: "play" | "pause" | "next" | "prev" | "goto", index?: number }`
    - `{ type: "state", isPlaying: boolean, currentIndex: number, total: number }`

- [ ] **Step 1: Write the failing tests for HTTP routing and WebSocket pub/sub**

Write `server.test.ts`:
```typescript
import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { startServer, MAX_PHOTOS } from "./server";

describe("Live Photo Slideshow Server", () => {
  let server: ReturnType<typeof startServer>;
  let wsUrl: string;
  let httpUrl: string;

  beforeAll(() => {
    server = startServer(0); // Port 0 for random available port
    httpUrl = `http://${server.hostname}:${server.port}`;
    wsUrl = `ws://${server.hostname}:${server.port}/ws`;
  });

  afterAll(() => {
    server.stop(true);
  });

  it("serves the landing page on GET /", async () => {
    const res = await fetch(`${httpUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Live Photo Slideshow");
  });

  it("serves the camera page on GET /camera", async () => {
    const res = await fetch(`${httpUrl}/camera`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Take Photo");
  });

  it("serves the display page on GET /display", async () => {
    const res = await fetch(`${httpUrl}/display`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("slideshow");
  });

  it("handles WebSocket connections and initial state delivery", async () => {
    const ws = new WebSocket(wsUrl);
    const initMessage = await new Promise<any>((resolve, reject) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data));
      ws.onerror = reject;
    });

    expect(initMessage.type).toBe("init");
    expect(Array.isArray(initMessage.photos)).toBe(true);
    expect(initMessage.state).toBeDefined();
    expect(typeof initMessage.state.isPlaying).toBe("boolean");
    ws.close();
  });

  it("handles photo upload, updates buffer, and broadcasts new_photo", async () => {
    const clientA = new WebSocket(wsUrl);
    const clientB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((res) => (clientA.onopen = res)),
      new Promise((res) => (clientB.onopen = res)),
    ]);

    // Discard init messages
    await Promise.all([
      new Promise((res) => (clientA.onmessage = res)),
      new Promise((res) => (clientB.onmessage = res)),
    ]);

    const samplePhoto = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const bReceivedPromise = new Promise<any>((resolve) => {
      clientB.onmessage = (event) => resolve(JSON.parse(event.data));
    });

    clientA.send(JSON.stringify({ type: "upload", image: samplePhoto }));
    const bReceived = await bReceivedPromise;

    expect(bReceived.type).toBe("new_photo");
    expect(bReceived.image).toBe(samplePhoto);
    expect(bReceived.total).toBeGreaterThanOrEqual(1);

    clientA.close();
    clientB.close();
  });

  it("synchronizes playback controls across clients", async () => {
    const clientA = new WebSocket(wsUrl);
    const clientB = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((res) => (clientA.onopen = res)),
      new Promise((res) => (clientB.onopen = res)),
    ]);

    // Discard init messages
    await Promise.all([
      new Promise((res) => (clientA.onmessage = res)),
      new Promise((res) => (clientB.onmessage = res)),
    ]);

    const statePromise = new Promise<any>((resolve) => {
      clientB.onmessage = (event) => resolve(JSON.parse(event.data));
    });

    clientA.send(JSON.stringify({ type: "control", action: "pause" }));
    const state = await statePromise;

    expect(state.type).toBe("state");
    expect(state.isPlaying).toBe(false);

    clientA.close();
    clientB.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: FAIL with "Cannot find module './server'".

- [ ] **Step 3: Create package.json and implement server.ts structure**

Create `package.json`:
```json
{
  "name": "live-photo-slideshow",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "bun run server.ts",
    "dev": "bun --watch server.ts",
    "test": "bun test"
  }
}
```

Implement `server.ts` with HTTP routing, in-memory state (`photoBuffer`, `slideshowState`), and WebSocket pub/sub implementation:
```typescript
export const MAX_PHOTOS = 50;

export interface SlideshowState {
  isPlaying: boolean;
  currentIndex: number;
}

export function startServer(port: number = Number(process.env.PORT) || 3000) {
  const photoBuffer: string[] = [];
  const state: SlideshowState = {
    isPlaying: true,
    currentIndex: 0,
  };

  const TOPIC = "slideshow";

  const server = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      if (url.pathname === "/") {
        return new Response(getLandingHTML(url.host), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/camera") {
        return new Response(getCameraHTML(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/display") {
        return new Response(getDisplayHTML(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        ws.subscribe(TOPIC);
        ws.send(
          JSON.stringify({
            type: "init",
            photos: photoBuffer,
            state: {
              ...state,
              total: photoBuffer.length,
            },
          })
        );
      },
      message(ws, rawMessage) {
        try {
          const msg = JSON.parse(String(rawMessage));
          if (msg.type === "upload" && typeof msg.image === "string") {
            photoBuffer.push(msg.image);
            if (photoBuffer.length > MAX_PHOTOS) {
              photoBuffer.shift();
            }
            state.currentIndex = photoBuffer.length - 1;

            server.publish(
              TOPIC,
              JSON.stringify({
                type: "new_photo",
                image: msg.image,
                index: state.currentIndex,
                total: photoBuffer.length,
              })
            );
          } else if (msg.type === "control") {
            if (msg.action === "play") state.isPlaying = true;
            if (msg.action === "pause") state.isPlaying = false;
            if (msg.action === "next" && photoBuffer.length > 0) {
              state.currentIndex = (state.currentIndex + 1) % photoBuffer.length;
            }
            if (msg.action === "prev" && photoBuffer.length > 0) {
              state.currentIndex =
                (state.currentIndex - 1 + photoBuffer.length) % photoBuffer.length;
            }
            if (
              msg.action === "goto" &&
              typeof msg.index === "number" &&
              photoBuffer.length > 0
            ) {
              state.currentIndex = Math.max(0, Math.min(msg.index, photoBuffer.length - 1));
            }

            server.publish(
              TOPIC,
              JSON.stringify({
                type: "state",
                isPlaying: state.isPlaying,
                currentIndex: state.currentIndex,
                total: photoBuffer.length,
              })
            );
          }
        } catch (e) {
          console.error("Failed to parse websocket message:", e);
        }
      },
      close(ws) {
        ws.unsubscribe(TOPIC);
      },
    },
  });

  return server;
}

// Stubs for HTML views (detailed in subsequent tasks)
export function getLandingHTML(host: string): string {
  return `<!DOCTYPE html><html><head><title>Live Photo Slideshow</title></head><body>Live Photo Slideshow</body></html>`;
}

export function getCameraHTML(): string {
  return `<!DOCTYPE html><html><head><title>Camera</title></head><body>Take Photo</body></html>`;
}

export function getDisplayHTML(): string {
  return `<!DOCTYPE html><html><head><title>Display</title></head><body>slideshow</body></html>`;
}

if (import.meta.main) {
  const server = startServer();
  console.log(`Slideshow server running at http://${server.hostname}:${server.port}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add package.json server.ts server.test.ts
git commit -m "feat: implement core bun server and websocket pub/sub protocol"
```

---

### Task 2: `/camera` Mobile View with Canvas Resizer, Frames & Remote Controls

**Files:**
- Modify: `server.ts` (replace `getCameraHTML` implementation)
- Test: `server.test.ts` (add camera UI tests)

**Interfaces:**
- Input: User uploads or snaps a photo from `<input type="file" accept="image/*" capture="environment">`.
- Canvas Composite:
  - Target dimension: max 1280px maintaining aspect ratio.
  - Frames supported:
    - `"none"`: Plain photo.
    - `"polaroid"`: White frame with bottom border, date text, and drop shadow.
    - `"filmstrip"`: Dark border with sprocket perforation notches.
    - `"minimal"`: Subtle clean border with rounded corner accents.
  - Export: `canvas.toDataURL("image/jpeg", 0.7)`
- WebSocket Output:
  - Dispatches `{ type: "upload", image: dataUrl }`
  - Dispatches `{ type: "control", action: "play" | "pause" | "next" | "prev" }`
  - Receives `{ type: "init" | "state" | "new_photo" }` to update the bottom remote status label.

- [ ] **Step 1: Write integration tests verifying camera HTML elements and script functions**

Update `server.test.ts` to verify camera page content contains:
- Native file input with `capture="environment"` and `accept="image/*"`
- Frame options (`none`, `polaroid`, `filmstrip`, `minimal`)
- Canvas processing and max 1280px logic
- Play/Pause, Next, Previous controls

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: FAIL due to missing UI elements in stub.

- [ ] **Step 3: Implement rich `getCameraHTML` in `server.ts`**

Implement complete HTML with:
- Tailwind CSS CDN (`<script src="https://cdn.tailwindcss.com"></script>`)
- Mobile viewport meta tags, dark UI, iOS safe areas.
- Hidden `<input id="file-input" type="file" accept="image/*" capture="environment" class="hidden">`
- "Take Photo" primary button.
- Preview Modal / Editor view:
  - Canvas preview.
  - Frame selection pills (None, Polaroid, Filmstrip, Minimal).
  - Custom caption input (optional text written on Polaroid bottom).
  - "Send to Big Screen" button with loading spinner & success toast.
  - "Retake" button.
- Frame rendering engine:
  - Canvas scaling math preserving aspect ratio with `Math.max(w, h) <= 1280`.
  - Frame styles drawn directly to canvas:
    - Polaroid: Expanded canvas bounds for bottom margin, white fill, date & caption text using legible font.
    - Filmstrip: Top and bottom dark strips with drawn white/grey sprocket holes.
    - Minimal: Elegant border inset with smooth rounded corner accents.
- Floating bottom slideshow remote bar:
  - Prev button (`⏮`), Play/Pause toggle (`▶ / ⏸`), Next button (`⏭`).
  - Active index indicator (`Photo X of Y`).
  - WebSocket auto-reconnect logic (retries every 2 seconds on disconnect).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts server.test.ts
git commit -m "feat: implement mobile camera view with frame customization and remote control"
```

---

### Task 3: `/display` Big Screen View with Auto-Rotation, Dual Controls, and Transitions

**Files:**
- Modify: `server.ts` (replace `getDisplayHTML` implementation)
- Test: `server.test.ts` (add display UI tests)

**Interfaces:**
- Consumes:
  - `{ type: "init", photos, state }`
  - `{ type: "new_photo", image, index, total }`
  - `{ type: "state", isPlaying, currentIndex, total }`
- Produces:
  - Sends `{ type: "control", action }` on keyboard or UI interaction.
- Behavior:
  - Fullscreen black `#000000` view.
  - Automatic 5s rotation timer (restarts on manual navigation or new photo).
  - Keyboard shortcuts: `Space`, `ArrowLeft`, `ArrowRight`, `F`.
  - On-screen hover HUD that automatically fades out after 3 seconds of mouse inactivity.

- [ ] **Step 1: Write integration tests for display HTML elements and shortcuts**

Update `server.test.ts` to assert:
- Presence of fullscreen black layout container.
- Presence of image element with transition classes.
- Presence of keyboard event listener logic (`Space`, `ArrowLeft`, `ArrowRight`, `F`).
- Presence of 5000ms loop timer logic.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: FAIL due to missing display elements in stub.

- [ ] **Step 3: Implement rich `getDisplayHTML` in `server.ts`**

Implement complete HTML with:
- Tailwind CSS CDN.
- Background `#000000`, full viewport height/width, hidden cursor when idle.
- Empty state indicator: Elegant minimalist text *"Waiting for photos... Scan QR code on home page or visit /camera"* with a pulse dot.
- Main photo container:
  - Smooth opacity crossfade transition (`transition-opacity duration-700 ease-in-out`).
  - `object-contain` max-w-full max-h-full to support portrait and landscape photos without distortion.
- Slideshow loop controller:
  - `setInterval(advancePhoto, 5000)` active whenever `isPlaying === true` and `photos.length > 0`.
  - On `new_photo`: immediately sets `currentIndex = photos.length - 1`, updates image source, resets 5s timer.
- Keyboard handlers:
  - `Space`: prevent default scroll, emit `{ type: "control", action: isPlaying ? "pause" : "play" }`.
  - `ArrowLeft`: emit `{ type: "control", action: "prev" }`.
  - `ArrowRight`: emit `{ type: "control", action: "next" }`.
  - `f` / `F`: toggle `document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()`.
- Floating bottom HUD:
  - Appears on mouse movement, hides after 3s of inactivity.
  - Prev, Play/Pause, Next, Fullscreen toggle, and slide counter (`Photo 3 / 15`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts server.test.ts
git commit -m "feat: implement big screen display view with transitions and dual controls"
```

---

### Task 4: Root View (`/`) with Dynamic Inline QR Code & Navigation

**Files:**
- Modify: `server.ts` (replace `getLandingHTML` implementation)
- Test: `server.test.ts` (add landing page tests)

**Interfaces:**
- Produces:
  - Dynamic QR code pointing to `http://<host>/camera` rendered in pure SVG/canvas without external npm dependencies.
  - Direct quick-launch links to `/camera` and `/display`.

- [ ] **Step 1: Write integration test for landing page elements**

Update `server.test.ts` to assert:
- Presence of QR code container and links to `/camera` and `/display`.
- Correct URL target for phone scanning.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: FAIL due to missing elements in landing stub.

- [ ] **Step 3: Implement `getLandingHTML` with inline QR code generation**

Implement pure TypeScript/JavaScript lightweight QR code matrix generator (or SVG QR code renderer) embedded directly inside `server.ts`:
- Modern dark-themed dashboard page styled with Tailwind CSS.
- Automatically detects request host (e.g., `192.168.1.50:3000` or `localhost:3000`).
- Generates inline SVG QR code directing phones to `http://${host}/camera`.
- Action cards:
  - **Open Camera** (`/camera`): "Take photos from your phone" with icon.
  - **Launch Big Screen** (`/display`): "Open fullscreen slideshow" with icon.
  - **Live Status Badge**: Connected clients / buffered photos count.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts server.test.ts
git commit -m "feat: implement landing page with dynamic QR code and navigation"
```

---

### Task 5: End-to-End Simulation & Verification

**Files:**
- Create: `e2e.test.ts`
- Modify: `package.json`

**Interfaces:**
- Validates the complete user workflow end-to-end:
  1. Boot server on dynamic port.
  2. Connect Display client via WebSocket, verify initial state.
  3. Connect Camera client via WebSocket.
  4. Camera sends resized photo with frame composite metadata.
  5. Display receives new photo immediately.
  6. Camera sends "pause" control, Display synchronizes.
  7. Camera sends "next" control, Display moves to next photo.
  8. Display sends "play" control, Camera receives updated state.
  9. Add 55 photos sequentially, verify buffer evicts oldest and caps at 50 photos.

- [ ] **Step 1: Write `e2e.test.ts`**

Implement automated end-to-end test verifying the exact sequence above.

- [ ] **Step 2: Run end-to-end tests**

Run: `cd /home/rinme/.gemini/antigravity-cli/scratch/live-photo-slideshow && bun test`
Expected: All unit and end-to-end tests PASS.

- [ ] **Step 3: Manual sanity check script**

Verify server boots and prints local IP addresses for easy mobile testing.

- [ ] **Step 4: Commit**

```bash
git add e2e.test.ts package.json
git commit -m "test: add end-to-end workflow verification"
```
