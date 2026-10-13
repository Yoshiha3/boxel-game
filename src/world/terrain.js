/**
 * 地形の生成。worldgen.json のパラメータに従って、チャンクにブロックを埋める。
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { createNoise2D, fbm2D } from './noise.js';

/** worldgen.layers のうち、ブロックIDを参照するキー */
export const LAYER_BLOCK_KEYS = ['top', 'filler', 'stone', 'bedrock', 'underwater', 'liquid'];

/**
 * worldgen の中でブロックIDを参照している箇所を列挙する（検証用）。
 * @param {any} worldgen
 * @returns {[string, unknown][]} [場所, 参照しているID]
 */
export function worldgenBlockRefs(worldgen) {
  const refs = LAYER_BLOCK_KEYS.map((k) => [`layers.${k}`, worldgen.layers?.[k]]);
  if (worldgen.beach) refs.push(['beach.block', worldgen.beach.block]);
  return refs;
}

/**
 * 0〜1 をなめらかに 0〜1 へ写す（smoothstep）。
 * @param {number} t
 * @returns {number}
 */
function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * 地形の生成器を作る。
 * @param {number} seed ワールドのシード
 * @param {any} worldgen worldgen.json の内容
 * @param {import('../core/registry.js').Registry} registry
 */
export function createTerrainGenerator(seed, worldgen, registry) {
  const heightNoise = createNoise2D(seed);
  const hillNoise = createNoise2D(seed + 1);
  const riverNoise = createNoise2D(seed + 2);
  const { height, hills, layers, seaLevel, river, beach } = worldgen;
  const ids = Object.fromEntries(LAYER_BLOCK_KEYS.map((k) => [k, registry.blockId(layers[k])]));
  const beachId = beach ? registry.blockId(beach.block) : ids.underwater;
  const beachTop = beach ? seaLevel + beach.maxHeightAboveSea : seaLevel - 1;

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
    let top = height.base + h + hill;
    if (river) {
      // 川: ノイズの絶対値が小さい帯で、地表を川底（海面 - depth）へ向けてなめらかに下げる
      const r = Math.abs(riverNoise(x * river.frequency, z * river.frequency));
      if (r < river.bankWidth) {
        const bed = seaLevel - river.depth;
        if (top > bed) top = bed + (top - bed) * smoothstep(r / river.bankWidth);
      }
    }
    return Math.max(1, Math.min(WORLD_HEIGHT - 2, Math.floor(top)));
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
        // 海面付近の地表は砂浜にする
        const surface = underwater ? ids.underwater : top <= beachTop ? beachId : ids.top;
        const filler = underwater ? ids.underwater : top <= beachTop ? beachId : ids.filler;
        for (let y = 0; y <= Math.max(top, seaLevel); y++) {
          let id;
          if (y === 0) id = ids.bedrock;
          else if (y > top) id = ids.liquid;
          else if (y === top) id = surface;
          else if (y > top - layers.fillerDepth) id = filler;
          else id = ids.stone;
          chunk.set(x, y, z, id);
        }
      }
    }
  }

  return { heightAt, generate, seaLevel };
}
