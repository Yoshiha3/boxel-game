/**
 * 地形の生成。worldgen.json のパラメータに従って、チャンクにブロックを埋める。
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { createNoise2D, fbm2D } from './noise.js';

/** worldgen.layers のうち、ブロックIDを参照するキー */
export const LAYER_BLOCK_KEYS = ['top', 'filler', 'stone', 'bedrock', 'underwater', 'liquid'];

/**
 * 地形の生成器を作る。
 * @param {number} seed ワールドのシード
 * @param {any} worldgen worldgen.json の内容
 * @param {import('../core/registry.js').Registry} registry
 */
export function createTerrainGenerator(seed, worldgen, registry) {
  const heightNoise = createNoise2D(seed);
  const hillNoise = createNoise2D(seed + 1);
  const { height, hills, layers, seaLevel } = worldgen;
  const ids = Object.fromEntries(LAYER_BLOCK_KEYS.map((k) => [k, registry.blockId(layers[k])]));

  /**
   * ワールド座標 (x, z) の地表の高さ（一番上の固体ブロックの y）を返す。
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  function heightAt(x, z) {
    const h = fbm2D(heightNoise, x, z, height) * height.amplitude;
    // 丘: 低周波ノイズの正の部分だけを持ち上げる
    const hill = Math.max(0, hillNoise(x * hills.frequency, z * hills.frequency)) * hills.amplitude;
    return Math.max(1, Math.min(WORLD_HEIGHT - 2, Math.floor(height.base + h + hill)));
  }

  /**
   * チャンクを地形で埋める（既存の内容は上書きする）。
   * @param {import('./chunk.js').Chunk} chunk
   */
  function generate(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const top = heightAt(ox + x, oz + z);
        const underwater = top < seaLevel;
        for (let y = 0; y <= Math.max(top, seaLevel); y++) {
          let id;
          if (y === 0) id = ids.bedrock;
          else if (y > top) id = ids.liquid;
          else if (y === top) id = underwater ? ids.underwater : ids.top;
          else if (y > top - layers.fillerDepth) id = underwater ? ids.underwater : ids.filler;
          else id = ids.stone;
          chunk.set(x, y, z, id);
        }
      }
    }
  }

  return { heightAt, generate, seaLevel };
}
