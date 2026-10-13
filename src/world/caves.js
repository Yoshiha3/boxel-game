/**
 * 洞窟の生成: 地形の生成後に、3D ノイズでブロックを削って空気にする（純粋なロジック）。
 *
 * - トンネル: 2つの 3D ノイズ n1, n2 がどちらも 0 に近い「線」の部分（n1² + n2² < radius²）を削る
 * - 大空洞: 低周波の 3D ノイズ n3 が threshold を超える部分を削る（maxY より上では次第に出なくなる）
 * - ノイズは sampleStep 間隔の格子点（ワールド座標にそろえる）だけで計算し、間は三線形補間する
 * - 削る前に液体だった場所、または6方向の隣が液体だった場所は削らない（海や川の下に穴を開けない）
 * - fill を指定すると、fill.maxY 以下で削った場所は空気ではなく fill.block（溶岩など）で埋める
 * 判定は地形の関数だけで行うので、チャンクを生成する順番に関係なく同じ結果になる。
 */
import { AIR, CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { createNoise3D } from './noise.js';

/** 6方向の隣 */
const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * 洞窟の設定を検証する。
 * @param {any} caves worldgen.caves
 * @param {(id: string) => boolean} hasBlock
 * @param {string[]} errors
 */
export function validateCaves(caves, hasBlock, errors) {
  if (caves === undefined) return;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!num(caves.minY)) errors.push('worldgen.caves.minY must be a number');
  const step = caves.sampleStep;
  if (!Number.isInteger(step) || step <= 0 || CHUNK_SIZE % step !== 0 || WORLD_HEIGHT % step !== 0) {
    errors.push(`worldgen.caves.sampleStep must be a positive integer that divides ${CHUNK_SIZE} and ${WORLD_HEIGHT}`);
  }
  for (const key of ['frequency', 'verticalScale', 'radius']) {
    if (!num(caves.tunnel?.[key])) errors.push(`worldgen.caves.tunnel.${key} must be a number`);
  }
  for (const key of ['frequency', 'threshold', 'maxY']) {
    if (!num(caves.cavern?.[key])) errors.push(`worldgen.caves.cavern.${key} must be a number`);
  }
  if (caves.fill !== undefined) {
    if (!hasBlock(caves.fill.block)) errors.push(`worldgen.caves.fill: unknown block "${caves.fill.block}"`);
    if (!num(caves.fill.maxY)) errors.push('worldgen.caves.fill.maxY must be a number');
  }
}

/**
 * 洞窟を削る処理を作る。worldgen.caves がなければ何もしない処理を返す。
 * @param {number} seed
 * @param {any} worldgen worldgen.json の内容
 * @param {{heightAt: (x: number, z: number) => number, seaLevel: number}} terrain
 * @param {import('../core/registry.js').Registry} registry
 * @returns {{isCarved: (x: number, y: number, z: number) => boolean, carve: (chunk: import('./chunk.js').Chunk) => void}}
 */
export function createCaveCarver(seed, worldgen, terrain, registry) {
  const cfg = worldgen.caves;
  if (!cfg) return { isCarved: () => false, carve() {} };
  const { minY, sampleStep: step, tunnel, cavern } = cfg;
  const n1 = createNoise3D(seed + 10);
  const n2 = createNoise3D(seed + 11);
  const n3 = createNoise3D(seed + 12);
  const r2 = tunnel.radius * tunnel.radius;
  const { seaLevel } = terrain;
  /** fill.maxY 以下で削った場所を埋めるブロック（なければ空気のみ） */
  const fillId = cfg.fill ? registry.blockId(cfg.fill.block) : AIR;
  const fillMaxY = cfg.fill ? cfg.fill.maxY : -1;

  /**
   * 格子点 (gx, gy, gz) での「削り具合」。負なら削る。
   * トンネルと大空洞の値の小さい方を使う。
   * @returns {number}
   */
  function fieldAtGrid(gx, gy, gz) {
    const x = gx * step, y = gy * step, z = gz * step;
    const tf = tunnel.frequency;
    const a = n1(x * tf, y * tf * tunnel.verticalScale, z * tf);
    const b = n2(x * tf, y * tf * tunnel.verticalScale, z * tf);
    const tunnelField = a * a + b * b - r2;
    const cf = cavern.frequency;
    // maxY より上では大空洞が次第に出なくなるよう、しきい値を上げる
    const above = Math.max(0, y - cavern.maxY) * 0.05;
    const cavernField = cavern.threshold + above - n3(x * cf, y * cf, z * cf);
    return Math.min(tunnelField, cavernField);
  }

  /**
   * 8つの格子点の値から三線形補間する。
   * @param {number[]} c 格子点の値 [c000, c100, c010, c110, c001, c101, c011, c111]
   * @param {number} fx 0〜1
   * @param {number} fy
   * @param {number} fz
   * @returns {number}
   */
  function trilinear(c, fx, fy, fz) {
    const x00 = c[0] + (c[1] - c[0]) * fx, x10 = c[2] + (c[3] - c[2]) * fx;
    const x01 = c[4] + (c[5] - c[4]) * fx, x11 = c[6] + (c[7] - c[6]) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }

  /**
   * ノイズだけで見て、(x, y, z) を削る形になっているか。
   * @param {(gx: number, gy: number, gz: number) => number} grid 格子点の値を返す関数
   * @returns {boolean}
   */
  function inCaveShape(grid, x, y, z) {
    const gx = Math.floor(x / step), gy = Math.floor(y / step), gz = Math.floor(z / step);
    const c = [
      grid(gx, gy, gz), grid(gx + 1, gy, gz), grid(gx, gy + 1, gz), grid(gx + 1, gy + 1, gz),
      grid(gx, gy, gz + 1), grid(gx + 1, gy, gz + 1), grid(gx, gy + 1, gz + 1), grid(gx + 1, gy + 1, gz + 1),
    ];
    return trilinear(c, (x - gx * step) / step, (y - gy * step) / step, (z - gz * step) / step) < 0;
  }

  /**
   * 削る前の地形で、(x, y, z) が液体か。
   * @param {(x: number, z: number) => number} height 地表の高さを返す関数
   * @returns {boolean}
   */
  function liquidBefore(height, x, y, z) {
    return y >= 1 && y <= seaLevel && y > height(x, z);
  }

  /**
   * 形以外の条件（高さの範囲、元が固体、液体に接していない）を満たすか。
   * @param {(x: number, z: number) => number} height
   * @returns {boolean}
   */
  function carvable(height, x, y, z) {
    if (y < minY || y > height(x, z)) return false;
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (liquidBefore(height, x + dx, y + dy, z + dz)) return false;
    }
    return true;
  }

  /**
   * ワールド座標のブロックが洞窟として削られるか（1点だけ調べる。木やスポーンの判定に使う）。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  function isCarved(x, y, z) {
    return carvable(terrain.heightAt, x, y, z) && inCaveShape(fieldAtGrid, x, y, z);
  }

  /**
   * チャンクのブロックを削る（地形の生成後、構造物の配置前に呼ぶ）。fill.maxY 以下は fill.block で埋める。
   * 格子点の値と、境界の外1列を含む地表の高さを、先にまとめて計算する。
   * @param {import('./chunk.js').Chunk} chunk
   */
  function carve(chunk) {
    const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
    const g0x = ox / step, g0z = oz / step;
    const nx = CHUNK_SIZE / step + 1, ny = WORLD_HEIGHT / step + 1;
    const cache = new Float64Array(nx * ny * nx);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nx; k++) cache[i + nx * (j + ny * k)] = fieldAtGrid(g0x + i, j, g0z + k);
      }
    }
    const grid = (gx, gy, gz) => cache[(gx - g0x) + nx * (gy + ny * (gz - g0z))];

    const side = CHUNK_SIZE + 2;
    const heights = new Int32Array(side * side);
    for (let i = 0; i < side; i++) {
      for (let k = 0; k < side; k++) heights[i + side * k] = terrain.heightAt(ox + i - 1, oz + k - 1);
    }
    const height = (x, z) => heights[(x - ox + 1) + side * (z - oz + 1)];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = ox + lx, z = oz + lz;
        for (let y = minY; y <= height(x, z); y++) {
          if (chunk.get(lx, y, lz) === AIR) continue;
          if (carvable(height, x, y, z) && inCaveShape(grid, x, y, z)) chunk.set(lx, y, lz, y <= fillMaxY ? fillId : AIR);
        }
      }
    }
  }

  return { isCarved, carve };
}
