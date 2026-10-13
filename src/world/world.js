/**
 * ワールド: 読み込み済みチャンクの管理、ブロックの取得・設定、描画距離に応じた読み込みと破棄。
 * three.js には依存しない（メッシュの作成は呼び出し側が行う）。
 */
import { AIR, CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { Chunk, chunkIndex, chunkKey, toChunkCoord, toLocalCoord } from './chunk.js';

/**
 * 中心チャンクから半径 radius（チャンク単位の円）に入るチャンク座標を、近い順に返す。
 * @param {number} cx 中心のチャンク座標
 * @param {number} cz
 * @param {number} radius
 * @returns {{cx: number, cz: number, d2: number}[]}
 */
export function chunksInRadius(cx, cz, radius) {
  const out = [];
  const r2 = radius * radius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) out.push({ cx: cx + dx, cz: cz + dz, d2 });
    }
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out;
}

/** 隣接4チャンクへのオフセット */
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * ワールド。
 */
export class World {
  /**
   * @param {import('../core/registry.js').Registry} registry
   * @param {{generate: (chunk: Chunk) => void}} generator チャンクの中身を作る生成器
   */
  constructor(registry, generator) {
    this.registry = registry;
    this.generator = generator;
    /** @type {Map<string, Chunk>} 読み込み済みのチャンク */
    this.chunks = new Map();
    /** @type {Set<string>} メッシュの作り直しが必要なチャンク */
    this.dirty = new Set();
    /** @type {Map<string, Map<number, number>>} プレイヤーによる編集差分（チャンクキー → 添字 → ID） */
    this.edits = new Map();
  }

  /**
   * チャンクを返す（未読み込みなら undefined）。
   * @param {number} cx
   * @param {number} cz
   * @returns {Chunk | undefined}
   */
  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /**
   * ワールド座標のブロックを返す。未読み込みのチャンクや高さの範囲外は空気。
   * @param {number} x 整数のワールド座標
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const chunk = this.chunks.get(chunkKey(toChunkCoord(x), toChunkCoord(z)));
    return chunk ? chunk.get(toLocalCoord(x), y, toLocalCoord(z)) : AIR;
  }

  /**
   * ワールド座標にブロックを置く。編集差分として記録し、メッシュの作り直しを予約する。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} id
   * @returns {boolean} 置けたら true（未読み込み・範囲外なら false）
   */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = toChunkCoord(x), cz = toChunkCoord(z);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = toLocalCoord(x), lz = toLocalCoord(z);
    chunk.set(lx, y, lz, id);
    if (!this.edits.has(key)) this.edits.set(key, new Map());
    this.edits.get(key).set(chunkIndex(lx, y, lz), id);

    this.dirty.add(key);
    // 境界のブロックなら、隣のチャンクの面も変わる
    if (lx === 0) this.dirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirty.add(chunkKey(cx, cz + 1));
    return true;
  }

  /**
   * チャンクを生成して読み込む（編集差分も当て直す）。
   * @param {number} cx
   * @param {number} cz
   * @returns {Chunk}
   */
  loadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = new Chunk(cx, cz);
    this.generator.generate(chunk);
    const edits = this.edits.get(key);
    if (edits) for (const [i, id] of edits) chunk.blocks[i] = id;
    this.chunks.set(key, chunk);
    this.dirty.add(key);
    // 隣のチャンクは、境界の面を作り直す必要がある
    for (const [dx, dz] of NEIGHBORS) {
      const nk = chunkKey(cx + dx, cz + dz);
      if (this.chunks.has(nk)) this.dirty.add(nk);
    }
    return chunk;
  }

  /**
   * 隣接4チャンクがすべて読み込み済みか。
   * @param {number} cx
   * @param {number} cz
   * @returns {boolean}
   */
  hasAllNeighbors(cx, cz) {
    return NEIGHBORS.every(([dx, dz]) => this.chunks.has(chunkKey(cx + dx, cz + dz)));
  }

  /**
   * 描画距離に合わせてチャンクを読み込み・破棄する。
   * 描画距離 + 1 の範囲まで生成し（メッシュ化で隣を参照するため）、描画距離 + 2 より外は破棄する。
   * @param {number} cx プレイヤーのいるチャンク座標
   * @param {number} cz
   * @param {number} renderDistance 描画距離（チャンク数）
   * @param {number} maxLoads 1回で生成するチャンク数の上限
   * @returns {{loaded: string[], unloaded: string[]}}
   */
  update(cx, cz, renderDistance, maxLoads) {
    const loaded = [];
    for (const c of chunksInRadius(cx, cz, renderDistance + 1)) {
      if (loaded.length >= maxLoads) break;
      if (this.chunks.has(chunkKey(c.cx, c.cz))) continue;
      this.loadChunk(c.cx, c.cz);
      loaded.push(chunkKey(c.cx, c.cz));
    }
    const unloaded = [];
    const limit2 = (renderDistance + 2) ** 2;
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - cx, dz = chunk.cz - cz;
      if (dx * dx + dz * dz > limit2) {
        this.chunks.delete(key);
        this.dirty.delete(key);
        unloaded.push(key);
      }
    }
    return { loaded, unloaded };
  }

  /**
   * メッシュを作り直すべきチャンクを、中心に近い順に最大 max 個取り出す。
   * 描画距離の外のチャンクや、隣が揃っていないチャンクは後回しにする（dirty に残す）。
   * @param {number} cx
   * @param {number} cz
   * @param {number} renderDistance
   * @param {number} max
   * @returns {Chunk[]}
   */
  takeChunksToMesh(cx, cz, renderDistance, max) {
    const r2 = renderDistance * renderDistance;
    const candidates = [];
    for (const key of this.dirty) {
      const chunk = this.chunks.get(key);
      if (!chunk) {
        this.dirty.delete(key);
        continue;
      }
      const d2 = (chunk.cx - cx) ** 2 + (chunk.cz - cz) ** 2;
      if (d2 > r2 || !this.hasAllNeighbors(chunk.cx, chunk.cz)) continue;
      candidates.push({ chunk, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    const out = candidates.slice(0, max).map((c) => c.chunk);
    for (const c of out) this.dirty.delete(chunkKey(c.cx, c.cz));
    return out;
  }

  /**
   * チャンクのメッシュ生成用に、チャンク外のブロックを返す関数を作る。
   * @param {Chunk} chunk
   * @returns {(x: number, y: number, z: number) => number} ローカル座標（範囲外も可）→ ブロックID
   */
  neighborLookup(chunk) {
    const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
    return (x, y, z) => this.getBlock(ox + x, y, oz + z);
  }
}
