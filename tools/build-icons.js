// Генератор иконок расширения. Без внешних зависимостей.
// Рисует "щит с галочкой" программно с супер-сэмплингом 4x для антиалиасинга,
// упаковывает в PNG через ручной zlib+CRC32 кодер.
//
// Запуск:  node tools/build-icons.js
// Создаёт: src/assets/icon-{16,32,48,128}.png  (нейтральный зелёный)
//          src/assets/icon-gray-{16,32,48,128}.png  (для иконки disabled)
//          src/assets/icon.svg  (исходный SVG для документации/обработки в будущем)

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'src', 'assets');
const SIZES = [16, 32, 48, 128];
const SS = 4; // супер-сэмплинг

// ---- цвета ----
const PALETTE = {
    green: {
        bgTop: [52, 211, 153],
        bgBot: [5, 150, 105],
        shieldFill: [255, 255, 255],
        glyph: [5, 95, 70],
    },
    gray: {
        bgTop: [148, 163, 184],
        bgBot: [71, 85, 105],
        shieldFill: [255, 255, 255],
        glyph: [71, 85, 105],
    },
};

// ---- PNG encoder ----
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
    ihdr[9] = 6; // RGBA
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

// ---- математика ----
function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

/**
 * Точка внутри округлённого квадрата [0..S]².
 */
function insideRoundedSquare(x, y, S, r) {
    if (x < 0 || x > S || y < 0 || y > S) return false;
    if (x < r && y < r) return Math.hypot(r - x, r - y) <= r;
    if (x > S - r && y < r) return Math.hypot(x - (S - r), r - y) <= r;
    if (x < r && y > S - r) return Math.hypot(r - x, y - (S - r)) <= r;
    if (x > S - r && y > S - r) return Math.hypot(x - (S - r), y - (S - r)) <= r;
    return true;
}

/**
 * Силуэт щита внутри [0..S]².
 * Верх — горизонтальная линия, бока — вертикальные, низ — кривая (круговая дуга).
 */
function insideShield(x, y, S) {
    const cx = S / 2;
    const top = S * 0.22;
    const sideTop = S * 0.3; // на этой высоте бок переходит в дугу
    const halfW = S * 0.25;
    const left = cx - halfW;
    const right = cx + halfW;
    if (y < top || y > S * 0.84) return false;
    // Верхняя часть — простой прямоугольник
    if (y < sideTop) {
        return x >= left && x <= right;
    }
    // Низ — дуга. Центр дуги — на середине, радиус — большой.
    const arcCx = cx;
    const arcCy = sideTop - (right - left) * 0.05;
    const arcR = (right - left) * 1.05;
    if (Math.hypot(x - arcCx, y - arcCy) > arcR) return false;
    return x >= left && x <= right;
}

function renderIcon(size, palette) {
    const W = size * SS;
    const H = size * SS;
    const data = Buffer.alloc(W * H * 4);

    const radius = W * 0.22;
    // галочка
    const seg1 = { x1: W * 0.36, y1: H * 0.52, x2: W * 0.46, y2: H * 0.62 };
    const seg2 = { x1: W * 0.46, y1: H * 0.62, x2: W * 0.66, y2: H * 0.42 };
    const lineHalf = W * 0.04;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            if (!insideRoundedSquare(x, y, W, radius)) {
                // прозрачный фон
                data[o] = 0;
                data[o + 1] = 0;
                data[o + 2] = 0;
                data[o + 3] = 0;
                continue;
            }
            const t = y / H;
            let [r, g, b] = mix(palette.bgTop, palette.bgBot, t);

            if (insideShield(x, y, W)) {
                r = palette.shieldFill[0];
                g = palette.shieldFill[1];
                b = palette.shieldFill[2];
                // галочка
                const d1 = distToSegment(x, y, seg1.x1, seg1.y1, seg1.x2, seg1.y2);
                const d2 = distToSegment(x, y, seg2.x1, seg2.y1, seg2.x2, seg2.y2);
                if (d1 <= lineHalf || d2 <= lineHalf) {
                    r = palette.glyph[0];
                    g = palette.glyph[1];
                    b = palette.glyph[2];
                }
            }
            data[o] = r | 0;
            data[o + 1] = g | 0;
            data[o + 2] = b | 0;
            data[o + 3] = 255;
        }
    }

    // Downsample SS×SS -> 1×1 (среднее со сохранением альфы)
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

function writeSVG() {
    // Один эталонный SVG для документации/будущего использования.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#34d399"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#g)"/>
  <path d="M64 28 L96 36 L96 70 Q96 100 64 108 Q32 100 32 70 L32 36 Z" fill="#fff"/>
  <path d="M46 66 L58 78 L84 52" stroke="#065f46" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
    fs.writeFileSync(path.join(OUT_DIR, 'icon.svg'), svg);
}

function clean() {
    // выкинуть старые цветовые серии
    for (const f of fs.readdirSync(OUT_DIR)) {
        if (/^icon-(blue|gray|green)/.test(f)) {
            fs.unlinkSync(path.join(OUT_DIR, f));
        }
    }
}

function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    clean();
    writeSVG();

    for (const size of SIZES) {
        const greenPng = renderIcon(size, PALETTE.green);
        fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), greenPng);

        const grayPng = renderIcon(size, PALETTE.gray);
        fs.writeFileSync(path.join(OUT_DIR, `icon-gray-${size}.png`), grayPng);

        console.log(
            `icon-${size}.png ${greenPng.length}b   icon-gray-${size}.png ${grayPng.length}b`,
        );
    }
}

main();
