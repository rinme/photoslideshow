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
});
