/**
 * シード付きのノイズとハッシュ（純粋関数）。
 * 地形の高さや構造物の配置に使う。
 */

/**
 * 32bit の整数ハッシュ（シードと整数座標から、決定的な値を作る）。
 * @param {number} seed
 * @param {number} x
 * @param {number} [y]
 * @param {number} [z]
 * @returns {number} 0 以上 2^32 未満の整数
 */
export function hash3(seed, x, y = 0, z = 0) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * シード付きの擬似乱数生成器（mulberry32）を作る。
 * @param {number} seed
 * @returns {() => number} 0 以上 1 未満の値を返す関数
 */
export function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D シンプレックスノイズの勾配 */
const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * シード付きの 2D シンプレックスノイズ関数を作る。
 * @param {number} seed
 * @returns {(x: number, y: number) => number} およそ -1〜1 の値を返す関数
 */
export function createNoise2D(seed) {
  const perm = buildPermutation(seed);

  return (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    const corner = (gx, gy, x, y) => {
      const tt = 0.5 - x * x - y * y;
      if (tt < 0) return 0;
      const g = GRAD2[perm[gx + perm[gy]] & 7];
      return tt * tt * tt * tt * (g[0] * x + g[1] * y);
    };
    n += corner(ii, jj, x0, y0);
    n += corner(ii + i1, jj + j1, x1, y1);
    n += corner(ii + 1, jj + 1, x2, y2);
    return 70 * n;
  };
}

/** 3D シンプレックスノイズの勾配（立方体の辺の中点方向） */
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const F3 = 1 / 3;
const G3 = 1 / 6;

/**
 * シードから置換表（512 要素）を作る。
 * @param {number} seed
 * @returns {Uint8Array}
 */
function buildPermutation(seed) {
  const rand = createRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

/**
 * シード付きの 3D シンプレックスノイズ関数を作る（洞窟の生成に使う）。
 * @param {number} seed
 * @returns {(x: number, y: number, z: number) => number} およそ -1〜1 の値を返す関数
 */
export function createNoise3D(seed) {
  const perm = buildPermutation(seed);
  /**
   * 1つの頂点の寄与を求める。
   */
  const corner = (gi, x, y, z) => {
    const t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    const g = GRAD3[perm[gi] % 12];
    return t * t * t * t * (g[0] * x + g[1] * y + g[2] * z);
  };
  return (xin, yin, zin) => {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    // どの四面体に入っているかで、2番目・3番目の頂点のずれを決める
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const n0 = corner(ii + perm[jj + perm[kk]], x0, y0, z0);
    const n1 = corner(ii + i1 + perm[jj + j1 + perm[kk + k1]], x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3);
    const n2 = corner(ii + i2 + perm[jj + j2 + perm[kk + k2]], x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3);
    const n3 = corner(ii + 1 + perm[jj + 1 + perm[kk + 1]], x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3);
    return 32 * (n0 + n1 + n2 + n3);
  };
}

/**
 * 複数のオクターブを重ねたノイズ（fBm）を計算する。
 * @param {(x: number, y: number) => number} noise createNoise2D の戻り値
 * @param {number} x
 * @param {number} y
 * @param {{octaves?: number, frequency?: number, persistence?: number, lacunarity?: number}} opts
 * @returns {number} およそ -1〜1
 */
export function fbm2D(noise, x, y, { octaves = 4, frequency = 0.01, persistence = 0.5, lacunarity = 2 } = {}) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = frequency;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= persistence;
    f *= lacunarity;
  }
  return sum / norm;
}
