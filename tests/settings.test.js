import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Settings, coerceSetting, validateSettings, orderedSettingItems, STORAGE_KEY } from '../src/ui/settings.js';
import { loadDefaultDefs } from './helpers.js';

const defs = await loadDefaultDefs();

/** メモリ上の保存先 */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

test('base settings are valid and ordered', () => {
  const errors = [];
  validateSettings(defs.settings, errors);
  assert.deepEqual(errors, []);
  assert.equal(orderedSettingItems(defs.settings)[0][0], 'renderDistance');
});

test('coerceSetting clamps, snaps to steps and validates options', () => {
  const range = { type: 'range', min: 2, max: 16, step: 1, default: 6 };
  assert.equal(coerceSetting(range, 100), 16);
  assert.equal(coerceSetting(range, '7.4'), 7);
  assert.equal(coerceSetting(range, 'abc'), 6);
  assert.equal(coerceSetting({ type: 'range', min: 0.1, max: 3, step: 0.1, default: 1 }, 0.30000000000000004), 0.3);
  const select = { type: 'select', options: [20, 30, 60], default: 20 };
  assert.equal(coerceSetting(select, '60'), 60);
  assert.equal(coerceSetting(select, 45), 20);
  assert.equal(coerceSetting({ type: 'toggle', default: false }, 'yes'), false);
});

test('Settings loads, saves and notifies', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ renderDistance: 10, unknown: 1, tickRate: 7 }) });
  const s = new Settings(defs.settings, storage);
  assert.equal(s.get('renderDistance'), 10);
  assert.equal(s.get('tickRate'), 20, 'invalid saved value falls back to default');
  const seen = [];
  s.subscribe((k, v) => seen.push([k, v]));
  assert.ok(seen.some(([k]) => k === 'fov'), 'subscribe replays current values');
  seen.length = 0;
  assert.equal(s.set('renderDistance', 99), 16);
  assert.deepEqual(seen, [['renderDistance', 16]]);
  assert.equal(JSON.parse(storage.data[STORAGE_KEY]).renderDistance, 16);
});

test('broken saved data is ignored', () => {
  const s = new Settings(defs.settings, memoryStorage({ [STORAGE_KEY]: '{not json' }));
  assert.equal(s.get('renderDistance'), 6);
});

test('validateSettings reports bad definitions', () => {
  const errors = [];
  validateSettings({ items: {
    a: { type: 'slider' },
    b: { type: 'range', min: 0, max: 1, step: 1, default: 5 },
    c: { type: 'select', options: [1, 2], default: 3 },
  } }, errors);
  assert.equal(errors.length, 3);
});
