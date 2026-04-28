// PLGames Connect — генератор иконок.
// Pure-Node, без зависимостей. PNG-encoder через zlib + CRC32. 4× super-sampling.
// Рисует "P"-монограмму бренда на indigo-градиентном скруглённом квадрате.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'src', 'assets');
const SIZES = [16, 32, 48, 128];
const SS = 4;

// ---- бренд-палитра ----
const BRAND = {
    active: {
        bgTop: [99, 102, 241], // indigo-500
        bgBot: [67, 56, 202], // indigo-700
        glyph: [255, 255, 255],
        glyphShadow: [49, 46, 129], // indigo-900 для микроскопической глубины
        accent: [16, 185, 129], // emerald-500 (бэйдж-точка online)
    },
    idle: {
        bgTop: [148, 163, 184], // slate-400
        bgBot: [71, 85, 105], // slate-600
        glyph: [255, 255, 255],
        glyphShadow: [30, 41, 59],
        accent: null,
    },
};

// ---- PNG encoder (zlib + CRC32) ----
function crc32(buf) {
    let crc = ~0 >>> 0;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const td = Buffer.concat([t, data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, c]);
}
function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ---- math helpers ----
function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function over(dst, src, alpha) {
    const a = alpha ?? src[3] / 255;
    return [dst[0] * (1 - a) + src[0] * a, dst[1] * (1 - a) + src[1] * a, dst[2] * (1 - a) + src[2] * a];
}

function insideRoundedSquare(x, y, S, r) {
    if (x < 0 || x > S || y < 0 || y > S) return false;
    if (x < r && y < r) return Math.hypot(r - x, r - y) <= r;
    if (x > S - r && y < r) return Math.hypot(x - (S - r), r - y) <= r;
    if (x < r && y > S - r) return Math.hypot(r - x, y - (S - r)) <= r;
    if (x > S - r && y > S - r) return Math.hypot(x - (S - r), y - (S - r)) <= r;
    return true;
}

/**
 * Геометрия "P":
 *  • вертикальный stem с скруглёнными концами
 *  • bowl как кольцо (annulus), оставляем только правую половину + верх (x ≥ stem_left)
 */
function insideP(x, y, S) {
    const T = S * 0.16; // толщина штриха
    const stem_x = S * 0.30;
    const stem_top = S * 0.20;
    const stem_bot = S * 0.82;
    const bowl_cx = stem_x + T / 2;
    const bowl_cy = S * 0.36;
    const outer_R = S * 0.24;
    const inner_R = outer_R - T;

    // stem: rect со скруглёнными концами
    const stemHalfW = T / 2;
    const stemCx = stem_x + stemHalfW;
    if (x >= stem_x && x <= stem_x + T) {
        // прямая часть
        if (y >= stem_top + stemHalfW && y <= stem_bot - stemHalfW) return true;
        // верхний полукруг
        if (y < stem_top + stemHalfW) {
            return Math.hypot(x - stemCx, y - (stem_top + stemHalfW)) <= stemHalfW;
        }
        // нижний полукруг
        if (y > stem_bot - stemHalfW) {
            return Math.hypot(x - stemCx, y - (stem_bot - stemHalfW)) <= stemHalfW;
        }
    }

    // bowl: правая половина annulus + верхний переход
    if (x >= stem_x) {
        const dx = x - bowl_cx;
        const dy = y - bowl_cy;
        const d = Math.hypot(dx, dy);
        if (d >= inner_R && d <= outer_R) return true;
    }
    return false;
}

function renderIcon(size, palette, withAccent) {
    const W = size * SS;
    const H = size * SS;
    const data = Buffer.alloc(W * H * 4);

    const radius = W * 0.22;

    // accent (точка-индикатор онлайна) в правом-нижнем углу
    const accentCx = W * 0.78;
    const accentCy = H * 0.78;
    const accentR = W * 0.16;
    const accentRingW = W * 0.06;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            if (!insideRoundedSquare(x, y, W, radius)) {
                data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
                continue;
            }
            // фон: вертикальный градиент
            const t = y / H;
            let [r, g, b] = mix(palette.bgTop, palette.bgBot, t);

            // P-глиф
            if (insideP(x, y, W)) {
                r = palette.glyph[0];
                g = palette.glyph[1];
                b = palette.glyph[2];
            }

            // accent (зелёный шарик в углу)
            if (withAccent && palette.accent) {
                const ad = Math.hypot(x - accentCx, y - accentCy);
                if (ad <= accentR) {
                    if (ad >= accentR - accentRingW) {
                        // белая обводка (отделяет от фона)
                        r = 255;
                        g = 255;
                        b = 255;
                    } else {
                        r = palette.accent[0];
                        g = palette.accent[1];
                        b = palette.accent[2];
                    }
                }
            }

            data[o] = r | 0;
            data[o + 1] = g | 0;
            data[o + 2] = b | 0;
            data[o + 3] = 255;
        }
    }

    // Downsample SS×SS среднее
    const out = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0,
                g = 0,
                b = 0,
                a = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const so = ((y * SS + sy) * W + (x * SS + sx)) * 4;
                    r += data[so];
                    g += data[so + 1];
                    b += data[so + 2];
                    a += data[so + 3];
                }
            }
            const n = SS * SS;
            const oo = (y * size + x) * 4;
            out[oo] = (r / n) | 0;
            out[oo + 1] = (g / n) | 0;
            out[oo + 2] = (b / n) | 0;
            out[oo + 3] = (a / n) | 0;
        }
    }

    return encodePNG(size, size, out);
}

function writeBrandSVG() {
    // Эталонный SVG логотипа PLGames Connect.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="PLGames Connect">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#bg)"/>
  <!-- P monogram -->
  <path d="M38.4 23 L38.4 105 M38.4 25.6 a30 30 0 0 1 30 30 a30 30 0 0 1 -30 30"
        stroke="#fff" stroke-width="20.5" stroke-linecap="round" fill="none"/>
  <!-- online accent dot -->
  <circle cx="100" cy="100" r="14" fill="#10b981" stroke="#fff" stroke-width="4"/>
</svg>`;
    fs.writeFileSync(path.join(OUT_DIR, 'logo.svg'), svg);
}

function clean() {
    if (!fs.existsSync(OUT_DIR)) return;
    for (const f of fs.readdirSync(OUT_DIR)) {
        if (/^icon[-.]/.test(f) || f === 'logo.svg') {
            fs.unlinkSync(path.join(OUT_DIR, f));
        }
    }
}

function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    clean();
    writeBrandSVG();

    for (const size of SIZES) {
        const activePng = renderIcon(size, BRAND.active, true);
        fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), activePng);

        const idlePng = renderIcon(size, BRAND.idle, false);
        fs.writeFileSync(path.join(OUT_DIR, `icon-idle-${size}.png`), idlePng);

        console.log(`icon-${size}.png ${activePng.length}b   icon-idle-${size}.png ${idlePng.length}b`);
    }
}

main();
