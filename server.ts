import os from "node:os";
import { getScrapbookHTML } from "./scrapbook";

export { getScrapbookHTML } from "./scrapbook";

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

      if (url.pathname === "/scrapbook" || url.pathname === "/collage") {
        return new Response(getScrapbookHTML(url.host), {
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
          if (
            msg.type === "upload" &&
            typeof msg.image === "string" &&
            msg.image.length > 0 &&
            msg.image.length <= 5_000_000 &&
            (!msg.image.startsWith("data:") || msg.image.startsWith("data:image/"))
          ) {
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
              Number.isFinite(msg.index) &&
              photoBuffer.length > 0
            ) {
              state.currentIndex = Math.max(0, Math.min(Math.floor(msg.index), photoBuffer.length - 1));
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

// ==========================================
// Zero-Dependency QR Code Generator (SVG)
// ==========================================

const QR_EXP = new Uint8Array(512);
const QR_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  QR_EXP[i] = x;
  QR_EXP[i + 255] = x;
  QR_LOG[x] = i;
  x = (x << 1) ^ (x & 128 ? 0x11d : 0);
}

function qrMultiply(p1: number[], p2: number[]): number[] {
  const res = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      if (p1[i] !== 0 && p2[j] !== 0) {
        res[i + j] ^= QR_EXP[QR_LOG[p1[i]] + QR_LOG[p2[j]]];
      }
    }
  }
  return res;
}

function qrGeneratorPoly(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    g = qrMultiply(g, [1, QR_EXP[i]]);
  }
  return g;
}

function qrCalculateEC(data: number[], ecCount: number): number[] {
  const g = qrGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < g.length; j++) {
        msg[i + j] ^= QR_EXP[(QR_LOG[coef] + QR_LOG[g[j]]) % 255];
      }
    }
  }
  return msg.slice(data.length);
}

interface QRVersionConfig {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  blocks: number;
  align: number[];
}

const QR_VERSIONS: (QRVersionConfig | null)[] = [
  null,
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, blocks: 1, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, blocks: 1, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, blocks: 1, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, blocks: 1, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, blocks: 1, align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, blocks: 2, align: [6, 34] },
];

export function generateQRCodeSVG(text: string): string {
  const textBytes = new TextEncoder().encode(text);
  let config: QRVersionConfig | null = null;
  for (let v = 1; v < QR_VERSIONS.length; v++) {
    const candidate = QR_VERSIONS[v]!;
    if (textBytes.length <= candidate.dataCodewords - 2) {
      config = candidate;
      break;
    }
  }
  if (!config) {
    config = QR_VERSIONS[QR_VERSIONS.length - 1]!;
  }

  const bits: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }
  pushBits(0b0100, 4); // Byte mode
  pushBits(textBytes.length, 8); // 8-bit length for versions 1-9
  for (const b of textBytes) {
    pushBits(b, 8);
  }
  const maxBits = config.dataCodewords * 8;
  const termLen = Math.max(0, Math.min(4, maxBits - bits.length));
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  const pad = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < config.dataCodewords) {
    dataBytes.push(pad[padIdx++ % 2]);
  }

  let finalCodewords: number[] = [];
  if (config.blocks === 1) {
    const ec = qrCalculateEC(dataBytes, config.ecCodewords);
    finalCodewords = [...dataBytes, ...ec];
  } else {
    const blockSize = dataBytes.length / config.blocks;
    const block1 = dataBytes.slice(0, blockSize);
    const block2 = dataBytes.slice(blockSize);
    const ec1 = qrCalculateEC(block1, config.ecCodewords);
    const ec2 = qrCalculateEC(block2, config.ecCodewords);
    for (let i = 0; i < blockSize; i++) {
      finalCodewords.push(block1[i], block2[i]);
    }
    for (let i = 0; i < config.ecCodewords; i++) {
      finalCodewords.push(ec1[i], ec2[i]);
    }
  }

  const size = config.size;
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const isReserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  function addFinder(r0: number, c0: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[r0 + r][c0 + c] = isBorder || isCenter ? 1 : 0;
        isReserved[r0 + r][c0 + c] = true;
      }
    }
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          const rr = r0 + r;
          const cc = c0 + c;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
            matrix[rr][cc] = 0;
            isReserved[rr][cc] = true;
          }
        }
      }
    }
  }
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  if (config.align.length > 0) {
    for (const r of config.align) {
      for (const c of config.align) {
        if (isReserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix[r + dr][c + dc] = isBorder || isCenter ? 1 : 0;
            isReserved[r + dr][c + dc] = true;
          }
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    if (!isReserved[6][i]) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      isReserved[6][i] = true;
    }
    if (!isReserved[i][6]) {
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
      isReserved[i][6] = true;
    }
  }

  matrix[size - 8][8] = 1;
  isReserved[size - 8][8] = true;

  for (let i = 0; i < 9; i++) {
    isReserved[8][i] = true;
    isReserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isReserved[8][size - 1 - i] = true;
    isReserved[size - 1 - i][8] = true;
  }

  const bitStream: number[] = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      bitStream.push((byte >> i) & 1);
    }
  }
  const remainderBits = [0, 0, 7, 7, 7, 7, 7][config.version] || 0;
  for (let i = 0; i < remainderBits; i++) bitStream.push(0);

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const left = right - 1;
    const rows: number[] = [];
    if (upward) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }
    for (const r of rows) {
      for (const col of [right, left]) {
        if (!isReserved[r][col]) {
          matrix[r][col] = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
        }
      }
    }
    upward = !upward;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isReserved[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] ^= 1;
        }
      }
    }
  }

  // 8. Format bits (Level L, Mask 0): 15-bit format sequence
  // In formatStr, formatStr[0] is Bit 14 (MSB) and formatStr[14] is Bit 0 (LSB).
  const formatStr = "111011111000100";
  function getFormatBit(bitIndex: number): number {
    return parseInt(formatStr[14 - bitIndex], 10);
  }

  // Primary copy around top-left (ISO/IEC 18004 Table 10)
  // [8,0]=bit 0, [8,1]=bit 1, ..., [0,8]=bit 14
  const tlCoords: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
    [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    matrix[tlCoords[i][0]][tlCoords[i][1]] = getFormatBit(i);
  }

  // Secondary copy (ISO/IEC 18004 Table 10):
  // Top-right: [8, size-1]=bit 0, [8, size-2]=bit 1, ..., [8, size-8]=bit 7
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 1 - i] = getFormatBit(i);
  }
  // Bottom-left: [size-7, 8]=bit 8, [size-6, 8]=bit 9, ..., [size-1, 8]=bit 14
  for (let i = 0; i < 7; i++) {
    matrix[size - 7 + i][8] = getFormatBit(8 + i);
  }

  const margin = 4;
  const viewBoxSize = size + margin * 2;
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#000000"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges" class="w-full h-full block rounded-lg"><rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>${rects}</svg>`;
}

export function getLandingHTML(host: string): string {
  const cleanHost = (host || "localhost:3000").replace(/[^a-zA-Z0-9.:\[\]-]/g, "") || "localhost:3000";
  const targetUrl = `http://${cleanHost}/camera`;
  const qrSvg = generateQRCodeSVG(targetUrl);

  return `<!DOCTYPE html>
<html lang="en" class="h-full bg-zinc-950 text-zinc-100 antialiased">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Photo Slideshow</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-full flex flex-col justify-between bg-zinc-950 text-zinc-100 selection:bg-amber-500 selection:text-black">
  <!-- Top Navigation & Live Status Badge -->
  <header class="border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30">
    <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-zinc-950 font-bold shadow-md shadow-amber-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
        <h1 class="text-xl font-bold tracking-tight text-white">Live Photo Slideshow</h1>
      </div>

      <!-- Live Status Badge -->
      <div id="live-status-badge" class="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium">
        <span id="status-dot" class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span id="connection-status" class="text-zinc-300">Connecting...</span>
        <span class="text-zinc-700">|</span>
        <span id="photo-count" class="text-amber-400 font-mono">0 photos</span>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-4xl mx-auto px-6 py-8 md:py-12 flex-1 w-full flex flex-col justify-center">
    <div class="text-center max-w-xl mx-auto mb-10">
      <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
        Scan &amp; Stream Photos Live
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg">
        Guests snap photos on their mobile phones and instantly beam them onto the big screen in real-time.
      </p>
    </div>

    <!-- QR Code Card -->
    <div class="flex flex-col items-center mb-12">
      <div id="qr-container" class="relative group p-4 sm:p-5 bg-white rounded-3xl shadow-2xl shadow-amber-500/10 border border-zinc-200/20 max-w-[280px] sm:max-w-[300px] w-full aspect-square flex items-center justify-center transition-transform hover:scale-[1.02]">
        ${qrSvg}
      </div>
      <div class="mt-4 text-center">
        <p class="text-sm font-medium text-zinc-300 mb-1">Point your phone camera to join instantly</p>
        <a href="${targetUrl}" class="inline-flex items-center gap-1.5 text-xs sm:text-sm font-mono text-amber-400 hover:text-amber-300 underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-300 transition break-all">
          <span>${targetUrl}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
    </div>

    <!-- Quick-Launch Navigation Action Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto w-full">
      <!-- Camera Card -->
      <a href="/camera" class="group relative flex flex-col justify-between p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-amber-500/50 hover:bg-zinc-900 transition duration-200 shadow-lg">
        <div class="flex items-start justify-between mb-4">
          <div class="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition">
            Phone
          </span>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white group-hover:text-amber-400 transition flex items-center gap-1.5">
            Open Camera
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </h3>
          <p class="text-sm text-zinc-400 mt-1">Take photos from your phone with instant frames &amp; remote controls.</p>
        </div>
      </a>

      <!-- Big Screen Display Card -->
      <a href="/display" class="group relative flex flex-col justify-between p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-amber-500/50 hover:bg-zinc-900 transition duration-200 shadow-lg">
        <div class="flex items-start justify-between mb-4">
          <div class="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition">
            Display
          </span>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white group-hover:text-amber-400 transition flex items-center gap-1.5">
            Launch Big Screen
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </h3>
          <p class="text-sm text-zinc-400 mt-1">Open fullscreen slideshow for projectors, monitors, and TV screens.</p>
        </div>
      </a>

      <!-- Vintage Scrapbook Wall Card -->
      <a href="/scrapbook" class="group relative flex flex-col justify-between p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-amber-500/50 hover:bg-zinc-900 transition duration-200 shadow-lg">
        <div class="flex items-start justify-between mb-4">
          <div class="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
          <span class="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition">
            Scrapbook
          </span>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white group-hover:text-amber-400 transition flex items-center gap-1.5">
            Scrapbook Wall
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </h3>
          <p class="text-sm text-zinc-400 mt-1">Vintage polaroid collage view where photos are tossed live onto the table without covering each other.</p>
        </div>
      </a>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-zinc-900/80 py-4 text-center text-xs text-zinc-600">
    <p>Live Photo Slideshow &bull; Single-file event photography system powered by Bun &amp; WebSockets</p>
  </footer>

  <!-- Real-Time Status WebSocket Script -->
  <script>
    (function() {
      const statusDot = document.getElementById("status-dot");
      const statusText = document.getElementById("connection-status");
      const photoCount = document.getElementById("photo-count");

      let ws = null;
      let reconnectTimer = null;

      function connect() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = protocol + "//" + window.location.host + "/ws";
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
          if (statusDot) {
            statusDot.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
          }
          if (statusText) {
            statusText.textContent = "Live";
            statusText.className = "text-emerald-400";
          }
        };

        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "init") {
              const count = (data.photos && data.photos.length) || (data.state && data.state.total) || 0;
              updateCount(count);
            } else if (data.type === "new_photo" && typeof data.total === "number") {
              updateCount(data.total);
            } else if (data.type === "state" && typeof data.total === "number") {
              updateCount(data.total);
            }
          } catch (e) {
            console.error("WS message parse error:", e);
          }
        };

        ws.onclose = function() {
          if (statusDot) {
            statusDot.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
          }
          if (statusText) {
            statusText.textContent = "Reconnecting...";
            statusText.className = "text-amber-400";
          }
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onerror = function() {
          ws.close();
        };
      }

      function updateCount(count) {
        if (photoCount) {
          photoCount.textContent = count + (count === 1 ? " photo" : " photos");
        }
      }

      connect();
    })();
  </script>
</body>
</html>`;
}

export function getCameraHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full bg-zinc-950 text-zinc-100 antialiased">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Camera &amp; Remote - Live Slideshow</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      overscroll-behavior-y: none;
      -webkit-tap-highlight-color: transparent;
    }
    .frame-pill.active {
      background-color: #f59e0b;
      color: #09090b;
      font-weight: 600;
      border-color: #f59e0b;
    }
  </style>
</head>
<body class="h-full flex flex-col justify-between select-none bg-zinc-950 font-sans">
  <!-- Top Navigation / Status Header -->
  <header class="pt-[max(1rem,env(safe-area-inset-top))] px-5 pb-3 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
    <div class="flex items-center gap-2">
      <span class="text-xl">📸</span>
      <h1 class="text-base font-bold tracking-tight text-white">Live Slideshow</h1>
    </div>
    <div id="connection-status" class="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-400">
      <span id="status-dot" class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
      <span id="status-text">Connecting...</span>
    </div>
  </header>

  <!-- Main View (Capture Screen) -->
  <main id="capture-view" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
    <input id="file-input" type="file" accept="image/*" capture="environment" class="hidden">

    <div class="max-w-sm w-full flex flex-col items-center space-y-6">
      <div class="relative group cursor-pointer" onclick="document.getElementById('file-input').click()">
        <div class="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 opacity-60 blur-lg group-hover:opacity-100 transition duration-500"></div>
        <div class="relative w-36 h-36 rounded-full bg-zinc-900 border-2 border-amber-500/80 flex flex-col items-center justify-center shadow-2xl active:scale-95 transition-transform duration-200">
          <svg class="w-14 h-14 text-amber-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-xs uppercase tracking-wider font-semibold text-zinc-300">Tap to Snap</span>
        </div>
      </div>

      <div class="space-y-2 w-full">
        <button id="snap-btn" onclick="document.getElementById('file-input').click()" class="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 font-bold text-zinc-950 text-base shadow-lg shadow-amber-500/20 transition">
          Take Photo
        </button>
        <p class="text-xs text-zinc-500">
          Capture a photo to immediately beam it to the big screen
        </p>
      </div>
    </div>
  </main>

  <!-- Editor / Preview Modal -->
  <div id="preview-modal" class="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-md hidden flex flex-col p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
    <div class="w-full max-w-md mx-auto flex-1 flex flex-col justify-between space-y-4">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
        <h2 class="text-base font-bold text-white">Customize Photo</h2>
        <button id="modal-close-btn" class="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 text-xs">✕ Cancel</button>
      </div>

      <!-- Canvas Preview Area -->
      <div class="flex-1 min-h-[260px] max-h-[48vh] flex items-center justify-center p-2 bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-inner">
        <canvas id="preview-canvas" class="max-h-full max-w-full rounded-lg shadow-2xl object-contain"></canvas>
      </div>

      <!-- Frame Selector Pills -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Frame Style</label>
        <div class="grid grid-cols-4 gap-2">
          <button data-frame="none" class="frame-pill py-2 px-1 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition text-center">None</button>
          <button data-frame="polaroid" class="frame-pill active py-2 px-1 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition text-center">Polaroid</button>
          <button data-frame="filmstrip" class="frame-pill py-2 px-1 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition text-center">Filmstrip</button>
          <button data-frame="minimal" class="frame-pill py-2 px-1 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition text-center">Minimal</button>
        </div>
      </div>

      <!-- Custom Caption Input -->
      <div class="space-y-1.5">
        <label for="caption-input" class="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Caption</label>
        <input id="caption-input" type="text" maxlength="60" placeholder="Add a caption (optional)..." class="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400">
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-3 pt-2">
        <button id="retake-btn" class="flex-1 py-3 px-4 rounded-xl font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm active:scale-98 transition">
          Retake
        </button>
        <button id="send-btn" class="flex-1 py-3 px-5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm active:scale-98 shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2">
          <span id="send-btn-text">Send to Big Screen</span>
          <span id="send-spinner" class="hidden">
            <svg class="animate-spin h-4 w-4 text-zinc-950" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          </span>
        </button>
      </div>
    </div>
  </div>

  <!-- Success Toast -->
  <div id="toast" class="fixed top-5 inset-x-4 max-w-sm mx-auto z-50 hidden bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 transition duration-300">
    <span class="text-lg">🎉</span>
    <span class="text-sm font-semibold flex-1">Photo sent to the big screen!</span>
  </div>

  <!-- Bottom Floating Remote Control Bar -->
  <footer id="remote-bar" class="fixed bottom-0 inset-x-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/80 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between z-40">
    <div class="flex flex-col">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Live Show</span>
      <span id="slide-counter" class="text-xs font-mono font-medium text-zinc-200">Photo 0 of 0</span>
    </div>

    <div class="flex items-center gap-2">
      <button id="prev-btn" data-action="prev" title="Previous Slide" class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:scale-95 text-zinc-300 transition">
        ⏮
      </button>
      <button id="play-btn" data-action="play" title="Play / Pause" class="w-11 h-11 rounded-full flex items-center justify-center bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-bold transition shadow-md shadow-amber-500/20">
        ⏸
      </button>
      <button id="next-btn" data-action="next" title="Next Slide" class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:scale-95 text-zinc-300 transition">
        ⏭
      </button>
    </div>
  </footer>

  <script>
    // State
    const MAX_DIM = 1280;
    let currentImage = null;
    let currentFrame = 'polaroid';
    let isPlaying = true;
    let ws = null;
    let reconnectTimer = null;

    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const previewModal = document.getElementById('preview-modal');
    const previewCanvas = document.getElementById('preview-canvas');
    const captionInput = document.getElementById('caption-input');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const sendBtn = document.getElementById('send-btn');
    const sendBtnText = document.getElementById('send-btn-text');
    const sendSpinner = document.getElementById('send-spinner');
    const toast = document.getElementById('toast');
    const slideCounter = document.getElementById('slide-counter');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const framePills = document.querySelectorAll('.frame-pill');

    // WebSocket Management & Auto-reconnect
    function connectWS() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onopen = function() {
        statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        statusText.textContent = 'Connected';
      };

      ws.onmessage = function(event) {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            isPlaying = msg.state ? msg.state.isPlaying : true;
            updateControlsUI(msg.state ? msg.state.currentIndex : 0, msg.state ? msg.state.total : (msg.photos ? msg.photos.length : 0), isPlaying);
          } else if (msg.type === 'state') {
            isPlaying = msg.isPlaying;
            updateControlsUI(msg.currentIndex, msg.total, isPlaying);
          } else if (msg.type === 'new_photo') {
            updateControlsUI(msg.index, msg.total, isPlaying);
          }
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      };

      ws.onclose = function() {
        statusDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        statusText.textContent = 'Reconnecting...';
        reconnectTimer = setTimeout(connectWS, 2000);
      };

      ws.onerror = function() {
        ws.close();
      };
    }

    function updateControlsUI(currentIndex, total, playing) {
      playBtn.textContent = playing ? '⏸' : '▶';
      if (total && total > 0) {
        slideCounter.textContent = 'Photo ' + (currentIndex + 1) + ' of ' + total;
      } else {
        slideCounter.textContent = 'Photo 0 of 0';
      }
    }

    // Remote playback actions
    playBtn.addEventListener('click', function() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const nextAction = isPlaying ? 'pause' : 'play';
      ws.send(JSON.stringify({ type: 'control', action: nextAction }));
    });

    prevBtn.addEventListener('click', function() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'control', action: 'prev' }));
    });

    nextBtn.addEventListener('click', function() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'control', action: 'next' }));
    });

    // File Input Handling
    fileInput.addEventListener('change', function(e) {
      const files = e.target.files;
      if (!files || !files.length) return;
      const file = files[0];
      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          currentImage = img;
          renderFrame();
          previewModal.classList.remove('hidden');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Frame Pill Selection
    framePills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        framePills.forEach(function(p) { p.classList.remove('active'); });
        pill.classList.add('active');
        currentFrame = pill.getAttribute('data-frame');
        renderFrame();
      });
    });

    // Caption Input Live Update
    captionInput.addEventListener('input', function() {
      renderFrame();
    });

    // Close / Retake handlers
    function closeEditor() {
      previewModal.classList.add('hidden');
      fileInput.value = '';
      captionInput.value = '';
      currentImage = null;
    }
    modalCloseBtn.addEventListener('click', closeEditor);
    retakeBtn.addEventListener('click', closeEditor);

    // Frame Rendering Logic
    function renderFrame() {
      if (!currentImage) return;

      const canvas = previewCanvas;
      const ctx = canvas.getContext('2d');
      const caption = (captionInput.value || '').trim();

      const origW = currentImage.naturalWidth || currentImage.width;
      const origH = currentImage.naturalHeight || currentImage.height;

      // Resizing logic with 1280px maximum dimension preserving aspect ratio
      const scale = Math.min(1, MAX_DIM / Math.max(origW, origH));
      const sw = Math.round(origW * scale);
      const sh = Math.round(origH * scale);

      if (currentFrame === 'none') {
        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(currentImage, 0, 0, sw, sh);
      } else if (currentFrame === 'polaroid') {
        const borderSide = Math.round(sw * 0.05);
        const borderTop = Math.round(sw * 0.05);
        const borderBottom = Math.round(sw * 0.22);

        canvas.width = sw + borderSide * 2;
        canvas.height = sh + borderTop + borderBottom;

        // Card background
        ctx.fillStyle = '#faf8f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Photo draw
        ctx.drawImage(currentImage, borderSide, borderTop, sw, sh);

        // Date and Caption on bottom margin
        const dateStr = new Date().toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const fontSize = Math.max(16, Math.round(borderBottom * 0.22));
        ctx.fillStyle = '#1c1917';
        ctx.textBaseline = 'middle';

        if (caption) {
          ctx.font = '600 ' + fontSize + 'px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(caption, borderSide + 8, borderTop + sh + borderBottom * 0.45);

          ctx.font = '400 ' + Math.round(fontSize * 0.75) + 'px sans-serif';
          ctx.fillStyle = '#78716c';
          ctx.textAlign = 'right';
          ctx.fillText(dateStr, canvas.width - borderSide - 8, borderTop + sh + borderBottom * 0.45);
        } else {
          ctx.font = '500 ' + fontSize + 'px sans-serif';
          ctx.fillStyle = '#78716c';
          ctx.textAlign = 'center';
          ctx.fillText(dateStr, canvas.width / 2, borderTop + sh + borderBottom * 0.5);
        }
      } else if (currentFrame === 'filmstrip') {
        const stripH = Math.max(36, Math.round(sh * 0.09));
        const sideBorder = Math.max(12, Math.round(sw * 0.02));

        canvas.width = sw + sideBorder * 2;
        canvas.height = sh + stripH * 2;

        // Film body
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw photo
        ctx.drawImage(currentImage, sideBorder, stripH, sw, sh);

        // Sprocket holes along top and bottom
        const holeW = Math.max(10, Math.round(stripH * 0.45));
        const holeH = Math.max(12, Math.round(stripH * 0.55));
        const step = holeW * 2.2;
        const holeYTop = Math.round((stripH - holeH) / 2);
        const holeYBottom = canvas.height - stripH + Math.round((stripH - holeH) / 2);

        ctx.fillStyle = '#ffffff';
        for (let x = sideBorder; x < canvas.width - sideBorder - holeW; x += step) {
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, holeYTop, holeW, holeH, 3);
          } else {
            ctx.rect(x, holeYTop, holeW, holeH);
          }
          ctx.fill();

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, holeYBottom, holeW, holeH, 3);
          } else {
            ctx.rect(x, holeYBottom, holeW, holeH);
          }
          ctx.fill();
        }

        ctx.fillStyle = '#f59e0b';
        ctx.font = '600 ' + Math.max(12, Math.round(stripH * 0.32)) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption ? 'FILM • ' + caption.toUpperCase() : 'LIVE • 35MM', sideBorder + 8, canvas.height - stripH / 2);
      } else if (currentFrame === 'minimal') {
        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(currentImage, 0, 0, sw, sh);

        const inset = Math.max(16, Math.round(Math.min(sw, sh) * 0.035));
        const cornerLen = Math.max(20, Math.round(inset * 1.5));

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = Math.max(2, Math.round(inset * 0.15));

        // Corner accents
        ctx.beginPath();
        ctx.moveTo(inset, inset + cornerLen);
        ctx.lineTo(inset, inset);
        ctx.lineTo(inset + cornerLen, inset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sw - inset - cornerLen, inset);
        ctx.lineTo(sw - inset, inset);
        ctx.lineTo(sw - inset, inset + cornerLen);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(inset, sh - inset - cornerLen);
        ctx.lineTo(inset, sh - inset);
        ctx.lineTo(inset + cornerLen, sh - inset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sw - inset - cornerLen, sh - inset);
        ctx.lineTo(sw - inset, sh - inset);
        ctx.lineTo(sw - inset, sh - inset - cornerLen);
        ctx.stroke();

        if (caption) {
          const fontSize = Math.max(14, Math.round(inset * 0.8));
          ctx.font = '500 ' + fontSize + 'px sans-serif';
          const textMetrics = ctx.measureText(caption);
          const bgW = textMetrics.width + 24;
          const bgH = fontSize + 16;
          const bgX = (sw - bgW) / 2;
          const bgY = sh - inset - bgH - 6;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(bgX, bgY, bgW, bgH, 8);
          } else {
            ctx.rect(bgX, bgY, bgW, bgH);
          }
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(caption, sw / 2, bgY + bgH / 2);
        }
      }
    }

    // Send to Big Screen
    sendBtn.addEventListener('click', function() {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Slideshow connection offline. Reconnecting, please wait...');
        return;
      }

      sendBtn.disabled = true;
      sendBtnText.textContent = 'Sending...';
      sendSpinner.classList.remove('hidden');

      try {
        // Target export format: JPEG quality 0.7
        const dataUrl = previewCanvas.toDataURL('image/jpeg', 0.7);
        ws.send(JSON.stringify({ type: 'upload', image: dataUrl }));

        // Show toast
        toast.classList.remove('hidden');
        setTimeout(function() {
          toast.classList.add('hidden');
        }, 3000);

        closeEditor();
      } catch (err) {
        console.error('Failed to export or send image:', err);
        alert('Failed to send photo: ' + err.message);
      } finally {
        sendBtn.disabled = false;
        sendBtnText.textContent = 'Send to Big Screen';
        sendSpinner.classList.add('hidden');
      }
    });

    // Start WebSocket
    connectWS();
  </script>
</body>
</html>`;
}

export function getDisplayHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full bg-black">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Big Screen Display - Live Photo Slideshow</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body.cursor-none {
      cursor: none !important;
    }
    body.cursor-none * {
      cursor: none !important;
    }
  </style>
</head>
<body class="h-full w-full bg-[#000000] text-white overflow-hidden select-none m-0 p-0 flex items-center justify-center font-sans relative">
  <!-- Empty State Indicator -->
  <div id="empty-state" class="flex flex-col items-center justify-center text-center p-8 z-10 select-none">
    <div class="flex items-center gap-2 mb-3">
      <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
      <span class="text-xs uppercase tracking-widest text-zinc-400 font-semibold">Live Photo Slideshow</span>
    </div>
    <h1 class="text-2xl md:text-3xl font-light text-zinc-200 tracking-tight mb-2">Waiting for photos...</h1>
    <p class="text-sm md:text-base text-zinc-400 max-w-md">
      Scan QR code on home page or visit <span class="text-amber-400 font-mono font-semibold">/camera</span> on your phone to beam the first photo.
    </p>
  </div>

  <!-- Main Photo Container -->
  <div id="photo-container" class="absolute inset-0 flex items-center justify-center overflow-hidden">
    <img id="slideshow-image" src="" alt="Slideshow Photo" class="max-w-full max-h-full object-contain transition-opacity duration-700 ease-in-out select-none shadow-2xl opacity-0" />
  </div>

  <!-- Floating Bottom Controls HUD -->
  <nav id="controls-hud" class="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 bg-zinc-900/80 backdrop-blur-md border border-zinc-700/60 rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-4 text-zinc-200 transition-opacity duration-300 opacity-100">
    <button id="prev-btn" data-action="prev" title="Previous (Left Arrow)" class="hover:text-amber-400 active:scale-90 transition p-1 text-base">⏮</button>
    <button id="play-btn" data-action="play" title="Play / Pause (Space)" class="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 flex items-center justify-center font-bold text-sm shadow-md transition">⏸</button>
    <button id="next-btn" data-action="next" title="Next (Right Arrow)" class="hover:text-amber-400 active:scale-90 transition p-1 text-base">⏭</button>
    <div class="h-4 w-px bg-zinc-700"></div>
    <span id="slide-counter" class="text-xs font-mono font-medium text-zinc-300">Photo 0 / 0</span>
    <div class="h-4 w-px bg-zinc-700"></div>
    <button id="fullscreen-btn" data-action="fullscreen" title="Toggle Fullscreen (F)" class="hover:text-amber-400 active:scale-90 transition p-1 text-sm font-semibold">⛶</button>
  </nav>

  <script>
    // State
    let photos = [];
    let currentIndex = 0;
    let isPlaying = true;
    let ws = null;
    let reconnectTimer = null;
    let rotationTimer = null;
    let mouseTimer = null;
    let crossfadeTimeout = null;

    // DOM Elements
    const emptyState = document.getElementById('empty-state');
    const slideshowImage = document.getElementById('slideshow-image');
    const hud = document.getElementById('controls-hud');
    const prevBtn = document.getElementById('prev-btn');
    const playBtn = document.getElementById('play-btn');
    const nextBtn = document.getElementById('next-btn');
    const slideCounter = document.getElementById('slide-counter');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // Display image with smooth crossfade
    function showPhoto(index) {
      if (crossfadeTimeout) {
        clearTimeout(crossfadeTimeout);
        crossfadeTimeout = null;
      }

      if (!photos || photos.length === 0) {
        emptyState.classList.remove('hidden');
        slideshowImage.classList.add('opacity-0');
        slideshowImage.classList.remove('opacity-100');
        slideshowImage.src = '';
        slideCounter.textContent = 'Photo 0 / 0';
        return;
      }

      emptyState.classList.add('hidden');
      currentIndex = (index + photos.length) % photos.length;
      const targetSrc = photos[currentIndex];

      if (slideshowImage.src === targetSrc && slideshowImage.classList.contains('opacity-100')) {
        updateControlsUI();
        return;
      }

      // Smooth crossfade out, swap src, crossfade in
      slideshowImage.classList.add('opacity-0');
      slideshowImage.classList.remove('opacity-100');

      crossfadeTimeout = setTimeout(() => {
        slideshowImage.onload = function() {
          slideshowImage.classList.remove('opacity-0');
          slideshowImage.classList.add('opacity-100');
        };
        slideshowImage.src = targetSrc;
        if (slideshowImage.complete) {
          slideshowImage.classList.remove('opacity-0');
          slideshowImage.classList.add('opacity-100');
        }
      }, 150);

      updateControlsUI();
    }

    // Update counter and play/pause icon
    function updateControlsUI() {
      playBtn.textContent = isPlaying ? '⏸' : '▶';
      if (photos.length > 0) {
        slideCounter.textContent = 'Photo ' + (currentIndex + 1) + ' / ' + photos.length;
      } else {
        slideCounter.textContent = 'Photo 0 / 0';
      }
    }

    // 5000ms loop timer logic
    function resetTimer() {
      if (rotationTimer) {
        clearInterval(rotationTimer);
        rotationTimer = null;
      }
      if (isPlaying && photos.length > 0) {
        rotationTimer = setInterval(advancePhoto, 5000);
      }
    }

    function advancePhoto() {
      if (!isPlaying || photos.length === 0) return;
      sendControl('next');
    }

    // Send control message over WebSocket with local fallback
    function sendControl(action) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'control', action: action }));
      } else {
        if (action === 'play') isPlaying = true;
        if (action === 'pause') isPlaying = false;
        if (action === 'next' && photos.length > 0) showPhoto(currentIndex + 1);
        if (action === 'prev' && photos.length > 0) showPhoto(currentIndex - 1);
        updateControlsUI();
        resetTimer();
      }
    }

    // Fullscreen toggle logic
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen error:', err);
        });
      } else {
        document.exitFullscreen().catch(err => {
          console.warn('Exit fullscreen error:', err);
        });
      }
    }

    document.addEventListener('fullscreenchange', () => {
      fullscreenBtn.textContent = document.fullscreenElement ? '🗗' : '⛶';
    });

    // Auto-hiding HUD & cursor inactivity logic (3s)
    function showHUD() {
      document.body.classList.remove('cursor-none');
      hud.classList.remove('opacity-0', 'pointer-events-none');
      hud.classList.add('opacity-100');

      if (mouseTimer) clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => {
        document.body.classList.add('cursor-none');
        hud.classList.remove('opacity-100');
        hud.classList.add('opacity-0', 'pointer-events-none');
      }, 3000);
    }

    window.addEventListener('mousemove', showHUD);
    window.addEventListener('touchstart', showHUD);

    // Keyboard navigation shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        const nextAction = isPlaying ? 'pause' : 'play';
        sendControl(nextAction);
        showHUD();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        sendControl('prev');
        showHUD();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        sendControl('next');
        showHUD();
      } else if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
        showHUD();
      }
    });

    // HUD Button Click Listeners
    prevBtn.addEventListener('click', () => {
      sendControl('prev');
      showHUD();
    });

    playBtn.addEventListener('click', () => {
      const nextAction = isPlaying ? 'pause' : 'play';
      sendControl(nextAction);
      showHUD();
    });

    nextBtn.addEventListener('click', () => {
      sendControl('next');
      showHUD();
    });

    fullscreenBtn.addEventListener('click', () => {
      toggleFullscreen();
      showHUD();
    });

    // WebSocket Management & Auto-reconnect
    function connectWS() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onmessage = function(event) {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            photos = msg.photos || [];
            if (msg.state) {
              isPlaying = typeof msg.state.isPlaying === 'boolean' ? msg.state.isPlaying : true;
              currentIndex = msg.state.currentIndex || 0;
            }
            showPhoto(currentIndex);
            resetTimer();
          } else if (msg.type === 'state') {
            isPlaying = msg.isPlaying;
            currentIndex = msg.currentIndex;
            showPhoto(currentIndex);
            resetTimer();
          } else if (msg.type === 'new_photo') {
            if (msg.image) {
              photos.push(msg.image);
              if (photos.length > 50) photos.shift();
            }
            currentIndex = photos.length - 1;
            showPhoto(currentIndex);
            resetTimer();
          }
        } catch (e) {
          console.error('Error parsing WS message in display:', e);
        }
      };

      ws.onclose = function() {
        reconnectTimer = setTimeout(connectWS, 2000);
      };

      ws.onerror = function() {
        ws.close();
      };
    }

    // Initial setup
    showHUD();
    connectWS();
  </script>
</body>
</html>`;
}

export function getLocalIPAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

if (import.meta.main) {
  const server = startServer();
  const localIPs = getLocalIPAddresses();
  console.log(`\n🎉 Live Photo Slideshow Server running!`);
  console.log(`  Local:   http://localhost:${server.port}`);
  if (localIPs.length > 0) {
    for (const ip of localIPs) {
      console.log(`  Network: http://${ip}:${server.port}`);
    }
  }
  console.log(`\n📱 Open /camera on your phone or /display on your projector/TV\n`);
}
