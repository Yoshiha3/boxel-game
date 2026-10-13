/**
 * ワールドの生成器: 地形の生成・洞窟の削り・構造物の配置をまとめる。
 */
import { createTerrainGenerator } from './terrain.js';
import { createStructurePlacer } from './structurePlacer.js';
import { createCaveCarver } from './caves.js';

/**
 * @param {number} seed
 * @param {any} worldgen worldgen.json の内容
 * @param {import('../core/registry.js').Registry} registry
 */
export function createWorldGenerator(seed, worldgen, registry) {
  const terrain = createTerrainGenerator(seed, worldgen, registry);
  const caves = createCaveCarver(seed, worldgen, terrain, registry);
  // 構造物とスポーンの判定では、洞窟で削られた場所も考慮する
  const ground = { ...terrain, isCarved: caves.isCarved };
  const structures = createStructurePlacer(seed, worldgen, registry, ground);
  return {
    ...ground,
    structures,
    caves,
    /**
     * チャンクを生成する（地形 → 洞窟 → 構造物）。
     * @param {import('./chunk.js').Chunk} chunk
     */
    generate(chunk) {
      terrain.generate(chunk);
      caves.carve(chunk);
      structures.place(chunk);
    },
  };
}
