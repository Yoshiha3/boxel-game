import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldGenerator } from '../src/world/worldGenerator.js';
import { canPlaceStructureBlock } from '../src/world/structurePlacer.js';
import { STRUCTURE_TYPES, resolveStructure } from '../src/world/structures/index.js';
import { createRandom } from '../src/world/noise.js';
import { World } from '../src/world/world.js';
import { Chunk } from '../src/world/chunk.js';
import { buildRegistry } from '../src/core/registry.js';
import { AIR, CHUNK_SIZE } from '../src/core/constants.js';
import { loadDefaultDefs } from './helpers.js';

const defs = await loadDefaultDefs();
const registry = buildRegistry(defs);
const LOG = registry.blockId('log');
const LEAVES = registry.blockId('leaves');
const GRASS = registry.blockId('grass');
const DIRT = registry.blockId('dirt');
const SEED = 4242;

test('tree generator builds a trunk within the height range and leaves above it', () => {
  const def = resolveStructure(defs.structures.oak_tree);
  for (let s = 0; s < 20; s++) {
    const blocks = STRUCTURE_TYPES.tree.build(def, createRandom(s), (id) => registry.blockId(id));
    const trunk = blocks.filter((b) => b.id === LOG);
    assert.ok(trunk.length >= def.height[0] && trunk.length <= def.height[1]);
    assert.ok(trunk.every((b) => b.dx === 0 && b.dz === 0));
    const leaves = blocks.filter((b) => b.id === LEAVES);
    assert.ok(leaves.length > 20);
    assert.ok(leaves.every((b) => Math.abs(b.dx) <= def.leafRadius && Math.abs(b.dz) <= def.leafRadius));
    assert.ok(blocks.some((b) => b.dy === -1 && b.id === DIRT && b.force), 'soil under the trunk');
  }
});

test('structure blocks: logs replace leaves but not the other way round', () => {
  assert.equal(canPlaceStructureBlock(registry, AIR, LEAVES, false), true);
  assert.equal(canPlaceStructureBlock(registry, LEAVES, LOG, false), true);
  assert.equal(canPlaceStructureBlock(registry, LOG, LEAVES, false), false);
  assert.equal(canPlaceStructureBlock(registry, GRASS, LOG, false), false);
  assert.equal(canPlaceStructureBlock(registry, GRASS, DIRT, true), true);
});

/**
 * 指定した順番でチャンクを読み込んだワールドを作る。
 * @param {[number, number][]} order
 */
function worldInOrder(order) {
  const w = new World(registry, createWorldGenerator(SEED, defs.worldgen, registry));
  for (const [cx, cz] of order) w.loadChunk(cx, cz);
  return w;
}

test('generation is the same regardless of chunk loading order', () => {
  const coords = [];
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) coords.push([cx, cz]);
  const a = worldInOrder(coords);
  const b = worldInOrder([...coords].reverse());
  for (const [cx, cz] of coords) assert.deepEqual(a.getChunk(cx, cz).blocks, b.getChunk(cx, cz).blocks);
});

test('trees are generated on grass and their blocks cross chunk borders', () => {
  const gen = createWorldGenerator(SEED, defs.worldgen, registry);
  let trees = 0, crossing = 0;
  for (let cx = -6; cx <= 6; cx++) {
    for (let cz = -6; cz <= 6; cz++) {
      for (const p of gen.structures.placementsInChunk(cx, cz)) {
        trees++;
        assert.equal(gen.surfaceBlockAt(p.x, p.z), GRASS, 'trees grow on grass');
        // 起点のチャンクの外に出るブロックが、隣のチャンクに実際に置かれているか
        for (const b of p.blocks) {
          const wx = p.x + b.dx, wz = p.z + b.dz;
          const ncx = Math.floor(wx / CHUNK_SIZE), ncz = Math.floor(wz / CHUNK_SIZE);
          if (ncx === cx && ncz === cz || b.id !== LEAVES) continue;
          const neighbor = new Chunk(ncx, ncz);
          gen.generate(neighbor);
          const got = neighbor.get(wx - ncx * CHUNK_SIZE, p.y + b.dy, wz - ncz * CHUNK_SIZE);
          // 葉は、別の木の幹や地形で既に埋まっていることがある
          assert.notEqual(got, AIR, `leaf missing at ${wx},${p.y + b.dy},${wz}`);
          crossing++;
          break;
        }
      }
    }
  }
  assert.ok(trees > 20, `found ${trees} trees`);
  assert.ok(crossing > 5, `found ${crossing} trees crossing a border`);
});

test('structure validation reports bad definitions and rules', () => {
  const base = structuredClone(defs);
  const withStructure = (def) => ({ ...base, structures: { ...base.structures, bad: { id: 'bad', ...def } } });
  assert.throws(() => buildRegistry(withStructure({ type: 'castle' })), /unknown type "castle"/);
  assert.throws(() => buildRegistry(withStructure({ type: 'tree', trunk: 'nope' })), /unknown block "nope"/);
  assert.throws(() => buildRegistry(withStructure({ type: 'tree', height: [5, 2] })), /"height" must be/);
  assert.throws(() => buildRegistry(withStructure({ type: 'tree', hight: [5, 2] })), /unknown parameter "hight"/);
  assert.throws(() => buildRegistry(withStructure({ type: 'template', blocks: [[0, 0, 0, 'nope']] })), /unknown block "nope"/);
  const rules = (r) => ({ ...base, worldgen: { ...base.worldgen, structures: [r] } });
  assert.throws(() => buildRegistry(rules({ structure: 'nope', attemptsPerChunk: 1, chance: 1 })), /unknown structure/);
  assert.throws(() => buildRegistry(rules({ structure: 'oak_tree', attemptsPerChunk: 1, chance: 2 })), /"chance" must be/);
});

test('template structures place their blocks as written', () => {
  const d = structuredClone(defs);
  d.structures.pillar = { id: 'pillar', type: 'template', blocks: [[0, 0, 0, 'stone'], [0, 1, 0, 'stone']] };
  d.worldgen.structures = [{ structure: 'pillar', attemptsPerChunk: 4, chance: 1, groundBlocks: ['grass'] }];
  const reg = buildRegistry(d);
  const gen = createWorldGenerator(SEED, d.worldgen, reg);
  const STONE = reg.blockId('stone');
  let checked = 0;
  for (let cx = -3; cx <= 3; cx++) {
    const chunk = new Chunk(cx, 0);
    gen.generate(chunk);
    for (const p of gen.structures.placementsInChunk(cx, 0)) {
      const lx = p.x - cx * CHUNK_SIZE, lz = p.z;
      assert.equal(chunk.get(lx, p.y, lz), STONE);
      assert.equal(chunk.get(lx, p.y + 1, lz), STONE);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
