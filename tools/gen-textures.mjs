/**
 * base パックのブロックテクスチャ（16x16 の PNG）を手続き的に生成する。
 * 依存なし（PNG は node:zlib で圧縮して書き出す）。シード固定なので、何度実行しても同じ画像になる。
 *
 * 使い方: node tools/gen-textures.mjs
 * 出力先: data/packs/base/textures/blocks/*.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 16;
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/packs/base/textures/blocks');

/** CRC32 のテーブル */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * CRC32 を計算する。
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * PNG のチャンクを作る。
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * RGBA のピクセル配列を PNG にエンコードする。
 * @param {Uint8Array} rgba 長さ SIZE*SIZE*4
 * @returns {Buffer}
 */
function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * シード付きの擬似乱数（mulberry32）。
 * @param {number} seed
 * @returns {() => number} 0 以上 1 未満
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 文字列からシードを作る。
 * @param {string} s
 * @returns {number}
 */
function hashString(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * 色を明るさの係数で変える。
 * @param {number[]} rgb
 * @param {number} f
 * @returns {number[]}
 */
function shade(rgb, f) {
  return rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * f))));
}

/**
 * 16x16 の画像を作る。painter は各ピクセルの [r,g,b,a] を返す。
 * @param {string} name
 * @param {(x: number, y: number, r: () => number) => number[]} painter
 * @returns {Uint8Array}
 */
function paint(name, painter) {
  const r = rng(hashString(name));
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [cr, cg, cb, ca = 255] = painter(x, y, r);
      out.set([cr, cg, cb, ca], (y * SIZE + x) * 4);
    }
  }
  return out;
}

/**
 * 基本色にランダムな明暗を付けたノイズ画像の painter を返す。
 * @param {number[]} rgb
 * @param {number} amount 明暗の幅
 */
const noisy = (rgb, amount) => (x, y, r) => shade(rgb, 1 - amount / 2 + r() * amount);

const DIRT = [134, 96, 67];
const GRASS = [96, 160, 64];
const STONE = [125, 125, 125];
const WOOD = [168, 132, 80];
const BARK = [104, 82, 50];

/** テクスチャ名 → painter */
const TEXTURES = {
  dirt: noisy(DIRT, 0.35),
  grass_top: noisy(GRASS, 0.3),
  grass_side: (x, y, r) => {
    // 上の数行は草、その下は土。境目は列ごとに少し揺らす
    const edge = 3 + ((x * 7) % 3 === 0 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    return y < edge ? shade(GRASS, 0.85 + r() * 0.3) : shade(DIRT, 0.82 + r() * 0.35);
  },
  stone: noisy(STONE, 0.3),
  cobblestone: (x, y, r) => {
    // 石の塊の境目（目地）を暗くする
    const joint = (x % 8 === 0) || ((y + (x < 8 ? 0 : 4)) % 8 === 0);
    return joint ? shade(STONE, 0.55 + r() * 0.1) : shade(STONE, 0.85 + r() * 0.35);
  },
  sand: noisy([219, 207, 160], 0.15),
  bedrock: (x, y, r) => shade([80, 80, 80], r() < 0.5 ? 0.5 + r() * 0.3 : 1 + r() * 0.3),
  water: (x, y, r) => [...shade([48, 96, 200], 0.9 + r() * 0.15 + (((x + y * 2) % 8) === 0 ? 0.15 : 0)), 255],
  log_side: (x, y, r) => shade(BARK, (x % 4 === 0 ? 0.75 : 1) * (0.85 + r() * 0.25)),
  log_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return shade(BARK, 0.9 + r() * 0.2);
    return shade(WOOD, (Math.floor(d) % 2 === 0 ? 0.85 : 1.0) * (0.95 + r() * 0.1));
  },
  planks: (x, y, r) => {
    const seam = y % 4 === 3 || x === ((y >> 2) % 2 === 0 ? 4 : 11);
    return shade(WOOD, seam ? 0.65 : 0.9 + r() * 0.2);
  },
  leaves: (x, y, r) => (r() < 0.22 ? [0, 0, 0, 0] : [...shade([60, 130, 45], 0.75 + r() * 0.45), 255]),
  glass: (x, y) => {
    const border = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
    const glint = (x === y + 3 || x === y + 4) && x > 4 && x < 12;
    if (border) return [200, 225, 235, 255];
    if (glint) return [235, 245, 250, 200];
    return [0, 0, 0, 0];
  },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, painter] of Object.entries(TEXTURES)) {
  writeFileSync(path.join(OUT_DIR, `${name}.png`), encodePng(paint(name, painter)));
}
console.log(`generated ${Object.keys(TEXTURES).length} textures in ${path.relative(process.cwd(), OUT_DIR)}`);
