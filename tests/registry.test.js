import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry, faceTexturePaths, RENDER } from '../src/core/registry.js';
import { emptyDefinitions } from '../src/core/packLoader.js';
import { AIR, FACE, FACE_COUNT } from '../src/core/constants.js';
import { loadDefaultDefs } from './helpers.js';

/**
 * 最小の定義セットを作る。
 * @param {Object<string, any>} blocks
 */
function defsWith(blocks, extra = {}) {
  return { ...emptyDefinitions(), blocks, ...extra };
}

test('base pack passes validation', async () => {
  const reg = buildRegistry(await loadDefaultDefs());
  assert.equal(reg.blockId('air'), AIR);
  assert.ok(reg.blockId('grass') > 0);
});

test('block ids are assigned in a stable (sorted) order', () => {
  const reg = buildRegistry(defsWith({
    b: { id: 'b', textures: { all: 'b.png' } },
    a: { id: 'a', textures: { all: 'a.png' } },
  }));
  assert.equal(reg.blockId('a'), 1);
  assert.equal(reg.blockId('b'), 2);
  assert.throws(() => reg.blockId('zzz'));
});

test('lookup tables reflect render type defaults', () => {
  const reg = buildRegistry(defsWith({
    stone: { id: 'stone', textures: { all: 's.png' } },
    water: { id: 'water', render: 'liquid', textures: { all: 'w.png' } },
    glass: { id: 'glass', render: 'cutout', textures: { all: 'g.png' } },
  }));
  const s = reg.blockId('stone'), w = reg.blockId('water'), g = reg.blockId('glass');
  assert.deepEqual([reg.solid[s], reg.opaque[s], reg.liquid[s]], [1, 1, 0]);
  assert.deepEqual([reg.solid[w], reg.opaque[w], reg.liquid[w]], [0, 0, 1]);
  assert.deepEqual([reg.solid[g], reg.opaque[g], reg.liquid[g]], [1, 0, 0]);
  assert.equal(reg.renderType[AIR], RENDER.NONE);
  assert.equal(reg.renderType[w], RENDER.LIQUID);
  assert.equal(reg.renderType[g], RENDER.CUTOUT);
});

test('face textures fall back from all/side and share tiles', () => {
  const paths = faceTexturePaths({ all: 'a.png', top: 't.png' });
  assert.deepEqual(paths, ['a.png', 'a.png', 't.png', 'a.png', 'a.png', 'a.png']);
  const reg = buildRegistry(defsWith({
    x: { id: 'x', textures: { all: 'a.png', top: 't.png' } },
    y: { id: 'y', textures: { all: 'a.png' } },
  }));
  assert.equal(reg.textures.length, 2, 'unique textures only');
  const x = reg.blockId('x'), y = reg.blockId('y');
  assert.equal(reg.faceTile[x * FACE_COUNT + FACE.PX], reg.faceTile[y * FACE_COUNT + FACE.PY]);
  assert.notEqual(reg.faceTile[x * FACE_COUNT + FACE.PY], reg.faceTile[x * FACE_COUNT + FACE.PX]);
});

test('validation reports missing textures, bad render and unknown hotbar blocks', () => {
  assert.throws(() => buildRegistry(defsWith({ x: { id: 'x', textures: { top: 't.png' } } })), /missing texture/);
  assert.throws(() => buildRegistry(defsWith({ x: { id: 'x', render: 'blob', textures: { all: 'a.png' } } })), /unknown render/);
  assert.throws(() => buildRegistry(defsWith({}, { hotbar: { slots: ['nope'] } })), /hotbar: unknown block "nope"/);
  assert.throws(() => buildRegistry(defsWith({ air: { id: 'air', textures: { all: 'a.png' } } })), /reserved/);
  assert.throws(() => buildRegistry(defsWith({ w: { id: 'w', render: 'liquid', fog: { color: 1 }, textures: { all: 'a.png' } } })), /fog needs/);
});
