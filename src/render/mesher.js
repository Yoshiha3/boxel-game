/**
 * チャンクのメッシュ生成（three.js に依存しない純粋関数）。
 *
 * 面カリング: ブロックの6面それぞれについて、隣のブロックで隠れる面は出さない。
 * 描画の種類（不透明・切り抜き・液体）ごとに別の配列を作る。
 */
import { AIR, CHUNK_SIZE, FACE_COUNT, WORLD_HEIGHT } from '../core/constants.js';
import { RENDER } from '../core/registry.js';

/**
 * 各面の4頂点（外側から見て左下・右下・右上・左上の順。単位立方体内の座標）。
 * 三角形は (0,1,2) と (0,2,3) で、外側から見て反時計回りになる。
 */
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], // +X
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -X
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +Y
  [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]], // -Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -Z
];

/** 各面の隣接ブロックへのオフセット */
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** 面ごとの明るさ（簡易的な陰影。ライトを使わず頂点カラーで表現する） */
export const FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.9, 0.9];

/** 液体の上面の高さ（上に液体がないとき、ブロックより少し低くする） */
export const LIQUID_SURFACE_HEIGHT = 0.875;

/**
 * 描画レイヤー1つ分の頂点データを溜める入れ物。
 */
class MeshBuffer {
  constructor() {
    /** @type {number[]} */ this.positions = [];
    /** @type {number[]} */ this.normals = [];
    /** @type {number[]} */ this.uvs = [];
    /** @type {number[]} */ this.colors = [];
    /** @type {number[]} */ this.indices = [];
  }

  /** 面の数 */
  get faceCount() {
    return this.indices.length / 6;
  }

  /**
   * TypedArray に変換した結果を返す。
   * @returns {{positions: Float32Array, normals: Float32Array, uvs: Float32Array, colors: Float32Array, indices: Uint32Array, faceCount: number}}
   */
  toArrays() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
      faceCount: this.faceCount,
    };
  }
}

/**
 * ブロック b の面が、隣のブロック n によって隠れるかを判定する。
 * @param {import('../core/registry.js').Registry} registry
 * @param {number} b 面を出すブロック
 * @param {number} n 隣のブロック
 * @returns {boolean} 隠れる（面を出さない）なら true
 */
export function isFaceHidden(registry, b, n) {
  if (n === AIR) return false;
  if (registry.opaque[n]) return true;
  if (n === b && registry.cullSameType[b]) return true;
  if (registry.liquid[b] && registry.liquid[n]) return true;
  return false;
}

/**
 * チャンクのメッシュデータを作る。
 * @param {import('../world/chunk.js').Chunk} chunk
 * @param {import('../core/registry.js').Registry} registry
 * @param {Float32Array} tileUVs タイル番号 * 4 → [u0, v0, u1, v1]
 * @param {(x: number, y: number, z: number) => number} getNeighbor チャンク外（ローカル座標 -1 や 16）のブロックを返す関数
 * @returns {{opaque: ReturnType<MeshBuffer['toArrays']>, cutout: ReturnType<MeshBuffer['toArrays']>, liquid: ReturnType<MeshBuffer['toArrays']>}}
 */
export function buildChunkMeshData(chunk, registry, tileUVs, getNeighbor) {
  const buffers = {
    [RENDER.CUBE]: new MeshBuffer(),
    [RENDER.CUTOUT]: new MeshBuffer(),
    [RENDER.LIQUID]: new MeshBuffer(),
  };
  const blocks = chunk.blocks;
  const layer = CHUNK_SIZE * CHUNK_SIZE;

  // 一番上の空気でないブロックの高さまでだけ走査する
  let maxY = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i] !== AIR) {
      maxY = Math.floor(i / layer);
      break;
    }
  }

  /**
   * ローカル座標のブロックを返す（チャンク外は getNeighbor、y < 0 は不透明扱い）。
   */
  const blockAt = (x, y, z) => {
    if (y < 0) return -1;
    if (y >= WORLD_HEIGHT) return AIR;
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return getNeighbor(x, y, z);
    return blocks[x + z * CHUNK_SIZE + y * layer];
  };

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const b = blocks[x + z * CHUNK_SIZE + y * layer];
        if (b === AIR) continue;
        const render = registry.renderType[b];
        if (render === RENDER.NONE) continue;
        // 半透明でない液体（溶岩など）は不透明のマテリアルで描く（面の隠し方は液体のまま）
        const buf = render === RENDER.LIQUID && !registry.blocks[b].translucent ? buffers[RENDER.CUBE] : buffers[render];
        const isLiquid = render === RENDER.LIQUID;
        // 液体の上が液体でも固体でもなければ、水面として少し低くする
        let topHeight = 1;
        if (isLiquid) {
          const above = blockAt(x, y + 1, z);
          if (!registry.liquid[above] && !registry.solid[above]) topHeight = LIQUID_SURFACE_HEIGHT;
        }

        for (let face = 0; face < FACE_COUNT; face++) {
          const [dx, dy, dz] = FACE_DIRS[face];
          const n = blockAt(x + dx, y + dy, z + dz);
          if (n === -1 || isFaceHidden(registry, b, n)) continue;
          addFace(buf, registry, tileUVs, b, face, x, y, z, topHeight);
        }
      }
    }
  }

  return {
    opaque: buffers[RENDER.CUBE].toArrays(),
    cutout: buffers[RENDER.CUTOUT].toArrays(),
    liquid: buffers[RENDER.LIQUID].toArrays(),
  };
}

/**
 * 面を1枚追加する。
 * @param {MeshBuffer} buf
 * @param {import('../core/registry.js').Registry} registry
 * @param {Float32Array} tileUVs
 * @param {number} b ブロックID
 * @param {number} face 面の番号
 * @param {number} x ローカル座標
 * @param {number} y
 * @param {number} z
 * @param {number} topHeight 上端の高さ（通常 1、液体の水面は LIQUID_SURFACE_HEIGHT）
 */
function addFace(buf, registry, tileUVs, b, face, x, y, z, topHeight) {
  const base = buf.positions.length / 3;
  const corners = FACE_CORNERS[face];
  const [nx, ny, nz] = FACE_DIRS[face];
  const t = registry.faceTile[b * FACE_COUNT + face] * 4;
  const u0 = tileUVs[t], v0 = tileUVs[t + 1], u1 = tileUVs[t + 2], v1 = tileUVs[t + 3];
  const shade = FACE_SHADE[face];
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    buf.positions.push(x + c[0], y + (c[1] === 1 ? topHeight : 0), z + c[2]);
    buf.normals.push(nx, ny, nz);
    buf.colors.push(shade, shade, shade);
  }
  buf.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
  buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
