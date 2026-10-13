/**
 * 構造物の配置（チャンクをまたぐ構造物に対応。純粋なロジック）。
 *
 * 構造物の起点は「チャンク座標・シード・ルール番号」から決まる乱数で決める。
 * チャンク C を生成するときは、C と周囲のチャンク（構造物の広がりが届く範囲）の起点をすべて計算し、
 * C の範囲に入るブロックだけを書き込む。どの順番でチャンクを生成しても同じ結果になる。
 */
import { AIR, CHUNK_SIZE } from '../core/constants.js';
import { RENDER } from '../core/registry.js';
import { createNoise2D, createRandom, hash3 } from './noise.js';
import { STRUCTURE_TYPES, resolveStructure } from './structures/index.js';

/**
 * 構造物のブロックを置いてよいか。
 * 空気には置ける。切り抜き描画のブロック（葉など）は、不透明なブロック（幹など）で上書きできる。
 * force のブロック（根元の土など）は常に置く。
 * @param {import('../core/registry.js').Registry} registry
 * @param {number} current 今あるブロック
 * @param {number} id 置くブロック
 * @param {boolean} force
 * @returns {boolean}
 */
export function canPlaceStructureBlock(registry, current, id, force) {
  if (force || current === AIR) return true;
  return registry.renderType[current] === RENDER.CUTOUT && registry.opaque[id] === 1;
}

/**
 * 構造物の配置器を作る。
 * @param {number} seed
 * @param {any} worldgen worldgen.json の内容（structures を使う）
 * @param {import('../core/registry.js').Registry} registry
 * @param {{heightAt: (x: number, z: number) => number, surfaceBlockAt: (x: number, z: number) => number}} terrain
 */
export function createStructurePlacer(seed, worldgen, registry, terrain) {
  const blockId = (id) => registry.blockId(id);
  const rules = (worldgen.structures ?? []).map((rule, index) => {
    const def = resolveStructure(registry.defs.structures[rule.structure]);
    const gen = STRUCTURE_TYPES[def.type];
    return {
      index,
      def,
      gen,
      attempts: rule.attemptsPerChunk,
      chance: rule.chance,
      ground: new Set((rule.groundBlocks ?? []).map(blockId)),
      density: rule.density ?? null,
      densityNoise: rule.density ? createNoise2D(seed + 100 + index) : null,
      extent: gen.extent(def),
    };
  });
  /** 構造物の広がりが届くチャンク数 */
  const reach = Math.ceil(Math.max(0, ...rules.map((r) => r.extent)) / CHUNK_SIZE);

  /**
   * チャンク (cx, cz) を起点とする構造物の一覧を返す。
   * @param {number} cx
   * @param {number} cz
   * @returns {{structure: string, x: number, y: number, z: number, blocks: {dx: number, dy: number, dz: number, id: number, force?: boolean}[]}[]}
   */
  function placementsInChunk(cx, cz) {
    const out = [];
    for (const rule of rules) {
      const rand = createRandom(hash3(seed, cx, 7919 + rule.index, cz));
      for (let i = 0; i < rule.attempts; i++) {
        // 乱数の消費量を一定にするため、使うかどうかに関係なく3つ引く
        const x = cx * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE);
        const z = cz * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE);
        const roll = rand();
        let chance = rule.chance;
        if (rule.density) {
          const n = (rule.densityNoise(x * rule.density.frequency, z * rule.density.frequency) + 1) / 2;
          chance *= rule.density.min + (rule.density.max - rule.density.min) * n;
        }
        if (roll >= chance) continue;
        if (rule.ground.size && !rule.ground.has(terrain.surfaceBlockAt(x, z))) continue;
        const y = terrain.heightAt(x, z) + 1;
        const blocks = rule.gen.build(rule.def, createRandom(hash3(seed, x, y, z)), blockId);
        out.push({ structure: rule.def.id, x, y, z, blocks });
      }
    }
    return out;
  }

  /**
   * チャンクに、周囲から届く構造物を書き込む（地形の生成後に呼ぶ）。
   * @param {import('./chunk.js').Chunk} chunk
   */
  function place(chunk) {
    const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
    for (let ncx = chunk.cx - reach; ncx <= chunk.cx + reach; ncx++) {
      for (let ncz = chunk.cz - reach; ncz <= chunk.cz + reach; ncz++) {
        for (const p of placementsInChunk(ncx, ncz)) {
          for (const b of p.blocks) {
            const lx = p.x + b.dx - ox, lz = p.z + b.dz - oz;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
            const y = p.y + b.dy;
            if (canPlaceStructureBlock(registry, chunk.get(lx, y, lz), b.id, b.force === true)) chunk.set(lx, y, lz, b.id);
          }
        }
      }
    }
  }

  return { place, placementsInChunk, reach };
}
