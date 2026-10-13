/**
 * チャンク（16 x WORLD_HEIGHT x 16 のブロックの柱）。
 */
import { AIR, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../core/constants.js';

/**
 * チャンク内のローカル座標から配列の添字を求める。
 * @param {number} x 0..15
 * @param {number} y 0..WORLD_HEIGHT-1
 * @param {number} z 0..15
 * @returns {number}
 */
export function chunkIndex(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

/**
 * チャンク座標の文字列キーを作る（World の Map のキー）。
 * @param {number} cx
 * @param {number} cz
 * @returns {string}
 */
export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/**
 * ワールド座標をチャンク座標に変換する。
 * @param {number} v ワールド座標（ブロック単位の整数）
 * @returns {number}
 */
export function toChunkCoord(v) {
  return Math.floor(v / CHUNK_SIZE);
}

/**
 * ワールド座標をチャンク内のローカル座標に変換する。
 * @param {number} v
 * @returns {number} 0..15
 */
export function toLocalCoord(v) {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

/**
 * ブロックの柱1本分のデータ。
 */
export class Chunk {
  /**
   * @param {number} cx チャンク座標 X
   * @param {number} cz チャンク座標 Z
   */
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    /** ブロックの数値ID（添字は chunkIndex） */
    this.blocks = new Uint8Array(CHUNK_VOLUME);
  }

  /**
   * ローカル座標のブロックを返す。高さの範囲外は空気。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    return this.blocks[chunkIndex(x, y, z)];
  }

  /**
   * ローカル座標にブロックを置く。高さの範囲外は無視する。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} id
   */
  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[chunkIndex(x, y, z)] = id;
  }
}
