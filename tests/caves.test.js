import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldGenerator } from '../src/world/worldGenerator.js';
import { createTerrainGenerator } from '../src/world/terrain.js';
import { createCaveCarver } from '../src/world/caves.js';
import { findSpawn } from '../src/world/spawn.js';
import { World } from '../src/world/world.js';
import { Chunk } from '../src/world/chunk.js';
import { buildRegistry } from '../src/core/registry.js';
import { AIR, CHUNK_SIZE } from '../src/core/constants.js';
import { loadDefaultDefs } from './helpers.js';

const defs = await loadDefaultDefs();
const registry = buildRegistry(defs);
const SEED = 2024;
const BEDROCK = registry.blockId('bedrock');
const WATER = registry.blockId('water');

/**
 * 地形だけのチャンクと、洞窟を削ったチャンクを作る。
 * @param {number} cx
 * @param {number} cz
 */
function terrainAndCarved(cx, cz) {
  const terrain = createTerrainGenerator(SEED, defs.worldgen, registry);
  const caves = createCaveCarver(SEED, defs.worldgen, terrain);
  const before = new Chunk(cx, cz), after = new Chunk(cx, cz);
  terrain.generate(before);
  terrain.generate(after);
  caves.carve(after);
  return { terrain, caves, before, after };
}

test('isCarved agrees with carve for every block', () => {
  for (const [cx, cz] of [[0, 0], [-3, 2], [5, -4]]) {
    const { caves, before, after } = terrainAndCarved(cx, cz);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) for (let y = 0; y < 128; y++) {
      const carved = before.get(x, y, z) !== AIR && after.get(x, y, z) === AIR;
      assert.equal(caves.isCarved(cx * CHUNK_SIZE + x, y, cz * CHUNK_SIZE + z) && before.get(x, y, z) !== AIR, carved,
        `mismatch at ${cx * CHUNK_SIZE + x},${y},${cz * CHUNK_SIZE + z}`);
    }
  }
});

test('caves exist, reach the surface somewhere, and never touch bedrock or minY', () => {
  const minY = defs.worldgen.caves.minY;
  let carved = 0, entrances = 0;
  for (let cx = -4; cx < 4; cx++) {
    for (let cz = -4; cz < 4; cz++) {
      const { terrain, before, after } = terrainAndCarved(cx, cz);
      for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < minY; y++) assert.equal(after.get(x, y, z), before.get(x, y, z), 'below minY is untouched');
        assert.equal(after.get(x, 0, z), BEDROCK);
        for (let y = minY; y < 128; y++) if (before.get(x, y, z) !== AIR && after.get(x, y, z) === AIR) carved++;
        const h = terrain.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
        if (after.get(x, h, z) === AIR) entrances++;
      }
    }
  }
  assert.ok(carved > 10000, `carved ${carved} blocks`);
  assert.ok(entrances > 0, 'at least one surface entrance');
});

test('carving never opens holes next to water', () => {
  const w = new World(registry, createWorldGenerator(SEED, defs.worldgen, registry));
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) w.loadChunk(cx, cz);
  const terrain = createTerrainGenerator(SEED, defs.worldgen, registry);
  let water = 0;
  for (let x = -60; x < 60; x++) {
    for (let z = -60; z < 60; z++) {
      for (let y = 1; y <= defs.worldgen.seaLevel; y++) {
        if (w.getBlock(x, y, z) !== WATER) continue;
        water++;
        // 水の隣（下と横）に、地形より下の空気（削られた穴）がないこと
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          const below = ny <= terrain.heightAt(nx, nz);
          assert.ok(!(below && w.getBlock(nx, ny, nz) === AIR), `hole next to water at ${nx},${ny},${nz}`);
        }
      }
    }
  }
  assert.ok(water > 1000, 'the sample area has water');
});

test('cave generation does not depend on chunk loading order', () => {
  const coords = [];
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) coords.push([cx, cz]);
  const load = (order) => {
    const w = new World(registry, createWorldGenerator(SEED, defs.worldgen, registry));
    for (const [cx, cz] of order) w.loadChunk(cx, cz);
    return w;
  };
  const a = load(coords), b = load([...coords].reverse());
  for (const [cx, cz] of coords) assert.deepEqual(a.getChunk(cx, cz).blocks, b.getChunk(cx, cz).blocks);
});

test('trees and the spawn point are never placed over carved ground', () => {
  const gen = createWorldGenerator(SEED, defs.worldgen, registry);
  let trees = 0;
  for (let cx = -8; cx <= 8; cx++) {
    for (let cz = -8; cz <= 8; cz++) {
      for (const p of gen.structures.placementsInChunk(cx, cz)) {
        assert.equal(gen.isCarved(p.x, p.y - 1, p.z), false);
        trees++;
      }
    }
  }
  assert.ok(trees > 0);
  const [x, y, z] = findSpawn(gen);
  assert.equal(gen.isCarved(Math.floor(x), y - 1, Math.floor(z)), false);
});

test('cave settings are validated', () => {
  const bad = structuredClone(defs);
  bad.worldgen.caves = { minY: 'low', sampleStep: 3, tunnel: { frequency: 0.1 }, cavern: {} };
  const msg = (() => { try { buildRegistry(bad); } catch (e) { return e.message; } return ''; })();
  for (const re of [/caves.minY/, /sampleStep/, /tunnel.radius/, /cavern.threshold/]) assert.match(msg, re);
  const none = structuredClone(defs);
  delete none.worldgen.caves;
  const terrain = createTerrainGenerator(SEED, none.worldgen, buildRegistry(none));
  assert.equal(createCaveCarver(SEED, none.worldgen, terrain).isCarved(0, 30, 0), false, 'no caves when omitted');
});
