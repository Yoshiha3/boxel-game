import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EntityManager } from '../src/entities/entityManager.js';
import { buildRegistry } from '../src/core/registry.js';
import { loadDefaultDefs } from './helpers.js';

const registry = buildRegistry(await loadDefaultDefs());
const STONE = registry.blockId('stone');
const WATER = registry.blockId('water');
const SURFACE = 62; // 水が入っている一番上のブロック（見た目の水面は 62.875）
const LEDGE = 63; // x >= 8 の岸の一番上のブロック（上面は 64。水面より 1.125 高い）

/**
 * x < 8 は y = 40〜62 が水のプール、x >= 8 は y = 63 までの岸。
 */
function setup(start) {
  const w = new World(registry, {
    generate(c) {
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        const wx = c.cx * 16 + x;
        for (let y = 0; y < 40; y++) c.set(x, y, z, STONE);
        if (wx >= 8) for (let y = 40; y <= LEDGE; y++) c.set(x, y, z, STONE);
        else for (let y = 40; y <= SURFACE; y++) c.set(x, y, z, WATER);
      }
    },
  });
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.loadChunk(cx, cz);
  const em = new EntityManager(w, registry);
  return { em, p: em.spawn('player', start) };
}

/** @param {object} control */
const input = (control = {}, yaw = 0) => ({
  control: { forward: 0, strafe: 0, jump: false, descend: false, sprint: false, toggleFlight: false, ...control },
  yaw,
  pitch: 0,
});

/**
 * @param {number} rate
 * @param {number} seconds
 * @param {object} control
 * @param {number[]} start
 * @param {number} yaw
 */
function run(rate, seconds, control, start, yaw = 0) {
  const { em, p } = setup(start);
  let minVy = 0, maxY = -Infinity, minY = Infinity;
  for (let i = 0; i < Math.round(seconds * rate); i++) {
    em.update(1 / rate, input(control, yaw));
    minVy = Math.min(minVy, p.vel[1]);
    if (i > rate) {
      maxY = Math.max(maxY, p.pos[1]);
      minY = Math.min(minY, p.pos[1]);
    }
  }
  return { p, minVy, maxY, minY };
}

test('sinks slowly in water, independent of tick rate', () => {
  for (const rate of [20, 60]) {
    const { p, minVy } = run(rate, 1, {}, [2.5, 55, 0.5]);
    assert.equal(p.inLiquid, true);
    assert.ok(minVy >= -2 - 1e-9, `sink speed ${minVy}`);
    assert.ok(55 - p.pos[1] < 2.1 && 55 - p.pos[1] > 0.5, `sank ${55 - p.pos[1]} at ${rate}Hz`);
  }
});

test('falling into water is slowed down to the sink speed', () => {
  const { em, p } = setup([2.5, 75, 0.5]);
  for (let i = 0; i < 30; i++) em.update(0.05, input());
  assert.ok(p.inLiquid);
  assert.ok(p.vel[1] >= -2 - 1e-9);
});

test('holding jump under water swims up', () => {
  const { p } = run(20, 1, { jump: true }, [2.5, 50, 0.5]);
  assert.ok(p.pos[1] > 52, `rose to ${p.pos[1]}`);
});

test('holding jump at the surface makes small hops', () => {
  const { maxY, minY } = run(20, 6, { jump: true }, [2.5, 50, 0.5]);
  const surface = SURFACE + 0.875;
  assert.ok(maxY < surface + 0.25, `only a small hop above the water (feet max ${maxY})`);
  assert.ok(maxY + 1.62 > surface, 'the head comes above the water');
  assert.ok(maxY - minY > 0.05, 'bobs up and down');
});

test('jumping against the shore while in water climbs out', () => {
  // yaw = -π/2 で +X（岸の方向）を向く
  for (const rate of [20, 60]) {
    const { p } = run(rate, 6, { jump: true, forward: 1 }, [4.5, 58, 0.5], -Math.PI / 2);
    assert.ok(p.pos[0] > 8, `reached the shore at ${rate}Hz (x=${p.pos[0]})`);
    // Space を押し続けているので陸の上でジャンプを繰り返す。岸の上面より下に落ちていないことを確かめる
    assert.ok(p.pos[1] >= LEDGE + 1, 'on (or jumping above) the shore');
    assert.equal(p.inLiquid, false);
  }
});

test('moving in water is slower than on land', () => {
  const water = run(20, 2, { forward: 1 }, [2.5, 50, 6.5], 0);
  const land = run(20, 2, { forward: 1 }, [12.5, LEDGE + 1, 6.5], 0);
  const dWater = 6.5 - water.p.pos[2];
  const dLand = 6.5 - land.p.pos[2];
  assert.ok(dWater < dLand * 0.6, `water ${dWater} vs land ${dLand}`);
});

test('flying ignores water', () => {
  const { em, p } = setup([2.5, 55, 0.5]);
  p.flying = true;
  for (let i = 0; i < 20; i++) em.update(0.05, input());
  assert.equal(p.inLiquid, false);
  assert.ok(Math.abs(p.pos[1] - 55) < 1e-9);
});
