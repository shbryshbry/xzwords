'use strict';
/* 生成应用图标（纯 Node 实现 PNG 编码，无需依赖）
 * 设计：蓝色渐变圆角方块 + 白色小写 "xz"（斜切）+ 浅蓝句点
 * 产物：build/icon.png 与 assets/icon.png（256×256）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const R = 56;            /* 圆角半径 */

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function px(x, y) {
  /* 背景渐变：左上亮蓝 → 右下深蓝 */
  const t = clamp01((x + y) / (2 * SIZE));
  const bg = mix([0x3d, 0x7b, 0xff], [0x14, 0x3e, 0xc8], t);

  /* 圆角矩形裁剪（SDF） */
  const rx = x - SIZE / 2, ry = y - SIZE / 2;
  const qx = Math.abs(rx) - (SIZE / 2 - R);
  const qy = Math.abs(ry) - (SIZE / 2 - R);
  const dOut = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
  const boxA = clamp01(0.5 - dOut);

  /* 斜切函数：italic 风格，越靠上越往右偏 */
  const sl = function (p) { return [p[0] + (198 - p[1]) * 0.10, p[1]]; };

  /* 小写 x（左）与 z（右），基线 190，x 高 98~190 */
  const x1 = sl([56, 98]), x2 = sl([114, 190]);
  const x3 = sl([114, 98]), x4 = sl([56, 190]);
  const z1 = sl([140, 100]), z2 = sl([196, 100]);
  const z3 = sl([196, 100]), z4 = sl([140, 190]);
  const z5 = sl([140, 190]), z6 = sl([196, 190]);
  const strokes = [
    [x1, x2], [x3, x4],          /* x 的两笔 */
    [z1, z2], [z3, z4], [z5, z6] /* z 的三笔 */
  ];
  let m = Infinity;
  strokes.forEach(function (s) {
    m = Math.min(m, segDist(x, y, s[0][0], s[0][1], s[1][0], s[1][1]));
  });
  const strokeA = clamp01(10.5 - m);

  /* 句点：浅蓝色圆点（跟在 z 右下） */
  const dot = sl([214, 182]);
  const dotD = Math.hypot(x - dot[0], y - dot[1]);
  const dotA = clamp01(9.5 - dotD);

  /* 白色字母 + 浅蓝句点 */
  const inkA = clamp01(Math.max(strokeA, dotA));
  let col = mix(bg, [255, 255, 255], strokeA);
  col = mix(col, [0x9f, 0xd4, 0xff], dotA);

  /* 顶部柔光（玻璃质感） */
  const gloss = clamp01(1 - y / (SIZE * 0.42)) * 0.10 * boxA;
  col = mix(col, [255, 255, 255], gloss);

  return [col[0], col[1], col[2], Math.round(boxA * 255)];
}

function mix(a, b, t) {
  t = clamp01(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ---- PNG 编码 ---- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; /* 8bit RGBA */
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 4);
    for (let x = 0; x < SIZE; x++) {
      const c = px(x, y);
      row[1 + x * 4] = c[0]; row[2 + x * 4] = c[1]; row[3 + x * 4] = c[2]; row[4 + x * 4] = c[3];
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePng();
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), png);
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), png);
console.log('icon.png 生成完毕 (' + png.length + ' bytes)');
