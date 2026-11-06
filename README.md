# 📸 Live Photo Slideshow & Vintage Scrapbook Wall

A real-time live photo slideshow and vintage polaroid scrapbook system powered by **Bun**, **WebSockets**, and **TypeScript**. Guests snap pictures from their mobile phones and instantly beam them onto big screen slideshows or onto an interactive vintage scrapbook table with realistic toss physics and organic non-covering collage layouts.

---

## ✨ Features

### 📖 Vintage Polaroid Scrapbook Wall (`/scrapbook`)
- **Vintage Scrapbook Aesthetic**: Textured parchment background with aged folds, antique handwriting script, botanical dried flower pressings (rose leaves with silk gold bow, pressed yellow daisies, dried wildflowers), and torn kraft washi tape date banner.
- **Organic Toss Physics & Sound**: Photos are randomly thrown onto the screen with 3D elevation, slight tilt, landing bounce, and Web Audio API synthesized whoosh & paper snap sounds.
- **Smart Non-Covering Placement**: Newly thrown photos land on top without completely obscuring any existing photo (enforces $\le 38\%$ single coverage so at least $62\%$ of every existing picture remains visible).
- **Pagination & Auto-Turn**: Holds 6 photos per page. Once a page fills up, incoming photos automatically flip the album to Page 2 (or next page) with smooth slide transitions and page controllers (`◀ Page X of Y ▶`).
- **Click-to-Enlarge Lightbox**: Single-click on any polaroid opens a high-resolution lightbox with Next/Previous arrows, photo caption, and one-click download. Drag-and-drop still works seamlessly to rearrange photos on the table.
- **Server Persistence & Dual Caching**: Photos are saved to `./pictures/` on the server and served with immutable HTTP cache headers, backed by client-side **IndexedDB** for instant offline rendering.
- **Storage Management**: Clear Storage button with confirmation modal to wipe server files and purge browser caches.

### 📱 Mobile Camera Remote (`/camera`)
- Direct camera capture or photo gallery upload from mobile devices.
- Live vintage frame overlays (Polaroid, Filmstrip, Minimal, None) with custom captions.
- Canvas-based auto-resizing (1280px limit, 0.7 JPEG compression) for fast uploads.
- Remote playback control bar (Play/Pause, Previous, Next, Slide Counter).

### 🖥️ Big Screen Slideshow (`/display`)
- Fullscreen black layout designed for projectors, TV screens, and monitors.
- 5-second automatic slideshow rotation with crossfade transitions.
- Keyboard shortcuts: `Space` (Play/Pause), `ArrowLeft` / `ArrowRight` (Navigate), `F` (Fullscreen).
- Auto-hiding HUD with playback controls.

### 🏠 Landing Dashboard (`/`)
- Dynamic QR code generation pointing to `/camera` for instant guest access.
- Quick-launch cards for Camera, Big Screen Display, and Vintage Scrapbook Wall.
- Real-time connection and photo count badge.

---

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (v1.0.0 or later)

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/rinme/photoslideshow.git
   cd photoslideshow
   ```

2. Start the development server:
   ```bash
   bun start
   ```

3. Open in your browser:
   - **Home / QR Portal**: [http://localhost:3000](http://localhost:3000)
   - **Scrapbook Wall**: [http://localhost:3000/scrapbook](http://localhost:3000/scrapbook)
   - **Big Screen Slideshow**: [http://localhost:3000/display](http://localhost:3000/display)
   - **Mobile Camera Remote**: [http://localhost:3000/camera](http://localhost:3000/camera)

---

## 🧪 Testing

Run the full end-to-end and unit test suite with Bun:

```bash
bun test
```

Includes 58 automated tests verifying:
- Multi-client real-time WebSocket synchronization
- REST and static file endpoints (`/pictures/:filename`, `/api/clear`)
- Directory traversal security guards
- Scrapbook non-covering overlap math and pagination limits
- Ring buffer eviction (50-photo limit)

---

## 📄 License

MIT License. Free for personal and commercial event photography use.
