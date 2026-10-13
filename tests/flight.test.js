import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoubleTapDetector } from '../src/player/doubleTap.js';
import { World } from '../src/world/world.js';
import { EntityManager } from '../src/entities/entityManager.js';
import { buildRegistry } from '../src/core/registry.js';
import { loadDefaultDefs } from './helpers.js';

const registry = buildRegistry(await loadDefaultDefs());
const STONE = registry.blockId('stone');

test('double tap is detected only within the window', () => {
  const d = new DoubleTapDetector(300);
  assert.equal(d.press(0), false);
  assert.equal(d.press(200), true);
  assert.equal(d.press(250), false, 'a third press starts a new sequence');
  assert.equal(d.press(1000), false, 'too slow');
  assert.equal(d.press(1400), false);
  assert.equal(d.press(1650), true);
});

/** y < 10 が石の世界でプレイヤーを作る */
function setup() {
  const w = new World(registry, {
    generate(c) {
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 10; y++) c.set(x, y, z, STONE);
    },
  });
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.loadChunk(cx, cz);
  const em = new EntityManager(w, registry);
  return { em, p: em.spawn('player', [0.5, 10, 0.5]) };
}

/** @param {Partial<import('../src/entities/entity.js').Control>} control */
const input = (control = {}) => ({
  control: { forward: 0, strafe: 0, jump: false, descend: false, sprint: false, toggleFlight: false, ...control },
  yaw: 0,
  pitch: 0,
});

test('toggling flight stops gravity and jump/descend move vertically', () => {
  const { em, p } = setup();
  em.update(0.05, input());
  em.update(0.05, input({ toggleFlight: true }));
  assert.equal(p.flying, true);
  for (let i = 0; i < 20; i++) em.update(0.05, input({ jump: true }));
  const high = p.pos[1];
  assert.ok(high > 15, `rose to ${high}`);
  for (let i = 0; i < 20; i++) em.update(0.05, input());
  assert.ok(Math.abs(p.pos[1] - high) < 0.6, 'hovers without gravity');
  em.update(0.05, input({ toggleFlight: true }));
  assert.equal(p.flying, false);
  for (let i = 0; i < 60; i++) em.update(0.05, input());
  assert.equal(p.pos[1], 10, 'falls back down after flight ends');
});

test('landing while descending ends flight', () => {
  const { em, p } = setup();
  em.update(0.05, input({ toggleFlight: true }));
  for (let i = 0; i < 10; i++) em.update(0.05, input({ jump: true }));
  for (let i = 0; i < 40; i++) em.update(0.05, input({ descend: true }));
  assert.equal(p.flying, false);
  assert.equal(p.pos[1], 10);
});

test('flying is faster than walking', () => {
  const { em, p } = setup();
  em.update(0.05, input({ toggleFlight: true }));
  for (let i = 0; i < 40; i++) em.update(0.05, input({ forward: 1 }));
  assert.ok(-p.pos[2] > 15, `flew ${-p.pos[2]}`);
});
