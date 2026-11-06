import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { startServer, MAX_PHOTOS, generateQRCodeSVG, getLandingHTML, getScrapbookHTML } from "./server";

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

  describe("Landing Root View (/)", () => {
    let landingHtml: string;

    beforeAll(async () => {
      const res = await fetch(`${httpUrl}/`);
      landingHtml = await res.text();
    });

    it("includes mobile viewport and Tailwind CSS CDN", () => {
      expect(landingHtml).toContain("viewport");
      expect(landingHtml).toContain("cdn.tailwindcss.com");
    });

    it("renders dynamic inline SVG QR code container pointing to /camera target URL", () => {
      const expectedCameraUrl = `http://${server.hostname}:${server.port}/camera`;
      expect(landingHtml).toMatch(/id=["']qr-container["']|<div[^>]*class=[^>]*qr/i);
      expect(landingHtml).toContain("<svg");
      expect(landingHtml).toContain(expectedCameraUrl);
    });

    it("generates a scannable inline QR code SVG", () => {
      const url = `http://${server.hostname}:${server.port}/camera`;
      const svg = generateQRCodeSVG(url);
      expect(svg).toContain("<svg");
      expect(svg).toContain("<rect");
      expect(svg).toContain("shape-rendering=\"crispEdges\"");
    });

    it("provides quick-launch action card for Open Camera (/camera)", () => {
      expect(landingHtml).toMatch(/<a[^>]*href=["']\/camera["'][^>]*>/i);
      expect(landingHtml).toContain("Open Camera");
      expect(landingHtml).toMatch(/take photos from your phone/i);
    });

    it("provides quick-launch action card for Launch Big Screen (/display)", () => {
      expect(landingHtml).toMatch(/<a[^>]*href=["']\/display["'][^>]*>/i);
      expect(landingHtml).toMatch(/launch big screen|open big screen/i);
      expect(landingHtml).toMatch(/open fullscreen slideshow/i);
    });

    it("provides quick-launch action card for Scrapbook Wall (/scrapbook)", () => {
      expect(landingHtml).toMatch(/<a[^>]*href=["']\/scrapbook["'][^>]*>/i);
      expect(landingHtml).toContain("Scrapbook Wall");
      expect(landingHtml).toMatch(/polaroid collage|without covering/i);
    });

    it("includes live status badge and WebSocket listener for real-time photo/connection status", () => {
      expect(landingHtml).toMatch(/id=["'](?:live-)?status-badge["']|id=["']connection-status["']/i);
      expect(landingHtml).toMatch(/id=["'](?:photo-count|buffered-count|photo-badge)["']/i);
      expect(landingHtml).toContain("/ws");
      expect(landingHtml).toMatch(/WebSocket/);
    });

    it("sanitizes host parameter to prevent XSS / attribute breakout", () => {
      const html = getLandingHTML('evil.com"><script>alert(1)</script>');
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain('evil.com"');
      expect(html).toContain("http://evil.comscriptalert1script/camera");
    });
  });

  it("serves the camera page on GET /camera", async () => {
    const res = await fetch(`${httpUrl}/camera`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Take Photo");
  });

  describe("Camera Mobile View (/camera)", () => {
    let cameraHtml: string;

    beforeAll(async () => {
      const res = await fetch(`${httpUrl}/camera`);
      cameraHtml = await res.text();
    });

    it("includes mobile viewport and Tailwind CSS", () => {
      expect(cameraHtml).toContain("viewport-fit=cover");
      expect(cameraHtml).toContain("cdn.tailwindcss.com");
    });

    it("has native file input with camera capture and accept image/*", () => {
      expect(cameraHtml).toMatch(/<input[^>]*type=["']file["'][^>]*>/i);
      expect(cameraHtml).toMatch(/capture=["']environment["']/i);
      expect(cameraHtml).toMatch(/accept=["']image\/\*["']/i);
    });

    it("provides frame options for none, polaroid, filmstrip, and minimal", () => {
      expect(cameraHtml).toContain('data-frame="none"');
      expect(cameraHtml).toContain('data-frame="polaroid"');
      expect(cameraHtml).toContain('data-frame="filmstrip"');
      expect(cameraHtml).toContain('data-frame="minimal"');
    });

    it("includes canvas resizing logic with 1280px limit and 0.7 jpeg quality", () => {
      expect(cameraHtml).toContain("1280");
      expect(cameraHtml).toContain("image/jpeg");
      expect(cameraHtml).toContain("0.7");
    });

    it("includes preview editor controls: Retake, Send to Big Screen, and Caption input", () => {
      expect(cameraHtml).toContain("Send to Big Screen");
      expect(cameraHtml).toContain("Retake");
      expect(cameraHtml).toMatch(/id=["']caption-input["']|<input[^>]*placeholder=[^>]*caption/i);
    });

    it("includes bottom remote controls for play/pause, prev, next, and slide counter", () => {
      expect(cameraHtml).toMatch(/id=["']prev-btn["']|data-action=["']prev["']/i);
      expect(cameraHtml).toMatch(/id=["']play-btn["']|id=["']toggle-play-btn["']|data-action=["']play["']/i);
      expect(cameraHtml).toMatch(/id=["']next-btn["']|data-action=["']next["']/i);
      expect(cameraHtml).toMatch(/id=["']slide-counter["']|id=["']counter["']/i);
    });

    it("contains WebSocket auto-reconnect handling and control dispatches", () => {
      expect(cameraHtml).toContain("upload");
      expect(cameraHtml).toContain("control");
      expect(cameraHtml).toMatch(/reconnect|2000|setTimeout/i);
    });
  });

  it("serves the display page on GET /display", async () => {
    const res = await fetch(`${httpUrl}/display`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("slideshow");
  });

  describe("Display Big Screen View (/display)", () => {
    let displayHtml: string;

    beforeAll(async () => {
      const res = await fetch(`${httpUrl}/display`);
      displayHtml = await res.text();
    });

    it("includes Tailwind CSS and fullscreen black layout container", () => {
      expect(displayHtml).toContain("cdn.tailwindcss.com");
      expect(displayHtml).toMatch(/bg-(?:black|\[#000000\])|#000000/i);
      expect(displayHtml).toMatch(/w-screen|h-screen|h-full|inset-0|fixed|absolute/i);
    });

    it("includes empty state indicator when no photos have been uploaded", () => {
      expect(displayHtml).toMatch(/waiting for photos/i);
      expect(displayHtml).toMatch(/\/camera|scan qr code/i);
      expect(displayHtml).toContain("animate-pulse");
    });

    it("includes image container with crossfade transition classes and object-contain", () => {
      expect(displayHtml).toMatch(/transition-opacity/i);
      expect(displayHtml).toMatch(/duration-700/i);
      expect(displayHtml).toMatch(/object-contain/i);
      expect(displayHtml).toMatch(/<img[^>]*id=["']slideshow-image["']/i);
    });

    it("implements keyboard navigation shortcuts for Space, ArrowLeft, ArrowRight, and Fullscreen F", () => {
      expect(displayHtml).toMatch(/addEventListener\(['"]keydown['"]/i);
      expect(displayHtml).toMatch(/Space|code === ['"]Space['"]|key === ['"] ['"]/i);
      expect(displayHtml).toMatch(/ArrowLeft/i);
      expect(displayHtml).toMatch(/ArrowRight/i);
      expect(displayHtml).toMatch(/key === ['"]f['"]|key === ['"]F['"]|code === ['"]KeyF['"]/i);
      expect(displayHtml).toMatch(/requestFullscreen/i);
    });

    it("includes 5000ms auto-rotation slideshow timer logic", () => {
      expect(displayHtml).toContain("5000");
      expect(displayHtml).toMatch(/setInterval|clearInterval/i);
    });

    it("includes auto-hiding hover HUD with playback buttons and slide counter", () => {
      expect(displayHtml).toMatch(/id=["'](?:controls-)?hud["']/i);
      expect(displayHtml).toMatch(/data-action=["']prev["']|id=["']prev-btn["']/i);
      expect(displayHtml).toMatch(/data-action=["'](?:play|toggle)["']|id=["']play-btn["']/i);
      expect(displayHtml).toMatch(/data-action=["']next["']|id=["']next-btn["']/i);
      expect(displayHtml).toMatch(/id=["']fullscreen-btn["']|data-action=["']fullscreen["']/i);
      expect(displayHtml).toMatch(/id=["']slide-counter["']|id=["']counter["']/i);
      expect(displayHtml).toMatch(/3000|setTimeout/i);
    });

    it("synchronizes via WebSocket connection with control dispatches", () => {
      expect(displayHtml).toContain("new_photo");
      expect(displayHtml).toContain("control");
      expect(displayHtml).toMatch(/reconnect|2000|setTimeout/i);
    });

    it("includes crossfade timer cancellation to prevent race conditions", () => {
      expect(displayHtml).toMatch(/crossfadeTimeout/i);
      expect(displayHtml).toMatch(/clearTimeout\(crossfadeTimeout\)/i);
    });
  });

  it("serves the vintage scrapbook page on GET /scrapbook", async () => {
    const res = await fetch(`${httpUrl}/scrapbook`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Scrapbook Memories");
  });

  it("serves the vintage scrapbook page on GET /collage alias", async () => {
    const res = await fetch(`${httpUrl}/collage`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Scrapbook Memories");
  });

  describe("Scrapbook Vintage Polaroid Wall (/scrapbook)", () => {
    let scrapbookHtml: string;

    beforeAll(async () => {
      const res = await fetch(`${httpUrl}/scrapbook`);
      scrapbookHtml = await res.text();
    });

    it("includes Tailwind CSS, handwriting Google font (Caveat), and vintage serif (Playfair Display)", () => {
      expect(scrapbookHtml).toContain("cdn.tailwindcss.com");
      expect(scrapbookHtml).toContain("family=Caveat");
      expect(scrapbookHtml).toContain("family=Playfair+Display");
      expect(scrapbookHtml).toContain("font-handwriting");
    });

    it("renders textured scrapbook paper background with crease lines and Italian script watermark", () => {
      expect(scrapbookHtml).toContain("crease-h");
      expect(scrapbookHtml).toContain("crease-v");
      expect(scrapbookHtml).toContain("di un terzo circa quanto");
      expect(scrapbookHtml).toContain("AUSTRALIA");
    });

    it("includes botanical decorations: rose leaves with gold ribbon bow, pressed daisies, and dried wildflower sprig", () => {
      // Golden Ribbon Bow & Leaves
      expect(scrapbookHtml).toContain("Golden Silk Ribbon Bow");
      expect(scrapbookHtml).toContain("#e5c158");
      // Pressed Daisies
      expect(scrapbookHtml).toContain("Daisy Petals");
      expect(scrapbookHtml).toContain("Center Textured Seed Disk");
      // Dried Pink Wildflower Branch
      expect(scrapbookHtml).toContain("Dried Pink/Burgundy Blossoms");
    });

    it("includes torn kraft paper washi tape date banner matching reference", () => {
      expect(scrapbookHtml).toContain("kraft-tape-banner");
      expect(scrapbookHtml).toContain("Thursday, 30 December 2026");
      expect(scrapbookHtml).toContain("date-display-text");
    });

    it("defines polaroid card structure with cardstock, white chin, and frosted washi/scotch tape classes", () => {
      expect(scrapbookHtml).toContain("polaroid-card");
      expect(scrapbookHtml).toContain("polaroid-photo-frame");
      expect(scrapbookHtml).toContain("polaroid-chin");
      expect(scrapbookHtml).toContain("polaroid-caption");
      expect(scrapbookHtml).toContain("washi-tape-strip");
      expect(scrapbookHtml).toContain("tape-top");
      expect(scrapbookHtml).toContain("tape-corner-left");
      expect(scrapbookHtml).toContain("tape-corner-right");
    });

    it("implements non-covering placement algorithm with collision detection and MAX_SINGLE_COVERAGE constraint", () => {
      expect(scrapbookHtml).toContain("findNonCoveringPosition");
      expect(scrapbookHtml).toContain("MAX_SINGLE_COVERAGE");
      expect(scrapbookHtml).toContain("overlapArea");
      expect(scrapbookHtml).toMatch(/coverage > MAX_SINGLE_COVERAGE|maxCoverage <= MAX_SINGLE_COVERAGE/);
    });

    it("implements throw physics trajectory, cubic-bezier easing, and Web Audio API synthesized sound", () => {
      expect(scrapbookHtml).toContain("throwPhotoIntoScreen");
      expect(scrapbookHtml).toContain("cubic-bezier(0.18, 0.89, 0.32, 1.15)");
      expect(scrapbookHtml).toContain("AudioContext");
      expect(scrapbookHtml).toContain("playTossSound");
    });

    it("implements interactive drag-and-drop and zoom lightbox modal", () => {
      expect(scrapbookHtml).toContain("attachCardInteractions");
      expect(scrapbookHtml).toContain("pointerdown");
      expect(scrapbookHtml).toContain("pointermove");
      expect(scrapbookHtml).toContain("pointerup");
      expect(scrapbookHtml).toContain("is-dragging");
      expect(scrapbookHtml).toContain("zoom-modal");
      expect(scrapbookHtml).toContain("zoom-image");
    });

    it("provides floating HUD controls for Throw, Re-scatter, Clear, Sound, Fullscreen, and QR modal", () => {
      expect(scrapbookHtml).toContain("hud-nav");
      expect(scrapbookHtml).toContain("btn-throw-sample");
      expect(scrapbookHtml).toContain("btn-rescatter");
      expect(scrapbookHtml).toContain("btn-clear");
      expect(scrapbookHtml).toContain("btn-sound");
      expect(scrapbookHtml).toContain("btn-fullscreen");
      expect(scrapbookHtml).toContain("btn-qr");
      expect(scrapbookHtml).toContain("qr-modal");
    });

    it("connects to WebSocket for real-time photo streaming (init, new_photo)", () => {
      expect(scrapbookHtml).toContain("connectWS");
      expect(scrapbookHtml).toContain("/ws");
      expect(scrapbookHtml).toContain("new_photo");
      expect(scrapbookHtml).toContain("init");
    });

    it("generates standalone HTML via getScrapbookHTML helper with sanitized host link", () => {
      const standalone = getScrapbookHTML("events.example.com:8080");
      expect(standalone).toContain("events.example.com:8080/camera");
      expect(standalone).toContain("Scrapbook Memories");
    });
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

  it("enforces MAX_PHOTOS ring buffer limit", async () => {
    const client = new WebSocket(wsUrl);
    await new Promise((res) => (client.onopen = res));
    await new Promise((res) => (client.onmessage = res)); // init

    let lastNewPhoto: any;
    client.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "new_photo") {
        lastNewPhoto = msg;
      }
    };

    for (let i = 0; i < MAX_PHOTOS + 5; i++) {
      client.send(JSON.stringify({ type: "upload", image: `photo-${i}` }));
      await new Promise((res) => setTimeout(res, 2));
    }

    expect(lastNewPhoto).toBeDefined();
    expect(lastNewPhoto.total).toBe(MAX_PHOTOS);
    expect(lastNewPhoto.index).toBe(MAX_PHOTOS - 1);

    client.close();
  });

  it("verifies that goto with NaN or non-finite index does not corrupt state.currentIndex", async () => {
    const client = new WebSocket(wsUrl);
    await new Promise((res) => (client.onopen = res));
    await new Promise<any>((res) => {
      client.onmessage = (event) => res(JSON.parse(event.data));
    }); // discard init

    // Upload a photo so photoBuffer has length > 0
    const uploadAck = new Promise<any>((res) => {
      client.onmessage = (event) => res(JSON.parse(event.data));
    });
    client.send(JSON.stringify({ type: "upload", image: "data:image/jpeg;base64,sample-goto-test" }));
    await uploadAck;

    // Send goto with NaN (in JSON, NaN stringifies to null)
    const statePromise1 = new Promise<any>((res) => {
      client.onmessage = (event) => res(JSON.parse(event.data));
    });
    client.send(JSON.stringify({ type: "control", action: "goto", index: NaN }));
    const state1 = await statePromise1;

    expect(state1.type).toBe("state");
    expect(typeof state1.currentIndex).toBe("number");
    expect(Number.isFinite(state1.currentIndex)).toBe(true);
    expect(Number.isNaN(state1.currentIndex)).toBe(false);

    // Send goto with float (e.g. 0.8) and check Math.floor normalization
    const statePromise2 = new Promise<any>((res) => {
      client.onmessage = (event) => res(JSON.parse(event.data));
    });
    client.send(JSON.stringify({ type: "control", action: "goto", index: 0.8 }));
    const state2 = await statePromise2;

    expect(state2.type).toBe("state");
    expect(state2.currentIndex).toBe(0);

    client.close();
  });

  it("guards against excessively large upload payloads (>5MB) without crashing", async () => {
    const client = new WebSocket(wsUrl);
    await new Promise((res) => (client.onopen = res));
    await new Promise((res) => (client.onmessage = res)); // init

    let receivedNewPhoto = false;
    client.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "new_photo") {
        receivedNewPhoto = true;
      }
    };

    // Send oversized payload (>5MB)
    const oversized = "data:image/jpeg;base64," + "A".repeat(5_200_000);
    client.send(JSON.stringify({ type: "upload", image: oversized }));

    await new Promise((res) => setTimeout(res, 50));
    expect(receivedNewPhoto).toBe(false);

    // Send valid payload and verify server continues working properly
    const validPhoto = "data:image/jpeg;base64,valid";
    const validPromise = new Promise<any>((resolve) => {
      client.onmessage = (event) => resolve(JSON.parse(event.data));
    });
    client.send(JSON.stringify({ type: "upload", image: validPhoto }));
    const response = await validPromise;

    expect(response.type).toBe("new_photo");
    expect(response.image).toBe(validPhoto);

    client.close();
  });
});
