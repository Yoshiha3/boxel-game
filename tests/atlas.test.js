import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { atlasGrid, buildTileUVs } from '../src/render/atlasLayout.js';
import { buildRegistry } from '../src/core/registry.js';
import { loadDefaultDefs, ROOT } from './helpers.js';

test('atlasGrid fits all tiles', () => {
  for (const n of [1, 2, 5, 13, 16, 17]) {
    const { cols, rows } = atlasGrid(n);
    assert.ok(cols * rows >= n);
    assert.ok(cols * (rows - 1) < n, 'no empty row');
  }
});

test('buildTileUVs maps tile 0 to the top-left cell', () => {
  const uvs = buildTileUVs(4); // 2x2
  assert.deepEqual([...uvs.slice(0, 4)], [0, 0.5, 0.5, 1]);
  assert.deepEqual([...uvs.slice(12, 16)], [0.5, 0, 1, 0.5]);
});

test('every texture referenced by the default packs exists on disk', async () => {
  const reg = buildRegistry(await loadDefaultDefs());
  for (const p of reg.textures) {
    assert.ok(existsSync(path.join(ROOT, p)), `missing ${p}`);
  }
});
