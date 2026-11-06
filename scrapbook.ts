import { generateQRCodeSVG } from "./server";

export function getScrapbookHTML(host: string = "localhost:3000"): string {
  const cleanHost = (host || "localhost:3000").replace(/[^a-zA-Z0-9.:\[\]-]/g, "") || "localhost:3000";
  const cameraUrl = `http://${cleanHost}/camera`;
  const qrSvg = generateQRCodeSVG(cameraUrl);

  return `<!DOCTYPE html>
<html lang="en" class="h-full w-full select-none">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Scrapbook Memories - Live Polaroid Wall</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Custom font bindings */
    .font-handwriting {
      font-family: 'Caveat', cursive, sans-serif;
    }
    .font-serif-vintage {
      font-family: 'Playfair Display', Georgia, serif;
    }

    /* Textured Scrapbook Background */
    body {
      background-color: #f3ece0;
      background-image: 
        radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.45) 0%, rgba(235, 222, 204, 0.4) 65%, rgba(206, 188, 164, 0.55) 100%),
        repeating-linear-gradient(45deg, rgba(160, 130, 95, 0.015) 0px, rgba(160, 130, 95, 0.015) 2px, transparent 2px, transparent 8px);
      overflow: hidden;
      touch-action: none;
    }

    /* Paper crease effects */
    .crease-h {
      position: absolute;
      left: 0;
      right: 0;
      top: 48%;
      height: 2px;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 0%, rgba(130, 105, 75, 0.12) 100%);
      pointer-events: none;
      z-index: 2;
    }
    .crease-v {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 52%;
      width: 2px;
      background: linear-gradient(to right, rgba(255, 255, 255, 0.6) 0%, rgba(130, 105, 75, 0.12) 100%);
      pointer-events: none;
      z-index: 2;
    }

    /* Torn Kraft Washi Tape Banner */
    .kraft-tape-banner {
      background: #dfcca8;
      background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(0, 0, 0, 0.04) 100%);
      clip-path: polygon(
        0% 12%, 1.5% 0%, 98.5% 0%, 100% 10%, 99% 30%, 100% 50%, 98.8% 70%, 100% 90%, 98.5% 100%, 1.5% 100%, 0% 88%, 1.2% 70%, 0% 50%, 1% 30%
      );
      box-shadow: 0 4px 14px rgba(65, 45, 25, 0.18), inset 0 0 10px rgba(110, 80, 45, 0.15);
      border-top: 1px solid rgba(255, 255, 255, 0.4);
      border-bottom: 1px solid rgba(100, 70, 35, 0.18);
    }

    /* Polaroid Card Base */
    .polaroid-card {
      position: absolute;
      width: 260px;
      padding: 13px 13px 46px 13px;
      background: #fefdfa;
      border-radius: 2px;
      box-shadow: 
        0 18px 38px -8px rgba(45, 30, 18, 0.32),
        0 6px 14px -3px rgba(45, 30, 18, 0.16),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      cursor: grab;
      user-select: none;
      will-change: transform, box-shadow;
      transition: box-shadow 0.25s ease, filter 0.25s ease;
      touch-action: none;
    }

    @media (max-width: 768px) {
      .polaroid-card {
        width: 195px;
        padding: 10px 10px 36px 10px;
      }
    }

    .polaroid-card:active {
      cursor: grabbing;
    }

    .polaroid-card.is-dragging {
      box-shadow: 
        0 30px 60px -10px rgba(45, 30, 18, 0.45),
        0 12px 24px -5px rgba(45, 30, 18, 0.25),
        0 0 0 1px rgba(0, 0, 0, 0.06);
      filter: brightness(1.02);
    }

    /* Inner Photo Frame */
    .polaroid-photo-frame {
      width: 100%;
      aspect-ratio: 1 / 1;
      background-color: #262320;
      overflow: hidden;
      position: relative;
      border: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.3);
    }

    .polaroid-photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    /* Polaroid Chin (Caption Area) */
    .polaroid-chin {
      position: absolute;
      bottom: 8px;
      left: 14px;
      right: 14px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      overflow: hidden;
    }

    @media (max-width: 768px) {
      .polaroid-chin {
        bottom: 5px;
        height: 26px;
      }
    }

    .polaroid-caption {
      font-family: 'Caveat', cursive, sans-serif;
      font-size: 19px;
      color: #3b2c20;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      line-height: 1.1;
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .polaroid-caption {
        font-size: 15px;
      }
    }

    /* Washi / Scotch Tape Styles */
    .washi-tape-strip {
      position: absolute;
      background: rgba(255, 252, 240, 0.72);
      backdrop-filter: blur(1.5px);
      box-shadow: 0 2px 5px rgba(60, 40, 20, 0.12), inset 0 0 3px rgba(255, 255, 255, 0.6);
      z-index: 10;
      pointer-events: none;
    }

    /* Centered top tape */
    .tape-top {
      top: -14px;
      left: 50%;
      transform: translateX(-50%) rotate(-1deg);
      width: 86px;
      height: 26px;
      clip-path: polygon(0% 12%, 4% 0%, 96% 0%, 100% 15%, 97% 45%, 100% 75%, 96% 100%, 3% 100%, 0% 85%, 3% 50%);
    }

    /* Corner left tape */
    .tape-corner-left {
      top: -10px;
      left: -18px;
      transform: rotate(-38deg);
      width: 78px;
      height: 24px;
      clip-path: polygon(0% 10%, 4% 0%, 96% 0%, 100% 18%, 97% 50%, 100% 82%, 96% 100%, 4% 100%, 0% 80%, 3% 45%);
    }

    /* Corner right tape */
    .tape-corner-right {
      top: -10px;
      right: -18px;
      transform: rotate(38deg);
      width: 78px;
      height: 24px;
      clip-path: polygon(0% 10%, 4% 0%, 96% 0%, 100% 18%, 97% 50%, 100% 82%, 96% 100%, 4% 100%, 0% 80%, 3% 45%);
    }

    /* Floating Toolbar HUD */
    .hud-pill {
      background: rgba(248, 244, 236, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(180, 155, 125, 0.45);
      box-shadow: 0 14px 35px -5px rgba(50, 35, 20, 0.22), 0 4px 10px rgba(0, 0, 0, 0.05);
    }
  </style>
</head>
<body class="h-full w-full relative overflow-hidden font-sans text-stone-800">

  <!-- Background Crease Lines -->
  <div class="crease-h"></div>
  <div class="crease-v"></div>

  <!-- Faint Antique Italian Calligraphy Watermark -->
  <div class="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-[0.14] z-0">
    <div class="font-handwriting text-stone-800 text-3xl sm:text-4xl leading-relaxed tracking-wide italic p-12 max-w-4xl">
      di un terzo circa quanto è il diametro di Mantova...<br>
      circa quanto è il diametro...<br>
      d'un terzo circa quanto è il diametro...<br>
      e la bella memoria si conserva nel tempo...
    </div>
  </div>

  <!-- Faint Antique Map Ephemera (Bottom-Left) -->
  <div class="absolute bottom-6 left-6 pointer-events-none select-none opacity-[0.20] z-0">
    <svg width="280" height="200" viewBox="0 0 280 200" fill="none" stroke="#684e36" stroke-width="0.8">
      <!-- Latitude / Longitude grid lines -->
      <line x1="10" y1="20" x2="260" y2="20" stroke-dasharray="4 3" />
      <line x1="10" y1="70" x2="260" y2="70" />
      <line x1="10" y1="120" x2="260" y2="120" stroke-dasharray="4 3" />
      <line x1="10" y1="170" x2="260" y2="170" />
      <line x1="40" y1="10" x2="40" y2="190" stroke-dasharray="3 3" />
      <line x1="110" y1="10" x2="110" y2="190" />
      <line x1="190" y1="10" x2="190" y2="190" stroke-dasharray="3 3" />
      <!-- Text label -->
      <text x="35" y="145" font-family="'Playfair Display', serif" font-size="12" fill="#684e36" font-style="italic">AUSTRALIA</text>
      <text x="35" y="185" font-family="'Playfair Display', serif" font-size="8" fill="#684e36">Published by GEO. F. CRAM, Co.</text>
      <!-- Small compass star -->
      <circle cx="210" cy="50" r="16" stroke="#684e36" fill="none" />
      <polygon points="210,36 213,48 225,50 213,52 210,64 207,52 195,50 207,48" fill="#684e36" opacity="0.6"/>
    </svg>
  </div>

  <!-- BOTANICAL DECORATION: Top-Left Rose Leaves & Gold Ribbon Bow -->
  <div class="absolute top-2 left-3 pointer-events-none select-none z-10 w-32 sm:w-44 drop-shadow-md">
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Rose Stem -->
      <path d="M15 15 C 40 45, 60 70, 75 110" stroke="#485c36" stroke-width="2.5" stroke-linecap="round" />
      <path d="M40 45 C 55 35, 75 40, 85 30" stroke="#485c36" stroke-width="2" />
      <path d="M58 72 C 78 70, 95 85, 110 80" stroke="#485c36" stroke-width="2" />
      <!-- Green Leaves -->
      <path d="M15 15 C 25 5, 45 10, 48 24 C 38 28, 22 25, 15 15 Z" fill="#4d6f3b" />
      <path d="M48 24 C 55 12, 72 16, 75 28 C 65 34, 52 32, 48 24 Z" fill="#5b8045" />
      <path d="M85 30 C 98 22, 114 28, 115 42 C 102 46, 90 40, 85 30 Z" fill="#456633" />
      <path d="M58 72 C 68 58, 86 62, 88 74 C 76 80, 64 78, 58 72 Z" fill="#5b8045" />
      <path d="M110 80 C 122 72, 138 80, 136 94 C 124 98, 112 92, 110 80 Z" fill="#4d6f3b" />
      <!-- Golden Silk Ribbon Bow -->
      <g transform="translate(18, 18)">
        <!-- Shadow -->
        <path d="M22 24 C 10 15, -2 30, 14 38 Z" fill="rgba(60, 40, 10, 0.25)" />
        <path d="M26 24 C 38 15, 50 30, 34 38 Z" fill="rgba(60, 40, 10, 0.25)" />
        <!-- Left Loop -->
        <path d="M24 22 C 10 12, -4 28, 15 36 C 22 34, 23 26, 24 22 Z" fill="#e5c158" stroke="#b38a22" stroke-width="0.8" />
        <path d="M20 23 C 12 17, 3 27, 14 32" stroke="#fff3b0" stroke-width="1.2" fill="none" opacity="0.8" />
        <!-- Right Loop -->
        <path d="M26 22 C 40 12, 54 28, 35 36 C 28 34, 27 26, 26 22 Z" fill="#d9b148" stroke="#b38a22" stroke-width="0.8" />
        <path d="M30 23 C 38 17, 47 27, 36 32" stroke="#fff3b0" stroke-width="1.2" fill="none" opacity="0.8" />
        <!-- Bow Center Knot -->
        <ellipse cx="25" cy="24" rx="5" ry="4.5" fill="#f5d671" stroke="#9e7717" stroke-width="1" />
        <!-- Ribbon Tails -->
        <path d="M22 26 C 18 38, 12 50, 8 60 C 14 56, 18 58, 22 54 C 23 44, 24 35, 23 26 Z" fill="#e0bb50" stroke="#b38a22" stroke-width="0.7" />
        <path d="M27 26 C 30 38, 35 50, 40 58 C 34 55, 30 56, 27 52 C 26 43, 26 34, 27 26 Z" fill="#cfa439" stroke="#b38a22" stroke-width="0.7" />
      </g>
    </svg>
  </div>

  <!-- BOTANICAL DECORATION: Top-Right Pressed Daisy Blossom -->
  <div class="absolute top-3 right-6 pointer-events-none select-none z-10 w-24 sm:w-32 drop-shadow-md">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Daisy Petals radiating outwards -->
      <g transform="translate(50, 50)" fill="#f7f3e1" stroke="#ddd3b6" stroke-width="0.6">
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(25)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(50)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(75)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(100)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(125)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(150)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(175)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(200)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(225)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(250)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(275)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(300)" />
        <path d="M-6 -42 C -4 -44, 4 -44, 6 -42 C 7 -25, 4 -12, 0 -8 C -4 -12, -7 -25, -6 -42 Z" transform="rotate(325)" />
      </g>
      <!-- Center Textured Seed Disk -->
      <circle cx="50" cy="50" r="14" fill="#df9e28" stroke="#a66e13" stroke-width="1.5" />
      <circle cx="50" cy="50" r="10" fill="#c78619" />
      <!-- Texture dots -->
      <circle cx="47" cy="48" r="1.5" fill="#fce49f" />
      <circle cx="53" cy="46" r="1.3" fill="#8f5b08" />
      <circle cx="51" cy="53" r="1.4" fill="#fce49f" />
      <circle cx="45" cy="52" r="1.2" fill="#8f5b08" />
    </svg>
  </div>

  <!-- BOTANICAL DECORATION: Bottom-Left Pressed Daisy -->
  <div class="absolute bottom-6 left-12 pointer-events-none select-none z-10 w-20 sm:w-28 drop-shadow-md">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(50, 50)" fill="#f6f2de" stroke="#dacfb0" stroke-width="0.6">
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(30)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(60)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(90)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(120)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(150)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(180)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(210)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(240)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(270)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(300)" />
        <path d="M-5 -38 C -3 -40, 3 -40, 5 -38 C 6 -22, 3 -10, 0 -6 C -3 -10, -6 -22, -5 -38 Z" transform="rotate(330)" />
      </g>
      <circle cx="50" cy="50" r="12" fill="#e2a62d" stroke="#a66e13" stroke-width="1.5" />
      <circle cx="50" cy="50" r="8" fill="#c78619" />
    </svg>
  </div>

  <!-- BOTANICAL DECORATION: Bottom-Right Dried Pink Wildflower Branch -->
  <div class="absolute bottom-3 right-3 pointer-events-none select-none z-10 w-28 sm:w-40 drop-shadow-md">
    <svg viewBox="0 0 140 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Main stem -->
      <path d="M120 170 C 105 130, 90 90, 75 40" stroke="#5a422d" stroke-width="2.5" stroke-linecap="round" />
      <path d="M100 120 C 70 110, 45 100, 30 85" stroke="#5a422d" stroke-width="1.8" />
      <path d="M85 75 C 60 65, 45 50, 40 35" stroke="#5a422d" stroke-width="1.5" />
      <path d="M78 50 C 90 40, 105 32, 115 25" stroke="#5a422d" stroke-width="1.5" />
      <!-- Dried Leaves -->
      <path d="M96 115 C 85 105, 82 95, 88 92 C 95 95, 98 105, 96 115 Z" fill="#695b3d" />
      <path d="M60 102 C 50 94, 52 86, 58 84 C 64 88, 65 96, 60 102 Z" fill="#5c4e33" />
      <!-- Small Dried Pink/Burgundy Blossoms -->
      <g fill="#9e3b52" stroke="#662132" stroke-width="0.8">
        <!-- Top blossom cluster -->
        <circle cx="75" cy="38" r="4.5" />
        <circle cx="70" cy="34" r="3.5" />
        <circle cx="79" cy="32" r="3.5" />
        <circle cx="74" cy="28" r="3" fill="#b84b65" />
        <!-- Right branch blossom cluster -->
        <circle cx="115" cy="25" r="4" />
        <circle cx="120" cy="22" r="3.2" fill="#b84b65" />
        <circle cx="110" cy="20" r="3" />
        <!-- Mid-left branch cluster -->
        <circle cx="30" cy="85" r="4" />
        <circle cx="25" cy="82" r="3.5" fill="#b84b65" />
        <circle cx="32" cy="78" r="3.2" />
        <circle cx="38" cy="82" r="3" />
        <!-- Upper-left branch cluster -->
        <circle cx="40" cy="35" r="4" fill="#b84b65" />
        <circle cx="45" cy="31" r="3" />
      </g>
    </svg>
  </div>

  <!-- TOP CENTER: Torn Kraft Paper Washi Tape Date Banner -->
  <header class="absolute top-4 inset-x-0 mx-auto w-fit z-30 flex items-center justify-center">
    <div id="date-banner" class="kraft-tape-banner px-8 sm:px-12 py-2 sm:py-2.5 cursor-pointer active:scale-98 transition group flex items-center gap-3">
      <span id="date-display-text" class="font-handwriting text-stone-900 text-xl sm:text-2xl font-bold tracking-wide">
        Thursday, 30 December 2026
      </span>
      <span class="text-stone-700/60 text-xs font-handwriting opacity-0 group-hover:opacity-100 transition hidden sm:inline">
        (click to toggle date)
      </span>
    </div>
  </header>

  <!-- EMPTY STATE NOTE: When no photos are present -->
  <div id="empty-state-card" class="absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-opacity duration-500 opacity-100">
    <div class="polaroid-card pointer-events-auto p-6 max-w-sm w-full mx-4 text-center transform rotate-[-2deg] shadow-2xl">
      <div class="washi-tape-strip tape-top"></div>
      <div class="h-10 w-10 mx-auto mb-2 text-amber-700 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>
      <h3 class="font-serif-vintage text-xl font-bold text-stone-900 mb-1">Scrapbook Table Ready</h3>
      <p class="font-handwriting text-lg text-stone-700 mb-4 leading-snug">
        Toss photos onto the table! Upload from phone or tap below to throw sample memories.
      </p>
      
      <div class="flex flex-col gap-2.5">
        <button id="empty-throw-btn" class="w-full py-2 px-4 rounded bg-stone-900 text-amber-100 font-sans text-xs font-semibold uppercase tracking-wider hover:bg-stone-800 active:scale-95 transition shadow">
          📸 Throw Sample Photo
        </button>
        <button id="empty-qr-btn" class="w-full py-1.5 px-3 rounded border border-stone-300 text-stone-700 font-sans text-xs hover:bg-stone-100 transition">
          📱 Scan Phone QR Code
        </button>
      </div>
    </div>
  </div>

  <!-- MAIN PHOTO DESK CANVAS: Container where Polaroids are dynamically tossed -->
  <main id="scrapbook-desk" class="absolute inset-0 w-full h-full overflow-hidden">
    <!-- Dynamically thrown polaroid cards will be injected here -->
  </main>

  <!-- BOTTOM FLOATING HUD CONTROLS -->
  <nav id="hud-nav" class="fixed bottom-5 inset-x-0 mx-auto w-fit z-50 hud-pill rounded-full px-4 sm:px-6 py-2 shadow-2xl flex items-center gap-2 sm:gap-3 text-stone-800 transition-all duration-300">
    <button id="btn-throw-sample" title="Toss a new photo onto the board" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-900 transition">
      <span>📸</span>
      <span class="hidden sm:inline font-sans">Throw Photo</span>
    </button>

    <div class="h-4 w-px bg-stone-300"></div>

    <button id="btn-rescatter" title="Re-throw and re-scatter all photos organically" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-900 transition">
      <span>🔀</span>
      <span class="hidden sm:inline font-sans">Re-scatter</span>
    </button>

    <div class="h-4 w-px bg-stone-300"></div>

    <button id="btn-clear" title="Clear board" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Clear Wall">
      <span>🧹</span>
    </button>

    <button id="btn-sound" title="Toggle Sound (Whoosh &amp; Snap)" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Toggle Sound">
      <span id="sound-icon">🔊</span>
    </button>

    <div class="h-4 w-px bg-stone-300"></div>

    <span id="counter-badge" class="font-handwriting text-lg font-bold text-stone-800 px-1 min-w-[50px] text-center">
      0 photos
    </span>

    <div class="h-4 w-px bg-stone-300"></div>

    <button id="btn-qr" title="Show Phone Upload QR Code" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Phone QR">
      <span>📱</span>
    </button>

    <a href="/display" title="Switch to Big Screen Slideshow" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Slideshow">
      <span>🖥</span>
    </a>

    <a href="/" title="Back to Home" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Home">
      <span>🏠</span>
    </a>

    <button id="btn-fullscreen" title="Toggle Fullscreen" class="px-2 py-1.5 rounded-full hover:bg-amber-100/70 active:scale-95 text-xs font-medium text-stone-700 transition" aria-label="Toggle Fullscreen">
      <span>⛶</span>
    </button>
  </nav>

  <!-- MODAL: QR Code & Camera Upload Link -->
  <div id="qr-modal" class="fixed inset-0 bg-stone-950/60 backdrop-blur-sm z-50 hidden items-center justify-center p-4">
    <div class="polaroid-card p-6 max-w-xs w-full text-center relative rotate-0 shadow-2xl">
      <button id="qr-close-btn" class="absolute top-3 right-3 text-stone-500 hover:text-stone-900 font-bold text-base p-1">&times;</button>
      <h3 class="font-serif-vintage text-lg font-bold text-stone-900 mb-1">Beam Photos from Phone</h3>
      <p class="font-handwriting text-base text-stone-600 mb-3">Snap pictures on your phone to toss them live onto this scrapbook!</p>
      <div class="p-3 bg-white rounded-xl shadow-inner border border-stone-200 aspect-square flex items-center justify-center mb-3">
        ${qrSvg}
      </div>
      <a href="${cameraUrl}" target="_blank" class="block w-full py-2 px-3 rounded bg-amber-600 hover:bg-amber-700 text-white font-sans text-xs font-semibold uppercase tracking-wider transition">
        Open /camera in Tab
      </a>
      <p class="text-[11px] text-stone-500 font-mono mt-2 break-all">${cameraUrl}</p>
    </div>
  </div>

  <!-- MODAL: Polaroid Zoom / Inspection Lightbox -->
  <div id="zoom-modal" class="fixed inset-0 bg-stone-950/75 backdrop-blur-md z-50 hidden items-center justify-center p-4">
    <div class="relative max-w-lg w-full flex flex-col items-center">
      <button id="zoom-close-btn" class="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl font-bold p-2">&times;</button>
      <div id="zoom-card" class="polaroid-card relative rotate-0 max-w-md w-full shadow-2xl p-4 sm:p-5">
        <div class="washi-tape-strip tape-top"></div>
        <div class="polaroid-photo-frame" style="aspect-ratio: auto; max-height: 65vh;">
          <img id="zoom-image" src="" alt="Enlarged Memory" class="w-full h-auto max-h-[65vh] object-contain" />
        </div>
        <div class="mt-4 text-center">
          <p id="zoom-caption" class="font-handwriting text-2xl text-stone-800 font-bold"></p>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      // Audio Synthesizer for realistic throw physics
      let soundEnabled = true;
      let audioCtx = null;

      function getAudioContext() {
        if (!audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
          }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        return audioCtx;
      }

      function playTossSound() {
        if (!soundEnabled) return;
        try {
          const ctx = getAudioContext();
          if (!ctx) return;

          // 1. Air whoosh swoop during flight
          const bufferSize = Math.floor(ctx.sampleRate * 0.22);
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
          }
          const noise = ctx.createBufferSource();
          noise.buffer = buffer;

          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(800, ctx.currentTime);
          filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.2);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          noise.start();

          // 2. Soft resonant landing slap
          setTimeout(() => {
            try {
              const osc = ctx.createOscillator();
              const tapGain = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(130, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.08);

              tapGain.gain.setValueAtTime(0.22, ctx.currentTime);
              tapGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

              osc.connect(tapGain);
              tapGain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.08);
            } catch(e) {}
          }, 480);
        } catch (e) {
          // Audio blocked until user interaction
        }
      }

      // Sample Photos matching reference image (high-res with offline fallback)
      const SAMPLE_MEMORIES = [
        {
          url: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80",
          caption: "Quiet street stroll"
        },
        {
          url: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
          caption: "Reading & morning tea"
        },
        {
          url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80",
          caption: "Morning coffee light"
        },
        {
          url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
          caption: "Sunset by the sea"
        },
        {
          url: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
          caption: "Golden hour macrame"
        },
        {
          url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
          caption: "Afternoon at the pier"
        },
        {
          url: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80",
          caption: "Bicycles outside cafe"
        }
      ];

      // State
      let sampleIndex = 0;
      let highestZ = 30;
      const placedCards = []; // { id, x, y, width, height, rotation, zIndex, el, src, caption }
      let allPhotoSources = [];

      // DOM Elements
      const desk = document.getElementById("scrapbook-desk");
      const emptyState = document.getElementById("empty-state-card");
      const counterBadge = document.getElementById("counter-badge");
      const btnThrow = document.getElementById("btn-throw-sample");
      const btnRescatter = document.getElementById("btn-rescatter");
      const btnClear = document.getElementById("btn-clear");
      const btnSound = document.getElementById("btn-sound");
      const soundIcon = document.getElementById("sound-icon");
      const btnFullscreen = document.getElementById("btn-fullscreen");
      const btnQr = document.getElementById("btn-qr");
      const qrModal = document.getElementById("qr-modal");
      const qrCloseBtn = document.getElementById("qr-close-btn");
      const emptyThrowBtn = document.getElementById("empty-throw-btn");
      const emptyQrBtn = document.getElementById("empty-qr-btn");
      const zoomModal = document.getElementById("zoom-modal");
      const zoomImage = document.getElementById("zoom-image");
      const zoomCaption = document.getElementById("zoom-caption");
      const zoomCloseBtn = document.getElementById("zoom-close-btn");
      const dateBanner = document.getElementById("date-banner");
      const dateDisplayText = document.getElementById("date-display-text");

      // Date Banner Toggling
      const datePresets = [
        "Thursday, 30 December 2026",
        new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        "Our Memory Scrapbook"
      ];
      let datePresetIndex = 0;
      if (dateBanner && dateDisplayText) {
        dateBanner.addEventListener("click", () => {
          datePresetIndex = (datePresetIndex + 1) % datePresets.length;
          dateDisplayText.textContent = datePresets[datePresetIndex];
        });
      }

      function updateCounter() {
        const count = placedCards.length;
        if (counterBadge) {
          counterBadge.textContent = count === 1 ? "1 photo" : count + " photos";
        }
        if (emptyState) {
          if (count > 0) {
            emptyState.classList.add("opacity-0", "pointer-events-none");
            emptyState.classList.remove("opacity-100");
          } else {
            emptyState.classList.remove("opacity-0", "pointer-events-none");
            emptyState.classList.add("opacity-100");
          }
        }
      }

      // =========================================================================
      // NON-COVERING PLACEMENT ALGORITHM
      // Rule: Every new photo is thrown on top (higher zIndex), BUT it must NOT
      // cover all/majority of any existing picture!
      // =========================================================================
      function findNonCoveringPosition(cardWidth, cardHeight) {
        const deskRect = desk.getBoundingClientRect();
        const deskW = deskRect.width || window.innerWidth;
        const deskH = deskRect.height || window.innerHeight;

        const padX = deskW > 640 ? 44 : 20;
        const minX = padX;
        const maxX = Math.max(minX + 10, deskW - cardWidth - padX);

        // Keep away from top tape banner and bottom HUD
        const minY = 90;
        const maxY = Math.max(minY + 10, deskH - cardHeight - 65);

        // If no existing photos, place near center with natural organic jitter
        if (placedCards.length === 0) {
          return {
            x: minX + (maxX - minX) * 0.4 + (Math.random() - 0.5) * 60,
            y: minY + (maxY - minY) * 0.35 + (Math.random() - 0.5) * 60,
            rotation: (Math.random() * 12) - 6
          };
        }

        // HARD CONSTRAINT: Maximum allowed coverage of ANY existing photo
        // 0.38 ensures that at least 62% of every existing photo remains completely uncovered!
        const MAX_SINGLE_COVERAGE = 0.38;

        const candidatePool = [];

        // 1. Grid of candidates across visible canvas
        const cols = Math.max(4, Math.floor((maxX - minX) / (cardWidth * 0.55)));
        const rows = Math.max(3, Math.floor((maxY - minY) / (cardHeight * 0.55)));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const gx = minX + (c / (cols - 1 || 1)) * (maxX - minX) + (Math.random() - 0.5) * 40;
            const gy = minY + (r / (rows - 1 || 1)) * (maxY - minY) + (Math.random() - 0.5) * 40;
            candidatePool.push({
              x: Math.max(minX, Math.min(maxX, gx)),
              y: Math.max(minY, Math.min(maxY, gy))
            });
          }
        }

        // 2. Uniform random samples
        for (let i = 0; i < 90; i++) {
          candidatePool.push({
            x: minX + Math.random() * (maxX - minX),
            y: minY + Math.random() * (maxY - minY)
          });
        }

        // 3. Scrapbook clustering offsets around existing photos
        for (const ex of placedCards) {
          const offsets = [
            { dx: cardWidth * 0.72, dy: (Math.random() - 0.5) * cardHeight * 0.6 },
            { dx: -cardWidth * 0.72, dy: (Math.random() - 0.5) * cardHeight * 0.6 },
            { dx: (Math.random() - 0.5) * cardWidth * 0.6, dy: cardHeight * 0.72 },
            { dx: (Math.random() - 0.5) * cardWidth * 0.6, dy: -cardHeight * 0.72 },
            { dx: cardWidth * 0.62, dy: cardHeight * 0.62 },
            { dx: -cardWidth * 0.62, dy: cardHeight * 0.62 },
            { dx: cardWidth * 0.62, dy: -cardHeight * 0.62 },
            { dx: -cardWidth * 0.62, dy: -cardHeight * 0.62 },
          ];
          for (const off of offsets) {
            const cx = ex.x + off.dx;
            const cy = ex.y + off.dy;
            if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
              candidatePool.push({ x: cx, y: cy });
            }
          }
        }

        const validCandidates = [];
        let bestFallback = null;
        let minMaxCoverage = Infinity;

        for (const cand of candidatePool) {
          let maxCoverage = 0;
          let totalOverlapArea = 0;
          let gentleOverlapCount = 0;
          let coversCenter = false;

          for (const ex of placedCards) {
            const x1 = Math.max(cand.x, ex.x);
            const x2 = Math.min(cand.x + cardWidth, ex.x + ex.width);
            const y1 = Math.max(cand.y, ex.y);
            const y2 = Math.min(cand.y + cardHeight, ex.y + ex.height);

            if (x2 > x1 && y2 > y1) {
              const overlapArea = (x2 - x1) * (y2 - y1);
              const coverage = overlapArea / (ex.width * ex.height);
              if (coverage > maxCoverage) {
                maxCoverage = coverage;
              }
              totalOverlapArea += overlapArea;

              // Aesthetic sweet-spot: 6% to 26% subtle scrapbook overlap
              if (coverage >= 0.06 && coverage <= 0.26) {
                gentleOverlapCount++;
              }

              // Check if candidate covers the center point of existing photo
              const exCenterX = ex.x + ex.width / 2;
              const exCenterY = ex.y + ex.height / 2;
              if (exCenterX >= cand.x && exCenterX <= cand.x + cardWidth &&
                  exCenterY >= cand.y && exCenterY <= cand.y + cardHeight) {
                coversCenter = true;
              }
            }
          }

          if (maxCoverage < minMaxCoverage) {
            minMaxCoverage = maxCoverage;
            bestFallback = cand;
          }

          if (maxCoverage <= MAX_SINGLE_COVERAGE) {
            let score = 100;
            // Reward cozy scrapbook overlap
            score += gentleOverlapCount * 40;
            if (coversCenter) score -= 35;
            score -= (totalOverlapArea / (cardWidth * cardHeight)) * 60;
            // Keep in balanced frame
            const edgeDist = Math.min(cand.x - minX, maxX - cand.x, cand.y - minY, maxY - cand.y);
            score += Math.min(25, edgeDist * 0.15);

            validCandidates.push({ ...cand, score, maxCoverage });
          }
        }

        let chosen;
        if (validCandidates.length > 0) {
          validCandidates.sort((a, b) => b.score - a.score);
          const topCount = Math.min(3, validCandidates.length);
          chosen = validCandidates[Math.floor(Math.random() * topCount)];
        } else {
          // If board is very crowded, choose candidate with lowest max coverage
          chosen = bestFallback || candidatePool[0];
        }

        return {
          x: chosen.x,
          y: chosen.y,
          rotation: (Math.random() * 14) - 7 // Slight tilt: -7° to +7°
        };
      }

      // =========================================================================
      // THROW PHOTO INTO SCREEN ANIMATION
      // =========================================================================
      function throwPhotoIntoScreen(imgSrc, captionText) {
        if (!imgSrc) return;

        // Card size (responsive)
        const isMobile = window.innerWidth <= 768;
        const cardWidth = isMobile ? 195 : 260;
        const cardHeight = isMobile ? 245 : 325;

        // Calculate non-covering target
        const target = findNonCoveringPosition(cardWidth, cardHeight);
        const zIndex = ++highestZ;

        // Random tape style: top, corner-left, or corner-right
        const tapeStyles = ["tape-top", "tape-corner-left", "tape-corner-right"];
        const selectedTape = tapeStyles[Math.floor(Math.random() * tapeStyles.length)];

        // Create Card Element
        const card = document.createElement("div");
        card.className = "polaroid-card";
        card.style.zIndex = zIndex;
        card.style.width = cardWidth + "px";

        // Tape
        const tape = document.createElement("div");
        tape.className = "washi-tape-strip " + selectedTape;
        card.appendChild(tape);

        // Photo Frame & Img
        const frame = document.createElement("div");
        frame.className = "polaroid-photo-frame";
        const img = document.createElement("img");
        img.src = imgSrc;
        img.alt = captionText || "Memory";
        frame.appendChild(img);
        card.appendChild(frame);

        // Chin / Caption
        const chin = document.createElement("div");
        chin.className = "polaroid-chin";
        const cap = document.createElement("span");
        cap.className = "polaroid-caption";
        cap.textContent = captionText || ("#" + (placedCards.length + 1));
        chin.appendChild(cap);
        card.appendChild(chin);

        // Setup Card Data Tracker
        const cardData = {
          id: "card-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
          x: target.x,
          y: target.y,
          width: cardWidth,
          height: cardHeight,
          rotation: target.rotation,
          zIndex: zIndex,
          el: card,
          src: imgSrc,
          caption: captionText || ""
        };
        placedCards.push(cardData);
        updateCounter();

        // ---------------------------------------------------------------------
        // THROW PHYSICS TRAJECTORY SETUP
        // ---------------------------------------------------------------------
        const deskRect = desk.getBoundingClientRect();
        const deskW = deskRect.width || window.innerWidth;
        const deskH = deskRect.height || window.innerHeight;

        // Originates off-screen from random direction
        const directions = ["top", "bottom", "left", "right"];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        let startX = target.x;
        let startY = target.y;

        if (dir === "top") {
          startY = -cardHeight - 120;
          startX = target.x + (Math.random() - 0.5) * 300;
        } else if (dir === "bottom") {
          startY = deskH + 120;
          startX = target.x + (Math.random() - 0.5) * 300;
        } else if (dir === "left") {
          startX = -cardWidth - 120;
          startY = target.y + (Math.random() - 0.5) * 200;
        } else {
          startX = deskW + 120;
          startY = target.y + (Math.random() - 0.5) * 200;
        }

        const startRot = target.rotation + (Math.random() > 0.5 ? 42 : -42) + (Math.random() * 20 - 10);

        // Set initial transform (offscreen, enlarged, heavy shadow)
        card.style.transform = "translate3d(" + startX + "px, " + startY + "px, 0) scale(1.65) rotate(" + startRot + "deg)";
        card.style.opacity = "0.2";
        card.style.boxShadow = "0 45px 80px rgba(35, 20, 10, 0.45)";
        card.style.transition = "transform 0.65s cubic-bezier(0.18, 0.89, 0.32, 1.15), box-shadow 0.65s ease-out, opacity 0.35s ease-out";

        desk.appendChild(card);
        playTossSound();

        // Trigger throw animation in next browser tick
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.style.opacity = "1";
            card.style.transform = "translate3d(" + target.x + "px, " + target.y + "px, 0) scale(1) rotate(" + target.rotation + "deg)";
            card.style.boxShadow = "0 18px 38px -8px rgba(45, 30, 18, 0.32), 0 6px 14px -3px rgba(45, 30, 18, 0.16)";
          });
        });

        // Setup Drag & Click Handlers
        attachCardInteractions(card, cardData);
      }

      // =========================================================================
      // DRAG & DROP AND CLICK TO INSPECT
      // =========================================================================
      function attachCardInteractions(card, cardData) {
        let isPointerDown = false;
        let startPointerX = 0;
        let startPointerY = 0;
        let initialCardX = 0;
        let initialCardY = 0;
        let hasMoved = false;

        card.addEventListener("pointerdown", (e) => {
          // Ignore right clicks
          if (e.button !== 0) return;
          isPointerDown = true;
          hasMoved = false;
          startPointerX = e.clientX;
          startPointerY = e.clientY;
          initialCardX = cardData.x;
          initialCardY = cardData.y;

          // Lift card to highest zIndex
          cardData.zIndex = ++highestZ;
          card.style.zIndex = cardData.zIndex;
          card.classList.add("is-dragging");
          card.setPointerCapture(e.pointerId);

          // Lift scale & shadow
          card.style.transition = "box-shadow 0.15s ease, filter 0.15s ease";
          card.style.transform = "translate3d(" + cardData.x + "px, " + cardData.y + "px, 0) scale(1.05) rotate(" + cardData.rotation + "deg)";
        });

        card.addEventListener("pointermove", (e) => {
          if (!isPointerDown) return;
          const dx = e.clientX - startPointerX;
          const dy = e.clientY - startPointerY;

          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            hasMoved = true;
          }

          cardData.x = initialCardX + dx;
          cardData.y = initialCardY + dy;
          card.style.transform = "translate3d(" + cardData.x + "px, " + cardData.y + "px, 0) scale(1.05) rotate(" + cardData.rotation + "deg)";
        });

        const handlePointerUp = (e) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          card.classList.remove("is-dragging");
          try {
            card.releasePointerCapture(e.pointerId);
          } catch(err) {}

          card.style.transition = "transform 0.25s ease-out, box-shadow 0.25s ease-out";
          card.style.transform = "translate3d(" + cardData.x + "px, " + cardData.y + "px, 0) scale(1) rotate(" + cardData.rotation + "deg)";

          // If was a click (not dragged), bring to front or open lightbox on double click
          if (!hasMoved) {
            // Quick focus: gentle tilt punch
            playTossSound();
          }
        };

        card.addEventListener("pointerup", handlePointerUp);
        card.addEventListener("pointercancel", handlePointerUp);

        // Double click to inspect in zoom lightbox
        card.addEventListener("dblclick", () => {
          openZoomModal(cardData.src, cardData.caption);
        });
      }

      function openZoomModal(src, caption) {
        if (!zoomModal || !zoomImage) return;
        zoomImage.src = src;
        if (zoomCaption) zoomCaption.textContent = caption || "";
        zoomModal.classList.remove("hidden");
        zoomModal.classList.add("flex");
      }

      function closeZoomModal() {
        if (!zoomModal) return;
        zoomModal.classList.add("hidden");
        zoomModal.classList.remove("flex");
      }

      if (zoomCloseBtn) zoomCloseBtn.addEventListener("click", closeZoomModal);
      if (zoomModal) {
        zoomModal.addEventListener("click", (e) => {
          if (e.target === zoomModal) closeZoomModal();
        });
      }

      // =========================================================================
      // RE-SCATTER / SHUFFLE ALL PHOTOS ORGANICALLY
      // =========================================================================
      function rescatterAll() {
        if (placedCards.length === 0) return;

        // Clear placed coordinates so they can recalculate fresh non-covering spots
        const currentCards = [...placedCards];
        placedCards.length = 0;

        currentCards.forEach((cardData, idx) => {
          const target = findNonCoveringPosition(cardData.width, cardData.height);
          cardData.x = target.x;
          cardData.y = target.y;
          cardData.rotation = target.rotation;
          cardData.zIndex = ++highestZ;
          cardData.el.style.zIndex = cardData.zIndex;

          placedCards.push(cardData);

          setTimeout(() => {
            cardData.el.style.transition = "transform 0.6s cubic-bezier(0.18, 0.89, 0.32, 1.15)";
            cardData.el.style.transform = "translate3d(" + target.x + "px, " + target.y + "px, 0) scale(1) rotate(" + target.rotation + "deg)";
            playTossSound();
          }, idx * 120);
        });
      }

      // =========================================================================
      // CONTROLS & EVENT LISTENERS
      // =========================================================================
      function throwNextSample() {
        const sample = SAMPLE_MEMORIES[sampleIndex % SAMPLE_MEMORIES.length];
        sampleIndex++;
        throwPhotoIntoScreen(sample.url, sample.caption);
      }

      if (btnThrow) btnThrow.addEventListener("click", throwNextSample);
      if (emptyThrowBtn) emptyThrowBtn.addEventListener("click", throwNextSample);

      if (btnRescatter) btnRescatter.addEventListener("click", rescatterAll);

      if (btnClear) {
        btnClear.addEventListener("click", () => {
          desk.innerHTML = "";
          placedCards.length = 0;
          updateCounter();
        });
      }

      if (btnSound) {
        btnSound.addEventListener("click", () => {
          soundEnabled = !soundEnabled;
          if (soundIcon) soundIcon.textContent = soundEnabled ? "🔊" : "🔇";
        });
      }

      if (btnFullscreen) {
        btnFullscreen.addEventListener("click", () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
      }

      function openQr() {
        if (qrModal) {
          qrModal.classList.remove("hidden");
          qrModal.classList.add("flex");
        }
      }
      function closeQr() {
        if (qrModal) {
          qrModal.classList.add("hidden");
          qrModal.classList.remove("flex");
        }
      }

      if (btnQr) btnQr.addEventListener("click", openQr);
      if (emptyQrBtn) emptyQrBtn.addEventListener("click", openQr);
      if (qrCloseBtn) qrCloseBtn.addEventListener("click", closeQr);
      if (qrModal) {
        qrModal.addEventListener("click", (e) => {
          if (e.target === qrModal) closeQr();
        });
      }

      // Keyboard shortcuts
      window.addEventListener("keydown", (e) => {
        if (e.key === "f" || e.key === "F") {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
        if (e.key === " " && !e.target.matches("input, textarea")) {
          e.preventDefault();
          throwNextSample();
        }
        if (e.key === "Escape") {
          closeQr();
          closeZoomModal();
        }
      });

      // =========================================================================
      // WEBSOCKET REAL-TIME SYNC
      // =========================================================================
      let ws = null;
      let reconnectTimer = null;

      function connectWS() {
        clearTimeout(reconnectTimer);
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = protocol + "//" + window.location.host + "/ws";

        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
          console.log("[Scrapbook] WebSocket connected.");
        };

        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "init") {
              const serverPhotos = Array.isArray(data.photos) ? data.photos : [];
              allPhotoSources = serverPhotos;

              if (serverPhotos.length > 0) {
                // Stagger throwing existing photos onto the board!
                serverPhotos.forEach((imgSrc, idx) => {
                  setTimeout(() => {
                    throwPhotoIntoScreen(imgSrc, "#" + (idx + 1));
                  }, idx * 280);
                });
              } else {
                // If board has no photos yet on server, throw the first 2 sample photos
                // so the user immediately gets a gorgeous scrapbook presentation!
                setTimeout(() => {
                  throwPhotoIntoScreen(SAMPLE_MEMORIES[0].url, SAMPLE_MEMORIES[0].caption);
                  setTimeout(() => {
                    throwPhotoIntoScreen(SAMPLE_MEMORIES[1].url, SAMPLE_MEMORIES[1].caption);
                  }, 400);
                }, 300);
              }
            } else if (data.type === "new_photo" && data.image) {
              // Real-time photo uploaded from camera!
              throwPhotoIntoScreen(data.image, "Live Photo #" + (data.total || placedCards.length + 1));
            }
          } catch (e) {
            console.error("[Scrapbook] Failed to parse message:", e);
          }
        };

        ws.onclose = function() {
          reconnectTimer = setTimeout(connectWS, 2000);
        };

        ws.onerror = function() {
          ws.close();
        };
      }

      // Start WebSocket
      connectWS();
      updateCounter();
    })();
  </script>
</body>
</html>`;
}
