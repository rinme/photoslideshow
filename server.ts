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
