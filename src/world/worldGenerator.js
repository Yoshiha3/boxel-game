/**
 * ワールドの生成器: 地形の生成と構造物の配置をまとめる。
 */
import { createTerrainGenerator } from './terrain.js';
import { createStructurePlacer } from './structurePlacer.js';

/**
 * @param {number} seed
 * @param {any} worldgen worldgen.json の内容
 * @param {import('../core/registry.js').Registry} registry
 */
export function createWorldGenerator(seed, worldgen, registry) {
  const terrain = createTerrainGenerator(seed, worldgen, registry);
  const structures = createStructurePlacer(seed, worldgen, registry, terrain);
  return {
    ...terrain,
    structures,
    /**
     * チャンクを生成する（地形 → 構造物）。
     * @param {import('./chunk.js').Chunk} chunk
     */
    generate(chunk) {
      terrain.generate(chunk);
      structures.place(chunk);
    },
  };
}
