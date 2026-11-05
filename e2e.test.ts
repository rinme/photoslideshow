import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { startServer, MAX_PHOTOS, getLocalIPAddresses } from "./server";

class TestClient {
  ws: WebSocket;
  messages: any[] = [];
  private waiters: ((msg: any) => void)[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift()!;
        waiter(data);
      } else {
        this.messages.push(data);
      }
    };
  }

  async waitForOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
    });
  }

  async nextMessage(timeoutMs = 4000): Promise<any> {
    if (this.messages.length > 0) {
      return this.messages.shift();
    }
    return new Promise((resolve, reject) => {
      let waiter: (msg: any) => void;
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      waiter = (msg: any) => {
        clearTimeout(timer);
        resolve(msg);
      };
      this.waiters.push(waiter);
    });
  }

  send(data: any): void {
    this.ws.send(JSON.stringify(data));
  }

  close(): void {
    this.ws.close();
  }
}

describe("End-to-End Slideshow Multi-Client Simulation", () => {
  let server: ReturnType<typeof startServer>;
  let wsUrl: string;
  let httpUrl: string;

  beforeAll(() => {
    // 1. Boot server on dynamic port (port 0)
    server = startServer(0);
    httpUrl = `http://${server.hostname}:${server.port}`;
    wsUrl = `ws://${server.hostname}:${server.port}/ws`;
  });

  afterAll(() => {
    server.stop(true);
  });

  it("completes full multi-client lifecycle: connect, upload, sync, control, and 50-photo buffer eviction", async () => {
    // 2. Connect Display client via WebSocket, verify initial state
    const displayClient = new TestClient(wsUrl);
    await displayClient.waitForOpen();

    const displayInit = await displayClient.nextMessage();
    expect(displayInit.type).toBe("init");
    expect(displayInit.photos).toEqual([]);
    expect(displayInit.state).toBeDefined();
    expect(displayInit.state.isPlaying).toBe(true);
    expect(displayInit.state.currentIndex).toBe(0);
    expect(displayInit.state.total).toBe(0);

    // 3. Connect Camera client via WebSocket
    const cameraClient = new TestClient(wsUrl);
    await cameraClient.waitForOpen();

    const cameraInit = await cameraClient.nextMessage();
    expect(cameraInit.type).toBe("init");
    expect(cameraInit.photos).toEqual([]);
    expect(cameraInit.state.total).toBe(0);

    // 4. Camera sends resized photo with frame composite metadata (simulated JPEG base64)
    const photo1 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAPphoto1";
    cameraClient.send({ type: "upload", image: photo1 });

    // 5. Display receives new photo immediately ({ type: "new_photo", image, index, total })
    const displayPhoto1 = await displayClient.nextMessage();
    expect(displayPhoto1.type).toBe("new_photo");
    expect(displayPhoto1.image).toBe(photo1);
    expect(displayPhoto1.index).toBe(0);
    expect(displayPhoto1.total).toBe(1);

    // Camera client also receives the broadcast
    const cameraPhoto1 = await cameraClient.nextMessage();
    expect(cameraPhoto1.type).toBe("new_photo");
    expect(cameraPhoto1.image).toBe(photo1);
    expect(cameraPhoto1.index).toBe(0);
    expect(cameraPhoto1.total).toBe(1);

    // 6. Camera sends "pause" control, Display receives updated state ({ type: "state", isPlaying: false })
    cameraClient.send({ type: "control", action: "pause" });

    const displayPauseState = await displayClient.nextMessage();
    expect(displayPauseState.type).toBe("state");
    expect(displayPauseState.isPlaying).toBe(false);
    expect(displayPauseState.currentIndex).toBe(0);
    expect(displayPauseState.total).toBe(1);

    const cameraPauseState = await cameraClient.nextMessage();
    expect(cameraPauseState.type).toBe("state");
    expect(cameraPauseState.isPlaying).toBe(false);

    // Upload a second photo to test "next" navigation across multiple slides
    const photo2 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAPphoto2";
    cameraClient.send({ type: "upload", image: photo2 });

    const displayPhoto2 = await displayClient.nextMessage();
    expect(displayPhoto2.type).toBe("new_photo");
    expect(displayPhoto2.image).toBe(photo2);
    expect(displayPhoto2.index).toBe(1);
    expect(displayPhoto2.total).toBe(2);

    const cameraPhoto2 = await cameraClient.nextMessage();
    expect(cameraPhoto2.type).toBe("new_photo");
    expect(cameraPhoto2.index).toBe(1);

    // 7. Camera sends "next" control, Display synchronizes to next index (wraps around to 0)
    cameraClient.send({ type: "control", action: "next" });

    const displayNextState = await displayClient.nextMessage();
    expect(displayNextState.type).toBe("state");
    expect(displayNextState.currentIndex).toBe(0);
    expect(displayNextState.total).toBe(2);

    const cameraNextState = await cameraClient.nextMessage();
    expect(cameraNextState.type).toBe("state");
    expect(cameraNextState.currentIndex).toBe(0);

    // Advance to photo 1 again
    cameraClient.send({ type: "control", action: "next" });
    const displayNextState2 = await displayClient.nextMessage();
    expect(displayNextState2.currentIndex).toBe(1);
    await cameraClient.nextMessage(); // consume camera broadcast

    // 8. Display sends "play" control, Camera receives updated state ({ type: "state", isPlaying: true })
    displayClient.send({ type: "control", action: "play" });

    const cameraPlayState = await cameraClient.nextMessage();
    expect(cameraPlayState.type).toBe("state");
    expect(cameraPlayState.isPlaying).toBe(true);
    expect(cameraPlayState.currentIndex).toBe(1);

    const displayPlayState = await displayClient.nextMessage();
    expect(displayPlayState.type).toBe("state");
    expect(displayPlayState.isPlaying).toBe(true);

    // 9. Add 55 photos sequentially, verify buffer evicts oldest and strictly caps at 50 photos
    // We already have 2 photos (photo1, photo2). Uploading 55 batch photos will bring total to 57 uploads.
    // The first 7 photos (photo1, photo2, and batch photos 1..5) will be evicted, leaving batch photos 6..55.
    for (let i = 1; i <= 55; i++) {
      cameraClient.send({ type: "upload", image: `batch-photo-${i}` });
      // Consume both clients' broadcasts to keep queues clean
      await displayClient.nextMessage();
      await cameraClient.nextMessage();
    }

    // Connect a brand-new Display client to verify initial delivery after eviction
    const newlyConnectedDisplay = new TestClient(wsUrl);
    await newlyConnectedDisplay.waitForOpen();

    const lateInit = await newlyConnectedDisplay.nextMessage();
    expect(lateInit.type).toBe("init");
    expect(lateInit.photos.length).toBe(MAX_PHOTOS);
    expect(lateInit.photos.length).toBe(50);
    expect(lateInit.state.total).toBe(50);

    // Verify oldest photos were evicted
    expect(lateInit.photos).not.toContain(photo1);
    expect(lateInit.photos).not.toContain(photo2);
    expect(lateInit.photos).not.toContain("batch-photo-1");
    expect(lateInit.photos).not.toContain("batch-photo-5");

    // Verify exactly the latest 50 photos remain in correct chronological order
    expect(lateInit.photos[0]).toBe("batch-photo-6");
    expect(lateInit.photos[49]).toBe("batch-photo-55");
    expect(lateInit.state.currentIndex).toBe(49);

    displayClient.close();
    cameraClient.close();
    newlyConnectedDisplay.close();
  });

  it("synchronizes bidirectional controls (goto, prev, next) between multiple camera remotes", async () => {
    const remoteA = new TestClient(wsUrl);
    const remoteB = new TestClient(wsUrl);
    const bigScreen = new TestClient(wsUrl);

    await Promise.all([
      remoteA.waitForOpen(),
      remoteB.waitForOpen(),
      bigScreen.waitForOpen(),
    ]);

    // Consume init messages
    await Promise.all([
      remoteA.nextMessage(),
      remoteB.nextMessage(),
      bigScreen.nextMessage(),
    ]);

    // Remote A sends goto index 10
    remoteA.send({ type: "control", action: "goto", index: 10 });

    const [msgA, msgB, msgScreen] = await Promise.all([
      remoteA.nextMessage(),
      remoteB.nextMessage(),
      bigScreen.nextMessage(),
    ]);

    expect(msgA.currentIndex).toBe(10);
    expect(msgB.currentIndex).toBe(10);
    expect(msgScreen.currentIndex).toBe(10);

    // Remote B sends prev
    remoteB.send({ type: "control", action: "prev" });

    const [prevA, prevB, prevScreen] = await Promise.all([
      remoteA.nextMessage(),
      remoteB.nextMessage(),
      bigScreen.nextMessage(),
    ]);

    expect(prevA.currentIndex).toBe(9);
    expect(prevB.currentIndex).toBe(9);
    expect(prevScreen.currentIndex).toBe(9);

    remoteA.close();
    remoteB.close();
    bigScreen.close();
  });

  it("verifies HTTP routes: landing page with camera QR link, camera page, display page, and 404 handler", async () => {
    // Landing page
    const landingRes = await fetch(`${httpUrl}/`);
    expect(landingRes.status).toBe(200);
    const landingHtml = await landingRes.text();
    expect(landingHtml).toContain("Scan &amp; Stream Photos Live");
    expect(landingHtml).toContain("/camera");
    expect(landingHtml).toContain("/display");

    // Camera page
    const cameraRes = await fetch(`${httpUrl}/camera`);
    expect(cameraRes.status).toBe(200);
    const cameraHtml = await cameraRes.text();
    expect(cameraHtml).toContain("Take Photo");
    expect(cameraHtml).toContain("Send to Big Screen");

    // Display page
    const displayRes = await fetch(`${httpUrl}/display`);
    expect(displayRes.status).toBe(200);
    const displayHtml = await displayRes.text();
    expect(displayHtml).toContain("Big Screen Display");
    expect(displayHtml).toContain("slideshow-image");

    // Non-WebSocket upgrade request on /ws returns 400
    const wsFailRes = await fetch(`${httpUrl}/ws`);
    expect(wsFailRes.status).toBe(400);

    // Unknown route returns 404
    const notFoundRes = await fetch(`${httpUrl}/non-existent-page`);
    expect(notFoundRes.status).toBe(404);
  });

  it("retrieves valid local network IP addresses via getLocalIPAddresses()", () => {
    const ips = getLocalIPAddresses();
    expect(Array.isArray(ips)).toBe(true);
    for (const ip of ips) {
      // Must be IPv4 format and not loopback
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(ip.startsWith("127.")).toBe(false);
    }
  });

  it("cleans up waiters on timeout in TestClient", async () => {
    const client = new TestClient(wsUrl);
    await client.waitForOpen();
    await client.nextMessage(); // consume init

    let timedOut = false;
    try {
      await client.nextMessage(50);
    } catch {
      timedOut = true;
    }
    expect(timedOut).toBe(true);
    // Verify internal waiters array has been pruned properly
    expect((client as any).waiters.length).toBe(0);

    client.close();
  });
});
