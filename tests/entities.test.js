import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EntityManager } from '../src/entities/entityManager.js';
import { moveDirection } from '../src/entities/components/walk.js';
import { buildRegistry } from '../src/core/registry.js';
import { emptyDefinitions } from '../src/core/packLoader.js';
import { loadDefaultDefs } from './helpers.js';

const baseDefs = await loadDefaultDefs();
const registry = buildRegistry(baseDefs);
const STONE = registry.blockId('stone');

/** y < 10 が石の平らな世界を作り、周囲のチャンクを読み込む */
function flatWorld() {
  const w = new World(registry, {
    generate(c) {
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 10; y++) c.set(x, y, z, STONE);
    },
  });
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.loadChunk(cx, cz);
  return w;
}

/**
 * プレイヤーを seconds 秒シミュレーションする。
 * @param {number} rate ティックレート
 * @param {number} seconds
 * @param {(t: number) => any} inputAt 時刻 → 入力
 * @param {number[]} start
 */
function simulate(rate, seconds, inputAt, start = [0.5, 10, 0.5]) {
  const em = new EntityManager(flatWorld(), registry);
  const p = em.spawn('player', start);
  const dt = 1 / rate;
  let maxY = p.pos[1];
  for (let i = 0; i < Math.round(seconds * rate); i++) {
    em.update(dt, inputAt(i * dt));
    maxY = Math.max(maxY, p.pos[1]);
  }
  return { p, maxY };
}

const idle = () => ({ control: { forward: 0, strafe: 0, jump: false, descend: false, sprint: false }, yaw: 0, pitch: 0 });

test('player falls and lands on the ground', () => {
  const { p } = simulate(20, 2, idle, [0.5, 30, 0.5]);
  assert.equal(p.pos[1], 10);
  assert.equal(p.onGround, true);
  assert.equal(p.vel[1], 0);
});

test('jump height is about 1.26 blocks and independent of tick rate', () => {
  const jumpOnce = (t) => ({ ...idle(), control: { ...idle().control, jump: t < 0.06 } });
  const heights = [20, 30, 60].map((rate) => simulate(rate, 1.5, jumpOnce).maxY - 10);
  for (const h of heights) {
    assert.ok(h > 1.1 && h < 1.3, `jump height ${h}`);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 0.08, `heights differ: ${heights}`);
});

test('walking distance is similar across tick rates', () => {
  const walk = () => ({ ...idle(), control: { ...idle().control, forward: 1 } });
  const dists = [20, 60].map((rate) => -simulate(rate, 2, walk).p.pos[2]);
  for (const d of dists) assert.ok(d > 7 && d < 8.7, `distance ${d}`);
  assert.ok(Math.abs(dists[0] - dists[1]) < 0.3, `distances differ: ${dists}`);
});

test('moveDirection points forward along -Z at yaw 0 and is normalized', () => {
  const [x, z] = moveDirection(0, 1, 0);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(z + 1) < 1e-9);
  const [dx, dz] = moveDirection(0.3, 1, 1);
  assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9);
});

test('entities do not move while their chunk is not loaded', () => {
  const em = new EntityManager(new World(registry, { generate() {} }), registry);
  const p = em.spawn('player', [0.5, 50, 0.5]);
  em.update(0.05, idle());
  assert.equal(p.pos[1], 50);
});

test('entity validation reports unknown components and bad parameters', () => {
  const defs = (components) => ({
    ...emptyDefinitions(),
    entities: { e: { id: 'e', size: [1, 1, 1], components } },
  });
  assert.throws(() => buildRegistry(defs({ fly2: {} })), /unknown component "fly2"/);
  assert.throws(() => buildRegistry(defs({ walk: { sped: 1 } })), /unknown parameter "sped"/);
  assert.throws(() => buildRegistry(defs({ walk: { speed: 'fast' } })), /walk.speed must be number/);
  assert.doesNotThrow(() => buildRegistry(defs({ walk: { speed: 2 }, gravity: {} })));
});
